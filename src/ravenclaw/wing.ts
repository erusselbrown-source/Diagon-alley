/**
 * Ravenclaw dormitory wings (bays 2 and 10).
 *
 *   common-room door → vaulted passage → spiral-stair turret (24 stone steps,
 *   540°, bronze handrail, arrow slits, candle sconces) → top landing →
 *   pointed arch → dormitory one storey up.
 *
 * The dormitory is a stone hall under an open timber roof (trusses from the
 * kit's `buildTimberFrame`) with traceried lancet windows, oak wainscot,
 * five blue-hung four-poster beds, trunks, nightstands, a wardrobe, a
 * washstand and mirror, a cast-iron stove, a writing desk under the gable
 * window, and the occupants' clutter. Outside: slate roofs, a conical turret
 * cap and stone walls running down into the castle mass, since the wings are
 * visible from the common-room windows.
 *
 * Built in each bay's local frame (x across, y up, z outward) through the
 * shared Batch; repeated small things go through the shops' LocalInstances.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import { buildTimberFrame, type Beam } from '../architecture/kit/timber';
import { LocalInstances } from '../shops/interior';
import { Batch, tf, lathe, cyl, cbox, softBox, archPoints, archApex, archRing, toPath, extrude, tube, canvas, canvasTexture } from './util';
import {
  WINGS, WING_PASSAGE, TURRET, UPPER, STAIR_SWEEP, DORM, DORM_ARCH_X, type Wing,
} from './layout';
import type { RoomMats } from './materials';
import { WS } from './materials';
import type { Candle } from './props';
import { chair, candlestick, bookStack, inkwell, parchments, openBook, cat, scarfGeometry, satchel, broom, teacup, legLathe, drapedCloth, frame } from './props';
import type { TowerWalkArea } from './walkArea';
import { BLUE, BRONZE, BRONZE_HI, eagleShape } from './textures';

const PI = Math.PI;
const TOP = UPPER + 3.1; // turret ceiling springing

export interface WingLight { pos: THREE.Vector3; color: number; intensity: number; distance: number; flicker: number }

export interface WingRefs {
  wing: Wing;
  beds: { pos: THREE.Vector3; look: THREE.Vector3; label: string }[];
  trunkLid: THREE.Object3D;
  trunkPos: THREE.Vector3;
  owl: THREE.Object3D | null;
  catPos: THREE.Vector3 | null;
  stove: THREE.Vector3;
  mirror: THREE.Vector3;
  desk: THREE.Vector3;
  feather: THREE.Vector3;
  props: THREE.Group;
}

export interface Wings {
  group: THREE.Group;
  candles: Candle[];
  lights: WingLight[];
  refs: WingRefs[];
  animators: ((dt: number, t: number) => void)[];
}

export function buildWings(m: RoomMats, extra: WingMats, area: TowerWalkArea): Wings {
  const group = new THREE.Group();
  group.name = 'wings';
  const candles: Candle[] = [];
  const lights: WingLight[] = [];
  const refs: WingRefs[] = [];
  const animators: Wings['animators'] = [];
  for (const w of WINGS) {
    const b = new Batch();
    b.push(w.matrix);
    passage(b, m, w, lights, candles);
    turret(b, m, extra, w, lights, candles);
    dormShell(b, m, extra, w, group);
    b.pop();
    group.add(b.build(`wing-${w.kind}`));
    refs.push(dormFurnishings(m, extra, w, group, area, candles, lights, animators));
  }
  return { group, candles, lights, refs, animators };
}

// ---------------------------------------------------------------------------
// Extra materials owned by the wings
// ---------------------------------------------------------------------------

export interface WingMats {
  slate: THREE.MeshStandardMaterial;
  timber: THREE.MeshStandardMaterial;
  linen: THREE.MeshPhysicalMaterial;
  quilt: THREE.MeshPhysicalMaterial[];
  rug: THREE.MeshPhysicalMaterial;
  slit: THREE.MeshStandardMaterial;
  mirror: THREE.MeshStandardMaterial;
  owl: THREE.MeshStandardMaterial;
  owlFace: THREE.MeshStandardMaterial;
  owlEye: THREE.MeshStandardMaterial;
  wicker: THREE.MeshStandardMaterial;
  robe: THREE.MeshPhysicalMaterial;
}

export function createWingMaterials(m: RoomMats, slate: THREE.MeshStandardMaterial, oak: THREE.MeshStandardMaterial): WingMats {
  const timber = oak.clone();
  timber.color = new THREE.Color(0x5a4636);
  timber.name = 'roof-timber';
  return {
    slate,
    timber,
    linen: new THREE.MeshPhysicalMaterial({ name: 'linen', color: 0xe9e3d6, roughness: 0.92, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), normalMap: m.velvet.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) }),
    quilt: [0, 1].map((k) => new THREE.MeshPhysicalMaterial({ name: `quilt-${k}`, map: paintQuilt(k), roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x7088cc), side: THREE.DoubleSide, normalMap: m.velvet.normalMap })),
    rug: new THREE.MeshPhysicalMaterial({ name: 'dorm-rug', map: paintRug(), roughness: 1, sheen: 0.8, sheenColor: new THREE.Color(0x5a70b0), normalMap: m.velvet.normalMap }),
    slit: new THREE.MeshStandardMaterial({ name: 'arrow-slit', color: 0x03060e, emissive: new THREE.Color(0.02, 0.035, 0.09), roughness: 0.4 }),
    mirror: new THREE.MeshStandardMaterial({ name: 'mirror', color: 0xc8ccd4, metalness: 1, roughness: 0.04, envMapIntensity: 1.6 }),
    owl: new THREE.MeshStandardMaterial({ name: 'owl', map: paintFeathers(), roughness: 0.9 }),
    owlFace: new THREE.MeshStandardMaterial({ name: 'owl-face', color: 0xcbb08c, roughness: 0.95 }),
    owlEye: new THREE.MeshStandardMaterial({ name: 'owl-eye', color: 0x110a04, emissive: new THREE.Color(0.35, 0.18, 0.02), roughness: 0.1 }),
    wicker: new THREE.MeshStandardMaterial({ name: 'wicker', map: paintWicker(), roughness: 0.85 }),
    robe: new THREE.MeshPhysicalMaterial({ name: 'robe', color: 0x0d0f16, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(0x283a70), side: THREE.DoubleSide }),
  };
}

// ---------------------------------------------------------------------------
// Passage and turret
// ---------------------------------------------------------------------------

function passage(b: Batch, m: RoomMats, _w: Wing, lights: WingLight[], candles: Candle[]): void {
  const z0 = WING_PASSAGE.z0, z1 = TURRET.z - TURRET.r + 0.35;
  const sh = new THREE.Shape();
  sh.moveTo(-1.35, -22); sh.lineTo(1.35, -22); sh.lineTo(1.35, 3.45); sh.lineTo(-1.35, 3.45); sh.closePath();
  sh.holes.push(toPath(archPoints(WING_PASSAGE.w, 0, 2.2, 0.7)));
  b.add(m.ashlar, extrude(sh, z1 - z0, 0, WS.ashlar), tf(0, 0, z0));
  for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) {
    b.add(m.flags, cbox(WING_PASSAGE.w / 2 - 0.01, 0.12, (z1 - z0) / 3 - 0.01, 0.012, WS.granite), tf((j - 0.5) * WING_PASSAGE.w / 2, -0.06, z0 + (k + 0.5) * (z1 - z0) / 3));
  }
  // a candle bracket on the passage wall
  const p = new THREE.Vector3(-0.78, 1.75, z0 + 1.0);
  b.add(m.iron, cbox(0.04, 0.2, 0.08, 0.008, WS.iron), tf(-0.83, 1.62, p.z));
  b.add(m.iron, cyl(0.008, 0.008, 0.14, 6, WS.iron).rotateZ(PI / 2), tf(-0.76, 1.62, p.z));
  b.add(m.iron, lathe([[0.001, 0], [0.04, 0], [0.045, 0.02], [0.02, 0.03]], 10, WS.iron), tf(p.x, 1.66, p.z));
  const wp = p.clone().setY(1.69).applyMatrix4(b.top);
  candles.push({ pos: wp, h: 0.14, r: 0.014 });
  lights.push({ pos: wp.clone().add(new THREE.Vector3(0, 0.25, 0)), color: 0xffa050, intensity: 2.2, distance: 6, flicker: 1 });
}

/** Extruded annular sector (a spiral step or landing): plan angle φ = atan2(x, z), between radii r0..r1, y0..y1. */
function sector(r0: number, r1: number, a0: number, a1: number, y0: number, y1: number, seg = 6): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const pt = (r: number, a: number) => new THREE.Vector2(r * Math.sin(a), -r * Math.cos(a));
  s.moveTo(pt(r0, a0).x, pt(r0, a0).y);
  for (let k = 0; k <= seg; k++) { const p = pt(r1, a0 + (a1 - a0) * (k / seg)); s.lineTo(p.x, p.y); }
  for (let k = seg; k >= 0; k--) { const p = pt(r0, a0 + (a1 - a0) * (k / seg)); s.lineTo(p.x, p.y); }
  const g = extrude(s, y1 - y0, 0.006, WS.granite, 2);
  g.rotateX(-PI / 2);
  g.translate(0, y0, 0);
  return g;
}

