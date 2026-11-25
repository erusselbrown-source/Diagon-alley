/**
 * Victorian shopfront composer for a ground storey: pilasters with plinth
 * blocks and capitals, scroll consoles flanking a gilded fascia, moulded
 * cornice, and a left-to-right run of bow bays, flat windows and doors.
 *
 * Use: `const sf = planShopfront(kit, width, spec)` → pass `sf.openings` to the
 * ground storey, then `sf.build(storeyGroup)` once the storey exists.
 */
import * as THREE from 'three';
import type { MaterialId } from '../../materials';
import type { Kit } from './context';
import { buildBayWindow, buildFlatWindow, corbelGeometry, type Bay } from './bay';
import { buildDoor } from './door';
import { GeometryBucket, PROFILES, extrudeProfile } from './geometry';
import { letteringMaterial, type LetterStyle } from './lettering';
import type { WallOpening } from './wall';

export type ShopfrontItem =
  | { kind: 'bay'; width: number; projection?: number; panes?: [number, number]; facets?: number }
  | { kind: 'window'; width: number; panes?: [number, number] }
  | { kind: 'door'; width?: number; fanlight?: boolean; glazed?: boolean; openable?: boolean };

export interface ShopfrontSpec {
  height: number;
  items: ShopfrontItem[];
  name: string;
  sub?: string;
  letterStyle?: LetterStyle;
  fasciaColor: string;
  paint: MaterialId | THREE.Material;
  muntin?: THREE.Material;
  doorLeaf?: THREE.Material;
  /** Shop floor height above the pavement (door threshold). */
  floor?: number;
  wear?: number;
  interiorGlow?: THREE.ColorRepresentation;
  interior?: MaterialId;
  fasciaHeight?: number;
}

export interface PlacedDisplay { anchor: THREE.Object3D; bay: Bay; kind: 'bay' | 'window' }
export interface PlacedDoor { x: number; width: number; floor: number; leaves?: THREE.Object3D[] }

export interface Shopfront {
  openings: WallOpening[];
  build(storey: THREE.Group): { displays: PlacedDisplay[]; doors: PlacedDoor[]; fascia: THREE.Object3D };
}

const PIL = 0.28, PIER = 0.16;

/** Clear, slightly wavy plate glass for display windows (leaded grime would hide the stock). */
export function shopGlass(kit: Kit): THREE.Material {
  return kit.mats.memo('shop-glass', () => {
    const base = kit.mats.get('glass');
    const g = new THREE.MeshStandardMaterial({
      color: 0xdde6e2, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16,
      normalMap: base.normalMap, normalScale: new THREE.Vector2(0.12, 0.12), envMapIntensity: 1.5, side: THREE.DoubleSide,
    });
    g.name = 'glass-shop';
    return g;
  });
}

