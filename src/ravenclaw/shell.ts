/**
 * The tower room's architectural shell: twelve ashlar bays with deep
 * pointed-arch openings (windows with stone tracery, leaded glass, seats and
 * silk drapes; the entrance door; the statue niche), clustered marble
 * colonnettes, a moulded cornice with bronze stars, the painted star dome
 * with ribs and oculus, the entrance passage and spiral stair, and the night
 * landscape seen through the glass.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import {
  Batch, tf, lathe, cyl, cbox, softBox, archPoints, archApex, archRing, toPath, extrude, tube, canvas, canvasTexture,
} from './util';
import { extrudeProfile } from '../architecture/kit/geometry';
import {
  BAYS, BAY_W, R, RV, WALL_T, WALL_H, DOME, WIN, DOOR, NICHE, DORM_DOOR, PASSAGE, STAIRWELL, MOON_DIR, COS15,
  bayAngle, bayMatrix, N_BAYS,
} from './layout';
import type { RoomMats } from './materials';
import { WS } from './materials';
import { paintDome, type DomeTextures } from './textures';
import type { Circle, Rect } from './util';

export interface ShelfSpec { matrix: THREE.Matrix4; width: number; height: number; depth: number }

export interface Shell {
  group: THREE.Group;
  door: DoorLeaf;
  /** Dormitory doors in bays 2 and 10, keyed by bay. */
  wingDoors: Map<number, DoorLeaf>;
  dome: { material: THREE.MeshStandardMaterial; uniforms: DomeUniforms; textures: DomeTextures };
  sky: THREE.Mesh;
  shelves: ShelfSpec[];
  colliders: { circles: Circle[]; rects: Rect[] };
  seats: { bay: number; pos: THREE.Vector3; look: THREE.Vector3 }[];
  torch: THREE.Vector3;
  lantern: THREE.Vector3;
}

export interface DoorLeaf { pivot: THREE.Object3D; knocker: THREE.Object3D | null; angle: number; target: number; base: number }

export interface DomeUniforms {
  uTime: { value: number };
  uLit: { value: number[] };
  uAwake: { value: number };
  tStars: { value: THREE.Texture };
  tLines: { value: THREE.Texture };
}

const PI = Math.PI;

