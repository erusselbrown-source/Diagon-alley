/**
 * Layered atmospheric mist: soft translucent cards whose density comes from
 * drifting world-space noise, densest near the ground and fading at the
 * card edges. Stack them with increasing opacity to fade distant streets into
 * an infinite-feeling haze. One shared material; no textures.
 */
import * as THREE from 'three';
import type { FxSystem } from './index';

export interface MistCard { position: THREE.Vector3; facing: THREE.Vector3; width: number; height: number; density: number }

export function createMist(cards: readonly MistCard[], color: THREE.ColorRepresentation = 0x232a36): FxSystem {
  const group = new THREE.Group();
  group.name = 'mist';
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aDensity;
      varying vec2 vUv; varying vec3 vWorld; varying float vDensity;
      void main() {
        vUv = uv; vDensity = aDensity;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor;
      varying vec2 vUv; varying vec3 vWorld; varying float vDensity;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float n(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        vec3 q = vWorld * 0.16 + vec3(uTime * 0.05, 0.0, uTime * 0.03);
        float d = 0.55 * n(q) + 0.3 * n(q * 2.3 + 4.1) + 0.15 * n(q * 5.1 - 2.7);
        float ground = mix(1.0, 0.35, smoothstep(0.0, 0.85, vUv.y));
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x) * smoothstep(1.0, 0.7, vUv.y);
        float a = clamp(vDensity * (0.45 + 0.9 * d) * ground * edge, 0.0, 1.0);
        gl_FragColor = vec4(uColor * (0.85 + 0.3 * d), a);
        #include <colorspace_fragment>
      }`,
  });
  for (const c of cards) {
    const g = new THREE.PlaneGeometry(c.width, c.height).translate(0, c.height / 2, 0);
    g.setAttribute('aDensity', new THREE.Float32BufferAttribute(new Float32Array(4).fill(c.density), 1));
    const m = new THREE.Mesh(g, mat);
    m.position.copy(c.position);
    m.lookAt(c.position.clone().add(c.facing.clone().setY(0)));
    m.renderOrder = 6;
    group.add(m);
  }
  return {
    object: group,
    update(_dt, t) { uniforms.uTime.value = t; },
    dispose() { mat.dispose(); },
  };
}
