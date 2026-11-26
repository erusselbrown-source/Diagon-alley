/**
 * Cauldron Chaos — a frantic co-op potions kitchen beneath the alley.
 * Entry point: renderer + post, lighting, camera framing, menus and the loop.
 */
import * as THREE from 'three';
import { createRenderer, createPostProcessing, DebugHud, QUALITY } from '../core';
import { createNightEnvironment } from '../core/environment';
import { MaterialLibrary } from '../materials';
import { LEVELS, type LevelDef } from './data';
import { Fx } from './fx';
import { Game } from './game';
import { renderIcons } from './icons';
import { Input } from './input';
import { GameAudio } from './sfx';
import { UI } from './ui';
import { buildLevel, LEVEL_MATERIALS, type LevelWorld } from './world';

const container = document.getElementById('app')!;
const renderer = createRenderer(container);
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07060d);
scene.fog = new THREE.Fog(0x07060d, 18, 40);
const camera = new THREE.PerspectiveCamera(34, container.clientWidth / container.clientHeight, 0.1, 80);
const post = createPostProcessing(renderer, scene, camera);
post.bloom.strength = 0.75;
post.bloom.radius = 0.55;
post.bloom.threshold = 1.0;
post.film.uniforms.uVignette.value = 0.5;
post.film.uniforms.uGrain.value = 0.03;
const hud = new DebugHud(renderer);
let hudOn = true; // FPS + draw calls (F2 toggles)
window.addEventListener('keydown', (e) => { if (e.code === 'F2') { hudOn = !hudOn; hud.setVisible(hudOn); } });

scene.environment = createNightEnvironment(renderer);
scene.environmentIntensity = 0.35;

// ---------------------------------------------------------------- lighting rig (fixed: no recompiles)
const hemi = new THREE.HemisphereLight(0x7080b8, 0x2a1c12, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffdcb0, 2.0);
key.castShadow = true;
key.shadow.mapSize.set(QUALITY.shadowMap, QUALITY.shadowMap);
key.shadow.radius = 4;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
scene.add(key, key.target);
const moon = new THREE.DirectionalLight(0x6a82ff, 0.6);
moon.position.set(-2, 6, -12);
scene.add(moon);
const flashLight = new THREE.DirectionalLight(0xc8d8ff, 0);
flashLight.position.set(0, 8, -10);
scene.add(flashLight);
const lights: THREE.PointLight[] = [];
for (let i = 0; i < 8; i++) {
  const l = new THREE.PointLight(0xff9a4a, 0, 5, 1.6);
  scene.add(l);
  lights.push(l);
}

