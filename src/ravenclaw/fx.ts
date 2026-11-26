/**
 * Tower-room effects: every candle flame in one instanced billboard draw,
 * enchanted floating candles, the hearth fire with rising embers, moonbeam
 * shafts through the north-west windows, drifting dust motes, snow beyond
 * the glass, and the hidden bronze feathers with their sparkle.
 */
import * as THREE from 'three';
import { createFlame, type Flame } from '../fx/flame';
import { SeededRandom } from '../core/random';
import type { Candle } from './props';
import type { RoomMats } from './materials';
import { bayMatrix, MOON_DIR, WIN, R } from './layout';
import { archPoints } from './util';

const PI = Math.PI;

const flameMat = () => new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uBoost: { value: 1 } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv; varying float vId;
    void main() {
      vUv = uv;
      float id = float(gl_InstanceID);
      vId = id;
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float sc = length(instanceMatrix[1].xyz);
      vec2 q = position.xy;
      float flick = 1.0 + 0.12 * sin(uTime * 13.0 + id * 1.7) + 0.06 * sin(uTime * 29.0 + id * 3.1);
      q.x += (sin(uTime * 3.3 + id * 2.1) * 0.08 + sin(uTime * 7.7 + id) * 0.04) * q.y;
      mv.xy += vec2(q.x * 0.5, q.y * flick) * sc;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uBoost;
    varying vec2 vUv; varying float vId;
    void main() {
      vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
      // teardrop: widest low, pointed tip
      float w = sqrt(max(0.0, 1.0 - p.y)) * (0.35 + 0.65 * smoothstep(0.0, 0.35, p.y)) * 0.9;
      float d = abs(p.x) / max(w, 1e-3);
      float body = smoothstep(1.0, 0.55, d) * smoothstep(0.0, 0.08, p.y) * smoothstep(1.0, 0.75, p.y);
      float core = smoothstep(0.7, 0.0, d) * smoothstep(0.65, 0.15, p.y) * smoothstep(0.02, 0.18, p.y);
      vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.78, 0.42), smoothstep(0.0, 0.6, core));
      col = mix(col, vec3(1.0, 0.96, 0.85), core * core);
      // blue base where the wick is
      col = mix(col, vec3(0.25, 0.35, 1.0), smoothstep(0.18, 0.0, p.y) * smoothstep(0.8, 0.2, d) * 0.8);
      // soft halo beyond the body
      float halo = exp(-length(vec2(p.x * 0.8, (p.y - 0.35) * 1.2)) * 3.0) * 0.18;
      float a = body + halo;
      gl_FragColor = vec4(col * (body * 3.2 + halo * 1.2) * uBoost, a);
    }`,
});

export interface CandleSystem {
  update(dt: number, t: number, camera: THREE.Camera): void;
  floating: { pos: THREE.Vector3; phase: number; amp: number }[];
  setFloatLift(v: number): void;
}

/** Static candles (from props) + enchanted floating candles, two instanced draws + one flame draw. */
export function createCandles(m: RoomMats, scene: THREE.Object3D, candles: Candle[], hi: boolean): CandleSystem {
  const rng = new SeededRandom('floating-candles');
  const floatN = hi ? 48 : 30;
  const floating: CandleSystem['floating'] = [];
  for (let i = 0; i < floatN; i++) {
    const a = rng.range(0, PI * 2), r = Math.sqrt(rng.range(0.08, 1)) * 6.2;
    const p = new THREE.Vector3(Math.sin(a) * r, rng.range(3.6, 6.4), Math.cos(a) * r);
    // keep clear of the chandelier
    if (Math.hypot(p.x, p.z) < 1.8 && p.y > 5.5) p.y -= 1.2;
    floating.push({ pos: p, phase: rng.range(0, PI * 2), amp: rng.range(0.04, 0.12) });
  }
  const total = candles.length + floatN;
  const waxGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1).translate(0, 0.5, 0);
  // slight melted lip
  const wp = waxGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < wp.count; i++) if (wp.getY(i) > 0.99) wp.setY(i, Math.hypot(wp.getX(i), wp.getZ(i)) > 0.5 ? 0.97 : 1.0);
  waxGeo.computeVertexNormals();
  const wax = new THREE.InstancedMesh(waxGeo, m.wax, total);
  wax.name = 'candles-wax';
  wax.castShadow = false;
  wax.receiveShadow = true;
  const flameGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const fm = flameMat();
  const flames = new THREE.InstancedMesh(flameGeo, fm, total);
  flames.name = 'candles-flames';
  flames.frustumCulled = false;
  flames.renderOrder = 10;
  flames.userData.noAO = true;
  const mtx = new THREE.Matrix4();
  candles.forEach((c, i) => {
    mtx.makeScale(c.r, c.h, c.r).setPosition(c.pos);
    wax.setMatrixAt(i, mtx);
    mtx.makeScale(0.03 + c.r, 0.05 + c.r * 1.2, 1).setPosition(c.pos.x, c.pos.y + c.h + 0.004, c.pos.z);
    flames.setMatrixAt(i, mtx);
  });
  wax.computeBoundingSphere();
  scene.add(wax, flames);
  let lift = 0;
  const base = candles.length;
  return {
    floating,
    setFloatLift(v) { lift = v; },
    update(_dt, t) {
      fm.uniforms.uTime.value = t;
      for (let i = 0; i < floatN; i++) {
        const f = floating[i];
        const y = f.pos.y + Math.sin(t * 0.7 + f.phase) * f.amp + lift * (0.6 + 0.4 * Math.sin(f.phase));
        const x = f.pos.x + Math.sin(t * 0.21 + f.phase * 2) * 0.05;
        const h = 0.22 + 0.08 * Math.sin(f.phase * 3);
        mtx.makeScale(0.022, h, 0.022).setPosition(x, y, f.pos.z);
        wax.setMatrixAt(base + i, mtx);
        mtx.makeScale(0.05, 0.075, 1).setPosition(x, y + h + 0.004, f.pos.z);
        flames.setMatrixAt(base + i, mtx);
      }
      wax.instanceMatrix.needsUpdate = true;
      flames.instanceMatrix.needsUpdate = true;
      wax.computeBoundingSphere();
    },
  };
}

// ---------------------------------------------------------------------------

export interface FireSystem { update(dt: number, t: number): void; stoke(): void; intensity: number }

export function createFire(scene: THREE.Object3D, base: THREE.Vector3): FireSystem {
  const flames: Flame[] = [];
  const offsets = [[-0.18, 0, 0.9], [0.15, 0.02, 1.0], [0.0, 0.05, 1.25], [-0.32, -0.02, 0.6], [0.32, -0.02, 0.65]];
  offsets.forEach(([dz, dy, s], i) => {
    const f = createFlame(0.42 * s, i * 2.3, false);
    f.object.position.set(base.x, base.y + 0.1 + dy, base.z + dz);
    f.object.userData.noAO = true;
    f.object.traverse((o) => { o.userData.noAO = true; });
    scene.add(f.object);
    flames.push(f);
  });
  // rising embers
  const N = 90;
  const pos = new Float32Array(N * 3), life = new Float32Array(N), vel: THREE.Vector3[] = [];
  const rng = new SeededRandom('embers');
  for (let i = 0; i < N; i++) { life[i] = rng.next(); vel.push(new THREE.Vector3()); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 360 } },
    vertexShader: `attribute float aLife; varying float vL; uniform float uScale;
      void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uScale * 0.012 * (1.0 - aLife) / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vL; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d));
      vec3 c = mix(vec3(1.0,0.7,0.3), vec3(1.0,0.25,0.05), vL); gl_FragColor = vec4(c * a * 4.0 * (1.0 - vL), a); }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let stoke = 0;
  const sys: FireSystem = {
    intensity: 1,
    stoke() { stoke = 1; },
    update(dt, t) {
      stoke = Math.max(0, stoke - dt * 0.35);
      const k = 1 + stoke * 0.8;
      sys.intensity = (0.85 + 0.1 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23.7) + 0.05 * Math.sin(t * 5.1)) * k;
      for (const f of flames) { f.update(dt, t); f.object.scale.setScalar(1 + stoke * 0.5); }
      for (let i = 0; i < N; i++) {
        life[i] += dt * (0.35 + 0.3 * ((i * 0.618) % 1)) * (1 + stoke);
        if (life[i] >= 1) {
          life[i] = 0;
          pos[i * 3] = base.x + rng.range(-0.15, 0.15);
          pos[i * 3 + 1] = base.y + 0.2;
          pos[i * 3 + 2] = base.z + rng.range(-0.35, 0.35);
          vel[i].set(rng.range(-0.08, 0.04), rng.range(0.5, 1.1) * (1 + stoke), rng.range(-0.1, 0.1));
        }
        vel[i].x += Math.sin(t * 3 + i) * dt * 0.3;
        pos[i * 3] += vel[i].x * dt;
        pos[i * 3 + 1] += vel[i].y * dt;
        pos[i * 3 + 2] += vel[i].z * dt;
        if (pos[i * 3] > base.x + 0.25) vel[i].x -= dt * 2; // stay under the hood
      }
      g.attributes.position.needsUpdate = true;
      g.attributes.aLife.needsUpdate = true;
    },
  };
  return sys;
}

