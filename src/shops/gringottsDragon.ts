/**
 * The pale, scarred dragon perched on Gringotts' roofline. Sculpted from
 * tapered swept tubes and ellipsoids in a procedural scarred-hide material:
 * claws gripping the pediment, neck craning over the street, tail curling back
 * along the roof toward the dome, folded bat wings. Animated: the chest
 * breathes, the wings shift every 9 s, and an ember glow swells in the
 * nostrils every 15 s.
 *
 * Local: origin at the perch (attic top), +Z toward the street.
 */
import * as THREE from 'three';
import { GeometryBucket, type Animator, type Kit } from '../architecture/kit';

export interface Dragon extends Animator { group: THREE.Group }

/** Swept tube with radius tapering from r0 to r1 along the curve. */
export function taperTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, tubular = 40, radial = 12, uvScale = 1): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(tubular, false);
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const len = curve.getLength();
  const P = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, P);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.9);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      pos.push(P.x + r * (c * N.x + s * B.x), P.y + r * (c * N.y + s * B.y), P.z + r * (c * N.z + s * B.z));
      uv.push((j / radial) * 2 * Math.PI * Math.max(r, 0.05) * uvScale, t * len * uvScale);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // cap the thick end
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const curve = (pts: number[][]) => new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
const ellipsoid = (rx: number, ry: number, rz: number, seg = 28) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)).scale(rx, ry, rz);

/** One bat wing (right-hand; mirror for the left) — bones + scalloped membrane, pivot at the shoulder. */
function wing(hide: THREE.Material, membrane: THREE.Material): THREE.Group {
  const S = new THREE.Vector3(0, 0, 0);
  const W = new THREE.Vector3(2.4, 1.1, -0.6);
  const tips = [new THREE.Vector3(4.5, 0.5, -1.5), new THREE.Vector3(4.1, -0.45, -2.7), new THREE.Vector3(3.0, -0.95, -3.5), new THREE.Vector3(1.8, -1.05, -3.3)];
  const B = new THREE.Vector3(0.15, -0.7, -2.6);
  const g = new THREE.Group();
  const bones = new GeometryBucket();
  bones.add(hide, taperTube(new THREE.CatmullRomCurve3([S, S.clone().lerp(W, 0.5).add(new THREE.Vector3(0, 0.35, 0.1)), W]), 0.17, 0.09, 24, 8));
  bones.add(hide, new THREE.SphereGeometry(0.14, 12, 8), new THREE.Matrix4().makeTranslation(W.x, W.y, W.z));
  for (const tip of tips) bones.add(hide, taperTube(new THREE.CatmullRomCurve3([W, W.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.12, 0)), tip]), 0.07, 0.025, 20, 6));
  bones.add(hide, new THREE.ConeGeometry(0.06, 0.32, 8).rotateZ(-0.6), new THREE.Matrix4().makeTranslation(W.x + 0.05, W.y + 0.2, W.z + 0.05)); // thumb claw
  g.add(bones.build('wing-bones'));
  // Membrane fan around the wrist with scalloped trailing edges
  const ring = [S, tips[0], tips[1], tips[2], tips[3], B, S];
  const pos: number[] = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], c = ring[i + 1];
    const m = a.clone().lerp(c, 0.5).lerp(W, i === 0 ? 0.05 : 0.2);
    pos.push(...W.toArray(), ...a.toArray(), ...m.toArray(), ...W.toArray(), ...m.toArray(), ...c.toArray());
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.5, pos[i + 2] * 0.5);
  mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  mg.computeVertexNormals();
  const mem = new THREE.Mesh(mg, membrane);
  mem.castShadow = true;
  g.add(mem);
  return g;
}

