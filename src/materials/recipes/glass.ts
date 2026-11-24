import { createWorleySample, hash01, hashInt, wrap } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, setRGB, smoothstep } from './util';

/**
 * Rain-streaked leaded glass: diamond quarries in lead cames, wavy crown-glass
 * panes with per-pane tint, grime packed into corners and along the leads,
 * rain droplets and run-off streaks that wash clean channels through the dirt.
 * Transmission map: glass ≈ 0.95, grime reduces it, lead = 0 (opaque).
 */
export const glass: TextureRecipe = {
  id: 'glass',
  label: 'Rain-streaked leaded glass',
  size: 512,
  worldSize: 0.6,
  depth: 0.003 / 0.6,
  ao: { radius: 0.006, strength: 1.5 },
  material: { type: 'physical', transmission: true, ior: 1.52, thickness: 0.004, doubleSided: true, aoIntensity: 0.5 },
  setup({ seed, noise, px }) {
    const NX = 6, NY = 4; // quarries per tile: 100 × 150 mm diamonds
    const L = Math.hypot(NX, NY);
    const CAME = 0.0045 / 0.6; // half-width of lead came, tile units
    const STREAKS = 36;
    const nWave = noise(1), nGrime = noise(2), nStreak = noise(3), nDrop = noise(4), nLead = noise(5);
    const w = createWorleySample();
    const TINTS = [[0.90, 0.95, 0.90], [0.93, 0.95, 0.89], [0.89, 0.94, 0.93], [0.95, 0.94, 0.88]] as const;

    return (u, v, o) => {
      const s1 = u * NX + v * NY, s2 = u * NX - v * NY;
      const f1 = s1 - Math.floor(s1), f2 = s2 - Math.floor(s2);
      const e1 = Math.min(f1, 1 - f1) / L, e2 = Math.min(f2, 1 - f2) / L; // distance to cames, tile units
      const eMin = Math.min(e1, e2);
      const lead = 1 - smoothstep(CAME - px, CAME + px, eMin);
      const leadProfile = Math.sqrt(clamp(1 - eMin / CAME));

      // Pane id, periodic across the tile (see invariants of s1±s2).
      const a = Math.floor(s1), b = Math.floor(s2);
      const pid = hashInt(wrap(a + b, 2 * NX), wrap(a - b, 2 * NY), seed);
      const tint = TINTS[pid & 3];

      // Crown glass waviness per pane
      const wave = nWave.fbm(u + (pid & 255) / 255, v, 8, 3);

      // Grime: thick in acute corners, a band along each came, plus blotches.
      const corner = (1 - smoothstep(0, 0.04, e1)) * (1 - smoothstep(0, 0.04, e2));
      const along = 1 - smoothstep(CAME, CAME + 0.016, eMin);
      const dirt = nGrime.fbm01(u, v, 6, 4);
      let grime = clamp(corner * 1.6 + along * 0.6 * (0.5 + dirt) + smoothstep(0.55, 0.75, dirt) * 0.45);
      grime *= 0.7 + 0.3 * nGrime.perlin(u * 128, v * 128, 128, 128);

      // Rain run-off streaks: wiggly vertical channels that wash grime away.
      const sx = u * STREAKS;
      const col = wrap(Math.floor(sx), STREAKS);
      const x0 = 0.5 + (hash01(col, 1, seed) - 0.5) * 0.6 + 0.25 * nStreak.perlin(v * 6, col, 6, STREAKS);
      const dx = Math.abs(sx - Math.floor(sx) - x0) / STREAKS;
      const present = smoothstep(-0.1, 0.25, nStreak.perlin(col + 0.5, v * 3 + hash01(col, 2, seed) * 3, STREAKS, 3));
      const streak = (1 - smoothstep(0.0006, 0.0006 + 2 * px, dx)) * present;
      const washed = (1 - smoothstep(0.002, 0.008, dx)) * present;
      grime *= 1 - 0.8 * washed;

      // Droplets
      nDrop.worley(u, v, 40, 40, 1, w);
      const rad = 0.12 + 0.18 * ((w.id >>> 8) & 255) / 255;
      const drop = (w.id & 3) !== 0 ? Math.sqrt(clamp(1 - (w.f1 * w.f1) / (rad * rad))) : 0;

      // Glass
      setRGB(o, tint);
      mixRGB(o, [0.30, 0.27, 0.20], grime * 0.9);
      o.rough = mix(0.03, 0.62, grime);
      o.rough = mix(o.rough, 0.02, Math.max(drop > 0 ? 1 : 0, streak) * 0.9);
      o.t = clamp(0.96 - 0.85 * grime);
      o.metal = 0;
      let h = 0.4 + 0.04 * wave + 0.12 * drop + 0.05 * streak;

      // Lead came: dull, slightly metallic, opaque, rounded profile.
      if (lead > 0) {
        const ln = nLead.fbm01(u, v, 64, 2);
        o.r = mix(o.r, 0.24 + 0.06 * ln, lead);
        o.g = mix(o.g, 0.24 + 0.06 * ln, lead);
        o.b = mix(o.b, 0.26 + 0.06 * ln, lead);
        o.rough = mix(o.rough, 0.5 + 0.15 * ln, lead);
        o.metal = mix(o.metal, 0.55, lead);
        o.t = mix(o.t, 0, lead);
        h = mix(h, 0.6 + 0.35 * leadProfile, lead);
      }
      o.h = h;
    };
  },
};