export function planShopfront(kit: Kit, width: number, spec: ShopfrontSpec): Shopfront {
  const M = kit.mats;
  const paint = typeof spec.paint === 'string' ? M.get(spec.paint) : spec.paint;
  const H = spec.height;
  const FH = spec.fasciaHeight ?? 0.55;
  const floor = spec.floor ?? 0.16;
  const fasciaY0 = H - 0.12 - FH;
  const winTop = fasciaY0 - 0.12;

  // Distribute widths: doors keep theirs; windows/bays share the remainder.
  const avail = width - 2 * PIL - PIER * (spec.items.length - 1);
  const fixed = spec.items.reduce((a, it) => a + (it.kind === 'door' ? (it.width ?? 1.0) + 0.5 : 0), 0);
  const flex = spec.items.filter((it) => it.kind !== 'door');
  const want = flex.reduce((a, it) => a + it.width, 0);
  const k = flex.length ? Math.max(0.5, (avail - fixed) / want) : 1;
  const widths = spec.items.map((it) => (it.kind === 'door' ? (it.width ?? 1.0) + 0.5 : it.width * k));
  const xs: number[] = [];
  let x = PIL;
  for (const wdt of widths) { xs.push(x + wdt / 2); x += wdt + PIER; }
  const shift = (width - (x - PIER + PIL)) / 2;
  for (let i = 0; i < xs.length; i++) xs[i] += shift;

  const interior = M.interior(spec.interior ?? 'oak', spec.interiorGlow ?? 0xffb066, 0.6);
  const parts: { item: ShopfrontItem; cx: number; w: number; obj: Bay | ReturnType<typeof buildDoor> }[] = [];
  const openings: WallOpening[] = [];
  spec.items.forEach((it, i) => {
    const cx = xs[i], w = widths[i];
    if (it.kind === 'door') {
      const d = buildDoor({
        width: it.width ?? 1.0, height: Math.min(2.3, winTop - floor - 0.5), floor, transom: 0.4, fanlight: it.fanlight, glazedUpper: it.glazed ?? true,
        leaf: spec.doorLeaf ?? paint, frame: paint, stone: M.get('sandstone'), brass: M.get('brass'), glass: M.get('glass'), interior, openable: it.openable,
      });
      parts.push({ item: it, cx, w, obj: d });
      openings.push({ kind: 'void', x: cx + d.hole.x, y: d.hole.y, width: d.hole.width, height: d.hole.height });
    } else {
      const sill = floor + 0.5;
      const common = {
        width: w, height: winTop - sill, sill, frame: paint, muntin: spec.muntin ?? paint, glass: shopGlass(kit),
        stone: M.get('sandstone'), interior,
      };
      const bay = it.kind === 'bay'
        ? buildBayWindow({ ...common, projection: it.projection ?? Math.min(0.6, w * 0.22), facets: it.facets ?? 5, panes: it.panes ?? [2, 3] })
        : buildFlatWindow({ ...common, panes: it.panes ?? [3, 3] });
      parts.push({ item: it, cx, w, obj: bay });
      openings.push({ kind: 'void', x: cx + bay.hole.x, y: bay.hole.y, width: bay.hole.width, height: bay.hole.height });
    }
  });

  return {
    openings,
    build(storey) {
      const displays: PlacedDisplay[] = [];
      const doors: PlacedDoor[] = [];
      for (const p of parts) {
        const lx = p.cx - width / 2;
        p.obj.group.position.x = lx;
        storey.add(p.obj.group);
        if (p.item.kind === 'door') { const d = p.obj as ReturnType<typeof buildDoor>; doors.push({ x: lx, width: d.width, floor, leaves: d.leaves }); }
        else displays.push({ anchor: (p.obj as Bay).display, bay: p.obj as Bay, kind: p.item.kind });
      }

      const b = new GeometryBucket();
      // Pilasters at both ends + piers between items
      const pierXs = [PIL / 2, width - PIL / 2];
      for (let i = 0; i < parts.length - 1; i++) pierXs.push((parts[i].cx + parts[i].w / 2 + parts[i + 1].cx - parts[i + 1].w / 2) / 2);
      for (const px of pierXs) {
        const pw = px < 0.5 || px > width - 0.5 ? PIL : PIER;
        const lx = px - width / 2;
        b.box(paint, pw, fasciaY0, 0.1, 0.015, { x: lx, y: fasciaY0 / 2, z: 0.05 });
        b.box(paint, pw * 0.55, fasciaY0 * 0.62, 0.03, 0.01, { x: lx, y: fasciaY0 * 0.55, z: 0.105 });
        b.box(M.get('sandstone'), pw + 0.05, 0.22, 0.15, 0.02, { x: lx, y: 0.11, z: 0.06 });
        b.box(paint, pw + 0.06, 0.12, 0.15, 0.02, { x: lx, y: fasciaY0 - 0.06, z: 0.06 });
      }
      // Consoles flanking the fascia
      for (const sx of [-1, 1]) {
        const lx = sx * (width / 2 - PIL / 2);
        b.add(paint, corbelGeometry(0.24, FH + 0.05, 0.16), new THREE.Matrix4().makeTranslation(lx, H - 0.14, 0.02));
      }
      // Fascia board + lettering + cornice
      const fw = width - 2 * PIL - 0.06;
      b.box(paint, fw + 0.08, FH + 0.08, 0.08, 0.015, { x: 0, y: fasciaY0 + FH / 2, z: 0.06 });
      b.add(paint, extrudeProfile(PROFILES.cornice(0.26), width + 0.16), new THREE.Matrix4().makeTranslation(-width / 2 - 0.08, H - 0.12 - 0.04, 0.04));
      const group = b.build('shopfront');
      storey.add(group);
      const fascia = new THREE.Mesh(new THREE.PlaneGeometry(fw, FH), letteringMaterial({
        text: spec.name, sub: spec.sub, aspect: fw / FH, ground: spec.fasciaColor, style: spec.letterStyle ?? 'gold', wear: spec.wear ?? 0.25, seed: spec.name,
      }));
      fascia.position.set(0, fasciaY0 + FH / 2, 0.102);
      fascia.rotation.x = -0.04;
      storey.add(fascia);
      return { displays, doors, fascia };
    },
  };
}