function turret(b: Batch, m: RoomMats, x: WingMats, _w: Wing, lights: WingLight[], candles: Candle[]): void {
  const { r, newel, steps, rise, wall } = TURRET;
  b.push(tf(0, 0, TURRET.z));
  const gapP = 0.72, gapD = 0.85;
  // inner faces (normals toward the axis) and outer faces, gapped for the passage below and the dorm arch above
  const face = (rad: number, y0: number, y1: number, inner: boolean, a0: number, len: number, mat = m.ashlar) =>
    b.add(mat, lathe(inner ? [[rad, y1], [rad, y0]] : [[rad, y0], [rad, y1]], 40, WS.ashlar, a0, len));
  face(r, 0, 3.45, true, PI + gapP, PI * 2 - 2 * gapP);
  face(r, 3.45, UPPER, true, 0, PI * 2);
  face(r, UPPER, TOP, true, gapD, PI * 2 - 2 * gapD);
  face(r + wall, -22, 3.45, false, PI + gapP, PI * 2 - 2 * gapP);
  face(r + wall, 3.45, UPPER, false, 0, PI * 2);
  face(r + wall, UPPER, TOP + 0.25, false, gapD + 0.25, PI * 2 - 2 * gapD - 0.5);
  b.add(m.ashlar, lathe([[r, TOP], [r + wall + 0.06, TOP], [r + wall + 0.06, TOP + 0.25]], 40, WS.ashlar));
  // stone floor at the bottom, newel, steps, top landing
  b.add(m.flags, new THREE.CircleGeometry(r, 40).rotateX(-PI / 2), tf(0, 0.003, 0));
  b.add(m.ashlar, cyl(newel, newel, TOP, 18, WS.ashlar), tf(0, TOP / 2, 0));
  const dA = STAIR_SWEEP / steps;
  for (let k = 0; k < steps; k++) {
    const a0 = PI + k * dA;
    const top = (k + 1) * rise;
    b.add(m.flags, sector(newel - 0.02, r + 0.05, a0, a0 + dA + 0.02, top - 0.34, top, 5));
    // bull-nosed front edge
    const ax = new THREE.Vector3(Math.sin(a0), 0, Math.cos(a0));
    const mid = ax.clone().multiplyScalar((newel + r) / 2);
    const len = r - newel;
    b.add(m.flags, cyl(0.035, 0.035, len, 8, WS.granite).rotateZ(PI / 2).rotateY(a0 - PI / 2), tf(mid.x, top - 0.035, mid.z));
  }
  b.add(m.flags, sector(newel - 0.02, r + 0.05, -0.02, PI / 2, UPPER - 0.3, UPPER, 10));
  // handrail on bronze brackets
  const rail: THREE.Vector3[] = [];
  for (let k = 0; k <= 72; k++) {
    const a = PI + 0.3 + (STAIR_SWEEP - 0.3) * (k / 72);
    const h = ((a - PI) / STAIR_SWEEP) * UPPER + 0.92;
    rail.push(new THREE.Vector3(Math.sin(a) * (r - 0.1), h, Math.cos(a) * (r - 0.1)));
  }
  b.add(m.bronze, tube(rail, 0.022, 220, 8));
  for (let k = 1; k < 12; k++) {
    const a = PI + 0.3 + (STAIR_SWEEP - 0.3) * (k / 12);
    const h = ((a - PI) / STAIR_SWEEP) * UPPER + 0.92;
    b.add(m.bronze, cyl(0.008, 0.008, 0.12, 6, WS.bronze).rotateZ(PI / 2).rotateY(a - PI / 2), tf(Math.sin(a) * (r - 0.04), h - 0.02, Math.cos(a) * (r - 0.04)));
  }
  // arrow slits glowing faintly with night sky
  for (const [a, y] of [[PI * 1.5, 1.9], [PI * 0.5, 2.7], [PI * 1.35, 3.0], [PI * 0.55, UPPER + 1.6]] as const) {
    const g = new THREE.PlaneGeometry(0.11, 0.95);
    b.add(x.slit, g, tf(Math.sin(a) * (r - 0.004), y, Math.cos(a) * (r - 0.004), a + PI), false);
    b.add(m.ashlar, cbox(0.32, 0.06, 0.12, 0.01, WS.ashlar), tf(Math.sin(a) * (r - 0.03), y - 0.5, Math.cos(a) * (r - 0.03), a));
  }
  // candle sconces
  for (const [a, y] of [[PI * 1.75, 2.15], [PI * 0.35 + PI * 2, 3.55], [PI * 0.8, UPPER + 1.9]] as const) {
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const at = dir.clone().multiplyScalar(r - 0.16);
    b.add(m.iron, cbox(0.05, 0.22, 0.04, 0.008, WS.iron), tf(dir.x * (r - 0.02), y - 0.1, dir.z * (r - 0.02), a));
    b.add(m.iron, cyl(0.008, 0.008, 0.16, 6, WS.iron).rotateX(PI / 2).rotateY(a), tf(dir.x * (r - 0.09), y - 0.12, dir.z * (r - 0.09)));
    b.add(m.iron, lathe([[0.001, 0], [0.045, 0], [0.05, 0.02], [0.02, 0.03]], 10, WS.iron), tf(at.x, y - 0.12, at.z));
    const wp = new THREE.Vector3(at.x, y - 0.09, at.z).applyMatrix4(b.top);
    candles.push({ pos: wp, h: 0.15, r: 0.015 });
    lights.push({ pos: wp.clone().add(new THREE.Vector3(0, 0.3, 0)), color: 0xffa050, intensity: 2.6, distance: 6.5, flicker: 1 });
  }
  // conical ceiling inside, slate cap and bronze finial outside
  b.add(m.ashlarDark, lathe([[0.001, TOP + 1.1], [r, TOP]], 40, WS.ashlar));
  b.add(x.slate, lathe([[r + wall + 0.35, TOP + 0.15], [0.001, TOP + 3.9]], 48, WS.slate));
  b.add(m.ashlar, lathe([[r + wall + 0.4, TOP + 0.1], [r + wall + 0.4, TOP + 0.2], [r + wall - 0.1, TOP + 0.2]], 48, WS.ashlar));
  b.add(m.bronze, lathe([[0.06, 0], [0.09, 0.08], [0.05, 0.25], [0.11, 0.4], [0.03, 0.55], [0.015, 1.1], [0.001, 1.15]], 12, WS.bronze), tf(0, TOP + 3.75, 0));
  b.pop();
}

// ---------------------------------------------------------------------------
// Dormitory shell
// ---------------------------------------------------------------------------

/** Dorm-local frame: origin at the floor on the inner face of the south wall, x across, z toward the gable. */
function dormFrame(): THREE.Matrix4 { return tf(0, UPPER, DORM.z0); }

interface Hole { x: number; w: number; y0: number; ys: number; sharp: number; lancets: 1 | 2 }

