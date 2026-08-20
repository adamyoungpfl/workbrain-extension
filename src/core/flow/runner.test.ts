import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { Module, RepeatableBlock, Step } from '../../schema/flow.types';
import {
  findPosition,
  applyAnswer,
  applySkip,
  applyAddAnother,
  reconcileSeededRepeatable,
  findSeedTarget,
  questionCount,
  existingValue,
  topLevelIndex,
  moduleFor,
} from './runner';

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, ...overrides };
}

const introStep: Step = { id: 'intro1', module: 1, section: 0, eyebrow: 'E', q: 'Hi', kind: 'intro' };
const textStep: Step = { id: 'q_text', module: 1, section: 0, eyebrow: 'E', q: 'Text?', kind: 'text', key: 'q_text' };
const chipsStep: Step = {
  id: 'q_chips',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'Chips?',
  kind: 'chips',
  key: 'q_chips',
  options: [
    { v: 'a', l: 'A' },
    { v: 'b', l: 'B' },
  ],
};
const gateStep: Step = { id: 'gate', module: 1, section: 0, eyebrow: 'E', q: 'Gate?', kind: 'yesno', key: 'gate' };

const openBlock: RepeatableBlock = {
  id: 'items',
  addAnotherPrompt: 'more?',
  skipIf: (ctx) => ctx.answers.gate !== 'yes',
  fields: [
    { id: 'item_name', module: 1, section: 0, eyebrow: 'E', q: 'Name?', kind: 'text', key: 'item_name' },
    {
      id: 'item_type',
      module: 1,
      section: 0,
      eyebrow: 'E',
      q: 'Type?',
      kind: 'chips',
      key: 'item_type',
      options: [{ v: 'x', l: 'X' }],
    },
  ],
};

const modules: Module[] = [
  {
    id: 'm1',
    n: 1,
    title: 'Mod',
    purpose: 'p',
    required: true,
    estimatedMinutes: [1, 1],
    nodes: [introStep, textStep, chipsStep, gateStep, openBlock],
  },
];

const NONE = new Set<string>();

describe('findPosition — linear steps and skipIf', () => {
  it('starts at the first step, including intro (tracked by id, not key)', () => {
    const pos = findPosition(modules, makeAnswers(), NONE);
    expect(pos).toEqual({ kind: 'step', step: introStep, location: { in: 'top' } });
  });

  it('advances past an intro once it has any recorded value (even null)', () => {
    const pos = findPosition(modules, makeAnswers({ values: { intro1: null } }), NONE);
    expect(pos).toEqual({ kind: 'step', step: textStep, location: { in: 'top' } });
  });

  it('advances through answered steps in order', () => {
    const answers = makeAnswers({ values: { intro1: null, q_text: 'hello' } });
    expect(findPosition(modules, answers, NONE)).toEqual({
      kind: 'step',
      step: chipsStep,
      location: { in: 'top' },
    });
  });

  it('a skipped (null) step still counts as visited', () => {
    const answers = makeAnswers({ values: { intro1: null, q_text: 'hello', q_chips: null } });
    expect(findPosition(modules, answers, NONE)).toEqual({ kind: 'step', step: gateStep, location: { in: 'top' } });
  });

  it('skipIf on the repeatable is respected — answering the gate "no" ends the flow', () => {
    const answers = makeAnswers({ values: { intro1: null, q_text: 'hello', q_chips: null, gate: 'no' } });
    expect(findPosition(modules, answers, NONE)).toEqual({ kind: 'done' });
  });
});

