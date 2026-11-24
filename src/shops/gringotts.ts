/**
 * Gringotts Wizarding Bank — the focal building at the Y-junction.
 *
 * A towering white-marble temple front: broad stepped staircase between
 * carved balustrades and brass braziers with live flames; six fluted
 * Corinthian columns, several canting 2–4° off vertical; a deep coffered
 * portico with massive bronze relief doors; a gilded frieze; a stepped
 * pediment and attic; a ribbed verdigris dome and lantern; and a pale,
 * scarred dragon perched on the roofline (see gringottsDragon.ts).
 *
 * Local frame (STREET.gringottsSite()): origin at the centre of the fork line
 * on the plaza surface, +Z back down the street, +X to the viewer's right.
 * The portico and stairs step forward into the plaza; the wedge-shaped body
 * runs back between the two branch lanes, its flank walls following the
 * lanes' inner edges.
 */
import * as THREE from 'three';
import { GeometryBucket, PROFILES, buildWall, chamferBox, extrudeProfile, letteringMaterial, mergeStatic, type Animator, type Kit } from '../architecture/kit';
import { STREET, createFrame } from '../architecture/street';
import { heightToNormal } from '../materials/texgen';
import { SeededRandom } from '../core/random';
import { createFlame } from '../fx/flame';
import { buildDragon } from './gringottsDragon';
import type { ShopModule } from './index';

// ---- Dimensions (metres) -----------------------------------------------------
const STEPS = 8, RISE = 0.18, TREAD = 0.42;
const STYLO_Y = STEPS * RISE;          // portico floor height (1.44)
const STYLO_FRONT = 2.6;               // z of the top step edge
const STAIR_HALF = 4.9;
const PORTICO_HALF = 5.05;
const FACADE_Z = -0.7;                 // the wall behind the portico
const COL_Z = 1.85, COL_N = 6, COL_SPACING = 1.7;
const COL_BASE = 0.55, COL_SHAFT = 8.0, COL_CAP = 1.05, COL_R = 0.42;
const COL_TOP = STYLO_Y + COL_BASE + COL_SHAFT + COL_CAP; // 11.04
const ARCH_H = 0.7, FRIEZE_H = 0.86, CORNICE_H = 0.65;
const ENT_TOP = COL_TOP + ARCH_H + FRIEZE_H + CORNICE_H;  // 13.25
const PED_H = 2.5, PED_HALF = 5.3;
const ATTIC_TOP = ENT_TOP + 0.95;
/** Lean (degrees) of each column — the iconic crooked silhouette. */
const COLUMN_LEAN = [-3.1, 0.6, 2.6, -1.2, 3.6, -2.2];

/** Fluted shaft with entasis: 24 concave flutes with sharp arrises, fading at the ends. */
function flutedShaft(r0: number, h: number): THREE.BufferGeometry {
  const RS = 96, HS = 16;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= HS; j++) {
    const t = j / HS, y = t * h;
    const R = r0 * (1 - 0.12 * Math.pow(t, 1.5)) * (1 + 0.02 * Math.sin(t * Math.PI));
    const fade = Math.min(1, t / 0.04, (1 - t) / 0.04);
    for (let i = 0; i <= RS; i++) {
      const a = (i / RS) * Math.PI * 2;
      const d = Math.pow(Math.abs(Math.sin(a * 12)), 0.7);
      const r = R * (1 - 0.055 * d * fade);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push(((i / RS) * (2 * Math.PI * r0)) / 3.2, y / 3.2);
    }
  }
  for (let j = 0; j < HS; j++) for (let i = 0; i < RS; i++) {
    const a = j * (RS + 1) + i, b = a + 1, c = a + RS + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A bent acanthus leaf with lobed edges, curling outward at the tip. */
function acanthusGeometry(w: number, h: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w * 0.18, 0);
  const lobes = 4;
  for (let i = 0; i <= lobes; i++) {
    const t = i / lobes, y = t * h * 0.9;
    const ww = w * 0.5 * Math.sin(Math.PI * (0.15 + 0.7 * t));
    s.lineTo(-ww, y);
    s.lineTo(-ww * 0.65, y + h * 0.08);
  }
  s.lineTo(0, h);
  for (let i = lobes; i >= 0; i--) {
    const t = i / lobes, y = t * h * 0.9;
    const ww = w * 0.5 * Math.sin(Math.PI * (0.15 + 0.7 * t));
    s.lineTo(ww * 0.65, y + h * 0.08);
    s.lineTo(ww, y);
  }
  s.lineTo(w * 0.18, 0);
  const g = new THREE.ShapeGeometry(s, 3);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / h, x = p.getX(i) / w;
    // bow outward, curl the tip forward and down, cup the blade
    p.setZ(i, 0.16 * h * y * y + 0.05 * h * Math.max(0, y - 0.8) * 8 - 0.04 * h * x * x * 4);
    if (y > 0.85) p.setY(i, p.getY(i) - (y - 0.85) * h * 0.9);
  }
  g.computeVertexNormals();
  return g;
}

function voluteGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 3.2, r = 0.11 * (1 - 0.75 * t); pts.push(new THREE.Vector3(0, Math.sin(a) * r, Math.cos(a) * r)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.024, 6, false);
}

/** Bronze relief door panel textures: height drawn on canvas → normal map via Sobel. */
function bronzeReliefMaterial(kit: Kit): THREE.MeshStandardMaterial {
  return kit.mats.memo('gringotts-bronze-relief', () => {
    const S = 1024, ASPECT = 6.15 / 1.75; // panel is ~3.5× taller than wide
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d')!;
    const lv = (v: number) => `rgb(${v},${v},${v})`;
    g.fillStyle = lv(70); g.fillRect(0, 0, S, S);
    // stiles and rails
    g.fillStyle = lv(200); g.fillRect(0, 0, S, S);
    g.fillStyle = lv(70);
    const panels = 4, mx = S * 0.13, gap = S * 0.035, ph = (S - mx * 0.6 - gap * (panels + 1)) / panels;
    const rng = new SeededRandom('relief');
    for (let k = 0; k < panels; k++) {
      const y0 = mx * 0.3 + gap + k * (ph + gap);
      g.fillStyle = lv(70); g.fillRect(mx, y0, S - 2 * mx, ph);
      // raised moulded border inside the panel
      g.strokeStyle = lv(170); g.lineWidth = S * 0.018; g.strokeRect(mx + S * 0.03, y0 + S * 0.01, S - 2 * mx - S * 0.06, ph - S * 0.02);
      g.save();
      g.translate(S / 2, y0 + ph / 2);
      g.scale(1, 1 / ASPECT); // draw round motifs in true proportion
      const R = (S - 2 * mx) * 0.32;
      if (k % 2 === 0) {
        // rosette roundel
        g.fillStyle = lv(150); g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        g.fillStyle = lv(95); g.beginPath(); g.arc(0, 0, R * 0.86, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 12; i++) {
          g.save(); g.rotate((i / 12) * Math.PI * 2);
          g.fillStyle = lv(210); g.beginPath(); g.ellipse(0, -R * 0.45, R * 0.13, R * 0.38, 0, 0, Math.PI * 2); g.fill();
          g.restore();
        }
        g.fillStyle = lv(240); g.beginPath(); g.arc(0, 0, R * 0.16, 0, Math.PI * 2); g.fill();
      } else {
        // lozenge with interlaced rings and bosses
        g.fillStyle = lv(140);
        g.beginPath(); g.moveTo(0, -R * 1.5); g.lineTo(R * 1.05, 0); g.lineTo(0, R * 1.5); g.lineTo(-R * 1.05, 0); g.closePath(); g.fill();
        g.strokeStyle = lv(215); g.lineWidth = R * 0.09;
        for (const [x, y] of [[0, -R * 0.55], [0, R * 0.55], [-R * 0.42, 0], [R * 0.42, 0]]) { g.beginPath(); g.arc(x, y, R * 0.38, 0, Math.PI * 2); g.stroke(); }
        g.fillStyle = lv(245);
        for (const [x, y] of [[0, -R * 1.25], [0, R * 1.25], [-R * 0.85, 0], [R * 0.85, 0], [0, 0]]) { g.beginPath(); g.arc(x, y, R * 0.09, 0, Math.PI * 2); g.fill(); }
      }
      g.restore();
    }
    // hand-chased texture
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${rng.chance(0.5) ? '255,255,255' : '0,0,0'},0.04)`; g.fillRect(rng.range(0, S), rng.range(0, S), 2, 2); }
    // soften into bevels
    const blur = document.createElement('canvas'); blur.width = blur.height = S;
    const bg = blur.getContext('2d')!; bg.filter = 'blur(3px)'; bg.drawImage(c, 0, 0);
    const px = bg.getImageData(0, 0, S, S).data;
    const h = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) h[(S - 1 - y) * S + x] = px[(y * S + x) * 4] / 255; // v-up
    const normal = heightToNormal(h, S, 0.02 / 1.75);
    const albedo = new Uint8ClampedArray(S * S * 4), orm = new Uint8ClampedArray(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      const v = h[i];
      const polish = Math.min(1, Math.max(0, (v - 0.55) * 2.5));
      const patina = Math.min(1, Math.max(0, (0.45 - v) * 3));
      const r = 0.42 + 0.38 * polish - 0.18 * patina, gg = 0.26 + 0.24 * polish - 0.06 * patina, b = 0.14 + 0.12 * polish + 0.02 * patina;
      albedo.set([r * 255, gg * 255, b * 255, 255], i * 4);
      orm.set([255 * (0.6 + 0.4 * v), 255 * (0.55 - 0.35 * polish + 0.2 * patina), 255 * (1 - 0.4 * patina), 255], i * 4);
    }
    const tex = (d: Uint8ClampedArray, srgb: boolean) => {
      const t = new THREE.DataTexture(d as Uint8ClampedArray<ArrayBuffer>, S, S);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.anisotropy = 8; t.needsUpdate = true;
      return t;
    };
    const ormT = tex(orm, false);
    const m = new THREE.MeshStandardMaterial({ map: tex(albedo, true), normalMap: tex(normal, false), roughnessMap: ormT, metalnessMap: ormT, aoMap: ormT, metalness: 1, roughness: 1 });
    m.name = 'bronze-relief';
    return m;
  }) as THREE.MeshStandardMaterial;
}

/** Inner-edge points of the two branch lanes, in Gringotts-local space. */
function laneEdges(inv: THREE.Matrix4): { left: THREE.Vector3[]; right: THREE.Vector3[] } {
  const f = createFrame();
  const get = (name: string, sign: number) => {
    const lane = STREET.lanes.find((l) => l.name === name)!;
    return [3.4, 9, 15].map((s) => {
      lane.sampler.frame(s, f);
      const d = sign * (lane.halfWidth + 0.15);
      return new THREE.Vector3(f.x + f.nx * d, f.y, f.z + f.nz * d).applyMatrix4(inv);
    });
  };
  // Inner edge = the lane side facing the fork: right side of the left lane, left side of the right lane.
  return { left: get('branch-left', 1), right: get('branch-right', -1) };
}

export const GRINGOTTS: ShopModule = {
  id: 'gringotts',
  name: 'Gringotts Wizarding Bank',
  frontage: (PORTICO_HALF + 0.55) * 2,
  depth: 16,
  build({ kit }) {
    const rng = kit.useRng('gringotts');
    const M = kit.mats;
    const site = STREET.gringottsSite();
    const inv = site.matrix.clone().invert();
    const marble = M.get('marble');
    const marbleJ = M.jitter('marble');
    const brass = M.get('brass');
    const bronze = M.tinted('brass', 0xb07850, 'bronze');
    const copper = M.get('copper');
    const group = new THREE.Group();
    group.name = 'gringotts';
    const animators: Animator[] = [];
    const b = new GeometryBucket();
    const ws = 3.2; // marble tiled at monumental scale (veins would read as wallpaper at 1 m)

    // ---- Stairs, stylobate, balustrades ---------------------------------------
    for (let i = 0; i < STEPS; i++) {
      const top = (i + 1) * RISE;
      const z0 = STYLO_FRONT + (STEPS - 1 - i) * TREAD;
      b.box(marble, STAIR_HALF * 2 - i * 0.04, top + 0.4, TREAD + 0.05, 0.02, { x: 0, y: (top - 0.4) / 2, z: z0 + TREAD / 2 }, undefined, ws);
    }
    b.box(marble, PORTICO_HALF * 2, STYLO_Y + 0.4, STYLO_FRONT - FACADE_Z + 0.3, 0.03, { x: 0, y: (STYLO_Y - 0.4) / 2, z: (STYLO_FRONT + FACADE_Z - 0.3) / 2 }, undefined, ws);
    const stairEnd = STYLO_FRONT + STEPS * TREAD;
    const slopeLen = Math.hypot(stairEnd - STYLO_FRONT, STYLO_Y);
    const slopeA = Math.atan2(STYLO_Y, stairEnd - STYLO_FRONT);
    const baluster = new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.09, 0.06], [0.06, 0.1], [0.05, 0.16], [0.085, 0.3], [0.09, 0.4], [0.055, 0.56], [0.04, 0.62], [0.06, 0.66], [0.08, 0.7], [0.08, 0.74], [0, 0.74]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
    kit.instances.define('baluster', baluster, marbleJ);
    for (const sx of [-1, 1]) {
      const x = sx * (STAIR_HALF + 0.22);
      // raking stringer + handrail
      const mid = new THREE.Vector3(x, STYLO_Y / 2 + 0.2, (STYLO_FRONT + stairEnd) / 2);
      b.box(marble, 0.42, 0.5, slopeLen + 0.2, 0.03, mid, new THREE.Euler(slopeA, 0, 0), ws);
      b.box(marble, 0.36, 0.13, slopeLen + 0.3, 0.03, mid.clone().add(new THREE.Vector3(0, 1.05, 0)), new THREE.Euler(slopeA, 0, 0), ws);
      for (let z = STYLO_FRONT + 0.3; z < stairEnd - 0.4; z += 0.27) {
        const y = STYLO_Y * (1 - (z - STYLO_FRONT) / (stairEnd - STYLO_FRONT)) + 0.45;
        kit.instances.put('baluster', group, { x, y, z }, null, { x: 1, y: 1, z: 1 });
      }
      // portico side balustrade
      b.box(marble, 0.36, 0.22, STYLO_FRONT - FACADE_Z, 0.03, { x: sx * (PORTICO_HALF - 0.18), y: STYLO_Y + 0.11, z: (STYLO_FRONT + FACADE_Z) / 2 }, undefined, ws);
      b.box(marble, 0.34, 0.13, STYLO_FRONT - FACADE_Z, 0.03, { x: sx * (PORTICO_HALF - 0.18), y: STYLO_Y + 1.0, z: (STYLO_FRONT + FACADE_Z) / 2 }, undefined, ws);
      for (let z = FACADE_Z + 0.4; z < STYLO_FRONT - 0.2; z += 0.27) kit.instances.put('baluster', group, { x: sx * (PORTICO_HALF - 0.18), y: STYLO_Y + 0.22, z }, null, { x: 1, y: 1, z: 1 });
      // newel pedestals: bottom (towering braziers) and top
      for (const [z, y0, tall] of [[stairEnd + 0.1, 0, true], [STYLO_FRONT - 0.05, STYLO_Y, false]] as const) {
        b.box(marble, 0.7, 1.25, 0.7, 0.04, { x, y: y0 + 0.625 - 0.2, z }, undefined, ws);
        b.box(marble, 0.86, 0.14, 0.86, 0.03, { x, y: y0 + 1.12, z }, undefined, ws);
        b.box(marble, 0.86, 0.18, 0.86, 0.03, { x, y: y0 - 0.1, z }, undefined, ws);
        const stand = new THREE.LatheGeometry((tall
          ? [[0, 0], [0.3, 0], [0.32, 0.06], [0.16, 0.14], [0.11, 0.4], [0.07, 1.1], [0.09, 1.2], [0.06, 1.6], [0.11, 1.7], [0.42, 1.95], [0.5, 2.12], [0.47, 2.16], [0.3, 2.05], [0, 2.05]]
          : [[0, 0], [0.22, 0], [0.24, 0.05], [0.1, 0.12], [0.07, 0.5], [0.1, 0.56], [0.33, 0.78], [0.38, 0.9], [0.35, 0.93], [0.22, 0.85], [0, 0.85]]).map(([a, c]) => new THREE.Vector2(a, c)), 24);
        b.add(brass, stand, new THREE.Matrix4().makeTranslation(x, y0 + 1.19, z));
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + 0.3, h = tall ? 1.6 : 0.6;
          b.box(brass, 0.04, h, 0.04, 0.008, { x: x + Math.cos(a) * 0.22, y: y0 + 1.19 + h / 2 + 0.1, z: z + Math.sin(a) * 0.22 }, new THREE.Euler(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12));
        }
        const flame = createFlame(tall ? 1.1 : 0.6, rng.range(0, 50), tall, 11);
        flame.object.position.set(x, y0 + 1.19 + (tall ? 2.02 : 0.82), z);
        group.add(flame.object);
        animators.push(flame);
      }
    }

    // ---- Columns ------------------------------------------------------------------
    const shaft = flutedShaft(COL_R, COL_SHAFT);
    const baseG = new THREE.LatheGeometry([[0, 0], [COL_R * 1.32, 0], [COL_R * 1.32, 0.05], [COL_R * 1.38, 0.1], [COL_R * 1.32, 0.17], [COL_R * 1.14, 0.22], [COL_R * 1.12, 0.3], [COL_R * 1.2, 0.34], [COL_R * 1.16, 0.38], [COL_R * 1.04, 0.42], [COL_R, 0.46], [0, 0.46]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
    const bell = new THREE.LatheGeometry([[0, 0], [COL_R * 0.88, 0], [COL_R * 0.92, 0.08], [COL_R * 1.0, 0.45], [COL_R * 1.2, 0.8], [COL_R * 1.32, 0.9], [0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y)), 32);
    kit.instances.define('acanthus', acanthusGeometry(0.3, 0.5), M.jitter('marble'));
    kit.instances.define('volute', voluteGeometry(), M.jitter('marble'));
    for (let i = 0; i < COL_N; i++) {
      const col = new THREE.Group();
      col.position.set(-COL_SPACING * (COL_N - 1) / 2 + i * COL_SPACING, STYLO_Y, COL_Z);
      col.rotation.set(THREE.MathUtils.degToRad(rng.range(-0.4, 0.4)), 0, THREE.MathUtils.degToRad(COLUMN_LEAN[i]));
      const cb = new GeometryBucket();
      cb.box(marble, COL_R * 2.9, 0.12, COL_R * 2.9, 0.02, { x: 0, y: 0.06, z: 0 }, undefined, ws);
      cb.add(marble, baseG, new THREE.Matrix4().makeTranslation(0, 0.1, 0));
      cb.add(marble, shaft, new THREE.Matrix4().makeTranslation(0, COL_BASE, 0));
      const capY = COL_BASE + COL_SHAFT;
      cb.add(marble, bell, new THREE.Matrix4().makeTranslation(0, capY, 0));
      cb.box(marble, COL_R * 3.0, 0.15, COL_R * 3.0, 0.03, { x: 0, y: capY + 0.98, z: 0 }, undefined, ws);
      col.add(cb.build(`column-${i}`));
      for (let row = 0; row < 2; row++) for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + row * Math.PI / 8;
        const r = COL_R * (0.95 + row * 0.08);
        kit.instances.put('acanthus', col, { x: Math.sin(a) * r, y: capY + 0.02 + row * 0.3, z: Math.cos(a) * r }, new THREE.Euler(0, a, 0), { x: 1, y: row ? 1.05 : 0.85, z: 1 });
      }
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        kit.instances.put('volute', col, { x: Math.sin(a) * COL_R * 1.42, y: capY + 0.78, z: Math.cos(a) * COL_R * 1.42 }, new THREE.Euler(0, a + Math.PI / 2, 0), { x: 1, y: 1, z: 1 });
      }
      group.add(col);
    }

    // ---- Entablature, coffered ceiling, frieze, cornice with dentils ---------------
    const entDepth = COL_Z + 0.55 - FACADE_Z;
    const entZ = (COL_Z + 0.55 + FACADE_Z) / 2;
    for (let k = 0; k < 3; k++) b.box(marble, PORTICO_HALF * 2 - 0.1 + k * 0.04, ARCH_H / 3, entDepth + k * 0.04, 0.012, { x: 0, y: COL_TOP + (k + 0.5) * ARCH_H / 3, z: entZ + k * 0.02 }, undefined, ws);
    b.box(marble, PORTICO_HALF * 2, FRIEZE_H, entDepth, 0.02, { x: 0, y: COL_TOP + ARCH_H + FRIEZE_H / 2, z: entZ - 0.02 }, undefined, ws);
    const cornY = COL_TOP + ARCH_H + FRIEZE_H;
    b.add(marble, extrudeProfile([[0, 0], [0.12, 0], [0.12, 0.14], [0.2, 0.2], [0.24, 0.36], [0.42, 0.42], [0.5, 0.55], [0.5, 0.65], [0, 0.65]], PORTICO_HALF * 2 + 0.8, ws),
      new THREE.Matrix4().makeTranslation(-PORTICO_HALF - 0.4, cornY, COL_Z + 0.53));
    kit.instances.define('dentil', chamferBox(0.11, 0.15, 0.14, 0.012, ws), marbleJ);
    for (let x = -PORTICO_HALF - 0.3; x <= PORTICO_HALF + 0.3; x += 0.2) kit.instances.put('dentil', group, { x, y: cornY + 0.08, z: COL_Z + 0.68 }, null, { x: 1, y: 1, z: 1 });
    // coffered portico soffit
    b.box(marble, PORTICO_HALF * 2, 0.2, entDepth, 0.02, { x: 0, y: COL_TOP - 0.1 + 0.05, z: entZ }, undefined, ws);
    for (let x = -PORTICO_HALF + 0.5; x <= PORTICO_HALF - 0.4; x += 1.0) b.box(marble, 0.16, 0.28, entDepth - 0.4, 0.02, { x, y: COL_TOP - 0.24, z: entZ }, undefined, ws);
    for (let z = FACADE_Z + 0.6; z < COL_Z; z += 0.95) b.box(marble, PORTICO_HALF * 2 - 0.4, 0.28, 0.16, 0.02, { x: 0, y: COL_TOP - 0.24, z }, undefined, ws);
    const frieze = new THREE.Mesh(new THREE.PlaneGeometry(PORTICO_HALF * 2 - 0.3, FRIEZE_H - 0.1), letteringMaterial({
      text: 'GRINGOTTS WIZARDING BANK', aspect: (PORTICO_HALF * 2 - 0.3) / (FRIEZE_H - 0.1), ground: '#e6e2d9', style: 'gold',
      resolution: 4096, marble: true, border: false, tracking: 0.12, wear: 0.04, seed: 'gringotts-frieze',
    }));
    frieze.position.set(0, COL_TOP + ARCH_H + FRIEZE_H / 2, entZ - 0.02 + entDepth / 2 + 0.006);
    group.add(frieze);

    // ---- Pediment (stepped), roundel, acroteria, attic ---------------------------
    const pedZ = COL_Z + 0.3;
    const tri = new THREE.Shape([new THREE.Vector2(-PED_HALF + 0.4, 0), new THREE.Vector2(PED_HALF - 0.4, 0), new THREE.Vector2(0, PED_H - 0.3)]);
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.5, bevelEnabled: false });
    b.add(marble, tg, new THREE.Matrix4().makeTranslation(0, ENT_TOP, pedZ - 0.5));
    const rakeLen = Math.hypot(PED_HALF, PED_H), rakeA = Math.atan2(PED_H, PED_HALF);
    for (const sx of [-1, 1]) {
      const prof = extrudeProfile([[0, -0.3], [0.38, -0.3], [0.38, -0.18], [0.46, -0.08], [0.46, 0.12], [0, 0.12]], rakeLen + 0.35, ws);
      const m = new THREE.Matrix4().makeTranslation(sx * (PED_HALF + 0.15), ENT_TOP + 0.05, pedZ - 0.15)
        .multiply(new THREE.Matrix4().makeRotationZ(sx > 0 ? Math.PI - rakeA : rakeA))
        .multiply(new THREE.Matrix4().makeScale(1, sx > 0 ? -1 : 1, 1));
      b.add(marble, prof, m);
    }
    // stepped attic behind the pediment
    b.box(marble, 7.4, ATTIC_TOP - ENT_TOP, 4.2, 0.04, { x: 0, y: (ATTIC_TOP + ENT_TOP) / 2, z: FACADE_Z - 1.6 }, undefined, ws);
    b.box(marble, 7.7, 0.18, 4.5, 0.04, { x: 0, y: ATTIC_TOP + 0.09, z: FACADE_Z - 1.6 }, undefined, ws);
    b.box(marble, 5.6, 0.45, 3.4, 0.04, { x: 0, y: ATTIC_TOP + 0.4, z: FACADE_Z - 1.9 }, undefined, ws);
    const roundel = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), letteringMaterial({ text: 'G', aspect: 1, ground: '#ddd6c8', style: 'gold', marble: true, resolution: 1024, border: true, seed: 'g' }));
    roundel.position.set(0, ENT_TOP + 0.95, pedZ + 0.005);
    group.add(roundel);
    const gilt = M.memo('gilt', () => { const m = brass.clone(); m.color.setRGB(1.25, 1.05, 0.7); return m; });
    const urn = new THREE.LatheGeometry([[0, 0], [0.22, 0], [0.24, 0.05], [0.1, 0.12], [0.08, 0.2], [0.22, 0.38], [0.24, 0.5], [0.12, 0.62], [0.16, 0.7], [0.04, 0.82], [0.06, 0.9], [0, 1.0]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
    for (const [x, y, s] of [[0, ENT_TOP + PED_H - 0.15, 1.1], [-PED_HALF + 0.2, ENT_TOP + 0.05, 0.9], [PED_HALF - 0.2, ENT_TOP + 0.05, 0.9]] as const) {
      b.add(gilt, urn.clone().scale(s, s, s), new THREE.Matrix4().makeTranslation(x, y, pedZ - 0.2));
    }

    // ---- Wedge body between the lanes -----------------------------------------------
    const edges = laneEdges(inv);
    const FL = new THREE.Vector3(-4.45, 0, FACADE_Z), FR = new THREE.Vector3(4.45, 0, FACADE_Z);
    const BL = edges.left[2].clone().setY(0), BR = edges.right[2].clone().setY(0);
    const bodyH = ENT_TOP;
    const wallMats = { wall: marble, stone: marble, timber: M.get('paint-charcoal'), glass: M.memo('gringotts-glass', () => { const g = M.get('glass').clone(); g.emissive = new THREE.Color(1, 0.72, 0.4); g.emissiveIntensity = 0.35; return g; }), door: bronze, iron: M.get('iron') };
    const placeWall = (a: THREE.Vector3, c: THREE.Vector3, y0: number, opts: Parameters<typeof buildWall>[0]) => {
      const w = buildWall(opts);
      const dir = c.clone().sub(a).setY(0).normalize();
      const z = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
      w.matrixAutoUpdate = false;
      w.matrix.makeBasis(dir, new THREE.Vector3(0, 1, 0), z).setPosition(a.x, y0, a.z);
      group.add(w);
    };
    // front wall behind the portico, with the great doorway and flanking windows
    const doorW = 3.7, doorH = 6.4;
    placeWall(FL, FR, STYLO_Y, {
      name: 'gringotts-front', length: 8.9, height: bodyH - STYLO_Y, thickness: 1.0, wallWorldSize: ws, plinth: false, top: 'none', materials: wallMats,
      openings: [
        { kind: 'void', x: 4.45 - doorW / 2, y: 0, width: doorW, height: doorH },
        { kind: 'window', x: 0.75, y: 1.4, width: 1.2, height: 3.4 }, { kind: 'window', x: 8.9 - 1.95, y: 1.4, width: 1.2, height: 3.4 },
        { kind: 'window', x: 0.75, y: 6.6, width: 1.2, height: 2.4 }, { kind: 'window', x: 8.9 - 1.95, y: 6.6, width: 1.2, height: 2.4 },
      ],
    });
    // flank walls along each lane (a facade in their own right) and the back
    const flankOpenings = (len: number) => {
      const o = [];
      for (let x = 1.4; x < len - 1.6; x += 2.6) o.push({ kind: 'window' as const, x, y: 1.6, width: 1.25, height: 3.0 }, { kind: 'window' as const, x, y: 7.0, width: 1.25, height: 2.4 });
      return o;
    };
    const lenL = BL.distanceTo(FL), lenR = BR.distanceTo(FR);
    placeWall(BL, FL, -0.6, { name: 'gringotts-flank-l', length: lenL, height: bodyH + 0.6, thickness: 0.9, wallWorldSize: ws, top: 'cornice', materials: wallMats, openings: flankOpenings(lenL).map((o) => ({ ...o, y: o.y + 0.6 })) });
    placeWall(FR, BR, -0.6, { name: 'gringotts-flank-r', length: lenR, height: bodyH + 0.6, thickness: 0.9, wallWorldSize: ws, top: 'cornice', materials: wallMats, openings: flankOpenings(lenR).map((o) => ({ ...o, y: o.y + 0.6 })) });
    placeWall(BR, BL, -0.6, { name: 'gringotts-back', length: BR.distanceTo(BL), height: bodyH + 0.6, thickness: 0.9, wallWorldSize: ws, top: 'cornice', materials: wallMats, openings: [] });
    // roof deck
    // rotateX(+90°) maps shape Y → +Z, so author the plan as (x, z) directly.
    const deck = new THREE.Shape([new THREE.Vector2(FL.x, FL.z), new THREE.Vector2(FR.x, FR.z), new THREE.Vector2(BR.x, BR.z), new THREE.Vector2(BL.x, BL.z)]);
    const dg = new THREE.ExtrudeGeometry(deck, { depth: 0.35, bevelEnabled: false });
    dg.rotateX(Math.PI / 2);
    b.add(M.tinted('iron', 0x9aa0a6, 'lead'), dg, new THREE.Matrix4().makeTranslation(0, bodyH, 0));

    // ---- Doorway: bronze relief doors, studs, rings, moulded surround ----------------
    const relief = bronzeReliefMaterial(kit);
    const leafW = doorW / 2 - 0.03, leafH = doorH - 0.08;
    const doorZ = FACADE_Z - 0.55;
    kit.instances.define('door-stud', new THREE.SphereGeometry(0.035, 8, 6), M.jitter('brass', bronze));
    for (const sx of [-1, 1]) {
      const cx = sx * (leafW / 2 + 0.015);
      b.box(bronze, leafW, leafH, 0.16, 0.02, { x: cx, y: STYLO_Y + leafH / 2, z: doorZ }, undefined, 0.6);
      const face = new THREE.PlaneGeometry(leafW - 0.04, leafH - 0.04);
      if (sx > 0) { const uv = face.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
      const fm = new THREE.Mesh(face, relief);
      fm.position.set(cx, STYLO_Y + leafH / 2, doorZ + 0.082);
      group.add(fm);
      for (let y = 0.25; y < leafH; y += 0.42) for (const ex of [-1, 1]) kit.instances.put('door-stud', group, { x: cx + ex * (leafW / 2 - 0.07), y: STYLO_Y + y, z: doorZ + 0.09 }, null, { x: 1, y: 1, z: 1 });
      b.add(bronze, new THREE.TorusGeometry(0.22, 0.035, 10, 28), new THREE.Matrix4().makeTranslation(cx - sx * 0.35, STYLO_Y + 2.7, doorZ + 0.16));
      b.add(bronze, new THREE.SphereGeometry(0.1, 14, 10), new THREE.Matrix4().makeTranslation(cx - sx * 0.35, STYLO_Y + 2.95, doorZ + 0.12));
    }
    const surround = [[0, 0], [0.18, 0], [0.18, 0.05], [0.24, 0.08], [0.24, 0.16], [0.3, 0.2], [0.3, 0.26], [0, 0.26]] as [number, number][];
    for (const sx of [-1, 1]) {
      b.add(marble, extrudeProfile(surround, doorH + 0.2, ws).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(sx * (doorW / 2 + 0.13), STYLO_Y, FACADE_Z + 0.48).multiply(new THREE.Matrix4().makeRotationY(sx > 0 ? 0 : 0)));
    }
    b.add(marble, extrudeProfile(PROFILES.cornice(0.4), doorW + 1.2, ws), new THREE.Matrix4().makeTranslation(-(doorW + 1.2) / 2, STYLO_Y + doorH + 0.2, FACADE_Z + 0.5));
    b.box(marble, 0.55, 0.75, 0.3, 0.03, { x: 0, y: STYLO_Y + doorH + 0.05, z: FACADE_Z + 0.55 }, undefined, ws);
    b.add(M.interior('marble', 0xffc890, 0.25), new THREE.BoxGeometry(doorW + 0.2, doorH, 2.2).translate(0, STYLO_Y + doorH / 2, doorZ - 1.2));

    // ---- Drum, ribbed dome and lantern -----------------------------------------------
    const domeC = new THREE.Vector3(0, bodyH, (FACADE_Z + (BL.z + BR.z) / 2) / 2 - 0.4);
    const drumR = 3.0, drumH = 2.7;
    b.add(marble, new THREE.CylinderGeometry(drumR, drumR + 0.1, drumH, 48, 1, true), new THREE.Matrix4().makeTranslation(domeC.x, domeC.y + drumH / 2, domeC.z));
    b.add(marble, new THREE.CylinderGeometry(drumR + 0.25, drumR + 0.3, 0.25, 48), new THREE.Matrix4().makeTranslation(domeC.x, domeC.y + 0.12, domeC.z));
    b.add(marble, new THREE.CylinderGeometry(drumR + 0.3, drumR + 0.1, 0.3, 48), new THREE.Matrix4().makeTranslation(domeC.x, domeC.y + drumH + 0.1, domeC.z));
    kit.instances.define('drum-pilaster', chamferBox(0.32, drumH - 0.4, 0.14, 0.02, ws), marbleJ);
    kit.instances.define('drum-window', chamferBox(0.55, 1.4, 0.12, 0.03, ws), M.interior('marble', 0xffb070, 0.6));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const p = { x: domeC.x + Math.sin(a) * (drumR + 0.05), y: domeC.y + drumH / 2, z: domeC.z + Math.cos(a) * (drumR + 0.05) };
      kit.instances.put(k % 2 ? 'drum-window' : 'drum-pilaster', group, p, new THREE.Euler(0, a, 0), { x: 1, y: 1, z: 1 });
    }
    const domeProfile: [number, number][] = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * Math.PI / 2; domeProfile.push([(drumR + 0.05) * Math.cos(a) * (1 - 0.06 * Math.sin(a * 2)), 3.1 * Math.sin(a) + 0.15 * Math.pow(t, 6)]); }
    domeProfile.push([0, 3.3]);
    const dome = new THREE.LatheGeometry(domeProfile.map(([x, y]) => new THREE.Vector2(x, y)), 48);
    b.add(copper, dome, new THREE.Matrix4().makeTranslation(domeC.x, domeC.y + drumH + 0.25, domeC.z));
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const pts = domeProfile.slice(0, 22).map(([r, y]) => new THREE.Vector3(Math.sin(a) * (r + 0.03), y, Math.cos(a) * (r + 0.03)));
      b.add(copper, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 5, false), new THREE.Matrix4().makeTranslation(domeC.x, domeC.y + drumH + 0.25, domeC.z));
    }
    const lanternY = domeC.y + drumH + 0.25 + 3.15;
    kit.instances.define('lantern-col', new THREE.CylinderGeometry(0.05, 0.06, 1.3, 10), marbleJ);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; kit.instances.put('lantern-col', group, { x: domeC.x + Math.sin(a) * 0.62, y: lanternY + 0.75, z: domeC.z + Math.cos(a) * 0.62 }, null, { x: 1, y: 1, z: 1 }); }
    b.add(marble, new THREE.CylinderGeometry(0.8, 0.85, 0.12, 24), new THREE.Matrix4().makeTranslation(domeC.x, lanternY + 0.06, domeC.z));
    b.add(marble, new THREE.CylinderGeometry(0.82, 0.78, 0.14, 24), new THREE.Matrix4().makeTranslation(domeC.x, lanternY + 1.45, domeC.z));
    b.add(M.glow(0xffc070, 1.6), new THREE.CylinderGeometry(0.5, 0.5, 1.2, 16), new THREE.Matrix4().makeTranslation(domeC.x, lanternY + 0.75, domeC.z));
    b.add(copper, new THREE.SphereGeometry(0.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(domeC.x, lanternY + 1.5, domeC.z));
    b.add(gilt, urn.clone().scale(0.8, 1.3, 0.8), new THREE.Matrix4().makeTranslation(domeC.x, lanternY + 2.25, domeC.z));

    group.add(b.build('gringotts-masonry'));

    // ---- The dragon on the roofline --------------------------------------------------
    const dragon = buildDragon(kit);
    dragon.group.position.set(0, ATTIC_TOP + 0.6, FACADE_Z - 1.6);
    group.add(dragon.group);
    animators.push(dragon);

    // ---- Floodlight washing the facade from the plaza (no shadows) -------------------
    const flood = new THREE.SpotLight(0xffd6a0, 55, 40, THREE.MathUtils.degToRad(32), 0.85, 1.6);
    flood.position.set(0, 0.6, stairEnd + 9);
    flood.target.position.set(0, 9.5, COL_Z);
    group.add(flood, flood.target);

    mergeStatic(group, 'gringotts-static');
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && /interior|lettering|glass|relief/.test(((m.material as THREE.Material).name ?? ''))) m.castShadow = false;
    });
    return { group, doors: [], animators };
  },
};
