/**
 * Minimal overlay UI: a parchment title card ("DIAGON ALLEY — Click to
 * Enter") that fades into an unobtrusive controls hint, a crosshair dot for
 * walking, cinematic letterbox bars for the tour, and small spell toasts.
 *
 * The parchment texture is painted procedurally on a canvas (no image URLs).
 */

const SERIF = `'Palatino Linotype', 'Book Antiqua', Palatino, 'Iowan Old Style', Georgia, serif`;

function parchmentDataUrl(w = 640, h = 420): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.65);
  grad.addColorStop(0, '#f1e2bf');
  grad.addColorStop(0.65, '#e2c995');
  grad.addColorStop(1, '#b8915a');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // fibres & mottling (deterministic LCG)
  let s = 1234567;
  const r = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${90 + r() * 60 | 0},${60 + r() * 40 | 0},${25 + r() * 25 | 0},${r() * 0.05})`;
    const x = r() * w, y = r() * h, rad = 2 + r() * 22;
    g.beginPath(); g.ellipse(x, y, rad, rad * (0.4 + r() * 0.6), r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(110,75,35,0.08)';
  for (let i = 0; i < 260; i++) {
    const x = r() * w, y = r() * h, l = 10 + r() * 40, a = r() * 0.6 - 0.3;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // foxing spots
  for (let i = 0; i < 30; i++) {
    const x = r() * w, y = r() * h, rad = 3 + r() * 9;
    const f = g.createRadialGradient(x, y, 0, x, y, rad);
    f.addColorStop(0, 'rgba(120,70,25,0.18)'); f.addColorStop(1, 'rgba(120,70,25,0)');
    g.fillStyle = f; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c.toDataURL('image/jpeg', 0.85);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration>, parent?: HTMLElement, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (html !== undefined) e.innerHTML = html;
  parent?.appendChild(e);
  return e;
}

const key = (k: string) => `<span style="display:inline-block;min-width:1.6em;padding:1px 6px;margin-right:6px;border:1px solid rgba(243,220,178,0.45);border-bottom-width:2px;border-radius:4px;font:600 11px ${SERIF};letter-spacing:0.06em;color:#f6e6c4;background:rgba(255,240,210,0.06);text-align:center">${k}</span>`;

export class Overlay {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly bars: HTMLDivElement[];
  private readonly toastEl: HTMLDivElement;
  private readonly paused: HTMLDivElement;
  private hintTimer = 0;
  private toastTimer = 0;

  constructor(private readonly touch = false) {
    const style = document.createElement('style');
    style.textContent = `
      @keyframes da-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
      @keyframes da-rise { from { opacity: 0; transform: translateY(14px) scale(.985) } to { opacity: 1; transform: none } }
    `;
    document.head.appendChild(style);
    this.root = el('div', { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '20', fontFamily: SERIF }, document.body);

    // ---- Title card
    this.title = el('div', {
      position: 'absolute', inset: '0', display: 'none', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto', cursor: 'pointer',
      background: 'radial-gradient(ellipse at center, rgba(8,8,18,0.25) 0%, rgba(4,4,10,0.78) 75%)', transition: 'opacity 1.2s ease',
    }, this.root);
    const card = el('div', {
      position: 'relative', width: 'min(520px, 86vw)', padding: '44px 36px 34px', textAlign: 'center', color: '#3a2412',
      backgroundImage: `url(${parchmentDataUrl()})`, backgroundSize: 'cover', borderRadius: '3px',
      boxShadow: '0 30px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(60,35,10,0.35), inset 0 0 60px rgba(110,70,25,0.45)',
      animation: 'da-rise 1.4s ease both',
    }, this.title);
    el('div', { position: 'absolute', inset: '10px', border: '1px solid rgba(90,55,20,0.45)', outline: '1px solid rgba(90,55,20,0.25)', outlineOffset: '-5px', pointerEvents: 'none' }, card);
    el('div', { font: `italic 13px ${SERIF}`, letterSpacing: '0.32em', textTransform: 'uppercase', opacity: '0.7', marginBottom: '14px' }, card, 'London &middot; behind the Leaky Cauldron');
    el('div', { font: `600 clamp(34px, 7vw, 54px) ${SERIF}`, letterSpacing: '0.16em', lineHeight: '1.05', textShadow: '0 1px 0 rgba(255,240,210,0.5)' }, card, 'DIAGON&nbsp;ALLEY');
    el('div', { margin: '16px auto 18px', width: '62%', height: '12px', opacity: '0.65' }, card,
      `<svg viewBox="0 0 200 12" width="100%" height="12"><path d="M0 6 H84 M116 6 H200" stroke="#5a3814" stroke-width="0.8"/><path d="M100 1 L105 6 L100 11 L95 6 Z" fill="#5a3814"/><circle cx="88" cy="6" r="1.4" fill="#5a3814"/><circle cx="112" cy="6" r="1.4" fill="#5a3814"/></svg>`);
    el('div', { font: `16px ${SERIF}`, letterSpacing: '0.24em', textTransform: 'uppercase', animation: 'da-pulse 2.4s ease-in-out infinite' }, card, touch ? 'Tap to Enter' : 'Click to Enter');
    el('div', { font: `italic 12px ${SERIF}`, opacity: '0.6', marginTop: '14px' }, card, 'sound on &middot; headphones recommended');

    // ---- Controls hint
    this.hint = el('div', {
      position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: touch ? '6px 14px' : '16px', flexWrap: 'wrap', justifyContent: 'center',
      ...(touch ? { top: 'calc(env(safe-area-inset-top, 0px) + 64px)' } : { bottom: '18px' }),
      padding: '8px 16px', borderRadius: '20px', background: 'rgba(12,9,6,0.5)', border: '1px solid rgba(243,220,178,0.16)',
      font: `12px ${SERIF}`, color: 'rgba(243,226,196,0.9)', letterSpacing: '0.04em', opacity: '0', transition: 'opacity 1.2s ease', maxWidth: '92vw',
    }, this.root, [
      ...(touch
        ? [[key('Left thumb'), 'Move'], [key('Drag'), 'Look'], [key('Tap'), 'Cast Spell']]
        : [[key('WASD'), 'Move'], [key('Click'), 'Cast Spell'], [key('C'), 'Cinematic Tour'], [key('1/2/3'), 'Weather'], [key('M'), 'Mute']]),
    ].map(([k, t]) => `<span style="white-space:nowrap">${k}${t}</span>`).join(''));

    // ---- Paused notice (pointer lock released)
    this.paused = el('div', {
      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: '10px 22px', borderRadius: '20px',
      background: 'rgba(12,9,6,0.55)', border: '1px solid rgba(243,220,178,0.2)', color: '#f3dcb2', font: `14px ${SERIF}`, letterSpacing: '0.12em',
      opacity: '0', transition: 'opacity 0.4s',
    }, this.root, 'Click to resume');

    // ---- Crosshair
    this.crosshair = el('div', {
      position: 'absolute', left: '50%', top: '50%', width: '4px', height: '4px', margin: '-2px 0 0 -2px', borderRadius: '50%',
      background: 'rgba(255,244,220,0.85)', boxShadow: '0 0 6px rgba(150,220,255,0.8)', opacity: '0', transition: 'opacity 0.4s',
    }, this.root);

    // ---- Letterbox
    this.bars = ['top', 'bottom'].map((side) => el('div', {
      position: 'absolute', left: '0', right: '0', [side]: '0', height: '9vh', background: '#000',
      transform: `translateY(${side === 'top' ? '-100%' : '100%'})`, transition: 'transform 1.1s cubic-bezier(.6,0,.2,1)',
    } as Partial<CSSStyleDeclaration>, this.root));
    el('div', {
      position: 'absolute', right: '24px', bottom: touch ? '12px' : '50%', transform: touch ? 'none' : 'translateY(50%)', color: 'rgba(243,220,178,0.55)', font: `italic 12px ${SERIF}`, letterSpacing: '0.18em',
    }, this.bars[touch ? 0 : 1], touch ? 'Cinematic Tour &middot; tap Walk to explore' : 'Cinematic Tour &middot; press C to walk');

    // ---- Toast (spell names, weather)
    this.toastEl = el('div', {
      position: 'absolute', left: '50%', top: '18%', transform: 'translateX(-50%)', color: '#f6e6c4', font: `italic 22px ${SERIF}`, letterSpacing: '0.12em',
      textShadow: '0 0 14px rgba(140,210,255,0.7), 0 2px 6px rgba(0,0,0,0.8)', opacity: '0', transition: 'opacity 0.5s',
    }, this.root);
  }

  /** Show the title card; resolves on the first click/key (a user gesture — start audio inside `onEnter`). */
  showTitle(onEnter: () => void): () => void {
    this.title.style.display = 'flex';
    this.title.style.opacity = '1';
    const go = () => {
      this.title.removeEventListener('click', go);
      window.removeEventListener('keydown', onKey);
      onEnter();
      this.title.style.opacity = '0';
      this.title.style.pointerEvents = 'none';
      setTimeout(() => { this.title.style.display = 'none'; }, 1300);
      this.showHint();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') go(); };
    this.title.addEventListener('click', go);
    window.addEventListener('keydown', onKey);
    return go;
  }

  get titleVisible(): boolean { return this.title.style.display !== 'none' && this.title.style.opacity !== '0'; }

  /** Bring the controls hint up, then let it settle to a faint whisper. */
  showHint(): void {
    this.hint.style.opacity = '1';
    clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => { this.hint.style.opacity = '0.32'; }, 7000);
  }

  setWalking(on: boolean): void { this.crosshair.style.opacity = on && !this.touch ? '1' : '0'; }
  setPaused(on: boolean): void { this.paused.style.opacity = on ? '1' : '0'; if (on) this.showHint(); }

  setLetterbox(on: boolean): void {
    this.bars[0].style.transform = on ? 'none' : 'translateY(-100%)';
    this.bars[1].style.transform = on ? 'none' : 'translateY(100%)';
    this.hint.style.visibility = on ? 'hidden' : 'visible';
  }

  toast(text: string, color = 'rgba(140,210,255,0.7)'): void {
    this.toastEl.textContent = text;
    this.toastEl.style.textShadow = `0 0 14px ${color}, 0 2px 6px rgba(0,0,0,0.8)`;
    this.toastEl.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastEl.style.opacity = '0'; }, 1300);
  }
}
