/**
 * Procedural models for Cauldron Chaos: wizards, ingredients, flasks, owl,
 * cauldron liquid — plus a static batcher that merges level decor per material.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IngredientKind, PotionId, PrepState } from './data';
import { POTIONS } from './data';

// ---------------------------------------------------------------- batching

/** Merge geometries robustly (mixed indexed / non-indexed, position+normal+uv only). */
export function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
    if (!n.getAttribute('uv')) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.getAttribute('position').count * 2), 2));
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    n.morphAttributes = {};
    return n;
  });
  const m = mergeGeometries(clean, false);
  if (!m) throw new Error('merge failed');
  return m;
}

/** Collects static meshes and emits one merged mesh per material. */
export class Batcher {
  private readonly parts = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; shadow: boolean }>();

  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4, castShadow = true): void {
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    let p = this.parts.get(mat);
    if (!p) { p = { geos: [], shadow: castShadow }; this.parts.set(mat, p); }
    p.shadow ||= castShadow;
    p.geos.push(g);
  }

  /** Add every mesh in an object tree (world matrices relative to `root`'s parent space). */
  addObject(obj: THREE.Object3D, castShadow = true): void {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) this.add(m.geometry, m.material, m.matrixWorld, castShadow && m.castShadow !== false);
    });
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    for (const [mat, p] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeos(p.geos), mat);
      mesh.castShadow = p.shadow;
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

export const M4 = (x = 0, y = 0, z = 0, ry = 0, s: number | THREE.Vector3 = 1, rx = 0, rz = 0): THREE.Matrix4 => {
  const sv = typeof s === 'number' ? new THREE.Vector3(s, s, s) : s;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), sv);
};

// ---------------------------------------------------------------- shared simple materials

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.6, metal = 0, emissive = 0, emissiveIntensity = 1): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${metal}|${emissive}|${emissiveIntensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity });
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}

function addTo<T extends THREE.Object3D>(parent: THREE.Object3D, child: T): T { parent.add(child); return child; }

