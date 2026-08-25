import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import { contextModules, contextOutline } from './flow';
import {
  applyAnswer,
  applyReflect,
  findPosition,
  findSeedStep,
  findSeedTarget,
  reconcileSeededRepeatable,
} from './runner';
import { applyAddRecord, multipleGroups, multipleRecordCount, nameKeyFor, recordNameTaken } from './multiples';

/**
 * V1.7 VB-38. The four tests that matter are named as such below — they are
 * the ones docs/V1.4-REFINEMENT.md's VB-20 paid for the hard way:
 *
 *  (a) a record added to the SEEDED block survives its seed question being
 *      re-submitted, with every answer inside it;
 *  (b) the same for an OPEN-ENDED block, which is a different mechanism and so
 *      needs its own proof rather than an argument by analogy;
 *  (c) editing one record touches only that record;
 *  (d) a duplicate name is refused, and nothing is written.
 */

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

const block = (id: string): RepeatableBlock =>
  contextModules.flatMap((m) => m.nodes).find((n): n is RepeatableBlock => 'fields' in n && n.id === id)!;

const topStep = (id: string): Step =>
  contextModules.flatMap((m) => m.nodes).find((n): n is Step => !('fields' in n) && n.id === id)!;

/**
 * Answers the whole real interview, the way the panel would: gates answered
 * `gate`, every add-another declined, so each open-ended block ends up holding
 * exactly one record. Walking the real flow rather than hand-writing answers
 * means these tests keep testing the shipped content as it moves.
 */
function completeFlow(gate: 'yes' | 'no' = 'yes', modules: Module[] = contextModules): Answers {
  let answers = EMPTY;
  const declined = new Set<string>();
  const seenIntros = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    const pos = findPosition(modules, answers, declined, seenIntros);
    if (pos.kind === 'done') return answers;
    if (pos.kind === 'module-intro') {
      seenIntros.add(pos.module.id);
      continue;
    }
    if (pos.kind === 'add-another') {
      declined.add(pos.block.id);
      continue;
    }
    if (pos.kind === 'reflect') {
      answers = applyReflect(answers, pos.step, pos.location, 'kept');
      continue;
    }
    const value: AnswerValue =
      pos.step.kind === 'multi'
        ? [pos.step.options?.[0]?.v ?? 'x']
        : pos.step.kind === 'chips'
          ? (pos.step.options?.[0]?.v ?? 'x')
          : pos.step.kind === 'yesno'
            ? gate
            : `an answer for ${pos.step.id}`;
    answers = applyAnswer(answers, pos.step, pos.location, value);
    if (pos.location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(modules, pos.step.id);
      if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
    }
  }
  throw new Error('the flow never finished');
}

/** Answers whatever is still missing inside ONE record, and nothing else —
 * what the panel does after opening a record it just added. */
function fillRecord(answers: Answers, blockId: string, recordIndex: number): Answers {
  let next = answers;
  // Every OTHER block's loop is declined, exactly as the panel does when
  // somebody says "no more" — otherwise a finished block sitting earlier in
  // the flow answers first and this walk never reaches the record it is for.
  const declined = new Set<string>();
  for (let guard = 0; guard < 20; guard++) {
    const pos = findPosition(contextModules, next, declined, new Set());
    if (pos.kind === 'add-another') {
      if (pos.block.id === blockId) break;
      declined.add(pos.block.id);
      continue;
    }
    if (pos.kind === 'done' || pos.kind === 'module-intro') break;
    if (pos.location.in !== 'repeatable' || pos.location.blockId !== blockId || pos.location.recordIndex !== recordIndex) {
      break;
    }
    if (pos.kind === 'reflect') {
      next = applyReflect(next, pos.step, pos.location, 'kept');
      continue;
    }
    next = applyAnswer(
      next,
      pos.step,
      pos.location,
      pos.step.kind === 'chips' ? (pos.step.options?.[0]?.v ?? 'x') : `an answer for ${pos.step.id}`,
    );
  }
  return next;
}

