/**
 * Geometry helpers for the tower room: a per-material batcher (one draw call
 * per material for all static joinery and masonry), lathe/sweep shortcuts,
 * pointed (Gothic) arch outlines and small shared types.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { normalizeForMerge, boxProjectUVs, chamferBox } from '../architecture/kit/geometry';

export { chamferBox, boxProjectUVs };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Build a transform matrix from position, Euler rotation (radians, YXZ) and scale. */
export function tf(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Collects geometry per material and merges into a handful of meshes. */
export class Batch {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly flags = new Map<THREE.Material, { cast: boolean; receive: boolean }>();
  /** Current parent transform (pushed/popped for nested assemblies). */
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];

  push(m: THREE.Matrix4): this {
    this.stack.push(new THREE.Matrix4().multiplyMatrices(this.top, m));
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  get top(): THREE.Matrix4 { return this.stack[this.stack.length - 1]; }

  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4, cast = true): this {
    const g = normalizeForMerge(geometry.clone());
    _m.copy(this.top);
    if (matrix) _m.multiply(matrix);
    g.applyMatrix4(_m);
    let list = this.parts.get(material);
    if (!list) this.parts.set(material, (list = []));
    list.push(g);
    const f = this.flags.get(material);
    if (!f) this.flags.set(material, { cast, receive: true });
    else f.cast ||= cast;
    return this;
  }

  build(name = 'batch'): THREE.Group {
    const out = new THREE.Group();
    out.name = name;
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      const f = this.flags.get(mat)!;
      mesh.castShadow = f.cast;
      mesh.receiveShadow = f.receive;
      mesh.name = `${name}:${mat.name}`;
      out.add(mesh);
    }
    this.parts.clear();
    return out;
  }
}

/** Lathe from [radius, height] pairs; UVs scaled to metres / worldSize. */
export function lathe(profile: readonly [number, number][], segments = 24, worldSize = 1, phiStart = 0, phiLength = Math.PI * 2): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  const g = new THREE.LatheGeometry(pts, segments, phiStart, phiLength);
  // Lathe UVs: u around (0..1), v along profile (0..1). Re-scale to metres.
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  const maxR = Math.max(...profile.map((p) => p[0]));
  const circ = maxR * phiLength;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / worldSize, uv.getY(i) * len / worldSize);
  return g;
}

/** Cylinder with metric UVs. */
export function cyl(rTop: number, rBot: number, h: number, seg = 16, worldSize = 1, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const circ = Math.max(rTop, rBot) * Math.PI * 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / worldSize, uv.getY(i) * h / worldSize);
  return g;
}

/** Chamfered box shortcut with UVs in the given world size. */
export function cbox(w: number, h: number, d: number, c = 0.01, worldSize = 1): THREE.BufferGeometry {
  return chamferBox(w, h, d, c, worldSize);
}

/** Smooth rounded box (cushions, mattress-like upholstery). */
export function softBox(w: number, h: number, d: number, round = 0.04, seg = 6, puff = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, seg, Math.max(2, seg >> 1), seg);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const hx = w / 2 - round, hy = h / 2 - round, hz = d / 2 - round;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    const n = v.clone().sub(c);
    const l = n.length();
    if (l > 1e-6) n.multiplyScalar(round / l);
    v.copy(c).add(n);
    if (puff) {
      const fx = 1 - (v.x / (w / 2)) ** 2, fz = 1 - (v.z / (d / 2)) ** 2;
      if (v.y > 0) v.y += puff * Math.max(0, fx) * Math.max(0, fz);
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  boxProjectUVs(g, 0.4);
  return g;
}

/**
 * Pointed (equilateral-ish) arch outline, centred on x = 0.
 * width w, springing height ys above y0, `sharp` = arc radius / width (0.5 = round, 1 = equilateral).
 */
export function archPoints(w: number, y0: number, ys: number, sharp = 0.85, seg = 14): THREE.Vector2[] {
  const hw = w / 2;
  const r = Math.max(hw, sharp * w);
  const pts: THREE.Vector2[] = [new THREE.Vector2(-hw, y0), new THREE.Vector2(hw, y0), new THREE.Vector2(hw, ys)];
  // Right arc centred at (hw - r, ys) from angle 0 up to apex at x = 0.
  const cR = hw - r;
  const aEnd = Math.acos(THREE.MathUtils.clamp((0 - cR) / r, -1, 1));
  for (let i = 1; i <= seg; i++) {
    const a = (i / seg) * aEnd;
    pts.push(new THREE.Vector2(cR + r * Math.cos(a), ys + r * Math.sin(a)));
  }
  // Left arc (mirror) from apex down to springing.
  for (let i = seg - 1; i >= 0; i--) {
    const a = (i / seg) * aEnd;
    pts.push(new THREE.Vector2(-(cR + r * Math.cos(a)), ys + r * Math.sin(a)));
  }
  return pts;
}

export function archApex(w: number, ys: number, sharp = 0.85): number {
  const hw = w / 2, r = Math.max(hw, sharp * w), cR = hw - r;
  return ys + Math.sqrt(Math.max(0, r * r - cR * cR));
}

/** Outline → THREE.Path (for shape holes). */
export function toPath(pts: THREE.Vector2[], reverse = false): THREE.Path {
  const p = new THREE.Path();
  const list = reverse ? [...pts].reverse() : pts;
  p.setFromPoints(list);
  p.closePath();
  return p;
}

/** Offset an arch outline outward by d (approximate, for architraves). */
export function archRing(w: number, y0: number, ys: number, d: number, sharp = 0.85): THREE.Shape {
  const outer = archPoints(w + 2 * d, y0, ys, (sharp * w + d) / (w + 2 * d));
  const inner = archPoints(w, y0 - 0.001, ys, sharp);
  // Open bottom: build as U-shaped polygon (outer up and over, inner back).
  const o = outer.slice(2).concat([]); // from right springing over to left springing
  const i = inner.slice(2);
  const shape = new THREE.Shape();
  shape.moveTo(w / 2 + d, y0);
  for (const p of o) shape.lineTo(p.x, p.y);
  shape.lineTo(-w / 2 - d, y0);
  shape.lineTo(-w / 2, y0);
  for (let k = i.length - 1; k >= 0; k--) shape.lineTo(i[k].x, i[k].y);
  shape.lineTo(w / 2, y0);
  shape.closePath();
  return shape;
}

/** Extrude a shape along +Z with an optional small bevel, UVs in metres / worldSize. */
export function extrude(shape: THREE.Shape, depth: number, bevel = 0, worldSize = 1, curveSegments = 12): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, curveSegments, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2,
  });
  const out = g.index ? g.toNonIndexed() : g;
  boxProjectUVs(out, worldSize);
  return out;
}

/** Curve sweep with a circular section (ropes, ribs, chandelier arms). */
export function tube(points: THREE.Vector3[], radius: number, tubular = 32, radial = 8, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed);
  return new THREE.TubeGeometry(curve, tubular, radius, radial, closed);
}

/** Plane with real normals (for decals, paintings, parchment). */
export function plane(w: number, h: number, sx = 1, sy = 1): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h, sx, sy);
}

export interface Circle { x: number; z: number; r: number }
export interface Rect { x: number; z: number; hw: number; hd: number; rot: number }

/** Simple deterministic hash for per-instance variety in shaders. */
export const fract = (x: number) => x - Math.floor(x);

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

export function canvasTexture(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
