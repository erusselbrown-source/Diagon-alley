/**
 * The enclosed brick courtyard behind the Leaky Cauldron, at the street's
 * entry (t = 0), and its magical archway.
 *
 * The courtyard's end wall blocks the alley. It is built from ~2,600 rigid,
 * individually animated brick blocks (one InstancedMesh). Clicking the wall
 * (or pressing E nearby) plays a 3.5 s cascading ripple: a wave spreads from
 * the tapped brick, the bricks in the arch opening pop, fold, and slide back
 * and apart to re-lay themselves as the lining of a deep arched passage —
 * revealing the glowing street beyond. Bricks never scale; their count is
 * conserved (opening area ≈ vault lining area).
 *
 * Local frame: origin at the street start on the centreline, +X = street
 * right, +Y up, +Z back into the courtyard (away from the street).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/random';
import { withBaseGrime, withInstanceUvJitter, type MaterialLibrary } from '../materials';
import { GeometryBucket, PROFILES, chamferBox, extrudeProfile, mergeStatic } from './kit/geometry';
import { buildTimberFrame, type Beam } from './kit/timber';
import { buildWall } from './kit/wall';
import { createFrame, type StreetLayout } from './street';

export const ARCH_DURATION = 3.5;
/** Render layer used by the courtyard lantern's shadow camera. */
export const COURTYARD_LAYER = 2;

// Brick block (pitch includes the 10 mm joint)
const BL = 0.225, BH = 0.075, BD = 0.3;
// Wall & opening
const WALL_HALF = 4.65;
const COURSES = 68; // 5.1 m
const OPEN_HALF = 1.7;
const SPRING = 2.75;
const FLIGHT = 1.3;
const COURT_DEPTH = 7.2;
const FLOOR_Y = 0.15;

