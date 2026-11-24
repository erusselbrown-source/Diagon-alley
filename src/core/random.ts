/**
 * Deterministic seeded randomness. Every procedural system (textures, layout,
 * props, audio) must draw from a SeededRandom so the alley is reproducible.
 */

/** Hash a string to a 32-bit seed (FNV-1a). */
export function hashSeed(input: string | number): number {
  const s = String(input);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — fast, good-enough distribution for procedural content. */
export class SeededRandom {
  private state: number;

  constructor(seed: string | number = 1) {
    this.state = hashSeed(seed) || 1;
  }

  /** Float in [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  /** Approximately normal via Box–Muller. */
  gaussian(mean = 0, std = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /** Derive an independent child stream (e.g. one per shop). */
  fork(label: string | number): SeededRandom {
    return new SeededRandom(`${this.state}:${label}`);
  }
}
