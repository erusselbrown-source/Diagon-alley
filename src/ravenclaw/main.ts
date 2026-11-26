/**
 * Ravenclaw Tower — the common room. Entry point for ravenclaw.html.
 *
 * Reuses the project's renderer (ACES, soft PCF, pixel ratio ≤ 2), the
 * procedural material library, the bloom/film post chain with OutputPass
 * last, and the debug HUD. Adds screen-space ambient occlusion (GTAO) and
 * MSAA on desktop.
 */
import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { createRenderer, createPostProcessing, DebugHud, IS_TOUCH, QUALITY } from '../core';
import { LightPool, type LightSource } from '../core/lighting';
import { TowerWalkArea } from './walkArea';
import { buildWings, createWingMaterials } from './wing';
import { MaterialLibrary } from '../materials';
import { ROOM_MATERIALS, createRoomMaterials } from './materials';
import { buildShell } from './shell';
import { buildProps } from './props';
import { createCandles, createFire, createMoonbeams, createAirborne, createFeathers, createShootingStars } from './fx';
import { Player } from './player';
import { TowerAudio } from './audio';
import { Game } from './game';
import { MOON_DIR, START, R } from './layout';

const HI = !IS_TOUCH;
const container = document.getElementById('app')!;
const renderer = createRenderer(container);
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02040a);
scene.fog = new THREE.FogExp2(0x0a1022, 0.011);
const camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.05, 400);
camera.position.copy(START);
const hud = new DebugHud(renderer);
if (!new URLSearchParams(location.search).has('hud')) hud.setVisible(false);

// ------------------------------------------------------------------ boot UI
const audio = new TowerAudio();
const area = new TowerWalkArea();
const player = new Player(camera, renderer.domElement, START, area);

const lib = new MaterialLibrary({ seed: 'ravenclaw-tower', anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });

