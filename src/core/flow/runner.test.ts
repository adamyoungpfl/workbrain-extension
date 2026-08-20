import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import { contextModules } from './flow';
import {
  findPosition,
  applyAnswer,
  applySkip,
  applyReflect,
  applyAddAnother,
  reconcileSeededRepeatable,
  findSeedTarget,
  questionCount,
  existingValue,
  topLevelIndex,
  moduleFor,
} from './runner';

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...overrides };
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

// -----------------------------------------------------------------------
// R1-07 — the reflect step. `stop_explaining`, `self_description`,
// `role_mandate`, `responsibilities_list`, `initiative_description` and
// `terms_depend_on` are the six real questions this exercises (confirmed via
// `grep interpret src/core/flow/source.ts`); `role_mandate` and
// `initiative_description` in particular live inside a repeatable (`roles`,
// `initiatives_records`), which is why the compound-key coverage below is
// exercising a real shape, not a hypothetical one.
// -----------------------------------------------------------------------

const reflectStep: Step = {
  id: 'q_reflect',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'Reflect?',
  kind: 'text',
  key: 'q_reflect',
  interpret: {
    via: 'ai-assist',
    reflectPrefix: 'I heard:',
    buildPrompt: (raw) => `Tighten this: "${raw}"`,
  },
};

const reflectModules: Module[] = [
  { id: 'm-reflect', n: 1, title: 'Reflect', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [reflectStep] },
];

const noteNameField: Step = { id: 'note_name', module: 1, section: 0, eyebrow: 'E', q: 'Name?', kind: 'text', key: 'note_name' };
const noteDetailField: Step = {
  id: 'note_detail',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'Detail?',
  kind: 'text',
  key: 'note_detail',
  interpret: {
    via: 'ai-assist',
    reflectPrefix: 'Summary:',
    buildPrompt: (raw) => `Summarize: "${raw}"`,
  },
};
const notesBlock: RepeatableBlock = {
  id: 'notes',
  addAnotherPrompt: 'Another note?',
  fields: [noteNameField, noteDetailField],
};
const notesModules: Module[] = [
  { id: 'm-notes', n: 1, title: 'Notes', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [notesBlock] },
];