const lathe = (pts: [number, number][], seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

// ---------------------------------------------------------------- wizard

export interface WizardColors { robe: number; trim: number; scarfA: number; scarfB: number; hat: number; skin: number; hair: number }

export interface WizardModel {
  root: THREE.Group;
  body: THREE.Group;
  hat: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  hold: THREE.Object3D;
  wandTip: THREE.Mesh;
  ring: THREE.Mesh;
}

function stripeTexture(a: number, b: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 8;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `#${(i % 2 ? b : a).toString(16).padStart(6, '0')}`;
    g.fillRect(i * 8, 0, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function makeWizard(col: WizardColors): WizardModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const robeMat = new THREE.MeshPhysicalMaterial({ color: col.robe, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(col.trim).multiplyScalar(0.5), sheenRoughness: 0.5 });
  const robe = mesh(lathe([[0, 0.02], [0.33, 0.02], [0.35, 0.06], [0.3, 0.25], [0.25, 0.45], [0.22, 0.58], [0.14, 0.66], [0, 0.68]], 28), robeMat);
  body.add(robe);
  const hem = mesh(new THREE.TorusGeometry(0.335, 0.025, 8, 32), mat(col.trim, 0.5, 0.3));
  hem.rotation.x = Math.PI / 2; hem.position.y = 0.05;
  body.add(hem);
  // clasp
  body.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), mat(0xd8b048, 0.3, 1), 0, 0.6, 0.17));

  // scarf
  const scarfMat = new THREE.MeshStandardMaterial({ map: stripeTexture(col.scarfA, col.scarfB), roughness: 0.9 });
  const scarf = mesh(new THREE.TorusGeometry(0.15, 0.05, 10, 24), scarfMat);
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.66;
  body.add(scarf);
  const tail = mesh(new THREE.BoxGeometry(0.08, 0.24, 0.03), scarfMat, 0.09, 0.55, 0.17);
  tail.rotation.z = 0.15;
  body.add(tail);

  // head
  const skin = mat(col.skin, 0.65);
  const head = mesh(new THREE.SphereGeometry(0.19, 28, 20), skin, 0, 0.84, 0);
  body.add(head);
  const eyeM = mat(0x16100c, 0.2);
  for (const s of [-1, 1]) {
    body.add(mesh(new THREE.SphereGeometry(0.03, 12, 8), eyeM, s * 0.068, 0.86, 0.165));
    body.add(mesh(new THREE.SphereGeometry(0.009, 8, 6), mat(0xffffff, 0.2, 0, 0xffffff, 0.6), s * 0.068 + 0.01, 0.872, 0.192));
    addTo(body, mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(0xf08a80, 0.8), s * 0.11, 0.8, 0.14)).scale.set(1, 0.6, 0.4);
  }
  body.add(mesh(new THREE.SphereGeometry(0.028, 10, 8), skin, 0, 0.82, 0.19));
  // hair tufts
  const hair = mat(col.hair, 0.9);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.25 + (i / 6) * 1.5);
    const t = mesh(new THREE.SphereGeometry(0.07, 10, 8), hair, Math.cos(a) * 0.17, 0.9, -Math.sin(a) * 0.1 - 0.06);
    t.scale.set(1, 0.8, 1);
    body.add(t);
  }
  // glasses on the first-colour wizard only? keep it universal: none.

  // hat (bent cone)
  const hat = new THREE.Group();
  hat.position.set(0, 0.97, -0.05);
  hat.rotation.x = -0.32; // tipped back so the face reads from the high camera
  const cone = new THREE.ConeGeometry(0.2, 0.55, 24, 10, true);
  cone.translate(0, 0.275, 0);
  const p = cone.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = Math.max(0, p.getY(i) / 0.55);
    p.setZ(i, p.getZ(i) - 0.16 * Math.pow(y, 2.4));
    p.setY(i, p.getY(i) - 0.05 * Math.pow(y, 3));
  }
  cone.computeVertexNormals();
  const hatMat = new THREE.MeshStandardMaterial({ color: col.hat, roughness: 0.9, side: THREE.DoubleSide });
  hat.add(mesh(cone, hatMat));
  const brim = mesh(new THREE.CylinderGeometry(0.27, 0.29, 0.025, 32), hatMat);
  hat.add(brim);
  const band = mesh(new THREE.CylinderGeometry(0.196, 0.2, 0.06, 24, 1, true), mat(col.trim, 0.5));
  band.position.y = 0.045;
  hat.add(band);
  hat.add(mesh(new THREE.TorusGeometry(0.022, 0.008, 6, 12), mat(0xd8b048, 0.3, 1), 0, 0.05, 0.2));
  body.add(hat);

  // arms (sleeve + hand), pivot at shoulder
  const mkArm = (s: number) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.2, 0.58, 0);
    const sleeve = mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.3, 12), robeMat, 0, -0.13, 0);
    arm.add(sleeve);
    addTo(arm, mesh(new THREE.TorusGeometry(0.08, 0.016, 6, 14), mat(col.trim, 0.5), 0, -0.27, 0)).rotation.x = Math.PI / 2;
    arm.add(mesh(new THREE.SphereGeometry(0.055, 12, 10), skin, 0, -0.32, 0));
    body.add(arm);
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  // wand in right hand
  const wand = mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.28, 8), mat(0x3a2414, 0.6), 0, -0.36, 0.1);
  wand.rotation.x = Math.PI / 2;
  armR.add(wand);
  const wandTip = mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.6).multiplyScalar(0.2) }), 0, -0.36, 0.25);
  wandTip.castShadow = false;
  armR.add(wandTip);

  const hold = new THREE.Object3D();
  hold.position.set(0, 0.5, 0.36);
  body.add(hold);

  // ground ring (player colour) — reads which wizard is which
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.44, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(col.scarfA).multiplyScalar(1.6), transparent: true, opacity: 0.75, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  root.add(ring);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== ring) o.castShadow = true; });
  return { root, body, hat, armL, armR, hold, wandTip, ring };
}

// ---------------------------------------------------------------- ingredients

const dish = () => {
  const g = new THREE.Group();
  g.add(mesh(lathe([[0, 0], [0.12, 0.005], [0.15, 0.04], [0.16, 0.06], [0.145, 0.062], [0.13, 0.03], [0, 0.025]], 24), mat(0xe8e0d0, 0.35)));
  addTo(g, mesh(new THREE.TorusGeometry(0.152, 0.008, 6, 24), mat(0x2e4f8a, 0.4), 0, 0.058, 0)).rotation.x = Math.PI / 2;
  return g;
};

