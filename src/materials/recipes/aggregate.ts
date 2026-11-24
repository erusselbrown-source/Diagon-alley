import { createWorleySample } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, mulRGB, setRGB, smoothstep } from './util';

/**
 * Wet-street granite for individual setts (instanced with per-instance UV
 * jitter): mottled grey with black mica / white feldspar, pitting, polished
 * worn high spots. Roughness is rain-slicked.
 */
export const granite: TextureRecipe = {
  id: 'granite',
  label: 'Sett granite',
  size: 512,
  worldSize: 0.5,
  depth: 0.003 / 0.5,
  ao: { radius: 0.01, strength: 2 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nMottle = noise(1), nSpeck = noise(2), nPit = noise(3), nTone = noise(4), nWear = noise(5);
    const w = createWorleySample();
    return (u, v, o) => {
      const mottle = nMottle.fbm(u, v, 6, 4);
      const tone = nTone.fbm01(u, v, 2, 3);
      setRGB(o, [mix(0.40, 0.47, tone), mix(0.40, 0.42, tone), mix(0.43, 0.41, tone)], 0.9 + 0.3 * mottle);
      const sp = nSpeck.perlin(u * 150, v * 150, 150, 150);
      if (sp > 0.38) mulRGB(o, 0.45);
      else if (sp < -0.42) mixRGB(o, [0.8, 0.78, 0.76], 0.55);
      nPit.worley(u, v, 40, 40, 1, w);
      const pit = (1 - smoothstep(0.06, 0.16, w.f1)) * ((w.id & 3) === 0 ? 1 : 0);
      const wear = nWear.fbm01(u, v, 3, 3);
      o.h = 0.55 + 0.08 * mottle - 0.25 * pit + 0.05 * wear;
      mulRGB(o, 1 - 0.4 * pit);
      o.rough = clamp(mix(0.5, 0.26, smoothstep(0.45, 0.7, wear)) + 0.3 * pit + 0.05 * mottle);
    };
  },
};

/**
 * Weathered York-stone sandstone (curbs, flags, steps, sills, coping):
 * warm buff with iron-stained bedding strata, honeycomb erosion pits and soot.
 */
export const sandstone: TextureRecipe = {
  id: 'sandstone',
  label: 'Weathered sandstone',
  size: 1024,
  worldSize: 0.8,
  depth: 0.006 / 0.8,
  ao: { radius: 0.008, strength: 2.5 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nBed = noise(1), nTone = noise(2), nGrain = noise(3), nErode = noise(4), nSoot = noise(5), nLichen = noise(6);
    const w = createWorleySample();
    return (u, v, o) => {
      const bed = nBed.fbmAniso(u, v, 2, 20, 4);
      const tone = nTone.fbm01(u, v, 3, 4);
      setRGB(o, [mix(0.66, 0.58, tone), mix(0.57, 0.48, tone), mix(0.43, 0.34, tone)]);
      // Iron-stained bedding bands
      const band = smoothstep(0.1, 0.35, bed);
      mixRGB(o, [0.55, 0.38, 0.22], band * 0.45);
      const grain = nGrain.perlin(u * 300, v * 300, 300, 300);
      mulRGB(o, 0.94 + 0.1 * grain);
      // Honeycomb erosion
      nErode.worley(u, v, 24, 24, 1, w);
      const erodeMask = smoothstep(0.55, 0.7, nErode.fbm01(u, v, 4, 3));
      const pit = (1 - smoothstep(0.15, 0.45, w.f1)) * erodeMask;
      // City soot
      const soot = smoothstep(0.5, 0.75, nSoot.fbm01(u, v, 3, 4));
      mixRGB(o, [0.16, 0.14, 0.12], soot * 0.55 + pit * 0.3);
      const lichen = smoothstep(0.78, 0.84, nLichen.fbm01(u, v, 12, 3));
      mixRGB(o, [0.12, 0.12, 0.10], lichen * 0.7);
      o.h = 0.55 + 0.06 * bed + 0.02 * grain - 0.3 * pit;
      o.rough = clamp(0.86 + 0.06 * grain + 0.05 * soot);
    };
  },
};

/** Dark gritty joint bed between setts: sand, grit, pebbles and grime, damp. */
export const grit: TextureRecipe = {
  id: 'grit',
  label: 'Joint grit',
  size: 512,
  worldSize: 0.6,
  depth: 0.01 / 0.6,
  ao: { radius: 0.01, strength: 3 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nPeb = noise(1), nFine = noise(2), nDamp = noise(3);
    const w = createWorleySample();
    return (u, v, o) => {
      nPeb.worley(u, v, 48, 48, 1, w);
      const peb = Math.sqrt(clamp(1 - (w.f1 / 0.42) ** 2));
      const fine = nFine.perlin(u * 256, v * 256, 256, 256);
      const t = ((w.id >>> 8) & 255) / 255;
      setRGB(o, [0.13, 0.12, 0.11], 0.85 + 0.3 * fine);
      mixRGB(o, [mix(0.24, 0.36, t), mix(0.23, 0.33, t), mix(0.22, 0.30, t)], peb * 0.8);
      const damp = nDamp.fbm01(u, v, 4, 3);
      mulRGB(o, mix(1, 0.7, damp));
      o.h = 0.35 + 0.4 * peb + 0.05 * fine;
      o.rough = mix(0.75, 0.35, damp) - 0.1 * peb;
    };
  },
};
