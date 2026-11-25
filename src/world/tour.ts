/**
 * The cinematic crane tour (press C): from inside the Leaky Cauldron
 * courtyard as the brick archway opens, through the passage, gliding past
 * Ollivanders' window, weaving across to Weasleys' Wizard Wheezes and its
 * showman, then craning up the plaza toward Gringotts' dome before settling
 * back to street level to hand over to walking.
 */
import * as THREE from 'three';
import { createFrame, type StreetLayout } from '../architecture/street';
import type { EntryArchway } from '../architecture/entryArchway';
import type { TourKey, TourPath } from '../core/controls';

export interface TourLandmarks {
  /** Mid-frontage arc-lengths of the hero shops. */
  ollivanders: number;
  wheezes: number;
  gringotts: THREE.Matrix4;
}

export function buildTour(layout: StreetLayout, archway: EntryArchway, lm: TourLandmarks): TourPath {
  const f = createFrame();
  /** Street point: arc-length s, lateral d (+ = right), height h above the centreline. */
  const P = (s: number, d: number, h: number) => {
    layout.frame(s, f);
    return new THREE.Vector3(f.x + f.nx * d, f.y + h, f.z + f.nz * d);
  };
  const half = (s: number) => layout.widthAtS(s) / 2;
  const court = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(archway.frame);
  const bank = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(lm.gringotts);
  const O = lm.ollivanders, W = lm.wheezes, E = layout.length;

  const keys: TourKey[] = [
    // Courtyard: a slow push-in while the bricks fold away
    { t: 0, pos: court(1.2, 1.65, 6.2), look: court(0, 2.3, 0) },
    { t: 3.6, pos: court(0.5, 1.75, 4.0), look: court(0, 2.4, -2) },
    // Through the arch, the street opening up
    { t: 7.5, pos: court(0.05, 1.85, 0.6), look: P(12, 0.3, 2.2) },
    { t: 11.5, pos: P(7, 0.4, 2.0), look: P(O, half(O) - 0.4, 2.4) },
    // Glide close past Ollivanders' dusty window
    { t: 16.5, pos: P(O - 3.5, half(O) - 2.0, 1.85), look: P(O + 0.5, half(O), 2.1) },
    { t: 21, pos: P(O + 4, half(O + 4) - 2.4, 2.1), look: P(O + 14, -0.5, 2.8) },
    // Weave across to the left-hand side (Flourish & Blotts) and lift a little
    { t: 27.5, pos: P(32, -1.4, 2.7), look: P(43, -half(43) + 0.4, 3.4) },
    { t: 33.5, pos: P(44, -0.8, 3.4), look: P(W, -half(W), 4.6) },
    // Wheezes: rise to meet the 6 m showman, swing round him
    { t: 39, pos: P(W - 4.5, -1.2, 4.6), look: P(W, -half(W) + 0.6, 5.6) },
    { t: 44, pos: P(W + 4, 0.6, 4.4), look: P(W + 1, -half(W) + 0.4, 4.6) },
    // The crane: up the street and into the plaza, Gringotts filling the frame
    { t: 51, pos: P(74, 0.2, 6.5), look: bank(0, 9, 0) },
    { t: 58.5, pos: P(E - 17, 0, 11.5), look: bank(0, 13, -2) },
    { t: 65, pos: P(E - 11, 0.4, 16), look: bank(0, 17, -7) },
    // Settle back to the cobbles to hand over to walking
    { t: 72, pos: P(E - 20, 0.3, 4.5), look: bank(0, 7, 2) },
    { t: 77, pos: P(E - 23, 0.2, 1.75), look: bank(0, 4.5, 3) },
  ];
  return {
    keys,
    onStart() { if (!archway.open && !archway.animating) archway.trigger(); },
  };
}
