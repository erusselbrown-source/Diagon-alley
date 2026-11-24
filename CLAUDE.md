# Diagon Alley — Engineering Rules

Vite + TypeScript + Three.js. `npm run dev` to run, `npm run typecheck` before committing, `npm run build` for production.

## Architecture

| Folder | Responsibility |
|---|---|
| `src/core/` | Scene, renderer, camera, post-processing, debug HUD, seeded random (`SeededRandom`) |
| `src/materials/` | Procedural PBR texture & material factory (canvas + seeded noise) |
| `src/architecture/` | Reusable Tudor/Victorian kit: moldings, windows, timber, roofs, ironwork |
| `src/shops/` | Bespoke hero buildings — one module per shop, registered in `shops/index.ts` |
| `src/props/` | Instanced street clutter & shop displays |
| `src/fx/` | Volumetric fog, particles, lanterns, magic effects (`FxSystem` interface) |
| `src/audio/` | Procedural Web Audio soundscapes (`AudioEngine`) |

All randomness goes through `SeededRandom` (use `rng.fork(label)` per subsystem) so the scene is deterministic.

## Non-negotiable rules

These apply to every future task. Do not violate them, even for "quick placeholders".

1. **No flat, untextured primitive boxes for architecture.** Every building must have recessed window frames, protruding sills, timber trims, cornices, and bevels. Build facades from the `src/architecture/` kit, not raw `BoxGeometry` walls.
2. **Zero external texture or audio URLs.** Generate all PBR maps (albedo, normal, roughness, emissive) procedurally via offscreen HTML5 Canvas with seeded noise (`src/materials/`). All audio is synthesized with Web Audio. The app must work 100% offline.
3. **Use `InstancedMesh` for repeated elements** — cobblestones, roof slates, bricks, lanterns, barrels, books, etc. — to maintain 60 FPS. Watch the HUD draw-call count.
4. **Every shop in its own dedicated module** (`src/shops/<name>.ts`, exporting a `ShopModule`) with clean bounding-box alignment to the street spline: local origin at front-centre ground level, +Z facing the street, `frontage` equal to its actual X extent.
5. **Renderer configuration is fixed:** `WebGLRenderer` with `ACESFilmicToneMapping`, soft PCF shadows (`PCFSoftShadowMap` was removed in three r180+; use `PCFShadowMap`, which is now the soft Vogel-disk filter, and tune softness with `light.shadow.radius`), pixel ratio capped at 2 (`Math.min(devicePixelRatio, 2)`), and the minimal debug HUD showing FPS and draw calls (`core/debugHud.ts`). Keep `OutputPass` as the final post-processing pass.
