import { createWorleySample, hashInt, wrap } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, mulRGB, sdRoundBox, setRGB, smoothstep, type RGB } from './util';

/**
 * Wet Victorian granite setts: irregular rectangular stones in staggered
 * courses, dark gritty joints, puddles that flatten into mirror-smooth water,
 * rain-slicked dips and rougher dry crowns.
 */
export const cobblestone: TextureRecipe = {
  id: 'cobblestone',
  label: 'Wet Victorian cobblestones',
  size: 1024,
  worldSize: 1.2,
  depth: 0.04 / 1.2,
  ao: { radius: 0.008, strength: 3 },
  material: { type: 'standard' },
  setup({ rng, seed, noise, px }) {
    const ROWS = 10;
    const rows = Array.from({ length: ROWS }, () => {
      const n = rng.int(5, 6);
      const w = Array.from({ length: n }, () => rng.range(0.75, 1.25));
      const sum = w.reduce((a, b) => a + b, 0);
      const bounds = [0];
      for (const x of w) bounds.push(bounds[bounds.length - 1] + x / sum);
      bounds[n] = 1;
      return { phase: rng.next(), bounds };
    });
    const GRANITE: RGB[] = [
      [0.44, 0.44, 0.45], [0.50, 0.44, 0.43], [0.38, 0.40, 0.44],
      [0.43, 0.40, 0.36], [0.33, 0.33, 0.34], [0.47, 0.46, 0.44],
    ];
    const nWarpA = noise(1), nWarpB = noise(2), nSurf = noise(3), nSpeck = noise(4), nWet = noise(5), nGrit = noise(6);

    return (u, v, o) => {
      const wu = u + 0.004 * nWarpA.fbm(u, v, 8, 3);
      const wv = v + 0.004 * nWarpB.fbm(u, v, 8, 3);
      const ry = wv * ROWS;
      const rowF = Math.floor(ry);
      const row = wrap(rowF, ROWS);
      const R = rows[row];
      let x = wu - R.phase;
      x -= Math.floor(x);
      let i = 0;
      while (x >= R.bounds[i + 1]) i++;
      const x0 = R.bounds[i], x1 = R.bounds[i + 1];
      const halfW = (x1 - x0) / 2, halfH = 0.5 / ROWS;
      const lx = x - (x0 + x1) / 2, ly = (ry - rowF - 0.5) / ROWS;

      const sid = hashInt(row, i, seed);
      const h1 = (sid & 1023) / 1023, h2 = ((sid >>> 10) & 1023) / 1023, h3 = ((sid >>> 20) & 1023) / 1023;
      const gap = 0.0045 + 0.0025 * h1;
      const d = sdRoundBox(lx, ly, halfW - gap, halfH - gap, 0.012 + 0.012 * h2);
      const stone = 1 - smoothstep(-px, px, d);

      const edge = clamp(-d / 0.024);
      const dome = 1 - (1 - edge) * (1 - edge);
      const crown = 1 - 0.5 * ((lx * lx) / (halfW * halfW) + (ly * ly) / (halfH * halfH));
      const tilt = ((h2 - 0.5) * lx / halfW + (h3 - 0.5) * ly / halfH) * 0.08;
      const surf = nSurf.fbm(u, v, 32, 4);
      const pit = nSurf.perlin(u * 256, v * 256, 256, 256);
      const hStone = 0.42 + 0.34 * dome + 0.08 * crown + tilt + 0.06 * surf + 0.015 * pit;
      const grit = nGrit.fbm(u, v, 128, 2);
      const hGap = 0.1 + 0.05 * grit;
      let h = mix(hGap, hStone, stone);

      // Standing water: puddles fill to a flat level, joints hold a little.
      const puddle = smoothstep(0.08, 0.22, nWet.fbm(u, v, 3, 4));
      const level = 0.13 + 0.5 * puddle;
      const submerged = clamp((level - h) / 0.03);
      h = Math.max(h, level);

      // Colour
      const base = GRANITE[Math.floor(h1 * 7919) % GRANITE.length];
      setRGB(o, base, 0.88 + 0.24 * h3 + 0.12 * surf);
      const sp = nSpeck.perlin(u * 320, v * 320, 320, 320);
      if (sp > 0.42) mulRGB(o, 0.55);
      else if (sp < -0.45) mixRGB(o, [0.78, 0.76, 0.74], 0.5);
      mixRGB(o, [0.09, 0.085, 0.08], (1 - stone) * (0.85 + 0.15 * grit));

      // Wetness: dips & joints slick, crowns drier.
      const damp = clamp(0.15 + 0.85 * Math.pow(1 - dome, 1.5) + 0.9 * puddle - 0.15 * crown + (1 - stone));
      mulRGB(o, mix(1, 0.52, damp));
      mulRGB(o, mix(1, 0.75, submerged)); // water film darkens further
      o.rough = mix(0.8 + 0.1 * surf, 0.14, damp);
      o.rough = mix(o.rough, 0.03, submerged);
      o.h = h;
    };
  },
};