/**
 * One wall in its own frame: inner face at z = 0, outward +z; `len` across;
 * from y0 up to the eave (or gable apex); arched holes with architraves,
 * tracery, leaded glass, a marble sill and iron saddle bars.
 */
function wallPanel(b: Batch, m: RoomMats, len: number, y0: number, gable: number, holes: Hole[], door?: { x: number; w: number; ys: number }): void {
  const t = DORM.t, H = DORM.wallH;
  const s = new THREE.Shape();
  s.moveTo(-len / 2, y0); s.lineTo(len / 2, y0); s.lineTo(len / 2, H);
  if (gable > 0) s.lineTo(0, H + gable);
  s.lineTo(-len / 2, H); s.closePath();
  for (const h of holes) s.holes.push(toPath(archPoints(h.w, h.y0, h.ys, h.sharp).map((p) => p.setX(p.x + h.x))));
  if (door) s.holes.push(toPath(archPoints(door.w, 0, door.ys, 0.75).map((p) => p.setX(p.x + door.x))));
  b.add(m.ashlar, extrude(s, t, 0, WS.ashlar));
  for (const h of holes) {
    b.push(tf(h.x, 0, 0));
    b.add(m.marble, extrude(archRing(h.w, h.y0, h.ys, 0.1, h.sharp), 0.05, 0.01, WS.marble), tf(0, 0, -0.05));
    b.add(m.marble, cbox(h.w + 0.35, 0.06, 0.3, 0.012, WS.marble), tf(0, h.y0 - 0.03, 0.05));
    const zT = t * 0.55;
    const outer = archPoints(h.w + 0.04, h.y0 - 0.02, h.ys, h.sharp);
    const tr = new THREE.Shape(outer);
    const lights: THREE.Vector2[][] = [];
    if (h.lancets === 1) lights.push(archPoints(h.w - 0.16, h.y0 + 0.06, h.ys - 0.05, h.sharp));
    else {
      const lw = h.w / 2 - 0.12;
      for (const sx of [-1, 1]) lights.push(archPoints(lw, h.y0 + 0.06, h.ys - 0.3, 0.95).map((p) => p.setX(p.x + sx * (lw / 2 + 0.05))));
      const oc: THREE.Vector2[] = [];
      const cy = archApex(h.w, h.ys, h.sharp) - 0.42;
      for (let k = 0; k < 28; k++) { const a = (k / 28) * PI * 2; oc.push(new THREE.Vector2(Math.cos(a) * 0.2, cy + Math.sin(a) * 0.2)); }
      lights.push(oc);
    }
    for (const l of lights) tr.holes.push(toPath(l));
    b.add(m.marble, extrude(tr, 0.11, 0.008, WS.marble), tf(0, 0, zT));
    for (const l of lights) {
      const g = new THREE.ShapeGeometry(new THREE.Shape(l), 6);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 0.6, uv.getY(k) / 0.6);
      b.add(m.glass, g, tf(0, 0, zT + 0.055), false);
    }
    for (let y = h.y0 + 0.45; y < h.ys; y += 0.5) b.add(m.iron, cyl(0.007, 0.007, h.w - 0.1, 6, WS.iron).rotateZ(PI / 2), tf(0, y, zT + 0.09), false);
    b.pop();
  }
  if (door) {
    b.push(tf(door.x, 0, 0));
    b.add(m.marble, extrude(archRing(door.w, 0, door.ys, 0.14, 0.75), 0.06, 0.012, WS.marble), tf(0, 0, -0.06));
    b.add(m.marble, extrude(archRing(door.w, 0, door.ys, 0.14, 0.75), 0.06, 0.012, WS.marble), tf(0, 0, t));
    b.add(m.marble, cbox(door.w + 0.04, 0.05, t + 0.1, 0.01, WS.marble), tf(0, -0.02, t / 2));
    b.pop();
  }
}

function dormShell(b: Batch, m: RoomMats, x: WingMats, w: Wing, group: THREE.Group): void {
  const W = DORM.w, D = DORM.d, t = DORM.t, H = DORM.wallH, G = DORM.ridge;
  b.push(dormFrame());
  const deep = -(UPPER + 20);
  const winY = { y0: 1.0, ys: 2.35, sharp: 0.9 };
  // south wall (room is +z → frame rotated π): arch to the turret landing
  b.push(tf(0, 0, 0, PI));
  wallPanel(b, m, W + 2 * t, 0, G, [], { x: -DORM_ARCH_X, w: 1.0, ys: 2.15 });
  b.pop();
  // north gable with a two-light window
  b.push(tf(0, 0, D));
  wallPanel(b, m, W + 2 * t, deep, G, [{ x: 0, w: 1.75, y0: 0.85, ys: 2.55, sharp: 0.85, lancets: 2 }]);
  b.pop();
  // side walls, one lancet between each pair of beds
  b.push(tf(-W / 2, 0, D / 2, -PI / 2));
  wallPanel(b, m, D + 2 * t, deep, 0, [2.6, 4.8].map((zz) => ({ x: zz - D / 2, w: 0.8, ...winY, lancets: 1 as const })));
  b.pop();
  b.push(tf(W / 2, 0, D / 2, PI / 2));
  wallPanel(b, m, D + 2 * t, deep, 0, [2.6, 4.8].map((zz) => ({ x: -(zz - D / 2), w: 0.8, ...winY, lancets: 1 as const })));
  b.pop();
  // floor, slab and oak wainscot with a moulded rail
  const fg = new THREE.PlaneGeometry(W, D).rotateX(-PI / 2);
  const fuv = fg.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < fuv.count; k++) fuv.setXY(k, fuv.getX(k) * W / WS.parquet, fuv.getY(k) * D / WS.parquet);
  b.add(m.floor, fg, tf(0, 0, D / 2));
  b.add(m.ashlarDark, cbox(W + 2 * t, 0.5, D + t, 0.02, WS.ashlar), tf(0, -0.252, D / 2 + t / 2));
  const wain = (len: number, mat: THREE.Matrix4, skip: [number, number][] = []) => {
    b.push(mat);
    const n = Math.round(len / 0.62);
    for (let k = 0; k < n; k++) {
      const cx = -len / 2 + (k + 0.5) * (len / n);
      if (skip.some(([a, c]) => cx > a && cx < c)) continue;
      b.add(m.walnut, cbox(len / n - 0.02, 0.82, 0.025, 0.006, WS.walnut), tf(cx, 0.45, -0.015));
      b.add(m.walnut, cbox(len / n - 0.16, 0.6, 0.02, 0.004, WS.walnut), tf(cx, 0.46, -0.035));
    }
    b.add(m.walnut, cbox(len, 0.06, 0.06, 0.012, WS.walnut), tf(0, 0.88, -0.03));
    b.add(m.walnut, cbox(len, 0.12, 0.035, 0.006, WS.walnut), tf(0, 0.06, -0.02));
    b.pop();
  };
  wain(W, tf(0, 0, 0, PI), [[-DORM_ARCH_X - 0.6, -DORM_ARCH_X + 0.6]]);
  wain(W, tf(0, 0, D));
  wain(D, tf(-W / 2, 0, D / 2, -PI / 2));
  wain(D, tf(W / 2, 0, D / 2, PI / 2));

  // open timber roof: kit timber-frame trusses, purlins, ridge, boarding
  const half = W / 2;
  const slopeLen = Math.hypot(half, G);
  const truss: Beam[] = [
    { a: [-half, H - 0.15], b: [half, H - 0.15], width: 0.22, depth: 0.2 },
    { a: [-half - 0.1, H - 0.05], b: [0, H + G - 0.12], width: 0.2, depth: 0.18 },
    { a: [half + 0.1, H - 0.05], b: [0, H + G - 0.12], width: 0.2, depth: 0.18 },
    { a: [0, H - 0.15], b: [0, H + G - 0.2], width: 0.18, depth: 0.18 },
    { a: [0, H + 0.2], b: [-half * 0.5, H + G * 0.5 - 0.1], width: 0.12, depth: 0.14 },
    { a: [0, H + 0.2], b: [half * 0.5, H + G * 0.5 - 0.1], width: 0.12, depth: 0.14 },
    { a: [-half + 0.08, H - 1.2], b: [-half + 0.08, H - 0.15], width: 0.18, depth: 0.16 },
    { a: [half - 0.08, H - 1.2], b: [half - 0.08, H - 0.15], width: 0.18, depth: 0.16 },
    { a: [-half + 0.1, H - 0.95], b: [-half + 0.95, H - 0.2], width: 0.12, depth: 0.14 },
    { a: [half - 0.1, H - 0.95], b: [half - 0.95, H - 0.2], width: 0.12, depth: 0.14 },
  ];
  const trussZ = [0.7, 2.5, 4.3, 6.1];
  const dormWorld = new THREE.Matrix4().multiplyMatrices(w.matrix, dormFrame());
  for (const z of trussZ) {
    const tm = buildTimberFrame(truss, x.timber, -0.09);
    tm.applyMatrix4(new THREE.Matrix4().multiplyMatrices(dormWorld, tf(0, 0, z)));
    tm.name = `truss-${w.kind}`;
    group.add(tm);
  }
  for (const s of [-1, 1]) {
    for (const f of [0.3, 0.65]) {
      const px = s * half * (1 - f), py = H + G * f;
      b.add(x.timber, cbox(0.14, 0.16, D + 0.2, 0.02, 1), tf(px, py - 0.06, D / 2, 0, 0, -s * Math.atan2(G, half)));
    }
    // boarded ceiling on top of the rafters (faces down into the room), slates outside (face up/out)
    const n = new THREE.Vector3(s * G, half, 0).normalize();
    const eave = new THREE.Vector3(s * half, H, 0), ridgeP = new THREE.Vector3(0, H + G, 0);
    const dn = new THREE.Vector3(s * half, -G, 0).normalize(); // down-slope
    const off = (p: THREE.Vector3, k: number) => p.clone().addScaledVector(n, k);
    const z0 = -t, z1 = D + t;
    b.add(x.timber, quad(off(eave, 0.13), off(ridgeP, 0.13), z0, z1, n.clone().negate(), slopeLen, WS.oak));
    b.add(x.slate, quad(off(eave, 0.32).addScaledVector(dn, 0.5), off(ridgeP, 0.32), z0 - 0.35, z1 + 0.35, n, slopeLen + 0.5, WS.slate));
    b.add(x.slate, quad(off(ridgeP, 0.26), off(eave, 0.26).addScaledVector(dn, 0.5), z0 - 0.35, z1 + 0.35, n.clone().negate(), slopeLen + 0.5, WS.slate), undefined, false);
    b.add(x.slate, cbox(0.12, 0.25, D + 2 * t + 0.7, 0.03, WS.slate), tf(s * (half + 0.35), H + 0.05, D / 2));
  }
  b.add(x.timber, cbox(0.2, 0.26, D + 0.3, 0.03, 1), tf(0, H + G - 0.2, D / 2));
  b.add(m.iron, cyl(0.09, 0.09, D + 2 * t + 0.7, 10, WS.iron).rotateX(PI / 2), tf(0, H + G + 0.34, D / 2));
  // bronze eagle finial on the gable
  b.add(m.bronze, extrude(eagleShape(0.35), 0.04, 0.008, WS.bronze, 3), tf(0, H + G + 0.75, D + t + 0.1));
  b.pop();
}

