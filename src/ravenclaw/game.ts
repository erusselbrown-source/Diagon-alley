/**
 * Game layer: the overlay UI (title card, crosshair, prompts, toasts, the
 * feather tally, the eagle's riddle dialog and a reading panel) and every
 * interaction in the room. The riddles, inscriptions and book text here are
 * original writing for this project.
 */
import * as THREE from 'three';
import type { Player } from './player';
import type { TowerAudio } from './audio';
import type { Shell } from './shell';
import type { Props } from './props';
import type { FeatherSystem, FireSystem, CandleSystem } from './fx';
import { IS_TOUCH } from '../core/device';
import { MOON_DIR, R, START, EYE } from './layout';

const SERIF = `'Cormorant Garamond', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif`;

interface Riddle { q: string; options: string[]; answer: number }

const RIDDLES: Riddle[] = [
  { q: 'I am lit when the day is done and put to sleep at dawn. I weep while I work, and every night I grow a little shorter. What am I?', options: ['A candle', 'A shadow', 'A clock'], answer: 0 },
  { q: 'I can hold a whole library and weigh nothing at all. The more you put into me, the lighter you seem to walk. What am I?', options: ['A trunk', 'A mind', 'A quill'], answer: 1 },
  { q: 'Turn me over and I begin again. I count for you without a single word, and I only run when I stand on my head. What am I?', options: ['A river', 'A wand', 'An hourglass'], answer: 2 },
  { q: 'Hoard me and I shrink; give me away and I grow. Two people can hold all of me at once. What am I?', options: ['Knowledge', 'Gold', 'A secret'], answer: 0 },
  { q: 'I have a face that never sleeps and hands that never hold. I point the way through every day, yet I never leave my home. What am I?', options: ['A compass', 'A clock', 'A portrait'], answer: 1 },
  { q: 'The further you travel into me, the less you can see of where you began — yet you leave me knowing more. What am I?', options: ['A book', 'A forest', 'A fog'], answer: 0 },
  { q: 'I am seen best when the lamps are out, I am older than the castle, and sailors once trusted me to bring them home. What am I?', options: ['The moon', 'A lighthouse', 'A star'], answer: 2 },
];

const LECTERN_TEXT = `<h3>On the Keeping of Questions</h3>
<p>A question asked honestly is a door left ajar. Do not hurry to close it with the first answer that fits;
sit beside it a while, and see what else comes through.</p>
<p>The tower was built high not to look down upon the grounds, but so that its windows might hold more sky.
Read by the light of it. Argue kindly. Leave every book a little better than you found it, and return it to its shelf
— the shelves remember who forgets.</p>`;

const STATUE_TEXT = `<h3>The Founder</h3>
<p><em>Carved into the bronze plate beneath her feet:</em></p>
<p style="font-size:1.25em;letter-spacing:0.03em">“Of all the treasures kept within this tower,<br/>the brightest is a mind that keeps on asking.”</p>`;

const PAINTING_LINES = [
  'A lone tower beneath a sky full of stars. Someone has painted a tiny lit window near the very top.',
  'Mist rolls off dusky mountains into a still loch. The paint is old and finely cracked.',
];

export interface Interactable {
  pos: THREE.Vector3;
  radius: number;
  label: () => string | null;
  use: () => void;
  range?: number;
}

export interface GameDeps {
  player: Player;
  audio: TowerAudio;
  shell: Shell;
  props: Props;
  feathers: FeatherSystem;
  fire: FireSystem;
  candles: CandleSystem;
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  onStart: () => void;
}

export class Game {
  private readonly ui: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;
  private readonly tally: HTMLDivElement;
  private readonly dialog: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly items: Interactable[] = [];
  private target: Interactable | null = null;
  private riddle: Riddle | null = null;
  private riddleIdx = 0;
  private dialogOpen = false;
  private found = 0;
  private toastTimer = 0;
  private poseKind: 'none' | 'sit' | 'telescope' = 'none';
  awake = 0;
  awakeTarget = 0;
  started = false;
  private litTargets = [0, 0, 0, 0, 0, 0, 0];
  private orreryTimer = 0;
  private globeSpin = 0;