// The game UI needs the world; show a lightweight loading line in the meantime.
const loading = document.createElement('div');
Object.assign(loading.style, { position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', background: '#03050e', color: '#b9a27a', font: '16px Georgia, serif', letterSpacing: '0.2em', zIndex: '40', transition: 'opacity .8s' } satisfies Partial<CSSStyleDeclaration>);
loading.textContent = 'CLIMBING THE TOWER…';
document.body.appendChild(loading);

await lib.load(ROOM_MATERIALS, (done, total) => { loading.textContent = `WEAVING THE TAPESTRIES… ${done}/${total}`; });
await new Promise((r) => setTimeout(r, 0));
const mats = createRoomMaterials(lib, HI);

// ------------------------------------------------------------------ world
const slate = lib.get('slate');
const shell = buildShell(mats, HI, slate);
scene.add(shell.group);
const props = buildProps(mats, shell.shelves);
scene.add(props.group);
for (const c of [...shell.colliders.circles, ...props.colliders.circles]) area.addCircle(c.x, c.z, c.r);
for (const r of [...shell.colliders.rects, ...props.colliders.rects]) area.addRect(r.x, r.z, r.hw, r.hd, r.rot);
const wingMats = createWingMaterials(mats, slate, mats.oak);
const wings = buildWings(mats, wingMats, area);
scene.add(wings.group);

const candles = createCandles(mats, scene, [...props.candles, ...wings.candles], HI);
const fire = createFire(scene, props.refs.fireBase);
const beams = createMoonbeams(scene);
const airborne = createAirborne(scene, HI, (x, z) => area.inside(x, z));
// seven feathers: landing, mantel, statue niche, bookcase top, moonlit window seat — and one in each dormitory
const featherSpots = [0, 1, 2, 4, 5].map((i) => props.refs.feathers[i]).concat(wings.refs.map((r) => r.feather));
const feathers = createFeathers(mats, scene, featherSpots);
const shooting = createShootingStars(scene);

// ------------------------------------------------------------------ lighting
scene.add(new THREE.HemisphereLight(0x33457a, 0x24160c, 0.28));

const moon = new THREE.DirectionalLight(0xa8bcff, 2.3);
moon.position.copy(MOON_DIR).multiplyScalar(30);
moon.target.position.set(0, 0, 0);
moon.castShadow = true;
moon.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
moon.shadow.bias = -0.0003;
moon.shadow.normalBias = 0.03;
moon.shadow.radius = 4;
// covers the drum and both dormitory wings
moon.shadow.mapSize.set(HI ? 4096 : 2048, HI ? 4096 : 2048);
Object.assign(moon.shadow.camera, { left: -21, right: 21, top: 21, bottom: -21, near: 5, far: 80 });
scene.add(moon, moon.target);

// Every point light goes through the project's LightPool (core/lighting.ts): a fixed set of
// PointLights assigned each frame to the nearest / visible sources — no shader recompiles as
// you move between the common room, the turrets and the dormitories.
const pool = new LightPool(scene, QUALITY.lightPool);
const flick = (base: number, k: number, seed: number) => () => base * (1 - 0.12 * k + 0.12 * k * Math.sin(clock.t * (9 + seed) + seed) + 0.05 * k * Math.sin(clock.t * 23 + seed * 3));
const clock = { t: 0, awake: 0, fire: 1, stove: [1, 1] };
const src = (pos: THREE.Vector3, color: number, distance: number, intensity: () => number): LightSource => ({ position: pos.clone(), color: new THREE.Color(color), distance, decay: 2, intensity });
pool.add(
  src(props.lights.fire, 0xff8636, 16, () => 26 * clock.fire),
  src(props.lights.chandelier, 0xffb066, 24, () => 46 * (0.96 + 0.04 * Math.sin(clock.t * 9.1)) * (1 + 0.25 * clock.awake)),
  ...props.lights.tables.map((p, i) => src(p, 0xffa15a, 7, flick(3.2, 1, i))),
  src(shell.torch.clone().add(new THREE.Vector3(0.45, 0.25, 0)), 0xff8a3a, 7, flick(2.2, 1.2, 7)),
  src(shell.lantern.clone().setY(shell.lantern.y - 0.6), 0x6f8cff, 12, () => 6 + 18 * clock.awake),
  ...wings.lights.map((l, i) => src(l.pos, l.color, l.distance, flick(l.intensity, l.flicker, i + 11))),
);

const statueSpot = new THREE.SpotLight(0xd4e2ff, 70, 14, 0.36, 0.65, 2);
statueSpot.position.set(0, 6.4, -R + 3.4);
statueSpot.target.position.set(0, 2.1, -R - 0.3);
statueSpot.castShadow = true;
statueSpot.shadow.mapSize.set(1024, 1024);
statueSpot.shadow.bias = -0.0005;
statueSpot.shadow.radius = 3;
scene.add(statueSpot, statueSpot.target);


// procedural interior environment for reflections on polish, brass and glass
scene.environment = roomEnvironment(renderer);
scene.environmentIntensity = 0.45;

// small torch flame on the landing
import('../fx/flame').then(({ createFlame }) => {
  const f = createFlame(0.32, 7, false);
  f.object.position.copy(shell.torch).add(new THREE.Vector3(0, -0.08, 0));
  f.object.traverse((o) => { o.userData.noAO = true; });
  scene.add(f.object);
  extraFx.push((dt, t) => f.update(dt, t));
});
const extraFx: ((dt: number, t: number) => void)[] = [];

// ------------------------------------------------------------------ post
const post = createPostProcessing(renderer, scene, camera);
post.bloom.strength = 0.62;
post.bloom.radius = 0.55;
post.bloom.threshold = 1.0;
post.film.uniforms.uVignette.value = 0.5;
post.film.uniforms.uGrain.value = 0.035;
let gtao: GTAOPass | null = null;
if (HI) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  gtao = new GTAOPass(scene, camera, size.x, size.y);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.9;
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
  // Hide additive effects (flames, beams, sparks) from the AO G-buffer pass.
  const pass = gtao as unknown as { _overrideVisibility(): void; _visibilityCache: THREE.Object3D[] };
  pass._overrideVisibility = function () {
    scene.traverse((o) => {
      if (!o.visible) return;
      const isFx = o.userData.noAO || (o as THREE.Points).isPoints || (o as THREE.Line).isLine
        || ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material).transparent);
      if (isFx) { o.visible = false; this._visibilityCache.push(o); }
    });
  };
  post.composer.insertPass(gtao, 1);
  post.composer.renderTarget1.samples = 4;
  post.composer.renderTarget2.samples = 4;
}