const pile = (color: number, glow = 0) => {
  const g = dish();
  const cone = mesh(new THREE.ConeGeometry(0.11, 0.08, 18, 3), mat(color, 0.95, 0, glow ? color : 0, glow), 0, 0.065, 0);
  const pp = cone.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) {
    const r = Math.hypot(pp.getX(i), pp.getZ(i));
    pp.setY(i, pp.getY(i) + 0.008 * Math.sin(pp.getX(i) * 60) * r * 8);
  }
  cone.geometry.computeVertexNormals();
  g.add(cone);
  return g;
};

export function makeIngredient(kind: IngredientKind, state: PrepState): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'mandrake') {
    if (state === 'raw') {
      const root = mesh(lathe([[0, 0], [0.04, 0.02], [0.08, 0.08], [0.09, 0.14], [0.07, 0.2], [0.035, 0.24], [0, 0.25]], 16), mat(0xa07a4c, 0.85));
      const rp = root.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < rp.count; i++) rp.setX(i, rp.getX(i) + Math.sin(rp.getY(i) * 20) * 0.012);
      root.geometry.computeVertexNormals();
      g.add(root);
      // grumpy little face
      for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), mat(0x20140a), s * 0.03, 0.15, 0.08));
      g.add(mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 10, Math.PI), mat(0x20140a), 0, 0.11, 0.085));
      // little legs
      for (const s of [-1, 1]) {
        const leg = mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.08, 6), mat(0x8a6840, 0.9), s * 0.04, 0.0, 0);
        leg.rotation.z = s * 0.4;
        g.add(leg);
      }
      const leaf = mat(0x3f8a2e, 0.6);
      for (let i = 0; i < 6; i++) {
        const l = mesh(new THREE.SphereGeometry(0.06, 10, 6), leaf, 0, 0.29, 0);
        l.scale.set(0.35, 1.3, 0.12);
        l.rotation.set(0.5 * Math.cos(i * 1.05), i * 1.05, 0.5 * Math.sin(i * 1.05));
        l.position.x += Math.sin(i * 1.05) * 0.03;
        l.position.z += Math.cos(i * 1.05) * 0.03;
        g.add(l);
      }
      g.position.y = 0.03;
      const wrap = new THREE.Group();
      wrap.add(g);
      return wrap;
    }
    const d = dish();
    for (let i = 0; i < 5; i++) {
      const sl = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 14), mat(0xd8b88a, 0.8), Math.cos(i * 1.3) * 0.06, 0.05 + i * 0.012, Math.sin(i * 1.3) * 0.06);
      sl.rotation.set(0.3 * Math.sin(i), 0, 0.3 * Math.cos(i));
      d.add(sl);
      addTo(d, mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 14), mat(0x8a6036), sl.position.x, sl.position.y, sl.position.z)).rotation.copy(new THREE.Euler(Math.PI / 2 + sl.rotation.x, 0, sl.rotation.z));
    }
    addTo(d, mesh(new THREE.SphereGeometry(0.04, 8, 6), mat(0x3f8a2e, 0.6), 0.02, 0.1, -0.04)).scale.set(1, 0.4, 1.6);
    return d;
  }
  if (kind === 'toadstool') {
    if (state === 'raw') {
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.14, 12), mat(0xf2ead8, 0.7), 0, 0.07, 0));
      const cap = mesh(new THREE.SphereGeometry(0.12, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd42a1e, 0.4), 0, 0.12, 0);
      cap.scale.y = 0.7;
      g.add(cap);
      const dot = mat(0xfff8ea, 0.6);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, r = 0.04 + (i % 3) * 0.025;
        const y = 0.12 + Math.sqrt(Math.max(0, 0.0144 - r * r)) * 0.7;
        g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), dot, Math.cos(a) * r, y, Math.sin(a) * r));
      }
      return g;
    }
    const d = dish();
    for (let i = 0; i < 4; i++) {
      const w = mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI / 2, 0, Math.PI / 2), mat(0xd42a1e, 0.4), Math.cos(i * 1.6) * 0.04, 0.05, Math.sin(i * 1.6) * 0.04);
      w.rotation.y = i * 1.6;
      w.scale.y = 0.7;
      d.add(w);
    }
    addTo(d, mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 8), mat(0xf2ead8, 0.7), 0.05, 0.07, 0.03)).rotation.z = 1.4;
    return d;
  }
  if (kind === 'moonstone') {
    if (state === 'raw') {
      const gem = mesh(new THREE.IcosahedronGeometry(0.1, 0), new THREE.MeshPhysicalMaterial({ color: 0xcfe4ff, roughness: 0.1, metalness: 0, clearcoat: 1, emissive: 0x6fa8ff, emissiveIntensity: 0.6 }), 0, 0.1, 0);
      gem.scale.set(1, 1.2, 0.85);
      g.add(gem);
      return g;
    }
    const pl = pile(0xbcd6ff, 0.9);
    for (let i = 0; i < 4; i++) pl.add(mesh(new THREE.OctahedronGeometry(0.02, 0), mat(0xe8f2ff, 0.2, 0, 0x8fbaff, 1.2), Math.cos(i * 1.7) * 0.07, 0.07, Math.sin(i * 1.7) * 0.07));
    return pl;
  }
  if (kind === 'scale') {
    if (state === 'raw') {
      const s = mesh(new THREE.SphereGeometry(0.14, 20, 12, 0, Math.PI * 2, 0, 0.9), new THREE.MeshPhysicalMaterial({ color: 0xd8501e, roughness: 0.35, metalness: 0.5, clearcoat: 0.8, iridescence: 0.6 }), 0, -0.02, 0);
      s.scale.set(1, 0.5, 1.25);
      g.add(s);
      addTo(g, mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 20, Math.PI), mat(0xffb060, 0.4, 0.6), 0, 0.03, 0.02)).rotation.x = -Math.PI / 2 + 0.4;
      g.position.y = 0.03;
      const wrap = new THREE.Group();
      wrap.add(g);
      return wrap;
    }
    return pile(0xe86a2a, 0.4);
  }
  // lacewing — always "raw" (needs no prep)
  const body = mesh(new THREE.CapsuleGeometry(0.025, 0.12, 4, 10), mat(0x3d9a3a, 0.4, 0.2), 0, 0.08, 0);
  body.rotation.x = Math.PI / 2;
  g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), mat(0x2a6a2a, 0.4), 0, 0.085, 0.09));
  for (const s of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.012, 8, 6), mat(0xffd040, 0.3, 0, 0xff9a00, 0.8), s * 0.018, 0.1, 0.11));
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xc8ffd8, emissive: 0x4fff9a, emissiveIntensity: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.1, depthWrite: false });
  for (const s of [-1, 1]) for (const k of [0, 1]) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(0.07, 14), wingMat);
    w.scale.set(1.5, 0.5, 1);
    w.rotation.set(-Math.PI / 2 + 0.25, 0, s * (0.35 + k * 0.5));
    w.position.set(s * 0.08, 0.1 + k * 0.005, 0.01 - k * 0.05);
    w.userData.wing = s;
    g.add(w);
  }
  return g;
}

