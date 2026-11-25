/**
 * Bespoke hero buildings and procedural fillers. Each shop lives in its own
 * module (e.g. shops/ollivanders.ts) and exports a ShopModule.
 *
 * Contract (CLAUDE.md rule 4): `build()` returns a group in LOCAL space with
 * the origin at front-centre, pavement level, +Z facing the street, the
 * facade spanning x ∈ [−frontage/2, frontage/2]. Placement is done by
 * shops/plan.ts with `STREET.frontageTransform(side, s0, frontage)`.
 */
import type * as THREE from 'three';
import type { Animator, Kit, PlacedDoor } from '../architecture/kit';
import type { ShopInterior } from './interior';

export interface ShopContext {
  kit: Kit;
}

export interface ShopBuild {
  group: THREE.Group;
  doors: PlacedDoor[];
  animators?: Animator[];
  /** Walk-in interior (local frame, `userData.keep`), if the shop has one. */
  interior?: ShopInterior;
}

export interface ShopModule {
  id: string;
  name: string;
  /** Street frontage (m) — equals the facade's X extent. */
  frontage: number;
  depth?: number;
  build(ctx: ShopContext): ShopBuild;
}
