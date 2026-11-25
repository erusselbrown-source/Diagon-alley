/**
 * The wand: a first-person viewmodel in the lower-right of the frame, a
 * sparkling cyan/gold light bolt with particle trails, impact bursts, and
 * miniature crackle fireworks.
 *
 * Everything glowing is one additive `Points` pool (CPU-simulated, one draw
 * call). The bolt and firework bursts publish `LightSource`s so the light
 * pool lets them briefly light the street.
 *
 * Targets are supplied by the world (`WandTarget.test`): the nearest hit
 * along the cast ray wins, the bolt flies there, and on arrival the target's
 * `apply()` runs (open the wall, Lumos/Nox a lamp, push a sign, fireworks…).
 */
import * as THREE from 'three';
import type { LightSource } from '../core/lighting';
import { SeededRandom } from '../core/random';

export interface WandHit {
  kind: string;
  distance: number;
  point: THREE.Vector3;
  /** Runs when the bolt arrives. */
  apply?(): void;
}

export interface WandTarget {
  test(ray: THREE.Ray, maxDistance: number): WandHit | null;
}

export interface WandEvents {
  onCast?(tip: THREE.Vector3): void;
  onImpact?(hit: WandHit): void;
  onFireworkLaunch?(p: THREE.Vector3): void;
  onFireworkBurst?(p: THREE.Vector3, big: boolean): void;
  onCrackle?(p: THREE.Vector3): void;
}

// ---------------------------------------------------------------------------
// Spark pool
// ---------------------------------------------------------------------------

const MAX = 5000;
const CRACKLE = 1, SPAWNS_CRACKLE = 2, ROCKET = 4;

class Sparks {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly base = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly size0 = new Float32Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private readonly grav = new Float32Array(MAX);
  private readonly flags = new Uint8Array(MAX);
  private cursor = 0;
  private readonly geo = new THREE.BufferGeometry();
  readonly rng = new SeededRandom('wand-sparks');
  /** Particles flagged SPAWNS_CRACKLE call this when they die. */
  onDeath?: (x: number, y: number, z: number) => void;

