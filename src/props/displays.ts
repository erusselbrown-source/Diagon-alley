/**
 * Instanced shop-window displays & street clutter. Every prop kind is one
 * shared geometry + material registered with the kit's InstanceCollector,
 * so the whole street's books, jars, cauldrons… cost a handful of draw calls.
 * Instance colours tint both albedo and a faint emissive term (see
 * KitMaterials.display) so displays read as lamp-lit behind the glass.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SeededRandom } from '../core/random';
import { normalizeForMerge, type Kit, type PlacedDisplay } from '../architecture/kit';

const lathe = (pts: number[][], seg = 14) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const merge = (...gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => normalizeForMerge(g)))!;

export type PropKind =
  | 'book' | 'jar' | 'bottle' | 'cauldron' | 'broom' | 'cage' | 'owl' | 'eye' | 'robe' | 'sundae' | 'wandbox'
  | 'trunk' | 'trunk-band' | 'teapot' | 'scroll' | 'quill' | 'parcel' | 'firework' | 'riser' | 'ball' | 'skull';

/** Register (once) and return the collector key for a prop kind. */
export function propKind(kit: Kit, kind: PropKind): string {
  const key = `prop:${kind}`;
  if (kit.instances.has(key)) return key;
  const M = kit.mats;
  const glossy = M.memo('glossy', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 0.0 })) as THREE.MeshStandardMaterial;
  const defs: Record<PropKind, () => [THREE.BufferGeometry, THREE.Material]> = {
    book: () => [new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), M.display('leather', 0.3)],
    jar: () => [lathe([[0, 0], [0.06, 0], [0.065, 0.02], [0.065, 0.13], [0.045, 0.15], [0.04, 0.17], [0.05, 0.18], [0.05, 0.2], [0, 0.2]]), M.displayFrom('glossy', glossy, 0.9)],
    bottle: () => [lathe([[0, 0], [0.045, 0], [0.05, 0.02], [0.05, 0.14], [0.02, 0.2], [0.016, 0.27], [0.022, 0.28], [0, 0.29]]), M.displayFrom('glossy', glossy, 0.9)],
    cauldron: () => [lathe([[0, 0.02], [0.12, 0], [0.2, 0.06], [0.24, 0.17], [0.22, 0.28], [0.2, 0.3], [0.215, 0.32], [0.19, 0.32], [0.17, 0.29], [0, 0.29]], 18), M.display('iron', 0.08)],
    broom: () => [merge(new THREE.CylinderGeometry(0.018, 0.022, 1.3, 6).translate(0, 0.65, 0), new THREE.ConeGeometry(0.11, 0.5, 10, 1, true).rotateX(Math.PI).translate(0, -0.2, 0)), M.display('oak', 0.25)],
    cage: () => {
      const g: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.16, 0.008, 4, 20).rotateX(Math.PI / 2), new THREE.TorusGeometry(0.16, 0.008, 4, 20).rotateX(Math.PI / 2).translate(0, 0.32, 0)];
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.push(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 3).translate(Math.cos(a) * 0.16, 0.16, Math.sin(a) * 0.16)); }
      g.push(new THREE.SphereGeometry(0.16, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.32, 0), new THREE.TorusGeometry(0.03, 0.006, 4, 10).translate(0, 0.5, 0));
      return [merge(...g), M.display('brass', 0.15)];
    },
    owl: () => [merge(new THREE.SphereGeometry(0.09, 10, 8).scale(1, 1.25, 0.95).translate(0, 0.11, 0), new THREE.SphereGeometry(0.065, 10, 8).translate(0, 0.24, 0.01), new THREE.ConeGeometry(0.02, 0.05, 4).translate(-0.04, 0.3, 0), new THREE.ConeGeometry(0.02, 0.05, 4).translate(0.04, 0.3, 0)), M.display('leather', 0.25)],
    eye: () => [merge(new THREE.SphereGeometry(0.016, 6, 4).translate(-0.025, 0.25, 0.062), new THREE.SphereGeometry(0.016, 6, 4).translate(0.025, 0.25, 0.062)), M.glow(0xffb020, 2.5)],
    robe: () => [merge(lathe([[0, 0], [0.24, 0], [0.2, 0.4], [0.16, 0.9], [0.2, 1.15], [0.08, 1.25], [0, 1.27]], 16), new THREE.SphereGeometry(0.09, 10, 8).translate(0, 1.38, 0), new THREE.ConeGeometry(0.11, 0.3, 12).translate(0, 1.6, 0)), M.display('velvet', 0.4)],
    sundae: () => [merge(lathe([[0, 0], [0.04, 0], [0.012, 0.03], [0.012, 0.08], [0.06, 0.12], [0.065, 0.13], [0, 0.13]]), new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0.16, 0), new THREE.SphereGeometry(0.042, 10, 8).translate(0.02, 0.22, 0.01), new THREE.SphereGeometry(0.015, 6, 4).translate(0, 0.27, 0)), M.display('plaster', 0.8)],
    wandbox: () => [new THREE.BoxGeometry(0.36, 0.05, 0.06).toNonIndexed(), M.display('leather', 0.25)],
    trunk: () => [merge(new THREE.BoxGeometry(0.9, 0.42, 0.5).translate(0, 0.21, 0), new THREE.CylinderGeometry(0.25, 0.25, 0.9, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(-Math.PI / 2).scale(1, 0.4, 1).translate(0, 0.42, 0)), M.display('leather', 0.12)],
    'trunk-band': () => {
      const g: THREE.BufferGeometry[] = [];
      for (const x of [-0.36, 0.36]) g.push(new THREE.BoxGeometry(0.05, 0.44, 0.52).translate(x, 0.21, 0));
      for (const y of [0.02, 0.4]) g.push(new THREE.BoxGeometry(0.92, 0.03, 0.52).translate(0, y, 0));
      for (const [x, z] of [[-0.45, -0.25], [0.45, -0.25], [-0.45, 0.25], [0.45, 0.25]]) g.push(new THREE.BoxGeometry(0.06, 0.06, 0.06).translate(x, 0.03, z));
      g.push(new THREE.BoxGeometry(0.1, 0.1, 0.03).translate(0, 0.38, 0.26));
      return [merge(...g), M.display('brass', 0.12)];
    },
    teapot: () => [merge(lathe([[0, 0], [0.07, 0], [0.1, 0.05], [0.09, 0.11], [0.05, 0.14], [0.02, 0.16], [0.015, 0.18], [0, 0.18]]), new THREE.CylinderGeometry(0.01, 0.018, 0.12, 6).rotateZ(-0.9).translate(0.12, 0.09, 0), new THREE.TorusGeometry(0.045, 0.01, 5, 10, Math.PI).rotateZ(-Math.PI / 2).translate(-0.09, 0.08, 0)), M.display('plaster', 0.6)],
    scroll: () => [merge(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10).rotateZ(Math.PI / 2), new THREE.CylinderGeometry(0.008, 0.008, 0.34, 5).rotateZ(Math.PI / 2)), M.display('plaster', 0.5)],
    quill: () => [merge(new THREE.ConeGeometry(0.02, 0.32, 5).scale(1, 1, 0.3).translate(0, 0.2, 0), new THREE.CylinderGeometry(0.003, 0.003, 0.08, 3).translate(0, 0.02, 0)), M.display('plaster', 0.7)],
    parcel: () => [new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), M.display('paint-cream', 0.5)],
    firework: () => [merge(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 10).translate(0, 0.16, 0), new THREE.ConeGeometry(0.045, 0.1, 10).translate(0, 0.37, 0), new THREE.CylinderGeometry(0.003, 0.003, 0.08, 3).translate(0, 0.46, 0)), M.display('paint-cream', 0.9)],
    riser: () => [new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), M.display('oak', 0.18)],
    ball: () => [new THREE.SphereGeometry(0.11, 14, 10), M.display('leather', 0.3)],
    skull: () => [merge(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 0.95, 1.1).translate(0, 0.09, 0), new THREE.BoxGeometry(0.08, 0.05, 0.08).translate(0, 0.02, 0.03)), M.display('plaster', 0.3)],
  };
  const [g, m] = defs[kind]();
  kit.instances.define(key, g, m, kind !== 'eye');
  return key;
}

