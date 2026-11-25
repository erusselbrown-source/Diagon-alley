import * as THREE from 'three';
import GUI from 'lil-gui';
import {
  createRenderer, createCamera, createScene, createPlaceholderGround,
  createPostProcessing, DebugHud,
} from './core';
import type { DebugHandle } from './debug/materialsDebug';
import { buildAlley, type AlleyWorld } from './world/alley';
import { STREET } from './architecture/street';

const params = new URLSearchParams(location.search);
const container = document.getElementById('app')!;
const renderer = createRenderer(container);
const { scene, sun } = createScene();
const { camera, controls } = createCamera(renderer.domElement, container.clientWidth / container.clientHeight);
const post = createPostProcessing(renderer, scene, camera);
const hud = new DebugHud(renderer);

const gui = new GUI({ title: 'Debug' });

let debug: DebugHandle | null = null;
if (params.get('debug') === 'materials') {
  // Temporary inspection mode — loaded lazily so it never ships in the main path.
  gui.add(renderer, 'toneMappingExposure', 0.2, 3, 0.01).name('exposure');
  gui.add(post.bloom, 'strength', 0, 3, 0.01).name('bloom').listen();
  gui.add(sun, 'intensity', 0, 5, 0.01).name('key light').listen();
  const { runMaterialsDebug } = await import('./debug/materialsDebug');
  debug = await runMaterialsDebug({ container, renderer, scene, camera, controls, post, sun, gui });
}

let alley: AlleyWorld | null = null;
if (!debug) {
  if (params.has('grid')) scene.add(createPlaceholderGround());
  gui.title('Controls');
  alley = await buildAlley({ renderer, scene, camera, controls, gui, post });
}

function onResize(): void {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
  debug?.resize(w, h);
}
window.addEventListener('resize', onResize);

const timer = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.1);
  debug?.update(dt, timer.getElapsed());
  alley?.update(dt, timer.getElapsed());
  controls.update();
  hud.beginFrame();
  post.composer.render();
  hud.endFrame();
  debug?.afterRender();
});

if (import.meta.env.DEV) {
  Object.assign(window, { __dbg: { THREE, scene, camera, renderer, post, controls, STREET, get alley() { return alley; } } });
}
