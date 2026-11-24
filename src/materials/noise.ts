/**
 * Seeded, tileable noise primitives. Every function is periodic over the unit
 * square when called with integer frequencies / cell counts, so textures wrap
 * seamlessly with RepeatWrapping. Pure math — safe in Web Workers.
 */

const GX = [1, -1, 1, -1, 1, -1, 0, 0];
const GY = [1, 1, -1, -1, 0, 0, 1, -1];

/** Integer hash of a 2D lattice point + seed → uint32. */
export function hashInt(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Hash → [0, 1). */
export function hash01(x: number, y: number, seed: number): number {
  return hashInt(x, y, seed) / 4294967296;
}

/** Positive modulo for lattice wrapping. */
export function wrap(i: number, p: number): number {
  const r = i % p;
  return r < 0 ? r + p : r;
}

/** Shortest signed toroidal delta on the unit interval. */
export function wrapDelta(d: number): number {
  return d - Math.round(d);
}

export interface WorleySample {
  /** Distance to nearest feature point (cell units). */
  f1: number;
  /** Distance to second-nearest feature point. */
  f2: number;
  /** Stable hash id of the nearest cell (wrapped). */
  id: number;
  /** Vector from sample to nearest feature point (cell units). */
  dx: number;
  dy: number;
}

export function createWorleySample(): WorleySample {
  return { f1: 0, f2: 0, id: 0, dx: 0, dy: 0 };
}

export class Noise {
  constructor(readonly seed: number) {}

  /** Tileable gradient (Perlin) noise ≈ [-1, 1]; periods px, py must be integers. */
  perlin(x: number, y: number, px: number, py: number): number {
    const xf = Math.floor(x), yf = Math.floor(y);
    const fx = x - xf, fy = y - yf;
    const x0 = wrap(xf, px), y0 = wrap(yf, py);
    const x1 = x0 + 1 === px ? 0 : x0 + 1;
    const y1 = y0 + 1 === py ? 0 : y0 + 1;
    const s = this.seed;
    const g00 = hashInt(x0, y0, s) & 7, g10 = hashInt(x1, y0, s) & 7;
    const g01 = hashInt(x0, y1, s) & 7, g11 = hashInt(x1, y1, s) & 7;
    const n00 = GX[g00] * fx + GY[g00] * fy;
    const n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
    const n01 = GX[g01] * fx + GY[g01] * (fy - 1);
    const n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = n00 + (n10 - n00) * u;
    const b = n01 + (n11 - n01) * u;
    return a + (b - a) * v;
  }

  /** Fractal sum over tile space u,v ∈ [0,1); ≈ [-1, 1], std ≈ 0.25. */
  fbm(u: number, v: number, freq: number, octaves: number, gain = 0.5): number {
    let amp = 1, sum = 0, norm = 0, f = freq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.perlin(u * f, v * f, f, f);
      norm += amp;
      amp *= gain;
      f *= 2;
    }
    return sum / norm;
  }

  /** fbm remapped to ≈ [0, 1] (mean 0.5). */
  fbm01(u: number, v: number, freq: number, octaves: number, gain = 0.5): number {
    return 0.5 + 0.5 * this.fbm(u, v, freq, octaves, gain);
  }

  /** Anisotropic fbm with separate integer x/y frequencies (wood grain, streaks). */
  fbmAniso(u: number, v: number, fx: number, fy: number, octaves: number, gain = 0.5): number {
    let amp = 1, sum = 0, norm = 0, ax = fx, ay = fy;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.perlin(u * ax, v * ay, ax, ay);
      norm += amp;
      amp *= gain;
      ax *= 2;
      ay *= 2;
    }
    return sum / norm;
  }

  /**
   * Tileable Worley / cellular noise on an nx × ny jittered grid.
   * Writes into `out` to avoid per-pixel allocation.
   */
  worley(u: number, v: number, nx: number, ny: number, jitter: number, out: WorleySample): WorleySample {
    const x = u * nx, y = v * ny;
    const ix = Math.floor(x), iy = Math.floor(y);
    let f1 = 1e9, f2 = 1e9;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = ix + ox, cy = iy + oy;
        const h = hashInt(wrap(cx, nx), wrap(cy, ny), this.seed);
        const px = cx + 0.5 + ((h & 0xffff) / 65535 - 0.5) * jitter;
        const py = cy + 0.5 + ((h >>> 16) / 65535 - 0.5) * jitter;
        const dx = px - x, dy = py - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          out.id = h;
          out.dx = dx;
          out.dy = dy;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
    out.f1 = f1;
    out.f2 = f2;
    return out;
  }
}
