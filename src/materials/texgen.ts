/**
 * Core procedural PBR generator. Runs a recipe shader per texel, then derives
 * a tangent-space normal map (Sobel on the height field) and cavity AO.
 *
 * Output maps (all tileable, data written v-up — upload with flipY = false):
 *  - albedo        sRGB colour
 *  - normal        OpenGL-convention tangent-space normal (+Y = +v)
 *  - orm           R = ambient occlusion, G = roughness, B = metalness
 *                  (three.js reads G for roughnessMap, B for metalnessMap, R for aoMap)
 *  - transmission  R = transmission (only for transmissive recipes)
 *
 * Pure computation + OffscreenCanvas — runs in workers or on the main thread.
 */
import { SeededRandom, hashSeed } from '../core/random';
import { Noise } from './noise';
import type { TexelOut, TextureRecipe } from './recipes/types';

export interface RawMaps {
  size: number;
  albedo: Uint8ClampedArray<ArrayBuffer>;
  normal: Uint8ClampedArray<ArrayBuffer>;
  orm: Uint8ClampedArray<ArrayBuffer>;
  transmission?: Uint8ClampedArray<ArrayBuffer>;
  ms: number;
}

export type MapName = 'albedo' | 'normal' | 'orm' | 'transmission';

export function generateRawMaps(recipe: TextureRecipe, globalSeed: string): RawMaps {
  const t0 = performance.now();
  const size = recipe.size;
  const n = size * size;
  const seed = hashSeed(`${globalSeed}:${recipe.id}`);
  const shade = recipe.setup({
    rng: new SeededRandom(seed),
    seed,
    noise: (salt) => new Noise(hashSeed(`${seed}:${salt}`)),
    px: 1 / size,
  });

  const height = new Float32Array(n);
  const albedo = new Uint8ClampedArray(n * 4);
  const orm = new Uint8ClampedArray(n * 4);
  const transmission = recipe.material.transmission ? new Uint8ClampedArray(n * 4) : undefined;
  const o: TexelOut = { h: 0, r: 0, g: 0, b: 0, rough: 1, metal: 0, t: 0 };

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      o.h = 0.5; o.r = o.g = o.b = 0.5; o.rough = 1; o.metal = 0; o.t = 0;
      shade(x / size, v, o);
      const i = y * size + x, j = i * 4;
      height[i] = o.h;
      albedo[j] = o.r * 255 + 0.5;
      albedo[j + 1] = o.g * 255 + 0.5;
      albedo[j + 2] = o.b * 255 + 0.5;
      albedo[j + 3] = 255;
      orm[j + 1] = o.rough * 255 + 0.5;
      orm[j + 2] = o.metal * 255 + 0.5;
      orm[j + 3] = 255;
      if (transmission) {
        transmission[j] = transmission[j + 1] = transmission[j + 2] = o.t * 255 + 0.5;
        transmission[j + 3] = 255;
      }
    }
  }

  // Cavity AO: compare each texel to its blurred neighbourhood.
  const ao = recipe.ao ?? { radius: 0.006, strength: 2.5 };
  const r = Math.max(1, Math.round(ao.radius * size));
  const blurred = boxBlurWrap(boxBlurWrap(height, size, r), size, r);
  for (let i = 0; i < n; i++) {
    const cavity = blurred[i] - height[i];
    orm[i * 4] = (1 - clamp01(cavity * ao.strength)) * 255 + 0.5;
  }

  return {
    size,
    albedo,
    normal: heightToNormal(height, size, recipe.depth),
    orm,
    transmission,
    ms: performance.now() - t0,
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Sobel height → tangent-space normal, wrapping at edges.
 * `depth` = relief depth / tile size, so slopes are resolution independent.
 */
export function heightToNormal(h: Float32Array, size: number, depth: number): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(size * size * 4);
  const k = (depth * size) / 8; // Sobel ≈ 8 × per-texel slope; × size → per-UV slope
  const m = size - 1;
  for (let y = 0; y < size; y++) {
    const yu = ((y + 1) & m) * size, yc = y * size, yd = ((y - 1 + size) & m) * size;
    for (let x = 0; x < size; x++) {
      const xr = (x + 1) & m, xl = (x - 1 + size) & m;
      const gx = h[yd + xr] + 2 * h[yc + xr] + h[yu + xr] - h[yd + xl] - 2 * h[yc + xl] - h[yu + xl];
      const gy = h[yu + xl] + 2 * h[yu + x] + h[yu + xr] - h[yd + xl] - 2 * h[yd + x] - h[yd + xr];
      const nx = -gx * k, ny = -gy * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const j = (yc + x) * 4;
      out[j] = (nx * inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 1] = (ny * inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 2] = (inv * 0.5 + 0.5) * 255 + 0.5;
      out[j + 3] = 255;
    }
  }
  return out;
}

/** Separable box blur with toroidal wrap (sizes must be powers of two). */
function boxBlurWrap(src: Float32Array, size: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const dst = new Float32Array(src.length);
  const m = size - 1, inv = 1 / (2 * r + 1);
  for (let y = 0; y < size; y++) {
    const row = y * size;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + (k & m)];
    for (let x = 0; x < size; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + ((x + r + 1) & m)] - src[row + ((x - r) & m)];
    }
  }
  for (let x = 0; x < size; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += tmp[(k & m) * size + x];
    for (let y = 0; y < size; y++) {
      dst[y * size + x] = acc * inv;
      acc += tmp[((y + r + 1) & m) * size + x] - tmp[((y - r) & m) * size + x];
    }
  }
  return dst;
}

/** Draw raw RGBA into an offscreen Canvas2D. */
export function rawToCanvas(data: Uint8ClampedArray<ArrayBuffer>, size: number): OffscreenCanvas | HTMLCanvasElement {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  ctx.putImageData(new ImageData(data, size, size), 0, 0);
  return canvas;
}
