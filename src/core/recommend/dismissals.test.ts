import { describe, it, expect } from 'vitest';
import {
  NO_DISMISSALS,
  activeDismissals,
  dismiss,
  isDismissed,
  readDismissals,
  restore,
  withoutDismissed,
} from './dismissals';
import type { Recommendation } from './types';

const NOW = new Date('2026-08-23T09:00:00.000Z');
const LATER = new Date('2026-09-30T09:00:00.000Z');

function rec(id: string): Recommendation {
  return {
    id,
    // Any real kind will do — this file is about the dismissal ledger, not
    // about which rule produced the thing being dismissed. BS-08 (D8) retired
    // the `entities-thin` fixture this used to carry.
    kind: 'initiative-no-success',
    nodeId: 'sec4',
    rank: 80,
    target: {
      in: 'repeatable',
      blockId: 'initiatives_records',
      recordIndex: 0,
      questionId: 'initiative_success',
    },
    initiative: 'the Atlas migration',
  };
}

describe('readDismissals', () => {
  it('reads an absent key as nothing hidden', () => {
    expect(readDismissals(undefined)).toEqual(NO_DISMISSALS);
  });

  it('reads a half-written key as nothing hidden rather than throwing', () => {
    // Degradation is mandatory (docs/GUARDRAILS.md): a storage key that came
    // back the wrong shape must cost the person their hidden list, at worst,
    // never their screen.
    expect(readDismissals({ dismissed: null } as unknown as { dismissed: Record<string, string> })).toEqual(
      NO_DISMISSALS,
    );
  });

  it('passes a real one straight through', () => {
    const stored = { dismissed: { 'entities-thin:sec3': NOW.toISOString() } };
    expect(readDismissals(stored)).toBe(stored);
  });
});

describe('dismiss', () => {
  it('records the id with the date it happened', () => {
    const next = dismiss(NO_DISMISSALS, 'entities-thin:sec3', NOW);
    expect(next.dismissed).toEqual({ 'entities-thin:sec3': NOW.toISOString() });
    expect(isDismissed(next, 'entities-thin:sec3')).toBe(true);
  });

  it('does not mutate what it was given', () => {
    const before = { dismissed: {} };
    dismiss(before, 'a', NOW);
    expect(before.dismissed).toEqual({});
  });

  it('keeps the first date when the same id is dismissed twice', () => {
    // A re-render must never look like a new decision — the date is when they
    // turned it down, not when the panel last noticed.
    const once = dismiss(NO_DISMISSALS, 'a', NOW);
    const twice = dismiss(once, 'a', LATER);
    expect(twice).toBe(once);
    expect(twice.dismissed.a).toBe(NOW.toISOString());
  });
});

describe('activeDismissals', () => {
  it('is permanent today — a dismissal from a year ago still counts', () => {
    const ancient = { dismissed: { a: '2020-01-01T00:00:00.000Z' } };
    expect(activeDismissals(ancient).has('a')).toBe(true);
  });
});

describe('restore', () => {
  it('takes an id back out, without touching the others', () => {
    const state = dismiss(dismiss(NO_DISMISSALS, 'a', NOW), 'b', NOW);
    const back = restore(state, 'a');
    expect(back.dismissed).toEqual({ b: NOW.toISOString() });
  });

  it('is a no-op for an id that was never hidden', () => {
    const state = dismiss(NO_DISMISSALS, 'a', NOW);
    expect(restore(state, 'zzz')).toBe(state);
  });
});

describe('withoutDismissed', () => {
  it('filters, and leaves the rest in order', () => {
    const list = [rec('a'), rec('b'), rec('c')];
    expect(withoutDismissed(list, new Set(['b'])).map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('is a filter, not a deletion — restoring brings the same recommendation back', () => {
    const list = [rec('a')];
    const hidden = dismiss(NO_DISMISSALS, 'a', NOW);
    expect(withoutDismissed(list, activeDismissals(hidden))).toEqual([]);
    expect(withoutDismissed(list, activeDismissals(restore(hidden, 'a')))).toEqual(list);
  });
});