describe('multipleGroups — the real flow', () => {
  it('lists the four blocks that come in numbers, under the file own section names', () => {
    // V2.0 VB-64 made Audience Profiles the second seeded block — the roles
    // pattern reused, one record per audience already picked.
    const groups = multipleGroups(contextModules, contextOutline, completeFlow('yes'));
    expect(groups.map((g) => g.blockId)).toEqual(['roles', 'entities', 'initiatives_records', 'audiences']);
    expect(groups.map((g) => g.title)).toEqual(['Roles', 'My World', 'Initiatives', 'Audience Profiles']);
    expect(groups.map((g) => g.seeded)).toEqual([true, false, false, true]);
  });

  it('leaves out a block the interview itself would skip', () => {
    // V2.0 VB-61/VB-63: there is no gate left to answer "no" to — both blocks
    // are required now. The one thing that still takes a block out of the
    // interview is a decline RECORDED UNDER THE OLD RULE, which
    // core/flow/overrides.ts honours forever, so that is what this seeds.
    const legacyDecline = completeFlow('yes');
    const answers: Answers = {
      ...legacyDecline,
      values: { ...legacyDecline.values, entities_gate: 'no', initiatives_gate: 'no' },
    };
    const groups = multipleGroups(contextModules, contextOutline, answers);
    expect(groups.map((g) => g.blockId)).toEqual(['roles', 'audiences']);
  });

  it('counts each record answered questions, and names it the way the file does', () => {
    const answers = completeFlow('yes');
    const groups = multipleGroups(contextModules, contextOutline, answers);
    const roles = groups.find((g) => g.blockId === 'roles')!;
    expect(roles.records).toHaveLength(1);
    expect(roles.records[0]).toEqual({ index: 0, name: 'Employee', answered: 4, total: 4 });

    const entities = groups.find((g) => g.blockId === 'entities')!;
    expect(entities.records[0]!.name).toBe('an answer for entity_name');
    expect(entities.records[0]!.answered).toBe(entities.records[0]!.total);
  });

  it('asks for a new name in the interview own words, never in new ones', () => {
    const groups = multipleGroups(contextModules, contextOutline, completeFlow('yes'));
    expect(groups.find((g) => g.blockId === 'roles')!.namePrompt).toBe('What do you call this role?');
    expect(groups.find((g) => g.blockId === 'entities')!.namePrompt).toBe(
      "What's their name — or its name, if this is a tool or team?",
    );
  });

  it('reports a half-finished record as half finished, and an unnamed one as unnamed', () => {
    const answers: Answers = {
      ...EMPTY,
      values: { entities_gate: 'yes' },
      repeatables: { entities: [{ entity_type: 'person' }] },
    };
    const entities = multipleGroups(contextModules, contextOutline, answers).find((g) => g.blockId === 'entities')!;
    expect(entities.records[0]).toEqual({ index: 0, name: '', answered: 1, total: 4 });
  });

  it('counts every record a person holds', () => {
    // Four blocks, one record each — V2.0 VB-64 added the fourth (audiences).
    expect(multipleRecordCount(contextModules, contextOutline, completeFlow('yes'))).toBe(4);
    expect(multipleRecordCount(contextModules, contextOutline, EMPTY)).toBe(0);
  });
});

describe('nameKeyFor', () => {
  it('reads a seeded block name from its seed field, and an open-ended one from its first question', () => {
    expect(nameKeyFor(block('roles'))).toBe('role_name');
    expect(nameKeyFor(block('entities'))).toBe('entity_name');
    expect(nameKeyFor(block('initiatives_records'))).toBe('initiative_name');
  });
});

describe('(a) THE SEEDED BLOCK — an added record survives its seed question', () => {
  it('writes the name to the seed answer AND the record, in one step', () => {
    const answers = completeFlow('yes');
    const added = applyAddRecord(contextModules, answers, 'roles', 'Board member')!;
    expect(added.recordIndex).toBe(1);
    expect(added.answers.values.role_names).toEqual(['employee', 'Board member']);
    expect(added.answers.repeatables.roles).toHaveLength(2);
    expect(added.answers.repeatables.roles![1]).toEqual({ role_name: 'Board member' });
    // The role that was already there is untouched.
    expect(added.answers.repeatables.roles![0]).toEqual(answers.repeatables.roles![0]);
  });

  it('keeps the added record AND ALL ITS ANSWERS when role_names is re-submitted unchanged', () => {
    let answers = applyAddRecord(contextModules, completeFlow('yes'), 'roles', 'Board member')!.answers;
    answers = fillRecord(answers, 'roles', 1);

    const before = answers.repeatables.roles![1]!;
    expect(Object.keys(before).sort()).toEqual([
      'role_durability',
      'role_for',
      'role_mandate',
      'role_name',
      'role_standing',
    ]);

    // Back to role_names, Next, nothing changed. This is the press that used
    // to delete it — see this file header and runner.ts's own comment on
    // `applySeededAddAnother`.
    const rolesBlock = block('roles');
    const seedStep = findSeedStep(contextModules, rolesBlock)!;
    const unchanged = answers.values.role_names as string[];
    answers = applyAnswer(answers, seedStep, { in: 'top' }, unchanged);
    answers = reconcileSeededRepeatable(answers, rolesBlock, seedStep, unchanged);

    expect(answers.repeatables.roles).toHaveLength(2);
    expect(answers.repeatables.roles![1]).toEqual(before);
  });
});

