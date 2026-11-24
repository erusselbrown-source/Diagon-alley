import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

/** Eye-level perspective camera with damped orbit controls for development. */
export function createCamera(domElement: HTMLElement, aspect: number): CameraRig {
  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 500);
  camera.position.set(8, 6, 14);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(0, 1.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495; // stay above the cobbles
  controls.minDistance = 1;
  controls.maxDistance = 120;
  controls.update();

  return { camera, controls };
}
