/**
 * Glowing multi-layer window interiors. Behind every shop window sits a
 * ~1.5 m diorama: an amber-glowing back wall, floor-to-ceiling shelving
 * stocked by trade, mid-depth pedestals, the front risers (fillDisplay), a
 * hanging lamp with a pool of light — so no window ever reads as black glass.
 * Bespoke dressings: Ollivanders' precarious wand-box walls, Flourish &
 * Blotts' towering shelves and levitating open books, the apothecary's
 * glowing flasks, and the Quidditch shop's hovering broom under a spotlight.
 *
 * Lighting is emissive (backdrop + lamp globe + additive light pools), not
 * dozens of real point lights — the bloom pass makes it read as lamplight.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SeededRandom } from '../core/random';
import { normalizeForMerge, type Animator, type Kit, type PlacedDisplay } from '../architecture/kit';
import { BINDINGS, POTIONS, SWEETS, fillDisplay, propKind, type DisplayTheme } from './displays';

const C = (hex: number) => new THREE.Color(hex);
const lathe = (pts: number[][], seg = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Register the diorama's instanced kinds once. */
function kinds(kit: Kit) {
  const M = kit.mats;
  const I = kit.instances;
  if (!I.has('dio:shelf')) {
    I.define('dio:shelf', new THREE.BoxGeometry(1, 0.035, 0.3).toNonIndexed(), M.display('oak', 0.55), false);
    I.define('dio:post', new THREE.BoxGeometry(0.05, 1, 0.3).toNonIndexed(), M.display('oak', 0.45), false);
    I.define('dio:lamp', mergeGeometries([
      normalizeForMerge(new THREE.SphereGeometry(0.07, 14, 10)),
      normalizeForMerge(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4).translate(0, 0.27, 0)),
      normalizeForMerge(new THREE.CylinderGeometry(0.03, 0.09, 0.06, 12, 1, true).translate(0, 0.08, 0)),
    ])!, M.glow(0xffb060, 2.4), false);
    // Opaque-list additive (not `transparent`): transmissive shop glass samples only the
    // opaque pass, so a transparent pool would vanish behind the panes. A late render
    // order draws it after the interior it lights.
    const pool = M.memo('light-pool', () => new THREE.MeshBasicMaterial({
      map: radialTexture(), color: 0xffffff, transparent: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: true,
    }));
    I.define('dio:pool', new THREE.PlaneGeometry(1, 1), pool, false, 10);
    I.define('dio:stand', lathe([[0, 0], [0.14, 0], [0.15, 0.03], [0.06, 0.08], [0.05, 0.3], [0.1, 0.34], [0.16, 0.36], [0, 0.36]], 16), M.display('oak', 0.5), false);
    I.define('dio:flask', lathe([[0, 0], [0.02, 0], [0.07, 0.03], [0.09, 0.09], [0.07, 0.16], [0.025, 0.2], [0.02, 0.3], [0.03, 0.31], [0, 0.31]], 14),
      M.displayFrom('flask-glass', M.memo('flask-base', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08 })), 1.6), false);
  }
}

const put = (kit: Kit, key: string, a: THREE.Object3D, x: number, y: number, z: number, s: THREE.Vector3Like, c?: THREE.Color, rot?: THREE.Euler) =>
  kit.instances.put(key, a, { x, y, z }, rot ?? null, s, c);

