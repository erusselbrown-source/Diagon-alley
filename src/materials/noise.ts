import { SeededRandom } from '../core/random';

/**
 * Seeded, tileable 2D value noise + fBm. Tileable so canvas textures wrap
 * seamlessly with RepeatWrapping.
 */
export class TileableNoise {
  private readonly perm: Uint8Array;
  private readonly values: Float32Array;

  constructor(seed: string | number) {
    const rng = new SeededRandom(seed);
    this.values = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.values[i] = rng.next();
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private lattice(x: number, y: number, period: number): number {
    const xi = ((x % period) + period) % period;
    const yi = ((y % period) + period) % period;
    return this.values[this.perm[(this.perm[xi & 255] + yi) & 511]];
  }

  /** Value noise in [0,1], tiling every `period` units. */
  value(x: number, y: number, period: number): number {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = this.lattice(x0, y0, period);
    const b = this.lattice(x0 + 1, y0, period);
    const c = this.lattice(x0, y0 + 1, period);
    const d = this.lattice(x0 + 1, y0 + 1, period);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  /** Fractal Brownian motion over u,v in [0,1); tiles at the texture edge. */
  fbm(u: number, v: number, baseFreq = 4, octaves = 5, gain = 0.5): number {
    let amp = 1, sum = 0, norm = 0, freq = baseFreq;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.value(u * freq, v * freq, freq);
      norm += amp;
      amp *= gain;
      freq *= 2;
    }
    return sum / norm;
  }
}