describe('findPosition — open-ended repeatable', () => {
  const gated = { intro1: null, q_text: 'hello', q_chips: null, gate: 'yes' };

  it('once the gate opens the block, the first record starts at its first field', () => {
    const answers = makeAnswers({ values: gated });
    expect(findPosition(modules, answers, NONE)).toEqual({
      kind: 'step',
      step: openBlock.fields[0],
      location: { in: 'repeatable', blockId: 'items', recordIndex: 0 },
    });
  });

  it('moves to the record\'s second field once the first is answered', () => {
    const answers = makeAnswers({ values: gated, repeatables: { items: [{ item_name: 'thing' }] } });
    expect(findPosition(modules, answers, NONE)).toEqual({
      kind: 'step',
      step: openBlock.fields[1],
      location: { in: 'repeatable', blockId: 'items', recordIndex: 0 },
    });
  });

  it('asks "add another?" once the current record is complete', () => {
    const answers = makeAnswers({ values: gated, repeatables: { items: [{ item_name: 'thing', item_type: 'x' }] } });
    expect(findPosition(modules, answers, NONE)).toEqual({ kind: 'add-another', block: openBlock, recordIndex: 1 });
  });

  it('a declined block is skipped rather than re-asked, ending the flow', () => {
    const answers = makeAnswers({ values: gated, repeatables: { items: [{ item_name: 'thing', item_type: 'x' }] } });
    expect(findPosition(modules, answers, new Set(['items']))).toEqual({ kind: 'done' });
  });

  it('a fresh empty record (from applyAddAnother) starts that record\'s first field', () => {
    const answers = makeAnswers({
      values: gated,
      repeatables: { items: [{ item_name: 'thing', item_type: 'x' }, {}] },
    });
    expect(findPosition(modules, answers, NONE)).toEqual({
      kind: 'step',
      step: openBlock.fields[0],
      location: { in: 'repeatable', blockId: 'items', recordIndex: 1 },
    });
  });
});

describe('applyAnswer / applySkip', () => {
  it('writes a top-level answer and stamps answeredAt', () => {
    const result = applyAnswer(makeAnswers(), textStep, { in: 'top' }, 'hello');
    expect(result.values.q_text).toBe('hello');
    expect(typeof result.answeredAt.q_text).toBe('string');
  });

  it('applySkip writes null, distinguishable from unanswered', () => {
    const result = applySkip(makeAnswers(), chipsStep, { in: 'top' });
    expect(result.values.q_chips).toBeNull();
    expect('q_chips' in result.values).toBe(true);
  });

  it('writes into the right repeatable record without disturbing other records', () => {
    const seeded = makeAnswers({ repeatables: { items: [{ item_name: 'first' }, { item_name: 'second' }] } });
    const result = applyAnswer(seeded, openBlock.fields[1]!, { in: 'repeatable', blockId: 'items', recordIndex: 1 }, 'x');
    expect(result.repeatables.items).toEqual([{ item_name: 'first' }, { item_name: 'second', item_type: 'x' }]);
  });

  it('creates a brand-new record when answering its first field — a real bug caught by the e2e pass: ' +
    'findPosition treats a missing array index as an empty record, but the naive .map()-over-existing-records ' +
    'approach silently no-ops when nothing exists at that index yet, since map never visits an absent element', () => {
    const empty = makeAnswers(); // no 'items' key in repeatables at all yet
    const result = applyAnswer(empty, openBlock.fields[0]!, { in: 'repeatable', blockId: 'items', recordIndex: 0 }, 'thing');
    expect(result.repeatables.items).toEqual([{ item_name: 'thing' }]);
  });

  it('creates record 1 when record 0 already exists but record 1 does not yet', () => {
    const oneRecord = makeAnswers({ repeatables: { items: [{ item_name: 'first', item_type: 'x' }] } });
    const result = applyAnswer(oneRecord, openBlock.fields[0]!, { in: 'repeatable', blockId: 'items', recordIndex: 1 }, 'second');
    expect(result.repeatables.items).toEqual([{ item_name: 'first', item_type: 'x' }, { item_name: 'second' }]);
  });

  it('intro steps are keyed by their own id, since they have no `key`', () => {
    const result = applySkip(makeAnswers(), introStep, { in: 'top' });
    expect(result.values.intro1).toBeNull();
  });
});

describe('applyAddAnother', () => {
  it('appends an empty record when the person wants more', () => {
    const answers = makeAnswers({ repeatables: { items: [{ item_name: 'a' }] } });
    const result = applyAddAnother(answers, 'items', true);
    expect(result.repeatables.items).toEqual([{ item_name: 'a' }, {}]);
  });

  it('does nothing when the person is done — the caller tracks "declined" separately, not here', () => {
    const answers = makeAnswers({ repeatables: { items: [{ item_name: 'a' }] } });
    expect(applyAddAnother(answers, 'items', false)).toEqual(answers);
  });
});