/** Stock one shelf run [x0, x1] at height y, depth z with themed goods. */
function stockShelf(kit: Kit, a: THREE.Object3D, theme: DisplayTheme, x0: number, x1: number, y: number, z: number, rng: SeededRandom): void {
  let x = x0 + 0.03;
  const P = (k: Parameters<typeof propKind>[1]) => propKind(kit, k);
  while (x < x1 - 0.05) {
    switch (theme) {
      case 'books': {
        const t = rng.range(0.03, 0.075), h = rng.range(0.19, 0.31);
        const lean = rng.chance(0.08) ? rng.range(0.15, 0.35) : 0;
        put(kit, P('book'), a, x + t / 2, y + h / 2, z, { x: t, y: h, z: rng.range(0.15, 0.22) }, rng.pick(BINDINGS).clone().multiplyScalar(rng.range(0.8, 1.35)), new THREE.Euler(0, 0, lean));
        x += t + (lean ? 0.06 : 0.003);
        break;
      }
      case 'apothecary': case 'sweets': {
        const big = rng.chance(0.3);
        put(kit, theme === 'sweets' ? P('jar') : big ? 'dio:flask' : rng.chance(0.5) ? P('bottle') : P('jar'), a, x + 0.06, y, z, { x: 1, y: rng.range(0.8, 1.25), z: 1 } as THREE.Vector3Like, rng.pick(theme === 'sweets' ? SWEETS : POTIONS));
        x += big ? 0.2 : 0.14;
        break;
      }
      case 'wands': {
        for (let k = rng.int(1, 4); k > 0; k--) {
          put(kit, P('wandbox'), a, x + 0.03 + rng.range(-0.012, 0.012), y + 0.03 + (k - 1) * 0.052, z + rng.range(-0.04, 0.04), { x: 1, y: 1, z: 1 },
            C(0xc8b89a).lerp(rng.pick(BINDINGS), 0.35).multiplyScalar(rng.range(0.75, 1.1)), new THREE.Euler(0, Math.PI / 2 + rng.range(-0.1, 0.1), rng.range(-0.04, 0.04)));
        }
        x += 0.066;
        break;
      }
      case 'owls': case 'menagerie':
        put(kit, P('cage'), a, x + 0.18, y, z, { x: 0.7, y: 0.7, z: 0.7 }, C(0xc8a050));
        x += 0.32;
        break;
      case 'cauldrons':
        put(kit, P('cauldron'), a, x + 0.13, y, z, { x: 0.45, y: 0.45, z: 0.45 }, C(0x3a3a3c));
        x += 0.25;
        break;
      case 'tea':
        put(kit, P('teapot'), a, x + 0.1, y, z, { x: 1, y: 1, z: 1 }, rng.pick([C(0xf0ece0), C(0x6aa0c8), C(0xe8a0b0)]));
        x += 0.22;
        break;
      case 'icecream':
        put(kit, P(rng.chance(0.5) ? 'sundae' : 'jar'), a, x + 0.07, y, z, { x: 1, y: 1, z: 1 }, rng.pick(SWEETS));
        x += 0.15;
        break;
      case 'quills':
        put(kit, P(rng.chance(0.5) ? 'scroll' : 'quill'), a, x + 0.08, y + 0.03, z, { x: 1, y: 1, z: 1 }, rng.pick([C(0xe8dcc0), C(0xffffff), C(0x2a2a2a)]), new THREE.Euler(0, rng.range(-0.3, 0.3), 0));
        x += 0.17;
        break;
      case 'jokes':
        put(kit, P(rng.chance(0.5) ? 'firework' : 'parcel'), a, x + 0.07, y + 0.0, z, rng.chance(0.5) ? { x: 1, y: 1, z: 1 } : { x: 0.14, y: 0.14, z: 0.14 }, rng.pick(SWEETS));
        x += 0.15;
        break;
      case 'quidditch':
        put(kit, P('ball'), a, x + 0.12, y + 0.11, z, { x: 1, y: 1, z: 1 }, rng.pick([C(0x7a2a1a), C(0x4a2a14), C(0x2a2a2a)]));
        x += 0.26;
        break;
      case 'robes': {
        const h = rng.range(0.06, 0.14);
        put(kit, P('parcel'), a, x + 0.12, y + h / 2, z, { x: 0.22, y: h, z: 0.2 }, rng.pick([C(0x2a1440), C(0x0f2a1f), C(0x3a0f14), C(0x111a33)]));
        x += 0.26;
        break;
      }
      default: {
        const r = rng.next();
        if (r < 0.35) put(kit, P('book'), a, x + 0.03, y + 0.12, z, { x: 0.05, y: 0.24, z: 0.17 }, rng.pick(BINDINGS));
        else if (r < 0.6) put(kit, P('bottle'), a, x + 0.05, y, z, { x: 1, y: 1, z: 1 }, rng.pick(POTIONS));
        else if (r < 0.8) put(kit, P('skull'), a, x + 0.08, y, z, { x: 0.8, y: 0.8, z: 0.8 }, C(0xd0c4a8));
        else put(kit, P('parcel'), a, x + 0.1, y + 0.07, z, { x: 0.18, y: 0.14, z: 0.18 }, C(0x8a6a4a));
        x += 0.17;
      }
    }
  }
}

/** Open book (covers + fanned pages) for levitation. */
function openBook(kit: Kit): { group: THREE.Group; pages: THREE.Group } {
  const M = kit.mats;
  const paper = M.memo('page-paper', () => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = '#efe3c6'; g.fillRect(0, 0, 128, 160);
    g.fillStyle = 'rgba(60,40,20,0.55)';
    for (let y = 14; y < 150; y += 7) g.fillRect(10, y, 108 - ((y * 37) % 30), 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: new THREE.Color(1, 0.9, 0.7), emissiveIntensity: 0.25, emissiveMap: t, side: THREE.DoubleSide });
  });
  const cover = M.tinted('leather', 0x8a2a2a, 'book-cover');
  const group = new THREE.Group();
  for (const sx of [-1, 1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.24).translate(sx * 0.085, 0, 0), cover);
    c.rotation.z = sx * -0.22;
    group.add(c);
  }
  const pages = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22).rotateX(-Math.PI / 2).translate(0.08, 0, 0), paper);
    pg.position.y = 0.012;
    pg.rotation.z = -0.2 + k * 0.08 + (k > 2 ? Math.PI - 0.6 : 0);
    pages.add(pg);
  }
  group.add(pages);
  return { group, pages };
}