describe('(b) AN OPEN-ENDED BLOCK — an added record survives too, by a different route', () => {
  it('adds the record by answering the question that names it', () => {
    const answers = completeFlow('yes');
    const added = applyAddRecord(contextModules, answers, 'entities', 'Priya')!;
    expect(added.recordIndex).toBe(1);
    expect(added.answers.repeatables.entities).toHaveLength(2);
    expect(added.answers.repeatables.entities![1]).toEqual({ entity_name: 'Priya' });
    // The name is a real answer to a real question here, so it is stamped —
    // freshness reads these, and a record with no stamp would never age.
    expect(added.answers.answeredAt['entities#1#entity_name']).toBeTypeOf('string');
    expect(added.answers.repeatables.entities![0]).toEqual(answers.repeatables.entities![0]);
    // Nothing seeds this block, so nothing rebuilds it — which is exactly why
    // it needs its own proof rather than the seeded one's.
    expect(findSeedTarget(contextModules, 'entities_gate')).toBeUndefined();
  });

  it('keeps the added record AND ALL ITS ANSWERS when the gate above it is re-answered', () => {
    let answers = applyAddRecord(contextModules, completeFlow('yes'), 'entities', 'Priya')!.answers;
    answers = fillRecord(answers, 'entities', 1);

    const before = answers.repeatables.entities![1]!;
    expect(Object.keys(before).sort()).toEqual([
      'entity_aliases',
      'entity_name',
      'entity_relevance',
      'entity_type',
    ]);

    const gate = topStep('entities_gate');
    answers = applyAnswer(answers, gate, { in: 'top' }, 'yes');
    const seedTarget = findSeedTarget(contextModules, 'entities_gate');
    if (seedTarget) throw new Error('entities is not seeded — this test is asserting the wrong thing');

    expect(answers.repeatables.entities).toHaveLength(2);
    expect(answers.repeatables.entities![1]).toEqual(before);
  });

  it('does the same for initiatives, the second open-ended block', () => {
    const answers = applyAddRecord(contextModules, completeFlow('yes'), 'initiatives_records', 'Atlas migration')!;
    expect(answers.answers.repeatables.initiatives_records![1]).toEqual({ initiative_name: 'Atlas migration' });
  });
});

describe('(c) editing one record changes only that record', () => {
  it('leaves every sibling record byte-identical', () => {
    let answers = applyAddRecord(contextModules, completeFlow('yes'), 'roles', 'Board member')!.answers;
    answers = fillRecord(answers, 'roles', 1);
    const untouched = answers.repeatables.roles![0]!;

    const mandate = block('roles').fields.find((f) => f.id === 'role_mandate')!;
    const edited = applyAnswer(answers, mandate, { in: 'repeatable', blockId: 'roles', recordIndex: 1 }, 'Something new');

    expect(edited.repeatables.roles![0]).toEqual(untouched);
    expect(edited.repeatables.roles![1]!.role_mandate).toBe('Something new');
    expect(edited.repeatables.roles![1]!.role_name).toBe('Board member');
    expect(edited.repeatables.entities).toEqual(answers.repeatables.entities);
  });

  it('holds for an open-ended block too', () => {
    let answers = applyAddRecord(contextModules, completeFlow('yes'), 'entities', 'Priya')!.answers;
    answers = fillRecord(answers, 'entities', 1);
    const untouched = answers.repeatables.entities![0]!;

    const relevance = block('entities').fields.find((f) => f.id === 'entity_relevance')!;
    const edited = applyAnswer(answers, relevance, { in: 'repeatable', blockId: 'entities', recordIndex: 1 }, 'Runs ops');

    expect(edited.repeatables.entities![0]).toEqual(untouched);
    expect(edited.repeatables.entities![1]!.entity_relevance).toBe('Runs ops');
  });
});

describe('(d) a duplicate name is refused, and nothing is written', () => {
  it('refuses a seeded name that is already a record, whatever its case', () => {
    const answers = completeFlow('yes');
    expect(recordNameTaken(contextModules, answers, 'roles', 'Employee')).toBe(true);
    expect(recordNameTaken(contextModules, answers, 'roles', '  employee  ')).toBe(true);
    expect(applyAddRecord(contextModules, answers, 'roles', 'Employee')).toBeNull();
  });

  it('refuses a name that is only on the seed answer, not yet a record', () => {
    // The value and its label are different strings; either colliding would
    // collapse two records into one on the next reconcile.
    const answers: Answers = {
      ...EMPTY,
      values: { role_names: ['business-owner'] },
      repeatables: { roles: [] },
    };
    expect(recordNameTaken(contextModules, answers, 'roles', 'business-owner')).toBe(true);
    expect(recordNameTaken(contextModules, answers, 'roles', 'Business Owner')).toBe(true);
  });

  it('refuses a duplicate in an open-ended block, where the list is the only way to tell two apart', () => {
    const answers = applyAddRecord(contextModules, completeFlow('yes'), 'entities', 'Priya')!.answers;
    expect(recordNameTaken(contextModules, answers, 'entities', 'priya')).toBe(true);
    expect(applyAddRecord(contextModules, answers, 'entities', 'PRIYA')).toBeNull();
    // A different name is fine, and lands after the two that exist.
    expect(applyAddRecord(contextModules, answers, 'entities', 'Jordan')!.recordIndex).toBe(2);
  });

  it('refuses a blank name, and an unknown block, rather than writing something empty', () => {
    const answers = completeFlow('yes');
    expect(applyAddRecord(contextModules, answers, 'roles', '   ')).toBeNull();
    expect(applyAddRecord(contextModules, answers, 'nope', 'Anything')).toBeNull();
    expect(recordNameTaken(contextModules, answers, 'nope', 'Anything')).toBe(false);
  });
});
