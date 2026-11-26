/**
 * Furnishings for the tower room. Static pieces bake into one Batch (a draw
 * call per material); books, candles and buttons are InstancedMeshes;
 * animated pieces (orrery, globe, clock pendulum, chandelier, statue diadem)
 * are kept as dynamic groups and exposed to the game layer.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import { Batch, tf, lathe, cyl, cbox, softBox, archRing, extrude, tube, plane, type Circle, type Rect } from './util';
import { extrudeProfile } from '../architecture/kit/geometry';
import { bayMatrix, bayAngle, R, WALL_H } from './layout';
import type { RoomMats } from './materials';
import { WS } from './materials';
import type { ShelfSpec } from './shell';
import { eagleShape, paintPainting } from './textures';

const PI = Math.PI;

export interface Candle { pos: THREE.Vector3; h: number; r: number }

export interface Props {
  group: THREE.Group;
  candles: Candle[];
  colliders: { circles: Circle[]; rects: Rect[] };
  lights: { fire: THREE.Vector3; chandelier: THREE.Vector3; tables: THREE.Vector3[]; statue: THREE.Vector3 };
  animators: ((dt: number, t: number) => void)[];
  refs: {
    globe: THREE.Object3D;
    orrery: THREE.Object3D;
    orreryState: { speed: number; target: number };
    globeState: { spin: number };
    clock: THREE.Object3D;
    telescope: THREE.Object3D;
    telescopeEye: THREE.Vector3;
    lectern: THREE.Object3D;
    statue: THREE.Object3D;
    diadem: THREE.Mesh;
    hearth: THREE.Object3D;
    sofaSeat: THREE.Vector3;
    sofaLook: THREE.Vector3;
    chandelier: THREE.Object3D;
    fireBase: THREE.Vector3;
    feathers: THREE.Vector3[];
    portraits: THREE.Object3D[];
    harp: THREE.Object3D;
    chess: THREE.Object3D;
  };
}

type B = Batch;

export function buildProps(m: RoomMats, shelves: ShelfSpec[]): Props {
  const group = new THREE.Group();
  group.name = 'props';
  const b = new Batch();
  const rng = new SeededRandom('props');
  const candles: Candle[] = [];
  const circles: Circle[] = [];
  const rects: Rect[] = [];
  const animators: Props['animators'] = [];
  const allShelves = [...shelves];

  // ------------------------------------------------------------ bookcases
  const bcRefs: THREE.Vector3[] = [];
  for (const bay of [2, 9, 10]) {
    const tall = bay === 9;
    b.push(bayMatrix(bay));
    bookcase(b, m, tall ? 4.5 : 3.35, 3.7, allShelves, bayMatrix(bay));
    if (tall) ladder(b, m);
    b.pop();
    const c = new THREE.Vector3(0, 0, -0.3).applyMatrix4(bayMatrix(bay));
    rects.push({ x: c.x, z: c.z, hw: 1.95, hd: 0.32 + (tall ? 0.2 : 0), rot: bayAngle(bay) });
    bcRefs.push(c);
  }
  const books = fillShelves(m, allShelves, rng.fork('books'));
  group.add(...books);

  // banners above the lower bookcases
  for (const bay of [2, 10]) {
    b.push(bayMatrix(bay));
    b.add(m.bronze, cyl(0.025, 0.025, 1.3, 10, WS.bronze).rotateZ(PI / 2), tf(0, 6.0, -0.12));
    for (const s of [-1, 1]) b.add(m.bronze, lathe([[0.001, 0], [0.035, 0.03], [0.02, 0.08], [0.001, 0.1]], 8, WS.bronze).rotateZ(-s * PI / 2), tf(s * 0.65, 6.0, -0.12));
    b.add(m.banner, bannerGeometry(1.05, 2.4), tf(0, 5.98, -0.1), false);
    b.pop();
  }

  // ------------------------------------------------------------ paintings
  const portraits: THREE.Object3D[] = [];
  const painting = (bay: number, x: number, y: number, w: number, h: number, kind: number, z = -0.06) => {
    b.push(bayMatrix(bay));
    frame(b, m, x, y, z, w, h);
    b.pop();
    const mat = new THREE.MeshStandardMaterial({ map: paintPainting(kind, `paint-${bay}-${kind}`), roughness: 0.45, name: `painting-${bay}` });
    const mesh = new THREE.Mesh(plane(w, h), mat);
    mesh.applyMatrix4(new THREE.Matrix4().multiplyMatrices(bayMatrix(bay), tf(x, y, z - 0.035, PI)));
    mesh.receiveShadow = true;
    group.add(mesh);
    portraits.push(mesh);
  };
  painting(9, 0, 5.3, 1.6, 1.15, 1, -0.06);
  painting(3, 0, 3.15, 1.0, 0.8, 0, -0.44);

  // ------------------------------------------------------------ fireplace
  const fire = fireplace(b, m, candles);
  rects.push({ x: R - 0.55, z: 0, hw: 0.45, hd: 1.5, rot: 0 });
  rects.push({ x: R - 1.2, z: 0, hw: 0.3, hd: 0.95, rot: 0 }); // hearth slab / fender
  const clock = mantelClock(m, group);

  // ------------------------------------------------------------ fireside seating
  sofa(b, m, 3.85, 0, -PI / 2);
  rects.push({ x: 3.85, z: 0, hw: 0.5, hd: 1.15, rot: 0 });
  armchair(b, m, 5.75, -1.75, PI + 0.35);
  armchair(b, m, 5.75, 1.75, -0.35);
  circles.push({ x: 5.75, z: -1.75, r: 0.55 }, { x: 5.75, z: 1.75, r: 0.55 });
  // hearth rug and low table with chess and tea
  b.add(m.hearthRug, softBox(1.4, 0.02, 2.4, 0.01, 4), tf(5.9, 0.011, 0), false);
  lowTable(b, m, 5.15, 0);
  rects.push({ x: 5.15, z: 0, hw: 0.4, hd: 0.6, rot: 0 });
  const chess = chessSet(m, group, 5.15, 0.47, -0.2);
  teaSet(b, m, 5.15, 0.47, 0.35);
  b.add(m.velvetDark, softBox(0.5, 0.3, 0.5, 0.06, 6, 0.04), tf(6.6, 0.15, -0.75, 0.4));
  // blanket over the sofa arm, scarf on the sofa back
  b.add(m.wool, drapedCloth(0.9, 0.9, 0.35), tf(3.85, 0.66, 1.05, PI / 2));
  b.add(m.scarf, scarfGeometry(), tf(3.62, 0.92, -0.4, PI / 2));
  // a sleeping cat curled on the sofa
  cat(b, m, 3.95, 0.5, -0.55);

  // ------------------------------------------------------------ study table (west)
  rectTable(b, m, -4.4, 0.6, PI / 2, 2.4, 1.05);
  rects.push({ x: -4.4, z: 0.6, hw: 0.6, hd: 1.25, rot: 0 });
  for (const [x, z, r] of [[-3.55, 0.05, PI / 2], [-3.55, 1.15, PI / 2], [-5.25, 0.05, -PI / 2], [-5.25, 1.15, -PI / 2]] as const) {
    chair(b, m, x + rng.range(-0.05, 0.05), z, r + rng.range(-0.25, 0.25));
    circles.push({ x, z, r: 0.3 });
  }
  candelabrum(b, m, candles, -4.4, 0.79, 0.6, 3);
  openBook(b, m, -4.15, 0.79, 0.0, 0.3, rng);
  openBook(b, m, -4.65, 0.79, 1.2, -2.8, rng);
  bookStack(b, m, -4.7, 0.79, -0.3, 5, rng);
  bookStack(b, m, -4.1, 0.79, 1.55, 3, rng);
  parchments(b, m, -4.35, 0.79, 0.5, 4, rng);
  inkwell(b, m, -4.05, 0.79, 0.35);
  inkwell(b, m, -4.75, 0.79, 0.85);
  b.add(m.starChart, plane(0.4, 0.53).rotateX(-PI / 2), tf(-4.55, 0.795, 0.2, 0.5), false);
  bookStack(b, m, -5.6, 0, 2.0, 7, rng); // floor stack
  satchel(b, m, -5.4, 0, -0.65, 0.6);

  // ------------------------------------------------------------ round table (NE)
  roundTable(b, m, 3.2, -4.6, 0.75);
  circles.push({ x: 3.2, z: -4.6, r: 0.8 });
  for (let k = 0; k < 3; k++) {
    const a = k * (PI * 2 / 3) + 0.4;
    const x = 3.2 + Math.sin(a) * 1.05, z = -4.6 + Math.cos(a) * 1.05;
    chair(b, m, x, z, a + rng.range(-0.3, 0.3));
    circles.push({ x, z, r: 0.3 });
  }
  candlestick(b, m, candles, 3.2, 0.78, -4.6, 0.24);
  openBook(b, m, 3.0, 0.78, -4.35, 1.2, rng);
  hourglass(m, b, 3.5, 0.78, -4.8);
  teacup(b, m, 2.85, 0.78, -4.9);
  parchments(b, m, 3.35, 0.78, -4.3, 3, rng);
  scrolls(b, m, 3.5, 0.78, -4.45, rng);
  b.add(m.scarf, scarfGeometry(), tf(3.2 + Math.sin(0.4) * 1.05, 0.95, -4.6 + Math.cos(0.4) * 1.05, 0.4 + PI));

  // ------------------------------------------------------------ writing desk under window 11
  b.push(bayMatrix(11));
  desk(b, m);
  candlestick(b, m, candles, 0.6, 0.8, -1.4, 0.2, true);
  parchments(b, m, -0.1, 0.8, -1.45, 3, rng, true);
  inkwell(b, m, -0.45, 0.8, -1.35, true);
  bookStack(b, m, -0.6, 0.8, -1.55, 4, rng, true);
  chair(b, m, 0, -2.05, PI + 0.1, true);
  b.pop();
  { const c = new THREE.Vector3(0, 0, -1.5).applyMatrix4(bayMatrix(11)); rects.push({ x: c.x, z: c.z, hw: 0.75, hd: 0.35, rot: bayAngle(11) }); }
  { const c = new THREE.Vector3(0, 0, -2.05).applyMatrix4(bayMatrix(11)); circles.push({ x: c.x, z: c.z, r: 0.3 }); }

  // ------------------------------------------------------------ reading nook by window 1
  {
    const p = new THREE.Vector3(0.6, 0, -1.45).applyMatrix4(bayMatrix(1));
    armchair(b, m, p.x, p.z, bayAngle(1) + 0.4);
    circles.push({ x: p.x, z: p.z, r: 0.55 });
    const q = new THREE.Vector3(-0.75, 0, -1.2).applyMatrix4(bayMatrix(1));
    sideTable(b, m, q.x, q.z);
    circles.push({ x: q.x, z: q.z, r: 0.32 });
    candlestick(b, m, candles, q.x + 0.08, 0.62, q.z, 0.18);
    teacup(b, m, q.x - 0.1, 0.62, q.z + 0.08);
    bookStack(b, m, q.x - 0.05, 0.62, q.z - 0.12, 2, rng);
    const st = new THREE.Vector3(0.9, 0, -2.3).applyMatrix4(bayMatrix(1));
    b.add(m.velvet, softBox(0.45, 0.32, 0.45, 0.06, 6, 0.04), tf(st.x, 0.16, st.z, 0.3));
    circles.push({ x: st.x, z: st.z, r: 0.28 });
    bookStack(b, m, p.x + 0.7, 0, p.z + 0.3, 6, rng);
  }
  // potted plants on two window seats
  for (const bay of [4, 11]) {
    b.push(bayMatrix(bay));
    plant(b, m, 0.7, 0.66, 0.3, rng);
    b.pop();
  }
  // books and a candle left on window seats (lived-in)
  for (const bay of [5, 7, 8, 1]) {
    b.push(bayMatrix(bay));
    bookStack(b, m, -0.55, 0.65, 0.25, 2 + (bay % 3), rng, true);
    if (bay !== 1) candlestick(b, m, candles, 0.35, 0.65, 0.38, 0.12, true);
    b.pop();
  }

  // ------------------------------------------------------------ globe, telescope, harp
  const globe = globeStand(b, m, group, -4.85, 4.05);
  circles.push({ x: -4.85, z: 4.05, r: 0.45 });
  const { tele, eye } = telescope(b, m, group, -5.7, -2.95);
  circles.push({ x: -5.7, z: -2.95, r: 0.5 });
  const harp = harpStand(b, m, group, 1.6, 6.2);
  circles.push({ x: 1.6, z: 6.2, r: 0.45 });

  // ------------------------------------------------------------ centre: orrery on a marble pedestal
  const orreryState = { speed: 1, target: 1 };
  const orrery = orreryPiece(b, m, group, animators, orreryState);
  circles.push({ x: 0, z: 0, r: 0.75 });

  // ------------------------------------------------------------ statue, candelabra and lectern
  const { statue, diadem } = statueFigure(m, group);
  rects.push({ x: 0, z: -R + 0.25, hw: 1.5, hd: 0.9, rot: 0 });
  for (const s of [-1, 1]) {
    floorCandelabrum(b, m, candles, s * 1.75, -6.75);
    circles.push({ x: s * 1.75, z: -6.75, r: 0.3 });
  }
  const lectern = lecternStand(b, m, group, 0, -5.75);
  circles.push({ x: 0, z: -5.75, r: 0.4 });

  // ------------------------------------------------------------ broom by the door, crumpled paper, floor clutter
  broom(b, m, -1.25, 7.35);
  for (let k = 0; k < 7; k++) {
    const a = rng.range(0, PI * 2), r = rng.range(1.2, 5.5);
    b.add(m.paper, crumpled(rng), tf(Math.sin(a) * r, 0.035, Math.cos(a) * r, rng.range(0, 6)), true);
  }
  parchments(b, m, -1.2, 0.015, 1.8, 2, rng);
  b.add(m.starChart, plane(0.4, 0.53).rotateX(-PI / 2), tf(1.4, 0.016, -1.6, 2.2), false);

  // ------------------------------------------------------------ chandelier
  const chandelier = chandelierPiece(m, group, candles, animators);

  const staticGroup = b.build('props-static');
  group.add(staticGroup);

  const feathers = [
    new THREE.Vector3(-0.9, 0.06, 11.0), // landing (tutorial)
    new THREE.Vector3(R - 0.5, 1.8, 0.3), // mantel shelf
    new THREE.Vector3(0.78, 0.26, -R - 0.3), // statue niche, beside the plinth
    new THREE.Vector3(-4.5, 0.07, 0.9), // under the study table
    new THREE.Vector3(-7.62, 4.78, -0.6), // top of the tall bookcase
    new THREE.Vector3(...(bayToWorldTuple(7, -0.3, 0.68, 0.1))), // moonlit window seat
    new THREE.Vector3(3.55, 0.81, -4.55), // round table beside the hourglass
  ];

  return {
    group,
    candles,
    colliders: { circles, rects },
    lights: {
      fire: fire.light,
      chandelier: new THREE.Vector3(0, 7.6, 0),
      tables: [new THREE.Vector3(-4.4, 1.35, 0.6), new THREE.Vector3(3.2, 1.25, -4.6), new THREE.Vector3(0.6, 1.3, -1.4).applyMatrix4(bayMatrix(11))],
      statue: new THREE.Vector3(0, 2.4, -R + 0.3),
    },
    animators,
    refs: {
      globe, orrery, orreryState, globeState: globe.userData.state, clock, telescope: tele, telescopeEye: eye,
      lectern, statue, diadem, hearth: fire.hearth, sofaSeat: new THREE.Vector3(3.95, 1.05, 0.35), sofaLook: new THREE.Vector3(7.5, 0.9, 0),
      chandelier, fireBase: fire.base, feathers, portraits, harp, chess,
    },
  };
}

function bayToWorldTuple(bay: number, x: number, y: number, z: number): [number, number, number] {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(bayMatrix(bay));
  return [v.x, v.y, v.z];
}

// =========================================================================== joinery

function bookcase(b: B, m: RoomMats, h: number, w: number, shelves: ShelfSpec[], bayM: THREE.Matrix4): void {
  const d = 0.44, zf = -0.52, zc = zf + d / 2;
  b.add(m.walnut, cbox(w + 0.12, 0.16, d + 0.06, 0.02, WS.walnut), tf(0, 0.08, zc));
  b.add(m.walnut, cbox(w, h - 0.16, 0.02, 0.005, WS.walnut), tf(0, 0.16 + (h - 0.16) / 2, zf + d - 0.01));
  const cols = 3, colW = (w - 0.08) / cols;
  for (let k = 0; k <= cols; k++) {
    const x = -w / 2 + 0.04 + k * colW;
    const sideW = k === 0 || k === cols ? 0.07 : 0.045;
    b.add(m.walnut, cbox(sideW, h - 0.16, d, 0.008, WS.walnut), tf(x, 0.16 + (h - 0.16) / 2, zc));
    // pilaster face with fluting
    b.add(m.walnut, cbox(sideW + 0.03, h - 0.3, 0.025, 0.008, WS.walnut), tf(x, 0.16 + (h - 0.16) / 2, zf - 0.01));
  }
  const rows = Math.round((h - 0.5) / 0.42);
  const rowH = (h - 0.5) / rows;
  for (let r = 0; r <= rows; r++) {
    const y = 0.16 + r * rowH;
    b.add(m.walnut, cbox(w - 0.06, 0.03, d - 0.02, 0.006, WS.walnut), tf(0, y + 0.015, zc));
    if (r < rows) for (let k = 0; k < cols; k++) {
      const x0 = -w / 2 + 0.04 + k * colW + (k === 0 ? 0.035 : 0.022) + 0.005;
      const sw = colW - (k === 0 || k === cols - 1 ? 0.057 : 0.045) - 0.012;
      shelves.push({ matrix: new THREE.Matrix4().multiplyMatrices(bayM, tf(x0, y + 0.03, zf + 0.03)), width: sw, height: rowH - 0.04, depth: d - 0.06 });
    }
  }
  // crown: moulded cornice and pierced Gothic cresting
  const crown: [number, number][] = [[0, 0], [0.04, 0.02], [0.06, 0.06], [0.1, 0.1], [0.12, 0.16], [0.12, 0.2], [0, 0.2]];
  b.add(m.walnut, extrudeProfile(crown, w + 0.2, WS.walnut), tf(w / 2 + 0.1, h, zf + 0.06, PI));
  for (let k = 0; k < 6; k++) {
    const ax = -w / 2 + (k + 0.5) * (w / 6);
    const sh = archRing(w / 6 - 0.16, 0, 0.12, 0.05, 0.75);
    b.add(m.walnut, extrude(sh, 0.03, 0.004, WS.walnut, 6), tf(ax, h + 0.2, zf + 0.02));
    b.add(m.bronze, lathe([[0.001, 0], [0.025, 0.02], [0.02, 0.05], [0.006, 0.12], [0.001, 0.13]], 8, WS.bronze), tf(ax, h + 0.2 + 0.36, zf + 0.035));
  }
  // carved frieze roundels between columns
  for (let k = 0; k < cols; k++) {
    const x = -w / 2 + 0.04 + (k + 0.5) * colW;
    b.add(m.bronze, new THREE.TorusGeometry(0.06, 0.012, 6, 16), tf(x, h - 0.08, zf - 0.005));
  }
}

function ladder(b: B, m: RoomMats): void {
  const railY = 3.85;
  b.add(m.brass, cyl(0.02, 0.02, 3.6, 10, WS.brass).rotateZ(PI / 2), tf(0, railY, -0.6));
  for (const s of [-1, 0, 1]) b.add(m.brass, cyl(0.015, 0.015, 0.12, 8, WS.brass).rotateX(PI / 2), tf(s * 1.7, railY, -0.55));
  const lx = 0.7, tilt = 0.24, len = 3.95;
  b.push(tf(lx, 0, -0.62 - Math.sin(tilt) * len, 0, -tilt));
  for (const s of [-1, 1]) b.add(m.walnut, cbox(0.05, len, 0.07, 0.01, WS.walnut), tf(s * 0.24, len / 2, 0));
  for (let k = 1; k < 13; k++) b.add(m.walnut, cyl(0.016, 0.016, 0.48, 8, WS.walnut).rotateZ(PI / 2), tf(0, k * 0.3, 0));
  b.add(m.brass, new THREE.TorusGeometry(0.035, 0.008, 6, 12), tf(-0.24, len + 0.02, 0.04, PI / 2));
  b.add(m.brass, new THREE.TorusGeometry(0.035, 0.008, 6, 12), tf(0.24, len + 0.02, 0.04, PI / 2));
  b.pop();
}

const BOOK_COLORS = [0x1d2f6b, 0x142456, 0x6e1b1b, 0x4b1414, 0x223f28, 0x2f2116, 0x4a3019, 0x6b4a22, 0x1a1a1f, 0x3a2a4a, 0x7a5a2a, 0x2a4a6a, 0x5a3a2a, 0x0e1838];

function fillShelves(m: RoomMats, shelves: ShelfSpec[], rng: SeededRandom): THREE.Object3D[] {
  const mats: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const bands: THREE.Matrix4[] = [];
  const col = new THREE.Color();
  const push = (sm: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, rz = 0, ry = 0) => {
    const mm = new THREE.Matrix4().multiplyMatrices(sm, tf(x, y, z, ry, 0, rz).multiply(new THREE.Matrix4().makeScale(w, h, d)));
    mats.push(mm);
    col.setHex(rng.pick(BOOK_COLORS)).multiplyScalar(rng.range(0.75, 1.25));
    cols.push(col.clone());
    if (rng.chance(0.55) && w > 0.025) {
      for (const by of rng.chance(0.5) ? [0.18, 0.82] : [0.12, 0.25, 0.8]) {
        bands.push(new THREE.Matrix4().multiplyMatrices(sm, tf(x, y, z, ry, 0, rz).multiply(tf(0, (by - 0.5) * h, -d / 2 - 0.001)).multiply(new THREE.Matrix4().makeScale(w * 1.02, 0.008, 0.003))));
      }
    }
  };
  for (const s of shelves) {
    let x = 0.004;
    while (x < s.width - 0.02) {
      const r = rng.next();
      if (r < 0.035) { x += rng.range(0.04, 0.16); continue; }
      if (r < 0.075 && s.width - x > 0.3) {
        // a lying stack
        const n = rng.int(2, 5);
        const sw = rng.range(0.18, 0.26), sd = Math.min(s.depth * 0.9, rng.range(0.14, 0.22));
        let y = 0;
        for (let k = 0; k < n && y < s.height - 0.06; k++) {
          const th = rng.range(0.025, 0.055);
          push(s.matrix, x + sw / 2, y + th / 2, sd / 2 + 0.01, sw * rng.range(0.85, 1), th, sd, 0, rng.range(-0.08, 0.08));
          y += th;
        }
        x += sw + 0.01;
        continue;
      }
      const w = rng.range(0.022, 0.06);
      const h = Math.min(s.height - 0.015, s.height * rng.range(0.6, 0.97));
      const d = Math.min(s.depth, s.depth * rng.range(0.6, 0.98));
      if (r > 0.95 && x > 0.1) {
        // leaning book
        const lean = rng.range(0.15, 0.3);
        push(s.matrix, x + Math.sin(lean) * h / 2 + w / 2, Math.cos(lean) * h / 2, d / 2, w, h, d, -lean);
        x += Math.sin(lean) * h + w + 0.01;
        continue;
      }
      push(s.matrix, x + w / 2, h / 2, d / 2, w, h, d);
      x += w + rng.range(0.0, 0.004);
    }
  }
  const geo = cbox(1, 1, 1, 0.06, 1);
  // rescale UVs so the leather grain isn't stretched across tiny books
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.12, uv.getY(i) * 0.35);
  const mesh = new THREE.InstancedMesh(geo, m.bookCover, mats.length);
  mats.forEach((mm, i) => { mesh.setMatrixAt(i, mm); mesh.setColorAt(i, cols[i]); });
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.name = 'books';
  mesh.computeBoundingSphere();
  const bandMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m.brass, bands.length);
  bands.forEach((mm, i) => bandMesh.setMatrixAt(i, mm));
  bandMesh.name = 'book-bands';
  bandMesh.computeBoundingSphere();
  return [mesh, bandMesh];
}

function frame(b: B, m: RoomMats, x: number, y: number, z: number, w: number, h: number): void {
  const fw = 0.11;
  // gilt bead around the sight edge
  for (const [bw, bh, by, bx] of [[w + 0.04, 0.025, h / 2 + 0.012, 0], [w + 0.04, 0.025, -h / 2 - 0.012, 0], [0.025, h, 0, w / 2 + 0.012], [0.025, h, 0, -w / 2 - 0.012]] as const) {
    b.add(m.brass, cbox(bw, bh, 0.07, 0.008, WS.brass), tf(x + bx, y + by, z - 0.035));
  }
  b.add(m.bronze, cbox(fw, h + 2 * fw, 0.05, 0.015, WS.bronze), tf(x - w / 2 - fw / 2, y, z - 0.03));
  b.add(m.bronze, cbox(fw, h + 2 * fw, 0.05, 0.015, WS.bronze), tf(x + w / 2 + fw / 2, y, z - 0.03));
  b.add(m.bronze, cbox(w + 2 * fw, fw, 0.05, 0.015, WS.bronze), tf(x, y + h / 2 + fw / 2, z - 0.03));
  b.add(m.bronze, cbox(w + 2 * fw, fw, 0.05, 0.015, WS.bronze), tf(x, y - h / 2 - fw / 2, z - 0.03));
  b.add(m.walnut, cbox(w + 0.02, h + 0.02, 0.03, 0.005, WS.walnut), tf(x, y, z - 0.01));
}

function bannerGeometry(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 16, 40);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) - h / 2;
    const v = -y / h;
    p.setXYZ(i, x, y, -0.03 * Math.sin((x / w) * PI * 4 + v * 2) * v - 0.04 * v);
  }
  g.computeVertexNormals();
  g.rotateY(PI);
  return g;
}

// =========================================================================== fireplace

function fireplace(b: B, m: RoomMats, candles: Candle[]): { light: THREE.Vector3; hearth: THREE.Object3D; base: THREE.Vector3 } {
  b.push(bayMatrix(3));
  const W = 2.9, D = 0.62, zf = -D;
  // hearth slab
  b.add(m.marble, cbox(W + 0.5, 0.1, 1.5, 0.02, WS.marble), tf(0, 0.05, -0.6));
  // jambs with colonnettes
  for (const s of [-1, 1]) {
    b.add(m.ashlar, cbox(0.62, 1.45, D, 0.02, WS.ashlar), tf(s * (W / 2 - 0.31), 0.1 + 0.725, -D / 2));
    b.add(m.marble, cyl(0.07, 0.07, 1.2, 14, WS.marble), tf(s * (W / 2 - 0.62), 0.75, zf - 0.04));
    b.add(m.marble, lathe([[0.1, 0], [0.1, 0.06], [0.08, 0.1], [0.07, 0.12]], 12, WS.marble), tf(s * (W / 2 - 0.62), 0.1, zf - 0.04));
    b.add(m.bronze, lathe([[0.07, 0], [0.1, 0.06], [0.13, 0.14], [0.13, 0.17]], 12, WS.bronze), tf(s * (W / 2 - 0.62), 1.35, zf - 0.04));
    // corbel brackets under the mantel
    b.add(m.ashlar, cbox(0.24, 0.3, 0.24, 0.03, WS.ashlar), tf(s * (W / 2 - 0.2), 1.42, zf - 0.08));
  }
  // lintel with four-centred (Tudor) opening
  const lin = new THREE.Shape();
  const ow = W - 1.24;
  lin.moveTo(-ow / 2 - 0.01, 0); lin.lineTo(-ow / 2, 0.9);
  lin.quadraticCurveTo(-ow / 2 + 0.05, 1.08, -0.1, 1.12); lin.lineTo(0.1, 1.12);
  lin.quadraticCurveTo(ow / 2 - 0.05, 1.08, ow / 2, 0.9); lin.lineTo(ow / 2 + 0.01, 0);
  lin.lineTo(ow / 2 + 0.01, 1.45); lin.lineTo(-ow / 2 - 0.01, 1.45); lin.closePath();
  b.add(m.ashlar, extrude(lin, D, 0, WS.ashlar), tf(0, 0.1, zf));
  // carved frieze panel with bronze stars
  for (let k = 0; k < 5; k++) b.add(m.bronze, lathe([[0.001, 0], [0.05, 0.005], [0.05, 0.015], [0.001, 0.02]], 8, WS.bronze).rotateX(-PI / 2), tf((k - 2) * 0.32, 1.33, zf - 0.005));
  // mantel shelf (moulded)
  const shelfProf: [number, number][] = [[0, 0], [0.06, 0.02], [0.1, 0.06], [0.14, 0.08], [0.14, 0.12], [0, 0.12]];
  b.add(m.marble, extrudeProfile(shelfProf, W + 0.3, WS.marble), tf(W / 2 + 0.15, 1.55, zf + 0.0, PI));
  b.add(m.marble, cbox(W + 0.3, 0.08, D + 0.18, 0.02, WS.marble), tf(0, 1.71, -D / 2 - 0.07));
  // overmantel with eagle relief, tapering hood to the cornice
  b.add(m.ashlar, cbox(W - 0.3, 2.3, 0.42, 0.02, WS.ashlar), tf(0, 1.75 + 1.15, -0.21));
  b.add(m.ashlar, cbox(W - 0.6, WALL_H - 4.05, 0.3, 0.02, WS.ashlar), tf(0, 4.05 + (WALL_H - 4.05) / 2, -0.15));
  for (const s of [-1, 1]) b.add(m.marble, cyl(0.06, 0.06, 2.1, 12, WS.marble), tf(s * (W / 2 - 0.22), 2.85, -0.44));
  b.add(m.bronze, extrude(eagleShape(0.42), 0.04, 0.008, WS.bronze, 4), tf(0, 4.55, -0.37, PI));
  // firebox: sooty back and cheeks
  b.add(m.soot, cbox(ow + 0.04, 1.1, 0.05, 0.01, WS.iron), tf(0, 0.65, -0.02));
  for (const s of [-1, 1]) b.add(m.soot, cbox(0.05, 1.1, D - 0.05, 0.01, WS.iron), tf(s * (ow / 2 - 0.02), 0.65, -D / 2), false);
  b.add(m.soot, cbox(ow, 0.04, D, 0.01, WS.iron), tf(0, 0.12, -D / 2));
  // iron grate, fire dogs and logs
  for (let k = 0; k < 6; k++) b.add(m.iron, cyl(0.012, 0.012, 0.85, 6, WS.iron).rotateZ(PI / 2), tf(0, 0.28, -0.12 - k * 0.07));
  for (const s of [-1, 1]) {
    b.add(m.iron, cyl(0.02, 0.025, 0.5, 8, WS.iron), tf(s * 0.38, 0.38, -0.5));
    b.add(m.brass, new THREE.SphereGeometry(0.045, 12, 8), tf(s * 0.38, 0.66, -0.5));
    b.add(m.iron, cbox(0.04, 0.04, 0.45, 0.01, WS.iron), tf(s * 0.38, 0.17, -0.32));
  }
  const logs: [number, number, number, number, number][] = [[-0.1, 0.36, -0.3, 0.25, 0.08], [0.12, 0.36, -0.28, -0.3, 0.075], [0.0, 0.47, -0.32, 0.05, 0.07]];
  for (const [x, y, z, r, rad] of logs) b.add(m.oak, cyl(rad, rad * 1.1, 0.75, 10, WS.oak).rotateZ(PI / 2), tf(x, y, z, r));
  b.add(m.ember, softBox(0.7, 0.06, 0.38, 0.02, 4, 0.02), tf(0, 0.17, -0.3), false);
  // fender and tools
  b.add(m.brass, cyl(0.02, 0.02, W - 0.6, 8, WS.brass).rotateZ(PI / 2), tf(0, 0.24, -1.2));
  for (const s of [-1, 1]) b.add(m.brass, cyl(0.02, 0.02, 0.6, 8, WS.brass).rotateX(PI / 2), tf(s * (W / 2 - 0.3), 0.24, -0.9));
  for (let k = 0; k < 12; k++) b.add(m.brass, cyl(0.008, 0.008, 0.14, 6, WS.brass), tf(-W / 2 + 0.4 + k * 0.19, 0.17, -1.2));
  for (let k = 0; k < 3; k++) b.add(m.iron, cyl(0.01, 0.01, 0.85, 6, WS.iron), tf(W / 2 + 0.05, 0.5, -0.75 + k * 0.08, 0, 0.06 * (k - 1), 0.04));
  b.add(m.iron, cyl(0.04, 0.05, 0.05, 10, WS.iron), tf(W / 2 + 0.05, 0.12, -0.67));
  b.add(m.brass, new THREE.TorusGeometry(0.05, 0.01, 6, 14), tf(W / 2 + 0.05, 0.95, -0.67, PI / 2));
  // mantel dressing: candlesticks, books, a vase, a stack of letters
  candlestick(b, m, candles, -1.25, 1.75, -0.38, 0.26, true);
  candlestick(b, m, candles, 1.25, 1.75, -0.38, 0.26, true);
  candlestick(b, m, candles, -0.95, 1.75, -0.42, 0.16, true);
  b.add(m.porcelain, lathe([[0.001, 0], [0.05, 0], [0.08, 0.06], [0.09, 0.16], [0.05, 0.27], [0.04, 0.32], [0.06, 0.35], [0.055, 0.36], [0.001, 0.34]], 20, 0.3), tf(0.85, 1.75, -0.4));
  b.add(m.velvetDark, cbox(0.04, 0.24, 0.17, 0.01, 0.3), tf(-0.55, 1.87, -0.42, 0, 0, 0.1));
  b.add(m.leather, cbox(0.05, 0.22, 0.16, 0.01, 0.3), tf(-0.49, 1.86, -0.42, 0, 0, 0.12));
  b.add(m.paper, cbox(0.2, 0.02, 0.12, 0.002, 0.3), tf(0.45, 1.76, -0.4, 0.3));
  const hearth = new THREE.Object3D();
  hearth.position.copy(new THREE.Vector3(0, 0.5, -0.4).applyMatrix4(bayMatrix(3)));
  b.pop();
  return { light: new THREE.Vector3(0, 0.75, -0.45).applyMatrix4(bayMatrix(3)), hearth, base: new THREE.Vector3(0, 0.2, -0.3).applyMatrix4(bayMatrix(3)) };
}

function mantelClock(m: RoomMats, group: THREE.Group): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'mantel-clock';
  g.userData.keep = true;
  const b = new Batch();
  b.add(m.walnut, cbox(0.34, 0.42, 0.16, 0.02, WS.walnut), tf(0, 0.21, 0));
  b.add(m.walnut, extrude(archRing(0.3, 0, 0.0, 0.03, 0.55), 0.17, 0.005, WS.walnut, 8), tf(0, 0.42, -0.085));
  b.add(m.brass, new THREE.TorusGeometry(0.11, 0.012, 8, 32), tf(0, 0.28, -0.085, PI));
  b.add(m.clockFace, new THREE.CircleGeometry(0.105, 32), tf(0, 0.28, -0.083, PI), false);
  for (const s of [-1, 1]) b.add(m.brass, new THREE.SphereGeometry(0.025, 10, 8), tf(s * 0.15, 0.02, -0.06));
  g.add(b.build('clock'));
  const hands = new THREE.Group();
  hands.position.set(0, 0.28, -0.09);
  const hh = new THREE.Mesh(cbox(0.008, 0.06, 0.003, 0.001), m.black); hh.position.y = 0.03;
  const mh = new THREE.Mesh(cbox(0.005, 0.085, 0.003, 0.001), m.black); mh.position.y = 0.042;
  const hp = new THREE.Group(); hp.add(hh); const mp = new THREE.Group(); mp.add(mh);
  hands.add(hp, mp);
  g.add(hands);
  const now = new Date();
  hp.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) / 12 * PI * 2;
  mp.rotation.z = -(now.getMinutes() / 60) * PI * 2;
  g.userData.hands = { hp, mp };
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(bayMatrix(3), tf(0.1, 1.75, -0.38, PI)));
  group.add(g);
  return g;
}

// =========================================================================== seating

function legLathe(h: number, r = 0.035): THREE.BufferGeometry {
  return lathe([[r * 0.8, 0], [r, 0.04], [r * 0.7, 0.08], [r * 1.25, h * 0.35], [r * 0.7, h * 0.55], [r, h * 0.7], [r * 0.8, h * 0.9], [r * 1.1, h]], 10, WS.walnut);
}

function chair(b: B, m: RoomMats, x: number, z: number, ry: number, local = false): void {
  b.push(local ? tf(x, 0, z, ry) : tf(x, 0, z, ry));
  const sw = 0.46, sd = 0.44, sh = 0.46;
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.add(m.walnut, legLathe(sh - 0.04, 0.026), tf(lx * (sw / 2 - 0.03), 0, lz * (sd / 2 - 0.03)));
  for (const lz of [-1, 1]) b.add(m.walnut, cyl(0.012, 0.012, sw - 0.06, 6, WS.walnut).rotateZ(PI / 2), tf(0, 0.15, lz * (sd / 2 - 0.03)));
  b.add(m.walnut, cbox(sw, 0.05, sd, 0.012, WS.walnut), tf(0, sh - 0.025, 0));
  b.add(m.velvet, softBox(sw - 0.04, 0.06, sd - 0.04, 0.025, 6, 0.015), tf(0, sh + 0.02, 0.01));
  // back: stiles, pointed top rail, upholstered panel
  for (const s of [-1, 1]) b.add(m.walnut, cbox(0.04, 0.6, 0.035, 0.008, WS.walnut), tf(s * (sw / 2 - 0.03), sh + 0.3, sd / 2 - 0.02, 0, -0.08));
  b.add(m.walnut, extrude(archRing(sw - 0.1, 0, 0.0, 0.04, 0.7), 0.035, 0.005, WS.walnut, 8), tf(0, sh + 0.55, sd / 2 - 0.0, 0, -0.08));
  b.add(m.velvet, softBox(sw - 0.12, 0.42, 0.04, 0.015, 4), tf(0, sh + 0.3, sd / 2 - 0.02, 0, -0.08));
  for (const s of [-1, 1]) b.add(m.bronze, new THREE.SphereGeometry(0.018, 8, 6), tf(s * (sw / 2 - 0.03), sh + 0.62, sd / 2 - 0.05));
  b.pop();
}

function armchair(b: B, m: RoomMats, x: number, z: number, ry: number): void {
  b.push(tf(x, 0, z, ry));
  const w = 0.86, d = 0.82;
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    b.add(m.walnut, lathe([[0.03, 0], [0.04, 0.03], [0.035, 0.1], [0.045, 0.14]], 10, WS.walnut), tf(lx * (w / 2 - 0.06), 0, lz * (d / 2 - 0.06)));
    b.add(m.brass, cyl(0.02, 0.02, 0.02, 8, WS.brass), tf(lx * (w / 2 - 0.06), 0.01, lz * (d / 2 - 0.06)));
  }
  b.add(m.velvet, softBox(w, 0.3, d, 0.06, 8), tf(0, 0.29, 0));
  b.add(m.velvet, softBox(w - 0.22, 0.14, d - 0.15, 0.06, 8, 0.03), tf(0, 0.5, -0.04));
  // tall back with a gentle curve and wings
  b.add(m.velvet, softBox(w, 0.85, 0.18, 0.07, 8, 0), tf(0, 0.85, d / 2 - 0.09, 0, -0.12));
  for (const s of [-1, 1]) {
    b.add(m.velvet, softBox(0.16, 0.5, d - 0.1, 0.06, 6), tf(s * (w / 2 - 0.08), 0.58, 0.0));
    b.add(m.velvet, cyl(0.09, 0.09, d - 0.05, 16, WS.velvet).rotateX(PI / 2), tf(s * (w / 2 - 0.08), 0.8, -0.01));
    b.add(m.velvet, softBox(0.12, 0.55, 0.36, 0.05, 6), tf(s * (w / 2 - 0.06), 1.0, d / 2 - 0.2, s * 0.25));
  }
  for (let k = 0; k < 9; k++) b.add(m.velvetDark, new THREE.SphereGeometry(0.014, 8, 6), tf(((k % 3) - 1) * 0.2, 0.7 + Math.floor(k / 3) * 0.2, d / 2 - 0.2 + Math.floor(k / 3) * 0.025));
  b.pop();
}

function sofa(b: B, m: RoomMats, x: number, z: number, ry: number): void {
  b.push(tf(x, 0, z, ry));
  const w = 2.2, d = 0.92;
  for (const lx of [-1, -0.33, 0.33, 1]) for (const lz of [-1, 1]) b.add(m.walnut, lathe([[0.035, 0], [0.045, 0.04], [0.04, 0.1], [0.05, 0.12]], 10, WS.walnut), tf(lx * (w / 2 - 0.08), 0, lz * (d / 2 - 0.08)));
  b.add(m.velvet, softBox(w, 0.28, d, 0.06, 10), tf(0, 0.26, 0));
  for (let k = 0; k < 3; k++) b.add(m.velvet, softBox((w - 0.36) / 3 - 0.01, 0.14, d - 0.22, 0.06, 8, 0.03), tf((k - 1) * (w - 0.36) / 3, 0.47, -0.06));
  b.add(m.velvet, softBox(w, 0.5, 0.24, 0.08, 10), tf(0, 0.68, d / 2 - 0.12, 0, -0.08));
  for (const s of [-1, 1]) {
    b.add(m.velvet, softBox(0.2, 0.42, d, 0.07, 6), tf(s * (w / 2 - 0.1), 0.55, 0));
    b.add(m.velvet, cyl(0.12, 0.12, d + 0.02, 18, WS.velvet).rotateX(PI / 2), tf(s * (w / 2 - 0.1), 0.72, 0));
  }
  for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) b.add(m.velvetDark, new THREE.SphereGeometry(0.016, 8, 6), tf(-0.88 + k * 0.22 + (r % 2) * 0.11, 0.6 + r * 0.17, d / 2 - 0.25 + r * 0.015));
  // two cushions
  b.add(m.silk, softBox(0.42, 0.4, 0.13, 0.06, 6), tf(-0.75, 0.65, 0.18, 0.3, -0.25));
  b.add(m.velvetDark, softBox(0.4, 0.38, 0.13, 0.06, 6), tf(0.8, 0.64, 0.2, -0.4, -0.2));
  b.pop();
}

function cat(b: B, m: RoomMats, x: number, y: number, z: number): void {
  const fur = m.black;
  b.push(tf(x, y, z, 0.8));
  b.add(fur, new THREE.SphereGeometry(0.16, 16, 12).scale(1.25, 0.6, 1), tf(0, 0.09, 0));
  b.add(fur, new THREE.SphereGeometry(0.075, 14, 10).scale(1, 0.85, 1.05), tf(0.17, 0.1, 0.06));
  for (const s of [-1, 1]) b.add(fur, new THREE.ConeGeometry(0.025, 0.05, 6), tf(0.18 + 0.02 * s, 0.17, 0.06 + 0.04 * s, 0, 0, -0.3));
  b.add(fur, tube([new THREE.Vector3(-0.18, 0.05, 0), new THREE.Vector3(-0.12, 0.04, 0.16), new THREE.Vector3(0.05, 0.035, 0.2), new THREE.Vector3(0.16, 0.04, 0.15)], 0.025, 24, 6));
  b.pop();
}

// =========================================================================== tables

function rectTable(b: B, m: RoomMats, x: number, z: number, ry: number, w: number, d: number): void {
  b.push(tf(x, 0, z, ry));
  const h = 0.76;
  b.add(m.walnut, cbox(w, 0.05, d, 0.015, WS.walnut), tf(0, h + 0.005, 0));
  const edge: [number, number][] = [[0, 0], [0.02, 0.005], [0.03, 0.02], [0.02, 0.035], [0, 0.04]];
  b.add(m.walnut, extrudeProfile(edge, w, WS.walnut), tf(w / 2, h - 0.03, -d / 2, PI));
  b.add(m.walnut, extrudeProfile(edge, w, WS.walnut), tf(-w / 2, h - 0.03, d / 2));
  b.add(m.walnut, cbox(w - 0.2, 0.1, d - 0.2, 0.01, WS.walnut), tf(0, h - 0.07, 0));
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.add(m.walnut, legLathe(h - 0.12, 0.045), tf(lx * (w / 2 - 0.14), 0, lz * (d / 2 - 0.14)));
  b.add(m.walnut, cbox(w - 0.3, 0.05, 0.05, 0.01, WS.walnut), tf(0, 0.16, 0));
  for (const lx of [-1, 1]) b.add(m.walnut, cbox(0.05, 0.05, d - 0.3, 0.01, WS.walnut), tf(lx * (w / 2 - 0.14), 0.16, 0));
  // leather writing inlays
  b.add(m.leather, cbox(w * 0.38, 0.004, d * 0.6, 0.001, WS.leather), tf(-w * 0.24, h + 0.031, 0), false);
  b.add(m.leather, cbox(w * 0.38, 0.004, d * 0.6, 0.001, WS.leather), tf(w * 0.24, h + 0.031, 0), false);
  b.pop();
}

function roundTable(b: B, m: RoomMats, x: number, z: number, r: number): void {
  b.push(tf(x, 0, z));
  b.add(m.walnut, lathe([[0.001, 0.78], [r, 0.78], [r + 0.02, 0.765], [r, 0.745], [r - 0.04, 0.735], [r - 0.06, 0.72], [0.001, 0.72]], 40, WS.walnut));
  b.add(m.walnut, lathe([[0.1, 0.0], [0.08, 0.1], [0.06, 0.18], [0.09, 0.3], [0.05, 0.45], [0.06, 0.6], [0.09, 0.66], [0.12, 0.72]], 16, WS.walnut));
  for (let k = 0; k < 3; k++) {
    const a = k * (PI * 2 / 3);
    b.add(m.walnut, extrude(footShape(), 0.06, 0.008, WS.walnut, 8), tf(0, 0, 0, a + PI / 2).multiply(tf(0, 0, -0.03)));
  }
  b.pop();
}

function footShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0.04, 0.22); s.quadraticCurveTo(0.25, 0.18, 0.42, 0.02); s.lineTo(0.46, 0.0); s.lineTo(0.4, 0.0);
  s.quadraticCurveTo(0.22, 0.08, 0.04, 0.08); s.closePath();
  return s;
}

function lowTable(b: B, m: RoomMats, x: number, z: number): void {
  b.push(tf(x, 0, z));
  b.add(m.walnut, cbox(0.75, 0.05, 1.1, 0.012, WS.walnut), tf(0, 0.44, 0));
  b.add(m.walnut, cbox(0.65, 0.08, 1.0, 0.01, WS.walnut), tf(0, 0.38, 0));
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) b.add(m.walnut, legLathe(0.34, 0.03), tf(lx * 0.3, 0, lz * 0.47));
  b.add(m.walnut, cbox(0.62, 0.025, 0.98, 0.005, WS.walnut), tf(0, 0.12, 0));
  b.add(m.leather, bookGeo(0.18, 0.04, 0.25), tf(-0.15, 0.135, 0.2, 0.3));
  b.pop();
}

function sideTable(b: B, m: RoomMats, x: number, z: number): void {
  b.push(tf(x, 0, z));
  b.add(m.walnut, lathe([[0.001, 0.62], [0.28, 0.62], [0.29, 0.6], [0.27, 0.58], [0.001, 0.58]], 28, WS.walnut));
  b.add(m.walnut, lathe([[0.18, 0], [0.18, 0.03], [0.06, 0.06], [0.04, 0.2], [0.06, 0.35], [0.035, 0.5], [0.07, 0.58]], 16, WS.walnut));
  b.pop();
}

function desk(b: B, m: RoomMats): void {
  // a slant-lidded writing desk facing the window (bay frame: room toward −z)
  const w = 1.4, d = 0.62, h = 0.78, zc = -1.5;
  b.add(m.walnut, cbox(w, 0.05, d, 0.012, WS.walnut), tf(0, h, zc));
  for (const s of [-1, 1]) {
    b.add(m.walnut, cbox(0.38, h - 0.05, d - 0.04, 0.01, WS.walnut), tf(s * (w / 2 - 0.2), (h - 0.05) / 2, zc));
    for (let k = 0; k < 3; k++) {
      b.add(m.walnut, cbox(0.34, 0.2, 0.02, 0.008, WS.walnut), tf(s * (w / 2 - 0.2), 0.14 + k * 0.23, zc - d / 2 + 0.005));
      b.add(m.brass, new THREE.TorusGeometry(0.018, 0.004, 6, 12), tf(s * (w / 2 - 0.2), 0.15 + k * 0.23, zc - d / 2 - 0.01));
    }
  }
  // pigeonhole gallery at the back
  b.add(m.walnut, cbox(w, 0.34, 0.2, 0.01, WS.walnut), tf(0, h + 0.2, zc + d / 2 - 0.1));
  for (let k = 0; k < 7; k++) b.add(m.black, cbox(0.15, 0.12, 0.02, 0.003, WS.walnut), tf(-0.54 + k * 0.18, h + 0.18, zc + d / 2 - 0.2), false);
  b.add(m.leather, cbox(w * 0.6, 0.004, d * 0.5, 0.001, WS.leather), tf(0, h + 0.027, zc - 0.05), false);
}

// =========================================================================== small props

function bookGeo(w: number, h: number, d: number): THREE.BufferGeometry {
  return cbox(w, h, d, Math.min(w, h, d) * 0.12, 0.3);
}

function bookStack(b: B, m: RoomMats, x: number, y: number, z: number, n: number, rng: SeededRandom, _local = false): void {
  let yy = y;
  const mats = [m.leather, m.velvetDark, m.bookCover, m.wool, m.leather];
  for (let k = 0; k < n; k++) {
    const w = rng.range(0.17, 0.28), d = rng.range(0.22, 0.34), h = rng.range(0.03, 0.065);
    b.add(rng.pick(mats), bookGeo(w, h, d), tf(x + rng.range(-0.02, 0.02), yy + h / 2, z + rng.range(-0.02, 0.02), rng.range(-0.4, 0.4)));
    b.add(m.bookPages, cbox(w - 0.008, h * 0.8, d - 0.012, 0.002, 0.3), tf(x + 0.004, yy + h / 2, z, 0), false);
    yy += h;
  }
}

function openBook(b: B, m: RoomMats, x: number, y: number, z: number, ry: number, _rng: SeededRandom): void {
  b.push(tf(x, y, z, ry));
  const w = 0.2, d = 0.27;
  for (const s of [-1, 1]) {
    b.add(m.leather, cbox(w, 0.008, d, 0.002, 0.3), tf(s * w / 2, 0.004, 0, 0, 0, s * -0.05));
    b.add(m.bookPages, cbox(w - 0.012, 0.022, d - 0.016, 0.004, 0.3), tf(s * (w / 2 - 0.004), 0.019, 0, 0, 0, s * -0.06));
  }
  const pg = new THREE.PlaneGeometry(2 * w - 0.02, d - 0.02, 16, 1);
  const p = pg.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i); p.setZ(i, 0.012 * Math.sin(Math.abs(px) / w * PI) - 0.006 * (1 - Math.abs(px) / w)); }
  pg.computeVertexNormals();
  b.add(m.pages, pg.rotateX(-PI / 2), tf(0, 0.032, 0), false);
  b.pop();
}

function parchments(b: B, m: RoomMats, x: number, y: number, z: number, n: number, rng: SeededRandom, _local = false): void {
  for (let k = 0; k < n; k++) {
    const g = plane(0.21, 0.29, 4, 4);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.004 * Math.sin(p.getX(i) * 20 + k) * Math.cos(p.getY(i) * 13));
    g.computeVertexNormals();
    b.add(rng.pick(m.parchment), g.rotateX(-PI / 2), tf(x + rng.range(-0.12, 0.12), y + 0.002 + k * 0.0015, z + rng.range(-0.12, 0.12), rng.range(-0.6, 0.6)), false);
  }
}

function scrolls(b: B, m: RoomMats, x: number, y: number, z: number, rng: SeededRandom): void {
  for (let k = 0; k < 3; k++) {
    const len = rng.range(0.22, 0.32);
    b.add(m.parchment[k % 4], cyl(0.022, 0.022, len, 12, 0.3).rotateZ(PI / 2), tf(x + k * 0.03, y + 0.022 + (k === 2 ? 0.04 : 0), z + k * 0.045 - (k === 2 ? 0.02 : 0), rng.range(-0.3, 0.3)));
    b.add(m.velvet, new THREE.TorusGeometry(0.024, 0.004, 4, 12).rotateY(PI / 2), tf(x + k * 0.03, y + 0.022 + (k === 2 ? 0.04 : 0), z + k * 0.045 - (k === 2 ? 0.02 : 0)));
  }
}

function inkwell(b: B, m: RoomMats, x: number, y: number, z: number, _local = false): void {
  b.add(m.inkGlass, lathe([[0.001, 0], [0.035, 0], [0.04, 0.02], [0.038, 0.045], [0.018, 0.055], [0.016, 0.065], [0.001, 0.065]], 16, 0.2), tf(x, y, z));
  // quill: a curved shaft and a feathered vane
  const shaft = [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.03, 0.18, 0.01), new THREE.Vector3(0.07, 0.3, 0.03)];
  b.push(tf(x, y, z, 0.6));
  b.add(m.paper, tube(shaft, 0.0025, 12, 4));
  const vane = new THREE.Shape();
  vane.moveTo(0, 0); vane.quadraticCurveTo(0.03, 0.05, 0.015, 0.2); vane.quadraticCurveTo(-0.005, 0.12, -0.012, 0.03); vane.closePath();
  b.add(m.paper, new THREE.ShapeGeometry(vane, 6), tf(0.015, 0.1, 0.008, 0, 0, -0.25), false);
  b.pop();
}

function teacup(b: B, m: RoomMats, x: number, y: number, z: number): void {
  b.add(m.porcelain, lathe([[0.001, 0], [0.065, 0], [0.07, 0.006], [0.03, 0.01], [0.001, 0.01]], 20, 0.2), tf(x, y, z));
  b.add(m.porcelain, lathe([[0.001, 0.01], [0.025, 0.01], [0.04, 0.03], [0.045, 0.06], [0.042, 0.062], [0.035, 0.03], [0.001, 0.018]], 20, 0.2), tf(x, y, z));
  b.add(m.porcelain, new THREE.TorusGeometry(0.016, 0.004, 6, 12, PI * 1.3), tf(x + 0.048, y + 0.04, z, 0, 0, -PI * 0.65));
  b.add(m.leather, new THREE.CircleGeometry(0.038, 16).rotateX(-PI / 2), tf(x, y + 0.05, z), false);
}

function teaSet(b: B, m: RoomMats, x: number, y: number, z: number): void {
  b.add(m.brass, lathe([[0.001, 0], [0.18, 0], [0.19, 0.01], [0.18, 0.015], [0.001, 0.015]], 28, 0.3), tf(x, y, z));
  b.add(m.porcelain, lathe([[0.001, 0.015], [0.05, 0.015], [0.08, 0.05], [0.085, 0.09], [0.07, 0.13], [0.04, 0.145], [0.045, 0.15], [0.02, 0.17], [0.01, 0.185], [0.001, 0.19]], 24, 0.2), tf(x, y, z));
  b.add(m.porcelain, tube([new THREE.Vector3(0.07, 0.06, 0), new THREE.Vector3(0.12, 0.1, 0), new THREE.Vector3(0.14, 0.15, 0)], 0.01, 10, 6), tf(x, y, z));
  b.add(m.porcelain, new THREE.TorusGeometry(0.04, 0.008, 6, 14, PI * 1.2), tf(x - 0.08, y + 0.1, z, 0, 0, PI * 0.4));
  teacup(b, m, x + 0.1, y + 0.015, z - 0.12);
  teacup(b, m, x - 0.08, y + 0.015, z + 0.13);
}

function chessSet(m: RoomMats, group: THREE.Group, x: number, y: number, z: number): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'chess';
  const b = new Batch();
  b.add(m.walnut, cbox(0.34, 0.025, 0.34, 0.005, WS.walnut), tf(0, 0.0125, 0));
  b.add(m.chess, new THREE.PlaneGeometry(0.33, 0.33).rotateX(-PI / 2), tf(0, 0.026, 0), false);
  const white = m.porcelain, black = m.black;
  const sq = 0.33 * (448 / 512) / 8, o = -sq * 3.5;
  const pawn = lathe([[0.001, 0], [0.012, 0], [0.012, 0.004], [0.006, 0.01], [0.004, 0.022], [0.007, 0.026], [0.001, 0.034]], 10, 0.1);
  const king = lathe([[0.001, 0], [0.014, 0], [0.014, 0.005], [0.007, 0.014], [0.005, 0.038], [0.009, 0.042], [0.006, 0.05], [0.002, 0.058], [0.001, 0.058]], 10, 0.1);
  const rook = lathe([[0.001, 0], [0.013, 0], [0.013, 0.005], [0.008, 0.012], [0.008, 0.03], [0.011, 0.032], [0.011, 0.04], [0.001, 0.04]], 10, 0.1);
  const rng = new SeededRandom('chess');
  // a game in progress: some pieces captured and moved off the board
  for (let side = 0; side < 2; side++) {
    const mat = side ? black : white;
    for (let f = 0; f < 8; f++) {
      if (rng.chance(0.3)) continue;
      const rk = side ? 6 : 1;
      const adv = rng.chance(0.3) ? (side ? -1 : 1) * rng.int(1, 2) : 0;
      b.add(mat, pawn, tf(o + f * sq, 0.026, o + (rk + adv) * sq));
    }
    for (const f of [0, 7]) if (rng.chance(0.7)) b.add(mat, rook, tf(o + f * sq, 0.026, o + (side ? 7 : 0) * sq));
    b.add(mat, king, tf(o + 4 * sq, 0.026, o + (side ? 7 : 0) * sq));
    b.add(mat, king, tf(o + 3 * sq + 0.002, 0.026, o + (side ? 5 : 2) * sq));
    for (let k = 0; k < 3; k++) b.add(mat, pawn, tf(0.2 + k * 0.03, 0, (side ? 0.12 : -0.12) + k * 0.01));
  }
  g.add(b.build('chess'));
  g.position.set(x, y, z);
  g.rotation.y = 0.2;
  group.add(g);
  return g;
}

function hourglass(m: RoomMats, b: B, x: number, y: number, z: number): void {
  for (const yy of [0, 0.2]) b.add(m.walnut, cyl(0.05, 0.05, 0.015, 16, WS.walnut), tf(x, y + yy + 0.0075, z));
  for (let k = 0; k < 3; k++) { const a = k * PI * 2 / 3; b.add(m.walnut, cyl(0.005, 0.005, 0.2, 6, WS.walnut), tf(x + Math.sin(a) * 0.042, y + 0.1, z + Math.cos(a) * 0.042)); }
  b.add(m.clearGlass, lathe([[0.003, 0.015], [0.03, 0.02], [0.034, 0.06], [0.004, 0.1], [0.034, 0.14], [0.03, 0.18], [0.003, 0.185]], 16, 0.2), tf(x, y, z), false);
  b.add(m.paper, lathe([[0.001, 0.016], [0.028, 0.02], [0.02, 0.05], [0.004, 0.08], [0.001, 0.08]], 12, 0.2), tf(x, y, z));
}

function candlestick(b: B, m: RoomMats, candles: Candle[], x: number, y: number, z: number, h: number, local = false): void {
  b.add(m.bronze, lathe([[0.001, 0], [0.06, 0], [0.06, 0.01], [0.045, 0.02], [0.015, 0.04], [0.012, h * 0.6], [0.02, h * 0.65], [0.012, h * 0.7], [0.012, h - 0.02], [0.03, h - 0.01], [0.03, h], [0.001, h]], 14, WS.bronze), tf(x, y, z));
  const ch = 0.08 + ((x * 13.1 + z * 7.3) % 1 + 1) % 1 * 0.1;
  const p = new THREE.Vector3(x, y + h, z);
  if (local) p.applyMatrix4(b.top);
  candles.push({ pos: p, h: ch, r: 0.012 });
}

function candelabrum(b: B, m: RoomMats, candles: Candle[], x: number, y: number, z: number, arms: number): void {
  b.add(m.bronze, lathe([[0.001, 0], [0.09, 0], [0.09, 0.015], [0.05, 0.03], [0.018, 0.07], [0.014, 0.3], [0.025, 0.32], [0.012, 0.34]], 14, WS.bronze), tf(x, y, z));
  const spread = 0.17;
  for (let k = 0; k < arms; k++) {
    const ox = (k - (arms - 1) / 2) * spread;
    if (Math.abs(ox) > 0.01) b.add(m.bronze, tube([new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(ox * 0.6, 0.27, 0), new THREE.Vector3(ox, 0.34, 0), new THREE.Vector3(ox, 0.38, 0)], 0.008, 16, 5), tf(x, y, z));
    b.add(m.bronze, cyl(0.025, 0.018, 0.02, 10, WS.bronze), tf(x + ox, y + 0.39, z));
    candles.push({ pos: new THREE.Vector3(x + ox, y + 0.4, z), h: 0.12 + 0.04 * Math.sin(k * 2.1), r: 0.011 });
  }
}

function floorCandelabrum(b: B, m: RoomMats, candles: Candle[], x: number, z: number): void {
  b.add(m.bronze, lathe([[0.001, 0], [0.22, 0], [0.2, 0.03], [0.06, 0.08], [0.035, 0.2], [0.03, 1.2], [0.05, 1.25], [0.03, 1.3], [0.028, 1.55], [0.06, 1.6]], 16, WS.bronze), tf(x, 0, z));
  for (let k = 0; k < 3; k++) {
    const a = k * (PI * 2 / 3);
    b.add(m.bronze, cbox(0.03, 0.03, 0.26, 0.006, WS.bronze), tf(x + Math.sin(a) * 0.13, 0.04, z + Math.cos(a) * 0.13, a));
  }
  for (let k = 0; k < 5; k++) {
    const a = k * (PI * 2 / 5);
    const ex = Math.sin(a) * 0.24, ez = Math.cos(a) * 0.24;
    b.add(m.bronze, tube([new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(ex * 0.5, 1.48, ez * 0.5), new THREE.Vector3(ex, 1.56, ez), new THREE.Vector3(ex, 1.62, ez)], 0.01, 16, 5), tf(x, 0, z));
    b.add(m.bronze, cyl(0.03, 0.02, 0.02, 10, WS.bronze), tf(x + ex, 1.63, z + ez));
    candles.push({ pos: new THREE.Vector3(x + ex, 1.64, z + ez), h: 0.18 + 0.05 * Math.sin(k * 1.7), r: 0.014 });
  }
  b.add(m.bronze, cyl(0.035, 0.02, 0.03, 10, WS.bronze), tf(x, 1.62, z));
  candles.push({ pos: new THREE.Vector3(x, 1.635, z), h: 0.26, r: 0.016 });
}

function satchel(b: B, m: RoomMats, x: number, y: number, z: number, ry: number): void {
  b.push(tf(x, y, z, ry, 0.2));
  b.add(m.leather, softBox(0.38, 0.28, 0.12, 0.04, 6), tf(0, 0.14, 0));
  b.add(m.leather, softBox(0.39, 0.16, 0.02, 0.01, 4), tf(0, 0.2, -0.065, 0, 0.1));
  b.add(m.brass, cbox(0.04, 0.03, 0.01, 0.003, 0.2), tf(0, 0.14, -0.08));
  b.add(m.leather, tube([new THREE.Vector3(-0.17, 0.26, 0), new THREE.Vector3(-0.1, 0.5, 0.05), new THREE.Vector3(0.1, 0.52, 0.08), new THREE.Vector3(0.17, 0.26, 0)], 0.012, 24, 4));
  b.pop();
}

function plant(b: B, m: RoomMats, x: number, y: number, z: number, rng: SeededRandom): void {
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2d4a24, roughness: 0.6, side: THREE.DoubleSide, name: 'leaf' });
  b.add(m.porcelain, lathe([[0.001, 0], [0.07, 0], [0.1, 0.14], [0.11, 0.16], [0.001, 0.15]], 18, 0.2), tf(x, y, z));
  for (let k = 0; k < 14; k++) {
    const a = rng.range(0, PI * 2), t = rng.range(0.3, 1);
    const tip = new THREE.Vector3(Math.sin(a) * 0.2 * t, 0.15 + 0.3 * t, Math.cos(a) * 0.2 * t);
    b.add(leaf, tube([new THREE.Vector3(0, 0.15, 0), new THREE.Vector3(tip.x * 0.4, tip.y * 0.9, tip.z * 0.4), tip], 0.004, 8, 3), tf(x, y, z));
    const lf = new THREE.Shape(); lf.moveTo(0, 0); lf.quadraticCurveTo(0.04, 0.06, 0, 0.13); lf.quadraticCurveTo(-0.04, 0.06, 0, 0);
    b.add(leaf, new THREE.ShapeGeometry(lf, 4), tf(x + tip.x, y + tip.y - 0.02, z + tip.z, a, rng.range(-0.9, -0.3)), false);
  }
}

function broom(b: B, m: RoomMats, x: number, z: number): void {
  b.push(tf(x, 0, z, 0.4, 0, 0.12));
  b.add(m.walnut, cyl(0.016, 0.018, 1.55, 8, WS.walnut), tf(0, 0.95, 0));
  b.add(m.oak, lathe([[0.02, 0.0], [0.07, 0.05], [0.1, 0.25], [0.05, 0.4], [0.025, 0.45]], 14, 0.3), tf(0, -0.02, 0));
  b.add(m.brass, cyl(0.03, 0.03, 0.03, 10, WS.brass), tf(0, 0.38, 0));
  b.pop();
}

function crumpled(rng: SeededRandom): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.035, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rng.range(0.7, 1.2), p.getY(i) * rng.range(0.6, 1.1), p.getZ(i) * rng.range(0.7, 1.2));
  return g.toNonIndexed();
}

function drapedCloth(w: number, d: number, drop: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d, 20, 20);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const over = Math.max(0, Math.abs(y) - 0.12);
    const z = -over * drop * 3 + 0.01 * Math.sin(x * 30) * (over > 0 ? 1 : 0.2);
    p.setXYZ(i, x, Math.sign(y) * Math.min(Math.abs(y), 0.12 + over * 0.3), z);
  }
  g.rotateX(-PI / 2);
  g.computeVertexNormals();
  return g;
}

function scarfGeometry(): THREE.BufferGeometry {
  const pts = [new THREE.Vector3(-0.25, -0.5, 0.05), new THREE.Vector3(-0.2, -0.1, 0.04), new THREE.Vector3(-0.1, 0.05, 0.0), new THREE.Vector3(0.1, 0.05, 0.0), new THREE.Vector3(0.22, -0.15, 0.04), new THREE.Vector3(0.26, -0.45, 0.06)];
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, 40, 0.06, 6, false);
  g.scale(1, 1, 0.25);
  return g;
}

// =========================================================================== feature pieces

function globeStand(b: B, m: RoomMats, group: THREE.Group, x: number, z: number): THREE.Object3D {
  for (let k = 0; k < 3; k++) {
    const a = k * PI * 2 / 3;
    b.add(m.walnut, tube([new THREE.Vector3(0, 0.55, 0), new THREE.Vector3(Math.sin(a) * 0.2, 0.3, Math.cos(a) * 0.2), new THREE.Vector3(Math.sin(a) * 0.32, 0.0, Math.cos(a) * 0.32)], 0.025, 16, 6), tf(x, 0, z));
  }
  b.add(m.walnut, lathe([[0.001, 0.55], [0.1, 0.55], [0.08, 0.62], [0.04, 0.68], [0.001, 0.68]], 16, WS.walnut), tf(x, 0, z));
  b.add(m.brass, new THREE.TorusGeometry(0.4, 0.012, 8, 64).rotateX(PI / 2), tf(x, 1.08, z));
  for (let k = 0; k < 4; k++) b.add(m.walnut, cyl(0.012, 0.012, 0.42, 6, WS.walnut), tf(x + Math.sin(k * PI / 2) * 0.38, 0.87, z + Math.cos(k * PI / 2) * 0.38));
  const pivot = new THREE.Group();
  pivot.name = 'globe';
  pivot.userData.keep = true;
  pivot.userData.state = { spin: 0 };
  pivot.position.set(x, 1.08, z);
  pivot.rotation.z = 0.41;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.34, 48, 32), new THREE.MeshPhysicalMaterial({ map: paintGlobe(), roughness: 0.35, clearcoat: 0.6, name: 'globe' }));
  sphere.castShadow = true;
  const mer = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.01, 8, 64), m.brass);
  pivot.add(sphere, mer);
  pivot.userData.sphere = sphere;
  group.add(pivot);
  return pivot;
}

function paintGlobe(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d')!;
  const rng = new SeededRandom('globe');
  g.fillStyle = '#2a4a6a'; g.fillRect(0, 0, 1024, 512);
  for (let k = 0; k < 9; k++) {
    const cx = rng.range(0, 1024), cy = rng.range(100, 420);
    g.fillStyle = '#c9b07a';
    g.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * PI * 2, r = rng.range(40, 110);
      const px = cx + Math.cos(a) * r * 1.4, py = cy + Math.sin(a) * r * 0.8;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.fill();
  }
  g.strokeStyle = 'rgba(40,25,10,0.35)'; g.lineWidth = 1.5;
  for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(i * 1024 / 12, 0); g.lineTo(i * 1024 / 12, 512); g.stroke(); }
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, i * 512 / 6); g.lineTo(1024, i * 512 / 6); g.stroke(); }
  g.fillStyle = 'rgba(160,110,40,0.18)'; g.fillRect(0, 0, 1024, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function telescope(b: B, m: RoomMats, group: THREE.Group, x: number, z: number): { tele: THREE.Object3D; eye: THREE.Vector3 } {
  for (let k = 0; k < 3; k++) {
    const a = k * PI * 2 / 3;
    b.add(m.walnut, cyl(0.018, 0.022, 1.3, 8, WS.walnut), tf(x + Math.sin(a) * 0.25, 0.62, z + Math.cos(a) * 0.25, a, -0.2));
  }
  b.add(m.brass, cyl(0.05, 0.06, 0.08, 14, WS.brass), tf(x, 1.24, z));
  const g = new THREE.Group();
  g.name = 'telescope';
  g.userData.keep = true;
  const tb = new Batch();
  tb.add(m.brass, lathe([[0.03, -0.45], [0.035, -0.4], [0.04, -0.1], [0.05, 0.0], [0.055, 0.5], [0.065, 0.55], [0.065, 0.62], [0.05, 0.62]], 20, WS.brass).rotateX(PI / 2));
  tb.add(m.walnut, cyl(0.058, 0.058, 0.3, 20, WS.walnut).rotateX(PI / 2), tf(0, 0, 0.25));
  tb.add(m.black, new THREE.CircleGeometry(0.05, 16), tf(0, 0, 0.621), false);
  for (const zz of [-0.1, 0.4]) tb.add(m.brass, new THREE.TorusGeometry(0.057, 0.008, 6, 20), tf(0, 0, zz));
  g.add(tb.build('telescope'));
  g.position.set(x, 1.32, z);
  // aim at the moon through the north-west windows
  g.lookAt(new THREE.Vector3(x - 0.68, 1.32 + 0.5, z - 0.54));
  group.add(g);
  const eye = new THREE.Vector3(0, 0.0, -0.6).applyMatrix4(g.matrixWorld.compose(g.position, g.quaternion, g.scale));
  return { tele: g, eye };
}

function harpStand(b: B, m: RoomMats, group: THREE.Group, x: number, z: number): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'harp';
  b.push(tf(x, 0, z, -0.5));
  b.add(m.walnut, cbox(0.3, 0.08, 0.45, 0.02, WS.walnut), tf(0, 0.04, 0));
  // soundbox (slanted), neck (curved) and pillar
  b.add(m.walnut, lathe([[0.05, 0], [0.1, 0.3], [0.14, 0.9], [0.15, 1.1], [0.001, 1.12]], 12, WS.walnut, PI / 2, PI), tf(0, 0.08, -0.12, 0, 0.32));
  const neck = [new THREE.Vector3(0, 1.45, 0.0), new THREE.Vector3(0, 1.5, 0.2), new THREE.Vector3(0, 1.38, 0.4), new THREE.Vector3(0, 1.42, 0.55)];
  b.add(m.walnut, tube(neck, 0.04, 24, 8));
  b.add(m.walnut, lathe([[0.03, 0], [0.04, 0.1], [0.025, 0.4], [0.03, 0.7], [0.025, 1.1], [0.04, 1.3]], 10, WS.walnut), tf(0, 0.08, 0.5, 0, -0.05));
  b.add(m.bronze, extrude(eagleShape(0.07), 0.015, 0.003, WS.bronze, 3), tf(0, 1.5, 0.6, PI / 2));
  for (let k = 0; k < 14; k++) {
    const t = k / 13;
    const top = new THREE.Vector3(0, 1.42 + 0.05 * Math.sin(t * PI) - 0.1 * t, 0.08 + t * 0.4);
    const bot = new THREE.Vector3(0, 0.2 + t * 0.85, -0.1 + t * 0.32);
    const len = top.distanceTo(bot);
    const mid = top.clone().add(bot).multiplyScalar(0.5);
    const ang = Math.atan2(top.z - bot.z, top.y - bot.y);
    b.add(m.brass, cyl(0.0015, 0.0015, len, 3, 0.2), tf(mid.x, mid.y, mid.z, 0, ang), false);
  }
  b.pop();
  group.add(g);
  g.position.set(x, 1, z);
  return g;
}

function orreryPiece(b: B, m: RoomMats, group: THREE.Group, animators: Props['animators'], state: { speed: number; target: number }): THREE.Object3D {
  // marble pedestal table
  b.add(m.marble, lathe([[0.001, 0], [0.5, 0], [0.5, 0.06], [0.44, 0.1], [0.3, 0.14], [0.16, 0.2], [0.13, 0.4], [0.16, 0.6], [0.12, 0.75], [0.2, 0.8], [0.001, 0.8]], 32, WS.marble));
  b.add(m.marble, lathe([[0.001, 0.8], [0.6, 0.8], [0.62, 0.82], [0.62, 0.86], [0.58, 0.88], [0.001, 0.88]], 48, WS.marble));
  b.add(m.bronze, new THREE.TorusGeometry(0.6, 0.012, 6, 64).rotateX(PI / 2), tf(0, 0.85, 0));
  const g = new THREE.Group();
  g.name = 'orrery';
  g.userData.keep = true;
  g.position.y = 0.88;
  const ob = new Batch();
  ob.add(m.bronze, lathe([[0.001, 0], [0.2, 0], [0.2, 0.03], [0.1, 0.06], [0.03, 0.12], [0.02, 0.5], [0.04, 0.52], [0.001, 0.52]], 24, WS.bronze));
  // armillary rings
  ob.add(m.bronze, new THREE.TorusGeometry(0.48, 0.008, 6, 96).rotateX(PI / 2), tf(0, 0.55, 0));
  ob.add(m.bronze, new THREE.TorusGeometry(0.48, 0.006, 6, 96), tf(0, 0.55, 0, 0, 0, 0.41));
  ob.add(m.bronze, new THREE.TorusGeometry(0.48, 0.006, 6, 96), tf(0, 0.55, 0, PI / 2));
  for (let k = 0; k < 4; k++) ob.add(m.bronze, tube([new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(Math.sin(k * PI / 2) * 0.3, 0.12, Math.cos(k * PI / 2) * 0.3), new THREE.Vector3(Math.sin(k * PI / 2) * 0.48, 0.55, Math.cos(k * PI / 2) * 0.48)], 0.006, 16, 4));
  g.add(ob.build('orrery-frame'));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: new THREE.Color(1.0, 0.6, 0.2), emissiveIntensity: 2.2, name: 'orrery-sun' }));
  sun.position.y = 0.55;
  g.add(sun);
  const planets: { arm: THREE.Object3D; speed: number }[] = [];
  const pc = [0xb0a090, 0xd9b07a, 0x3a6aa8, 0xb05a3a, 0xd0a060, 0xc8b88a, 0x7aa8c8];
  for (let k = 0; k < 7; k++) {
    const arm = new THREE.Group();
    arm.position.y = 0.55 - 0.02 * k;
    const r = 0.13 + k * 0.05;
    const rod = new THREE.Mesh(cyl(0.003, 0.003, r, 4, 0.2).rotateZ(PI / 2).translate(r / 2, 0, 0), m.brass);
    const pr = 0.012 + (k === 4 ? 0.02 : k === 5 ? 0.016 : 0.006 * (k % 3));
    const pl = new THREE.Mesh(new THREE.SphereGeometry(pr, 16, 12), new THREE.MeshStandardMaterial({ color: pc[k], roughness: 0.4, metalness: 0.3, name: 'planet' }));
    pl.position.x = r;
    const drop = new THREE.Mesh(cyl(0.002, 0.002, 0.03, 4, 0.2), m.brass);
    drop.position.set(r, 0.015, 0);
    arm.add(rod, pl, drop);
    if (k === 5) { const ring = new THREE.Mesh(new THREE.TorusGeometry(pr * 1.8, pr * 0.25, 4, 24).rotateX(PI / 2 - 0.4), m.brass); ring.position.x = r; arm.add(ring); }
    arm.rotation.y = k * 1.7;
    g.add(arm);
    planets.push({ arm, speed: 0.6 / Math.pow(1 + k, 1.2) });
  }
  group.add(g);
  animators.push((dt) => {
    state.speed += (state.target - state.speed) * Math.min(1, dt * 1.5);
    for (const p of planets) p.arm.rotation.y += p.speed * dt * state.speed;
  });
  return g;
}

function lecternStand(b: B, m: RoomMats, group: THREE.Group, x: number, z: number): THREE.Object3D {
  b.push(tf(x, 0, z, PI));
  b.add(m.walnut, lathe([[0.001, 0], [0.3, 0], [0.3, 0.05], [0.2, 0.08], [0.08, 0.14], [0.06, 0.6], [0.09, 0.9], [0.06, 1.0], [0.1, 1.04]], 16, WS.walnut));
  b.add(m.walnut, cbox(0.55, 0.04, 0.42, 0.01, WS.walnut), tf(0, 1.12, 0, 0, 0.35));
  b.add(m.walnut, cbox(0.55, 0.04, 0.03, 0.01, WS.walnut), tf(0, 1.06, -0.2, 0, 0.35));
  b.add(m.bronze, extrude(eagleShape(0.12), 0.02, 0.004, WS.bronze, 3), tf(0, 0.98, 0.14, PI, -0.2));
  b.push(tf(0, 1.15, 0, 0, 0.35));
  const w = 0.23, d = 0.32;
  for (const s of [-1, 1]) {
    b.add(m.velvetDark, cbox(w, 0.01, d, 0.002, 0.3), tf(s * w / 2, 0.005, 0, 0, 0, s * -0.06));
    b.add(m.bookPages, cbox(w - 0.012, 0.03, d - 0.016, 0.004, 0.3), tf(s * (w / 2 - 0.004), 0.024, 0, 0, 0, s * -0.07));
  }
  const pg = new THREE.PlaneGeometry(2 * w - 0.02, d - 0.02, 16, 1);
  const p = pg.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i); p.setZ(i, 0.014 * Math.sin(Math.abs(px) / w * PI) - 0.008 * (1 - Math.abs(px) / w)); }
  pg.computeVertexNormals();
  b.add(m.pages, pg.rotateX(-PI / 2).rotateY(PI), tf(0, 0.042, 0), false);
  b.pop();
  b.pop();
  const anchor = new THREE.Object3D();
  anchor.position.set(x, 1.2, z);
  group.add(anchor);
  return anchor;
}

/**
 * The founder's statue: an original, stylised robed scholar in white marble
 * holding an open book, wearing a fine diadem. Built from lathed drapery with
 * displaced folds so it reads as carved stone under the niche spotlight.
 */