// ---------------------------------------------------------------------------

/** Additive moonbeam shafts from the north-west windows (three nested shells for soft edges). */
export function createMoonbeams(scene: THREE.Object3D): { update(t: number): void; material: THREE.ShaderMaterial } {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
    vertexShader: `attribute float aT; varying float vT; varying vec3 vW; varying float vDist;
      void main(){ vT = aT; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uTime; uniform float uStrength; varying float vT; varying vec3 vW; varying float vDist;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float fade = pow(1.0 - vT, 1.6) * smoothstep(0.0, 0.06, vT);
        float n = 0.75 + 0.25 * sin(vW.x * 1.3 + vW.y * 0.7 + uTime * 0.25) * sin(vW.z * 1.1 - uTime * 0.18);
        float near = smoothstep(0.4, 2.5, vDist);
        vec3 c = vec3(0.45, 0.58, 1.0) * 0.016 * fade * n * near * uStrength;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const L = MOON_DIR.clone().negate(); // light travel direction (world)
  for (const bay of [7, 8]) {
    const M = bayMatrix(bay);
    const inv = new THREE.Matrix4().copy(M).invert();
    const Ll = L.clone().transformDirection(inv);
    for (const shrink of [1.0, 0.82, 0.62]) {
      const outline = archPoints(WIN.w * 0.92 * shrink, WIN.y0 + 0.1 + (1 - shrink) * 0.5, WIN.ys - (1 - shrink) * 0.5, WIN.sharp, 10);
      const pts = outline.map((p) => new THREE.Vector3(p.x, p.y, 0.6));
      const len = 11;
      const posArr: number[] = [], tArr: number[] = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        const a2 = a.clone().addScaledVector(Ll, len), b2 = b.clone().addScaledVector(Ll, len);
        for (const [p, t] of [[a, 0], [b, 0], [b2, 1], [a, 0], [b2, 1], [a2, 1]] as const) { posArr.push(p.x, p.y, p.z); tArr.push(t); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
      g.setAttribute('aT', new THREE.Float32BufferAttribute(tArr, 1));
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, mat);
      mesh.applyMatrix4(M);
      mesh.renderOrder = 8;
      mesh.userData.noAO = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }
  return { material: mat, update(t) { mat.uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------------------

/** Dust motes that glint where the moonbeams fall, and snow drifting past the windows outside. */
export function createAirborne(scene: THREE.Object3D, hi: boolean): { update(dt: number, t: number): void } {
  const rng = new SeededRandom('dust');
  const N = hi ? 900 : 400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = rng.range(0, PI * 2), r = Math.sqrt(rng.next()) * 7.2;
    pos[i * 3] = Math.sin(a) * r; pos[i * 3 + 1] = rng.range(0.2, 6.5); pos[i * 3 + 2] = Math.cos(a) * r;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const moonL = MOON_DIR.clone();
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uMoon: { value: moonL } },
    vertexShader: `uniform float uTime; varying float vB;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.11 + position.y * 2.0) * 0.25;
        p.y += sin(uTime * 0.07 + position.x * 1.7) * 0.2;
        p.z += cos(uTime * 0.09 + position.z * 1.3) * 0.25;
        // brighter inside the moonlit north-west half of the room, where the shafts fall
        vB = 0.25 + 0.75 * smoothstep(0.0, 3.5, -(p.x + p.z) * 0.6 + 2.0 - p.y * 0.4);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 26.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vB; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(0.7, 0.78, 1.0) * a * 0.35 * vB, a); }`,
  });
  const dust = new THREE.Points(g, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // snow in an annulus outside the walls
  const S = hi ? 2200 : 900;
  const sp = new Float32Array(S * 3);
  for (let i = 0; i < S; i++) {
    let a = rng.range(0, PI * 2);
    if (Math.abs(a - PI * 2) < 0.45 || a < 0.45) a = rng.range(0.5, PI * 2 - 0.5); // keep out of the entrance passage
    const r = rng.range(R + 1.4, R + 9);
    sp[i * 3] = Math.sin(a) * r; sp[i * 3 + 1] = rng.range(-6, 10); sp[i * 3 + 2] = Math.cos(a) * r;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const snowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `uniform float uTime;
      void main(){
        vec3 p = position;
        p.y = mod(p.y - uTime * 0.6 + 6.0, 16.0) - 6.0;
        p.x += sin(uTime * 0.5 + position.z) * 0.4;
        p.z += cos(uTime * 0.4 + position.x) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = 40.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `void main(){ float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(0.6, 0.68, 0.85), a * 0.8); }`,
  });
  const snow = new THREE.Points(sg, snowMat);
  snow.frustumCulled = false;
  scene.add(snow);
  return {
    update(_dt, t) { dustMat.uniforms.uTime.value = t; snowMat.uniforms.uTime.value = t; },
  };
}

