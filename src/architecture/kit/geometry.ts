/**
 * Low-level geometry for the architecture kit. Everything here is bevelled —
 * no raw primitive boxes for architecture (CLAUDE.md rule 1).
 */
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Chamfered box centred at the origin: 44 flat-shaded triangles with a
 * 45° chamfer of size `c` on every edge. UVs are box-projected in metres
 * divided by `uvWorld` (a material's worldSize).
 */
export function chamferBox(w: number, h: number, d: number, c: number, uvWorld = 1): THREE.BufferGeometry {
  const cc = Math.min(c, w * 0.45, h * 0.45, d * 0.45);
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(
      new THREE.Vector3(sx * w / 2, sy * (h / 2 - cc), sz * (d / 2 - cc)),
      new THREE.Vector3(sx * (w / 2 - cc), sy * h / 2, sz * (d / 2 - cc)),
      new THREE.Vector3(sx * (w / 2 - cc), sy * (h / 2 - cc), sz * d / 2),
    );
  }
  const g = new ConvexGeometry(pts);
  boxProjectUVs(g, uvWorld);
  return g;
}

/** Box-projected UVs from positions (metres / worldSize), by dominant normal axis. */
export function boxProjectUVs(g: THREE.BufferGeometry, worldSize = 1): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u: number, v: number;
    if (ax >= ay && ax >= az) { u = z; v = y; }
    else if (ay >= az) { u = x; v = z; }
    else { u = x; v = y; }
    uv[i * 2] = u / worldSize;
    uv[i * 2 + 1] = v / worldSize;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Extrude a cross-section profile along +X from 0 to `length`.
 * Profile points are (z, y): z = outward from the wall face / across, y = up.
 * Points must describe a simple polygon (either winding).
 */
export function extrudeProfile(profile: readonly [number, number][], length: number, uvWorld = 1): THREE.BufferGeometry {
  // Shape lives in XY; ExtrudeGeometry extrudes along +Z. rotateY(+90°) maps
  // +Z → +X and shape X → −Z, so negate profile z to keep orientation.
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(-z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 4 });
  g.rotateY(Math.PI / 2);
  scaleUVs(g, 1 / uvWorld);
  return normalizeForMerge(g);
}

export function scaleUVs(g: THREE.BufferGeometry, k: number): THREE.BufferGeometry {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  uv.needsUpdate = true;
  return g;
}

/**
 * Replace zero-length / non-finite normals with a safe unit vector. Degenerate
 * (zero-area) triangles — e.g. from shapes closed by repeating their first
 * point — get zero normals from computeVertexNormals, and normalize(0) in a
 * fragment shader is NaN, which bloom then smears across the whole frame.
 */
export function sanitizeNormals(g: THREE.BufferGeometry): number {
  const n = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!n) return 0;
  let fixed = 0;
  for (let i = 0; i < n.count; i++) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const l = x * x + y * y + z * z;
    if (!(l > 1e-10) || !Number.isFinite(l)) { n.setXYZ(i, 0, 1, 0); fixed++; }
  }
  if (fixed) n.needsUpdate = true;
  return fixed;
}

/** Non-indexed, position/normal/uv only, no groups — safe for mergeGeometries. */
export function normalizeForMerge(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  }
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  if (!out.getAttribute('uv')) boxProjectUVs(out);
  sanitizeNormals(out);
  out.clearGroups();
  return out;
}

/**
 * Collects transformed geometry pieces per material and merges them into one
 * mesh each — keeps a richly detailed facade to a handful of draw calls.
 */
export class GeometryBucket {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(material: THREE.Material, geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): this {
    const g = normalizeForMerge(geometry.clone());
    if (matrix) g.applyMatrix4(matrix);
    let list = this.parts.get(material);
    if (!list) this.parts.set(material, (list = []));
    list.push(g);
    return this;
  }

