/**
 * Interior recipes for the Ravenclaw tower room: polished walnut joinery,
 * pale dressed ashlar, herringbone oak parquet, sapphire silk and statuary
 * bronze. All tileable (periodic noise only, integer frequencies).
 */
import { createWorleySample, hash01, wrap } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, mulRGB, setRGB, smoothstep } from './util';

/** French-polished walnut: figured grain along U, deep pores, soft wax sheen. */
export const walnut: TextureRecipe = {
  id: 'walnut',
  label: 'Polished walnut',
  size: 1024,
  worldSize: 1.2,
  depth: 0.0015,
  ao: { radius: 0.004, strength: 1.5 },
  material: { type: 'physical', clearcoat: 0.45, clearcoatRoughness: 0.28 },
  setup({ noise }) {
    const nWarp = noise(1), nGrain = noise(2), nFig = noise(3), nTone = noise(4), nWear = noise(5);
    return (u, v, o) => {
      const s = v * 30 + 1.6 * nWarp.fbmAniso(u, v, 1, 3, 3) + 0.4 * nWarp.fbmAniso(u, v, 4, 12, 2);
      const ring = s - Math.floor(s);
      const late = smoothstep(0.5, 0.85, ring) * (1 - smoothstep(0.9, 1, ring));
      const grain = nGrain.fbmAniso(u, v, 2, 320, 3);
      const fig = nFig.fbmAniso(u, v, 6, 2, 3); // ripple figure across the grain
      const tone = nTone.fbm01(u, v, 2, 3);
      setRGB(o, [mix(0.2, 0.27, tone), mix(0.11, 0.15, tone), mix(0.06, 0.08, tone)]);
      mixRGB(o, [0.085, 0.045, 0.025], late * 0.75);
      mulRGB(o, 0.9 + 0.25 * grain + 0.12 * fig);
      const wear = smoothstep(0.62, 0.8, nWear.fbm01(u, v, 5, 4));
      mixRGB(o, [0.34, 0.22, 0.13], wear * 0.25);
      o.h = 0.5 + 0.04 * late + 0.03 * grain - 0.02 * Math.abs(fig);
      o.rough = clamp(0.36 + 0.12 * late + 0.1 * wear);
    };
  },
};

/** Pale dressed limestone ashlar in courses with thin lime joints and soft tooling. */
export const ashlar: TextureRecipe = {
  id: 'ashlar',
  label: 'Pale limestone ashlar',
  size: 1024,
  worldSize: 2.4,
  depth: 0.012 / 2.4,
  ao: { radius: 0.006, strength: 2.2 },
  material: { type: 'standard' },
  setup({ seed, noise, px }) {
    const ROWS = 6, COLS = 3; // 0.4 m courses, 0.8 m blocks
    const nTone = noise(1), nTool = noise(2), nPit = noise(3), nChip = noise(4), nStain = noise(5);
    const JOINT = 0.006 / 2.4;
    return (u, v, o) => {
      const ry = v * ROWS, row = Math.floor(ry);
      const off = (wrap(row, 2) * 0.5 + 0.17 * hash01(row, 7, seed)) / COLS;
      const rx = (u + off) * COLS;
      const col = wrap(Math.floor(rx), COLS);
      const fx = (rx - Math.floor(rx)) / COLS, fy = (ry - row) / ROWS;
      const ex = Math.min(fx, 1 / COLS - fx), ey = Math.min(fy, 1 / ROWS - fy);
      const e = Math.min(ex, ey);
      const chip = smoothstep(0.55, 0.75, nChip.fbm01(u, v, 16, 3)) * 0.004;
      const joint = 1 - smoothstep(JOINT + chip - px, JOINT + chip + px * 2, e);
      const bevel = smoothstep(JOINT, JOINT + 0.012, e);
      const bid = hash01(wrap(row, ROWS), col, seed);
      const tone = nTone.fbm01(u, v, 3, 4);
      const tool = nTool.fbmAniso(u, v, 2, 60, 2);
      const pit = smoothstep(0.7, 0.8, nPit.fbm01(u, v, 40, 2));
      const k = 0.92 + 0.12 * bid + 0.1 * (tone - 0.5);
      setRGB(o, [0.7 * k, 0.67 * k, 0.62 * k]);
      mixRGB(o, [0.58, 0.6, 0.62], 0.25 * smoothstep(0.4, 0.9, bid)); // cooler blue-grey blocks
      mixRGB(o, [0.45, 0.42, 0.38], smoothstep(0.62, 0.85, nStain.fbm01(u, v, 4, 4)) * 0.35);
      mulRGB(o, 1 - 0.18 * pit);
      mixRGB(o, [0.5, 0.48, 0.44], joint);
      o.h = 0.25 + 0.6 * bevel + 0.03 * tool - 0.06 * pit - 0.3 * joint;
      o.rough = clamp(0.78 + 0.1 * tool + 0.1 * joint);
    };
  },
};