const C = (hex: number) => new THREE.Color(hex);
export const BINDINGS = [0x6b1d1d, 0x1f3d2b, 0x23304f, 0x5a3a1c, 0x7a5a1e, 0x3b1f3f, 0x2b2b2b, 0x8a6d3b, 0x4c1414, 0x2f4f4f].map(C);
export const POTIONS = [0x3dff8a, 0xff4fd8, 0x4fb3ff, 0xffb340, 0xb05cff, 0xff3b3b, 0x9cff3b, 0x3bfff0].map(C);
export const SWEETS = [0xff6fb5, 0xffd34f, 0x7dff9a, 0x8ab6ff, 0xff8a4f, 0xd28aff].map(C);

/** A crooked tower of books, each slightly rotated/offset from the one below. */
export function bookTower(kit: Kit, anchor: THREE.Object3D, x: number, z: number, height: number, rng: SeededRandom, lean = 0.025): void {
  const key = propKind(kit, 'book');
  let y = 0, ox = 0, oz = 0, yaw = rng.range(0, Math.PI), tilt = 0;
  while (y < height) {
    const t = rng.range(0.035, 0.08), w = rng.range(0.16, 0.26), d = rng.range(0.12, 0.2);
    ox += rng.range(-1, 1) * lean * 0.5 + tilt * t;
    oz += rng.range(-1, 1) * lean * 0.5;
    yaw += rng.range(-0.25, 0.25);
    tilt += rng.range(-0.02, 0.025);
    kit.instances.put(key, anchor, { x: x + ox, y: y + t / 2, z: z + oz }, new THREE.Euler(rng.range(-0.02, 0.02), yaw, tilt * 0.6), { x: w, y: t, z: d },
      rng.pick(BINDINGS).clone().multiplyScalar(rng.range(0.8, 1.3)));
    y += t;
  }
}

