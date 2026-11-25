/**
 * Cinematic lighting: warm amber gas-light and golden windows against a cool
 * indigo sky.
 *
 *  - Key light: moon (or low sun) DirectionalLight with soft PCF shadows whose
 *    camera follows the viewer, texel-snapped so shadows don't shimmer.
 *  - Hemisphere bounce light.
 *  - LightPool: a fixed set of real PointLights (default 14) assigned each
 *    frame to the nearest/visible virtual light sources (streetlamps,
 *    braziers, lanterns…) with smooth fades — constant light count, so no
 *    shader recompiles and a bounded per-pixel cost.
 *  - Atmosphere presets (Misty Blue Hour, Golden Autumn Sunset, Midnight
 *    Storm) cross-fading sky, light, fog, exposure, bloom, lamp level,
 *    wetness, rain and lightning.
 */
import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { PostFX } from './postprocessing';
import type { Sky } from '../fx/sky';
import type { Rain } from '../fx/rain';

// ---------------------------------------------------------------------------
// Light pool
// ---------------------------------------------------------------------------

export interface LightSource {
  position: THREE.Vector3;
  color: THREE.Color;
  distance: number;
  decay: number;
  intensity: () => number;
  /** If set, the world position is read from this object every frame. */
  follow?: THREE.Object3D;
}

export class LightPool {
  readonly lights: THREE.PointLight[] = [];
  readonly sources: LightSource[] = [];
  private readonly weight = new Map<LightSource, number>();
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();

  constructor(scene: THREE.Scene, readonly size = 14) {
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 15, 1.8);
      l.name = `pool-light-${i}`;
      scene.add(l);
      this.lights.push(l);
    }
  }

  add(...s: LightSource[]): void { this.sources.push(...s); }

  /** Hide existing PointLights under `root` and drive them through the pool instead. */
  adoptPointLights(root: THREE.Object3D): number {
    let n = 0;
    root.traverse((o) => {
      const l = o as THREE.PointLight;
      if (!l.isPointLight || this.lights.includes(l)) return;
      l.visible = false; // excluded from shading; still animated by its owner
      this.add({ position: new THREE.Vector3(), follow: l, color: l.color, distance: l.distance || 15, decay: l.decay, intensity: () => l.intensity });
      n++;
    });
    return n;
  }

  update(camera: THREE.Camera, dt: number): void {
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    const cam = camera.position;
    const scored: { s: LightSource; score: number }[] = [];
    for (const s of this.sources) {
      if (s.follow) s.follow.getWorldPosition(s.position);
      if (s.intensity() <= 0.01) { this.weight.set(s, Math.max(0, (this.weight.get(s) ?? 0) - dt * 4)); continue; }
      const d2 = s.position.distanceToSquared(cam);
      const sphereHit = this.frustum.intersectsSphere(this.sphere.set(s.position, s.distance * 0.8));
      scored.push({ s, score: d2 * (sphereHit ? 1 : 6) });
    }
    scored.sort((a, b) => a.score - b.score);
    const target = new Set(scored.slice(0, this.size - 2).map((x) => x.s)); // two spare slots for fade-outs
    const k = Math.min(1, dt * 4);
    for (const s of this.sources) {
      const w = this.weight.get(s) ?? 0;
      this.weight.set(s, w + ((target.has(s) ? 1 : 0) - w) * k);
    }
    const active = this.sources.filter((s) => (this.weight.get(s) ?? 0) > 0.01)
      .sort((a, b) => (this.weight.get(b) ?? 0) - (this.weight.get(a) ?? 0)).slice(0, this.size);
    this.lights.forEach((l, i) => {
      const s = active[i];
      if (!s) { l.intensity = 0; return; }
      l.position.copy(s.position);
      l.color.copy(s.color);
      l.distance = s.distance;
      l.decay = s.decay;
      l.intensity = s.intensity() * (this.weight.get(s) ?? 0);
    });
  }
}

// ---------------------------------------------------------------------------
// Atmosphere presets
// ---------------------------------------------------------------------------

export interface Atmosphere {
  zenith: THREE.Color; horizon: THREE.Color; glow: THREE.Color;
  cloudDark: THREE.Color; cloudLit: THREE.Color; cover: number; stars: number; sun: number;
  keyColor: THREE.Color; keyIntensity: number; keyDir: THREE.Vector3;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemiIntensity: number;
  fogColor: THREE.Color; fogDensity: number; mistColor: THREE.Color;
  exposure: number; bloom: number; lamps: number; env: number;
  wetness: number; rain: number; lightning: number;
}

const C = (hex: number) => new THREE.Color(hex);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

export type PresetName = 'Misty Blue Hour' | 'Golden Autumn Sunset' | 'Midnight Storm';

