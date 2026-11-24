/**
 * Gentle chimney smoke: one Points cloud for every chimney pot on the street.
 * Each particle's path is evaluated in the vertex shader — steady rise, wind
 * shear growing with age, and displacement along the curl of a 3D noise
 * potential (divergence-free, so wisps swirl rather than smear). Sprites are
 * soft procedural puffs; no textures.
 */
import * as THREE from 'three';
import type { FxSystem } from './index';

const PER_EMITTER = 26;

export interface ChimneySmoke extends FxSystem {
  /** Call on resize so sprite sizes stay in world units. */
  setViewport(heightPx: number, fovDeg: number): void;
}

export function createChimneySmoke(emitters: readonly THREE.Vector3[], seed = 1): ChimneySmoke {
  const n = emitters.length * PER_EMITTER;
  const pos = new Float32Array(n * 3), aSeed = new Float32Array(n * 2);
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  emitters.forEach((e, i) => {
    const em = rnd() * 10;
    for (let k = 0; k < PER_EMITTER; k++) {
      const j = i * PER_EMITTER + k;
      pos.set([e.x, e.y, e.z], j * 3);
      aSeed.set([k / PER_EMITTER + rnd() * 0.02, em + rnd()], j * 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 2));
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 8;

  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.6, -0.25) },
    uScale: { value: 600 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 aSeed;
      uniform float uTime;
      uniform vec2 uWind;
      uniform float uScale;
      varying float vAlpha;
      varying float vSeed;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float vnoise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = h3(i), n100 = h3(i + vec3(1, 0, 0)), n010 = h3(i + vec3(0, 1, 0)), n110 = h3(i + vec3(1, 1, 0));
        float n001 = h3(i + vec3(0, 0, 1)), n101 = h3(i + vec3(1, 0, 1)), n011 = h3(i + vec3(0, 1, 1)), n111 = h3(i + vec3(1, 1, 1));
        return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
      }
      vec3 potential(vec3 p) {
        return vec3(vnoise(p), vnoise(p + vec3(31.4, 7.1, 2.9)), vnoise(p + vec3(-5.7, 19.3, 11.1)));
      }
      vec3 curlNoise(vec3 p) {
        const float e = 0.12;
        vec3 dx = vec3(e, 0, 0), dy = vec3(0, e, 0), dz = vec3(0, 0, e);
        vec3 px0 = potential(p - dx), px1 = potential(p + dx);
        vec3 py0 = potential(p - dy), py1 = potential(p + dy);
        vec3 pz0 = potential(p - dz), pz1 = potential(p + dz);
        return vec3((py1.z - py0.z) - (pz1.y - pz0.y), (pz1.x - pz0.x) - (px1.z - px0.z), (px1.y - px0.y) - (py1.x - py0.x)) / (2.0 * e);
      }
      void main() {
        float life = 7.5;
        float age = fract(uTime / life + aSeed.x);
        vec3 p = position;
        float rise = age * 3.0;
        vec3 q = p * 0.35 + vec3(0.0, rise * 0.6 - uTime * 0.12, aSeed.y * 3.7);
        p += vec3(uWind.x, 0.0, uWind.y) * age * age * 3.0 + vec3(0.0, rise, 0.0) + curlNoise(q) * 0.32 * age;
        vAlpha = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.45, 1.0, age));
        vSeed = aSeed.y + aSeed.x * 13.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (0.22 + age * 1.5) * uScale / max(0.5, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vSeed;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n2(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float wisp = 0.6 * n2(gl_PointCoord * 3.0 + vSeed) + 0.4 * n2(gl_PointCoord * 7.0 - vSeed);
        float a = (1.0 - r) * (1.0 - r) * vAlpha * (0.35 + 0.65 * wisp) * 0.32;
        gl_FragColor = vec4(vec3(0.36, 0.37, 0.41), a);
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'chimney-smoke';
  points.frustumCulled = false;
  points.renderOrder = 4;

  return {
    object: points,
    update(_dt, elapsed) { uniforms.uTime.value = elapsed; },
    setViewport(h, fov) { uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); },
    dispose() { geo.dispose(); material.dispose(); },
  };
}
