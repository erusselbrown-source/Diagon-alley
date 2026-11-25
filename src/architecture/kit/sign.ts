/**
 * Ornate wrought-iron scroll brackets suspending swinging signs. The bracket
 * projects from the facade along +Z; the sign hangs from two rings and swings
 * about the arm with a damped pendulum driven by gusting wind.
 *
 * Local: wall plate at the origin (facade plane z = 0), arm along +Z.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeometryBucket, chamferBox, normalizeForMerge } from './geometry';
import type { Animator, Kit, Swingable } from './context';
import { letteringMaterial, type LetteringOptions } from './lettering';

export interface HangingSignOptions {
  armLength?: number;
  /** Something to hang: a ready-made object whose origin is the hanging point (top centre). */
  body?: THREE.Object3D;
  /** Or a painted board (double-sided lettering). */
  board?: { width: number; height: number; lettering: Omit<LetteringOptions, 'aspect'>; frame?: THREE.Material };
  /** Pendulum length (m) — longer swings slower. */
  length?: number;
  wind?: number;
  /** Disable swinging (e.g. rigid rotating signs). */
  rigid?: boolean;
}

export interface HangingSign extends Animator, Swingable {
  group: THREE.Group;
  pivot: THREE.Group;
}

/** Spiral C-scroll centreline in the YZ plane. */
function scrollCurve(cz: number, cy: number, r: number, turns: number, flip = 1, start = 0): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 36; i++) {
    const t = i / 36, a = start + flip * t * turns * Math.PI * 2, rr = r * (1 - 0.8 * t);
    pts.push(new THREE.Vector3(0, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr));
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function buildHangingSign(kit: Kit, o: HangingSignOptions): HangingSign {
  const iron = kit.mats.get('iron');
  const L = o.armLength ?? 1.15;
  const group = new THREE.Group();
  group.name = 'hanging-sign';
  const b = new GeometryBucket();

  // Bracket: wall plate, arm, diagonal brace, C-scrolls, finial
  b.box(iron, 0.07, 0.7, 0.025, 0.006, { x: 0, y: -0.25, z: 0.012 });
  b.box(iron, 0.035, 0.035, L, 0.006, { x: 0, y: 0, z: L / 2 });
  const braceLen = Math.hypot(0.6, L * 0.62);
  b.box(iron, 0.028, 0.028, braceLen, 0.005, { x: 0, y: -0.3, z: L * 0.31 }, new THREE.Euler(Math.atan2(0.6, L * 0.62), 0, 0));
  for (const [cz, cy, r, turns, flip, st] of [[L * 0.2, -0.16, 0.12, 0.85, 1, 0], [L * 0.42, -0.08, 0.075, 0.9, -1, Math.PI], [L * 0.62, -0.05, 0.05, 0.85, 1, 0]] as const) {
    b.add(iron, new THREE.TubeGeometry(scrollCurve(cz, cy, r, turns, flip, st), 40, 0.009, 5, false));
  }
  const curl = new THREE.TubeGeometry(scrollCurve(L + 0.04, 0.05, 0.05, 1.1, 1, -Math.PI / 2), 30, 0.012, 5, false);
  b.add(iron, curl);
  b.add(iron, new THREE.SphereGeometry(0.03, 10, 8), new THREE.Matrix4().makeTranslation(0, 0, L + 0.01));
  for (const z of [L * 0.35, L * 0.85]) b.add(iron, new THREE.TorusGeometry(0.025, 0.006, 6, 12).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, -0.03, z));
  group.add(b.build('sign-bracket'));

  // Pivot along the arm between the rings
  const pivot = new THREE.Group();
  pivot.position.set(0, -0.03, L * 0.6);
  pivot.userData.keep = true;
  group.add(pivot);
  group.userData.keepChildren = true;

  // Chains (two short runs of links)
  const links: THREE.BufferGeometry[] = [];
  for (const dz of [-L * 0.25, L * 0.25]) for (let k = 0; k < 3; k++) {
    const g = new THREE.TorusGeometry(0.018, 0.005, 5, 10);
    g.rotateY(k % 2 ? Math.PI / 2 : 0).translate(0, -0.03 - k * 0.032, dz);
    links.push(normalizeForMerge(g));
  }
  const chain = new THREE.Mesh(mergeGeometries(links)!, iron);
  pivot.add(chain);

  // Body
  const drop = -0.13;
  if (o.board) {
    const { width, height } = o.board;
    const frame = o.board.frame ?? kit.mats.get('oak');
    const bodyG = new THREE.Group();
    const slab = new THREE.Mesh(chamferBox(0.06, height + 0.08, width + 0.08, 0.015), frame);
    slab.castShadow = true;
    bodyG.add(slab);
    const mat = letteringMaterial({ ...o.board.lettering, aspect: width / height });
    for (const sx of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
      face.rotation.y = sx * Math.PI / 2;
      face.position.x = sx * 0.031;
      bodyG.add(face);
    }
    bodyG.position.set(0, drop - height / 2 - 0.04, 0);
    pivot.add(bodyG);
  } else if (o.body) {
    o.body.position.y += drop;
    pivot.add(o.body);
  }

  // Pendulum
  const g = 9.81, len = o.length ?? 0.55, damp = 1.1, windK = o.wind ?? 1;
  const ph = [kit.rng.range(0, 6.28), kit.rng.range(0, 6.28), kit.rng.range(0, 6.28)];
  let th = kit.rng.range(-0.05, 0.05), om = 0;
  const sign: HangingSign = {
    group, pivot,
    kick(v) { if (!o.rigid) om += v; },
    get speed() { return Math.abs(om); },
    update(dt, t) {
      if (o.rigid) return;
      const steps = 3, h = Math.min(dt, 0.05) / steps;
      for (let i = 0; i < steps; i++) {
        const tt = t + i * h;
        const gust = 0.55 * Math.sin(0.6 * tt + ph[0]) + 0.3 * Math.sin(1.7 * tt + ph[1]) + 0.2 * Math.sin(3.1 * tt + ph[2]);
        const wind = windK * (0.6 + 0.6 * gust) * Math.max(0, 0.5 + 0.5 * Math.sin(0.23 * tt + ph[2])) * 1.4;
        const acc = -(g / len) * Math.sin(th) - damp * om + wind;
        om += acc * h;
        th += om * h;
      }
      th = Math.max(-1.2, Math.min(1.2, th)); // the arm stops a full loop
      pivot.rotation.z = th;
    },
  };
  if (!o.rigid) { pivot.userData.sign = sign; kit.signs.push(sign); }
  return sign;
}
