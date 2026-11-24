import * as THREE from 'three';
import GUI from 'lil-gui';
import {
  createRenderer, createCamera, createScene, createPlaceholderGround,
  createPostProcessing, DebugHud,
} from './core';

const container = document.getElementById('app')!;
const renderer = createRenderer(container);
const { scene, sun } = createScene();
const { camera, controls } = createCamera(renderer.domElement, container.clientWidth / container.clientHeight);
const post = createPostProcessing(renderer, scene, camera);
const hud = new DebugHud(renderer);

scene.add(createPlaceholderGround());

const gui = new GUI({ title: 'Debug' });
gui.add(renderer, 'toneMappingExposure', 0.2, 3, 0.01).name('exposure');
gui.add(post.bloom, 'strength', 0, 3, 0.01).name('bloom');
gui.add(sun, 'intensity', 0, 5, 0.01).name('moonlight');
gui.add(scene.fog as THREE.FogExp2, 'density', 0, 0.1, 0.001).name('fog');
gui.close();

function onResize(): void {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  post.setSize(w, h);
}
window.addEventListener('resize', onResize);

renderer.setAnimationLoop(() => {
  controls.update();
  hud.beginFrame();
  post.composer.render();
  hud.endFrame();
});

if (import.meta.env.DEV) {
  Object.assign(window, { __dbg: { THREE, scene, camera, renderer, post, controls } });
}
