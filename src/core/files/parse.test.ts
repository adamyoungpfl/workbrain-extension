import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import { generateContextFile } from './generate';
import { parseContextFile } from './parse';
import { SYSTEM_GROUNDING_RULE, SYSTEM_GROUNDING_RULE_V1 } from './source';

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...overrides };
}

// Same synthetic fixture as generate.test.ts (kept in sync by hand — see
// roundtrip.test.ts for the version that proves the two stay honest with
// each other via round-tripping instead of independent duplication).
const introStep: Step = { id: 'intro1', module: 1, section: 0, eyebrow: 'E', q: 'Welcome', kind: 'intro' };
const gateStep: Step = { id: 'gate', module: 1, section: 0, eyebrow: 'E', q: 'Gate?', kind: 'yesno', key: 'gate' };
const scopeStep: Step = {
  id: 'scope',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: 'Work, personal, or both?',
  kind: 'chips',
  key: 'scope',
  options: [
    { v: 'work', l: 'Work' },
    { v: 'personal', l: 'Personal' },
    { v: 'both', l: 'Both' },
  ],
};
const scopeAwareStep: Step = {
  id: 'stop_thing',
  module: 1,
  section: 0,
  eyebrow: 'E',
  q: (ctx) => `Stop explaining what, in your ${ctx.answers.scope === 'work' ? 'work life' : 'life'}?`,
  kind: 'text',
  key: 'stop_thing',
};
const textStep: Step = { id: 'bio', module: 1, section: 1, eyebrow: 'E', q: 'Describe yourself', kind: 'text', key: 'bio' };
const multiStep: Step = {
  id: 'audiences',
  module: 1,
  section: 1,
  eyebrow: 'E',
  q: 'Who do you write to?',
  kind: 'multi',
  key: 'audiences',
  allowCustom: true,
  options: [
    { v: 'mgr', l: 'My manager' },
    { v: 'team', l: 'My team' },
  ],
};
const roleNameStep: Step = {
  id: 'role_names',
  module: 2,
  section: 2,
  eyebrow: 'E',
  q: 'What are your roles?',
  kind: 'multi',
  key: 'role_names',
  options: [{ v: 'employee', l: 'Employee' }],
};
const roleFor: Step = {
  id: 'role_for',
  module: 2,
  section: 2,
  eyebrow: 'E',
  q: 'Who is this for?',
  kind: 'chips',
  key: 'role_for',
  options: [{ v: 'employer', l: 'My employer' }],
};
const roleMandate: Step = { id: 'role_mandate', module: 2, section: 2, eyebrow: 'E', q: 'What are you there to do?', kind: 'text', key: 'role_mandate' };
const rolesBlock: RepeatableBlock = {
  id: 'roles',
  addAnotherPrompt: '',
  seedFrom: { questionId: 'role_names', seedField: 'role_name' },
  fields: [roleFor, roleMandate],
};
const entityName: Step = { id: 'entity_name', module: 3, section: 3, eyebrow: 'E', q: "What's their name?", kind: 'text', key: 'entity_name' };
const entityType: Step = {
  id: 'entity_type',
  module: 3,
  section: 3,
  eyebrow: 'E',
  q: 'What kind of thing is this?',
  kind: 'chips',
  key: 'entity_type',
  options: [{ v: 'person', l: 'Person' }],
};
const entityGate: Step = { id: 'entity_gate', module: 3, section: 3, eyebrow: 'E', q: 'Yes-no field within a record?', kind: 'yesno', key: 'entity_gate' };
const entitiesBlock: RepeatableBlock = {
  id: 'entities',
  addAnotherPrompt: 'Another?',
  fields: [entityName, entityType, entityGate],
};

const modules: Module[] = [
  { id: 'm1', n: 1, title: 'Orientation', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [introStep, gateStep, scopeStep, scopeAwareStep] },
  { id: 'm1b', n: 1, title: 'Orientation', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [textStep, multiStep] },
  { id: 'm2', n: 2, title: 'Roles', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [roleNameStep, rolesBlock] },
  { id: 'm3', n: 3, title: 'World', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [entitiesBlock] },
];

const outline: FileOutlineNode[] = [
  { id: 'sec1', label: '1. About This Context', questionIds: ['intro1', 'gate', 'scope', 'stop_thing'] },
  {
    id: 'sec2',
    label: '2. About Me',
    questionIds: ['bio'],
    children: [{ id: 'sec2-1', label: '2.1 Audiences', questionIds: ['audiences'] }],
  },
  { id: 'sec3', label: '3. Roles', questionIds: ['role_names', 'role_for', 'role_mandate'] },
  { id: 'sec4', label: '4. My World', questionIds: ['entity_name', 'entity_type', 'entity_gate'] },
];

function gen(answers: Answers, generatedOn = '2026-08-20'): string {
  return generateContextFile(answers, generatedOn, modules, outline);
}

