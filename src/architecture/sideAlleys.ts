/**
 * Side features off the main street:
 *  - Knockturn Alley: a dark, descending mouth branching off the left side
 *    halfway down, with sooty walls, layered gloom and an ominous iron gate.
 *  - Narrow alcoves between future shopfronts: recessed passages with a back
 *    door, roofed by a timber bressumer.
 * (Lane floors are paved by streetSurface from the LaneSpecs in the layout.)
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/random';
import { withBaseGrime, withInstanceUvJitter, type MaterialLibrary } from '../materials';
import { GeometryBucket, chamferBox, mergeStatic, normalizeForMerge } from './kit/geometry';
import { buildWall, type WallMaterials, type WallOpening } from './kit/wall';
import { createFrame, type StreetLayout } from './street';

export interface SideAlleys {
  group: THREE.Group;
  /** The gate's ajar leaf (for future creak animations). */
  gateLeaf: THREE.Object3D;
  stats: Record<string, number>;
}

export function buildSideAlleys(layout: StreetLayout, lib: MaterialLibrary): SideAlleys {
  const group = new THREE.Group();
  group.name = 'side-alleys';
  const knock = buildKnockturn(layout, lib);
  group.add(knock.group);
  const alcoves = buildAlcoves(layout, lib);
  group.add(alcoves);
  return { group, gateLeaf: knock.leaf, stats: { knockturnDraws: knock.group.children.length } };
}

// ---------------------------------------------------------------------------
// Knockturn Alley
// ---------------------------------------------------------------------------

function buildKnockturn(layout: StreetLayout, lib: MaterialLibrary): { group: THREE.Group; leaf: THREE.Object3D } {
  const group = new THREE.Group();
  group.name = 'knockturn-alley';
  const { lane, gateS } = layout.knockturn;
  const S = lane.sampler;
  const hw = lane.halfWidth;
  const f = createFrame();

  const sootyBrick = withBaseGrime(lib.get('brick'), { height: 2.2, strength: 0.9, groundY: S.frame(10).y });
  (sootyBrick as THREE.MeshStandardMaterial).color.setRGB(0.5, 0.47, 0.45);
  const mats: WallMaterials = { wall: sootyBrick, stone: lib.get('sandstone'), timber: lib.get('oak'), door: lib.get('paint-charcoal'), iron: lib.get('iron'), glass: lib.get('glass') };
  const W = layout.widthAtS(layout.knockturn.s);
  const H = 8.5;

  // Walls on both sides of the lane, starting where they meet the main building line.
  for (const side of [-1, 1]) {
    const dl = side * (hw + 0.22);
    const at = (s: number) => { S.frame(s, f); return new THREE.Vector3(f.x + f.nx * dl, f.y, f.z + f.nz * dl); };
    let s0 = 0;
    for (let s = 0; s < 6; s += 0.05) {
      const p = at(s);
      if (layout.lateralOf(p.x, p.z, layout.knockturn.s) < -W / 2) { s0 = s; break; }
    }
    const legs: [number, number][] = [[s0, 10.5], [10.5, S.length - 0.5]];
    legs.forEach(([a, b], li) => {
      const pa = at(a), pb = at(b);
      const len = pa.distanceTo(pb);
      const base = Math.min(pa.y, pb.y) - 0.45;
      const dir = pb.clone().sub(pa).setY(0).normalize();
      const openings: WallOpening[] = li === 0
        ? side < 0
          ? [{ kind: 'boarded', x: 2.2, y: 2.9, width: 0.8, height: 1.3 }, { kind: 'door', x: 5.2, y: 0.42, width: 1.0, height: 2.1, archRise: 0.18 }, { kind: 'blind', x: 3.6, y: 5.2, width: 0.9, height: 1.4 }]
          : [{ kind: 'window', x: 3.0, y: 2.7, width: 0.9, height: 1.2 }, { kind: 'boarded', x: 6.4, y: 3.0, width: 0.8, height: 1.4 }, { kind: 'blind', x: 1.6, y: 5.4, width: 1.0, height: 1.4 }]
        : [{ kind: 'boarded', x: 2.5, y: 2.6, width: 0.8, height: 1.2 }];
      const wall = buildWall({ name: `knockturn-wall-${side}-${li}`, length: len + (li === 0 ? 0.25 : 0), height: H, thickness: 0.4, wallWorldSize: lib.recipe('brick').worldSize, openings, materials: mats });
      // Local +X along the lane for the left wall (front faces lane-right), reversed for the right wall.
      const xAxis = side < 0 ? dir : dir.clone().negate();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, new THREE.Vector3(0, 1, 0));
      const origin = side < 0 ? pa : pb;
      wall.matrixAutoUpdate = false;
      wall.matrix.makeBasis(xAxis, new THREE.Vector3(0, 1, 0), zAxis).setPosition(origin.x, base, origin.z);
      group.add(wall);
    });
  }

  // End wall closing the far end (lost in the gloom anyway).
  S.frame(S.length - 0.3, f);
  const endWall = buildWall({ name: 'knockturn-end', length: hw * 2 + 1.2, height: H, thickness: 0.4, wallWorldSize: lib.recipe('brick').worldSize, materials: mats, openings: [{ kind: 'door', x: 1.4, y: 0.45, width: 1.0, height: 2.0, archRise: 0.2 }] });
  endWall.matrixAutoUpdate = false;
  const tX = new THREE.Vector3(f.nx, 0, f.nz).negate(); // facing back toward the mouth
  endWall.matrix.makeBasis(tX, new THREE.Vector3(0, 1, 0), new THREE.Vector3(-f.tx, 0, -f.tz))
    .setPosition(f.x + f.nx * (hw + 0.6), f.y - 0.45, f.z + f.nz * (hw + 0.6));
  group.add(endWall);

  mergeStatic(group, 'knockturn-static');

  // Layered gloom: translucent black veils deepening toward the far end.
  const gloomMat = (a: number) => new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: a, depthWrite: false, side: THREE.DoubleSide, fog: false });
  [[5, 0.2], [7.5, 0.3], [10, 0.4], [12.5, 0.5], [15, 0.65], [17.5, 0.85]].forEach(([s, a]) => {
    S.frame(s, f);
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 0.5, 9), gloomMat(a));
    veil.position.set(f.x, f.y + 4.2, f.z);
    veil.lookAt(f.x + f.tx, f.y + 4.2, f.z + f.tz);
    veil.renderOrder = 3;
    veil.name = 'gloom';
    group.add(veil);
  });
  // Faint sickly light deep inside.
  S.frame(11, f);
  const sick = new THREE.PointLight(0x7fd08a, 2.2, 9, 2);
  sick.position.set(f.x + f.nx * 0.6, f.y + 2.6, f.z + f.nz * 0.6);
  group.add(sick);

  // The gate
  const gate = buildGate(lib, hw * 2 + 0.06);
  S.frame(gateS, f);
  gate.group.matrixAutoUpdate = false;
  gate.group.matrix.makeBasis(new THREE.Vector3(f.nx, 0, f.nz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-f.tx, 0, -f.tz))
    .setPosition(f.x, f.y + 0.02, f.z);
  group.add(gate.group);
  return { group, leaf: gate.leaf };
}

