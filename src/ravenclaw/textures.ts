/**
 * Canvas-painted textures unique to the tower room (no image files):
 * the star-painted dome fresco, the great round carpet, house banners,
 * oil paintings, parchment, star charts and open book pages.
 * Everything is drawn from a SeededRandom so it is identical every load.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import { canvas, canvasTexture } from './util';

export const BLUE = '#14306e';
export const DEEP = '#0a1638';
export const BRONZE = '#b07a3e';
export const BRONZE_HI = '#e2b06a';

/** Original heraldic eagle "displayed", head turned right. Unit coords (−1..1), y up. */
export const EAGLE: readonly [number, number][] = [
  [0, -0.98], [0.07, -0.78], [0.2, -0.9], [0.14, -0.55], [0.22, -0.46], [0.38, -0.5], [0.28, -0.38],
  [0.22, -0.1], [0.44, -0.06], [0.6, -0.16], [0.62, 0], [0.78, -0.04], [0.76, 0.14], [0.9, 0.12],
  [0.86, 0.3], [0.98, 0.32], [0.92, 0.5], [1.0, 0.6], [0.85, 0.85], [0.6, 0.95], [0.35, 0.8],
  [0.16, 0.42], [0.3, 0.5], [0.37, 0.57], [0.27, 0.65], [0.12, 0.7], [0.0, 0.66], [-0.08, 0.6],
  [-0.14, 0.42], [-0.35, 0.8], [-0.6, 0.95], [-0.85, 0.85], [-1.0, 0.6], [-0.92, 0.5], [-0.98, 0.32],
  [-0.86, 0.3], [-0.9, 0.12], [-0.76, 0.14], [-0.78, -0.04], [-0.62, 0], [-0.6, -0.16], [-0.44, -0.06],
  [-0.22, -0.1], [-0.28, -0.38], [-0.38, -0.5], [-0.22, -0.46], [-0.14, -0.55], [-0.2, -0.9], [-0.07, -0.78],
];

export function eagleShape(scale = 1): THREE.Shape {
  return new THREE.Shape(EAGLE.map(([x, y]) => new THREE.Vector2(x * scale, y * scale)));
}

function drawEagle(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, fill: string | CanvasGradient, stroke?: string): void {
  g.beginPath();
  EAGLE.forEach(([x, y], i) => (i ? g.lineTo(cx + x * s, cy - y * s) : g.moveTo(cx + x * s, cy - y * s)));
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = s * 0.025; g.stroke(); }
  // Feather incisions on the wings
  g.strokeStyle = 'rgba(40,20,5,0.45)';
  g.lineWidth = s * 0.012;
  for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
    const t = k / 5;
    g.beginPath();
    g.moveTo(cx + side * (0.2 + 0.1 * t) * s, cy - (0.3 - 0.05 * t) * s);
    g.lineTo(cx + side * (0.55 + 0.4 * t) * s, cy - (0.75 - 0.75 * t) * s);
    g.stroke();
  }
  g.beginPath(); g.arc(cx + 0.2 * s, cy - 0.6 * s, s * 0.025, 0, Math.PI * 2); g.fillStyle = 'rgba(30,15,5,0.8)'; g.fill();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, points = 4, inner = 0.3, rot = 0): void {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 ? inner : 1;
    const px = x + Math.sin(a) * rx * r, py = y - Math.cos(a) * ry * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
  g.fill();
}

// ---------------------------------------------------------------------------
// Dome
// ---------------------------------------------------------------------------

export interface DomeSpec { rx: number; ry: number; aMax: number }

export interface Constellation { stars: [number, number][]; lines: [number, number][] }

export interface DomeTextures {
  map: THREE.CanvasTexture;
  /** R: star mask (twinkles). */
  stars: THREE.CanvasTexture;
  /** R: constellation lines + stars (lit as feathers are found), sector = floor(u·7). */
  lines: THREE.CanvasTexture;
  constellations: Constellation[];
}

/**
 * Painted dome: ultramarine fresco deepening toward the oculus, cloudy
 * pigment mottling, a gilded border band, hundreds of gold-leaf stars and
 * seven original constellations (one per 51° sector).
 */