  constructor(private readonly d: GameDeps) {
    const font = document.createElement('style');
    font.textContent = `
      .rc-btn{font:600 16px ${SERIF};color:#f3e3bf;background:linear-gradient(#22356e,#152450);border:1px solid #b07a3e;border-radius:6px;padding:10px 16px;cursor:pointer;min-width:150px;letter-spacing:.02em}
      .rc-btn:hover{background:linear-gradient(#2d4590,#1a2d66);border-color:#e2b06a}
      .rc-panel h3{margin:0 0 10px;font:600 22px ${SERIF};color:#e2b06a;letter-spacing:.06em}
      .rc-panel p{margin:0 0 10px}
      @keyframes rcfade{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
    `;
    document.head.appendChild(font);
    this.ui = mk('div', { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '15', fontFamily: SERIF, color: '#efe2c4' }, document.body);
    this.crosshair = mk('div', { position: 'absolute', left: '50%', top: '50%', width: '6px', height: '6px', margin: '-3px 0 0 -3px', borderRadius: '50%', background: 'rgba(240,220,170,0.75)', boxShadow: '0 0 6px rgba(255,220,150,0.6)', display: 'none' }, this.ui);
    this.prompt = mk('div', { position: 'absolute', left: '50%', top: '56%', transform: 'translateX(-50%)', font: `600 18px ${SERIF}`, color: '#f6e7c4', textShadow: '0 0 8px #000, 0 0 3px #000', letterSpacing: '0.04em', whiteSpace: 'nowrap', display: 'none' }, this.ui);
    this.toastEl = mk('div', { position: 'absolute', left: '50%', bottom: '12%', transform: 'translateX(-50%)', maxWidth: 'min(640px, 86vw)', textAlign: 'center', font: `500 19px/1.4 ${SERIF}`, padding: '12px 22px', background: 'linear-gradient(rgba(10,18,44,0.82),rgba(8,12,30,0.82))', border: '1px solid rgba(176,122,62,0.7)', borderRadius: '8px', opacity: '0', transition: 'opacity 0.6s' }, this.ui);
    this.tally = mk('div', { position: 'absolute', right: '18px', top: '16px', font: `600 15px ${SERIF}`, color: '#e2b06a', textShadow: '0 0 6px #000', textAlign: 'right', display: 'none' }, this.ui);
    this.help = mk('div', { position: 'absolute', left: '14px', bottom: '14px', font: `14px/1.5 ${SERIF}`, color: 'rgba(240,225,190,0.8)', textShadow: '0 0 4px #000', display: 'none' }, this.ui);
    this.help.innerHTML = IS_TOUCH
      ? 'Left thumb: walk · Drag: look · Tap: use'
      : 'WASD walk · Mouse look · Shift hurry · <b>E</b> / click use · M music · H hide help';
    this.dialog = mk('div', { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(620px, 90vw)', padding: '26px 30px', background: 'radial-gradient(ellipse at 50% 30%, #1d2f66, #0c1533 80%)', border: '1px solid #b07a3e', boxShadow: '0 0 0 4px rgba(10,16,40,0.8), 0 0 0 5px rgba(176,122,62,0.5), 0 20px 60px rgba(0,0,0,0.6)', borderRadius: '10px', font: `18px/1.55 ${SERIF}`, pointerEvents: 'auto', display: 'none' }, this.ui);
    this.dialog.className = 'rc-panel';
    if (IS_TOUCH) {
      const use = mk('button', { position: 'absolute', right: '18px', bottom: '22px', pointerEvents: 'auto', minWidth: '84px', padding: '16px' }, this.ui);
      use.className = 'rc-btn'; use.textContent = 'Use';
      use.addEventListener('touchstart', (e) => { e.preventDefault(); this.useTarget(); }, { passive: false });
    }

    // title card
    this.title = mk('div', { position: 'fixed', inset: '0', zIndex: '30', display: 'grid', placeItems: 'center', background: 'radial-gradient(ellipse at 50% 40%, rgba(20,34,80,0.55), rgba(3,5,14,0.94) 70%)', cursor: 'pointer', fontFamily: SERIF, color: '#efe2c4', transition: 'opacity 1.2s' }, document.body);
    this.title.innerHTML = `
      <div style="text-align:center;padding:24px;max-width:720px">
        <div style="font:500 15px ${SERIF};letter-spacing:.5em;color:#b9a27a;margin-bottom:14px">HOGWARTS · WEST TOWER</div>
        <div style="font:600 clamp(40px,8vw,84px)/1 ${SERIF};letter-spacing:.08em;color:#e8c98c;text-shadow:0 0 30px rgba(120,160,255,0.35)">RAVENCLAW</div>
        <div style="font:italic 500 clamp(20px,3.4vw,30px) ${SERIF};color:#c9d6ff;margin:10px 0 26px">The Common Room</div>
        <div style="width:220px;height:1px;margin:0 auto 22px;background:linear-gradient(90deg,transparent,#b07a3e,transparent)"></div>
        <div style="font:17px/1.6 ${SERIF};color:#d9ccb0;opacity:.9">There is no password to this door — only a question.<br/>Answer the bronze eagle, then find the seven feathers hidden in the tower<br/>to wake the stars painted on the dome.</div>
        <div id="rc-start" style="margin-top:30px;font:600 20px ${SERIF};letter-spacing:.18em;color:#f3e3bf">${IS_TOUCH ? 'TAP' : 'CLICK'} TO ENTER</div>
        <div id="rc-load" style="margin-top:10px;font:13px ui-monospace,monospace;color:#8c9cc8"></div>
      </div>`;
    this.title.addEventListener('click', () => this.begin());
    this.title.addEventListener('touchend', (e) => { e.preventDefault(); this.begin(); });

    window.addEventListener('keydown', (e) => this.onKey(e));
    d.dom.addEventListener('click', () => {
      if (!this.started || this.dialogOpen) return;
      if (!IS_TOUCH && !this.lockFailed && document.pointerLockElement !== d.dom) { d.dom.requestPointerLock?.(); return; }
      this.useTarget();
    });
    d.player.tapHandler = () => this.useTarget();
    document.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      if (this.started) this.showToast('Drag with the mouse to look around; click or press <b>E</b> to use things.', 4);
    });
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === d.dom;
      this.crosshair.style.display = locked || IS_TOUCH ? 'block' : 'none';
      if (!locked && this.started && !this.dialogOpen && !IS_TOUCH && !this.lockFailed) this.showToast('Click to look around again.', 2.5);
    });
    this.buildInteractables();
  }

  setLoading(text: string): void {
    const el = this.title.querySelector('#rc-load');
    if (el) el.textContent = text;
  }

  private ready = false;
  setReady(): void {
    this.ready = true;
    this.setLoading('');
  }

  private begin(): void {
    if (this.started || !this.ready) return;
    this.started = true;
    this.title.style.opacity = '0';
    setTimeout(() => this.title.remove(), 1300);
    this.d.player.enabled = true;
    if (!IS_TOUCH) this.d.dom.requestPointerLock?.();
    this.crosshair.style.display = 'block';
    this.help.style.display = 'block';
    this.tally.style.display = 'block';
    this.updateTally();
    this.d.onStart();
    setTimeout(() => this.showToast('A spiral stair, a heavy oak door — and a bronze eagle knocker. Walk up to it and press <b>E</b>.', 6), 900);
  }

  // ---------------------------------------------------------------- interactions

  private add(i: Interactable): void { this.items.push(i); }

  private buildInteractables(): void {
    const { shell, props, audio, player, feathers, fire } = this.d;
    const door = shell.door;
    const knockerPos = new THREE.Vector3(0, 1.55, R + 0.57);
    this.add({
      pos: knockerPos, radius: 0.35,
      label: () => (door.target === 0 && player.pos.z > R + 0.5 ? 'Knock on the bronze eagle' : null),
      use: () => this.openRiddle(),
    });
    this.add({
      pos: new THREE.Vector3(0.3, 1.2, R + 0.3), radius: 0.7,
      label: () => (this.doorUnlocked ? (door.target > 0 ? 'Close the door' : 'Open the door') : null),
      use: () => { door.target = door.target > 0 ? 0 : 1; audio.door(door.target > 0); },
    });
    feathers.items.forEach((it, i) => this.add({
      pos: it.pos, radius: 0.22, range: 4.2,
      label: () => (it.found ? null : 'Pick up the bronze feather'),
      use: () => this.collectFeather(i),
    }));
    const globe = props.refs.globe;
    this.add({ pos: globe.position.clone(), radius: 0.45, label: () => 'Spin the globe', use: () => { this.globeSpin = 9; audio.whirr(); } });
    this.add({
      pos: new THREE.Vector3(0, 1.45, 0), radius: 0.6, label: () => 'Wind the orrery',
      use: () => { props.refs.orreryState.target = 9; this.orreryTimer = 4; audio.whirr(); this.showToast('The little planets whirl around their glowing sun, ticking softly.', 3.5); },
    });
    this.add({
      pos: props.refs.telescope.position.clone(), radius: 0.45, label: () => (this.poseKind === 'telescope' ? null : 'Look through the telescope'),
      use: () => {
        this.enterPose('telescope', { pos: props.refs.telescopeEye.clone(), look: props.refs.telescopeEye.clone().addScaledVector(MOON_DIR, 20), fov: 11 });
        this.showToast('The moon, close enough to count its seas. Press <b>E</b> or move to step back.', 4);
      },
    });
    this.add({ pos: props.refs.lectern.position.clone(), radius: 0.4, label: () => 'Read the open book', use: () => { audio.page(); this.openPanel(LECTERN_TEXT); } });
    this.add({ pos: new THREE.Vector3(0, 1.0, -R - 0.0), radius: 0.6, range: 4.5, label: () => 'Read the inscription', use: () => this.openPanel(STATUE_TEXT) });
    this.add({ pos: new THREE.Vector3(0, 2.6, -R - 0.3), radius: 0.5, range: 6, label: () => (this.found >= 7 ? 'Admire the glowing diadem' : 'Look up at the founder'), use: () => this.showToast(this.found >= 7 ? 'The diadem glows sapphire-bright, as if it were thinking.' : 'Cool white marble, serene and watchful. The diadem seems to wait for something.', 4) });
    this.add({ pos: props.refs.fireBase.clone().setY(0.6), radius: 0.6, label: () => 'Stoke the fire', use: () => { fire.stoke(); audio.whoosh(); } });
    this.add({
      pos: new THREE.Vector3(3.85, 0.55, 0), radius: 0.8, label: () => (this.poseKind === 'sit' ? null : 'Sit by the fire'),
      use: () => this.enterPose('sit', { pos: props.refs.sofaSeat.clone(), look: props.refs.sofaLook.clone(), fov: 52 }),
    });
    for (const s of shell.seats) {
      this.add({
        pos: s.pos.clone().setY(0.75), radius: 0.7, label: () => (this.poseKind === 'sit' ? null : 'Sit in the window seat'),
        use: () => this.enterPose('sit', { pos: s.pos.clone().setY(1.32), look: s.look.clone().setY(2.1), fov: 60 }),
      });
    }
    this.add({ pos: props.refs.harp.position.clone(), radius: 0.5, label: () => 'Pluck the harp', use: () => { audio.harp(); this.showToast('The harp keeps playing a moment after you let go — it rather likes an audience.', 3.5); } });
    const clockPos = new THREE.Vector3(); props.refs.clock.getWorldPosition(clockPos); clockPos.y += 0.28;
    this.add({
      pos: clockPos, radius: 0.25, label: () => 'Check the mantel clock',
      use: () => { const n = new Date(); audio.clockChime(); this.showToast(`The clock reads ${n.getHours() % 12 || 12}:${String(n.getMinutes()).padStart(2, '0')} — and, in tiny letters, “time for one more chapter”.`, 4); },
    });
    props.refs.portraits.forEach((p, i) => {
      const wp = new THREE.Vector3(); p.getWorldPosition(wp);
      this.add({ pos: wp, radius: 0.7, range: 4.5, label: () => 'Admire the painting', use: () => this.showToast(PAINTING_LINES[i % PAINTING_LINES.length], 4) });
    });
    const chessPos = new THREE.Vector3(); props.refs.chess.getWorldPosition(chessPos);
    this.add({ pos: chessPos.add(new THREE.Vector3(0, 0.05, 0)), radius: 0.25, label: () => 'Study the chess game', use: () => this.showToast('A game abandoned mid-thought. Black is three moves from winning, if Black ever comes back.', 4) });
  }

  private doorUnlocked = false;
  private lockFailed = false;

  private useTarget(): void {
    if (!this.started || this.dialogOpen) return;
    if (this.poseKind !== 'none') { this.exitPose(); return; }
    this.target?.use();
  }

  private enterPose(kind: 'sit' | 'telescope', p: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }): void {
    this.poseKind = kind;
    this.d.player.setPose(p);
    if (kind === 'sit') this.showToast('Press <b>E</b> or move to stand up.', 2.5);
  }

  private exitPose(): void {
    this.poseKind = 'none';
    this.d.player.setPose(null);
  }

  private collectFeather(i: number): void {
    const { feathers, audio, shell, props, candles } = this.d;
    if (feathers.items[i].found) return;
    feathers.collect(i);
    this.found++;
    audio.feather(this.found);
    this.litTargets[this.found - 1] = 1;
    this.updateTally();
    const msgs = [
      'A bronze feather, warm to the touch. High above, a constellation flickers into silver light.',
      'Another feather. Somewhere in the dome, a second constellation wakes.',
      'Three. The painted stars seem to lean closer.',
      'Four feathers. The floating candles brighten as if pleased.',
      'Five. The marble founder’s diadem catches a faint blue gleam.',
      'Six — just one more.',
    ];
    if (this.found < 7) this.showToast(msgs[this.found - 1], 4.5);
    else {
      this.awakeTarget = 1;
      audio.finale();
      candles.setFloatLift(0.6);
      this.showToast('All seven feathers! The dome blazes with living constellations, and the founder’s diadem shines. <br/><em>Well reasoned, Ravenclaw.</em>', 8);
      const p = new THREE.Vector3(); props.refs.diadem.getWorldPosition(p);
      feathers.burst(p, new THREE.Color(0.5, 0.7, 1.4), 120);
      void shell;
    }
  }

  private updateTally(): void {
    let s = '';
    for (let k = 0; k < 7; k++) s += `<span style="opacity:${k < this.found ? 1 : 0.28};font-size:20px;margin-left:3px">${k < this.found ? '✦' : '✧'}</span>`;
    this.tally.innerHTML = `<div style="letter-spacing:.14em;font-size:12px;margin-bottom:2px">BRONZE FEATHERS ${this.found}/7</div>${s}`;
  }

  private openRiddle(): void {
    this.riddle = RIDDLES[this.riddleIdx % RIDDLES.length];
    this.riddleIdx++;
    this.d.audio.knock();
    setTimeout(() => this.d.audio.eagleVoice(), 900);
    this.dialogOpen = true;
    document.exitPointerLock?.();
    const r = this.riddle;
    this.dialog.innerHTML = `
      <div style="text-align:center;font:500 13px ${SERIF};letter-spacing:.4em;color:#b9a27a;margin-bottom:6px">THE BRONZE EAGLE SPEAKS</div>
      <p style="font-size:20px;text-align:center;font-style:italic;color:#e8ddc0;margin:12px 0 22px">“${r.q}”</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        ${r.options.map((o, k) => `<button class="rc-btn" data-k="${k}">${IS_TOUCH ? '' : `${k + 1}. `}${o}</button>`).join('')}
      </div>`;
    this.dialog.style.display = 'block';
    this.dialog.querySelectorAll('button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.answer(Number((b as HTMLButtonElement).dataset.k)); }));
  }

  private answer(k: number): void {
    if (!this.riddle) return;
    const ok = k === this.riddle.answer;
    this.closeDialog();
    if (ok) {
      this.d.audio.correct();
      this.doorUnlocked = true;
      this.d.shell.door.target = 1;
      setTimeout(() => this.d.audio.door(true), 400);
      this.showToast('“Well reasoned,” says the eagle, and the door swings open. Seven bronze feathers are hidden in the tower — one is right here on the landing.', 7);
    } else {
      this.d.audio.wrong();
      this.showToast('“A fair guess — but not the answer. Think again, and knock when you are ready.”', 4);
    }
  }

  private openPanel(html: string): void {
    this.dialogOpen = true;
    document.exitPointerLock?.();
    this.dialog.innerHTML = `${html}<div style="text-align:center;margin-top:18px"><button class="rc-btn" id="rc-close">Close</button></div>`;
    this.dialog.style.display = 'block';
    this.dialog.querySelector('#rc-close')!.addEventListener('click', (e) => { e.stopPropagation(); this.closeDialog(); });
  }

  private closeDialog(): void {
    this.dialogOpen = false;
    this.riddle = null;
    this.dialog.style.display = 'none';
    if (!IS_TOUCH) this.d.dom.requestPointerLock?.();
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.started) { if (e.code === 'Enter' || e.code === 'Space') this.begin(); return; }
    if (this.dialogOpen) {
      if (this.riddle && ['Digit1', 'Digit2', 'Digit3'].includes(e.code)) this.answer(Number(e.code.slice(5)) - 1);
      if (e.code === 'Escape' || (!this.riddle && e.code === 'KeyE')) this.closeDialog();
      return;
    }
    if (e.code === 'KeyE') this.useTarget();
    if (e.code === 'KeyH') this.help.style.display = this.help.style.display === 'none' ? 'block' : 'none';
    if (e.code === 'KeyM') { this.d.audio.setMuted(!this.d.audio.muted); this.showToast(this.d.audio.muted ? 'Sound off' : 'Sound on', 1.5); }
  }

  showToast(html: string, seconds = 3): void {
    this.toastEl.innerHTML = html;
    this.toastEl.style.opacity = '1';
    this.toastTimer = seconds;
  }

  // ---------------------------------------------------------------- per frame

  update(dt: number, t: number): void {
    const { player, camera, shell, props } = this.d;
    // leave a pose by moving
    if (this.poseKind !== 'none' && (player.isKey('KeyW') || player.isKey('KeyA') || player.isKey('KeyS') || player.isKey('KeyD') || player.stick.lengthSq() > 0.1)) this.exitPose();

    // door swing
    const door = shell.door;
    door.angle += (door.target * 1.72 - door.angle) * Math.min(1, dt * 1.6);
    door.pivot.rotation.y = door.angle;
    player.doorOpen = door.angle / 1.72;

    // dome constellations and the finale
    const u = shell.dome.uniforms;
    u.uTime.value = t;
    for (let k = 0; k < 7; k++) u.uLit.value[k] += (this.litTargets[k] - u.uLit.value[k]) * Math.min(1, dt * 0.8);
    this.awake += (this.awakeTarget - this.awake) * Math.min(1, dt * 0.5);
    u.uAwake.value = this.awake;
    const dm = props.refs.diadem.material as THREE.MeshPhysicalMaterial;
    dm.emissiveIntensity = Math.max(this.found >= 5 ? 0.25 : 0, this.awake * (2.2 + 0.4 * Math.sin(t * 2)));

    // orrery / globe
    if (this.orreryTimer > 0) { this.orreryTimer -= dt; if (this.orreryTimer <= 0) props.refs.orreryState.target = 1; }
    this.globeSpin *= Math.exp(-dt * 0.5);
    (props.refs.globe.userData.sphere as THREE.Mesh).rotation.y += dt * (0.05 + this.globeSpin);

    // clock hands sweep
    const hands = props.refs.clock.userData.hands as { hp: THREE.Object3D; mp: THREE.Object3D };
    const now = new Date();
    hands.mp.rotation.z = -((now.getMinutes() + now.getSeconds() / 60) / 60) * Math.PI * 2;
    hands.hp.rotation.z = -(((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2;

    // toast
    if (this.toastTimer > 0) { this.toastTimer -= dt; if (this.toastTimer <= 0) this.toastEl.style.opacity = '0'; }

    // target under the crosshair
    this.target = null;
    if (this.started && !this.dialogOpen && this.poseKind === 'none') {
      const o = camera.position, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      let best = Infinity;
      for (const it of this.items) {
        const v = it.pos.clone().sub(o);
        const along = v.dot(dir);
        if (along < 0.2 || along > (it.range ?? 3.3)) continue;
        const perp = v.addScaledVector(dir, -along).length();
        const r = it.radius + along * 0.02;
        if (perp > r) continue;
        const score = along + perp * 2;
        if (score < best && it.label()) { best = score; this.target = it; }
      }
    }
    const label = this.target?.label();
    if (label) {
      this.prompt.style.display = 'block';
      this.prompt.innerHTML = `${IS_TOUCH ? '' : '<span style="display:inline-block;border:1px solid #b07a3e;border-radius:4px;padding:0 7px;margin-right:8px;color:#e2b06a">E</span>'}${label}`;
    } else if (this.poseKind !== 'none') {
      this.prompt.style.display = 'block';
      this.prompt.innerHTML = IS_TOUCH ? 'Tap Use to get up' : '<span style="display:inline-block;border:1px solid #b07a3e;border-radius:4px;padding:0 7px;margin-right:8px;color:#e2b06a">E</span>Get up';
    } else this.prompt.style.display = 'none';
  }
}

function mk<K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration>, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  parent.appendChild(e);
  return e;
}

export { START, EYE };
