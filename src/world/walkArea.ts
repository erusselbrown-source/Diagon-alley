/**
 * The walkable space of the alley, for first-person collision and for the
 * wand's cheap ray-marching (anything not walkable below the roofline is a
 * wall).
 *
 * A point is standable if it lies in one of these corridors (with `margin`
 * clearance from every edge):
 *  - the main street between the building lines, minus stoops and pavement
 *    clutter footprints;
 *  - Knockturn's mouth up to its gate, and the two Y-branch lanes;
 *  - the Leaky Cauldron courtyard, and the brick passage when it is open;
 *  - Gringotts' stairs and portico (with columns and balustrades as
 *    obstacles);
 * and it isn't inside a lamp post or column.
 */
import * as THREE from 'three';
import { createFrame, type CurveSampler, type Side, type StreetLayout } from '../architecture/street';
import type { EntryArchway } from '../architecture/entryArchway';
import { STEP_TREAD } from '../architecture/stoops';
import type { WalkArea } from '../core/controls';
import type { ClutterFootprint } from '../props/streetClutter';

// Gringotts stair & portico (mirrors shops/gringotts.ts)
const G_STEPS = 8, G_RISE = 0.18, G_TREAD = 0.42;
const G_STYLO_FRONT = 2.6, G_STAIR_HALF = 4.9, G_PORTICO_HALF = 5.05, G_FACADE_Z = -0.7;
const G_STAIR_END = G_STYLO_FRONT + G_STEPS * G_TREAD;
const G_COLS = Array.from({ length: 6 }, (_, i) => new THREE.Vector2((i - 2.5) * 1.7, 1.85));

export interface WalkAreaOptions {
  layout: StreetLayout;
  archway: EntryArchway;
  gringotts: THREE.Matrix4;
  footprints: readonly ClutterFootprint[];
  posts: readonly THREE.Vector3[];
}

const fr = createFrame();

