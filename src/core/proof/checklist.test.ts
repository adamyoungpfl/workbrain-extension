import { describe, expect, it } from 'vitest';
import { proofChecks, proofTally } from './checklist';
import type { Answers } from '../../schema/storage.types';

function answers(partial: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...partial };
}

describe('the checks a person is offered', () => {
  it('is the floor of two when they have named nobody and nothing', () => {
    expect(proofChecks(answers()).map((c) => c.id)).toEqual(['voice', 'ask']);
  });

  it('names the person they named', () => {
    const a = answers({ repeatables: { entities: [{ entity_name: 'Priya' }] } });
    expect(proofChecks(a)[0]).toEqual({ id: 'person', name: 'Priya' });
  });

  it('names the initiative they named', () => {
    const a = answers({ repeatables: { initiatives_records: [{ initiative_name: 'Northstar' }] } });
    expect(proofChecks(a)[0]).toEqual({ id: 'project', name: 'Northstar' });
  });

  it('offers the specific ones first — a name coming back is the thing that lands', () => {
    const a = answers({
      repeatables: {
        entities: [{ entity_name: 'Priya' }],
        initiatives_records: [{ initiative_name: 'Northstar' }],
      },
    });
    expect(proofChecks(a).map((c) => c.id)).toEqual(['person', 'project', 'voice', 'ask']);
  });

  it('skips a record that exists but was never named', () => {
    // An added-but-unanswered record is real: `applyAddRecord` mints one the
    // moment somebody says "yes, another". It has no name to check against.
    const a = answers({ repeatables: { entities: [{ entity_name: '   ' }, { entity_name: 'Marcus' }] } });
    expect(proofChecks(a)[0]).toEqual({ id: 'person', name: 'Marcus' });
  });

  it('never offers more than one of each kind, however many records there are', () => {
    const a = answers({
      repeatables: { entities: [{ entity_name: 'Priya' }, { entity_name: 'Marcus' }] },
    });
    expect(proofChecks(a).filter((c) => c.id === 'person')).toHaveLength(1);
  });

  it('reads names from the same field the file prints them by', () => {
    // `entity_name` and `initiative_name` are the blocks' own name fields
    // (core/files/lookups.ts's nameStepFor). If those ever move, this fails
    // rather than silently offering a floor-only checklist.
    const a = answers({ repeatables: { entities: [{ wrong_field: 'Priya' }] } });
    expect(proofChecks(a).map((c) => c.id)).toEqual(['voice', 'ask']);
  });
});

describe('the tally under the ticks', () => {
  const offered = [{ id: 'person' as const, name: 'Priya' }, { id: 'voice' as const }];

  it('counts what was ticked against what was offered', () => {
    expect(proofTally(['person'], offered)).toEqual({ value: 1, of: 2 });
    expect(proofTally(['person', 'voice'], offered)).toEqual({ value: 2, of: 2 });
    expect(proofTally([], offered)).toEqual({ value: 0, of: 2 });
  });

  it('ignores a tick for a check that was not offered', () => {
    // A re-run against changed answers can leave a stale tick in hand. It
    // must not inflate a number the person is about to be shown.
    expect(proofTally(['person', 'project'], offered)).toEqual({ value: 1, of: 2 });
  });

  it('never counts the same tick twice', () => {
    expect(proofTally(['voice', 'voice'], offered).value).toBeLessThanOrEqual(2);
  });

  /**
   * THE REASON `of` EXISTS. Two of two and two of four are different facts,
   * and a stored `value` alone cannot tell them apart — which matters
   * because the checklist's length depends on how much the person had
   * answered when they ran it.
   */
  it('distinguishes two-of-two from two-of-four', () => {
    const four = [
      { id: 'person' as const },
      { id: 'project' as const },
      { id: 'voice' as const },
      { id: 'ask' as const },
    ];
    expect(proofTally(['voice', 'ask'], offered).of).toBe(2);
    expect(proofTally(['voice', 'ask'], four).of).toBe(4);
  });
});
