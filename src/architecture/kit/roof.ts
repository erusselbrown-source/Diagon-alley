/**
 * Steep pitched slate roofs: eaves (ridge parallel to the street) or front
 * gable. Individually laid instanced slates over a textured deck, lead ridge,
 * bargeboards, fascia, copper gutters, gabled dormers and clustered crooked
 * brick chimneys with terracotta pots that emit smoke.
 *
 * Local: footprint x ∈ [−w/2, w/2], z ∈ [−depth, 0] (front face at z = 0),
 * wall-plate at y = 0.
 */
import * as THREE from 'three';
import { GeometryBucket, chamferBox, extrudeProfile } from './geometry';
import { buildWall } from './wall';
import type { Kit } from './context';

export interface ChimneySpec {
  /** Across the frontage, metres from centre. */
  x: number;
  /** Fraction of depth from the front (0) to the back (1); default on the ridge. */
  zf?: number;
  flues?: number;
  height?: number;
}

export interface RoofSpec {
  kind: 'eaves' | 'gable';
  pitch?: number;
  overhang?: number;
  dormers?: number;
  chimneys?: ChimneySpec[];
  gutters?: boolean;
  /** Trim colour for fascia / bargeboards / dormer faces. */
  trim?: THREE.Material;
  /** Front gable infill (gable kind). */
  gableMaterial?: THREE.Material;
  gableWorldSize?: number;
  sideMaterial?: THREE.Material;
  sideWorldSize?: number;
  /** Decorative fretted bargeboards on the front gable. */
  fretwork?: boolean;
}

export interface Roof {
  group: THREE.Group;
  ridgeY: number;
  /** Gutter outlet points (roof-local) where downspouts should drop from. */
  outlets: THREE.Vector3[];
}

const SLATE_W = 0.3, SLATE_L = 0.46, SLATE_EXP = 0.2;

/** Ridge roll profile (lead). */
const RIDGE: [number, number][] = [[-0.11, -0.03], [0.11, -0.03], [0.08, 0.04], [0.04, 0.08], [0, 0.09], [-0.04, 0.08], [-0.08, 0.04]];

/** Half-round gutter shell profile. */
function gutterProfile(r = 0.075, t = 0.008): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) { const a = -(i / 12) * Math.PI; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  for (let i = 12; i >= 0; i--) { const a = -(i / 12) * Math.PI; pts.push([(r - t) * Math.cos(a), (r - t) * Math.sin(a)]); }
  return pts;
}

/** Lay instanced slates on a rectangular roof plane. */
function laySlates(
  kit: Kit, anchor: THREE.Object3D, origin: THREE.Vector3, along: THREE.Vector3, up: THREE.Vector3,
  n: THREE.Vector3, width: number, length: number, skip?: (u: number, v: number) => boolean,
): void {
  const X = new THREE.Vector3().crossVectors(n, up).normalize();
  const basis = new THREE.Matrix4().makeBasis(X, n, up);
  const qb = new THREE.Quaternion().setFromRotationMatrix(basis);
  const q = new THREE.Quaternion(), qj = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), col = new THREE.Color();
  const rng = kit.rng;
  let row = 0;
  for (let v = 0; v < length - SLATE_L * 0.5; v += SLATE_EXP, row++) {
    const off = row % 2 ? SLATE_W / 2 : 0;
    for (let u = -off; u < width; u += SLATE_W) {
      const uc = Math.min(width - 0.05, Math.max(0.05, u + SLATE_W / 2));
      const vc = v + SLATE_L / 2;
      if (skip?.(uc, v)) continue;
      const wScale = Math.min(u + SLATE_W, width) - Math.max(u, 0);
      if (wScale < 0.08) continue;
      p.copy(origin).addScaledVector(along, (Math.max(u, 0) + Math.min(u + SLATE_W, width)) / 2)
        .addScaledVector(up, vc + rng.range(-0.008, 0.008)).addScaledVector(n, 0.016 + rng.range(0, 0.004));
      e.set(0.028 + rng.range(-0.008, 0.012), rng.range(-0.02, 0.02), rng.range(-0.015, 0.015));
      q.copy(qb).multiply(qj.setFromEuler(e));
      col.setRGB(1, 1, 1).multiplyScalar(rng.range(0.78, 1.1));
      if (rng.chance(0.08)) col.multiply(new THREE.Color(1.05, 0.95, 1.1));
      kit.instances.add('slate', anchor, new THREE.Matrix4().compose(p, q, new THREE.Vector3((wScale - 0.008) / SLATE_W, 1, 1)), col);
    }
  }
}