/**
 * Welsh slate: staggered rows of scallop-butted shingles, each overlapping
 * the row below (sawtooth relief), split-face cleavage, chipped butts,
 * lichen colonies.
 */
export const slate: TextureRecipe = {
  id: 'slate',
  label: 'Aged slate roof tiles',
  size: 1024,
  worldSize: 1.0,
  depth: 0.012,
  ao: { radius: 0.006, strength: 2.5 },
  material: { type: 'standard' },
  setup({ seed, noise, px }) {
    const COLS = 4, ROWS = 8, E = 1 / ROWS, SC = 0.4 * E;
    const SLATE: RGB[] = [[0.25, 0.27, 0.31], [0.29, 0.26, 0.30], [0.21, 0.23, 0.25], [0.27, 0.29, 0.30]];
    const LICHEN: RGB[] = [[0.58, 0.60, 0.30], [0.72, 0.72, 0.64], [0.78, 0.50, 0.18]];
    const nWarp = noise(1), nCleave = noise(2), nChip = noise(3), nLichen = noise(4), nVar = noise(5);
    const w = createWorleySample(), w2 = createWorleySample();

    const tileX = (wu: number, r: number) => {
      const cx = wu * COLS + (wrap(r, 2) ? 0.5 : 0);
      const ci = Math.floor(cx);
      return { ci: wrap(ci, COLS), t: (cx - ci) * 2 - 1, fx: cx - ci };
    };
    const bottom = (r: number, t: number) => r * E - SC * Math.sqrt(Math.max(0, 1 - t * t));

    return (u, v, o) => {
      const wu = u + 0.002 * nWarp.fbm(u, v, 16, 2);
      const rF = Math.floor(v * ROWS);
      let r = rF + 1;
      let tx = tileX(wu, r);
      if (v < bottom(r, tx.t)) {
        r = rF;
        tx = tileX(wu, r);
      }
      const db = v - bottom(r, tx.t); // distance above this tile's butt edge
      const id = hashInt(tx.ci, wrap(r, ROWS), seed);
      const hid = (id & 0xffff) / 65535;

      // Chipped butts: erode the edge with noise.
      const chip = 0.007 * Math.max(0, nChip.fbm(u, v, 24, 3) * 2.2);
      const butt = smoothstep(0, 0.004, db - chip);
      const sideDist = Math.min(tx.fx, 1 - tx.fx) / COLS;
      const side = smoothstep(0.0008, 0.0008 + 2 * px, sideDist);

      const ramp = 1 - clamp(db / (E + SC));
      const cleave = nCleave.fbmAniso(u, v, 6, 48, 3);
      const hTile = 0.3 + 0.55 * ramp + 0.05 * cleave + 0.03 * (hid - 0.5);
      let h = 0.22 + (hTile - 0.22) * butt * side;

      setRGB(o, SLATE[id % SLATE.length], 0.9 + 0.2 * hid + 0.15 * cleave);
      // Weathered (lighter, chalkier) exposed area near the butt
      mixRGB(o, [0.42, 0.43, 0.45], 0.18 * ramp * nVar.fbm01(u, v, 6, 3));
      // Fresh broken slate where chipped
      if (db >= 0 && db < chip + 0.004) mixRGB(o, [0.36, 0.37, 0.40], 0.5 * (1 - butt));
      mulRGB(o, mix(0.55, 1, butt * side));
      o.rough = 0.55 + 0.12 * cleave + 0.1 * hid;

      // Lichen colonies
      const mask = smoothstep(0.05, 0.3, nLichen.fbm(u, v, 3, 3));
      nLichen.worley(u, v, 56, 56, 1, w);
      const rad = 0.12 + 0.2 * ((w.id >>> 8) & 255) / 255;
      let lichen = (1 - smoothstep(rad * 0.7, rad, w.f1)) * mask * ((w.id & 7) < 3 ? 1 : 0);
      nLichen.worley(u, v, 160, 160, 1, w2);
      lichen = Math.max(lichen, (1 - smoothstep(0.18, 0.26, w2.f1)) * mask * ((w2.id & 3) === 0 ? 1 : 0));
      lichen *= butt * side;
      if (lichen > 0) {
        const k = (w.id >>> 3) % 9;
        const lc = LICHEN[k < 6 ? 0 : k < 8 ? 1 : 2];
        mixRGB(o, lc, lichen * 0.9);
        o.rough = mix(o.rough, 0.95, lichen);
        h += 0.03 * lichen * (0.6 + 0.4 * nLichen.perlin(u * 400, v * 400, 400, 400));
      }
      o.h = h;
    };
  },
};

