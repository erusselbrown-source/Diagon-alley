/**
 * Exploration, magic and sound, wired to the built alley:
 *  - ExplorerControls (walk / tour / dev orbit) over the street's WalkArea
 *  - the wand and its targets (archway bricks, streetlamps, hanging signs,
 *    Weasleys' Wizard Wheezes, any other surface)
 *  - the procedural Soundscape (started from the title card's click)
 *  - the overlay (title card, hint, crosshair, letterbox, toasts)
 *  - keys: C tour, 1/2/3 weather, M mute, E archway (nearby), O dev orbit
 */
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ExplorerControls } from '../core/controls';
import { Overlay } from '../core/overlay';
import { IS_TOUCH } from '../core/device';
import { TouchControls } from '../core/touchControls';
import { PRESETS, type LightingRig, type PresetName } from '../core/lighting';
import { createWand, type Wand, type WandHit, type WandTarget } from '../fx/wand';
import { Soundscape } from '../audio/soundscape';
import { ARCH_DURATION, type EntryArchway } from '../architecture/entryArchway';
import type { Kit } from '../architecture/kit';
import type { StreetLayout, Side } from '../architecture/street';
import type { Streetlamps } from '../props/streetlamps';
import type { ClutterFootprint } from '../props/streetClutter';
import { createWalkArea } from './walkArea';
import { buildTour } from './tour';
import type { BuiltShops } from '../shops/plan';
import type { Interactable, InteractionFx } from '../shops/interior';

export interface ExplorationDeps {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  orbit: OrbitControls;
  layout: StreetLayout;
  archway: EntryArchway;
  kit: Kit;
  lamps: Streetlamps;
  footprints: readonly ClutterFootprint[];
  lighting: LightingRig;
  shops: { name: string; side: Side; s0: number; frontage: number }[];
  /** Walk-in shop interiors (placed). */
  interiors?: BuiltShops['interiors'];
}

export interface Exploration {
  deps: ExplorationDeps;
  explorer: ExplorerControls;
  wand: Wand;
  audio: Soundscape;
  overlay: Overlay;
  /** Show the title card (call once the world is built). */
  present(): void;
  /** Dismiss the title card as if clicked (dev / tests). */
  enter(): void;
  /** Cast from the screen centre (dev / tests). */
  castCentre(): WandHit | null;
  update(dt: number, elapsed: number): void;
}

