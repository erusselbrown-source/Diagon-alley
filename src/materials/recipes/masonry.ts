import { createWorleySample, hashInt, wrap } from '../noise';
import type { TextureRecipe } from './types';
import { clamp, mix, mixRGB, mulRGB, sdRoundBox, setRGB, smoothstep, type RGB } from './util';

/**
 * Aged London stock brick in stretcher bond: 215×65 mm bricks with irregular
 * 10 mm lime joints, kiln-flash variation, chipped arrises, soot smudging and
 * moss creeping from joints. (Height-based soot at the wall base is applied in
 * world space by `withBaseGrime`, since a tiling texture can't know the ground.)
 */
export const brick: TextureRecipe = {
  id: 'brick',
  label: 'Aged London brick',
  size: 1024,
  worldSize: 0.9,
  depth: 0.014 / 0.9,
  ao: { radius: 0.006, strength: 3 },
  material: { type: 'standard' },
  setup({ seed, noise, px }) {
    const PER_ROW = 4, COURSES = 12;
    const BW = 1 / PER_ROW, BH = 1 / COURSES; // brick + joint, tile units
    const J = 0.010 / 0.9 / 2; // half joint
    const STOCK: RGB[] = [
      [0.70, 0.58, 0.40], [0.64, 0.52, 0.35], [0.74, 0.63, 0.45], [0.56, 0.45, 0.31],
      [0.60, 0.47, 0.33], [0.68, 0.55, 0.37],
    ];
    const RED: RGB = [0.56, 0.30, 0.22];
    const CLINKER: RGB = [0.30, 0.23, 0.23];
    const nEdge = noise(1), nFace = noise(2), nSpeck = noise(3), nSoot = noise(4), nMoss = noise(5), nMortar = noise(6), nChip = noise(7);
    const pits = createWorleySample();

    return (u, v, o) => {
      const course = Math.floor(v * COURSES);
      const cy = wrap(course, COURSES);
      const xb = u * PER_ROW + (cy & 1 ? 0.5 : 0);
      const bi = Math.floor(xb);
      const bx = wrap(bi, PER_ROW);
      const id = hashInt(bx, cy, seed);
      const r1 = (id & 255) / 255, r2 = ((id >>> 8) & 255) / 255, r3 = ((id >>> 16) & 255) / 255, r4 = (id >>> 24) / 255;

      const lx = (xb - bi - 0.5) * BW, ly = (v * COURSES - course - 0.5) * BH;
      // Irregular joints: per-brick size/offset jitter plus wobbly edges.
      const wob = 0.0012 * nEdge.fbm(u, v, 24, 3);
      const hx = BW / 2 - J - 0.0015 * r1, hy = BH / 2 - J - 0.0012 * r2;
      const ox = (r3 - 0.5) * 0.002, oy = (r4 - 0.5) * 0.0015;
      const chipN = Math.max(0, nChip.fbm(u, v, 40, 3)) * 0.006;
      const d = sdRoundBox(lx - ox, ly - oy, hx, hy, 0.003) + wob + chipN;
      const isBrick = 1 - smoothstep(-px, px, d);
      const edge = clamp(-d / 0.006);

      // Brick face
      const face = nFace.fbm(u, v, 40, 4);
      const fine = nFace.perlin(u * 220, v * 220, 220, 220);
      nFace.worley(u, v, 90, 90, 1, pits);
      const pit = (1 - smoothstep(0.08, 0.18, pits.f1)) * ((pits.id & 3) === 0 ? 1 : 0);
      const hBrick = 0.62 + 0.2 * Math.sqrt(edge) + 0.1 * face + 0.03 * fine - 0.14 * pit;
      const mortarN = nMortar.fbm(u, v, 64, 3);
      const hMortar = 0.22 + 0.06 * mortarN;
      o.h = mix(hMortar, hBrick, isBrick);

      // Brick colour
      let c: RGB = STOCK[Math.floor(r1 * 6) % STOCK.length];
      if (r2 > 0.94) c = RED;
      else if (r2 < 0.04) c = CLINKER;
      setRGB(o, c, 0.86 + 0.22 * r3 + 0.35 * face + 0.06 * fine);
      mulRGB(o, 1 - 0.18 * smoothstep(0, 1, (lx / hx) * (r4 - 0.5) * 2 + 0.5) * r3); // kiln flash
      const sp = nSpeck.perlin(u * 380, v * 380, 380, 380);
      if (sp > 0.33) mulRGB(o, 0.55);
      else if (sp < -0.5) mixRGB(o, [0.85, 0.82, 0.74], 0.45); // lime inclusions
      mixRGB(o, [0.25, 0.19, 0.14], pit * 0.6);

      // Mortar
      const mortarCol: [number, number, number] = [0.56 + 0.05 * mortarN, 0.53 + 0.05 * mortarN, 0.48 + 0.05 * mortarN];
      mixRGB(o, mortarCol, 1 - isBrick);

      // Soot staining (city smoke) — patchy, heavier on some bricks
      const soot = clamp(smoothstep(0.42, 0.72, nSoot.fbm01(u, v, 3, 5)) * (0.55 + 0.45 * r4));
      mixRGB(o, [0.13, 0.11, 0.10], soot * 0.65);

      // Moss in joints and lower brick arrises
      const mossMask = smoothstep(0.5, 0.64, nMoss.fbm01(u, v, 4, 4));
      const nearJoint = (1 - isBrick) + isBrick * (1 - smoothstep(0, 0.004, -d)) * (ly < 0 ? 1 : 0.3);
      const moss = clamp(mossMask * nearJoint * (0.6 + 0.6 * nMoss.perlin(u * 200, v * 200, 200, 200)));
      mixRGB(o, [0.26, 0.32, 0.14], moss);
      o.h += 0.05 * moss;

      o.rough = mix(0.94, 0.82 + 0.08 * face, isBrick);
      o.rough = mix(o.rough, 0.98, Math.max(moss, soot * 0.4));
    };
  },
};

