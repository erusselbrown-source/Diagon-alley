/**
 * Framing for the Y-junction: terraces of crooked townhouses lining both
 * branch lanes that diverge behind Gringotts, receding into layered mist so
 * the city feels endless. Built with the same kit (recessed windows, sills,
 * jetties, slate roofs, smoking chimneys) — just without shopfronts — and a
 * mix of warmly lit and dark windows.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import { buildTownhouse, mergeByCell, type Kit, type StoreySpec } from './kit';
import type { WallOpening } from './kit/wall';
import { createFrame, type Side, type StreetLayout } from './street';
import type { MistCard } from '../fx/mist';

export interface ForkFraming { group: THREE.Group; mist: MistCard[]; stats: Record<string, number> }

export function buildForkTerraces(kit: Kit, layout: StreetLayout): ForkFraming {
  const rng = new SeededRandom('fork-terraces');
  const M = kit.mats;
  const raw = new THREE.Group();
  const litGlass = M.memo('lit-glass', () => { const g = M.get('glass').clone(); g.emissive = new THREE.Color(1, 0.66, 0.32); g.emissiveIntensity = 0.7; g.name = 'glass-lit'; return g; });
  const walls = [
    () => M.tinted('brick', 0x8c8682, 'sooty'), () => M.tinted('brick', 0xa87d70, 'dark-red'),
    () => M.tinted('plaster', 0xa4a6aa, 'grey-plaster'), () => M.tinted('plaster', 0x9aa4b8, 'blue-plaster'),
  ];
  const trims = ['paint-charcoal', 'paint-indigo', 'paint-oxblood', 'paint-emerald'] as const;
  let houses = 0;
  const mist: MistCard[] = [];
  const f = createFrame();

  for (const lane of layout.lanes.filter((l) => l.name.startsWith('branch'))) {
    const outer: Side = lane.name === 'branch-left' ? 'left' : 'right';
    const inner: Side = outer === 'left' ? 'right' : 'left';
    for (const [side, s0] of [[outer, 3.4], [inner, 15.6]] as const) {
      let s = s0;
      while (s < 38) {
        const w = Math.min(rng.range(4.4, 6.6), 40 - s);
        const tr = layout.laneFrontageTransform(lane, side, s, w);
        const label = `${lane.name}-${side}-${Math.round(s)}`;
        kit.useRng(label);
        const wallMat = rng.pick(walls)();
        const tudor = rng.chance(0.35);
        const nUp = rng.int(2, 3);
        const storeys: StoreySpec[] = [];
        const doorX = rng.range(0.4, w - 1.4);
        const ground: WallOpening[] = [{ kind: 'door', x: doorX, y: 0.05, width: 1.0, height: 2.2, archRise: rng.chance(0.4) ? 0.18 : 0 }];
        if (w - doorX - 1.0 > 1.6) ground.push({ kind: 'window', x: doorX + 1.4, y: 0.9, width: Math.min(1.6, w - doorX - 2.0), height: 1.6 });
        else if (doorX > 1.6) ground.push({ kind: 'window', x: 0.4, y: 0.9, width: Math.min(1.6, doorX - 0.8), height: 1.6 });
        storeys.push({ height: 3.4, material: wallMat, worldSize: 0.9, openings: ground });
        const n = Math.max(1, Math.round(w / 2));
        for (let i = 0; i < nUp; i++) {
          const ow: WallOpening[] = [];
          for (let k = 0; k < n; k++) ow.push({ kind: rng.chance(0.12) ? 'boarded' : 'window', x: (w * (k + 0.5)) / n - 0.45, y: 0.85, width: 0.9, height: 1.4 });
          storeys.push({ height: rng.range(2.7, 3.0), material: tudor ? M.get('plaster') : wallMat, worldSize: 0.9, openings: ow, jetty: tudor ? rng.range(0.25, 0.4) : 0, timber: tudor, lean: [rng.range(1, 2.6), rng.range(-1, 1)] });
        }
        const house = buildTownhouse(kit, {
          name: label, width: w, depth: 7, storeys, side: 'brick', trim: M.get(rng.pick([...trims])),
          glass: rng.chance(0.45) ? litGlass : M.get('glass'),
          roof: { kind: rng.chance(0.5) ? 'gable' : 'eaves', pitch: rng.range(48, 58), dormers: rng.int(0, 1), chimneys: [{ x: rng.range(-w / 3, w / 3), zf: rng.range(0.4, 0.7) }] },
        });
        house.group.matrixAutoUpdate = false;
        house.group.matrix.copy(tr.matrix);
        raw.add(house.group);
        houses++;
        s += w;
      }
    }
    // Mist: cards across the lane, thickening with distance.
    for (let s = 8; s <= 44; s += 4) {
      lane.sampler.frame(s, f);
      mist.push({ position: new THREE.Vector3(f.x, f.y - 0.2, f.z), facing: new THREE.Vector3(f.tx, 0, f.tz), width: 20, height: 18, density: 0.07 + 0.42 * ((s - 8) / 36) });
    }
  }
  // Mist banks behind Gringotts and the fork.
  const site = layout.gringottsSite();
  for (const [z, d] of [[-14, 0.25], [-20, 0.4], [-27, 0.55], [-36, 0.7]] as const) {
    const p = new THREE.Vector3(0, -0.5, z).applyMatrix4(site.matrix);
    mist.push({ position: p, facing: site.inward.clone(), width: 60, height: 30, density: d });
  }

  raw.updateMatrixWorld(true);
  const batched = mergeByCell(raw, 48, 'fork-terraces');
  const group = new THREE.Group();
  group.name = 'fork-terraces';
  group.add(raw, batched);
  return { group, mist, stats: { forkHouses: houses } };
}
