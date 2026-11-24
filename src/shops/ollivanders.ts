/**
 * Ollivanders — Makers of Fine Wands. A narrow, peeling dark-navy front with
 * faded gold-leaf serif lettering over a bowed bay window, a visibly sagging
 * first floor, a steep fretted gable, and a single velvet cushion bearing one
 * wand in the window, with wand boxes stacked to the ceiling behind.
 */
import * as THREE from 'three';
import { buildHangingSign, buildTownhouse, mergeStatic, planShopfront, sagStorey } from '../architecture/kit';
import { propKind, BINDINGS } from '../props/displays';
import type { ShopModule } from './index';

export const OLLIVANDERS: ShopModule = {
  id: 'ollivanders',
  name: 'Ollivanders',
  frontage: 4.4,
  depth: 8,
  build({ kit }) {
    const rng = kit.useRng('ollivanders');
    const M = kit.mats;
    const w = 4.4;
    const navy = M.get('paint-indigo');
    const floor = 0.32;
    const sf = planShopfront(kit, w, {
      height: 3.85,
      items: [{ kind: 'bay', width: 2.35, projection: 0.55, panes: [2, 4], facets: 5 }, { kind: 'door', width: 0.92, glazed: false }],
      name: 'OLLIVANDERS', sub: 'Makers of Fine Wands since 382 B.C.', letterStyle: 'gold', fasciaColor: '#121a34',
      paint: navy, muntin: M.tinted('oak', 0x5a5a6a, 'dark-muntin'), floor, wear: 0.7, interiorGlow: 0xd89a50, interior: 'oak',
    });
    const house = buildTownhouse(kit, {
      name: 'ollivanders', width: w, depth: 8, side: 'brick', trim: navy,
      storeys: [
        { height: 3.85, material: navy, worldSize: 0.9, openings: sf.openings, lean: [0.4, -0.2] },
        { height: 3.05, material: navy, worldSize: 0.9, lean: [2.2, -1.1], openings: [{ kind: 'window', x: 1.3, y: 0.8, width: 1.8, height: 1.5 }] },
        { height: 2.7, material: navy, worldSize: 0.9, lean: [2.6, 0.9], openings: [{ kind: 'window', x: 0.75, y: 0.75, width: 0.9, height: 1.3 }, { kind: 'boarded', x: 2.75, y: 0.8, width: 0.9, height: 1.2 }] },
      ],
      roof: { kind: 'gable', pitch: 57, chimneys: [{ x: -0.6, zf: 0.78, flues: 2, height: 1.5 }], gableMaterial: navy, gableWorldSize: 0.9, fretwork: true },
    });
    const ground = house.storeys[0];
    const built = sf.build(ground);

    // The window: one velvet cushion on a turned stand, one wand.
    const bay = built.displays[0];
    const velvet = M.get('velvet');
    const cushion = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 16), velvet);
    pad.scale.set(0.36, 0.09, 0.24);
    pad.position.y = 0.36;
    const stand = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.17, 0.03], [0.07, 0.08], [0.05, 0.22], [0.09, 0.27], [0.13, 0.29], [0, 0.29]].map(([x, y]) => new THREE.Vector2(x, y)), 18), M.get('oak'));
    cushion.add(stand, pad);
    for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) {
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.09, 8), M.get('brass'));
      tassel.position.set(x, 0.31, z);
      cushion.add(tassel);
    }
    const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.011, 0.36, 8).rotateZ(Math.PI / 2), M.tinted('oak', 0x3a2a20, 'wand'));
    wand.position.set(0.02, 0.455, 0.02);
    wand.rotation.y = 0.35;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.1, 8).rotateZ(Math.PI / 2), M.tinted('oak', 0x22160f, 'wand-handle'));
    handle.position.set(-0.13, 0.455, -0.045);
    handle.rotation.y = 0.35;
    cushion.add(wand, handle);
    cushion.position.set(0, 0, bay.bay.displaySize.depth * 0.35);
    cushion.traverse((o) => { o.castShadow = true; });
    bay.anchor.add(cushion);

    // Behind: shelves of wand boxes climbing into the gloom.
    const shelfZ = -bay.bay.displaySize.interiorDepth + 0.15;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        const stack = rng.int(2, 5);
        for (let k = 0; k < stack; k++) {
          kit.instances.put(propKind(kit, 'wandbox'), bay.anchor,
            { x: -1.0 + col * 0.33 + rng.range(-0.03, 0.03), y: -0.3 + row * 0.36 + k * 0.053, z: shelfZ + rng.range(-0.03, 0.05) },
            new THREE.Euler(0, Math.PI / 2 + rng.range(-0.12, 0.12), rng.range(-0.02, 0.02)), { x: 1, y: 1, z: 1 },
            rng.pick(BINDINGS).clone().multiplyScalar(0.7));
        }
      }
    }

    sagStorey(house.storeys[1], w, 3.05, 0.13);

    const sign = buildHangingSign(kit, {
      armLength: 1.0,
      board: { width: 0.62, height: 0.44, lettering: { text: 'Wands', ground: '#121a34', style: 'gold', wear: 0.65, seed: 'olli-sign', italic: true }, frame: navy },
      length: 0.6,
    });
    sign.group.position.set(w / 2 - 0.32, 1.25, 0.02);
    house.storeys[1].add(sign.group);

    mergeStatic(house.group, 'ollivanders-static');
    return { group: house.group, doors: built.doors, animators: [sign] };
  },
};