export function paintDome(spec: DomeSpec, hi: boolean): DomeTextures {
  const W = hi ? 4096 : 2048, H = hi ? 1024 : 512;
  const rng = new SeededRandom('dome');
  const [c, g] = canvas(W, H);
  const [cs, gs] = canvas(W, H);
  const [cl, gl] = canvas(W, H);
  // v (0 base → 1 top) ↔ canvas y (H → 0). Elevation angle a = v·aMax.
  const stretch = (v: number) => 1 / Math.max(0.12, Math.cos(v * spec.aMax));
  const pxPerM_x = W / (2 * Math.PI * spec.rx);
  const pxPerM_y = H / (spec.aMax * (spec.rx + spec.ry) / 2);

  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#16336f');
  grad.addColorStop(0.35, '#0f2659');
  grad.addColorStop(0.8, '#081640');
  grad.addColorStop(1, '#050c26');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // fresco mottling
  for (let i = 0; i < (hi ? 4200 : 1600); i++) {
    const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(8, 90) * (hi ? 1 : 0.5);
    const light = rng.chance(0.5);
    g.fillStyle = light ? `rgba(70,110,190,${rng.range(0.01, 0.045)})` : `rgba(0,5,20,${rng.range(0.02, 0.06)})`;
    g.beginPath(); g.ellipse(x, y, r * stretch(1 - y / H) * 0.6, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    if (x < r * 3) { g.beginPath(); g.ellipse(x + W, y, r * 0.6, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
  }
  // faint painted "milky way" ribbon winding round the dome
  for (let i = 0; i < (hi ? 2600 : 900); i++) {
    const u = rng.next();
    const vy = 0.45 + 0.2 * Math.sin(u * Math.PI * 4) + rng.gaussian(0, 0.06);
    const x = u * W, y = H * (1 - vy);
    g.fillStyle = `rgba(150,170,230,${rng.range(0.01, 0.04)})`;
    const r = rng.range(4, 30) * (hi ? 1 : 0.5);
    g.beginPath(); g.ellipse(x, y, r * stretch(vy), r, 0, 0, Math.PI * 2); g.fill();
  }

  gs.fillStyle = '#000'; gs.fillRect(0, 0, W, H);
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W, H);

  const gold = (alpha = 1) => `rgba(${226},${184},${104},${alpha})`;
  const drawStar = (u: number, v: number, sizeM: number, kind: number, both = true, tgt?: CanvasRenderingContext2D) => {
    const x = u * W, y = H * (1 - v);
    const rx = sizeM * pxPerM_x * stretch(v), ry = sizeM * pxPerM_y;
    const targets = tgt ? [tgt] : [g, gs];
    for (const t of targets) {
      for (const dx of [0, x < rx * 2 ? W : 0, x > W - rx * 2 ? -W : 0]) {
        if (dx === 0 && t !== targets[0] && false) continue;
        t.fillStyle = t === g ? gold(0.95) : '#fff';
        if (kind === 0) { t.beginPath(); t.ellipse(x + dx, y, Math.max(0.6, rx), Math.max(0.6, ry), 0, 0, Math.PI * 2); t.fill(); }
        else star(t, x + dx, y, rx, ry, kind === 1 ? 4 : 8, kind === 1 ? 0.28 : 0.45);
      }
    }
    void both;
  };

  // Field stars: many tiny, some medium four-pointed, a few large eight-pointed.
  const N = hi ? 1500 : 800;
  for (let i = 0; i < N; i++) {
    const u = rng.next();
    const v = Math.acos(1 - rng.next() * (1 - Math.cos(spec.aMax))) / spec.aMax; // uniform on the sphere cap
    if (v < 0.1) continue;
    const r = rng.next();
    if (r < 0.85) drawStar(u, v, rng.range(0.012, 0.03), 0);
    else if (r < 0.97) drawStar(u, v, rng.range(0.05, 0.09), 1);
    else drawStar(u, v, rng.range(0.1, 0.16), 2);
  }

  // Seven original constellations, one per sector.
  const constellations: Constellation[] = [];
  for (let k = 0; k < 7; k++) {
    const n = rng.int(5, 7);
    const cu = (k + 0.5) / 7, cv = rng.range(0.4, 0.62);
    const stars: [number, number][] = [];
    let u = cu - 0.03, v = cv - 0.1;
    for (let s = 0; s < n; s++) {
      stars.push([u, v]);
      u += rng.range(-0.012, 0.022);
      v += rng.range(0.03, 0.07) * (rng.chance(0.3) ? -0.6 : 1);
      u = Math.min(Math.max(u, cu - 0.055), cu + 0.055);
      v = Math.min(Math.max(v, 0.25), 0.82);
    }
    const lines: [number, number][] = [];
    for (let s = 1; s < n; s++) lines.push([s - 1, s]);
    if (n > 5) lines.push([1, n - 1]);
    constellations.push({ stars, lines });
    // lines (lit later)
    gl.strokeStyle = '#fff';
    gl.lineWidth = hi ? 3 : 1.6;
    gl.setLineDash([hi ? 14 : 7, hi ? 8 : 4]);
    for (const [a, b] of lines) {
      gl.beginPath();
      gl.moveTo(stars[a][0] * W, H * (1 - stars[a][1]));
      gl.lineTo(stars[b][0] * W, H * (1 - stars[b][1]));
      gl.stroke();
    }
    gl.setLineDash([]);
    // faint painted lines on the fresco too
    g.strokeStyle = gold(0.18);
    g.lineWidth = hi ? 2 : 1;
    for (const [a, b] of lines) {
      g.beginPath();
      g.moveTo(stars[a][0] * W, H * (1 - stars[a][1]));
      g.lineTo(stars[b][0] * W, H * (1 - stars[b][1]));
      g.stroke();
    }
    for (const [su, sv] of stars) {
      drawStar(su, sv, 0.11, 2);
      drawStar(su, sv, 0.2, 2, false, gl);
    }
  }

  // Gilded border band at the base (v 0 → 0.08) with a running star-and-lozenge frieze.
  const bandH = H * 0.075;
  const bg = g.createLinearGradient(0, H - bandH, 0, H);
  bg.addColorStop(0, '#6e4a22'); bg.addColorStop(0.15, '#d8a860'); bg.addColorStop(0.5, '#8a5e2c');
  bg.addColorStop(0.85, '#d2a058'); bg.addColorStop(1, '#5a3a18');
  g.fillStyle = bg;
  g.fillRect(0, H - bandH, W, bandH);
  g.fillStyle = '#0c1d4a';
  g.fillRect(0, H - bandH * 0.8, W, bandH * 0.6);
  const motifs = hi ? 96 : 72;
  for (let i = 0; i < motifs; i++) {
    const x = ((i + 0.5) / motifs) * W, y = H - bandH * 0.5;
    g.fillStyle = gold(0.95);
    if (i % 2) star(g, x, y, bandH * 0.22, bandH * 0.22, 8, 0.45);
    else {
      g.beginPath(); g.moveTo(x - bandH * 0.5, y); g.lineTo(x, y - bandH * 0.22); g.lineTo(x + bandH * 0.5, y); g.lineTo(x, y + bandH * 0.22); g.closePath();
      g.strokeStyle = gold(0.9); g.lineWidth = hi ? 3 : 2; g.stroke();
    }
    gs.fillStyle = 'rgba(255,255,255,0.25)';
    if (i % 2) star(gs, x, y, bandH * 0.22, bandH * 0.22, 8, 0.45);
  }

  const map = canvasTexture(c);
  const starsT = canvasTexture(cs, false);
  const linesT = canvasTexture(cl, false);
  for (const t of [map, starsT, linesT]) { t.wrapS = THREE.RepeatWrapping; }
  return { map, stars: starsT, lines: linesT, constellations };
}

// ---------------------------------------------------------------------------
// Carpet
// ---------------------------------------------------------------------------

/** Great round carpet: midnight field, bronze borders, star compass and eagle medallion. */
export function paintCarpet(hi: boolean): THREE.CanvasTexture {
  const S = hi ? 2048 : 1024;
  const rng = new SeededRandom('carpet');
  const [c, g] = canvas(S, S);
  const cx = S / 2, R = S / 2;
  g.fillStyle = '#0b1736';
  g.fillRect(0, 0, S, S);
  const ring = (r0: number, r1: number, col: string) => {
    g.beginPath(); g.arc(cx, cx, R * r1, 0, Math.PI * 2); g.arc(cx, cx, R * r0, 0, Math.PI * 2, true); g.fillStyle = col; g.fill();
  };
  // field with subtle abrash (dye banding)
  for (let i = 0; i < 60; i++) {
    const r = rng.range(0.1, 0.95) * R;
    g.strokeStyle = `rgba(${rng.chance(0.5) ? '40,70,140' : '0,0,20'},${rng.range(0.03, 0.08)})`;
    g.lineWidth = rng.range(4, 30);
    g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke();
  }
  ring(0.94, 1.0, '#162a5e');
  ring(0.9, 0.94, BRONZE);
  ring(0.82, 0.9, '#1b3a80');
  ring(0.8, 0.82, BRONZE);
  // border motif: alternating stars and crescents
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = cx + Math.cos(a) * R * 0.86, y = cx + Math.sin(a) * R * 0.86;
    g.fillStyle = BRONZE_HI;
    if (i % 2) star(g, x, y, R * 0.025, R * 0.025, 8, 0.4, a);
    else {
      g.beginPath(); g.arc(x, y, R * 0.022, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1b3a80'; g.beginPath(); g.arc(x + Math.cos(a) * R * 0.01, y + Math.sin(a) * R * 0.01, R * 0.02, 0, Math.PI * 2); g.fill();
    }
  }
  // inner tracery: 12 radial spokes ending in fleurons
  g.strokeStyle = 'rgba(176,122,62,0.55)';
  g.lineWidth = S * 0.004;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.32, cx + Math.sin(a) * R * 0.32); g.lineTo(cx + Math.cos(a) * R * 0.74, cx + Math.sin(a) * R * 0.74); g.stroke();
    g.fillStyle = 'rgba(176,122,62,0.8)';
    star(g, cx + Math.cos(a) * R * 0.76, cx + Math.sin(a) * R * 0.76, R * 0.02, R * 0.02, 4, 0.35, a);
  }
  for (const r of [0.3, 0.52, 0.74]) { g.beginPath(); g.arc(cx, cx, R * r, 0, Math.PI * 2); g.stroke(); }
  // scattered small stars in the field
  for (let i = 0; i < 160; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0.34, 0.78) * R;
    g.fillStyle = `rgba(190,200,230,${rng.range(0.25, 0.6)})`;
    star(g, cx + Math.cos(a) * r, cx + Math.sin(a) * r, R * 0.006, R * 0.006, 4, 0.3);
  }
  // compass star + medallion
  g.fillStyle = '#132a63';
  g.beginPath(); g.arc(cx, cx, R * 0.3, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(176,122,62,0.9)';
  star(g, cx, cx, R * 0.29, R * 0.29, 8, 0.38, Math.PI / 8);
  g.fillStyle = '#0d1f4d';
  g.beginPath(); g.arc(cx, cx, R * 0.18, 0, Math.PI * 2); g.fill();
  g.strokeStyle = BRONZE_HI; g.lineWidth = S * 0.005; g.stroke();
  drawEagle(g, cx, cx + R * 0.01, R * 0.14, BRONZE_HI);
  // wool tufting noise + wear in the traffic ring
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    const dx = x - cx, dy = y - cx, r = Math.sqrt(dx * dx + dy * dy) / R;
    const n = (rng.next() - 0.5) * 22;
    const wear = Math.max(0, 1 - Math.abs(r - 0.6) * 6) * 0.12 * (0.5 + 0.5 * Math.sin(Math.atan2(dy, dx) * 3));
    for (let k = 0; k < 3; k++) d[i + k] = d[i + k] + n + wear * (150 - d[i + k]);
    if (r > 1) d[i + 3] = 0;
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c);
}

