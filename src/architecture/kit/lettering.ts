/**
 * Procedural sign-writing on offscreen canvases: painted grounds with
 * gold-leaf, cream or black serif lettering, borders and wear. Produces an
 * albedo map plus an ORM map (gold leaf = metallic & smoother), so gilding
 * catches the light properly. Fully offline (system serif fonts only).
 */
import * as THREE from 'three';
import { SeededRandom } from '../../core/random';

export type LetterStyle = 'gold' | 'cream' | 'black' | 'neon';

export interface LetteringOptions {
  text: string;
  sub?: string;
  /** Board aspect ratio (width / height). */
  aspect: number;
  ground: string;
  style?: LetterStyle;
  /** 0..1 — faded/flaked gilding and paint. */
  wear?: number;
  border?: boolean;
  seed?: string;
  italic?: boolean;
}

export function makeLettering(o: LetteringOptions): { map: THREE.CanvasTexture; orm: THREE.CanvasTexture } {
  const W = 1024, H = Math.max(96, Math.round(W / o.aspect));
  const rng = new SeededRandom(o.seed ?? o.text);
  const albedo = canvas(W, H), orm = canvas(W, H);
  const a = albedo.getContext('2d')!, r = orm.getContext('2d')!;
  const style = o.style ?? 'gold';

  // Ground
  a.fillStyle = o.ground; a.fillRect(0, 0, W, H);
  const shade = a.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(255,255,255,0.06)'); shade.addColorStop(1, 'rgba(0,0,0,0.25)');
  a.fillStyle = shade; a.fillRect(0, 0, W, H);
  r.fillStyle = 'rgb(255,150,0)'; r.fillRect(0, 0, W, H); // AO 1, rough ~0.6, metal 0

  const ink = (ctx: CanvasRenderingContext2D, which: 'albedo' | 'orm') => {
    if (which === 'orm') return style === 'gold' ? 'rgb(255,70,255)' : 'rgb(255,120,0)';
    if (style === 'gold') {
      const g = ctx.createLinearGradient(0, H * 0.2, 0, H * 0.8);
      g.addColorStop(0, '#f6dc8c'); g.addColorStop(0.5, '#c79a3a'); g.addColorStop(1, '#8a6420');
      return g;
    }
    return style === 'cream' ? '#efe2c2' : style === 'neon' ? '#fff4d0' : '#141110';
  };

  for (const [ctx, which] of [[a, 'albedo'], [r, 'orm']] as const) {
    if (o.border !== false) {
      ctx.strokeStyle = ink(ctx, which);
      ctx.lineWidth = H * 0.035;
      ctx.strokeRect(H * 0.07, H * 0.07, W - H * 0.14, H - H * 0.14);
      ctx.lineWidth = H * 0.012;
      ctx.strokeRect(H * 0.13, H * 0.13, W - H * 0.26, H - H * 0.26);
    }
    const mainH = o.sub ? H * 0.46 : H * 0.6;
    let size = mainH;
    const font = (s: number) => `${o.italic ? 'italic ' : ''}bold ${s}px Georgia, "Times New Roman", serif`;
    ctx.font = font(size);
    while (ctx.measureText(o.text).width > W * 0.86 && size > 10) ctx.font = font((size *= 0.94));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = o.sub ? H * 0.42 : H * 0.53;
    if (which === 'albedo' && style !== 'black') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillText(o.text, W / 2 + size * 0.03, y + size * 0.04);
    }
    ctx.fillStyle = ink(ctx, which);
    ctx.fillText(o.text, W / 2, y);
    if (o.sub) {
      let s2 = H * 0.17;
      ctx.font = `italic ${s2}px Georgia, serif`;
      while (ctx.measureText(o.sub).width > W * 0.8 && s2 > 8) ctx.font = `italic ${(s2 *= 0.94)}px Georgia, serif`;
      ctx.fillText(o.sub, W / 2, H * 0.76);
    }
  }

  // Wear: flakes knocked off both maps identically.
  const wear = o.wear ?? 0.2;
  const flakes = Math.round(wear * 900);
  for (let i = 0; i < flakes; i++) {
    const x = rng.range(0, W), y = rng.range(0, H), w = rng.range(2, 14) * (0.5 + wear), h = rng.range(1, 6);
    a.fillStyle = rng.chance(0.5) ? o.ground : 'rgba(40,30,22,0.8)';
    a.globalAlpha = rng.range(0.4, 1);
    a.fillRect(x, y, w, h);
    r.fillStyle = 'rgb(255,190,0)';
    r.fillRect(x, y, w, h);
  }
  a.globalAlpha = 1;
  // Grime gradient toward the bottom
  const grime = a.createLinearGradient(0, H * 0.5, 0, H);
  grime.addColorStop(0, 'rgba(20,14,8,0)'); grime.addColorStop(1, `rgba(20,14,8,${0.15 + wear * 0.35})`);
  a.fillStyle = grime; a.fillRect(0, 0, W, H);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const ormTex = new THREE.CanvasTexture(orm);
  ormTex.anisotropy = 8;
  return { map, orm: ormTex };
}

export function letteringMaterial(o: LetteringOptions): THREE.MeshStandardMaterial {
  const { map, orm } = makeLettering(o);
  const m = new THREE.MeshStandardMaterial({ map, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1 });
  if (o.style === 'neon') { m.emissiveMap = map; m.emissive = new THREE.Color(1, 0.9, 0.75); m.emissiveIntensity = 0.8; }
  m.name = `lettering:${o.text}`;
  return m;
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
