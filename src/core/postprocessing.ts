import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostFX {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  /** Vignette / film grain / chromatic aberration micro-pass. */
  film: ShaderPass;
  setSize(width: number, height: number): void;
  update(elapsed: number): void;
}

/**
 * Filmic micro-pass, run in linear HDR before tone mapping:
 *  - radial chromatic aberration (sub-pixel at centre, ~1.5 px at the corners)
 *  - soft oval vignette
 *  - luminance-weighted film grain (strongest in the mid-shadows, like stock)
 */
const FilmShader = {
  name: 'CinematicFilm',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.045 },
    uAberration: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVignette, uGrain, uAberration;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uAberration * 4.0 / uResolution * min(uResolution.x, uResolution.y) * 0.0025;
      vec4 c = texture2D(tDiffuse, vUv);
      c.r = texture2D(tDiffuse, vUv + off).r;
      c.b = texture2D(tDiffuse, vUv - off).b;
      // vignette (aspect-corrected oval)
      vec2 dv = d * vec2(uResolution.x / uResolution.y, 1.0) * 0.82;
      float v = smoothstep(0.95, 0.25, length(dv));
      c.rgb *= mix(1.0 - uVignette, 1.0, v);
      // grain: animated, stronger in shadows/mids than highlights
      float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float n = hash(vUv * uResolution + fract(uTime * 7.31) * 113.0) - 0.5;
      float w = uGrain * (0.35 + 0.65 * (1.0 - smoothstep(0.0, 1.2, lum)));
      c.rgb = max(c.rgb + n * w * (0.12 + lum), 0.0);
      gl_FragColor = c;
    }`,
};

/**
 * Render → NaN scrub → selective bloom → film micro-pass → OutputPass.
 *
 * Bloom runs on linear HDR before tone mapping; a threshold just above 1
 * means only true emitters (gas mantles, shop interiors, potions, sparks,
 * flames) halate, while lit marble (albedo ≤ 0.85 × light) stays crisp.
 * OutputPass applies ACES tone mapping and sRGB, so it must stay last.
 */
export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFX {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Safety net: one non-finite pixel (a degenerate normal, a 0/0 somewhere) would otherwise be
  // smeared by the bloom blur into a fully black frame. Scrub it to black before bloom.
  composer.addPass(new ShaderPass({
    name: 'ScrubNaN',
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
        gl_FragColor = any(bad) ? vec4(0.0, 0.0, 0.0, 1.0) : max(c, vec4(0.0));
      }`,
  }));

  const bloom = new UnrealBloomPass(size, 0.55, 0.62, 1.05);
  composer.addPass(bloom);
  const film = new ShaderPass(FilmShader);
  composer.addPass(film);
  composer.addPass(new OutputPass());

  const setRes = () => {
    const b = renderer.getDrawingBufferSize(new THREE.Vector2());
    film.uniforms.uResolution.value.set(b.x, b.y);
  };
  setRes();

  return {
    composer,
    bloom,
    film,
    setSize(width, height) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
      setRes();
    },
    update(elapsed) { film.uniforms.uTime.value = elapsed; },
  };
}
