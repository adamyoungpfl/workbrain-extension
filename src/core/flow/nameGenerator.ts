/**
 * V2.4 VB-109 — the random name generator behind the two name questions.
 *
 * ── WHAT IT IS ────────────────────────────────────────────────────────────
 *
 * `preferred_name` and `professional_name` trade their examples-as-suggestions
 * for a button that drops a made-up name into the field — the ideas mechanic
 * (core/flow/ideas.ts) with a combinatorial pool behind it: famous FIRST
 * names crossed with famous LAST names, from pop culture and history. Light,
 * silly, uncontroversial — Wolfgang Nightingale, Cleopatra Chaplin — and the
 * point is the same as VB-08's: something concrete to react to. Nobody keeps
 * "Wednesday Tesla"; plenty of people type their real name right after
 * laughing at it.
 *
 * ── THE ONE HARD RULE: NEVER A REAL PERSON'S ACTUAL FULL NAME ─────────────
 *
 * The two pools are built so that NO cross pairing reconstructs a real famous
 * person (or a famous fictional character): every first name's well-known
 * bearers have their surnames kept OUT of the last-name pool, and every last
 * name's well-known bearers have their first names kept OUT of the first-name
 * pool. That audit is data, not diligence — nameGenerator.test.ts carries the
 * two known-bearer maps and walks the whole cross product against them, so
 * adding "Mozart" to a pool that already holds "Wolfgang" fails CI rather
 * than shipping a real person as a joke.
 *
 * ── WHY THE POOL SIZES ARE COPRIME ────────────────────────────────────────
 *
 * 12 firsts × 13 lasts. Because gcd(12, 13) = 1 and each press advances both
 * indices by a step coprime to its own pool's length, the pair sequence walks
 * ALL 156 combinations before repeating one — the button cycles like the
 * ideas button, with no repeat until the pool is spent. Deterministic given a
 * seed (same seed + press count, same name), which is what makes it testable
 * without mocking anything.
 *
 * These names are proper nouns, not sentences, so they deliberately do NOT
 * ride a Flesch-Kincaid harness — syllable-counting "Copernicus" measures
 * nothing about whether a person can read their own name field. The
 * sentence-length rule holds trivially (two words) and is asserted; the
 * button's own label lives in src/panel/strings.ts under the audit.
 */

/** The two questions that swap examples for the generator (VB-109). The
 * orbs.ts convention: which questions, recorded in one place, keyed by id. */
export const NAME_GENERATOR_QUESTIONS: readonly string[] = ['preferred_name', 'professional_name'] as const;

/** Text questions only — the same boundary `ideasFor` draws, for the same
 * reasons (core/flow/ideas.ts). */
/**
 * QUESTIONS THAT TRAVEL LIGHT — no examples, no AI Assist, just the box.
 *
 * V2.5 VB-121 established the idea for the two name questions: "an interview
 * about a two-word box is a hammer for a pin". The goal gate joins them on
 * 2026-08-31, for a measured reason rather than a matching one.
 *
 * `goal_want` is the heaviest question in the flow — a deep-dive, a hint,
 * examples AND the assist — and the baseline door made it the FIRST thing
 * anybody sees. Measured on the real panel it wanted 177px of question zone in
 * 137, and 235px of answer area in 217: the deep-dive chip was clipped in half
 * and "AI Assist" was cut off at the fold. Two overflows on the opening screen.
 *
 * The helper row is 94px of that, and it is the part that earns its place
 * least here. This question asks somebody to type one sentence they already
 * know the answer to — and the answer is going straight to their own AI, so
 * offering to have an AI write it is offering to automate the input to the
 * measurement. The deep-dive stays: "what makes a good answer" is exactly the
 * thing the reframed question is trying to teach.
 */
const TRAVELS_LIGHT = new Set(['goal_want', 'goal_service']);

export function travelsLight(step: { id: string }): boolean {
  return TRAVELS_LIGHT.has(step.id);
}

export function usesNameGenerator(step: { id: string; kind: string }): boolean {
  return step.kind === 'text' && NAME_GENERATOR_QUESTIONS.includes(step.id);
}

/** [DRAFT] V2.4 VB-109 — famous first names. 12 entries; see the header
 * before adding one, and add its well-known bearers to
 * nameGenerator.test.ts's audit maps in the same change. */
export const FAMOUS_FIRSTS: readonly string[] = [
  'Wolfgang',
  'Cleopatra',
  'Elvis',
  'Frida',
  'Sherlock',
  'Hermione',
  'Napoleon',
  'Amelia',
  'Galileo',
  'Beatrix',
  'Wednesday',
  'Leonardo',
] as const;

/** [DRAFT] V2.4 VB-109 — famous last names. 13 entries; same rule. */
export const FAMOUS_LASTS: readonly string[] = [
  'Einstein',
  'Shakespeare',
  'Tesla',
  'Picasso',
  'Houdini',
  'Newton',
  'Darwin',
  'Austen',
  'Dickinson',
  'Chaplin',
  'Nightingale',
  'Magellan',
  'Copernicus',
] as const;

/** How many presses before a name comes round again: every combination once. */
export const NAME_CYCLE = FAMOUS_FIRSTS.length * FAMOUS_LASTS.length;

/** Per-press strides, coprime to their pool lengths (5⊥12, 3⊥13), so
 * consecutive presses change BOTH halves and the pair orbit covers the whole
 * cross product — asserted in nameGenerator.test.ts rather than trusted. */
const FIRST_STRIDE = 5;
const LAST_STRIDE = 3;

/** ideaAt's guard, verbatim in spirit: a count is a count — floor it, fold
 * negatives forward, treat non-finite as zero. */
function counted(n: number): number {
  return Math.floor(Number.isFinite(n) ? Math.abs(n) : 0);
}

/**
 * The name the Nth press produces, for this seed.
 *
 * Pure and total: same `(seed, pressCount)`, same name, forever — the caller
 * owns the seed (the panel mints one per screen) and the press count is the
 * same counter the ideas button keeps. Press 0 is the first name; presses
 * walk every combination once before any repeats (see NAME_CYCLE).
 */
export function generatedNameAt(seed: number, pressCount: number): string {
  const s = counted(seed);
  const n = counted(pressCount);
  const first = FAMOUS_FIRSTS[(s + n * FIRST_STRIDE) % FAMOUS_FIRSTS.length]!;
  const last = FAMOUS_LASTS[(Math.floor(s / FAMOUS_FIRSTS.length) + n * LAST_STRIDE) % FAMOUS_LASTS.length]!;
  return `${first} ${last}`;
}