export function buildShell(m: RoomMats, hi: boolean, slate: THREE.Material): Shell {
  const group = new THREE.Group();
  group.name = 'shell';
  const b = new Batch();
  const rng = new SeededRandom('shell');
  const shelves: ShelfSpec[] = [];
  const circles: Circle[] = [];
  const rects: Rect[] = [];
  const seats: Shell['seats'] = [];

  // ---------------------------------------------------------------- floor
  const floorGeo = new THREE.CircleGeometry(RV + 0.3, N_BAYS, PI / 12 + PI / 2).rotateX(-PI / 2);
  const fp = floorGeo.getAttribute('position'), fuv = floorGeo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) / WS.parquet, -fp.getZ(i) / WS.parquet);
  const floor = new THREE.Mesh(floorGeo, m.floor);
  floor.receiveShadow = true;
  floor.name = 'floor';
  group.add(floor);

  // ---------------------------------------------------------------- bays
  const hw = BAY_W / 2 + 0.3;
  for (let i = 0; i < N_BAYS; i++) {
    const kind = BAYS[i];
    b.push(bayMatrix(i));
    const shape = new THREE.Shape();
    shape.moveTo(-hw, -0.05); shape.lineTo(hw, -0.05); shape.lineTo(hw, WALL_H + 0.4); shape.lineTo(-hw, WALL_H + 0.4); shape.closePath();
    if (kind === 'window') shape.holes.push(toPath(archPoints(WIN.w, WIN.y0, WIN.ys, WIN.sharp)));
    if (kind === 'door') shape.holes.push(toPath(archPoints(DOOR.w, 0, DOOR.ys, DOOR.sharp)));
    if (kind === 'statue') shape.holes.push(toPath(archPoints(NICHE.w, 0, NICHE.ys, NICHE.sharp)));
    if (kind === 'dorm') shape.holes.push(toPath(archPoints(DORM_DOOR.w, 0, DORM_DOOR.ys, DORM_DOOR.sharp)));
    b.add(m.ashlar, extrude(shape, WALL_T, 0, WS.ashlar));

    // skirting plinth course (gaps for door and niche)
    const prof: [number, number][] = [[0, 0], [0.12, 0], [0.12, 0.2], [0.09, 0.24], [0.06, 0.3], [0.03, 0.32], [0, 0.34]];
    const runs: [number, number][] = kind === 'door' ? [[-hw, -DOOR.w / 2 - 0.1], [DOOR.w / 2 + 0.1, hw]]
      : kind === 'statue' ? [[-hw, -NICHE.w / 2 - 0.1], [NICHE.w / 2 + 0.1, hw]]
      : kind === 'dorm' ? [[-hw, -DORM_DOOR.w / 2 - 0.1], [DORM_DOOR.w / 2 + 0.1, hw]]
      : kind === 'window' ? [] : [[-hw, hw]];
    for (const [x0, x1] of runs) {
      const g = extrudeProfile(prof, x1 - x0, WS.ashlar);
      b.add(m.ashlarDark, g, tf(x1, 0, 0, PI));
    }

    if (kind === 'window') buildWindow(b, m, rng, shelves, i);
    if (kind === 'door') buildDoorSurround(b, m, DOOR, true);
    if (kind === 'dorm') buildDoorSurround(b, m, DORM_DOOR, false);
    if (kind === 'statue') buildNiche(b, m, group, i);

    // dado moulding (chair rail) on solid bays
    if (kind === 'bookcase' || kind === 'fireplace' || kind === 'dorm') {
      const rail: [number, number][] = [[0, 0], [0.04, 0.01], [0.05, 0.04], [0.03, 0.07], [0, 0.08]];
      b.add(m.ashlarDark, extrudeProfile(rail, 2 * hw, WS.ashlar), tf(hw, 0.95, 0, PI));
    }
    b.pop();

    // Collision against window seats / cabinets
    const a = bayAngle(i);
    if (kind === 'window') {
      const c = new THREE.Vector3(0, 0, -0.32).applyMatrix4(bayMatrix(i));
      rects.push({ x: c.x, z: c.z, hw: 1.25, hd: 0.3, rot: a });
      const sp = new THREE.Vector3(0, 0.95, -0.15).applyMatrix4(bayMatrix(i));
      const look = new THREE.Vector3(0, 1.3, 3).applyMatrix4(bayMatrix(i));
      seats.push({ bay: i, pos: sp, look });
    }
  }

  // ---------------------------------------------------------------- door, passage and stair
  const door = buildDoor(m, group, DOOR, new THREE.Matrix4().makeTranslation(-DOOR.w / 2 + 0.015, 0, R + 0.42), 0, true);
  const wingDoors = new Map<number, DoorLeaf>();
  for (let i = 0; i < N_BAYS; i++) if (BAYS[i] === 'dorm') {
    wingDoors.set(i, buildDoor(m, group, DORM_DOOR, bayMatrix(i).multiply(new THREE.Matrix4().makeTranslation(-DORM_DOOR.w / 2 + 0.015, 0, 0.42)), bayAngle(i), false));
  }
  const torch = buildPassage(b, m, rng);

  // ---------------------------------------------------------------- columns
  for (let k = 0; k < N_BAYS; k++) {
    const a = (k + 0.5) * (PI / 6);
    const rr = RV - 0.16;
    b.push(tf(Math.sin(a) * rr, 0, Math.cos(a) * rr, a));
    b.add(m.marble, lathe([[0.34, 0], [0.34, 0.12], [0.3, 0.15], [0.3, 0.24], [0.26, 0.28], [0.24, 0.34], [0.2, 0.38], [0.17, 0.4]], 16, WS.marble));
    b.add(m.marble, cyl(0.15, 0.15, 5.4, 20, WS.marble), tf(0, 0.4 + 2.7, 0));
    for (const s of [-1, 1]) {
      b.add(m.marble, cyl(0.075, 0.075, 5.5, 12, WS.marble), tf(s * 0.22, 0.3 + 2.75, 0.06));
      b.add(m.bronze, new THREE.TorusGeometry(0.08, 0.018, 6, 16).rotateX(PI / 2), tf(s * 0.22, 3.0, 0.06));
      b.add(m.bronze, lathe([[0.075, 0], [0.1, 0.05], [0.14, 0.18], [0.16, 0.22], [0.16, 0.26]], 12, WS.bronze), tf(s * 0.22, 5.8, 0.06));
    }
    b.add(m.bronze, new THREE.TorusGeometry(0.16, 0.03, 8, 24).rotateX(PI / 2), tf(0, 3.0, 0));
    b.add(m.bronze, new THREE.TorusGeometry(0.16, 0.02, 8, 24).rotateX(PI / 2), tf(0, 5.78, 0));
    b.add(m.marble, lathe([[0.15, 0], [0.17, 0.04], [0.2, 0.14], [0.27, 0.28], [0.32, 0.36], [0.34, 0.4], [0.34, 0.44]], 16, WS.marble), tf(0, 5.8, 0));
    b.add(m.ashlar, cbox(0.9, 0.1, 0.62, 0.02, WS.ashlar), tf(0, 6.29, 0.1));
    b.pop();
    circles.push({ x: Math.sin(a) * rr, z: Math.cos(a) * rr, r: 0.42 });
  }

  // ---------------------------------------------------------------- cornice + frieze stars
  const ap = (r: number) => r / COS15;
  const corniceProfile: [number, number][] = [
    [8.0, 6.1], [7.94, 6.14], [7.94, 6.26], [7.87, 6.3], [7.82, 6.4], [7.78, 6.44], [7.78, 6.72], [7.72, 6.76],
    [7.62, 6.84], [7.52, 6.9], [7.46, 6.96], [7.46, 7.02], [8.1, 7.02],
  ];
  b.add(m.marble, lathe(corniceProfile.map(([r, y]) => [ap(r), y] as [number, number]), N_BAYS, WS.marble, PI / 12));
  const starShape = new THREE.Shape();
  for (let k = 0; k < 16; k++) {
    const aa = (k / 16) * PI * 2, r = k % 2 ? 0.035 : 0.09;
    const x = Math.sin(aa) * r, y = Math.cos(aa) * r;
    k ? starShape.lineTo(x, y) : starShape.moveTo(x, y);
  }
  const starGeo = extrude(starShape, 0.02, 0.005, WS.bronze, 2);
  for (let i = 0; i < N_BAYS; i++) {
    b.push(bayMatrix(i));
    for (let s = 0; s < 4; s++) b.add(m.bronze, starGeo, tf((s - 1.5) * 1.02, 6.58, -0.24, PI));
    b.pop();
  }

  // ---------------------------------------------------------------- dome
  const domeTex = paintDome({ rx: DOME.rx, ry: DOME.ry, aMax: DOME.aMax }, hi);
  const pts: THREE.Vector2[] = [];
  const NS = 48;
  for (let s = 0; s <= NS; s++) {
    const a = (s / NS) * DOME.aMax;
    pts.push(new THREE.Vector2(DOME.rx * Math.cos(a), DOME.y0 + DOME.ry * Math.sin(a)));
  }
  const domeGeo = new THREE.LatheGeometry(pts, 128);
  const uniforms: DomeUniforms = {
    uTime: { value: 0 }, uLit: { value: [0, 0, 0, 0, 0, 0, 0] }, uAwake: { value: 0 },
    tStars: { value: domeTex.stars }, tLines: { value: domeTex.lines },
  };
  const domeMat = new THREE.MeshStandardMaterial({
    name: 'dome', map: domeTex.map, roughness: 0.82, metalness: 0, side: THREE.BackSide,
    emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1,
  });
  domeMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uLit[7]; uniform float uAwake;
        uniform sampler2D tStars; uniform sampler2D tLines;
        float dh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `
        {
          vec2 suv = vMapUv;
          float st = texture2D(tStars, suv).r;
          vec2 cell = floor(suv * vec2(700.0, 180.0));
          float ph = dh(cell) * 6.2831;
          float tw = 0.55 + 0.45 * sin(uTime * (1.2 + dh(cell + 3.1) * 2.5) + ph);
          float k = floor(fract(suv.x) * 7.0);
          float lit = 0.0;
          for (int i = 0; i < 7; i++) { if (float(i) == k) lit = uLit[i]; }
          float ln = texture2D(tLines, suv).r;
          vec3 goldE = vec3(1.0, 0.78, 0.45) * st * tw * (0.55 + 1.6 * uAwake);
          vec3 lineE = vec3(0.55, 0.75, 1.0) * ln * lit * (1.8 + 0.6 * sin(uTime * 2.0 + k));
          totalEmissiveRadiance = goldE + lineE;
        }`);
  };
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.name = 'dome';
  dome.castShadow = true;
  dome.receiveShadow = false;
  group.add(dome);

  // ribs following the dome surface, from cornice to oculus
  for (let k = 0; k < N_BAYS; k++) {
    const phi = (k + 0.5) * (PI / 6);
    const rp: THREE.Vector3[] = [];
    for (let s = 0; s <= 16; s++) {
      const a = (s / 16) * DOME.aMax;
      const r = DOME.rx * Math.cos(a) - 0.08, y = DOME.y0 + DOME.ry * Math.sin(a) - 0.05 * Math.sin(a);
      rp.push(new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r));
    }
    b.add(m.marble, tube(rp, 0.13, 48, 8));
    const rp2 = rp.map((p) => { const q = p.clone(); const rr = Math.hypot(q.x, q.z); q.x *= (rr - 0.12) / rr; q.z *= (rr - 0.12) / rr; q.y -= 0.03; return q; });
    b.add(m.bronze, tube(rp2, 0.045, 48, 6));
  }
  // oculus ring + lantern
  const topR = DOME.rx * Math.cos(DOME.aMax), topY = DOME.y0 + DOME.ry * Math.sin(DOME.aMax);
  b.add(m.bronze, new THREE.TorusGeometry(topR + 0.05, 0.16, 12, 48).rotateX(PI / 2), tf(0, topY - 0.02, 0));
  const lantern = new THREE.Mesh(new THREE.CircleGeometry(topR, 32).rotateX(PI / 2), new THREE.MeshBasicMaterial({ map: paintRose(), color: new THREE.Color(1.6, 1.6, 1.6) }));
  lantern.position.y = topY + 1.08;
  lantern.name = 'lantern-rose';
  group.add(lantern);
  // the inside of the lantern drum should be seen from inside
  const drum = new THREE.Mesh(cyl(topR - 0.01, topR - 0.01, 1.1, 24, WS.ashlar, true), m.ashlarDark);
  (drum.material as THREE.Material).side = THREE.DoubleSide;
  drum.position.y = topY + 0.55;
  group.add(drum);

  // ---------------------------------------------------------------- exterior (seen from the dormitory windows)
  const ro = (R + WALL_T) / COS15;
  b.add(m.ashlar, lathe([[ro, -24], [ro, 0]], N_BAYS, WS.ashlar, PI / 12));
  b.add(m.ashlar, lathe([[ro, WALL_H + 0.38], [ro + 0.28, WALL_H + 0.5], [ro + 0.28, WALL_H + 1.05], [ro + 0.1, WALL_H + 1.12]], N_BAYS, WS.ashlar, PI / 12));
  b.add(slate, lathe([[ro + 0.55, WALL_H + 1.0], [0.001, WALL_H + 13.5]], 64, WS.slate));
  b.add(m.bronze, lathe([[0.12, 0], [0.18, 0.15], [0.08, 0.5], [0.2, 0.8], [0.05, 1.1], [0.025, 2.2], [0.001, 2.3]], 16, WS.bronze), tf(0, WALL_H + 13.2, 0));
  for (let k = 0; k < N_BAYS * 3; k++) {
    const a = (k / (N_BAYS * 3)) * PI * 2;
    b.add(m.ashlar, cbox(0.5, 0.45, 0.3, 0.02, WS.ashlar), tf(Math.sin(a) * (ro + 0.15), WALL_H + 1.3, Math.cos(a) * (ro + 0.15), a));
  }

  const sky = buildSky();
  group.add(sky);
  group.add(b.build('shell-static'));
  return {
    group, door, wingDoors, sky, shelves, colliders: { circles, rects }, seats, torch,
    dome: { material: domeMat, uniforms, textures: domeTex },
    lantern: new THREE.Vector3(0, topY, 0),
  };
}

