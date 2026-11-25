/**
 * Scene assembly for the alley: loads materials, lays the street, builds the
 * entry courtyard and side features, streetlamps, sky and the lighting rig.
 */
import * as THREE from 'three';
import type GUI from 'lil-gui';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createNightEnvironment, LoadingOverlay } from '../core';
import { MaterialLibrary, type MaterialId } from '../materials';
import { STREET } from '../architecture/street';
import { buildStreetSurface } from '../architecture/streetSurface';
import { buildEntryArchway, type EntryArchway } from '../architecture/entryArchway';
import { buildSideAlleys } from '../architecture/sideAlleys';
import { buildStoops } from '../architecture/stoops';
import { Kit, sanitizeNormals } from '../architecture/kit';
import { buildShops, planStreet } from '../shops/plan';
import { HERO_PLACEMENTS } from '../shops/heroes';
import { createChimneySmoke } from '../fx/chimneySmoke';
import { createMist } from '../fx/mist';
import { GRINGOTTS } from '../shops/gringotts';
import { buildForkTerraces } from '../architecture/forkTerraces';
import { scatterStreetClutter } from '../props/streetClutter';
import { createSteam } from '../fx/steam';
import { createSky } from '../fx/sky';
import { createAmbientMagic } from '../fx/ambientMagic';
import { createRain } from '../fx/rain';
import { buildStreetlamps } from '../props/streetlamps';
import { createLightingRig, type LightingRig } from '../core/lighting';
import type { PostFX } from '../core/postprocessing';
import { installExploration, type Exploration } from './interaction';

export interface AlleyContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  gui: GUI;
  post: PostFX;
}

export interface AlleyWorld {
  update(dt: number, elapsed: number): void;
  stats: Record<string, number>;
  archway: EntryArchway;
  /** Dev aid: when set, animators see this fixed time instead of the clock. */
  debugTime: number | null;
  /** Placed shops (side, s0, frontage, name). */
  shops: { name: string; side: string; s0: number; frontage: number }[];
  lighting: LightingRig;
  /** Walk / tour camera, wand, audio, overlay. */
  exploration: Exploration;
}

const MATERIALS: MaterialId[] = [
  'granite', 'grit', 'sandstone', 'brick', 'iron', 'oak', 'plaster', 'glass', 'brass', 'slate', 'slate-tile', 'copper', 'leather', 'velvet',
  'paint-oxblood', 'paint-charcoal', 'paint-indigo', 'paint-emerald', 'paint-ochre', 'paint-weasley', 'paint-magenta',
  'paint-violet', 'paint-teal', 'paint-mustard', 'paint-plum', 'paint-cream', 'marble', 'dragonhide',
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

  // ---- Gringotts at the fork, and the misty lanes beyond --------------------------
  overlay.set('Raising Gringotts…');
  await new Promise((r) => setTimeout(r, 0));
  const bank = GRINGOTTS.build({ kit });
  bank.group.matrixAutoUpdate = false;
  bank.group.matrix.copy(STREET.gringottsSite().matrix);
  scene.add(bank.group);
  const fork = buildForkTerraces(kit, STREET);
  scene.add(fork.group);
  const mist = createMist(fork.mist);
  scene.add(mist.object);
  Object.assign(stats, fork.stats);

  // ---- Victorian gas lamps along both curbs and round the plaza -----------------
  const lamps = buildStreetlamps(kit, STREET);
  scene.add(lamps.group);
  stats.streetlamps = lamps.mantles.length;

  // ---- Street clutter along curbs & stoops (needs stoops from shop doors) ---------
  const clutter = scatterStreetClutter(kit, STREET, lamps.sites);
  scene.add(clutter.group);
  const steam = createSteam(clutter.steam);
  scene.add(steam.object);
  Object.assign(stats, clutter.stats);

  scene.add(kit.instances.finalize(scene));

  // ---- Sky, rain, and the living magical layer --------------------------------------
  const sky = createSky();
  scene.add(sky.object);
  const rain = createRain();
  scene.add(rain.object);
  scene.updateMatrixWorld(true);
  // Motes gather round the gas mantles and the warm flames (braziers, lanterns).
  const lanterns: THREE.Vector3[] = [...lamps.mantles];
  scene.traverse((o) => {
    const l = o as THREE.PointLight;
    if (l.isPointLight && l.intensity > 0 && l.color.r > 0.8 && l.color.b < 0.6) lanterns.push(l.getWorldPosition(new THREE.Vector3()));
  });
  const magic = createAmbientMagic(STREET, lanterns);
  scene.add(magic.object);
  stats.lanternMotes = lanterns.length;

  // ---- Lighting rig: moon key, bounce, pooled point lights, presets ------------------
  const lighting = createLightingRig({
    scene, renderer, post: ctx.post, sky, rain,
    setLamps: (l) => lamps.setLevel(l),
    setWetness: (w) => surface.setWetness(w),
    mistColors: [mist.object.userData.color as THREE.Color],
    lightningTarget: new THREE.Vector3().setFromMatrixPosition(STREET.gringottsSite().matrix).add(new THREE.Vector3(0, 8, 0)),
  });
  lighting.pool.add(...lamps.sources);
  stats.pooledSources = lamps.sources.length + lighting.pool.adoptPointLights(scene);
  lighting.installGui(gui);

  const animators = [...shops.animators, ...kit.animators, ...(bank.animators ?? []), mist, ...clutter.animators, steam, sky, rain, magic, lamps];
  const smoke = createChimneySmoke(kit.smoke.map((e) => e.anchor.localToWorld(e.local.clone())));
  scene.add(smoke.object);
  Object.assign(stats, shops.stats, { stoops: STREET.stoops.length, smokeEmitters: kit.smoke.length });
  console.info('[alley] shops', shops.names.map((n) => `${n.side[0]} ${n.s0.toFixed(1)}+${n.frontage.toFixed(1)} ${n.name}`).join(' | '));

  // Backstop: no zero-length normals anywhere (NaN shading poisons bloom).
  let fixedNormals = 0;
  scene.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g) fixedNormals += sanitizeNormals(g); });
  if (fixedNormals) console.info(`[alley] sanitized ${fixedNormals} degenerate normals`);

  stats.buildMs = Math.round(performance.now() - t0);
  console.info('[alley] build stats', stats);
  overlay.done();

  const exploration = installExploration({
    renderer, scene, camera: ctx.camera, orbit: ctx.controls, layout: STREET, archway, kit, lamps,
    footprints: clutter.footprints, lighting, shops: shops.names,
  });
  const folder = gui.addFolder('Alley');
  folder.add({ toggleArch: () => archway.trigger() }, 'toggleArch').name('open / close archway');
  folder.close();
  gui.close();
  exploration.present();

  const world: AlleyWorld = {
    stats,
    archway,
    debugTime: null,
    shops: shops.names,
    lighting,
    exploration,
    update(dt, clock) {
      const elapsed = world.debugTime ?? clock;
      exploration.explorer.update(dt);
      surface.update(elapsed);
      for (const a of animators) a.update(dt, elapsed);
      const vh = renderer.getDrawingBufferSize(tmpSize).y;
      smoke.setViewport(vh, ctx.camera.fov);
      steam.setViewport(vh, ctx.camera.fov);
      magic.setViewport(vh, ctx.camera.fov);
      smoke.update(dt, elapsed);
      lighting.update(dt, elapsed, ctx.camera);
      surface.puddles.setRain(0.25 + 0.75 * lighting.current.rain);
      ctx.post.update(elapsed);
      archway.update(dt);
      exploration.update(dt, clock);
    },
  };
  return world;
}