/** Veined white "Gringotts" marble: polished, domain-warped grey & gold veins. */
export const marble: TextureRecipe = {
  id: 'marble',
  label: 'Veined white Gringotts marble',
  size: 1024,
  worldSize: 1.0,
  depth: 0.0015,
  ao: { radius: 0.003, strength: 1 },
  material: { type: 'physical', clearcoat: 0.6, clearcoatRoughness: 0.08 },
  setup({ noise }) {
    const nW1 = noise(1), nW2 = noise(2), nV = noise(3), nV2 = noise(4), nCloud = noise(5), nGold = noise(6), nWear = noise(7);
    return (u, v, o) => {
      const w1 = nW1.fbm(u, v, 2, 4), w2 = nW2.fbm(u, v, 2, 4);
      const t = nV.fbm(u + 0.45 * w1, v + 0.45 * w2, 2, 6);
      const vein = 1 - smoothstep(0, 0.022, Math.abs(t));
      const halo = 1 - smoothstep(0, 0.12, Math.abs(t));
      const t2 = nV2.fbm(u + 0.3 * w2, v + 0.3 * w1, 5, 5);
      const fine = (1 - smoothstep(0, 0.007, Math.abs(t2))) * 0.7;
      const cloud = nCloud.fbm01(u, v, 3, 5);

      setRGB(o, [0.94, 0.93, 0.91]);
      mixRGB(o, [0.82, 0.82, 0.83], clamp((0.55 - cloud) * 1.6));
      mixRGB(o, [0.74, 0.74, 0.76], halo * 0.45);
      const gold = smoothstep(0.45, 0.6, nGold.fbm01(u, v, 3, 3));
      const veinCol: RGB = [mix(0.36, 0.66, gold), mix(0.37, 0.55, gold), mix(0.40, 0.36, gold)];
      mixRGB(o, veinCol, Math.max(vein, fine * 0.8));

      const wear = nWear.fbm01(u, v, 8, 4);
      o.rough = 0.05 + 0.08 * wear + 0.12 * vein;
      o.h = 0.5 - 0.2 * vein - 0.08 * fine + 0.04 * nWear.perlin(u * 128, v * 128, 128, 128) * wear;
    };
  },
};

