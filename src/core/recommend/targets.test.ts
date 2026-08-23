import { describe, it, expect } from 'vitest';
import { positionForTarget } from './targets';
import { contextModules } from '../flow/flow';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY } from '../freshness/nextMove';
import { INITIATIVES_BLOCK_ID, INITIATIVE_SUCCESS_ID } from './engine';

describe('positionForTarget', () => {
  it('resolves a top-level question to a plain step position', () => {
    const position = positionForTarget(contextModules, { in: 'top', questionId: 'standards_list' });
    expect(position?.kind).toBe('step');
    if (position?.kind !== 'step') throw new Error('expected step');
    expect(position.step.id).toBe('standards_list');
    expect(position.location).toEqual({ in: 'top' });
  });

  it('resolves a repeatable field to the right record, not always the first', () => {
    const position = positionForTarget(contextModules, {
      in: 'repeatable',
      blockId: INITIATIVES_BLOCK_ID,
      recordIndex: 2,
      questionId: INITIATIVE_SUCCESS_ID,
    });
    if (position?.kind !== 'step') throw new Error('expected step');
    expect(position.step.id).toBe(INITIATIVE_SUCCESS_ID);
    expect(position.location).toEqual({ in: 'repeatable', blockId: INITIATIVES_BLOCK_ID, recordIndex: 2 });
  });

  it('resolves the one deep link R1-12 already had, the same way App.tsx did', () => {
    const position = positionForTarget(contextModules, {
      in: 'repeatable',
      blockId: ROLES_BLOCK_ID,
      recordIndex: 1,
      questionId: ROLE_DURABILITY_KEY,
    });
    if (position?.kind !== 'step') throw new Error('expected step');
    expect(position.step.id).toBe(ROLE_DURABILITY_KEY);
    expect(position.location).toEqual({ in: 'repeatable', blockId: ROLES_BLOCK_ID, recordIndex: 1 });
  });

  it('gives back undefined rather than throwing when the ported data has no such id', () => {
    expect(positionForTarget(contextModules, { in: 'top', questionId: 'gone' })).toBeUndefined();
    expect(
      positionForTarget(contextModules, {
        in: 'repeatable',
        blockId: 'gone',
        recordIndex: 0,
        questionId: 'gone',
      }),
    ).toBeUndefined();
    expect(
      positionForTarget(contextModules, {
        in: 'repeatable',
        blockId: ROLES_BLOCK_ID,
        recordIndex: 0,
        questionId: 'standards_list',
      }),
    ).toBeUndefined();
  });

  it('never mistakes a repeatable field for a top-level question', () => {
    // `entity_name` only exists inside the `entities` block. Asking for it at
    // top level must miss, or a recommendation would deep-link somewhere the
    // runner cannot stand.
    expect(positionForTarget(contextModules, { in: 'top', questionId: 'entity_name' })).toBeUndefined();
  });
});