export type DisplayTheme =
  | 'books' | 'apothecary' | 'robes' | 'quidditch' | 'owls' | 'icecream' | 'cauldrons'
  | 'quills' | 'menagerie' | 'sweets' | 'curios' | 'tea' | 'jokes' | 'wands' | 'trunks';

/** Fill a bay or flat window with a themed arrangement on stepped risers. */
export function fillDisplay(kit: Kit, d: PlacedDisplay, theme: DisplayTheme, rng: SeededRandom): void {
  const a = d.anchor;
  const hw = d.bay.displaySize.halfWidth;
  const front = d.kind === 'bay' ? d.bay.displaySize.depth * 0.55 : -0.1;
  const back = -Math.min(0.9, d.bay.displaySize.interiorDepth * 0.7);
  const put = (k: PropKind, x: number, y: number, z: number, s: number | THREE.Vector3Like = 1, c?: THREE.Color, rot?: THREE.Euler) =>
    kit.instances.put(propKind(kit, k), a, { x, y, z }, rot ?? new THREE.Euler(0, rng.range(-0.5, 0.5), 0), typeof s === 'number' ? { x: s, y: s, z: s } : s, c);
  // Two stepped risers at the back
  put('riser', 0, 0.12, back + 0.25, { x: hw * 2, y: 0.24, z: 0.4 }, C(0x8a6a4a), new THREE.Euler());
  put('riser', 0, 0.26, back + 0.02, { x: hw * 2, y: 0.52, z: 0.3 }, C(0x7a5a3a), new THREE.Euler());
  const rows: [number, number][] = [[front, 0], [back + 0.25, 0.24], [back + 0.02, 0.52]];
  const span = (n: number, f: (x: number, i: number) => void) => { for (let i = 0; i < n; i++) f(-hw + (2 * hw * (i + 0.5)) / n, i); };

  switch (theme) {
    case 'books':
      for (const [z, y] of rows) span(Math.max(2, Math.round(hw * 3)), (x) => {
        if (rng.chance(0.75)) bookTowerAt(kit, a, x + rng.range(-0.05, 0.05), y, z, rng.range(0.3, 0.9), rng);
      });
      break;
    case 'apothecary': case 'sweets':
      for (const [z, y] of rows) span(Math.round(hw * 7), (x) => put(theme === 'sweets' ? 'jar' : rng.chance(0.5) ? 'jar' : 'bottle', x, y, z, rng.range(0.85, 1.3), rng.pick(theme === 'sweets' ? SWEETS : POTIONS)));
      if (theme === 'apothecary') put('skull', hw * 0.4, 0, front, 1, C(0xd8ccb0));
      break;
    case 'robes':
      span(Math.max(1, Math.round(hw * 1.6)), (x) => put('robe', x, 0, front * 0.5, { x: 1, y: rng.range(0.85, 1.05), z: 1 }, rng.pick([C(0x2a1440), C(0x0f2a1f), C(0x3a0f14), C(0x111a33), C(0x5a4210)])));
      break;
    case 'quidditch':
      span(Math.max(2, Math.round(hw * 4)), (x) => put('broom', x, 0.2, back + 0.1, 1, C(0xb08850), new THREE.Euler(0.15, 0, rng.range(-0.25, 0.25))));
      for (let i = 0; i < 3; i++) put('ball', rng.range(-hw, hw) * 0.8, 0.11, front, 1, rng.pick([C(0x7a2a1a), C(0x4a2a14), C(0xd4af37)]));
      break;
    case 'owls': case 'menagerie':
      for (const [z, y] of rows) span(Math.max(1, Math.round(hw * 2.2)), (x) => {
        put('cage', x, y, z, 1, C(0xc8a050));
        if (rng.chance(0.85)) {
          const sc = rng.range(0.8, 1.15);
          const yaw = new THREE.Euler(0, rng.range(-0.3, 0.3), 0);
          put('owl', x, y + 0.02, z, sc, rng.pick([C(0x6a4a2a), C(0xe8e4dc), C(0x4a3a2a), C(0x8a6a4a)]), yaw);
          put('eye', x, y + 0.02, z, sc, undefined, yaw);
        }
      });
      break;
    case 'icecream':
      for (const [z, y] of rows) span(Math.round(hw * 5), (x) => put('sundae', x, y, z, rng.range(0.9, 1.3), rng.pick(SWEETS)));
      break;
    case 'cauldrons':
      for (const [z, y] of rows) span(Math.max(1, Math.round(hw * 2.4)), (x) => put('cauldron', x, y, z, rng.range(0.6, 1.0), C(0x3a3a3c)));
      break;
    case 'quills':
      for (const [z, y] of rows) span(Math.round(hw * 4), (x, i) => i % 2 ? put('scroll', x, y + 0.03, z, 1, C(0xe8dcc0), new THREE.Euler(0, rng.range(-0.4, 0.4), 0)) : put('quill', x, y, z, 1, rng.pick([C(0xffffff), C(0x2a2a2a), C(0xc84a4a)]), new THREE.Euler(rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3))));
      break;
    case 'tea':
      for (const [z, y] of rows) span(Math.round(hw * 3.5), (x) => put('teapot', x, y, z, rng.range(0.9, 1.4), rng.pick([C(0xf0ece0), C(0x6aa0c8), C(0xe8a0b0), C(0x9ac890)])));
      break;
    case 'jokes':
      for (const [z, y] of rows) span(Math.round(hw * 5), (x) => rng.chance(0.6) ? put('firework', x, y, z, rng.range(0.8, 1.4), rng.pick(SWEETS), new THREE.Euler(0, 0, rng.range(-0.2, 0.2))) : put('parcel', x, y + 0.08, z, { x: 0.18, y: 0.16, z: 0.18 }, rng.pick(SWEETS)));
      break;
    case 'curios':
      for (const [z, y] of rows) span(Math.round(hw * 4), (x) => {
        const r = rng.next();
        if (r < 0.3) put('skull', x, y, z, rng.range(0.8, 1.2), C(0xd0c4a8));
        else if (r < 0.55) put('bottle', x, y, z, 1, rng.pick(POTIONS));
        else if (r < 0.8) bookTowerAt(kit, a, x, y, z, rng.range(0.15, 0.4), rng);
        else put('cauldron', x, y, z, 0.5, C(0x403a34));
      });
      break;
    case 'wands':
      for (const [z, y] of rows.slice(1)) for (let k = 0; k < 6; k++) span(Math.round(hw * 4), (x) => put('wandbox', x, y + 0.03 + k * 0.055, z, 1, rng.pick(BINDINGS), new THREE.Euler(0, rng.range(-0.08, 0.08), 0)));
      break;
    case 'trunks':
      span(Math.max(1, Math.round(hw * 1.4)), (x) => { trunkStack(kit, a, x, 0, front * 0.5, rng.int(1, 3), rng, 0.55); });
      break;
  }
}

