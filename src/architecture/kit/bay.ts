/**
 * Curved/bowed mullioned bay windows. Plan is a circular segment (chord =
 * width, sagitta = projection) divided into glazed facets with mullions at
 * each joint and wooden muntin bars; stone sill and head plates follow the
 * bow; an inside-out interior box gives a deep, warmly lit recess behind; a
 * panelled stallboard (ground floor) or carved corbels (upper floors) below.
 *
 * Local: centred on x = 0, facade plane z = 0, bay projects toward +Z,
 * y = 0 at the bottom of the stallboard / corbel line.
 */
import * as THREE from 'three';
import { GeometryBucket, chamferBox } from './geometry';

export interface BayOptions {
  width: number;
  /** Glazed height. */
  height: number;
  projection: number;
  /** Height of the glazing bottom above y = 0 (stallboard height); 0 for corbelled upper bays. */
  sill?: number;
  facets?: number;
  /** Panes per facet: [columns, rows]. */
  panes?: [number, number];
  frame: THREE.Material;
  muntin?: THREE.Material;
  glass: THREE.Material;
  stone: THREE.Material;
  interior: THREE.Material;
  interiorDepth?: number;
  corbels?: number;
  corbelMaterial?: THREE.Material;
}

export interface Bay {
  group: THREE.Group;
  /** Anchor on the display floor inside the bay (centre, at glazing-bottom height). */
  display: THREE.Object3D;
  /** Facade opening to cut (x0, y0, width, height), in bay-local coordinates. */
  hole: { x: number; y: number; width: number; height: number };
  /** Usable display footprint (half-width x, depth z from facade inward to glass). */
  displaySize: { halfWidth: number; depth: number; interiorDepth: number };
}

/** Plate covering the bay's plan segment (chord along z = 0), extruded vertically. */
export function bowPlate(width: number, projection: number, overhang: number, thickness: number, wallExtend = 0.08, segments = 24): THREE.BufferGeometry {
  const hw = width / 2;
  const R = (projection * projection + hw * hw) / (2 * projection);
  const zc = projection - R;
  const phi = Math.asin(hw / R);
  const s = new THREE.Shape();
  s.moveTo(-hw - overhang - wallExtend, 0);
  for (let i = 0; i <= segments; i++) {
    const a = -phi + (2 * phi * i) / segments;
    // Overhang grows the arc radially.
    const rr = R + overhang;
    s.lineTo(rr * Math.sin(a) + (i === 0 ? -overhang * 0.2 : i === segments ? overhang * 0.2 : 0), zc + rr * Math.cos(a));
  }
  s.lineTo(hw + overhang + wallExtend, 0);
  s.lineTo(-hw - overhang - wallExtend, 0);
  // Shape lives in XY with Y = plan z; extrude in Z, then rotate so the extrusion is vertical.
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 8 });
  g.rotateX(Math.PI / 2); // shape Y → +Z (outward), extrusion depth → −Y
  g.translate(0, thickness, 0);
  return g;
}

export function bowPoints(width: number, projection: number, n: number, inset = 0): THREE.Vector2[] {
  const hw = width / 2;
  const R = (projection * projection + hw * hw) / (2 * projection);
  const zc = projection - R;
  const phi = Math.asin(hw / R);
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -phi + (2 * phi * i) / n;
    pts.push(new THREE.Vector2((R - inset) * Math.sin(a), zc + (R - inset) * Math.cos(a)));
  }
  return pts;
}

/** Carved scroll corbel bracket: profile in the YZ plane, `depth` out from the wall, hanging below y = 0. */
export function corbelGeometry(depth: number, height: number, thickness = 0.11): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(depth, 0);
  s.lineTo(depth, -0.06);
  s.quadraticCurveTo(depth - 0.02, -0.14, depth - 0.1, -0.15);
  s.bezierCurveTo(depth * 0.45, -0.17, depth * 0.3, -height * 0.45, depth * 0.22, -height * 0.7);
  s.quadraticCurveTo(depth * 0.18, -height * 0.92, 0.08, -height * 0.95);
  s.lineTo(0, -height);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thickness, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -thickness / 2);
  g.rotateY(-Math.PI / 2); // shape X → +Z
  // volute boss at the bottom scroll
  const boss = new THREE.CylinderGeometry(0.05, 0.05, thickness + 0.02, 12).rotateZ(Math.PI / 2).translate(0, -height * 0.78, depth * 0.24);
  const parts = [g, boss].map((p) => (p.index ? p.toNonIndexed() : p));
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'uv'].includes(k)) p.deleteAttribute(k);
  const merged = new THREE.BufferGeometry();
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (const p of parts) {
    pos.push(...(p.getAttribute('position').array as Float32Array));
    nor.push(...(p.getAttribute('normal').array as Float32Array));
    uv.push(...(p.getAttribute('uv').array as Float32Array));
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return merged;
}

