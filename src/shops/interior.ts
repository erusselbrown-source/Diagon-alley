/**
 * Walk-in shop interiors: shared types and helpers.
 *
 * An interior lives in its shop's LOCAL frame (origin front-centre at
 * pavement level, +Z toward the street) under a `userData.keep` group, so the
 * street-wide batching leaves it alone and the world can hide it when the
 * viewer is far away. It publishes:
 *  - a `RoomSpec` (walkable rectangles minus furniture) for collision,
 *  - `Interactable`s for the wand (with an `InteractionFx` toolbox),
 *  - local light sources for the light pool,
 *  - animators (only run while visible) and hinged door leaves.
 *
 * Every texture here is painted procedurally on a canvas (rule 2).
 */
import * as THREE from 'three';
import type { Animator } from '../architecture/kit';
import { SeededRandom } from '../core/random';

export interface Rect { x0: number; x1: number; z0: number; z1: number }
export interface Circle { x: number; z: number; r: number }

export interface RoomSpec {
  /** Floor height (local y). */
  floor: number;
  /** Ceiling height (local y). */
  ceiling: number;
  /** Walkable areas (local). */
  rects: Rect[];
  /** Areas only walkable while the door is open (the threshold). */
  doorRects: Rect[];
  /** Furniture footprints that block walking. */
  blockers: Rect[];
  circles: Circle[];
}

export type SfxName =
  | 'ding' | 'kaching' | 'boing' | 'squeak' | 'whoopee' | 'pop' | 'laugh' | 'honk' | 'jingle'
  | 'thunderlet' | 'chime' | 'fanfare' | 'whistle' | 'crank' | 'swish' | 'puff' | 'creak';

/** What an interactable may do to the world. Positions are WORLD space. */
export interface InteractionFx {
  sound(name: SfxName, at: THREE.Vector3): void;
  toast(text: string, color?: string): void;
  sparkle(at: THREE.Vector3, colors?: THREE.Color[], count?: number, speed?: number): void;
  darkness(seconds: number): void;
  /** A hidden collectible was found. */
  collect(id: string, at: THREE.Vector3): void;
  /** Toggle the shop's music (returns true if now playing). */
  music(): boolean;
}

export interface Interactable {
  /** Raycast target (tested recursively). */
  object: THREE.Object3D;
  activate(fx: InteractionFx, hitWorld: THREE.Vector3): void;
}

export interface LocalLight { position: THREE.Vector3; color: THREE.Color; distance: number; decay: number; intensity: () => number }

export interface ShopInterior {
  group: THREE.Group;
  room: RoomSpec;
  interactables: Interactable[];
  lights: LocalLight[];
  animators: Animator[];
  /** Door centre at the threshold (local) and the hinged leaves to swing. */
  door: { center: THREE.Vector3; leaves: THREE.Object3D[] };
  /** Where the shop's music plays from (local). */
  musicAt?: THREE.Vector3;
  /** Number of hidden collectibles. */
  collectibles: number;
  /** Per-frame hook that needs the camera (e.g. eyes that follow you). */
  look?(camera: THREE.Camera): void;
}

// ---------------------------------------------------------------------------
// Local instancing (interior-owned so it hides with the interior)
// ---------------------------------------------------------------------------

export class LocalInstances {
  private readonly kinds = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[]; c: THREE.Color[] }>();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpE = new THREE.Euler();

  define(key: string, geo: THREE.BufferGeometry, mat: THREE.Material): void {
    if (!this.kinds.has(key)) this.kinds.set(key, { geo, mat, m: [], c: [] });
  }
  has(key: string): boolean { return this.kinds.has(key); }

  put(key: string, x: number, y: number, z: number, s: THREE.Vector3Like = { x: 1, y: 1, z: 1 }, color?: THREE.ColorRepresentation, rot?: [number, number, number]): void {
    const k = this.kinds.get(key);
    if (!k) throw new Error(`LocalInstances: undefined kind ${key}`);
    this.tmpQ.setFromEuler(this.tmpE.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0));
    k.m.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), this.tmpQ, new THREE.Vector3(s.x, s.y, s.z)));
    k.c.push(new THREE.Color(color ?? 0xffffff));
  }

  build(parent: THREE.Object3D): number {
    let n = 0;
    for (const [key, k] of this.kinds) {
      if (!k.m.length) continue;
      const im = new THREE.InstancedMesh(k.geo, k.mat, k.m.length);
      k.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, k.c[i]); });
      im.name = `interior:${key}`;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      parent.add(im);
      n += k.m.length;
    }
    return n;
  }
}

