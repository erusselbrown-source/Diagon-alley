/**
 * Wiseacre's Wizarding Equipment. Weathered rose-brick front with stone
 * bands, a big multi-pane shop window glazed with brass bars, brass
 * instruments in the window, a wrought-iron bracket carrying a slowly
 * rotating golden armillary sphere, and brass-bound leather trunks stacked on
 * the stoop.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildHangingSign, buildTownhouse, mergeStatic, normalizeForMerge, planShopfront, type Kit } from '../architecture/kit';
import { trunkStack } from '../props/displays';
import { dressWindow } from '../props/dioramas';
import { STEP_TREAD } from '../architecture/stoops';
import type { ShopModule } from './index';

function instrumentKinds(kit: Kit): { telescope: string; globe: string } {
  const M = kit.mats;
  if (!kit.instances.has('prop:telescope')) {
    const tube = [
      new THREE.CylinderGeometry(0.035, 0.05, 0.62, 12).rotateZ(Math.PI / 2 - 0.45).translate(0, 0.62, 0),
      new THREE.CylinderGeometry(0.008, 0.008, 0.62, 5).rotateZ(0.3).translate(0.08, 0.3, 0),
      new THREE.CylinderGeometry(0.008, 0.008, 0.62, 5).rotateZ(-0.3).translate(-0.08, 0.3, 0),
      new THREE.CylinderGeometry(0.008, 0.008, 0.62, 5).rotateX(0.3).translate(0, 0.3, 0.08),
    ];
    kit.instances.define('prop:telescope', mergeGeometries(tube.map((g) => normalizeForMerge(g)))!, M.display('brass', 0.25));
    const globe = [
      new THREE.SphereGeometry(0.12, 16, 12).translate(0, 0.3, 0),
      new THREE.TorusGeometry(0.135, 0.008, 6, 24).rotateZ(0.4).translate(0, 0.3, 0),
      new THREE.CylinderGeometry(0.012, 0.03, 0.18, 8).translate(0, 0.09, 0),
      new THREE.CylinderGeometry(0.07, 0.08, 0.02, 12).translate(0, 0.01, 0),
    ];
    kit.instances.define('prop:globe', mergeGeometries(globe.map((g) => normalizeForMerge(g)))!, M.display('brass', 0.3));
  }
  return { telescope: 'prop:telescope', globe: 'prop:globe' };
}

/** Golden armillary sphere; returns the group and a spin updater. */
function armillary(kit: Kit): { group: THREE.Group; spin(t: number): void } {
  const gold = kit.mats.get('brass');
  const g = new THREE.Group();
  const r = 0.36;
  const tilt = new THREE.Group();
  tilt.rotation.z = THREE.MathUtils.degToRad(23.4);
  g.add(tilt);
  const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, r * 2.5, 8), gold);
  tilt.add(axis);
  const meridian = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 8, 48), gold);
  tilt.add(meridian);
  const spinner = new THREE.Group();
  tilt.add(spinner);
  const equator = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, 0.014, 8, 48).rotateX(Math.PI / 2), gold);
  const colure = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.011, 8, 48).rotateY(Math.PI / 2), gold);
  const ecliptic = new THREE.Mesh(new THREE.TorusGeometry(r * 0.88, 0.02, 8, 48).rotateX(Math.PI / 2 + 0.41), gold);
  spinner.add(equator, colure, ecliptic);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), kit.mats.memo('armillary-orb', () => {
    const m = kit.mats.get('brass').clone(); m.emissive = new THREE.Color(1, 0.7, 0.3); m.emissiveIntensity = 0.6; return m;
  }));
  tilt.add(orb);
  for (const s of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), gold);
    cap.position.y = s * r * 1.25;
    tilt.add(cap);
  }
  g.traverse((o) => { o.castShadow = true; });
  g.position.y = -r - 0.12;
  return {
    group: g,
    spin(t) {
      spinner.rotation.y = t * 0.6;
      ecliptic.rotation.y = -t * 0.25;
      g.rotation.y = Math.sin(t * 0.2) * 0.25;
    },
  };
}

