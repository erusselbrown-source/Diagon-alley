/** Hero shop slots along the street (s0 in metres from the archway). */
import type { Placement } from './plan';
import { OLLIVANDERS } from './ollivanders';
import { FLOURISH_BLOTTS } from './flourishBlotts';
import { WISEACRES } from './wiseacres';
import { WEASLEY_WHEEZES } from './weasleyWheezes';

export const HERO_PLACEMENTS: Placement[] = [
  { module: OLLIVANDERS, side: 'right', s0: 19.0 },
  { module: FLOURISH_BLOTTS, side: 'left', s0: 36.6 },
  { module: WISEACRES, side: 'right', s0: 40.0 },
  { module: WEASLEY_WHEEZES, side: 'left', s0: 57.8 },
];
