/**
 * Street clutter & shop displays. Anything repeated (barrels, crates, books,
 * cauldrons, lanterns) MUST be an InstancedMesh.
 */
import * as THREE from 'three';

/** Helper: build an InstancedMesh from a list of transforms. */
export function instanceFrom(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  transforms: readonly THREE.Matrix4[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  transforms.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}
