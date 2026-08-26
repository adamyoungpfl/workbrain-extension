import { describe, it, expect } from 'vitest';
import { VERTICAL_PICK_QUESTIONS, usesVerticalPick } from './verticalPick';

/**
 * V2.4 VB-108 — the vertical pick's scope. Decision 10 is "this question
 * only", so the census is the test: one id, and the predicate refuses
 * everything else — including the same id worn by a different kind.
 */

describe('the vertical pick list (VB-108)', () => {
  it('claims context_scope, and only context_scope — decision 10', () => {
    expect(VERTICAL_PICK_QUESTIONS).toEqual(['context_scope']);
    expect(usesVerticalPick({ id: 'context_scope', kind: 'chips' })).toBe(true);
  });

  it('claims no other question, and no other kind', () => {
    expect(usesVerticalPick({ id: 'goal_service', kind: 'chips' })).toBe(false);
    expect(usesVerticalPick({ id: 'voice_directness', kind: 'chips' })).toBe(false);
    expect(usesVerticalPick({ id: 'context_scope', kind: 'text' })).toBe(false);
    expect(usesVerticalPick({ id: 'context_scope', kind: 'multi' })).toBe(false);
  });
});
