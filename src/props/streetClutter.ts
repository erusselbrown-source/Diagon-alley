/**
 * Collision-aware street clutter. Along each pavement an occupancy list is
 * seeded with stoops (± a doorway margin), alcove & alley mouths, the
 * courtyard and Gringotts; clusters are only placed in free stretches and
 * hug the building line, so the carriageway and the pavement's walking line
 * stay clear. Everything static is instanced through the kit.
 *
 *  - stacked brass-cornered leather trunks
 *  - hooped oak barrels (some stacked)
 *  - bubbling cast-iron cauldrons with glowing brew + green/violet steam
 *  - chalkboard A-frames
 *  - hanging birdcages on iron brackets with gently bobbing owls (animated)
 *  - weed tufts in curb joints, gutter edges and wall bases
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/random';
import { chamferBox, normalizeForMerge, type Animator, type Kit } from '../architecture/kit';
import { CURB_WIDTH, type Side, type StreetLayout } from '../architecture/street';
import type { SteamEmitter } from '../fx/steam';
import { propKind, trunkStack } from './displays';

/** A pavement footprint measured from the building line (for walk collision). */
export interface ClutterFootprint { side: Side; s0: number; s1: number; depth: number }
export interface StreetClutter { group: THREE.Group; steam: SteamEmitter[]; animators: Animator[]; stats: Record<string, number>; footprints: ClutterFootprint[] }

const C = (h: number) => new THREE.Color(h);
const merge = (...gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => normalizeForMerge(g)))!;

function chalkMaterial(kit: Kit): THREE.MeshStandardMaterial {
  return kit.mats.memo('chalkboard', () => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 384;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1c2420'; g.fillRect(0, 0, 256, 384);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(220,230,220,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 384, 3, 2); }
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 14; g.strokeRect(0, 0, 256, 384);
    const lines = ['TODAY', 'Cauldron Cakes', '3 Knuts', '~', 'Pumpkin Juice', 'Fizzing Whizzbees', 'Owl Treats ½ price'];
    g.textAlign = 'center';
    lines.forEach((l, i) => {
      g.font = `${i === 0 ? 'bold 40px' : 'italic 26px'} Georgia, serif`;
      g.fillStyle = i % 3 === 2 ? '#f2d27a' : '#e8efe6';
      g.fillText(l, 128 + Math.sin(i * 2.1) * 6, 56 + i * 46);
    });
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.95, emissive: new THREE.Color(0.5, 0.52, 0.5), emissiveMap: t, emissiveIntensity: 0.08 });
  }) as THREE.MeshStandardMaterial;
}

function defineKinds(kit: Kit): void {
  const I = kit.instances, M = kit.mats;
  if (I.has('clutter:barrel')) return;
  const staves = new THREE.LatheGeometry([[0, 0], [0.22, 0], [0.25, 0.1], [0.275, 0.4], [0.25, 0.7], [0.22, 0.8], [0.2, 0.8], [0.2, 0.78], [0, 0.78]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  I.define('clutter:barrel', staves, M.jitter('oak'));
  I.define('clutter:hoop', merge(...[0.08, 0.3, 0.5, 0.72].map((y) => new THREE.TorusGeometry(y > 0.2 && y < 0.6 ? 0.276 : 0.24, 0.012, 5, 24).rotateX(Math.PI / 2).translate(0, y, 0))), M.get('iron'));
  const board = new THREE.BoxGeometry(0.56, 0.8, 0.025);
  I.define('clutter:aframe-board', merge(board.clone().rotateX(0.2).translate(0, 0.4, 0.1), board.clone().rotateX(-0.2).translate(0, 0.4, -0.1)), chalkMaterial(kit));
  I.define('clutter:aframe-frame', merge(
    ...[-1, 1].flatMap((sx) => [new THREE.BoxGeometry(0.04, 0.86, 0.04).rotateX(0.2).translate(sx * 0.29, 0.42, 0.1), new THREE.BoxGeometry(0.04, 0.86, 0.04).rotateX(-0.2).translate(sx * 0.29, 0.42, -0.1)]),
    new THREE.BoxGeometry(0.62, 0.05, 0.05).translate(0, 0.84, 0),
  ), M.jitter('oak'));
  I.define('clutter:brew', new THREE.CircleGeometry(0.19, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }), false);
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, h = 0.07 + (i % 3) * 0.03;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.008, 0, 0, 0.008, 0, 0, Math.cos(a) * 0.035, h, Math.sin(a) * 0.035], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    g.computeVertexNormals();
    blades.push(g.rotateY(a));
  }
  I.define('clutter:weed', merge(...blades), M.memo('weed', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide })), false);
  I.define('clutter:bracket', merge(chamferBox(0.05, 0.05, 0.62, 0.008).translate(0, 0, 0.31), chamferBox(0.08, 0.36, 0.03, 0.006).translate(0, -0.1, 0.015),
    chamferBox(0.03, 0.03, 0.45, 0.006).rotateX(0.62).translate(0, -0.14, 0.16)), M.get('iron'));
}

