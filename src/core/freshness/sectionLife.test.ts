import { describe, it, expect } from 'vitest';
import { sectionIsLit, sectionLife } from './sectionLife';
import { sectionHealthMap } from './sectionHealth';
import { outlineNodeCurrent, outlineNodeReached } from '../flow/outline';
import { contextModules, contextOutline } from '../flow/flow';
import type { SectionHealth } from './sectionHealth';
import type { AnswerValue } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';

/**
 * V1.8 VB-46 — the one rule both views read.
 *
 * Two layers, the same shape `sectionHealth.test.ts` uses: a hand-built health
 * record where every boundary is visible in the test file itself, and then the
 * REAL ported flow, so the rule is proved against the file the panel actually
 * draws rather than only against a fixture.
 */

const NOW = new Date('2026-08-24T12:00:00.000Z');

function health(over: Partial<SectionHealth> = {}): SectionHealth {
  return {
    id: 'sec1',
    state: 'partly',
    total: 6,
    answered: 3,
    skipped: 0,
    left: 3,
    due: 0,
    lastAnsweredAt: null,
    ageDays: null,
    elapsed: null,
    halfLifeDays: 365,
    ...over,
  };
}

describe('sectionLife', () => {
  it('is live where the flow is standing, whatever the counts say', () => {
    // Nothing answered yet — a section is live from its first QUESTION, not
    // from its first answer.
    expect(sectionLife({ health: health({ state: 'here', answered: 0 }) })).toBe('live');
    expect(sectionLife({ health: health({ state: 'here', answered: 6, total: 6 }) })).toBe('live');
    // …and the same fact arriving from the tree rather than from the health.
    expect(sectionLife({ current: true, health: health({ answered: 0 }) })).toBe('live');
    expect(sectionLife({ current: true })).toBe('live');
  });

  it('is lit with at least one of X answered', () => {
    expect(sectionLife({ health: health({ answered: 1, total: 13 }) })).toBe('lit');
    expect(sectionLife({ health: health({ state: 'done', answered: 6, total: 6 }) })).toBe('lit');
    expect(sectionLife({ health: health({ state: 'due', answered: 6, total: 6, due: 6 }) })).toBe('lit');
  });

  it('is dim at 0 of X — VB-46’s greyed row', () => {
    expect(sectionLife({ health: health({ state: 'not-yet', answered: 0, left: 6 }) })).toBe('dim');
    // A section whose only records are SKIPS. `outlineNodeState` calls this
    // one "reached", and the row prints "0 of 6" beside it — so the rule
    // follows the count, not the tree, or the row would argue with itself.
    expect(sectionLife({ health: health({ state: 'partly', answered: 0, skipped: 2, left: 4 }), reached: true })).toBe(
      'dim',
    );
  });

  it('falls back to the tree only when there are no counts at all', () => {
    expect(sectionLife({ reached: true })).toBe('lit');
    expect(sectionLife({ reached: false })).toBe('dim');
    expect(sectionLife({})).toBe('dim');
    // Real counts always win over the fallback, in both directions.
    expect(sectionLife({ health: health({ answered: 0 }), reached: true })).toBe('dim');
    expect(sectionLife({ health: health({ answered: 2 }), reached: false })).toBe('lit');
  });

  it('illumination includes the live row — the pulse is an addition, not an alternative', () => {
    expect(sectionIsLit('live')).toBe(true);
    expect(sectionIsLit('lit')).toBe(true);
    expect(sectionIsLit('dim')).toBe(false);
  });
});

/** The real flow, mid-interview: module one answered, and the question on
 * screen belongs to `2. About Me`. */
function midInterview(): { answers: Answers; currentQuestionId: string } {
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  for (const node of contextModules[0]!.nodes) {
    if ('fields' in node || node.kind === 'intro') continue;
    const key = node.outKey ?? node.key ?? node.id;
    values[key] = node.kind === 'multi' ? ['x'] : 'An answer.';
    answeredAt[key] = NOW.toISOString();
  }
  return { answers: { values, repeatables: {}, answeredAt, reflectedAt: {} }, currentQuestionId: contextOutline[1]!.questionIds[0]! };
}

describe('sectionLife — over the real ported flow', () => {
  it('gives exactly one live section, some lit, and the rest dim', () => {
    const { answers, currentQuestionId } = midInterview();
    const map = sectionHealthMap(contextOutline, contextModules, answers, currentQuestionId, NOW);
    const lives = contextOutline.map((node) =>
      sectionLife({
        health: map[node.id],
        current: outlineNodeCurrent(node, currentQuestionId),
        reached: outlineNodeReached(node, answers.values),
      }),
    );

    expect(lives.filter((life) => life === 'live')).toHaveLength(1);
    expect(lives[1], 'the section holding the question on screen') .toBe('live');
    expect(lives[0], 'module one is answered').toBe('lit');
    expect(lives.filter((life) => life === 'dim').length).toBeGreaterThan(4);
  });

  it('agrees with the count the row prints beside it, section by section', () => {
    const { answers, currentQuestionId } = midInterview();
    const map = sectionHealthMap(contextOutline, contextModules, answers, currentQuestionId, NOW);
    for (const node of contextOutline) {
      const entry = map[node.id]!;
      const life = sectionLife({ health: entry, current: outlineNodeCurrent(node, currentQuestionId) });
      // The whole of VB-46's greying rule, said as the row says it: dim if and
      // only if it reads "0 of X" and is not the one being worked on.
      if (life === 'dim') expect(entry.answered, node.id).toBe(0);
      if (entry.answered > 0) expect(sectionIsLit(life), node.id).toBe(true);
    }
  });

  it('an empty file is all dim, with nothing live until a question is on screen', () => {
    const empty: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
    const map = sectionHealthMap(contextOutline, contextModules, empty, null, NOW);
    for (const node of contextOutline) {
      expect(sectionLife({ health: map[node.id], current: false }), node.id).toBe('dim');
    }
  });
});
