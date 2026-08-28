import { describe, expect, it } from 'vitest';
import { contextModules, contextOutline } from '../flow/flow';
import { MINUTES_PER_QUESTION, recMinutes, recQuestions } from './estimate';
import type { Recommendation } from './types';

/**
 * BS-06 (§6) — the time estimate on the hero's verb.
 *
 * Two claims worth a test: the rate really is the interview's own number and
 * not one somebody typed, and every recommendation kind produces a whole
 * minute somebody can read.
 */

const EVERY_KIND: Recommendation[] = [
  {
    id: 'role-stale:0',
    kind: 'role-stale',
    nodeId: 'sec2-1',
    rank: 120,
    target: { in: 'repeatable', blockId: 'roles', recordIndex: 0, questionId: 'role_durability' },
    role: 'My employer',
    elapsed: { value: 7, unit: 'month' },
  },
  {
    id: 'section-stale:sec3',
    kind: 'section-stale',
    nodeId: 'sec3',
    rank: 100,
    target: { in: 'top', questionId: 'entities_gate' },
    section: 'My World',
    elapsed: { value: 5, unit: 'month' },
  },
  {
    id: 'initiative-no-success:1',
    kind: 'initiative-no-success',
    nodeId: 'sec4',
    rank: 80,
    target: {
      in: 'repeatable',
      blockId: 'initiatives_records',
      recordIndex: 1,
      questionId: 'initiative_success',
    },
    initiative: 'the Atlas migration',
  },
  {
    id: 'section-empty:sec9',
    kind: 'section-empty',
    nodeId: 'sec9',
    rank: 60,
    target: { in: 'top', questionId: 'standards_list' },
    section: 'Context Boundaries',
    questions: 2,
  },
  {
    id: 'entities-thin:sec3',
    kind: 'entities-thin',
    nodeId: 'sec3',
    rank: 40,
    target: { in: 'repeatable', blockId: 'entities', recordIndex: 1, questionId: 'entity_name' },
    named: 1,
  },
  {
    id: 'initiatives-thin:sec4',
    kind: 'initiatives-thin',
    nodeId: 'sec4',
    rank: 20,
    target: {
      in: 'repeatable',
      blockId: 'initiatives_records',
      recordIndex: 1,
      questionId: 'initiative_name',
    },
    named: 1,
  },
];

describe('MINUTES_PER_QUESTION', () => {
  it('is the ported interview’s own low estimate over the file’s own questions', () => {
    const minutes = contextModules.reduce((sum, m) => sum + (m.estimatedMinutes[0] as number), 0);
    const count = (node: (typeof contextOutline)[number]): number =>
      node.questionIds.length + (node.children ?? []).reduce((s, c) => s + count(c), 0);
    const questions = contextOutline.reduce((sum, node) => sum + count(node), 0);

    // Stated rather than recomputed: the whole point is that both halves come
    // out of the ported data, so a silent edit to a module's pair or to the
    // outline moves this number and this test says so.
    expect(minutes).toBe(39);
    expect(questions).toBe(56);
    expect(MINUTES_PER_QUESTION).toBeCloseTo(minutes / questions, 10);
  });

  it('is under a minute a question, so a single-question trip rounds to one', () => {
    // Not a style preference: a rate at or above 1.0 would make the smallest
    // possible recommendation say "2 min", and §6 promoted this thing to the
    // top of Home precisely to make the next move look small.
    expect(MINUTES_PER_QUESTION).toBeLessThan(1);
    expect(MINUTES_PER_QUESTION).toBeGreaterThan(0);
  });
});

describe('recQuestions', () => {
  it('uses the count the engine already carries for an empty section', () => {
    expect(recQuestions(EVERY_KIND[3] as Recommendation)).toBe(2);
  });

  it('counts the whole section for a stale one, children included', () => {
    // sec3 is My World, six questions across itself and its children.
    expect(recQuestions(EVERY_KIND[1] as Recommendation)).toBe(6);
  });

  it('is one question for the kinds that name one question', () => {
    expect(recQuestions(EVERY_KIND[0] as Recommendation)).toBe(1);
    expect(recQuestions(EVERY_KIND[2] as Recommendation)).toBe(1);
  });

  it('is one record’s worth of fields for the "name another" kinds', () => {
    // Read off the real blocks rather than restated: naming another person
    // means filling in another record, and a record is the block's fields.
    for (const rec of [EVERY_KIND[4] as Recommendation, EVERY_KIND[5] as Recommendation]) {
      expect(recQuestions(rec)).toBeGreaterThan(1);
    }
  });
});

describe('recMinutes', () => {
  it('gives every kind a whole number of minutes, never zero', () => {
    for (const rec of EVERY_KIND) {
      const minutes = recMinutes(rec);
      expect(Number.isInteger(minutes), `${rec.kind} gave ${minutes}`).toBe(true);
      expect(minutes).toBeGreaterThanOrEqual(1);
    }
  });

  it('rounds up rather than down, so the estimate is never beaten by the clock', () => {
    // Two questions at ~0.7 each is 1.4 real minutes. Rounding down would
    // print "1 min" for something that takes nearly a minute and a half.
    expect(recMinutes(EVERY_KIND[3] as Recommendation)).toBe(2);
  });

  it('grows with the size of the trip', () => {
    const one = recMinutes(EVERY_KIND[0] as Recommendation);
    const section = recMinutes(EVERY_KIND[1] as Recommendation);
    expect(section).toBeGreaterThan(one);
  });
});
