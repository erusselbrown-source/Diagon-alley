/**
 * Panelled Victorian shop door: pilasters with capitals, entablature/cornice,
 * glazed transom (rectangular or fanlight), six-panel leaf (optionally glazed
 * upper), brass knocker / knob / letter plate / kick plate, deep reveal, and
 * a worn stone threshold step.
 *
 * Local: centred on x = 0, facade plane z = 0 (facing +Z), y = 0 at pavement.
 */
import * as THREE from 'three';
import { GeometryBucket, PROFILES, chamferBox, extrudeProfile } from './geometry';

export interface DoorOptions {
  width?: number;
  height?: number;
  /** Threshold (floor) height above the pavement. */
  floor?: number;
  transom?: number;
  fanlight?: boolean;
  glazedUpper?: boolean;
  recess?: number;
  leaf: THREE.Material;
  frame: THREE.Material;
  stone: THREE.Material;
  brass: THREE.Material;
  glass: THREE.Material;
  interior: THREE.Material;
  /** Build the leaf as two hinged halves (double doors that swing inward) and leave the doorway open behind. */
  openable?: boolean;
}

export interface Door {
  group: THREE.Group;
  hole: { x: number; y: number; width: number; height: number };
  width: number;
  floor: number;
  /** Openable doors: hinge pivots [left, right] (rotate +θ / −θ about Y to swing inward). */
  leaves?: THREE.Object3D[];
}

