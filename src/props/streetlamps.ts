/**
 * Ornate Victorian cast-iron gas streetlamps along both curbs of the S-curve
 * (and around the plaza). Per lamp: a moulded, fluted base; a tapering shaft
 * with collars; a scrolled ladder-rest crossbar; a hexagonal tapered lantern
 * with iron ribs, crown and finial; a flickering amber gas mantle; warm glass;
 * and a soft additive light cone that fades where it meets the ground.
 *
 * All instanced (iron, glass, mantle, cone = 4 draw calls). Lamps don't own
 * PointLights: they publish virtual light sources that core/lighting's pool
 * assigns to the nearest few real lights each frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/random';
import { normalizeForMerge, type Animator, type Kit } from '../architecture/kit';
import { CURB_WIDTH, type StreetLayout } from '../architecture/street';
import type { LightSource } from '../core/lighting';

export const LAMP_HEIGHT = 4.2;
const MANTLE_Y = 3.62;

export interface Streetlamps extends Animator {
  group: THREE.Group;
  sources: LightSource[];
  /** World positions of the mantles (for motes etc.). */
  mantles: THREE.Vector3[];
  /** Global brightness multiplier (presets). */
  setLevel(level: number): void;
  /** Where each lamp stands, so street clutter can keep clear of the posts. */
  sites: { side: 'left' | 'right'; s: number }[];
  /** Ground positions of the posts (collision). */
  posts: THREE.Vector3[];
  /** Nearest lamp the ray passes through (lantern or post), or null. */
  pick(ray: THREE.Ray, maxDistance?: number): { index: number; distance: number; point: THREE.Vector3 } | null;
  /** Lumos / Nox: toggle one lamp with a flash. Returns the new state (true = lit). */
  toggle(index: number): boolean;
  isLit(index: number): boolean;
}

const lathe = (pts: number[][], seg = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const merge = (...gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => normalizeForMerge(g)))!;

function ironGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Base: stepped plinth, fluted drum, mouldings
  parts.push(lathe([[0, 0], [0.24, 0], [0.24, 0.06], [0.2, 0.09], [0.2, 0.14], [0.16, 0.18], [0.155, 0.62], [0.18, 0.66], [0.18, 0.72], [0.12, 0.78], [0.1, 0.86], [0.12, 0.9], [0, 0.9]], 12));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; parts.push(new THREE.BoxGeometry(0.025, 0.42, 0.03).translate(Math.cos(a) * 0.158, 0.4, Math.sin(a) * 0.158).rotateY(0)); }
  // Tapering shaft with collars
  parts.push(new THREE.CylinderGeometry(0.045, 0.075, 2.3, 10).translate(0, 0.9 + 1.15, 0));
  for (const y of [1.25, 2.2, 3.05]) parts.push(lathe([[0.055, -0.04], [0.085, -0.02], [0.09, 0], [0.085, 0.02], [0.055, 0.04]], 10).translate(0, y, 0));
  // Ladder-rest crossbar with scrolled ends
  parts.push(new THREE.BoxGeometry(0.62, 0.035, 0.035).translate(0, 3.0, 0));
  for (const sx of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * Math.PI * 1.7, r = 0.08 * (1 - 0.7 * t); pts.push(new THREE.Vector3(sx * (0.31 + Math.sin(a) * r), 3.0 - 0.08 + Math.cos(a) * r, 0)); }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.011, 5, false));
    parts.push(new THREE.SphereGeometry(0.03, 8, 6).translate(sx * 0.31, 3.0, 0));
  }
  // Lantern: bottom cup, ribs of a tapered hexagonal frustum, crown, finial
  parts.push(lathe([[0, 3.18], [0.09, 3.18], [0.15, 3.28], [0.17, 3.34], [0, 3.34]], 6).rotateY(Math.PI / 6));
  const r0 = 0.15, r1 = 0.24, y0 = 3.34, y1 = 3.9;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.cos(a) * r0, y0, Math.sin(a) * r0), p1 = new THREE.Vector3(Math.cos(a) * r1, y1, Math.sin(a) * r1);
    const len = p0.distanceTo(p1);
    const rib = new THREE.BoxGeometry(0.022, len, 0.022);
    rib.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize()));
    rib.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
    parts.push(rib);
  }
  parts.push(lathe([[0, 3.9], [0.27, 3.9], [0.28, 3.93], [0.22, 3.98], [0.12, 4.06], [0.06, 4.1], [0, 4.12]], 6).rotateY(Math.PI / 6));
  parts.push(lathe([[0, 4.1], [0.035, 4.1], [0.025, 4.16], [0.04, 4.2], [0.012, 4.32], [0, 4.34]], 8));
  return merge(...parts);
}

function glassGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.235, 0.145, 0.55, 6, 1, true).rotateY(Math.PI / 6).translate(0, 3.615, 0);
  return g;
}

function coneMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: /* glsl */ `
      attribute float aGround;
      varying vec3 vWorld; varying vec3 vN; varying vec3 vView; varying float vGround; varying float vT; varying vec3 vTint;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vGround = aGround;
        vT = clamp(-position.y / 3.4, 0.0, 1.0);            // 0 at the lantern → 1 at the ground
        vTint = instanceColor;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vWorld; varying vec3 vN; varying vec3 vView; varying float vGround; varying float vT; varying vec3 vTint;
      void main() {
        float edge = pow(abs(dot(normalize(vN), vView)), 1.6);       // soft silhouette
        float groundFade = smoothstep(0.0, 0.7, vWorld.y - vGround); // fade where the cone meets the pavement
        float a = edge * (1.0 - vT * 0.65) * groundFade * 0.085;
        gl_FragColor = vec4(vTint * a, a);
      }`,
  });
}

export function buildStreetlamps(kit: Kit, layout: StreetLayout): Streetlamps {
  const rng = new SeededRandom('streetlamps');
  const spots: THREE.Matrix4[] = [];
  const grounds: number[] = [];
  const sites: { side: 'left' | 'right'; s: number }[] = [];

  const blockedBy = (side: 'left' | 'right', s: number) =>
    layout.stoops.some((st) => st.side === side && Math.abs(st.s - s) < st.width / 2 + 0.45) ||
    layout.reservations.some((r) => r.side === side && s > r.s0 - 0.6 && s < r.s1 + 0.6);

  const place = (s: number, side: 'left' | 'right', insetFromLine: number) => {
    for (const nudge of [0, 0.6, -0.6, 1.2, -1.2, 1.8]) {
      const ss = s + nudge;
      if (ss < 1 || ss > layout.length - 0.5 || blockedBy(side, ss)) continue;
      const tr = layout.getStreetTransform(ss / layout.length, side, -insetFromLine);
      spots.push(tr.matrix.clone().multiply(new THREE.Matrix4().makeRotationY(rng.range(-0.04, 0.04))));
      grounds.push(tr.position.y);
      sites.push({ side, s: ss });
      return;
    }
  };
  // Along both curbs, staggered, just behind the curb on the pavement.
  for (const side of ['left', 'right'] as const) {
    for (let s = side === 'left' ? 4 : 8.5; s < layout.plazaS - 1; s += 9) {
      const W = layout.widthAtS(s);
      const curbBack = W / 2 - (layout.carriageHalfWidth(s) + CURB_WIDTH);
      place(s, side, curbBack - 0.24);
    }
    // Around the plaza, near the building line
    for (let s = layout.plazaS + 2; s < layout.length - 3; s += 6) place(s, side, 0.9);
  }

  const n = spots.length;
  const M = kit.mats;
  const group = new THREE.Group();
  group.name = 'streetlamps';
  const iron = new THREE.InstancedMesh(ironGeometry(), M.jitter('iron'), n);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: true });
  const glass = new THREE.InstancedMesh(glassGeometry(), glassMat, n);
  const mantle = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 12, 8).scale(1, 1.5, 1).translate(0, MANTLE_Y, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  const coneGeo = new THREE.ConeGeometry(1.35, 3.4, 24, 1, true).translate(0, -1.7, 0).translate(0, MANTLE_Y - 0.05, 0);
  coneGeo.setAttribute('aGround', new THREE.InstancedBufferAttribute(new Float32Array(grounds), 1));
  const cones = new THREE.InstancedMesh(coneGeo, coneMaterial(), n);
  spots.forEach((m, i) => { for (const im of [iron, glass, mantle, cones]) im.setMatrixAt(i, m); });
  for (const im of [glass, mantle, cones]) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  iron.castShadow = true; iron.receiveShadow = true;
  cones.renderOrder = 9; glass.renderOrder = 3;
  for (const im of [iron, glass, mantle, cones]) { im.computeBoundingSphere(); group.add(im); }
  iron.name = 'lamp-iron'; glass.name = 'lamp-glass'; mantle.name = 'lamp-mantle'; cones.name = 'lamp-cones';

  const mantles = spots.map((m) => new THREE.Vector3(0, MANTLE_Y, 0).applyMatrix4(m));
  const phases = spots.map(() => [rng.range(0, 100), rng.range(0, 100), rng.range(0.7, 1.3)]);
  const flicker = new Float32Array(n).fill(1);
  const lit = new Float32Array(n).fill(1), litTarget = new Float32Array(n).fill(1), flash = new Float32Array(n);
  const posts = spots.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  const white = new THREE.Color(0.75, 0.9, 1.0);
  const seg0 = new THREE.Vector3(), seg1 = new THREE.Vector3(), hit = new THREE.Vector3();
  let level = 1;
  const amber = new THREE.Color(1.0, 0.62, 0.26);
  const sources: LightSource[] = mantles.map((p, i) => ({
    position: p.clone().add(new THREE.Vector3(0, -0.15, 0)),
    color: amber.clone(),
    distance: 15,
    decay: 1.7,
    intensity: () => 10 * (flicker[i] * level * lit[i] + 1.6 * flash[i]),
  }));
  const c = new THREE.Color(), tmpC = new THREE.Color();

  return {
    group, sources, mantles, sites,
    posts,
    setLevel(l) { level = l; },
    isLit: (i) => litTarget[i] > 0.5,
    toggle(i) {
      litTarget[i] = litTarget[i] > 0.5 ? 0 : 1;
      flash[i] = litTarget[i] ? 1.6 : 0.9; // Lumos blooms bright; Nox gives a last puff
      return litTarget[i] > 0.5;
    },
    pick(ray, maxDistance = 45) {
      let best: { index: number; distance: number; point: THREE.Vector3 } | null = null;
      for (let i = 0; i < n; i++) {
        const lantern = mantles[i];
        const d0 = ray.origin.distanceTo(lantern);
        if (d0 > maxDistance + 1) continue;
        // generous lantern sphere (aiming at a small lantern from 20 m is hard) and a thin post capsule
        const tol = 0.38 + d0 * 0.012;
        const along = lantern.clone().sub(ray.origin).dot(ray.direction);
        let dist = Infinity;
        if (along > 0 && ray.distanceSqToPoint(lantern) < tol * tol) dist = along;
        seg0.copy(posts[i]); seg1.copy(lantern);
        if (ray.distanceSqToSegment(seg0, seg1, undefined, hit) < 0.2 * 0.2) dist = Math.min(dist, ray.origin.distanceTo(hit));
        if (dist < maxDistance && (!best || dist < best.distance)) best = { index: i, distance: dist, point: ray.at(dist, new THREE.Vector3()) };
      }
      return best;
    },
    update(dt, t) {
      const kLit = 1 - Math.exp(-dt * 5), kFlash = Math.exp(-dt * 3.2);
      for (let i = 0; i < n; i++) {
        const [a, b, sp] = phases[i];
        // gas mantle: gentle breathing + quick jitter + rare sputter
        let f = 0.9 + 0.06 * Math.sin(t * 2.3 * sp + a) + 0.04 * Math.sin(t * 13.7 * sp + b);
        const sput = Math.sin(t * 0.31 + a) > 0.985 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 40 + b)) : 1;
        f *= sput;
        flicker[i] = f;
        lit[i] += (litTarget[i] - lit[i]) * kLit;
        flash[i] *= kFlash;
        const k = f * level * lit[i], fl = flash[i];
        mantle.setColorAt(i, c.copy(amber).multiplyScalar(5.5 * k).addScalar(0.4 * k + 0.05).add(tmpC.copy(white).multiplyScalar(6 * fl)));
        glass.setColorAt(i, c.copy(amber).multiplyScalar(1.15 * k + 0.08).add(tmpC.copy(white).multiplyScalar(1.2 * fl)));
        cones.setColorAt(i, c.copy(amber).multiplyScalar(1.0 * k).add(tmpC.copy(white).multiplyScalar(0.9 * fl)));
      }
      mantle.instanceColor!.needsUpdate = glass.instanceColor!.needsUpdate = cones.instanceColor!.needsUpdate = true;
    },
  };
}
