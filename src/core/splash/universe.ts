/**
 * THE UNIVERSE's geometry — seven lattices at fixed seats (V2.9 pass 15,
 * promoted to shared data in V3.0 pass 1 when the field became the app's
 * own canvas). Nearness is size and presence, distance is smallness,
 * faintness and a breath of blur; pace is one slow container turn in
 * seconds, some reversed, laid over the mark's shared orbit so no two
 * lattices read alike. Fixed, not rolled: the same universe every open.
 *
 * Pure data, no DOM — the panel's scenery/Universe.tsx renders it and
 * tests/e2e/universe.spec.ts pins the contract against it.
 */
export interface UniverseOrb {
  x: number;
  y: number;
  size: number;
  presence: number;
  pace: number;
  reverse: boolean;
  blur: number;
}

export const UNIVERSE: readonly UniverseOrb[] = [
  { x: 50, y: 44, size: 520, presence: 0.16, pace: 160, reverse: false, blur: 0 },
  { x: 12, y: 16, size: 230, presence: 0.1, pace: 120, reverse: true, blur: 0.5 },
  { x: 88, y: 24, size: 170, presence: 0.08, pace: 95, reverse: false, blur: 1 },
  { x: 18, y: 82, size: 300, presence: 0.11, pace: 140, reverse: false, blur: 0.5 },
  { x: 86, y: 76, size: 140, presence: 0.07, pace: 80, reverse: true, blur: 1.4 },
  { x: 62, y: 6, size: 110, presence: 0.05, pace: 70, reverse: true, blur: 1.8 },
  { x: 38, y: 96, size: 120, presence: 0.06, pace: 105, reverse: false, blur: 1.6 },
];