function bookTowerAt(kit: Kit, a: THREE.Object3D, x: number, y: number, z: number, h: number, rng: SeededRandom) {
  const holder = new THREE.Object3D();
  holder.position.set(0, y, 0);
  a.add(holder);
  bookTower(kit, holder, x, z, h, rng);
}

/** Stack of brass-bound leather trunks. */
export function trunkStack(kit: Kit, anchor: THREE.Object3D, x: number, y: number, z: number, n: number, rng: SeededRandom, scale = 1): void {
  let yy = y;
  for (let i = 0; i < n; i++) {
    const s = scale * rng.range(0.75, 1.0) * (1 - i * 0.12);
    const rot = new THREE.Euler(0, rng.range(-0.35, 0.35), rng.range(-0.02, 0.02));
    const col = rng.pick([C(0x6a3a1a), C(0x3a2a1a), C(0x5a1a1a), C(0x2a3a2a), C(0x7a5a2a)]);
    kit.instances.put(propKind(kit, 'trunk'), anchor, { x: x + rng.range(-0.05, 0.05), y: yy, z: z + rng.range(-0.04, 0.04) }, rot, { x: s, y: s, z: s }, col);
    kit.instances.put(propKind(kit, 'trunk-band'), anchor, { x: x + 0, y: yy, z }, rot, { x: s, y: s, z: s }, C(0xd8b060));
    yy += 0.5 * s;
  }
}