// ---------------------------------------------------------------------------

function buildWindow(b: Batch, m: RoomMats, rng: SeededRandom, shelves: ShelfSpec[], bay: number): void {
  const hwW = WIN.w / 2;
  // architrave and roll moulding
  b.add(m.marble, extrude(archRing(WIN.w, WIN.y0, WIN.ys, 0.15, WIN.sharp), 0.07, 0.012, WS.marble), tf(0, 0, -0.07));
  const roll = archPoints(WIN.w + 0.05, WIN.y0, WIN.ys, WIN.sharp).slice(2).map((p) => new THREE.Vector3(p.x, p.y, -0.09));
  b.add(m.bronze, tube(roll, 0.022, 64, 6));
  for (const s of [-1, 1]) {
    b.add(m.marble, cyl(0.055, 0.055, WIN.ys - WIN.y0 - 0.2, 12, WS.marble), tf(s * (hwW + 0.22), (WIN.ys + WIN.y0) / 2 + 0.05, -0.12));
    b.add(m.bronze, lathe([[0.055, 0], [0.08, 0.06], [0.1, 0.14], [0.1, 0.18]], 12, WS.bronze), tf(s * (hwW + 0.22), WIN.ys - 0.12, -0.12));
    b.add(m.marble, lathe([[0.1, 0], [0.1, 0.06], [0.07, 0.1], [0.055, 0.12]], 12, WS.marble), tf(s * (hwW + 0.22), WIN.y0 + 0.08, -0.12));
  }

  // tracery panel with two lancets and an oculus, set mid-wall
  const zT = 0.55;
  const outer = archPoints(WIN.w + 0.04, WIN.y0 - 0.02, WIN.ys, WIN.sharp);
  const lw = 0.74, lys = 3.55;
  const lancet = (sx: number) => archPoints(lw, WIN.y0 + 0.04, lys, 0.92).map((p) => new THREE.Vector2(p.x + sx, p.y));
  const ocY = 4.58, ocR = 0.33;
  const circle: THREE.Vector2[] = [];
  for (let k = 0; k < 32; k++) { const a = (k / 32) * PI * 2; circle.push(new THREE.Vector2(Math.cos(a) * ocR, ocY + Math.sin(a) * ocR)); }
  const tr = new THREE.Shape(outer);
  tr.holes.push(toPath(lancet(-0.44)), toPath(lancet(0.44)), toPath(circle));
  b.add(m.marble, extrude(tr, 0.14, 0.012, WS.marble), tf(0, 0, zT));
  // cusped quatrefoil inside the oculus
  const qf = new THREE.Shape();
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * PI * 2, r = ocR * (0.62 + 0.25 * Math.abs(Math.cos(2 * a)));
    const x = Math.cos(a) * r, y = ocY + Math.sin(a) * r;
    k ? qf.lineTo(x, y) : qf.moveTo(x, y);
  }
  qf.holes.push(toPath(circle.map((p) => new THREE.Vector2(p.x * 0.55, ocY + (p.y - ocY) * 0.55))));
  void qf;
  // glass in each light
  const glassGeo = (ptsIn: THREE.Vector2[]) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(ptsIn), 8);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 0.6, uv.getY(k) / 0.6);
    return g;
  };
  for (const g of [glassGeo(lancet(-0.44)), glassGeo(lancet(0.44)), glassGeo(circle)]) b.add(m.glass, g, tf(0, 0, zT + 0.07), false);
  // iron saddle bars
  for (const sx of [-0.44, 0.44]) for (let y = 1.05; y < 3.6; y += 0.62) b.add(m.iron, cyl(0.008, 0.008, lw, 6, WS.iron).rotateZ(PI / 2), tf(sx, y, zT + 0.1), false);

  // window seat with book cubbies beneath
  b.add(m.marble, cbox(WIN.w + 0.6, 0.07, 1.12, 0.015, WS.marble), tf(0, 0.52, -0.02));
  const cw = WIN.w + 0.5;
  b.add(m.walnut, cbox(cw, 0.06, 0.46, 0.01, WS.walnut), tf(0, 0.03, -0.3));
  b.add(m.walnut, cbox(cw, 0.04, 0.44, 0.01, WS.walnut), tf(0, 0.47, -0.3));
  b.add(m.walnut, cbox(cw, 0.42, 0.03, 0.005, WS.walnut), tf(0, 0.27, -0.06));
  for (let k = 0; k <= 3; k++) b.add(m.walnut, cbox(0.04, 0.42, 0.46, 0.008, WS.walnut), tf(-cw / 2 + 0.02 + k * ((cw - 0.04) / 3), 0.27, -0.3));
  const cellW = (cw - 0.04) / 3 - 0.04;
  for (let k = 0; k < 3; k++) {
    const x0 = -cw / 2 + 0.04 + k * ((cw - 0.04) / 3);
    shelves.push({ matrix: new THREE.Matrix4().multiplyMatrices(bayMatrix(bay), tf(x0, 0.06, -0.5)), width: cellW, height: 0.38, depth: 0.36 });
  }
  // cushion and pillows
  b.add(m.velvet, softBox(WIN.w - 0.06, 0.1, 0.95, 0.04, 8, 0.02), tf(0, 0.6, 0.0));
  const nP = rng.int(1, 3);
  for (let k = 0; k < nP; k++) {
    const sx = k === 0 ? -0.62 : k === 1 ? 0.62 : rng.range(-0.3, 0.3);
    b.add(k === 2 ? m.silk : m.velvetDark, softBox(0.42, 0.42, 0.14, 0.06, 6, 0), tf(sx, 0.86, 0.15 + rng.range(-0.1, 0.1), rng.range(-0.6, 0.6) + (sx < 0 ? PI / 2 : -PI / 2), -0.25, rng.range(-0.15, 0.15)));
  }

  // curtains: bronze rod, two gathered silk drapes, swag valance
  const apex = archApex(WIN.w, WIN.ys, WIN.sharp);
  const rodY = apex + 0.38, rodL = WIN.w + 1.4;
  b.add(m.bronze, cyl(0.025, 0.025, rodL, 10, WS.bronze).rotateZ(PI / 2), tf(0, rodY, -0.28));
  for (const s of [-1, 1]) {
    b.add(m.bronze, lathe([[0.001, 0], [0.04, 0.02], [0.05, 0.06], [0.03, 0.1], [0.012, 0.16], [0.001, 0.18]], 12, WS.bronze).rotateZ(-s * PI / 2), tf(s * rodL / 2, rodY, -0.28));
    b.add(m.bronze, cbox(0.04, 0.04, 0.3, 0.01, WS.bronze), tf(s * (rodL / 2 - 0.2), rodY, -0.14));
    b.add(m.silk, drapeGeometry(0.95, rodY - 0.02, 1.25, s), tf(s * (hwW + 0.27), 0, -0.24));
    // tie-back with tassel
    b.add(m.bronze, new THREE.TorusGeometry(0.11, 0.018, 6, 20).scale(1, 1, 0.6).rotateX(PI / 2), tf(s * 1.58, 1.25, -0.27));
    b.add(m.bronze, lathe([[0.001, 0], [0.04, -0.04], [0.035, -0.1], [0.06, -0.28], [0.001, -0.3]], 10, WS.bronze), tf(s * 1.5, 1.24, -0.36));
  }
  b.add(m.silk, valanceGeometry(rodL - 0.1, 0.55), tf(0, rodY + 0.06, -0.33));
  void rng;
}

