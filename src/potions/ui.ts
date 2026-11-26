/**
 * DOM HUD and menus: order tickets, clock, score, station progress tags,
 * popups, toasts, title / level select, countdown, pause and results.
 */
import { INGREDIENTS, LEVELS, POTIONS, type LevelDef, type PotionId } from './data';
import type { IconKey } from './icons';
import { IS_TOUCH } from '../core/device';

const CSS = /* css */ `
:root { --ink: #2b1a0c; --parch: #f1e2bf; --parch2: #e2c992; --gold: #f2c45a; --night: #0b0a14; }
#cc-ui { position: fixed; inset: 0; pointer-events: none; font-family: Georgia, 'Palatino Linotype', 'Book Antiqua', serif; color: #fff; z-index: 20; user-select: none; -webkit-user-select: none; }
#cc-ui * { box-sizing: border-box; }
.cc-orders { position: absolute; top: 10px; left: 112px; right: 200px; display: flex; gap: 10px; align-items: flex-start; }
.cc-order { width: 148px; background: linear-gradient(180deg, var(--parch), var(--parch2)); color: var(--ink); border-radius: 8px; padding: 6px 8px 8px; box-shadow: 0 6px 18px rgba(0,0,0,.5), inset 0 0 0 2px rgba(120,80,30,.35); transform-origin: top center; animation: cc-drop .45s cubic-bezier(.2,1.6,.4,1); position: relative; }
.cc-order.first { box-shadow: 0 6px 18px rgba(0,0,0,.5), inset 0 0 0 2px rgba(120,80,30,.35), 0 0 0 3px var(--gold); }
.cc-order.urgent { animation: cc-shake .4s infinite; }
.cc-order.gone { animation: cc-fly .5s forwards ease-in; }
.cc-order.failed { animation: cc-fail .6s forwards ease-in; }
.cc-order .t { font-size: 12px; font-weight: bold; font-style: italic; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-order .row { display: flex; align-items: center; justify-content: center; gap: 2px; margin-top: 2px; }
.cc-order .flask { width: 46px; height: 46px; filter: drop-shadow(0 0 6px var(--glow)); }
.cc-order .ings { display: flex; gap: 2px; justify-content: center; background: rgba(80,50,20,.12); border-radius: 6px; padding: 2px; }
.cc-order .ing { width: 32px; height: 32px; position: relative; }
.cc-order .ing img { width: 100%; height: 100%; }
.cc-order .bar { height: 6px; border-radius: 3px; background: rgba(60,30,10,.25); margin-top: 5px; overflow: hidden; }
.cc-order .bar i { display: block; height: 100%; background: #5fbf4a; border-radius: 3px; transition: background .3s; }
.cc-clock { position: absolute; top: 10px; right: 12px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.cc-time { background: rgba(10,8,20,.75); border: 2px solid rgba(242,196,90,.6); border-radius: 30px; padding: 6px 16px; font-size: 26px; font-weight: bold; min-width: 108px; text-align: center; text-shadow: 0 2px 0 #000; }
.cc-time.hurry { color: #ff6a4a; animation: cc-pulse .5s infinite alternate; }
.cc-score { display: flex; align-items: center; gap: 8px; background: rgba(10,8,20,.75); border: 2px solid rgba(242,196,90,.6); border-radius: 30px; padding: 4px 14px 4px 6px; font-size: 24px; font-weight: bold; }
.cc-coin { width: 30px; height: 30px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fff3b0, #f2c45a 45%, #a8741a); box-shadow: inset 0 0 0 2px #8a5a10; display: grid; place-items: center; color: #6a4008; font-size: 15px; }
.cc-score.bump { animation: cc-bump .35s; }
.cc-streak { font-size: 14px; color: var(--gold); text-shadow: 0 1px 0 #000; opacity: 0; transition: opacity .3s; }
.cc-streak.on { opacity: 1; }
.cc-tag { position: absolute; transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; gap: 3px; transition: opacity .2s; }
.cc-tag .icons { display: flex; gap: 1px; background: rgba(255,250,235,.92); border-radius: 14px; padding: 2px 5px; box-shadow: 0 3px 8px rgba(0,0,0,.45); }
.cc-tag .icons img { width: 26px; height: 26px; }
.cc-tag .pbar { width: 56px; height: 9px; background: rgba(0,0,0,.6); border-radius: 5px; overflow: hidden; border: 1px solid rgba(255,255,255,.5); }
.cc-tag .pbar i { display: block; height: 100%; background: linear-gradient(90deg, #6fe0ff, #b6ff8a); }
.cc-tag .warn { font-size: 26px; font-weight: bold; color: #fff; background: #d8341e; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; border: 2px solid #fff; animation: cc-pulse .25s infinite alternate; }
.cc-tag .done { font-size: 13px; color: #fff; background: rgba(40,140,60,.9); border-radius: 10px; padding: 1px 7px; font-weight: bold; }
.cc-pop { position: absolute; transform: translate(-50%, -50%); font-size: 28px; font-weight: bold; color: var(--gold); text-shadow: 0 2px 0 #4a2a00, 0 0 12px rgba(255,200,80,.8); animation: cc-rise 1.2s forwards ease-out; white-space: nowrap; }
.cc-pop.bad { color: #ff6050; text-shadow: 0 2px 0 #400, 0 0 10px rgba(255,60,40,.6); }
.cc-toast { position: absolute; bottom: 86px; left: 50%; transform: translateX(-50%); background: rgba(10,8,20,.82); border: 1px solid rgba(242,196,90,.5); color: #fff; padding: 8px 16px; border-radius: 20px; font-size: 16px; font-style: italic; opacity: 0; transition: opacity .25s; white-space: nowrap; }
.cc-toast.on { opacity: 1; }
.cc-help { position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%); font-size: 13px; color: rgba(255,255,255,.75); text-shadow: 0 1px 2px #000; white-space: nowrap; text-align: center; line-height: 1.5; }
.cc-help b { color: var(--gold); font-weight: normal; border: 1px solid rgba(242,196,90,.5); border-radius: 4px; padding: 0 4px; margin: 0 1px; }
.cc-screen { position: absolute; inset: 0; display: grid; place-items: center; background: radial-gradient(ellipse at center, rgba(20,12,40,.55), rgba(5,4,12,.92)); pointer-events: auto; opacity: 0; transition: opacity .35s; overflow-y: auto; padding: 16px; }
.cc-screen.on { opacity: 1; }
.cc-panel { background: linear-gradient(180deg, #f4e6c4, #dcc08a); color: var(--ink); border-radius: 14px; padding: 22px 26px; max-width: 760px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,.7), inset 0 0 0 3px rgba(110,70,20,.4), inset 0 0 40px rgba(120,70,20,.25); text-align: center; }
.cc-title { font-size: clamp(38px, 7vw, 64px); font-weight: bold; font-style: italic; margin: 0; color: #4a1a5a; text-shadow: 0 2px 0 #f6e2a0, 0 4px 14px rgba(120,40,160,.35); letter-spacing: 1px; }
.cc-sub { margin: 4px 0 16px; font-size: 16px; color: #5a3a1a; }
.cc-levels { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 14px 0; }
.cc-level { background: rgba(255,250,235,.6); border: 2px solid rgba(110,70,20,.35); border-radius: 10px; padding: 12px; cursor: pointer; text-align: left; font: inherit; color: inherit; transition: transform .15s, box-shadow .15s; }
.cc-level:hover, .cc-level:focus-visible { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(80,40,0,.3); outline: none; border-color: #8a4fb0; }
.cc-level h3 { margin: 0 0 4px; font-size: 18px; color: #3a1450; }
.cc-level p { margin: 0 0 8px; font-size: 13px; line-height: 1.35; color: #4a3018; }
.cc-level .stars { font-size: 22px; color: #b8a070; letter-spacing: 2px; }
.cc-level .stars .s { color: #e8a818; text-shadow: 0 0 6px rgba(255,190,40,.7); }
.cc-level .pots { display: flex; gap: 2px; margin-bottom: 6px; }
.cc-level .pots img { width: 30px; height: 30px; }
.cc-modes { display: inline-flex; background: rgba(80,50,20,.15); border-radius: 22px; padding: 3px; gap: 3px; }
.cc-mode { border: 0; background: transparent; padding: 7px 16px; border-radius: 18px; font: inherit; font-size: 15px; cursor: pointer; color: var(--ink); }
.cc-mode.on { background: #4a1a5a; color: #fff; }
.cc-btn { border: 0; background: linear-gradient(180deg, #7a3a9a, #4a1a5a); color: #fff; font: inherit; font-size: 18px; font-weight: bold; padding: 10px 26px; border-radius: 24px; cursor: pointer; margin: 6px; box-shadow: 0 4px 0 #2a0a3a, 0 6px 14px rgba(0,0,0,.4); }
.cc-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 #2a0a3a; }
.cc-btn.alt { background: linear-gradient(180deg, #b08a4a, #7a5a2a); box-shadow: 0 4px 0 #4a3010, 0 6px 14px rgba(0,0,0,.4); }
.cc-keys { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-size: 13px; text-align: left; margin: 12px auto 0; max-width: 560px; color: #4a3018; }
.cc-keys b { display: inline-block; min-width: 22px; text-align: center; background: #fff8e8; border: 1px solid #b89a60; border-radius: 4px; padding: 0 4px; margin-right: 2px; color: #3a1450; }
.cc-recipes { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 10px; }
.cc-recipe { display: flex; align-items: center; gap: 2px; background: rgba(255,250,235,.55); border-radius: 8px; padding: 3px 8px; font-size: 12px; }
.cc-recipe img { width: 28px; height: 28px; }
.cc-big { font-size: clamp(60px, 14vw, 130px); font-weight: bold; font-style: italic; color: #fff; text-shadow: 0 4px 0 #4a1a5a, 0 0 40px rgba(200,120,255,.9); animation: cc-count .9s ease-out; }
.cc-result-stars { font-size: 64px; letter-spacing: 8px; margin: 8px 0; color: #b8a070; }
.cc-result-stars span { display: inline-block; opacity: .35; transform: scale(.6); transition: all .4s cubic-bezier(.2,1.8,.4,1); }
.cc-result-stars span.on { opacity: 1; transform: scale(1); color: #f2b818; text-shadow: 0 0 18px rgba(255,190,40,.9); }
.cc-stats { display: grid; grid-template-columns: 1fr auto; gap: 4px 30px; max-width: 320px; margin: 10px auto; font-size: 17px; text-align: left; }
.cc-stats .v { text-align: right; font-weight: bold; }
.cc-loading { position: absolute; inset: 0; display: grid; place-items: center; background: #07060d; pointer-events: auto; transition: opacity .5s; z-index: 5; }
.cc-loading .lb { width: 240px; height: 8px; border-radius: 4px; background: #221a33; overflow: hidden; margin-top: 12px; }
.cc-loading .lb i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #8a4fff, #ffd070); transition: width .2s; }
.cc-touch-zone { position: absolute; left: 0; bottom: 0; width: 45%; height: 60%; pointer-events: auto; touch-action: none; }
.cc-knob { display: none; position: absolute; width: 70px; height: 70px; border-radius: 50%; background: rgba(255,255,255,.18); border: 2px solid rgba(255,255,255,.5); transform: translate(-50%, -50%); }
.cc-touch-btns { position: absolute; right: 12px; bottom: 16px; display: grid; grid-template-columns: repeat(3, 64px); gap: 8px; pointer-events: auto; touch-action: none; }
.cc-tbtn { width: 64px; height: 64px; border-radius: 50%; border: 2px solid rgba(255,255,255,.55); background: rgba(40,20,60,.6); color: #fff; font: inherit; font-size: 13px; font-weight: bold; }
.cc-tbtn.on { background: rgba(160,90,220,.8); }
.cc-tbtn.grab { grid-column: 3; grid-row: 2; width: 72px; height: 72px; background: rgba(60,120,60,.7); }
.cc-tbtn.use { grid-column: 2; grid-row: 2; background: rgba(40,80,160,.7); }
.cc-tbtn.throw { grid-column: 3; grid-row: 1; }
.cc-tbtn.dash { grid-column: 1; grid-row: 2; }
.cc-tbtn.swap { grid-column: 2; grid-row: 1; }
.cc-pausebtn { position: absolute; bottom: 10px; right: 12px; pointer-events: auto; background: rgba(10,8,20,.7); color: #fff; border: 1px solid rgba(242,196,90,.5); border-radius: 16px; font: inherit; padding: 4px 12px; cursor: pointer; }
@keyframes cc-drop { from { transform: translateY(-120px) rotate(-8deg); } to { transform: none; } }
@keyframes cc-shake { 0%,100% { transform: rotate(0); } 25% { transform: rotate(-2.5deg); } 75% { transform: rotate(2.5deg); } }
@keyframes cc-fly { to { transform: translateY(-140px) scale(.6) rotate(10deg); opacity: 0; } }
@keyframes cc-fail { 30% { transform: scale(1.05); filter: saturate(0) brightness(.7); } to { transform: translateY(80px) rotate(-15deg); opacity: 0; } }
@keyframes cc-pulse { to { transform: scale(1.08); } }
@keyframes cc-bump { 50% { transform: scale(1.18); } }
@keyframes cc-rise { 0% { opacity: 0; transform: translate(-50%, -20%) scale(.6); } 15% { opacity: 1; transform: translate(-50%, -60%) scale(1.15); } 100% { opacity: 0; transform: translate(-50%, -220%) scale(1); } }
@keyframes cc-count { from { transform: scale(2.2); opacity: 0; } 40% { opacity: 1; } to { transform: scale(1); } }
@media (max-width: 720px) {
  .cc-orders { left: 6px; right: 120px; top: 54px; gap: 5px; }
  .cc-order { width: 104px; padding: 4px; }
  .cc-order .flask { width: 30px; height: 30px; }
  .cc-order .ing { width: 22px; height: 22px; }
  .cc-order .t { font-size: 10px; }
  .cc-time { font-size: 18px; min-width: 76px; padding: 4px 10px; }
  .cc-score { font-size: 18px; }
  .cc-help { display: none; }
}
@media (pointer: coarse) { .cc-toast { bottom: 190px; white-space: normal; max-width: 86vw; text-align: center; } }
`;