// ---------------------------------------------------------------------------
// Furnishings
// ---------------------------------------------------------------------------

function dormFurnishings(m: RoomMats, x: WingMats, w: Wing, parent: THREE.Group, area: TowerWalkArea, candles: Candle[], lights: WingLight[], animators: Wings['animators']): WingRefs {
  const props = new THREE.Group();
  props.name = `dorm-props-${w.kind}`;
  const b = new Batch();
  const rng = new SeededRandom(`dorm-${w.kind}`);
  const inst = new LocalInstances();
  const girls = w.kind === 'girls';
  const F = new THREE.Matrix4().multiplyMatrices(w.matrix, dormFrame());
  const toWorld = (px: number, py: number, pz: number) => new THREE.Vector3(px, py, pz).applyMatrix4(F);
  const block = (px: number, pz: number, hw: number, hd: number, rot = 0) => {
    const c = toWorld(px, 0, pz);
    area.addRect(c.x, c.z, hw, hd, rot + Math.atan2(w.matrix.elements[8], w.matrix.elements[10]), UPPER);
  };
  const blockC = (px: number, pz: number, r: number) => { const c = toWorld(px, 0, pz); area.addCircle(c.x, c.z, r, UPPER); };
  b.push(F);
  const W = DORM.w, D = DORM.d;
  const beds: WingRefs['beds'] = [];
  // five four-posters: three along the west wall, two along the east (stove by the door)
  const bedSpots: [number, number][] = [[-1, 1.5], [-1, 3.7], [-1, 5.9], [1, 3.7], [1, 5.9]];
  bedSpots.forEach(([side, z], i) => {
    const hx = side * (W / 2);
    // bed-local: x from headboard (0) toward the foot (+2.15); placed with the head at the wall
    const ry = side < 0 ? 0 : PI;
    b.push(tf(hx - side * 0.02, 0, z, ry));
    fourPoster(b, m, x, rng, i % 2, i);
    b.pop();
    block(hx - side * 1.1, z, 1.12, 0.66);
    beds.push({
      pos: toWorld(hx - side * 1.2, 1.25, z + 0.25),
      look: toWorld(-side * 0.5, 1.3, z - 0.6),
      label: 'Sit on the bed',
    });
    // trunk at the foot
    b.push(tf(hx - side * 2.45, 0, z, ry + PI / 2));
    trunk(b, m, rng, i === 1 ? null : undefined);
    b.pop();
    block(hx - side * 2.45, z, 0.27, 0.45);
    // nightstand between beds, toward the head
    if (z + 1.1 < D - 0.3 && !(side > 0 && z + 1.1 > 6.6)) {
      b.push(tf(hx, 0, z + 1.1, ry));
      nightstand(b, m, candles, rng, F);
      b.pop();
      block(hx - side * 0.25, z + 1.1, 0.25, 0.25);
    }
    // a scarf or robe slung over a footpost
    if (rng.chance(0.6)) b.add(i % 2 ? m.scarf : x.robe, scarfGeometry(), tf(hx - side * 2.13, 1.6, z + 0.55, ry + PI / 2, 0.1));
  });
  // the open trunk (animated lid) at the second bed
  const trunkPos = toWorld(-W / 2 + 2.45, 0.5, 3.7);
  const lidPivot = new THREE.Group();
  lidPivot.userData.keep = true;
  const lidHinge = new THREE.Group();
  { const lb = new Batch(); trunkLid(lb, m); lidHinge.add(lb.build('trunk-lid')); }
  lidPivot.add(lidHinge);
  lidPivot.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, tf(-W / 2 + 2.45, 0.47, 3.7, PI / 2).multiply(tf(0, 0, 0.24))));
  props.add(lidPivot);
  // wardrobe, washstand + mirror, stove
  b.push(tf(-2.4, 0, 0.33, 0)); wardrobe(b, m); b.pop();
  block(-2.4, 0.33, 0.85, 0.33);
  b.push(tf(2.75, 0, 0.27, 0)); washstand(b, m, x); b.pop();
  block(2.75, 0.27, 0.5, 0.27);
  const stoveAt = new THREE.Vector3(W / 2 - 0.55, 0, 1.35);
  stove(b, m, stoveAt, W / 2, DORM.wallH);
  blockC(stoveAt.x, stoveAt.z, 0.45);
  lights.push({ pos: toWorld(stoveAt.x - 0.3, 0.7, stoveAt.z), color: 0xff7a30, intensity: 5.5, distance: 7, flicker: 1.4 });
  // central rug and iron ring chandelier
  b.add(x.rug, softBox(2.3, 0.015, 4.6, 0.006, 4), tf(0, 0.008, 3.6), false);
  chandelier(b, m, candles, 0, DORM.wallH + DORM.ridge - 0.25, 3.6);
  lights.push({ pos: toWorld(0, 2.6, 3.6), color: 0xffb066, intensity: 9, distance: 10, flicker: 0.5 });
  // writing desk under the gable window, with chair
  b.push(tf(0, 0, D - 0.42, PI));
  writingDesk(b, m, candles, rng, F);
  b.pop();
  block(0, D - 0.42, 0.8, 0.35);
  chair(b, m, 0.15, D - 1.05, rng.range(-0.3, 0.3));
  blockC(0.15, D - 1.05, 0.3);
  lights.push({ pos: toWorld(0.55, 1.4, D - 0.5), color: 0xffa050, intensity: 2.2, distance: 5, flicker: 1 });
  // robes on pegs by the door, a broom, satchels, star charts pinned up
  for (let k = 0; k < 4; k++) {
    const px = 1.3 + k * 0.26;
    b.add(m.walnut, cyl(0.018, 0.018, 0.12, 8, WS.walnut).rotateX(PI / 2), tf(px, 1.75, 0.06));
    if (k !== 2) b.add(x.robe, robeGeometry(rng), tf(px, 1.76, 0.1));
  }
  broom(b, m, girls ? -0.95 : 3.6, girls ? 0.3 : 6.7);
  satchel(b, m, girls ? 1.7 : -1.6, 0, 2.6, rng.range(0, 6));
  for (const [zz, side] of [[2.6, -1], [4.8, 1]] as const) {
    b.push(tf(side * (W / 2 - 0.02), 1.95, zz + side * 0.7, side < 0 ? PI / 2 : -PI / 2));
    b.add(m.starChart, new THREE.PlaneGeometry(0.42, 0.56), tf(0, 0, 0.005), false);
    b.pop();
  }
  // banner over the arch, inside
  b.push(tf(-0.85, 2.7, 0.05));
  b.add(m.banner, new THREE.PlaneGeometry(0.62, 1.05), tf(0, 0, 0), false);
  b.add(m.bronze, cyl(0.015, 0.015, 0.75, 8, WS.bronze).rotateZ(PI / 2), tf(0, 0.53, 0.01));
  b.pop();
  // floor clutter
  bookStack(b, m, girls ? 1.3 : -1.1, 0, girls ? 5.2 : 4.6, 4, rng);
  parchments(b, m, girls ? -0.7 : 0.6, 0.012, 2.2, 2, rng);
  openBook(b, m, -W / 2 + 1.0, 0.68, 3.95, 0.4, rng);
  teacup(b, m, W / 2 - 0.3, 0.71, 4.8);

  // pets: a tawny owl on a perch (boys) or a cat in a basket by the stove (girls)
  let owl: THREE.Object3D | null = null;
  let catPos: THREE.Vector3 | null = null;
  if (!girls) {
    b.add(m.walnut, lathe([[0.2, 0], [0.2, 0.03], [0.05, 0.06], [0.03, 0.2], [0.025, 1.3], [0.04, 1.33]], 12, WS.walnut), tf(-1.55, 0, D - 0.5));
    b.add(m.walnut, cyl(0.025, 0.025, 0.5, 8, WS.walnut).rotateZ(PI / 2), tf(-1.55, 1.35, D - 0.5));
    owl = buildOwl(x);
    owl.applyMatrix4(new THREE.Matrix4().multiplyMatrices(F, tf(-1.55, 1.37, D - 0.5, PI + 0.3)));
    props.add(owl);
    const o = owl;
    let next = 2, target = 0;
    const head = o.getObjectByName('owl-head')!;
    animators.push((dt, t) => {
      if (t > next) { next = t + 2 + ((t * 7.13) % 4); target = ((t * 3.7) % 2.4) - 1.2; }
      head.rotation.y += (target - head.rotation.y) * Math.min(1, dt * 6);
      o.scale.y = 1 + Math.sin(t * 1.3) * 0.012;
    });
    blockC(-1.55, D - 0.5, 0.25);
  } else {
    const bp = new THREE.Vector3(W / 2 - 1.3, 0, 1.15);
    b.add(x.wicker, lathe([[0.001, 0], [0.32, 0], [0.36, 0.08], [0.38, 0.16], [0.35, 0.17], [0.31, 0.06], [0.001, 0.05]], 28, 0.3), tf(bp.x, 0, bp.z));
    b.add(m.velvetDark, softBox(0.5, 0.06, 0.5, 0.03, 6, 0.02), tf(bp.x, 0.07, bp.z));
    cat(b, m, bp.x, 0.07, bp.z);
    catPos = toWorld(bp.x, 0.3, bp.z);
    blockC(bp.x, bp.z, 0.38);
  }
  b.pop();

  // small repeated things through LocalInstances: brass studs along the trunks and wardrobe
  inst.define('stud', new THREE.SphereGeometry(0.008, 6, 4), m.brass);
  for (const [side, z] of bedSpots) for (let k = 0; k < 9; k++) {
    const p = toWorld(side * (W / 2) - side * 2.45 - 0.27 * side, 0.12 + (k % 3) * 0.13, z - 0.4 + Math.floor(k / 3) * 0.4);
    inst.put('stud', p.x, p.y, p.z);
  }
  inst.build(props);

  props.add(b.build(`dorm-${w.kind}`));
  parent.add(props);
  const feather = girls ? toWorld(0.55, 0.81, D - 0.32) : toWorld(-W / 2 + 0.45, 0.82, 5.9 + 0.25);
  return {
    wing: w, beds, trunkLid: lidHinge, trunkPos, owl, catPos,
    stove: toWorld(stoveAt.x, 0.7, stoveAt.z),
    mirror: toWorld(2.75, 1.6, 0.1),
    desk: toWorld(0, 0.95, D - 0.42),
    feather,
    props,
  };
}