/** A silk drape hung from a rod, gathered by a tie-back; side = −1 left, +1 right. */
function drapeGeometry(width: number, top: number, tieY: number, side: number): THREE.BufferGeometry {
  const SX = 28, SY = 60;
  const g = new THREE.PlaneGeometry(1, 1, SX, SY);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = uv.getX(i), v = 1 - uv.getY(i); // v 0 top → 1 bottom
    const y = top - v * (top + 0.04);
    const dTie = (y - tieY) / (y > tieY ? top - tieY : tieY);
    const pinch = Math.exp(-dTie * dTie * (y > tieY ? 2.2 : 6));
    const wv = width * (1 - 0.72 * pinch) * (y < tieY ? 1 + 0.2 * (1 - pinch) : 1);
    // outer edge stays put; inner edge swings toward the tie-back
    const xo = side * (width / 2);
    const x = xo - side * u * wv;
    const amp = 0.035 + 0.05 * pinch;
    const z = -amp * Math.sin(u * PI * 2 * 5.5 + v * 1.5) - 0.03 * pinch - (y < 0.08 ? 0.06 * (0.08 - y) * 10 : 0);
    p.setXYZ(i, x, Math.max(y, 0.005), z);
    uv.setXY(i, u * width / WS.silk * 2, (top - y) / WS.silk);
  }
  g.computeVertexNormals();
  return g;
}

