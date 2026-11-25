# Diagon Alley — Engineering Rules

Vite + TypeScript + Three.js. `npm run dev` to run, `npm run typecheck` before committing, `npm run build` for production.

## Architecture

| Folder | Responsibility |
|---|---|
| `src/core/` | Scene, renderer, camera, `controls.ts` (`ExplorerControls`: walk / tour / dev orbit), `overlay.ts` (title card, hint, crosshair, letterbox, toasts), `lighting.ts` (key/bounce rig, `LightPool`, atmosphere presets, lightning), `postprocessing.ts` (bloom + film pass), debug HUD, seeded random (`SeededRandom`) |
| `src/materials/` | Procedural PBR generator: recipes in `recipes/`, Web Worker pool, `MaterialLibrary`, world-UV helpers, `withBaseGrime` |
| `src/architecture/` | Street layout (`street.ts`), street surface, entry archway, side alleys, stoops; reusable kit in `kit/` (chamfered geometry, profile sweeps, `buildWall` with recessed openings, timber framing, `mergeStatic`) |
| `src/shops/` | Hero shops (one module each: `ollivanders.ts`, `flourishBlotts.ts`, `wiseacres.ts`, `weasleyWheezes.ts`, `gringotts.ts` + `gringottsDragon.ts`), procedural `fillers.ts`, slots in `heroes.ts`, placement + gap filling in `plan.ts` |
| `src/props/` | `displays.ts` (prop kinds, `fillDisplay` front risers, book towers, trunks), `dioramas.ts` (`dressWindow`: 1.5 m glowing window interiors + specials), `streetClutter.ts` (collision-aware pavement clutter, caged owls, weeds), `streetlamps.ts` (instanced cast-iron gas lamps, mantles, light cones) |
| `src/fx/` | Effects implementing `FxSystem`: `chimneySmoke.ts` (curl noise), `flame.ts` (brazier flames + flicker light), `mist.ts` (layered mist cards), `steam.ts` (cauldron steam), `sky.ts` (gradient sky dome: clouds, stars, moon/sun, lightning flash), `rain.ts` (GPU rain streaks), `wand.ts` (first-person wand, spell bolts, spark pool, fireworks), `ambientMagic.ts` (paper planes, notices, lantern motes, owl flock) |
| `src/audio/` | Procedural Web Audio: `AudioEngine` + `soundscape.ts` (crowd, wind, rain beds; spatial owls, creaks, footsteps, spell chimes, fireworks, thunder) |
| `src/world/` | Scene assembly (`alley.ts`), `interaction.ts` (wires explorer, wand targets, audio, overlay, keys), `walkArea.ts` (walkable corridors for collision + wand ray-marching), `tour.ts` (cinematic crane keyframes) |

### Materials

- Load once, then fetch synchronously: `await library.load([...ids])` → `library.get('brick')` (shared, cached material — clone before per-mesh tweaks).
- Each recipe outputs paired `map` (sRGB), `normalMap` (Sobel from height) and an ORM-packed `roughnessMap` (R = AO, G = roughness, B = metalness — wired to `roughnessMap`, `metalnessMap` and `aoMap`). Glass adds a `transmissionMap`.
- Textures are authored v-up and uploaded with `flipY = false`. Every recipe must stay tileable: only use periodic noise (`Noise` with integer frequencies) and never raw `u`/`v` gradients.
- Size UVs in metres with `projectWorldUVs` / `scaleUVsToWorld` using the recipe's `worldSize`, so texel density stays consistent.
- Height-dependent weathering (soot, rising damp) goes in world space via `withBaseGrime`, not in the tiling texture.
- Inspect with `?debug=materials` (temporary).

### Street layout

- `src/architecture/street.ts` is the single source of truth: `STREET` (a `StreetLayout`) owns the ~95 m S-curve, width profile (8.5 → 7 → 14 m), camber, puddle dips, reservations, stoop sites, lanes (Y-branches, Knockturn) and the Gringotts site.
- `t` is arc-length normalised; `side` is relative to walking from the archway (t = 0) toward Gringotts (t = 1).
- Place shops with `getStreetTransform(t, side, offset)` or, for a frontage span, `STREET.frontageTransform(side, s0, frontage)` (chord-aligned so the bounding box sits flush). Local origin = building line at ground level, +Z into the street, +X to the viewer's right.
- Check `STREET.isFrontageFree(side, s0, s1)` before placing — alcoves, Knockturn's mouth, the courtyard and Gringotts are reserved.
- Stoops follow doors: `shops/plan.ts` turns every shop door into a `STREET.stoops` site, so a shop's floor height (`floor`, multiples of 0.16 m) sets its step count.
- Courtyard archway: `ARCH_DURATION` = 3.5 s; click the wall or press E within 9 m.
- Gringotts is placed with `STREET.gringottsSite()` (not the shop planner): its portico and stairs step forward into the plaza, its wedge body runs back between the branch lanes. The lanes are lined by `architecture/forkTerraces.ts` (use `STREET.laneFrontageTransform`) and fade into `fx/mist.ts` cards.

### Lighting & post