/** Wrought-iron double gate with spear-topped bars, arched overthrow, scrolls and a hanging sign. Faces +Z. */
function buildGate(lib: MaterialLibrary, span: number): { group: THREE.Group; leaf: THREE.Object3D } {
  const rng = new SeededRandom('knockturn-gate');
  const iron = withInstanceUvJitter(lib.get('iron'), 'gate');
  const ironPlain = lib.get('iron');
  const group = new THREE.Group();
  group.name = 'knockturn-gate';
  const leafW = span / 2 - 0.08;
  const H = 2.45;

  // Posts
  const posts = new GeometryBucket();
  for (const sx of [-1, 1]) {
    posts.box(ironPlain, 0.09, 3.05, 0.09, 0.012, { x: sx * (span / 2 - 0.045), y: 1.525, z: 0 });
    posts.add(ironPlain, new THREE.SphereGeometry(0.07, 10, 8), new THREE.Matrix4().makeTranslation(sx * (span / 2 - 0.045), 3.12, 0));
  }
  // Overthrow arch + spikes + scrolls
  const arch = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-span / 2 + 0.05, 2.95, 0), new THREE.Vector3(0, 3.9, 0), new THREE.Vector3(span / 2 - 0.05, 2.95, 0));
  posts.add(ironPlain, new THREE.TubeGeometry(arch, 40, 0.02, 6, false));
  posts.box(ironPlain, span - 0.1, 0.035, 0.035, 0.006, { x: 0, y: 2.93, z: 0 });
  const scroll = (cx: number, mirror: number) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = t * Math.PI * 3.2, r = 0.16 * (1 - t * 0.85);
      pts.push(new THREE.Vector3(cx + mirror * Math.cos(a) * r, 3.12 + Math.sin(a) * r, 0));
    }
    posts.add(ironPlain, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.011, 5, false));
  };
  scroll(-0.55, 1); scroll(0.55, -1); scroll(-0.95, 1); scroll(0.95, -1);
  group.add(posts.build('gate-frame'));

  const spikeGeo = mergeGeometries([
    normalizeForMerge(new THREE.ConeGeometry(0.028, 0.16, 6).translate(0, 0.08, 0)),
    normalizeForMerge(new THREE.SphereGeometry(0.022, 6, 4).translate(0, -0.005, 0)),
  ])!;
  const archSpikes = new THREE.InstancedMesh(spikeGeo, iron, 9);
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    const p = arch.getPoint(t);
    archSpikes.setMatrixAt(i, new THREE.Matrix4().compose(p, new THREE.Quaternion(), new THREE.Vector3(1, 1.2 + 0.6 * Math.sin(t * Math.PI), 1)));
  }
  group.add(archSpikes);

  // Hanging sign (procedural lettering on an offscreen canvas)
  const sign = makeSignTexture('KNOCKTURN ALLEY');
  const plate = new THREE.Mesh(chamferBox(1.15, 0.26, 0.025, 0.008), [
    new THREE.MeshStandardMaterial({ map: sign, roughness: 0.6, metalness: 0.4 }),
  ][0]);
  // chamferBox UVs are metric; remap the front face to 0..1.
  const uv = plate.geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 1.15 + 0.5, uv.getY(i) / 0.26 + 0.5);
  plate.position.set(0, 3.42, 0.03);
  plate.rotation.z = 0.035;
  plate.castShadow = true;
  group.add(plate);

  // Leaves (each pivots on its hinge post)
  let ajar: THREE.Object3D = group;
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * (span / 2 - 0.09), 0, 0);
    const leaf = new GeometryBucket();
    const x0 = -side * 0; // leaf spans from hinge toward the centre
    const cx = -side * leafW / 2;
    leaf.box(ironPlain, leafW, 0.05, 0.04, 0.008, { x: cx, y: 0.12, z: 0 });
    leaf.box(ironPlain, leafW, 0.05, 0.04, 0.008, { x: cx, y: 0.95, z: 0 });
    leaf.box(ironPlain, leafW, 0.05, 0.04, 0.008, { x: cx, y: H, z: 0 });
    leaf.box(ironPlain, 0.05, H + 0.05, 0.05, 0.008, { x: x0 - side * 0.025, y: H / 2, z: 0 });
    leaf.box(ironPlain, 0.045, H + 0.05, 0.045, 0.008, { x: -side * (leafW - 0.02), y: H / 2, z: 0 });
    // Circle motifs between the lower rails
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.TorusGeometry(0.11, 0.012, 6, 20);
      leaf.add(ironPlain, ring, new THREE.Matrix4().makeTranslation(-side * (0.18 + k * (leafW - 0.36) / 2), 0.54, 0));
    }
    pivot.add(leaf.build('gate-leaf'));

    const nBars = Math.round(leafW / 0.11);
    const bars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.011, 0.011, 1, 6).translate(0, 0.5, 0), iron, nBars);
    const tips = new THREE.InstancedMesh(spikeGeo, iron, nBars);
    for (let k = 0; k < nBars; k++) {
      const x = -side * (0.06 + (k * (leafW - 0.12)) / Math.max(1, nBars - 1));
      const tall = H + 0.08 + 0.12 * Math.sin((k / (nBars - 1)) * Math.PI) * (side < 0 ? 1 : 1);
      bars.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(x, 0.1, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rng.range(-0.008, 0.008))), new THREE.Vector3(1, tall - 0.1, 1)));
      tips.setMatrixAt(k, new THREE.Matrix4().makeTranslation(x, tall, 0));
    }
    for (const m of [bars, tips]) { m.castShadow = true; m.computeBoundingSphere(); pivot.add(m); }
    if (side < 0) { pivot.rotation.y = THREE.MathUtils.degToRad(24); ajar = pivot; } // left leaf hangs ajar
    else pivot.rotation.y = THREE.MathUtils.degToRad(-2);
    group.add(pivot);
  }
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true; });
  return { group, leaf: ajar };
}

function makeSignTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 232;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#2a2622'); grad.addColorStop(1, '#14110f');
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  // pitting
  const rng = new SeededRandom('sign');
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${rng.pick(['70,40,20', '0,0,0', '110,90,70'])},${rng.range(0.08, 0.3)})`; g.fillRect(rng.range(0, c.width), rng.range(0, c.height), rng.range(1, 5), rng.range(1, 4)); }
  g.strokeStyle = '#8a7a62'; g.lineWidth = 8; g.strokeRect(14, 14, c.width - 28, c.height - 28);
  g.font = 'bold 104px Georgia, "Times New Roman", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#050403'; g.fillText(text, c.width / 2 + 3, c.height / 2 + 6);
  g.fillStyle = '#b9a47f'; g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Alcoves
// ---------------------------------------------------------------------------

function buildAlcoves(layout: StreetLayout, lib: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  group.name = 'alcoves';
  const brick = lib.recipe('brick').worldSize;
  const mats: WallMaterials = { wall: lib.get('brick'), stone: lib.get('sandstone'), timber: lib.get('oak'), door: lib.get('oak'), iron: lib.get('iron') };
  const flagMats: THREE.Matrix4[] = [];
  const rng = new SeededRandom('alcoves');
  const H = 4.4;

  for (const al of layout.alcoves) {
    const tr = layout.getStreetTransform(al.s / layout.length, al.side, 0);
    const local = new THREE.Group();
    local.name = `alcove-${al.s}`;
    local.matrixAutoUpdate = false;
    local.matrix.copy(tr.matrix);
    const hw = al.width / 2, D = al.depth;
    const grime = withBaseGrime(lib.get('brick'), { groundY: tr.groundY, height: 1.0, strength: 0.6 });
    const m = { ...mats, wall: grime };

    const lw = buildWall({ name: 'alcove-l', length: D, height: H, thickness: 0.3, wallWorldSize: brick, materials: m, plinth: false });
    lw.rotation.y = Math.PI / 2; lw.position.set(-hw - 0.15, 0, 0);
    const rw = buildWall({ name: 'alcove-r', length: D, height: H, thickness: 0.3, wallWorldSize: brick, materials: m, plinth: false });
    rw.rotation.y = -Math.PI / 2; rw.position.set(hw + 0.15, 0, -D);
    const bw = buildWall({
      name: 'alcove-back', length: al.width + 0.6, height: H, thickness: 0.3, wallWorldSize: brick, materials: m,
      openings: [{ kind: 'door', x: 0.3 + hw - 0.45, y: 0.02, width: 0.9, height: 2.05, archRise: 0.16 }],
    });
    bw.position.set(-hw - 0.3, 0, -D - 0.15);
    local.add(lw, rw, bw);

    // Timber bressumer bridging the mouth, on carved brackets
    const top = new GeometryBucket();
    top.box(mats.timber, al.width + 0.7, 0.28, 0.34, 0.03, { x: 0, y: 3.15, z: -0.17 });
    for (const sx of [-1, 1]) top.box(mats.timber, 0.14, 0.55, 0.14, 0.02, { x: sx * (hw - 0.05), y: 2.8, z: -0.12 }, new THREE.Euler(0, 0, sx * -0.6));
    local.add(top.build('alcove-beam'));

    for (let z = -0.02; z > -D; ) {
      const dz = Math.min(rng.range(0.45, 0.7), D + z);
      for (let x = -hw; x < hw; ) {
        const w = Math.min(rng.range(0.45, 0.75), hw - x);
        if (w > 0.1) flagMats.push(tr.matrix.clone().multiply(new THREE.Matrix4().compose(
          new THREE.Vector3(x + w / 2, -0.045 + rng.range(-0.006, 0.006), z - dz / 2),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.015, 0.015), rng.range(-0.02, 0.02), rng.range(-0.015, 0.015))),
          new THREE.Vector3(w - 0.012, 1, dz - 0.012))));
        x += w;
      }
      z -= dz;
    }
    group.add(local);
  }
  mergeStatic(group, 'alcoves-static');
  const flags = new THREE.InstancedMesh(chamferBox(1, 0.08, 1, 0.012, lib.recipe('sandstone').worldSize), withInstanceUvJitter(lib.get('sandstone'), 'alcove-flags'), flagMats.length);
  flagMats.forEach((mm, i) => flags.setMatrixAt(i, mm));
  flags.castShadow = flags.receiveShadow = true;
  flags.computeBoundingSphere();
  flags.name = 'alcove-flags';
  group.add(flags);
  return group;
}
