/**
 * Townhouse shell: stacked storeys with Tudor jetties and an intentional,
 * cumulative lean (each storey pivots on its own base, so a 1–3° tilt per
 * floor compounds into a whimsically crooked frontage). Each storey has a
 * facade with real openings, party walls, a back wall, optional
 * half-timbering, jetty soffit + joists + bressumer + carved brackets, and an
 * optional sag. The roof (with gutters) sits on the top storey and copper
 * downpipes follow the leaning, jettied stack to the ground.
 *
 * Local: origin front-centre at pavement level, +Z toward the street,
 * frontage x ∈ [−w/2, w/2], body z ∈ [−depth, 0].
 */
import * as THREE from 'three';
import type { MaterialId } from '../../materials';
import type { Kit } from './context';
import { GeometryBucket, PROFILES, extrudeProfile, mergeStatic } from './geometry';
import { corbelGeometry } from './bay';
import { buildRoof, type Roof, type RoofSpec } from './roof';
import { buildTimberFrame, type Beam } from './timber';
import { buildWall, type WallOpening } from './wall';

export interface StoreySpec {
  height: number;
  material: MaterialId | THREE.Material;
  worldSize?: number;
  /** Projection beyond the storey below (m). */
  jetty?: number;
  /** [pitch toward the street, sideways roll] in degrees. */
  lean?: [number, number];
  /** Openings in facade coordinates (x from the left edge, 0..width). */
  openings?: WallOpening[];
  /** Half-timber the facade (auto-generated around openings, or explicit beams). */
  timber?: boolean | Beam[];
  timberMaterial?: THREE.Material;
  /** Mid-span droop of the storey base (m). */
  sag?: number;
  /** Stone string course at the top of a non-jettied masonry storey. */
  band?: boolean;
  thickness?: number;
}

export interface TownhouseSpec {
  name: string;
  width: number;
  depth: number;
  storeys: StoreySpec[];
  roof: RoofSpec;
  side?: MaterialId | THREE.Material;
  trim?: THREE.Material;
  glass?: THREE.Material;
}

export interface Townhouse {
  group: THREE.Group;
  /** Storey pivot groups, bottom to top (add facade details in their local frames). */
  storeys: THREE.Group[];
  /** Cumulative jetty offsets, per storey. */
  jetties: number[];
  roof: Roof;
  height: number;
}

const resolve = (kit: Kit, m: MaterialId | THREE.Material) => (typeof m === 'string' ? kit.mats.get(m) : m);
const wsOf = (kit: Kit, m: MaterialId | THREE.Material, fallback = 1) => (typeof m === 'string' ? kit.mats.worldSize(m) : fallback);

/** Auto half-timbering: posts at edges and beside openings, rails, braces in blank panels. */
export function autoTimber(w: number, h: number, openings: readonly WallOpening[]): Beam[] {
  const beams: Beam[] = [
    { a: [0, 0.1], b: [w, 0.1], width: 0.2 },
    { a: [0, h - 0.1], b: [w, h - 0.1], width: 0.2 },
  ];
  const posts = new Set<number>([0.1, w - 0.1]);
  for (const o of openings) { posts.add(Math.max(0.1, o.x - 0.12)); posts.add(Math.min(w - 0.1, o.x + o.width + 0.12)); }
  const xs = [...posts].sort((a, b) => a - b).filter((x, i, arr) => i === 0 || x - arr[i - 1] > 0.3);
  for (const x of xs) beams.push({ a: [x, 0.1], b: [x, h - 0.1], width: 0.18 });
  const sillY = openings.length ? Math.min(...openings.map((o) => o.y)) - 0.05 : h * 0.35;
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1];
    const covered = openings.some((o) => o.x < x1 - 0.05 && o.x + o.width > x0 + 0.05);
    if (covered) { beams.push({ a: [x0, sillY], b: [x1, sillY], width: 0.14 }); continue; }
    if (x1 - x0 < 0.5) continue;
    beams.push({ a: [x0, sillY], b: [x1, sillY], width: 0.14 });
    if (i % 2 === 0) beams.push({ a: [x0 + 0.08, h - 0.18], b: [x1 - 0.08, sillY + 0.08], width: 0.13 });
    else beams.push({ a: [x0 + 0.08, sillY + 0.08], b: [x1 - 0.08, h - 0.18], width: 0.13 });
    beams.push({ a: [(x0 + x1) / 2, 0.1], b: [(x0 + x1) / 2, sillY], width: 0.12 });
  }
  return beams;
}