export const WISEACRES: ShopModule = {
  id: 'wiseacres',
  name: "Wiseacre's Wizarding Equipment",
  frontage: 6.6,
  depth: 8,
  build({ kit }) {
    const rng = kit.useRng('wiseacres');
    const M = kit.mats;
    const w = 6.6;
    const rose = M.tinted('brick', 0xf4a898, 'rose');
    const green = M.get('paint-emerald');
    const brass = M.get('brass');
    const floor = 0.32;
    const sf = planShopfront(kit, w, {
      height: 3.9,
      items: [{ kind: 'window', width: 3.7, panes: [6, 4] }, { kind: 'door', width: 1.0, fanlight: true }],
      name: "Wiseacre's Wizarding Equipment", sub: 'Telescopes · Sneakoscopes · Brass Scales · Trunks', letterStyle: 'gold', fasciaColor: '#0f2a1c',
      paint: green, muntin: brass, floor, wear: 0.3, interiorGlow: 0xffc27a, interior: 'oak',
    });
    const up = (y: number, h: number) => [0.2, 0.5, 0.8].map((f) => ({ kind: 'window' as const, x: w * f - 0.48, y, width: 0.96, height: h }));
    const house = buildTownhouse(kit, {
      name: 'wiseacres', width: w, depth: 8, side: rose, trim: green,
      storeys: [
        { height: 3.9, material: rose, worldSize: 0.9, openings: sf.openings, lean: [0.3, -0.3] },
        { height: 3.2, material: rose, worldSize: 0.9, openings: up(0.85, 1.65), lean: [1.2, 0.5], band: true },
        { height: 2.9, material: rose, worldSize: 0.9, openings: up(0.8, 1.4), lean: [1.4, -0.6], band: true },
      ],
      roof: { kind: 'eaves', pitch: 48, dormers: 1, chimneys: [{ x: -w / 2 + 0.75, flues: 4 }, { x: w / 2 - 0.75, flues: 2 }] },
    });
    const ground = house.storeys[0];
    const built = sf.build(ground);

    // Brass instruments in the window
    const k = instrumentKinds(kit);
    const disp = built.displays[0];
    for (let i = 0; i < 5; i++) {
      const x = -1.5 + i * 0.75;
      kit.instances.put(i % 2 ? k.globe : k.telescope, disp.anchor, { x, y: 0, z: -0.25 + rng.range(-0.1, 0.1) }, new THREE.Euler(0, rng.range(-0.8, 0.8), 0), { x: 1.1, y: 1.1, z: 1.1 }, new THREE.Color(1, 0.9, 0.7));
    }
    trunkStack(kit, disp.anchor, 1.2, 0, -0.6, 2, rng, 0.6);
    dressWindow(kit, disp, 'curios', rng, { noFront: true, glow: 0xffc27a });

    // Trunks stacked on the stoop beside the door
    const door = built.doors[0];
    const steps = Math.round(floor / 0.16);
    trunkStack(kit, ground, door.x - 0.95, 0, 0.45, 3, rng, 0.85);
    trunkStack(kit, ground, door.x + 0.72, steps * 0.16, STEP_TREAD * 0.5, 1, rng, 0.6);

    // Rotating armillary sphere on a wrought-iron bracket
    const arm = armillary(kit);
    const sign = buildHangingSign(kit, { armLength: 1.3, body: arm.group, rigid: true });
    sign.group.position.set(w / 2 - 0.4, 1.4, 0.02);
    house.storeys[1].add(sign.group);

    mergeStatic(house.group, 'wiseacres-static');
    return { group: house.group, doors: built.doors, animators: [{ update: (_dt, t) => arm.spin(t) }] };
  },
};
