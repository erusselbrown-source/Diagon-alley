/**
 * Street placement: hero shops at fixed slots, then every remaining stretch of
 * building line on both sides (between the courtyard, alcoves, Knockturn's
 * mouth and Gringotts) is packed with procedurally varied fillers — no voids.
 * Shop doors become the street's stoop sites.
 */
import * as THREE from 'three';
import { SeededRandom } from '../core/random';
import { mergeByCell, type Animator, type Kit } from '../architecture/kit';
import type { Side, StoopSite, StreetLayout } from '../architecture/street';
import { createFiller, TRADES } from './fillers';
import type { ShopModule } from './index';

export interface Placement { module: ShopModule; side: Side; s0: number }

export function planStreet(layout: StreetLayout, heroes: Placement[], seed = 'diagon-alley:plan'): Placement[] {
  const rng = new SeededRandom(seed);
  const out: Placement[] = [...heroes];
  for (const h of heroes) {
    if (!layout.isFrontageFree(h.side, h.s0, h.s0 + h.module.frontage)) console.warn(`[plan] ${h.module.name} overlaps a reserved stretch`);
  }
  // Deal trades round-robin (shuffled) so all twelve appear before any repeats.
  const order = [...TRADES];
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  let deal = 0;
  const used = new Map<string, number>();

  for (const side of ['left', 'right'] as const) {
    const blocked: [number, number][] = [
      ...layout.reservations.filter((r) => r.side === side).map((r) => [r.s0, r.s1] as [number, number]),
      ...heroes.filter((h) => h.side === side).map((h) => [h.s0, h.s0 + h.module.frontage] as [number, number]),
    ].sort((a, b) => a[0] - b[0]);
    let cursor = 0.5;
    const free: [number, number][] = [];
    for (const [a, b] of blocked) {
      if (a > cursor) free.push([cursor, Math.min(a, layout.length)]);
      cursor = Math.max(cursor, b);
    }
    if (cursor < layout.length) free.push([cursor, layout.length]);

    for (const [a, b] of free) {
      const len = b - a;
      if (len < 2.2) {
        if (len > 0.05) console.warn(`[plan] ${side} frontage ${a.toFixed(2)}–${b.toFixed(2)} is too narrow for a filler; move a hero slot`);
        continue;
      }
      const n = Math.max(1, Math.round(len / 6.3));
      const raw = Array.from({ length: n }, () => rng.range(0.8, 1.2));
      const sum = raw.reduce((p, q) => p + q, 0);
      let s = a;
      raw.forEach((r) => {
        const frontage = (len * r) / sum;
        const trade = order[deal++ % order.length];
        const k = used.get(trade.id) ?? 0;
        used.set(trade.id, k + 1);
        out.push({ side, s0: s, module: createFiller({ trade, nameIndex: (k % 2) as 0 | 1, frontage, seed: `${trade.id}-${side}-${Math.round(s * 10)}` }) });
        s += frontage;
      });
    }
  }
  return out;
}

export interface BuiltShops {
  group: THREE.Group;
  animators: Animator[];
  stoops: StoopSite[];
  stats: Record<string, number>;
  names: { name: string; side: Side; s0: number; frontage: number }[];
}

export function buildShops(kit: Kit, layout: StreetLayout, placements: Placement[]): BuiltShops {
  const group = new THREE.Group();
  group.name = 'shops';
  const animators: Animator[] = [];
  const stoops: StoopSite[] = [];
  const names: BuiltShops['names'] = [];
  let seed = 0;
  for (const p of placements) {
    const tr = layout.frontageTransform(p.side, p.s0, p.module.frontage);
    const built = p.module.build({ kit });
    built.group.matrixAutoUpdate = false;
    built.group.matrix.copy(tr.matrix);
    built.group.name = `shop:${p.module.name}`;
    group.add(built.group);
    animators.push(...(built.animators ?? []));
    names.push({ name: p.module.name, side: p.side, s0: p.s0, frontage: p.module.frontage });
    for (const d of built.doors) {
      const s = tr.s + (p.side === 'left' ? d.x : -d.x);
      stoops.push({ s, side: p.side, width: d.width + 0.45, steps: Math.max(1, Math.round(d.floor / 0.16)), seed: seed++ });
    }
  }
  // Batch static geometry street-wide (per material × 48 m cell). The merged
  // meshes live in world space, so they sit in a separate identity group.
  const batched = mergeByCell(group, 48, 'shops-batched');
  const root = new THREE.Group();
  root.name = 'shops';
  group.name = 'shops-dynamic';
  root.add(group, batched);
  return {
    group: root, animators, stoops, names,
    stats: { shops: placements.length, fillers: placements.filter((p) => p.module.id.startsWith('filler:')).length },
  };
}
