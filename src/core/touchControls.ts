/**
 * Phone / tablet controls, layered over the canvas:
 *  - a floating joystick wherever the left thumb lands (left ~45% of the screen)
 *  - drag anywhere else to look around
 *  - a quick tap anywhere casts a spell at what you tapped
 *  - round buttons (bottom-right): Tour, Weather, Sound
 * Multi-touch is tracked per pointerId, so you can walk and look at once.
 */

const SERIF = `'Palatino Linotype', 'Book Antiqua', Palatino, 'Iowan Old Style', Georgia, serif`;
const STICK_R = 58;       // px of thumb travel for full speed
const TAP_MS = 280, TAP_PX = 12;

export interface TouchHandlers {
  onTap(clientX: number, clientY: number): void;
  onLook(dx: number, dy: number): void;
  onTour(): void;
  onWeather(): void;
  /** Returns true if now muted. */
  onMute(): boolean;
}

interface Track { id: number; kind: 'stick' | 'look'; x0: number; y0: number; x: number; y: number; t0: number; moved: number }

export class TouchControls {
  private readonly layer: HTMLDivElement;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly buttons: HTMLDivElement;
  private readonly tourBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly tracks = new Map<number, Track>();
  private enabled = false;

  constructor(private readonly stick: { x: number; y: number }, private readonly h: TouchHandlers) {
    const style = document.createElement('style');
    style.textContent = `
      html, body { touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
      .da-tbtn { width: 58px; height: 58px; border-radius: 50%; border: 1px solid rgba(243,220,178,0.45);
        background: radial-gradient(circle at 50% 35%, rgba(70,50,30,0.72), rgba(16,11,7,0.72)); color: #f6e6c4;
        font: 600 11px ${SERIF}; letter-spacing: 0.06em; display: flex; align-items: center; justify-content: center; text-align: center;
        box-shadow: 0 4px 14px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,210,0.15); touch-action: none; -webkit-tap-highlight-color: transparent; padding: 0; }
      .da-tbtn:active { transform: scale(0.94); background: radial-gradient(circle at 50% 35%, rgba(120,90,50,0.8), rgba(30,20,10,0.8)); }
    `;
    document.head.appendChild(style);

    this.layer = document.createElement('div');
    Object.assign(this.layer.style, { position: 'fixed', inset: '0', zIndex: '15', touchAction: 'none', display: 'none' } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.layer);

    const ring = (size: number, css: Partial<CSSStyleDeclaration>) => {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'fixed', width: `${size}px`, height: `${size}px`, marginLeft: `${-size / 2}px`, marginTop: `${-size / 2}px`,
        borderRadius: '50%', pointerEvents: 'none', opacity: '0', transition: 'opacity 0.2s', zIndex: '16', ...css,
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(d);
      return d;
    };
    this.base = ring(STICK_R * 2 + 20, { border: '1.5px solid rgba(243,220,178,0.35)', background: 'radial-gradient(circle, rgba(243,220,178,0.06), rgba(243,220,178,0.14))' });
    this.knob = ring(48, { background: 'radial-gradient(circle at 45% 35%, rgba(255,244,220,0.85), rgba(200,160,100,0.55))', boxShadow: '0 0 14px rgba(150,220,255,0.45)' });

    this.buttons = document.createElement('div');
    Object.assign(this.buttons.style, {
      position: 'fixed', zIndex: '21', display: 'none', gap: '12px',
      right: 'max(14px, env(safe-area-inset-right, 0px))', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 18px)',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.buttons);
    const btn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'da-tbtn';
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); fn(); });
      this.buttons.appendChild(b);
      return b;
    };
    this.tourBtn = btn('Tour', () => h.onTour());
    btn('Weather', () => h.onWeather());
    this.muteBtn = btn('Sound', () => { this.muteBtn.textContent = h.onMute() ? 'Muted' : 'Sound'; });

    const L = this.layer;
    L.addEventListener('pointerdown', (e) => this.down(e));
    L.addEventListener('pointermove', (e) => this.move(e));
    L.addEventListener('pointerup', (e) => this.up(e));
    L.addEventListener('pointercancel', (e) => this.up(e, true));
    // iOS: stop the page itself from scrolling / zooming / long-press menus
    for (const ev of ['touchstart', 'touchmove'] as const) L.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.layer.style.display = on ? 'block' : 'none';
    this.buttons.style.display = on ? 'flex' : 'none';
    if (!on) this.reset();
  }

  /** Walking shows the stick; during the tour only the buttons remain (Tour reads "Walk"). */
  setTouring(on: boolean): void {
    this.tourBtn.textContent = on ? 'Walk' : 'Tour';
    if (on) this.reset();
  }

  private reset(): void {
    this.tracks.clear();
    this.stick.x = this.stick.y = 0;
    this.base.style.opacity = this.knob.style.opacity = '0';
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    try { this.layer.setPointerCapture(e.pointerId); } catch { /* synthetic / already released */ }
    const hasStick = [...this.tracks.values()].some((t) => t.kind === 'stick');
    const kind: Track['kind'] = !hasStick && e.clientX < window.innerWidth * 0.45 ? 'stick' : 'look';
    this.tracks.set(e.pointerId, { id: e.pointerId, kind, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0 });
    if (kind === 'stick') {
      for (const d of [this.base, this.knob]) { d.style.left = `${e.clientX}px`; d.style.top = `${e.clientY}px`; d.style.opacity = '1'; }
    }
  }

  private move(e: PointerEvent): void {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    e.preventDefault();
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX; t.y = e.clientY;
    t.moved = Math.max(t.moved, Math.hypot(t.x - t.x0, t.y - t.y0));
    if (t.kind === 'look') { this.h.onLook(dx, dy); return; }
    let sx = t.x - t.x0, sy = t.y - t.y0;
    const len = Math.hypot(sx, sy);
    if (len > STICK_R) { sx *= STICK_R / len; sy *= STICK_R / len; }
    this.knob.style.left = `${t.x0 + sx}px`; this.knob.style.top = `${t.y0 + sy}px`;
    // a small dead zone, then a smooth response curve
    const m = Math.max(0, Math.min(1, (Math.min(len, STICK_R) / STICK_R - 0.1) / 0.9));
    const k = len > 0 ? (m * m * (3 - 2 * m)) / (Math.min(len, STICK_R) / STICK_R || 1) : 0;
    this.stick.x = (sx / STICK_R) * k;
    this.stick.y = (-sy / STICK_R) * k;
  }

  private up(e: PointerEvent, cancelled = false): void {
    const t = this.tracks.get(e.pointerId);
    if (!t) return;
    this.tracks.delete(e.pointerId);
    if (t.kind === 'stick') {
      this.stick.x = this.stick.y = 0;
      this.base.style.opacity = this.knob.style.opacity = '0';
    }
    if (!cancelled && t.moved < TAP_PX && performance.now() - t.t0 < TAP_MS) this.h.onTap(e.clientX, e.clientY);
  }
}
