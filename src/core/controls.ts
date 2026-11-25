/**
 * Exploration camera: three modes sharing one PerspectiveCamera.
 *
 *  - `orbit` — the development OrbitControls (also the idle view behind the
 *    title card).
 *  - `walk`  — first-person PointerLock WASD + mouse-look at eye height
 *    (1.68 m): smooth acceleration/damping, gentle head-bob with footfall
 *    events, and collision against a `WalkArea` (the street corridors), with
 *    wall sliding.
 *  - `tour`  — a cinematic crane move along a keyframed `TourPath`; the
 *    camera follows the path through a critically-damped spring, so segment
 *    speed changes never jerk.
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'orbit' | 'walk' | 'tour';

/** Where a walker may stand. */
export interface WalkArea {
  /** Ground height at (x, z) if a body of radius `margin` fits there, else null. `solidOnly` ignores thin posts (for ray-marching). */
  sample(x: number, z: number, margin: number, solidOnly?: boolean): number | null;
  /** Nearest standable point (used when leaving the tour / orbit). */
  snap(p: THREE.Vector3): THREE.Vector3;
}

export interface TourKey {
  /** Seconds from the start of the tour. */
  t: number;
  pos: THREE.Vector3;
  look: THREE.Vector3;
}

export interface TourPath {
  keys: TourKey[];
  /** Fired once when the tour starts (e.g. open the archway). */
  onStart?(): void;
}

const EYE = 1.68;
const BODY = 0.3;
const WALK_SPEED = 1.55, RUN_SPEED = 3.4;
const STRIDE = 0.74; // metres per footstep

export interface ExplorerOptions {
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  orbit: OrbitControls;
  area: WalkArea;
}

export class ExplorerControls {
  mode: CameraMode = 'orbit';
  readonly camera: THREE.PerspectiveCamera;
  readonly orbit: OrbitControls;
  readonly area: WalkArea;
  /** Pointer currently locked to the canvas. */
  locked = false;
  /** Walk-mode input suspended (title card / paused). */
  frozen = false;
  /** Analog stick input from touch controls: x = strafe right, y = forward, each −1..1. */
  readonly stick = { x: 0, y: 0 };

  onModeChange?: (mode: CameraMode) => void;
  onLockChange?: (locked: boolean) => void;
  /** A footfall at `pos`; `speed` in m/s. */
  onStep?: (pos: THREE.Vector3, speed: number) => void;

  private readonly dom: HTMLElement;
  private readonly keys = new Set<string>();
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private yaw = 0; private pitch = 0;
  private yawT = 0; private pitchT = 0;
  private ground = 0;
  private bobPhase = 0; private bobAmp = 0;
  private drag: { x: number; y: number; moved: boolean } | null = null;

  // tour state
  private tour: { path: TourPath; posCurve: THREE.CatmullRomCurve3; lookCurve: THREE.CatmullRomCurve3; t: number; dur: number } | null = null;
  private readonly tourPos = new THREE.Vector3();
  private readonly tourLook = new THREE.Vector3();
  private readonly tourVel = new THREE.Vector3();
  private readonly tourLookVel = new THREE.Vector3();
  /** Dev aid: force tour time (seconds) instead of advancing it. */
  tourDebugTime: number | null = null;

