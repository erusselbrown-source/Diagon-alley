import { brass, iron } from './metal';
import { brick, plaster } from './masonry';
import { cobblestone, marble, slate } from './stone';
import { glass } from './glass';
import { granite, grit, sandstone } from './aggregate';
import { copper, dragonhide, leather, slateTile, velvet } from './trades';
import { oak, paintedWood, PAINT_PALETTES, type PaintId } from './wood';
import { ashlar, bronze, parquet, silk, walnut } from './tower';
import type { TextureRecipe } from './types';

export { PAINT_PALETTES };

export type MaterialId =
  | 'cobblestone' | 'brick' | 'plaster' | 'oak' | PaintId
  | 'slate' | 'iron' | 'brass' | 'marble' | 'glass'
  | 'granite' | 'sandstone' | 'grit'
  | 'slate-tile' | 'copper' | 'leather' | 'velvet' | 'dragonhide'
  | 'walnut' | 'ashlar' | 'parquet' | 'silk' | 'bronze';

const paints = Object.fromEntries(PAINT_PALETTES.map((p) => [`paint-${p.id}`, paintedWood(p)])) as Record<PaintId, TextureRecipe>;

export const RECIPES: Record<MaterialId, TextureRecipe> = {
  cobblestone, brick, plaster, oak, ...paints, slate, iron, brass, marble, glass, granite, sandstone, grit,
  'slate-tile': slateTile, copper, leather, velvet, dragonhide,
  walnut, ashlar, parquet, silk, bronze,
};

export const MATERIAL_IDS = Object.keys(RECIPES) as MaterialId[];
