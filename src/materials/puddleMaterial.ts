/**
 * Shallow rain puddles. Puddle meshes are flat water planes sitting in real
 * subsidence dips of the paving, so stone tops poke through naturally
 * (depth test does the shoreline). This shader adds:
 *  - organic, noise-broken edges (alpha)
 *  - roughness blending: damp rims (~0.45) → mirror core (~0.02)
 *  - animated rain-drop ring ripples perturbing the normal
 *
 * Geometry attributes: `uv` (disc: radial 0..1 centre 0.5; strip: v across),
 * `aShape` (0 = disc puddle, 1 = gutter run-off strip).
 */
import * as THREE from 'three';

export interface PuddleMaterial {
  material: THREE.MeshStandardMaterial;
  update(elapsed: number): void;
  /** 0..1 rain intensity (ripple density/strength). */
  setRain(intensity: number): void;
}

export function createPuddleMaterial(): PuddleMaterial {
  const uniforms = { uTime: { value: 0 }, uRain: { value: 1 } };
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0.035, 0.038, 0.045),
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    envMapIntensity: 1.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  material.name = 'puddle';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aShape;
        varying float vShape;
        varying vec2 vPuddleUv;
        varying vec3 vPuddleWorld;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vShape = aShape;
        vPuddleUv = uv;
        vPuddleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uRain;
        varying float vShape;
        varying vec2 vPuddleUv;
        varying vec3 vPuddleWorld;
        float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float pNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(pHash(i), pHash(i + vec2(1, 0)), u.x), mix(pHash(i + vec2(0, 1)), pHash(i + vec2(1, 1)), u.x), u.y);
        }
        float pFbm(vec2 p) { return 0.5 * pNoise(p) + 0.3 * pNoise(p * 2.03 + 7.1) + 0.2 * pNoise(p * 4.11 + 3.3); }
        float puddleMask() {
          float n = pFbm(vPuddleWorld.xz * 1.7) - 0.5;
          if (vShape < 0.5) {
            float r = length(vPuddleUv * 2.0 - 1.0);
            return 1.0 - smoothstep(0.55, 1.0, r + n * 0.6);
          }
          float r = abs(vPuddleUv.y * 2.0 - 1.0);
          float run = smoothstep(0.38, 0.62, pFbm(vPuddleWorld.xz * 0.45 + 11.0));
          return (1.0 - smoothstep(0.45, 1.0, r + n * 0.4)) * run;
        }
        // Expanding rain rings; returns a horizontal (x, z) normal perturbation.
        vec2 rainRipples(vec2 p, float t) {
          vec2 sum = vec2(0.0);
          float cell = 0.33;
          vec2 base = floor(p / cell);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = base + vec2(float(i), float(j));
            float h = pHash(c);
            if (h > 0.35 + 0.6 * (1.0 - uRain)) continue;
            vec2 centre = (c + vec2(pHash(c + 3.1), pHash(c + 7.7))) * cell;
            float life = fract(t * (0.55 + 0.5 * h) + h * 13.0);
            float radius = life * 0.16;
            vec2 dv = p - centre;
            float d = length(dv);
            float ring = sin((d - radius) * 90.0) * exp(-abs(d - radius) * 45.0) * (1.0 - life);
            sum += (dv / max(d, 1e-4)) * ring;
          }
          return sum;
        }`)
      .replace('void main() {', 'void main() {\n  float pMask = puddleMask();')
      .replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n  diffuseColor.a *= pMask * 0.92;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.45, 0.02, smoothstep(0.05, 0.6, pMask));')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 rp = rainRipples(vPuddleWorld.xz, uTime) * 0.35 * uRain;
        normal = normalize(normal + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz);`);
  };
  material.customProgramCacheKey = () => 'puddle-v1';
  return {
    material,
    update(elapsed) { uniforms.uTime.value = elapsed; },
    setRain(i) { uniforms.uRain.value = i; },
  };
}