function valanceGeometry(width: number, depth: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, depth, 48, 10);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = x / width + 0.5, v = 0.5 - y / depth;
    const swag = Math.abs(Math.sin(u * PI * 3));
    const ny = -v * depth * (0.45 + 0.55 * swag);
    const z = -0.06 * Math.sin(v * PI) * swag - 0.02 * Math.sin(u * PI * 36);
    p.setXYZ(i, x, ny, z);
  }
  g.computeVertexNormals();
  return g;
}

function buildDoorSurround(b: Batch, m: RoomMats, D: { w: number; ys: number; sharp: number }, plaque: boolean): void {
  const DOOR = D;
  b.add(m.marble, extrude(archRing(DOOR.w, 0, DOOR.ys, 0.2, DOOR.sharp), 0.08, 0.014, WS.marble), tf(0, 0, -0.08));
  const roll = archPoints(DOOR.w + 0.06, 0, DOOR.ys, DOOR.sharp).slice(2).map((p) => new THREE.Vector3(p.x, p.y, -0.1));
  b.add(m.bronze, tube(roll, 0.024, 64, 6));
  // carved tympanum shield above the door: bronze eagle plaque
  const apex = archApex(DOOR.w, DOOR.ys, DOOR.sharp);
  if (plaque) b.add(m.marble, cbox(0.9, 0.7, 0.08, 0.02, WS.marble), tf(0, apex + 0.6, -0.06));
  // marble threshold through the wall
  b.add(m.marble, cbox(DOOR.w + 0.1, 0.1, WALL_T + 0.6, 0.015, WS.marble), tf(0, -0.049, 0.5));
}