export function buildBayWindow(o: BayOptions): Bay {
  const group = new THREE.Group();
  group.name = 'bay-window';
  const b = new GeometryBucket();
  const n = o.facets ?? 5;
  const [cols, rows] = o.panes ?? [2, 3];
  const sill = o.sill ?? 0.6;
  const gy0 = sill, gy1 = sill + o.height;
  const muntin = o.muntin ?? o.frame;
  const outer = bowPoints(o.width, o.projection, n);
  const glassLine = bowPoints(o.width, o.projection, n, 0.03);

  // Sill (stone) + bottom rail; head plates as a stepped cornice
  b.add(o.stone, bowPlate(o.width, o.projection, 0.07, 0.08), new THREE.Matrix4().makeTranslation(0, gy0 - 0.08, 0));
  b.add(o.frame, bowPlate(o.width, o.projection, 0.015, 0.08, 0.02), new THREE.Matrix4().makeTranslation(0, gy1, 0));
  b.add(o.stone, bowPlate(o.width, o.projection, 0.08, 0.07), new THREE.Matrix4().makeTranslation(0, gy1 + 0.08, 0));
  b.add(o.stone, bowPlate(o.width, o.projection, 0.13, 0.06), new THREE.Matrix4().makeTranslation(0, gy1 + 0.15, 0));
  b.add(o.frame, bowPlate(o.width, o.projection, 0.05, 0.12), new THREE.Matrix4().makeTranslation(0, gy1 + 0.21, 0));

  // Facets: glass, muntins; mullions at joints
  for (let i = 0; i < n; i++) {
    const a = glassLine[i], c = glassLine[i + 1];
    const len = a.distanceTo(c);
    const yaw = Math.atan2(-(c.y - a.y), c.x - a.x);
    const mid = new THREE.Vector3((a.x + c.x) / 2, (gy0 + gy1) / 2, (a.y + c.y) / 2);
    const rot = new THREE.Euler(0, yaw, 0);
    const pane = new THREE.PlaneGeometry(len, o.height);
    pane.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)).translate(mid.x, mid.y, mid.z);
    // world-ish UVs so leaded glass reads at true scale
    const uv = pane.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * len / 0.6 + i * len / 0.6, uv.getY(k) * o.height / 0.6);
    b.add(o.glass, pane);
    for (let r = 1; r < rows; r++) {
      b.box(muntin, len, 0.03, 0.035, 0.006, { x: mid.x, y: gy0 + (o.height * r) / rows, z: mid.z }, rot);
    }
    for (let k = 1; k < cols; k++) {
      const t = k / cols;
      b.box(muntin, 0.028, o.height, 0.035, 0.006, { x: a.x + (c.x - a.x) * t, y: mid.y, z: a.y + (c.y - a.y) * t }, rot);
    }
  }
  outer.forEach((p, i) => {
    const t = i / n;
    const yaw = (t - 0.5) * -2 * Math.asin((o.width / 2) / ((o.projection ** 2 + (o.width / 2) ** 2) / (2 * o.projection)));
    b.box(o.frame, 0.075, o.height, 0.09, 0.012, { x: p.x * 0.985, y: (gy0 + gy1) / 2, z: p.y - 0.02 }, new THREE.Euler(0, yaw, 0));
  });

  // Stallboard (panelled base) or corbels
  if (sill > 0.15) {
    const base = bowPoints(o.width, o.projection, n, 0.02);
    for (let i = 0; i < n; i++) {
      const a = base[i], c = base[i + 1];
      const len = a.distanceTo(c);
      const yaw = Math.atan2(-(c.y - a.y), c.x - a.x);
      const rot = new THREE.Euler(0, yaw, 0);
      const mx = (a.x + c.x) / 2, mz = (a.y + c.y) / 2;
      b.box(o.frame, len + 0.02, gy0 - 0.08, 0.06, 0.01, { x: mx, y: (gy0 - 0.08) / 2, z: mz - 0.03 }, rot);
      // raised & fielded panel
      const nx = Math.sin(yaw) * 0, nz = 1;
      void nx; void nz;
      b.box(o.frame, len * 0.72, (gy0 - 0.08) * 0.6, 0.03, 0.012, { x: mx + Math.sin(-yaw) * 0, y: (gy0 - 0.08) / 2, z: mz + 0.005 }, rot);
    }
    b.add(o.stone, bowPlate(o.width, o.projection, 0.04, 0.06), new THREE.Matrix4()); // plinth step
  } else if ((o.corbels ?? 0) > 0) {
    const k = o.corbels!;
    for (let i = 0; i < k; i++) {
      const x = k === 1 ? 0 : -o.width * 0.36 + (o.width * 0.72 * i) / (k - 1);
      const hw = o.width / 2;
      const R = (o.projection ** 2 + hw ** 2) / (2 * o.projection);
      const depthAt = o.projection - R + Math.sqrt(Math.max(0, R * R - x * x));
      b.add(o.corbelMaterial ?? o.stone, corbelGeometry(Math.max(0.15, depthAt + 0.02), 0.7), new THREE.Matrix4().makeTranslation(x, gy0 - 0.08, 0));
    }
  }

  // Interior box (inside-out) behind the facade opening
  const D = o.interiorDepth ?? 1.2;
  const box = new THREE.BoxGeometry(o.width + 0.1, o.height + 0.32, D);
  box.translate(0, (gy0 + gy1) / 2 + 0.06, -D / 2 + 0.001);
  b.add(o.interior, box);

  group.add(b.build('bay'));
  const display = new THREE.Object3D();
  display.position.set(0, gy0, 0);
  display.name = 'bay-display';
  group.add(display);
  return {
    group,
    display,
    hole: { x: -o.width / 2, y: gy0 - 0.02, width: o.width, height: o.height + 0.24 },
    displaySize: { halfWidth: o.width / 2 - 0.12, depth: o.projection - 0.08, interiorDepth: D },
  };
}