// ---------------------------------------------------------------------------
// Banners, paintings, paper
// ---------------------------------------------------------------------------

/** Tall house banner: sapphire with bronze border and eagle; swallowtail cut in alpha. */
export function paintBanner(): THREE.CanvasTexture {
  const W = 512, H = 1280;
  const [c, g] = canvas(W, H);
  const rng = new SeededRandom('banner');
  const bg = g.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, '#0e2358'); bg.addColorStop(0.5, '#1a3c88'); bg.addColorStop(1, '#0e2358');
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W / 2, H * 0.88); g.lineTo(0, H); g.closePath();
  g.fill();
  g.save(); g.clip();
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0, 0.05)})`; g.fillRect(rng.range(0, W), 0, rng.range(1, 3), H); }
  g.lineWidth = 22; g.strokeStyle = BRONZE;
  g.beginPath(); g.moveTo(16, 0); g.lineTo(16, H - 30); g.lineTo(W / 2, H * 0.88 - 28); g.lineTo(W - 16, H - 30); g.lineTo(W - 16, 0); g.stroke();
  g.lineWidth = 4; g.strokeStyle = BRONZE_HI;
  g.beginPath(); g.moveTo(40, 0); g.lineTo(40, H - 70); g.lineTo(W / 2, H * 0.88 - 62); g.lineTo(W - 40, H - 70); g.lineTo(W - 40, 0); g.stroke();
  const eg = g.createLinearGradient(0, 300, 0, 760);
  eg.addColorStop(0, BRONZE_HI); eg.addColorStop(1, '#8a5a2a');
  drawEagle(g, W / 2, 560, 210, eg, '#5a3a18');
  g.fillStyle = BRONZE_HI;
  for (let i = 0; i < 3; i++) star(g, W / 2 + (i - 1) * 110, 210 - (i === 1 ? 30 : 0), 26, 26, 8, 0.42);
  g.restore();
  const t = canvasTexture(c);
  return t;
}

/** A small oil painting (landscape / night tower / still life) with craquelure. */
export function paintPainting(kind: number, seed: string): THREE.CanvasTexture {
  const W = 512, H = 640;
  const [c, g] = canvas(W, H);
  const rng = new SeededRandom(seed);
  if (kind === 0) {
    // misty mountains over a loch at dusk
    const sky = g.createLinearGradient(0, 0, 0, H * 0.6);
    sky.addColorStop(0, '#24345a'); sky.addColorStop(0.6, '#8a7a7a'); sky.addColorStop(1, '#d9a56a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let layer = 0; layer < 4; layer++) {
      g.fillStyle = ['#5a5f74', '#434a60', '#2e344a', '#1d2233'][layer];
      g.beginPath(); g.moveTo(0, H);
      let y = H * (0.42 + layer * 0.07);
      for (let x = 0; x <= W; x += 8) { y += rng.range(-6, 6) * (1 + layer * 0.3); y = Math.min(Math.max(y, H * 0.3), H * 0.7); g.lineTo(x, y); }
      g.lineTo(W, H); g.fill();
    }
    const lake = g.createLinearGradient(0, H * 0.7, 0, H);
    lake.addColorStop(0, '#c2925f'); lake.addColorStop(1, '#2a2f44');
    g.fillStyle = lake; g.fillRect(0, H * 0.72, W, H * 0.28);
  } else if (kind === 1) {
    // a lone tower under stars
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#060b1e'); sky.addColorStop(1, '#203a6a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 220; i++) { g.fillStyle = `rgba(255,240,210,${rng.range(0.3, 1)})`; g.fillRect(rng.range(0, W), rng.range(0, H * 0.7), rng.range(1, 3), rng.range(1, 3)); }
    g.fillStyle = '#f1e6c0'; g.beginPath(); g.arc(W * 0.75, H * 0.2, 36, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0b0f1c';
    g.fillRect(W * 0.38, H * 0.35, W * 0.16, H * 0.65);
    g.beginPath(); g.moveTo(W * 0.35, H * 0.36); g.lineTo(W * 0.46, H * 0.18); g.lineTo(W * 0.57, H * 0.36); g.fill();
    g.fillStyle = '#ffcf7a';
    for (let i = 0; i < 4; i++) g.fillRect(W * 0.44, H * (0.42 + i * 0.12), 12, 22);
    g.fillStyle = '#121a2c'; g.beginPath(); g.moveTo(0, H); g.quadraticCurveTo(W * 0.5, H * 0.75, W, H); g.fill();
  } else {
    // still life: books, hourglass, candle
    const bg = g.createRadialGradient(W * 0.6, H * 0.35, 20, W * 0.5, H * 0.5, W);
    bg.addColorStop(0, '#5a4630'); bg.addColorStop(1, '#120c08');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a2416'; g.fillRect(0, H * 0.7, W, H * 0.3);
    const cols = ['#1b3a80', '#6a1e1e', '#2e4a2a', '#b07a3e'];
    for (let i = 0; i < 4; i++) { g.fillStyle = cols[i]; g.fillRect(W * 0.12, H * 0.7 - (i + 1) * 34, W * 0.42 - i * 12, 32); }
    g.fillStyle = '#e8dcc0'; g.fillRect(W * 0.66, H * 0.42, 22, H * 0.28);
    const fl = g.createRadialGradient(W * 0.68, H * 0.38, 2, W * 0.68, H * 0.38, 90);
    fl.addColorStop(0, 'rgba(255,220,140,1)'); fl.addColorStop(1, 'rgba(255,180,80,0)');
    g.fillStyle = fl; g.fillRect(0, 0, W, H);
  }
  // brush texture + craquelure + varnish yellowing
  for (let i = 0; i < 1800; i++) {
    g.strokeStyle = `rgba(${rng.chance(0.5) ? '255,240,210' : '0,0,0'},${rng.range(0.01, 0.05)})`;
    g.lineWidth = rng.range(1, 4);
    const x = rng.range(0, W), y = rng.range(0, H), a = rng.range(-0.5, 0.5);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke();
  }
  g.strokeStyle = 'rgba(20,12,4,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    let x = rng.range(0, W), y = rng.range(0, H);
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += rng.range(-12, 12); y += rng.range(-12, 12); g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(160,110,30,0.12)'; g.fillRect(0, 0, W, H);
  return canvasTexture(c);
}

/** Parchment with handwriting-like ink lines (and optional star chart). */
export function paintParchment(seed: string, chart = false): THREE.CanvasTexture {
  const W = 512, H = 680;
  const [c, g] = canvas(W, H);
  const rng = new SeededRandom(seed);
  const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.8);
  bg.addColorStop(0, '#efe0bb'); bg.addColorStop(0.7, '#dcc391'); bg.addColorStop(1, '#a98450');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(110,70,30,${rng.range(0.01, 0.05)})`;
    g.beginPath(); g.arc(rng.range(0, W), rng.range(0, H), rng.range(2, 20), 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(30,22,40,0.85)';
  g.lineWidth = 1.6;
  if (chart) {
    g.beginPath(); g.arc(W / 2, H * 0.42, W * 0.38, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(W / 2, H * 0.42, W * 0.3, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * W * 0.3, H * 0.42 + Math.sin(a) * W * 0.3); g.lineTo(W / 2 + Math.cos(a) * W * 0.38, H * 0.42 + Math.sin(a) * W * 0.38); g.stroke();
    }
    const pts: [number, number][] = [];
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2), r = Math.sqrt(rng.next()) * W * 0.28;
      pts.push([W / 2 + Math.cos(a) * r, H * 0.42 + Math.sin(a) * r]);
      g.fillStyle = 'rgba(30,22,40,0.9)'; star(g, pts[i][0], pts[i][1], 5, 5, 4, 0.3);
    }
    g.setLineDash([4, 4]);
    for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(...pts[i - 1]); g.lineTo(...pts[i]); g.stroke(); }
    g.setLineDash([]);
  }
  const top = chart ? H * 0.82 : 60;
  for (let y = top; y < H - 40; y += 22) {
    let x = 40 + rng.range(0, 12);
    const end = W - 40 - rng.range(0, 80);
    g.beginPath(); g.moveTo(x, y);
    while (x < end) {
      const wlen = rng.range(14, 48);
      for (let k = 0; k < wlen; k += 3) g.lineTo(x + k, y + Math.sin((x + k) * 0.9 + rng.next()) * 3 - rng.range(0, 3));
      x += wlen + rng.range(6, 12);
      g.moveTo(x, y);
    }
    g.stroke();
  }
  return canvasTexture(c);
}

