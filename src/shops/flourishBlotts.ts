/**
 * Flourish & Blotts — booksellers. Warm burgundy-painted timber framing over
 * cream plaster, jettied twice; twin bow windows running floor to ceiling on
 * the ground floor with a matching corbelled pair stacked above, all crammed
 * with crooked towers of leather-bound books; a hanging brass open-book sign.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBayWindow, buildHangingSign, buildTownhouse, mergeStatic, normalizeForMerge, planShopfront } from '../architecture/kit';
import { bookTower, fillDisplay } from '../props/displays';
import type { ShopModule } from './index';

export const FLOURISH_BLOTTS: ShopModule = {
  id: 'flourish-blotts',
  name: 'Flourish & Blotts',
  frontage: 7.6,
  depth: 8.5,
  build({ kit }) {
    const rng = kit.useRng('flourish-blotts');
    const M = kit.mats;
    const w = 7.6;
    const burgundy = M.get('paint-oxblood');
    const cream = M.tinted('plaster', 0xf6e8c8, 'fb-cream');
    const floor = 0.16;
    const bayW = 2.45;
    const sf = planShopfront(kit, w, {
      height: 3.95,
      items: [{ kind: 'bay', width: bayW, projection: 0.62, panes: [2, 5], facets: 7 }, { kind: 'door', width: 1.1, fanlight: true }, { kind: 'bay', width: bayW, projection: 0.62, panes: [2, 5], facets: 7 }],
      name: 'Flourish and Blotts', sub: 'Booksellers & Purveyors of Rare Volumes', letterStyle: 'gold', fasciaColor: '#3d0b10',
      paint: burgundy, floor, wear: 0.2, interiorGlow: 0xffb468, interior: 'oak', fasciaHeight: 0.6,
    });
    // Upper bays sit directly above the ground ones.
    const ground0 = sf.openings.filter((o) => o.kind === 'void');
    const bayXs = [ground0[0], ground0[2]].map((o) => o.x + o.width / 2);
    const upperOpen = bayXs.map((cx) => ({ kind: 'void' as const, x: cx - bayW / 2, y: 0.3, width: bayW, height: 2.45 }));
    const house = buildTownhouse(kit, {
      name: 'flourish-blotts', width: w, depth: 8.5, side: 'brick', trim: burgundy,
      storeys: [
        { height: 3.95, material: burgundy, worldSize: 0.9, openings: sf.openings, lean: [0.3, 0.2] },
        { height: 3.3, material: cream, worldSize: 1.5, jetty: 0.36, timber: true, timberMaterial: burgundy, openings: [...upperOpen, { kind: 'window', x: w / 2 - 0.45, y: 0.9, width: 0.9, height: 1.5 }], lean: [1.6, -0.8] },
        { height: 2.95, material: cream, worldSize: 1.5, jetty: 0.3, timber: true, timberMaterial: burgundy, openings: [0.18, 0.5, 0.82].map((f) => ({ kind: 'window' as const, x: w * f - 0.5, y: 0.8, width: 1.0, height: 1.4 })), lean: [1.9, 1.0] },
      ],
      roof: { kind: 'eaves', pitch: 52, dormers: 2, chimneys: [{ x: -w / 2 + 0.8, flues: 3 }, { x: w / 2 - 0.9, flues: 2, zf: 0.6 }], trim: burgundy },
    });
    const ground = house.storeys[0];
    const built = sf.build(ground);
    for (const d of built.displays) fillDisplay(kit, d, 'books', rng);

    // Stacked upper bow windows on carved brackets, also full of books.
    for (const cx of bayXs) {
      const bay = buildBayWindow({
        width: bayW, height: 2.3, projection: 0.55, sill: 0, facets: 7, panes: [2, 4], frame: burgundy, glass: M.get('glass'),
        stone: M.get('sandstone'), interior: M.interior('oak', 0xffb468, 0.5), corbels: 3, corbelMaterial: burgundy,
      });
      bay.group.position.set(cx - w / 2, 0.32, 0);
      house.storeys[1].add(bay.group);
      for (let i = 0; i < 6; i++) {
        const x = -bayW / 2 + 0.25 + (i * (bayW - 0.5)) / 5;
        bookTower(kit, bay.display, x, rng.range(-0.25, 0.25), rng.range(0.9, 2.1), rng, 0.04);
      }
    }

    // Hanging brass open-book sign
    const brass = M.get('brass');
    const pages: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      const cover = new THREE.BoxGeometry(0.03, 0.46, 0.34).translate(0, 0, 0.17);
      cover.rotateY(sx * 0.55);
      pages.push(normalizeForMerge(cover));
      for (let k = 0; k < 4; k++) {
        const pg = new THREE.BoxGeometry(0.012, 0.42, 0.3).translate(0, 0, 0.16);
        pg.rotateY(sx * (0.45 - k * 0.09)).translate(sx * 0.015 * k, 0, 0);
        pages.push(normalizeForMerge(pg));
      }
    }
    pages.push(normalizeForMerge(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 10)));
    const book = new THREE.Mesh(mergeGeometries(pages)!, brass);
    book.rotation.y = Math.PI / 2; // spine toward the wall, pages open along the street
    book.position.y = -0.3;
    book.castShadow = true;
    const body = new THREE.Group();
    body.add(book);
    const sign = buildHangingSign(kit, { armLength: 1.25, body, length: 0.6 });
    sign.group.position.set(-w / 2 + 0.45, 1.35, 0.02);
    house.storeys[1].add(sign.group);

    mergeStatic(house.group, 'flourish-blotts-static');
    return { group: house.group, doors: built.doors, animators: [sign] };
  },
};