/** Waxed oak floorboards: staggered random-length boards, grain, worn traffic dulling. */
export const parquet: TextureRecipe = {
  id: 'parquet',
  label: 'Waxed oak floorboards',
  size: 1024,
  worldSize: 1.6,
  depth: 0.003 / 1.6,
  ao: { radius: 0.003, strength: 2 },
  material: { type: 'physical', clearcoat: 0.3, clearcoatRoughness: 0.4 },
  setup({ seed, noise, px }) {
    const ROWS = 10, SEGS = 2; // 0.16 m boards, 0.8 m lengths (staggered per row)
    const nGrain = noise(1), nTone = noise(2), nWear = noise(3);
    return (u, v, o) => {
      const ry = v * ROWS, row = Math.floor(ry), fy = ry - row;
      const off = hash01(wrap(row, ROWS), 3, seed);
      const rx = (u + off) * SEGS, seg = wrap(Math.floor(rx), SEGS), fx = rx - Math.floor(rx);
      const ex = Math.min(fx, 1 - fx) / SEGS, ey = Math.min(fy, 1 - fy) / ROWS;
      const gap = 1 - smoothstep(0.0011 - px, 0.0011 + px, Math.min(ex, ey));
      const id = hash01(wrap(row, ROWS), seg + 11, seed);
      const grain = nGrain.fbmAniso(u + id, v, 3, 220, 3);
      const rings = Math.sin((v * ROWS * 3 + 4 * nTone.fbmAniso(u, v, 2, 8, 2) + id * 9) * 6.283);
      const k = 0.78 + 0.38 * id;
      setRGB(o, [0.36 * k, 0.225 * k, 0.125 * k]);
      mulRGB(o, 0.88 + 0.25 * grain + 0.06 * rings);
      mulRGB(o, 1 - 0.7 * gap);
      const wear = smoothstep(0.5, 0.8, nWear.fbm01(u, v, 3, 4));
      mixRGB(o, [0.44, 0.33, 0.22], wear * 0.22);
      o.h = 0.55 + 0.03 * grain + 0.01 * rings - 0.5 * gap;
      o.rough = clamp(0.4 + 0.22 * wear + 0.3 * gap);
    };
  },
};

/** Sapphire shot silk with fine weave and soft crush (drapes, banners, cushions). */
export const silk: TextureRecipe = {
  id: 'silk',
  label: 'Sapphire silk',
  size: 512,
  worldSize: 0.5,
  depth: 0.0008 / 0.5,
  ao: { radius: 0.01, strength: 0.6 },
  material: { type: 'physical', sheen: 1, sheenColor: [0.35, 0.55, 1.0], sheenRoughness: 0.35, doubleSided: true },
  setup({ noise }) {
    const nCrush = noise(1), nSlub = noise(2);
    return (u, v, o) => {
      const weave = 0.5 + 0.5 * Math.sin(u * 2 * Math.PI * 220) * Math.sin(v * 2 * Math.PI * 220);
      const crush = nCrush.fbm(u, v, 3, 4);
      const slub = nSlub.fbmAniso(u, v, 2, 90, 2);
      setRGB(o, [0.05, 0.11, 0.33], 0.85 + 0.25 * crush + 0.08 * slub);
      o.h = 0.5 + 0.06 * weave + 0.08 * crush;
      o.rough = 0.5 + 0.1 * weave;
    };
  },
};

/** Statuary bronze: warm metal, dark brown patina in recesses, polished high points. */
export const bronze: TextureRecipe = {
  id: 'bronze',
  label: 'Statuary bronze',
  size: 512,
  worldSize: 0.4,
  depth: 0.002 / 0.4,
  ao: { radius: 0.01, strength: 1.2 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nPat = noise(1), nFine = noise(2), nRub = noise(3);
    const w = createWorleySample();
    return (u, v, o) => {
      nFine.worley(u, v, 24, 24, 1, w);
      const pat = smoothstep(0.42, 0.7, nPat.fbm01(u, v, 4, 5));
      const rub = smoothstep(0.55, 0.75, nRub.fbm01(u, v, 6, 3));
      setRGB(o, [0.72, 0.5, 0.28]);
      mixRGB(o, [0.26, 0.16, 0.09], pat * 0.8);
      mixRGB(o, [0.86, 0.66, 0.4], rub * 0.4);
      o.metal = 1 - pat * 0.35;
      o.rough = clamp(0.32 + 0.3 * pat - 0.12 * rub + 0.05 * w.f1);
      o.h = 0.5 + 0.05 * w.f1 - 0.04 * pat;
    };
  },
};
