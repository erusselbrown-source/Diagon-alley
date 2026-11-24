/**
 * Procedural moonlit night sky: gradient dome (deep navy zenith → smoky
 * horizon glow), a moon disc with halo in the moonlight's direction, and
 * slow-drifting fbm cloud banks with silvered undersides. Fog-free, so
 * silhouettes (rooftops, owls) read against it.
 */
import * as THREE from 'three';
import type { FxSystem } from './index';

export function createSky(moonDir: THREE.Vector3): FxSystem {
  const uniforms = { uTime: { value: 0 }, uMoon: { value: moonDir.clone().normalize() } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uMoon; varying vec3 vDir;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float y = max(d.y, -0.2);
        vec3 zen = vec3(0.012, 0.02, 0.05), hor = vec3(0.09, 0.08, 0.1), glow = vec3(0.16, 0.1, 0.06);
        vec3 col = mix(hor, zen, pow(clamp(y, 0.0, 1.0), 0.5));
        col += glow * exp(-max(y, 0.0) * 9.0) * 0.6;             // city glow at the horizon
        float m = max(dot(d, uMoon), 0.0);
        col += vec3(0.5, 0.55, 0.7) * pow(m, 60.0) * 0.5;        // halo
        col += vec3(0.95, 0.97, 1.0) * smoothstep(0.9993, 0.9996, m) * 2.5; // disc
        // clouds on a projected plane
        vec2 uv = d.xz / max(d.y + 0.15, 0.05) * 0.6 + vec2(uTime * 0.004, uTime * 0.002);
        float c = smoothstep(0.45, 0.85, fbm(uv * 1.3));
        vec3 cloud = mix(vec3(0.05, 0.055, 0.07), vec3(0.3, 0.32, 0.38), pow(m, 6.0) * 0.8 + 0.1);
        col = mix(col, cloud, c * smoothstep(-0.05, 0.25, d.y) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(450, 48, 24), mat);
  mesh.name = 'sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    object: mesh,
    update(_dt, t) { uniforms.uTime.value = t; },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}
