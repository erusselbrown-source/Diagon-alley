import { brass, iron } from './metal';
import { brick, plaster } from './masonry';
import { cobblestone, marble, slate } from './stone';
import { glass } from './glass';
import { oak, paintedWood, PAINT_PALETTES, type PaintId } from './wood';
import type { TextureRecipe } from './types';

export { PAINT_PALETTES };

export type MaterialId =
  | 'cobblestone' | 'brick' | 'plaster' | 'oak' | PaintId
  | 'slate' | 'iron' | 'brass' | 'marble' | 'glass';

const paints = Object.fromEntries(PAINT_PALETTES.map((p) => [`paint-${p.id}`, paintedWood(p)])) as Record<PaintId, TextureRecipe>;

export const RECIPES: Record<MaterialId, TextureRecipe> = {
  cobblestone, brick, plaster, oak, ...paints, slate, iron, brass, marble, glass,
};

export const MATERIAL_IDS = Object.keys(RECIPES) as MaterialId[];
