/**
 * The walk-in shop floor of Weasleys' Wizard Wheezes.
 *
 * Room (shop-local metres): x ∈ [−4.5, 4.5], z ∈ [−8.7, −2.15], floor 0.16,
 * ceiling 4.42, entered through a panelled vestibule from the double doors.
 * The window dioramas sit behind display partitions at the front.
 *
 * Shell: polished violet/cream checkerboard floor, star-trellis wallpaper
 * over violet wainscot, brass picture rail, crown cornice, a coffered
 * star-painted ceiling. Fixtures: floor-to-ceiling stocked shelving, a
 * panelled counter, a neon sign, a revolving "Pyramid of Pranks", islands.
 *
 * Things to do / find (all cast at with the wand):
 *  1  Pyramid of Pranks orb — spins the tiers up
 *  2  Cash register — ka-ching, drawer, a spray of coins
 *  3  Counter bell — ding
 *  4  Jack-in-the-box — crank, pop, boing
 *  5  Spinning tops — whip them faster
 *  6  Whoopee cushion — you know what it does
 *  7  Gramophone — music on / off
 *  8  Portrait of the proprietor — eyes follow you; winks and laughs
 *  9  Fizzpuff cage — fluffy creatures hop and squeak
 * 10  Trick-wand barrel — a wand turns into a rubber chicken
 * 11  Instant Darkness Powder hourglass — lights out
 * 12  Pocket Thundercloud jar — a tiny storm
 * 13  Wildfire Whiz-bangs crate — indoor sparklers under the ceiling
 * 14  Clockwork train circling the high ledge — whistle and dash
 * 15  Balloons — pop (they come back)
 * 16  Mouse hole — someone lives there
 * 17  Bead curtain to the stock room — swish
 *  ★  Seven Golden Ducks hidden around the shop
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeometryBucket, PROFILES, extrudeProfile, letteringMaterial, mergeStatic, normalizeForMerge, type Animator, type Kit } from '../../architecture/kit';
import type { SeededRandom } from '../../core/random';
import {
  LocalInstances, checkerFloor, productLabel, signTexture, starCeiling, wallpaper,
  type Interactable, type LocalLight, type Rect, type ShopInterior,
} from '../interior';

const FL = 0.16, CY = 4.42, XW = 4.5, ZB = -8.7, ZP = -2.15, ZF = -0.3, VX = 1.05;
const WALL_IN = 0.035;
const C = (hex: number) => new THREE.Color(hex);
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const lathe = (pts: number[][], seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const LOUD = [0xff4fa3, 0x2fd39a, 0x5a6ad8, 0xff7a1a, 0xffd23f, 0xc04de0, 0x1fb6c9, 0xe8344e, 0x9bea3a, 0xff9ad0];

const PRODUCTS: [string, string, string][] = [
  ['Belch-Bubble Gum', '#ff4fa3', '#2a0f45'],
  ['Hiccup Humbugs', '#2fd39a', '#1a1030'],
  ['Pocket Thunderclouds', '#5a6ad8', '#fff1c0'],
  ['Ever-Blushing Bonbons', '#ff7a1a', '#2a0f45'],
  ['Sneezing Snuff Puffs', '#ffd23f', '#6a1a6a'],
  ['Self-Tying Shoelaces', '#c04de0', '#ffffff'],
  ['Invisible Ink-Squid', '#1fb6c9', '#1a1030'],
  ['Whizzing Wig Wigglers', '#e8344e', '#ffe6b0'],
];

interface Run { a: THREE.Vector2; b: THREE.Vector2; len: number; phi: number; m: THREE.Matrix4 }
function run(ax: number, az: number, bx: number, bz: number): Run {
  const a = new THREE.Vector2(ax, az), b = new THREE.Vector2(bx, bz);
  const d = b.clone().sub(a), len = d.length();
  d.normalize();
  const phi = Math.atan2(-d.y, d.x);
  // Sit every lining a few cm proud of the brick (its inner face isn't perfectly planar).
  const m = new THREE.Matrix4().makeRotationY(phi).setPosition(ax - d.y * WALL_IN, 0, az + d.x * WALL_IN);
  return { a, b, len, phi, m };
}
/** Local (u along the run, y, v into the room) → room coordinates. */
const at = (r: Run, u: number, y: number, v: number) => V3(u, y, v).applyMatrix4(r.m);

/** Planar UVs in metres over a plane's local x/y. */
function tiledPlane(w: number, h: number, tile: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
  return g;
}

function fuzzBall(r: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const v = V3(p.getX(i), p.getY(i), p.getZ(i));
    const h = Math.sin(v.x * 91.3 + seed) * Math.sin(v.y * 73.1 + seed * 2) * Math.sin(v.z * 57.7 + seed * 3);
    v.multiplyScalar(1 + 0.16 * Math.abs(h) + 0.05 * Math.sin(i * 12.9898 + seed));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function duckGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    normalizeForMerge(new THREE.SphereGeometry(0.06, 16, 12).scale(1.25, 0.85, 1).translate(0, 0.05, 0)),
    normalizeForMerge(new THREE.SphereGeometry(0.038, 14, 10).translate(0.045, 0.115, 0)),
    normalizeForMerge(new THREE.ConeGeometry(0.018, 0.045, 10).rotateZ(-Math.PI / 2).scale(1, 0.6, 1).translate(0.095, 0.108, 0)),
    normalizeForMerge(new THREE.ConeGeometry(0.03, 0.05, 10).rotateZ(Math.PI / 2 + 0.6).translate(-0.075, 0.08, 0)),
  ])!;
}

