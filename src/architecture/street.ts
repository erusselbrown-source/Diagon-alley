/**
 * Master street layout — the single source of truth for where everything sits.
 *
 * The alley is a ~95 m S-curve (CatmullRom) running from the Leaky Cauldron
 * courtyard archway (t = 0) to a 14 m plaza (t = 1) where it forks in a Y
 * around Gringotts. Width eases 8.5 m → 7 m (mid-alley pinch) → 14 m (plaza).
 *
 * Conventions
 *  - `t` ∈ [0, 1] is arc-length normalised (uniform speed), `s = t · length` in metres.
 *  - `side` is relative to walking from the archway toward Gringotts.
 *  - Lateral offset `d` is metres from the centreline, +d = right side.
 *  - Shops are placed with `getStreetTransform(t, side, offset)`: origin on the
 *    building line at ground level, local +Z facing into the street, +X to the
 *    right as seen from the street (CLAUDE.md rule 4).
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';

export type Side = 'left' | 'right';

export const STREET_LENGTH = 95;
export const PAVEMENT_WIDTH = 1.0;
export const CURB_WIDTH = 0.28;
export const CURB_RISE = 0.15;
export const GUTTER_WIDTH = 0.38;
/** Curbs, gutters and pavements stop here; the plaza beyond is paved wall to wall. */
export const PLAZA_START_T = 0.85;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const sideSign = (side: Side) => (side === 'right' ? 1 : -1);

/** Building-line to building-line width at t. */
export function streetWidthAt(t: number): number {
  return 8.5 - 1.5 * smoothstep(0.05, 0.45, t) + 7 * smoothstep(0.72, 0.92, t);
}

// ---------------------------------------------------------------------------
// Arc-length frame sampling
// ---------------------------------------------------------------------------

export interface Frame {
  s: number;
  x: number; y: number; z: number;
  /** Horizontal unit tangent. */
  tx: number; tz: number;
  /** Horizontal unit normal pointing to the RIGHT side (T × up). */
  nx: number; nz: number;
  /** Longitudinal slope dy/ds. */
  grade: number;
}

export function createFrame(): Frame {
  return { s: 0, x: 0, y: 0, z: 0, tx: 0, tz: -1, nx: 1, nz: 0, grade: 0 };
}

/** Pre-sampled, arc-length-uniform frames along a curve; extrapolates past the ends. */
export class CurveSampler {
  readonly length: number;
  private readonly n: number;
  private readonly step: number;
  private readonly data: Float32Array; // x y z tx tz grade

  constructor(readonly curve: THREE.Curve<THREE.Vector3>, step = 0.1) {
    this.length = curve.getLength();
    this.n = Math.max(2, Math.ceil(this.length / step) + 1);
    this.step = this.length / (this.n - 1);
    this.data = new Float32Array(this.n * 6);
    const p = new THREE.Vector3(), tan = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const u = i / (this.n - 1);
      curve.getPointAt(u, p);
      curve.getTangentAt(u, tan);
      const h = Math.hypot(tan.x, tan.z) || 1;
      this.data.set([p.x, p.y, p.z, tan.x / h, tan.z / h, tan.y / h], i * 6);
    }
  }

  frame(s: number, out: Frame = createFrame()): Frame {
    const f = s / this.step;
    const i = Math.min(this.n - 2, Math.max(0, Math.floor(f)));
    const k = Math.min(1, Math.max(0, f - i));
    const a = i * 6, b = a + 6, D = this.data;
    out.x = D[a] + (D[b] - D[a]) * k;
    out.y = D[a + 1] + (D[b + 1] - D[a + 1]) * k;
    out.z = D[a + 2] + (D[b + 2] - D[a + 2]) * k;
    let tx = D[a + 3] + (D[b + 3] - D[a + 3]) * k, tz = D[a + 4] + (D[b + 4] - D[a + 4]) * k;
    const h = Math.hypot(tx, tz) || 1;
    tx /= h; tz /= h;
    out.grade = D[a + 5] + (D[b + 5] - D[a + 5]) * k;
    // Linear extrapolation beyond either end, along the end tangent.
    const over = s < 0 ? s : s > this.length ? s - this.length : 0;
    if (over !== 0) {
      out.x += tx * over;
      out.z += tz * over;
      out.y += out.grade * over;
    }
    out.s = s;
    out.tx = tx; out.tz = tz;
    out.nx = -tz; out.nz = tx; // T × up
    return out;
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export interface StreetTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  matrix: THREE.Matrix4;
  /** Unit direction of travel (toward Gringotts). */
  tangent: THREE.Vector3;
  /** Unit horizontal direction from the building line into the street (= local +Z). */
  inward: THREE.Vector3;
  /** Local +X (to the right as seen from the street). */
  right: THREE.Vector3;
  t: number;
  s: number;
  /** Street width (building line to building line) here. */
  width: number;
  /** Ground height at the building line (pavement top before the plaza). */
  groundY: number;
}