/** Sleek racing broom (polished handle, brass bands, trimmed twig tail). */
function nimbus(kit: Kit): THREE.Group {
  const M = kit.mats;
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 1.05, 12).rotateZ(Math.PI / 2), M.memo('nimbus-handle', () => {
    const m = M.get('oak').clone(); m.color.setRGB(0.55, 0.32, 0.2); m.roughness = 0.25; m.name = 'nimbus-handle'; return m;
  }));
  handle.position.x = 0.15;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.5, 14, 1, true).rotateZ(Math.PI / 2), M.tinted('oak', 0xd8b070, 'twigs'));
  tail.position.x = -0.55;
  g.add(handle, tail);
  for (const x of [-0.31, -0.27, 0.66]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(x > 0 ? 0.015 : 0.03, 0.005, 6, 16).rotateY(Math.PI / 2), M.get('brass'));
    band.position.x = x;
    g.add(band);
  }
  const rest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.12), M.get('brass'));
  rest.position.set(-0.2, -0.04, 0);
  g.add(rest);
  g.traverse((o) => { o.castShadow = false; });
  return g;
}

function spotlightCone(height: number, radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); float a = edge * (1.0 - vUv.y) * 0.22 + edge * 0.03; gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a); }',
  });
  const m = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 28, 1, true).translate(0, -height / 2, 0), mat);
  m.renderOrder = 10;
  return m;
}

export interface DressOptions {
  /** Flourish & Blotts: number of levitating open books in this window. */
  levitatingBooks?: number;
  /** Quidditch: hovering broom on a spotlit pedestal. */
  floatingBroom?: boolean;
  /** Skip the front risers (hero shops that compose their own foreground). */
  noFront?: boolean;
  glow?: THREE.ColorRepresentation;
}

