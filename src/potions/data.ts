/**
 * Cauldron Chaos — static game data: ingredients, potions (recipes) and levels.
 */

export type IngredientKind = 'mandrake' | 'moonstone' | 'toadstool' | 'lacewing' | 'scale';
export type PrepState = 'raw' | 'chopped' | 'crushed';
export type Prep = 'chop' | 'grind' | 'none';

export interface IngredientDef {
  kind: IngredientKind;
  name: string;
  prep: Prep;
  /** sRGB hex used for UI chips and the brew tint it contributes. */
  color: number;
}

export const INGREDIENTS: Record<IngredientKind, IngredientDef> = {
  mandrake: { kind: 'mandrake', name: 'Mandrake Root', prep: 'chop', color: 0xb08a5a },
  toadstool: { kind: 'toadstool', name: 'Toadstool', prep: 'chop', color: 0xd23a2c },
  moonstone: { kind: 'moonstone', name: 'Moonstone', prep: 'grind', color: 0xbfd8ff },
  scale: { kind: 'scale', name: 'Dragon Scale', prep: 'grind', color: 0xe0612a },
  lacewing: { kind: 'lacewing', name: 'Lacewing Fly', prep: 'none', color: 0x7fd07a },
};

/** The state an ingredient must be in before it may go into a cauldron. */
export function readyState(kind: IngredientKind): PrepState {
  const p = INGREDIENTS[kind].prep;
  return p === 'chop' ? 'chopped' : p === 'grind' ? 'crushed' : 'raw';
}

export type PotionId = 'calming' | 'swelling' | 'healing' | 'strength' | 'luck' | 'mess';

export interface PotionDef {
  id: PotionId;
  name: string;
  /** Ingredients (multiset, order-free). */
  recipe: IngredientKind[];
  /** Liquid colour (linear-ish, will be boosted to glow). */
  color: number;
  value: number;
}

export const POTIONS: Record<PotionId, PotionDef> = {
  calming: { id: 'calming', name: 'Calming Draught', recipe: ['mandrake', 'moonstone'], color: 0x39d6ff, value: 20 },
  swelling: { id: 'swelling', name: 'Swelling Solution', recipe: ['toadstool', 'toadstool', 'moonstone'], color: 0xff4fb8, value: 30 },
  healing: { id: 'healing', name: 'Healing Tonic', recipe: ['mandrake', 'mandrake', 'lacewing'], color: 0x4dff6a, value: 30 },
  strength: { id: 'strength', name: 'Strength Elixir', recipe: ['scale', 'mandrake', 'toadstool'], color: 0xff6a1a, value: 30 },
  luck: { id: 'luck', name: 'Liquid Fortune', recipe: ['scale', 'moonstone', 'lacewing'], color: 0xffd23a, value: 40 },
  mess: { id: 'mess', name: 'Muddled Mess', recipe: [], color: 0x5a4a2a, value: 0 },
};

/** Which potion a cauldron's contents make (null while it can still become something). */
export function matchPotion(contents: IngredientKind[]): PotionId {
  const key = [...contents].sort().join(',');
  for (const p of Object.values(POTIONS)) {
    if (p.recipe.length && [...p.recipe].sort().join(',') === key) return p.id;
  }
  return 'mess';
}

/**
 * Level map legend (one char per 1 m cell, row 0 = back wall):
 *   #  wall          .  floor           _  void (a drop)
 *   C  counter       X  chopping board  M  mortar & pestle
 *   K  cauldron      F  flask rack      T  vanishing bin
 *   D  delivery hatch (owl window)
 *   r/t/s/d/l  ingredient crate (mandrake/toadstool/moonstone/scale/lacewing)
 *   1/2  wizard spawns (floor)
 *   =  moving-platform floor (initial position; moves along `axis`)
 */
export interface PlatformDef {
  /** Distance travelled (cells) from the authored position; ping-pongs 0 → travel. */
  travel: number;
  axis: 'x' | 'z';
  /** Seconds for one leg, and the pause at each end. */
  period: number;
  pause: number;
  phase?: number;
  /** Which '=' cluster (by first-cell order) this definition drives. */
}

export interface LevelDef {
  id: number;
  name: string;
  blurb: string;
  map: string[];
  potions: PotionId[];
  duration: number;
  stars: [number, number, number];
  maxOrders: number;
  /** Seconds between new orders, and each order's patience. */
  orderEvery: number;
  patience: number;
  /** Seconds a finished brew can wait before it scorches and catches fire. */
  overbrew: number;
  platforms: PlatformDef[];
  /** Wall-torch/ambient mood. */
  mood: 'cellar' | 'tower' | 'storm';
}

export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: 'The Cellar Classroom',
    blurb: 'A candlelit stone cellar beneath the alley. Brew Calming Draughts and Swelling Solutions for the owl post.',
    map: [
      '#############',
      '#CrCtCsCKCKD#',
      '#...........#',
      '#X..1...2..F#',
      '#C...CCC...C#',
      '#M...CKC...T#',
      '#...........#',
      '#CMCXCCCXCCC#',
      '#############',
    ],
    potions: ['calming', 'swelling'],
    duration: 180,
    stars: [60, 140, 220],
    maxOrders: 4,
    orderEvery: 20,
    patience: 85,
    overbrew: 11,
    platforms: [],
    mood: 'cellar',
  },
  {
    id: 2,
    name: 'The Shifting Stair',
    blurb: 'Two landings and one drifting stair between them. Ride it, or toss ingredients across the gap.',
    map: [
      '#################',
      '#CrCsCl___CKCKCD#',
      '#......___......#',
      '#X.1...=__...2.F#',
      '#C.....=__.....T#',
      '#MCtCXC___CMCXCC#',
      '#################',
    ],
    potions: ['calming', 'swelling', 'healing'],
    duration: 200,
    stars: [70, 160, 250],
    maxOrders: 4,
    orderEvery: 19,
    patience: 90,
    overbrew: 10,
    platforms: [{ travel: 2, axis: 'x', period: 2.2, pause: 2.6 }],
    mood: 'tower',
  },
  {
    id: 3,
    name: 'Storm over the Turret',
    blurb: 'Rain lashes the turret laboratory. Twin drifting stairs, quick-scorching brews and precious Liquid Fortune.',
    map: [
      '###############',
      '#CrCtCKCKCsCdD#',
      '#.............#',
      '#X..1.....2..F#',
      '#__=_______=__#',
      '#_____________#',
      '#.............#',
      '#M...CKC.....T#',
      '#CXClCCCMCXCFC#',
      '###############',
    ],
    potions: ['strength', 'luck', 'healing', 'calming'],
    duration: 210,
    stars: [80, 180, 280],
    maxOrders: 5,
    orderEvery: 17,
    patience: 95,
    overbrew: 8,
    platforms: [
      { travel: 1, axis: 'z', period: 1.4, pause: 2.4 },
      { travel: 1, axis: 'z', period: 1.4, pause: 2.4, phase: 0.5 },
    ],
    mood: 'storm',
  },
];
