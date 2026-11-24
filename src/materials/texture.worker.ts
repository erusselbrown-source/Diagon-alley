/// <reference lib="webworker" />
import { RECIPES, type MaterialId } from './recipes';
import { generateRawMaps, rawToCanvas, type MapName } from './texgen';

export interface WorkerRequest { jobId: number; id: MaterialId; seed: string }
export interface WorkerResponse {
  jobId: number;
  id: MaterialId;
  ms: number;
  bitmaps: Partial<Record<MapName, ImageBitmap>>;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { jobId, id, seed } = e.data;
  const raw = generateRawMaps(RECIPES[id], seed);
  const bitmaps: Partial<Record<MapName, ImageBitmap>> = {};
  const toBitmap = (d: Uint8ClampedArray<ArrayBuffer>) =>
    (rawToCanvas(d, raw.size) as OffscreenCanvas).transferToImageBitmap();
  bitmaps.albedo = toBitmap(raw.albedo);
  bitmaps.normal = toBitmap(raw.normal);
  bitmaps.orm = toBitmap(raw.orm);
  if (raw.transmission) bitmaps.transmission = toBitmap(raw.transmission);
  const res: WorkerResponse = { jobId, id, ms: raw.ms, bitmaps };
  (self as unknown as Worker).postMessage(res, Object.values(bitmaps));
};