/**
 * Tudor lime plaster: hand-troweled facets (per-cell tilted planes with soft
 * ridges), sandy grain, uneven yellowing and masked hairline crack networks.
 */
export const plaster: TextureRecipe = {
  id: 'plaster',
  label: 'Tudor lime plaster',
  size: 1024,
  worldSize: 1.5,
  depth: 0.022 / 1.5,
  ao: { radius: 0.01, strength: 2 },
  material: { type: 'standard' },
  setup({ noise }) {
    const nBroad = noise(1), nTrowel = noise(2), nTrowel2 = noise(3), nGrain = noise(4), nCrack = noise(5), nCrackMask = noise(6), nYellow = noise(7), nWarp = noise(8);
    const w = createWorleySample(), w2 = createWorleySample(), wc = createWorleySample(), wc2 = createWorleySample();

    const trowel = (n: typeof nTrowel, u: number, v: number, cells: number, s: typeof w) => {
      n.worley(u, v, cells, cells, 0.9, s);
      const a = ((s.id >>> 4) & 1023) / 1023 * Math.PI * 2;
      const tiltK = 0.5 + 0.5 * ((s.id >>> 14) & 255) / 255;
      // tilt along a random direction, measured from the cell's feature point
      const tilt = (-s.dx * Math.cos(a) - s.dy * Math.sin(a)) * tiltK;
      return tilt * smoothstep(0, 0.35, s.f2 - s.f1); // flatten into soft ridges at borders
    };

    return (u, v, o) => {
      const broad = nBroad.fbm(u, v, 3, 4);
      const tr = 1.5 * (trowel(nTrowel, u, v, 7, w) + 0.5 * trowel(nTrowel2, u, v, 13, w2));
      const grain = nGrain.fbm(u, v, 96, 2);
      const sand = nGrain.perlin(u * 512, v * 512, 512, 512);

      // Hairline cracks: jagged Worley edges, shown only where the mask allows.
      const wu = u + 0.01 * nWarp.fbm(u, v, 16, 3), wv = v + 0.01 * nWarp.fbm(v, u, 16, 3);
      nCrack.worley(wu, wv, 5, 5, 1, wc);
      nCrack.worley(wu, wv, 14, 14, 1, wc2);
      const mask = smoothstep(0.12, 0.22, nCrackMask.fbm(u, v, 3, 3));
      const mask2 = smoothstep(0.18, 0.28, nCrackMask.fbm(u, v, 3, 3));
      const crack = Math.max(
        (1 - smoothstep(0.002, 0.008, wc.f2 - wc.f1)) * mask,
        (1 - smoothstep(0.003, 0.01, wc2.f2 - wc2.f1)) * mask2 * 0.7,
      );

      o.h = 0.5 + 0.18 * broad + 0.2 * tr + 0.03 * grain + 0.012 * sand - 0.2 * crack;

      const yellow = Math.pow(nYellow.fbm01(u, v, 3, 4), 1.4);
      setRGB(o, [0.91, 0.89, 0.83]);
      mixRGB(o, [0.84, 0.76, 0.56], clamp(yellow * 1.3 - 0.2));
      mulRGB(o, 0.95 + 0.1 * tr + 0.04 * grain);
      mixRGB(o, [0.62, 0.58, 0.50], clamp(-broad * 0.8) * 0.35); // grime in low areas
      mixRGB(o, [0.42, 0.39, 0.33], crack * 0.55);
      o.rough = 0.88 + 0.06 * grain + 0.06 * crack;
    };
  },
};
