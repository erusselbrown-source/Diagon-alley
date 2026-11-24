/**
 * Coloured potion steam: glowing wisps rising from bubbling cauldrons. One
 * Points cloud; per-emitter colour; additive so it glows in the night air.
 */
import * as THREE from 'three';
import type { FxSystem } from './index';

const PER = 18;

export interface SteamEmitter { position: THREE.Vector3; color: THREE.Color }

export function createSteam(emitters: readonly SteamEmitter[]): FxSystem & { setViewport(h: number, fov: number): void } {
  const n = emitters.length * PER;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n * 2);
  emitters.forEach((e, i) => {
    for (let k = 0; k < PER; k++) {
      const j = i * PER + k;
      pos.set([e.position.x, e.position.y, e.position.z], j * 3);
      col.set([e.color.r, e.color.g, e.color.b], j * 3);
      seed.set([k / PER, i * 7.13 + k * 0.37], j * 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 2));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 3;
  const uniforms = { uTime: { value: 0 }, uScale: { value: 600 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed; uniform float uTime; uniform float uScale;
      varying float vA; varying vec3 vC;
      void main() {
        float life = 2.6;
        float age = fract(uTime / life + aSeed.x);
        vec3 p = position;
        p.y += age * 1.1;
        p.x += sin(age * 6.0 + aSeed.y) * 0.08 * age;
        p.z += cos(age * 5.0 + aSeed.y * 1.7) * 0.08 * age;
        vA = smoothstep(0.0, 0.15, age) * (1.0 - smoothstep(0.5, 1.0, age));
        vC = color;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.1 + age * 0.35) * uScale / max(0.5, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying vec3 vC;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float a = (1.0 - r) * (1.0 - r) * vA * 0.5;
        gl_FragColor = vec4(vC * a * 1.6, a);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(g, mat);
  points.name = 'cauldron-steam';
  points.frustumCulled = false;
  points.renderOrder = 4;
  return {
    object: points,
    update(_dt, t) { uniforms.uTime.value = t; },
    setViewport(h, fov) { uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); },
    dispose() { g.dispose(); mat.dispose(); },
  };
}
