/**
 * Weasleys' Wizard Wheezes. A towering three-storey front in vibrant orange,
 * purple and magenta with curved Art Nouveau trim (whiplash tendrils,
 * horseshoe window heads, a scrolling crest), chasing marquee bulbs, and a
 * stylised 6 m mechanical showman above the door who periodically lifts his
 * top hat to reveal a glowing rabbit.
 */
import * as THREE from 'three';
import {
  GeometryBucket, buildTownhouse, letteringMaterial, mergeStatic, planShopfront, type Animator, type Kit,
} from '../architecture/kit';
import { fillDisplay } from '../props/displays';
import type { ShopModule } from './index';

const W = 9.6;
const CYCLE = 10;

/** Chasing marquee bulbs along a set of points (one InstancedMesh). */
function marquee(points: THREE.Vector3[], parent: THREE.Object3D, phase = 0): Animator {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), mat, points.length);
  const m = new THREE.Matrix4();
  points.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(points.length * 3), 3);
  mesh.computeBoundingSphere();
  mesh.name = 'marquee-bulbs';
  parent.add(mesh);
  const warm = new THREE.Color(1.0, 0.72, 0.36), c = new THREE.Color();
  return {
    update(_dt, t) {
      for (let i = 0; i < points.length; i++) {
        const on = Math.floor(i + phase - t * 9) % 3 === 0 ? 1 : 0;
        const flicker = 0.9 + 0.1 * Math.sin(t * 37 + i * 1.7);
        c.copy(warm).multiplyScalar((0.7 + 2.6 * on) * flicker);
        mesh.setColorAt(i, c);
      }
      mesh.instanceColor!.needsUpdate = true;
    },
  };
}

function tube(b: GeometryBucket, mat: THREE.Material, pts: THREE.Vector3[], r: number): THREE.CatmullRomCurve3 {
  const curve = new THREE.CatmullRomCurve3(pts);
  b.add(mat, new THREE.TubeGeometry(curve, Math.max(16, pts.length * 10), r, 8, false));
  return curve;
}

/** Whiplash tendril: a vertical S-curve with a curled tip. */
function whiplash(x: number, y0: number, y1: number, amp: number, z: number, flip = 1): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector3(x + flip * amp * Math.sin(t * Math.PI * 1.5) * (0.4 + t), y0 + (y1 - y0) * t, z));
  }
  const tip = pts[pts.length - 1];
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 1.6;
    pts.push(new THREE.Vector3(tip.x + flip * 0.18 * (1 - Math.cos(a)) * (1 - i / 12), tip.y + 0.18 * Math.sin(a) * (1 - i / 12), z));
  }
  return pts;
}

/** Two-bone IK in the XY plane; returns the elbow position. */
function solveIK(shoulder: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, bendSign: number): THREE.Vector3 {
  const d = Math.min(l1 + l2 - 1e-3, shoulder.distanceTo(target));
  const base = Math.atan2(target.y - shoulder.y, target.x - shoulder.x);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = base + bendSign * Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
  return new THREE.Vector3(shoulder.x + l1 * Math.cos(a), shoulder.y + l1 * Math.sin(a), shoulder.z);
}

function limb(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const dir = b.clone().sub(a);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.scale.set(1, a.distanceTo(b), 1);
}

function gearGeometry(r: number, teeth: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 1.18;
    if (i === 0) s.moveTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    s.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    s.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
  }
  const hole = new THREE.Path().absarc(0, 0, r * 0.3, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01, bevelSegments: 1 });
}