describe('findPosition — reflect (R1-07)', () => {
  it('an unanswered interpret-bearing text step is still a plain step position', () => {
    expect(findPosition(reflectModules, makeAnswers(), NONE)).toEqual({
      kind: 'step',
      step: reflectStep,
      location: { in: 'top' },
    });
  });

  it('a text step without interpret never routes to reflect, even once answered', () => {
    const answers = makeAnswers({ values: { intro1: null, q_text: 'hello' } });
    expect(findPosition(modules, answers, NONE)).toEqual({ kind: 'step', step: chipsStep, location: { in: 'top' } });
  });

  it('answered but not yet reflected is a reflect position, not done — the whole point of R1-07', () => {
    const answers = makeAnswers({ values: { q_reflect: 'hello world' } });
    expect(findPosition(reflectModules, answers, NONE)).toEqual({
      kind: 'reflect',
      step: reflectStep,
      location: { in: 'top' },
    });
  });

  it('once reflectedAt has the key, the question counts as fully done', () => {
    const answers = makeAnswers({
      values: { q_reflect: 'hello world' },
      reflectedAt: { q_reflect: '2020-01-01T00:00:00.000Z' },
    });
    expect(findPosition(reflectModules, answers, NONE)).toEqual({ kind: 'done' });
  });

  it('an explicitly skipped (null) interpret text step never routes to reflect — nothing typed to play back', () => {
    const answers = makeAnswers({ values: { q_reflect: null } });
    expect(findPosition(reflectModules, answers, NONE)).toEqual({ kind: 'done' });
  });

  it('a repeatable field with interpret set uses the blockId#recordIndex#key compound convention, matching answeredAt', () => {
    const answers = makeAnswers({ repeatables: { notes: [{ note_name: 'a', note_detail: 'raw detail text' }] } });
    expect(findPosition(notesModules, answers, NONE)).toEqual({
      kind: 'reflect',
      step: noteDetailField,
      location: { in: 'repeatable', blockId: 'notes', recordIndex: 0 },
    });
  });

  it('reflecting the repeatable field via its compound key lets the record complete and offers add-another', () => {
    const answers = makeAnswers({
      repeatables: { notes: [{ note_name: 'a', note_detail: 'raw detail text' }] },
      reflectedAt: { 'notes#0#note_detail': '2020-01-01T00:00:00.000Z' },
    });
    expect(findPosition(notesModules, answers, NONE)).toEqual({ kind: 'add-another', block: notesBlock, recordIndex: 1 });
  });

  it('a plain (non-compound) reflectedAt entry does not satisfy a repeatable field\'s compound key — no accidental cross-record match', () => {
    const answers = makeAnswers({
      repeatables: { notes: [{ note_name: 'a', note_detail: 'raw' }] },
      reflectedAt: { note_detail: '2020-01-01T00:00:00.000Z' }, // wrong key shape — not "notes#0#note_detail"
    });
    expect(findPosition(notesModules, answers, NONE)).toEqual({
      kind: 'reflect',
      step: noteDetailField,
      location: { in: 'repeatable', blockId: 'notes', recordIndex: 0 },
    });
  });

  it('only the current (last) record\'s unreflected field is surfaced — an earlier, already-reflected record is left alone', () => {
    const answers = makeAnswers({
      repeatables: {
        notes: [
          { note_name: 'first', note_detail: 'first detail' },
          { note_name: 'second', note_detail: 'second detail' },
        ],
      },
      reflectedAt: { 'notes#0#note_detail': '2020-01-01T00:00:00.000Z' }, // record 0 reflected; record 1 is not
    });
    expect(findPosition(notesModules, answers, NONE)).toEqual({
      kind: 'reflect',
      step: noteDetailField,
      location: { in: 'repeatable', blockId: 'notes', recordIndex: 1 },
    });
  });

  it('end-to-end: answer -> reflect -> Keep advances past the question', () => {
    let answers = makeAnswers();
    expect(findPosition(reflectModules, answers, NONE).kind).toBe('step');

    answers = applyAnswer(answers, reflectStep, { in: 'top' }, 'my raw answer');
    expect(findPosition(reflectModules, answers, NONE)).toEqual({
      kind: 'reflect',
      step: reflectStep,
      location: { in: 'top' },
    });

    answers = applyReflect(answers, reflectStep, { in: 'top' }, 'my raw answer'); // Keep commits the raw text as-is
    expect(findPosition(reflectModules, answers, NONE)).toEqual({ kind: 'done' });
  });

  it('end-to-end: "Say it again" (a plain re-answer) does not stamp reflectedAt, so it returns to reflect with the new draft', () => {
    let answers = makeAnswers();
    answers = applyAnswer(answers, reflectStep, { in: 'top' }, 'first draft');
    expect(findPosition(reflectModules, answers, NONE).kind).toBe('reflect');

    answers = applyAnswer(answers, reflectStep, { in: 'top' }, 'second draft'); // redo, not applyReflect
    expect(findPosition(reflectModules, answers, NONE)).toEqual({
      kind: 'reflect',
      step: reflectStep,
      location: { in: 'top' },
    });
    expect(existingValue(answers, reflectStep, { in: 'top' })).toBe('second draft');
    expect(answers.reflectedAt.q_reflect).toBeUndefined();
  });
});

describe('applyReflect', () => {
  it('writes the final value into values and stamps reflectedAt for a top-level field, leaving answeredAt untouched', () => {
    const answers = makeAnswers({
      values: { q_reflect: 'raw' },
      answeredAt: { q_reflect: '2020-01-01T00:00:00.000Z' },
    });
    const result = applyReflect(answers, reflectStep, { in: 'top' }, 'tightened text');
    expect(result.values.q_reflect).toBe('tightened text');
    expect(typeof result.reflectedAt.q_reflect).toBe('string');
    expect(result.answeredAt.q_reflect).toBe('2020-01-01T00:00:00.000Z'); // untouched
  });

  it('writes into the right repeatable record and stamps the compound reflectedAt key, without disturbing other records', () => {
    const answers = makeAnswers({
      repeatables: {
        notes: [
          { note_name: 'a', note_detail: 'raw' },
          { note_name: 'b', note_detail: 'raw2' },
        ],
      },
    });
    const result = applyReflect(answers, noteDetailField, { in: 'repeatable', blockId: 'notes', recordIndex: 1 }, 'tightened2');
    expect(result.repeatables.notes).toEqual([
      { note_name: 'a', note_detail: 'raw' },
      { note_name: 'b', note_detail: 'tightened2' },
    ]);
    expect(Object.keys(result.reflectedAt)).toEqual(['notes#1#note_detail']);
  });

  it('Keep round-trips the raw text byte-identically — same string, untrimmed, whitespace and all', () => {
    const raw = '  two  spaces, trailing punctuation, and a newline\n';
    let answers = makeAnswers();
    answers = applyAnswer(answers, reflectStep, { in: 'top' }, raw);
    expect(existingValue(answers, reflectStep, { in: 'top' })).toBe(raw); // what the reflect screen plays back
    answers = applyReflect(answers, reflectStep, { in: 'top' }, raw); // Keep commits exactly that
    expect(answers.values.q_reflect).toBe(raw);
  });
});

