/**
 * Street-wide instance collector. Builders register repeated elements
 * (slates, chimney pots, books, jars, bulbs…) relative to an anchor Object3D —
 * typically a leaning storey group — and `finalize()` bakes them into one
 * InstancedMesh per (kind × 24 m spatial cell), so leaning/jettied buildings
 * still share draw calls while keeping frustum culling (CLAUDE.md rule 3).
 */
import * as THREE from 'three';

interface Kind {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  entries: { anchor: THREE.Object3D; local: THREE.Matrix4; color?: THREE.Color }[];
}

const CELL = 24;

export class InstanceCollector {
  private readonly kinds = new Map<string, Kind>();

  /** Declare a kind once (idempotent). */
  define(key: string, geometry: THREE.BufferGeometry, material: THREE.Material, castShadow = true): this {
    if (!this.kinds.has(key)) this.kinds.set(key, { geometry, material, castShadow, entries: [] });
    return this;
  }

  has(key: string): boolean { return this.kinds.has(key); }

  add(key: string, anchor: THREE.Object3D, local: THREE.Matrix4, color?: THREE.Color): void {
    const k = this.kinds.get(key);
    if (!k) throw new Error(`InstanceCollector: kind "${key}" not defined`);
    k.entries.push({ anchor, local: local.clone(), color: color?.clone() });
  }

  /** Convenience: compose position / euler / scale. */
  put(key: string, anchor: THREE.Object3D, pos: THREE.Vector3Like, rot: THREE.Euler | null, scale: THREE.Vector3Like, color?: THREE.Color): void {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos.x, pos.y, pos.z),
      new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()),
      new THREE.Vector3(scale.x, scale.y, scale.z),
    );
    this.add(key, anchor, m, color);
  }

  count(key?: string): number {
    if (key) return this.kinds.get(key)?.entries.length ?? 0;
    let n = 0;
    for (const k of this.kinds.values()) n += k.entries.length;
    return n;
  }

  /** Bake all instances in world space (anchors must already be placed in the scene). */
  finalize(root: THREE.Object3D): THREE.Group {
    root.updateMatrixWorld(true);
    const out = new THREE.Group();
    out.name = 'instanced-details';
    const m = new THREE.Matrix4();
    for (const [key, k] of this.kinds) {
      const cells = new Map<string, { mats: number[]; cols: number[] }>();
      for (const e of k.entries) {
        m.multiplyMatrices(e.anchor.matrixWorld, e.local);
        const x = m.elements[12], z = m.elements[14];
        const ck = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
        let c = cells.get(ck);
        if (!c) cells.set(ck, (c = { mats: [], cols: [] }));
        c.mats.push(...m.elements);
        const col = e.color ?? WHITE;
        c.cols.push(col.r, col.g, col.b);
      }
      for (const [ck, c] of cells) {
        const n = c.mats.length / 16;
        const mesh = new THREE.InstancedMesh(k.geometry, k.material, n);
        mesh.instanceMatrix.array.set(c.mats);
        mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(c.cols), 3);
        mesh.castShadow = k.castShadow;
        mesh.receiveShadow = true;
        mesh.name = `${key}@${ck}`;
        mesh.computeBoundingSphere();
        out.add(mesh);
      }
      k.entries.length = 0;
    }
    return out;
  }
}

const WHITE = new THREE.Color(1, 1, 1);