/** A smiling, mischievous proprietor painted on canvas (eye sockets left blank for 3D eyes). */
function portraitTexture(): THREE.CanvasTexture {
  const W = 256, H = 320;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#3a1a52'); bg.addColorStop(1, '#14081f');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // shoulders: purple coat, orange lapels
  g.fillStyle = '#5b2a86'; g.beginPath(); g.ellipse(W / 2, H + 20, 125, 105, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff7a1a';
  g.beginPath(); g.moveTo(W / 2, H - 70); g.lineTo(W / 2 - 50, H); g.lineTo(W / 2 - 20, H); g.fill();
  g.beginPath(); g.moveTo(W / 2, H - 70); g.lineTo(W / 2 + 50, H); g.lineTo(W / 2 + 20, H); g.fill();
  // face
  g.fillStyle = '#f2c4a2'; g.beginPath(); g.ellipse(W / 2, 160, 62, 76, 0, 0, Math.PI * 2); g.fill();
  // freckles
  g.fillStyle = 'rgba(170,90,50,0.55)';
  for (let i = 0; i < 26; i++) { const a = i * 2.399, r = 8 + (i % 7) * 4; g.beginPath(); g.arc(W / 2 + Math.cos(a) * r * 1.4, 178 + Math.sin(a) * r * 0.5, 1.6, 0, Math.PI * 2); g.fill(); }
  // flame-orange hair tufts
  g.fillStyle = '#ff7a24';
  for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; g.beginPath(); g.ellipse(W / 2 + Math.cos(a) * 58, 120 + Math.sin(a) * 52, 22, 28, a, 0, Math.PI * 2); g.fill(); }
  // eye sockets (3D eyes sit here) + brows
  g.fillStyle = '#f7f1e6'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(W / 2 + sx * 24, 150, 15, 12, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#c4501a'; g.lineWidth = 5; g.lineCap = 'round';
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + sx * 12, 128 - (sx > 0 ? 6 : 0)); g.lineTo(W / 2 + sx * 38, 124 + (sx > 0 ? -2 : 4)); g.stroke(); }
  // nose & grin
  g.strokeStyle = '#c98a6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, 160); g.quadraticCurveTo(W / 2 + 8, 180, W / 2 - 4, 186); g.stroke();
  g.fillStyle = '#7a1a2a'; g.beginPath(); g.moveTo(W / 2 - 34, 202); g.quadraticCurveTo(W / 2, 236, W / 2 + 36, 198); g.quadraticCurveTo(W / 2, 214, W / 2 - 34, 202); g.fill();
  g.fillStyle = '#fff'; g.fillRect(W / 2 - 22, 203, 44, 6);
  // bow tie
  g.fillStyle = '#e8344e'; g.beginPath(); g.moveTo(W / 2, 252); g.lineTo(W / 2 - 30, 238); g.lineTo(W / 2 - 30, 266); g.fill();
  g.beginPath(); g.moveTo(W / 2, 252); g.lineTo(W / 2 + 30, 238); g.lineTo(W / 2 + 30, 266); g.fill();
  // craquelure
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.7;
  for (let i = 0; i < 60; i++) { const x = (i * 97) % W, y = (i * 61) % H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + ((i * 13) % 21) - 10, y + ((i * 7) % 17) - 8); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rugTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const rings = ['#4a1a6e', '#ff7a1a', '#4a1a6e', '#e8344e', '#2a0f45', '#ffd23f', '#5b2a86'];
  rings.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(S / 2, S / 2, S / 2 - i * 34, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = '#ffd23f';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = S / 2 - 52;
    g.beginPath(); g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 7, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#ff4fa3'; g.font = '900 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('W W W', S / 2, S / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWheezesInterior(kit: Kit, rng: SeededRandom, doorLeaves: THREE.Object3D[]): ShopInterior {
  const M = kit.mats;
  const group = new THREE.Group();
  group.name = 'wheezes-interior';
  group.userData.keep = true; // street batching leaves the interior alone (it hides with distance)
  const staticG = new THREE.Group();
  staticG.name = 'interior-static';
  group.add(staticG);
  const b = new GeometryBucket();
  const inst = new LocalInstances();
  const interactables: Interactable[] = [];
  const lights: LocalLight[] = [];
  const blockers: Rect[] = [];
  const circles: { x: number; z: number; r: number }[] = [];
  const tickers: ((dt: number, t: number) => void)[] = [];
  let now = 0;
  const toWorld = (p: THREE.Vector3) => p.clone().applyMatrix4(group.matrixWorld);

  // ---- Materials -----------------------------------------------------------------
  const oak = M.get('oak'), brass = M.get('brass'), iron = M.get('iron');
  const violet = M.get('paint-violet'), magenta = M.get('paint-magenta'), orange = M.get('paint-weasley');
  const charcoal = M.get('paint-charcoal'), cream = M.get('paint-cream'), teal = M.get('paint-teal'), mustard = M.get('paint-mustard');
  const floorTex = checkerFloor('wheezes-floor');
  floorTex.map.repeat.set(1, 1);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex.map, roughnessMap: floorTex.rough, roughness: 1, metalness: 0, envMapIntensity: 1.4 });
  floorMat.name = 'wwi-floor';
  const paperMat = new THREE.MeshStandardMaterial({ map: wallpaper('wheezes-paper'), roughness: 0.85, emissive: 0xff8acb, emissiveIntensity: 0.06 });
  paperMat.name = 'wwi-paper';
  paperMat.emissiveMap = paperMat.map;
  const ceilMat = new THREE.MeshStandardMaterial({ map: starCeiling('wheezes-ceiling'), roughness: 0.9, emissive: 0xffffff, emissiveIntensity: 0.22 });
  ceilMat.emissiveMap = ceilMat.map;
  ceilMat.name = 'wwi-ceiling';
  const gold = M.memo('wwi-gold', () => new THREE.MeshStandardMaterial({ color: 0xffc640, metalness: 1, roughness: 0.22, emissive: 0x6a4200, emissiveIntensity: 0.55 }));
  const glassMat = M.memo('wwi-glass', () => new THREE.MeshStandardMaterial({ color: 0xe8f4ff, roughness: 0.05, transparent: true, opacity: 0.22, envMapIntensity: 1.8, depthWrite: false, side: THREE.DoubleSide }));
  const black = M.memo('wwi-black', () => new THREE.MeshStandardMaterial({ color: 0x0b0710, roughness: 0.35 }));
  const white = M.memo('wwi-white', () => new THREE.MeshStandardMaterial({ color: 0xf7f1e6, roughness: 0.45 }));
  const skin = M.tinted('plaster', 0xf2c4a2, 'skin');
  const flat = (hex: number, rough = 0.6, key = `wwi-flat-${hex}`) => M.memo(key, () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough })) as THREE.MeshStandardMaterial;
  const glow = (hex: number, k = 2) => M.glow(hex, k);
  const labelMats = PRODUCTS.map(([n, g, ink], i) => M.memo(`wwi-label-${i}`, () => {
    const t = productLabel(n, g, ink, `label-${i}`);
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.5 });
  }));
  const signMat = (key: string, lines: string[], o: Parameters<typeof signTexture>[1] = {}) => M.memo(`wwi-sign-${key}`, () => {
    const t = signTexture(lines, o);
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.7 });
  });

  // Instanced stock kinds
  inst.define('box', new THREE.BoxGeometry(1, 1, 1), M.display('paint-cream', 0.28));
  inst.define('can', new THREE.CylinderGeometry(0.5, 0.5, 1, 14), M.display('brass', 0.22));
  inst.define('jar', lathe([[0, 0], [0.42, 0], [0.5, 0.08], [0.5, 0.78], [0.38, 0.88], [0.4, 1], [0, 1]], 14), M.display('paint-cream', 0.3));
  inst.define('glowjar', lathe([[0, 0], [0.42, 0], [0.5, 0.1], [0.46, 0.7], [0.25, 0.85], [0.25, 1], [0, 1]], 14),
    M.displayFrom('wwi-glowjar', M.memo('wwi-glowjar-base', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 })), 1.5));
  inst.define('tube', new THREE.CylinderGeometry(0.5, 0.5, 1, 10).rotateZ(Math.PI / 2), M.display('paint-cream', 0.3));
  const pennantGeo = new THREE.BufferGeometry().setFromPoints([V3(-0.5, 0, 0), V3(0.5, 0, 0), V3(0, -1, 0)]);
  pennantGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); // DoubleSide; real normals (no NaN shading)
  pennantGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0.5, 0], 2));
  inst.define('pennant', pennantGeo,
    M.displayFrom('wwi-pennant', M.memo('wwi-pennant-base', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide })), 0.35));
  inst.define('bead', new THREE.SphereGeometry(0.5, 8, 6), M.displayFrom('wwi-bead', M.memo('wwi-bead-base', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.3 })), 0.6));
  for (const g of [inst]) void g;

  // ---- Shell: floor, ceiling, walls --------------------------------------------------
  const floorGeo = new THREE.PlaneGeometry(XW * 2, ZF - ZB).rotateX(-Math.PI / 2);
  { const uv = floorGeo.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * XW * 2, uv.getY(i) * (ZF - ZB)); }
  b.add(floorMat, floorGeo, new THREE.Matrix4().makeTranslation(0, FL, (ZF + ZB) / 2));
  b.box(charcoal, XW * 2, 0.1, ZF - ZB, 0.01, { x: 0, y: FL - 0.05, z: (ZF + ZB) / 2 });
  const ceil = tiledPlane(XW * 2, ZF - ZB, 3.0).rotateX(Math.PI / 2);
  b.add(ceilMat, ceil, new THREE.Matrix4().makeTranslation(0, CY, (ZF + ZB) / 2));
  b.box(charcoal, XW * 2, 0.08, ZF - ZB, 0.01, { x: 0, y: CY + 0.05, z: (ZF + ZB) / 2 });
  // coffers
  for (let x = -XW + 1.5; x < XW - 0.5; x += 1.5) b.box(oak, 0.12, 0.16, ZP - ZB, 0.015, { x, y: CY - 0.08, z: (ZP + ZB) / 2 });
  for (let z = ZB + 1.39; z < ZP - 0.3; z += 1.39) b.box(oak, XW * 2, 0.14, 0.12, 0.015, { x: 0, y: CY - 0.07, z });
  for (let x = -XW + 1.5; x < XW - 0.5; x += 1.5) for (let z = ZB + 1.39; z < ZP - 0.3; z += 1.39) b.add(gold, new THREE.SphereGeometry(0.05, 10, 8), new THREE.Matrix4().makeTranslation(x, CY - 0.17, z));
  // front partition behind the window displays + vestibule walls (solid, they hide the diorama boxes)
  for (const sx of [-1, 1]) {
    b.box(violet, XW - VX, CY - FL, 0.08, 0.01, { x: sx * (XW + VX) / 2, y: (FL + CY) / 2, z: ZP + 0.04 });
    b.box(violet, 0.08, CY - FL, ZF - ZP, 0.01, { x: sx * (VX + 0.04), y: (FL + CY) / 2, z: (ZF + ZP) / 2 });
  }
  // vestibule lintel over the opening into the room
  b.box(violet, VX * 2, 0.7, 0.12, 0.01, { x: 0, y: CY - 0.35, z: ZP });
  b.add(orange, extrudeProfile(PROFILES.cornice(0.12), VX * 2 + 0.1), new THREE.Matrix4().makeRotationY(Math.PI).setPosition(VX + 0.05, CY - 0.78, ZP - 0.06));

  const runs = [
    run(-XW, ZP, -XW, ZB), run(-XW, ZB, XW, ZB), run(XW, ZB, XW, ZP),
    run(XW, ZP, VX, ZP), run(VX, ZP, VX, ZF), run(-VX, ZF, -VX, ZP), run(-VX, ZP, -XW, ZP),
  ];
  const DADO = 1.0;
  for (const r of runs) {
    const L = r.len;
    const rb = new GeometryBucket();
    const paperH = CY - 0.2 - (FL + DADO + 0.05);
    rb.add(paperMat, tiledPlane(L, paperH, 1.1), new THREE.Matrix4().makeTranslation(L / 2, FL + DADO + 0.05 + paperH / 2, 0.006));
    rb.box(charcoal, L, 0.17, 0.035, 0.008, { x: L / 2, y: FL + 0.085, z: 0.018 });
    rb.box(violet, L, DADO, 0.02, 0.004, { x: L / 2, y: FL + DADO / 2, z: 0.012 });
    for (let u = 0.15; u + 0.5 <= L - 0.1; u += 0.62) {
      rb.box(violet, 0.5, DADO - 0.38, 0.025, 0.012, { x: u + 0.25, y: FL + 0.2 + (DADO - 0.38) / 2 + 0.06, z: 0.028 });
      rb.box(brass, 0.04, 0.04, 0.01, 0.004, { x: u + 0.25, y: FL + 0.2 + (DADO - 0.38) / 2 + 0.06, z: 0.045 });
    }
    rb.box(oak, L, 0.06, 0.06, 0.012, { x: L / 2, y: FL + DADO + 0.03, z: 0.03 });
    rb.box(brass, L, 0.025, 0.02, 0.004, { x: L / 2, y: CY - 0.6, z: 0.012 });
    rb.add(orange, extrudeProfile(PROFILES.cornice(0.2), L), new THREE.Matrix4().makeTranslation(0, CY - 0.22, 0));
    const g = rb.build('wall-run');
    g.applyMatrix4(r.m);
    staticG.add(g);
  }

  // Round rug under the pyramid
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95 }));
  rug.position.set(0, FL + 0.006, -4.75);
  staticG.add(rug);

  // ---- Shelving ------------------------------------------------------------------------
  const P = <T,>(a: readonly T[]) => rng.pick(a);
  /** A shelving unit along run `r` from u0 to u1, depth d, shelves up to `top`. */
  const shelving = (r: Run, u0: number, u1: number, d: number, top: number, back: THREE.Material, rows: number) => {
    const sb = new GeometryBucket();
    const L = u1 - u0;
    sb.box(back, L, top - FL, 0.03, 0.005, { x: u0 + L / 2, y: (FL + top) / 2, z: 0.03 });
    sb.box(charcoal, L, 0.14, d, 0.01, { x: u0 + L / 2, y: FL + 0.07, z: d / 2 });
    sb.box(oak, L + 0.08, 0.08, d + 0.06, 0.015, { x: u0 + L / 2, y: top + 0.04, z: d / 2 + 0.02 });
    sb.add(oak, extrudeProfile(PROFILES.cornice(0.1), L + 0.1), new THREE.Matrix4().makeTranslation(u0 - 0.05, top + 0.08, d));
    const nUp = Math.max(1, Math.round(L / 1.0));
    for (let i = 0; i <= nUp; i++) sb.box(oak, 0.05, top - FL, d, 0.01, { x: u0 + (L * i) / nUp, y: (FL + top) / 2, z: d / 2 });
    const rowH = (top - FL - 0.3) / rows;
    for (let k = 0; k < rows; k++) {
      const y = FL + 0.22 + k * rowH;
      sb.box(oak, L, 0.035, d, 0.006, { x: u0 + L / 2, y, z: d / 2 });
      sb.box(brass, L, 0.02, 0.008, 0.002, { x: u0 + L / 2, y: y + 0.02, z: d + 0.004 });
      // stock the shelf
      let u = u0 + 0.06;
      while (u < u1 - 0.12) {
        const kind = rng.next();
        const col = P(LOUD);
        const vz = d * rng.range(0.42, 0.58);
        const rotY = r.phi + rng.range(-0.12, 0.12);
        if (kind < 0.45) {
          const w = rng.range(0.12, 0.26), h = Math.min(rowH - 0.06, rng.range(0.14, 0.3)), dd = rng.range(0.1, 0.2);
          const stack = h < 0.18 && rng.chance(0.5) ? 2 : 1;
          for (let s = 0; s < stack; s++) { const p = at(r, u + w / 2, y + 0.018 + h / 2 + s * h, vz); inst.put('box', p.x, p.y, p.z, { x: w, y: h * 0.98, z: dd }, s ? P(LOUD) : col, [0, rotY + s * 0.15, 0]); }
          u += w + 0.015;
        } else if (kind < 0.62) {
          const s = rng.range(0.09, 0.14);
          const p = at(r, u + s * 0.55, y + 0.018, vz);
          inst.put(rng.chance(0.35) ? 'glowjar' : 'jar', p.x, p.y, p.z, { x: s, y: Math.min(rowH - 0.06, s * 1.9), z: s }, col);
          u += s * 1.15;
        } else if (kind < 0.8) {
          const s = rng.range(0.08, 0.11), n = rng.int(2, 4);
          for (let i = 0; i < n; i++) { const p = at(r, u + s * 0.55 + i * s * 1.05, y + 0.018 + s * 0.65, vz); inst.put('can', p.x, p.y, p.z, { x: s, y: s * 1.3, z: s }, col); }
          u += n * s * 1.05 + 0.02;
        } else if (kind < 0.9) {
          const len = rng.range(0.18, 0.3), rr = rng.range(0.03, 0.05), n = rng.int(2, 3);
          for (let i = 0; i < n; i++) { const p = at(r, u + len / 2, y + 0.018 + rr + i * rr * 1.9, vz); inst.put('tube', p.x, p.y, p.z, { x: len, y: rr * 2, z: rr * 2 }, P(LOUD), [0, r.phi, 0]); }
          u += len + 0.02;
        } else {
          // a hero product box with a real label
          const i = rng.int(0, PRODUCTS.length - 1);
          const w = 0.2, h = Math.min(rowH - 0.06, 0.24);
          const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), labelMats[i]);
          box.position.copy(at(r, u + w / 2, y + 0.018 + h / 2, vz));
          box.rotation.y = r.phi + rng.range(-0.08, 0.08);
          staticG.add(box);
          u += w + 0.02;
        }
      }
    }
    const g = sb.build('shelving');
    g.applyMatrix4(r.m);
    staticG.add(g);
  };
  const [rLeft, rBack, rRight, rPartR, , , rPartL] = runs;
  shelving(rLeft, 0.25, 5.3, 0.42, 3.45, teal, 7);
  shelving(rRight, 1.65, 6.3, 0.42, 3.45, teal, 7);
  shelving(rBack, 1.6, 7.4, 0.38, 3.1, violet, 6);
  shelving(rPartR, 0.4, 3.3, 0.34, 1.45, violet, 3);
  shelving(rPartL, 0.15, 3.05, 0.34, 1.45, violet, 3);
  blockers.push({ x0: -XW, x1: -XW + 0.47, z0: -7.5, z1: ZP }, { x0: XW - 0.47, x1: XW, z0: -7.1, z1: ZP });
  blockers.push({ x0: 1.0, x1: XW, z0: ZP - 0.4, z1: ZP }, { x0: -XW, x1: -1.0, z0: ZP - 0.4, z1: ZP });

  // Posters above the low partition shelves
  const poster = (r: Run, u: number, y: number, w: number, h: number, mat: THREE.Material) => {
    const frame = new GeometryBucket();
    frame.box(gold, w + 0.08, h + 0.08, 0.03, 0.01, { x: 0, y: 0, z: 0.015 });
    const g = frame.build('poster-frame');
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    face.position.z = 0.032;
    g.add(face);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(u, y, 0.01).premultiply(r.m));
    staticG.add(g);
  };
  poster(rPartR, 2.3, 2.5, 1.6, 0.8, signMat('prank', ['PRANK', 'RESPONSIBLY*', '*or don’t'], { ground: '#ff7a1a', ink: '#2a0f45', accent: '#2a0f45', italicLast: true }));
  poster(rPartL, 1.45, 2.5, 1.6, 0.8, signMat('refunds', ['NO REFUNDS', 'ON SPONTANEOUS', 'COMBUSTION'], { ground: '#2a0f45', ink: '#ffd23f' }));
  // Vestibule: a price board and a "mind the step" joke sign
  poster(runs[4], 0.75, 2.0, 0.9, 1.1, signMat('prices', ['TODAY', 'Humbugs 3 Knuts', 'Thunderclouds 1 Galleon', 'Ducks: PRICELESS'], { w: 256, h: 320, ground: '#14201a', ink: '#e8f2e0', accent: '#8a6a48' }));
  poster(runs[5], 0.72, 2.0, 0.9, 0.6, signMat('step', ['MIND THE STEP', '(it bites)'], { ground: '#ffd23f', ink: '#2a0f45', accent: '#e8344e', italicLast: true }));

  // ---- Counter ---------------------------------------------------------------------------
  {
    const cb = new GeometryBucket();
    const z0 = -7.35, z1 = -7.95, x0 = -2.75, x1 = 2.75, h = 1.02;
    cb.box(violet, x1 - x0, h - 0.08, z0 - z1, 0.02, { x: 0, y: FL + (h - 0.08) / 2, z: (z0 + z1) / 2 });
    cb.box(oak, x1 - x0 + 0.12, 0.07, z0 - z1 + 0.14, 0.02, { x: 0, y: FL + h - 0.035, z: (z0 + z1) / 2 + 0.04 });
    cb.box(charcoal, x1 - x0 - 0.04, 0.12, 0.06, 0.01, { x: 0, y: FL + 0.06, z: z0 - 0.02 });
    for (let x = x0 + 0.35; x < x1 - 0.2; x += 0.62) {
      cb.box(orange, 0.48, 0.56, 0.03, 0.012, { x: x + 0.12, y: FL + 0.52, z: z0 + 0.015 });
      cb.box(magenta, 0.36, 0.42, 0.02, 0.01, { x: x + 0.12, y: FL + 0.52, z: z0 + 0.035 });
      cb.add(gold, new THREE.TorusGeometry(0.07, 0.012, 8, 20), new THREE.Matrix4().makeTranslation(x + 0.12, FL + 0.52, z0 + 0.05));
    }
    cb.add(brass, new THREE.CylinderGeometry(0.018, 0.018, x1 - x0, 10).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, FL + 0.22, z0 + 0.12));
    for (const x of [x0 + 0.1, 0, x1 - 0.1]) cb.box(brass, 0.03, 0.12, 0.1, 0.004, { x, y: FL + 0.22, z: z0 + 0.07 });
    // ledger, quill & ink
    cb.box(M.get('leather'), 0.42, 0.04, 0.3, 0.01, { x: 1.9, y: FL + h + 0.02, z: -7.62 }, new THREE.Euler(0, 0.2, 0));
    cb.box(cream, 0.4, 0.012, 0.28, 0.004, { x: 1.9, y: FL + h + 0.047, z: -7.62 }, new THREE.Euler(0, 0.2, 0));
    cb.add(black, lathe([[0, 0], [0.04, 0], [0.045, 0.05], [0.02, 0.07], [0, 0.07]]), new THREE.Matrix4().makeTranslation(2.2, FL + h, -7.45));
    cb.add(white, new THREE.ConeGeometry(0.02, 0.3, 6).translate(0, 0.15, 0), new THREE.Matrix4().compose(V3(2.2, FL + h + 0.05, -7.45), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, -0.35)), V3(1, 1, 0.3)));
    // banker's lamp (emerald shade)
    cb.add(brass, lathe([[0, 0], [0.09, 0], [0.09, 0.02], [0.02, 0.04], [0.015, 0.32], [0, 0.32]]), new THREE.Matrix4().makeTranslation(-2.2, FL + h, -7.7));
    cb.add(M.glow(0x4dffa0, 0.9), new THREE.CylinderGeometry(0.06, 0.16, 0.12, 20, 1, true).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(-2.2, FL + h + 0.36, -7.7));
    cb.add(glow(0xffd090, 3), new THREE.SphereGeometry(0.035, 10, 8), new THREE.Matrix4().makeTranslation(-2.2, FL + h + 0.33, -7.7));
    staticG.add(cb.build('counter'));
    lights.push({ position: V3(-2.2, FL + h + 0.3, -7.5), color: C(0xffc890), distance: 5, decay: 1.6, intensity: () => 3.5 });
    blockers.push({ x0: -2.95, x1: 2.95, z0: ZB, z1: -7.22 });
  }
  // Neon sign over the back shelves
  {
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.85), letteringMaterial({ text: 'WHEEZES', sub: 'est. by mischief', aspect: 4.2 / 0.85, ground: '#12061e', style: 'neon', seed: 'wheezes-neon' }));
    neon.position.set(0, 3.72, ZB + WALL_IN + 0.03);
    staticG.add(neon);
    lights.push({ position: V3(0, 3.6, ZB + 0.6), color: C(0xff5ad0), distance: 6, decay: 1.6, intensity: () => 3 });
  }

  // ---- Interactive pieces -----------------------------------------------------------------
  const dyn = (name: string) => { const g = new THREE.Group(); g.name = name; group.add(g); return g; };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
  };
  const counterTop = FL + 1.02;
  /** Invisible, generous click volume for small or thin things (rendered never, ray-tested always). */
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  /** Merge a piece's static meshes by material; animated parts are passed as keepers and stay separate. */
  const bake = (g: THREE.Object3D, keep: THREE.Object3D[] = []) => { for (const k of keep) k.userData.keep = true; mergeStatic(g, `${g.name}-baked`); };
  const proxy = (parent: THREE.Object3D, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => mesh(geo, proxyMat, parent, x, y, z);

  // 1. Pyramid of Pranks (revolving tiers, orb under a glass dome)
  {
    const g = dyn('pyramid');
    g.position.set(0, FL, -4.75);
    mesh(lathe([[0, 0], [1.0, 0], [1.02, 0.06], [0.98, 0.1], [0.94, 0.46], [0.98, 0.5], [0, 0.5]], 40), magenta, g);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; mesh(new THREE.SphereGeometry(0.03, 8, 6), gold, g, Math.cos(a) * 0.97, 0.3, Math.sin(a) * 0.97); }
    const tiers: THREE.Group[] = [];
    [[0.92, 0.5], [0.68, 1.12], [0.44, 1.66]].forEach(([r, y], ti) => {
      const t = new THREE.Group();
      t.position.y = y;
      g.add(t);
      tiers.push(t);
      mesh(new THREE.CylinderGeometry(r, r, 0.06, 40), oak, t, 0, 0.03, 0);
      mesh(new THREE.TorusGeometry(r, 0.018, 8, 48).rotateX(Math.PI / 2), brass, t, 0, 0.06, 0);
      mesh(new THREE.CylinderGeometry(0.06, 0.06, ti === 2 ? 0.55 : 0.62, 12), brass, t, 0, 0.32, 0);
      const n = Math.round(r * 11);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, li = (i + ti * 3) % PRODUCTS.length;
        const bx = mesh(new THREE.BoxGeometry(0.18, 0.24, 0.1), labelMats[li], t, Math.cos(a) * (r - 0.12), 0.18, Math.sin(a) * (r - 0.12));
        bx.rotation.y = -a + Math.PI / 2;
      }
    });
    // glass dome + orb on top
    mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 24), brass, g, 0, 2.24, 0);
    mesh(new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glassMat, g, 0, 2.27, 0);
    const orbMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff4fd0, emissiveIntensity: 2.2 });
    const orb = mesh(new THREE.SphereGeometry(0.09, 20, 14), orbMat, g, 0, 2.38, 0);
    circles.push({ x: 0, z: -4.75, r: 1.02 });
    for (const t of tiers) bake(t);
    bake(g, [...tiers, orb]);
    let spin = 0;
    const speeds = [0.25, -0.35, 0.5];
    tickers.push((dt, t) => {
      spin = Math.max(0, spin - dt * 0.6);
      tiers.forEach((tr, i) => { tr.rotation.y += speeds[i] * dt * (1 + 9 * spin); });
      orb.position.y = 2.38 + 0.03 * Math.sin(t * 2.2);
      orbMat.emissiveIntensity = 2.0 + 0.6 * Math.sin(t * 3.1) + 6 * spin;
    });
    interactables.push({
      object: orb, activate(fx) {
        spin = 1;
        fx.sparkle(toWorld(V3(0, FL + 2.4, -4.75)), [C(0xff4fd0), C(0xffd23f)], 60, 2.2);
        fx.sound('boing', toWorld(V3(0, 2.5, -4.75)));
        fx.toast('Spin-tastic!', 'rgba(255,80,210,0.8)');
      },
    });
    lights.push({ position: V3(0, FL + 2.5, -4.75), color: C(0xff6ad8), distance: 5, decay: 1.7, intensity: () => 2 + 10 * spin });
  }

  // 2. Cash register
  {
    const g = dyn('register');
    g.position.set(-1.1, counterTop, -7.62);
    const body = new GeometryBucket();
    body.box(brass, 0.46, 0.22, 0.36, 0.03, { x: 0, y: 0.11, z: 0 });
    body.box(brass, 0.4, 0.2, 0.18, 0.02, { x: 0, y: 0.3, z: -0.08 }, new THREE.Euler(-0.5, 0, 0));
    body.box(brass, 0.3, 0.12, 0.05, 0.02, { x: 0, y: 0.47, z: -0.12 });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) body.add(white, new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), new THREE.Matrix4().compose(V3(-0.15 + c * 0.06, 0.25 + r * 0.045, 0.02 - r * 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0, 0)), V3(1, 1, 1)));
    body.add(iron, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 8).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(0.3, 0.2, 0));
    body.add(white, new THREE.SphereGeometry(0.03, 10, 8), new THREE.Matrix4().makeTranslation(0.41, 0.2, 0));
    g.add(body.build('register-body'));
    const drawer = mesh(new THREE.BoxGeometry(0.42, 0.07, 0.3), oak, g, 0, 0.035, 0.03);
    const coins = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16), gold, drawer, 0, 0.03, 0);
    void coins;
    const flag = mesh(new THREE.PlaneGeometry(0.2, 0.08), signMat('sold', ['SOLD!'], { w: 256, h: 100, ground: '#ffd23f', ink: '#e8344e', accent: '#e8344e' }), g, 0, 0.42, -0.09);
    bake(g, [drawer, flag]);
    let t0 = -10;
    tickers.push(() => {
      const k = now - t0;
      const out = k < 0 ? 0 : k < 0.15 ? k / 0.15 : k < 2.5 ? 1 : k < 3 ? 1 - (k - 2.5) / 0.5 : 0;
      drawer.position.z = 0.03 + 0.24 * (out < 1 ? out * out * (3 - 2 * out) : 1);
      flag.position.y = 0.42 + 0.14 * Math.min(1, Math.max(0, k < 2.8 ? k / 0.12 : (3.2 - k) / 0.4));
    });
    interactables.push({
      object: g, activate(fx) {
        t0 = now;
        fx.sound('kaching', toWorld(V3(-1.1, counterTop + 0.3, -7.5)));
        fx.sparkle(toWorld(V3(-1.1, counterTop + 0.2, -7.3)), [C(0xffc640), C(0xfff0a0)], 50, 2.4);
        fx.toast('Ka-ching! (No Galleons were harmed.)', 'rgba(255,200,64,0.8)');
      },
    });
  }

  // 3. Counter bell
  {
    const g = dyn('bell');
    g.position.set(0.55, counterTop, -7.45);
    mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.025, 20), oak, g, 0, 0.012, 0);
    const dome = mesh(new THREE.SphereGeometry(0.055, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), brass, g, 0, 0.03, 0);
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), brass, dome, 0, 0.065, 0);
    mesh(new THREE.SphereGeometry(0.014, 10, 8), brass, dome, 0, 0.082, 0);
    proxy(g, new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), 0, 0.06, 0);
    bake(g, [dome]);
    let t0 = -10;
    tickers.push(() => { const k = now - t0; dome.position.y = 0.03 - (k > 0 && k < 0.12 ? 0.012 * Math.sin((k / 0.12) * Math.PI) : 0); dome.rotation.z = k > 0 && k < 1 ? 0.06 * Math.sin(k * 40) * Math.exp(-k * 5) : 0; });
    interactables.push({ object: g, activate(fx) { t0 = now; fx.sound('ding', toWorld(V3(0.55, counterTop + 0.1, -7.45))); fx.toast('Ding! Service with a smirk.', 'rgba(255,220,150,0.8)'); } });
  }

  // Islands (left: jack-in-the-box + tops; right: hourglass, thundercloud, fireworks)
  const island = (x: number, z: number, top: THREE.Material) => {
    const ib = new GeometryBucket();
    ib.box(oak, 1.1, 0.06, 0.8, 0.015, { x, y: FL + 0.9, z });
    ib.box(top, 1.0, 0.012, 0.7, 0.004, { x, y: FL + 0.935, z });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) ib.add(oak, lathe([[0, 0], [0.05, 0], [0.04, 0.1], [0.03, 0.5], [0.045, 0.7], [0.035, 0.87], [0, 0.87]], 12), new THREE.Matrix4().makeTranslation(x + sx * 0.48, FL, z + sz * 0.32));
    ib.box(oak, 1.0, 0.04, 0.7, 0.01, { x, y: FL + 0.25, z });
    staticG.add(ib.build('island'));
    blockers.push({ x0: x - 0.58, x1: x + 0.58, z0: z - 0.43, z1: z + 0.43 });
  };
  island(-2.65, -4.75, M.get('velvet'));
  island(2.65, -4.75, M.get('velvet'));
  const iTop = FL + 0.942;

  // 4. Jack-in-the-box
  {
    const g = dyn('jack');
    g.position.set(-2.95, iTop, -4.7);
    g.rotation.y = 0.35;
    const boxMat = signMat('jack', ['DON’T', 'OPEN'], { w: 256, h: 256, ground: '#e8344e', ink: '#ffd23f', accent: '#ffd23f' });
    mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), boxMat, g, 0, 0.13, 0);
    const lid = new THREE.Group(); lid.position.set(0, 0.26, -0.13); g.add(lid);
    mesh(new THREE.BoxGeometry(0.27, 0.025, 0.27), M.get('paint-teal'), lid, 0, 0.012, 0.13);
    const crank = new THREE.Group(); crank.position.set(0.14, 0.13, 0); g.add(crank);
    mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 8).rotateZ(Math.PI / 2), brass, crank, 0.04, 0, 0);
    mesh(new THREE.BoxGeometry(0.01, 0.07, 0.015), brass, crank, 0.08, 0.03, 0);
    mesh(new THREE.SphereGeometry(0.016, 8, 6), magenta, crank, 0.09, 0.065, 0);
    const springCurve = new THREE.CatmullRomCurve3(Array.from({ length: 141 }, (_, i) => { const t = i / 140; return V3(Math.cos(t * Math.PI * 14) * 0.045, t, Math.sin(t * Math.PI * 14) * 0.045); }));
    const spring = new THREE.Group(); spring.position.y = 0.2; g.add(spring);
    mesh(new THREE.TubeGeometry(springCurve, 200, 0.006, 6, false), M.get('iron'), spring);
    const head = new THREE.Group(); g.add(head);
    mesh(new THREE.SphereGeometry(0.08, 18, 14), skin, head, 0, 0.06, 0);
    mesh(new THREE.SphereGeometry(0.022, 10, 8), glow(0xff2040, 1.2), head, 0, 0.06, 0.08);
    mesh(new THREE.ConeGeometry(0.06, 0.14, 14), M.get('paint-violet'), head, 0, 0.18, 0).rotation.z = 0.25;
    mesh(new THREE.SphereGeometry(0.02, 8, 6), M.get('paint-mustard'), head, 0.03, 0.25, 0);
    for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.012, 8, 6), black, head, sx * 0.028, 0.08, 0.072);
    mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI), M.tinted('paint-oxblood', 0xffffff, 'grin'), head, 0, 0.045, 0.07).rotation.z = Math.PI;
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mesh(new THREE.ConeGeometry(0.03, 0.06, 6).rotateX(Math.PI / 2), white, head, Math.cos(a) * 0.06, -0.01, Math.sin(a) * 0.06).lookAt(V3(Math.cos(a), -0.2, Math.sin(a)).multiplyScalar(3)); }
    let t0 = -10;
    tickers.push(() => {
      const k = now - t0;
      let pop = 0, lidA = 0;
      if (k >= 0 && k < 1.0) { crank.rotation.x = -k * 18; }
      if (k >= 1.0 && k < 5.0) {
        const s = k - 1.0;
        lidA = Math.min(1, s / 0.08) * 2.1;
        pop = 1 + Math.exp(-s * 3.2) * Math.sin(s * 22) * 0.45; // springy overshoot
        if (k > 4.4) pop *= Math.max(0, 1 - (k - 4.4) / 0.5);
      }
      if (k >= 5.0 && k < 5.3) lidA = 2.1 * (1 - (k - 5.0) / 0.3);
      lid.rotation.x = -lidA;
      spring.scale.y = 0.01 + 0.32 * pop;
      head.position.y = 0.16 + 0.32 * pop;
      head.visible = pop > 0.02;
      head.rotation.z = 0.25 * Math.sin(k * 9) * Math.exp(-Math.max(0, k - 1) * 1.5);
    });
    bake(head); bake(crank); bake(lid);
    bake(g, [lid, crank, spring, head]);
    interactables.push({
      object: g, activate(fx) {
        if (now - t0 < 5.3) return;
        t0 = now;
        const p = toWorld(V3(-2.95, iTop + 0.3, -4.7));
        fx.sound('crank', p);
        setTimeout(() => { fx.sound('boing', p); fx.sparkle(p, [C(0xffd23f), C(0xe8344e)], 30, 1.8); fx.toast('Boing!', 'rgba(255,210,63,0.8)'); }, 1000);
      },
    });
  }

  // 5. Spinning tops
  {
    const tops: { g: THREE.Group; x: number; z: number; ph: number }[] = [];
    const stripes = [magenta, M.get('paint-mustard'), M.get('paint-teal'), orange];
    for (let i = 0; i < 3; i++) {
      const g = dyn(`top-${i}`);
      const tb = lathe([[0, 0], [0.01, 0.005], [0.06, 0.05], [0.075, 0.07], [0.06, 0.085], [0.015, 0.1], [0.01, 0.14], [0, 0.14]], 18);
      mesh(tb, stripes[i], g);
      mesh(new THREE.TorusGeometry(0.068, 0.006, 6, 24).rotateX(Math.PI / 2), stripes[(i + 1) % 4], g, 0, 0.068, 0);
      mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 24).rotateX(Math.PI / 2), white, g, 0, 0.085, 0);
      proxy(g, new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), 0, 0.08, 0);
      bake(g);
      tops.push({ g, x: -2.45 + (i - 1) * 0.2, z: -4.85 + (i % 2) * 0.15, ph: i * 2.1 });
    }
    let boost = 0;
    tickers.push((dt, t) => {
      boost = Math.max(0, boost - dt * 0.25);
      for (const tp of tops) {
        const r = 0.05 + 0.12 * boost;
        const a = t * (0.7 + boost * 2) + tp.ph;
        tp.g.position.set(tp.x + Math.cos(a) * r, iTop, tp.z + Math.sin(a * 1.3) * r * 0.6);
        tp.g.rotation.set(0.12 * Math.sin(t * 3 + tp.ph) * (1 + boost), tp.g.rotation.y + dt * (18 + 30 * boost), 0.12 * Math.cos(t * 3 + tp.ph) * (1 + boost), 'YXZ');
      }
    });
    for (const tp of tops) interactables.push({ object: tp.g, activate(fx) { boost = 1; fx.sound('whistle', toWorld(V3(-2.45, iTop + 0.1, -4.8))); fx.toast('Whee-ee-ee!', 'rgba(150,230,255,0.8)'); } });
  }

  // 6. Whoopee cushion on a stool
  {
    const sx = -1.45, sz = -6.45;
    const sb = new GeometryBucket();
    sb.add(oak, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24), new THREE.Matrix4().makeTranslation(sx, FL + 0.55, sz));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; sb.add(oak, new THREE.CylinderGeometry(0.018, 0.022, 0.56, 8), new THREE.Matrix4().compose(V3(sx + Math.cos(a) * 0.13, FL + 0.27, sz + Math.sin(a) * 0.13), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12)), V3(1, 1, 1))); }
    sb.add(velvetMat(), new THREE.CylinderGeometry(0.19, 0.19, 0.02, 24), new THREE.Matrix4().makeTranslation(sx, FL + 0.585, sz));
    staticG.add(sb.build('stool'));
    circles.push({ x: sx, z: sz, r: 0.25 });
    const g = dyn('whoopee');
    g.position.set(sx, FL + 0.6, sz);
    const pink = flat(0xff5aa8, 0.35);
    const cushion = mesh(new THREE.SphereGeometry(0.15, 24, 16).scale(1, 0.35, 1), pink, g, 0, 0.05, 0);
    const neck = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.09, 10).rotateZ(Math.PI / 2 - 0.2), pink, g, 0.18, 0.04, 0);
    let t0 = -10;
    tickers.push(() => {
      const k = now - t0;
      const sq = k > 0 && k < 1.2 ? Math.sin(Math.min(1, k / 1.1) * Math.PI / 2) : k >= 1.2 && k < 4 ? 1 - Math.min(1, (k - 1.2) / 2.5) : 0;
      cushion.scale.set(1 + 0.12 * sq, 1 - 0.75 * sq, 1 + 0.12 * sq);
      neck.rotation.y = k > 0 && k < 1.2 ? 0.5 * Math.sin(k * 50) : 0;
    });
    interactables.push({ object: g, activate(fx) { t0 = now; fx.sound('whoopee', toWorld(V3(sx, FL + 0.7, sz))); fx.toast('…pardon you!', 'rgba(255,90,168,0.8)'); } });
  }

  // 7. Gramophone (back-left corner) + 8. portrait above it
  const musicAt = V3(-3.75, FL + 1.35, -8.05);
  let musicOn = true;
  {
    const cab = new GeometryBucket();
    cab.box(oak, 0.7, 0.8, 0.55, 0.02, { x: -3.75, y: FL + 0.4, z: -8.2 });
    cab.box(violet, 0.6, 0.6, 0.02, 0.01, { x: -3.75, y: FL + 0.4, z: -7.92 });
    cab.add(brass, new THREE.SphereGeometry(0.02, 8, 6), new THREE.Matrix4().makeTranslation(-3.6, FL + 0.45, -7.9));
    staticG.add(cab.build('gramophone-cabinet'));
    circles.push({ x: -3.75, z: -8.15, r: 0.5 });
    const g = dyn('gramophone');
    g.position.set(-3.75, FL + 0.8, -8.2);
    mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), M.get('paint-charcoal'), g, 0, 0.06, 0);
    const disc = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 32), black, g, 0, 0.13, 0);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), M.glow(0xff7a1a, 0.6), disc, 0, 0.002, 0);
    mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.22, 8), brass, g, 0.15, 0.24, -0.1).rotation.z = 0.2;
    const horn = new THREE.Group(); horn.position.set(0.12, 0.33, -0.12); g.add(horn);
    const hornGeo = lathe([[0.02, 0], [0.03, 0.1], [0.05, 0.25], [0.1, 0.4], [0.2, 0.52], [0.32, 0.58], [0.3, 0.6], [0.18, 0.55]], 12);
    const h = mesh(hornGeo, magenta, horn);
    h.rotation.set(-0.9, 0, 0.35);
    const hornIn = mesh(hornGeo.clone().scale(0.96, 0.98, 0.96), gold, horn);
    hornIn.rotation.copy(h.rotation);
    (hornIn.material as THREE.Material).side = THREE.DoubleSide;
    bake(horn);
    bake(g, [disc, horn]);
    tickers.push((dt, t) => {
      if (musicOn) disc.rotation.y += dt * 3.5;
      const beat = musicOn ? Math.max(0, Math.sin(t * Math.PI * 2 * 1.6)) ** 6 : 0;
      horn.scale.setScalar(1 + 0.05 * beat);
    });
    interactables.push({ object: g, activate(fx) { musicOn = fx.music(); fx.toast(musicOn ? '♪ The gramophone strikes up a tune' : 'The gramophone falls quiet', 'rgba(243,220,178,0.7)'); } });
  }
  let look: ShopInterior['look'];
  {
    const g = dyn('portrait');
    g.position.set(-3.75, 2.75, ZB + WALL_IN + 0.01);
    const fb = new GeometryBucket();
    fb.box(gold, 1.0, 1.24, 0.06, 0.02, { x: 0, y: 0, z: 0.03 });
    fb.add(gold, extrudeProfile(PROFILES.cornice(0.06), 1.12), new THREE.Matrix4().makeTranslation(-0.56, 0.62, 0.05));
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; fb.add(gold, new THREE.SphereGeometry(0.025, 8, 6), new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.52, Math.sin(a) * 0.64, 0.065)); }
    g.add(fb.build('portrait-frame'));
    const canvasMat = new THREE.MeshStandardMaterial({ map: portraitTexture(), roughness: 0.75, emissive: 0xffffff, emissiveIntensity: 0.12 });
    canvasMat.emissiveMap = canvasMat.map;
    mesh(new THREE.PlaneGeometry(0.84, 1.05), canvasMat, g, 0, 0, 0.065);
    // the eyes are on the canvas at (±24 px, 150 px) of 256×320 → local metres
    const eyes: THREE.Group[] = [];
    const lids: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set((sx * 24 / 256) * 0.84, (0.5 - 150 / 320) * 1.05, 0.06);
      g.add(e);
      mesh(new THREE.SphereGeometry(0.036, 16, 12), white, e);
      mesh(new THREE.SphereGeometry(0.018, 12, 8), black, e, 0, 0, 0.026).scale.z = 0.5;
      const lid = mesh(new THREE.SphereGeometry(0.039, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin, e);
      lid.scale.y = 0.01;
      eyes.push(e); lids.push(lid);
    }
    bake(g, eyes);
    let wink = -10;
    const tmp = new THREE.Vector3(), inv = new THREE.Matrix4();
    look = (camera) => {
      inv.copy(g.matrixWorld).invert();
      tmp.copy(camera.position).applyMatrix4(inv);
      for (const e of eyes) { e.lookAt(e.position.clone().add(tmp.clone().sub(e.position).normalize())); }
      const k = now - wink;
      const blink = (Math.sin(now * 0.7) > 0.995 ? 1 : 0);
      lids[1].scale.y = Math.max(0.01, blink, k > 0 && k < 0.6 ? Math.sin((k / 0.6) * Math.PI) : 0);
      lids[0].scale.y = Math.max(0.01, blink);
    };
    interactables.push({ object: g, activate(fx) { wink = now; fx.sound('laugh', toWorld(V3(-3.75, 2.75, ZB + 0.2))); fx.toast('“Made you look!”', 'rgba(255,122,26,0.8)'); } });
  }

  // 9. Fizzpuff cage (front-right)
  {
    const cx = 3.3, cz = -3.15;
    const stand = new GeometryBucket();
    stand.add(oak, lathe([[0, 0], [0.28, 0], [0.3, 0.04], [0.1, 0.1], [0.06, 0.5], [0.09, 0.9], [0.06, 1.0], [0.2, 1.02], [0.2, 1.06], [0, 1.06]], 20), new THREE.Matrix4().makeTranslation(cx, FL, cz));
    // the cage: base, bars, dome, hook
    stand.add(brass, new THREE.CylinderGeometry(0.3, 0.32, 0.05, 32), new THREE.Matrix4().makeTranslation(cx, FL + 1.09, cz));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const curve = new THREE.QuadraticBezierCurve3(V3(cx + Math.cos(a) * 0.29, FL + 1.1, cz + Math.sin(a) * 0.29), V3(cx + Math.cos(a) * 0.31, FL + 1.65, cz + Math.sin(a) * 0.31), V3(cx + Math.cos(a) * 0.02, FL + 1.85, cz + Math.sin(a) * 0.02));
      stand.add(brass, new THREE.TubeGeometry(curve, 12, 0.006, 5, false));
    }
    for (const y of [1.3, 1.55]) stand.add(brass, new THREE.TorusGeometry(0.3, 0.008, 6, 40).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, FL + y, cz));
    stand.add(brass, new THREE.TorusGeometry(0.05, 0.01, 8, 16), new THREE.Matrix4().makeTranslation(cx, FL + 1.9, cz));
    staticG.add(stand.build('cage'));
    poster(runs[3], 0.7, 2.25, 0.5, 0.32, signMat('fizz', ['FIZZPUFFS', 'do not feed after midnight'], { w: 300, h: 190, ground: '#ff9ad0', ink: '#2a0f45', accent: '#2a0f45', italicLast: true }));
    circles.push({ x: cx, z: cz, r: 0.38 });
    const puffs: { m: THREE.Group; ph: number; x: number; z: number }[] = [];
    const cols = [0xff6ad5, 0xb48cff, 0x7af0c0, 0xffe26a];
    cols.forEach((col, i) => {
      const p = dyn(`fizzpuff-${i}`);
      mesh(fuzzBall(0.075, i * 3.7), flat(col, 1, `wwi-fuzz-${col}`), p);
      for (const sx of [-1, 1]) {
        mesh(new THREE.SphereGeometry(0.017, 10, 8), white, p, sx * 0.028, 0.02, 0.066);
        mesh(new THREE.SphereGeometry(0.009, 8, 6), black, p, sx * 0.028, 0.02, 0.08);
      }
      bake(p);
      puffs.push({ m: p, ph: i * 1.7, x: cx + Math.cos(i * 1.6) * 0.14, z: cz + Math.sin(i * 1.6) * 0.14 });
    });
    let excite = 0;
    tickers.push((dt, t) => {
      excite = Math.max(0, excite - dt * 0.35);
      for (const p of puffs) {
        const f = 1.6 + excite * 5;
        const hop = Math.abs(Math.sin(t * f + p.ph)) * (0.02 + 0.18 * excite);
        p.m.position.set(p.x + Math.sin(t * 0.7 + p.ph) * 0.04, FL + 1.19 + hop, p.z + Math.cos(t * 0.6 + p.ph) * 0.04);
        const sq = 1 - 0.18 * Math.max(0, Math.cos(t * f + p.ph)) * (0.3 + excite);
        p.m.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
        p.m.rotation.y = Math.sin(t * 0.5 + p.ph) * 0.8 + excite * t * 3;
      }
    });
    const cageHit = dyn('fizzpuff-cage');
    proxy(cageHit, new THREE.CylinderGeometry(0.32, 0.32, 0.8, 12), cx, FL + 1.45, cz);
    for (const p of [...puffs.map((q) => ({ m: q.m })), { m: cageHit }]) interactables.push({
      object: p.m, activate(fx) {
        excite = 1;
        const w = toWorld(V3(cx, FL + 1.4, cz));
        fx.sound('squeak', w);
        fx.sparkle(w, [C(0xff6ad5), C(0xffb0e8)], 40, 1.4);
        fx.toast('The Fizzpuffs are delighted to see you!', 'rgba(255,106,213,0.8)');
      },
    });
    lights.push({ position: V3(cx, FL + 1.5, cz), color: C(0xff8ad8), distance: 3.5, decay: 1.8, intensity: () => 1.5 + 6 * excite });
  }

  // 10. Trick-wand barrel (front-left)
  {
    const cx = -3.35, cz = -3.15;
    const bb = new GeometryBucket();
    bb.add(oak, lathe([[0, 0], [0.26, 0], [0.3, 0.15], [0.32, 0.35], [0.3, 0.55], [0.27, 0.68], [0.25, 0.68], [0.25, 0.6], [0, 0.6]], 24), new THREE.Matrix4().makeTranslation(cx, FL, cz));
    for (const y of [0.08, 0.3, 0.6]) bb.add(iron, new THREE.TorusGeometry(y === 0.3 ? 0.325 : 0.29, 0.012, 6, 32).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, FL + y, cz));
    staticG.add(bb.build('barrel'));
    circles.push({ x: cx, z: cz, r: 0.38 });
    poster(runs[6], 2.95, 2.25, 0.45, 0.3, signMat('trickwands', ['TRICK WANDS', '2 Sickles · try one!'], { w: 300, h: 200, ground: '#2fd39a', ink: '#1a1030', accent: '#1a1030', italicLast: true }));
    const wands: THREE.Group[] = [];
    for (let i = 0; i < 14; i++) {
      const w = dyn(`trick-wand-${i}`);
      const a = (i / 14) * Math.PI * 2 + rng.range(-0.2, 0.2), r = rng.range(0.04, 0.2);
      w.position.set(cx + Math.cos(a) * r, FL + 0.35, cz + Math.sin(a) * r);
      w.rotation.set(Math.sin(a) * 0.25 * (r / 0.2), 0, -Math.cos(a) * 0.25 * (r / 0.2));
      mesh(new THREE.CylinderGeometry(0.007, 0.012, 0.6, 8).translate(0, 0.3, 0), M.tinted('oak', LOUD[i % LOUD.length] | 0x404040, `wand-${i % LOUD.length}`), w);
      mesh(new THREE.SphereGeometry(0.012, 8, 6), gold, w, 0, 0.6, 0);
      wands.push(w);
    }
    // the rubber chicken, borrowed by whichever wand you pick
    const chicken = dyn('rubber-chicken');
    const yellow = flat(0xffd23f, 0.35);
    mesh(new THREE.CapsuleGeometry(0.05, 0.16, 6, 12).rotateZ(Math.PI / 2), yellow, chicken, 0, 0.05, 0);
    mesh(new THREE.SphereGeometry(0.045, 14, 10), yellow, chicken, 0.13, 0.11, 0);
    mesh(new THREE.ConeGeometry(0.018, 0.05, 8).rotateZ(-Math.PI / 2), flat(0xff7a1a, 0.4), chicken, 0.18, 0.1, 0);
    for (let i = 0; i < 3; i++) mesh(new THREE.SphereGeometry(0.016, 8, 6), flat(0xe8344e, 0.4), chicken, 0.12 + i * 0.015, 0.16 + (i === 1 ? 0.01 : 0), 0);
    for (const sz of [-1, 1]) mesh(new THREE.SphereGeometry(0.008, 6, 4), black, chicken, 0.155, 0.12, sz * 0.025);
    bake(chicken);
    chicken.visible = false;
    let t0 = -10, which: THREE.Group | null = null;
    tickers.push(() => {
      const k = now - t0;
      const on = which && k >= 0 && k < 3.2;
      chicken.visible = !!on;
      if (which) which.visible = !on;
      if (on && which) {
        chicken.position.copy(which.position).add(V3(0, 0.45, 0));
        const s = Math.min(1, k / 0.12) * (k > 2.9 ? Math.max(0, (3.2 - k) / 0.3) : 1);
        chicken.scale.setScalar(Math.max(0.01, s * (1 + 0.15 * Math.sin(k * 30) * Math.exp(-k * 3))));
        chicken.rotation.y = Math.sin(k * 4) * 0.6;
      }
    });
    const barrelHit = dyn('trick-wand-barrel');
    proxy(barrelHit, new THREE.CylinderGeometry(0.34, 0.34, 1.0, 12), cx, FL + 0.55, cz);
    for (const w of [...wands, barrelHit]) interactables.push({
      object: w, activate(fx, hit) {
        if (now - t0 < 3.2) return;
        const local = hit.clone().applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert());
        const pickW = w === barrelHit ? wands.reduce((a, c) => (c.position.distanceTo(local) < a.position.distanceTo(local) ? c : a)) : w;
        t0 = now; which = pickW;
        const w2 = pickW;
        const p = toWorld(w2.position.clone().add(V3(0, 0.5, 0)));
        fx.sound('honk', p);
        fx.sparkle(p, [C(0xffd23f), C(0xffffff)], 25, 1.2);
        fx.toast('It’s a rubber chicken. Of course it is.', 'rgba(255,210,63,0.8)');
      },
    });
  }

  // 11. Instant Darkness Powder (hourglass, right island)
  {
    const g = dyn('hourglass');
    g.position.set(2.25, iTop, -4.65);
    const frame = new THREE.Group(); frame.position.y = 0.17; g.add(frame);
    for (const y of [-0.15, 0.15]) mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 6), oak, frame, 0, y, 0);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 6), brass, frame, Math.cos(a) * 0.065, 0, Math.sin(a) * 0.065); }
    const bulb = lathe([[0.005, 0], [0.05, 0.03], [0.055, 0.08], [0.03, 0.12], [0.006, 0.14]], 20);
    mesh(bulb, glassMat, frame, 0, -0.14, 0);
    mesh(bulb.clone().rotateX(Math.PI), glassMat, frame, 0, 0.14, 0);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0x1a0830, emissive: 0x6a2acf, emissiveIntensity: 0.8 });
    const sandTop = mesh(new THREE.ConeGeometry(0.04, 0.06, 16).rotateX(Math.PI), sandMat, frame, 0, 0.06, 0);
    const sandBot = mesh(new THREE.ConeGeometry(0.045, 0.05, 16), sandMat, frame, 0, -0.11, 0);
    mesh(new THREE.PlaneGeometry(0.22, 0.09), signMat('dark', ['INSTANT', 'DARKNESS POWDER'], { w: 300, h: 120, ground: '#12061e', ink: '#c6a0ff', accent: '#6a2acf' }), g, 0, 0.02, 0.1).rotation.x = -0.6;
    let t0 = -10;
    tickers.push((_dt, t) => {
      const k = now - t0;
      frame.rotation.z = k >= 0 && k < 0.6 ? Math.PI * (k / 0.6) : k >= 0.6 && k < 8 ? Math.PI : 0;
      const fill = Math.min(1, Math.max(0, (k - 0.6) / 4));
      sandTop.scale.setScalar(Math.max(0.05, k >= 0 && k < 8 ? 1 - fill : 1));
      sandBot.scale.setScalar(Math.max(0.05, k >= 0 && k < 8 ? fill : 1));
      sandMat.emissiveIntensity = 0.7 + 0.3 * Math.sin(t * 2);
    });
    interactables.push({
      object: g, activate(fx) {
        if (now - t0 < 8) return;
        t0 = now;
        fx.sound('swish', toWorld(V3(2.25, iTop + 0.2, -4.65)));
        setTimeout(() => fx.darkness(3.5), 500);
        fx.toast('Instant Darkness Powder!', 'rgba(150,100,255,0.8)');
      },
    });
  }

  // 12. Pocket Thundercloud
  let cloudFlash = 0;
  {
    const g = dyn('thundercloud');
    g.position.set(2.65, iTop, -4.9);
    mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.26, 24, 1, true), glassMat, g, 0, 0.13, 0);
    mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.01, 24), glassMat, g, 0, 0.005, 0);
    const lid = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 24), brass, g, 0, 0.275, 0);
    mesh(new THREE.PlaneGeometry(0.2, 0.08), labelMats[2], g, 0, 0.14, 0.112);
    const cloud = new THREE.Group(); g.add(cloud);
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0x6a7088, roughness: 1, emissive: 0xbfd0ff, emissiveIntensity: 0 });
    for (let i = 0; i < 7; i++) mesh(new THREE.SphereGeometry(rng.range(0.035, 0.06), 12, 10), cloudMat, cloud, rng.range(-0.06, 0.06), rng.range(-0.015, 0.025), rng.range(-0.05, 0.05));
    const bolt = mesh(new THREE.ConeGeometry(0.012, 0.16, 4), M.glow(0xeaf0ff, 4), cloud, 0.01, -0.1, 0);
    bake(cloud, [bolt]);
    bake(g, [lid, cloud]);
    let t0 = -10;
    tickers.push((_dt, t) => {
      const k = now - t0;
      const out = k >= 0 && k < 6 ? Math.min(1, k / 0.8) * (k > 5 ? (6 - k) : 1) : 0;
      lid.position.y = 0.275 + 0.12 * Math.min(1, out * 3);
      lid.rotation.z = 0.6 * Math.min(1, out * 3);
      cloud.position.set(Math.sin(t * 1.3) * 0.03 * out, 0.13 + 0.75 * out + 0.03 * Math.sin(t * 2), 0);
      cloud.scale.setScalar(0.8 + 1.6 * out);
      const strike = out > 0.9 && (Math.sin(k * 7.3) > 0.93 || Math.sin(k * 4.1 + 1) > 0.97) ? 1 : 0;
      cloudFlash = strike;
      cloudMat.emissiveIntensity = strike * 2.5;
      bolt.visible = strike > 0;
    });
    interactables.push({
      object: g, activate(fx) {
        if (now - t0 < 6) return;
        t0 = now;
        const w = toWorld(V3(2.65, iTop + 0.9, -4.9));
        fx.sound('thunderlet', w);
        setTimeout(() => fx.sound('thunderlet', w), 1600);
        for (let i = 0; i < 4; i++) setTimeout(() => fx.sparkle(w.clone().add(V3(0, -0.25, 0)), [C(0x8ac8ff), C(0xd0e8ff)], 25, 0.6), 900 + i * 700);
        fx.toast('A Pocket Thundercloud! Mind your hat.', 'rgba(140,200,255,0.8)');
      },
    });
    lights.push({ position: V3(2.65, iTop + 0.9, -4.9), color: C(0xc8d8ff), distance: 6, decay: 1.5, intensity: () => cloudFlash * 18 });
  }

  // 13. Wildfire Whiz-bangs crate (indoor edition)
  {
    const g = dyn('whizbangs');
    g.position.set(3.05, iTop, -4.55);
    g.rotation.y = -0.3;
    const cb = new GeometryBucket();
    cb.box(oak, 0.34, 0.16, 0.24, 0.01, { x: 0, y: 0.08, z: 0 });
    for (const y of [0.04, 0.12]) cb.box(M.get('paint-charcoal'), 0.35, 0.012, 0.245, 0.003, { x: 0, y, z: 0 });
    g.add(cb.build('crate'));
    mesh(new THREE.PlaneGeometry(0.3, 0.12), signMat('whiz', ['WILDFIRE WHIZ-BANGS', 'indoor edition (allegedly)'], { w: 400, h: 160, ground: '#e8344e', ink: '#ffd23f', accent: '#ffd23f', italicLast: true }), g, 0, 0.08, 0.122);
    for (let i = 0; i < 7; i++) {
      const x = -0.12 + (i % 4) * 0.08, z = -0.06 + Math.floor(i / 4) * 0.1;
      const col = [0xe8344e, 0xffd23f, 0x5a6ad8, 0x2fd39a][i % 4];
      mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.22, 10), flat(col, 0.4), g, x, 0.2, z);
      mesh(new THREE.ConeGeometry(0.022, 0.05, 10), gold, g, x, 0.335, z);
    }
    bake(g);
    interactables.push({
      object: g, activate(fx) {
        const pals = [[C(0xff4fd0), C(0xffd23f)], [C(0x2fd39a), C(0xffffff)], [C(0x5a6ad8), C(0xc6a0ff)], [C(0xff7a1a), C(0xffe080)]];
        for (let i = 0; i < 6; i++) setTimeout(() => {
          const p = toWorld(V3(rng.range(-2.5, 2.5), CY - rng.range(0.6, 1.1), rng.range(-6.8, -3.0)));
          fx.sparkle(p, pals[i % pals.length], 90, 2.6);
          fx.sound('pop', p);
        }, 250 + i * 330);
        fx.toast('Whiz! Bang! (Please don’t tell the landlord.)', 'rgba(255,120,200,0.8)');
      },
    });
  }

  // 14. Clockwork train on the high ledge
  {
    const ledgeY = 3.62;
    const inset = 0.28;
    const pathPts = [V3(-XW + inset, 0, ZP - 0.45), V3(-XW + inset, 0, ZB + inset), V3(XW - inset, 0, ZB + inset), V3(XW - inset, 0, ZP - 0.45)];
    const track = new THREE.CurvePath<THREE.Vector3>();
    const rr = 0.35;
    for (let i = 0; i < 4; i++) {
      const a = pathPts[i], c = pathPts[(i + 1) % 4], n = pathPts[(i + 2) % 4];
      const d1 = c.clone().sub(a).normalize(), d2 = n.clone().sub(c).normalize();
      const s = a.clone().addScaledVector(d1, i === 0 ? 0 : rr), e = c.clone().addScaledVector(d1, -rr);
      track.add(new THREE.LineCurve3(s.clone().setY(ledgeY), e.clone().setY(ledgeY)));
      track.add(new THREE.QuadraticBezierCurve3(e.clone().setY(ledgeY), c.clone().setY(ledgeY), c.clone().addScaledVector(d2, rr).setY(ledgeY)));
      if (i === 3) track.add(new THREE.LineCurve3(c.clone().addScaledVector(d2, rr).setY(ledgeY), pathPts[0].clone().addScaledVector(pathPts[1].clone().sub(pathPts[0]).normalize(), 0).setY(ledgeY)));
    }
    // ledge boards + rails
    const lb = new GeometryBucket();
    const ledgeRuns = [runs[0], runs[1], runs[2], runs[3], runs[6]];
    for (const r of ledgeRuns) {
      const rb2 = new GeometryBucket();
      rb2.box(oak, r.len, 0.04, 0.42, 0.008, { x: r.len / 2, y: ledgeY - 0.04, z: 0.21 });
      for (let u = 0.3; u < r.len; u += 0.9) rb2.add(oak, new THREE.BoxGeometry(0.04, 0.22, 0.3).translate(0, -0.15, 0.15), new THREE.Matrix4().makeTranslation(u, ledgeY - 0.04, 0));
      const gg = rb2.build('ledge');
      gg.applyMatrix4(r.m);
      staticG.add(gg);
    }
    const railCurve = track;
    lb.add(brass, new THREE.TubeGeometry(railCurve as unknown as THREE.Curve<THREE.Vector3>, 400, 0.006, 4, false), new THREE.Matrix4().makeTranslation(0, 0.012, 0));
    staticG.add(lb.build('rails'));
    // engine + cars
    const cars: THREE.Group[] = [];
    const engine = dyn('train-engine');
    mesh(new THREE.BoxGeometry(0.16, 0.06, 0.09), M.get('paint-charcoal'), engine, 0, 0.04, 0);
    mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.13, 14).rotateZ(Math.PI / 2), orange, engine, 0.02, 0.1, 0);
    mesh(new THREE.BoxGeometry(0.06, 0.09, 0.09), magenta, engine, -0.05, 0.11, 0);
    mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.06, 10), black, engine, 0.06, 0.16, 0);
    mesh(new THREE.SphereGeometry(0.014, 8, 6), M.glow(0xffe080, 3), engine, 0.09, 0.1, 0);
    for (const sx of [-0.05, 0.05]) for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.012, 14).rotateX(Math.PI / 2), M.get('paint-oxblood'), engine, sx, 0.025, sz * 0.05);
    proxy(engine, new THREE.BoxGeometry(0.26, 0.24, 0.2), 0, 0.09, 0);
    cars.push(engine);
    for (let i = 0; i < 3; i++) {
      const c = dyn(`train-car-${i}`);
      mesh(new THREE.BoxGeometry(0.14, 0.06, 0.09), [teal, mustard, violet][i], c, 0, 0.045, 0);
      if (i === 0) for (let j = 0; j < 3; j++) mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), flat(LOUD[j], 0.5), c, -0.03 + j * 0.03, 0.095, (j - 1) * 0.02);
      if (i === 1) mesh(fuzzBall(0.035, 9), flat(0xff6ad5, 1, 'wwi-fuzz-0xff6ad5'), c, 0, 0.1, 0);
      if (i === 2) mesh(new THREE.SphereGeometry(0.03, 12, 10), M.glow(0x7af0c0, 1.6), c, 0, 0.1, 0);
      for (const sx of [-0.045, 0.045]) for (const sz of [-1, 1]) mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 12).rotateX(Math.PI / 2), black, c, sx, 0.02, sz * 0.05);
      proxy(c, new THREE.BoxGeometry(0.22, 0.2, 0.2), 0, 0.08, 0);
      cars.push(c);
    }
    for (const c of cars) bake(c);
    const puffs = Array.from({ length: 8 }, () => { const m = mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, roughness: 1 }), group); return { m, t: -1 }; });
    let u = 0, boost = 0, nextPuff = 0, pi = 0;
    const L = track.getLength();
    const tmpT = new THREE.Vector3();
    tickers.push((dt, t) => {
      boost = Math.max(0, boost - dt * 0.3);
      u = (u + (dt * (0.45 + 1.6 * boost)) / L) % 1;
      cars.forEach((c, i) => {
        const uu = (u - (i * 0.19) / L + 1) % 1;
        track.getPointAt(uu, c.position);
        track.getTangentAt(uu, tmpT);
        c.rotation.y = Math.atan2(-tmpT.z, tmpT.x);
      });
      if (t > nextPuff) {
        nextPuff = t + 0.35 / (1 + boost * 2);
        const p = puffs[pi++ % puffs.length];
        p.t = t;
        p.m.position.copy(cars[0].position).add(V3(Math.cos(cars[0].rotation.y) * 0.06, 0.2, -Math.sin(cars[0].rotation.y) * 0.06));
      }
      for (const p of puffs) {
        const a = t - p.t;
        const mat = p.m.material as THREE.MeshStandardMaterial;
        if (p.t < 0 || a > 1.4) { mat.opacity = 0; continue; }
        p.m.position.y += dt * 0.12;
        p.m.scale.setScalar(0.6 + a * 1.6);
        mat.opacity = 0.5 * (1 - a / 1.4);
      }
    });
    for (const c of cars) interactables.push({ object: c, activate(fx) { boost = 1; fx.sound('whistle', toWorld(c.position)); fx.toast('Toot toot! All aboard the Mischief Express.', 'rgba(255,224,128,0.8)'); } });
  }

  // 15. Balloons near the ceiling
  {
    const cols = [0xff4fa3, 0xffd23f, 0x2fd39a, 0x5a6ad8, 0xff7a1a, 0xc04de0, 0xe8344e];
    const spots = [V3(-1.8, 3.6, -3.0), V3(-1.2, 3.75, -3.4), V3(1.6, 3.55, -3.2), V3(2.4, 3.7, -6.2), V3(-2.6, 3.65, -6.4), V3(0.9, 3.8, -6.6), V3(-0.4, 3.5, -2.6)];
    spots.forEach((p, i) => {
      const g = dyn(`balloon-${i}`);
      const mat = new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.25, metalness: 0.05, emissive: cols[i], emissiveIntensity: 0.12 });
      mesh(new THREE.SphereGeometry(0.16, 20, 16).scale(1, 1.18, 1), mat, g, 0, 0, 0);
      mesh(new THREE.ConeGeometry(0.025, 0.04, 8).rotateX(Math.PI), mat, g, 0, -0.2, 0);
      mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.6, 4), white, g, 0, -0.52, 0);
      bake(g);
      let popped = -100;
      const ph = i * 1.37;
      tickers.push((_dt, t) => {
        const k = now - popped;
        const s = k < 0.06 ? 1 + k * 4 : k < 12 ? 0.001 : Math.min(1, (k - 12) / 0.6);
        g.scale.setScalar(Math.max(0.001, s));
        g.position.set(p.x + 0.08 * Math.sin(t * 0.4 + ph), p.y + 0.06 * Math.sin(t * 0.9 + ph), p.z + 0.08 * Math.cos(t * 0.35 + ph));
        g.rotation.z = 0.1 * Math.sin(t * 0.6 + ph);
      });
      interactables.push({
        object: g, activate(fx) {
          if (now - popped < 12.6) return;
          popped = now;
          const w = toWorld(g.position);
          fx.sound('pop', w);
          fx.sparkle(w, [new THREE.Color(cols[i]), C(0xffffff)], 45, 2);
        },
      });
    });
  }

  // Bunting across the room
  for (const [a, c] of [[V3(-XW + 0.3, 3.95, ZP - 0.2), V3(XW - 0.3, 3.95, ZB + 1.2)], [V3(XW - 0.3, 3.95, ZP - 0.2), V3(-XW + 0.3, 3.95, ZB + 1.2)]] as const) {
    const n = 30;
    const sag = (k: number) => -0.45 * Math.sin(Math.PI * k);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) { const k = i / n; pts.push(a.clone().lerp(c, k).add(V3(0, sag(k), 0))); }
    staticG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.004, 4), white));
    const dir = c.clone().sub(a).setY(0).normalize();
    const yaw = Math.atan2(-dir.z, dir.x);
    for (let i = 1; i < n; i++) { const p = pts[i]; inst.put('pennant', p.x, p.y, p.z, { x: 0.2, y: 0.24, z: 1 }, LOUD[i % LOUD.length], [0, yaw, 0]); }
  }

  // Chandelier of floating candles over the pyramid
  const candleFlames: THREE.Mesh[] = [];
  {
    const g = dyn('chandelier');
    g.position.set(0, 3.55, -4.75);
    mesh(new THREE.TorusGeometry(0.7, 0.02, 8, 48).rotateX(Math.PI / 2), brass, g);
    mesh(new THREE.TorusGeometry(0.4, 0.016, 8, 40).rotateX(Math.PI / 2), brass, g, 0, 0.25, 0);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; const curve = new THREE.LineCurve3(V3(Math.cos(a) * 0.7, 0, Math.sin(a) * 0.7), V3(0, 0.85, 0)); mesh(new THREE.TubeGeometry(curve, 2, 0.006, 4, false), iron, g); }
    const flameMat = M.glow(0xffb050, 2.4);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.7 : 0.4, y = i % 2 ? 0 : 0.25;
      mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.16, 10), cream, g, Math.cos(a) * r, y + 0.09, Math.sin(a) * r);
      candleFlames.push(mesh(new THREE.SphereGeometry(0.016, 8, 6).scale(1, 2, 1), flameMat, g, Math.cos(a) * r, y + 0.2, Math.sin(a) * r));
      if (i % 3 === 0) mesh(new THREE.OctahedronGeometry(0.03), glassMat, g, Math.cos(a) * r, y - 0.1, Math.sin(a) * r);
    }
    bake(g, candleFlames);
    tickers.push((_dt, t) => { g.rotation.y = t * 0.08; candleFlames.forEach((f, i) => { f.scale.y = 1 + 0.25 * Math.sin(t * 9 + i * 1.7); }); });
    lights.push({ position: V3(0, 3.5, -4.75), color: C(0xffb888), distance: 10, decay: 1.4, intensity: () => 11 });
  }

  // 16. Mouse hole (right wall, near the back)
  {
    const r = runs[2]; // right wall: u from back (0) to front
    const u = 0.9;
    const holeShape = new THREE.Shape();
    holeShape.moveTo(-0.07, 0); holeShape.lineTo(-0.07, 0.07); holeShape.absarc(0, 0.07, 0.07, Math.PI, 0, true); holeShape.lineTo(0.07, 0); holeShape.lineTo(-0.07, 0);
    const g = dyn('mousehole');
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(u, FL, 0.04).premultiply(r.m));
    mesh(new THREE.ShapeGeometry(holeShape, 16), M.memo('wwi-hole', () => new THREE.MeshBasicMaterial({ color: 0x050205 })), g, 0, 0.001, 0);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff080 });
    const eyes = [-1, 1].map((sx) => mesh(new THREE.SphereGeometry(0.008, 8, 6), eyeMat, g, sx * 0.018, 0.07, 0.004));
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 3, 1, false, 0, Math.PI * 0.4), flat(0xffd860, 0.6), g, 0.06, 0.012, 0.09);
    bake(g, eyes);
    let t0 = -10;
    tickers.push((_dt, t) => {
      const k = now - t0;
      const blink = Math.sin(t * 1.3) > 0.96 || Math.sin(t * 0.37) < -0.6 ? 0.1 : 1;
      const wide = k > 0 && k < 1.5 ? 1.8 : 1;
      for (const e of eyes) e.scale.set(wide, blink * wide, 1);
    });
    interactables.push({ object: g, activate(fx) { t0 = now; fx.sound('squeak', toWorld(at(r, u, FL + 0.1, 0.1))); fx.toast('Something in the wall squeaks a polite hello.', 'rgba(255,240,128,0.8)'); } });
  }

  // 17. Bead curtain to the stock room (back wall, right)
  {
    const r = runs[1];
    const u = 8.05, w = 0.85, h = 2.1;
    const db = new GeometryBucket();
    db.box(oak, 0.08, h + 0.1, 0.12, 0.01, { x: u - w / 2 - 0.04, y: FL + (h + 0.1) / 2, z: 0.06 });
    db.box(oak, 0.08, h + 0.1, 0.12, 0.01, { x: u + w / 2 + 0.04, y: FL + (h + 0.1) / 2, z: 0.06 });
    db.box(oak, w + 0.24, 0.12, 0.14, 0.01, { x: u, y: FL + h + 0.12, z: 0.07 });
    db.add(M.memo('wwi-void', () => new THREE.MeshBasicMaterial({ color: 0x07030a })), new THREE.PlaneGeometry(w, h), new THREE.Matrix4().makeTranslation(u, FL + h / 2, 0.004));
    const dg = db.build('stockroom-door');
    dg.applyMatrix4(r.m);
    staticG.add(dg);
    poster(r, u, FL + h + 0.45, 0.8, 0.32, signMat('staff', ['STAFF ONLY', 'beware of the Fizzpuff nursery'], { w: 400, h: 160, ground: '#e8344e', ink: '#ffe6b0', italicLast: true }));
    const g = dyn('beads');
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(u, FL + h, 0.08).premultiply(r.m));
    const strands: THREE.Group[] = [];
    const beadMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.014, 6, 4), M.displayFrom('wwi-bead', M.memo('wwi-bead-base', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.3 })), 0.6), 14 * 22);
    let bi = 0;
    for (let s = 0; s < 14; s++) {
      const st = new THREE.Group();
      st.position.x = -w / 2 + 0.03 + (s / 13) * (w - 0.06);
      g.add(st);
      strands.push(st);
    }
    // beads are instanced in strand-local coords; we rebuild matrices as strands swing
    const beadCols = LOUD;
    for (let s = 0; s < 14; s++) for (let k = 0; k < 22; k++) beadMesh.setColorAt(bi++, new THREE.Color(beadCols[(s + k) % beadCols.length]));
    g.add(beadMesh);
    let t0 = -10;
    const m4 = new THREE.Matrix4();
    tickers.push((_dt, t) => {
      const k = now - t0;
      const amp = 0.04 + (k > 0 && k < 4 ? 0.5 * Math.exp(-k * 1.2) : 0);
      let i = 0;
      strands.forEach((st, s) => {
        const a = amp * Math.sin(t * 2.6 + s * 0.5);
        for (let b2 = 0; b2 < 22; b2++) {
          const y = -0.03 - b2 * 0.093;
          m4.makeTranslation(st.position.x + Math.sin(a) * -y, Math.cos(a) * y, Math.sin(a * 0.7) * -y * 0.6);
          beadMesh.setMatrixAt(i++, m4);
        }
      });
      beadMesh.instanceMatrix.needsUpdate = true;
    });
    proxy(g, new THREE.PlaneGeometry(w, h), 0, -h / 2, 0.02);
    beadMesh.computeBoundingSphere();
    beadMesh.boundingSphere = new THREE.Sphere(V3(0, -1, 0), 1.6);
    interactables.push({ object: g, activate(fx) { t0 = now; fx.sound('swish', toWorld(at(r, u, FL + 1.2, 0.2))); fx.toast('STAFF ONLY. (The Fizzpuff nursery is very hush-hush.)', 'rgba(232,52,78,0.8)'); } });
  }

  // ★ Seven Golden Ducks
  {
    const duckGeo = duckGeometry();
    const spots: [THREE.Vector3, number][] = [
      [V3(-XW + 0.2, 3.62, -6.9), 0.5],            // on the train ledge, back-left
      [V3(1.9, FL + 0.02, -7.2), 2.6],              // peeking from under the counter
      [V3(-0.92, FL + 0.02, -0.5), 0.9],            // vestibule corner, behind the door
      [V3(-3.62, FL + 1.33, -8.27), -0.4],          // on the gramophone horn rim
      [V3(0.4, 3.57, -4.75), 1.5],                  // riding the chandelier
      [V3(XW - 0.22, FL + 0.22 + 0.432 * 3 + 0.02, -5.3), Math.PI], // among the right-wall stock
      [V3(3.05, FL + 0.02, ZB + 0.18), -1.2],       // at the stock-room curtain
    ];
    spots.forEach(([p, yaw], i) => {
      const g = dyn(`golden-duck-${i}`);
      const d = mesh(duckGeo, gold, g);
      d.scale.setScalar(1.15);
      proxy(g, new THREE.SphereGeometry(0.13, 8, 6), 0.01, 0.08, 0);
      g.position.copy(p);
      g.rotation.y = yaw;
      if (i === 4) { // rides the chandelier
        tickers.push((_dt, t) => { const a = t * 0.08 + 0.3; g.position.set(Math.cos(a) * 0.4, 3.57 + 0.25 + 0.02, -4.75 - Math.sin(a) * 0.4); g.rotation.y = a + Math.PI; });
      }
      let found = false;
      tickers.push((_dt, t) => { if (!found) d.rotation.y = 0.15 * Math.sin(t * 1.5 + i); });
      interactables.push({
        object: g, activate(fx) {
          if (found) return;
          found = true;
          const w = toWorld(g.getWorldPosition(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert()));
          g.visible = false;
          fx.sparkle(w, [C(0xffc640), C(0xfff0a0), C(0xffffff)], 70, 1.8);
          fx.collect(`duck-${i}`, w);
        },
      });
    });
  }

  // Static easter eggs: a rubber chicken hung from the ceiling, a lost sock, a dropped pointy hat
  {
    const eb = new GeometryBucket();
    const yellow = flat(0xffd23f, 0.35);
    eb.add(white, new THREE.CylinderGeometry(0.003, 0.003, 0.5, 4), new THREE.Matrix4().makeTranslation(0.6, CY - 0.25, -2.8));
    eb.add(yellow, new THREE.CapsuleGeometry(0.05, 0.18, 6, 12), new THREE.Matrix4().makeTranslation(0.6, CY - 0.62, -2.8));
    eb.add(yellow, new THREE.SphereGeometry(0.045, 12, 10), new THREE.Matrix4().makeTranslation(0.6, CY - 0.82, -2.8));
    eb.add(flat(0xe8344e, 0.4), new THREE.SphereGeometry(0.018, 8, 6), new THREE.Matrix4().makeTranslation(0.6, CY - 0.88, -2.78));
    eb.add(M.get('velvet'), new THREE.CapsuleGeometry(0.035, 0.16, 4, 10).rotateZ(1.2), new THREE.Matrix4().makeTranslation(-XW + 0.25, FL + 0.22 + 0.432 * 5 + 0.06, -3.4));
    eb.add(M.get('paint-violet'), new THREE.ConeGeometry(0.16, 0.42, 20).rotateZ(1.4), new THREE.Matrix4().makeTranslation(2.1, FL + 0.12, -6.9));
    eb.add(M.get('paint-mustard'), new THREE.SphereGeometry(0.03, 8, 6), new THREE.Matrix4().makeTranslation(1.9, FL + 0.08, -6.88));
    staticG.add(eb.build('easter-eggs'));
  }

  // ---- Finish ------------------------------------------------------------------------
  staticG.add(...[...b.build('shell').children]); // copy first: add() reparents (and would skip every other child)
  const bakedStatic = mergeStatic(staticG, 'wheezes-interior-static');
  inst.build(staticG);
  // Everything receives shadows; only the shell's ceiling and partitions cast (they keep
  // moonlight from leaking through the upper windows) — nothing else joins the shadow pass.
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.receiveShadow = true;
    m.castShadow = m.parent === bakedStatic && (m.material === ceilMat || m.material === charcoal || m.material === violet);
  });

  const animators: Animator[] = [{ update(dt, t) { now = t; for (const f of tickers) f(dt, t); } }];
  return {
    group,
    room: {
      floor: FL,
      ceiling: CY,
      rects: [{ x0: -XW, x1: XW, z0: ZB, z1: ZP }, { x0: -VX, x1: VX, z0: ZP - 0.05, z1: ZF }, { x0: -0.95, x1: 0.95, z0: 0.02, z1: 0.75 }],
      doorRects: [{ x0: -0.68, x1: 0.68, z0: ZF - 0.05, z1: 0.05 }],
      blockers,
      circles,
    },
    interactables,
    lights,
    animators,
    door: { center: V3(0, FL, 0.1), leaves: doorLeaves },
    musicAt,
    collectibles: 7,
    look: (camera) => look?.(camera),
  };

  function velvetMat(): THREE.Material { return M.get('velvet'); }
}
