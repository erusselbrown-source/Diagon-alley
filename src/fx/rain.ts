/**
 * Diagonal rain streaks. Thousands of line segments animated entirely on the
 * GPU in a box that wraps around the camera (no CPU per drop). Amount fades
 * the whole field in/out for preset transitions.
 */
import * as THREE from 'three';
import type { FxSystem } from './index';

export interface Rain extends FxSystem { setAmount(a: number): void; follow(camera: THREE.Camera): void }

export function createRain(count = 7000, box = new THREE.Vector3(36, 22, 36)): Rain {
  const pos = new Float32Array(count * 6), seed = new Float32Array(count * 2 * 4);
  let s = 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const x = rnd(), y = rnd(), z = rnd(), sp = 0.8 + rnd() * 0.4;
    for (let e = 0; e < 2; e++) {
      pos.set([0, e, 0], (i * 2 + e) * 3);
      seed.set([x, y, z, sp], (i * 2 + e) * 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const u = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: box }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2(2.2, 0.8) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec2 uWind;
      varying float vA; varying float vEnd;
      void main() {
        float fall = 14.0 * aSeed.w;
        vec3 vel = vec3(uWind.x, -fall, uWind.y);
        vec3 p = aSeed.xyz * uBox + vel * uTime;
        p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
        p -= normalize(vel) * position.y * 0.55;   // streak tail
        vEnd = position.y;
        vA = 0.25 + 0.2 * aSeed.w;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount; varying float vA; varying float vEnd;
      void main() { float a = vA * uAmount * (1.0 - vEnd * 0.7); gl_FragColor = vec4(vec3(0.62, 0.68, 0.8) * a, a); }`,
  });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.name = 'rain';
  lines.visible = false;
  lines.renderOrder = 8;
  return {
    object: lines,
    setAmount(a) { u.uAmount.value = a; lines.visible = a > 0.01; },
    follow(camera) { u.uCam.value.copy(camera.position); },
    update(_dt, t) { u.uTime.value = t; },
    dispose() { g.dispose(); mat.dispose(); },
  };
}