  constructor() {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */ `
        attribute float aSize;
        uniform float uScale;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          if (aSize <= 0.0) gl_PointSize = 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d) * 2.0;
          float core = exp(-r * r * 9.0);
          float halo = exp(-r * r * 2.2) * 0.35;
          float a = (core + halo) * smoothstep(1.0, 0.7, r);
          gl_FragColor = vec4(vColor * a, 1.0);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 12;
    this.points.name = 'wand-sparks';
  }

  setViewport(heightPx: number, fovDeg: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, c: THREE.Color, life: number, size: number, drag = 1.5, grav = -1.2, flags = 0): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([c.r, c.g, c.b], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size0[i] = size;
    this.drag[i] = drag;
    this.grav[i] = grav;
    this.flags[i] = flags;
  }

  update(dt: number): void {
    const { pos, vel, col, size, base, life, maxLife, size0, drag, grav, flags, rng } = this;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { if (size[i] !== 0) size[i] = 0; continue; }
      life[i] -= dt;
      const i3 = i * 3;
      if (life[i] <= 0) {
        size[i] = 0;
        if (flags[i] & SPAWNS_CRACKLE) this.onDeath?.(pos[i3], pos[i3 + 1], pos[i3 + 2]);
        continue;
      }
      const k = Math.exp(-drag[i] * dt);
      vel[i3] *= k; vel[i3 + 1] = vel[i3 + 1] * k + grav[i] * dt; vel[i3 + 2] *= k;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      const u = life[i] / maxLife[i]; // 1 → 0
      let b = u < 0.25 ? u / 0.25 : 1;
      b *= Math.min(1, (1 - u) * 12 + 0.25);
      if (flags[i] & CRACKLE) b *= rng.next() < 0.45 ? 2.2 : 0.05; // sparkle on and off
      col[i3] = base[i3] * b; col[i3 + 1] = base[i3 + 1] * b; col[i3 + 2] = base[i3 + 2] * b;
      size[i] = size0[i] * (flags[i] & ROCKET ? 1 : 0.55 + 0.45 * u);
    }
    for (const n of ['position', 'color', 'aSize']) this.geo.getAttribute(n).needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Viewmodel
// ---------------------------------------------------------------------------

function buildViewmodel(wood: THREE.Material): { group: THREE.Group; tip: THREE.Object3D; glow: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = 'wand-viewmodel';
  const pts = [
    [0, -0.2], [0.0095, -0.2], [0.0105, -0.19], [0.0098, -0.17], [0.0112, -0.155], [0.0108, -0.135], [0.0118, -0.118],
    [0.0085, -0.105], [0.0092, -0.095], [0.0078, -0.08], [0.0068, 0.0], [0.0052, 0.1], [0.0038, 0.17], [0.0026, 0.2], [0, 0.205],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shaftGeo = new THREE.LatheGeometry(pts, 14).scale(0.82, 1, 0.82);
  shaftGeo.computeVertexNormals();
  const nrm = shaftGeo.getAttribute('normal');
  for (let i = 0; i < nrm.count; i++) if (Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i)) < 0.5) nrm.setXYZ(i, 0, Math.sign(shaftGeo.getAttribute('position').getY(i)) || 1, 0);
  const shaft = new THREE.Mesh(shaftGeo, wood);
  shaft.rotation.x = -Math.PI / 2; // along −Z (forward)
  group.add(shaft);
  // carved rings on the handle
  for (const y of [-0.165, -0.14, -0.1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0108, 0.0018, 5, 14), wood);
    ring.position.z = -y; // follows the shaft rotation (y → −z)
    group.add(ring);
  }
  const tip = new THREE.Object3D();
  tip.position.z = -0.205;
  group.add(tip);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.07),
    new THREE.ShaderMaterial({
      uniforms: { uI: { value: 0.3 }, uC: { value: new THREE.Color(0.55, 0.85, 1.0) } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uI; uniform vec3 uC; varying vec2 vUv; void main(){ float r = length(vUv-0.5)*2.0; gl_FragColor = vec4(uC * uI * (exp(-r*r*14.0)*2.0 + exp(-r*r*3.0)*0.4) * smoothstep(1.0,0.6,r), 1.0); }',
    }),
  );
  tip.add(glow);
  group.traverse((o) => {
    o.renderOrder = 1000;
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    // Drawn in the transparent pass at renderOrder 1000 = after everything else, never occluded.
    if (m) { m.depthTest = false; m.depthWrite = false; m.transparent = true; }
    o.frustumCulled = false;
  });
  return { group, tip, glow };
}

// ---------------------------------------------------------------------------
// Wand system
// ---------------------------------------------------------------------------

// Viewmodel pose: handle in the lower-right corner, tip reaching toward the crosshair.
const VM_HANDLE = new THREE.Vector3(0.2, -0.16, -0.3), VM_TIP = new THREE.Vector3(0.07, -0.06, -0.62);
const VM_DIR = VM_TIP.clone().sub(VM_HANDLE).normalize();
const VM_ROT = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), VM_DIR);
const VM_POS = VM_HANDLE.clone().addScaledVector(VM_DIR, 0.2);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const qFlick = new THREE.Quaternion();

interface Bolt { from: THREE.Vector3; to: THREE.Vector3; hit: WandHit | null; t: number; dur: number; seed: number }
interface Rocket { p: THREE.Vector3; v: THREE.Vector3; fuse: number; palette: THREE.Color[]; big: boolean }

const CYAN = new THREE.Color(0.35, 0.9, 1.6);
const GOLD = new THREE.Color(1.6, 1.05, 0.35);
const WHITE = new THREE.Color(1.6, 1.6, 1.7);
const PALETTES = [
  [new THREE.Color(2.2, 0.35, 1.4), new THREE.Color(1.8, 1.2, 0.3)], // Wheezes magenta & gold
  [new THREE.Color(0.4, 1.8, 0.6), new THREE.Color(1.6, 1.6, 0.4)],
  [new THREE.Color(2.0, 0.6, 0.2), new THREE.Color(1.8, 1.5, 0.9)],
  [new THREE.Color(0.6, 0.7, 2.2), new THREE.Color(1.2, 0.5, 2.0)],
];

export interface Wand {
  /** Add to the scene (sparks). */
  object: THREE.Object3D;
  /** The first-person viewmodel (parent it to the camera). */
  viewmodel: THREE.Group;
  /** Light sources for the pool (bolt head, impact flash, fireworks). */
  sources: LightSource[];
  events: WandEvents;
  showViewmodel(on: boolean): void;
  /** Cast along `ray` (from the camera). Returns the hit (if any). */
  cast(ray: THREE.Ray, fromTip?: boolean): WandHit | null;
  fireworks(base: THREE.Vector3, count?: number): void;
  setViewport(heightPx: number, fovDeg: number): void;
  update(dt: number, t: number, camera: THREE.Camera): void;
}

export function createWand(opts: { wood: THREE.Material; targets: WandTarget[]; maxDistance?: number }): Wand {
  const sparks = new Sparks();
  const rng = new SeededRandom('wand');
  const vm = buildViewmodel(opts.wood);
  const maxD = opts.maxDistance ?? 45;
  const bolts: Bolt[] = [];
  const rockets: Rocket[] = [];
  const pending: { at: number; base: THREE.Vector3; big: boolean }[] = [];
  const events: WandEvents = {};
  let now = 0, castAnim = 1, glowBoost = 0;
  let vmVisible = false;

  // Light sources: bolt head, impact flash, firework flash
  const headSrc: LightSource = { position: new THREE.Vector3(), color: new THREE.Color(0.6, 0.85, 1.0), distance: 10, decay: 1.6, intensity: () => headI };
  const impactSrc: LightSource = { position: new THREE.Vector3(), color: new THREE.Color(0.8, 0.9, 1.0), distance: 12, decay: 1.6, intensity: () => impactI };
  const fwSrc: LightSource = { position: new THREE.Vector3(), color: new THREE.Color(1, 0.5, 0.8), distance: 30, decay: 1.3, intensity: () => fwI };
  let headI = 0, impactI = 0, fwI = 0;

  const v = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), tmpDir = new THREE.Vector3();
  const rand3 = (s: number) => v.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(s);
  const sphere = (s: number) => { do rand3(1); while (v.lengthSq() > 1 || v.lengthSq() < 0.05); return v.normalize().multiplyScalar(s); };

  sparks.onDeath = (x, y, z) => {
    // crackle: a tiny white pop where a crackle star burns out
    p.set(x, y, z);
    for (let k = 0; k < 4; k++) sparks.emit(p, sphere(rng.range(1.5, 3)), WHITE, rng.range(0.08, 0.18), rng.range(0.05, 0.09), 3, -2, CRACKLE);
    if (rng.next() < 0.25) events.onCrackle?.(p.clone());
  };

  function impactBurst(at: THREE.Vector3, normalish: THREE.Vector3): void {
    for (let k = 0; k < 70; k++) {
      const col = k % 3 === 0 ? GOLD : CYAN;
      sphere(rng.range(1.2, 4.5)).addScaledVector(normalish, 1.5);
      sparks.emit(at, v, col, rng.range(0.4, 1.1), rng.range(0.05, 0.11), 2.6, -3.5, k % 4 === 0 ? CRACKLE : 0);
    }
    sparks.emit(at, v.set(0, 0, 0), WHITE, 0.18, 0.9, 0, 0);
    impactSrc.position.copy(at).addScaledVector(normalish, 0.4);
    impactI = 14;
  }

  function burst(r: Rocket): void {
    const n = r.big ? 150 : 90;
    const sp = r.big ? 8 : 6;
    for (let k = 0; k < n; k++) {
      const col = r.palette[k % r.palette.length];
      const crackle = k % 3 === 0;
      sparks.emit(r.p, sphere(sp * rng.range(0.75, 1.05)).add(r.v.clone().multiplyScalar(0.2)), col, rng.range(1.3, 2.2), rng.range(0.14, 0.24), 1.1, -3.2, crackle ? CRACKLE | SPAWNS_CRACKLE : 0);
    }
    sparks.emit(r.p, v.set(0, 0, 0), WHITE, 0.25, 3.2, 0, 0);
    fwSrc.position.copy(r.p);
    fwSrc.color.copy(r.palette[0]).multiplyScalar(0.5);
    fwI = r.big ? 60 : 40;
    events.onFireworkBurst?.(r.p.clone(), r.big);
  }

  const wand: Wand = {
    object: sparks.points,
    viewmodel: vm.group,
    sources: [headSrc, impactSrc, fwSrc],
    events,
    showViewmodel(on) { vmVisible = on; vm.group.visible = on; },
    cast(ray, fromTip = true) {
      let hit: WandHit | null = null;
      for (const t of opts.targets) {
        const h = t.test(ray, maxD);
        if (h && (!hit || h.distance < hit.distance)) hit = h;
      }
      const from = fromTip && vmVisible ? vm.tip.getWorldPosition(new THREE.Vector3()) : ray.at(0.6, new THREE.Vector3()).add(new THREE.Vector3(0, -0.15, 0));
      const to = hit ? hit.point.clone() : ray.at(maxD, new THREE.Vector3());
      const dist = from.distanceTo(to);
      bolts.push({ from, to, hit, t: 0, dur: Math.max(0.12, dist / 38), seed: rng.range(0, 100) });
      castAnim = 0;
      glowBoost = 1;
      // muzzle sparkle
      for (let k = 0; k < 18; k++) sparks.emit(from, sphere(rng.range(0.4, 1.4)).addScaledVector(ray.direction, 1.2), k % 2 ? GOLD : CYAN, rng.range(0.15, 0.4), rng.range(0.02, 0.04), 3, 0.5);
      events.onCast?.(from.clone());
      return hit;
    },
    fireworks(base, count = 5) {
      for (let k = 0; k < count; k++) pending.push({ at: now + k * rng.range(0.18, 0.4), base: base.clone(), big: k === count - 1 });
    },
    setViewport(h, fov) { sparks.setViewport(h, fov); },
    update(dt, t, camera) {
      now = t;
      // ---- bolts
      headI = 0;
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.t += dt;
        const u = Math.min(1, b.t / b.dur);
        const dir = tmpDir.copy(b.to).sub(b.from);
        const len = dir.length();
        dir.normalize();
        // corkscrew wobble around the path, shrinking at both ends
        const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
        const up2 = new THREE.Vector3().crossVectors(side, dir);
        const steps = Math.max(2, Math.ceil(len * 3 * dt / b.dur));
        for (let k = 0; k < steps; k++) {
          const uu = Math.max(0, u - (k / steps) * (dt / b.dur));
          const env = Math.sin(Math.PI * uu) * 0.12;
          const a = b.seed + uu * len * 2.2;
          p.copy(b.from).addScaledVector(dir, len * uu).addScaledVector(side, Math.cos(a) * env).addScaledVector(up2, Math.sin(a) * env);
          const gold = (k + Math.floor(t * 30)) % 3 === 0;
          sparks.emit(p, rand3(0.35), gold ? GOLD : CYAN, rng.range(0.35, 0.8), rng.range(0.025, 0.05), 2.2, -0.6, rng.next() < 0.2 ? CRACKLE : 0);
        }
        sparks.emit(p, v.set(0, 0, 0), WHITE, 0.04, 0.22, 0, 0); // bright head
        headSrc.position.copy(p);
        headI = 6;
        if (u >= 1) {
          bolts.splice(i, 1);
          if (b.hit) {
            impactBurst(b.to, dir.clone().negate());
            b.hit.apply?.();
            events.onImpact?.(b.hit);
          } else {
            // fizzles into the night
            for (let k = 0; k < 20; k++) sparks.emit(b.to, sphere(rng.range(0.5, 1.6)), k % 2 ? GOLD : CYAN, rng.range(0.3, 0.8), 0.04, 2, -1);
          }
        }
      }
      impactI *= Math.exp(-dt * 7);
      fwI *= Math.exp(-dt * 4.5);

      // ---- fireworks
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].at > t) continue;
        const { base, big } = pending[i];
        pending.splice(i, 1);
        rockets.push({
          p: base.clone().add(new THREE.Vector3(rng.range(-1.5, 1.5), 0, rng.range(-1.5, 1.5))),
          v: new THREE.Vector3(rng.range(-1.6, 1.6), rng.range(13, 17) + (big ? 2 : 0), rng.range(-1.6, 1.6)),
          fuse: rng.range(0.85, 1.2) + (big ? 0.2 : 0),
          palette: PALETTES[Math.floor(rng.range(0, PALETTES.length))],
          big,
        });
        events.onFireworkLaunch?.(base.clone());
      }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.fuse -= dt;
        r.v.y -= 6 * dt;
        r.p.addScaledVector(r.v, dt);
        for (let k = 0; k < 3; k++) sparks.emit(r.p, rand3(0.5).addScaledVector(r.v, -0.12), c.setRGB(1.6, 0.8, 0.3), rng.range(0.3, 0.6), rng.range(0.04, 0.07), 1.5, -2);
        sparks.emit(r.p, v.set(0, 0, 0), c.setRGB(2, 1.5, 0.9), 0.03, 0.16, 0, 0, ROCKET);
        if (r.fuse <= 0) { burst(r); rockets.splice(i, 1); }
      }
      sparks.update(dt);

      // ---- viewmodel: idle sway, cast flick, tip glow
      if (vmVisible) {
        castAnim = Math.min(1, castAnim + dt / 0.38);
        const flick = Math.sin(Math.PI * Math.min(1, castAnim * 1.6)) * (1 - castAnim);
        const sway = 0.006 * Math.sin(t * 1.3), bob = 0.004 * Math.sin(t * 2.1);
        vm.group.position.copy(VM_POS).add(v.set(sway, bob + flick * 0.025, -flick * 0.06));
        vm.group.quaternion.copy(VM_ROT).multiply(qFlick.setFromAxisAngle(X_AXIS, flick * 0.45));
        glowBoost *= Math.exp(-dt * 3);
        const glowMat = vm.glow.material as THREE.ShaderMaterial;
        glowMat.uniforms.uI.value = 0.35 + 0.08 * Math.sin(t * 3.3) + 2.2 * glowBoost;
        vm.glow.quaternion.copy(camera.quaternion).premultiply(vm.glow.parent!.getWorldQuaternion(new THREE.Quaternion()).invert());
      }
    },
  };
  wand.showViewmodel(false);
  return wand;
}
