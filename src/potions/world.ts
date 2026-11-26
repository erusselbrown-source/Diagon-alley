/**
 * Builds a level's 3D set from its ASCII map: flagged floor with chasm edges,
 * arched brick walls with recessed windows, instanced counters and every station.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '../materials';
import { scaleUVsToWorld, withBaseGrime } from '../materials';
import { SeededRandom } from '../core/random';
import { INGREDIENTS, type IngredientKind, type LevelDef } from './data';
import { Batcher, M4, labelTexture, makeIngredient, makeFlask, makeLiquidMaterial, makeOwl, makeVortexMaterial, mat, mergeGeos } from './models';

export const COUNTER_H = 0.62;
export const DEPTH = 5;

export type StationKind = 'counter' | 'chop' | 'mortar' | 'cauldron' | 'flask' | 'bin' | 'delivery' | 'crate';

export interface StationVis {
  kind: StationKind;
  cx: number; cz: number;
  x: number; z: number;
  /** Rest height for items placed on it. */
  top: number;
  /** Yaw facing open floor. */
  yaw: number;
  crate?: IngredientKind;
  liquid?: THREE.ShaderMaterial;
  liquidMesh?: THREE.Mesh;
  vortex?: THREE.ShaderMaterial;
  knife?: THREE.Object3D;
  pestle?: THREE.Object3D;
  owl?: THREE.Group;
  grate?: THREE.MeshStandardMaterial;
}

export interface PlatformVis {
  cells: { cx: number; cz: number }[];
  group: THREE.Group;
  runes: THREE.MeshStandardMaterial;
}

export interface Cell { ch: string; floor: boolean; void: boolean; station: StationVis | null }

export interface LevelWorld {
  group: THREE.Group;
  W: number; H: number;
  cells: Cell[][];
  stations: StationVis[];
  platforms: PlatformVis[];
  spawns: THREE.Vector2[];
  torches: THREE.Vector3[];
  windowMat: THREE.ShaderMaterial;
  candles: { mesh: THREE.InstancedMesh; flames: THREE.InstancedMesh; base: THREE.Vector3[]; phase: number[] };
  animated: THREE.Object3D[];
  center(cx: number, cz: number): THREE.Vector2;
  dispose(): void;
}

export const LEVEL_MATERIALS = [
  'cobblestone', 'brick', 'sandstone', 'oak', 'iron', 'brass', 'copper', 'marble',
  'paint-teal', 'paint-indigo', 'paint-oxblood',
] as const;

const PAINT: Record<LevelDef['mood'], 'paint-teal' | 'paint-indigo' | 'paint-oxblood'> = {
  cellar: 'paint-teal', tower: 'paint-indigo', storm: 'paint-oxblood',
};

function windowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uRain: { value: 0 }, uFlash: { value: 0 }, uWarm: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uRain, uFlash, uWarm;
      varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main() {
        vec2 p = vec2(vW.x * 0.25, vW.y * 0.3);
        vec3 top = mix(vec3(0.02, 0.04, 0.12), vec3(0.05, 0.05, 0.08), uRain);
        vec3 bot = mix(vec3(0.10, 0.12, 0.28), vec3(0.06, 0.07, 0.1), uRain);
        bot = mix(bot, vec3(0.5, 0.25, 0.12), uWarm);
        vec3 c = mix(bot, top, clamp(vW.y * 0.35 - 0.2, 0.0, 1.0));
        float cl = n(p * 3.0 + vec2(uTime * 0.03, 0.0)) * 0.6 + n(p * 7.0 - vec2(uTime * 0.05, 0.0)) * 0.4;
        c += vec3(0.08, 0.09, 0.14) * smoothstep(0.45, 0.9, cl) * (1.0 + uRain);
        // stars
        float st = step(0.996, h(floor(vW.xy * 40.0))) * (1.0 - uRain);
        c += st * vec3(1.4) * (0.6 + 0.4 * sin(uTime * 3.0 + vW.x * 30.0));
        // moon behind the leftmost windows
        float m = length(vec2(vW.x + 2.6, vW.y - 2.4));
        c += vec3(1.8, 1.9, 2.2) * smoothstep(0.32, 0.28, m) * (1.0 - uRain * 0.8);
        c += vec3(0.15, 0.2, 0.35) * smoothstep(1.4, 0.2, m) * (1.0 - uRain * 0.6);
        // rain streaks on the glass
        float col = floor(vUv.x * 60.0);
        float r = fract(vUv.y * 2.0 + uTime * (1.5 + h(vec2(col, 1.0))) + h(vec2(col, 3.0)));
        c += vec3(0.25, 0.3, 0.4) * smoothstep(0.96, 1.0, r) * uRain * step(0.5, h(vec2(col, 7.0)));
        c += vec3(1.6, 1.7, 2.2) * uFlash;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

/** Arched opening outline (bottom at y0, total height h, width w). */
function archPath(path: THREE.Path, x: number, y0: number, w: number, h: number): void {
  path.moveTo(x - w / 2, y0);
  path.lineTo(x + w / 2, y0);
  path.lineTo(x + w / 2, y0 + h - w / 2);
  path.absarc(x, y0 + h - w / 2, w / 2, 0, Math.PI, false);
  path.lineTo(x - w / 2, y0);
}

function extrude(shape: THREE.Shape, depth: number, worldSize: number, bevel = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 16 });
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / worldSize, uv.getY(i) / worldSize);
  return g;
}

