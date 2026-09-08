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

/**
 * THE APP'S OWN SKY (2026-09-08; Adam: "I want all of the labels and
 * tiles to lay over a single background, not have the vibrant background
 * barely visible"). The seven-orb table below was composed for the
 * splash's one centred card, and under Home's full page its rings skirt
 * the content — most tiles sat over bare ground however transparent they
 * became. This table is composed FOR THE PAGE: eleven lattices spread
 * across the column, crossing the three label bands (the hero's, the
 * files', the rows') on purpose. Same family, same physics, denser sky.
 */
export const APP_UNIVERSE: readonly UniverseOrb[] = [
  { x: 50, y: 10, size: 300, presence: 0.13, pace: 150, reverse: false, blur: 0 },
  { x: 10, y: 30, size: 240, presence: 0.11, pace: 120, reverse: true, blur: 0.4 },
  { x: 70, y: 22, size: 180, presence: 0.09, pace: 95, reverse: false, blur: 0.9 },
  { x: 90, y: 44, size: 280, presence: 0.12, pace: 135, reverse: true, blur: 0.4 },
  { x: 30, y: 56, size: 340, presence: 0.14, pace: 165, reverse: false, blur: 0 },
  { x: 5, y: 50, size: 160, presence: 0.09, pace: 85, reverse: true, blur: 1.2 },
  { x: 78, y: 60, size: 150, presence: 0.08, pace: 75, reverse: false, blur: 1.4 },
  { x: 15, y: 72, size: 260, presence: 0.12, pace: 130, reverse: true, blur: 0.5 },
  { x: 60, y: 78, size: 380, presence: 0.15, pace: 175, reverse: false, blur: 0 },
  { x: 88, y: 88, size: 180, presence: 0.09, pace: 100, reverse: true, blur: 1.1 },
  { x: 35, y: 90, size: 200, presence: 0.1, pace: 110, reverse: false, blur: 0.8 },
];

export const UNIVERSE: readonly UniverseOrb[] = [
  { x: 50, y: 44, size: 520, presence: 0.16, pace: 160, reverse: false, blur: 0 },
  { x: 12, y: 16, size: 230, presence: 0.1, pace: 120, reverse: true, blur: 0.5 },
  { x: 88, y: 24, size: 170, presence: 0.08, pace: 95, reverse: false, blur: 1 },
  { x: 18, y: 82, size: 300, presence: 0.11, pace: 140, reverse: false, blur: 0.5 },
  { x: 86, y: 76, size: 140, presence: 0.07, pace: 80, reverse: true, blur: 1.4 },
  { x: 62, y: 6, size: 110, presence: 0.05, pace: 70, reverse: true, blur: 1.8 },
  { x: 38, y: 96, size: 120, presence: 0.06, pace: 105, reverse: false, blur: 1.6 },
];