function fourPoster(b: Batch, m: RoomMats, x: WingMats, rng: SeededRandom, quilt: number, idx: number): void {
  const L = 2.15, Wd = 1.2, H = 2.35, pz = Wd / 2 - 0.05;
  const post = lathe([[0.06, 0], [0.065, 0.05], [0.05, 0.1], [0.045, 0.32], [0.065, 0.42], [0.045, 0.55], [0.035, 1.0], [0.05, 1.3], [0.03, 1.5], [0.032, H - 0.1], [0.05, H - 0.05], [0.05, H]], 12, WS.walnut);
  for (const px of [0.06, L - 0.06]) for (const s of [-1, 1]) {
    b.add(m.walnut, post, tf(px, 0, s * pz));
    b.add(m.bronze, lathe([[0.001, 0], [0.04, 0.02], [0.03, 0.07], [0.001, 0.1]], 8, WS.bronze), tf(px, H, s * pz));
  }
  // frame rails, headboard with a Gothic arch panel, low footboard
  for (const s of [-1, 1]) b.add(m.walnut, cbox(L - 0.12, 0.2, 0.05, 0.01, WS.walnut), tf(L / 2, 0.36, s * (pz - 0.01)));
  b.add(m.walnut, cbox(0.05, 0.2, Wd - 0.1, 0.01, WS.walnut), tf(L - 0.06, 0.36, 0));
  const hb = new THREE.Shape(archPoints(Wd - 0.14, 0.0, 0.55, 0.8));
  hb.holes.push(toPath(archPoints(Wd - 0.44, 0.16, 0.5, 0.85)));
  b.add(m.walnut, extrude(hb, 0.045, 0.008, WS.walnut, 8), tf(0.05, 0.42, 0, PI / 2));
  b.add(m.velvetDark, extrude(new THREE.Shape(archPoints(Wd - 0.44, 0.16, 0.5, 0.85)), 0.02, 0.004, 0.4, 8), tf(0.06, 0.42, 0, PI / 2));
  b.add(m.walnut, cbox(0.05, 0.45, Wd - 0.1, 0.01, WS.walnut), tf(L - 0.06, 0.62, 0));
  // canopy rails and silk tester, pleated valance all round
  for (const s of [-1, 1]) b.add(m.walnut, cbox(L, 0.08, 0.05, 0.01, WS.walnut), tf(L / 2, H - 0.06, s * pz));
  for (const px of [0.06, L - 0.06]) b.add(m.walnut, cbox(0.05, 0.08, Wd - 0.05, 0.01, WS.walnut), tf(px, H - 0.06, 0));
  b.add(m.silk, new THREE.PlaneGeometry(L, Wd).rotateX(PI / 2), tf(L / 2, H - 0.1, 0), false);
  const val = (len: number) => {
    const g = new THREE.PlaneGeometry(len, 0.3, Math.round(len * 26), 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) { const px = p.getX(k), py = p.getY(k); p.setZ(k, 0.018 * Math.sin(px * 52) + (py < 0 ? 0.01 * Math.sin(px * 9) : 0)); p.setY(k, py - 0.15 - (py < 0 ? 0.04 * Math.abs(Math.sin(px * PI * 2 / len * 2)) : 0)); }
    g.computeVertexNormals();
    return g;
  };
  for (const s of [-1, 1]) b.add(m.silk, val(L + 0.06), tf(L / 2, H, s * (pz + 0.035)), false);
  b.add(m.silk, val(Wd), tf(L + 0.0, H, 0, PI / 2), false);
  b.add(m.bronze, cyl(0.006, 0.006, L, 4, 0.2).rotateZ(PI / 2), tf(L / 2, H - 0.36, pz + 0.05), false);
  // gathered curtains tied to the four posts
  const curtain = (h: number) => {
    const g = new THREE.CylinderGeometry(0.12, 0.17, h, 28, 12, true);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k), py = p.getY(k), pz2 = p.getZ(k);
      const a = Math.atan2(px, pz2);
      const v = (py + h / 2) / h; // 0 bottom → 1 top
      const tie = Math.exp(-Math.pow((v - 0.45) / 0.12, 2));
      const rr = (1 + 0.18 * Math.sin(a * 9)) * (1 - 0.55 * tie) * (v < 0.45 ? 1.15 : 1);
      p.setXYZ(k, px * rr, py, pz2 * rr);
    }
    g.computeVertexNormals();
    return g.translate(0, h / 2, 0);
  };
  for (const px of [0.16, L - 0.14]) for (const s of [-1, 1]) {
    b.add(m.silk, curtain(H - 0.15), tf(px, 0.02, s * (pz + 0.02)));
    b.add(m.bronze, new THREE.TorusGeometry(0.075, 0.012, 6, 16).rotateX(PI / 2), tf(px, (H - 0.15) * 0.45 + 0.02, s * (pz + 0.02)));
  }
  // mattress, sheets, quilt and pillows
  b.add(x.linen, softBox(L - 0.15, 0.22, Wd - 0.14, 0.06, 10), tf(L / 2, 0.56, 0));
  b.add(x.quilt[quilt], quiltGeometry(L - 0.5, Wd + 0.08, rng), tf(0.62, 0.68, 0));
  b.add(x.linen, softBox(0.32, 0.03, Wd - 0.12, 0.012, 6), tf(0.62, 0.69, 0, 0, 0, 0.05));
  for (const s of [-1, 1]) b.add(x.linen, softBox(0.4, 0.14, 0.52, 0.06, 8, 0.03), tf(0.3, 0.75, s * 0.26, rng.range(-0.1, 0.1), 0, 0.2));
  if (idx % 2 === 0) b.add(m.velvet, softBox(0.32, 0.12, 0.32, 0.05, 6, 0.02), tf(0.55, 0.82, rng.range(-0.2, 0.2), 0.5, 0, 0.3));
}