/** A flat, recessed multi-pane shop window (no bow). Same contract as a Bay. */
export function buildFlatWindow(o: Omit<BayOptions, 'projection' | 'facets'> & { recess?: number }): Bay {
  const group = new THREE.Group();
  group.name = 'flat-window';
  const b = new GeometryBucket();
  const [cols, rows] = o.panes ?? [3, 3];
  const sill = o.sill ?? 0.6;
  const gy0 = sill, gy1 = sill + o.height;
  const z = -(o.recess ?? 0.08);
  const muntin = o.muntin ?? o.frame;
  const w = o.width;
  // frame
  b.box(o.frame, w, 0.09, 0.1, 0.012, { x: 0, y: gy1 + 0.045, z });
  b.box(o.frame, w, 0.07, 0.1, 0.012, { x: 0, y: gy0 - 0.035, z });
  for (const sx of [-1, 1]) b.box(o.frame, 0.08, o.height + 0.16, 0.1, 0.012, { x: sx * (w / 2 - 0.04), y: (gy0 + gy1) / 2, z });
  const pane = new THREE.PlaneGeometry(w - 0.16, o.height);
  const uv = pane.getAttribute('uv') as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w - 0.16) / 0.6, uv.getY(k) * o.height / 0.6);
  b.add(o.glass, pane, new THREE.Matrix4().makeTranslation(0, (gy0 + gy1) / 2, z - 0.02));
  for (let r = 1; r < rows; r++) b.box(muntin, w - 0.16, 0.03, 0.04, 0.006, { x: 0, y: gy0 + (o.height * r) / rows, z: z + 0.005 });
  for (let c = 1; c < cols; c++) b.box(muntin, 0.03, o.height, 0.04, 0.006, { x: -w / 2 + 0.08 + ((w - 0.16) * c) / cols, y: (gy0 + gy1) / 2, z: z + 0.005 });
  // protruding stone sill & stallboard
  b.box(o.stone, w + 0.16, 0.08, 0.22, 0.02, { x: 0, y: gy0 - 0.11, z: 0.04 });
  if (sill > 0.15) {
    b.box(o.frame, w, gy0 - 0.15, 0.06, 0.01, { x: 0, y: (gy0 - 0.15) / 2, z: -0.02 });
    for (let i = 0; i < Math.max(1, Math.round(w / 0.9)); i++) {
      const k = Math.max(1, Math.round(w / 0.9));
      b.box(o.frame, (w / k) * 0.72, (gy0 - 0.15) * 0.6, 0.03, 0.012, { x: -w / 2 + (w / k) * (i + 0.5), y: (gy0 - 0.15) / 2, z: 0.015 });
    }
  }
  const D = o.interiorDepth ?? 1.2;
  const box = new THREE.BoxGeometry(w + 0.1, o.height + 0.3, D);
  box.translate(0, (gy0 + gy1) / 2, -D / 2 + z);
  b.add(o.interior, box);
  group.add(b.build('flat-window'));
  const display = new THREE.Object3D();
  display.position.set(0, gy0, z - 0.05);
  group.add(display);
  return {
    group, display,
    hole: { x: -w / 2, y: gy0 - 0.08, width: w, height: o.height + 0.18 },
    displaySize: { halfWidth: w / 2 - 0.15, depth: 0.0, interiorDepth: D },
  };
}

// keep chamferBox import used for consumers of this module's API surface
export { chamferBox };
