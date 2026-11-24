/**
 * Reusable Tudor/Victorian architectural kit.
 *
 * Planned modules (one file each):
 *  - moldings.ts   cornices, string courses, bevelled trims (extruded profiles)
 *  - windows.ts    recessed frames, protruding sills, mullions, bay & oriel windows
 *  - timber.ts     half-timber framing, jettied upper storeys, brackets
 *  - roofs.ts      gabled / mansard roofs with instanced slates, chimneys, dormers
 *  - ironwork.ts   railings, finials, hanging-sign brackets
 *
 * Every builder returns a THREE.Group whose local origin sits at the
 * street-facing ground-floor centre, +Z pointing toward the street.
 */
import type * as THREE from 'three';
import type { SeededRandom } from '../core/random';

export interface ArchElementOptions {
  rng: SeededRandom;
  width: number;
  height: number;
  depth?: number;
}

export type ArchBuilder<O extends ArchElementOptions = ArchElementOptions> = (opts: O) => THREE.Group;