function buildDoor(m: RoomMats, group: THREE.Group, DOOR: { w: number; ys: number; sharp: number }, place: THREE.Matrix4, base: number, withKnocker: boolean): DoorLeaf {
  const pivot = new THREE.Group();
  pivot.name = 'door-pivot';
  pivot.userData.keep = true;
  const b = new Batch();
  const w = DOOR.w - 0.03;
  const leafPts = archPoints(w, 0.005, DOOR.ys, DOOR.sharp).map((p) => new THREE.Vector2(p.x + w / 2, p.y));
  b.add(m.walnut, extrude(new THREE.Shape(leafPts), 0.09, 0.01, WS.walnut));
  // vertical planks (proud battens) on the room side
  for (let k = 0; k < 6; k++) {
    const x = 0.12 + k * (w - 0.24) / 5;
    const h = Math.min(DOOR.ys + 0.9, archHeightAt(w, DOOR.ys, DOOR.sharp, x - w / 2) - 0.08);
    b.add(m.walnut, cbox(0.03, h - 0.1, 0.02, 0.008, WS.walnut), tf(x, h / 2 + 0.03, -0.01));
  }
  // iron strap hinges with fleur ends + studs, both faces
  for (const y of [0.45, 1.4, 2.35]) {
    for (const zf of [-0.02, 0.11]) {
      b.add(m.iron, cbox(w * 0.8, 0.07, 0.015, 0.004, WS.iron), tf(w * 0.4, y, zf));
      b.add(m.iron, new THREE.CylinderGeometry(0.06, 0.06, 0.015, 3).rotateX(PI / 2), tf(w * 0.8 + 0.03, y, zf, 0, 0, -PI / 2));
      for (let s = 0; s < 6; s++) b.add(m.iron, new THREE.SphereGeometry(0.014, 6, 4), tf(0.1 + s * w * 0.13, y, zf + (zf < 0 ? -0.008 : 0.008)));
    }
  }
  // iron ring pull (room side)
  b.add(m.iron, new THREE.TorusGeometry(0.07, 0.012, 6, 20), tf(w - 0.22, 1.05, -0.045));
  b.add(m.iron, cyl(0.03, 0.03, 0.02, 10, WS.iron).rotateX(PI / 2), tf(w - 0.22, 1.12, -0.02));
  const leaf = b.build('door-leaf');
  pivot.add(leaf);
  // bronze eagle knocker on the passage side
  if (!withKnocker) {
    pivot.applyMatrix4(place);
    group.add(pivot);
    return { pivot, knocker: null, angle: 0, target: 0, base };
  }
  const knocker = new THREE.Group();
  knocker.name = 'knocker';
  const kb = new Batch();
  const eShape = new THREE.Shape();
  // eagle head in profile, facing the visitor (original design)
  const head: [number, number][] = [[-0.11, -0.12], [-0.12, 0.02], [-0.09, 0.1], [-0.02, 0.15], [0.06, 0.14], [0.11, 0.09], [0.15, 0.03], [0.14, -0.02], [0.08, -0.03], [0.05, -0.01], [0.06, -0.08], [0.02, -0.16], [-0.04, -0.18]];
  head.forEach(([x, y], i) => (i ? eShape.lineTo(x, y) : eShape.moveTo(x, y)));
  kb.add(m.bronze, extrude(eShape, 0.05, 0.012, WS.bronze, 6), tf(0, 0, 0, PI));
  kb.add(m.bronze, new THREE.TorusGeometry(0.1, 0.015, 8, 28), tf(0, -0.2, -0.04));
  kb.add(m.bronze, cyl(0.12, 0.12, 0.02, 24, WS.bronze).rotateX(PI / 2), tf(0, 0, 0.01));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), m.sapphire);
  eye.position.set(-0.04, 0.07, -0.055);
  knocker.add(kb.build('knocker'), eye);
  knocker.position.set(w / 2, 1.55, 0.16);
  pivot.add(knocker);
  // hinge at the left jamb, mid-wall
  pivot.applyMatrix4(place);
  group.add(pivot);
  return { pivot, knocker, angle: 0, target: 0, base };
}

function archHeightAt(w: number, ys: number, sharp: number, x: number): number {
  const hw = w / 2, r = Math.max(hw, sharp * w), cR = hw - r;
  const ax = Math.abs(x);
  const dx = ax - cR;
  return ys + Math.sqrt(Math.max(0, r * r - dx * dx));
}

