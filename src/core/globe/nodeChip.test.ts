import { describe, expect, it } from 'vitest';
import { nodeChipFor, nodeChipIsDashed } from './nodeChip';
import type { NodeSummary } from '../flow/nodeSummary';
import type { SectionHealth, SectionHealthState } from '../freshness/sectionHealth';
import type { OutlineNodeState } from '../flow/outline';

/**
 * BS-07b (§7.1) — one chip, or none, and never two.
 */

function health(over: Partial<SectionHealth>): SectionHealth {
  return {
    id: 'sec3',
    state: 'done',
    total: 6,
    answered: 6,
    skipped: 0,
    left: 0,
    due: 0,
    lastAnsweredAt: null,
    ageDays: 1,
    elapsed: null,
    halfLifeDays: 180,
    ...over,
  };
}

function summary(over: Partial<NodeSummary>): NodeSummary {
  return {
    nodeId: 'sec3',
    label: '3. My World',
    items: 0,
    itemKind: 'answer',
    categoryBy: '',
    categories: [],
    categoriesHidden: 0,
    answered: 0,
    total: 0,
    skipped: 0,
    ageDays: null,
    elapsed: null,
    ...over,
  };
}

describe('nodeChipFor', () => {
  it('gives a list node its count, which is the more specific fact', () => {
    const chip = nodeChipFor(summary({ itemKind: 'record', items: 3 }), health({}), 'reached', true);
    expect(chip).toEqual({ kind: 'count', count: 3 });
  });

  it('gives an EMPTY list a zero rather than a word', () => {
    // "Not yet" cannot tell you a section built for several is holding none.
    expect(nodeChipFor(null, health({ answered: 0 }), 'untouched', true)).toEqual({ kind: 'count', count: 0 });
  });

  it('says "due" on a section past its own clock', () => {
    expect(nodeChipFor(summary({}), health({ state: 'due' }), 'reached', false)).toEqual({
      kind: 'word',
      state: 'due',
    });
  });

  it('says "not yet" where nothing has been answered', () => {
    expect(nodeChipFor(summary({}), health({ answered: 0, state: 'not-yet' }), 'untouched', false)).toEqual({
      kind: 'word',
      state: 'not-yet',
    });
    // And with no health at all — the showcase globe, which has no flow state.
    expect(nodeChipFor(null, undefined, 'untouched', false)).toEqual({ kind: 'word', state: 'not-yet' });
  });

  it('says NOTHING about a quiet, answered section', () => {
    // Ten empty chips on a 260px stage is ten pieces of furniture.
    expect(nodeChipFor(summary({}), health({ state: 'done', answered: 6 }), 'reached', false)).toBeNull();
  });

  it('prefers "due" to "not yet" — the one somebody would act on', () => {
    const chip = nodeChipFor(summary({}), health({ state: 'due', answered: 0 }), 'untouched', false);
    expect(chip).toEqual({ kind: 'word', state: 'due' });
  });

  it('never returns two of anything, for any state', () => {
    const states: SectionHealthState[] = ['here', 'done', 'due', 'partly', 'not-yet'];
    const nodeStates: OutlineNodeState[] = ['current', 'reached', 'untouched'];
    for (const state of states) {
      for (const nodeState of nodeStates) {
      for (const ownsList of [true, false]) {
        for (const answered of [0, 3]) {
          const chip = nodeChipFor(summary({ itemKind: 'record', items: 2 }), health({ state, answered }), nodeState, ownsList);
          if (chip === null) continue;
          // A union of one member each — there is no shape here that could
          // carry a second chip, which is how "never two" is enforced.
          expect(Object.keys(chip).sort(), `${state}/${nodeState}/${ownsList}/${answered}`).toEqual(
            chip.kind === 'count' ? ['count', 'kind'] : ['kind', 'state'],
          );
        }
      }
      }
    }
  });
});

describe('nodeChipIsDashed', () => {
  it('dashes an untouched node, and only that', () => {
    expect(nodeChipIsDashed('untouched')).toBe(true);
    expect(nodeChipIsDashed('reached')).toBe(false);
    expect(nodeChipIsDashed('current')).toBe(false);
  });

  it('reads the SAME state the node’s accessible name is built from', () => {
    // The whole point of taking `OutlineNodeState` rather than health: a node
    // that announces itself "Written" must not wear a chip saying "Not yet",
    // and a dashed edge is that same claim drawn instead of spoken.
    for (const state of ['current', 'reached'] as const) {
      expect(nodeChipIsDashed(state), state).toBe(false);
      expect(nodeChipFor(summary({}), health({ answered: 0 }), state, false)).not.toEqual({
        kind: 'word',
        state: 'not-yet',
      });
    }
  });
});