// ---------------------------------------------------------------- flask

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xdff2ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28,
  clearcoat: 1, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2,
});

export function liquidMaterial(potion: PotionId): THREE.MeshStandardMaterial {
  const c = new THREE.Color(POTIONS[potion].color);
  const glow = potion === 'mess' ? 0.15 : 1.9;
  return new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: glow, roughness: 0.2 });
}

export function makeFlask(potion: PotionId | null): THREE.Group {
  const g = new THREE.Group();
  const outer: [number, number][] = [[0, 0], [0.06, 0.004], [0.1, 0.03], [0.118, 0.08], [0.105, 0.135], [0.065, 0.17], [0.036, 0.19], [0.034, 0.27], [0.044, 0.28], [0.04, 0.29]];
  const glass = new THREE.Mesh(lathe(outer, 24), glassMat);
  glass.renderOrder = 2;
  g.add(glass);
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 12), mat(0x9a6a3c, 0.9), 0, 0.29, 0));
  if (potion) {
    const liq = mesh(lathe([[0, 0.008], [0.06, 0.012], [0.098, 0.035], [0.108, 0.08], [0.095, 0.125], [0, 0.125]], 20), liquidMaterial(potion));
    liq.name = 'liquid';
    g.add(liq);
    // ribbon label
    g.add(mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.025, 14, 1, true), mat(0xd8b048, 0.4, 0.8), 0, 0.22, 0));
  }
  return g;
}

// ---------------------------------------------------------------- owl (delivery)

