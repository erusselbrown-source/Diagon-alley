/**
 * Living magical details:
 *  - enchanted paper aeroplanes swooping along the winding street
 *  - parchment notices drifting and fluttering overhead
 *  - firefly / dust motes orbiting every lantern
 *  - a flock of dark owl silhouettes gliding across the upper sky
 * All procedural; planes and owls are instanced and updated per frame.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/random';
import { normalizeForMerge } from '../architecture/kit/geometry';
import { createFrame, type StreetLayout } from '../architecture/street';
import type { FxSystem } from './index';

const NOTICES: [string, string][] = [
  ['NOTICE', 'Curfew at the toll of nine'], ['WANTED', 'Information · Reward'], ['LOST', 'One Puffskein, answers to "Arnold"'],
  ['SALE', 'Self-stirring cauldrons'], ['BEWARE', 'Biting books — handle with care'], ['TO LET', 'Rooms above the Leaky Cauldron'],
];

function noticeTexture(title: string, body: string, seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 192; c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(96, 128, 20, 96, 128, 170);
  grad.addColorStop(0, '#f1e3c0'); grad.addColorStop(1, '#bfa575');
  g.fillStyle = grad; g.fillRect(0, 0, 192, 256);
  g.fillStyle = '#2a1a0e'; g.textAlign = 'center';
  g.font = 'bold 34px Georgia, serif'; g.fillText(title, 96, 52);
  g.fillRect(30, 64, 132, 3);
  g.font = 'italic 15px Georgia, serif';
  const words = body.split(' '); let line = '', y = 100;
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (g.measureText(t).width > 150) { g.fillText(line, 96, y); y += 20; line = w; } else line = t; }
  g.fillText(line, 96, y);
  for (let i = 0; i < 14; i++) g.fillRect(28, 160 + i * 6 + (seed % 3), 136 - ((i * 37 + seed * 11) % 50), 1.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface AmbientMagic extends FxSystem { setViewport(h: number, fov: number): void }

export function createAmbientMagic(layout: StreetLayout, lanterns: readonly THREE.Vector3[]): AmbientMagic {
  const rng = new SeededRandom('ambient-magic');
  const root = new THREE.Group();
  root.name = 'ambient-magic';
  const f = createFrame();
  const L = layout.length;

  // ---- Paper aeroplanes -------------------------------------------------------
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.16, -0.11, 0.015, -0.1, 0, 0, -0.1, // left wing
    0, 0, 0.16, 0, 0, -0.1, 0.11, 0.015, -0.1, // right wing
    0, 0, 0.16, 0, 0, -0.1, 0, -0.035, -0.08, // keel
  ], 3));
  planeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(18).fill(0.5), 2));
  planeGeo.computeVertexNormals();
  const paper = new THREE.MeshStandardMaterial({ color: 0xf2ead8, roughness: 0.85, side: THREE.DoubleSide, emissive: new THREE.Color(0.95, 0.85, 0.65), emissiveIntensity: 0.25 });
  const N_PLANES = 12;
  const planes = new THREE.InstancedMesh(planeGeo, paper, N_PLANES);
  planes.frustumCulled = false;
  root.add(planes);
  const pp = Array.from({ length: N_PLANES }, () => ({ s0: rng.range(0, L), v: rng.range(1.4, 2.6) * (rng.chance(0.5) ? 1 : -1), a: rng.range(0.4, 0.9), w: rng.range(0.25, 0.5), h: rng.range(4.5, 7.5), ph: rng.range(0, 6.28) }));
  const planePos = (p: typeof pp[number], t: number, out: THREE.Vector3) => {
    const span = L - 12;
    const s = 6 + ((((p.s0 + p.v * t) % span) + span) % span);
    layout.frame(s, f);
    const d = Math.sin(t * p.w + p.ph) * p.a * (layout.widthAtS(s) / 2 - 1.2);
    return out.set(f.x + f.nx * d, f.y + p.h + 0.8 * Math.sin(t * p.w * 1.7 + p.ph), f.z + f.nz * d);
  };

  // ---- Parchment notices ----------------------------------------------------------
  const notices = NOTICES.map(([title, body], i) => {
    const g = new THREE.PlaneGeometry(0.3, 0.4, 4, 4);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, 0.03 * Math.sin(pos.getY(k) * 9 + i) + 0.02 * pos.getX(k) * pos.getX(k) * 10);
    g.computeVertexNormals();
    const tex = noticeTexture(title, body, i);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color(1, 0.9, 0.7), emissiveMap: tex, emissiveIntensity: 0.3 }));
    m.frustumCulled = false;
    root.add(m);
    return { m, s0: rng.range(8, L - 8), v: rng.range(0.25, 0.5) * (rng.chance(0.5) ? 1 : -1), h: rng.range(3.2, 5.5), ph: rng.range(0, 6.28) };
  });

  // ---- Lantern motes ----------------------------------------------------------------
  const PER = 26;
  const nM = lanterns.length * PER;
  const mp = new Float32Array(nM * 3), ms = new Float32Array(nM * 4);
  lanterns.forEach((c, i) => {
    for (let k = 0; k < PER; k++) {
      const j = i * PER + k;
      mp.set([c.x, c.y, c.z], j * 3);
      ms.set([rng.range(0.3, 1.4), rng.range(0, 6.28), rng.range(0.15, 0.6), rng.chance(0.18) ? 1 : 0], j * 4);
    }
  });
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 4));
  const mu = { uTime: { value: 0 }, uScale: { value: 600 } };
  const motes = new THREE.Points(mg, new THREE.ShaderMaterial({
    uniforms: mu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; uniform float uTime; uniform float uScale; varying float vA; varying float vGreen;
      void main() {
        float r = aSeed.x, ph = aSeed.y, sp = aSeed.z;
        float t = uTime * sp + ph;
        vec3 p = position + vec3(cos(t) * r, sin(t * 1.3) * 0.5 * r + sin(t * 0.37) * 0.4, sin(t * 0.9) * r);
        vA = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (2.0 + sp * 5.0) + ph * 3.0), 3.0);
        vGreen = aSeed.w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 0.045 * uScale / max(0.5, -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vGreen;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard;
        vec3 col = mix(vec3(1.0, 0.78, 0.4), vec3(0.6, 1.0, 0.55), vGreen);
        float a = exp(-r * 3.5) * vA;
        gl_FragColor = vec4(col * a * 2.2, a);
      }`,
  }));
  motes.frustumCulled = false;
  motes.name = 'lantern-motes';
  root.add(motes);

  // ---- Owl flock ----------------------------------------------------------------------
  const N_OWLS = 11;
  const dark = new THREE.MeshBasicMaterial({ color: 0x07080c, fog: false, side: THREE.DoubleSide });
  const body = new THREE.InstancedMesh(mergeGeometries([
    normalizeForMerge(new THREE.SphereGeometry(0.22, 10, 8).scale(1, 0.8, 1.6)),
    normalizeForMerge(new THREE.SphereGeometry(0.15, 10, 8).translate(0, 0.07, 0.3)),
    normalizeForMerge(new THREE.ConeGeometry(0.14, 0.3, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.42)),
  ])!, dark, N_OWLS);
  const wingShape = new THREE.Shape([new THREE.Vector2(0, 0.18), new THREE.Vector2(0.55, 0.12), new THREE.Vector2(0.95, -0.02), new THREE.Vector2(0.75, -0.16), new THREE.Vector2(0.45, -0.12), new THREE.Vector2(0.2, -0.2), new THREE.Vector2(0, -0.16)]);
  const wingGeo = new THREE.ShapeGeometry(wingShape).rotateX(-Math.PI / 2);
  const wingL = new THREE.InstancedMesh(wingGeo.clone().scale(-1, 1, 1), dark, N_OWLS), wingR = new THREE.InstancedMesh(wingGeo, dark, N_OWLS);
  for (const m of [body, wingL, wingR]) { m.frustumCulled = false; root.add(m); }
  const form = Array.from({ length: N_OWLS }, (_, i) => ({ o: new THREE.Vector3(rng.range(-6, 6), rng.range(-2, 2), -Math.abs(i - N_OWLS / 2) * 1.6 + rng.range(-1, 1)), ph: rng.range(0, 6.28) }));
  const mid = layout.frame(L * 0.55, createFrame());
  const flockCentre = new THREE.Vector3(mid.x + mid.nx * 40, mid.y + 48, mid.z + mid.nz * 40);

  // ---- Per-frame update ----------------------------------------------------------------
  const P = new THREE.Vector3(), Q = new THREE.Vector3(), V = new THREE.Vector3(), M4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const fwd = new THREE.Vector3(0, 0, 1);
  return {
    object: root,
    setViewport(h, fov) { mu.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); },
    update(_dt, t) {
      mu.uTime.value = t;
      pp.forEach((p, i) => {
        planePos(p, t, P); planePos(p, t + 0.08, Q);
        V.subVectors(Q, P).normalize();
        q.setFromUnitVectors(fwd, V);
        const bank = Math.cos(t * p.w + p.ph) * 0.6 * Math.sign(p.v);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(fwd, bank));
        planes.setMatrixAt(i, M4.compose(P, q, new THREE.Vector3(1.4, 1.4, 1.4)));
      });
      planes.instanceMatrix.needsUpdate = true;
      for (const n of notices) {
        const span = L - 16;
        const s = 8 + ((((n.s0 + n.v * t) % span) + span) % span);
        layout.frame(s, f);
        const d = Math.sin(t * 0.21 + n.ph) * 1.6;
        n.m.position.set(f.x + f.nx * d, f.y + n.h + 0.4 * Math.sin(t * 0.6 + n.ph), f.z + f.nz * d);
        n.m.rotation.set(0.6 * Math.sin(t * 0.9 + n.ph), t * 0.3 + n.ph, 0.4 * Math.sin(t * 1.3 + n.ph * 2));
      }
      // Flock: one pass across the sky every ~45 s, on a new heading each time.
      const period = 45, k = Math.floor(t / period), u = (t % period) / period;
      const head = k * 2.39 + 0.6;
      const dir = new THREE.Vector3(Math.cos(head), 0, Math.sin(head));
      const centre = flockCentre.clone().addScaledVector(dir, (u - 0.5) * 220);
      q.setFromUnitVectors(fwd, dir);
      form.forEach((fo, i) => {
        const pos = centre.clone().add(fo.o.clone().applyQuaternion(q)).add(new THREE.Vector3(0, Math.sin(t * 0.7 + fo.ph) * 0.6, 0));
        const flapEnv = Math.max(0, Math.sin(t * 0.35 + fo.ph)) ** 6;
        const flap = 0.12 + flapEnv * 0.7 * Math.sin(t * 7 + fo.ph);
        const s = new THREE.Vector3(0.9, 0.9, 0.9);
        body.setMatrixAt(i, M4.compose(pos, q, s));
        const wl = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(fwd, -flap));
        const wr = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(fwd, flap));
        wingL.setMatrixAt(i, M4.compose(pos, wl, s));
        wingR.setMatrixAt(i, M4.compose(pos, wr, s));
      });
      body.instanceMatrix.needsUpdate = wingL.instanceMatrix.needsUpdate = wingR.instanceMatrix.needsUpdate = true;
    },
    dispose() { /* scene-lifetime */ },
  };
}