/** The 6 m mechanical showman with his hat-and-rabbit routine. */
function showman(kit: Kit): { group: THREE.Group; animator: Animator } {
  const M = kit.mats;
  const g = new THREE.Group();
  g.name = 'wheezes-showman';
  g.userData.keep = true;
  const orange = M.get('paint-weasley'), violet = M.get('paint-violet'), magenta = M.get('paint-magenta');
  const black = M.get('paint-charcoal'), brass = M.get('brass');
  const skin = M.tinted('plaster', 0xf2c4a2, 'skin');
  const hair = M.tinted('paint-weasley', 0xff9a50, 'hair');
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = g) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const lathe = (pts: number[][], seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

  // Legs, shoes, trousers
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.22, 0.26, 1.6, 14), magenta, sx * 0.32, 0.95, 0);
    add(new THREE.SphereGeometry(0.28, 14, 10).scale(1, 0.55, 1.6), black, sx * 0.32, 0.12, 0.15);
  }
  // Torso: tailcoat over waistcoat
  add(lathe([[0, 0], [0.62, 0], [0.7, 0.4], [0.78, 1.1], [0.86, 1.8], [0.9, 2.1], [0.6, 2.4], [0.25, 2.5], [0, 2.5]]), violet, 0, 1.55, 0);
  add(new THREE.BoxGeometry(0.75, 1.6, 0.1).translate(0, 0.8, 0), orange, 0, 1.75, 0.72).rotation.x = -0.12;
  for (let i = 0; i < 5; i++) add(new THREE.SphereGeometry(0.045, 8, 6), brass, 0, 2.0 + i * 0.28, 0.79 - i * 0.03);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.5, 1.5, 0.08), violet, sx * 0.48, 1.45, -0.35).rotation.set(0.25, 0, sx * 0.15); // coat tails
  // Bow tie
  for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.16, 0.32, 4).rotateZ(sx * Math.PI / 2), magenta, sx * 0.16, 3.95, 0.4);
  add(new THREE.SphereGeometry(0.07, 8, 6), magenta, 0, 3.95, 0.43);
  // Rivets around the waist
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; add(new THREE.SphereGeometry(0.035, 6, 4), brass, Math.cos(a) * 0.71, 1.95, Math.sin(a) * 0.71); }

  // Head
  const head = new THREE.Group();
  head.position.set(0, 4.65, 0);
  g.add(head);
  add(new THREE.SphereGeometry(0.62, 28, 20), skin, 0, 0, 0, head);
  for (let i = 0; i < 14; i++) {
    const a = kit.rng.range(-2.2, 2.2), e = kit.rng.range(0.1, 1.0);
    add(new THREE.SphereGeometry(kit.rng.range(0.16, 0.26), 10, 8), hair, Math.sin(a) * 0.55 * Math.cos(e * 0.6), 0.2 + e * 0.3, -Math.cos(a) * 0.4 - 0.12, head);
  }
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(0.15, 14, 10), M.tinted('plaster', 0xffffff, 'eye-white'), sx * 0.22, 0.12, 0.5, head);
    add(new THREE.SphereGeometry(0.065, 10, 8), black, sx * 0.22, 0.12, 0.63, head);
    add(new THREE.BoxGeometry(0.26, 0.05, 0.06), hair, sx * 0.22, 0.34, 0.55, head).rotation.z = sx * -0.25;
    add(new THREE.SphereGeometry(0.12, 10, 8).scale(0.5, 1, 0.8), skin, sx * 0.62, 0.0, 0, head);
  }
  add(new THREE.SphereGeometry(0.1, 10, 8), skin, 0, -0.02, 0.63, head); // nose
  const grin = add(new THREE.TorusGeometry(0.26, 0.05, 8, 20, Math.PI), M.tinted('paint-oxblood', 0xffffff, 'grin'), 0, -0.2, 0.5, head);
  grin.rotation.set(0.35, 0, Math.PI);
  add(new THREE.BoxGeometry(0.34, 0.06, 0.04), M.tinted('plaster', 0xffffff, 'teeth'), 0, -0.24, 0.6, head);

  // Hat (carried by the right hand)
  const hat = new THREE.Group();
  add(new THREE.CylinderGeometry(0.78, 0.78, 0.06, 32), black, 0, 0.03, 0, hat);
  add(new THREE.CylinderGeometry(0.47, 0.44, 0.95, 28), black, 0, 0.5, 0, hat);
  add(new THREE.CylinderGeometry(0.455, 0.455, 0.16, 28), magenta, 0, 0.15, 0, hat);
  g.add(hat);

  // Rabbit, hidden under the hat
  const rabbit = new THREE.Group();
  const glow = M.glow(0xfff2ff, 2.6), pink = M.glow(0xff6ad5, 3.2);
  add(new THREE.SphereGeometry(0.22, 16, 12).scale(1, 1.15, 0.9), glow, 0, 0.22, 0, rabbit);
  add(new THREE.SphereGeometry(0.16, 16, 12), glow, 0, 0.52, 0.04, rabbit);
  const ears: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    const ear = add(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8).translate(0, 0.17, 0), glow, sx * 0.07, 0.62, 0, rabbit);
    add(new THREE.CapsuleGeometry(0.025, 0.24, 4, 6).translate(0, 0.17, 0.035), pink, 0, 0, 0, ear);
    ears.push(ear);
    add(new THREE.SphereGeometry(0.025, 8, 6), pink, sx * 0.06, 0.56, 0.17, rabbit);
  }
  rabbit.position.set(0, 5.2, 0);
  rabbit.scale.setScalar(0.001);
  g.add(rabbit);
  const rabbitLight = new THREE.PointLight(0xff7ae0, 0, 9, 2);
  rabbitLight.position.set(0, 5.6, 0.6);
  g.add(rabbitLight);

  // Arms
  const SH_R = new THREE.Vector3(0.95, 3.75, 0.1), SH_L = new THREE.Vector3(-0.95, 3.75, 0.1);
  const L1 = 1.25, L2 = 1.2;
  const sleeve = () => add(new THREE.CylinderGeometry(0.17, 0.15, 1, 12), violet);
  const rUpper = sleeve(), rFore = sleeve(), lUpper = sleeve(), lFore = sleeve();
  const rHand = add(new THREE.SphereGeometry(0.19, 14, 10), M.tinted('plaster', 0xffffff, 'glove'));
  const lHand = add(new THREE.SphereGeometry(0.19, 14, 10), M.tinted('plaster', 0xffffff, 'glove'));
  const gears: THREE.Mesh[] = [];
  for (const [sh, r, n] of [[SH_R, 0.26, 12], [SH_L, 0.26, 12]] as const) {
    const gm = add(gearGeometry(r, n, 0.05), brass, sh.x, sh.y, 0.55);
    gears.push(gm);
  }
  const small = add(gearGeometry(0.14, 8, 0.05), brass, SH_R.x - 0.34, SH_R.y - 0.18, 0.58);
  gears.push(small);
  // Left arm: fixed hand-on-hip
  const lElbow = new THREE.Vector3(-1.55, 3.0, 0.25), lH = new THREE.Vector3(-0.85, 2.45, 0.45);
  limb(lUpper, SH_L, lElbow); limb(lFore, lElbow, lH); lHand.position.copy(lH);

  const rest = new THREE.Vector3(0.78, 5.32, 0.1), lifted = new THREE.Vector3(1.05, 6.25, 0.25);
  const hatRest = new THREE.Vector3(0, 5.18, 0);
  const tgt = new THREE.Vector3(), elbow = new THREE.Vector3();
  const easeIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  const back = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;

  return {
    group: g,
    animator: {
      update(_dt, t) {
        const c = t % CYCLE;
        // lift amount 0..1
        let k = 0;
        if (c > 6 && c < 7.1) k = easeIO((c - 6) / 1.1);
        else if (c >= 7.1 && c < 8.7) k = 1;
        else if (c >= 8.7 && c < 9.8) k = 1 - easeIO((c - 8.7) / 1.1);
        tgt.lerpVectors(rest, lifted, k);
        elbow.copy(solveIK(SH_R, tgt, L1, L2, -1));
        limb(rUpper, SH_R, elbow);
        limb(rFore, elbow, tgt);
        rHand.position.copy(tgt);
        hat.position.copy(hatRest).add(tgt.clone().sub(rest).multiply(new THREE.Vector3(0.85, 1, 1)));
        hat.rotation.z = -0.45 * k;
        for (const [i, gm] of gears.entries()) gm.rotation.z = (i === 2 ? -2.2 : 1) * k * 2.4 + t * 0.15;
        // rabbit pops with overshoot while the hat is up
        const r = c > 6.6 && c < 9.3 ? back(Math.min(1, (c - 6.6) / 0.6)) * (c > 8.7 ? Math.max(0, 1 - (c - 8.7) / 0.6) : 1) : 0;
        rabbit.scale.setScalar(Math.max(0.001, r));
        rabbit.position.y = 5.2 + 0.05 * Math.sin(t * 9) * r;
        for (const [i, e] of ears.entries()) e.rotation.z = (i ? -1 : 1) * (0.15 + 0.2 * Math.sin(t * 7 + i)) * r;
        rabbitLight.intensity = 14 * r;
        // idle life: gentle sway and head tilt
        head.rotation.z = 0.06 * Math.sin(t * 0.9) + 0.12 * k;
        g.rotation.y = 0.05 * Math.sin(t * 0.5);
      },
    },
  };
}

