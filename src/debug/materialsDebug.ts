/**
 * TEMPORARY inspection scene — `?debug=materials`.
 * Every procedural material on a lit sphere + standing panel over a cobbled
 * floor, with a rotating grazing light and per-channel views.
 */
import * as THREE from 'three';
import type GUI from 'lil-gui';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  MaterialLibrary, MATERIAL_IDS, RECIPES, scaleUVsToWorld, projectWorldUVs, withBaseGrime, type MaterialId,
} from '../materials';
import type { PostFX } from '../core';

export interface DebugContext {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  post: PostFX;
  sun: THREE.DirectionalLight;
  gui: GUI;
}

export interface DebugHandle {
  update(dt: number, elapsed: number): void;
  afterRender(): void;
  resize(w: number, h: number): void;
}

type ViewMode = 'lit' | 'albedo' | 'normal' | 'roughness' | 'ao' | 'metalness' | 'transmission';

const CHANNEL_SHADER = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tex;
    uniform int channel;   // -1 = rgb, 0..2 = single channel
    uniform bool isData;   // raw data texture: display value as-is
    varying vec2 vUv;
    vec3 srgbToLinear(vec3 c) {
      return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
    }
    void main() {
      vec4 t = texture2D(tex, vUv);
      vec3 c = channel < 0 ? t.rgb : vec3(t[channel]);
      gl_FragColor = vec4(isData ? srgbToLinear(c) : c, 1.0);
    }`,
};

export async function runMaterialsDebug(ctx: DebugContext): Promise<DebugHandle> {
  const { container, renderer, scene, camera, controls, post, sun, gui } = ctx;

  // ---- Loading overlay -----------------------------------------------------
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', display: 'grid', placeItems: 'center', zIndex: '20',
    font: '13px ui-monospace, Menlo, monospace', color: '#cfe3ff', background: 'rgba(7,8,11,0.85)',
    transition: 'opacity 0.4s',
  });
  document.body.appendChild(overlay);

  const library = new MaterialLibrary({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
  const t0 = performance.now();
  await library.load(MATERIAL_IDS, (done, total) => {
    overlay.textContent = `Generating procedural materials… ${done}/${total}`;
  });
  const wall = performance.now() - t0;
  console.table(MATERIAL_IDS.map((id) => ({ id, size: RECIPES[id].size, ms: Math.round(library.timings.get(id) ?? 0) })));
  console.info(`[materials] ${MATERIAL_IDS.length} materials generated in ${Math.round(wall)} ms wall-clock`);
  overlay.style.opacity = '0';
  setTimeout(() => overlay.remove(), 450);

  // ---- Environment & lighting ----------------------------------------------
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  scene.fog = null;
  scene.background = new THREE.Color(0x0b0d12);
  sun.color.set(0xfff1dc);
  sun.intensity = 2.2;
  post.bloom.strength = 0.25;

  // ---- Floor ---------------------------------------------------------------
  const floorGeo = projectWorldUVs(new THREE.PlaneGeometry(60, 40).rotateX(-Math.PI / 2), RECIPES.cobblestone.worldSize, 'xz');
  const floor = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(floorGeo, library.get('cobblestone'));
  floor.receiveShadow = true;
  floor.position.z = -5;
  scene.add(floor);

  // ---- Samples -------------------------------------------------------------
  const COLS = 5, DX = 4.8, DZ = 6;
  const samples: { id: MaterialId; meshes: THREE.Mesh[]; lit: THREE.Material[]; anchor: THREE.Vector3 }[] = [];
  const root = new THREE.Group();
  scene.add(root);

  MATERIAL_IDS.forEach((id, i) => {
    const r = RECIPES[id];
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = (col - (COLS - 1) / 2) * DX;
    const z = -row * DZ;

    const sphereGeo = scaleUVsToWorld(new THREE.SphereGeometry(0.7, 96, 64), 2 * Math.PI * 0.7, Math.PI * 0.7, r.worldSize, true);
    const panelGeo = scaleUVsToWorld(new THREE.PlaneGeometry(2, 2), 2, 2, r.worldSize);
    const base = library.get(id);
    const panelMat = id === 'brick' ? withBaseGrime(base, { height: 1.1, strength: 0.75 }) : base;

    const sphere = new THREE.Mesh(sphereGeo, base);
    sphere.position.set(x - 1.25, 0.72, z + 0.4);
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(x + 0.75, 1.0, z);
    for (const m of [sphere, panel]) {
      m.castShadow = m.receiveShadow = true;
      root.add(m);
    }

    const label = document.createElement('div');
    label.textContent = id;
    label.title = r.label;
    Object.assign(label.style, {
      font: '11px ui-monospace, Menlo, monospace', color: '#e6edf7', padding: '2px 6px',
      background: 'rgba(8,10,16,0.7)', borderRadius: '3px', whiteSpace: 'nowrap',
    });
    const tag = new CSS2DObject(label);
    tag.position.set(x - 0.2, 2.35, z);
    root.add(tag);

    samples.push({ id, meshes: [sphere, panel], lit: [base, panelMat], anchor: new THREE.Vector3(x - 0.2, 1, z) });
  });

  // ---- Labels renderer -----------------------------------------------------
  const labels = new CSS2DRenderer();
  labels.setSize(container.clientWidth, container.clientHeight);
  Object.assign(labels.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
  document.body.appendChild(labels.domElement);

  // ---- Camera ----------------------------------------------------------------
  camera.position.set(0, 7.5, 14);
  controls.target.set(0, 0.8, -6);
  controls.update();

  // ---- Channel views ---------------------------------------------------------
  const channelMats = new Map<string, THREE.ShaderMaterial>();
  const channelMaterial = (id: MaterialId, mode: Exclude<ViewMode, 'lit'>): THREE.ShaderMaterial => {
    const key = `${id}:${mode}`;
    let m = channelMats.get(key);
    if (m) return m;
    const maps = library.getMaps(id);
    const spec: Record<typeof mode, [THREE.Texture | undefined, number, boolean]> = {
      albedo: [maps.map, -1, false],
      normal: [maps.normalMap, -1, true],
      roughness: [maps.roughnessMap, 1, true],
      ao: [maps.roughnessMap, 0, true],
      metalness: [maps.roughnessMap, 2, true],
      transmission: [maps.transmissionMap, 0, true],
    };
    const [tex, channel, isData] = spec[mode];
    m = new THREE.ShaderMaterial({
      ...CHANNEL_SHADER,
      side: THREE.DoubleSide,
      uniforms: {
        tex: { value: tex ?? null },
        channel: { value: tex ? channel : -1 },
        isData: { value: isData },
      },
    });
    if (!tex) {
      // e.g. transmission on an opaque material → show black
      m.fragmentShader = 'void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }';
    }
    channelMats.set(key, m);
    return m;
  };

  const state = {
    view: 'lit' as ViewMode,
    rotateLight: true,
    lightElevation: 28,
    lightAzimuth: 30,
    lightIntensity: sun.intensity,
    envIntensity: scene.environmentIntensity,
    normalScale: 1,
    focus: 'overview',
  };
  const savedToneMapping = renderer.toneMapping;
  const savedBloom = post.bloom.strength;

  const applyView = () => {
    const lit = state.view === 'lit';
    renderer.toneMapping = lit ? savedToneMapping : THREE.NoToneMapping;
    post.bloom.strength = lit ? savedBloom : 0;
    for (const s of samples) {
      s.meshes.forEach((mesh, k) => {
        mesh.material = lit ? s.lit[k] : channelMaterial(s.id, state.view as Exclude<ViewMode, 'lit'>);
      });
    }
    floor.material = lit ? library.get('cobblestone') : channelMaterial('cobblestone', state.view as Exclude<ViewMode, 'lit'>);
  };

  const folder = gui.addFolder('Materials debug');
  folder.add(state, 'view', ['lit', 'albedo', 'normal', 'roughness', 'ao', 'metalness', 'transmission']).onChange(applyView);
  folder.add(state, 'focus', ['overview', ...MATERIAL_IDS]).onChange((v: string) => {
    if (v === 'overview') {
      camera.position.set(0, 7.5, 14);
      controls.target.set(0, 0.8, -6);
    } else {
      const s = samples.find((x) => x.id === v)!;
      controls.target.copy(s.anchor);
      camera.position.copy(s.anchor).add(new THREE.Vector3(0.6, 0.8, 4.2));
    }
    controls.update();
  });
  folder.add(state, 'rotateLight');
  folder.add(state, 'lightAzimuth', 0, 360, 1).listen();
  folder.add(state, 'lightElevation', 3, 85, 1);
  folder.add(state, 'lightIntensity', 0, 6, 0.01).onChange((v: number) => (sun.intensity = v));
  folder.add(state, 'envIntensity', 0, 2, 0.01).onChange((v: number) => (scene.environmentIntensity = v));
  folder.add(state, 'normalScale', 0, 3, 0.01).onChange((v: number) => {
    for (const s of samples) for (const m of s.lit) (m as THREE.MeshStandardMaterial).normalScale.setScalar(v);
  });
  folder.open();
  gui.open();

  return {
    update(dt) {
      if (state.rotateLight) state.lightAzimuth = (state.lightAzimuth + dt * 20) % 360;
      const az = THREE.MathUtils.degToRad(state.lightAzimuth);
      const el = THREE.MathUtils.degToRad(state.lightElevation);
      sun.position.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(30);
      sun.target.position.set(0, 0, -6);
      sun.target.updateMatrixWorld();
    },
    afterRender() {
      labels.render(scene, camera);
    },
    resize(w, h) {
      labels.setSize(w, h);
    },
  };
}
