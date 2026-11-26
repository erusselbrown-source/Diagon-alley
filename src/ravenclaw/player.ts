/**
 * First-person explorer for the tower room: pointer-lock mouse look, WASD /
 * arrows (Shift to hurry), head bob, collision against the room's walkable
 * plan (dodecagon + passage) and furniture circles / rotated rectangles.
 * Touch: left-thumb joystick to walk, drag elsewhere to look.
 * Also supports scripted "poses" (sitting, telescope) that blend the camera.
 */
import * as THREE from 'three';
import { EYE } from './layout';
import { IS_TOUCH } from '../core/device';
import type { TowerWalkArea } from './walkArea';

const RADIUS = 0.27;

export interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }

export class Player {
  readonly pos: THREE.Vector3;
  yaw = Math.PI; // facing −Z (toward the door from the landing)
  pitch = 0.02;
  enabled = false;
  /** Height of the floor under the walker's feet (eased) and the target floor height. */
  floorY = 0;
  private nextFloor = 0;
  private eyeFloor = 0;
  onStep: (() => void) | null = null;
  private keys = new Set<string>();
  private bob = 0;
  private lastBobSign = 1;
  private vel = new THREE.Vector2();
  private pose: Pose | null = null;
  private poseBlend = 0;
  private baseFov: number;
  readonly stick = new THREE.Vector2();
  private lookTouch: { id: number; x: number; y: number } | null = null;
  private moveTouch: { id: number; x0: number; y0: number } | null = null;
  readonly stickEl: HTMLDivElement | null = null;
  tapHandler: ((x: number, y: number) => void) | null = null;

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly dom: HTMLElement, start: THREE.Vector3, readonly area: TowerWalkArea) {
    this.pos = start.clone();
    this.baseFov = camera.fov;
    window.addEventListener('keydown', (e) => { this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.pose) return;
      // pointer lock may be refused in embedded frames: fall back to drag-to-look
      if (document.pointerLockElement !== this.dom && !(e.buttons & 1)) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.35, 1.35);
    });
    if (IS_TOUCH) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'fixed', width: '110px', height: '110px', borderRadius: '50%', border: '2px solid rgba(220,190,130,0.45)',
        background: 'rgba(20,30,70,0.25)', display: 'none', pointerEvents: 'none', zIndex: '20', transform: 'translate(-50%,-50%)',
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(el);
      (this as { stickEl: HTMLDivElement | null }).stickEl = el;
      let tapStart = { x: 0, y: 0, t: 0 };
      dom.addEventListener('touchstart', (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX < window.innerWidth * 0.42 && !this.moveTouch) {
            this.moveTouch = { id: t.identifier, x0: t.clientX, y0: t.clientY };
            el.style.display = 'block'; el.style.left = `${t.clientX}px`; el.style.top = `${t.clientY}px`;
          } else if (!this.lookTouch) {
            this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
            tapStart = { x: t.clientX, y: t.clientY, t: performance.now() };
          }
        }
        e.preventDefault();
      }, { passive: false });
      dom.addEventListener('touchmove', (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (this.moveTouch && t.identifier === this.moveTouch.id) {
            const dx = (t.clientX - this.moveTouch.x0) / 50, dy = (t.clientY - this.moveTouch.y0) / 50;
            this.stick.set(THREE.MathUtils.clamp(dx, -1, 1), THREE.MathUtils.clamp(-dy, -1, 1));
          } else if (this.lookTouch && t.identifier === this.lookTouch.id && !this.pose) {
            this.yaw -= (t.clientX - this.lookTouch.x) * 0.005;
            this.pitch = THREE.MathUtils.clamp(this.pitch - (t.clientY - this.lookTouch.y) * 0.005, -1.35, 1.35);
            this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY;
          }
        }
        e.preventDefault();
      }, { passive: false });
      const end = (e: TouchEvent) => {
        for (const t of Array.from(e.changedTouches)) {
          if (this.moveTouch && t.identifier === this.moveTouch.id) { this.moveTouch = null; this.stick.set(0, 0); el.style.display = 'none'; }
          if (this.lookTouch && t.identifier === this.lookTouch.id) {
            this.lookTouch = null;
            if (performance.now() - tapStart.t < 260 && Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) < 14) this.tapHandler?.(t.clientX, t.clientY);
          }
        }
      };
      dom.addEventListener('touchend', end);
      dom.addEventListener('touchcancel', end);
    }
  }

  isKey(code: string): boolean { return this.keys.has(code); }

  setPose(p: Pose | null): void { this.pose = p; if (p) this.stick.set(0, 0); }
  get posed(): boolean { return this.pose !== null; }

  blocked(x: number, z: number): boolean {
    this.area.refY = this.floorY;
    const h = this.area.sample(x, z, RADIUS);
    if (h === null) return true;
    this.nextFloor = h;
    return false;
  }

  update(dt: number): void {
    const cam = this.camera;
    let speed = 0;
    if (this.enabled && !this.pose) {
      const f = (this.isKey('KeyW') || this.isKey('ArrowUp') ? 1 : 0) - (this.isKey('KeyS') || this.isKey('ArrowDown') ? 1 : 0) + this.stick.y;
      const s = (this.isKey('KeyD') || this.isKey('ArrowRight') ? 1 : 0) - (this.isKey('KeyA') || this.isKey('ArrowLeft') ? 1 : 0) + this.stick.x;
      if (this.isKey('KeyQ')) this.yaw += dt * 1.8;
      if (this.isKey('KeyR')) this.yaw -= dt * 1.8;
      const run = this.isKey('ShiftLeft') || this.isKey('ShiftRight') ? 1.75 : 1;
      const target = new THREE.Vector2(s, f);
      if (target.lengthSq() > 1) target.normalize();
      target.multiplyScalar(2.2 * run);
      this.vel.lerp(target, Math.min(1, dt * 9));
      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      const fx = -sinY, fz = -cosY, rx = cosY, rz = -sinY;
      const dx = (fx * this.vel.y + rx * this.vel.x) * dt, dz = (fz * this.vel.y + rz * this.vel.x) * dt;
      const nx = this.pos.x + dx, nz = this.pos.z + dz;
      if (!this.blocked(nx, nz)) { this.pos.x = nx; this.pos.z = nz; }
      else if (!this.blocked(nx, this.pos.z)) this.pos.x = nx;
      else if (!this.blocked(this.pos.x, nz)) this.pos.z = nz;
      else this.vel.multiplyScalar(0.5);
      this.floorY = this.nextFloor;
      speed = this.vel.length();
    }
    // head bob + footsteps
    this.bob += dt * speed * 3.1;
    const bobY = Math.sin(this.bob * 2) * 0.028 * Math.min(1, speed / 2);
    const sign = Math.sign(Math.sin(this.bob * 2));
    if (sign < 0 && this.lastBobSign > 0 && speed > 0.6) this.onStep?.();
    this.lastBobSign = sign;

    // ease the eye toward the floor height so stair steps read as a smooth climb
    this.eyeFloor += (this.floorY - this.eyeFloor) * Math.min(1, dt * 10);
    const walkPos = new THREE.Vector3(this.pos.x, this.eyeFloor + EYE + bobY, this.pos.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, Math.sin(this.bob) * 0.004 * speed, 'YXZ'));
    this.poseBlend = THREE.MathUtils.clamp(this.poseBlend + (this.pose ? dt : -dt) * 1.6, 0, 1);
    const k = this.poseBlend * this.poseBlend * (3 - 2 * this.poseBlend);
    if (this.pose || k > 0) {
      const p = this.pose ?? this.lastPose!;
      this.lastPose = p;
      const lookM = new THREE.Matrix4().lookAt(p.pos, p.look, new THREE.Vector3(0, 1, 0));
      const pq = new THREE.Quaternion().setFromRotationMatrix(lookM);
      cam.position.copy(walkPos).lerp(p.pos, k);
      cam.quaternion.copy(q).slerp(pq, k);
      cam.fov = THREE.MathUtils.lerp(this.baseFovNow(), p.fov ?? this.baseFovNow(), k);
      cam.updateProjectionMatrix();
      if (!this.pose && k <= 0) this.lastPose = null;
    } else {
      cam.position.copy(walkPos);
      cam.quaternion.copy(q);
      if (cam.fov !== this.baseFovNow()) { cam.fov = this.baseFovNow(); cam.updateProjectionMatrix(); }
    }
  }

  private lastPose: Pose | null = null;
  private baseFovNow(): number { return this.camera.aspect < 1 ? 74 : this.baseFov; }
  setBaseFov(f: number): void { this.baseFov = f; }
}
