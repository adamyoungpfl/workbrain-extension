import { describe, it, expect } from 'vitest';
import { RECOMMENDATION_WEIGHT, STALENESS_URGENCY_MAX, stalenessUrgency } from './weights';
import type { RecommendationKind } from './types';

/**
 * V1.5 VB-28. The table is a product judgement, so what is asserted here is
 * the *structure* the judgement relies on — not the individual numbers, which
 * Adam is meant to be able to change without a test arguing back.
 */

const EVERY_KIND: RecommendationKind[] = [
  'role-stale',
  'section-stale',
  'section-empty',
  'initiative-no-success',
  'entities-thin',
  'initiatives-thin',
];

describe('the weight table', () => {
  it('has a real entry for every kind, so nothing falls back to zero', () => {
    for (const kind of EVERY_KIND) {
      expect(RECOMMENDATION_WEIGHT[kind], kind).toBeGreaterThan(0);
    }
    expect(Object.keys(RECOMMENDATION_WEIGHT).sort()).toEqual([...EVERY_KIND].sort());
  });

  it('orders wrong-before-thin, exactly as the table says', () => {
    expect(RECOMMENDATION_WEIGHT['role-stale']).toBeGreaterThan(RECOMMENDATION_WEIGHT['section-stale']);
    expect(RECOMMENDATION_WEIGHT['section-stale']).toBeGreaterThan(
      RECOMMENDATION_WEIGHT['initiative-no-success'],
    );
    expect(RECOMMENDATION_WEIGHT['initiative-no-success']).toBeGreaterThan(
      RECOMMENDATION_WEIGHT['section-empty'],
    );
    expect(RECOMMENDATION_WEIGHT['section-empty']).toBeGreaterThan(RECOMMENDATION_WEIGHT['entities-thin']);
    expect(RECOMMENDATION_WEIGHT['entities-thin']).toBeGreaterThan(
      RECOMMENDATION_WEIGHT['initiatives-thin'],
    );
  });

  /** The claim the table's own comment makes: urgency separates two stale
   * sections without ever letting one escape its band. If somebody narrows a
   * gap below the cap, this is what says so. */
  it('leaves every band wider than the most urgency can add', () => {
    const sorted = [...EVERY_KIND].sort((a, b) => RECOMMENDATION_WEIGHT[b] - RECOMMENDATION_WEIGHT[a]);
    for (let i = 1; i < sorted.length; i++) {
      const gap = RECOMMENDATION_WEIGHT[sorted[i - 1]!] - RECOMMENDATION_WEIGHT[sorted[i]!];
      expect(gap, `${sorted[i - 1]} -> ${sorted[i]}`).toBeGreaterThan(STALENESS_URGENCY_MAX);
    }
  });

  it('never produces a score anybody could read — the table holds no percentages or totals', () => {
    const total = Object.values(RECOMMENDATION_WEIGHT).reduce((a, b) => a + b, 0);
    // Not a meaningful assertion about the sum; an assertion that the sum is
    // meaningless. Nothing in the product adds these up, and 100 is the one
    // number docs/GUARDRAILS.md names ("a composite score out of 100").
    expect(total).not.toBe(100);
  });
});

describe('stalenessUrgency', () => {
  it('is zero at the moment a section falls due, and below it', () => {
    expect(stalenessUrgency(120, 120)).toBe(0);
    expect(stalenessUrgency(119, 120)).toBe(0);
    expect(stalenessUrgency(0, 120)).toBe(0);
  });

  it('reaches its cap at twice the section’s own clock, and holds there', () => {
    expect(stalenessUrgency(240, 120)).toBe(STALENESS_URGENCY_MAX);
    expect(stalenessUrgency(2400, 120)).toBe(STALENESS_URGENCY_MAX);
  });

  it('measures against the section’s own clock, not a global one', () => {
    // Five months of silence. Unremarkable for voice (730 days), well past
    // the clock for My World (120) — and the ranking says so.
    const fiveMonths = 150;
    expect(stalenessUrgency(fiveMonths, 730)).toBe(0);
    expect(stalenessUrgency(fiveMonths, 120)).toBeGreaterThan(0);
  });

  it('rises smoothly in between', () => {
    expect(stalenessUrgency(180, 120)).toBe(8); // half a clock over
    expect(stalenessUrgency(150, 120)).toBe(4); // a quarter over
  });

  it('never divides by zero on a section with no clock', () => {
    expect(stalenessUrgency(10, 0)).toBe(STALENESS_URGENCY_MAX);
  });
});
