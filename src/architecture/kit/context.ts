/** Shared build context for the architecture kit. */
import * as THREE from 'three';
import { SeededRandom } from '../../core/random';
import type { MaterialLibrary } from '../../materials';
import { InstanceCollector } from './instances';
import { KitMaterials } from './materials';

export interface SmokeEmitter { anchor: THREE.Object3D; local: THREE.Vector3 }
export interface Animator { update(dt: number, elapsed: number): void }

export class Kit {
  readonly mats: KitMaterials;
  readonly instances = new InstanceCollector();
  readonly smoke: SmokeEmitter[] = [];
  readonly animators: Animator[] = [];
  rng: SeededRandom;

  constructor(readonly lib: MaterialLibrary, readonly seed = 'diagon-alley:kit') {
    this.mats = new KitMaterials(lib);
    this.rng = new SeededRandom(seed);
    const M = this.mats;
    this.instances.define('slate', new THREE.BoxGeometry(0.3, 0.012, 0.46).toNonIndexed(), M.jitter('slate-tile'), false);
    const terracotta = M.tinted('sandstone', 0xe0956a, 'terracotta');
    const pot = new THREE.LatheGeometry(
      [[0, 0], [0.13, 0], [0.135, 0.06], [0.115, 0.1], [0.1, 0.3], [0.11, 0.42], [0.125, 0.45], [0.125, 0.5], [0.09, 0.5], [0.08, 0.46], [0.0, 0.46]]
        .map(([x, y]) => new THREE.Vector2(x, y)), 12);
    this.instances.define('chimney-pot', pot, M.jitter('sandstone', terracotta));
  }

  /** Switch to an independent deterministic random stream (one per building). */
  useRng(label: string): SeededRandom {
    this.rng = new SeededRandom(`${this.seed}:${label}`);
    return this.rng;
  }
}