function buildPassage(b: Batch, m: RoomMats, rng: SeededRandom): THREE.Vector3 {
  const z0 = PASSAGE.z0, len = STAIRWELL.z - z0 - 0.7;
  const sh = new THREE.Shape();
  sh.moveTo(-1.9, -0.3); sh.lineTo(1.9, -0.3); sh.lineTo(1.9, 4.8); sh.lineTo(-1.9, 4.8); sh.closePath();
  const vault = archPoints(PASSAGE.w, 0, 2.6, 0.7);
  sh.holes.push(toPath(vault));
  b.add(m.ashlar, extrude(sh, len, 0, WS.ashlar), tf(0, 0, z0));
  // flagstone floor
  for (let k = 0; k < 5; k++) {
    for (let j = 0; j < 3; j++) {
      b.add(m.flags, cbox(PASSAGE.w / 3 - 0.01, 0.12, len / 5 - 0.01, 0.012, WS.granite), tf((j - 1) * PASSAGE.w / 3, -0.06 - rng.range(0, 0.006), z0 + (k + 0.5) * len / 5));
    }
  }
  // stairwell drum with an opening toward the passage
  const sw = STAIRWELL;
  const drumGeo = lathe([[sw.r, -7], [sw.r, 4.8]], 40, WS.ashlar, -PI * 2 / 3, PI * 4 / 3);
  const drumMat = m.ashlar.clone();
  drumMat.side = THREE.BackSide;
  b.add(drumMat, drumGeo, tf(0, 0, sw.z));
  b.add(m.ashlarDark, new THREE.CircleGeometry(sw.r, 32).rotateX(PI / 2), tf(0, 4.6, sw.z));
  // top landing (half disc) and descending steps around a newel
  b.add(m.flags, lathe([[0.001, 0], [sw.r, 0], [sw.r, -0.12], [0.001, -0.12]], 24, WS.granite, PI * 2 / 3, PI * 2 / 3), tf(0, 0, sw.z));
  b.add(m.ashlar, cyl(0.22, 0.22, 12, 16, WS.ashlar), tf(0, -1.2, sw.z));
  for (let s = 0; s < 30; s++) {
    const a0 = PI * 4 / 3 + s * (PI / 8);
    const step = lathe([[0.2, 0], [sw.r, 0], [sw.r, -0.17], [0.2, -0.17]], 4, WS.granite, a0, PI / 8);
    b.add(m.flags, step, tf(0, -0.17 * (s + 1), sw.z));
  }
  // iron railing at the top of the stair
  const rz = sw.z - 0.55;
  b.add(m.iron, cyl(0.022, 0.022, 2.4, 8, WS.iron).rotateZ(PI / 2), tf(0, 0.95, rz));
  b.add(m.iron, cyl(0.012, 0.012, 2.4, 6, WS.iron).rotateZ(PI / 2), tf(0, 0.15, rz));
  for (let k = 0; k <= 10; k++) b.add(m.iron, cyl(0.01, 0.01, 0.8, 6, WS.iron), tf(-1.2 + k * 0.24, 0.55, rz));
  for (const s of [-1, 1]) b.add(m.iron, cyl(0.025, 0.025, 1.0, 8, WS.iron), tf(s * 1.2, 0.5, rz));
  // torch sconce
  const tp = new THREE.Vector3(-1.18, 2.05, z0 + 1.6);
  b.add(m.iron, cbox(0.1, 0.25, 0.04, 0.01, WS.iron), tf(-1.27, 1.9, tp.z, PI / 2));
  b.add(m.iron, lathe([[0.02, 0], [0.06, 0.1], [0.07, 0.18], [0.06, 0.2]], 10, WS.iron), tf(tp.x, 1.85, tp.z));
  b.add(m.iron, cyl(0.012, 0.012, 0.3, 6, WS.iron).rotateZ(-0.6), tf(tp.x - 0.04, 1.8, tp.z));
  return tp.setY(2.08);
}

function buildNiche(b: Batch, m: RoomMats, group: THREE.Group, bay: number): void {
  b.add(m.marble, extrude(archRing(NICHE.w, 0, NICHE.ys, 0.2, NICHE.sharp), 0.09, 0.014, WS.marble), tf(0, 0, -0.09));
  const roll = archPoints(NICHE.w + 0.06, 0, NICHE.ys, NICHE.sharp).slice(2).map((p) => new THREE.Vector3(p.x, p.y, -0.11));
  b.add(m.bronze, tube(roll, 0.026, 64, 6));
  b.add(m.ashlarDark, cbox(2.6, 5.6, 0.1, 0.01, WS.ashlar), tf(0, 2.75, WALL_T + 0.02));
  // painted niche shell: half cylinder and quarter-sphere hood
  const prof: [number, number][] = [];
  for (let s = 0; s <= 12; s++) prof.push([0.99, (s / 12) * NICHE.ys]);
  for (let s = 1; s <= 12; s++) { const a = (s / 12) * (PI / 2); prof.push([0.99 * Math.cos(a), NICHE.ys + 0.99 * Math.sin(a)]); }
  const shellGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), 32, -PI / 2, PI);
  const nicheMat = new THREE.MeshStandardMaterial({ name: 'niche', map: paintNicheStars(), roughness: 0.8, side: THREE.BackSide, emissive: 0xffffff, emissiveMap: null });
  nicheMat.emissiveIntensity = 0;
  const shell = new THREE.Mesh(shellGeo, nicheMat);
  shell.applyMatrix4(bayMatrix(bay));
  shell.receiveShadow = true;
  shell.name = 'niche-shell';
  group.add(shell);
  // steps and floor
  b.add(m.marble, cbox(NICHE.w + 0.02, 0.2, 1.0, 0.02, WS.marble), tf(0, 0.1, 0.5));
  b.add(m.marble, lathe([[0.001, 0.2], [1.5, 0.2], [1.52, 0.16], [1.52, 0.04], [1.56, 0], [0.001, 0]], 32, WS.marble, PI / 2, PI), tf(0, 0, -0.02));
}