describe('reconcileSeededRepeatable', () => {
  const roleNamesStep: Step = {
    id: 'role_names',
    module: 1,
    section: 0,
    eyebrow: 'E',
    q: 'Roles?',
    kind: 'multi',
    key: 'role_names',
    options: [
      { v: 'employee', l: 'Employee' },
      { v: 'manager', l: 'Manager' },
    ],
  };
  const rolesBlock: RepeatableBlock = {
    id: 'roles',
    addAnotherPrompt: '',
    seedFrom: { questionId: 'role_names', seedField: 'role_name' },
    fields: [
      { id: 'role_for', module: 1, section: 0, eyebrow: 'E', q: 'For?', kind: 'chips', key: 'role_for' },
    ],
  };

  it('creates one record per selected value, seeded with the label (not the raw key)', () => {
    const result = reconcileSeededRepeatable(makeAnswers(), rolesBlock, roleNamesStep, ['employee']);
    expect(result.repeatables.roles).toEqual([{ role_name: 'Employee' }]);
  });

  it('keeps an existing record (and its already-answered fields) for a value still selected', () => {
    const answers = makeAnswers({
      repeatables: { roles: [{ role_name: 'Employee', role_for: 'employer' }] },
    });
    const result = reconcileSeededRepeatable(answers, rolesBlock, roleNamesStep, ['employee', 'manager']);
    expect(result.repeatables.roles).toEqual([
      { role_name: 'Employee', role_for: 'employer' },
      { role_name: 'Manager' },
    ]);
  });

  it('drops a record for a value that is no longer selected', () => {
    const answers = makeAnswers({
      repeatables: {
        roles: [
          { role_name: 'Employee', role_for: 'employer' },
          { role_name: 'Manager' },
        ],
      },
    });
    const result = reconcileSeededRepeatable(answers, rolesBlock, roleNamesStep, ['manager']);
    expect(result.repeatables.roles).toEqual([{ role_name: 'Manager' }]);
  });
});

describe('findSeedTarget', () => {
  const rolesBlock: RepeatableBlock = {
    id: 'roles',
    addAnotherPrompt: '',
    seedFrom: { questionId: 'role_names', seedField: 'role_name' },
    fields: [],
  };
  const seedModules: Module[] = [
    { id: 'm', n: 1, title: 'M', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [rolesBlock] },
  ];

  it('finds the repeatable block seeded from a given question id', () => {
    expect(findSeedTarget(seedModules, 'role_names')).toBe(rolesBlock);
  });

  it('returns undefined when nothing is seeded from that question', () => {
    expect(findSeedTarget(seedModules, 'nothing')).toBeUndefined();
  });
});

describe('questionCount', () => {
  it('counts top-level nodes only, not dynamic repeatable records', () => {
    expect(questionCount(modules)).toBe(5); // intro, text, chips, gate, items(as one node)
  });
});

describe('existingValue', () => {
  it('reads a top-level answer', () => {
    const answers = makeAnswers({ values: { q_text: 'hello' } });
    expect(existingValue(answers, textStep, { in: 'top' })).toBe('hello');
  });

  it('reads a repeatable field from the right record', () => {
    const answers = makeAnswers({ repeatables: { items: [{ item_name: 'a' }, { item_name: 'b' }] } });
    expect(existingValue(answers, openBlock.fields[0]!, { in: 'repeatable', blockId: 'items', recordIndex: 1 })).toBe(
      'b',
    );
  });

  it('returns undefined for a question never visited', () => {
    expect(existingValue(makeAnswers(), textStep, { in: 'top' })).toBeUndefined();
  });
});

describe('topLevelIndex', () => {
  it('is 1-based across the whole flow, for a plain top-level step', () => {
    const pos = findPosition(modules, makeAnswers({ values: { intro1: null } }), NONE);
    expect(topLevelIndex(modules, pos)).toBe(2); // q_text is the 2nd node
  });

  it('a repeatable field shares the block\'s own index, not a sub-count', () => {
    const gated = { intro1: null, q_text: 'x', q_chips: null, gate: 'yes' };
    const pos = findPosition(modules, makeAnswers({ values: gated }), NONE);
    expect(topLevelIndex(modules, pos)).toBe(5); // items is the 5th node
  });

  it('is the total question count once done', () => {
    expect(topLevelIndex(modules, { kind: 'done' })).toBe(questionCount(modules));
  });
});

describe('moduleFor', () => {
  it('finds the containing module for a plain step and a repeatable field alike', () => {
    const gated = { intro1: null, q_text: 'x', q_chips: null, gate: 'yes' };
    expect(moduleFor(modules, findPosition(modules, makeAnswers(), NONE))?.title).toBe('Mod');
    expect(moduleFor(modules, findPosition(modules, makeAnswers({ values: gated }), NONE))?.title).toBe('Mod');
  });

  it('is undefined once done', () => {
    expect(moduleFor(modules, { kind: 'done' })).toBeUndefined();
  });
});
