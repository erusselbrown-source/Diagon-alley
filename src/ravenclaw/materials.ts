/**
 * The tower room's material palette: procedural PBR recipes from the shared
 * MaterialLibrary plus a few hand-tuned physical materials (velvet, wax,
 * porcelain) and canvas-painted surfaces.
 */
import * as THREE from 'three';
import type { MaterialLibrary, MaterialId } from '../materials';
import { paintCarpet, paintParchment, paintBookPages, paintBanner, paintChessboard, paintClockFace, paintScarf } from './textures';

export const ROOM_MATERIALS: MaterialId[] = [
  'ashlar', 'marble', 'walnut', 'parquet', 'silk', 'bronze', 'brass', 'iron', 'leather', 'glass', 'oak', 'velvet', 'granite', 'slate',
];

/** Texture tile sizes (metres) — keep in sync with the recipes. */
export const WS = { ashlar: 2.4, marble: 1, walnut: 1.2, parquet: 1.6, silk: 0.5, bronze: 0.4, brass: 0.4, iron: 0.5, leather: 0.35, oak: 1, velvet: 0.4, granite: 1.2, slate: 1.0 } as const;

export interface RoomMats {
  ashlar: THREE.MeshStandardMaterial;
  ashlarDark: THREE.MeshStandardMaterial;
  marble: THREE.MeshStandardMaterial;
  statue: THREE.MeshStandardMaterial;
  walnut: THREE.MeshStandardMaterial;
  oak: THREE.MeshStandardMaterial;
  floor: THREE.MeshStandardMaterial;
  silk: THREE.MeshStandardMaterial;
  bronze: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  soot: THREE.MeshStandardMaterial;
  leather: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  flags: THREE.MeshStandardMaterial;
  velvet: THREE.MeshPhysicalMaterial;
  velvetDark: THREE.MeshPhysicalMaterial;
  wax: THREE.MeshPhysicalMaterial;
  porcelain: THREE.MeshPhysicalMaterial;
  carpet: THREE.MeshPhysicalMaterial;
  hearthRug: THREE.MeshPhysicalMaterial;
  parchment: THREE.MeshStandardMaterial[];
  starChart: THREE.MeshStandardMaterial;
  pages: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  banner: THREE.MeshPhysicalMaterial;
  chess: THREE.MeshStandardMaterial;
  clockFace: THREE.MeshStandardMaterial;
  scarf: THREE.MeshPhysicalMaterial;
  ember: THREE.MeshStandardMaterial;
  feather: THREE.MeshStandardMaterial;
  inkGlass: THREE.MeshPhysicalMaterial;
  clearGlass: THREE.MeshPhysicalMaterial;
  wool: THREE.MeshPhysicalMaterial;
  bookCover: THREE.MeshStandardMaterial;
  bookPages: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
  sapphire: THREE.MeshPhysicalMaterial;
}

