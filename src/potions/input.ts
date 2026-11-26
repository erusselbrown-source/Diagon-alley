/**
 * Input for up to two wizards: keyboard (two layouts), gamepads and a touch pad.
 */
import { IS_TOUCH } from '../core/device';

export interface PadState {
  x: number; z: number;
  grab: boolean; use: boolean; dash: boolean; throw: boolean; swap: boolean;
}

const blank = (): PadState => ({ x: 0, z: 0, grab: false, use: false, dash: false, throw: false, swap: false });

const LAYOUTS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], grab: ['Space'], use: ['KeyE'], dash: ['ShiftLeft'], throw: ['KeyQ'], swap: ['Tab'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], grab: ['Enter', 'Period'], use: ['ShiftRight', 'Slash'], dash: ['ControlRight', 'Comma'], throw: ['Quote', 'KeyL'], swap: [] as string[] },
];

/** Edge-detected actions are true only in the frame they were pressed. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  /** In solo mode both layouts drive the one active wizard. */
  solo = true;
  readonly touch: PadState = blank();
  private touchEdges = { grab: false, dash: false, throw: false, swap: false };
  private padPrev: boolean[][] = [[], [], [], []];
  onPause: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  private any(codes: string[], set: Set<string>): boolean { return codes.some((c) => set.has(c)); }

  private readKeys(i: number): PadState {
    const L = LAYOUTS[i];
    return {
      x: (this.any(L.right, this.down) ? 1 : 0) - (this.any(L.left, this.down) ? 1 : 0),
      z: (this.any(L.down, this.down) ? 1 : 0) - (this.any(L.up, this.down) ? 1 : 0),
      grab: this.any(L.grab, this.pressed),
      use: this.any(L.use, this.down),
      dash: this.any(L.dash, this.pressed),
      throw: this.any(L.throw, this.pressed),
      swap: this.any(L.swap, this.pressed),
    };
  }

  private readPad(gp: Gamepad, slot: number): PadState {
    const prev = this.padPrev[slot];
    const b = gp.buttons.map((x) => x.pressed);
    const edge = (i: number) => !!b[i] && !prev[i];
    let x = gp.axes[0] ?? 0, z = gp.axes[1] ?? 0;
    if (Math.hypot(x, z) < 0.2) { x = 0; z = 0; }
    if (b[14]) x = -1; if (b[15]) x = 1; if (b[12]) z = -1; if (b[13]) z = 1;
    const s: PadState = { x, z, grab: edge(0), use: !!b[2], dash: edge(7) || edge(5), throw: edge(1), swap: edge(3) || edge(4) };
    this.padPrev[slot] = b;
    return s;
  }

  /** Poll once per frame; returns a state per player slot. */
  poll(): [PadState, PadState] {
    const k0 = this.readKeys(0), k1 = this.readKeys(1);
    const pads = (navigator.getGamepads?.() ?? []).filter((g): g is Gamepad => !!g);
    const p0 = pads[0] ? this.readPad(pads[0], 0) : blank();
    const p1 = pads[1] ? this.readPad(pads[1], 1) : blank();
    const t = this.touch;
    const tp: PadState = { x: t.x, z: t.z, grab: this.touchEdges.grab, use: t.use, dash: this.touchEdges.dash, throw: this.touchEdges.throw, swap: this.touchEdges.swap };
    this.touchEdges = { grab: false, dash: false, throw: false, swap: false };
    this.pressed.clear();
    const merge = (...s: PadState[]): PadState => {
      const o = blank();
      for (const p of s) {
        o.x += p.x; o.z += p.z;
        o.grab ||= p.grab; o.use ||= p.use; o.dash ||= p.dash; o.throw ||= p.throw; o.swap ||= p.swap;
      }
      const l = Math.hypot(o.x, o.z);
      if (l > 1) { o.x /= l; o.z /= l; }
      return o;
    };
    if (this.solo) return [merge(k0, k1, p0, p1, tp), blank()];
    return [merge(k0, p0, tp), merge(k1, p1)];
  }

  /** Floating left-thumb joystick + action buttons for phones/tablets. */
  mountTouch(root: HTMLElement): void {
    if (!IS_TOUCH) return;
    const zone = document.createElement('div');
    zone.className = 'cc-touch-zone';
    const knob = document.createElement('div');
    knob.className = 'cc-knob';
    zone.appendChild(knob);
    root.appendChild(zone);
    let id = -1, ox = 0, oy = 0;
    zone.addEventListener('pointerdown', (e) => {
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      zone.setPointerCapture(id);
      knob.style.display = 'block';
      knob.style.left = `${ox}px`; knob.style.top = `${oy}px`;
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const l = Math.hypot(dx, dy), R = 55;
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.touch.x = dx / R; this.touch.z = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1; this.touch.x = 0; this.touch.z = 0;
      knob.style.display = 'none';
      knob.style.transform = 'translate(-50%, -50%)';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    const btns = document.createElement('div');
    btns.className = 'cc-touch-btns';
    const mk = (label: string, cls: string, onDown: () => void, onUp?: () => void) => {
      const b = document.createElement('button');
      b.className = `cc-tbtn ${cls}`;
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); onDown(); });
      const up = () => { b.classList.remove('on'); onUp?.(); };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      b.addEventListener('pointercancel', up);
      btns.appendChild(b);
    };
    mk('Grab', 'grab', () => { this.touchEdges.grab = true; });
    mk('Cast', 'use', () => { this.touch.use = true; }, () => { this.touch.use = false; });
    mk('Throw', 'throw', () => { this.touchEdges.throw = true; });
    mk('Dash', 'dash', () => { this.touchEdges.dash = true; });
    mk('Swap', 'swap', () => { this.touchEdges.swap = true; });
    root.appendChild(btns);
  }
}