function statueFigure(m: RoomMats, group: THREE.Group): { statue: THREE.Object3D; diadem: THREE.Mesh } {
  const root = new THREE.Group();
  root.name = 'statue';
  const b = new Batch();
  const mat = m.statue;
  // octagonal plinth with mouldings and a bronze inscription plate
  b.add(m.marble, lathe([[0.62, 0], [0.62, 0.12], [0.56, 0.16], [0.54, 0.22], [0.48, 0.26], [0.46, 0.85], [0.52, 0.88], [0.56, 0.94], [0.56, 1.0], [0.001, 1.0]], 8, WS.marble, PI / 8));
  b.add(m.bronze, cbox(0.5, 0.2, 0.02, 0.005, WS.bronze), tf(0, 0.6, -0.46));
  const S = 1.22, base = 1.0;
  b.push(tf(0, base, 0, 0, 0, 0, S));
  // robe: lathed skirt with deep vertical folds that soften toward the waist
  const robe = new THREE.LatheGeometry([
    [0.31, 0], [0.33, 0.02], [0.3, 0.12], [0.27, 0.35], [0.23, 0.65], [0.19, 0.9], [0.15, 1.02], [0.16, 1.1],
    [0.18, 1.2], [0.19, 1.3], [0.185, 1.38], [0.15, 1.44], [0.08, 1.48], [0.05, 1.5],
  ].map(([r, y]) => new THREE.Vector2(r, y)), 64);
  foldDisplace(robe, (y) => (y < 1.02 ? 0.09 * (1 - y / 1.02) + 0.015 : 0.01), 11);
  robe.scale(1, 1, 0.8);
  b.add(mat, robe);
  // shoulder line: widen with a flattened ellipsoid
  b.add(mat, new THREE.SphereGeometry(0.2, 32, 16).scale(1.15, 0.45, 0.7), tf(0, 1.4, 0));
  // cloak falling from the shoulders behind
  const cloak = new THREE.LatheGeometry([[0.22, 1.42], [0.25, 1.3], [0.28, 1.0], [0.33, 0.5], [0.38, 0.04], [0.37, 0.0]].map(([r, y]) => new THREE.Vector2(r, y)), 48, PI * 0.6, PI * 0.8);
  foldDisplace(cloak, (y) => 0.05 * (1 - y / 1.4) + 0.01, 7);
  cloak.scale(1, 1, 0.82);
  b.add(mat, cloak);
  // neck and head
  b.add(mat, cyl(0.045, 0.05, 0.1, 16, 1), tf(0, 1.53, 0));
  b.add(mat, new THREE.SphereGeometry(0.1, 32, 24).scale(0.86, 1.12, 0.98), tf(0, 1.65, -0.005));
  b.add(mat, new THREE.SphereGeometry(0.03, 12, 8).scale(1, 0.9, 1.2), tf(0, 1.585, -0.07)); // chin
  b.add(mat, new THREE.ConeGeometry(0.014, 0.04, 8).rotateX(-PI / 2 - 0.2), tf(0, 1.65, -0.1)); // nose
  // hair: crown, and a long fall down the back
  b.add(mat, new THREE.SphereGeometry(0.106, 32, 20, 0, PI * 2, 0, PI * 0.62).scale(0.92, 1.12, 1.03), tf(0, 1.665, 0.012));
  const hair = new THREE.LatheGeometry([[0.1, 1.66], [0.11, 1.55], [0.13, 1.4], [0.15, 1.2], [0.12, 1.12], [0.06, 1.1]].map(([r, y]) => new THREE.Vector2(r, y)), 32, PI * 0.65, PI * 0.7);
  foldDisplace(hair, () => 0.02, 14);
  b.add(mat, hair, tf(0, 0, 0.02));
  // arms in wide sleeves, hands holding an open book
  for (const s of [-1, 1]) {
    b.add(mat, limb(new THREE.Vector3(s * 0.19, 1.38, 0.0), new THREE.Vector3(s * 0.21, 1.12, -0.05), 0.05));
    b.add(mat, limb(new THREE.Vector3(s * 0.21, 1.12, -0.05), new THREE.Vector3(s * 0.08, 1.08, -0.2), 0.04));
    const sleeve = new THREE.LatheGeometry([[0.05, 0.0], [0.07, 0.08], [0.1, 0.18], [0.12, 0.22], [0.11, 0.23]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
    foldDisplace(sleeve, () => 0.015, 6);
    const dir = new THREE.Vector3(s * 0.08 - s * 0.21, 1.08 - 1.12, -0.2 + 0.05).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.add(mat, sleeve, new THREE.Matrix4().compose(new THREE.Vector3(s * 0.2, 1.11, -0.07), q, new THREE.Vector3(1, 1, 1)));
    b.add(mat, new THREE.SphereGeometry(0.03, 12, 10).scale(1, 0.7, 1.3), tf(s * 0.07, 1.07, -0.22));
  }
  b.push(tf(0, 1.08, -0.25, 0, -0.9));
  for (const s of [-1, 1]) {
    b.add(mat, cbox(0.12, 0.012, 0.17, 0.003, 0.3), tf(s * 0.06, 0, 0, 0, 0, s * -0.12));
    b.add(mat, cbox(0.11, 0.02, 0.16, 0.004, 0.3), tf(s * 0.058, 0.014, 0, 0, 0, s * -0.12));
  }
  b.pop();
  b.pop();
  root.add(b.build('statue'));
  // diadem (separate so it can glow)
  const dg = new Batch();
  dg.add(mat, new THREE.TorusGeometry(0.098, 0.007, 8, 48).rotateX(PI / 2));
  for (let k = -3; k <= 3; k++) {
    const a = k * 0.3;
    const h = k === 0 ? 0.06 : 0.03 - Math.abs(k) * 0.004;
    dg.add(mat, new THREE.ConeGeometry(0.008, h, 6), tf(Math.sin(a) * 0.098, h / 2, -Math.cos(a) * 0.098));
  }
  for (const s of [-1, 1]) {
    const wing = new THREE.Shape();
    wing.moveTo(0, 0); wing.quadraticCurveTo(0.03, 0.05, 0.07, 0.06); wing.lineTo(0.05, 0.035); wing.lineTo(0.06, 0.025); wing.lineTo(0.035, 0.012); wing.closePath();
    dg.add(mat, extrude(wing, 0.004, 0.001, 0.1, 4).scale(s, 1, 1), tf(s * 0.03, 0.005, -0.1));
  }
  const diadem = dg.build('diadem').children[0] as THREE.Mesh;
  const dMat = new THREE.MeshPhysicalMaterial({ color: 0xf1efe9, roughness: 0.3, metalness: 0.1, emissive: new THREE.Color(0.4, 0.6, 1.0), emissiveIntensity: 0, name: 'diadem', clearcoat: 1 });
  diadem.material = dMat;
  diadem.position.set(0, base + 1.705 * S, -0.0);
  diadem.scale.setScalar(S);
  diadem.rotation.x = -0.12;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.012, 1).scale(1, 1.4, 0.6), m.sapphire);
  gem.position.set(0, 0.025, -0.1);
  diadem.add(gem);
  root.add(diadem);
  root.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; mm.receiveShadow = true; } });
  // bay frame −z faces the room, as does the figure's front
  root.applyMatrix4(new THREE.Matrix4().multiplyMatrices(bayMatrix(6), tf(0, 0.2, 0.32)));
  group.add(root);
  return { statue: root, diadem };
}

