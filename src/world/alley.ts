/**
 * Scene assembly for the alley: loads materials, lays the street, builds the
 * entry courtyard and side features, and adds temporary glow lighting.
 */
import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createNightEnvironment, LoadingOverlay } from '../core';
import { MaterialLibrary, type MaterialId } from '../materials';
import { STREET, createFrame } from '../architecture/street';
import { buildStreetSurface } from '../architecture/streetSurface';
import { buildEntryArchway, type EntryArchway } from '../architecture/entryArchway';
import { buildSideAlleys } from '../architecture/sideAlleys';
import { buildStoops } from '../architecture/stoops';
import { Kit } from '../architecture/kit';
import { buildShops, planStreet } from '../shops/plan';
import { HERO_PLACEMENTS } from '../shops/heroes';
import { createChimneySmoke } from '../fx/chimneySmoke';

export interface AlleyContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  gui: GUI;
}

export interface AlleyWorld {
  update(dt: number, elapsed: number): void;
  stats: Record<string, number>;
  archway: EntryArchway;
  /** Dev aid: when set, animators see this fixed time instead of the clock. */
  debugTime: number | null;
}

const MATERIALS: MaterialId[] = [
  'granite', 'grit', 'sandstone', 'brick', 'iron', 'oak', 'plaster', 'glass', 'brass', 'slate', 'slate-tile', 'copper', 'leather', 'velvet',
  'paint-oxblood', 'paint-charcoal', 'paint-indigo', 'paint-emerald', 'paint-ochre', 'paint-weasley', 'paint-magenta',
  'paint-violet', 'paint-teal', 'paint-mustard', 'paint-plum', 'paint-cream',
];

const tmpSize = new THREE.Vector2();

export async function buildAlley(ctx: AlleyContext): Promise<AlleyWorld> {
  const { renderer, scene, gui } = ctx;
  const overlay = new LoadingOverlay('Generating procedural materials…');
  const lib = new MaterialLibrary({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
  await lib.load(MATERIALS, (d, n) => overlay.set(`Generating procedural materials… ${d}/${n}`));
  overlay.set('Laying cobbles…');
  await new Promise((r) => setTimeout(r, 0));

  scene.environment = createNightEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  const t0 = performance.now();
  const surface = buildStreetSurface(STREET, lib);
  scene.add(surface.group);
  const stats: Record<string, number> = { ...surface.stats, buildMs: 0 };

  // ---- Entry courtyard & magic archway ----------------------------------------
  const archway = buildEntryArchway(STREET, lib);
  scene.add(archway.group);
  Object.assign(stats, archway.stats);
  ctx.camera.position.copy(archway.viewpoint.position);
  ctx.controls.target.copy(archway.viewpoint.target);
  ctx.controls.update();
  const hint = installArchwayInteraction(ctx, archway);

  // ---- Knockturn mouth, alcoves, stoops -----------------------------------------
  const side = buildSideAlleys(STREET, lib);
  scene.add(side.group);

  // ---- Shops: heroes + procedural fillers along both sides ------------------------
  overlay.set('Raising the shops…');
  await new Promise((r) => setTimeout(r, 0));
  const kit = new Kit(lib);
  const placements = planStreet(STREET, HERO_PLACEMENTS);
  const shops = buildShops(kit, STREET, placements);
  scene.add(shops.group);
  STREET.stoops.splice(0, STREET.stoops.length, ...shops.stoops);
  scene.add(buildStoops(STREET, lib));
  scene.add(kit.instances.finalize(scene));
  const animators = [...shops.animators, ...kit.animators];
  const smoke = createChimneySmoke(kit.smoke.map((e) => e.anchor.localToWorld(e.local.clone())));
  scene.add(smoke.object);
  Object.assign(stats, shops.stats, { stoops: STREET.stoops.length, smokeEmitters: kit.smoke.length });
  console.info('[alley] shops', shops.names.map((n) => `${n.side[0]} ${n.s0.toFixed(1)}+${n.frontage.toFixed(1)} ${n.name}`).join(' | '));

  // ---- Temporary street glow (stand-ins until fx/lanterns) -------------------
  const glow = addStreetGlow(scene);
  stats.glowLights = glow;

  stats.buildMs = Math.round(performance.now() - t0);
  console.info('[alley] build stats', stats);
  overlay.done();

  const rain = { intensity: 1 };
  const folder = gui.addFolder('Alley');
  folder.add(rain, 'intensity', 0, 1, 0.01).name('rain ripples').onChange((v: number) => surface.puddles.setRain(v));

  folder.add({ toggleArch: () => archway.trigger() }, 'toggleArch').name('open / close archway');

  const world: AlleyWorld = {
    stats,
    archway,
    debugTime: null,
    update(dt, clock) {
      const elapsed = world.debugTime ?? clock;
      surface.update(elapsed);
      for (const a of animators) a.update(dt, elapsed);
      smoke.setViewport(renderer.getDrawingBufferSize(tmpSize).y, ctx.camera.fov);
      smoke.update(dt, elapsed);
      archway.update(dt);
      hint.update();
    },
  };
  return world;
}

/** Click the wall (or press E nearby) to open/close the archway. */
function installArchwayInteraction(ctx: AlleyContext, archway: EntryArchway): { update(): void } {
  const { renderer, camera } = ctx;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // a drag, not a click
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(archway.bricks, false)[0];
    if (hit) archway.trigger(hit.point);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'e' || e.repeat) return;
    if (camera.position.distanceTo(archway.center) < 9) archway.trigger();
  });

  const hint = document.createElement('div');
  Object.assign(hint.style, {
    position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)', zIndex: '10',
    font: '13px Georgia, serif', letterSpacing: '0.04em', color: '#f3dcb2', padding: '8px 16px',
    background: 'rgba(12,9,6,0.62)', border: '1px solid rgba(243,220,178,0.25)', borderRadius: '18px',
    pointerEvents: 'none', transition: 'opacity 0.6s',
  } satisfies Partial<CSSStyleDeclaration>);
  hint.textContent = 'Tap the bricks — or press E — to open the way';
  document.body.appendChild(hint);
  return {
    update() {
      const near = camera.position.distanceTo(archway.center) < 9;
      hint.style.opacity = near && !archway.open && !archway.animating ? '1' : '0';
    },
  };
}

/** Warm floating light-orbs along the street; replaced by instanced lanterns in fx/. */
function addStreetGlow(scene: THREE.Scene): number {
  const f = createFrame();
  const positions: THREE.Vector3[] = [];
  let side = 1;
  for (let s = 8; s < STREET.length; s += 11) {
    STREET.frame(s, f);
    const d = side * (STREET.widthAtS(s) / 2 - 0.7);
    positions.push(new THREE.Vector3(f.x + f.nx * d, f.y + 3.4, f.z + f.nz * d));
    side = -side;
  }
  const orbMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveIntensity: 2.5 });
  const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 12, 8), orbMat, positions.length);
  const m = new THREE.Matrix4();
  positions.forEach((p, i) => {
    orbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
    const light = new THREE.PointLight(0xffa860, 9, 15, 1.8);
    light.position.copy(p);
    scene.add(light);
  });
  orbs.name = 'glow-orbs (temporary)';
  orbs.computeBoundingSphere();
  scene.add(orbs);
  return positions.length;
}
