/**
 * Where a walker may stand in Ravenclaw Tower — the tower's implementation of
 * the project's core `WalkArea` interface (`core/controls.ts`), so collision
 * for every walkable space lives in one place (cf. `world/walkArea.ts`).
 *
 * Spaces: the dodecagonal common room, the entrance doorway / passage /
 * landing, and two dormitory wings (door → passage → 540° spiral stair →
 * top landing → dormitory one storey up). The spiral is multi-valued in plan,
 * so heights are resolved against the walker's current height (`refY`).
 * Furniture blocks with circles and rotated rectangles, each tagged with the
 * floor level it stands on.
 */
import * as THREE from 'three';
import type { WalkArea } from '../core/controls';
import {
  R, N_BAYS, bayAngle, PASSAGE, STAIRWELL, WINGS, WING_PASSAGE, TURRET, UPPER, STAIR_SWEEP, DORM, DORM_ARCH_X, type Wing,
} from './layout';

export interface Blocker { kind: 'circle' | 'rect'; x: number; z: number; r?: number; hw?: number; hd?: number; rot?: number; level: number }

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

export class TowerWalkArea implements WalkArea {
  /** Current height of the walker's feet — picks the right turn of the spiral. */
  refY = 0;
  /** 0..1 opening of the entrance door and of each wing's door (by bay). */
  entranceOpen = 0;
  readonly wingOpen = new Map<number, number>();
  readonly blockers: Blocker[] = [];

  addCircle(x: number, z: number, r: number, level = 0): void { this.blockers.push({ kind: 'circle', x, z, r, level }); }
  addRect(x: number, z: number, hw: number, hd: number, rot: number, level = 0): void { this.blockers.push({ kind: 'rect', x, z, hw, hd, rot, level }); }