// ---------------------------------------------------------------------------
// Procedural canvas textures (all tile seamlessly)
// ---------------------------------------------------------------------------

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Speckle grime over a tile so it doesn't read as flat print. */
function grime(g: CanvasRenderingContext2D, w: number, h: number, rng: SeededRandom, n: number, a: number): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(30,15,10,${rng.range(0, a)})`;
    const x = rng.range(0, w), y = rng.range(0, h), r = rng.range(1, 6);
    for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) { g.beginPath(); g.arc(x + dx, y + dy, r, 0, Math.PI * 2); g.fill(); }
  }
}

/** Polished checkerboard floor tiles with veining and wear; one repeat = 2×2 tiles. */
export function checkerFloor(seed: string, a = '#2a1440', b = '#efe2c6'): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const S = 512, rng = new SeededRandom(seed);
  const [c, g] = canvas(S, S);
  const [rc, rg] = canvas(S, S);
  rg.fillStyle = '#ff5050'; rg.fillRect(0, 0, S, S); // ORM: R = AO 1, G = rough (set per tile), B = 0
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const dark = (i + j) % 2 === 0;
    g.fillStyle = dark ? a : b;
    g.fillRect(i * S / 2, j * S / 2, S / 2, S / 2);
    // marble veins
    g.strokeStyle = dark ? 'rgba(200,150,255,0.10)' : 'rgba(120,90,60,0.12)';
    for (let v = 0; v < 6; v++) {
      g.lineWidth = rng.range(0.5, 2);
      g.beginPath();
      let x = i * S / 2 + rng.range(0, S / 2), y = j * S / 2;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += rng.range(-14, 14); y += S / 16; g.lineTo(Math.min(i * S / 2 + S / 2 - 1, Math.max(i * S / 2 + 1, x)), y); }
      g.stroke();
    }
    rg.fillStyle = `rgb(255,${Math.round(255 * (dark ? 0.22 : 0.3))},0)`;
    rg.fillRect(i * S / 2 + 3, j * S / 2 + 3, S / 2 - 6, S / 2 - 6);
  }
  // grout lines
  g.fillStyle = 'rgba(20,12,8,0.55)';
  g.fillRect(0, 0, S, 3); g.fillRect(0, S / 2 - 1.5, S, 3); g.fillRect(0, 0, 3, S); g.fillRect(S / 2 - 1.5, 0, 3, S);
  grime(g, S, S, rng, 260, 0.06);
  return { map: toTexture(c), rough: toTexture(rc, true, false) };
}

/** Flamboyant wallpaper: magenta ground, violet diamond trellis, gold star at each node. */
export function wallpaper(seed: string): THREE.CanvasTexture {
  const S = 256, rng = new SeededRandom(seed);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#7a1f6a'; g.fillRect(0, 0, S, S);
  // fine vertical stripes
  for (let x = 0; x < S; x += 16) { g.fillStyle = x % 32 ? 'rgba(255,170,230,0.05)' : 'rgba(40,0,40,0.08)'; g.fillRect(x, 0, 8, S); }
  g.strokeStyle = '#3c1a6e'; g.lineWidth = 6;
  for (const [x0, y0, x1, y1] of [[0, S / 2, S / 2, 0], [S / 2, 0, S, S / 2], [S, S / 2, S / 2, S], [S / 2, S, 0, S / 2]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  g.strokeStyle = 'rgba(255,200,90,0.55)'; g.lineWidth = 1.5;
  for (const [x0, y0, x1, y1] of [[0, S / 2, S / 2, 0], [S / 2, 0, S, S / 2], [S, S / 2, S / 2, S], [S / 2, S, 0, S / 2]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  const star = (x: number, y: number, r: number) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  };
  g.fillStyle = '#f2b84a';
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S], [S / 2, S / 2]]) star(x, y, 13);
  g.fillStyle = 'rgba(255,220,140,0.65)';
  for (const [x, y] of [[S / 2, 0], [0, S / 2], [S, S / 2], [S / 2, S]]) star(x, y, 6);
  grime(g, S, S, rng, 120, 0.05);
  return toTexture(c);
}

/** Night-sky ceiling: deep indigo with gold-leaf stars and a faint swirl. */
export function starCeiling(seed: string): THREE.CanvasTexture {
  const S = 512, rng = new SeededRandom(seed);
  const [c, g] = canvas(S, S);
  g.fillStyle = '#1c0f3a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.range(30, 90);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(110,60,170,0.18)'); grad.addColorStop(1, 'rgba(110,60,170,0)');
    g.fillStyle = grad;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) g.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
  }
  for (let i = 0; i < 160; i++) {
    const x = rng.range(0, S), y = rng.range(0, S), r = rng.chance(0.1) ? rng.range(3, 6) : rng.range(0.6, 1.8);
    g.fillStyle = `rgba(255,${200 + rng.int(0, 40)},${110 + rng.int(0, 60)},${rng.range(0.6, 1)})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    if (r > 3) { g.fillRect(x - r * 2.2, y - 0.6, r * 4.4, 1.2); g.fillRect(x - 0.6, y - r * 2.2, 1.2, r * 4.4); }
  }
  return toTexture(c);
}