function pipe(b: GeometryBucket, mat: THREE.Material, a: THREE.Vector3, c: THREE.Vector3, r = 0.045): void {
  const len = a.distanceTo(c);
  if (len < 0.01) return;
  const g = new THREE.CylinderGeometry(r, r, len, 10);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
  b.add(mat, g, new THREE.Matrix4().compose(a.clone().add(c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
}

export function buildTownhouse(kit: Kit, spec: TownhouseSpec): Townhouse {
  const M = kit.mats;
  const rng = kit.useRng(spec.name);
  const w = spec.width, depth = spec.depth;
  const group = new THREE.Group();
  group.name = `townhouse:${spec.name}`;
  const side = resolve(kit, spec.side ?? 'brick');
  const sideWS = wsOf(kit, spec.side ?? 'brick', 0.9);
  const trim = spec.trim ?? M.get('oak');
  const oak = M.get('oak');
  const stone = M.get('sandstone');
  const glass = spec.glass ?? M.get('glass');
  const storeys: THREE.Group[] = [];
  const jetties: number[] = [];
  let parent: THREE.Object3D = group;
  let J = 0, total = 0;

  spec.storeys.forEach((st, i) => {
    const g = new THREE.Group();
    g.name = `storey-${i}`;
    const prevH = i === 0 ? 0 : spec.storeys[i - 1].height;
    const jet = i === 0 ? 0 : st.jetty ?? 0;
    J += jet;
    g.position.set(0, prevH, jet);
    const [pitch, roll] = st.lean ?? [rng.range(0.6, 1.6), rng.range(-0.6, 0.6)];
    g.rotation.set(THREE.MathUtils.degToRad(i === 0 ? pitch * 0.3 : pitch), 0, THREE.MathUtils.degToRad(roll));
    parent.add(g);
    parent = g;
    storeys.push(g);
    jetties.push(J);
    total += st.height;

    const mat = resolve(kit, st.material);
    const ws = st.worldSize ?? wsOf(kit, st.material, 1);
    const t = st.thickness ?? 0.3;
    const dI = depth + J;
    // Rooms behind the windows: most upper floors warmly lit, the rest a dim cool glow.
    const room = i === 0 || rng.chance(0.3) ? M.interior('plaster', 0xffb070, 0.5)
      : rng.chance(0.45) ? M.interior('plaster', 0xffc890, 0.4)
        : M.interior('plaster', 0x6a7c98, 0.07);
    const mats = { wall: mat, stone, timber: oak, glass, iron: M.get('iron'), door: trim, interior: room };
    const facade = buildWall({ name: `${spec.name}-f${i}`, length: w, height: st.height, thickness: t, wallWorldSize: ws, openings: st.openings ?? [], plinth: i === 0, top: 'none', materials: mats });
    facade.position.set(-w / 2, 0, -t / 2);
    g.add(facade);

    const sideMats = { ...mats, wall: side };
    const lw = buildWall({ name: 'party-l', length: dI, height: st.height, thickness: 0.3, wallWorldSize: sideWS, plinth: i === 0, top: 'none', materials: sideMats });
    lw.rotation.y = -Math.PI / 2; lw.position.set(-w / 2 + 0.15, 0, -dI);
    const rw = buildWall({ name: 'party-r', length: dI, height: st.height, thickness: 0.3, wallWorldSize: sideWS, plinth: i === 0, top: 'none', materials: sideMats });
    rw.rotation.y = Math.PI / 2; rw.position.set(w / 2 - 0.15, 0, 0);
    const bw = buildWall({ name: 'back', length: w, height: st.height, thickness: 0.3, wallWorldSize: sideWS, plinth: false, top: 'none', materials: sideMats });
    bw.rotation.y = Math.PI; bw.position.set(w / 2, 0, -dI + 0.15);
    g.add(lw, rw, bw);

    const b = new GeometryBucket();
    if (st.timber) {
      const beams = Array.isArray(st.timber) ? st.timber : autoTimber(w, st.height, st.openings ?? []);
      const frame = buildTimberFrame(beams, st.timberMaterial ? M.jitter('oak', st.timberMaterial) : M.jitter('oak'), -0.04);
      frame.position.x = -w / 2;
      g.add(frame);
    }
    if (jet > 0) {
      // Jetty: boarded soffit, joist ends, bressumer, carved brackets
      b.box(oak, w + 0.02, 0.08, jet + 0.2, 0.01, { x: 0, y: -0.04, z: -jet / 2 - 0.1 }, undefined, 0.6);
      for (let x = -w / 2 + 0.2; x < w / 2 - 0.1; x += 0.42) b.box(oak, 0.12, 0.14, jet + 0.06, 0.02, { x, y: -0.13, z: -jet / 2 + 0.03 });
      b.box(st.timber ? (st.timberMaterial ?? oak) : trim, w + 0.06, 0.26, 0.26, 0.03, { x: 0, y: 0.08, z: -0.08 });
      for (const sx of [-1, 1]) b.add(oak, corbelGeometry(jet + 0.05, 0.75, 0.13), new THREE.Matrix4().makeTranslation(sx * (w / 2 - 0.16), -0.2, -jet - 0.05));
    } else if (i > 0 && st.band !== false && !st.timber) {
      b.add(stone, extrudeProfile([[0, 0], [0.07, 0.02], [0.07, 0.1], [0.03, 0.14], [0, 0.14]], w), new THREE.Matrix4().makeTranslation(-w / 2, -0.07, 0));
    }
    g.add(b.build(`${spec.name}-s${i}`));
  });

  // Roof on the top storey
  const top = storeys[storeys.length - 1];
  const topH = spec.storeys[spec.storeys.length - 1].height;
  const roof = buildRoof(kit, w, depth + J, { trim, sideMaterial: side, sideWorldSize: sideWS, ...spec.roof });
  roof.group.position.y = topH;
  top.add(roof.group);
  // Eaves cornice under an eaves roof on masonry
  if (spec.roof.kind === 'eaves') {
    const cb = new GeometryBucket();
    cb.add(trim, extrudeProfile(PROFILES.cornice(0.22), w), new THREE.Matrix4().makeTranslation(-w / 2, topH - 0.27, 0));
    top.add(cb.build('eaves-cornice'));
  }

  // Downpipes: swan neck from each gutter outlet to the wall, then down the stack.
  if (spec.roof.gutters !== false) {
    const copper = M.get('copper');
    for (const out of roof.outlets) {
      const x = THREE.MathUtils.clamp(out.x, -w / 2 + 0.14, w / 2 - 0.14);
      let level = storeys.length - 1;
      let bkt = new GeometryBucket();
      const yo = topH + out.y;
      pipe(bkt, copper, new THREE.Vector3(out.x, yo, out.z), new THREE.Vector3(out.x, yo - 0.12, out.z));
      bkt.box(copper, 0.18, 0.16, 0.14, 0.02, { x: out.x, y: yo - 0.04, z: out.z }); // hopper head
      pipe(bkt, copper, new THREE.Vector3(out.x, yo - 0.12, out.z), new THREE.Vector3(x, yo - 0.5, 0.09));
      let yTop = yo - 0.5;
      while (level >= 0) {
        const st = spec.storeys[level];
        const yBottom = level === 0 ? 0.08 : 0;
        pipe(bkt, copper, new THREE.Vector3(x, yTop, 0.09), new THREE.Vector3(x, yBottom + (level > 0 && jetties[level] - jetties[level - 1] > 0 ? 0.2 : 0), 0.09));
        for (let y = yBottom + 0.6; y < yTop - 0.2; y += 1.3) bkt.box(M.get('iron'), 0.12, 0.04, 0.1, 0.008, { x, y, z: 0.05 });
        if (level === 0) {
          pipe(bkt, copper, new THREE.Vector3(x, 0.1, 0.09), new THREE.Vector3(x, 0.04, 0.22));
        }
        storeys[level].add(bkt.build('downpipe'));
        if (level === 0) break;
        // Offset across the jetty into the storey below
        const below = spec.storeys[level - 1];
        const jet = jetties[level] - jetties[level - 1];
        bkt = new GeometryBucket();
        const yStart = below.height + 0.2;
        if (jet > 0) pipe(bkt, copper, new THREE.Vector3(x, yStart, jet + 0.09), new THREE.Vector3(x, below.height - 0.35, 0.09));
        yTop = jet > 0 ? below.height - 0.35 : below.height;
        level--;
        void st;
      }
    }
  }

  return { group, storeys, jetties, roof, height: total };
}

/**
 * Apply a sag to one storey: bakes its own meshes (not the storeys above) and
 * droops vertices toward mid-span, fading to zero at the storey's top.
 */
export function sagStorey(storey: THREE.Group, width: number, height: number, sag: number): void {
  const above = storey.children.filter((c) => c.name.startsWith('storey-') || c.name.startsWith('roof'));
  for (const c of above) c.userData.keep = true;
  const merged = mergeStatic(storey, `${storey.name}-sagged`);
  for (const c of above) delete c.userData.keep;
  for (const mesh of merged.children as THREE.Mesh[]) {
    const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      const k = Math.max(0, 1 - (2 * x / width) ** 2) * Math.max(0, 1 - y / height);
      p.setY(i, y - sag * k);
    }
    p.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}
