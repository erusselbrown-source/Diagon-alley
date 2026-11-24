/**
 * Procedural brazier flames: three crossed billboards with an additive
 * shader — teardrop mask, upward-scrolling fbm turbulence, blackbody colour
 * ramp, and a swaying tip. A paired point light flickers in sync.
 */
import * as THREE from 'three';
import type { FxSystem } from './index';

const flameMaterial = () => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSeed: { value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */ `
    uniform float uTime; uniform float uSeed;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position;
      float sway = (sin(uTime * 3.1 + uSeed) * 0.6 + sin(uTime * 5.3 + uSeed * 2.0) * 0.4) * 0.12;
      p.x += sway * uv.y * uv.y;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform float uSeed;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p) { return 0.5 * n(p) + 0.25 * n(p * 2.1) + 0.125 * n(p * 4.3) + 0.0625 * n(p * 8.7); }
    void main() {
      vec2 uv = vUv;
      float t = uTime * 1.6 + uSeed;
      float turb = fbm(vec2(uv.x * 3.0, uv.y * 2.2 - t * 1.4));
      float x = (uv.x - 0.5) * 2.0 + (turb - 0.5) * 0.7 * uv.y;
      float width = pow(1.0 - uv.y, 0.75) * (0.55 + 0.45 * sin(uv.y * 3.1416));
      float body = smoothstep(width, width * 0.35, abs(x));
      float heat = body * smoothstep(1.0, 0.0, uv.y + (turb - 0.5) * 0.5);
      heat *= smoothstep(0.0, 0.08, uv.y);
      vec3 col = mix(vec3(0.6, 0.08, 0.0), vec3(1.0, 0.45, 0.05), smoothstep(0.1, 0.5, heat));
      col = mix(col, vec3(1.0, 0.9, 0.6), smoothstep(0.55, 0.95, heat));
      gl_FragColor = vec4(col * heat * 2.6, heat);
    }`,
});

export interface Flame extends FxSystem { light: THREE.PointLight }

/** A flame of the given size whose base sits at the object origin. */
export function createFlame(size = 1, seed = 0, withLight = true, lightIntensity = 9): Flame {
  const group = new THREE.Group();
  group.name = 'flame';
  const mat = flameMaterial();
  mat.uniforms.uSeed.value = seed;
  const geo = new THREE.PlaneGeometry(0.7 * size, 1.4 * size).translate(0, 0.7 * size, 0);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.y = (i / 3) * Math.PI;
    m.renderOrder = 5;
    group.add(m);
  }
  const light = new THREE.PointLight(0xff8a3a, withLight ? lightIntensity : 0, 16 * size, 1.8);
  light.position.y = 0.5 * size;
  light.visible = withLight;
  group.add(light);
  group.userData.keep = true;
  return {
    object: group,
    light,
    update(_dt, t) {
      mat.uniforms.uTime.value = t;
      if (withLight) light.intensity = lightIntensity * (0.82 + 0.12 * Math.sin(t * 13.7 + seed) + 0.08 * Math.sin(t * 23.1 + seed * 3));
    },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