/** A roof plane between two slope points, extruded along z; normal faces `facing`. */
function quad(a: THREE.Vector3, c: THREE.Vector3, z0: number, z1: number, facing: THREE.Vector3, slopeLen: number, ws: number): THREE.BufferGeometry {
  const P = [new THREE.Vector3(a.x, a.y, z0), new THREE.Vector3(a.x, a.y, z1), new THREE.Vector3(c.x, c.y, z1), new THREE.Vector3(c.x, c.y, z0)];
  const U = [[0, 0], [(z1 - z0) / ws, 0], [(z1 - z0) / ws, slopeLen / ws], [0, slopeLen / ws]];
  let idx = [0, 1, 2, 0, 2, 3];
  const nrm = new THREE.Vector3().subVectors(P[1], P[0]).cross(new THREE.Vector3().subVectors(P[2], P[0]));
  if (nrm.dot(facing) < 0) idx = [0, 2, 1, 0, 3, 2];
  const pos: number[] = [], uv: number[] = [];
  for (const i of idx) { pos.push(P[i].x, P[i].y, P[i].z); uv.push(U[i][0], U[i][1]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function quiltGeometry(len: number, wid: number, rng: SeededRandom): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(len, wid, 30, 20);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const seed = rng.range(0, 10);
  const top = 0.55; // half-width resting on the mattress
  for (let k = 0; k < p.count; k++) {
    const u = p.getX(k), v = p.getY(k);
    const over = Math.max(0, Math.abs(v) - top);
    const foot = Math.max(0, u - (len / 2 - 0.05));
    let y = 0.01 * Math.sin(u * 7 + seed) * Math.cos(v * 5 + seed) + 0.025 * Math.sin(u * 2.2 + seed) * (1 - over * 3);
    y -= over * 1.6;
    const vz = Math.sign(v) * (Math.min(Math.abs(v), top) + over * 0.12);
    // (u, v) plane → (length, height, −across) so the faces point up
    p.setXYZ(k, u + len / 2 - foot * 0.85, y - foot * 1.4, -(vz + 0.02 * Math.sin(u * 12 + seed) * (over > 0 ? 1 : 0)));
  }
  g.computeVertexNormals();
  return g;
}

function trunk(b: Batch, m: RoomMats, rng: SeededRandom, lidless?: null): void {
  // trunk-local: x across (length 0.9), z depth 0.5, lid hinge at back (+z)
  b.add(m.leather, cbox(0.9, 0.42, 0.5, 0.02, WS.leather), tf(0, 0.25, 0));
  b.add(m.walnut, cbox(0.92, 0.04, 0.52, 0.008, WS.walnut), tf(0, 0.06, 0));
  for (const sx of [-0.25, 0.25]) b.add(m.leather, cbox(0.06, 0.43, 0.51, 0.006, WS.leather), tf(sx, 0.25, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(m.brass, cbox(0.07, 0.07, 0.07, 0.01, WS.brass), tf(sx * 0.43, 0.43, sz * 0.23));
  b.add(m.brass, cbox(0.08, 0.1, 0.012, 0.004, WS.brass), tf(0, 0.38, -0.255));
  for (const sx of [-1, 1]) b.add(m.brass, new THREE.TorusGeometry(0.04, 0.008, 6, 12, PI), tf(sx * 0.46, 0.3, 0, PI / 2));
  if (lidless === null) {
    // open: clothes and books inside
    b.add(m.wool, softBox(0.8, 0.1, 0.42, 0.04, 6, 0.04), tf(0, 0.4, 0));
    b.add(m.leather, cbox(0.18, 0.05, 0.25, 0.008, 0.3), tf(-0.2, 0.48, 0.05, 0.3));
  } else {
    trunkLid(b, m, 0.47);
    void rng;
  }
}

function trunkLid(b: Batch, m: RoomMats, y = 0): void {
  // lid centred on x, hinge line at z = +0.24 (local origin when animated: hinge)
  const off = y ? 0 : -0.24;
  b.add(m.leather, cyl(0.25, 0.25, 0.9, 20, WS.leather, false).rotateZ(PI / 2).scale(1, 0.28, 1), tf(0, y, off));
  b.add(m.brass, cyl(0.253, 0.253, 0.05, 20, WS.brass).rotateZ(PI / 2).scale(1, 0.28, 1), tf(-0.25, y, off));
  b.add(m.brass, cyl(0.253, 0.253, 0.05, 20, WS.brass).rotateZ(PI / 2).scale(1, 0.28, 1), tf(0.25, y, off));
}

function nightstand(b: Batch, m: RoomMats, candles: Candle[], rng: SeededRandom, F: THREE.Matrix4): void {
  b.add(m.walnut, cbox(0.48, 0.05, 0.42, 0.01, WS.walnut), tf(0.22, 0.66, 0));
  b.add(m.walnut, cbox(0.44, 0.56, 0.38, 0.01, WS.walnut), tf(0.22, 0.36, 0));
  b.add(m.walnut, cbox(0.02, 0.18, 0.32, 0.004, WS.walnut), tf(0.45, 0.52, 0));
  b.add(m.brass, new THREE.SphereGeometry(0.016, 8, 6), tf(0.47, 0.52, 0));
  for (const s of [-1, 1]) for (const e of [0.02, 0.42]) b.add(m.walnut, legLathe(0.08, 0.02), tf(e, 0, s * 0.16));
  // candle, a book, a water glass
  const cs: Candle[] = [];
  candlestick(b, m, cs, 0.2, 0.685, 0.1, 0.12, true);
  for (const c of cs) candles.push(c);
  void F;
  b.add(m.leather, cbox(0.16, 0.04, 0.22, 0.006, 0.3), tf(0.24, 0.705, -0.08, rng.range(-0.4, 0.4)));
  b.add(m.clearGlass, lathe([[0.001, 0], [0.03, 0], [0.035, 0.1], [0.032, 0.1], [0.027, 0.004], [0.001, 0.004]], 14, 0.2), tf(0.34, 0.685, 0.09), false);
}

function wardrobe(b: Batch, m: RoomMats): void {
  const w = 1.6, h = 2.25, d = 0.62;
  b.add(m.walnut, cbox(w, h - 0.12, d, 0.015, WS.walnut), tf(0, 0.12 + (h - 0.12) / 2, 0));
  b.add(m.walnut, cbox(w + 0.1, 0.12, d + 0.08, 0.02, WS.walnut), tf(0, h + 0.04, 0));
  b.add(m.walnut, cbox(w + 0.04, 0.1, d + 0.04, 0.015, WS.walnut), tf(0, 0.07, 0));
  for (const s of [-1, 1]) {
    const pnl = new THREE.Shape(archPoints(w / 2 - 0.22, 0, 1.35, 0.8));
    b.add(m.walnut, extrude(archRing(w / 2 - 0.22, 0, 1.35, 0.03, 0.8), 0.02, 0.004, WS.walnut, 8), tf(s * w / 4, 0.4, d / 2));
    b.add(m.velvetDark, extrude(pnl, 0.006, 0, 0.4, 8), tf(s * w / 4, 0.4, d / 2 - 0.002));
    b.add(m.brass, cyl(0.012, 0.012, 0.18, 8, WS.brass), tf(s * 0.07, 1.15, d / 2 + 0.03));
  }
  b.add(m.walnut, cbox(0.02, h - 0.3, 0.02, 0.004, WS.walnut), tf(0, 1.2, d / 2 + 0.005));
  b.add(m.bronze, extrude(eagleShape(0.14), 0.015, 0.003, WS.bronze, 3), tf(0, h - 0.18, d / 2 + 0.01, PI));
}

function washstand(b: Batch, m: RoomMats, x: WingMats): void {
  b.add(m.walnut, cbox(0.95, 0.72, 0.48, 0.012, WS.walnut), tf(0, 0.38, 0));
  b.add(m.marble, cbox(1.0, 0.04, 0.52, 0.01, WS.marble), tf(0, 0.76, 0));
  b.add(m.walnut, cbox(1.0, 0.2, 0.03, 0.006, WS.walnut), tf(0, 0.88, -0.24));
  b.add(m.porcelain, lathe([[0.001, 0], [0.09, 0], [0.2, 0.08], [0.22, 0.1], [0.2, 0.1], [0.08, 0.015], [0.001, 0.015]], 28, 0.3), tf(-0.12, 0.78, 0.03));
  b.add(m.porcelain, lathe([[0.001, 0], [0.07, 0], [0.09, 0.06], [0.1, 0.16], [0.07, 0.25], [0.05, 0.3], [0.07, 0.33], [0.065, 0.335], [0.04, 0.31], [0.001, 0.3]], 24, 0.3), tf(0.3, 0.78, 0.04));
  b.add(m.porcelain, new THREE.TorusGeometry(0.06, 0.012, 6, 14, PI * 1.2), tf(0.39, 1.0, 0.04, 0, 0, -PI * 0.6));
  b.add(m.wool, drapedCloth(0.35, 0.3, 0.3), tf(-0.5, 0.78, 0.1, PI / 2));
  // mirror on the wall above (bronze frame, silvered glass)
  b.push(tf(0, 1.6, -0.21, PI));
  frame(b, m, 0, 0, 0.02, 0.55, 0.7);
  b.add(x.mirror, new THREE.PlaneGeometry(0.55, 0.7), tf(0, 0, -0.03, PI), false);
  b.pop();
}

function stove(b: Batch, m: RoomMats, at: THREE.Vector3, wallX: number, wallH: number): void {
  b.push(tf(at.x, 0, at.z, -PI / 2));
  for (let k = 0; k < 4; k++) { const a = PI / 4 + k * PI / 2; b.add(m.iron, lathe([[0.03, 0], [0.05, 0.06], [0.03, 0.16]], 8, WS.iron), tf(Math.sin(a) * 0.28, 0, Math.cos(a) * 0.28)); }
  b.add(m.iron, lathe([[0.001, 0.16], [0.34, 0.16], [0.36, 0.2], [0.33, 0.24], [0.3, 0.6], [0.33, 0.66], [0.35, 0.7], [0.34, 0.74], [0.22, 0.86], [0.1, 0.92], [0.09, 1.0], [0.001, 1.0]], 24, WS.iron));
  b.add(m.brass, new THREE.TorusGeometry(0.335, 0.012, 6, 32).rotateX(PI / 2), tf(0, 0.68, 0));
  // grated door with glowing coals behind
  b.add(m.ember, new THREE.CircleGeometry(0.13, 20), tf(0, 0.42, 0.305), false);
  for (let k = -2; k <= 2; k++) b.add(m.iron, cyl(0.008, 0.008, 0.24, 4, WS.iron), tf(k * 0.045, 0.42, 0.31));
  b.add(m.iron, new THREE.TorusGeometry(0.135, 0.018, 6, 24), tf(0, 0.42, 0.31));
  // flue up and into the wall
  const pipeTop = wallH - 0.4;
  b.add(m.iron, cyl(0.075, 0.075, pipeTop - 1.0, 14, WS.iron), tf(0, 1.0 + (pipeTop - 1.0) / 2, 0));
  b.add(m.iron, cyl(0.075, 0.075, wallX - at.x + 0.2, 14, WS.iron).rotateX(PI / 2), tf(0, pipeTop, -(wallX - at.x + 0.2) / 2));
  b.add(m.iron, new THREE.SphereGeometry(0.078, 12, 8), tf(0, pipeTop, 0));
  // copper kettle on the hob
  b.add(m.brass, lathe([[0.001, 0], [0.09, 0], [0.11, 0.05], [0.1, 0.11], [0.05, 0.15], [0.03, 0.17], [0.001, 0.17]], 18, 0.3), tf(0.05, 1.0, 0));
  b.add(m.brass, tube([new THREE.Vector3(0.09, 0.06, 0), new THREE.Vector3(0.17, 0.1, 0), new THREE.Vector3(0.2, 0.16, 0)], 0.012, 10, 6), tf(0.05, 1.0, 0));
  b.pop();
}

function chandelier(b: Batch, m: RoomMats, candles: Candle[], x: number, top: number, z: number): void {
  const y = 2.75;
  b.add(m.iron, cyl(0.01, 0.01, top - y - 0.3, 6, WS.iron), tf(x, y + 0.3 + (top - y - 0.3) / 2, z));
  for (let k = 0; k < 3; k++) { const a = k * PI * 2 / 3; b.add(m.iron, tube([new THREE.Vector3(0, y + 0.32, 0), new THREE.Vector3(Math.sin(a) * 0.6, y, Math.cos(a) * 0.6)], 0.006, 4, 4), tf(x, 0, z)); }
  b.add(m.iron, new THREE.TorusGeometry(0.6, 0.022, 8, 48).rotateX(PI / 2), tf(x, y, z));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    const px = x + Math.sin(a) * 0.6, pz = z + Math.cos(a) * 0.6;
    b.add(m.iron, lathe([[0.001, 0], [0.035, 0], [0.04, 0.02], [0.015, 0.025]], 8, WS.iron), tf(px, y + 0.02, pz));
    const p = new THREE.Vector3(px, y + 0.045, pz).applyMatrix4(b.top);
    candles.push({ pos: p, h: 0.13 + 0.03 * Math.sin(k * 2.1), r: 0.014 });
  }
}

function writingDesk(b: Batch, m: RoomMats, candles: Candle[], rng: SeededRandom, F: THREE.Matrix4): void {
  // desk-local: room toward −z after the π turn → front at +z
  const w = 1.5, d = 0.62, h = 0.78;
  b.add(m.walnut, cbox(w, 0.05, d, 0.012, WS.walnut), tf(0, h, 0));
  for (const s of [-1, 1]) for (const e of [-1, 1]) b.add(m.walnut, legLathe(h - 0.03, 0.035), tf(s * (w / 2 - 0.07), 0, e * (d / 2 - 0.07)));
  b.add(m.walnut, cbox(w - 0.14, 0.12, d - 0.14, 0.008, WS.walnut), tf(0, h - 0.08, 0));
  b.add(m.leather, cbox(w * 0.6, 0.004, d * 0.55, 0.001, WS.leather), tf(0, h + 0.027, 0.05), false);
  const cs: Candle[] = [];
  candlestick(b, m, cs, -0.55, h + 0.025, -0.15, 0.2, true);
  for (const c of cs) candles.push(c);
  void F;
  parchments(b, m, 0.05, h + 0.025, 0.05, 3, rng, true);
  inkwell(b, m, 0.42, h + 0.025, -0.1, true);
  bookStack(b, m, 0.55, h + 0.025, 0.12, 3, rng, true);
  // crystal ball on a bronze stand
  b.add(m.bronze, lathe([[0.001, 0], [0.06, 0], [0.05, 0.03], [0.035, 0.05], [0.045, 0.06]], 12, WS.bronze), tf(-0.3, h + 0.025, 0.1));
  b.add(m.clearGlass, new THREE.SphereGeometry(0.075, 24, 16), tf(-0.3, h + 0.16, 0.1), false);
}

function robeGeometry(rng: SeededRandom): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.05, 0.26, 1.25, 20, 10, true, 0, PI * 1.3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const s = rng.range(0, 6);
  for (let k = 0; k < p.count; k++) {
    const px = p.getX(k), py = p.getY(k), pz = p.getZ(k);
    const a = Math.atan2(px, pz);
    const v = 0.5 - py / 1.25;
    const rr = 1 + 0.12 * Math.sin(a * 7 + s) * v;
    p.setXYZ(k, px * rr, py - 0.62, pz * rr * 0.45);
  }
  g.computeVertexNormals();
  return g.rotateY(PI * 0.35);
}

/** An original stylised tawny owl: soft brown body, pale facial disc, amber-lit eyes. */
function buildOwl(x: WingMats): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'owl';
  g.userData.keep = true;
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16).scale(1, 1.35, 0.95), x.owl);
  body.position.y = 0.15;
  const wingG = new THREE.SphereGeometry(0.08, 16, 10).scale(0.45, 1.3, 1.0);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(wingG, x.owl); w.position.set(s * 0.095, 0.15, 0.01); w.rotation.z = s * 0.12; g.add(w); }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8).scale(1, 1, 0.4), x.owl);
  tail.position.set(0, 0.02, 0.07); tail.rotation.x = -2.6;
  const head = new THREE.Group();
  head.name = 'owl-head';
  head.position.y = 0.31;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 16).scale(1.08, 0.92, 0.95), x.owl);
  head.add(skull);
  for (const s of [-1, 1]) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.045, 18), x.owlFace);
    disc.position.set(s * 0.038, 0.0, -0.083); disc.rotation.y = PI + s * 0.35;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 10), x.owlEye);
    eye.position.set(s * 0.036, 0.008, -0.088);
    head.add(disc, eye);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), x.owl);
    tuft.position.set(s * 0.06, 0.08, -0.01); tuft.rotation.z = -s * 0.5;
    head.add(tuft);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.035, 6).rotateX(PI / 2 + 0.6), x.owlFace);
  beak.position.set(0, -0.02, -0.095);
  head.add(beak);
  const feet = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6).scale(1.8, 0.5, 1), x.owlFace);
  feet.position.set(0, -0.01, -0.03);
  g.add(body, tail, head, feet);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}