/** Hanging cage (wire) and owl geometry for the dynamic cages. */
function cageGeometry(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.17, 0.008, 4, 22).rotateX(Math.PI / 2), new THREE.TorusGeometry(0.17, 0.008, 4, 22).rotateX(Math.PI / 2).translate(0, 0.34, 0)];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.push(new THREE.CylinderGeometry(0.004, 0.004, 0.34, 3).translate(Math.cos(a) * 0.17, 0.17, Math.sin(a) * 0.17)); }
  g.push(new THREE.SphereGeometry(0.17, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.34, 0), new THREE.CylinderGeometry(0.17, 0.17, 0.02, 16).translate(0, 0.0, 0), new THREE.TorusGeometry(0.035, 0.006, 4, 10).translate(0, 0.53, 0));
  return merge(...g);
}

export function scatterStreetClutter(kit: Kit, layout: StreetLayout, posts: readonly { side: Side; s: number }[] = []): StreetClutter {
  const rng = new SeededRandom('street-clutter');
  defineKinds(kit);
  const group = new THREE.Group();
  group.name = 'street-clutter';
  const steam: SteamEmitter[] = [];
  const animators: Animator[] = [];
  const stats: Record<string, number> = { trunks: 0, barrels: 0, cauldrons: 0, aframes: 0, cages: 0, weeds: 0 };
  const cagePoints: THREE.Matrix4[] = [];
  const footprints: ClutterFootprint[] = [];

  const anchorAt = (s: number, side: Side, inset: number, along = 0): THREE.Object3D => {
    const tr = layout.getStreetTransform(s / layout.length, side, -inset);
    const o = new THREE.Object3D();
    o.matrixAutoUpdate = false;
    o.matrix.copy(tr.matrix).multiply(new THREE.Matrix4().makeTranslation(along, 0, 0));
    o.matrixWorld.copy(o.matrix);
    return o;
  };

  for (const side of ['left', 'right'] as const) {
    // Occupancy along this pavement
    const taken: [number, number][] = [];
    for (const st of layout.stoops.filter((x) => x.side === side)) taken.push([st.s - st.width / 2 - 0.45, st.s + st.width / 2 + 0.45]);
    for (const r of layout.reservations.filter((x) => x.side === side)) taken.push([r.s0 - 0.5, r.s1 + 0.5]);
    for (const p of posts.filter((x) => x.side === side)) taken.push([p.s - 0.55, p.s + 0.55]);
    const free = (a: number, b: number) => !taken.some(([x, y]) => x < b && y > a);

    let s = 1.6;
    while (s < layout.length - 1.5) {
      const kind = rng.pick(['barrels', 'barrels', 'trunks', 'cauldron', 'cauldron', 'aframe', 'cage', 'cage'] as const);
      const fp = kind === 'barrels' ? rng.range(1.0, 1.7) : kind === 'trunks' ? 1.0 : kind === 'cauldron' ? 0.9 : kind === 'aframe' ? 0.75 : 0.6;
      if (!free(s, s + fp)) { s += 0.5; continue; }
      const mid = s + fp / 2;
      const sideSign = side === 'left' ? 1 : -1; // local +X runs with s on the left side
      if (kind === 'cage') {
        // wall-mounted, above head height: doesn't occupy the pavement
        const a = anchorAt(mid, side, 0);
        kit.instances.add('clutter:bracket', a, new THREE.Matrix4().makeTranslation(0, 2.75, 0.02));
        cagePoints.push(a.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 2.73, 0.58)));
        stats.cages++;
        s += fp + rng.range(3, 7);
        continue;
      }
      taken.push([s, s + fp]);
      footprints.push({ side, s0: s - 0.05, s1: s + fp + 0.05, depth: 0.78 });
      if (kind === 'barrels') {
        const n = Math.max(2, Math.round(fp / 0.56));
        const a = anchorAt(mid, side, 0.34);
        for (let i = 0; i < n; i++) {
          const x = sideSign * (-fp / 2 + 0.28 + i * 0.56);
          const rot = new THREE.Euler(0, rng.range(0, 6.28), rng.range(-0.02, 0.02));
          const col = C(0xffffff).multiplyScalar(rng.range(0.7, 1.05));
          kit.instances.put('clutter:barrel', a, { x, y: 0, z: rng.range(-0.04, 0.04) }, rot, { x: 1, y: 1, z: 1 }, col);
          kit.instances.put('clutter:hoop', a, { x, y: 0, z: 0 }, rot, { x: 1, y: 1, z: 1 });
        }
        if (n >= 2 && rng.chance(0.5)) {
          // one lying across the top
          kit.instances.put('clutter:barrel', a, { x: 0.4 * sideSign, y: 0.8 + 0.26, z: 0 }, new THREE.Euler(Math.PI / 2, 0, 0.1), { x: 0.85, y: 0.85, z: 0.85 }, C(0xd8c0a0));
        }
        stats.barrels += n;
      } else if (kind === 'trunks') {
        trunkStack(kit, anchorAt(mid, side, 0.36), 0, 0, 0, rng.int(2, 3), rng, 0.85);
        stats.trunks++;
      } else if (kind === 'cauldron') {
        const a = anchorAt(mid, side, 0.42);
        const sc = rng.range(1.3, 1.6);
        kit.instances.put(propKind(kit, 'cauldron'), a, { x: 0, y: 0, z: 0 }, new THREE.Euler(0, rng.range(0, 6), 0), { x: sc, y: sc, z: sc }, C(0x343436));
        const brew = rng.chance(0.5) ? new THREE.Color(0.35, 1.0, 0.45) : new THREE.Color(0.75, 0.35, 1.0);
        kit.instances.put('clutter:brew', a, { x: 0, y: 0.27 * sc, z: 0 }, null, { x: sc, y: 1, z: sc }, brew.clone().multiplyScalar(1.8));
        steam.push({ position: new THREE.Vector3(0, 0.3 * sc, 0).applyMatrix4(a.matrix), color: brew });
        stats.cauldrons++;
      } else {
        // A-frame near the building line, boards facing along the street
        const a = anchorAt(mid, side, 0.4);
        const rot = new THREE.Euler(0, Math.PI / 2 + rng.range(-0.15, 0.15), 0);
        kit.instances.put('clutter:aframe-board', a, { x: 0, y: 0, z: 0 }, rot, { x: 1, y: 1, z: 1 });
        kit.instances.put('clutter:aframe-frame', a, { x: 0, y: 0, z: 0 }, rot, { x: 1, y: 1, z: 1 }, C(0x9a7a5a));
        stats.aframes++;
      }
      s += fp + rng.range(2.2, 5.5);
    }

    // Weeds in curb joints, gutter edges and wall bases (never on stoops)
    for (let w = 0.5; w < layout.length - 0.5; w += rng.range(0.35, 1.6)) {
      if (!free(w, w + 0.05) && rng.chance(0.85)) continue;
      const W = layout.widthAtS(w);
      const curbs = w < layout.plazaS ? [layout.carriageHalfWidth(w) + CURB_WIDTH + 0.01, layout.carriageHalfWidth(w) - 0.005] : [];
      const ds = [...curbs, W / 2 - 0.03];
      const d = rng.pick(ds);
      const a = anchorAt(w, side, W / 2 - d);
      const sc = rng.range(0.6, 1.5);
      const groundFix = d < W / 2 - 0.5 && curbs.length && d === curbs[1] ? -0.15 : 0; // gutter edge sits at road level
      kit.instances.put('clutter:weed', a, { x: 0, y: groundFix, z: 0 }, new THREE.Euler(0, rng.range(0, 6.28), 0), { x: sc, y: sc, z: sc },
        new THREE.Color().setHSL(rng.range(0.22, 0.32), rng.range(0.35, 0.6), rng.range(0.18, 0.32)));
      stats.weeds++;
    }
  }

  // Hanging cages with owls: dynamic instanced meshes, swaying and bobbing.
  const M = kit.mats;
  const n = cagePoints.length;
  const cages = new THREE.InstancedMesh(cageGeometry(), M.get('brass'), n);
  const owlGeo = merge(new THREE.SphereGeometry(0.085, 10, 8).scale(1, 1.25, 0.95).translate(0, 0.11, 0), new THREE.SphereGeometry(0.062, 10, 8).translate(0, 0.235, 0.01),
    new THREE.ConeGeometry(0.018, 0.045, 4).translate(-0.038, 0.29, 0), new THREE.ConeGeometry(0.018, 0.045, 4).translate(0.038, 0.29, 0));
  const owls = new THREE.InstancedMesh(owlGeo, M.display('leather', 0.25), n);
  const eyes = new THREE.InstancedMesh(merge(new THREE.SphereGeometry(0.015, 6, 4).translate(-0.024, 0.24, 0.058), new THREE.SphereGeometry(0.015, 6, 4).translate(0.024, 0.24, 0.058)), M.glow(0xffb020, 2.4), n);
  const owlCols = [C(0x8a6a4a), C(0xe8e4dc), C(0x5a4632), C(0xb08a60)];
  for (let i = 0; i < n; i++) owls.setColorAt(i, rng.pick(owlCols));
  for (const m of [cages, owls, eyes]) { m.frustumCulled = false; m.castShadow = m === cages; group.add(m); }
  const phase = cagePoints.map(() => [rng.range(0, 6.28), rng.range(0.8, 1.4), rng.range(0, 6.28)]);
  const mm = new THREE.Matrix4(), sway = new THREE.Matrix4(), hang = new THREE.Matrix4().makeTranslation(0, -0.6, 0), owlM = new THREE.Matrix4();
  animators.push({
    update(_dt, t) {
      for (let i = 0; i < n; i++) {
        const [p, sp, hp] = phase[i];
        sway.makeRotationFromEuler(new THREE.Euler(0.05 * Math.sin(t * sp + p), 0, 0.06 * Math.sin(t * sp * 0.8 + p * 1.3)));
        mm.copy(cagePoints[i]).multiply(sway).multiply(hang);
        cages.setMatrixAt(i, mm);
        const bob = 0.012 * Math.abs(Math.sin(t * 2.6 + p));
        const look = Math.sin(t * 0.4 + hp) > 0.7 ? Math.sin(t * 3 + hp) * 0.9 : 0.25 * Math.sin(t * 0.5 + hp);
        owlM.copy(mm).multiply(new THREE.Matrix4().compose(new THREE.Vector3(0, 0.02 + bob, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, look, 0)), new THREE.Vector3(1, 1, 1)));
        owls.setMatrixAt(i, owlM);
        eyes.setMatrixAt(i, owlM);
      }
      cages.instanceMatrix.needsUpdate = owls.instanceMatrix.needsUpdate = eyes.instanceMatrix.needsUpdate = true;
    },
  });
  animators[0].update(0, 0);
  return { group, steam, animators, stats, footprints };
}
