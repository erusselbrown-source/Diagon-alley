/**
 * Procedurally varied filler shops built entirely from the architecture kit.
 * Twelve trades, each with two possible names, themed window displays, a
 * palette and lettering style; every building varies storeys, walling
 * (brick / Tudor half-timber / painted stucco), jetties, upper windows,
 * optional upper bow window, roof type, dormers, chimneys and signage.
 */
import * as THREE from 'three';
import {
  buildBayWindow, buildHangingSign, buildTownhouse, mergeStatic, planShopfront,
  type Kit, type LetterStyle, type ShopfrontItem, type StoreySpec,
} from '../architecture/kit';
import type { MaterialId } from '../materials';
import { fillDisplay, propKind, trunkStack, type DisplayTheme } from '../props/displays';
import type { ShopBuild, ShopModule } from './index';

export interface Trade {
  id: string;
  names: [string, string];
  sub: string;
  sign: string;
  theme: DisplayTheme;
  paints: MaterialId[];
  fascia: string[];
  letter: LetterStyle;
  awning?: [string, string];
}

export const TRADES: Trade[] = [
  { id: 'apothecary', names: ['Slug & Jiggers Apothecary', "Mr Mulpepper's Apothecary"], sub: 'Ingredients · Remedies · Rare Roots', sign: 'Apothecary', theme: 'apothecary', paints: ['paint-teal', 'paint-emerald'], fascia: ['#0f3a36', '#123a22'], letter: 'gold' },
  { id: 'robes', names: ["Madam Malkin's Robes for All Occasions", "Twilfitt & Tatting's"], sub: 'Robes · Cloaks · Hats', sign: 'Robes', theme: 'robes', paints: ['paint-plum', 'paint-violet'], fascia: ['#3a1226', '#2a1240'], letter: 'gold' },
  { id: 'quidditch', names: ['Quality Quidditch Supplies', 'Broomstix'], sub: 'Brooms · Balls · Team Robes', sign: 'Quidditch', theme: 'quidditch', paints: ['paint-emerald', 'paint-mustard'], fascia: ['#143a24', '#6a4e10'], letter: 'cream' },
  { id: 'owls', names: ['Eeylops Owl Emporium', 'The Owlery Mews'], sub: 'Tawny · Screech · Barn · Brown · Snowy', sign: 'Owls', theme: 'owls', paints: ['paint-ochre', 'paint-charcoal'], fascia: ['#2a2622', '#5a4214'], letter: 'gold' },
  { id: 'icecream', names: ["Florean Fortescue's Ice Cream Parlour", "Fortescue's Sundae Salon"], sub: 'Ices · Sundaes · Sherbets', sign: 'Ices', theme: 'icecream', paints: ['paint-cream', 'paint-magenta'], fascia: ['#f1e6cc', '#5a0e36'], letter: 'black', awning: ['#e8577f', '#f6ecd8'] },
  { id: 'cauldrons', names: ["Potage's Cauldron Shop", 'Cauldrons of Every Size'], sub: 'Pewter · Brass · Copper · Collapsible', sign: 'Cauldrons', theme: 'cauldrons', paints: ['paint-charcoal', 'paint-oxblood'], fascia: ['#1d1f22', '#3a0d10'], letter: 'gold' },
  { id: 'quills', names: ['Scribbulus Writing Implements', "Amanuensis Quills"], sub: 'Quills · Inks · Parchment', sign: 'Quills', theme: 'quills', paints: ['paint-indigo', 'paint-cream'], fascia: ['#121a38', '#efe4c8'], letter: 'gold' },
  { id: 'menagerie', names: ['Magical Menagerie', 'Creatures Great & Small'], sub: 'Familiars · Feed · Cages', sign: 'Menagerie', theme: 'menagerie', paints: ['paint-teal', 'paint-mustard'], fascia: ['#0e2e2e', '#5c4810'], letter: 'cream' },
  { id: 'sweets', names: ["Sugarplum's Sweet Shop", 'The Fizzing Whizzbee'], sub: 'Bonbons · Toffees · Sherbet Lemons', sign: 'Sweets', theme: 'sweets', paints: ['paint-magenta', 'paint-cream'], fascia: ['#6a0f44', '#f0e2c6'], letter: 'cream', awning: ['#b23c8a', '#f8eedc'] },
  { id: 'curios', names: ['Curiosities & Oddments', "Mr Pinchbeck's Junk Shop"], sub: 'Bought · Sold · Not Asked About', sign: 'Curios', theme: 'curios', paints: ['paint-charcoal', 'paint-ochre'], fascia: ['#201c1a', '#4a3a14'], letter: 'gold' },
  { id: 'tea', names: ['The Copper Kettle Tea Rooms', "Madam Puddingfoot's Tea Shop"], sub: 'Teas · Cakes · Tea-Leaf Readings', sign: 'Tea', theme: 'tea', paints: ['paint-cream', 'paint-emerald'], fascia: ['#efe4c8', '#173a26'], letter: 'black', awning: ['#2f6a4a', '#f2ead6'] },
  { id: 'jokes', names: ['Gambol & Japes Joke Shop', 'Dr Filibuster’s Fireworks'], sub: 'Fireworks · Pranks · Wheezes', sign: 'Jokes', theme: 'jokes', paints: ['paint-mustard', 'paint-violet'], fascia: ['#6a4e10', '#2a1240'], letter: 'cream' },
];