  /** Convenience: add a chamfered box at a position (+ optional Euler rotation). */
  box(material: THREE.Material, w: number, h: number, d: number, c: number, pos: THREE.Vector3Like, rot?: THREE.Euler, uvWorld = 1): this {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos.x, pos.y, pos.z),
      new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()),
      new THREE.Vector3(1, 1, 1),
    );
    return this.add(material, chamferBox(w, h, d, c, uvWorld), m);
  }

  build(name = 'bucket'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = `${name}:${mat.name}`;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/** Cross-section profiles (z outward / across, y up), in metres. */
export const PROFILES = {
  /** Weathered stone coping with drips, centred on a wall of thickness t. */
  coping(t: number): [number, number][] {
    const hw = t / 2 + 0.05;
    return [[-hw, 0], [hw, 0], [hw, 0.06], [hw - 0.025, 0.085], [0, 0.15], [-hw + 0.025, 0.085], [-hw, 0.06]];
  },
  /** Protruding plinth course with a chamfered weathering top. */
  plinth(t: number, height = 0.36): [number, number][] {
    const hw = t / 2 + 0.045;
    return [[-hw, 0], [hw, 0], [hw, height - 0.06], [t / 2, height], [-t / 2, height], [-hw, height - 0.06]];
  },
  /** Ogee-ish eaves cornice projecting from a face at z = 0. */
  cornice(projection = 0.26): [number, number][] {
    const p = projection;
    return [[0, 0], [0.04 * p / 0.26, 0.025], [0.06 * p / 0.26, 0.07], [0.13 * p / 0.26, 0.11], [0.2 * p / 0.26, 0.13], [p, 0.19], [p, 0.27], [0, 0.27]];
  },
} as const;

/** Unit-height sett (granite cobble): short octagonal sides, bevelled top, domed cap. 24 tris. */
export function settGeometry(uvScale: number): THREE.BufferGeometry {
  // x = length (across street), z = width (along street), y ∈ [0.55, 1] (top at 1)
  const ring = (inset: number, y: number) => {
    const a = 0.5 - inset, c = 0.16; // chamfered-corner octagon
    return [
      [-a + c, -a], [a - c, -a], [a, -a + c], [a, a - c], [a - c, a], [-a + c, a], [-a, a - c], [-a, -a + c],
    ].map(([x, z]) => [x, y, z] as const);
  };
  const r0 = ring(0, 0.7), r1 = ring(0.11, 0.97);
  const verts: number[] = [];
  const quad = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) => verts.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    quad(r0[i], r0[j], r1[j], r1[i]);
  }
  // domed cap: centre slightly higher than the bevel ring
  const top = [0, 1.0, 0] as const;
  for (let i = 0; i < 8; i++) verts.push(...r1[i], ...r1[(i + 1) % 8], ...top);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  // Fix winding so faces point outward/up.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3(), M = new THREE.Vector3();
  for (let t = 0; t < p.count; t += 3) {
    A.fromBufferAttribute(p, t); B.fromBufferAttribute(p, t + 1); C.fromBufferAttribute(p, t + 2);
    N.subVectors(B, A).cross(M.subVectors(C, A));
    const centroid = M.copy(A).add(B).add(C).divideScalar(3).sub(new THREE.Vector3(0, 0.7, 0));
    if (N.dot(centroid) < 0) { p.setXYZ(t + 1, C.x, C.y, C.z); p.setXYZ(t + 2, B.x, B.y, B.z); }
  }
  g.computeVertexNormals();
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + 0.5) * uvScale; uv[i * 2 + 1] = (p.getZ(i) + 0.5) * uvScale; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Bake every plain (non-instanced) Mesh under `root` into one merged mesh per
 * material, in `root`'s local space. Instanced meshes, lights and anything
 * flagged `userData.keep` are left untouched. Cuts facade draw calls to a few.
 */
export function mergeStatic(root: THREE.Object3D, name = 'static'): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const victims: THREE.Mesh[] = [];
  const visit = (o: THREE.Object3D) => {
    if (o.userData.keep) return; // whole subtree stays dynamic (signs, animated parts)
    for (const c of o.children) visit(c);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    if ((m.material as THREE.Material).transparent) return;
    const g = normalizeForMerge(m.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    let list = buckets.get(m.material as THREE.Material);
    if (!list) buckets.set(m.material as THREE.Material, (list = []));
    list.push(g);
    victims.push(m);
  };
  visit(root);
  for (const v of victims) v.removeFromParent();
  const out = new THREE.Group();
  out.name = name;
  for (const [mat, list] of buckets) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.name = `${name}:${mat.name}`;
    out.add(mesh);
  }
  root.add(out);
  return out;
}

const NO_SHADOW = /^(interior|lettering|glass|puddle)/;

/**
 * Street-wide batching: bake every static mesh under `root` into world space
 * and merge per (material × cell), cutting draw calls across neighbouring
 * buildings while keeping coarse frustum culling. Dynamic subtrees
 * (`userData.keep`) and InstancedMeshes are untouched. Interiors, glass and
 * lettering are set not to cast shadows.
 */
export function mergeByCell(root: THREE.Object3D, cell = 24, name = 'batched'): THREE.Group {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const victims: THREE.Mesh[] = [];
  const box = new THREE.Box3(), c = new THREE.Vector3();
  const visit = (o: THREE.Object3D) => {
    if (o.userData.keep) return;
    for (const ch of o.children) visit(ch);
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    const mat = m.material as THREE.Material;
    if (mat.transparent) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld).getCenter(c);
    const key = `${mat.uuid}|${Math.floor(c.x / cell)},${Math.floor(c.z / cell)}`;
    let bk = buckets.get(key);
    if (!bk) buckets.set(key, (bk = { mat, geos: [] }));
    const g = normalizeForMerge(m.geometry.clone());
    g.applyMatrix4(m.matrixWorld);
    bk.geos.push(g);
    victims.push(m);
  };
  visit(root);
  for (const v of victims) v.removeFromParent();
  const out = new THREE.Group();
  out.name = name;
  for (const [key, bk] of buckets) {
    const merged = mergeGeometries(bk.geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, bk.mat);
    mesh.castShadow = !NO_SHADOW.test(bk.mat.name);
    mesh.receiveShadow = true;
    mesh.name = `${name}:${bk.mat.name}@${key.split('|')[1]}`;
    out.add(mesh);
  }
  return out;
}