export interface EntryArchway {
  group: THREE.Group;
  /** Pick target for raycasting. */
  bricks: THREE.InstancedMesh;
  /** World-space centre of the opening (for proximity checks / camera). */
  center: THREE.Vector3;
  /** Suggested starting camera (world) inside the courtyard. */
  viewpoint: { position: THREE.Vector3; target: THREE.Vector3 };
  readonly open: boolean;
  readonly animating: boolean;
  /** Courtyard frame (local → world): origin at the wall on the street centreline, +Z into the courtyard. */
  frame: THREE.Matrix4;
  /** Courtyard dimensions in the local frame. */
  dims: { wallHalf: number; openHalf: number; depth: number; floorY: number };
  /** Toggle open/closed; `originWorld` is where the wall was tapped. */
  trigger(originWorld?: THREE.Vector3): void;
  update(dt: number): void;
  stats: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Opening shape helpers (local wall XY)
// ---------------------------------------------------------------------------

const ARC_LEN = Math.PI * OPEN_HALF;
const PERIM = 2 * SPRING + ARC_LEN;

function insideOpening(x: number, y: number): boolean {
  if (y < 0 || Math.abs(x) > OPEN_HALF) return false;
  if (y <= SPRING) return true;
  return x * x + (y - SPRING) ** 2 <= OPEN_HALF * OPEN_HALF;
}

/** Boundary point, unit tangent and outward normal at perimeter coordinate p. */
function boundary(p: number) {
  if (p < SPRING) return { x: -OPEN_HALF, y: p, tx: 0, ty: 1, nx: -1, ny: 0 };
  if (p < SPRING + ARC_LEN) {
    const th = Math.PI - (p - SPRING) / OPEN_HALF;
    return { x: OPEN_HALF * Math.cos(th), y: SPRING + OPEN_HALF * Math.sin(th), tx: Math.sin(th), ty: -Math.cos(th), nx: Math.cos(th), ny: Math.sin(th) };
  }
  const q = p - SPRING - ARC_LEN;
  return { x: OPEN_HALF, y: SPRING - q, tx: 0, ty: -1, nx: 1, ny: 0 };
}

/** Nearest boundary: distance inside, and perimeter coordinate. */
function nearestBoundary(x: number, y: number): { dist: number; p: number } {
  const cands: { dist: number; p: number }[] = [];
  const yc = Math.min(SPRING, Math.max(0, y));
  cands.push({ dist: Math.hypot(x + OPEN_HALF, y - yc), p: yc });
  cands.push({ dist: Math.hypot(OPEN_HALF - x, y - yc), p: SPRING + ARC_LEN + (SPRING - yc) });
  if (y > SPRING) {
    const th = Math.atan2(y - SPRING, x);
    cands.push({ dist: OPEN_HALF - Math.hypot(x, y - SPRING), p: SPRING + (Math.PI - th) * OPEN_HALF });
  }
  return cands.reduce((a, b) => (b.dist < a.dist ? b : a));
}

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const easeOutCubic = (x: number) => 1 - (1 - x) ** 3;

// ---------------------------------------------------------------------------

export function buildEntryArchway(layout: StreetLayout, lib: MaterialLibrary): EntryArchway {
  const rng = new SeededRandom('diagon-alley:archway');
  const group = new THREE.Group();
  group.name = 'leaky-cauldron-courtyard';

  // Local frame at the street start.
  const f0 = layout.frame(0, createFrame());
  const X = new THREE.Vector3(f0.nx, 0, f0.nz), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(-f0.tx, 0, -f0.tz);
  group.matrixAutoUpdate = false;
  group.matrix.makeBasis(X, Y, Z).setPosition(f0.x, f0.y, f0.z);
  group.matrixWorldNeedsUpdate = true;

  const brickRecipe = lib.recipe('brick');
  const groundWorldY = f0.y + FLOOR_Y;
  const brickGrime = withBaseGrime(lib.get('brick'), { groundY: groundWorldY, height: 1.3, strength: 0.7 });
  const sandstone = lib.get('sandstone');
  const sandstoneJit = withInstanceUvJitter(sandstone, 'court-flags');
  const oak = lib.get('oak');
  const iron = lib.get('iron');
  const ironJit = withInstanceUvJitter(iron, 'bins');

  // ======================================================================
  // 1. The brick wall (instanced rigid blocks)
  // ======================================================================
  // Mortar core: hidden behind the bevelled face except in the joints — a plain box (12 tris).
  const core = new THREE.BoxGeometry(BL, BH, BD).toNonIndexed();
  const face = chamferBox(BL - 0.012, BH - 0.012, BD + 0.012, 0.007);
  const blockGeo = mergeGeometries([core, face], true)!;

  const mortar = (lib.get('plaster').clone() as THREE.MeshStandardMaterial);
  mortar.color.setRGB(0.62, 0.6, 0.56);
  mortar.name = 'mortar';
  const brickMat = lib.get('brick').clone();
  brickMat.name = 'arch-brick';
  brickMat.onBeforeCompile = (shader) => {
    shader.uniforms.uBrickScale = { value: 1 / brickRecipe.worldSize };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aBrickUv;\nuniform float uBrickScale;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = vMapUv * uBrickScale + aBrickUv;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = vNormalMapUv * uBrickScale + aBrickUv;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = vRoughnessMapUv * uBrickScale + aBrickUv;
        #endif
        #ifdef USE_METALNESSMAP
          vMetalnessMapUv = vMetalnessMapUv * uBrickScale + aBrickUv;
        #endif
        #ifdef USE_AOMAP
          vAoMapUv = vAoMapUv * uBrickScale + aBrickUv;
        #endif`);
  };
  brickMat.customProgramCacheKey = () => 'arch-brick-atlas';

  // Lay courses (running bond, half bricks at the ends).
  type Brick = { x: number; y: number; sx: number; opening: boolean };
  const bricks: Brick[] = [];
  for (let c = 0; c < COURSES; c++) {
    const y = (c + 0.5) * BH;
    let x = -WALL_HALF;
    if (c & 1) { bricks.push({ x: x + BL / 4, y, sx: 0.5, opening: false }); x += BL / 2; }
    while (x + BL <= WALL_HALF + 1e-6) { bricks.push({ x: x + BL / 2, y, sx: 1, opening: false }); x += BL; }
    if (WALL_HALF - x > 0.05) bricks.push({ x: x + BL / 4, y, sx: 0.5, opening: false });
  }
  for (const b of bricks) b.opening = b.sx === 1 && insideOpening(b.x, b.y);

  const N = bricks.length;
  const mesh = new THREE.InstancedMesh(blockGeo, [mortar, brickMat], N);
  mesh.name = 'archway-bricks';
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const brickUv = new Float32Array(N * 2);
  const colors = new Float32Array(N * 3);
  bricks.forEach((b, i) => {
    const c = rng.int(0, 11), k = rng.int(0, 3);
    brickUv[i * 2] = (k + 0.5 - (c & 1 ? 0.5 : 0)) / 4;
    brickUv[i * 2 + 1] = (c + 0.5) / 12;
    const soot = 1 - 0.45 * Math.exp(-b.y / 0.9); // darker near the ground
    const v = rng.range(0.85, 1.08) * soot;
    colors.set([v, v * rng.range(0.97, 1.02), v * rng.range(0.95, 1.0)], i * 3);
  });
  blockGeo.setAttribute('aBrickUv', new THREE.InstancedBufferAttribute(brickUv, 2));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  group.add(mesh);

  // ---- Animation data -------------------------------------------------------
  const openIdx = bricks.map((b, i) => (b.opening ? i : -1)).filter((i) => i >= 0);
  const nCols = Math.floor(PERIM / BL);
  const pitch = PERIM / nCols;
  const nRows = Math.ceil(openIdx.length / nCols);

  const P0 = new Float32Array(N * 3), P1 = new Float32Array(N * 3), S = new Float32Array(N);
  const Q1 = new Float32Array(N * 4), QF = new Float32Array(N * 4), QT = new Float32Array(N * 4);
  const RAD = new Float32Array(N * 2), AMP = new Float32Array(N), DELAY = new Float32Array(N);
  const isOpen = new Uint8Array(N);
  const near: number[] = [];
  bricks.forEach((b, i) => {
    P0.set([b.x, b.y, 0], i * 3);
    S[i] = b.sx;
    if (b.opening) { isOpen[i] = 1; return; }
    // Static bricks close to the opening shiver as the wave passes.
    const nb = nearestBoundary(b.x, b.y);
    const outside = insideOpening(b.x, b.y) ? 0 : Math.max(0, Math.hypot(b.x, Math.max(0, b.y - SPRING)) - OPEN_HALF, Math.abs(b.x) - OPEN_HALF);
    void nb;
    if (outside < 1.4) { AMP[i] = 0.018 * Math.exp(-outside / 0.5); near.push(i); }
  });

  // Assign opening bricks to vault-lining slots: shallow rows take the bricks
  // nearest the boundary; within a row, order by perimeter position.
  const info = openIdx.map((i) => ({ i, ...nearestBoundary(bricks[i].x, bricks[i].y) })).sort((a, b) => a.dist - b.dist);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qa = new THREE.Quaternion();
  for (let r = 0; r < nRows; r++) {
    const row = info.slice(r * nCols, (r + 1) * nCols).sort((a, b) => a.p - b.p);
    row.forEach((it, j) => {
      const col = row.length === nCols ? j : Math.round(((j + 0.5) * nCols) / row.length - 0.5);
      const bd = boundary((col + 0.5) * pitch);
      const i = it.i;
      P1.set([bd.x + bd.nx * (BD / 2), bd.y + bd.ny * (BD / 2), -(BD / 2 + BH / 2 + r * BH) - 0.004], i * 3);
      m4.makeBasis(new THREE.Vector3(bd.tx, bd.ty, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(bd.nx, bd.ny, 0));
      q.setFromRotationMatrix(m4);
      Q1.set([q.x, q.y, q.z, q.w], i * 4);
      // Mid-flight "fold": tip 90° about the brick's long axis, with a twist.
      const sgn = rng.chance(0.5) ? 1 : -1;
      qa.setFromEuler(new THREE.Euler(sgn * Math.PI / 2, rng.range(-0.6, 0.6), rng.range(-0.4, 0.4)));
      QF.set([qa.x, qa.y, qa.z, qa.w], i * 4);
      qa.setFromEuler(new THREE.Euler(rng.range(-0.15, 0.15), rng.range(-0.25, 0.25), rng.range(-0.2, 0.2)));
      QT.set([qa.x, qa.y, qa.z, qa.w], i * 4);
      const rl = Math.hypot(bricks[i].x, bricks[i].y - SPRING * 0.6) || 1;
      RAD.set([bricks[i].x / rl, (bricks[i].y - SPRING * 0.6) / rl], i * 2);
      AMP[i] = 0.012;
    });
  }
  const active = [...openIdx, ...near];

  // ---- Coping on the wall ---------------------------------------------------
  const wallTrim = new GeometryBucket();
  wallTrim.add(sandstone, extrudeProfile(PROFILES.coping(BD), WALL_HALF * 2 + 0.1, lib.recipe('sandstone').worldSize),
    new THREE.Matrix4().makeTranslation(-WALL_HALF - 0.05, COURSES * BH, 0));
  group.add(wallTrim.build('archway-coping'));

  // ======================================================================
  // 2. Courtyard enclosure
  // ======================================================================
  const wallMats = { wall: brickGrime, stone: sandstone, timber: oak, glass: lib.get('glass'), door: lib.get('paint-oxblood'), iron };
  const sideH = COURSES * BH;
  // Left & right walls (running from the arch wall back to the pub)
  const left = buildWall({
    name: 'court-wall-left', length: COURT_DEPTH, height: sideH, thickness: 0.4, wallWorldSize: brickRecipe.worldSize,
    openings: [{ kind: 'blind', x: 3.1, y: 1.3, width: 1.0, height: 1.6 }], materials: wallMats,
  });
  left.rotation.y = Math.PI / 2;
  left.position.set(-WALL_HALF - 0.05, 0, COURT_DEPTH);
  group.add(left);
  const right = buildWall({
    name: 'court-wall-right', length: COURT_DEPTH, height: sideH, thickness: 0.4, wallWorldSize: brickRecipe.worldSize,
    openings: [{ kind: 'boarded', x: 3.4, y: 1.2, width: 0.9, height: 1.5 }], materials: wallMats,
  });
  right.rotation.y = -Math.PI / 2;
  right.position.set(WALL_HALF + 0.05, 0, 0);
  group.add(right);

  // Leaky Cauldron rear: brick ground floor, jettied timber-framed plaster upper floor.
  const PUB_LEN = WALL_HALF * 2 + 0.5;
  const lower = buildWall({
    name: 'pub-rear-lower', length: PUB_LEN, height: 3.3, thickness: 0.45, wallWorldSize: brickRecipe.worldSize, top: 'none',
    openings: [
      { kind: 'door', x: 6.1, y: FLOOR_Y + 0.02, width: 1.15, height: 2.35, archRise: 0.28 },
      { kind: 'window', x: 1.9, y: 1.05, width: 1.7, height: 1.45 },
      { kind: 'window', x: 8.0, y: 1.25, width: 0.8, height: 1.15 },
    ],
    materials: wallMats,
  });
  lower.rotation.y = Math.PI;
  lower.position.set(PUB_LEN / 2, 0, COURT_DEPTH + 0.2);
  group.add(lower);

  const JETTY = 0.32;
  const upperT = 0.25;
  const upper = buildWall({
    name: 'pub-rear-upper', length: PUB_LEN, height: 3.1, thickness: upperT, wallWorldSize: lib.recipe('plaster').worldSize, plinth: false, top: 'cornice',
    openings: [
      { kind: 'window', x: 1.7, y: 0.85, width: 1.4, height: 1.3 },
      { kind: 'window', x: 6.3, y: 0.85, width: 1.4, height: 1.3 },
    ],
    materials: { ...wallMats, wall: lib.get('plaster'), stone: oak },
  });
  upper.rotation.y = Math.PI;
  const upperFaceZ = COURT_DEPTH + 0.2 - 0.225 - JETTY; // front face (toward the arch)
  upper.position.set(PUB_LEN / 2, 3.58, upperFaceZ + upperT / 2);
  // Half-timbering over the plaster (in the upper wall's local frame).
  const beams: Beam[] = [
    { a: [0, 0.1], b: [PUB_LEN, 0.1], width: 0.2 }, { a: [0, 2.95], b: [PUB_LEN, 2.95], width: 0.2 },
    { a: [0, 0.62], b: [PUB_LEN, 0.62], width: 0.16 },
  ];
  for (const x of [0.12, 3.35, 4.65, 5.95, 8.0, PUB_LEN - 0.12]) beams.push({ a: [x, 0.1], b: [x, 2.95], width: 0.2 });
  beams.push({ a: [3.4, 2.9], b: [4.0, 0.68], width: 0.14 }, { a: [4.6, 2.9], b: [4.0, 0.68], width: 0.14 });
  beams.push({ a: [8.05, 2.9], b: [8.0 + (PUB_LEN - 8.1) / 2, 0.68], width: 0.14 }, { a: [PUB_LEN - 0.17, 2.9], b: [8.0 + (PUB_LEN - 8.1) / 2, 0.68], width: 0.14 });
  for (const x of [0.9, 2.2, 6.9, 7.4]) beams.push({ a: [x, 0.1], b: [x, 0.62], width: 0.12 });
  const frame = buildTimberFrame(beams, withInstanceUvJitter(oak, 'pub-timber'), upperT / 2 - 0.04);
  upper.add(frame);
  group.add(upper);

  // Bressumer beam + carved brackets carrying the jetty
  const jetty = new GeometryBucket();
  jetty.box(oak, PUB_LEN, 0.28, 0.24 + JETTY, 0.03, { x: 0, y: 3.44, z: COURT_DEPTH + 0.2 - 0.225 - JETTY / 2 + 0.06 });
  for (const x of [-3.9, -1.3, 1.3, 3.9]) {
    jetty.box(oak, 0.16, 0.62, 0.14, 0.02, { x, y: 3.0, z: COURT_DEPTH + 0.2 - 0.225 - 0.14 }, new THREE.Euler(Math.PI / 5, 0, 0));
  }
  group.add(jetty.build('pub-jetty'));

  // Courtyard floor: uneven flagstones over a grit bed
  const flagBatch: THREE.Matrix4[] = [];
  const sc = new THREE.Vector3(), pos = new THREE.Vector3(), eul = new THREE.Euler();
  for (let z = 0.2; z < COURT_DEPTH; ) {
    const depth = Math.min(rng.range(0.5, 0.8), COURT_DEPTH - z);
    for (let x = -WALL_HALF; x < WALL_HALF; ) {
      const w = Math.min(rng.range(0.5, 0.95), WALL_HALF - x);
      if (w > 0.12) {
        pos.set(x + w / 2, FLOOR_Y - 0.04 + rng.range(-0.006, 0.008), z + depth / 2);
        eul.set(rng.range(-0.015, 0.015), rng.range(-0.012, 0.012), rng.range(-0.015, 0.015));
        flagBatch.push(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(eul), sc.set(w - 0.012, 1, depth - 0.012)));
      }
      x += w;
    }
    z += depth;
  }
  const flags = new THREE.InstancedMesh(chamferBox(1, 0.08, 1, 0.012, lib.recipe('sandstone').worldSize), sandstoneJit, flagBatch.length);
  flagBatch.forEach((m, i) => flags.setMatrixAt(i, m));
  flags.receiveShadow = flags.castShadow = true;
  flags.name = 'court-flags';
  group.add(flags);
  const bedPlane = new THREE.Mesh(new THREE.PlaneGeometry(WALL_HALF * 2, COURT_DEPTH).rotateX(-Math.PI / 2), lib.get('grit'));
  bedPlane.position.set(0, FLOOR_Y - 0.06, COURT_DEPTH / 2);
  bedPlane.receiveShadow = true;
  group.add(bedPlane);

  // Dustbins (instanced) by the arch wall
  const binProfile = [[0, 0], [0.24, 0], [0.25, 0.04], [0.245, 0.08], [0.26, 0.1], [0.255, 0.3], [0.27, 0.32], [0.265, 0.52], [0.28, 0.54], [0.275, 0.72], [0.29, 0.74], [0.29, 0.76], [0, 0.76]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const lidProfile = [[0, 0.06], [0.3, 0], [0.31, 0.025], [0.29, 0.04], [0.15, 0.1], [0.04, 0.12], [0.05, 0.16], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y));
  const binSpots: [number, number, number][] = [[-3.7, 0.75, 0.2], [-3.05, 0.6, -0.4], [-3.85, 1.4, 1.1]];
  const bins = new THREE.InstancedMesh(new THREE.LatheGeometry(binProfile, 20), ironJit, binSpots.length);
  const lids = new THREE.InstancedMesh(new THREE.LatheGeometry(lidProfile, 20), ironJit, binSpots.length);
  binSpots.forEach(([x, z, r], i) => {
    bins.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x, FLOOR_Y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(1, 1, 1)));
    const tilt = i === 1 ? new THREE.Euler(0.35, r, 0.1) : new THREE.Euler(0, r, 0);
    lids.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x + (i === 1 ? 0.05 : 0), FLOOR_Y + 0.76 + (i === 1 ? 0.05 : 0), z), new THREE.Quaternion().setFromEuler(tilt), new THREE.Vector3(1, 1, 1)));
  });
  for (const m of [bins, lids]) { m.castShadow = m.receiveShadow = true; group.add(m); }
  bins.name = 'dustbins'; lids.name = 'dustbin-lids';

  // Wall lantern beside the pub's back door
  const lamp = new GeometryBucket();
  const lampX = -(6.1 + 1.15 / 2 - PUB_LEN / 2) - 1.0; // door centre (mirrored) minus 1 m
  const lampZ = COURT_DEPTH + 0.2 - 0.225;
  lamp.box(iron, 0.05, 0.05, 0.38, 0.008, { x: lampX, y: 2.55, z: lampZ - 0.19 });
  lamp.box(iron, 0.22, 0.03, 0.22, 0.006, { x: lampX, y: 2.52, z: lampZ - 0.4 });
  lamp.box(iron, 0.26, 0.05, 0.26, 0.01, { x: lampX, y: 2.2, z: lampZ - 0.4 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lamp.box(iron, 0.018, 0.32, 0.018, 0.004, { x: lampX + dx * 0.105, y: 2.36, z: lampZ - 0.4 + dz * 0.105 });
  group.add(lamp.build('court-lantern'));
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.28, 0.19), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1, 0.6, 0.25), emissiveIntensity: 3, transparent: true, opacity: 0.9 }));
  flame.position.set(lampX, 2.36, lampZ - 0.4);
  group.add(flame);
  // A wide spot (one shadow pass) rather than a point light (six cube-face passes).
  const lampLight = new THREE.SpotLight(0xffa458, 40, 16, THREE.MathUtils.degToRad(68), 0.9, 1.7);
  lampLight.position.set(lampX, 2.3, lampZ - 0.55);
  lampLight.target.position.set(lampX * 0.3, 0, 1.5);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.radius = 4;
  lampLight.shadow.bias = -0.0015;
  group.add(lampLight, lampLight.target);
  const lampFill = new THREE.PointLight(0xffa458, 2.5, 6, 2); // soft local fill on the wall, no shadows
  lampFill.position.set(lampX, 2.4, lampZ - 0.6);
  group.add(lampFill);

  mergeStatic(group, 'courtyard-static');
  // The lantern only lights the courtyard: give its shadow camera a private
  // layer so it doesn't re-render every shop on the street.
  group.traverse((o) => o.layers.enable(COURTYARD_LAYER));
  lampLight.shadow.camera.layers.set(COURTYARD_LAYER);

  // ======================================================================
  // 3. Animation state
  // ======================================================================
  const origin = new THREE.Vector2(-0.6, 1.6);
  let tau = 0, dir = 0;
  let isOpenState = false;
  const tw = new Float32Array(N);

  const prepareTimings = () => {
    // The wavefront crosses the opening in ~2 s so the last brick lands at exactly ARCH_DURATION.
    let maxD = 0;
    for (const i of openIdx) maxD = Math.max(maxD, Math.hypot(P0[i * 3] - origin.x, P0[i * 3 + 1] - origin.y));
    const span = ARCH_DURATION - FLIGHT - 0.2 - 0.05;
    for (const i of active) {
      const d = Math.hypot(P0[i * 3] - origin.x, P0[i * 3 + 1] - origin.y) / maxD;
      tw[i] = Math.min(ARCH_DURATION - 0.45, 0.05 + span * d);
      DELAY[i] = tw[i] + 0.2;
    }
  };

  const mtx = new THREE.Matrix4(), qq = new THREE.Quaternion(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), ID = new THREE.Quaternion();
  const vp = new THREE.Vector3(), vs = new THREE.Vector3();
  const pulse = (x: number) => (x > 0 && x < 1 ? Math.sin(Math.PI * x) : 0);

  const applyPose = () => {
    for (const i of active) {
      const bump = AMP[i] * pulse((tau - tw[i]) / 0.45);
      const x0 = P0[i * 3], y0 = P0[i * 3 + 1];
      vs.set(S[i], 1, 1);
      if (!isOpen[i]) {
        vp.set(x0, y0, bump);
        qq.copy(ID);
      } else {
        const k = Math.min(1, Math.max(0, (tau - DELAY[i]) / FLIGHT));
        qT.fromArray(QT, i * 4);
        if (k <= 0) {
          vp.set(x0, y0, bump);
          qq.copy(ID);
        } else if (k < 0.18) {
          const e = easeOutCubic(k / 0.18);
          vp.set(x0, y0, 0.07 * e);
          qq.copy(ID).slerp(qT, e);
        } else {
          const e = easeInOutCubic((k - 0.18) / 0.82);
          // Cubic Bézier: pop-out point → straight back → slide outward → slot
          const ax = x0, ay = y0, az = 0.07;
          const bx = x0, by = y0, bz = -0.9;
          const x1 = P1[i * 3], y1 = P1[i * 3 + 1], z1 = P1[i * 3 + 2];
          const cx = x1 - RAD[i * 2] * 0.25, cy = y1 - RAD[i * 2 + 1] * 0.25, cz = z1 - 0.3;
          const u = 1 - e;
          vp.set(
            u * u * u * ax + 3 * u * u * e * bx + 3 * u * e * e * cx + e * e * e * x1,
            u * u * u * ay + 3 * u * u * e * by + 3 * u * e * e * cy + e * e * e * y1,
            u * u * u * az + 3 * u * u * e * bz + 3 * u * e * e * cz + e * e * e * z1,
          );
          qA.fromArray(QF, i * 4);
          qB.fromArray(Q1, i * 4);
          if (e < 0.5) qq.copy(qT).slerp(qA, e * 2);
          else qq.copy(qA).slerp(qB, (e - 0.5) * 2);
        }
      }
      mtx.compose(vp, qq, vs);
      mesh.setMatrixAt(i, mtx);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  const qT = new THREE.Quaternion();

  // Initial pose for all bricks.
  bricks.forEach((_, i) => {
    vp.set(P0[i * 3], P0[i * 3 + 1], 0);
    mesh.setMatrixAt(i, mtx.compose(vp, ID, vs.set(S[i], 1, 1)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  prepareTimings();

  // Bounds must cover the open vault too (raycasting & culling).
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2.5, -0.7), 6.5);

  const toWorld = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(group.matrix);

  return {
    group,
    bricks: mesh,
    center: toWorld(0, 2.2, 0),
    frame: group.matrix.clone(),
    dims: { wallHalf: WALL_HALF, openHalf: OPEN_HALF, depth: COURT_DEPTH, floorY: FLOOR_Y },
    viewpoint: { position: toWorld(1.1, 1.7, 6.3), target: toWorld(-0.2, 2.1, 0) },
    get open() { return isOpenState; },
    get animating() { return dir !== 0; },
    trigger(originWorld) {
      if (dir !== 0) { dir = -dir; return; } // reverse mid-flight
      if (!isOpenState && originWorld) {
        const local = originWorld.clone().applyMatrix4(new THREE.Matrix4().copy(group.matrix).invert());
        origin.set(local.x, local.y);
        prepareTimings();
      }
      dir = isOpenState ? -1 : 1;
    },
    update(dt) {
      if (dir === 0) return;
      tau = Math.min(ARCH_DURATION, Math.max(0, tau + dir * dt));
      applyPose();
      if (dir > 0 && tau >= ARCH_DURATION) { dir = 0; isOpenState = true; }
      if (dir < 0 && tau <= 0) { dir = 0; isOpenState = false; }
    },
    stats: { bricks: N, openingBricks: openIdx.length, liningRows: nRows, liningCols: nCols },
  };
}