export function makeOwl(): THREE.Group {
  const g = new THREE.Group();
  const feather = new THREE.MeshPhysicalMaterial({ color: 0xf0ece2, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0x998866) });
  const bodyM = mesh(new THREE.SphereGeometry(0.16, 20, 16), feather, 0, 0.18, 0);
  bodyM.scale.set(1, 1.25, 0.95);
  g.add(bodyM);
  const headM = mesh(new THREE.SphereGeometry(0.12, 20, 16), feather, 0, 0.4, 0.02);
  headM.scale.set(1.1, 0.95, 1);
  g.add(headM);
  const speck = mat(0x3a3028, 0.9);
  for (let i = 0; i < 10; i++) g.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), speck, Math.sin(i * 2.1) * 0.09, 0.12 + (i % 5) * 0.04, 0.14 - Math.abs(Math.sin(i * 2.1)) * 0.03));
  for (const s of [-1, 1]) {
    g.add(mesh(new THREE.SphereGeometry(0.045, 14, 10), mat(0xffc020, 0.2, 0, 0xffa000, 0.9), s * 0.05, 0.42, 0.1));
    g.add(mesh(new THREE.SphereGeometry(0.022, 10, 8), mat(0x080808, 0.1), s * 0.052, 0.42, 0.135));
    const w = mesh(new THREE.SphereGeometry(0.1, 14, 10), feather, s * 0.15, 0.2, -0.02);
    w.scale.set(0.35, 1, 0.8);
    w.name = s < 0 ? 'wingL' : 'wingR';
    g.add(w);
  }
  const beak = mesh(new THREE.ConeGeometry(0.02, 0.05, 8), mat(0x6a5a40, 0.5), 0, 0.37, 0.13);
  beak.rotation.x = Math.PI / 2 + 0.6;
  g.add(beak);
  for (const s of [-1, 1]) addTo(g, mesh(new THREE.ConeGeometry(0.03, 0.08, 6), feather, s * 0.08, 0.52, 0)).rotation.z = -s * 0.4;
  return g;
}

// ---------------------------------------------------------------- cauldron liquid & swirling bin

export function makeLiquidMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x1d3a34) },
      uTime: { value: 0 },
      uGlow: { value: 0.3 },
      uBoil: { value: 0 },
      uBurnt: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime, uBoil;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float r = length(uv - 0.5) * 2.0;
        p.z += uBoil * 0.02 * sin(r * 18.0 - uTime * 6.0) * (1.0 - r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime, uGlow, uBoil, uBurnt;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float sw = sin(a * 3.0 + r * 9.0 - uTime * 1.6) * 0.5 + 0.5;
        float sw2 = sin(a * 5.0 - r * 14.0 + uTime * 2.3) * 0.5 + 0.5;
        vec3 c = uColor * (0.55 + 0.35 * sw + 0.2 * sw2);
        // bubbles: cells that pop on a cycle
        vec2 g = p * 5.0;
        vec2 id = floor(g);
        vec2 f = fract(g) - 0.5;
        float rnd = h(id);
        float life = fract(uTime * (0.4 + rnd * 0.6) + rnd * 7.0);
        float rad = 0.12 + 0.28 * life;
        float ring = smoothstep(rad + 0.06, rad, length(f)) * smoothstep(rad - 0.12, rad, length(f));
        c += uColor * ring * uBoil * 1.4 * step(0.35, rnd);
        c = mix(c, vec3(0.03, 0.025, 0.02) + 0.04 * sw, uBurnt);
        c *= smoothstep(1.02, 0.78, r) * 0.7 + 0.3;
        gl_FragColor = vec4(c * uGlow, 1.0);
      }`,
  });
}

export function makeVortexMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uKick: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */ `
      uniform float uTime, uKick;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float s = sin(a * 4.0 + 8.0 / (r + 0.15) - uTime * (3.0 + uKick * 10.0)) * 0.5 + 0.5;
        vec3 c = mix(vec3(0.05, 0.0, 0.12), vec3(0.6, 0.2, 1.4), s * smoothstep(1.0, 0.2, r));
        c += vec3(1.2, 0.6, 2.0) * smoothstep(0.25, 0.0, r) * (0.6 + uKick);
        c *= smoothstep(1.0, 0.85, r);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- text label texture (crate plaques)

export function labelTexture(text: string, bg = '#e8d6a8', fg = '#3a2210'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = fg;
  g.lineWidth = 5;
  g.strokeRect(8, 8, 240, 80);
  g.fillStyle = fg;
  g.font = 'italic bold 34px Georgia, "Palatino Linotype", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 50, 220);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