export function buildDragon(kit: Kit): Dragon {
  const M = kit.mats;
  const hide = M.get('dragonhide');
  const horn = M.tinted('dragonhide', 0x9a8f80, 'horn');
  const membrane = M.memo('dragon-membrane', () => {
    const m = M.get('dragonhide').clone();
    m.color.setRGB(0.92, 0.8, 0.78);
    m.side = THREE.DoubleSide;
    m.name = 'dragon-membrane';
    return m;
  });
  const group = new THREE.Group();
  group.name = 'gringotts-dragon';
  group.userData.keep = true;
  const body = new GeometryBucket();
  const uvs = 1 / kit.mats.worldSize('dragonhide');

  // Neck craning out over the pediment, toward the street
  const neckC = curve([[0, 1.5, 1.8], [0, 2.55, 3.1], [0.15, 2.5, 4.35], [0.3, 1.98, 5.05]]);
  body.add(hide, taperTube(neckC, 0.74, 0.38, 40, 14, uvs));
  // Front legs gripping the raking cornice
  for (const sx of [-1, 1]) {
    body.add(hide, taperTube(curve([[sx * 0.85, 1.05, 1.4], [sx * 1.12, 0.55, 2.6], [sx * 0.9, 0.95, 3.75]]), 0.38, 0.17, 24, 10, uvs));
    body.add(hide, ellipsoid(0.24, 0.16, 0.3, 14), new THREE.Matrix4().makeTranslation(sx * 0.9, 0.9, 3.85));
    for (let k = -1; k <= 1; k++) {
      body.add(horn, new THREE.ConeGeometry(0.05, 0.3, 8).rotateX(Math.PI / 2 + 0.6), new THREE.Matrix4().makeTranslation(sx * 0.9 + k * 0.1, 0.78, 4.05));
    }
    // Hind legs folded beneath
    body.add(hide, ellipsoid(0.55, 0.6, 0.8, 18), new THREE.Matrix4().makeTranslation(sx * 0.95, 0.65, -1.2));
    body.add(hide, taperTube(curve([[sx * 1.05, 0.45, -0.9], [sx * 1.25, 0.1, -0.5], [sx * 1.1, 0.06, -0.1]]), 0.26, 0.15, 16, 8, uvs));
    for (let k = -1; k <= 1; k++) body.add(horn, new THREE.ConeGeometry(0.045, 0.24, 8).rotateX(Math.PI / 2 + 0.3), new THREE.Matrix4().makeTranslation(sx * 1.1 + k * 0.09, 0.05, 0.08));
  }
  // Tail along the roof, curling toward the dome
  const tailC = curve([[0, 0.95, -1.9], [0.3, 0.45, -3.6], [1.4, 0.1, -5.1], [2.8, -0.15, -6.0], [3.7, -0.25, -4.9], [3.2, -0.3, -4.1]]);
  body.add(hide, taperTube(tailC, 0.62, 0.05, 60, 12, uvs));

  // Head
  const head = new THREE.Group();
  head.position.set(0.3, 1.95, 5.15);
  head.rotation.set(0.38, 0.18, -0.05);
  const hb = new GeometryBucket();
  hb.add(hide, ellipsoid(0.46, 0.4, 0.58, 20));
  hb.add(hide, new THREE.CylinderGeometry(0.17, 0.33, 1.0, 16).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(0, -0.04, 0.72));
  hb.add(hide, new THREE.BoxGeometry(0.46, 0.12, 0.85).toNonIndexed(), new THREE.Matrix4().makeRotationX(0.18).setPosition(0, -0.26, 0.55));
  for (const sx of [-1, 1]) {
    hb.add(horn, new THREE.ConeGeometry(0.09, 0.85, 10).rotateX(-Math.PI / 2 - 0.5).rotateZ(sx * 0.25), new THREE.Matrix4().makeTranslation(sx * 0.26, 0.32, -0.45));
    hb.add(horn, new THREE.ConeGeometry(0.05, 0.4, 8).rotateX(-Math.PI / 2 - 0.2).rotateZ(sx * 0.6), new THREE.Matrix4().makeTranslation(sx * 0.4, 0.05, -0.3));
    hb.add(hide, ellipsoid(0.13, 0.06, 0.3, 10), new THREE.Matrix4().makeTranslation(sx * 0.2, 0.24, 0.3)); // brow ridge
    hb.add(M.glow(0xd8e0e8, 0.35), new THREE.SphereGeometry(0.06, 10, 8), new THREE.Matrix4().makeTranslation(sx * 0.27, 0.12, 0.38)); // milky, blind eyes
    for (let k = 0; k < 4; k++) hb.add(horn, new THREE.ConeGeometry(0.025, 0.12, 6).rotateX(Math.PI), new THREE.Matrix4().makeTranslation(sx * 0.14, -0.21, 0.55 + k * 0.15)); // teeth
  }
  head.add(hb.build('dragon-head'));
  const nostrilMat = new THREE.MeshStandardMaterial({ color: 0x110805, emissive: new THREE.Color(1, 0.35, 0.05), emissiveIntensity: 0.15 });
  for (const sx of [-1, 1]) {
    const n = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), nostrilMat);
    n.position.set(sx * 0.08, 0.06, 1.2);
    head.add(n);
  }
  const ember = new THREE.PointLight(0xff6a1a, 0, 6, 2);
  ember.position.set(0, 0.0, 1.45);
  head.add(ember);
  group.add(head);

  // Dorsal spikes along neck, back and tail
  const spikes: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tan = new THREE.Vector3(), q = new THREE.Quaternion();
  const addSpikes = (c: THREE.Curve<THREE.Vector3>, n: number, r0: number, r1: number, s0: number, s1: number) => {
    for (let i = 1; i < n; i++) {
      const t = i / n;
      c.getPointAt(t, tmp); c.getTangentAt(t, tan);
      const r = r0 + (r1 - r0) * t, size = s0 + (s1 - s0) * t;
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      const dir = new THREE.Vector3().crossVectors(side, tan).normalize();
      q.setFromUnitVectors(up, dir.lerp(tan.clone().negate(), 0.35).normalize());
      spikes.push(new THREE.Matrix4().compose(tmp.clone().addScaledVector(dir, r * 0.92), q, new THREE.Vector3(size, size * 1.6, size)));
    }
  };
  addSpikes(neckC, 9, 0.74, 0.38, 0.22, 0.14);
  addSpikes(curve([[0, 2.0, 1.4], [0, 2.1, 0], [0, 1.85, -1.6]]), 7, 0.1, 0.1, 0.26, 0.2);
  addSpikes(tailC, 18, 0.62, 0.05, 0.2, 0.05);
  const spikeMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 6).translate(0, 0.5, 0), horn, spikes.length);
  spikes.forEach((m, i) => spikeMesh.setMatrixAt(i, m));
  spikeMesh.castShadow = true;
  spikeMesh.computeBoundingSphere();
  group.add(spikeMesh);

  // Chest (breathes)
  const chest = new THREE.Mesh(ellipsoid(1.25, 1.0, 2.3, 32), hide);
  chest.position.set(0, 1.05, 0.1);
  chest.rotation.x = -0.12;
  chest.castShadow = true;
  group.add(chest);
  const staticBody = body.build('dragon-body');
  group.add(staticBody);

  // Wings (mirror the left)
  const wings: THREE.Group[] = [];
  for (const sx of [-1, 1]) {
    const mirror = new THREE.Group();
    mirror.position.set(sx * 0.7, 1.85, 0.8);
    mirror.scale.x = sx;
    const pivot = wing(hide, membrane);
    mirror.add(pivot);
    group.add(mirror);
    wings.push(pivot);
  }
  group.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  return {
    group,
    update(_dt, t) {
      // Breathing: slow, heavy swell of the chest
      const br = Math.sin((t / 4.2) * Math.PI * 2);
      chest.scale.set(1 + 0.03 * br, 1 + 0.05 * br, 1 + 0.02 * br);
      head.position.y = 1.95 + 0.03 * br;
      // Wings shift every 9 s: a half-unfold and settle
      const p = t % 9;
      const o = p > 6 ? Math.sin(Math.PI * ease((p - 6) / 2.6)) : 0;
      for (const w of wings) w.rotation.set(0.12 - 0.1 * o, -0.55 + 0.38 * o, 0.5 - 0.28 * o);
      // Ember glow in the nostrils every 15 s
      const e = t % 15;
      const pulse = e < 3 ? Math.pow(Math.sin((Math.PI * e) / 3), 2) : 0;
      nostrilMat.emissiveIntensity = 0.15 + 3 * pulse;
      ember.intensity = 5 * pulse;
    },
  };
}
