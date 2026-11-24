import { createWorleySample, hash01, wrap, wrapDelta } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, mulRGB, setRGB, smoothstep, type RGB } from './util';

/**
 * Weathered dark oak: growth rings warped around knots (grain runs along U),
 * proud latewood, open weathering checks, hand-adzed scallops and
 * silvering on exposed surfaces.
 */
export const oak: TextureRecipe = {
  id: 'oak',
  label: 'Weathered dark oak',
  size: 1024,
  worldSize: 1.0,
  depth: 0.012,
  ao: { radius: 0.005, strength: 3 },
  material: { type: 'standard' },
  setup({ seed, noise }) {
    const RINGS = 22, ADZE = 7, ADZE_BANDS = 4;
    const nWarp = noise(1), nGrain = noise(2), nCheck = noise(3), nCheckMask = noise(4), nWeather = noise(5), nAdze = noise(6);
    const knots = Array.from({ length: 3 }, (_, k) => ({
      x: hash01(k, 1, seed), y: hash01(k, 2, seed), r: 0.014 + 0.012 * hash01(k, 3, seed),
    }));

    return (u, v, o) => {
      let s = v * RINGS + 1.2 * nWarp.fbmAniso(u, v, 1, 2, 3) + 0.35 * nWarp.fbmAniso(u, v, 3, 10, 3);
      let knot = 0;
      for (const k of knots) {
        const ex = wrapDelta(u - k.x) / (k.r * 2.6), ey = wrapDelta(v - k.y) / k.r;
        const r2 = ex * ex + ey * ey;
        s -= 2.6 * Math.exp(-r2 * 0.3); // rings flow around the knot
        knot = Math.max(knot, 1 - smoothstep(0.55, 1.0, Math.sqrt(r2)));
      }
      const ring = s - Math.floor(s);
      const late = smoothstep(0.55, 0.8, ring) * (1 - smoothstep(0.9, 1.0, ring));
      const grain = nGrain.fbmAniso(u, v, 2, 256, 3);
      const pores = nGrain.perlin(u * 48, v * 448, 48, 448);

      // Weathering checks: long thin fissures along the grain.
      const ck = nCheck.fbmAniso(u, v, 1, 64, 3);
      const check = (1 - smoothstep(0.0, 0.035, Math.abs(ck))) * smoothstep(0.05, 0.25, nCheckMask.fbm(u, v, 3, 3));

      // Adze scallops across the grain, staggered per band.
      const band = Math.floor(v * ADZE_BANDS);
      const a = u * ADZE + 0.5 * wrap(band, 2) + 0.12 * nAdze.fbm(u, v, 4, 2);
      const af = a - Math.floor(a);
      const scoop = 1 - (af - 0.5) * (af - 0.5) * 4; // 1 at centre of a cut, 0 at ridge

      const weather = nWeather.fbm01(u, v, 4, 4);
      o.h = 0.55 + 0.1 * late + 0.04 * grain + 0.015 * pores - 0.1 * scoop - 0.5 * check + 0.06 * knot;

      setRGB(o, [0.25, 0.165, 0.10]);
      mixRGB(o, [0.13, 0.085, 0.05], late * 0.85);
      mulRGB(o, 0.85 + 0.4 * grain + 0.06 * pores);
      // Silvering on exposed, raised wood
      mixRGB(o, [0.40, 0.37, 0.33], clamp((weather - 0.42) * 2.2) * (1 - 0.6 * late) * 0.6);
      if (knot > 0) {
        const kr = Math.sin(knot * 40) * 0.5 + 0.5;
        mixRGB(o, [0.10 + 0.04 * kr, 0.06 + 0.02 * kr, 0.035], knot);
      }
      mulRGB(o, 1 - 0.8 * check);
      mulRGB(o, 1 - 0.08 * scoop);
      o.rough = clamp(0.74 + 0.12 * weather - 0.06 * late + 0.2 * check);
    };
  },
};

export interface PaintPalette {
  id: string;
  label: string;
  top: RGB;
  under: RGB;
  /** Roughness of the top coat. */
  gloss: number;
}

