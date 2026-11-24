import type { TexelOut } from './types';

export type RGB = readonly [number, number, number];

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Signed distance to a rounded box centred at the origin (negative inside). */
export function sdRoundBox(px: number, py: number, bx: number, by: number, r: number): number {
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

export function setRGB(o: TexelOut, c: RGB, k = 1): void {
  o.r = c[0] * k; o.g = c[1] * k; o.b = c[2] * k;
}

/** Blend the current colour toward c by t. */
export function mixRGB(o: TexelOut, c: RGB, t: number): void {
  o.r += (c[0] - o.r) * t; o.g += (c[1] - o.g) * t; o.b += (c[2] - o.b) * t;
}

export function mulRGB(o: TexelOut, k: number): void {
  o.r *= k; o.g *= k; o.b *= k;
}

/** Linear blend of two palette colours. */
export function lerpRGB(a: RGB, b: RGB, t: number): [number, number, number] {
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
