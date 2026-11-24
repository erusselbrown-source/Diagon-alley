/**
 * Bespoke hero buildings. Each shop lives in its own module (e.g.
 * shops/wandShop.ts) and default-exports a ShopModule.
 *
 * Placement: build in local space, then snap with
 * `STREET.frontageTransform(side, s0, frontage)` (or `getStreetTransform`) from
 * architecture/street.ts, after checking `STREET.isFrontageFree(...)`.
 */
import type * as THREE from 'three';
import type { SeededRandom } from '../core/random';

export interface ShopContext {
  rng: SeededRandom;
}

export interface ShopModule {
  id: string;
  /** Street frontage width (metres) along the spline. */
  frontage: number;
  /** Builds the shop in local space: origin at front-centre ground, +Z = street. */
  build(ctx: ShopContext): THREE.Group;
  /** Optional per-frame animation (signs, window displays). */
  update?(dt: number, elapsed: number): void;
}

/** Registry; shops are appended here as they're implemented. */
export const shopRegistry: ShopModule[] = [];
