import * as THREE from 'three';

export type PixelFn = (u: number, v: number, x: number, y: number) => number;

/** Create an offscreen 2D canvas (OffscreenCanvas when available). */
export function makeCanvas(size: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(size, size);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/**
 * Rasterise a scalar height field (0..1) of `size`×`size`.
 * Returned as Float32Array so normal/roughness maps can be derived from it.
 */
export function sampleField(size: number, fn: PixelFn): Float32Array {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) out[y * size + x] = fn(x / size, y / size, x, y);
  }
  return out;
}

/** Write RGBA bytes into a canvas and wrap it as a repeat-wrapped texture. */
export function canvasToTexture(
  size: number,
  write: (data: Uint8ClampedArray) => void,
  colorSpace: THREE.ColorSpace = THREE.NoColorSpace,
): THREE.CanvasTexture {
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = ctx.createImageData(size, size);
  write(img.data);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Tangent-space normal map from a tileable height field (Sobel, wraps edges). */
export function heightToNormal(height: Float32Array, size: number, strength = 2): THREE.CanvasTexture {
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  return canvasToTexture(size, (d) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) -
                   (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
        const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) -
                   (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
        let nx = -dx * strength, ny = dy * strength, nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len; ny /= len; nz /= len;
        const i = (y * size + x) * 4;
        d[i] = (nx * 0.5 + 0.5) * 255;
        d[i + 1] = (ny * 0.5 + 0.5) * 255;
        d[i + 2] = (nz * 0.5 + 0.5) * 255;
        d[i + 3] = 255;
      }
    }
  });
}

/** Greyscale data texture from a scalar field (roughness / AO / metalness). */
export function fieldToGrey(field: Float32Array, size: number): THREE.CanvasTexture {
  return canvasToTexture(size, (d) => {
    for (let i = 0; i < field.length; i++) {
      const g = Math.max(0, Math.min(1, field[i])) * 255;
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g;
      d[i * 4 + 3] = 255;
    }
  });
}
