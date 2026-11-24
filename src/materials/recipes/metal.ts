import { createWorleySample } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, setRGB, smoothstep } from './util';

/** Tarnished wrought iron: forge-hammered surface, pitting, rust blooms in recesses. */
export const iron: TextureRecipe = {
  id: 'iron',
  label: 'Tarnished wrought iron',
  size: 512,
  worldSize: 0.5,
  depth: 0.004 / 0.5,
  ao: { radius: 0.008, strength: 2 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nForm = noise(1), nPit = noise(2), nRust = noise(3), nRust2 = noise(4);
    const w = createWorleySample();
    return (u, v, o) => {
      nForm.worley(u, v, 14, 14, 0.9, w);
      const dent = Math.min(1, w.f1 * w.f1 * 1.5);
      const form = nForm.fbm(u, v, 8, 4);
      const pit = smoothstep(0.68, 0.76, nPit.fbm01(u, v, 48, 2));
      let h = 0.5 + 0.1 * dent + 0.15 * form - 0.18 * pit + 0.03 * nForm.perlin(u * 128, v * 128, 128, 128);

      const rustN = nRust.fbm01(u, v, 4, 5) + 0.06 * pit - 0.3 * form; // rust follows broad forging lows, not dent cells
      const rust = smoothstep(0.6, 0.7, rustN);
      const stain = smoothstep(0.52, 0.6, rustN) * (1 - rust);
      const wear = smoothstep(0.55, 0.7, h); // raised areas rubbed bright

      setRGB(o, [0.2, 0.2, 0.21]);
      mixRGB(o, [0.12, 0.13, 0.15], smoothstep(-0.1, 0.25, form) * 0.7); // blue-black mill scale
      mixRGB(o, [0.42, 0.42, 0.43], wear * 0.7);
      mixRGB(o, [0.24, 0.15, 0.09], stain * 0.6);
      o.metal = mix(0.65, 0.9, wear);
      o.rough = mix(0.58 + 0.1 * form, 0.32, wear);

      if (rust > 0) {
        const rc = nRust2.fbm01(u, v, 24, 3);
        mixRGB(o, [mix(0.24, 0.44, rc), mix(0.11, 0.21, rc), mix(0.05, 0.08, rc)], rust);
        o.metal = mix(o.metal, 0, rust);
        o.rough = mix(o.rough, 0.92, rust);
        h += 0.06 * rust * nRust2.fbm01(u, v, 64, 2);
      }
      o.h = h;
    };
  },
};

/** Hammered antique brass: dimpled planishing, polished ridges, dark patina and verdigris in recesses. */
export const brass: TextureRecipe = {
  id: 'brass',
  label: 'Hammered antique brass',
  size: 512,
  worldSize: 0.4,
  depth: 0.004 / 0.4,
  ao: { radius: 0.01, strength: 1.5 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nHam = noise(1), nScratch = noise(2), nPatina = noise(3), nVerd = noise(4);
    const w = createWorleySample();
    return (u, v, o) => {
      nHam.worley(u, v, 16, 16, 0.9, w);
      const dimple = Math.min(1, w.f1 * w.f1 * 1.4); // 0 at centre → 1 at ridge
      const scratch = nScratch.fbmAniso(u, v, 2, 256, 2);
      const recess = 1 - smoothstep(0.05, 0.45, w.f1);
      o.h = 0.3 + 0.55 * dimple + 0.02 * scratch;

      const patina = clamp(clamp((nPatina.fbm01(u, v, 4, 4) - 0.3) * 2.0) * 0.9 + recess * 0.15);
      setRGB(o, [0.80, 0.62, 0.33]);
      mixRGB(o, [0.38, 0.27, 0.12], patina);
      o.metal = 1;
      o.rough = mix(0.18 + 0.05 * scratch, 0.52, patina);

      const verd = smoothstep(0.7, 0.76, nVerd.fbm01(u, v, 8, 4) + recess * 0.1) * smoothstep(0.45, 0.65, patina);
      if (verd > 0) {
        mixRGB(o, [0.33, 0.55, 0.46], verd);
        o.metal = mix(1, 0, verd);
        o.rough = mix(o.rough, 0.9, verd);
        o.h += 0.03 * verd;
      }
    };
  },
};
