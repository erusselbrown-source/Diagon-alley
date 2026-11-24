import * as THREE from 'three';
import { TileableNoise } from './noise';
import { canvasToTexture, fieldToGrey, heightToNormal, sampleField } from './canvasTexture';

/**
 * Procedural PBR material factory. All maps (albedo, normal, roughness,
 * emissive) are generated on offscreen canvases from seeded noise — no
 * external texture URLs, ever. Results are cached by recipe key.
 */

export interface PbrRecipe {
  /** Unique, stable cache key — also used as the noise seed. */
  key: string;
  size?: number;
  /** Height field (0..1) at normalized u,v. Drives normal + default roughness. */
  height: (u: number, v: number, noise: TileableNoise) => number;
  /** Albedo in linear 0..1 RGB, given u,v and the sampled height. */
  albedo: (u: number, v: number, h: number, noise: TileableNoise) => [number, number, number];
  /** Roughness 0..1; defaults to a height-modulated constant. */
  roughness?: (u: number, v: number, h: number, noise: TileableNoise) => number;
  /** Optional emissive RGB 0..1 (e.g. glowing runes, lit window panes). */
  emissive?: (u: number, v: number, h: number, noise: TileableNoise) => [number, number, number];
  normalStrength?: number;
  metalness?: number;
  repeat?: [number, number];
}

export interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  emissiveMap?: THREE.Texture;
}

const mapCache = new Map<string, PbrMaps>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();

export function generatePbrMaps(recipe: PbrRecipe): PbrMaps {
  const cached = mapCache.get(recipe.key);
  if (cached) return cached;

  const size = recipe.size ?? 512;
  const noise = new TileableNoise(recipe.key);
  const height = sampleField(size, (u, v) => recipe.height(u, v, noise));

  const map = canvasToTexture(size, (d) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, g, b] = recipe.albedo(x / size, y / size, height[i], noise);
      d[i * 4] = r * 255; d[i * 4 + 1] = g * 255; d[i * 4 + 2] = b * 255; d[i * 4 + 3] = 255;
    }
  }, THREE.SRGBColorSpace);

  const rough = sampleField(size, (u, v, x, y) =>
    recipe.roughness ? recipe.roughness(u, v, height[y * size + x], noise) : 0.65 + 0.3 * (1 - height[y * size + x]),
  );

  const maps: PbrMaps = {
    map,
    normalMap: heightToNormal(height, size, recipe.normalStrength ?? 2),
    roughnessMap: fieldToGrey(rough, size),
  };

  if (recipe.emissive) {
    const emit = recipe.emissive;
    maps.emissiveMap = canvasToTexture(size, (d) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const [r, g, b] = emit(x / size, y / size, height[i], noise);
        d[i * 4] = r * 255; d[i * 4 + 1] = g * 255; d[i * 4 + 2] = b * 255; d[i * 4 + 3] = 255;
      }
    }, THREE.SRGBColorSpace);
  }

  if (recipe.repeat) {
    for (const t of Object.values(maps)) (t as THREE.Texture | undefined)?.repeat.set(...recipe.repeat);
  }

  mapCache.set(recipe.key, maps);
  return maps;
}

export function createPbrMaterial(recipe: PbrRecipe): THREE.MeshStandardMaterial {
  const cached = materialCache.get(recipe.key);
  if (cached) return cached;
  const maps = generatePbrMaps(recipe);
  const mat = new THREE.MeshStandardMaterial({
    map: maps.map,
    normalMap: maps.normalMap,
    roughnessMap: maps.roughnessMap,
    roughness: 1,
    metalness: recipe.metalness ?? 0,
    emissiveMap: maps.emissiveMap ?? null,
    emissive: maps.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0),
  });
  mat.name = recipe.key;
  materialCache.set(recipe.key, mat);
  return mat;
}

export function disposeMaterialCache(): void {
  for (const m of mapCache.values()) for (const t of Object.values(m)) (t as THREE.Texture | undefined)?.dispose();
  for (const m of materialCache.values()) m.dispose();
  mapCache.clear();
  materialCache.clear();
}