export interface OrderView { el: HTMLDivElement; bar: HTMLElement }

export class UI {
  readonly root: HTMLDivElement;
  private readonly orders: HTMLDivElement;
  private readonly time: HTMLDivElement;
  private readonly score: HTMLDivElement;
  private readonly scoreVal: HTMLSpanElement;
  private readonly streak: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private screen: HTMLDivElement | null = null;
  private toastTimer = 0;
  private loading: HTMLDivElement;

  constructor(private readonly icons: Map<IconKey, string>) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'cc-ui';
    document.body.appendChild(this.root);
    this.hud = div('', this.root);
    this.orders = div('cc-orders', this.hud);
    const clock = div('cc-clock', this.hud);
    this.time = div('cc-time', clock);
    this.score = div('cc-score', clock);
    div('cc-coin', this.score).textContent = 'G';
    this.scoreVal = document.createElement('span');
    this.score.appendChild(this.scoreVal);
    this.streak = div('cc-streak', clock);
    this.toastEl = div('cc-toast', this.root);
    this.help = div('cc-help', this.hud);
    this.loading = div('cc-loading', this.root);
    this.loading.innerHTML = `<div style="text-align:center"><div class="cc-title" style="color:#d8b0ff;text-shadow:0 0 30px rgba(160,90,255,.8)">Cauldron Chaos</div><div style="color:#b8a8d8;margin-top:6px;font-style:italic" class="msg">Grinding moonstone…</div><div class="lb"><i></i></div></div>`;
    this.showHud(false);
  }

  setIcons(icons: Map<IconKey, string>): void { for (const [k, v] of icons) this.icons.set(k, v); }

  icon(k: IconKey): string { return this.icons.get(k) ?? ''; }

  setLoading(f: number, msg?: string): void {
    (this.loading.querySelector('.lb i') as HTMLElement).style.width = `${Math.round(f * 100)}%`;
    if (msg) (this.loading.querySelector('.msg') as HTMLElement).textContent = msg;
  }

  hideLoading(): void {
    this.loading.style.opacity = '0';
    setTimeout(() => this.loading.remove(), 600);
  }

  showHud(v: boolean): void { this.hud.style.display = v ? '' : 'none'; }

  setHelp(solo: boolean): void {
    this.help.innerHTML = IS_TOUCH ? '' : solo
      ? `<b>WASD</b> move · <b>Space</b> grab/place · <b>E</b> hold to chop, grind, vanish, douse · <b>Q</b> throw · <b>Shift</b> dash · <b>Tab</b> swap wizard · <b>Esc</b> pause`
      : `P1: <b>WASD</b> <b>Space</b> grab <b>E</b> cast <b>Q</b> throw <b>⇧</b> dash &nbsp;·&nbsp; P2: <b>Arrows</b> <b>Enter</b> grab <b>R-Shift</b> cast <b>L</b> throw <b>R-Ctrl</b> dash`;
  }

  setTime(sec: number): void {
    const s = Math.max(0, Math.ceil(sec));
    this.time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.time.classList.toggle('hurry', s <= 30);
  }

  setScore(v: number, bump = false): void {
    this.scoreVal.textContent = String(v);
    if (bump) { this.score.classList.remove('bump'); void this.score.offsetWidth; this.score.classList.add('bump'); }
  }

  setStreak(n: number): void {
    this.streak.textContent = `Tip ×${n}`;
    this.streak.classList.toggle('on', n > 1);
  }

  addOrder(p: PotionId): OrderView {
    const def = POTIONS[p];
    const el = document.createElement('div');
    el.className = 'cc-order';
    const glow = `#${def.color.toString(16).padStart(6, '0')}`;
    el.style.setProperty('--glow', glow);
    el.innerHTML = `<div class="t">${def.name}</div><div class="row"><img class="flask" src="${this.icon(`flask:${p}`)}"><div class="ings">${def.recipe.map((k) => `<div class="ing" title="${INGREDIENTS[k].name}"><img src="${this.icon(`ing:${k}`)}"></div>`).join('')}</div></div><div class="bar"><i></i></div>`;
    this.orders.appendChild(el);
    return { el, bar: el.querySelector('.bar i') as HTMLElement };
  }

  updateOrder(v: OrderView, frac: number, first: boolean): void {
    v.bar.style.width = `${frac * 100}%`;
    v.bar.style.background = frac > 0.5 ? '#5fbf4a' : frac > 0.25 ? '#e0a020' : '#d8341e';
    v.el.classList.toggle('urgent', frac < 0.2);
    v.el.classList.toggle('first', first);
  }

  removeOrder(v: OrderView, failed: boolean): void {
    v.el.classList.remove('urgent');
    v.el.classList.add(failed ? 'failed' : 'gone');
    setTimeout(() => v.el.remove(), 600);
  }

  clearOrders(): void { this.orders.innerHTML = ''; }

  tag(): StationTag { return new StationTag(this.hud, this); }

  pop(x: number, y: number, text: string, bad = false): void {
    const el = div(`cc-pop${bad ? ' bad' : ''}`, this.hud);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.textContent = text;
    setTimeout(() => el.remove(), 1300);
  }

  toast(text: string, secs = 2.2): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastTimer = secs;
  }

  update(dt: number): void {
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) this.toastEl.classList.remove('on');
  }

  // ------------------------------------------------------------- screens

  private openScreen(html: string): HTMLDivElement {
    this.closeScreen();
    const s = div('cc-screen', this.root);
    s.innerHTML = html;
    requestAnimationFrame(() => s.classList.add('on'));
    this.screen = s;
    return s;
  }

  closeScreen(): void {
    const s = this.screen;
    if (!s) return;
    this.screen = null;
    s.classList.remove('on');
    s.style.pointerEvents = 'none';
    setTimeout(() => s.remove(), 400);
  }

  get screenOpen(): boolean { return !!this.screen; }

  title(best: number[], solo: boolean, onPlay: (level: LevelDef, solo: boolean) => void): void {
    const keys = IS_TOUCH
      ? `<div class="cc-keys" style="grid-template-columns:1fr"><div>Left thumb: move · <b>Grab</b> pick up / put down · hold <b>Cast</b> to chop, grind, vanish a brew or douse fire · <b>Throw</b> ingredients · <b>Swap</b> wizards</div></div>`
      : `<div class="cc-keys">
          <div><b>W</b><b>A</b><b>S</b><b>D</b> move</div><div><b>Space</b> grab / place</div>
          <div>hold <b>E</b> chop · grind · <i>Evanesco</i> · <i>Aguamenti</i></div><div><b>Q</b> throw ingredient</div>
          <div><b>Shift</b> dash</div><div><b>Tab</b> swap wizard (solo)</div>
          <div>Player 2: <b>←↑↓→</b> <b>Enter</b> <b>R-Shift</b></div><div><b>L</b> throw · <b>R-Ctrl</b> dash · gamepads work too</div>
        </div>`;
    const s = this.openScreen(`<div class="cc-panel">
      <h1 class="cc-title">Cauldron Chaos</h1>
      <div class="cc-sub">A frantic potions kitchen beneath the alley. Chop, grind, brew, bottle — and keep the owls happy.</div>
      <div class="cc-modes"><button class="cc-mode ${solo ? 'on' : ''}" data-m="solo">Solo · 2 wizards</button><button class="cc-mode ${solo ? '' : 'on'}" data-m="coop">Co-op · 2 players</button></div>
      <div class="cc-levels">${LEVELS.map((l, i) => `<button class="cc-level" data-i="${i}">
          <h3>${l.id}. ${l.name}</h3><div class="pots">${l.potions.map((p) => `<img src="${this.icon(`flask:${p}`)}" title="${POTIONS[p].name}">`).join('')}</div>
          <p>${l.blurb}</p><div class="stars">${[0, 1, 2].map((k) => `<span class="${k < (best[i] ?? 0) ? 's' : ''}">★</span>`).join('')}</div></button>`).join('')}</div>
      <div style="font-size:13px;color:#5a3a1a">Recipes</div>
      <div class="cc-recipes">${(Object.keys(POTIONS) as PotionId[]).filter((p) => p !== 'mess').map((p) => `<div class="cc-recipe"><img src="${this.icon(`flask:${p}`)}"><span>${POTIONS[p].name} =</span>${POTIONS[p].recipe.map((k) => `<img src="${this.icon(`ing:${k}`)}" title="${INGREDIENTS[k].name}">`).join('')}</div>`).join('')}</div>
      ${keys}
    </div>`);
    let mode = solo;
    s.querySelectorAll<HTMLButtonElement>('.cc-mode').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.m === 'solo';
      s.querySelectorAll('.cc-mode').forEach((x) => x.classList.toggle('on', x === b));
    }));
    s.querySelectorAll<HTMLButtonElement>('.cc-level').forEach((b) => b.addEventListener('click', () => onPlay(LEVELS[Number(b.dataset.i)], mode)));
  }

  countdown(text: string): void {
    const s = this.openScreen(`<div class="cc-big">${text}</div>`);
    s.style.background = 'transparent';
    s.style.pointerEvents = 'none';
  }

  pause(onResume: () => void, onQuit: () => void, onRestart: () => void): void {
    const s = this.openScreen(`<div class="cc-panel" style="max-width:380px"><h2 class="cc-title" style="font-size:42px">Paused</h2>
      <div style="margin-top:14px"><button class="cc-btn" data-a="r">Resume</button><button class="cc-btn alt" data-a="s">Restart</button><button class="cc-btn alt" data-a="q">Level select</button></div></div>`);
    s.querySelector('[data-a="r"]')!.addEventListener('click', onResume);
    s.querySelector('[data-a="s"]')!.addEventListener('click', onRestart);
    s.querySelector('[data-a="q"]')!.addEventListener('click', onQuit);
  }

  results(level: LevelDef, score: number, stats: { delivered: number; failed: number; tips: number }, best: boolean, onRetry: () => void, onMenu: () => void, onNext: (() => void) | null, onStar: () => void): void {
    const stars = level.stars.filter((t) => score >= t).length;
    const s = this.openScreen(`<div class="cc-panel" style="max-width:460px">
      <h2 class="cc-title" style="font-size:40px">${stars === 3 ? 'Outstanding!' : stars === 2 ? 'Exceeds Expectations' : stars === 1 ? 'Acceptable' : 'Troll…'}</h2>
      <div style="font-style:italic;color:#5a3a1a">${level.name}</div>
      <div class="cc-result-stars">${[0, 1, 2].map(() => '<span>★</span>').join('')}</div>
      <div style="font-size:15px;color:#5a3a1a">${level.stars.map((t) => `★ ${t}`).join(' &nbsp; ')}</div>
      <div class="cc-stats"><span>Potions delivered</span><span class="v">${stats.delivered}</span><span>Orders missed</span><span class="v">${stats.failed}</span><span>Tips</span><span class="v">${stats.tips}</span><span style="font-size:22px">Galleons</span><span class="v" style="font-size:22px">${score}${best ? ' <span style="color:#a0308a;font-size:14px">new best!</span>' : ''}</span></div>
      <div><button class="cc-btn" data-a="r">Brew again</button>${onNext ? '<button class="cc-btn" data-a="n">Next level</button>' : ''}<button class="cc-btn alt" data-a="m">Level select</button></div>
    </div>`);
    const spans = s.querySelectorAll('.cc-result-stars span');
    for (let i = 0; i < stars; i++) setTimeout(() => { spans[i].classList.add('on'); onStar(); }, 600 + i * 450);
    s.querySelector('[data-a="r"]')!.addEventListener('click', onRetry);
    s.querySelector('[data-a="m"]')!.addEventListener('click', onMenu);
    s.querySelector('[data-a="n"]')?.addEventListener('click', () => onNext?.());
  }
}

