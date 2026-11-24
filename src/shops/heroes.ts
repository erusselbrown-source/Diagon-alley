/**
 * Hero shop slots along the street (s0 in metres from the archway). Slots are
 * snapped flush against neighbouring reservations so no sliver of frontage
 * is left narrower than the smallest filler (2.2 m).
 */
import type { Placement } from './plan';
import { OLLIVANDERS } from './ollivanders';
import { FLOURISH_BLOTTS } from './flourishBlotts';
import { WISEACRES } from './wiseacres';
import { WEASLEY_WHEEZES } from './weasleyWheezes';

export const HERO_PLACEMENTS: Placement[] = [
  { module: OLLIVANDERS, side: 'right', s0: 18.05 }, // flush after the alcove at s = 17
  { module: FLOURISH_BLOTTS, side: 'left', s0: 45.55 - 7.6 }, // flush against Knockturn's mouth
  { module: WISEACRES, side: 'right', s0: 40.0 },
  { module: WEASLEY_WHEEZES, side: 'left', s0: 57.8 },
];
