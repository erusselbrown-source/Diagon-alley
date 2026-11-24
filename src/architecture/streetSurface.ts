/**
 * Street surface: crowned granite setts (instanced, chunked for frustum
 * culling), joint bed, sunken dished gutter stones, iron storm grates over
 * drain pits, stepped/uneven sandstone curbs, flagstone pavements, lane floors
 * (Y-branches, Knockturn) and shallow rain puddles.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/random';
import { createPuddleMaterial, withInstanceUvJitter, type MaterialLibrary, type PuddleMaterial } from '../materials';
import { chamferBox, normalizeForMerge, settGeometry } from './kit/geometry';
import {
  CURB_RISE, CURB_WIDTH, GUTTER_WIDTH, PAVEMENT_WIDTH, createFrame,
  type Frame, type LaneSpec, type StreetLayout,
} from './street';

export interface StreetSurface {
  group: THREE.Group;
  puddles: PuddleMaterial;
  stats: Record<string, number>;
  update(elapsed: number): void;
}

const SETT_ROW = 0.122;
const SETT_JOINT = 0.012;
const SETT_H = 0.1;
const CHUNK = 8; // metres of street per sett InstancedMesh (frustum culling granularity)

/** Accumulates instance transforms/colours, then emits an InstancedMesh. */
class InstanceBatch {
  readonly matrices: number[] = [];
  readonly colors: number[] = [];
  private readonly m = new THREE.Matrix4();

  add(p: THREE.Vector3, q: THREE.Quaternion, s: THREE.Vector3, c?: THREE.Color): void {
    this.m.compose(p, q, s);
    this.matrices.push(...this.m.elements);
    if (c) this.colors.push(c.r, c.g, c.b);
  }

  get count(): number { return this.matrices.length / 16; }