export class StationTag {
  readonly el: HTMLDivElement;
  private readonly icons: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly fill: HTMLElement;
  private readonly warn: HTMLDivElement;
  private readonly doneEl: HTMLDivElement;
  private iconKey = '';

  constructor(parent: HTMLElement, private readonly ui: UI) {
    this.el = div('cc-tag', parent);
    this.icons = div('icons', this.el);
    this.doneEl = div('done', this.el);
    this.warn = div('warn', this.el);
    this.warn.textContent = '!';
    this.bar = div('pbar', this.el);
    this.fill = document.createElement('i');
    this.bar.appendChild(this.fill);
    this.set(null, null, false, null);
  }

  set(icons: IconKey[] | null, progress: number | null, warn: boolean, done: string | null): void {
    const key = icons?.join('|') ?? '';
    if (key !== this.iconKey) {
      this.iconKey = key;
      this.icons.innerHTML = icons ? icons.map((k) => `<img src="${this.ui.icon(k)}">`).join('') : '';
    }
    this.icons.style.display = icons && icons.length ? '' : 'none';
    this.bar.style.display = progress === null ? 'none' : '';
    if (progress !== null) this.fill.style.width = `${Math.min(1, progress) * 100}%`;
    this.warn.style.display = warn ? '' : 'none';
    this.doneEl.style.display = done ? '' : 'none';
    if (done) this.doneEl.textContent = done;
    this.el.style.display = (icons && icons.length) || progress !== null || warn || done ? '' : 'none';
  }

  place(x: number, y: number, visible: boolean): void {
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    if (!visible) this.el.style.display = 'none';
  }

  remove(): void { this.el.remove(); }
}

function div(cls: string, parent: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  parent.appendChild(d);
  return d;
}
