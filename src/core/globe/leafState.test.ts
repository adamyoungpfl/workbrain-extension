import { describe, expect, it } from 'vitest';
import {
  leafActionIsPrimary,
  leafBlockIsDashed,
  leafOrbIsHollow,
  leafStateFor,
} from './leafState';
import type { LeafState } from './leafState';
import type { NodeSummary } from '../flow/nodeSummary';

/**
 * BS-07c (§7.3) — the six states, and Adam's O1 ruling inside them.
 */

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

const ALL: LeafState[] = [
  'answer-filled',
  'answer-empty',
  'answer-skipped',
  'list-healthy',
  'list-incomplete',
  'list-empty',
];

describe('leafStateFor', () => {
  it('reads an answered node as filled', () => {
    expect(leafStateFor(summary({ itemKind: 'answer', items: 3, answered: 3, total: 5 }), false)).toBe(
      'answer-filled',
    );
  });

  it('tells a SKIP apart from a gap, which is the whole of O1', () => {
    // Asked and passed on: zero answers, but a recorded decision.
    expect(leafStateFor(summary({ itemKind: 'answer', items: 0, skipped: 2, total: 2 }), false)).toBe(
      'answer-skipped',
    );
    // Never reached at all.
    expect(leafStateFor(summary({ itemKind: 'answer', items: 0, skipped: 0, total: 2 }), false)).toBe(
      'answer-empty',
    );
  });

  it('reads a list by whether its own questions are finished', () => {
    expect(leafStateFor(summary({ itemKind: 'record', items: 2, answered: 8, total: 8 }), true)).toBe(
      'list-healthy',
    );
    expect(leafStateFor(summary({ itemKind: 'record', items: 2, answered: 5, total: 8 }), true)).toBe(
      'list-incomplete',
    );
    expect(leafStateFor(summary({ itemKind: 'record', items: 0, answered: 0, total: 8 }), true)).toBe(
      'list-empty',
    );
  });

  it('treats a missing summary as empty, of whichever kind the node is', () => {
    // `nodeSummaryFor` returns null for a node holding nothing — a real state,
    // and the node's own shape is what says which empty it is.
    expect(leafStateFor(null, true)).toBe('list-empty');
    expect(leafStateFor(null, false)).toBe('answer-empty');
  });
});

describe('O1 — a skip is not re-raised', () => {
  it('gives the primary action to the two genuinely empty states, and no others', () => {
    const primary = ALL.filter(leafActionIsPrimary);
    expect(primary).toEqual(['answer-empty', 'list-empty']);
  });

  it('does NOT push a skipped answer, however empty its block looks', () => {
    // The matrix in §7.3 said primary here. O3 settled that a skip is a
    // decision the product does not argue with, and this is where that lands.
    expect(leafActionIsPrimary('answer-skipped')).toBe(false);
    expect(leafActionIsPrimary('answer-filled')).toBe(false);
  });

  it('still draws a skipped node as empty, because it is', () => {
    // The quieter ACTION is the ruling; the drawing is unchanged. A skipped
    // node holds nothing, and painting it as full would be the opposite lie.
    expect(leafOrbIsHollow('answer-skipped')).toBe(true);
    expect(leafBlockIsDashed('answer-skipped')).toBe(true);
  });
});

describe('the drawing rules', () => {
  it('hollows the orb exactly where the block is dashed', () => {
    for (const state of ALL) {
      expect(leafBlockIsDashed(state), state).toBe(leafOrbIsHollow(state));
    }
  });

  it('draws every node that holds something as solid and tinted', () => {
    for (const state of ['answer-filled', 'list-healthy', 'list-incomplete'] as LeafState[]) {
      expect(leafOrbIsHollow(state), state).toBe(false);
      expect(leafBlockIsDashed(state), state).toBe(false);
    }
  });
});