export function installExploration(d: ExplorationDeps): Exploration {
  const { renderer, scene, camera, layout, archway, kit, lamps, lighting } = d;
  const L = layout;
  const gMatrix = L.gringottsSite().matrix;
  // Walk-in interiors: door state per shop (0 shut … 1 wide open)
  const shopsIn = (d.interiors ?? []).map((s) => ({ ...s, door: 0, doorTarget: 0, visible: true, centre: new THREE.Vector3(0, 2, -4.5).applyMatrix4(s.matrix), doorWorld: s.interior.door.center.clone().applyMatrix4(s.matrix) }));
  const area = createWalkArea({
    layout: L, archway, gringotts: gMatrix, footprints: d.footprints, posts: lamps.posts,
    rooms: shopsIn.map((s) => ({ matrix: s.matrix, spec: s.interior.room, doorOpen: () => s.door > 0.7 })),
  });
  const explorer = new ExplorerControls({ camera, dom: renderer.domElement, orbit: d.orbit, area });
  const overlay = new Overlay(IS_TOUCH);
  const audio = new Soundscape();
  let entered = false;
  let lockFailed = IS_TOUCH; // no pointer lock on phones: taps cast directly
  document.addEventListener('pointerlockerror', () => { lockFailed = true; });

  // Archway: every trigger gets its brick cascade sound.
  const trig = archway.trigger.bind(archway);
  archway.trigger = (p?: THREE.Vector3) => {
    const wasAnimating = archway.animating;
    trig(p);
    if (!wasAnimating) audio.bricks(archway.center, ARCH_DURATION);
  };

  // ---- Wand targets ------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const find = (n: string) => d.shops.find((s) => s.name.toLowerCase().includes(n));
  const mid = (s?: { s0: number; frontage: number }) => (s ? s.s0 + s.frontage / 2 : 0);
  const olli = find('ollivander'), wheezes = find('wheezes');
  const wheezesBox = wheezes ? (() => {
    const m = L.frontageTransform(wheezes.side, wheezes.s0, wheezes.frontage).matrix;
    return { inv: m.clone().invert(), m, box: new THREE.Box3(new THREE.Vector3(-wheezes.frontage / 2, 0, -0.35), new THREE.Vector3(wheezes.frontage / 2, 15, 1.4)) };
  })() : null;

  const targets: WandTarget[] = [
    { // the courtyard wall
      test(ray, max) {
        raycaster.ray.copy(ray); raycaster.far = max;
        const h = raycaster.intersectObject(archway.bricks, false)[0];
        return h ? { kind: 'archway', distance: h.distance, point: h.point.clone(), apply: () => archway.trigger(h.point) } : null;
      },
    },
    { // streetlamps: Lumos / Nox
      test(ray, max) {
        const h = lamps.pick(ray, max);
        if (!h) return null;
        return {
          kind: 'lamp', distance: h.distance, point: lamps.mantles[h.index].clone(),
          apply: () => {
            const on = lamps.toggle(h.index);
            audio.lumos(lamps.mantles[h.index], on);
            overlay.toast(on ? 'Lumos' : 'Nox', on ? 'rgba(255,200,120,0.8)' : 'rgba(140,170,255,0.7)');
          },
        };
      },
    },
    { // hanging signs: a physical push
      test(ray, max) {
        raycaster.ray.copy(ray); raycaster.far = max;
        const h = raycaster.intersectObjects(kit.signs.map((s) => s.pivot), true)[0];
        if (!h) return null;
        let o: THREE.Object3D | null = h.object;
        while (o && !o.userData.sign) o = o.parent;
        const sign = o?.userData.sign as Kit['signs'][number] | undefined;
        if (!sign) return null;
        return {
          kind: 'sign', distance: h.distance, point: h.point.clone(),
          apply: () => {
            // push away from the caster about the arm's axis
            const axis = new THREE.Vector3(1, 0, 0).transformDirection(sign.pivot.matrixWorld);
            sign.kick(-Math.sign(axis.dot(ray.direction) || 1) * 3.2);
            audio.creak(h.point, 1.4);
          },
        };
      },
    },
    { // Weasleys' Wizard Wheezes: fireworks above the shop
      test(ray, max) {
        if (!wheezesBox || (area.roomAt?.(ray.origin.x, ray.origin.z) ?? -1) >= 0) return null;
        // the open doorway leads inside rather than setting off fireworks
        const local = ray.clone().applyMatrix4(wheezesBox.inv);
        const p = local.intersectBox(wheezesBox.box, new THREE.Vector3());
        if (!p) return null;
        if (Math.abs(p.x) < 0.8 && p.y < 2.6 && (shopsIn[0]?.door ?? 0) > 0.5) return null;
        const dist = local.origin.distanceTo(p);
        if (dist > max) return null;
        const world = p.applyMatrix4(wheezesBox.m);
        return {
          kind: 'wheezes', distance: dist, point: world,
          apply: () => {
            wand.fireworks(new THREE.Vector3(0, 12.5, -2.5).applyMatrix4(wheezesBox.m), 6);
            overlay.toast('Weasleys’ Wildfire Whiz-bangs!', 'rgba(255,120,200,0.8)');
          },
        };
      },
    },
    { // anything else: ray-march the walkable space (not walkable below the roofline = a wall)
      test(ray, max) {
        const q = new THREE.Vector3();
        let prev = ray.at(0.3, new THREE.Vector3());
        for (let t = 0.5; t < max; t += 0.25) {
          ray.at(t, q);
          if (q.y > 18) { if (ray.direction.y > 0) return null; continue; }
          const g = area.sample(q.x, q.z, 0, true);
          const ceil = area.ceilingAt?.(q.x, q.z) ?? null;
          if ((g === null && q.y < 16) || (g !== null && q.y < g) || (ceil !== null && q.y > ceil)) {
            const point = prev.clone().lerp(q, 0.5);
            return { kind: 'surface', distance: t - 0.12, point };
          }
          prev.copy(q);
        }
        return null;
      },
    },
  ];

  const oak = kit.mats.get('oak');
  const wood = new THREE.MeshStandardMaterial({
    color: 0x8a5a38, map: oak.map, normalMap: oak.normalMap, normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.42, metalness: 0, emissive: 0x3a2414, envMapIntensity: 2.2, fog: false,
  });
  const wand = createWand({ wood, targets });
  scene.add(wand.object);
  scene.add(camera);
  camera.add(wand.viewmodel);
  lighting.pool.add(...wand.sources);

  // ---- Shop interiors: lights, wand interactions, collectibles ------------------------
  let ducksFound = 0;
  const ducksTotal = shopsIn.reduce((a, s) => a + s.interior.collectibles, 0);
  const found = new Set<string>();
  const fx: InteractionFx = {
    sound: (name, at) => audio.play(name, at),
    toast: (text, color) => overlay.toast(text, color),
    sparkle: (at, colors, count, speed) => wand.burst(at, colors, count, speed),
    darkness: (s) => overlay.darkness(s),
    collect(id, at) {
      if (found.has(id)) return;
      found.add(id);
      ducksFound++;
      overlay.setCounter(`★ Golden Ducks ${ducksFound} / ${ducksTotal}`);
      if (ducksFound < ducksTotal) {
        audio.play('chime', at);
        overlay.toast(`A Golden Duck! (${ducksFound} of ${ducksTotal})`, 'rgba(255,198,64,0.9)');
      } else {
        audio.play('fanfare', at);
        overlay.toast('All seven Golden Ducks! You’d make a fine prankster.', 'rgba(255,198,64,0.95)');
        wand.burst(at.clone().add(new THREE.Vector3(0, 0.6, 0)), [new THREE.Color(0xffc640), new THREE.Color(0xff4fd0), new THREE.Color(0x7af0c0)], 220, 3.2);
        if (wheezesBox) wand.fireworks(new THREE.Vector3(0, 12.5, -2.5).applyMatrix4(wheezesBox.m), 10);
      }
    },
    music: () => audio.toggleMusic(),
  };
  for (const s of shopsIn) {
    const it = s.interior;
    for (const l of it.lights) lighting.pool.add({ ...l, position: l.position.clone().applyMatrix4(s.matrix) });
    if (it.musicAt) audio.setMusicSource(it.musicAt.clone().applyMatrix4(s.matrix));
    const owner = new Map<THREE.Object3D, Interactable>();
    for (const x of it.interactables) owner.set(x.object, x);
    const objects = it.interactables.map((x) => x.object);
    targets.unshift({
      test(ray, max) {
        if (!s.visible) return null;
        raycaster.ray.copy(ray); raycaster.far = max;
        const shown = (o: THREE.Object3D | null): boolean => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
        const h = raycaster.intersectObjects(objects, true).find((hh) => shown(hh.object));
        if (!h) return null;
        let o: THREE.Object3D | null = h.object;
        while (o && !owner.has(o)) o = o.parent;
        const x = o ? owner.get(o)! : null;
        if (!x) return null;
        return { kind: 'interior', distance: h.distance, point: h.point.clone(), apply: () => x.activate(fx, h.point) };
      },
    });
  }

  wand.events.onCast = () => audio.cast();
  wand.events.onImpact = (h) => { if (h.kind !== 'lamp') audio.impact(h.point); };
  wand.events.onFireworkLaunch = (p) => audio.fireworkLaunch(p);
  wand.events.onFireworkBurst = (p, big) => audio.fireworkBurst(p, big);
  wand.events.onCrackle = (p) => audio.crackle(p);
  lighting.onStrike = () => audio.thunder();
  explorer.onStep = (_p, speed) => audio.footstep(speed);

  // ---- Modes -----------------------------------------------------------------------
  explorer.onModeChange = (m) => {
    touch?.setTouring(m === 'tour');
    wand.showViewmodel(m === 'walk');
    overlay.setWalking(m === 'walk');
    overlay.setLetterbox(m === 'tour');
    if (m === 'walk') overlay.setPaused(entered && !explorer.locked && !lockFailed);
    else overlay.setPaused(false);
  };
  explorer.onLockChange = (locked) => { if (explorer.mode === 'walk') overlay.setPaused(!locked); };

  const tour = () => buildTour(L, archway, { ollivanders: mid(olli), wheezes: mid(wheezes), gringotts: gMatrix });
  const toggleTour = () => {
    if (explorer.mode === 'tour') explorer.setMode('walk');
    else { explorer.exitLock(); explorer.startTour(tour()); }
  };

  const weatherNames = Object.keys(PRESETS) as PresetName[];
  const setWeather = (name: PresetName) => { lighting.setPreset(name); overlay.toast(name, 'rgba(243,220,178,0.6)'); };
  const toggleMute = () => { audio.setMuted(!audio.isMuted); overlay.toast(audio.isMuted ? 'Sound off' : 'Sound on', 'rgba(243,220,178,0.6)'); return audio.isMuted; };

  // ---- Touch (iPhone / iPad) -----------------------------------------------------------
  const touch = IS_TOUCH ? new TouchControls(explorer.stick, {
    onLook: (dx, dy) => explorer.addLook(dx, dy),
    onTap: (x, y) => {
      if (explorer.mode !== 'walk') return;
      const r = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      wand.cast(raycaster.ray.clone());
    },
    onTour: () => toggleTour(),
    onWeather: () => setWeather(weatherNames[(weatherNames.indexOf(lighting.preset) + 1) % weatherNames.length]),
    onMute: toggleMute,
  }) : null;

  const centreRay = () => { raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); return raycaster.ray.clone(); };

  // ---- Input -------------------------------------------------------------------------
  const el = renderer.domElement;
  let down: { x: number; y: number } | null = null;
  el.addEventListener('pointerdown', (e) => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', (e) => {
    if (!entered || e.button !== 0 || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || explorer.wasDrag;
    down = null;
    if (moved && !explorer.locked) return; // a drag-look, not a click
    if (explorer.mode === 'walk') {
      if (!explorer.locked && !lockFailed) { explorer.requestLock(); return; }
      wand.cast(centreRay());
    } else if (explorer.mode === 'orbit') {
      const r = el.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      wand.cast(raycaster.ray.clone(), false);
    }
  });
  window.addEventListener('keydown', (e) => {
    if (!entered || e.repeat || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'c') toggleTour();
    else if (k === 'm') toggleMute();
    else if (k === 'e' && camera.position.distanceTo(archway.center) < 9) archway.trigger();
    else if (k === 'o') explorer.setMode(explorer.mode === 'orbit' ? 'walk' : 'orbit');
    else if (k === '1' || k === '2' || k === '3') {
      setWeather(weatherNames[+k - 1]);
    }
  });

  // Archway prompt
  const prompt = document.createElement('div');
  Object.assign(prompt.style, {
    position: 'fixed', left: '50%', bottom: IS_TOUCH ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)' : '74px', transform: 'translateX(-50%)', zIndex: '10', textAlign: 'center',
    font: `italic 14px 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif`, letterSpacing: '0.05em', color: '#f3dcb2',
    textShadow: '0 1px 4px rgba(0,0,0,0.9)', pointerEvents: 'none', transition: 'opacity 0.6s', opacity: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  prompt.textContent = IS_TOUCH ? 'Tap the bricks to open the way' : 'Cast a spell at the bricks — or press E — to open the way';
  document.body.appendChild(prompt);

  let weatherT = 0;
  let enterFn: (() => void) | null = null;
  return {
    deps: d, explorer, wand, audio, overlay,
    enter() { enterFn?.(); },
    present() {
      enterFn = overlay.showTitle(() => {
        entered = true;
        void audio.start();
        explorer.setMode('walk');
        if (IS_TOUCH) touch!.setEnabled(true);
        else explorer.requestLock();
      });
    },
    castCentre: () => wand.cast(centreRay()),
    update(dt, elapsed) {
      const vh = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
      wand.setViewport(vh, camera.fov);
      wand.update(dt, elapsed, camera);
      const near = camera.position.distanceTo(archway.center) < 9;
      prompt.style.opacity = entered && explorer.mode !== 'tour' && near && !archway.open && !archway.animating ? '1' : '0';
      weatherT -= dt;
      if (weatherT <= 0) {
        weatherT = 0.25;
        const A = lighting.current;
        audio.setWeather({ rain: A.rain, wind: 0.35 + 0.65 * A.rain, crowd: 1 - 0.4 * A.rain, wetness: A.wetness });
      }
      // Shop interiors: show when near, swing the doors, muffle the street indoors
      const feet = camera.position;
      const inRoom = area.roomAt?.(feet.x, feet.z) ?? -1;
      shopsIn.forEach((s, i) => {
        const near = inRoom === i || feet.distanceTo(s.centre) < 30;
        if (near !== s.visible) { s.visible = near; s.interior.group.visible = near; }
        if (near) {
          for (const a of s.interior.animators) a.update(dt, elapsed);
          s.interior.look?.(camera);
        }
        const dx = feet.x - s.doorWorld.x, dz = feet.z - s.doorWorld.z;
        const want = explorer.mode !== 'tour' && Math.hypot(dx, dz) < 2.9 ? 1 : 0;
        if (want && !s.doorTarget) audio.play('jingle', s.doorWorld.clone().add(new THREE.Vector3(0, 2.3, 0)));
        s.doorTarget = want;
        s.door += (want - s.door) * (1 - Math.exp(-dt * (want ? 3.2 : 2.2)));
        const e = s.door * s.door * (3 - 2 * s.door);
        const [lft, rgt] = s.interior.door.leaves;
        if (lft) lft.rotation.y = 1.35 * e;
        if (rgt) rgt.rotation.y = -1.35 * e;
      });
      audio.setIndoors(inRoom >= 0 ? 1 : 0);
      audio.update(dt, camera, kit.signs);
    },
  };
}
