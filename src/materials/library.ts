/**
 * MaterialLibrary — generates procedural PBR maps in a Web Worker pool and
 * builds cached three.js materials from them.
 *
 *   const lib = new MaterialLibrary({ anisotropy: renderer.capabilities.getMaxAnisotropy() });
 *   await lib.load(['brick', 'slate'], (done, total) => ...);
 *   mesh.material = lib.get('brick');
 *
 * Falls back to main-thread generation when workers/OffscreenCanvas are missing.
 */
import * as THREE from 'three';
import { RECIPES, MATERIAL_IDS, type MaterialId } from './recipes';
import { generateRawMaps, rawToCanvas, type MapName } from './texgen';
import type { WorkerRequest, WorkerResponse } from './texture.worker';
import type { TextureRecipe } from './recipes/types';

export interface PbrMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  /** ORM-packed: R = AO, G = roughness, B = metalness. */
  roughnessMap: THREE.Texture;
  transmissionMap?: THREE.Texture;
}

export interface LibraryOptions {
  seed?: string;
  anisotropy?: number;
  maxWorkers?: number;
}

type ImageSource = ImageBitmap | OffscreenCanvas | HTMLCanvasElement;

export class MaterialLibrary {
  readonly seed: string;
  private readonly anisotropy: number;
  private readonly maxWorkers: number;
  private readonly maps = new Map<MaterialId, PbrMaps>();
  private readonly materials = new Map<MaterialId, THREE.MeshStandardMaterial>();
  private readonly pending = new Map<MaterialId, Promise<void>>();
  /** Generation time per material (ms), for profiling. */
  readonly timings = new Map<MaterialId, number>();

  constructor(opts: LibraryOptions = {}) {
    this.seed = opts.seed ?? 'diagon-alley';
    this.anisotropy = opts.anisotropy ?? 8;
    this.maxWorkers = opts.maxWorkers ?? Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  }

  recipe(id: MaterialId): TextureRecipe {
    return RECIPES[id];
  }

  isLoaded(id: MaterialId): boolean {
    return this.maps.has(id);
  }

  /** Generate (in parallel) every requested material not already loaded. */
  async load(ids: readonly MaterialId[] = MATERIAL_IDS, onProgress?: (done: number, total: number) => void): Promise<void> {
    const todo = [...new Set(ids)].filter((id) => !this.maps.has(id) && !this.pending.has(id));
    const waiting = ids.filter((id) => this.pending.has(id)).map((id) => this.pending.get(id)!);
    let done = 0;
    const total = todo.length;
    onProgress?.(0, total);
    const tick = () => onProgress?.(++done, total);

    const canUseWorkers = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
    const jobs = canUseWorkers ? this.runInWorkers(todo, tick) : this.runOnMainThread(todo, tick);
    await Promise.all([jobs, ...waiting]);
  }

  private runInWorkers(ids: MaterialId[], tick: () => void): Promise<void> {
    if (ids.length === 0) return Promise.resolve();
    // Largest textures first for better packing across workers.
    const queue = [...ids].sort((a, b) => RECIPES[b].size - RECIPES[a].size);
    const workerCount = Math.min(this.maxWorkers, queue.length);
    let jobId = 0;

    const all = new Promise<void>((resolveAll, rejectAll) => {
      let active = workerCount;
      for (let w = 0; w < workerCount; w++) {
        const worker = new Worker(new URL('./texture.worker.ts', import.meta.url), { type: 'module' });
        const next = () => {
          const id = queue.shift();
          if (!id) {
            worker.terminate();
            if (--active === 0) resolveAll();
            return;
          }
          const req: WorkerRequest = { jobId: jobId++, id, seed: this.seed };
          worker.postMessage(req);
        };
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const { id, bitmaps, ms } = e.data;
          this.timings.set(id, ms);
          this.storeMaps(id, bitmaps);
          tick();
          next();
        };
        worker.onerror = (e) => {
          worker.terminate();
          rejectAll(new Error(`Texture worker failed: ${e.message}`));
        };
        next();
      }
    });
    for (const id of ids) this.pending.set(id, all);
    return all.finally(() => ids.forEach((id) => this.pending.delete(id)));
  }

  private async runOnMainThread(ids: MaterialId[], tick: () => void): Promise<void> {
    for (const id of ids) {
      const raw = generateRawMaps(RECIPES[id], this.seed);
      this.timings.set(id, raw.ms);
      this.storeMaps(id, {
        albedo: rawToCanvas(raw.albedo, raw.size),
        normal: rawToCanvas(raw.normal, raw.size),
        orm: rawToCanvas(raw.orm, raw.size),
        transmission: raw.transmission && rawToCanvas(raw.transmission, raw.size),
      });
      tick();
      await new Promise((r) => setTimeout(r, 0)); // keep UI responsive
    }
  }

  private makeTexture(image: ImageSource, srgb: boolean): THREE.Texture {
    const tex = new THREE.Texture(image as unknown as HTMLImageElement);
    tex.flipY = false; // data is authored v-up
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = this.anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  private storeMaps(id: MaterialId, images: Partial<Record<MapName, ImageSource>>): void {
    const maps: PbrMaps = {
      map: this.makeTexture(images.albedo!, true),
      normalMap: this.makeTexture(images.normal!, false),
      roughnessMap: this.makeTexture(images.orm!, false),
    };
    if (images.transmission) maps.transmissionMap = this.makeTexture(images.transmission, false);
    for (const t of Object.values(maps) as THREE.Texture[]) t.name = `${id}`;
    this.maps.set(id, maps);
  }

  getMaps(id: MaterialId): PbrMaps {
    const m = this.maps.get(id);
    if (!m) throw new Error(`Material "${id}" not loaded — await library.load(['${id}']) first`);
    return m;
  }

  /** Shared, cached material. Clone it before per-mesh tweaks. */
  get(id: MaterialId): THREE.MeshStandardMaterial {
    const cached = this.materials.get(id);
    if (cached) return cached;
    const maps = this.getMaps(id);
    const p = RECIPES[id].material;
    const common: THREE.MeshPhysicalMaterialParameters = {
      map: maps.map,
      normalMap: maps.normalMap,
      roughnessMap: maps.roughnessMap,
      metalnessMap: maps.roughnessMap,
      aoMap: maps.roughnessMap,
      aoMapIntensity: p.aoIntensity ?? 1,
      roughness: 1,
      metalness: 1,
      side: p.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    };
    let mat: THREE.MeshStandardMaterial;
    if (p.type === 'physical') {
      mat = new THREE.MeshPhysicalMaterial({
        ...common,
        clearcoat: p.clearcoat ?? 0,
        clearcoatRoughness: p.clearcoatRoughness ?? 0,
        ior: p.ior ?? 1.5,
        thickness: p.thickness ?? 0,
        transmission: p.transmission ? 1 : 0,
        transmissionMap: maps.transmissionMap ?? null,
        sheen: p.sheen ?? 0,
        sheenRoughness: p.sheenRoughness ?? 0.5,
        sheenColor: p.sheenColor ? new THREE.Color(...p.sheenColor) : new THREE.Color(0, 0, 0),
      });
    } else {
      mat = new THREE.MeshStandardMaterial(common);
    }
    mat.name = id;
    this.materials.set(id, mat);
    return mat;
  }

  dispose(): void {
    for (const m of this.maps.values()) for (const t of Object.values(m) as THREE.Texture[]) t.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.maps.clear();
    this.materials.clear();
  }
}