// ------------------------------------------------------------------ game
const game = new Game({
  player, audio, shell, props, wings: wings.refs, feathers, fire, candles, camera, dom: renderer.domElement,
  onStart: () => { void audio.start(props.lights.fire, new THREE.Vector3(R - 0.4, 2.0, -0.1)); },
});
player.onStep = () => {
  const r = Math.hypot(player.pos.x, player.pos.z);
  const inWing = area.roomAt(player.pos.x, player.pos.z) > 0;
  const onStair = inWing && player.floorY > 0.05 && player.floorY < 3.9;
  audio.step(r < 3.6 && !inWing, (player.pos.z > R + 0.3 && !inWing) || onStair || (inWing && player.floorY < 0.05));
};

loading.style.opacity = '0';
setTimeout(() => loading.remove(), 900);
game.setReady();

// ------------------------------------------------------------------ resize + loop
function onResize(): void {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
  if (gtao) { const s = renderer.getDrawingBufferSize(new THREE.Vector2()); gtao.setSize(s.x, s.y); }
}
window.addEventListener('resize', onResize);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyG' && gtao) gtao.enabled = !gtao.enabled;
  if (e.code === 'Backquote') hud.setVisible(true);
});

const timer = new THREE.Timer();
let idleYaw = 0;
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  const t = timer.getElapsed();
  if (!game.started) {
    // slow establishing drift on the title card: looking up at the dome
    idleYaw += dt * 0.05;
    camera.position.set(Math.sin(idleYaw) * 3.2, 2.2, Math.cos(idleYaw) * 3.2);
    camera.lookAt(0, 6.5, 0);
  } else player.update(dt);

  game.update(dt, t);
  candles.update(dt, t, camera);
  fire.update(dt, t);
  clock.t = t; clock.awake = game.awake; clock.fire = fire.intensity;
  audio.setFireLevel(fire.intensity);
  beams.update(t);
  airborne.update(dt, t);
  feathers.update(dt, t);
  shooting.update(dt, t, game.awake);
  for (const a of props.animators) a(dt, t);
  for (const f of extraFx) f(dt, t);
  pool.update(camera, dt);
  for (const a of wings.animators) a(dt, t);
  // dormitory furnishings are only drawn while you are in that wing or its door stands open
  const here = area.roomAt(player.pos.x, player.pos.z);
  for (const r of wings.refs) r.props.visible = here === r.wing.bay || (shell.wingDoors.get(r.wing.bay)?.angle ?? 0) > 0.02;
  (shell.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
  audio.updateListener(camera);
  post.update(t);
  hud.beginFrame();
  post.composer.render();
  hud.endFrame();
});

/** Warm firelit lower hemisphere, deep blue upper, a few bright spots (chandelier, windows, hearth). */
function roomEnvironment(r: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){ float h = vD.y;
      vec3 up = vec3(0.03, 0.05, 0.14), mid = vec3(0.12, 0.08, 0.05), lo = vec3(0.05, 0.03, 0.02);
      vec3 c = h > 0.0 ? mix(mid, up, smoothstep(0.0, 0.6, h)) : mix(mid, lo, smoothstep(0.0, -0.5, h));
      gl_FragColor = vec4(c, 1.0); }`,
  })));
  const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 1.1) });
  const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.0, 2.2) });
  const blob = (m: THREE.Material, x: number, y: number, z: number, s: number) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), m); b.position.set(x, y, z); env.add(b);
  };
  blob(warm, 0, 9, 0, 2.2);
  blob(warm, 12, 0.5, 0, 1.6);
  for (let k = 0; k < 6; k++) { const a = k * 1.05 + 0.4; blob(cool, Math.sin(a) * 15, 4, Math.cos(a) * 15, 1.4); }
  const pm = new THREE.PMREMGenerator(r);
  const tex = pm.fromScene(env, 0.03).texture;
  pm.dispose();
  return tex;
}

if (import.meta.env.DEV) Object.assign(window, { __rc: { THREE, scene, camera, renderer, player, game, post, shell, wings, area } });