export function createRoomMaterials(lib: MaterialLibrary, hi: boolean): RoomMats {
  const tint = (id: MaterialId, color: THREE.ColorRepresentation, name: string, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => {
    const m = lib.get(id).clone() as THREE.MeshStandardMaterial;
    m.color = new THREE.Color(color);
    Object.assign(m, extra);
    m.name = name;
    return m;
  };
  const velvetN = lib.getMaps('velvet').normalMap;
  const velvet = new THREE.MeshPhysicalMaterial({
    name: 'blue-velvet', color: 0x1a2c66, roughness: 0.82, sheen: 1, sheenColor: new THREE.Color(0x6688dd), sheenRoughness: 0.45,
    normalMap: velvetN, normalScale: new THREE.Vector2(0.6, 0.6),
  });
  const velvetDark = velvet.clone();
  velvetDark.color.set(0x111d44);
  velvetDark.name = 'blue-velvet-dark';
  const carpetMap = paintCarpet(hi);
  const carpet = new THREE.MeshPhysicalMaterial({
    name: 'carpet', map: carpetMap, roughness: 0.95, sheen: 0.8, sheenColor: new THREE.Color(0x4a66aa), sheenRoughness: 0.6,
    normalMap: velvetN, normalScale: new THREE.Vector2(0.8, 0.8), transparent: false, alphaTest: 0.5,
  });
  const hearthRug = new THREE.MeshPhysicalMaterial({
    name: 'hearth-rug', color: 0x6a4a2a, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xb08a5a), normalMap: velvetN,
  });
  const parchment = ['a', 'b', 'c', 'd'].map((s) => new THREE.MeshStandardMaterial({ name: `parchment-${s}`, map: paintParchment(`p-${s}`), roughness: 0.85, side: THREE.DoubleSide }));
  const starChart = new THREE.MeshStandardMaterial({ name: 'star-chart', map: paintParchment('chart', true), roughness: 0.85, side: THREE.DoubleSide });
  const pages = new THREE.MeshStandardMaterial({ name: 'pages', map: paintBookPages('pages'), roughness: 0.9, side: THREE.DoubleSide });
  const banner = new THREE.MeshPhysicalMaterial({
    name: 'banner', map: paintBanner(), roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(0x5577cc), side: THREE.DoubleSide, alphaTest: 0.5,
    normalMap: lib.getMaps('silk').normalMap,
  });
  const scarfTex = paintScarf();
  const scarf = new THREE.MeshPhysicalMaterial({ name: 'scarf', map: scarfTex, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x8899cc), side: THREE.DoubleSide, normalMap: velvetN });
  return {
    ashlar: lib.get('ashlar'),
    ashlarDark: tint('ashlar', 0x8d8a92, 'ashlar-dark'),
    marble: lib.get('marble'),
    statue: tint('marble', 0xf4f2ee, 'statue-marble', { envMapIntensity: 0.8 }),
    walnut: lib.get('walnut'),
    oak: tint('oak', 0x7a6a5a, 'oak-logs'),
    floor: lib.get('parquet'),
    silk: lib.get('silk'),
    bronze: lib.get('bronze'),
    brass: lib.get('brass'),
    iron: lib.get('iron'),
    soot: tint('iron', 0x2a2522, 'soot'),
    leather: lib.get('leather'),
    glass: (() => { const g = lib.get('glass').clone(); g.color = new THREE.Color(0xc8d6ff); g.opacity = 0.9; g.name = 'window-glass'; g.depthWrite = false; return g; })(),
    flags: lib.get('granite'),
    velvet,
    velvetDark,
    wax: new THREE.MeshPhysicalMaterial({ name: 'wax', color: 0xf1e6cc, roughness: 0.55, transmission: 0, sheen: 0.4, sheenColor: new THREE.Color(0xffe2b0), emissive: new THREE.Color(0x3a2208), emissiveIntensity: 0.4 }),
    porcelain: new THREE.MeshPhysicalMaterial({ name: 'porcelain', color: 0xe8eef6, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }),
    carpet,
    hearthRug,
    parchment,
    starChart,
    pages,
    paper: new THREE.MeshStandardMaterial({ name: 'paper', color: 0xe6d6b0, roughness: 0.9, side: THREE.DoubleSide }),
    banner,
    chess: new THREE.MeshStandardMaterial({ name: 'chess', map: paintChessboard(), roughness: 0.35 }),
    clockFace: new THREE.MeshStandardMaterial({ name: 'clock-face', map: paintClockFace(), roughness: 0.5 }),
    scarf,
    ember: new THREE.MeshStandardMaterial({ name: 'ember', color: 0x220a02, emissive: new THREE.Color(1.0, 0.32, 0.06), emissiveIntensity: 2.2, roughness: 1 }),
    feather: new THREE.MeshStandardMaterial({ name: 'feather', color: 0xd99a50, metalness: 1, roughness: 0.25, emissive: new THREE.Color(0.9, 0.55, 0.2), emissiveIntensity: 0.9, side: THREE.DoubleSide }),
    inkGlass: new THREE.MeshPhysicalMaterial({ name: 'ink-glass', color: 0x0a0f1a, roughness: 0.05, clearcoat: 1, metalness: 0 }),
    clearGlass: new THREE.MeshPhysicalMaterial({ name: 'clear-glass', color: 0xdde8ff, roughness: 0.03, transparent: true, opacity: 0.25, depthWrite: false, envMapIntensity: 2 }),
    wool: new THREE.MeshPhysicalMaterial({ name: 'wool', color: 0x2b3f7a, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0x8899dd), normalMap: velvetN }),
    bookCover: (() => { const m = lib.get('leather').clone(); m.color = new THREE.Color(0xffffff); m.name = 'book-cover'; return m; })(),
    bookPages: new THREE.MeshStandardMaterial({ name: 'book-pages', color: 0xd9c9a2, roughness: 0.95 }),
    black: new THREE.MeshStandardMaterial({ name: 'black', color: 0x050608, roughness: 0.9 }),
    sapphire: new THREE.MeshPhysicalMaterial({ name: 'sapphire', color: 0x2a5cff, roughness: 0.05, metalness: 0, clearcoat: 1, emissive: new THREE.Color(0.1, 0.25, 1.0), emissiveIntensity: 0.3 }),
  };
}