- `core/lighting.ts` owns all scene lighting: moon/sun key `DirectionalLight` (shadow camera follows the view, texel-snapped), hemisphere bounce, a lightning light aimed at Gringotts, and the `LightPool`.
- **Point lights go through the pool.** It keeps a fixed 14 `PointLight`s (no shader recompiles) and assigns them to the nearest/in-frustum `LightSource`s with fades. Publish a `LightSource` (lamps do) or add a plain `PointLight` — `adoptPointLights` hides it and drives it through the pool. Never add always-on point lights outside it.
- Presets (`PRESETS`: Misty Blue Hour default, Golden Autumn Sunset, Midnight Storm) cross-fade sky, key, fog, exposure, bloom, lamp level, street wetness, rain and lightning. Add atmosphere state there, not ad hoc.
- Post: `RenderPass → UnrealBloomPass (threshold ≈ 1 in HDR, so only emitters bloom) → film pass (vignette, grain, chromatic aberration) → OutputPass`. Keep marble/plaster albedo below the bloom threshold.

### Exploration, wand & audio

- Navigation goes through `ExplorerControls` (`core/controls.ts`); `main.ts` must not call `OrbitControls.update()` once the alley exists (orbit is only the dev/idle mode, key O). Walk mode reads a `WalkArea`; tour mode plays `TourKey`s through damped springs.
- **Collision lives in `world/walkArea.ts`.** New walkable spaces (a lane, a courtyard, a staircase) must be added there; new pavement obstacles publish footprints (as `streetClutter` does) or posts (as `streetlamps` do).
- Wand interactions are `WandTarget`s in `world/interaction.ts`: return the nearest hit along the ray and do the effect in `apply()` (runs when the bolt arrives). Swinging signs register themselves in `kit.signs`; lamps expose `pick` / `toggle`.
- Glowing particles share the wand's one additive spark pool; transient lights (bolt, impact, fireworks) are `LightSource`s in the pool, never new `PointLight`s.
- Audio is synthesized only, starts from the title-card click (a user gesture), and is driven from world state (`setWeather` from the preset, `onStrike` thunder, footsteps from head-bob).
- The first-person viewmodel is a child of the camera, drawn in the transparent pass at `renderOrder` 1000 with depth test off.

### Building kit (`src/architecture/kit.ts`)

- Everything takes one `Kit` (materials cache, `InstanceCollector`, smoke emitters, animators). Use `kit.useRng(label)` per building for deterministic variety.
- Compose buildings as `planShopfront` (ground-floor openings) → `buildTownhouse` (jettied, leaning storeys + roof) → `sf.build(storeys[0])` → extras → `mergeStatic(house.group)`.
- Repeated small things (slates, chimney pots, books, jars, bulbs…) go through `kit.instances` relative to an anchor (usually a storey group) so they follow the lean and still batch street-wide; prop kinds live in `props/displays.ts`.
- Anything animated (signs, the Wheezes showman) must sit under an Object3D with `userData.keep = true` so `mergeStatic` / `mergeByCell` leave it dynamic, and expose an `Animator`.
- Every shop window goes through `dressWindow(kit, display, theme, rng, opts)` — never leave black glass. Upper-floor windows get room boxes via `WallMaterials.interior` (townhouses do this automatically).
- Interior "lamplight" is emissive (backdrop, lamp globes, additive light pools) — do not add point lights per shop; the forward renderer pays for every light on every pixel.
- Street clutter must respect the occupancy rules in `streetClutter.ts`: nothing on stoops/door margins, alley mouths or the carriageway.
- `plan.ts` batches all static shop geometry with `mergeByCell` (per material × 48 m cell); interiors, glass and lettering don't cast shadows.

All randomness goes through `SeededRandom` (use `rng.fork(label)` per subsystem) so the scene is deterministic.

## Non-negotiable rules

These apply to every future task. Do not violate them, even for "quick placeholders".

1. **No flat, untextured primitive boxes for architecture.** Every building must have recessed window frames, protruding sills, timber trims, cornices, and bevels. Build facades from the `src/architecture/` kit, not raw `BoxGeometry` walls.
2. **Zero external texture or audio URLs.** Generate all PBR maps (albedo, normal, roughness, emissive) procedurally via offscreen HTML5 Canvas with seeded noise (`src/materials/`). All audio is synthesized with Web Audio. The app must work 100% offline.
3. **Use `InstancedMesh` for repeated elements** — cobblestones, roof slates, bricks, lanterns, barrels, books, etc. — to maintain 60 FPS. Watch the HUD draw-call count.
4. **Every shop in its own dedicated module** (`src/shops/<name>.ts`, exporting a `ShopModule`) with clean bounding-box alignment to the street spline: local origin at front-centre ground level, +Z facing the street, `frontage` equal to its actual X extent.
5. **Renderer configuration is fixed:** `WebGLRenderer` with `ACESFilmicToneMapping`, soft PCF shadows (`PCFSoftShadowMap` was removed in three r180+; use `PCFShadowMap`, which is now the soft Vogel-disk filter, and tune softness with `light.shadow.radius`), pixel ratio capped at 2 (`Math.min(devicePixelRatio, 2)`), and the minimal debug HUD showing FPS and draw calls (`core/debugHud.ts`). Keep `OutputPass` as the final post-processing pass.