  constructor(o: ExplorerOptions) {
    this.camera = o.camera;
    this.orbit = o.orbit;
    this.area = o.area;
    this.dom = o.dom;
    const el = this.dom;
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (this.locked) this.keys.clear();
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (this.mode !== 'walk' || !this.locked) return;
      this.look(e.movementX, e.movementY, 0.0021);
    });
    // Fallback look without pointer lock: drag.
    el.addEventListener('pointerdown', (e) => { if (this.mode === 'walk' && !this.locked) this.drag = { x: e.clientX, y: e.clientY, moved: false }; });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.mode !== 'walk' || this.locked) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
      this.look(-dx, -dy, 0.004); // drag the world
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    window.addEventListener('pointerup', () => { this.drag = null; });
    window.addEventListener('keydown', (e) => { if (!e.metaKey && !e.ctrlKey) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** True when the last pointerdown in walk mode turned into a drag-look (so it isn't a click). */
  get wasDrag(): boolean { return !!this.drag?.moved; }

  /** Touch look: drag deltas in CSS pixels. */
  addLook(dx: number, dy: number): void { if (this.mode === 'walk') this.look(dx, dy, 0.0045); }

  private look(dx: number, dy: number, k: number): void {
    this.yawT -= dx * k;
    this.pitchT = THREE.MathUtils.clamp(this.pitchT - dy * k, -1.3, 1.3);
  }

  requestLock(): void {
    if (this.locked) return;
    try {
      const r = this.dom.requestPointerLock?.() as unknown as Promise<void> | undefined;
      r?.catch?.(() => { /* headless / denied: drag-look still works */ });
    } catch { /* not supported */ }
  }

  exitLock(): void { if (this.locked) document.exitPointerLock(); }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    const prev = this.mode;
    this.mode = mode;
    this.orbit.enabled = mode === 'orbit';
    if (mode === 'walk') {
      // Start walking where the camera is (snapped onto walkable ground), facing the same way.
      const p = this.area.snap(this.camera.position.clone());
      this.pos.set(p.x, 0, p.z);
      this.ground = this.area.sample(p.x, p.z, 0) ?? p.y;
      const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
      this.yaw = this.yawT = e.y;
      this.pitch = this.pitchT = THREE.MathUtils.clamp(e.x, -0.6, 0.6);
      this.vel.set(0, 0, 0);
    }
    if (prev === 'tour') this.tour = null;
    if (mode === 'orbit') {
      const fwd = this.camera.getWorldDirection(new THREE.Vector3());
      this.orbit.target.copy(this.camera.position).addScaledVector(fwd, 6);
      this.orbit.update();
    }
    this.onModeChange?.(mode);
  }

  startTour(path: TourPath): void {
    const keys = path.keys;
    this.tour = {
      path,
      posCurve: new THREE.CatmullRomCurve3(keys.map((k) => k.pos), false, 'centripetal', 0.5),
      lookCurve: new THREE.CatmullRomCurve3(keys.map((k) => k.look), false, 'centripetal', 0.5),
      t: 0,
      dur: keys[keys.length - 1].t,
    };
    // Begin from the first key exactly (the tour is a scripted shot, not a continuation).
    this.tourPos.copy(keys[0].pos); this.tourLook.copy(keys[0].look);
    this.tourVel.set(0, 0, 0); this.tourLookVel.set(0, 0, 0);
    this.setMode('tour');
    path.onStart?.();
  }

  /** Place the walker at (x, z) (snapped to walkable ground). */
  teleport(x: number, z: number): void {
    const p = this.area.snap(new THREE.Vector3(x, 0, z));
    this.pos.set(p.x, 0, p.z);
    this.ground = this.area.sample(p.x, p.z, 0) ?? p.y;
    this.vel.set(0, 0, 0);
  }

  /** Turn the walker's head toward a world point. */
  aim(target: THREE.Vector3): void {
    const eye = new THREE.Vector3(this.pos.x, this.ground + EYE, this.pos.z);
    const d = target.clone().sub(eye);
    this.yaw = this.yawT = Math.atan2(-d.x, -d.z);
    this.pitch = this.pitchT = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -1.3, 1.3);
  }

  /** Walker position on the ground (x, ground, z). */
  get feet(): THREE.Vector3 { return new THREE.Vector3(this.pos.x, this.ground, this.pos.z); }

  /** Tour progress 0..1 (0 when not touring). */
  get tourProgress(): number { return this.tour ? Math.min(1, this.tour.t / this.tour.dur) : 0; }

  update(dt: number): void {
    if (this.mode === 'orbit') { this.orbit.update(); return; }
    if (this.mode === 'tour') { this.updateTour(dt); return; }
    this.updateWalk(dt);
  }

  // -------------------------------------------------------------------------

  /** Map tour time to curve parameter: keys sit at u = i/(n−1), linear in time between them. */
  private tourU(t: number): number {
    const keys = this.tour!.path.keys, n = keys.length;
    if (t <= keys[0].t) return 0;
    for (let i = 1; i < n; i++) {
      if (t <= keys[i].t) {
        const a = keys[i - 1].t, b = keys[i].t;
        return (i - 1 + (t - a) / Math.max(1e-6, b - a)) / (n - 1);
      }
    }
    return 1;
  }

  private updateTour(dt: number): void {
    const tour = this.tour!;
    const forced = this.tourDebugTime !== null;
    tour.t = forced ? this.tourDebugTime! : tour.t + dt;
    const u = this.tourU(tour.t);
    const p = tour.posCurve.getPoint(u), l = tour.lookCurve.getPoint(u);
    if (forced) {
      this.tourPos.copy(p); this.tourLook.copy(l);
    } else {
      // critically damped springs (ω = 3.2 / 4.5 rad/s) smooth out per-segment speed changes
      spring(this.tourPos, this.tourVel, p, 3.2, dt);
      spring(this.tourLook, this.tourLookVel, l, 4.5, dt);
    }
    this.camera.position.copy(this.tourPos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.tourLook);
    if (!forced && tour.t > tour.dur + 1.5) this.setMode('walk');
  }

  private updateWalk(dt: number): void {
    const k = this.keys;
    let f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let r = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let run = k.has('ShiftLeft') || k.has('ShiftRight');
    let amount = 1;
    const stickMag = Math.hypot(this.stick.x, this.stick.y);
    if (!f && !r && stickMag > 0.08) {
      // analog stick: gentle near the centre, jogging at full throw
      f = this.stick.y; r = this.stick.x;
      amount = Math.min(1, stickMag);
      run = stickMag > 0.95;
    }
    const wish = new THREE.Vector3();
    if (!this.frozen && (f || r)) {
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      // forward = (−sin yaw, −cos yaw); right = (cos yaw, −sin yaw)
      wish.set(-sy * f + cy * r, 0, -cy * f - sy * r).normalize().multiplyScalar((run ? RUN_SPEED : WALK_SPEED) * amount);
    }
    // smooth acceleration / damping
    const rate = wish.lengthSq() > 0 ? 7 : 9;
    this.vel.lerp(wish, 1 - Math.exp(-rate * dt));
    if (this.vel.lengthSq() < 1e-5) this.vel.set(0, 0, 0);

    // move with collision + wall sliding, in small sub-steps
    const step = this.vel.clone().multiplyScalar(dt);
    const n = Math.max(1, Math.ceil(step.length() / 0.12));
    step.divideScalar(n);
    for (let i = 0; i < n; i++) {
      const nx = this.pos.x + step.x, nz = this.pos.z + step.z;
      if (this.area.sample(nx, nz, BODY) !== null) { this.pos.x = nx; this.pos.z = nz; continue; }
      if (step.x && this.area.sample(nx, this.pos.z, BODY) !== null) { this.pos.x = nx; this.vel.z *= 0.6; continue; }
      if (step.z && this.area.sample(this.pos.x, nz, BODY) !== null) { this.pos.z = nz; this.vel.x *= 0.6; continue; }
      this.vel.multiplyScalar(0.3);
      break;
    }

    // ground follow: quick up a curb, softer down
    const g = this.area.sample(this.pos.x, this.pos.z, 0) ?? this.ground;
    this.ground += (g - this.ground) * (1 - Math.exp(-(g > this.ground ? 14 : 9) * dt));

    // head-bob, scaled by speed; a footfall every STRIDE metres
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.bobAmp += (Math.min(1, speed / WALK_SPEED) - this.bobAmp) * (1 - Math.exp(-6 * dt));
    const before = Math.floor(this.bobPhase / Math.PI);
    this.bobPhase += (speed * dt / STRIDE) * Math.PI;
    if (Math.floor(this.bobPhase / Math.PI) !== before && speed > 0.4) this.onStep?.(new THREE.Vector3(this.pos.x, this.ground, this.pos.z), speed);
    const runK = THREE.MathUtils.clamp(speed / RUN_SPEED, 0, 1);
    const bobY = -this.bobAmp * (0.022 + 0.018 * runK) * (1 - Math.abs(Math.sin(this.bobPhase)));
    const sway = this.bobAmp * 0.012 * Math.sin(this.bobPhase);

    // look smoothing (light — pointer-lock look should feel direct)
    const kl = 1 - Math.exp(-28 * dt);
    this.yaw += (this.yawT - this.yaw) * kl;
    this.pitch += (this.pitchT - this.pitch) * kl;

    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.camera.position.set(this.pos.x + cy * sway, this.ground + EYE + bobY, this.pos.z - sy * sway);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, -sway * 0.35, 'YXZ'));
  }
}

/** Critically damped spring step toward `target` (semi-implicit, stable for large dt). */
function spring(x: THREE.Vector3, v: THREE.Vector3, target: THREE.Vector3, omega: number, dt: number): void {
  const f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo;
  const det = 1 / (f + hhoo);
  for (const c of ['x', 'y', 'z'] as const) {
    const xn = (f * x[c] + dt * v[c] + hhoo * target[c]) * det;
    v[c] = (v[c] + hoo * (target[c] - x[c])) * det;
    x[c] = xn;
  }
}