export const WEASLEY_WHEEZES: ShopModule = {
  id: 'weasleys-wizard-wheezes',
  name: "Weasleys' Wizard Wheezes",
  frontage: W,
  depth: 9,
  build({ kit }) {
    const rng = kit.useRng('wheezes');
    const M = kit.mats;
    const orange = M.get('paint-weasley'), violet = M.get('paint-violet'), magenta = M.get('paint-magenta'), brass = M.get('brass');
    const floor = 0.16;
    const sf = planShopfront(kit, W, {
      height: 4.6,
      items: [{ kind: 'window', width: 3.0, panes: [3, 4] }, { kind: 'door', width: 1.5, glazed: true, fanlight: true }, { kind: 'window', width: 3.0, panes: [3, 4] }],
      name: "WEASLEYS' WIZARD WHEEZES", sub: 'Purveyors of Pranks, Puzzles & Pyrotechnics', letterStyle: 'neon', fasciaColor: '#2a0f45',
      paint: magenta, muntin: brass, doorLeaf: orange, floor, wear: 0.05, interiorGlow: 0xff9ae6, interior: 'plaster', fasciaHeight: 0.75,
    });
    const sideWins = (y: number, h: number) => [{ kind: 'window' as const, x: 0.75, y, width: 1.35, height: h }, { kind: 'window' as const, x: W - 2.1, y, width: 1.35, height: h }];
    const house = buildTownhouse(kit, {
      name: 'wheezes', width: W, depth: 9, side: 'brick', trim: magenta,
      storeys: [
        { height: 4.6, material: orange, worldSize: 0.9, openings: sf.openings, lean: [0.2, 0.1] },
        { height: 3.6, material: violet, worldSize: 0.9, openings: sideWins(0.7, 2.1), lean: [0.9, -0.4], band: true },
        { height: 3.6, material: orange, worldSize: 0.9, openings: sideWins(0.7, 2.0), lean: [1.1, 0.5], band: true },
      ],
      roof: { kind: 'eaves', pitch: 50, dormers: 2, chimneys: [{ x: -W / 2 + 0.8, flues: 3 }, { x: W / 2 - 0.8, flues: 3 }], trim: magenta },
    });
    const [g0, g1, g2] = house.storeys;
    const built = sf.build(g0);
    for (const d of built.displays) fillDisplay(kit, d, 'jokes', rng);

    // ---- Art Nouveau trim ------------------------------------------------------
    const b0 = new GeometryBucket(), b1 = new GeometryBucket(), b2 = new GeometryBucket();
    // Grand arch over the doorway (marquee frame)
    const archPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const a = Math.PI * (i / 24); archPts.push(new THREE.Vector3(-Math.cos(a) * 1.25, 1.0 + Math.sin(a) * 2.75, 0.16)); }
    const arch = tube(b0, brass, archPts, 0.055);
    tube(b0, magenta, archPts.map((p) => p.clone().multiplyScalar(1.06).setZ(0.12).setY(p.y * 1.02 - 0.02)), 0.07);
    // Whiplash tendrils climbing the upper storeys, and horseshoe window heads
    for (const [g, b, y1] of [[g1, b1, 3.4], [g2, b2, 3.3]] as const) {
      void g;
      for (const sx of [-1, 1]) {
        tube(b, brass, whiplash(sx * 2.45, 0.15, y1, 0.22, 0.06, sx), 0.035);
        tube(b, magenta, whiplash(sx * (W / 2 - 0.25), 0.15, y1 - 0.3, 0.15, 0.06, -sx), 0.045);
        const cx = sx > 0 ? W / 2 - 2.1 + 0.675 : -W / 2 + 0.75 + 0.675;
        const hp: THREE.Vector3[] = [];
        for (let i = 0; i <= 20; i++) { const a = -0.25 + (Math.PI + 0.5) * (i / 20); hp.push(new THREE.Vector3(cx - Math.cos(a) * 0.82, 2.75 + Math.sin(a) * 0.75, 0.06)); }
        tube(b, magenta, hp, 0.05);
      }
    }
    // Scrolling crest above the top storey with a WWW medallion
    const crest = new THREE.Shape();
    crest.moveTo(-W / 2 + 0.2, 0);
    crest.bezierCurveTo(-W / 2 + 1.0, 0.9, -2.6, 0.2, -1.6, 1.1);
    crest.bezierCurveTo(-1.0, 1.7, -0.6, 2.2, 0, 2.3);
    crest.bezierCurveTo(0.6, 2.2, 1.0, 1.7, 1.6, 1.1);
    crest.bezierCurveTo(2.6, 0.2, W / 2 - 1.0, 0.9, W / 2 - 0.2, 0);
    crest.lineTo(-W / 2 + 0.2, 0);
    const crestGeo = new THREE.ExtrudeGeometry(crest, { depth: 0.14, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 24 });
    b2.add(magenta, crestGeo, new THREE.Matrix4().makeTranslation(0, 3.55, 0.08));
    const crestEdge = new THREE.CatmullRomCurve3(crest.getPoints(40).slice(0, -2).map((p) => new THREE.Vector3(p.x, p.y + 3.55, 0.26)));
    b2.add(brass, new THREE.TubeGeometry(crestEdge, 160, 0.03, 6, false));
    g0.add(b0.build('wwww-trim0')); g1.add(b1.build('www-trim1')); g2.add(b2.build('www-trim2'));
    const medal = new THREE.Mesh(new THREE.CircleGeometry(0.55, 40), letteringMaterial({ text: 'WWW', aspect: 1, ground: '#ff7a1a', style: 'neon', border: true, wear: 0.02, seed: 'www' }));
    medal.position.set(0, 3.55 + 1.35, 0.25);
    g2.add(medal);

    // ---- Marquee bulbs -------------------------------------------------------
    const animators: Animator[] = [];
    const archBulbs = arch.getSpacedPoints(34).map((p) => p.clone().setZ(0.24));
    const fasciaBulbs: THREE.Vector3[] = [];
    for (let x = -W / 2 + 0.45; x <= W / 2 - 0.45; x += 0.26) fasciaBulbs.push(new THREE.Vector3(x, 4.6 - 0.12 - 0.75 - 0.06, 0.2));
    animators.push(marquee([...archBulbs, ...fasciaBulbs], g0));
    animators.push(marquee(crestEdge.getSpacedPoints(46).map((p) => p.clone().setZ(0.33)), g2, 1));

    // ---- The showman over the door ---------------------------------------------
    const man = showman(kit);
    man.group.position.set(0, 0.05, 0.85);
    g1.add(man.group);
    animators.push(man.animator);
    const plinth = new GeometryBucket();
    plinth.box(M.get('oak'), 2.4, 0.18, 1.5, 0.03, { x: 0, y: -0.04, z: 0.8 });
    for (const sx of [-0.8, 0.8]) plinth.box(M.get('iron'), 0.08, 0.6, 1.3, 0.01, { x: sx, y: -0.38, z: 0.7 }, new THREE.Euler(-0.35, 0, 0));
    g1.add(plinth.build('showman-plinth'));

    mergeStatic(house.group, 'wheezes-static');
    return { group: house.group, doors: built.doors, animators };
  },
};