/** Open-book double page: two text blocks, a drop cap and a little diagram. */
export function paintBookPages(seed: string): THREE.CanvasTexture {
  const W = 1024, H = 640;
  const [c, g] = canvas(W, H);
  const rng = new SeededRandom(seed);
  g.fillStyle = '#ecdfc0'; g.fillRect(0, 0, W, H);
  const gut = g.createLinearGradient(W / 2 - 60, 0, W / 2 + 60, 0);
  gut.addColorStop(0, 'rgba(90,60,30,0)'); gut.addColorStop(0.5, 'rgba(90,60,30,0.35)'); gut.addColorStop(1, 'rgba(90,60,30,0)');
  g.fillStyle = gut; g.fillRect(W / 2 - 60, 0, 120, H);
  g.fillStyle = 'rgba(25,20,30,0.8)';
  for (const page of [0, 1]) {
    const x0 = page ? W / 2 + 50 : 60, x1 = page ? W - 60 : W / 2 - 50;
    if (page === 0) { g.fillStyle = '#1b3a80'; g.fillRect(x0, 60, 54, 60); g.fillStyle = 'rgba(25,20,30,0.8)'; }
    if (page === 1) {
      g.strokeStyle = 'rgba(25,20,30,0.7)'; g.lineWidth = 2;
      g.beginPath(); g.arc((x0 + x1) / 2, 200, 90, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.ellipse((x0 + x1) / 2, 200, 90, 30, 0.3, 0, Math.PI * 2); g.stroke();
    }
    for (let y = page ? 330 : 70; y < H - 50; y += 17) {
      let x = x0 + (page === 0 && y < 125 ? 64 : 0);
      while (x < x1 - 10) { const w = rng.range(10, 46); g.fillRect(x, y, Math.min(w, x1 - x), 3.2); x += w + rng.range(5, 9); }
    }
  }
  return canvasTexture(c);
}

/** 8×8 chess board with walnut and maple squares. */
export function paintChessboard(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#3a2412'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    g.fillStyle = (x + y) % 2 ? '#2a170b' : '#c9a676';
    g.fillRect(32 + x * 56, 32 + y * 56, 56, 56);
  }
  g.strokeStyle = BRONZE; g.lineWidth = 4; g.strokeRect(30, 30, 452, 452);
  return canvasTexture(c);
}

/** Clock face: Roman-ish tick ring and star in the centre. */
export function paintClockFace(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#e9dcbc'; g.beginPath(); g.arc(256, 256, 250, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2a1c10'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 236, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
    g.lineWidth = big ? 10 : 3;
    g.beginPath(); g.moveTo(256 + Math.sin(a) * (big ? 190 : 210), 256 - Math.cos(a) * (big ? 190 : 210)); g.lineTo(256 + Math.sin(a) * 228, 256 - Math.cos(a) * 228); g.stroke();
  }
  g.fillStyle = '#1b3a80'; star(g, 256, 256, 70, 70, 8, 0.4);
  return canvasTexture(c);
}

/** Small striped scarf texture (blue / bronze house colours). */
export function paintScarf(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 512);
  for (let y = 0; y < 512; y += 64) {
    g.fillStyle = '#14306e'; g.fillRect(0, y, 64, 44);
    g.fillStyle = '#b07a3e'; g.fillRect(0, y + 44, 64, 8);
    g.fillStyle = '#1b3a80'; g.fillRect(0, y + 52, 64, 4);
    g.fillStyle = '#b07a3e'; g.fillRect(0, y + 56, 64, 8);
  }
  const t = canvasTexture(c, true, true);
  return t;
}