function paintNicheStars(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 512);
  const rng = new SeededRandom('niche');
  const grad = g.createLinearGradient(0, 512, 0, 0);
  grad.addColorStop(0, '#0e2152'); grad.addColorStop(1, '#060d28');
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(226,184,104,${rng.range(0.5, 1)})`;
    const x = rng.range(0, 1024), y = rng.range(0, 512), r = rng.range(1, 3.5);
    g.beginPath(); g.arc(x, y, r, 0, PI * 2); g.fill();
  }
  return canvasTexture(c);
}

function paintRose(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#0a1636'; g.fillRect(0, 0, 512, 512);
  const cols = ['#2a5cc8', '#16348a', '#c89a4a', '#3a74e0'];
  for (let ring = 0; ring < 4; ring++) {
    const n = 8 + ring * 8;
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * PI * 2, a1 = ((k + 1) / n) * PI * 2;
      g.beginPath();
      g.arc(256, 256, 60 + ring * 50, a0, a1); g.arc(256, 256, 60 + ring * 50 - 44, a1, a0, true);
      g.closePath();
      g.fillStyle = cols[(k + ring) % cols.length];
      g.fill();
      g.strokeStyle = '#05070c'; g.lineWidth = 5; g.stroke();
    }
  }
  g.fillStyle = '#e8c070'; g.beginPath(); g.arc(256, 256, 18, 0, PI * 2); g.fill();
  const t = canvasTexture(c);
  return t;
}

/** Night landscape around the tower: sky, stars, moon, mountains, loch and distant lit towers. */
function buildSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uMoon: { value: MOON_DIR.clone() }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoon; uniform float uTime;
      varying vec3 vDir;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(float x){ float i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f); return mix(h21(vec2(i, 1.7)), h21(vec2(i + 1.0, 1.7)), f); }
      void main() {
        vec3 d = normalize(vDir);
        float el = asin(clamp(d.y, -1.0, 1.0));
        float az = atan(d.x, d.z);
        vec3 zen = vec3(0.004, 0.008, 0.03), hor = vec3(0.03, 0.06, 0.12);
        vec3 col = mix(hor, zen, smoothstep(0.0, 0.9, el));
        // stars
        vec2 sp = vec2(az * 160.0, el * 160.0);
        vec2 ci = floor(sp); vec2 cf = fract(sp) - 0.5;
        float sh = h21(ci);
        float s = step(0.965, sh) * smoothstep(0.12, 0.0, length(cf + (vec2(h21(ci + 1.3), h21(ci + 2.1)) - 0.5) * 0.6));
        s *= 0.6 + 0.4 * sin(uTime * (1.0 + sh * 3.0) + sh * 50.0);
        col += vec3(0.8, 0.85, 1.0) * s * smoothstep(0.02, 0.2, el) * 1.6;
        // moon + halo
        float md = dot(d, normalize(uMoon));
        col += vec3(0.55, 0.65, 0.9) * pow(max(md, 0.0), 60.0) * 0.6;
        col += vec3(0.35, 0.45, 0.7) * pow(max(md, 0.0), 6.0) * 0.12;
        vec3 mt = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0))), mb = cross(mt, uMoon);
        vec2 mp = vec2(dot(d, mt), dot(d, mb)) * 1800.0;
        float maria = 0.78 + 0.22 * sin(mp.x * 0.9 + 1.3 * sin(mp.y * 0.7)) * sin(mp.y * 1.1 + 0.8 * sin(mp.x * 1.3));
        col = mix(col, vec3(2.6, 2.6, 2.4) * maria, smoothstep(0.99955, 0.9997, md));
        // distant mountains
        float mh = 0.02 + 0.05 * vn(az * 3.0 + 4.0) + 0.025 * vn(az * 9.0) + 0.01 * vn(az * 27.0);
        float lakeTop = -0.06;
        if (el < mh && el > lakeTop) {
          vec3 m = mix(vec3(0.012, 0.018, 0.035), vec3(0.03, 0.045, 0.08), smoothstep(lakeTop, mh, el));
          // snow caps catching moonlight
          m += vec3(0.05, 0.06, 0.09) * smoothstep(mh - 0.012, mh, el) * step(0.055, mh);
          col = m;
        }
        // loch with moon glitter
        if (el <= lakeTop) {
          vec3 w = mix(vec3(0.01, 0.02, 0.04), vec3(0.004, 0.006, 0.012), smoothstep(lakeTop, -0.5, el));
          float maz = atan(uMoon.x, uMoon.z);
          float daz = abs(mod(az - maz + 3.14159, 6.28318) - 3.14159);
          float g = smoothstep(0.08, 0.0, daz) * smoothstep(-0.5, lakeTop, el);
          float rip = h21(vec2(floor(az * 400.0), floor(el * 900.0 + uTime * 2.0)));
          w += vec3(0.6, 0.7, 1.0) * g * step(0.7, rip) * 0.9;
          // forest shoreline
          float fr = lakeTop - 0.012 - 0.01 * vn(az * 60.0);
          if (el > fr) w = vec3(0.004, 0.007, 0.01);
          if (el < -0.42 - 0.04 * vn(az * 20.0)) w = vec3(0.006, 0.008, 0.01);
          col = w;
        }
        // other castle towers with lit windows
        for (int i = 0; i < 7; i++) {
          float fi = float(i);
          float ta = -2.3 + fi * 0.9 + 0.3 * h21(vec2(fi, 9.0));
          float tw = 0.018 + 0.03 * h21(vec2(fi, 3.0));
          float top = -0.05 + 0.18 * h21(vec2(fi, 5.0));
          float daz = abs(mod(az - ta + 3.14159, 6.28318) - 3.14159);
          if (daz < tw && el < top && el > -0.55) {
            col = vec3(0.008, 0.01, 0.016);
            vec2 wq = vec2(daz / tw * 4.0, (top - el) * 90.0);
            vec2 wi = floor(wq), wf = fract(wq);
            float lit = step(0.6, h21(wi + fi * 7.0)) * step(0.3, wf.x) * step(wf.x, 0.7) * step(0.25, wf.y) * step(wf.y, 0.75);
            col += vec3(1.6, 0.9, 0.4) * lit;
          }
          // conical roof
          float roofH = tw * 3.0;
          if (daz < tw * (1.0 - (el - top) / roofH) && el >= top && el < top + roofH) col = vec3(0.01, 0.012, 0.02);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 32), mat);
  sky.name = 'sky';
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  sky.userData.noAO = true;
  return sky;
}
