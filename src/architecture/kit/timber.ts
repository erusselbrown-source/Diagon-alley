/** Timber framing (Tudor half-timbering, bressumers, posts) as one InstancedMesh. */
import * as THREE from 'three';
import { chamferBox } from './geometry';

export interface Beam {
  /** Start/end of the beam centreline in the wall plane (x, y). */
  a: [number, number];
  b: [number, number];
  /** Section: width in the wall plane, depth out of the wall. */
  width?: number;
  depth?: number;
}

/**
 * Builds every beam as an instance of one chamfered unit box.
 * Beams lie in the XY plane with their back face at z = 0, projecting to +z.
 */
export function buildTimberFrame(beams: readonly Beam[], material: THREE.Material, z = 0): THREE.InstancedMesh {
  const unit = chamferBox(1, 1, 1, 0.08);
  const mesh = new THREE.InstancedMesh(unit, material, beams.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  beams.forEach((bm, i) => {
    const w = bm.width ?? 0.2, d = bm.depth ?? 0.12;
    const dx = bm.b[0] - bm.a[0], dy = bm.b[1] - bm.a[1];
    const len = Math.hypot(dx, dy);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, dx));
    p.set((bm.a[0] + bm.b[0]) / 2, (bm.a[1] + bm.b[1]) / 2, z + d / 2);
    s.set(len + w * 0.5, w, d);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}