// -----------------------------------------------------------------------
// V1.1 VB-05 — module transition screens. A derived position, like every
// other one: no flag is written when a transition is passed, so the only
// thing that can make it stop appearing is an answer inside the module it
// introduces (plus, within one session, the panel's ephemeral `seenIntros`
// — see findPosition's own doc comment on why that exists and what it is
// deliberately NOT).
// -----------------------------------------------------------------------

function mod(id: string, n: number, nodes: (Step | RepeatableBlock)[]): Module {
  return { id, n, title: id, purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes };
}
const step = (id: string, kind: Step['kind'] = 'text'): Step => ({
  id,
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: `${id}?`,
  kind,
  ...(kind === 'intro' ? {} : { key: id }),
});

const m1a = step('m1_a');
const m1b = step('m1_b');
const m2a = step('m2_a');
const m2b = step('m2_b');
const m3a = step('m3_a');
const threeModules: Module[] = [mod('one', 1, [m1a, m1b]), mod('two', 2, [m2a, m2b]), mod('three', 3, [m3a])];

describe('findPosition — module transitions (VB-05)', () => {
  it('never shows one before the first module, however empty it is', () => {
    expect(findPosition(threeModules, makeAnswers(), NONE)).toEqual({
      kind: 'step',
      step: m1a,
      location: { in: 'top' },
    });
  });

  it('shows one before a module nobody has touched, instead of its first question', () => {
    const answers = makeAnswers({ values: { m1_a: 'x', m1_b: 'y' } });
    expect(findPosition(threeModules, answers, NONE)).toEqual({ kind: 'module-intro', module: threeModules[1] });
  });

  it('does not show one once that module holds any answer at all', () => {
    const answers = makeAnswers({ values: { m1_a: 'x', m1_b: 'y', m2_a: 'z' } });
    expect(findPosition(threeModules, answers, NONE)).toEqual({
      kind: 'step',
      step: m2b,
      location: { in: 'top' },
    });
  });

  it('counts an explicit skip as touching the module — a skipped answer is still an answer', () => {
    const answers = makeAnswers({ values: { m1_a: 'x', m1_b: 'y' } });
    const skipped = applySkip(answers, m2a, { in: 'top' });
    expect(findPosition(threeModules, skipped, NONE)).toEqual({
      kind: 'step',
      step: m2b,
      location: { in: 'top' },
    });
  });

  it('survives a close and reopen: the same answers derive the same position, with no session state at all', () => {
    // "Reopening" is exactly this — findPosition called again with only
    // what wb:answers holds, no `seenIntros`, no declined blocks.
    const midModule = makeAnswers({ values: { m1_a: 'x', m1_b: 'y', m2_a: 'z' } });
    expect(findPosition(threeModules, midModule, NONE)).toEqual(findPosition(threeModules, midModule, NONE, new Set()));
    expect(findPosition(threeModules, midModule, NONE).kind).toBe('step');

    // ...and a person who closed the panel ON the transition, having
    // answered nothing in the new module, gets the transition back rather
    // than being dropped into a module with no introduction.
    const atTransition = makeAnswers({ values: { m1_a: 'x', m1_b: 'y' } });
    expect(findPosition(threeModules, atTransition, NONE)).toEqual({ kind: 'module-intro', module: threeModules[1] });
  });

  it('`seenIntros` suppresses only the module it names, and only for that call', () => {
    const answers = makeAnswers({ values: { m1_a: 'x', m1_b: 'y' } });
    expect(findPosition(threeModules, answers, NONE, new Set(['two']))).toEqual({
      kind: 'step',
      step: m2a,
      location: { in: 'top' },
    });
    // Module three is untouched too, so continuing past two's transition
    // does not continue past three's.
    const throughTwo = makeAnswers({ values: { m1_a: 'x', m1_b: 'y', m2_a: 'a', m2_b: 'b' } });
    expect(findPosition(threeModules, throughTwo, NONE, new Set(['two']))).toEqual({
      kind: 'module-intro',
      module: threeModules[2],
    });
  });

  it('every module after the first gets exactly one transition across a whole walk', () => {
    const seen: string[] = [];
    let answers = makeAnswers();
    const seenIntros = new Set<string>();
    for (let guard = 0; guard < 50; guard++) {
      const pos = findPosition(threeModules, answers, NONE, seenIntros);
      if (pos.kind === 'done') break;
      if (pos.kind === 'module-intro') {
        seen.push(pos.module.id);
        seenIntros.add(pos.module.id); // the panel's "continue" — writes nothing
        continue;
      }
      if (pos.kind !== 'step') throw new Error(`unexpected ${pos.kind}`);
      answers = applyAnswer(answers, pos.step, pos.location, 'an answer');
    }
    expect(seen).toEqual(['two', 'three']);
  });

  it('a module whose every node is skipped never introduces itself — there is nothing to introduce', () => {
    const skippable = step('m2_skippable');
    skippable.skipIf = () => true;
    const withSkipped: Module[] = [mod('one', 1, [m1a]), mod('two', 2, [skippable]), mod('three', 3, [m3a])];
    const answers = makeAnswers({ values: { m1_a: 'x' } });
    expect(findPosition(withSkipped, answers, NONE)).toEqual({ kind: 'module-intro', module: withSkipped[2] });
  });

  it('a repeatable record with any field in it counts as touching the module', () => {
    const repeatableModules: Module[] = [mod('one', 1, [m1a]), mod('two', 2, [notesBlock])];
    const untouched = makeAnswers({ values: { m1_a: 'x' } });
    expect(findPosition(repeatableModules, untouched, NONE)).toEqual({
      kind: 'module-intro',
      module: repeatableModules[1],
    });

    const started = makeAnswers({ values: { m1_a: 'x' }, repeatables: { notes: [{ note_name: 'a' }] } });
    expect(findPosition(repeatableModules, started, NONE)).toEqual({
      kind: 'step',
      step: noteDetailField,
      location: { in: 'repeatable', blockId: 'notes', recordIndex: 0 },
    });
  });

  it('an empty record — applyAddAnother own {} — does not count as an answer on its own', () => {
    const repeatableModules: Module[] = [mod('one', 1, [m1a]), mod('two', 2, [notesBlock])];
    const answers = makeAnswers({ values: { m1_a: 'x' }, repeatables: { notes: [{}] } });
    expect(findPosition(repeatableModules, answers, NONE)).toEqual({
      kind: 'module-intro',
      module: repeatableModules[1],
    });
  });

  it('does not fire for a single-module flow — the proof loop shape', () => {
    const oneModule: Module[] = [mod('only', 1, [m1a])];
    expect(findPosition(oneModule, makeAnswers(), NONE).kind).toBe('step');
  });
});

