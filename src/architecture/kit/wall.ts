/**
 * Wall builder for the architecture kit. A wall is a bevelled, extruded slab
 * with real holes; every opening gets a recessed timber frame, a protruding
 * stone sill, a lintel (or keystone for arches), and a filling: leaded
 * glazing, boards, a blind panel or a panelled door with a stone step.
 *
 * Local space: wall runs along +X from 0 to `length`, base at y = 0,
 * centred on z with the FRONT face at z = +thickness/2 (facing +Z).
 */
import * as THREE from 'three';
import { GeometryBucket, PROFILES, extrudeProfile, scaleUVs } from './geometry';

export type OpeningKind = 'window' | 'door' | 'blind' | 'boarded' | 'void';

export interface WallOpening {
  kind: OpeningKind;
  /** Left edge (m from wall start) and sill/threshold height. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rise of a segmental/round arch head (doors & voids only). */
  archRise?: number;
}

export interface WallMaterials {
  wall: THREE.Material;
  stone: THREE.Material;
  timber: THREE.Material;
  glass?: THREE.Material;
  door?: THREE.Material;
  iron?: THREE.Material;
}

export interface WallOptions {
  length: number;
  height: number;
  thickness?: number;
  /** worldSize of the wall material, for UV scale. */
  wallWorldSize?: number;
  openings?: readonly WallOpening[];
  plinth?: boolean;
  top?: 'coping' | 'cornice' | 'none';
  materials: WallMaterials;
  name?: string;
}

const RECESS = 0.11;   // frame set back from the wall face
const FRAME = 0.085;   // frame member face width

