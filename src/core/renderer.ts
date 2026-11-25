import * as THREE from 'three';
import { QUALITY } from './device';

export const MAX_PIXEL_RATIO = 2;

/**
 * Project-standard renderer: ACES filmic tone mapping, soft PCF shadows,
 * (three r180+ removed PCFSoftShadowMap; PCFShadowMap is now the soft
 * Vogel-disk filter, tuned per light via `light.shadow.radius`),
 * sRGB output, pixel ratio capped at 2 for high-DPI displays.
 */
export function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO, QUALITY.maxPixelRatio));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // soft PCF (successor to PCFSoftShadowMap)
  container.appendChild(renderer.domElement);
  return renderer;
}