export const PRESETS: Record<PresetName, Atmosphere> = {
  'Misty Blue Hour': {
    zenith: C(0x0a0f30), horizon: C(0x3c4070), glow: C(0x553548), cloudDark: C(0x181b34), cloudLit: C(0x8890bc), cover: 0.5, stars: 0.75, sun: 0,
    keyColor: C(0x9db2ff), keyIntensity: 1.25, keyDir: V(-0.45, 0.75, 0.3),
    hemiSky: C(0x4a5a92), hemiGround: C(0x2a1e18), hemiIntensity: 0.55,
    fogColor: C(0x1a1e36), fogDensity: 0.02, mistColor: C(0x2a3052),
    exposure: 1.15, bloom: 0.55, lamps: 1, env: 0.6, wetness: 0.55, rain: 0, lightning: 0,
  },
  'Golden Autumn Sunset': {
    zenith: C(0x2a3a6c), horizon: C(0xf0a462), glow: C(0xff7a30), cloudDark: C(0x5a3a44), cloudLit: C(0xffc488), cover: 0.42, stars: 0, sun: 1,
    keyColor: C(0xffb070), keyIntensity: 2.4, keyDir: V(0.85, 0.17, -0.36),
    hemiSky: C(0xffc8a0), hemiGround: C(0x4a2e20), hemiIntensity: 0.6,
    fogColor: C(0x8a5c4a), fogDensity: 0.012, mistColor: C(0x9a6c5a),
    exposure: 1.0, bloom: 0.42, lamps: 0.55, env: 0.85, wetness: 0.2, rain: 0, lightning: 0,
  },
  'Midnight Storm': {
    zenith: C(0x020308), horizon: C(0x0d1119), glow: C(0x12161c), cloudDark: C(0x05070c), cloudLit: C(0x2c3244), cover: 0.95, stars: 0, sun: 0,
    keyColor: C(0x7a8ab4), keyIntensity: 0.45, keyDir: V(-0.3, 0.8, 0.5),
    hemiSky: C(0x202a3c), hemiGround: C(0x0a0806), hemiIntensity: 0.35,
    fogColor: C(0x0b0e17), fogDensity: 0.032, mistColor: C(0x131a28),
    exposure: 1.2, bloom: 0.62, lamps: 1, env: 0.45, wetness: 1, rain: 1, lightning: 1,
  },
};

function cloneAtmo(a: Atmosphere): Atmosphere {
  const o = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(a)) o[k] = typeof v === 'number' ? v : (v as THREE.Color | THREE.Vector3).clone();
  return o as unknown as Atmosphere;
}

function lerpAtmo(out: Atmosphere, a: Atmosphere, b: Atmosphere, t: number): void {
  for (const k of Object.keys(a) as (keyof Atmosphere)[]) {
    const va = a[k], vb = b[k];
    if (typeof va === 'number') (out[k] as number) = va + ((vb as number) - va) * t;
    else if ((va as THREE.Color).isColor) (out[k] as THREE.Color).copy(va as THREE.Color).lerp(vb as THREE.Color, t);
    else (out[k] as THREE.Vector3).copy(va as THREE.Vector3).lerp(vb as THREE.Vector3, t).normalize();
  }
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

export interface LightingRigOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  post: PostFX;
  sky: Sky;
  rain: Rain;
  /** Streetlamp brightness multiplier hook. */
  setLamps?: (level: number) => void;
  /** Street wetness hook (0..1). */
  setWetness?: (w: number) => void;
  /** What lightning should light up (Gringotts). */
  lightningTarget: THREE.Vector3;
  /** Mist card colours to tint with the preset. */
  mistColors?: THREE.Color[];
  poolSize?: number;
}

export interface LightingRig {
  pool: LightPool;
  current: Atmosphere;
  preset: PresetName;
  setPreset(name: PresetName, seconds?: number): void;
  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera): void;
  installGui(gui: GUI): void;
  /** Trigger a lightning burst at scene time `t` (also handy for screenshots). */
  strike(t: number): void;
  /** Called when a lightning burst starts (thunder). */
  onStrike?: () => void;
}

