import { createWorleySample } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, mulRGB, setRGB, smoothstep } from './util';

/** Single riven roof slate (for instanced slates): blue-grey cleavage, chalky bloom, sparse lichen. */
export const slateTile: TextureRecipe = {
  id: 'slate-tile',
  label: 'Riven roof slate',
  size: 512,
  worldSize: 0.5,
  depth: 0.002 / 0.5,
  ao: { radius: 0.01, strength: 1.5 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nCleave = noise(1), nTone = noise(2), nBloom = noise(3), nLichen = noise(4);
    const w = createWorleySample();
    return (u, v, o) => {
      const cleave = nCleave.fbmAniso(u, v, 3, 24, 4);
      const tone = nTone.fbm01(u, v, 3, 3);
      setRGB(o, [mix(0.2, 0.27, tone), mix(0.22, 0.24, tone), mix(0.26, 0.29, tone)], 0.9 + 0.25 * cleave);
      mixRGB(o, [0.42, 0.43, 0.45], smoothstep(0.55, 0.8, nBloom.fbm01(u, v, 5, 3)) * 0.35);
      nLichen.worley(u, v, 30, 30, 1, w);
      const lichen = (1 - smoothstep(0.12, 0.2, w.f1)) * ((w.id & 15) === 0 ? 1 : 0);
      mixRGB(o, (w.id >>> 8) & 1 ? [0.6, 0.6, 0.32] : [0.7, 0.7, 0.62], lichen * 0.85);
      o.h = 0.5 + 0.15 * cleave + 0.05 * lichen;
      o.rough = clamp(0.55 + 0.15 * cleave + 0.3 * lichen);
    };
  },
};

/** Copper with streaky verdigris run-off (gutters, downspouts, domes). */
export const copper: TextureRecipe = {
  id: 'copper',
  label: 'Verdigris copper',
  size: 512,
  worldSize: 0.6,
  depth: 0.002 / 0.6,
  ao: { radius: 0.01, strength: 1.5 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nStreak = noise(1), nPatch = noise(2), nFine = noise(3);
    return (u, v, o) => {
      const streak = nStreak.fbmAniso(u, v, 24, 2, 3);
      const patch = nPatch.fbm01(u, v, 4, 4);
      const verd = clamp(smoothstep(0.4, 0.62, patch + 0.25 * streak));
      setRGB(o, [0.72, 0.43, 0.27], 0.85 + 0.2 * nFine.fbm(u, v, 32, 2));
      mixRGB(o, [0.25, 0.18, 0.14], smoothstep(0.3, 0.5, patch) * 0.5); // dark oxide
      mixRGB(o, [mix(0.33, 0.42, patch), mix(0.6, 0.66, patch), mix(0.52, 0.58, patch)], verd);
      o.metal = 1 - verd;
      o.rough = mix(0.35, 0.85, verd);
      o.h = 0.5 + 0.08 * verd;
    };
  },
};

/** Worn brown leather with pore grain and scuffed highlights (book bindings, trunks). */
export const leather: TextureRecipe = {
  id: 'leather',
  label: 'Aged leather',
  size: 512,
  worldSize: 0.35,
  depth: 0.0015 / 0.35,
  ao: { radius: 0.008, strength: 2 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nGrain = noise(1), nScuff = noise(2), nTone = noise(3);
    const w = createWorleySample();
    return (u, v, o) => {
      nGrain.worley(u, v, 90, 90, 1, w);
      const pore = smoothstep(0.0, 0.25, w.f2 - w.f1);
      const tone = nTone.fbm01(u, v, 3, 4);
      setRGB(o, [mix(0.32, 0.42, tone), mix(0.18, 0.25, tone), mix(0.1, 0.14, tone)], 0.85 + 0.15 * pore);
      const scuff = smoothstep(0.6, 0.8, nScuff.fbm01(u, v, 6, 4));
      mixRGB(o, [0.55, 0.42, 0.3], scuff * 0.45);
      o.h = 0.5 + 0.1 * pore - 0.05 * scuff;
      o.rough = clamp(0.55 + 0.15 * (1 - pore) + 0.2 * scuff);
    };
  },
};

/** Crushed plum velvet (cushions, drapes). Rendered with sheen. */
export const velvet: TextureRecipe = {
  id: 'velvet',
  label: 'Crushed velvet',
  size: 512,
  worldSize: 0.4,
  depth: 0.0015 / 0.4,
  ao: { radius: 0.01, strength: 1 },
  material: { type: 'physical', sheen: 1, sheenColor: [0.32, 0.12, 0.3], sheenRoughness: 0.5 },
  setup({ noise }) {
    const nCrush = noise(1), nFibre = noise(2);
    return (u, v, o) => {
      const crush = nCrush.fbm(u, v, 5, 4);
      setRGB(o, [0.3, 0.06, 0.24], 0.8 + 0.4 * crush);
      mulRGB(o, 0.95 + 0.1 * nFibre.perlin(u * 300, v * 300, 300, 300));
      o.h = 0.5 + 0.1 * crush;
      o.rough = 0.92;
    };
  },
};

/** Pale, scarred dragon hide: overlapping ivory scales, healed pink-grey scars, sooty creases. */
export const dragonhide: TextureRecipe = {
  id: 'dragonhide',
  label: 'Pale scarred dragon hide',
  size: 512,
  worldSize: 0.7,
  depth: 0.01 / 0.7,
  ao: { radius: 0.012, strength: 3 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nScale = noise(1), nScar = noise(2), nTone = noise(3), nSoot = noise(4);
    const w = createWorleySample();
    return (u, v, o) => {
      // Scales: Worley cells stretched along v, each a domed plate with a raised rim edge.
      nScale.worley(u, v, 22, 30, 0.8, w);
      const edge = smoothstep(0.0, 0.18, w.f2 - w.f1);
      const dome = 1 - Math.min(1, w.f1 * 1.2);
      const tone = nTone.fbm01(u, v, 3, 4);
      setRGB(o, [mix(0.78, 0.86, tone), mix(0.76, 0.83, tone), mix(0.72, 0.78, tone)], 0.82 + 0.22 * dome);
      mulRGB(o, 0.75 + 0.25 * edge);
      // Scars: long diagonal gouges, healed pink-grey and raised at the margins.
      const sc = nScar.fbmAniso(u + v * 0.6, v, 3, 18, 3);
      const scar = 1 - smoothstep(0.0, 0.05, Math.abs(sc));
      const scarMask = smoothstep(0.1, 0.3, nScar.fbm(u, v, 2, 2));
      const s = scar * scarMask;
      mixRGB(o, [0.62, 0.48, 0.48], s * 0.8);
      mixRGB(o, [0.3, 0.27, 0.25], smoothstep(0.62, 0.82, nSoot.fbm01(u, v, 5, 3)) * (1 - edge) * 0.6);
      o.h = 0.35 + 0.45 * dome * edge - 0.25 * s + 0.08 * scarMask * (1 - smoothstep(0.05, 0.12, Math.abs(sc)));
      o.rough = clamp(0.62 + 0.2 * (1 - edge) + 0.1 * s);
    };
  },
};