function planeBox(b: GeometryBucket, mat: THREE.Material, center: THREE.Vector3, X: THREE.Vector3, Y: THREE.Vector3, sx: number, sy: number, sz: number, uvWorld: number): void {
  const Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  const m = new THREE.Matrix4().makeBasis(X, Y, Z).setPosition(center);
  b.add(mat, chamferBox(sx, sy, sz, Math.min(0.015, sy * 0.3), uvWorld), m);
}

export function buildRoof(kit: Kit, w: number, depth: number, spec: RoofSpec): Roof {
  const group = new THREE.Group();
  group.name = `roof-${spec.kind}`;
  const b = new GeometryBucket();
  const pitch = THREE.MathUtils.degToRad(spec.pitch ?? 50);
  const c = Math.cos(pitch), s = Math.sin(pitch), tp = Math.tan(pitch);
  const ov = spec.overhang ?? 0.32;
  const verge = 0.16;
  const M = kit.mats;
  const deck = M.get('slate');
  const lead = M.tinted('iron', 0x8a8e94, 'lead');
  const copper = M.get('copper');
  const trim = spec.trim ?? M.get('oak');
  const side = spec.sideMaterial ?? M.get('brick');
  const sideWS = spec.sideWorldSize ?? M.worldSize('brick');
  const outlets: THREE.Vector3[] = [];
  let ridgeY: number;

  if (spec.kind === 'eaves') {
    const a = depth / 2, zr = -depth / 2;
    ridgeY = a * tp;
    const L = (a + ov) / c;
    const span = w + verge * 2;
    for (const sideSign of [1, -1]) {
      // front (+1) / back (−1) planes
      const eave = new THREE.Vector3(-w / 2 - verge, -ov * tp, sideSign > 0 ? ov : -depth - ov);
      const up = new THREE.Vector3(0, s, -c * sideSign).normalize();
      const n = new THREE.Vector3(0, c, s * sideSign).normalize();
      const mid = eave.clone().addScaledVector(up, L / 2).add(new THREE.Vector3(w / 2 + verge, 0, 0)).addScaledVector(n, -0.03);
      planeBox(b, deck, mid, new THREE.Vector3(1, 0, 0), n, span, 0.06, L, M.worldSize('slate'));
      // fascia + gutter along the eave
      b.box(trim, span, 0.2, 0.04, 0.01, { x: 0, y: eave.y - 0.07, z: eave.z + sideSign * 0.02 });
      if (spec.gutters !== false) {
        b.add(copper, extrudeProfile(gutterProfile(), span), new THREE.Matrix4().makeTranslation(-span / 2, eave.y - 0.03, eave.z + sideSign * 0.11));
        if (sideSign > 0) outlets.push(new THREE.Vector3(-w / 2 + 0.22, eave.y - 0.1, eave.z + 0.11), new THREE.Vector3(w / 2 - 0.22, eave.y - 0.1, eave.z + 0.11));
      }
      if (sideSign > 0) {
        // Dormers on the street side
        const nd = spec.dormers ?? 0;
        const dw = 1.15, dh = 1.25;
        const rects: [number, number, number, number][] = [];
        for (let i = 0; i < nd; i++) {
          const uc = (span * (i + 1)) / (nd + 1);
          const vd = L * 0.28;
          const base = eave.clone().addScaledVector(up, vd);
          const x0 = -w / 2 - verge + uc;
          const face = spec.trim ?? M.get('plaster');
          const fw = buildWall({
            name: 'dormer-face', length: dw, height: dh, thickness: 0.1, wallWorldSize: 1, plinth: false, top: 'none',
            openings: [{ kind: 'window', x: 0.2, y: 0.16, width: dw - 0.4, height: dh - 0.38 }],
            materials: { wall: face, stone: M.get('oak'), timber: M.get('oak'), glass: M.get('glass') },
          });
          fw.position.set(x0 - dw / 2, base.y, base.z - 0.05);
          group.add(fw);
          const zBack = base.z - dh / tp;
          for (const sx of [-1, 1]) {
            const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, dh), new THREE.Vector2(base.z - zBack, dh)]);
            const g = new THREE.ExtrudeGeometry(tri, { depth: 0.07, bevelEnabled: false });
            g.rotateY(Math.PI / 2); // shape X → −Z
            b.add(face, g, new THREE.Matrix4().makeTranslation(x0 + sx * (dw / 2) - (sx > 0 ? 0.07 : 0), base.y, base.z - 0.1));
          }
          // dormer gable roof
          const rd = (dw / 2 + 0.1);
          const dl = rd / Math.cos(Math.PI / 4);
          const zb2 = base.z - (dh + rd) / tp;
          const zlen = base.z + 0.15 - zb2;
          for (const sx of [-1, 1]) {
            const X = new THREE.Vector3(sx * Math.SQRT1_2, -Math.SQRT1_2, 0);
            const Y = new THREE.Vector3(sx * Math.SQRT1_2, Math.SQRT1_2, 0);
            const center = new THREE.Vector3(x0 + sx * rd / 2, base.y + dh + rd / 2, base.z + 0.15 - zlen / 2).addScaledVector(Y, 0.02);
            planeBox(b, deck, center, X, Y, dl + 0.05, 0.05, zlen, 0.8);
          }
          b.add(lead, extrudeProfile(RIDGE, zlen).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(x0, base.y + dh + rd + 0.02, base.z + 0.15));
          b.box(trim, dw + 0.25, 0.14, 0.04, 0.01, { x: x0, y: base.y + dh + 0.02, z: base.z + 0.13 });
          rects.push([uc - dw / 2 - 0.12, uc + dw / 2 + 0.12, vd - 0.15, vd + (dh + rd) / s + 0.1]);
        }
        laySlates(kit, group, eave, new THREE.Vector3(1, 0, 0), up, n, span, L,
          (u, v) => rects.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v + SLATE_L > v0 && v < v1));
      }
      // verge bargeboards
      for (const sx of [-1, 1]) {
        planeBox(b, trim, eave.clone().addScaledVector(up, L / 2).add(new THREE.Vector3(w / 2 + verge + sx * (w / 2 + verge) - (w / 2 + verge), 0, 0)).addScaledVector(n, -0.08).setX(sx * (w / 2 + verge + 0.01)),
          new THREE.Vector3(1, 0, 0), n, 0.04, 0.24, L, 1);
      }
    }
    // gable end walls
    for (const sx of [-1, 1]) {
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(depth, 0), new THREE.Vector2(a, ridgeY)]);
      const g = new THREE.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false });
      g.rotateY(Math.PI / 2);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / sideWS, uv.getY(i) / sideWS);
      b.add(side, g, new THREE.Matrix4().makeTranslation(sx > 0 ? w / 2 - 0.3 : -w / 2, 0, 0));
    }
    b.add(lead, extrudeProfile(RIDGE, w + verge * 2), new THREE.Matrix4().makeTranslation(-w / 2 - verge, ridgeY - 0.01, zr));
  } else {
    // ---- Front gable ---------------------------------------------------------
    const a = w / 2;
    ridgeY = a * tp;
    const L = (a + ov) / c;
    const zFront = ov + 0.05, zBack = -depth - 0.25;
    const len = zFront - zBack;
    for (const sx of [-1, 1]) {
      const eave = new THREE.Vector3(sx * (a + ov), -ov * tp, zFront);
      const up = new THREE.Vector3(-sx * c, s, 0);
      const n = new THREE.Vector3(sx * s, c, 0);
      const mid = eave.clone().addScaledVector(up, L / 2).add(new THREE.Vector3(0, 0, -len / 2)).addScaledVector(n, -0.03);
      planeBox(b, deck, mid, new THREE.Vector3(-sx * c, s, 0).negate().multiplyScalar(-1), n, L, 0.06, len, M.worldSize('slate'));
      b.box(trim, 0.04, 0.2, len, 0.01, { x: eave.x + sx * 0.02, y: eave.y - 0.07, z: zFront - len / 2 });
      if (spec.gutters !== false) {
        b.add(copper, extrudeProfile(gutterProfile(), len).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(eave.x + sx * 0.11, eave.y - 0.03, zFront));
        outlets.push(new THREE.Vector3(eave.x + sx * 0.11, eave.y - 0.1, zFront - 0.25));
      }
      laySlates(kit, group, new THREE.Vector3(eave.x, eave.y, sx > 0 ? zBack : zFront), new THREE.Vector3(0, 0, sx > 0 ? 1 : -1), up, n, len, L);
    }
    b.add(lead, extrudeProfile(RIDGE, len).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, ridgeY - 0.01, zFront));
    // Front gable infill with an attic window
    const gm = spec.gableMaterial ?? side;
    const gws = spec.gableWorldSize ?? sideWS;
    const tri = new THREE.Shape([new THREE.Vector2(-a, 0), new THREE.Vector2(a, 0), new THREE.Vector2(0, ridgeY)]);
    const hole = new THREE.Path();
    const hw = Math.min(0.45, a * 0.3), hy = ridgeY * 0.3;
    hole.moveTo(-hw, hy).lineTo(hw, hy).lineTo(hw, hy + hw * 1.6).absarc(0, hy + hw * 1.6, hw, 0, Math.PI, false).lineTo(-hw, hy);
    tri.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
    g.translate(0, 0, -0.25);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / gws, uv.getY(i) / gws);
    b.add(gm, g);
    b.add(M.get('glass'), new THREE.PlaneGeometry(hw * 2, hw * 2.6), new THREE.Matrix4().makeTranslation(0, hy + hw * 1.3, -0.12));
    b.add(M.interior('plaster'), new THREE.BoxGeometry(hw * 2 + 0.1, hw * 2.8, 0.8).translate(0, hy + hw * 1.3, -0.55));
    b.box(M.get('sandstone'), hw * 2 + 0.2, 0.07, 0.2, 0.015, { x: 0, y: hy - 0.035, z: 0.04 });
    // back gable
    const back = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-a, 0), new THREE.Vector2(a, 0), new THREE.Vector2(0, ridgeY)]), { depth: 0.3, bevelEnabled: false });
    b.add(side, back, new THREE.Matrix4().makeTranslation(0, 0, -depth));
    // Fretted bargeboards + finial
    for (const sx of [-1, 1]) {
      const bl = L;
      const fret = new THREE.Shape();
      fret.moveTo(0, 0); fret.lineTo(bl, 0); fret.lineTo(bl, -0.12);
      const k = Math.max(4, Math.round(bl / 0.22));
      for (let i = k; i >= 0; i--) {
        const t = i / k;
        fret.lineTo(t * bl, -0.16 - (spec.fretwork !== false ? 0.07 * Math.abs(Math.sin(t * k * Math.PI)) : 0));
      }
      fret.lineTo(0, 0);
      const fg = new THREE.ExtrudeGeometry(fret, { depth: 0.035, bevelEnabled: false });
      const m = new THREE.Matrix4().makeTranslation(0, ridgeY + 0.02, zFront + 0.01)
        .multiply(new THREE.Matrix4().makeRotationZ(sx > 0 ? -pitch : Math.PI + pitch))
        .multiply(new THREE.Matrix4().makeScale(1, sx > 0 ? 1 : -1, 1));
      b.add(trim, fg, m);
    }
    const fin = new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.06, 0.08], [0.03, 0.18], [0.045, 0.24], [0.012, 0.42], [0, 0.48]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
    b.add(trim, fin, new THREE.Matrix4().makeTranslation(0, ridgeY - 0.05, zFront + 0.03));
  }

  // ---- Chimneys --------------------------------------------------------------
  const rng = kit.rng;
  for (const ch of spec.chimneys ?? []) {
    const flues = ch.flues ?? rng.int(2, 4);
    const H = ch.height ?? rng.range(1.1, 1.8);
    const cw = 0.28 + flues * 0.3, cd = 0.62;
    const zf = ch.zf ?? 0.5;
    const z = spec.kind === 'eaves' ? -depth * zf : -depth * zf;
    const yBase = spec.kind === 'eaves' ? ridgeY - 1.3 - Math.abs(zf - 0.5) * depth * tp : (ridgeY - Math.abs(ch.x) * tp) - 1.2;
    const stack = new THREE.Group();
    stack.position.set(ch.x, yBase, z);
    stack.rotation.set(rng.range(-0.06, 0.06), rng.range(-0.15, 0.15), rng.range(-0.07, 0.07));
    const sb = new GeometryBucket();
    const totalH = (ridgeY - yBase) + H;
    sb.box(M.get('brick'), cw, totalH, cd, 0.02, { x: 0, y: totalH / 2, z: 0 }, undefined, M.worldSize('brick'));
    sb.box(M.get('brick'), cw + 0.1, 0.08, cd + 0.1, 0.012, { x: 0, y: totalH - 0.26, z: 0 }, undefined, M.worldSize('brick'));
    sb.box(M.get('brick'), cw + 0.17, 0.08, cd + 0.17, 0.012, { x: 0, y: totalH - 0.18, z: 0 }, undefined, M.worldSize('brick'));
    sb.box(M.get('sandstone'), cw + 0.12, 0.08, cd + 0.12, 0.02, { x: 0, y: totalH - 0.1, z: 0 });
    stack.add(sb.build('chimney'));
    for (let f = 0; f < flues; f++) {
      const px = -cw / 2 + 0.29 + f * 0.3 - 0.15;
      const ph = rng.range(0.8, 1.35);
      kit.instances.put('chimney-pot', stack, { x: px + 0.15, y: totalH - 0.06, z: rng.range(-0.04, 0.04) },
        new THREE.Euler(rng.range(-0.06, 0.06), rng.range(0, 6), rng.range(-0.06, 0.06)), { x: 1, y: ph, z: 1 },
        new THREE.Color().setRGB(1, 1, 1).multiplyScalar(rng.range(0.75, 1.05)));
      if (rng.chance(0.75)) kit.smoke.push({ anchor: stack, local: new THREE.Vector3(px + 0.15, totalH - 0.06 + 0.5 * ph + 0.04, 0) });
    }
    group.add(stack);
  }

  group.add(b.build('roof'));
  return { group, ridgeY, outlets };
}