export function buildWall(o: WallOptions): THREE.Group {
  const t = o.thickness ?? 0.35;
  const L = o.length, H = o.height;
  const mats = o.materials;
  const openings = o.openings ?? [];
  const group = new THREE.Group();
  group.name = o.name ?? 'wall';

  // ---- Slab with holes ------------------------------------------------------
  const shape = new THREE.Shape();
  shape.moveTo(0, 0).lineTo(L, 0).lineTo(L, H).lineTo(0, H).lineTo(0, 0);
  for (const op of openings) shape.holes.push(openingPath(op));
  const slab = new THREE.ExtrudeGeometry(shape, {
    depth: t, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 16,
  });
  slab.translate(0, 0, -t / 2);
  scaleUVs(slab, 1 / (o.wallWorldSize ?? 1));
  const slabMesh = new THREE.Mesh(slab, mats.wall);
  slabMesh.castShadow = slabMesh.receiveShadow = true;
  slabMesh.name = `${group.name}:slab`;
  group.add(slabMesh);

  const b = new GeometryBucket();
  const faceZ = t / 2;

  // ---- Openings -------------------------------------------------------------
  for (const op of openings) {
    const { x, y, width: w, height: h } = op;
    const cx = x + w / 2;
    const rise = op.archRise ?? 0;
    const zf = faceZ - RECESS; // frame front plane

    if (op.kind !== 'void') {
      // Recessed frame: jambs + head (+ sill rail for windows)
      const jambH = h - rise;
      b.box(mats.timber, FRAME, jambH, 0.1, 0.012, { x: x + FRAME / 2, y: y + jambH / 2, z: zf - 0.05 });
      b.box(mats.timber, FRAME, jambH, 0.1, 0.012, { x: x + w - FRAME / 2, y: y + jambH / 2, z: zf - 0.05 });
      if (rise === 0) b.box(mats.timber, w, FRAME, 0.1, 0.012, { x: cx, y: y + h - FRAME / 2, z: zf - 0.05 });
      if (op.kind !== 'door') b.box(mats.timber, w, FRAME * 0.8, 0.1, 0.012, { x: cx, y: y + FRAME * 0.4, z: zf - 0.05 });
    }

    if (op.kind === 'window' || op.kind === 'boarded' || op.kind === 'blind') {
      // Protruding stone sill with a weathered top
      b.box(mats.stone, w + 0.2, 0.075, t / 2 + 0.08, 0.018, { x: cx, y: y - 0.0375, z: faceZ - t / 4 + 0.04 });
    }
    if (rise === 0) {
      // Lintel, slightly proud of the face
      b.box(mats.stone, w + 0.32, 0.2, t + 0.04, 0.02, { x: cx, y: y + h + 0.1, z: 0 });
    } else {
      // Keystone at the crown of the arch
      b.box(mats.stone, 0.2, 0.32, t + 0.05, 0.02, { x: cx, y: y + h + 0.06, z: 0 });
    }

    if (op.kind === 'window') {
      const glass = mats.glass ?? mats.timber;
      const gw = w - FRAME * 2, gh = h - FRAME * 1.8;
      const pane = new THREE.PlaneGeometry(gw, gh);
      b.add(glass, pane, new THREE.Matrix4().makeTranslation(cx, y + FRAME * 0.8 + gh / 2, zf - 0.06));
      // Mullion and transom
      if (w > 0.75) b.box(mats.timber, 0.06, gh, 0.08, 0.01, { x: cx, y: y + FRAME * 0.8 + gh / 2, z: zf - 0.05 });
      b.box(mats.timber, gw, 0.06, 0.08, 0.01, { x: cx, y: y + FRAME * 0.8 + gh * 0.68, z: zf - 0.05 });
    } else if (op.kind === 'boarded') {
      const n = Math.max(2, Math.round(w / 0.17));
      const bw = (w - FRAME * 2) / n;
      for (let i = 0; i < n; i++) {
        const tilt = ((i * 7919) % 13) / 13 - 0.5;
        b.box(mats.timber, bw - 0.012, h - FRAME * 2, 0.035, 0.006,
          { x: x + FRAME + bw * (i + 0.5), y: y + h / 2, z: zf - 0.03 }, new THREE.Euler(0, 0, tilt * 0.03));
      }
      // Diagonal batten
      const diag = Math.hypot(w - FRAME * 2, h - FRAME * 2);
      b.box(mats.timber, diag * 0.95, 0.09, 0.03, 0.006, { x: cx, y: y + h / 2, z: zf + 0.005 },
        new THREE.Euler(0, 0, Math.atan2(h - FRAME * 2, w - FRAME * 2)));
    } else if (op.kind === 'blind') {
      // Recessed back panel in the wall material
      const panel = new THREE.PlaneGeometry(w - FRAME * 2, h - FRAME * 2);
      scaleUVs(panel, w / (o.wallWorldSize ?? 1));
      b.add(mats.wall, panel, new THREE.Matrix4().makeTranslation(cx, y + h / 2, zf - 0.09));
    } else if (op.kind === 'door') {
      const door = mats.door ?? mats.timber;
      const dw = w - FRAME * 2, dh = h - FRAME;
      const zd = zf - 0.07;
      if (rise > 0) {
        const s = new THREE.Shape();
        s.moveTo(-dw / 2, 0).lineTo(dw / 2, 0).lineTo(dw / 2, dh - rise)
          .quadraticCurveTo(0, dh + rise, -dw / 2, dh - rise).lineTo(-dw / 2, 0);
        const leaf = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1 });
        b.add(door, leaf, new THREE.Matrix4().makeTranslation(cx, y, zd - 0.025));
      } else {
        b.box(door, dw, dh, 0.05, 0.008, { x: cx, y: y + dh / 2, z: zd });
      }
      // Raised panels (2 × 2)
      const pw = dw * 0.36, ph = (dh - rise) * 0.34;
      for (const px of [-1, 1]) for (const py of [0.3, 0.72]) {
        b.box(door, pw, ph, 0.02, 0.012, { x: cx + px * dw * 0.22, y: y + (dh - rise) * py, z: zd + 0.03 });
      }
      // Iron ring pull
      const ring = new THREE.TorusGeometry(0.06, 0.011, 6, 16);
      b.add(mats.iron ?? mats.timber, ring, new THREE.Matrix4().makeTranslation(cx + dw * 0.32, y + dh * 0.48, zd + 0.045));
      // Worn stone step
      b.box(mats.stone, w + 0.3, 0.16, 0.42, 0.025, { x: cx, y: y - 0.08, z: faceZ + 0.15 });
    }
  }

  // ---- Plinth (skipping door openings) ---------------------------------------
  if (o.plinth !== false) {
    const doors = openings.filter((op) => op.kind === 'door' || op.kind === 'void').map((op) => [op.x - 0.02, op.x + op.width + 0.02] as const)
      .sort((a, c) => a[0] - c[0]);
    let x0 = 0;
    const runs: [number, number][] = [];
    for (const [a, c] of doors) { if (a > x0) runs.push([x0, a]); x0 = Math.max(x0, c); }
    if (x0 < L) runs.push([x0, L]);
    for (const [a, c] of runs) {
      if (c - a < 0.05) continue;
      b.add(mats.stone, extrudeProfile(PROFILES.plinth(t), c - a), new THREE.Matrix4().makeTranslation(a, 0, 0));
    }
  }

  // ---- Top ------------------------------------------------------------------
  if ((o.top ?? 'coping') === 'coping') {
    b.add(mats.stone, extrudeProfile(PROFILES.coping(t), L + 0.1), new THREE.Matrix4().makeTranslation(-0.05, H, 0));
  } else if (o.top === 'cornice') {
    b.add(mats.stone, extrudeProfile(PROFILES.cornice(), L + 0.1), new THREE.Matrix4().makeTranslation(-0.05, H - 0.27, faceZ));
  }

  group.add(b.build(group.name));
  return group;
}

function openingPath(op: WallOpening): THREE.Path {
  const { x, y, width: w, height: h } = op;
  const rise = op.archRise ?? 0;
  const p = new THREE.Path();
  p.moveTo(x, y).lineTo(x + w, y);
  if (rise > 0) {
    p.lineTo(x + w, y + h - rise);
    if (Math.abs(rise - w / 2) < 1e-3) p.absarc(x + w / 2, y + h - rise, w / 2, 0, Math.PI, false);
    else p.quadraticCurveTo(x + w / 2, y + h + rise, x, y + h - rise);
  } else {
    p.lineTo(x + w, y + h).lineTo(x, y + h);
  }
  p.lineTo(x, y);
  return p;
}