export function buildDoor(o: DoorOptions): Door {
  const W = o.width ?? 1.0, H = o.height ?? 2.2, F = o.floor ?? 0.16, T = o.transom ?? 0.42;
  const R = o.recess ?? 0.22;
  const group = new THREE.Group();
  group.name = 'door';
  const b = new GeometryBucket();
  const top = F + H + T;

  // Worn threshold: stone block from pavement to floor, top dished by wear.
  const sill = chamferBox(W + 0.12, F, R + 0.1, 0.02, 0.8);
  const p = sill.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > F / 2 - 0.001) {
      const x = p.getX(i) / (W / 2), z = p.getZ(i) / ((R + 0.1) / 2);
      p.setY(i, p.getY(i) - 0.018 * Math.max(0, 1 - x * x) * Math.max(0, 1 - z * z * 0.6));
    }
  }
  sill.computeVertexNormals();
  b.add(o.stone, sill, new THREE.Matrix4().makeTranslation(0, F / 2, -R / 2 + 0.05));

  // Reveal linings (panelled) and soffit
  for (const sx of [-1, 1]) {
    b.box(o.frame, 0.04, H + T, R, 0.008, { x: sx * (W / 2 + 0.02), y: F + (H + T) / 2, z: -R / 2 });
    b.box(o.frame, 0.015, H * 0.35, R * 0.7, 0.006, { x: sx * (W / 2 - 0.0), y: F + H * 0.3, z: -R / 2 });
  }
  b.box(o.frame, W + 0.08, 0.04, R, 0.008, { x: 0, y: top + 0.02, z: -R / 2 });

  // Leaf at the back of the recess
  const zL = -R + 0.03;
  const glazed = o.glazedUpper ?? false;
  const pw = (W - 0.22) / 2;
  const rowsY = [0.18, 0.5, 0.8];
  // One bucket for a fixed leaf, or one per hinged half (left: x < 0, right: x ≥ 0).
  const halves = o.openable ? [new GeometryBucket(), new GeometryBucket()] : null;
  const lb = (x: number) => (halves ? halves[x < 0 ? 0 : 1] : b);
  if (halves) {
    for (const sx of [-1, 1]) {
      lb(sx).box(o.leaf, W / 2 - 0.015, H, 0.05, 0.008, { x: sx * (W / 4), y: F + H / 2, z: zL });
      lb(sx).box(o.leaf, 0.06, H, 0.065, 0.01, { x: sx * 0.03, y: F + H / 2, z: zL + 0.005 }); // meeting stiles
    }
  } else b.box(o.leaf, W - 0.02, H, 0.05, 0.008, { x: 0, y: F + H / 2, z: zL });
  rowsY.forEach((ry, ri) => {
    const ph = ri === 1 ? H * 0.16 : H * 0.26;
    for (const sx of [-1, 1]) {
      const px = sx * (pw / 2 + 0.04);
      if (glazed && ri === 2) {
        lb(px).add(o.glass, new THREE.PlaneGeometry(pw, ph), new THREE.Matrix4().makeTranslation(px, F + H * ry, zL + 0.03));
      } else {
        lb(px).box(o.leaf, pw, ph, 0.025, 0.014, { x: px, y: F + H * ry, z: zL + 0.035 });
        lb(px).box(o.leaf, pw * 0.7, ph * 0.7, 0.02, 0.01, { x: px, y: F + H * ry, z: zL + 0.05 });
        if (halves) { // panels on the inside face too
          lb(px).box(o.leaf, pw, ph, 0.025, 0.014, { x: px, y: F + H * ry, z: zL - 0.035 });
          lb(px).box(o.leaf, pw * 0.7, ph * 0.7, 0.02, 0.01, { x: px, y: F + H * ry, z: zL - 0.05 });
        }
      }
    }
  });
  // Brass furniture
  const kx = halves ? 0.11 : 0;
  lb(kx).add(o.brass, new THREE.TorusGeometry(0.075, 0.013, 8, 20), new THREE.Matrix4().makeTranslation(kx, F + H * 0.66, zL + 0.07));
  lb(kx).add(o.brass, new THREE.SphereGeometry(0.045, 12, 8), new THREE.Matrix4().makeTranslation(kx, F + H * 0.66 + 0.08, zL + 0.06));
  lb(kx).box(o.brass, 0.1, 0.04, 0.02, 0.005, { x: kx, y: F + H * 0.66 + 0.1, z: zL + 0.04 });
  for (const sx of halves ? [-1, 1] : [1]) {
    const x = halves ? sx * 0.1 : W / 2 - 0.12;
    lb(x).add(o.brass, new THREE.SphereGeometry(0.035, 12, 8), new THREE.Matrix4().makeTranslation(x, F + H * 0.47, zL + 0.07));
    if (halves) lb(x).add(o.brass, new THREE.SphereGeometry(0.035, 12, 8), new THREE.Matrix4().makeTranslation(x, F + H * 0.47, zL - 0.07));
  }
  const lx = halves ? -W / 4 : 0;
  lb(lx).box(o.brass, 0.28, 0.07, 0.012, 0.004, { x: lx, y: F + H * 0.42, z: zL + 0.035 });
  if (halves) for (const sx of [-1, 1]) lb(sx).box(o.brass, W / 2 - 0.08, 0.16, 0.008, 0.003, { x: sx * W / 4, y: F + 0.1, z: zL + 0.03 });
  else b.box(o.brass, W - 0.1, 0.16, 0.008, 0.003, { x: 0, y: F + 0.1, z: zL + 0.03 });

  // Transom / fanlight with glazing bars
  const ty = F + H + 0.05;
  b.box(o.frame, W + 0.04, 0.07, 0.09, 0.01, { x: 0, y: ty, z: zL });
  if (o.fanlight) {
    const s = new THREE.Shape();
    s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.absellipse(0, 0, W / 2, T - 0.08, 0, Math.PI, false); s.lineTo(-W / 2, 0);
    b.add(o.glass, new THREE.ShapeGeometry(s, 24), new THREE.Matrix4().makeTranslation(0, ty + 0.035, zL));
    for (let i = 1; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      b.box(o.frame, 0.02, T - 0.1, 0.03, 0.004, { x: Math.cos(a) * (W / 4), y: ty + 0.035 + Math.sin(a) * (T - 0.08) / 2, z: zL + 0.01 }, new THREE.Euler(0, 0, a - Math.PI / 2));
    }
  } else {
    b.add(o.glass, new THREE.PlaneGeometry(W, T - 0.1), new THREE.Matrix4().makeTranslation(0, ty + T / 2, zL));
    for (let i = 1; i < 4; i++) b.box(o.frame, 0.022, T - 0.1, 0.03, 0.004, { x: -W / 2 + (W * i) / 4, y: ty + T / 2, z: zL + 0.01 });
  }
  // A glimpse of the lit interior behind the transom (a real interior replaces it for openable doors)
  if (!o.openable) {
    const ib = new THREE.BoxGeometry(W + 0.1, H + T, 0.9).translate(0, F + (H + T) / 2, zL - 0.47);
    b.add(o.interior, ib);
  }

  // Surround: pilasters, capitals, entablature
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.11);
    b.box(o.frame, 0.16, H + T - 0.15, 0.08, 0.014, { x, y: (H + T - 0.15) / 2 + 0.02, z: 0.03 });
    b.box(o.frame, 0.1, H * 0.7, 0.03, 0.01, { x, y: H * 0.45, z: 0.075 }); // fluting panel
    b.box(o.frame, 0.22, 0.1, 0.12, 0.02, { x, y: H + T - 0.08, z: 0.05 }); // capital
    b.box(o.stone, 0.22, 0.12, 0.14, 0.02, { x, y: 0.06, z: 0.05 }); // plinth block
  }
  b.box(o.frame, W + 0.5, 0.16, 0.1, 0.015, { x: 0, y: top + 0.08, z: 0.04 });
  b.add(o.frame, extrudeProfile(PROFILES.cornice(0.16), W + 0.62), new THREE.Matrix4().makeTranslation(-(W + 0.62) / 2, top + 0.16, 0));

  group.add(b.build('door'));
  let leaves: THREE.Object3D[] | undefined;
  if (halves) {
    leaves = halves.map((hb, i) => {
      const hingeX = (i === 0 ? -1 : 1) * (W / 2 - 0.01);
      const pivot = new THREE.Group();
      pivot.name = `door-leaf-${i ? 'r' : 'l'}`;
      pivot.userData.keep = true;
      pivot.position.set(hingeX, 0, zL);
      const m = hb.build(`door-leaf-${i}`);
      m.position.set(-hingeX, 0, -zL);
      pivot.add(m);
      group.add(pivot);
      return pivot;
    });
  }
  return {
    group,
    leaves,
    width: W,
    floor: F,
    hole: { x: -W / 2 - 0.02, y: 0, width: W + 0.04, height: top + 0.04 },
  };
}