// ---------------------------------------------------------------------------
// Canvas textures for the dorms
// ---------------------------------------------------------------------------

function paintQuilt(k: number): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const rng = new SeededRandom(`quilt-${k}`);
  const blues = k ? ['#1b3474', '#24448e', '#13285c', '#2e4f9a'] : ['#14306e', '#203d82', '#0f2252', '#3a5aa6'];
  const n = 8, s = 512 / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = rng.pick(blues); g.fillRect(x * s, y * s, s, s);
    if ((x + y + k) % 3 === 0) {
      g.fillStyle = BRONZE;
      g.beginPath(); g.moveTo(x * s + s / 2, y * s + 8); g.lineTo(x * s + s - 8, y * s + s / 2); g.lineTo(x * s + s / 2, y * s + s - 8); g.lineTo(x * s + 8, y * s + s / 2); g.closePath(); g.fill();
      g.fillStyle = rng.pick(blues); g.beginPath(); g.arc(x * s + s / 2, y * s + s / 2, s * 0.16, 0, PI * 2); g.fill();
    }
  }
  g.strokeStyle = 'rgba(226,176,106,0.55)'; g.setLineDash([4, 5]); g.lineWidth = 2;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 512); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(512, i * s); g.stroke(); }
  g.setLineDash([]);
  g.strokeStyle = BRONZE_HI; g.lineWidth = 14; g.strokeRect(7, 7, 498, 498);
  return canvasTexture(c);
}