export interface FillerOptions {
  trade: Trade;
  nameIndex: 0 | 1;
  frontage: number;
  depth?: number;
  seed: string;
}

export function createFiller(o: FillerOptions): ShopModule {
  const name = o.trade.names[o.nameIndex];
  return {
    id: `filler:${o.seed}`,
    name,
    frontage: o.frontage,
    depth: o.depth ?? 7.5,
    build({ kit }) {
      return buildFiller(kit, o, name);
    },
  };
}

function buildFiller(kit: Kit, o: FillerOptions, name: string): ShopBuild {
  const rng = kit.useRng(o.seed);
  const M = kit.mats;
  const w = o.frontage;
  const t = o.trade;
  const paint = rng.pick(t.paints);
  const fasciaColor = rng.pick(t.fascia);
  const style = rng.pick(['brick', 'brick', 'tudor', 'tudor', 'stucco'] as const);
  const nUp = w < 4 ? rng.int(1, 2) : rng.int(1, 3);
  const steps = rng.int(1, 2);
  const floor = steps * 0.16;

  // Shopfront layout scaled to the frontage
  const items: ShopfrontItem[] =
    w < 3.4 ? [{ kind: 'door', width: 0.95 }, { kind: 'window', width: 1, panes: [2, 3] }]
      : w < 5.2 ? (rng.chance(0.5) ? [{ kind: 'bay', width: 2, panes: [2, 3] }, { kind: 'door' }] : [{ kind: 'door' }, { kind: 'window', width: 2, panes: [3, 3] }])
        : w < 7.2 ? (rng.chance(0.5) ? [{ kind: 'window', width: 1.6 }, { kind: 'door' }, { kind: 'window', width: 1.6 }] : [{ kind: 'bay', width: 2.6, facets: 5 }, { kind: 'door', fanlight: true }])
          : [{ kind: 'bay', width: 2.4 }, { kind: 'door', fanlight: rng.chance(0.5) }, { kind: 'bay', width: 2.4 }];
  const groundH = rng.range(3.7, 4.0);
  const sf = planShopfront(kit, w, {
    height: groundH, items, name, sub: w > 5.5 ? t.sub : undefined, letterStyle: t.letter, fasciaColor, paint,
    floor, wear: rng.range(0.15, 0.5), interiorGlow: rng.pick([0xffb066, 0xffc27a, 0xffa860]),
  });

  // Walling for the upper storeys
  const brickTint = rng.pick([0xffffff, 0xf0c0b0, 0xc89080, 0xa8a8a8]);
  const upperMat = style === 'brick' ? M.tinted('brick', brickTint) : style === 'tudor' ? M.get('plaster') : M.tinted('plaster', rng.pick([0xf4e0c0, 0xd8e4d8, 0xe8d0d8, 0xd8dcec]));
  const upperWS = style === 'brick' ? M.worldSize('brick') : M.worldSize('plaster');
  const winW = Math.min(1.0, (w - 0.8) / Math.max(1, Math.round(w / 2.2)) - 0.35);
  const nWin = Math.max(1, Math.round(w / 2.2));
  const upperBay = w > 4.2 && rng.chance(0.4);
  const storeys: StoreySpec[] = [{ height: groundH, material: style === 'brick' ? M.tinted('brick', brickTint) : M.tinted('plaster', 0xd8d0c0, 'ground'), worldSize: upperWS, openings: sf.openings, lean: [rng.range(0.2, 0.6), rng.range(-0.3, 0.3)] }];
  for (let i = 0; i < nUp; i++) {
    const h = rng.range(2.8, 3.15) - i * 0.1;
    const openings = [];
    if (i === 0 && upperBay) {
      openings.push({ kind: 'void' as const, x: w / 2 - 1.1, y: 0.75, width: 2.2, height: 1.55 });
    } else {
      for (let k = 0; k < nWin; k++) {
        const cx = (w * (k + 0.5)) / nWin;
        openings.push({ kind: 'window' as const, x: cx - winW / 2, y: 0.85, width: winW, height: Math.min(1.6, h - 1.25) });
      }
    }
    storeys.push({
      height: h, material: upperMat, worldSize: upperWS, openings,
      jetty: style === 'tudor' ? rng.range(0.28, 0.45) : 0,
      timber: style === 'tudor',
      timberMaterial: style === 'tudor' && rng.chance(0.35) ? M.get(paint) : undefined,
      lean: [rng.range(0.8, 2.2), rng.range(-0.7, 0.7)],
    });
  }

  const gable = w < 6.2 && rng.chance(0.65);
  const house = buildTownhouse(kit, {
    name: o.seed, width: w, depth: o.depth ?? 7.5, storeys,
    side: style === 'brick' ? M.tinted('brick', brickTint) : 'brick',
    trim: M.get(paint),
    roof: {
      kind: gable ? 'gable' : 'eaves', pitch: rng.range(46, 56),
      dormers: gable ? 0 : w > 5 ? rng.int(1, 2) : rng.int(0, 1),
      chimneys: gable ? [{ x: 0, zf: 0.75 }] : [{ x: -w / 2 + 0.7, zf: 0.5 }, ...(rng.chance(0.5) ? [{ x: w / 2 - 0.7, zf: 0.5 }] : [])],
      gableMaterial: style === 'tudor' ? M.get('plaster') : upperMat, gableWorldSize: upperWS,
    },
  });

  const ground = house.storeys[0];
  const built = sf.build(ground);
  for (const d of built.displays) fillDisplay(kit, d, t.theme, rng);

  if (upperBay) {
    const bay = buildBayWindow({
      width: 2.2, height: 1.45, projection: 0.5, sill: 0, facets: 5, panes: [2, 3], frame: M.get(paint), glass: M.get('glass'),
      stone: M.get('sandstone'), interior: M.interior('plaster', 0xffb878, 0.45), corbels: 3, corbelMaterial: M.get('oak'),
    });
    bay.group.position.set(0, 0.8, 0);
    house.storeys[1].add(bay.group);
  }

  // Awning for parlours and tea rooms
  if (t.awning) ground.add(stripedAwning(kit, w - 0.7, t.awning, groundH - 1.0));

  // Swinging bracket sign on the first floor
  const animators = [];
  if (rng.chance(0.75) && house.storeys[1]) {
    const sign = buildHangingSign(kit, {
      armLength: 1.1,
      board: { width: 0.75, height: 0.5, lettering: { text: t.sign, ground: fasciaColor, style: t.letter, wear: 0.3, seed: `${o.seed}-sign` }, frame: M.get(paint) },
    });
    const sx = rng.chance(0.5) ? -1 : 1;
    sign.group.position.set(sx * (w / 2 - 0.35), 1.0, 0.02);
    house.storeys[1].add(sign.group);
    animators.push(sign);
  }

  // A little street clutter by the door
  const door = built.doors[0];
  if (door && t.id === 'cauldrons') for (let k = 0; k < 3; k++) kit.instances.put(propKind(kit, 'cauldron'), ground, { x: door.x + (door.x > 0 ? -1 : 1) * (0.9 + k * 0.45), y: 0, z: 0.35 }, new THREE.Euler(0, rng.range(0, 6), 0), { x: 1.4, y: 1.4, z: 1.4 }, new THREE.Color(0x343436));
  if (door && t.id === 'curios') trunkStack(kit, ground, door.x + (door.x > 0 ? -1.1 : 1.1), 0, 0.4, 2, rng, 0.7);

  mergeStatic(house.group, `${o.seed}-static`);
  return { group: house.group, doors: built.doors, animators };
}