/** Shallow subsidence in the paving that collects rain. */
export interface Dip { s: number; d: number; r: number; depth: number }

export type ReservationKind = 'courtyard' | 'knockturn' | 'alcove' | 'gringotts';
export interface Reservation { kind: ReservationKind; side: Side; s0: number; s1: number }

export interface StoopSite { s: number; side: Side; width: number; steps: number; seed: number }
export interface AlcoveSite { s: number; side: Side; width: number; depth: number }

/** A secondary paved lane (Y-branches, Knockturn Alley). */
export interface LaneSpec {
  name: string;
  sampler: CurveSampler;
  /** Lane s-range to pave (may start negative to tuck under the main street). */
  s0: number;
  s1: number;
  halfWidth: number;
  crown: number;
  /** Return true for world (x, z) that belong to the main street and must not be repaved. */
  clip: (x: number, z: number) => boolean;
  tint: number;
}

export class StreetLayout {
  readonly sampler: CurveSampler;
  readonly length: number;
  readonly dips: Dip[] = [];
  readonly reservations: Reservation[] = [];
  readonly alcoves: AlcoveSite[] = [];
  /** Stoop sites — filled from shop doors by shops/plan.ts. */
  readonly stoops: StoopSite[] = [];
  readonly lanes: LaneSpec[] = [];
  readonly knockturn: { s: number; side: Side; lane: LaneSpec; gateS: number; mouthWidth: number };
  readonly plazaS: number;

  private readonly tmp = createFrame();