function limb(a: THREE.Vector3, c: THREE.Vector3, r: number): THREE.BufferGeometry {
  const len = a.distanceTo(c);
  const g = new THREE.CapsuleGeometry(r, len, 6, 12);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Radial fold displacement for lathed drapery: r *= 1 + amp(y)·folds(φ). */
function foldDisplace(g: THREE.BufferGeometry, amp: (y: number) => number, folds: number): void {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const phi = Math.atan2(x, z);
    const f = Math.sin(phi * folds) * 0.7 + Math.sin(phi * folds * 2.3 + 1.3) * 0.3;
    const k = 1 + amp(y) * f;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
}

function chandelierPiece(m: RoomMats, group: THREE.Group, candles: Candle[], animators: Props['animators']): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'chandelier';
  g.userData.keep = true;
  const b = new Batch();
  const topY = 13.0, hangY = 7.6;
  // chain of alternating links
  const links = Math.floor((topY - hangY - 0.6) / 0.09);
  for (let k = 0; k < links; k++) b.add(m.bronze, new THREE.TorusGeometry(0.035, 0.009, 6, 12).scale(1, 1.5, 1), tf(0, hangY + 0.6 + k * 0.09, 0, k % 2 ? PI / 2 : 0));
  // central column and finial
  b.add(m.bronze, lathe([[0.001, -0.6], [0.04, -0.55], [0.08, -0.4], [0.06, -0.3], [0.1, -0.1], [0.14, 0], [0.08, 0.12], [0.05, 0.3], [0.08, 0.45], [0.04, 0.6], [0.001, 0.62]], 20, WS.bronze), tf(0, hangY, 0));
  // three tiers of rings with S-scroll arms and candle cups
  const tiers = [{ r: 1.25, y: -0.1, n: 16 }, { r: 0.85, y: 0.25, n: 12 }, { r: 0.5, y: 0.52, n: 8 }];
  for (const t of tiers) {
    b.add(m.bronze, new THREE.TorusGeometry(t.r, 0.022, 8, 96).rotateX(PI / 2), tf(0, hangY + t.y, 0));
    b.add(m.bronze, new THREE.TorusGeometry(t.r * 0.94, 0.01, 6, 96).rotateX(PI / 2), tf(0, hangY + t.y - 0.06, 0));
    for (let k = 0; k < t.n; k++) {
      const a = (k / t.n) * PI * 2;
      const ca = Math.sin(a), cz = Math.cos(a);
      if (k % 2 === 0) b.add(m.bronze, tube([new THREE.Vector3(ca * 0.1, t.y - 0.1, cz * 0.1), new THREE.Vector3(ca * t.r * 0.5, t.y - 0.3, cz * t.r * 0.5), new THREE.Vector3(ca * t.r, t.y - 0.02, cz * t.r)], 0.012, 16, 5), tf(0, hangY, 0));
      b.add(m.bronze, lathe([[0.001, 0], [0.02, 0.0], [0.035, 0.03], [0.032, 0.04], [0.001, 0.035]], 10, WS.bronze), tf(ca * t.r, hangY + t.y + 0.02, cz * t.r));
      b.add(m.bronze, new THREE.SphereGeometry(0.018, 8, 6), tf(ca * t.r, hangY + t.y - 0.03, cz * t.r));
      candles.push({ pos: new THREE.Vector3(ca * t.r, hangY + t.y + 0.055, cz * t.r), h: 0.14 + 0.03 * Math.sin(k * 2.3), r: 0.014 });
    }
  }
  // pendant crystal drops (blue glass)
  const drop = new THREE.OctahedronGeometry(0.03, 0).scale(1, 2, 1);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * PI * 2 + 0.1;
    b.add(m.sapphire, drop, tf(Math.sin(a) * 1.25, hangY - 0.2, Math.cos(a) * 1.25), false);
  }
  b.add(m.bronze, extrude(eagleShape(0.18), 0.015, 0.004, WS.bronze, 3), tf(0, hangY - 0.82, 0.0));
  b.add(m.bronze, extrude(eagleShape(0.18), 0.015, 0.004, WS.bronze, 3), tf(0, hangY - 0.82, 0.0, PI / 2));
  g.add(b.build('chandelier'));
  group.add(g);
  void animators;
  return g;
}