function paintRug(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 1024);
  const rng = new SeededRandom('dorm-rug');
  g.fillStyle = '#122656'; g.fillRect(0, 0, 512, 1024);
  g.strokeStyle = BRONZE; g.lineWidth = 26; g.strokeRect(30, 30, 452, 964);
  g.strokeStyle = '#1e3a7e'; g.lineWidth = 10; g.strokeRect(62, 62, 388, 900);
  for (let i = 0; i < 9; i++) {
    const y = 140 + i * 95, x = 256;
    g.fillStyle = i % 2 ? BRONZE_HI : '#3a5aa6';
    g.beginPath(); g.moveTo(x, y - 34); g.lineTo(x + 34, y); g.lineTo(x, y + 34); g.lineTo(x - 34, y); g.closePath(); g.fill();
  }
  const img = g.getImageData(0, 0, 512, 1024);
  for (let i = 0; i < img.data.length; i += 4) { const n = (rng.next() - 0.5) * 18; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
  g.putImageData(img, 0, 0);
  void BLUE;
  return canvasTexture(c);
}

function paintFeathers(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const rng = new SeededRandom('owl-feathers');
  g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const x = rng.range(0, 256), y = rng.range(0, 256);
    g.fillStyle = rng.chance(0.5) ? `rgba(40,25,12,${rng.range(0.3, 0.7)})` : `rgba(200,170,120,${rng.range(0.2, 0.5)})`;
    g.beginPath(); g.ellipse(x, y, rng.range(2, 6), rng.range(1, 3), rng.range(-0.4, 0.4), 0, PI * 2); g.fill();
  }
  const t = canvasTexture(c, true, true);
  t.repeat.set(2, 2);
  return t;
}

function paintWicker(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8a6a3e'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) {
    g.fillStyle = ((x + y) / 16) % 2 ? '#a5834f' : '#6e522e';
    g.fillRect(x + 1, y + 2, 14, 12);
  }
  return canvasTexture(c, true, true);
}
