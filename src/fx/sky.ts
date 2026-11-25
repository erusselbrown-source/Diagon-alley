/**
 * Procedural sky dome driven by atmosphere presets: twilight gradient with a
 * horizon city-glow band, moon disc + halo, low sun disc + glow (sunset),
 * twinkling stars, and two parallax cloud layers with cheap volumetric
 * shading (density re-sampled toward the light → silver linings and dark
 * cores). A lightning term flashes the clouds. Fog-free so silhouettes read.
 */
import * as THREE from 'three';
import type { FxSystem } from './index';

export interface SkyState {
  zenith: THREE.Color;
  horizon: THREE.Color;
  glow: THREE.Color;
  moonDir: THREE.Vector3;
  moonColor: THREE.Color;
  sunDir: THREE.Vector3;
  sunColor: THREE.Color;
  /** 0..1 sun disc/glow visibility (sunset). */
  sun: number;
  /** 0..1 cloud coverage. */
  cover: number;
  cloudDark: THREE.Color;
  cloudLit: THREE.Color;
  stars: number;
  flash: number;
}

export interface Sky extends FxSystem { state: SkyState; follow(camera: THREE.Camera): void }

export function createSky(): Sky {
  const state: SkyState = {
    zenith: new THREE.Color(), horizon: new THREE.Color(), glow: new THREE.Color(),
    moonDir: new THREE.Vector3(-0.45, 0.75, 0.3).normalize(), moonColor: new THREE.Color(0.85, 0.9, 1),
    sunDir: new THREE.Vector3(0.9, 0.12, -0.3).normalize(), sunColor: new THREE.Color(1, 0.6, 0.3), sun: 0,
    cover: 0.45, cloudDark: new THREE.Color(), cloudLit: new THREE.Color(), stars: 0.6, flash: 0,
  };
  const u = {
    uTime: { value: 0 }, uZenith: { value: state.zenith }, uHorizon: { value: state.horizon }, uGlow: { value: state.glow },
    uMoon: { value: state.moonDir }, uMoonCol: { value: state.moonColor }, uSun: { value: state.sunDir }, uSunCol: { value: state.sunColor },
    uSunAmt: { value: 0 }, uCover: { value: 0.45 }, uCloudDark: { value: state.cloudDark }, uCloudLit: { value: state.cloudLit },
    uStars: { value: 0.6 }, uFlash: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uSunAmt, uCover, uStars, uFlash;
      uniform vec3 uZenith, uHorizon, uGlow, uMoon, uMoonCol, uSun, uSunCol, uCloudDark, uCloudLit;
      varying vec3 vDir;
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
      vec2 cloudLayer(vec3 d, float height, float scale, vec2 drift, vec3 L) {
        float k = height / max(d.y + 0.08, 0.04);
        vec2 uv = d.xz * k * scale + drift;
        float dens = smoothstep(1.0 - uCover - 0.18, 1.0 - uCover + 0.35, fbm(uv));
        // march a step toward the light: thinner there → lit edge
        vec2 luv = uv + normalize(L.xz + 1e-4) * 0.35;
        float toward = smoothstep(1.0 - uCover - 0.18, 1.0 - uCover + 0.35, fbm(luv));
        float lit = clamp(1.0 - (toward - dens * 0.6) * 1.4, 0.0, 1.0);
        return vec2(dens, lit);
      }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        float yc = clamp(y, 0.0, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(yc, 0.55));
        col += uGlow * exp(-max(y, 0.0) * 7.0) * 0.9;
        col = mix(col, uHorizon * 0.35, smoothstep(0.0, -0.25, y));
        // stars
        vec3 sp = d * 260.0;
        vec3 si = floor(sp);
        float st = step(0.9965, h3(si)) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5));
        st *= 0.6 + 0.4 * sin(uTime * (1.5 + h3(si + 3.1) * 4.0) + h3(si) * 30.0);
        col += vec3(0.85, 0.9, 1.0) * st * uStars * smoothstep(0.05, 0.35, y);
        // moon
        float m = max(dot(d, uMoon), 0.0);
        col += uMoonCol * pow(m, 80.0) * 0.45 + uMoonCol * pow(m, 8.0) * 0.06;
        col += uMoonCol * smoothstep(0.99925, 0.9996, m) * 3.0;
        // low sun
        float s = max(dot(d, uSun), 0.0);
        col += uSunCol * (pow(s, 6.0) * 0.5 + pow(s, 60.0) * 1.2 + smoothstep(0.9993, 0.9997, s) * 6.0) * uSunAmt;
        // two cloud layers
        vec3 L = normalize(mix(uMoon, uSun, uSunAmt));
        vec2 c1 = cloudLayer(d, 1.0, 0.55, vec2(uTime * 0.006, uTime * 0.003), L);
        vec2 c2 = cloudLayer(d, 1.0, 1.4, vec2(uTime * 0.014, -uTime * 0.004) + 13.0, L);
        float horizonFade = smoothstep(-0.02, 0.18, y);
        for (int i = 0; i < 2; i++) {
          vec2 c = i == 0 ? c1 : c2;
          float glowToward = pow(max(dot(d, L), 0.0), 4.0);
          vec3 cc = mix(uCloudDark, uCloudLit, c.y * (0.35 + 0.65 * glowToward));
          cc += uCloudLit * pow(max(dot(d, L), 0.0), 24.0) * c.y * 0.8; // silver lining
          cc += vec3(0.6, 0.65, 0.85) * uFlash * (0.4 + 0.6 * c.y);
          col = mix(col, cc, c.x * horizonFade * (i == 0 ? 0.9 : 0.6));
        }
        col += vec3(0.25, 0.28, 0.4) * uFlash * 0.25;
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
    state,
    follow(camera) { mesh.position.copy(camera.position); },
    update(_dt, t) {
      u.uTime.value = t;
      u.uSunAmt.value = state.sun;
      u.uCover.value = state.cover;
      u.uStars.value = state.stars;
      u.uFlash.value = state.flash;
    },
    dispose() { mesh.geometry.dispose(); mat.dispose(); },
  };
}
