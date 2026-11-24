import type { SeededRandom } from '../../core/random';
import type { Noise } from '../noise';

/** Per-texel output written by a recipe shader. Colours are sRGB 0..1. */
export interface TexelOut {
  /** Height 0..1 (relative; scaled by recipe.depth for normals). */
  h: number;
  r: number;
  g: number;
  b: number;
  rough: number;
  metal: number;
  /** Transmission 0..1 (only read when material.transmission is true). */
  t: number;
}

/** Called once per texel. u,v ∈ [0,1) in UV space (v up). */
export type TexelShader = (u: number, v: number, out: TexelOut) => void;

export interface RecipeContext {
  rng: SeededRandom;
  /** Integer seed for this recipe (for hashInt / hash01). */
  seed: number;
  /** Independent noise stream per salt. */
  noise(salt: number): Noise;
  /** One texel in UV units — use as an antialiasing width. */
  px: number;
}

export interface MaterialParams {
  type: 'standard' | 'physical';
  /** Uses out.t to build a transmissionMap (MeshPhysicalMaterial only). */
  transmission?: boolean;
  ior?: number;
  thickness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  doubleSided?: boolean;
  aoIntensity?: number;
}

export interface TextureRecipe {
  id: string;
  label: string;
  /** Texture resolution (power of two, 512–1024). */
  size: number;
  /** Real-world metres covered by one texture tile (for world-space UVs). */
  worldSize: number;
  /** Relief depth relative to worldSize — drives normal-map strength. */
  depth: number;
  /** Cavity AO: blur radius (UV units) and strength. */
  ao?: { radius: number; strength: number };
  material: MaterialParams;
  setup(ctx: RecipeContext): TexelShader;
}