  /** Floor height at (x, z) for a body of radius `margin`, or null if blocked. */
  sample(x: number, z: number, margin: number): number | null {
    const h = this.floor(x, z, margin);
    if (h === null) return null;
    for (const b of this.blockers) {
      if (Math.abs(b.level - h) > 1.5) continue;
      if (b.kind === 'circle') {
        const dx = x - b.x, dz = z - b.z, rr = b.r! + margin;
        if (dx * dx + dz * dz < rr * rr) return null;
      } else {
        const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rot!), s = Math.sin(b.rot!);
        if (Math.abs(dx * c - dz * s) < b.hw! + margin && Math.abs(dx * s + dz * c) < b.hd! + margin) return null;
      }
    }
    return h;
  }

  snap(p: THREE.Vector3): THREE.Vector3 { return p; }

  /** Which space contains (x, z): −1 outside, 0 common room / entrance, 2 or 10 for a dormitory wing. */
  roomAt(x: number, z: number): number {
    for (const w of WINGS) {
      _v.set(x, 0, z).applyMatrix4(w.inverse);
      if (_v.z > 0.25 && Math.abs(_v.x) < DORM.w / 2 + 1 && _v.z < DORM.z0 + DORM.d + 1) return w.bay;
    }
    return 0;
  }

  ceilingAt(): number | null { return null; }

  /** True if (x, z) lies inside any built structure (used to keep snow out). */
  inside(x: number, z: number, pad = 0.6): boolean {
    let inDrum = true;
    for (let i = 0; i < N_BAYS; i++) {
      const a = bayAngle(i);
      if (x * Math.sin(a) + z * Math.cos(a) > R + 1.0 + pad) { inDrum = false; break; }
    }
    if (inDrum) return true;
    if (Math.abs(x) < 2.4 + pad && z > R && z < STAIRWELL.z + STAIRWELL.r + 0.6 + pad) return true;
    for (const w of WINGS) {
      _v.set(x, 0, z).applyMatrix4(w.inverse);
      if (Math.abs(_v.x) < DORM.w / 2 + DORM.t + 0.8 + pad && _v.z > 0 && _v.z < DORM.z0 + DORM.d + DORM.t + 0.8 + pad) return true;
    }
    return false;
  }

  private floor(x: number, z: number, m: number): number | null {
    // common room
    let inRoom = true;
    for (let i = 0; i < N_BAYS; i++) {
      const a = bayAngle(i);
      if (x * Math.sin(a) + z * Math.cos(a) > R - 0.62 - m + 0.27) { inRoom = false; break; }
    }
    if (inRoom) return this.near(0);
    // entrance doorway and passage
    if (Math.abs(x) < 0.55 && z > R - 1.2 && z < PASSAGE.z0 + 0.1) return this.entranceOpen > 0.6 || z > R + 0.62 ? this.near(0) : null;
    if (Math.abs(x) < PASSAGE.w / 2 - m - 0.05 && z >= PASSAGE.z0 - 0.4 && z < STAIRWELL.z - 0.85) return this.near(0);
    for (const w of WINGS) {
      const h = this.wingFloor(w, x, z, m);
      if (h !== undefined) return h;
    }
    return null;
  }

  /** null = blocked inside the wing; undefined = not in this wing at all. */
  private wingFloor(w: Wing, x: number, z: number, m: number): number | null | undefined {
    _v.set(x, 0, z).applyMatrix4(w.inverse);
    const lx = _v.x, lz = _v.z;
    if (lz < -0.8 || lz > DORM.z0 + DORM.d + 0.5 || Math.abs(lx) > DORM.w / 2 + 0.5) return undefined;
    const open = (this.wingOpen.get(w.bay) ?? 0) > 0.6;
    // doorway through the drum wall
    if (Math.abs(lx) < 0.4 && lz > -0.8 && lz < WING_PASSAGE.z0 + 0.1) return open || lz > 0.75 ? this.near(0) : (lz < 0.1 ? undefined : null);
    // vaulted passage
    if (Math.abs(lx) < WING_PASSAGE.w / 2 - m && lz >= WING_PASSAGE.z0 && lz < TURRET.z - 0.6) return this.near(0);
    // spiral stair turret
    const dx = lx, dz = lz - TURRET.z, r = Math.hypot(dx, dz);
    if (r < TURRET.r - m + 0.04) {
      if (r < TURRET.newel + m) return null;
      // the dormitory's south wall cuts across the top of the turret, except at the arch
      if (lz > DORM.z0 - DORM.t - m && Math.abs(lx - DORM_ARCH_X) > 0.5 - m + 0.1 && this.refY > UPPER - 1) return null;
      return this.stair(Math.atan2(dx, dz));
    }
    // arch from the top landing into the dormitory
    if (Math.abs(lx - DORM_ARCH_X) < 0.5 - m + 0.1 && lz >= TURRET.z + 0.6 && lz < DORM.z0 + 0.4) return this.near(UPPER);
    // dormitory
    if (Math.abs(lx) < DORM.w / 2 - m && lz > DORM.z0 + m && lz < DORM.z0 + DORM.d - m) return this.near(UPPER);
    if (lz > WING_PASSAGE.z0 - 0.2) return null;
    return undefined;
  }

  /** Height on the spiral stair (or its landings) closest to the walker's current height. */
  private stair(phi: number): number | null {
    const p = ((phi % TAU) + TAU) % TAU; // 0..2π, 0 = +z (dorm side), π = −z (passage)
    const cands: number[] = [];
    if (p >= Math.PI / 2 && p <= Math.PI) cands.push(0); // bottom landing beside the passage
    if (p <= Math.PI / 2 || p >= TAU - 0.05) cands.push(UPPER); // top landing
    for (let k = -1; k <= 2; k++) {
      const u = p + TAU * k;
      if (u >= Math.PI && u <= Math.PI + STAIR_SWEEP) cands.push(((u - Math.PI) / STAIR_SWEEP) * UPPER);
    }
    let best: number | null = null, bd = 0.55;
    for (const h of cands) { const d = Math.abs(h - this.refY); if (d < bd) { bd = d; best = h; } }
    return best;
  }

  private near(h: number): number | null { return Math.abs(h - this.refY) < 0.55 ? h : null; }
}