// ---------------------------------------------------------------------------

export interface FeatherSystem {
  items: { pos: THREE.Vector3; mesh: THREE.Mesh; found: boolean }[];
  update(dt: number, t: number): void;
  collect(i: number): void;
  burst(p: THREE.Vector3, color?: THREE.Color, n?: number): void;
}

/** Bronze eagle feathers hidden about the room + a shared sparkle pool. */
export function createFeathers(m: RoomMats, scene: THREE.Object3D, positions: THREE.Vector3[]): FeatherSystem {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(0.045, 0.06, 0.03, 0.2);
  shape.quadraticCurveTo(0.012, 0.25, 0.0, 0.27);
  shape.quadraticCurveTo(-0.02, 0.18, -0.03, 0.08);
  shape.quadraticCurveTo(-0.025, 0.03, 0, 0);
  const g = new THREE.ShapeGeometry(shape, 8);
  // bend the vane and score barbs into the normals with a gentle twist
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.04 * Math.sin(y * 8) * 0.4 + x * x * 3); }
  g.computeVertexNormals();
  const items: FeatherSystem['items'] = positions.map((pos, i) => {
    const mesh = new THREE.Mesh(g, m.feather);
    mesh.position.copy(pos);
    mesh.rotation.set(-PI / 2 + 0.3, i * 1.3, 0.4);
    mesh.name = `feather-${i}`;
    mesh.userData.noAO = true;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.3, 4).translate(0, 0.13, 0), m.feather);
    mesh.add(shaft);
    scene.add(mesh);
    return { pos: pos.clone(), mesh, found: false };
  });
  // sparkle pool
  const N = 400;
  const pp = new Float32Array(N * 3), pv = new Float32Array(N * 3), pl = new Float32Array(N), pc = new Float32Array(N * 3);
  pl.fill(1);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  sg.setAttribute('aLife', new THREE.BufferAttribute(pl, 1));
  sg.setAttribute('aColor', new THREE.BufferAttribute(pc, 3));
  const smat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aLife; attribute vec3 aColor; varying float vL; varying vec3 vC;
      void main(){ vL = aLife; vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = (aLife < 1.0 ? 6.0 * (1.0 - aLife) + 1.5 : 0.0) * 6.0 / -mv.z * 4.0; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vL; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); float star = max(smoothstep(0.08, 0.0, abs(d.x)) , smoothstep(0.08, 0.0, abs(d.y))) * smoothstep(0.5, 0.1, length(d));
      gl_FragColor = vec4(vC * (a + star) * 3.0 * (1.0 - vL), 1.0); }`,
  });
  const sparks = new THREE.Points(sg, smat);
  sparks.frustumCulled = false;
  scene.add(sparks);
  let cursor = 0;
  const rng = new SeededRandom('sparks');
  const gold = new THREE.Color(1.0, 0.72, 0.35);
  const emit = (at: THREE.Vector3, color: THREE.Color, speed: number) => {
    const i = cursor; cursor = (cursor + 1) % N;
    pp[i * 3] = at.x; pp[i * 3 + 1] = at.y; pp[i * 3 + 2] = at.z;
    const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.3, 1), rng.range(-1, 1)).normalize().multiplyScalar(speed * rng.range(0.3, 1));
    pv[i * 3] = d.x; pv[i * 3 + 1] = d.y; pv[i * 3 + 2] = d.z;
    pl[i] = 0;
    pc[i * 3] = color.r; pc[i * 3 + 1] = color.g; pc[i * 3 + 2] = color.b;
  };
  let acc = 0;
  return {
    items,
    collect(i) {
      const it = items[i];
      it.found = true;
      it.mesh.visible = false;
      for (let k = 0; k < 60; k++) emit(it.pos, gold, 1.4);
    },
    burst(at, color = gold, n = 50) { for (let k = 0; k < n; k++) emit(at, color, 1.6); },
    update(dt, t) {
      acc += dt;
      items.forEach((it, i) => {
        if (it.found) return;
        it.mesh.position.y = it.pos.y + 0.02 + Math.sin(t * 1.6 + i) * 0.015;
        it.mesh.rotation.y += dt * 0.5;
        (it.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.7 + 0.5 * Math.sin(t * 2.5);
      });
      while (acc > 0.12) {
        acc -= 0.12;
        for (const it of items) if (!it.found) emit(it.pos.clone().add(new THREE.Vector3(rng.range(-0.06, 0.06), 0.1, rng.range(-0.06, 0.06))), gold, 0.08);
      }
      for (let i = 0; i < N; i++) {
        if (pl[i] >= 1) continue;
        pl[i] = Math.min(1, pl[i] + dt * 0.9);
        pv[i * 3 + 1] -= dt * 0.25;
        pp[i * 3] += pv[i * 3] * dt; pp[i * 3 + 1] += pv[i * 3 + 1] * dt; pp[i * 3 + 2] += pv[i * 3 + 2] * dt;
        pv[i * 3] *= 0.98; pv[i * 3 + 2] *= 0.98;
      }
      sg.attributes.position.needsUpdate = true;
      sg.attributes.aLife.needsUpdate = true;
      sg.attributes.aColor.needsUpdate = true;
    },
  };
}

/** Occasional shooting stars across the dome once the constellations are awake. */
export function createShootingStars(scene: THREE.Object3D): { update(dt: number, t: number, on: number): void } {
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const g = new THREE.PlaneGeometry(1.6, 0.025).translate(-0.8, 0, 0);
  const mesh = new THREE.Mesh(g, mat);
  mesh.visible = false;
  mesh.userData.noAO = true;
  scene.add(mesh);
  const rng = new SeededRandom('shooting');
  let t0 = -10, dir = new THREE.Vector3(), start = new THREE.Vector3();
  return {
    update(_dt, t, on) {
      if (on < 0.5) { mesh.visible = false; return; }
      const age = t - t0;
      if (age > 1.2 && rng.chance(0.012)) {
        t0 = t;
        const a = rng.range(0, PI * 2);
        start.set(Math.sin(a) * 5.5, 10.4 + rng.range(0, 1.2), Math.cos(a) * 5.5);
        dir.set(rng.range(-1, 1), -0.25, rng.range(-1, 1)).normalize();
      }
      const k = (t - t0) / 0.9;
      mesh.visible = k >= 0 && k <= 1;
      if (mesh.visible) {
        mesh.position.copy(start).addScaledVector(dir, k * 4);
        mesh.lookAt(mesh.position.clone().add(new THREE.Vector3(0, -1, 0)));
        mesh.rotation.z = Math.atan2(dir.z, dir.x);
        mat.opacity = Math.sin(k * PI);
      }
    },
  };
}
