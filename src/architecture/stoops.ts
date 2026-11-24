/**
 * Crooked sandstone stoops (1–3 worn steps) against the building line, where
 * future shop doors will sit. All steps share one InstancedMesh.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import { withInstanceUvJitter, type MaterialLibrary } from '../materials';
import { chamferBox } from './kit/geometry';
import type { StreetLayout } from './street';

export const STEP_RISE = 0.16;
export const STEP_TREAD = 0.32;

export function buildStoops(layout: StreetLayout, lib: MaterialLibrary): THREE.InstancedMesh {
  const mats: THREE.Matrix4[] = [];
  const unit = chamferBox(1, 1, 1, 0.035, lib.recipe('sandstone').worldSize);
  for (const st of layout.stoops) {
    const rng = new SeededRandom(`stoop:${st.seed}`);
    const tr = layout.getStreetTransform(st.s / layout.length, st.side, 0);
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.012, 0.012), rng.range(-0.07, 0.07), rng.range(-0.015, 0.015)));
    const base = new THREE.Matrix4().compose(tr.position, tr.quaternion.clone().multiply(lean), new THREE.Vector3(1, 1, 1));
    for (let k = 0; k < st.steps; k++) {
      // k = 0 is the top step against the wall; each lower step reaches further out.
      const top = (st.steps - k) * STEP_RISE + rng.range(-0.012, 0.008);
      const w = st.width - k * 0.04 + rng.range(-0.04, 0.04) + (st.steps - 1 - k) * 0.06;
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(rng.range(-0.025, 0.025), top / 2 - 0.02, (k + 0.5) * STEP_TREAD + rng.range(-0.01, 0.01)),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.02, 0.02), rng.range(-0.035, 0.035), rng.range(-0.025, 0.025))),
        new THREE.Vector3(w, top + 0.02, STEP_TREAD + (k === 0 ? 0.05 : 0.012)),
      );
      mats.push(base.clone().multiply(local));
    }
  }
  const mesh = new THREE.InstancedMesh(unit, withInstanceUvJitter(lib.get('sandstone'), 'stoop'), mats.length);
  mats.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'stoops';
  mesh.computeBoundingSphere();
  return mesh;
}