describe('topLevelIndex / moduleFor — module transitions (VB-05)', () => {
  it('a transition borrows the index of the question it introduces', () => {
    const pos = findPosition(threeModules, makeAnswers({ values: { m1_a: 'x', m1_b: 'y' } }), NONE);
    expect(topLevelIndex(threeModules, pos)).toBe(3); // m2_a is the 3rd node overall
  });

  it('names its own module, so the progress bar can title the screen', () => {
    const pos = findPosition(threeModules, makeAnswers({ values: { m1_a: 'x', m1_b: 'y' } }), NONE);
    expect(moduleFor(threeModules, pos)).toBe(threeModules[1]);
  });
});

describe('the real Context flow — module transitions (VB-05)', () => {
  it('introduces every module except the first, exactly once, in order', () => {
    const seen: string[] = [];
    const seenIntros = new Set<string>();
    let answers = makeAnswers();
    const declined = new Set<string>();

    for (let guard = 0; guard < 400; guard++) {
      const pos = findPosition(contextModules, answers, declined, seenIntros);
      if (pos.kind === 'done') break;
      if (pos.kind === 'module-intro') {
        seen.push(pos.module.id);
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
              ? 'no'
              : 'an answer';
      answers = applyAnswer(answers, pos.step, pos.location, value);
      if (pos.location.in === 'top' && Array.isArray(value)) {
        const seedTarget = findSeedTarget(contextModules, pos.step.id);
        if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
      }
    }

    expect(seen).toEqual(contextModules.slice(1).map((m) => m.id));
    expect(seen).toHaveLength(10);
  });

  it('resuming mid-module never replays a transition already passed, with nothing but wb:answers', () => {
    // Answer exactly one question in each module, then re-derive from
    // scratch — the panel restart. Only the module the person is actually
    // in matters: every earlier one holds an answer, so no earlier
    // transition can come back.
    let answers = makeAnswers();
    for (const module of contextModules) {
      const first = module.nodes.find((node) => !('fields' in node));
      if (first && !('fields' in first)) {
        answers = applyAnswer(answers, first, { in: 'top' }, 'an answer');
      }
    }
    const resumed = findPosition(contextModules, answers, new Set());
    expect(resumed.kind).not.toBe('module-intro');
  });
});
