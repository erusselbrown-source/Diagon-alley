/**
 * Atmospheric & magical effects: volumetric fog, particles (embers, dust,
 * snow), flickering lanterns, spell glows. Each effect implements FxSystem.
 */
import type * as THREE from 'three';

export interface FxSystem {
  readonly object: THREE.Object3D;
  update(dt: number, elapsed: number): void;
  dispose(): void;
}
