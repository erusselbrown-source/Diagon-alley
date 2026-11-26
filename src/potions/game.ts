/**
 * One running level of Cauldron Chaos: wizards, stations, brewing, fire,
 * throwing, drifting platforms, orders and scoring.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import { INGREDIENTS, POTIONS, matchPotion, readyState, type IngredientKind, type LevelDef, type PotionId, type PrepState } from './data';
import type { Fx } from './fx';
import type { IconKey } from './icons';
import type { Input, PadState } from './input';
import { makeFlask, makeIngredient, makeWizard, type WizardColors, type WizardModel } from './models';
import type { GameAudio } from './sfx';
import type { OrderView, StationTag, UI } from './ui';
import { COUNTER_H, type LevelWorld, type StationVis } from './world';

// ------------------------------------------------------------------ types

interface Ing { type: 'ing'; kind: IngredientKind; state: PrepState; progress: number; obj: THREE.Group }
interface Flask { type: 'flask'; potion: PotionId | null; obj: THREE.Group }
type Item = Ing | Flask;

interface Brew {
  contents: IngredientKind[];
  progress: number;
  done: boolean;
  over: number;
  burnt: boolean;
  potion: PotionId | null;
  alarmT: number;
  bubbleT: number;
  color: THREE.Color;
  light: THREE.PointLight | null;
}

interface Station {
  vis: StationVis;
  item: Item | null;
  fire: number;
  spreadT: number;
  work: number; // vanish progress / generic
  sfxT: number;
  brew: Brew | null;
  tag: StationTag | null;
  kick: number;
  owlT: number;
}

interface Player {
  idx: number;
  m: WizardModel;
  pos: THREE.Vector2;
  vel: THREE.Vector2;
  yaw: number;
  held: Item | null;
  dashT: number;
  dashCd: number;
  casting: number;
  walk: number;
  squash: number;
  fall: number;
  active: boolean;
  target: Station | null;
  highlight: THREE.Mesh;
  stepT: number;
}

interface FloorItem { item: Item; x: number; z: number; plat: number }
interface Thrown { item: Item; x: number; y: number; z: number; vx: number; vy: number; vz: number; owner: number; age: number }
interface Order { potion: PotionId; t: number; patience: number; view: OrderView }

export interface GameDeps {
  scene: THREE.Scene;
  world: LevelWorld;
  level: LevelDef;
  fx: Fx;
  audio: GameAudio;
  ui: UI;
  input: Input;
  lights: THREE.PointLight[];
  project: (x: number, y: number, z: number) => { x: number; y: number; on: boolean };
  shake: (amount: number) => void;
  flash: (amount: number) => void;
  solo: boolean;
}

export interface GameResult { score: number; delivered: number; failed: number; tips: number }

const WIZARDS: WizardColors[] = [
  { robe: 0x5a1820, trim: 0xe8b830, scarfA: 0xd02a2a, scarfB: 0xe8b830, hat: 0x3a1a40, skin: 0xf2c8a8, hair: 0x6a3a1a },
  { robe: 0x1a2c60, trim: 0xc8a060, scarfA: 0x2f72f0, scarfB: 0xc8a060, hat: 0x1c3048, skin: 0xc68a62, hair: 0x1a1010 },
];

const SPEED = 4.3;
const RADIUS = 0.3;
const tmpV = new THREE.Vector3();

function disposeObj(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
}

function highlightMesh(color: number): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.04, 1.04),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(2.2) }, uTime: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -4,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){ vec2 d = abs(vUv - 0.5) - 0.42; float r = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.05;
          float a = smoothstep(0.035, 0.0, abs(r)) * (0.7 + 0.3 * sin(uTime * 8.0));
          gl_FragColor = vec4(uColor * a, 1.0); }`,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.visible = false;
  m.renderOrder = 3;
  return m;
}

// ------------------------------------------------------------------ game

export class Game {
  readonly root = new THREE.Group();
  private readonly world: LevelWorld;
  private readonly level: LevelDef;
  private readonly stations: Station[] = [];
  private readonly grid: (Station | null)[][];
  private readonly players: Player[] = [];
  private readonly floor: FloorItem[] = [];
  private readonly thrown: Thrown[] = [];
  private readonly orders: Order[] = [];
  private readonly rng: SeededRandom;
  private readonly platOffset: THREE.Vector2[] = [];
  private readonly platDelta: THREE.Vector2[] = [];
  private time = 0;
  private orderT = 0;
  score = 0;
  private streak = 0;
  private stats = { delivered: 0, failed: 0, tips: 0 };
  timeLeft: number;
  running = false;
  private tutorial: { at: number; text: string }[] = [];
  private stormT = 6;
  private lastPotion: PotionId | null = null;
  private hurry = false;
  private lastTick = 99;

  constructor(private readonly d: GameDeps) {
    this.world = d.world;
    this.level = d.level;
    this.timeLeft = d.level.duration;
    this.rng = new SeededRandom(`orders-${d.level.id}`);
    d.scene.add(this.root);
    this.grid = this.world.cells.map((row) => row.map(() => null));
    let li = 0;
    for (const l of d.lights) { l.userData.torch = false; l.intensity = 0; }
    for (const vis of this.world.stations) {
      const st: Station = { vis, item: null, fire: 0, spreadT: 0, work: 0, sfxT: 0, brew: null, tag: null, kick: 0, owlT: 0 };
      if (vis.kind === 'cauldron') {
        st.brew = { contents: [], progress: 0, done: false, over: 0, burnt: false, potion: null, alarmT: 0, bubbleT: 0, color: new THREE.Color(0x1d3a34), light: d.lights[li++] ?? null };
        if (st.brew.light) { st.brew.light.position.set(vis.x, 1.25, vis.z); st.brew.light.distance = 4.5; }
      }
      if (vis.kind === 'cauldron' || vis.kind === 'chop' || vis.kind === 'mortar') st.tag = d.ui.tag();
      this.stations.push(st);
      this.grid[vis.cz][vis.cx] = st;
    }
    // torches take the remaining pooled lights
    for (const tp of this.world.torches) {
      const l = d.lights[li++];
      if (!l) break;
      l.position.copy(tp).add(new THREE.Vector3(0, 0.15, 0));
      l.color.set(0xff9a4a);
      l.distance = 6;
      l.userData.torch = true;
    }
    for (; li < d.lights.length; li++) d.lights[li].intensity = 0;
    for (const _ of this.world.platforms) { this.platOffset.push(new THREE.Vector2()); this.platDelta.push(new THREE.Vector2()); }

    for (let i = 0; i < 2; i++) {
      const m = makeWizard(WIZARDS[i]);
      const sp = this.world.spawns[i] ?? this.world.spawns[0];
      const p: Player = {
        idx: i, m, pos: sp.clone(), vel: new THREE.Vector2(), yaw: 0, held: null,
        dashT: 0, dashCd: 0, casting: 0, walk: 0, squash: 0, fall: 0, active: i === 0 || !d.solo,
        target: null, highlight: highlightMesh(WIZARDS[i].scarfA), stepT: 0,
      };
      m.root.position.set(sp.x, 0, sp.y);
      this.root.add(m.root, p.highlight);
      this.players.push(p);
    }
    if (d.level.id === 1) {
      this.tutorial = [
        { at: 0.5, text: 'Owls want potions — see the tickets at the top!' },
        { at: 6, text: 'Grab ingredients from crates (Space). Chop on boards, grind in mortars (hold E).' },
        { at: 13, text: 'Drop prepared ingredients into a cauldron and let it brew.' },
        { at: 20, text: 'Fill an empty flask from the rack at the finished cauldron, then take it to the Owl Post.' },
        { at: 28, text: "Don't let brews scorch — vanish ruined ones with E, douse fires with E!" },
      ];
    } else if (d.level.id === 2) {
      this.tutorial = [{ at: 1, text: 'Ride the drifting stair — or throw ingredients across with Q!' }];
    } else {
      this.tutorial = [{ at: 1, text: 'Brews scorch fast up here. Keep a wand ready for fires!' }];
    }
    d.ui.clearOrders();
    d.ui.setScore(0);
    d.ui.setStreak(1);
    d.ui.setTime(this.timeLeft);
    this.updatePlatforms(0);
    this.syncVisuals(0, 0);
  }

  get result(): GameResult { return { score: this.score, ...this.stats }; }

  start(): void {
    this.running = true;
    this.addOrder();
    this.addOrder();
  }

  dispose(): void {
    for (const s of this.stations) s.tag?.remove();
    for (const o of this.orders) o.view.el.remove();
    this.root.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.root.removeFromParent();
    for (const s of this.stations) if (s.item) disposeObj(s.item.obj);
    for (const f of this.floor) disposeObj(f.item.obj);
    for (const t of this.thrown) disposeObj(t.item.obj);
  }

  // ---------------------------------------------------------------- grid helpers

  private cellOf(x: number, z: number): [number, number] {
    return [Math.floor(x + this.world.W / 2), Math.floor(z + this.world.H / 2)];
  }

  private platformAt(x: number, z: number): number {
    for (let i = 0; i < this.world.platforms.length; i++) {
      const o = this.platOffset[i];
      for (const c of this.world.platforms[i].cells) {
        const cc = this.world.center(c.cx, c.cz);
        if (Math.abs(x - (cc.x + o.x)) <= 0.5 && Math.abs(z - (cc.y + o.y)) <= 0.5) return i;
      }
    }
    return -1;
  }

  private walkable(x: number, z: number): boolean {
    const [cx, cz] = this.cellOf(x, z);
    const cell = this.world.cells[cz]?.[cx];
    if (!cell) return false;
    if (cell.floor) return true;
    if (cell.void) return this.platformAt(x, z) >= 0;
    return false;
  }

  private overVoid(x: number, z: number): boolean {
    const [cx, cz] = this.cellOf(x, z);
    const cell = this.world.cells[cz]?.[cx];
    return !!cell?.void && this.platformAt(x, z) < 0;
  }

  private stationAt(x: number, z: number): Station | null {
    const [cx, cz] = this.cellOf(x, z);
    return this.grid[cz]?.[cx] ?? null;
  }

  private fitScore(x: number, z: number): number {
    let s = 0;
    if (this.walkable(x, z)) s += 4;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? RADIUS * 0.75 : RADIUS;
      if (this.walkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) s++;
    }
    return s;
  }

  // ---------------------------------------------------------------- items

  private newIng(kind: IngredientKind, state: PrepState = 'raw'): Ing {
    return { type: 'ing', kind, state, progress: 0, obj: makeIngredient(kind, state) };
  }

  private newFlask(potion: PotionId | null): Flask {
    return { type: 'flask', potion, obj: makeFlask(potion) };
  }

  private setFlask(f: Flask, potion: PotionId | null): void {
    const parent = f.obj.parent;
    disposeObj(f.obj);
    f.potion = potion;
    f.obj = makeFlask(potion);
    parent?.add(f.obj);
  }

  private hold(p: Player, item: Item): void {
    p.held = item;
    item.obj.position.set(0, 0, 0);
    item.obj.rotation.set(0, 0, 0);
    item.obj.scale.setScalar(1);
    p.m.hold.add(item.obj);
    p.squash = 1;
  }

  private putOn(st: Station, item: Item): void {
    st.item = item;
    item.obj.position.set(st.vis.x, st.vis.top, st.vis.z);
    item.obj.rotation.set(0, st.vis.yaw + (item.type === 'ing' ? 0.4 : 0), 0);
    item.obj.scale.setScalar(1.25);
    item.obj.userData.pop = 1;
    this.root.add(item.obj);
  }

  private dropToFloor(item: Item, x: number, z: number): void {
    if (this.overVoid(x, z)) {
      this.d.fx.puff(x, -0.5, z, 0x806090);
      this.d.audio.play('fall');
      disposeObj(item.obj);
      return;
    }
    const plat = this.platformAt(x, z);
    item.obj.position.set(x, 0.02, z);
    item.obj.rotation.set(0, Math.random() * 6, 0);
    item.obj.scale.setScalar(1.15);
    this.root.add(item.obj);
    this.floor.push({ item, x, z, plat: this.world.cells[this.cellOf(x, z)[1]]?.[this.cellOf(x, z)[0]]?.void ? plat : -1 });
  }

  // ---------------------------------------------------------------- orders

  private addOrder(): void {
    if (this.orders.length >= this.level.maxOrders) return;
    let p = this.rng.pick(this.level.potions);
    if (p === this.lastPotion && this.rng.chance(0.6)) p = this.rng.pick(this.level.potions);
    this.lastPotion = p;
    const patience = this.level.patience + POTIONS[p].recipe.length * 4;
    this.orders.push({ potion: p, t: patience, patience, view: this.d.ui.addOrder(p) });
    this.orderT = this.level.orderEvery * this.rng.range(0.85, 1.15);
  }

  private deliver(p: Player, st: Station, f: Flask): void {
    const scr = this.d.project(st.vis.x, st.vis.top + 0.8, st.vis.z);
    const idx = this.orders.findIndex((o) => o.potion === f.potion);
    if (idx < 0 || !f.potion || f.potion === 'mess') {
      this.d.audio.play('wrong');
      this.d.ui.toast(f.potion === 'mess' ? 'The owl refuses a Muddled Mess — vanish it in the bin.' : 'Nobody ordered that potion!');
      return;
    }
    const o = this.orders[idx];
    this.orders.splice(idx, 1);
    this.d.ui.removeOrder(o.view, false);
    this.streak = idx === 0 ? Math.min(4, this.streak + 1) : 1;
    const base = POTIONS[o.potion].value;
    const tip = Math.round(8 * (o.t / o.patience)) * this.streak;
    this.score += base + tip;
    this.stats.delivered++;
    this.stats.tips += tip;
    this.d.ui.setScore(this.score, true);
    this.d.ui.setStreak(this.streak);
    this.d.ui.pop(scr.x, scr.y, `+${base + tip}`);
    if (tip > 0) setTimeout(() => this.d.ui.pop(scr.x, scr.y + 30, `tip ${tip}${this.streak > 1 ? ` ×${this.streak}` : ''}`), 200);
    this.d.audio.play('deliver');
    const c = new THREE.Color(POTIONS[o.potion].color);
    this.d.fx.burst(st.vis.x, st.vis.top + 0.4, st.vis.z, c);
    // the owl takes it
    disposeObj(f.obj);
    p.held = null;
    st.owlT = 2.2;
    this.d.audio.play('whoosh');
    if (this.orders.length === 0) this.orderT = Math.min(this.orderT, 2);
  }

  // ---------------------------------------------------------------- interaction

  private pickTarget(p: Player): Station | null {
    const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
    let best: Station | null = null;
    let bestS = -1e9;
    const [pcx, pcz] = this.cellOf(p.pos.x, p.pos.y);
    for (let z = pcz - 2; z <= pcz + 2; z++) for (let x = pcx - 2; x <= pcx + 2; x++) {
      const st = this.grid[z]?.[x];
      if (!st) continue;
      const vx = st.vis.x - p.pos.x, vz = st.vis.z - p.pos.y;
      // distance from the player to the station's square
      const ex = Math.max(0, Math.abs(vx) - 0.5), ez = Math.max(0, Math.abs(vz) - 0.5);
      const edge = Math.hypot(ex, ez);
      if (edge > 0.75) continue;
      const len = Math.hypot(vx, vz) || 1;
      const dot = (vx * dx + vz * dz) / len;
      if (dot < 0.35) continue;
      const s = dot * 1.4 - edge * 2 - len * 0.4;
      if (s > bestS) { bestS = s; best = st; }
    }
    return best;
  }

  private floorItemNear(p: Player): number {
    const fx = p.pos.x + Math.sin(p.yaw) * 0.45, fz = p.pos.y + Math.cos(p.yaw) * 0.45;
    let bi = -1, bd = 0.6;
    this.floor.forEach((f, i) => {
      const dd = Math.hypot(f.x - fx, f.z - fz);
      if (dd < bd) { bd = dd; bi = i; }
    });
    return bi;
  }

  private grab(p: Player): void {
    const st = p.target;
    const a = this.d.audio;
    if (!p.held) {
      const fi = this.floorItemNear(p);
      if (fi >= 0 && (!st || !st.item)) {
        const f = this.floor.splice(fi, 1)[0];
        this.hold(p, f.item);
        a.play('pickup');
        return;
      }
      if (!st) return;
      if (st.fire > 0) { a.play('wrong'); this.d.ui.toast('It’s on fire! Hold E to cast Aguamenti.'); return; }
      if (st.item) {
        const it = st.item;
        st.item = null;
        this.hold(p, it);
        a.play('pickup');
        return;
      }
      if (st.vis.kind === 'crate' && st.vis.crate) {
        this.hold(p, this.newIng(st.vis.crate));
        a.play('pickup');
        this.d.fx.sparkle(st.vis.x, st.vis.top, st.vis.z, INGREDIENTS[st.vis.crate].color, 6, 1, 1.5);
        return;
      }
      if (st.vis.kind === 'flask') {
        this.hold(p, this.newFlask(null));
        a.play('bottle');
        return;
      }
      if (st.vis.kind === 'cauldron' && st.brew) {
        this.d.ui.toast(st.brew.done && !st.brew.burnt ? 'Bring an empty flask to bottle it!' : 'Add prepared ingredients to brew.');
      }
      return;
    }

    // holding something
    const held = p.held;
    if (!st) {
      const fx = p.pos.x + Math.sin(p.yaw) * 0.55, fz = p.pos.y + Math.cos(p.yaw) * 0.55;
      if (this.walkable(fx, fz)) {
        p.held = null;
        this.dropToFloor(held, fx, fz);
        a.play('drop');
      }
      return;
    }
    if (st.fire > 0) { a.play('wrong'); this.d.ui.toast('It’s on fire! Hold E to cast Aguamenti.'); return; }
    const k = st.vis.kind;
    if (k === 'bin') {
      if (held.type === 'flask' && held.potion) {
        this.setFlask(held, null);
        a.play('vanish');
      } else {
        p.held = null;
        disposeObj(held.obj);
        a.play('vanish');
      }
      st.kick = 1;
      this.d.fx.sparkle(st.vis.x, st.vis.top + 0.1, st.vis.z, 0xb060ff, 16, 1.2, 2.5);
      return;
    }
    if (k === 'delivery') {
      if (held.type === 'flask' && held.potion) this.deliver(p, st, held);
      else { a.play('wrong'); this.d.ui.toast('The owls only carry bottled potions.'); }
      return;
    }
    if (k === 'cauldron' && st.brew) {
      const b = st.brew;
      if (held.type === 'ing') {
        if (b.burnt) { a.play('wrong'); this.d.ui.toast('Scorched! Hold E to vanish it (Evanesco).'); return; }
        if (b.contents.length >= 3) { a.play('wrong'); this.d.ui.toast('That cauldron is full.'); return; }
        if (held.state !== readyState(held.kind)) {
          a.play('wrong');
          this.d.ui.toast(INGREDIENTS[held.kind].prep === 'chop' ? `Chop the ${INGREDIENTS[held.kind].name} first!` : `Grind the ${INGREDIENTS[held.kind].name} first!`);
          return;
        }
        const n = b.contents.length;
        b.contents.push(held.kind);
        b.progress = b.done ? 0.55 : b.progress * (n / (n + 1));
        b.done = false;
        b.over = 0;
        b.potion = null;
        p.held = null;
        disposeObj(held.obj);
        a.play('plop');
        this.d.fx.sparkle(st.vis.x, st.vis.top - 0.05, st.vis.z, INGREDIENTS[held.kind].color, 14, 1.4, 2);
        this.d.fx.puff(st.vis.x, st.vis.top, st.vis.z, 0xd0e0e8, 4);
        return;
      }
      // flask
      if (held.potion) { a.play('wrong'); this.d.ui.toast('That flask is already full.'); return; }
      if (b.burnt) { a.play('wrong'); this.d.ui.toast('Scorched! Hold E to vanish it (Evanesco).'); return; }
      if (!b.done || !b.potion) { a.play('wrong'); this.d.ui.toast(b.contents.length ? 'Still brewing…' : 'The cauldron is empty.'); return; }
      this.setFlask(held, b.potion);
      this.resetBrew(b);
      a.play('bottle');
      this.d.fx.sparkle(st.vis.x, st.vis.top + 0.1, st.vis.z, POTIONS[held.potion!].color, 20, 1.6, 3);
      return;
    }
    if (k === 'flask') {
      if (held.type === 'flask' && !held.potion) { p.held = null; disposeObj(held.obj); a.play('drop'); }
      return;
    }
    if (k === 'crate') {
      if (held.type === 'ing' && held.kind === st.vis.crate && held.state === 'raw') { p.held = null; disposeObj(held.obj); a.play('drop'); }
      else a.play('wrong');
      return;
    }
    // counter / board / mortar
    if (!st.item) {
      p.held = null;
      this.putOn(st, held);
      a.play('drop');
    } else a.play('wrong');
  }

  private resetBrew(b: Brew): void {
    b.contents = [];
    b.progress = 0;
    b.done = false;
    b.over = 0;
    b.burnt = false;
    b.potion = null;
  }

  private throwItem(p: Player): void {
    const it = p.held;
    if (!it) return;
    if (it.type !== 'ing') { this.d.ui.toast('Flasks are too fragile to throw!'); this.d.audio.play('wrong'); return; }
    p.held = null;
    this.root.add(it.obj);
    const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
    it.obj.position.set(p.pos.x + dx * 0.4, 0.95, p.pos.y + dz * 0.4);
    this.thrown.push({ item: it, x: it.obj.position.x, y: 0.95, z: it.obj.position.z, vx: dx * 7.5, vy: 2.6, vz: dz * 7.5, owner: p.idx, age: 0 });
    p.squash = -1;
    this.d.audio.play('throw');
  }

  private useHeld(p: Player, dt: number): boolean {
    // Aguamenti first: any fire ahead
    const dx = Math.sin(p.yaw), dz = Math.cos(p.yaw);
    let fireSt: Station | null = null;
    let bd = 2.2;
    for (const s of this.stations) {
      if (s.fire <= 0) continue;
      const vx = s.vis.x - p.pos.x, vz = s.vis.z - p.pos.y;
      const l = Math.hypot(vx, vz);
      if (l < bd && (vx * dx + vz * dz) / l > 0.55) { bd = l; fireSt = s; }
    }
    if (fireSt) {
      fireSt.fire = Math.max(0, fireSt.fire - dt * 0.9);
      fireSt.spreadT = Math.max(fireSt.spreadT, 3);
      const tip = p.m.wandTip.getWorldPosition(tmpV);
      this.d.fx.water(tip.x, tip.y, tip.z, dx, dz);
      if ((p.stepT -= dt) <= 0) { this.d.audio.play('water'); p.stepT = 0.12; }
      if (fireSt.fire === 0) { this.d.fx.puff(fireSt.vis.x, fireSt.vis.top + 0.2, fireSt.vis.z, 0x9a9aa8, 14); this.d.audio.play('vanish'); }
      return true;
    }
    const st = p.target;
    if (!st || st.fire > 0) return false;
    if (p.held) return false;
    const it = st.item;
    if ((st.vis.kind === 'chop' || st.vis.kind === 'mortar') && it?.type === 'ing') {
      const need = st.vis.kind === 'chop' ? 'chop' : 'grind';
      const prep = INGREDIENTS[it.kind].prep;
      if (it.state !== 'raw' || prep === 'none') return false;
      if (prep !== need) {
        if (st.sfxT <= 0) { this.d.ui.toast(prep === 'chop' ? 'That needs a chopping board.' : 'That needs the mortar & pestle.'); this.d.audio.play('wrong'); st.sfxT = 1.5; }
        return false;
      }
      it.progress += dt / (need === 'chop' ? 1.6 : 2.1);
      st.work = it.progress;
      if ((st.sfxT -= dt) <= 0) {
        this.d.audio.play(need === 'chop' ? 'chop' : 'grind');
        st.sfxT = need === 'chop' ? 0.22 : 0.3;
        this.d.fx.sparkle(st.vis.x, st.vis.top + 0.1, st.vis.z, INGREDIENTS[it.kind].color, 3, 0.8, 1.2);
      }
      if (it.progress >= 1) {
        const ns = readyState(it.kind);
        disposeObj(it.obj);
        const ni = this.newIng(it.kind, ns);
        st.item = null;
        this.putOn(st, ni);
        st.work = 0;
        this.d.audio.play('pickup');
        this.d.fx.sparkle(st.vis.x, st.vis.top + 0.15, st.vis.z, 0xfff0c0, 14, 1.5, 2.5);
      }
      return true;
    }
    if (st.vis.kind === 'cauldron' && st.brew && (st.brew.contents.length || st.brew.burnt)) {
      st.work += dt / 0.8;
      if (st.work >= 1) {
        this.resetBrew(st.brew);
        st.work = 0;
        this.d.audio.play('vanish');
        this.d.fx.puff(st.vis.x, st.vis.top, st.vis.z, 0xc0a0ff, 16);
        this.d.fx.sparkle(st.vis.x, st.vis.top, st.vis.z, 0xc080ff, 20, 1.6, 2.5);
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- platforms

  private updatePlatforms(t: number): void {
    this.world.platforms.forEach((pv, i) => {
      const def = this.level.platforms[i] ?? this.level.platforms[0];
      if (!def) return;
      const cyc = 2 * (def.period + def.pause);
      let u = ((t / cyc + (def.phase ?? 0)) % 1) * cyc;
      let f: number;
      if (u < def.pause) f = 0;
      else if ((u -= def.pause) < def.period) f = u / def.period;
      else if ((u -= def.period) < def.pause) f = 1;
      else f = 1 - (u - def.pause) / def.period;
      f = f * f * (3 - 2 * f);
      const off = f * def.travel;
      const nx = def.axis === 'x' ? off : 0, nz = def.axis === 'z' ? off : 0;
      this.platDelta[i].set(nx - this.platOffset[i].x, nz - this.platOffset[i].y);
      this.platOffset[i].set(nx, nz);
      pv.group.position.set(nx, Math.sin(t * 1.7 + i) * 0.02, nz);
      pv.runes.emissiveIntensity = 1.4 + Math.sin(t * 3 + i) * 0.6 + (f > 0 && f < 1 ? 1.2 : 0);
    });
  }

  // ---------------------------------------------------------------- update

  update(dt: number, elapsed: number): void {
    const playing = this.running;
    if (playing) {
      this.time += dt;
      this.timeLeft -= dt;
      this.d.ui.setTime(this.timeLeft);
      if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== this.lastTick && this.timeLeft > 0) {
        this.lastTick = Math.ceil(this.timeLeft);
        this.d.audio.play('tick');
      }
      if (!this.hurry && this.timeLeft < 30) { this.hurry = true; this.d.audio.setHurry(true); }
      while (this.tutorial.length && this.time >= this.tutorial[0].at) this.d.ui.toast(this.tutorial.shift()!.text, 5.5);
    }
    this.updatePlatforms(this.time);

    const pads = this.d.input.poll();
    if (playing) {
      if (this.d.solo && pads[0].swap) {
        this.players.forEach((p) => { p.active = !p.active; });
        this.d.audio.play('swap');
        const a = this.players.find((p) => p.active)!;
        this.d.fx.sparkle(a.pos.x, 1.2, a.pos.y, WIZARDS[a.idx].scarfA, 14, 1.2, 2.5);
      }
      let pi = 0;
      for (const p of this.players) {
        const pad = this.d.solo ? (p.active ? pads[0] : null) : pads[pi++];
        this.updatePlayer(p, pad, dt);
      }
    } else for (const p of this.players) this.updatePlayer(p, null, dt);
    this.separatePlayers();
    this.updateThrown(dt);
    // floor items ride platforms
    for (const f of this.floor) if (f.plat >= 0) {
      f.x += this.platDelta[f.plat].x; f.z += this.platDelta[f.plat].y;
      f.item.obj.position.set(f.x, 0.02, f.z);
    }
    if (playing) {
      this.updateStations(dt);
      this.updateOrders(dt);
      if (this.level.mood === 'storm') this.updateStorm(dt);
    }
    this.syncVisuals(dt, elapsed);
  }

  private updatePlayer(p: Player, pad: PadState | null, dt: number): void {
    const m = p.m;
    if (p.fall > 0) {
      p.fall += dt;
      m.root.position.y -= dt * 6 * p.fall;
      if (p.fall > 2.5) {
        const sp = this.world.spawns[p.idx] ?? this.world.spawns[0];
        p.pos.copy(sp);
        p.fall = 0;
        m.root.position.y = 0;
        this.d.fx.sparkle(sp.x, 0.6, sp.y, WIZARDS[p.idx].scarfA, 24, 1.8, 3);
        this.d.audio.play('swap');
      }
      return;
    }
    // ride a platform
    const plat = this.platformAt(p.pos.x, p.pos.y);
    const onVoidCell = this.world.cells[this.cellOf(p.pos.x, p.pos.y)[1]]?.[this.cellOf(p.pos.x, p.pos.y)[0]]?.void;
    if (plat >= 0 && onVoidCell) p.pos.add(this.platDelta[plat]);

    let ix = pad?.x ?? 0, iz = pad?.z ?? 0;
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    p.dashCd -= dt;
    if (pad?.dash && p.dashCd <= 0) {
      p.dashT = 0.16; p.dashCd = 0.55;
      this.d.audio.play('whoosh');
      this.d.fx.puff(p.pos.x, 0.15, p.pos.y, 0xb0a898, 6);
    }
    const sp = SPEED * (p.dashT > 0 ? 2.8 : 1);
    p.dashT -= dt;
    const tx = (p.dashT > 0 && il < 0.1 ? Math.sin(p.yaw) : ix) * sp;
    const tz = (p.dashT > 0 && il < 0.1 ? Math.cos(p.yaw) : iz) * sp;
    const k = 1 - Math.exp(-dt * (il > 0.05 || p.dashT > 0 ? 14 : 18));
    p.vel.x += (tx - p.vel.x) * k;
    p.vel.y += (tz - p.vel.y) * k;
    if (il > 0.1) {
      const want = Math.atan2(ix, iz);
      let d = want - p.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.yaw += d * (1 - Math.exp(-dt * 16));
    }
    // move with axis-separated collision
    const s0 = this.fitScore(p.pos.x, p.pos.y);
    const nx = p.pos.x + p.vel.x * dt;
    const s1 = this.fitScore(nx, p.pos.y);
    if (s1 === 12 || s1 >= s0) p.pos.x = nx; else p.vel.x = 0;
    const s2 = this.fitScore(p.pos.x, p.pos.y);
    const nz = p.pos.y + p.vel.y * dt;
    const s3 = this.fitScore(p.pos.x, nz);
    if (s3 === 12 || s3 >= s2) p.pos.y = nz; else p.vel.y = 0;

    if (this.overVoid(p.pos.x, p.pos.y)) {
      p.fall = 0.01;
      this.d.audio.play('fall');
      if (p.held) { disposeObj(p.held.obj); p.held = null; }
      return;
    }

    p.target = this.pickTarget(p);
    if (pad) {
      if (pad.grab) this.grab(p);
      if (pad.throw) this.throwItem(p);
      const using = pad.use && this.useHeld(p, dt);
      p.casting = using ? Math.min(1, p.casting + dt * 8) : Math.max(0, p.casting - dt * 5);
      if (!pad.use) for (const s of this.stations) if (s.vis.kind === 'cauldron' && s === p.target) s.work = 0;
    } else p.casting = Math.max(0, p.casting - dt * 5);

    // footsteps
    const spd = p.vel.length();
    p.walk += spd * dt * 3.2;
  }

  private separatePlayers(): void {
    const [a, b] = this.players;
    if (a.fall || b.fall) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.y - a.pos.y;
    const d = Math.hypot(dx, dz);
    if (d < 0.62 && d > 1e-4) {
      const push = (0.62 - d) / 2;
      const ux = dx / d, uz = dz / d;
      const tryMove = (p: Player, sx: number, sz: number) => {
        const nx = p.pos.x + sx, nz = p.pos.y + sz;
        if (this.fitScore(nx, nz) >= this.fitScore(p.pos.x, p.pos.y)) p.pos.set(nx, nz);
      };
      tryMove(a, -ux * push, -uz * push);
      tryMove(b, ux * push, uz * push);
    }
  }

  private updateThrown(dt: number): void {
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.age += dt;
      const steps = 3;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        const h = dt / steps;
        const px = t.x, pz = t.z;
        t.vy -= 9.8 * h;
        t.x += t.vx * h; t.y += t.vy * h; t.z += t.vz * h;
        // catch
        for (const p of this.players) {
          if (p.held || p.fall || (p.idx === t.owner && t.age < 0.35)) continue;
          if (Math.hypot(p.pos.x - t.x, p.pos.y - t.z) < 0.5 && t.y > 0.3 && t.y < 1.4) {
            this.hold(p, t.item);
            this.d.audio.play('pickup');
            done = true;
            break;
          }
        }
        if (done) break;
        const st = this.stationAt(t.x, t.z);
        const [cx, cz] = this.cellOf(t.x, t.z);
        const cell = this.world.cells[cz]?.[cx];
        if (st && t.y < st.vis.top + 0.25) {
          done = true;
          if (!this.landOn(st, t.item)) this.dropToFloor(t.item, px, pz);
        } else if (!cell || cell.ch === '#') {
          done = true;
          this.dropToFloor(t.item, px, pz);
          this.d.audio.play('drop');
        } else if (t.y <= 0.05) {
          done = true;
          this.dropToFloor(t.item, t.x, t.z);
          if (!this.overVoid(t.x, t.z)) this.d.audio.play('drop');
        }
      }
      if (done) { this.thrown.splice(i, 1); continue; }
      t.item.obj.position.set(t.x, t.y, t.z);
      t.item.obj.rotation.x += dt * 9;
      this.d.fx.trail(t.x, t.y + 0.1, t.z, INGREDIENTS[(t.item as Ing).kind].color);
    }
  }

  /** A thrown ingredient arrives at a station. */
  private landOn(st: Station, it: Item): boolean {
    if (st.fire > 0 || it.type !== 'ing') return false;
    const k = st.vis.kind;
    if (k === 'bin') { disposeObj(it.obj); this.d.audio.play('vanish'); st.kick = 1; return true; }
    if (k === 'cauldron' && st.brew) {
      const b = st.brew;
      if (b.burnt || b.contents.length >= 3 || it.state !== readyState(it.kind)) return false;
      const n = b.contents.length;
      b.contents.push(it.kind);
      b.progress = b.done ? 0.55 : b.progress * (n / (n + 1));
      b.done = false; b.over = 0; b.potion = null;
      disposeObj(it.obj);
      this.d.audio.play('plop');
      this.d.fx.sparkle(st.vis.x, st.vis.top, st.vis.z, INGREDIENTS[it.kind].color, 18, 1.6, 2.5);
      return true;
    }
    if ((k === 'counter' || k === 'chop' || k === 'mortar') && !st.item) {
      this.putOn(st, it);
      this.d.audio.play('drop');
      return true;
    }
    return false;
  }

  private ignite(st: Station): void {
    if (st.fire > 0 || st.vis.kind === 'delivery') return;
    st.fire = 0.4;
    st.spreadT = 6 + Math.random() * 3;
    this.d.audio.play('ignite');
    this.d.shake(0.25);
    this.d.ui.toast('Fire! Hold E to cast Aguamenti!', 2.5);
  }

  private updateStations(dt: number): void {
    let bubbling = 0, fires = 0;
    for (const st of this.stations) {
      st.sfxT -= dt;
      // fire
      if (st.fire > 0) {
        fires += st.fire;
        st.fire = Math.min(1, st.fire + dt * 0.25);
        if ((st.spreadT -= dt) <= 0) {
          st.spreadT = 6 + Math.random() * 3;
          const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]]
            .map(([a, b]) => this.grid[st.vis.cz + b]?.[st.vis.cx + a])
            .filter((s): s is Station => !!s && s.fire <= 0 && s.vis.kind !== 'delivery');
          if (nb.length) this.ignite(nb[Math.floor(Math.random() * nb.length)]);
        }
      }
      const b = st.brew;
      if (!b) continue;
      if (b.contents.length && !b.done && !b.burnt) {
        bubbling += 0.5;
        b.progress += dt / (3.5 + 1.8 * b.contents.length);
        if ((b.bubbleT -= dt) <= 0) { this.d.audio.bubble(); b.bubbleT = 0.15 + Math.random() * 0.4; }
        if (b.progress >= 1) {
          b.progress = 1;
          b.done = true;
          b.over = 0;
          b.potion = matchPotion(b.contents);
          this.d.audio.play(b.potion === 'mess' ? 'expire' : 'star');
          this.d.fx.sparkle(st.vis.x, st.vis.top, st.vis.z, POTIONS[b.potion].color, 30, 2, 3);
        }
      } else if (b.done && !b.burnt) {
        bubbling += 1;
        b.over += dt;
        if ((b.bubbleT -= dt) <= 0) { this.d.audio.bubble(); b.bubbleT = 0.08 + Math.random() * 0.2; }
        if (b.over > this.level.overbrew * 0.55 && (b.alarmT -= dt) <= 0) {
          this.d.audio.play('alarm');
          b.alarmT = Math.max(0.18, 0.6 * (1 - b.over / this.level.overbrew) + 0.15);
        }
        if (b.over >= this.level.overbrew) {
          b.burnt = true;
          b.potion = null;
          this.d.fx.puff(st.vis.x, st.vis.top + 0.3, st.vis.z, 0x2a2420, 20);
          this.ignite(st);
        }
      }
    }
    this.d.audio.setBeds(bubbling, fires, this.level.mood === 'storm' ? 1 : 0);
  }

  private updateOrders(dt: number): void {
    this.orderT -= dt;
    if (this.orderT <= 0) this.addOrder();
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const o = this.orders[i];
      o.t -= dt;
      if (o.t <= 0) {
        this.orders.splice(i, 1);
        this.d.ui.removeOrder(o.view, true);
        this.score = Math.max(0, this.score - 10);
        this.stats.failed++;
        this.streak = 1;
        this.d.ui.setScore(this.score);
        this.d.ui.setStreak(1);
        this.d.audio.play('expire');
        this.d.ui.toast('An owl left empty-taloned… −10');
      }
    }
    this.orders.forEach((o, i) => this.d.ui.updateOrder(o.view, Math.max(0, o.t / o.patience), i === 0));
  }

  private updateStorm(dt: number): void {
    if ((this.stormT -= dt) <= 0) {
      this.stormT = 7 + Math.random() * 9;
      this.d.flash(1);
      setTimeout(() => this.d.audio.play('thunder'), 250 + Math.random() * 700);
    }
  }

  // ---------------------------------------------------------------- visuals

  private syncVisuals(dt: number, t: number): void {
    // wizards
    for (const p of this.players) {
      const m = p.m;
      if (p.fall <= 0) m.root.position.set(p.pos.x, 0, p.pos.y);
      m.root.rotation.y = p.yaw;
      const spd = p.vel.length() / SPEED;
      const bob = Math.abs(Math.sin(p.walk * Math.PI)) * 0.06 * Math.min(1, spd);
      p.squash *= Math.exp(-dt * 8);
      m.body.position.y = bob;
      m.body.rotation.z = Math.sin(p.walk * Math.PI) * 0.08 * Math.min(1, spd);
      m.body.rotation.x = Math.min(1, spd) * 0.12 + (p.dashT > 0 ? 0.25 : 0);
      const sq = 1 + p.squash * 0.12 * Math.sin(t * 30);
      m.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      m.hat.rotation.z = Math.sin(p.walk * Math.PI + 0.6) * 0.1 * Math.min(1, spd);
      m.hat.rotation.x = -0.32 - m.body.rotation.x * 0.8;
      const holding = !!p.held;
      const swing = Math.sin(p.walk * Math.PI) * 0.5 * Math.min(1, spd);
      const castWave = p.casting * (Math.sin(t * 22) * 0.35);
      m.armL.rotation.x = holding ? -1.25 : swing;
      m.armR.rotation.x = holding ? -1.25 : p.casting > 0 ? -1.5 + castWave : -swing;
      m.armR.rotation.z = p.casting * 0.2;
      (m.wandTip.material as THREE.MeshBasicMaterial).color.setRGB(0.3 + p.casting * 4, 0.25 + p.casting * 3.6, 0.15 + p.casting * 2.5);
      if (p.casting > 0.5 && Math.random() < 0.6) {
        const tip = m.wandTip.getWorldPosition(tmpV);
        this.d.fx.trail(tip.x, tip.y, tip.z, 0xffe0a0);
      }
      const ringM = m.ring.material as THREE.MeshBasicMaterial;
      ringM.opacity = p.active ? 0.85 : 0.25;
      if (p.held && p.held.type === 'ing' && p.held.kind === 'lacewing') p.held.obj.children.forEach((c) => { if (c.userData.wing) c.rotation.z = c.userData.wing * (0.4 + Math.sin(t * 40) * 0.3); });
      // highlight
      const hl = p.highlight;
      const show = !!p.target && p.fall <= 0 && (p.active || !this.d.solo);
      hl.visible = show;
      if (p.target) {
        const v = p.target.vis;
        hl.position.set(v.x, v.kind === 'cauldron' ? 0.31 : COUNTER_H + 0.006, v.z);
        hl.scale.setScalar(v.kind === 'cauldron' ? 1 : 1);
        (hl.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
      }
    }
    // station animations
    for (const st of this.stations) {
      const v = st.vis;
      if (st.item) {
        const pop = st.item.obj.userData.pop ?? 0;
        if (pop > 0) {
          st.item.obj.userData.pop = Math.max(0, pop - dt * 5);
          st.item.obj.scale.setScalar(1.25 + Math.sin(pop * Math.PI) * 0.25);
        }
      }
      const working = st.item?.type === 'ing' && st.item.progress > 0 && st.item.progress < 1 && this.players.some((p) => p.target === st && p.casting > 0.3);
      if (v.knife) {
        const base = v.knife.userData.base as THREE.Vector3;
        v.knife.position.y = base.y + (working ? Math.abs(Math.sin(t * 16)) * 0.15 : 0);
        v.knife.rotation.z = working ? Math.sin(t * 16) * 0.3 : 0;
      }
      if (v.pestle) {
        v.pestle.rotation.y = working ? t * 9 : v.pestle.rotation.y;
      }
      if (v.vortex) {
        st.kick = Math.max(0, st.kick - dt * 1.5);
        v.vortex.uniforms.uTime.value = t;
        v.vortex.uniforms.uKick.value = st.kick;
      }
      if (v.owl) {
        const owl = v.owl;
        const home = owl.userData.home as THREE.Vector3;
        if (st.owlT > 0) {
          st.owlT -= dt;
          const u = 2.2 - st.owlT;
          const away = u < 1.0 ? u : u < 1.4 ? 1 : Math.max(0, 1 - (u - 1.4) / 0.8);
          owl.position.set(home.x, home.y + away * 3.2 + Math.sin(u * 10) * 0.05 * away, home.z - away * 2.0);
          owl.scale.setScalar(0.9 * (1 - away * 0.4));
          for (const c of owl.children) if (c.name.startsWith('wing')) c.rotation.z = (c.name === 'wingL' ? 1 : -1) * (away > 0 ? Math.sin(t * 40) * 0.9 : 0);
        } else {
          owl.position.copy(home);
          owl.position.y += Math.abs(Math.sin(t * 1.3)) < 0.03 ? 0.02 : 0;
          owl.rotation.y = v.yaw + Math.sin(t * 0.7) * 0.4;
          owl.scale.setScalar(0.9);
          for (const c of owl.children) if (c.name.startsWith('wing')) c.rotation.z = 0;
        }
      }
      if (v.grate) v.grate.emissiveIntensity = 1.2 + Math.sin(t * 9 + v.cx) * 0.25 + Math.sin(t * 23 + v.cz) * 0.15;
      if (st.fire > 0) this.d.fx.fire(v.x, v.top, v.z, st.fire);

      const b = st.brew;
      if (b && v.liquid) {
        const u = v.liquid.uniforms;
        u.uTime.value = t;
        let target: THREE.Color;
        let glow = 0.35, boil = 0;
        if (b.burnt) target = new THREE.Color(0x100c08);
        else if (b.done && b.potion) {
          target = new THREE.Color(POTIONS[b.potion].color);
          glow = b.potion === 'mess' ? 0.6 : 2.4 + Math.sin(t * 4) * 0.3;
          boil = 1;
        } else if (b.contents.length) {
          target = new THREE.Color(0x1d3a34);
          for (const k of b.contents) target.lerp(new THREE.Color(INGREDIENTS[k].color), 1 / b.contents.length);
          glow = 0.6 + b.progress * 0.9;
          boil = 0.3 + b.progress * 0.6;
        } else target = new THREE.Color(0x1d3a34);
        b.color.lerp(target, 1 - Math.exp(-dt * 3));
        (u.uColor.value as THREE.Color).copy(b.color);
        u.uGlow.value += (glow - u.uGlow.value) * (1 - Math.exp(-dt * 3));
        u.uBoil.value = boil;
        u.uBurnt.value += ((b.burnt ? 1 : 0) - u.uBurnt.value) * (1 - Math.exp(-dt * 2));
        if (v.liquidMesh) v.liquidMesh.position.y = 0.8 + Math.sin(t * 5) * 0.005 * boil;
        // steam / smoke
        if (b.burnt) { if (Math.random() < 0.4) this.d.fx.soft.emit({ pos: { x: v.x, y: 0.95, z: v.z }, vel: { x: 0, y: 0.8, z: 0 }, spread: 0.3, jitter: 0.4, color: 0x18140f, size: 0.4, grow: 2.2, life: 2, drag: 0.5, alpha: 0.6 }); }
        else if (b.contents.length && Math.random() < (b.done ? 0.5 : 0.25)) this.d.fx.steam(v.x, 0.92, v.z, b.color, b.done ? 1.6 : 1);
        if (b.done && b.potion && b.potion !== 'mess' && !b.burnt && Math.random() < 0.3) this.d.fx.trail(v.x + (Math.random() - 0.5) * 0.5, 0.9, v.z + (Math.random() - 0.5) * 0.5, b.color);
        if (b.light) {
          b.light.color.copy(b.color).lerp(new THREE.Color(0xff8a3a), b.done && !b.burnt ? 0.1 : 0.6);
          b.light.intensity = (b.burnt ? 1.5 : 2 + u.uGlow.value * 2.2) * (0.9 + Math.sin(t * 13 + v.cx) * 0.06) + st.fire * 6;
        }
      }
      // tag above stations
      if (st.tag) {
        let icons: IconKey[] | null = null;
        let prog: number | null = null;
        let warn = false;
        let done: string | null = null;
        if (b) {
          if (b.contents.length) icons = b.contents.map((k) => `ing:${k}` as IconKey);
          if (b.done && b.potion && !b.burnt) icons = [`flask:${b.potion}` as IconKey];
          if (b.contents.length && !b.done && !b.burnt) prog = b.progress;
          if (b.done && !b.burnt && b.over > this.level.overbrew * 0.55) warn = Math.sin(t * 14) > -0.3;
          if (b.burnt) done = 'Scorched!';
          if (st.work > 0) prog = st.work;
        } else if (st.item?.type === 'ing' && st.item.progress > 0 && st.item.progress < 1) prog = st.item.progress;
        st.tag.set(icons, prog, warn, done);
        const s = this.d.project(v.x, (b ? 1.15 : v.top + 0.45), v.z);
        st.tag.place(s.x, s.y, s.on);
      }
    }
    // candles bob
    const c = this.world.candles;
    const m4 = new THREE.Matrix4();
    c.base.forEach((p, i) => {
      const y = p.y + Math.sin(t * 0.8 + c.phase[i]) * 0.08;
      m4.makeTranslation(p.x, y, p.z);
      c.mesh.setMatrixAt(i, m4);
      const fl = 0.85 + Math.sin(t * 17 + c.phase[i] * 5) * 0.15;
      m4.makeScale(fl, fl * (0.9 + Math.sin(t * 11 + i) * 0.15), fl).setPosition(p.x, y + 0.29, p.z);
      c.flames.setMatrixAt(i, m4);
    });
    c.mesh.instanceMatrix.needsUpdate = true;
    c.flames.instanceMatrix.needsUpdate = true;
    for (const a of this.world.animated) (a.userData.tick as (t: number) => void)?.(t);
    // torches
    for (const l of this.d.lights) if (l.userData.torch) l.intensity = 3.2 + Math.sin(t * 11 + l.position.x) * 0.4 + Math.sin(t * 27 + l.position.z) * 0.25;
    for (const tp of this.world.torches) if (Math.random() < 0.7) this.d.fx.flame(tp.x, tp.y, tp.z, 0.8);
    this.world.windowMat.uniforms.uTime.value = t;
  }
}