/** Packaging label for a joke-shop product: bold name on a loud patterned ground. */
export function productLabel(name: string, ground: string, ink: string, seed: string): THREE.CanvasTexture {
  const W = 256, H = 256, rng = new SeededRandom(seed);
  const [c, g] = canvas(W, H);
  g.fillStyle = ground; g.fillRect(0, 0, W, H);
  // starburst or stripes
  if (rng.chance(0.5)) {
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.beginPath(); g.moveTo(W / 2, H / 2); g.arc(W / 2, H / 2, W, a, a + Math.PI / 16); g.fill(); }
  } else {
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = -H; x < W; x += 28) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 14, H); g.lineTo(x + 14 + H, 0); g.lineTo(x + H, 0); g.fill(); }
  }
  g.strokeStyle = ink; g.lineWidth = 6; g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = ink;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = name.split(' ');
  const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
  const fs = Math.min(54, 230 / Math.max(...lines.map((l) => l.length)) * 1.6);
  g.font = `900 ${fs}px Georgia, 'Times New Roman', serif`;
  lines.forEach((l, i) => g.fillText(l.toUpperCase(), W / 2, H / 2 + (i - (lines.length - 1) / 2) * fs * 1.05));
  g.font = `italic 18px Georgia, serif`;
  g.fillText('Weasleys’ Wizard Wheezes', W / 2, H - 30);
  const t = toTexture(c, false);
  t.anisotropy = 4;
  return t;
}

/** A painted sign / poster with a border and up to three lines. */
export function signTexture(lines: string[], o: { w?: number; h?: number; ground?: string; ink?: string; accent?: string; italicLast?: boolean } = {}): THREE.CanvasTexture {
  const W = o.w ?? 512, H = o.h ?? 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = o.ground ?? '#2a0f45'; g.fillRect(0, 0, W, H);
  g.strokeStyle = o.accent ?? '#f2b84a'; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
  g.lineWidth = 2; g.strokeRect(22, 22, W - 44, H - 44);
  g.fillStyle = o.ink ?? '#ffe6b0';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((l, i) => {
    const small = o.italicLast && i === n - 1 && n > 1;
    const fs = Math.min(small ? H * 0.12 : H * 0.26, (W - 80) / Math.max(4, l.length) * 1.7);
    g.font = `${small ? 'italic 400' : '900'} ${fs}px Georgia, 'Times New Roman', serif`;
    g.fillText(l, W / 2, H / 2 + (i - (n - 1) / 2) * H * 0.26);
  });
  return toTexture(c, false);
}