// ---------------------------------------------------------------- systems
const fx = new Fx(scene);
const audio = new GameAudio();
const input = new Input();
const library = new MaterialLibrary({ seed: 'cauldron-chaos', anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
const ui = new UI(new Map());
input.mountTouch(ui.root);

let world: LevelWorld | null = null;
let game: Game | null = null;
let level: LevelDef = LEVELS[0];
let solo = true;
let state: 'menu' | 'countdown' | 'play' | 'paused' | 'over' = 'menu';
let shakeAmt = 0;
let flashAmt = 0;
const camBase = new THREE.Vector3();
const camLook = new THREE.Vector3();

const BEST_KEY = 'cauldron-chaos-best';
const loadBest = (): number[] => {
  try { return JSON.parse(localStorage.getItem(BEST_KEY) ?? '[]') as number[]; } catch { return []; }
};
const bestScores = (): number[] => {
  try { return JSON.parse(localStorage.getItem(`${BEST_KEY}-score`) ?? '[]') as number[]; } catch { return []; }
};
const saveBest = (i: number, stars: number, score: number): boolean => {
  try {
    const b = loadBest();
    b[i] = Math.max(b[i] ?? 0, stars);
    localStorage.setItem(BEST_KEY, JSON.stringify(b));
    const s = bestScores();
    const isBest = score > (s[i] ?? 0);
    if (isBest) { s[i] = score; localStorage.setItem(`${BEST_KEY}-score`, JSON.stringify(s)); }
    return isBest;
  } catch { return false; }
};

const project = (x: number, y: number, z: number) => {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * container.clientWidth, y: (-v.y * 0.5 + 0.5) * container.clientHeight, on: v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 };
};

/** Fit the camera so the whole kitchen sits below the order tickets. */
function frameCamera(): void {
  if (!world) return;
  const W = world.W, H = world.H;
  const portrait = camera.aspect < 1;
  camera.fov = portrait ? 50 : 34;
  camera.updateProjectionMatrix();
  const elev = THREE.MathUtils.degToRad(portrait ? 64 : 57);
  const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
  camLook.set(0, 0, 0.35);
  const corners: THREE.Vector3[] = [];
  for (const x of [-W / 2 + 0.6, W / 2 - 0.6]) for (const z of [-H / 2 + 0.8, H / 2 - 0.6]) for (const y of [0, 1.1]) corners.push(new THREE.Vector3(x, y, z));
  let lo = 4, hi = 60;
  for (let it = 0; it < 30; it++) {
    const d = (lo + hi) / 2;
    camera.position.copy(camLook).addScaledVector(dir, d);
    camera.lookAt(camLook);
    camera.updateMatrixWorld();
    const fits = corners.every((c) => {
      const p = c.clone().project(camera);
      return Math.abs(p.x) < 0.96 && p.y > -0.9 && p.y < (portrait ? 0.55 : 0.7);
    });
    if (fits) hi = d; else lo = d;
  }
  camera.position.copy(camLook).addScaledVector(dir, hi);
  // nudge the look point so the free space sits under the tickets
  camBase.copy(camera.position);
  camera.lookAt(camLook);
  const ext = Math.max(W, H) / 2 + 3;
  const sc = key.shadow.camera;
  sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 40;
  sc.updateProjectionMatrix();
  key.position.set(-5, 12, 6);
  key.target.position.set(0, 0, 0);
  fx.setScale(renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
}

function applyMood(l: LevelDef): void {
  const m = l.mood;
  key.color.set(m === 'storm' ? 0xc8c8e8 : m === 'tower' ? 0xe8d8c8 : 0xffd6a8);
  key.intensity = m === 'storm' ? 1.4 : m === 'tower' ? 1.8 : 2.0;
  hemi.color.set(m === 'storm' ? 0x5060a0 : 0x7080b8);
  hemi.intensity = m === 'storm' ? 0.45 : 0.55;
  moon.intensity = m === 'storm' ? 0.35 : 0.65;
  if (world) {
    world.windowMat.uniforms.uRain.value = m === 'storm' ? 1 : 0;
    world.windowMat.uniforms.uWarm.value = m === 'tower' ? 0.15 : 0;
  }
}

function setupLevel(l: LevelDef): void {
  game?.dispose();
  game = null;
  if (world) { scene.remove(world.group); world.dispose(); }
  fx.clear();
  level = l;
  world = buildLevel(l, library);
  scene.add(world.group);
  applyMood(l);
  frameCamera();
  input.solo = solo;
  game = new Game({
    scene, world, level: l, fx, audio, ui, input, lights, project, solo,
    shake: (a) => { shakeAmt = Math.max(shakeAmt, a); },
    flash: (a) => { flashAmt = a; },
  });
}

function showMenu(): void {
  state = 'menu';
  audio.stopMusic();
  audio.setBeds(0, 0, 0);
  ui.showHud(false);
  setupLevel(level);
  ui.title(loadBest(), solo, (l, s) => {
    audio.play('click');
    void audio.start().then(() => audio.play('click'));
    solo = s;
    play(l);
  });
}

function play(l: LevelDef): void {
  setupLevel(l);
  ui.setHelp(solo);
  ui.showHud(true);
  state = 'countdown';
  audio.startMusic(`music-${l.id}`);
  audio.stopMusic();
  const seq = ['3', '2', '1', 'Brew!'];
  seq.forEach((txt, i) => setTimeout(() => {
    if (state !== 'countdown') return;
    ui.countdown(txt);
    audio.play(i < 3 ? 'tick' : 'go');
    if (i === 3) {
      state = 'play';
      game?.start();
      audio.startMusic(`music-${l.id}`);
      audio.setHurry(false);
      setTimeout(() => { if (state === 'play') ui.closeScreen(); }, 700);
    }
  }, 300 + i * 800));
}

function finish(): void {
  if (!game) return;
  state = 'over';
  game.running = false;
  audio.stopMusic();
  audio.setBeds(0, 0, 0);
  ui.countdown("Time's up!");
  audio.play('done');
  const r = game.result;
  const idx = LEVELS.indexOf(level);
  const stars = level.stars.filter((t) => r.score >= t).length;
  const best = saveBest(idx, stars, r.score);
  setTimeout(() => {
    ui.results(level, r.score, r, best,
      () => { audio.play('click'); play(level); },
      () => { audio.play('click'); showMenu(); },
      idx < LEVELS.length - 1 ? () => { audio.play('click'); play(LEVELS[idx + 1]); } : null,
      () => audio.play('star'));
  }, 1800);
}

input.onPause = () => {
  if (state === 'play') {
    state = 'paused';
    audio.stopMusic();
    ui.pause(
      () => { ui.closeScreen(); state = 'play'; audio.startMusic(`music-${level.id}`); },
      () => showMenu(),
      () => play(level),
    );
  } else if (state === 'paused') {
    ui.closeScreen();
    state = 'play';
    audio.startMusic(`music-${level.id}`);
  }
};

// ---------------------------------------------------------------- boot
async function boot(): Promise<void> {
  ui.setLoading(0.02, 'Grinding moonstone…');
  const msgs = ['Grinding moonstone…', 'Seasoning the oak…', 'Stacking bricks…', 'Polishing brass…', 'Stoking the hearths…'];
  await library.load(LEVEL_MATERIALS, (done, total) => ui.setLoading(0.05 + (done / Math.max(1, total)) * 0.85, msgs[done % msgs.length]));
  ui.setLoading(0.94, 'Bottling samples…');
  ui.setIcons(renderIcons());
  ui.setLoading(1, 'Ready!');
  showMenu();
  // warm up shaders before revealing
  renderer.compile(scene, camera);
  ui.hideLoading();
}

function onResize(): void {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  renderer.setSize(w, h);
  post.setSize(w, h);
  frameCamera();
}
window.addEventListener('resize', onResize);

const timer = new THREE.Timer();
const shakeOff = new THREE.Vector3();
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  const t = timer.getElapsed();
  if (game && state !== 'paused') {
    game.update(dt, t);
    if (state === 'play' && game.timeLeft <= 0) finish();
  }
  fx.update(state === 'paused' ? 0 : dt);
  ui.update(dt);

  // camera: framed base + gentle drift in the menu + shake
  shakeAmt *= Math.exp(-dt * 6);
  shakeOff.set((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt, 0);
  if (state === 'menu') {
    const a = Math.sin(t * 0.15) * 0.12;
    camera.position.set(camBase.x + Math.sin(a) * 3, camBase.y - 1.5, camBase.z + 0.5);
    camera.lookAt(camLook.x, camLook.y + 0.3, camLook.z);
  } else {
    camera.position.copy(camBase).add(shakeOff);
    camera.lookAt(camLook);
  }

  // lightning
  flashAmt *= Math.exp(-dt * 7);
  const flicker = flashAmt > 0.05 ? flashAmt * (0.6 + 0.4 * Math.sin(t * 60)) : 0;
  flashLight.intensity = flicker * 5;
  if (world) world.windowMat.uniforms.uFlash.value = flicker;

  post.update(t);
  hud.beginFrame();
  post.composer.render();
  hud.endFrame();
});

void boot();

if (import.meta.env.DEV) Object.assign(window, { __cc: { THREE, scene, camera, renderer, get game() { return game; } } });
