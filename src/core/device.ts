/** Device class: phones/tablets get touch controls and a lighter quality tier. */
export const IS_TOUCH: boolean =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 1) &&
  !window.matchMedia?.('(pointer: fine)').matches;

/** Quality knobs (still within rule 5: ACES, soft PCF, pixel ratio ≤ 2). */
export const QUALITY = IS_TOUCH
  ? { maxPixelRatio: 1.5, shadowMap: 1024, lightPool: 8 }
  : { maxPixelRatio: 2, shadowMap: 2048, lightPool: 14 };