  constructor(seed = 'diagon-alley:street') {
    const rng = new SeededRandom(seed);

    // Graceful S-curve, rising gently then levelling into the plaza.
    const pts: [number, number, number][] = [
      [0, 0, 0], [1.5, 0.12, -12], [5, 0.4, -25], [6, 0.65, -38], [2, 0.8, -50],
      [-3.5, 0.75, -62], [-5, 0.6, -74], [-2.5, 0.5, -86], [0, 0.48, -95],
    ];
    const raw = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
    const k = STREET_LENGTH / raw.getLength();
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x * k, y, z * k)), false, 'centripetal');
    this.sampler = new CurveSampler(curve);
    this.length = this.sampler.length;
    this.plazaS = PLAZA_START_T * this.length;

    this.reservations.push({ kind: 'courtyard', side: 'left', s0: -10, s1: 0.5 }, { kind: 'courtyard', side: 'right', s0: -10, s1: 0.5 });

    // ---- Knockturn Alley: branches off the left side halfway down -----------
    const ks = this.length * 0.5;
    const mouthWidth = 2.6;
    this.reservations.push({ kind: 'knockturn', side: 'left', s0: ks - 1.95, s1: ks + 1.95 });
    const kf = this.sampler.frame(ks);
    const W = streetWidthAt(0.5);
    const a = THREE.MathUtils.degToRad(25);
    // Out of the left building line, angled forward, descending into gloom.
    const dir = new THREE.Vector3(-kf.nx * Math.cos(a) + kf.tx * Math.sin(a), 0, -kf.nz * Math.cos(a) + kf.tz * Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x); // right of the lane
    const start = new THREE.Vector3(kf.x - kf.nx * W / 2, kf.y + CURB_RISE, kf.z - kf.nz * W / 2);
    const at = (along: number, bend: number, dy: number) =>
      start.clone().addScaledVector(dir, along).addScaledVector(side, bend).add(new THREE.Vector3(0, dy, 0));
    const kCurve = new THREE.CatmullRomCurve3([at(-2, 0, 0), at(0, 0, 0), at(6, 0, -0.3), at(12, -0.6, -0.75), at(19, -1.8, -1.2)]);
    const kSampler = new CurveSampler(kCurve);
    const kStart = 2; // lane s where the building line is crossed
    const knockLane: LaneSpec = {
      name: 'knockturn', sampler: kSampler, s0: 0.6, s1: kSampler.length, halfWidth: mouthWidth / 2, crown: 0.03, tint: 0.62,
      clip: (x, z) => this.lateralOf(x, z, ks) > -W / 2 - 0.02, // left side ⇒ d < −W/2 belongs to the lane
    };
    this.lanes.push(knockLane);
    this.knockturn = { s: ks, side: 'left', lane: knockLane, gateS: kStart + 1.5, mouthWidth };

    // ---- Narrow side alcoves --------------------------------------------------
    for (const [s, side] of [[17, 'right'], [31, 'left'], [63, 'right'], [74, 'left']] as const) {
      const al: AlcoveSite = { s, side, width: 1.4, depth: 2.2 };
      this.alcoves.push(al);
      this.reservations.push({ kind: 'alcove', side, s0: s - al.width / 2 - 0.35, s1: s + al.width / 2 + 0.35 });
    }

    // ---- Y-junction branches around Gringotts ----------------------------------
    const ef = this.sampler.frame(this.length);
    const forkHalf = 4; // Gringotts frontage = 8 m between the branches
    const laneHalf = 1.5;
    for (const sgn of [-1, 1]) {
      const ang = THREE.MathUtils.degToRad(38);
      const bd = new THREE.Vector3(ef.tx * Math.cos(ang) + sgn * ef.nx * Math.sin(ang), 0, ef.tz * Math.cos(ang) + sgn * ef.nz * Math.sin(ang));
      const bn = new THREE.Vector3(-bd.z, 0, bd.x);
      const o = new THREE.Vector3(ef.x + sgn * ef.nx * (forkHalf + laneHalf), ef.y, ef.z + sgn * ef.nz * (forkHalf + laneHalf));
      const bp = (along: number, bend: number, dy: number) => o.clone().addScaledVector(bd, along).addScaledVector(bn, sgn * bend).add(new THREE.Vector3(0, dy, 0));
      const bCurve = new THREE.CatmullRomCurve3([bp(-3, 0, 0), bp(0, 0, 0), bp(7, 0.6, -0.1), bp(16, 2.4, -0.35)]);
      const bs = new CurveSampler(bCurve);
      this.lanes.push({
        name: sgn < 0 ? 'branch-left' : 'branch-right', sampler: bs, s0: 0, s1: bs.length, halfWidth: laneHalf, crown: 0.04, tint: 0.92,
        clip: (x, z) => (x - ef.x) * ef.tx + (z - ef.z) * ef.tz < 0.02, // behind the plaza end line = main street
      });
    }
    this.reservations.push({ kind: 'gringotts', side: 'left', s0: this.length - 0.5, s1: this.length + 30 }, { kind: 'gringotts', side: 'right', s0: this.length - 0.5, s1: this.length + 30 });

    // ---- Puddle dips (subsidence) ------------------------------------------------
    for (let i = 0; i < 26; i++) {
      const s = rng.range(4, this.length - 2);
      const hw = this.pavedHalfWidth(s);
      this.dips.push({ s, d: rng.range(-1, 1) * hw * 0.6, r: rng.range(0.55, 1.35), depth: rng.range(0.03, 0.05) });
    }
    for (let i = 0; i < 6; i++) {
      const s = rng.range(this.plazaS + 3, this.length - 1);
      this.dips.push({ s, d: rng.range(-1, 1) * this.widthAtS(s) * 0.35, r: rng.range(0.8, 1.6), depth: rng.range(0.03, 0.045) });
    }
    this.dips.sort((p, q) => p.s - q.s);

  }

  tAt(s: number): number { return s / this.length; }
  widthAtS(s: number): number { return streetWidthAt(s / this.length); }

  frame(s: number, out?: Frame): Frame { return this.sampler.frame(s, out); }

  /** Half-width between the road faces of the curbs. */
  carriageHalfWidth(s: number): number {
    return this.widthAtS(s) / 2 - PAVEMENT_WIDTH - CURB_WIDTH;
  }

  /** Half-width of the sett-paved area (inside the gutters; wall-to-wall in the plaza). */
  pavedHalfWidth(s: number): number {
    return s < this.plazaS ? this.carriageHalfWidth(s) - GUTTER_WIDTH : this.widthAtS(s) / 2;
  }

  /** Camber height of the crown at the centreline. */
  crown(s: number): number {
    return 0.09 * (1 - smoothstep(0.8, 0.95, s / this.length)) + 0.025;
  }

  /** Height of the paved surface at (s, d) including camber and subsidence dips. */
  surfaceY(s: number, d: number): number {
    const f = this.sampler.frame(s, this.tmp);
    const hw = this.pavedHalfWidth(s);
    const q = Math.min(1, (d / hw) ** 2);
    let y = f.y + this.crown(s) * (1 - q);
    for (const dip of this.dips) {
      if (dip.s < s - 2 || dip.s > s + 2) continue;
      const dist = Math.hypot(dip.s - s, dip.d - d);
      if (dist < dip.r) {
        const w = 1 - smoothstep(0, dip.r, dist);
        y -= dip.depth * w * w;
      }
    }
    return y;
  }

  /** Ground height along a building line (pavement top, or plaza paving). */
  groundY(s: number, side: Side): number {
    if (s < this.plazaS) return this.sampler.frame(s, this.tmp).y + CURB_RISE;
    return this.surfaceY(s, sideSign(side) * this.widthAtS(s) / 2);
  }

  /** Signed lateral offset of a world point relative to the frame at s. */
  lateralOf(x: number, z: number, s: number): number {
    const f = this.sampler.frame(s, this.tmp);
    return (x - f.x) * f.nx + (z - f.z) * f.nz;
  }

  /**
   * Snap transform for anything built along the street.
   * @param t       arc-length parameter 0..1
   * @param side    'left' | 'right' (walking toward Gringotts)
   * @param offset  metres behind the building line (+ = set back, − = protrude)
   */
  getStreetTransform(t: number, side: Side, offset = 0): StreetTransform {
    const s = t * this.length;
    const f = this.sampler.frame(s, createFrame());
    const width = streetWidthAt(t);
    const sg = sideSign(side);
    const position = new THREE.Vector3(f.x + f.nx * sg * (width / 2 + offset), this.groundY(s, side), f.z + f.nz * sg * (width / 2 + offset));
    const inward = new THREE.Vector3(-f.nx * sg, 0, -f.nz * sg);
    return this.makeTransform(position, inward, t, s, width);
  }

  /**
   * Transform for a straight frontage occupying [s0, s0 + frontage] on a side.
   * Uses the chord between the two building-line points, so a shop's bounding
   * box sits flush on the curve. Origin = chord midpoint (front-centre).
   */
  frontageTransform(side: Side, s0: number, frontage: number, offset = 0): StreetTransform {
    const sg = sideSign(side);
    const pt = (s: number) => {
      const f = this.sampler.frame(s, createFrame());
      const w = this.widthAtS(s);
      return new THREE.Vector3(f.x + f.nx * sg * w / 2, 0, f.z + f.nz * sg * w / 2);
    };
    const a = pt(s0), b = pt(s0 + frontage);
    const chord = b.clone().sub(a).normalize();
    // inward = up × chord for right side's mirrored orientation
    const inward = new THREE.Vector3(-chord.z, 0, chord.x).multiplyScalar(-sg);
    const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(inward, -offset);
    const sm = s0 + frontage / 2;
    mid.y = Math.min(this.groundY(s0, side), this.groundY(s0 + frontage, side));
    return this.makeTransform(mid, inward, sm / this.length, sm, this.widthAtS(sm));
  }

  /** True if no reserved feature (alcove, Knockturn, courtyard, Gringotts) overlaps [s0, s1] on a side. */
  isFrontageFree(side: Side, s0: number, s1: number): boolean {
    return !this.reservations.some((r) => r.side === side && r.s0 < s1 && r.s1 > s0);
  }

  /** Placement for Gringotts: front-centre of the 8 m fork frontage at the plaza end, facing back down the street. */
  gringottsSite(): StreetTransform {
    const f = this.sampler.frame(this.length, createFrame());
    const pos = new THREE.Vector3(f.x, this.surfaceY(this.length, 0), f.z);
    return this.makeTransform(pos, new THREE.Vector3(-f.tx, 0, -f.tz), 1, this.length, 8);
  }

  private makeTransform(position: THREE.Vector3, inward: THREE.Vector3, t: number, s: number, width: number): StreetTransform {
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, inward).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, inward).setPosition(position);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
    const f = this.sampler.frame(s, createFrame());
    return {
      position, quaternion, matrix, inward, right,
      tangent: new THREE.Vector3(f.tx, 0, f.tz), t, s, width, groundY: position.y,
    };
  }
}

/** The one shared layout instance. */
export const STREET = new StreetLayout();

/** Snap helper for shops: see StreetLayout.getStreetTransform. */
export function getStreetTransform(t: number, side: Side, offset = 0): StreetTransform {
  return STREET.getStreetTransform(t, side, offset);
}

/** Apply a street transform to an object (position + orientation). */
export function snapToStreet(object: THREE.Object3D, t: number, side: Side, offset = 0): THREE.Object3D {
  const tr = STREET.getStreetTransform(t, side, offset);
  object.position.copy(tr.position);
  object.quaternion.copy(tr.quaternion);
  return object;
}