export const PAINT_PALETTES = [
  { id: 'emerald', label: 'Deep emerald', top: [0.05, 0.30, 0.20], under: [0.84, 0.79, 0.65], gloss: 0.34 },
  { id: 'oxblood', label: 'Oxblood burgundy', top: [0.36, 0.06, 0.07], under: [0.25, 0.20, 0.17], gloss: 0.36 },
  { id: 'indigo', label: 'Midnight indigo', top: [0.08, 0.10, 0.25], under: [0.56, 0.58, 0.56], gloss: 0.36 },
  { id: 'ochre', label: 'Faded ochre', top: [0.72, 0.56, 0.27], under: [0.33, 0.40, 0.31], gloss: 0.5 },
  { id: 'charcoal', label: 'Charcoal slate', top: [0.19, 0.21, 0.23], under: [0.62, 0.26, 0.17], gloss: 0.38 },
  { id: 'weasley', label: 'Weasley orange / violet', top: [0.94, 0.40, 0.07], under: [0.42, 0.16, 0.56], gloss: 0.3 },
] as const satisfies readonly PaintPalette[];

export type PaintId = `paint-${(typeof PAINT_PALETTES)[number]['id']}`;

/**
 * Painted Victorian shopfront boarding: vertical tongue-and-groove boards,
 * grain and brush strokes telegraphing through the paint, crazing, and
 * chips (densest at board edges) revealing an older coat, then bare wood.
 */
export function paintedWood(p: PaintPalette): TextureRecipe {
  return {
    id: `paint-${p.id}`,
    label: `Painted wood — ${p.label}`,
    size: 1024,
    worldSize: 0.9,
    depth: 0.006 / 0.9,
    ao: { radius: 0.004, strength: 3 },
    material: { type: 'standard' },
    setup({ seed, noise, px }) {
      const BOARDS = 6;
      const nGrain = noise(1), nBrush = noise(2), nChip = noise(3), nCraze = noise(4), nFade = noise(5);
      const w = createWorleySample();
      const WOOD: RGB = [0.45, 0.37, 0.28];
      const aa = 0.004 + 2 * px;

      return (u, v, o) => {
        const bu = u * BOARDS;
        const bi = Math.floor(bu);
        const bx = bu - bi;
        const edgeDist = Math.min(bx, 1 - bx) / BOARDS;
        const groove = 1 - smoothstep(0.0015, 0.0055, edgeDist);
        const bh = hash01(wrap(bi, BOARDS), 7, seed);

        const grain = nGrain.fbmAniso(u, v + bh, 128, 4, 3);
        const brush = nBrush.fbmAniso(u, v, 320, 6, 2);

        const chipN = nChip.fbm01(u, v, 10, 5) + 0.08 * nChip.perlin(u * 96, v * 96, 96, 96);
        const c = chipN + 0.2 * (1 - smoothstep(0, 0.012, edgeDist)) * (0.3 + nChip.fbm01(u, v, 6, 2));
        const topChip = smoothstep(0.71 - aa, 0.71 + aa, c);
        const deepChip = smoothstep(0.79 - aa, 0.79 + aa, c);

        nCraze.worley(u, v, 44, 44, 1, w);
        const craze = (1 - smoothstep(0.02, 0.05, w.f2 - w.f1)) * smoothstep(0.55, 0.65, nCraze.fbm01(u, v, 4, 3)) * (1 - topChip);

        o.h = 0.75 - 0.12 * topChip - 0.1 * deepChip - 0.45 * groove + 0.025 * grain + 0.012 * brush - 0.04 * craze;

        setRGB(o, p.top);
        const fade = smoothstep(0.5, 0.75, nFade.fbm01(u, v, 3, 4));
        mixRGB(o, [o.r * 0.6 + 0.3, o.g * 0.6 + 0.3, o.b * 0.6 + 0.28], fade * 0.3);
        mulRGB(o, 0.96 + 0.06 * grain + 0.03 * brush);
        mixRGB(o, p.under, topChip);
        mixRGB(o, [WOOD[0] * (0.85 + 0.3 * grain), WOOD[1] * (0.85 + 0.3 * grain), WOOD[2] * (0.85 + 0.3 * grain)], deepChip);
        mulRGB(o, 1 - 0.45 * groove);
        mulRGB(o, 1 - 0.3 * craze);
        o.rough = mix(p.gloss + 0.06 * brush + 0.1 * fade, 0.62, topChip);
        o.rough = clamp(mix(o.rough, 0.86, deepChip) + 0.25 * groove);
      };
    },
  };
}