/** Build the full glowing diorama behind a shop window; returns animators for moving parts. */
export function dressWindow(kit: Kit, d: PlacedDisplay, theme: DisplayTheme, rng: SeededRandom, o: DressOptions = {}): Animator[] {
  kinds(kit);
  const a = d.anchor;
  const { halfWidth, interiorDepth, height } = d.bay.displaySize;
  const hw = halfWidth + 0.06;
  const back = -interiorDepth + 0.1;
  const animators: Animator[] = [];
  const glow = new THREE.Color(o.glow ?? 0xffb468);

  if (!o.noFront) fillDisplay(kit, d, theme, rng);

  // Floor-to-ceiling shelving on the back wall
  const shelfZ = back + 0.16;
  const rowH = theme === 'wands' ? 0.3 : theme === 'books' ? 0.36 : 0.42;
  const top = height + 0.1;
  for (let y = 0.22; y < top - 0.12; y += rowH) {
    put(kit, 'dio:shelf', a, 0, y, shelfZ, { x: hw * 2, y: 1, z: 1 }, C(0x9a7a58));
    stockShelf(kit, a, theme, -hw, hw, y + 0.018, shelfZ, rng);
  }
  for (const x of [-hw + 0.02, hw - 0.02, ...(hw > 1.1 ? [0] : [])]) put(kit, 'dio:post', a, x, top / 2, shelfZ, { x: 1, y: top, z: 1 }, C(0x7a5a3a));

  // Mid-depth pedestals with featured pieces
  if (!o.floatingBroom && theme !== 'wands') {
    for (const sx of hw > 0.9 ? [-0.55, 0.55] : [0]) {
      const x = sx * hw, z = back + 0.62;
      put(kit, 'dio:stand', a, x, 0, z, { x: 1, y: 1.4, z: 1 }, C(0x8a6a48));
      const fy = 0.5;
      if (theme === 'apothecary') put(kit, 'dio:flask', a, x, fy, z, { x: 2, y: 2, z: 2 }, rng.pick(POTIONS));
      else if (theme === 'books') put(kit, propKind(kit, 'book'), a, x, fy + 0.03, z, { x: 0.3, y: 0.06, z: 0.22 }, rng.pick(BINDINGS), new THREE.Euler(0, rng.range(-0.5, 0.5), 0));
      else if (theme === 'owls' || theme === 'menagerie') put(kit, propKind(kit, 'cage'), a, x, fy, z, { x: 1, y: 1, z: 1 }, C(0xc8a050));
      else if (theme === 'sweets' || theme === 'icecream') put(kit, propKind(kit, 'jar'), a, x, fy, z, { x: 1.8, y: 1.8, z: 1.8 }, rng.pick(SWEETS));
      else put(kit, propKind(kit, 'bottle'), a, x, fy, z, { x: 1.5, y: 1.5, z: 1.5 }, rng.pick(POTIONS));
    }
  }

  // Lamp, light pools: one on the floor, one blooming on the back wall
  put(kit, 'dio:lamp', a, 0, height - 0.1, back + 0.75, { x: 1, y: 1, z: 1 });
  put(kit, 'dio:pool', a, 0, 0.012, back + 0.7, { x: hw * 2.2, y: interiorDepth * 1.1, z: 1 }, glow.clone().multiplyScalar(0.55), new THREE.Euler(-Math.PI / 2, 0, 0));
  put(kit, 'dio:pool', a, 0, height * 0.55, back + 0.03, { x: hw * 2.6, y: height * 1.3, z: 1 }, glow.clone().multiplyScalar(0.35));

  // ---- Specials ------------------------------------------------------------------
  if (theme === 'wands') {
    // Precarious towers of dusty boxes on the floor at both sides
    for (const sx of [-1, 1]) for (let t = 0; t < 2; t++) {
      let ox = sx * (hw - 0.25 - t * 0.28), oz = back + 0.45 + t * 0.2, tilt = 0, yaw = rng.range(0, 1);
      const n = rng.int(14, 26);
      for (let k = 0; k < n; k++) {
        tilt += rng.range(-0.012, 0.016) * sx;
        ox += tilt * 0.05 + rng.range(-0.008, 0.008);
        oz += rng.range(-0.006, 0.006);
        yaw += rng.range(-0.25, 0.25);
        put(kit, propKind(kit, 'wandbox'), a, ox, 0.025 + k * 0.051, oz, { x: 1, y: 1, z: 1 },
          C(0xc0ae90).lerp(rng.pick(BINDINGS), 0.35).multiplyScalar(rng.range(0.7, 1.05)), new THREE.Euler(rng.range(-0.02, 0.02), yaw, tilt));
      }
    }
  }
  if (o.levitatingBooks) {
    for (let i = 0; i < o.levitatingBooks; i++) {
      const book = openBook(kit);
      const holder = new THREE.Group();
      holder.userData.keep = true;
      const x = (i - (o.levitatingBooks - 1) / 2) * hw * 0.9, y0 = height * rng.range(0.45, 0.7), z = back + rng.range(0.55, 0.9);
      holder.position.set(x, y0, z);
      holder.add(book.group);
      a.add(holder);
      const ph = rng.range(0, 6.28), sp = rng.range(0.35, 0.55);
      animators.push({
        update(_dt, t) {
          holder.position.y = y0 + 0.07 * Math.sin(t * sp * 2 + ph);
          holder.rotation.set(0.35 + 0.08 * Math.sin(t * 0.7 + ph), t * 0.25 + ph, 0.06 * Math.sin(t * 0.9 + ph));
          book.pages.children.forEach((pg, k) => { if (k === 2) pg.rotation.z = -0.2 + 0.16 + (Math.PI - 0.9) * (0.5 + 0.5 * Math.sin(t * 0.8 + ph)); });
        },
      });
    }
  }
  if (o.floatingBroom) {
    const z = back + 0.7;
    put(kit, 'dio:stand', a, 0, 0, z, { x: 2.2, y: 1.6, z: 2.2 }, C(0x6a4a30));
    put(kit, 'dio:pool', a, 0, 0.585, z, { x: 0.9, y: 0.9, z: 1 }, C(0xfff0d0), new THREE.Euler(-Math.PI / 2, 0, 0));
    const holder = new THREE.Group();
    holder.userData.keep = true;
    holder.position.set(0, 0.95, z);
    const broom = nimbus(kit);
    holder.add(broom);
    const cone = spotlightCone(height - 0.2, 0.42);
    cone.position.set(0, height - 0.05 - 0.95, 0);
    holder.add(cone);
    a.add(holder);
    animators.push({
      update(_dt, t) {
        broom.position.y = 0.06 * Math.sin(t * 1.3);
        broom.rotation.set(0.04 * Math.sin(t * 0.9), 0.35 * Math.sin(t * 0.25), 0.06 * Math.sin(t * 1.1));
      },
    });
  }
  return animators;
}