  build(geometry: THREE.BufferGeometry, material: THREE.Material, name: string, castShadow = true): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, this.count);
    mesh.instanceMatrix.array.set(this.matrices);
    mesh.instanceMatrix.needsUpdate = true;
    if (this.colors.length) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.colors), 3);
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.name = name;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/** Generic lane surface description for sett laying and bed building. */
interface PavedArea {
  name: string;
  frame(s: number, out: Frame): Frame;
  s0: number;
  s1: number;
  halfWidth(s: number): number;
  surfaceY(s: number, d: number): number;
  clip?(x: number, z: number): boolean;
  tint: number;
  bedDrop?: number;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _basis = new THREE.Matrix4();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

/**
 * Orientation with local X across the street (normal), Y up, Z = −tangent,
 * then pitched by the street grade, rolled by the cross slope and jittered.
 */
function streetQuat(f: Frame, crossSlope: number, out: THREE.Quaternion, jitter = { yaw: 0, roll: 0, pitch: 0 }): THREE.Quaternion {
  _X.set(f.nx, 0, f.nz);
  _Z.set(-f.tx, 0, -f.tz);
  _basis.makeBasis(_X, _Y, _Z);
  out.setFromRotationMatrix(_basis);
  out.multiply(_q2.setFromAxisAngle(AX, Math.atan(f.grade) + jitter.pitch));
  out.multiply(_q2.setFromAxisAngle(AZ, Math.atan(crossSlope) + jitter.roll));
  out.multiply(_q2.setFromAxisAngle(AY, jitter.yaw));
  return out;
}

const GRANITE_TONES = [
  new THREE.Color(1, 1, 1), new THREE.Color(1.08, 0.98, 0.95), new THREE.Color(0.92, 0.96, 1.06),
  new THREE.Color(0.8, 0.8, 0.82), new THREE.Color(1.05, 1.02, 0.96), new THREE.Color(0.7, 0.7, 0.72),
];

function laySetts(area: PavedArea, rng: SeededRandom, chunks: Map<string, InstanceBatch>): number {
  const f = createFrame();
  const p = new THREE.Vector3(), s3 = new THREE.Vector3(), c = new THREE.Color();
  let n = 0;
  for (let s = area.s0 + SETT_ROW / 2; s < area.s1; s += SETT_ROW) {
    area.frame(s, f);
    const hw = area.halfWidth(s);
    let d = -hw - rng.range(0, 0.22);
    const key = `${area.name}:${Math.floor((s - area.s0) / CHUNK)}`;
    let batch = chunks.get(key);
    if (!batch) chunks.set(key, (batch = new InstanceBatch()));
    while (d < hw) {
      const len = rng.range(0.17, 0.27);
      const a = Math.max(d, -hw), b = Math.min(d + len, hw);
      d += len;
      const L = b - a;
      if (L < 0.07) continue;
      const cx = (a + b) / 2;
      p.set(f.x + f.nx * cx, 0, f.z + f.nz * cx);
      if (area.clip?.(p.x, p.z)) continue;
      const y0 = area.surfaceY(s, cx);
      const slope = (area.surfaceY(s, cx + 0.05) - area.surfaceY(s, cx - 0.05)) / 0.1;
      const sunk = rng.chance(0.04) ? -0.014 : 0;
      p.y = y0 + rng.range(-0.008, 0.009) + sunk - SETT_H;
      streetQuat(f, slope, _q, { yaw: rng.range(-0.045, 0.045), roll: rng.range(-0.02, 0.02), pitch: rng.range(-0.02, 0.02) });
      s3.set(L - SETT_JOINT, SETT_H, SETT_ROW - SETT_JOINT);
      c.copy(rng.pick(GRANITE_TONES)).multiplyScalar(rng.range(0.82, 1.08) * area.tint);
      batch.add(p, _q, s3, c);
      n++;
    }
  }
  return n;
}

/** Ribbon of dark grit under the setts (shows in the joints). */
function bedGeometry(area: PavedArea, worldSize: number, extra = 0.03): THREE.BufferGeometry {
  const f = createFrame();
  const COLS = 14, STEP = 0.5;
  const rows = Math.ceil((area.s1 - area.s0) / STEP) + 1;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let r = 0; r < rows; r++) {
    const s = Math.min(area.s1, area.s0 + r * STEP);
    area.frame(s, f);
    const hw = area.halfWidth(s) + extra;
    for (let j = 0; j <= COLS; j++) {
      const d = -hw + (2 * hw * j) / COLS;
      const dc = Math.max(-hw + extra, Math.min(hw - extra, d));
      pos.push(f.x + f.nx * d, area.surfaceY(s, dc) - 0.022 - (area.bedDrop ?? 0), f.z + f.nz * d);
      uv.push(d / worldSize, s / worldSize);
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let j = 0; j < COLS; j++) {
    const a = r * (COLS + 1) + j, b = a + 1, c = a + COLS + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Ensure normals face up (winding depends on frame handedness).
  const nrm = g.getAttribute('normal');
  if (nrm.getY(0) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return normalizeForMerge(g);
}

/** Dished gutter stone: unit across (x) and along (z); y in metres (top edges at 0). */
function gutterGeometry(worldSize: number): THREE.BufferGeometry {
  const prof: [number, number][] = [
    [-0.5, -0.16], [-0.5, -0.008], [-0.47, 0], [-0.3, -0.022], [-0.15, -0.043], [0, -0.052],
    [0.15, -0.043], [0.3, -0.022], [0.47, 0], [0.5, -0.008], [0.5, -0.16],
  ];
  const pos: number[] = [], uv: number[] = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const [x0, y0] = prof[i], [x1, y1] = prof[i + 1];
    const quad = [[x0, y0, -0.5], [x1, y1, -0.5], [x1, y1, 0.5], [x0, y0, -0.5], [x1, y1, 0.5], [x0, y0, 0.5]];
    for (const [x, y, z] of quad) { pos.push(x, y, z); uv.push((x * 0.37) / worldSize, (z * 0.75) / worldSize); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // Faces should point up/outward; flip if needed.
  if (g.getAttribute('normal').getY(6) < 0) {
    const p = g.getAttribute('position') as THREE.BufferAttribute, u = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let t = 0; t < p.count; t += 3) {
      const [bx, by, bz, bu, bv] = [p.getX(t + 1), p.getY(t + 1), p.getZ(t + 1), u.getX(t + 1), u.getY(t + 1)];
      p.setXYZ(t + 1, p.getX(t + 2), p.getY(t + 2), p.getZ(t + 2)); u.setXY(t + 1, u.getX(t + 2), u.getY(t + 2));
      p.setXYZ(t + 2, bx, by, bz); u.setXY(t + 2, bu, bv);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** Cast-iron storm grate: frame + longitudinal bars + cross ties, top at y = 0. */
function grateGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, y: number, z: number) => { g.translate(x, y, z); parts.push(normalizeForMerge(g)); };
  const W = 0.34, L = 0.6, T = 0.035;
  put(chamferBox(0.03, T, L, 0.006), -W / 2 + 0.015, -T / 2, 0);
  put(chamferBox(0.03, T, L, 0.006), W / 2 - 0.015, -T / 2, 0);
  put(chamferBox(W, T, 0.03, 0.006), 0, -T / 2, -L / 2 + 0.015);
  put(chamferBox(W, T, 0.03, 0.006), 0, -T / 2, L / 2 - 0.015);
  for (let i = 1; i <= 6; i++) put(chamferBox(0.02, T * 0.9, L - 0.05, 0.004), -W / 2 + (W * i) / 7, -T / 2, 0);
  for (const z of [-0.1, 0.1]) put(chamferBox(W - 0.05, T * 0.6, 0.016, 0.004), 0, -T * 0.7, z);
  return mergeGeometries(parts)!;
}

export function buildStreetSurface(layout: StreetLayout, lib: MaterialLibrary): StreetSurface {
  const rng = new SeededRandom('diagon-alley:street-surface');
  const group = new THREE.Group();
  group.name = 'street-surface';
  const stats: Record<string, number> = {};

  const granite = withInstanceUvJitter(lib.get('granite'), 'sett');
  const sandstone = withInstanceUvJitter(lib.get('sandstone'), 'sandstone');
  const iron = withInstanceUvJitter(lib.get('iron'), 'grate');
  const gritMat = lib.get('grit');
  const ws = (id: 'granite' | 'sandstone' | 'grit') => lib.recipe(id).worldSize;

  // ---- Paved areas ----------------------------------------------------------
  const main: PavedArea = {
    name: 'main',
    frame: (s, out) => layout.frame(s, out),
    s0: 0, s1: layout.length,
    halfWidth: (s) => layout.pavedHalfWidth(s),
    surfaceY: (s, d) => layout.surfaceY(s, d),
    tint: 1,
  };
  const lanes: PavedArea[] = layout.lanes.map((lane: LaneSpec) => ({
    name: lane.name,
    frame: (s, out) => lane.sampler.frame(s, out),
    s0: lane.s0, s1: lane.s1,
    halfWidth: () => lane.halfWidth,
    surfaceY: (s, d) => lane.sampler.frame(s, createFrame()).y + lane.crown * (1 - Math.min(1, (d / lane.halfWidth) ** 2)),
    clip: lane.clip,
    tint: lane.tint,
    bedDrop: 0.004,
  }));

  // ---- Setts ----------------------------------------------------------------
  const chunks = new Map<string, InstanceBatch>();
  stats.setts = laySetts(main, rng, chunks);
  for (const lane of lanes) stats.setts += laySetts(lane, rng, chunks);
  const settGeo = settGeometry(0.25 / ws('granite'));
  const setts = new THREE.Group();
  setts.name = 'setts';
  for (const [key, batch] of chunks) if (batch.count) setts.add(batch.build(settGeo, granite, `setts:${key}`, false));
  group.add(setts);
  stats.settChunks = setts.children.length;

  // ---- Joint bed --------------------------------------------------------------
  // Bed stops at the sett edge: the dished gutter stones (with skirts) take over beyond it.
  const bed = new THREE.Mesh(mergeGeometries([bedGeometry(main, ws('grit'), 0.012), ...lanes.map((l) => bedGeometry(l.name === 'knockturn' ? { ...l, s0: layout.knockturn.gateS - 1.4 } : l, ws('grit')))])!, gritMat);
  bed.receiveShadow = true;
  bed.name = 'joint-bed';
  group.add(bed);

  // ---- Gutters, grates, curbs, pavements --------------------------------------
  const f = createFrame();
  const p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const gutters = new InstanceBatch(), grates = new InstanceBatch(), pits = new InstanceBatch();
  const curbs = new InstanceBatch(), flags = new InstanceBatch();
  const sEnd = layout.plazaS;
  const grateAt = (s: number, sign: number) => {
    // a grate every ~11 m, alternating sides, plus one at each gutter end
    const k = Math.round(s / 11);
    return (Math.abs(s - k * 11) < 0.38 && k > 0 && (k % 2 === 0) === (sign > 0)) || s > sEnd - 0.8;
  };

  for (const sign of [-1, 1]) {
    // Gutters
    let lastWasGrate = false;
    for (let s = 0.4; s < sEnd - 0.1; s += 0.75) {
      layout.frame(s, f);
      const dC = sign * (layout.pavedHalfWidth(s) + GUTTER_WIDTH / 2);
      p.set(f.x + f.nx * dC, layout.surfaceY(s, sign * layout.pavedHalfWidth(s)), f.z + f.nz * dC);
      streetQuat(f, 0, _q);
      if (grateAt(s, sign) && !lastWasGrate) {
        lastWasGrate = true;
        p.y -= 0.03;
        grates.add(p, _q, sc.set(1, 1, 1));
        pits.add(p, _q, sc.set(1, 1, 1));
        continue;
      }
      lastWasGrate = false;
      gutters.add(p, _q, sc.set(GUTTER_WIDTH - 0.01, 1, 0.74), col.setScalar(rng.range(0.85, 1.05)));
    }

    // Curbs: stepped, uneven sandstone blocks of varying length
    let s = 0;
    while (s < sEnd) {
      const len = Math.min(rng.range(0.6, 1.1), sEnd - s);
      if (len < 0.2) break;
      const sm = s + len / 2;
      layout.frame(sm, f);
      const dC = sign * (layout.carriageHalfWidth(sm) + CURB_WIDTH / 2);
      const top = f.y + CURB_RISE + rng.range(-0.022, 0.012);
      p.set(f.x + f.nx * dC, top - 0.17, f.z + f.nz * dC);
      streetQuat(f, 0, _q, { yaw: rng.range(-0.018, 0.018), roll: rng.range(-0.025, 0.025), pitch: rng.range(-0.012, 0.012) });
      _q.multiply(_q2.setFromAxisAngle(AY, Math.PI / 2)); // block length along the street
      curbs.add(p, _q, sc.set((len - 0.012) / 0.85, 1, 1), col.setScalar(rng.range(0.85, 1.08)));
      s += len;
    }
    // Curb end cap where the pavement stops at the plaza
    layout.frame(sEnd + 0.14, f);
    const dCap = sign * (layout.carriageHalfWidth(sEnd) + (CURB_WIDTH + PAVEMENT_WIDTH) / 2);
    p.set(f.x + f.nx * dCap, f.y + CURB_RISE - 0.17, f.z + f.nz * dCap);
    streetQuat(f, 0, _q);
    curbs.add(p, _q, sc.set((CURB_WIDTH + PAVEMENT_WIDTH) / 0.85, 1, 1), col.setScalar(0.95));

    // Pavement flags: two staggered columns, slightly uneven
    for (const colIdx of [0, 1]) {
      let s2 = colIdx * 0.3;
      while (s2 < sEnd) {
        const len = Math.min(rng.range(0.55, 0.9), sEnd - s2);
        if (len < 0.15) break;
        const sm = s2 + len / 2;
        layout.frame(sm, f);
        const d0 = layout.carriageHalfWidth(sm) + CURB_WIDTH;
        const dC = sign * (d0 + 0.25 + colIdx * 0.5);
        p.set(f.x + f.nx * dC, f.y + CURB_RISE - 0.004 + rng.range(-0.007, 0.007) - 0.04, f.z + f.nz * dC);
        streetQuat(f, 0, _q, { yaw: rng.range(-0.01, 0.01), roll: rng.range(-0.014, 0.014), pitch: rng.range(-0.014, 0.014) });
        flags.add(p, _q, sc.set(0.49, 1, len - 0.012), col.setScalar(rng.range(0.82, 1.06)));
        s2 += len;
      }
    }
  }

  const add = (mesh: THREE.Object3D) => { group.add(mesh); return mesh; };
  add(gutters.build(gutterGeometry(ws('granite')), granite, 'gutters', false));
  add(grates.build(grateGeometry(), iron, 'storm-grates'));
  const pitMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1, side: THREE.BackSide, map: gritMat.map, normalMap: gritMat.normalMap });
  const pitGeo = new THREE.BoxGeometry(0.34, 0.42, 0.6).translate(0, -0.21, 0);
  add(pits.build(pitGeo, pitMat, 'drain-pits', false));
  add(curbs.build(chamferBox(0.85, 0.34, CURB_WIDTH - 0.012, 0.03, ws('sandstone')), sandstone, 'curbs'));
  add(flags.build(chamferBox(1, 0.08, 1, 0.012, ws('sandstone')), sandstone, 'pavement-flags'));
  // Sub-base under the pavement flags so joints don't show the void.
  const paveBeds: THREE.BufferGeometry[] = [];
  for (const sign of [-1, 1]) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let rows = 0;
    for (let s = 0; s <= sEnd + 0.3; s += 0.5) {
      layout.frame(s, f);
      const dIn = layout.carriageHalfWidth(Math.min(s, sEnd)) + 0.02, dOut = layout.widthAtS(Math.min(s, sEnd)) / 2 + 0.3;
      for (const d of [dIn, dOut]) {
        pos.push(f.x + f.nx * sign * d, f.y + CURB_RISE - 0.05, f.z + f.nz * sign * d);
        uv.push(d / ws('grit'), s / ws('grit'));
      }
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) { const a2 = r * 2; idx.push(a2, a2 + 2, a2 + 1, a2 + 1, a2 + 2, a2 + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const ng = normalizeForMerge(g);
    const nrm = ng.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    paveBeds.push(ng);
  }
  const paveBed = new THREE.Mesh(mergeGeometries(paveBeds)!, gritMat);
  paveBed.material = gritMat.clone();
  (paveBed.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  paveBed.receiveShadow = true;
  paveBed.name = 'pavement-bed';
  group.add(paveBed);

  stats.gutters = gutters.count;
  stats.grates = grates.count;
  stats.curbs = curbs.count;
  stats.flags = flags.count;

  // ---- Puddles ------------------------------------------------------------------
  const puddles = createPuddleMaterial();
  const pieces: THREE.BufferGeometry[] = [];
  const withShape = (g: THREE.BufferGeometry, shape: number) => {
    const n = g.getAttribute('position').count;
    g.setAttribute('aShape', new THREE.Float32BufferAttribute(new Float32Array(n).fill(shape), 1));
    return g;
  };
  let puddleCount = 0;
  for (const dip of layout.dips) {
    const bottom = layout.surfaceY(dip.s, dip.d);
    let rim = Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      rim = Math.min(rim, layout.surfaceY(dip.s + Math.cos(a) * dip.r, dip.d + Math.sin(a) * dip.r));
    }
    const level = Math.min(rim - 0.004, bottom + 0.032);
    if (level - bottom < 0.008) continue;
    layout.frame(dip.s, f);
    const disc = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
    disc.scale(dip.r * 0.97, 1, dip.r * 0.97);
    disc.translate(f.x + f.nx * dip.d, level, f.z + f.nz * dip.d);
    pieces.push(withShape(normalizeForMerge(disc), 0));
    puddleCount++;
  }
  // Run-off water lying in the gutter dish
  for (const sign of [-1, 1]) {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let rows = 0;
    for (let s = 1; s < sEnd - 1; s += 0.5) {
      layout.frame(s, f);
      const dC = sign * (layout.pavedHalfWidth(s) + GUTTER_WIDTH / 2);
      const y = layout.surfaceY(s, sign * layout.pavedHalfWidth(s)) - 0.03;
      for (const e of [-1, 1]) {
        const d = dC + e * 0.15;
        pos.push(f.x + f.nx * d, y, f.z + f.nz * d);
        uv.push(s, e < 0 ? 0 : 1);
      }
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) { const a = r * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.getAttribute('normal').getY(0) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); }
    const ng = normalizeForMerge(g);
    // force flat up normals for water
    const nrm = ng.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    pieces.push(withShape(ng, 1));
  }
  const puddleMesh = new THREE.Mesh(mergeGeometries(pieces)!, puddles.material);
  puddleMesh.name = 'puddles';
  puddleMesh.renderOrder = 2;
  puddleMesh.receiveShadow = true;
  group.add(puddleMesh);
  stats.puddles = puddleCount;

  return { group, puddles, stats, update: (t) => puddles.update(t) };
}