/** Sloped, striped canvas awning with a scalloped valance. */
export function stripedAwning(kit: Kit, width: number, [c1, c2]: [string, string], y: number): THREE.Group {
  const key = `awning:${c1}:${c2}`;
  const mat = kit.mats.memo(key, () => {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const g = cv.getContext('2d')!;
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * 32, 0, 32, 64); }
    g.fillStyle = 'rgba(30,20,10,0.18)';
    for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 256, Math.random() * 64, 2, 1);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  }) as THREE.MeshStandardMaterial;
  const group = new THREE.Group();
  const reach = 1.1, drop = 0.55;
  const slope = new THREE.PlaneGeometry(width, Math.hypot(reach, drop), 1, 1);
  const uv = slope.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * width / 0.5);
  const m1 = new THREE.Mesh(slope, mat);
  m1.rotation.x = -Math.PI / 2 + Math.atan2(drop, reach);
  m1.position.set(0, y - drop / 2, reach / 2);
  const val = new THREE.Shape();
  val.moveTo(-width / 2, 0); val.lineTo(width / 2, 0);
  const k = Math.round(width / 0.25);
  for (let i = k; i >= 0; i--) { const x = -width / 2 + (width * i) / k; val.lineTo(x, -0.14 - (i % 2 ? 0.05 : 0)); }
  val.lineTo(-width / 2, 0);
  const vg = new THREE.ShapeGeometry(val);
  const vuv = vg.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < vuv.count; i++) vuv.setXY(i, vuv.getX(i) / 0.5, 0.5);
  const m2 = new THREE.Mesh(vg, mat);
  m2.position.set(0, y - drop, reach);
  for (const m of [m1, m2]) { m.castShadow = true; group.add(m); }
  // iron arms
  const iron = kit.mats.get('iron');
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, Math.hypot(reach, drop), 6), iron);
    arm.position.set(sx * (width / 2 - 0.05), y - drop / 2 - 0.02, reach / 2);
    arm.rotation.x = Math.PI / 2 - Math.atan2(drop, reach);
    group.add(arm);
  }
  return group;
}