/** Arc-length of the point on `sampler` nearest to (x, z), searched over [s0, s1]. */
export function nearestS(sampler: CurveSampler, x: number, z: number, s0 = 0, s1 = sampler.length): number {
  let best = s0, bd = Infinity;
  for (let s = s0; s <= s1; s += 1) {
    sampler.frame(s, fr);
    const d = (fr.x - x) ** 2 + (fr.z - z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  const a = Math.max(s0, best - 1), b = Math.min(s1, best + 1);
  for (let s = a; s <= b; s += 0.05) {
    sampler.frame(s, fr);
    const d = (fr.x - x) ** 2 + (fr.z - z) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

export function createWalkArea(o: WalkAreaOptions): WalkArea {
  const L = o.layout;
  const courtInv = o.archway.frame.clone().invert();
  const courtY = new THREE.Vector3().setFromMatrixPosition(o.archway.frame).y;
  const gInv = o.gringotts.clone().invert();
  const gY = new THREE.Vector3().setFromMatrixPosition(o.gringotts).y;
  const D = o.archway.dims;
  const tmp = new THREE.Vector3();

  // Pavement intrusions per side: stoops (steps project from the door) and clutter.
  const intrusions = (side: Side): { s0: number; s1: number; depth: number }[] => [
    ...L.stoops.filter((st) => st.side === side).map((st) => ({ s0: st.s - st.width / 2 - 0.05, s1: st.s + st.width / 2 + 0.05, depth: st.steps * STEP_TREAD + 0.08 })),
    ...o.footprints.filter((f) => f.side === side),
  ];
  const intr = { left: intrusions('left'), right: intrusions('right') };
  const lanes = L.lanes.map((lane) => ({
    lane,
    sMax: lane.name === 'knockturn' ? L.knockturn.gateS - 0.45 : lane.sampler.length - 6,
  }));

  function mainStreet(x: number, z: number, m: number): number | null {
    const s = nearestS(L.sampler, x, z);
    L.frame(s, fr);
    const along = (x - fr.x) * fr.tx + (z - fr.z) * fr.tz;
    if ((s < 0.05 && along < 0) || (s > L.length - 0.05 && along > 0)) return null;
    if (s < 1.5) return null; // the courtyard wall & passage vault
    const d = (x - fr.x) * fr.nx + (z - fr.z) * fr.nz;
    const side: Side = d > 0 ? 'right' : 'left';
    let half = L.widthAtS(s) / 2 - m;
    for (const it of intr[side]) if (s > it.s0 - m && s < it.s1 + m) half = Math.min(half, L.widthAtS(s) / 2 - it.depth - m);
    if (Math.abs(d) > half) return null;
    return Math.abs(d) <= L.pavedHalfWidth(s) ? L.surfaceY(s, d) : L.groundY(s, side);
  }

  function laneAt(x: number, z: number, m: number): number | null {
    for (const { lane, sMax } of lanes) {
      const s = nearestS(lane.sampler, x, z, 0, lane.sampler.length);
      if (s < lane.s0 || s > sMax) continue;
      lane.sampler.frame(s, fr);
      const d = (x - fr.x) * fr.nx + (z - fr.z) * fr.nz;
      if (Math.abs(d) <= lane.halfWidth - m) return fr.y + 0.02;
    }
    return null;
  }

  function courtyard(x: number, z: number, m: number): number | null {
    tmp.set(x, courtY, z).applyMatrix4(courtInv);
    const lx = tmp.x, lz = tmp.z;
    if (lz >= 0.3 + m && lz <= D.depth - 0.45 - m && Math.abs(lx) <= D.wallHalf - 0.25 - m) return courtY + D.floorY;
    // the passage through the wall (street side of the wall is always reachable)
    const zMax = o.archway.open && !o.archway.animating ? 0.6 : -0.3 - m;
    if (lz >= -1.6 && lz <= zMax && Math.abs(lx) <= D.openHalf - 0.2 - m) return courtY + D.floorY * THREE.MathUtils.clamp(lz / 0.3 + 1, 0, 1);
    return null;
  }

  /** Gringotts: returns height if on stairs/portico, 'block' if inside its fabric, null if not involved. */
  function gringotts(x: number, z: number, m: number): number | 'block' | null {
    tmp.set(x, gY, z).applyMatrix4(gInv);
    const lx = tmp.x, lz = tmp.z, ax = Math.abs(lx);
    if (lz > G_STAIR_END + m || lz < G_FACADE_Z - 3) return null;
    for (const c of G_COLS) if ((lx - c.x) ** 2 + (lz - c.y) ** 2 < (0.6 + m) ** 2) return 'block';
    if (lz >= G_STYLO_FRONT - 0.5 && ax >= G_STAIR_HALF - m && ax <= G_STAIR_HALF + 0.5 + m) return 'block'; // balustrades
    if (lz >= G_STYLO_FRONT && lz <= G_STAIR_END && ax <= G_STAIR_HALF - m) {
      const n = THREE.MathUtils.clamp(Math.ceil((G_STAIR_END - lz) / G_TREAD), 0, G_STEPS);
      return gY + n * G_RISE;
    }
    if (lz >= G_FACADE_Z + 0.4 + m && lz < G_STYLO_FRONT && ax <= G_PORTICO_HALF - 0.1 - m) return gY + G_STEPS * G_RISE;
    if (lz < G_STYLO_FRONT && ax < G_PORTICO_HALF + 0.3 + m) return 'block';
    return null;
  }

  const sample = (x: number, z: number, m: number, solidOnly = false): number | null => {
    if (!solidOnly) for (const p of o.posts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < (0.22 + m) ** 2) return null;
    const g = gringotts(x, z, m);
    if (g === 'block') return null;
    if (g !== null) return g;
    return courtyard(x, z, m) ?? mainStreet(x, z, m) ?? laneAt(x, z, m);
  };

  return {
    sample,
    snap(p) {
      if (sample(p.x, p.z, 0.3) !== null) return p.clone();
      const s = THREE.MathUtils.clamp(nearestS(L.sampler, p.x, p.z), 2, L.length - 7);
      L.frame(s, fr);
      const d = THREE.MathUtils.clamp((p.x - fr.x) * fr.nx + (p.z - fr.z) * fr.nz, -1.2, 1.2);
      const q = new THREE.Vector3(fr.x + fr.nx * d, 0, fr.z + fr.nz * d);
      q.y = sample(q.x, q.z, 0) ?? fr.y;
      return q;
    },
  };
}