describe('parseContextFile — the one documented hard-fail (docs/GUARDRAILS.md)', () => {
  it('fails plainly when the System Grounding Rule paragraph is missing entirely', () => {
    const result = parseContextFile('# Context.md\n\nNo grounding rule here.\n', modules, outline);
    expect(result).toEqual({ ok: false, reason: 'grounding-rule-missing' });
  });

  it('fails when the grounding rule heading is present but the paragraph text was altered', () => {
    const file = gen(makeAnswers()).replace(SYSTEM_GROUNDING_RULE, 'Something else entirely.');
    const result = parseContextFile(file, modules, outline);
    expect(result).toEqual({ ok: false, reason: 'grounding-rule-missing' });
  });

  it('a file downloaded before pass 5w — V1 rule body, no self-defense pair — still parses', () => {
    const file = gen(makeAnswers()).replace(SYSTEM_GROUNDING_RULE, SYSTEM_GROUNDING_RULE_V1);
    const result = parseContextFile(file);
    expect(result.ok).toBe(true);
  });

  it('fails on garbage input with no headings at all', () => {
    const result = parseContextFile('not a context file, just some text', modules, outline);
    expect(result).toEqual({ ok: false, reason: 'grounding-rule-missing' });
  });

  it('succeeds on a well-formed file with zero answers — grounding rule alone is enough', () => {
    const result = parseContextFile(gen(makeAnswers()), modules, outline);
    expect(result).toEqual({ ok: true, answers: { values: {}, repeatables: {} } });
  });
});

describe('parseContextFile — never-reached vs explicitly skipped, round-tripped through the marker', () => {
  it('a never-reached question comes back absent from values (not present as any value, including null)', () => {
    const file = gen(makeAnswers({ values: { scope: 'work' } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect('bio' in result.answers.values).toBe(false);
  });

  it('an explicitly skipped question comes back as null, not absent', () => {
    const file = gen(makeAnswers({ values: { scope: 'work', bio: null } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.values.bio).toBeNull();
    expect('bio' in result.answers.values).toBe(true);
  });
});

describe('parseContextFile — labels resolve back to option values', () => {
  it('a chips answer resolves from its printed label back to the option value', () => {
    const file = gen(makeAnswers({ values: { scope: 'both' } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.values.scope).toBe('both');
  });

  it('a multi-select resolves each label back to its value, and passes an allowCustom entry through unchanged', () => {
    const file = gen(makeAnswers({ values: { scope: 'work', audiences: ['mgr', 'A vendor I trust'] } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.values.audiences).toEqual(['mgr', 'A vendor I trust']);
  });
});

describe('parseContextFile — ctx-dependent prompts resolve incrementally', () => {
  it("resolves stop_thing's scope-aware heading using scope's own already-parsed answer", () => {
    const file = gen(makeAnswers({ values: { scope: 'work', stop_thing: 'meetings' } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.values.stop_thing).toBe('meetings');
  });
});

describe('parseContextFile — nesting', () => {
  it('parses a child section independently of its parent, by label, not by position', () => {
    const file = gen(makeAnswers({ values: { audiences: ['mgr'] } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.values.audiences).toEqual(['mgr']);
    expect('bio' in result.answers.values).toBe(false);
  });
});

describe('parseContextFile — repeatable records, distinguished from plain answers by structure', () => {
  it('parses a seeded record, restoring the seed field verbatim from the title', () => {
    const file = gen(
      makeAnswers({
        values: { role_names: ['employee'] },
        repeatables: { roles: [{ role_name: 'Employee', role_for: 'employer', role_mandate: 'Ship the reports on time.' }] },
      }),
    );
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.repeatables.roles).toEqual([{ role_name: 'Employee', role_for: 'employer', role_mandate: 'Ship the reports on time.' }]);
  });

  it("parses an open-ended record's title back into its first field, and reconstructs several records in order", () => {
    const file = gen(
      makeAnswers({
        repeatables: {
          entities: [
            { entity_name: 'Priya', entity_type: 'person' },
            { entity_name: 'The Growth team', entity_type: 'team' },
          ],
        },
      }),
    );
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.repeatables.entities).toEqual([
      { entity_name: 'Priya', entity_type: 'person' },
      { entity_name: 'The Growth team', entity_type: 'team' },
    ]);
  });

  it('a plain multi-select block (bare "- Label" bullets) is never mistaken for a repeatable record', () => {
    const file = gen(makeAnswers({ values: { audiences: ['mgr'] } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.values.audiences).toEqual(['mgr']);
    expect(result.answers.repeatables).toEqual({});
  });

  it('restores an explicitly skipped field inside a record as null', () => {
    const file = gen(makeAnswers({ repeatables: { entities: [{ entity_name: 'Priya', entity_type: null }] } }));
    const result = parseContextFile(file, modules, outline);
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.repeatables.entities).toEqual([{ entity_name: 'Priya', entity_type: null }]);
  });
});

describe('parseContextFile — best-effort degradation (docs/GUARDRAILS.md)', () => {
  it('drops one unrecognized heading rather than failing the whole file', () => {
    const file = gen(makeAnswers({ values: { scope: 'work', bio: 'Hello there' } }));
    const corrupted = file.replace('**Describe yourself**', '**Some heading that matches no question**');
    const result = parseContextFile(corrupted, modules, outline);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect('bio' in result.answers.values).toBe(false); // dropped, not crashed
    expect(result.answers.values.scope).toBe('work'); // everything else still parses
  });
});

// ---------------------------------------------------------------------
// Real ported content
// ---------------------------------------------------------------------
describe('parseContextFile — real ported content', () => {
  it('parses a real generated file with zero answers, grounding rule intact', () => {
    const result = parseContextFile(generateContextFile(makeAnswers(), '2026-08-20'));
    expect(result).toEqual({ ok: true, answers: { values: {}, repeatables: {} } });
  });

  it('round-trips context_scope + stop_explaining, the real ctx-dependent pair', () => {
    const answers = makeAnswers({ values: { context_scope: 'personal', stop_explaining: 'the school pickup schedule' } });
    const result = parseContextFile(generateContextFile(answers, '2026-08-20'));
    if (!result.ok) throw new Error('expected ok');
    expect(result.answers.values.context_scope).toBe('personal');
    expect(result.answers.values.stop_explaining).toBe('the school pickup schedule');
  });
});
