/**
 * Single source of truth for the tower room's plan.
 *
 * A twelve-sided (dodecagonal) drum, apothem R, under a painted dome.
 * Bay i faces the centre from angle θ = i·30° (θ = 0 → +Z). In each bay's
 * local frame: x across the bay (viewer's right when facing the wall), y up,
 * z outward (z = 0 inner wall face, z = WALL_T outer face).
 *
 *   bay 0  entrance door (passage and spiral stair beyond, +Z)
 *   bay 6  statue niche, opposite the door (−Z)
 *   bay 3  fireplace (+X), bays 2, 9, 10 tall bookcases, the rest windows
 */
import * as THREE from 'three';

export const N_BAYS = 12;
export const R = 8;
export const WALL_T = 1.0;
export const WALL_H = 6.2;
export const CORNICE_TOP = 7.0;
export const DOME = { y0: CORNICE_TOP, rx: 7.5, ry: 6.2, aMax: THREE.MathUtils.degToRad(82) } as const;
export const COS15 = Math.cos(Math.PI / 12);
export const RV = R / COS15; // vertex radius
export const BAY_W = 2 * R * Math.tan(Math.PI / 12);

export type BayKind = 'door' | 'window' | 'bookcase' | 'fireplace' | 'statue';
export const BAYS: BayKind[] = [
  'door', 'window', 'bookcase', 'fireplace', 'window', 'window',
  'statue', 'window', 'window', 'bookcase', 'bookcase', 'window',
];

/** Window opening (pointed arch). */
export const WIN = { w: 1.9, y0: 0.55, ys: 4.0, sharp: 0.8 } as const;
export const DOOR = { w: 1.6, ys: 2.7, sharp: 0.8 } as const;
export const NICHE = { w: 2.0, ys: 3.6, sharp: 0.75 } as const;

/** Moon direction (from the room toward the moon) — light pours in through bays 7 and 8. */
export const MOON_DIR = new THREE.Vector3(-0.68, 0.5, -0.54).normalize();

export const bayAngle = (i: number) => (i * Math.PI * 2) / N_BAYS;

/** World matrix of bay i's local frame. */
export function bayMatrix(i: number): THREE.Matrix4 {
  const a = bayAngle(i);
  return new THREE.Matrix4().makeRotationY(a).setPosition(Math.sin(a) * R, 0, Math.cos(a) * R);
}

/** World position of a point given in bay-local coordinates. */
export function bayToWorld(i: number, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyMatrix4(bayMatrix(i));
}

/** Passage beyond the door: from the outer wall face to the stairwell. */
export const PASSAGE = { w: 2.6, z0: R + WALL_T, z1: R + WALL_T + 3.4, h: 4.2 } as const;
export const STAIRWELL = { r: 1.5, z: PASSAGE.z1 + 1.3 } as const;

export const EYE = 1.62;
export const START = new THREE.Vector3(0, EYE, PASSAGE.z1 - 0.6);