export function createLightingRig(o: LightingRigOptions): LightingRig {
  const { scene, renderer, post, sky, rain } = o;
  let sun: THREE.DirectionalLight | undefined, hemi: THREE.HemisphereLight | undefined;
  scene.traverse((x) => {
    if ((x as THREE.DirectionalLight).isDirectionalLight && !sun) sun = x as THREE.DirectionalLight;
    if ((x as THREE.HemisphereLight).isHemisphereLight && !hemi) hemi = x as THREE.HemisphereLight;
  });
  if (!sun || !hemi) throw new Error('createLightingRig: scene needs a DirectionalLight and a HemisphereLight');
  const key = sun, bounce = hemi;
  scene.add(key.target);
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 3;
  const SH = 36;
  Object.assign(key.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 160 });
  key.shadow.camera.updateProjectionMatrix();

  const lightning = new THREE.DirectionalLight(0xb8c8ff, 0);
  lightning.name = 'lightning';
  lightning.position.copy(o.lightningTarget).add(new THREE.Vector3(0, 40, 0));
  lightning.target.position.copy(o.lightningTarget);
  scene.add(lightning, lightning.target);

  const pool = new LightPool(scene, o.poolSize ?? 14);
  const fog = scene.fog as THREE.FogExp2;
  let from = cloneAtmo(PRESETS['Misty Blue Hour']);
  let to = cloneAtmo(PRESETS['Misty Blue Hour']);
  const current = cloneAtmo(to);
  let blend = 1, blendDur = 1;
  const overrides = { fogDensity: current.fogDensity, bloom: current.bloom };
  let nextStrike = 4, strikeT = -10;

  const fwd = new THREE.Vector3(), focus = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), lf = new THREE.Vector3();

  const rig: LightingRig = {
    pool, current, preset: 'Misty Blue Hour',
    setPreset(name, seconds = 2.5) {
      from = cloneAtmo(current);
      to = cloneAtmo(PRESETS[name]);
      blend = 0;
      blendDur = Math.max(1e-4, seconds); // 0 s → applied on the next update
      rig.preset = name;
      overrides.fogDensity = to.fogDensity;
      overrides.bloom = to.bloom;
    },
    update(dt, t, camera) {
      if (blend < 1) {
        blend = Math.min(1, blend + dt / blendDur);
        const e = blend * blend * (3 - 2 * blend);
        lerpAtmo(current, from, to, e);
        // keep GUI overrides following the transition
        overrides.fogDensity = current.fogDensity;
        overrides.bloom = current.bloom;
      }
      const A = current;
      // Sky
      sky.state.zenith.copy(A.zenith); sky.state.horizon.copy(A.horizon); sky.state.glow.copy(A.glow);
      sky.state.cloudDark.copy(A.cloudDark); sky.state.cloudLit.copy(A.cloudLit);
      sky.state.cover = A.cover; sky.state.stars = A.stars; sky.state.sun = A.sun;
      if (A.sun > 0.5) sky.state.sunDir.copy(A.keyDir); else sky.state.moonDir.copy(A.keyDir);
      sky.follow(camera);
      // Key light follows the view so shadows cover the rooftops around the camera.
      camera.getWorldDirection(fwd);
      focus.copy(camera.position).addScaledVector(fwd.setY(0).normalize(), 18);
      focus.y = 0;
      lf.copy(A.keyDir).negate();
      right.crossVectors(new THREE.Vector3(0, 1, 0), lf).normalize();
      up.crossVectors(lf, right).normalize();
      const texel = (2 * SH) / key.shadow.mapSize.x;
      const a = focus.dot(right), b = focus.dot(up);
      focus.addScaledVector(right, Math.round(a / texel) * texel - a).addScaledVector(up, Math.round(b / texel) * texel - b);
      key.target.position.copy(focus);
      key.position.copy(focus).addScaledVector(A.keyDir, 70);
      key.target.updateMatrixWorld();
      key.color.copy(A.keyColor);
      key.intensity = A.keyIntensity;
      bounce.color.copy(A.hemiSky); bounce.groundColor.copy(A.hemiGround); bounce.intensity = A.hemiIntensity;
      // Fog, exposure, bloom, environment
      fog.color.copy(A.fogColor);
      fog.density = overrides.fogDensity;
      renderer.toneMappingExposure = A.exposure;
      post.bloom.strength = overrides.bloom;
      scene.environmentIntensity = A.env;
      for (const c of o.mistColors ?? []) c.copy(A.mistColor);
      o.setLamps?.(A.lamps);
      o.setWetness?.(A.wetness);
      rain.setAmount(A.rain);
      rain.follow(camera);
      // Lightning: bursts of 2–3 pulses every 5–12 s, washing Gringotts.
      let flash = 0;
      if (A.lightning > 0.01) {
        if (t > nextStrike) { strikeT = t; nextStrike = t + 5 + Math.random() * 7; rig.onStrike?.(); }
        const s = t - strikeT;
        if (s >= 0 && s < 0.9) flash = Math.exp(-s * 18) + 0.7 * Math.exp(-Math.max(0, s - 0.18) * 22) * (s > 0.18 ? 1 : 0) + 0.5 * Math.exp(-Math.max(0, s - 0.45) * 14) * (s > 0.45 ? 1 : 0);
        flash *= A.lightning;
      }
      lightning.intensity = 5 * flash;
      sky.state.flash = flash * 0.7;
      pool.update(camera, dt);
    },
    strike(t) { strikeT = t; nextStrike = t + 5 + Math.random() * 7; rig.onStrike?.(); },
    installGui(gui) {
      const f = gui.addFolder('Atmosphere');
      const ui = { get preset() { return rig.preset; }, set preset(v: PresetName) { rig.setPreset(v); } };
      f.add(ui, 'preset', Object.keys(PRESETS)).name('preset').listen();
      f.add(overrides, 'fogDensity', 0, 0.08, 0.001).name('fog density').listen();
      f.add(overrides, 'bloom', 0, 2, 0.01).name('bloom intensity').listen();
      f.open();
    },
  };
  rig.setPreset('Misty Blue Hour', 0);
  rig.update(0, 0, new THREE.PerspectiveCamera());
  return rig;
}