/** A crested cloth banner texture. */
function bannerTexture(color: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = accent;
  g.lineWidth = 6;
  g.strokeRect(10, 10, 108, 220);
  // crest: a flask
  g.fillStyle = accent;
  g.beginPath();
  g.arc(64, 140, 30, 0, Math.PI * 2);
  g.fill();
  g.fillRect(54, 80, 20, 40);
  g.fillRect(48, 76, 32, 8);
  g.fillStyle = color;
  g.beginPath();
  g.arc(64, 140, 20, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = accent;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(46 + i * 9, 146 + (i % 2) * 6, 4, 0, Math.PI * 2); g.fill(); }
  g.font = 'bold 22px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('★ ★ ★', 64, 205);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildLevel(level: LevelDef, lib: MaterialLibrary): LevelWorld {
  const rng = new SeededRandom(`level-${level.id}`);
  const map = level.map;
  const H = map.length;
  const W = Math.max(...map.map((r) => r.length));
  const group = new THREE.Group();
  const center = (cx: number, cz: number) => new THREE.Vector2(cx - W / 2 + 0.5, cz - H / 2 + 0.5);
  const at = (cx: number, cz: number) => map[cz]?.[cx] ?? '#';
  const isVoid = (ch: string) => ch === '_' || ch === '=';
  const isFloor = (ch: string) => ch === '.' || ch === '1' || ch === '2';

  const floorMat = lib.get('cobblestone').clone();
  floorMat.roughness = 1.45; // drier cellar flags: fewer specular glints than the wet street
  floorMat.envMapIntensity = 0.5;
  const M = {
    floor: floorMat,
    wall: withBaseGrime(lib.get('brick'), { groundY: 0, height: 1.3, strength: 0.6 }),
    stone: lib.get('sandstone'),
    oak: lib.get('oak'),
    iron: lib.get('iron'),
    brass: lib.get('brass'),
    copper: lib.get('copper'),
    marble: lib.get('marble'),
    paint: lib.get(PAINT[level.mood]),
  };
  const ws = (id: Parameters<MaterialLibrary['recipe']>[0]) => lib.recipe(id).worldSize;
  const batch = new Batcher();
  const animated: THREE.Object3D[] = [];

  // ------------------------------------------------------------ cells
  const cells: Cell[][] = [];
  const stations: StationVis[] = [];
  const spawns: THREE.Vector2[] = [];
  for (let z = 0; z < H; z++) {
    const row: Cell[] = [];
    for (let x = 0; x < W; x++) {
      const ch = at(x, z);
      row.push({ ch, floor: isFloor(ch), void: isVoid(ch), station: null });
      if (ch === '1' || ch === '2') spawns[Number(ch) - 1] = center(x, z);
    }
    cells.push(row);
  }

  // ------------------------------------------------------------ floor (tops + chasm edges)
  {
    const geos: THREE.BufferGeometry[] = [];
    const edgeGeos: THREE.BufferGeometry[] = [];
    const fs = ws('cobblestone');
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      const ch = at(x, z);
      if (isVoid(ch) || ch === '#') continue;
      const c = center(x, z);
      const top = new THREE.PlaneGeometry(1, 1);
      top.rotateX(-Math.PI / 2);
      top.translate(c.x, 0, c.y);
      const uv = top.getAttribute('uv') as THREE.BufferAttribute;
      const pos = top.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / fs, -pos.getZ(i) / fs);
      geos.push(top);
      // chasm-facing sides
      const sides: [number, number, number][] = [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]];
      for (const [dx, dz, ry] of sides) {
        if (!isVoid(at(x + dx, z + dz))) continue;
        const s = new THREE.PlaneGeometry(1, DEPTH);
        scaleUVsToWorld(s, 1, DEPTH, ws('sandstone'));
        s.translate(0, -DEPTH / 2, 0.5);
        s.rotateY(ry);
        s.translate(c.x, 0, c.y);
        edgeGeos.push(s);
        // coping lip
        const lip = new RoundedBoxGeometry(1.0, 0.1, 0.12, 2, 0.03);
        scaleUVsToWorld(lip, 1, 0.12, ws('sandstone'));
        lip.translate(0, -0.03, 0.47);
        lip.rotateY(ry);
        lip.translate(c.x, 0, c.y);
        edgeGeos.push(lip);
      }
    }
    const floor = new THREE.Mesh(mergeGeos(geos), M.floor);
    floor.receiveShadow = true;
    group.add(floor);
    if (edgeGeos.length) {
      // chasm walls sink into darkness
      const deep = abyssFade(lib.get('sandstone'));
      batch.add(mergeGeos(edgeGeos), deep);
    }
  }

  // chasm depths: a glowing mist floor far below
  if (map.some((r) => r.includes('_'))) {
    const abyss = new THREE.Mesh(
      new THREE.PlaneGeometry(W - 2, H - 2),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
          void main(){ vec2 p = vUv * 8.0; float m = n(p + uTime * 0.15) * 0.6 + n(p * 2.3 - uTime * 0.2) * 0.4;
            vec3 c = mix(vec3(0.01, 0.005, 0.03), vec3(0.18, 0.08, 0.4), m * m);
            gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    abyss.rotation.x = -Math.PI / 2;
    abyss.position.y = -DEPTH + 0.2;
    abyss.userData.tick = (t: number) => { (abyss.material as THREE.ShaderMaterial).uniforms.uTime.value = t; };
    animated.push(abyss);
    group.add(abyss);
  }

  // ------------------------------------------------------------ walls
  const WALL_H = 3.4;
  const T = 0.45;
  const windowMat = windowMaterial();
  const torches: THREE.Vector3[] = [];
  {
    const x0 = -W / 2 + 1, x1 = W / 2 - 1;
    const zBack = -H / 2 + 1, zFront = H / 2 - 1;
    const width = x1 - x0;
    // back wall with arched windows
    const back = new THREE.Shape();
    back.moveTo(-width / 2 - T, -DEPTH);
    back.lineTo(width / 2 + T, -DEPTH);
    back.lineTo(width / 2 + T, WALL_H);
    back.lineTo(-width / 2 - T, WALL_H);
    back.lineTo(-width / 2 - T, -DEPTH);
    const nWin = Math.max(2, Math.floor(width / 3.2));
    const winXs: number[] = [];
    for (let i = 0; i < nWin; i++) winXs.push(-width / 2 + (width / nWin) * (i + 0.5));
    const WIN_W = 0.95, WIN_Y = 1.25, WIN_H = 1.75;
    for (const wx of winXs) { const hole = new THREE.Path(); archPath(hole, wx, WIN_Y, WIN_W, WIN_H); back.holes.push(hole); }
    const backGeo = extrude(back, T, ws('brick'));
    backGeo.translate((x0 + x1) / 2, 0, zBack - T);
    batch.add(backGeo, M.wall);
    for (const wx of winXs) {
      const X = (x0 + x1) / 2 + wx;
      // sandstone arch surround (proud of the wall), sill, keystone
      const sur = new THREE.Shape();
      archPath(sur, 0, WIN_Y - 0.02, WIN_W + 0.3, WIN_H + 0.17);
      const hole = new THREE.Path();
      archPath(hole, 0, WIN_Y, WIN_W, WIN_H);
      sur.holes.push(hole);
      const surG = extrude(sur, 0.08, ws('sandstone'), 0.015);
      surG.translate(X, 0, zBack - 0.02);
      batch.add(surG, M.stone);
      const sill = new RoundedBoxGeometry(WIN_W + 0.5, 0.12, 0.26, 2, 0.03);
      scaleUVsToWorld(sill, 1.4, 0.26, ws('sandstone'));
      batch.add(sill, M.stone, M4(X, WIN_Y - 0.06, zBack + 0.06));
      const key = new RoundedBoxGeometry(0.2, 0.28, 0.14, 2, 0.02);
      batch.add(key, M.stone, M4(X, WIN_Y + WIN_H + 0.05, zBack + 0.04));
      // deep reveal backing view + leaded cames
      const view = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W + 0.1, WIN_H + 0.1), windowMat);
      view.position.set(X, WIN_Y + WIN_H / 2, zBack - T + 0.05);
      group.add(view);
      const bar = new THREE.BoxGeometry(0.025, WIN_H, 0.03);
      for (const bx of [-0.24, 0, 0.24]) batch.add(bar, M.iron, M4(X + bx, WIN_Y + WIN_H / 2 - 0.02, zBack - T * 0.5), false);
      const hbar = new THREE.BoxGeometry(WIN_W, 0.025, 0.03);
      for (const by of [0.45, 0.95]) batch.add(hbar, M.iron, M4(X, WIN_Y + by, zBack - T * 0.5), false);
    }
    // banners between windows
    const pal = { cellar: ['#164a4c', '#d8b048'], tower: ['#1c2350', '#c8ccd8'], storm: ['#5a1416', '#e0b040'] }[level.mood];
    const bannerMat = new THREE.MeshStandardMaterial({ map: bannerTexture(pal[0], pal[1]), roughness: 0.95, side: THREE.DoubleSide });
    for (let i = 0; i < winXs.length - 1; i++) {
      const bx = (x0 + x1) / 2 + (winXs[i] + winXs[i + 1]) / 2;
      const ban = new THREE.PlaneGeometry(0.7, 1.4, 4, 8);
      const p = ban.getAttribute('position') as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) p.setZ(k, 0.03 * Math.sin(p.getX(k) * 9) + 0.02 * Math.sin(p.getY(k) * 4));
      ban.computeVertexNormals();
      batch.add(ban, bannerMat, M4(bx, 2.35, zBack + 0.05));
      batch.add(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), M.brass, M4(bx, 3.07, zBack + 0.08, 0, 1, 0, Math.PI / 2));
      for (const s of [-1, 1]) batch.add(new THREE.SphereGeometry(0.045, 10, 8), M.brass, M4(bx + s * 0.47, 3.07, zBack + 0.08));
    }
    // cornice moulding along the top of the back wall
    const corn = new THREE.Shape();
    corn.moveTo(0, 0); corn.lineTo(0.22, 0); corn.lineTo(0.22, 0.06); corn.quadraticCurveTo(0.12, 0.08, 0.1, 0.18); corn.lineTo(0, 0.22); corn.lineTo(0, 0);
    const cornG = new THREE.ExtrudeGeometry(corn, { depth: width + 2 * T, bevelEnabled: false, curveSegments: 6 });
    scaleUVsToWorld(cornG, 1, 1, ws('sandstone') * 2);
    cornG.rotateY(-Math.PI / 2); // profile depth → into the room (+z), extrusion → −x
    cornG.translate(x1 + T, WALL_H - 0.22, zBack);
    batch.add(cornG, M.stone);
    // skirting plinth
    const skirt = new RoundedBoxGeometry(width, 0.22, 0.08, 2, 0.02);
    scaleUVsToWorld(skirt, width, 0.22, ws('sandstone'));
    batch.add(skirt, M.stone, M4((x0 + x1) / 2, 0.11, zBack + 0.03));

    // side walls with torches + shelves
    for (const s of [-1, 1]) {
      const xIn = s < 0 ? x0 : x1;
      const depth = zFront - zBack + T;
      const side = new RoundedBoxGeometry(T, WALL_H + DEPTH, depth, 2, 0.03);
      scaleUVsToWorld(side, depth, WALL_H + DEPTH, ws('brick'));
      batch.add(side, M.wall, M4(xIn + s * T / 2, (WALL_H - DEPTH) / 2, (zBack + zFront + T) / 2 - T / 2));
      const sk = new RoundedBoxGeometry(0.08, 0.22, depth - T, 2, 0.02);
      scaleUVsToWorld(sk, depth, 0.22, ws('sandstone'));
      batch.add(sk, M.stone, M4(xIn - s * 0.03, 0.11, (zBack + zFront) / 2));
      // torches at 1/3 and 2/3 depth
      for (const f of [0.3, 0.75]) {
        const tz = zBack + (zFront - zBack) * f;
        const tx = xIn - s * 0.05;
        batch.add(new THREE.BoxGeometry(0.06, 0.24, 0.12), M.iron, M4(tx - s * 0.02, 1.6, tz));
        batch.add(new THREE.CylinderGeometry(0.03, 0.02, 0.32, 8), M.iron, M4(tx - s * 0.14, 1.72, tz, 0, 1, 0, s * 0.5));
        const cup = new THREE.LatheGeometry([new THREE.Vector2(0.02, 0), new THREE.Vector2(0.09, 0.08), new THREE.Vector2(0.1, 0.12)], 12);
        batch.add(cup, M.brass, M4(tx - s * 0.22, 1.85, tz));
        torches.push(new THREE.Vector3(tx - s * 0.22, 1.98, tz));
      }
    }
    // low front parapet with coping (keeps the view open)
    const par = new RoundedBoxGeometry(width + 2 * T, 0.5 + DEPTH, T, 2, 0.03);
    scaleUVsToWorld(par, width, 0.5 + DEPTH, ws('brick'));
    batch.add(par, M.wall, M4((x0 + x1) / 2, (0.5 - DEPTH) / 2, zFront + T / 2));
    const cop = new RoundedBoxGeometry(width + 2 * T + 0.1, 0.1, T + 0.12, 2, 0.03);
    scaleUVsToWorld(cop, width, T, ws('sandstone'));
    batch.add(cop, M.stone, M4((x0 + x1) / 2, 0.55, zFront + T / 2));

    // shelves of jars along the back wall (instanced)
    const jarGeo = new THREE.LatheGeometry([[0, 0], [0.06, 0], [0.07, 0.03], [0.07, 0.14], [0.04, 0.17], [0.04, 0.2], [0, 0.2]].map(([a, b]) => new THREE.Vector2(a, b)), 12);
    const jarMat = new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.08 });
    const jarSpots: THREE.Matrix4[] = [];
    const jarCols: THREE.Color[] = [];
    const shelfXs = [winXs[0] - 1.3, winXs[winXs.length - 1] + 1.3].filter((v) => Math.abs(v) < width / 2 - 0.5);
    for (const sx of shelfXs) {
      for (const sy of [1.55, 2.25]) {
        const X = (x0 + x1) / 2 + sx;
        const plank = new RoundedBoxGeometry(1.2, 0.05, 0.24, 2, 0.015);
        scaleUVsToWorld(plank, 1.2, 0.24, ws('oak'));
        batch.add(plank, M.oak, M4(X, sy, zBack + 0.12));
        for (const b of [-0.45, 0.45]) batch.add(new THREE.BoxGeometry(0.04, 0.16, 0.18), M.iron, M4(X + b, sy - 0.1, zBack + 0.1));
        for (let j = 0; j < 7; j++) {
          const s = rng.range(0.7, 1.15);
          jarSpots.push(M4(X - 0.5 + j * 0.165 + rng.range(-0.02, 0.02), sy + 0.025, zBack + 0.12 + rng.range(-0.04, 0.04), rng.range(0, 6), new THREE.Vector3(s, s * rng.range(0.8, 1.3), s)));
          jarCols.push(new THREE.Color().setHSL(rng.next(), rng.range(0.4, 0.8), rng.range(0.3, 0.55)));
        }
      }
    }
    if (jarSpots.length) {
      const jars = new THREE.InstancedMesh(jarGeo, jarMat, jarSpots.length);
      jarSpots.forEach((m, i) => { jars.setMatrixAt(i, m); jars.setColorAt(i, jarCols[i]); });
      jars.castShadow = true;
      group.add(jars);
    }
  }

  // ------------------------------------------------------------ counters (instanced) & stations
  const counterCells: THREE.Vector2[] = [];
  const stationChars = 'CXMKFTDrtsdl';
  const yawToFloor = (x: number, z: number): number => {
    const dirs: [number, number, number][] = [[0, 1, 0], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, -1, Math.PI]];
    for (const [dx, dz, yaw] of dirs) if (isFloor(at(x + dx, z + dz))) return yaw;
    return 0;
  };
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    const ch = at(x, z);
    if (!stationChars.includes(ch)) continue;
    const c = center(x, z);
    const kind: StationKind =
      ch === 'C' ? 'counter' : ch === 'X' ? 'chop' : ch === 'M' ? 'mortar' : ch === 'K' ? 'cauldron'
        : ch === 'F' ? 'flask' : ch === 'T' ? 'bin' : ch === 'D' ? 'delivery' : 'crate';
    const st: StationVis = { kind, cx: x, cz: z, x: c.x, z: c.y, top: COUNTER_H, yaw: yawToFloor(x, z) };
    if (kind !== 'cauldron') counterCells.push(c);
    cells[z][x].station = st;
    stations.push(st);
    const Y = COUNTER_H;
    const rot = M4(c.x, 0, c.y, st.yaw);
    const place = (geo: THREE.BufferGeometry, m: THREE.Material, lx: number, ly: number, lz: number, ry = 0, s: number | THREE.Vector3 = 1, rx = 0, rz = 0, shadow = true) =>
      batch.add(geo, m, rot.clone().multiply(M4(lx, ly, lz, ry, s, rx, rz)), shadow);

    if (kind === 'chop') {
      const board = new RoundedBoxGeometry(0.62, 0.05, 0.44, 2, 0.02);
      scaleUVsToWorld(board, 0.6, 0.44, ws('oak'));
      place(board, M.oak, 0, Y + 0.025, -0.02);
      const knife = new THREE.Group();
      knife.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.012), mat(0xcfd6dc, 0.25, 1)));
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), mat(0x3a2414, 0.7));
      handle.rotation.z = Math.PI / 2;
      handle.position.x = -0.22;
      knife.add(handle);
      knife.traverse((o) => { o.castShadow = true; });
      knife.position.set(c.x, Y + 0.16, c.y);
      knife.rotation.y = st.yaw + 0.3;
      knife.userData.base = knife.position.clone();
      st.knife = knife;
      group.add(knife);
      st.top = Y + 0.05;
    } else if (kind === 'mortar') {
      const bowl = new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.18, 0.04], [0.19, 0.16], [0.21, 0.18], [0.17, 0.19], [0.14, 0.07], [0, 0.06]].map(([a, b]) => new THREE.Vector2(a, b)), 24);
      scaleUVsToWorld(bowl, 1.2, 0.4, ws('marble'));
      place(bowl, M.marble, 0.12, Y, -0.1);
      const pestle = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 10), M.marble);
      pestle.castShadow = true;
      pestle.position.set(0, Y + 0.24, 0);
      pestle.rotation.z = 0.5;
      const pg = new THREE.Group();
      pg.position.set(c.x, 0, c.y);
      pg.rotation.y = st.yaw;
      const inner = new THREE.Group();
      inner.position.set(0.12, 0, -0.1);
      inner.add(pestle);
      pg.add(inner);
      group.add(pg);
      st.pestle = inner;
      st.top = Y + 0.02;
    } else if (kind === 'crate') {
      const k = ch === 'r' ? 'mandrake' : ch === 't' ? 'toadstool' : ch === 's' ? 'moonstone' : ch === 'd' ? 'scale' : 'lacewing';
      st.crate = k;
      // slatted crate
      for (const sx of [-1, 1]) {
        const slat = new RoundedBoxGeometry(0.04, 0.26, 0.7, 1, 0.01);
        scaleUVsToWorld(slat, 0.7, 0.26, ws('oak'));
        place(slat, M.oak, sx * 0.36, Y + 0.13, 0);
        const slat2 = new RoundedBoxGeometry(0.76, 0.26, 0.04, 1, 0.01);
        scaleUVsToWorld(slat2, 0.76, 0.26, ws('oak'));
        place(slat2, M.oak, 0, Y + 0.13, sx * 0.33);
      }
      for (const cy of [0.05, 0.22]) {
        const band = new THREE.BoxGeometry(0.8, 0.03, 0.74);
        place(band, M.iron, 0, Y + cy, 0, 0, 1, 0, 0, false);
      }
      place(new THREE.BoxGeometry(0.7, 0.02, 0.62), mat(0x1a120a, 1), 0, Y + 0.12, 0);
      // a heap of the goods poking out
      for (let i = 0; i < 4; i++) {
        const ing = makeIngredient(k, 'raw');
        ing.position.set(-0.18 + (i % 2) * 0.34 + rng.range(-0.04, 0.04), Y + 0.12, -0.14 + Math.floor(i / 2) * 0.26);
        ing.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 6), rng.range(-0.3, 0.3));
        ing.scale.setScalar(1.15);
        const holder = new THREE.Group();
        holder.applyMatrix4(rot);
        holder.add(ing);
        batch.addObject(holder);
      }
      // brass plaque with the name on the front
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshStandardMaterial({ map: labelTexture(INGREDIENTS[k].name.split(' ')[0]), roughness: 0.6 }));
      const plaqueObj = new THREE.Group();
      plaqueObj.applyMatrix4(rot);
      plaque.position.set(0, Y - 0.2, 0.505);
      plaqueObj.add(plaque);
      batch.addObject(plaqueObj, false);
      st.top = Y + 0.27;
    } else if (kind === 'flask') {
      const rack = new RoundedBoxGeometry(0.8, 0.06, 0.5, 2, 0.015);
      scaleUVsToWorld(rack, 0.8, 0.5, ws('oak'));
      place(rack, M.oak, 0, Y + 0.12, 0);
      for (const sx of [-0.37, 0.37]) place(new THREE.BoxGeometry(0.04, 0.15, 0.46), M.oak, sx, Y + 0.07, 0);
      for (let i = 0; i < 6; i++) {
        const f = makeFlask(null);
        f.position.set(-0.27 + (i % 3) * 0.27, Y + 0.02, -0.11 + Math.floor(i / 3) * 0.22);
        const holder = new THREE.Group();
        holder.applyMatrix4(rot);
        holder.add(f);
        batch.addObject(holder);
      }
      st.top = Y + 0.15;
    } else if (kind === 'bin') {
      const basin = new THREE.LatheGeometry([[0.0, 0], [0.4, 0], [0.42, 0.06], [0.4, 0.1], [0.32, 0.09], [0.3, 0.02], [0, 0.02]].map(([a, b]) => new THREE.Vector2(a, b)), 32);
      scaleUVsToWorld(basin, 2.5, 0.3, ws('sandstone'));
      place(basin, M.stone, 0, Y, 0);
      const vortex = makeVortexMaterial();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.31, 40), vortex);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(c.x, Y + 0.05, c.y);
      group.add(disc);
      st.vortex = vortex;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        place(new THREE.OctahedronGeometry(0.035, 0), mat(0xc890ff, 0.3, 0, 0xa040ff, 2.2), Math.cos(a) * 0.38, Y + 0.13, Math.sin(a) * 0.38, 0, 1, 0, 0, false);
      }
      st.top = Y + 0.06;
    } else if (kind === 'delivery') {
      // owl perch window: brass-framed hatch with a sign
      const perch = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 10);
      place(perch, M.brass, 0, Y + 0.32, -0.25, 0, 1, 0, Math.PI / 2);
      for (const sx of [-0.38, 0.38]) place(new THREE.CylinderGeometry(0.025, 0.03, 0.32, 8), M.brass, sx, Y + 0.16, -0.25);
      const tray = new RoundedBoxGeometry(0.7, 0.04, 0.4, 2, 0.015);
      scaleUVsToWorld(tray, 0.7, 0.4, ws('copper'));
      place(tray, M.copper, 0, Y + 0.02, 0.14);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.22), new THREE.MeshStandardMaterial({ map: labelTexture('Owl Post', '#2a1a40', '#f0d080'), roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.15, emissiveMap: null }));
      const so = new THREE.Group();
      so.applyMatrix4(rot);
      sign.position.set(0, Y - 0.2, 0.505);
      so.add(sign);
      batch.addObject(so, false);
      const owl = makeOwl();
      owl.position.set(c.x, Y + 0.34, c.y);
      owl.rotation.y = st.yaw;
      owl.userData.home = owl.position.clone();
      owl.scale.setScalar(0.9);
      owl.traverse((o) => { o.castShadow = true; });
      group.add(owl);
      st.owl = owl;
      st.top = Y + 0.04;
    } else if (kind === 'cauldron') {
      // stone hearth with a glowing grate, iron cauldron on top
      const hearth = new RoundedBoxGeometry(0.96, 0.3, 0.96, 3, 0.05);
      scaleUVsToWorld(hearth, 0.96, 0.3, ws('sandstone'));
      place(hearth, M.stone, 0, 0.15, 0);
      const grateMat = new THREE.MeshStandardMaterial({ color: 0x110804, emissive: 0xff5a10, emissiveIntensity: 1.6 });
      st.grate = grateMat;
      for (const s of [-1, 1]) {
        const arch = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16, 0, Math.PI), grateMat);
        const ag = new THREE.Group();
        ag.applyMatrix4(rot);
        arch.position.set(0, 0.04, 0.485 * s);
        if (s < 0) arch.rotation.y = Math.PI;
        ag.add(arch);
        group.add(ag);
      }
      const body = new THREE.LatheGeometry([[0, 0.02], [0.2, 0.03], [0.36, 0.12], [0.42, 0.28], [0.41, 0.42], [0.36, 0.52], [0.34, 0.56], [0.33, 0.56], [0.35, 0.51], [0.39, 0.42], [0.4, 0.28], [0.34, 0.14], [0.2, 0.06], [0, 0.05]].map(([a, b]) => new THREE.Vector2(a, b)), 36);
      scaleUVsToWorld(body, 2.4, 0.6, ws('iron'));
      place(body, M.iron, 0, 0.32, 0);
      const lip = new THREE.TorusGeometry(0.345, 0.03, 10, 36);
      place(lip, M.iron, 0, 0.88, 0, 0, 1, Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        place(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 8), M.iron, Math.cos(a) * 0.25, 0.34, Math.sin(a) * 0.25);
      }
      for (const s of [-1, 1]) {
        const ring = new THREE.TorusGeometry(0.07, 0.014, 6, 16);
        place(ring, M.brass, s * 0.42, 0.74, 0, 0, 1, 0, Math.PI / 2);
      }
      const liq = makeLiquidMaterial();
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), liq);
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(c.x, 0.8, c.y);
      group.add(disc);
      st.liquid = liq;
      st.liquidMesh = disc;
      st.top = 0.9;
    }
  }
  // counter bodies, panels, plinths and oak tops — instanced street-wide
  if (counterCells.length) {
    const bodyGeo = mergeGeos([
      (() => { const g = new RoundedBoxGeometry(0.94, COUNTER_H - 0.12, 0.94, 2, 0.03); scaleUVsToWorld(g, 0.94, 0.5, lib.recipe(PAINT[level.mood]).worldSize); g.translate(0, (COUNTER_H - 0.12) / 2 + 0.06, 0); return g; })(),
      ...[0, 1, 2, 3].map((i) => {
        const g = new RoundedBoxGeometry(0.66, 0.3, 0.04, 2, 0.012);
        scaleUVsToWorld(g, 0.66, 0.3, lib.recipe(PAINT[level.mood]).worldSize);
        g.translate(0, 0.31, 0.47);
        g.rotateY((i * Math.PI) / 2);
        return g;
      }),
    ]);
    const plinthGeo = new RoundedBoxGeometry(0.9, 0.08, 0.9, 1, 0.02);
    plinthGeo.translate(0, 0.04, 0);
    const topGeo = new RoundedBoxGeometry(1.0, 0.07, 1.0, 2, 0.02);
    scaleUVsToWorld(topGeo, 1, 1, ws('oak'));
    topGeo.translate(0, COUNTER_H - 0.035, 0);
    const mk = (geo: THREE.BufferGeometry, m: THREE.Material) => {
      const im = new THREE.InstancedMesh(geo, m, counterCells.length);
      counterCells.forEach((c, i) => im.setMatrixAt(i, M4(c.x, 0, c.y, (Math.floor(rng.next() * 4) * Math.PI) / 2)));
      im.castShadow = true;
      im.receiveShadow = true;
      group.add(im);
    };
    mk(bodyGeo, M.paint);
    mk(plinthGeo, mat(0x1a120c, 0.8));
    mk(topGeo, M.oak);
  }

  // ------------------------------------------------------------ moving platforms ('=' clusters)
  const platforms: PlatformVis[] = [];
  {
    const seen = new Set<string>();
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (at(x, z) !== '=' || seen.has(`${x},${z}`)) continue;
      const cl: { cx: number; cz: number }[] = [];
      const stack = [[x, z]];
      while (stack.length) {
        const [a, b] = stack.pop()!;
        const k = `${a},${b}`;
        if (seen.has(k) || at(a, b) !== '=') continue;
        seen.add(k);
        cl.push({ cx: a, cz: b });
        stack.push([a + 1, b], [a - 1, b], [a, b + 1], [a, b - 1]);
      }
      const g = new THREE.Group();
      const runes = new THREE.MeshStandardMaterial({ color: 0x100820, emissive: 0x8a50ff, emissiveIntensity: 2 });
      const pb = new Batcher();
      for (const c of cl) {
        const p = center(c.cx, c.cz);
        const slab = new RoundedBoxGeometry(0.98, 0.3, 0.98, 3, 0.05);
        scaleUVsToWorld(slab, 0.98, 0.98, ws('sandstone'));
        pb.add(slab, M.stone, M4(p.x, -0.15, p.y));
        const under = new THREE.ConeGeometry(0.42, 0.7, 4, 1);
        pb.add(under, M.stone, M4(p.x, -0.65, p.y, Math.PI / 4, 1, Math.PI));
        const band = new THREE.BoxGeometry(1.0, 0.04, 1.0);
        pb.add(band, runes, M4(p.x, -0.22, p.y), false);
      }
      g.add(pb.build());
      group.add(g);
      platforms.push({ cells: cl, group: g, runes });
    }
  }

  // ------------------------------------------------------------ floating candles
  const candleBase: THREE.Vector3[] = [];
  const candlePhase: number[] = [];
  {
    const x0 = -W / 2 + 1.4, x1 = W / 2 - 1.4;
    const zb = -H / 2 + 1.5;
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      const along = i % 2 === 0;
      const x = along ? x0 + (x1 - x0) * t : (i % 4 === 1 ? x0 - 0.3 : x1 + 0.3);
      const z = along ? zb + rng.range(-0.2, 0.5) : zb + rng.range(0.5, H - 4);
      candleBase.push(new THREE.Vector3(x, rng.range(2.5, 3.2), z));
      candlePhase.push(rng.range(0, 6.28));
    }
  }
  const candleGeo = new THREE.CylinderGeometry(0.035, 0.04, 0.26, 10);
  candleGeo.translate(0, 0.13, 0);
  const candleMesh = new THREE.InstancedMesh(candleGeo, mat(0xf2e6c8, 0.6, 0, 0xffc080, 0.08), candleBase.length);
  const flameGeo = new THREE.SphereGeometry(0.03, 10, 8);
  flameGeo.scale(1, 1.9, 1);
  const flameMesh = new THREE.InstancedMesh(flameGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.62, 0.25).multiplyScalar(5) }), candleBase.length);
  candleMesh.castShadow = false;
  group.add(candleMesh, flameMesh);

  group.add(batch.build());

  return {
    group, W, H, cells, stations, platforms, spawns, torches, windowMat, animated,
    candles: { mesh: candleMesh, flames: flameMesh, base: candleBase, phase: candlePhase },
    center,
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
    },
  };
}

/** Chasm walls: light dies away within a couple of metres, then a faint arcane glow rises from below. */
function abyssFade(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAbyssY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vAbyssY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAbyssY;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        gl_FragColor.rgb *= smoothstep(-1.9, -0.02, vAbyssY);
        gl_FragColor.rgb += vec3(0.07, 0.025, 0.16) * smoothstep(-1.2, -4.8, vAbyssY);`);
  };
  m.customProgramCacheKey = () => 'abyss-fade';
  return m;
}
