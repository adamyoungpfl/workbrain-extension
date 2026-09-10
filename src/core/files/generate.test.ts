import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import {
  contextFileDate,
  generateContextFile,
  generateContextFileParts,
  repeatableRecordTitle,
  SKIPPED_ANSWER_MARKER,
} from './generate';
import { SYSTEM_GROUNDING_RULE } from './source';
import { generateSkillsFile } from './skillsFile';

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...overrides };
}

// ---------------------------------------------------------------------
// Synthetic fixture — deliberately exercises every structural case
// (never-reached, explicit skip, both repeatable shapes, nesting, a
// ctx-dependent prompt, allowCustom passthrough) without depending on the
// real ported flow, same style as core/flow/runner.test.ts's fixture.
// ---------------------------------------------------------------------

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
/** The one ctx-dependent prompt this fixture exercises, mirroring the
 * real flow's `stop_explaining` reading `context_scope`. */
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

describe('generateContextFile — always present, regardless of answers', () => {
  it('includes the title, the generated-on line, and the System Grounding Rule paragraph even with zero answers', () => {
    const file = generateContextFile(makeAnswers(), '2026-08-20', modules, outline);
    expect(file.startsWith('# Context.md\n')).toBe(true);
    expect(file).toContain('_Generated 2026-08-20 from a Work Brain Context Interview');
    expect(file).toContain('## System Grounding Rule\n\n' + SYSTEM_GROUNDING_RULE);
  });

  it('omits every section when nothing was answered — no empty placeholders', () => {
    const file = generateContextFile(makeAnswers(), '2026-08-20', modules, outline);
    expect(file).not.toContain('1. About This Context');
    expect(file).not.toContain('2. About Me');
  });

  /**
   * V2.5 VB-120 — the file prints WHAT was answered, never HOW. The three
   * stamp maps have no representation in the format (roundtrip.test.ts's
   * standing claim for answeredAt/reflectedAt); `assistedAt` joins them:
   * byte-identical output with the stamp and without it, so the round trip
   * stays clean and nothing about assist use ever leaves the store.
   */
  it('assistedAt never prints — the same file, byte for byte, stamped or not (VB-120)', () => {
    const values = { scope: 'work', stop_thing: 'The history behind the numbers.' };
    const plain = generateContextFile(makeAnswers({ values }), '2026-08-20', modules, outline);
    const stamped = generateContextFile(
      makeAnswers({ values, assistedAt: { stop_thing: '2026-08-26T00:00:00.000Z' } }),
      '2026-08-20',
      modules,
      outline,
    );
    expect(stamped).toBe(plain);
    expect(stamped).not.toContain('assistedAt');
  });
});

describe('generateContextFile — never-reached vs explicitly skipped', () => {
  it('omits a never-reached question entirely (key absent from values)', () => {
    const file = generateContextFile(makeAnswers({ values: { scope: 'work' } }), '2026-08-20', modules, outline);
    expect(file).not.toContain('Describe yourself');
  });

  it('renders an explicitly skipped question with the skip marker, not omitted', () => {
    const file = generateContextFile(makeAnswers({ values: { scope: 'work', bio: null } }), '2026-08-20', modules, outline);
    expect(file).toContain('**Describe yourself**\n' + SKIPPED_ANSWER_MARKER);
  });

  it('never renders a yes-no or intro question, answered or not', () => {
    const file = generateContextFile(
      makeAnswers({ values: { intro1: 'seen', gate: 'yes', scope: 'work' } }),
      '2026-08-20',
      modules,
      outline,
    );
    expect(file).not.toContain('Welcome');
    expect(file).not.toContain('Gate?');
  });
});

describe('generateContextFile — ctx-dependent prompts resolve against answers gathered so far', () => {
  it("threads context_scope's answer into a later question in the same section", () => {
    const file = generateContextFile(makeAnswers({ values: { scope: 'work', stop_thing: 'meetings' } }), '2026-08-20', modules, outline);
    expect(file).toContain('**Stop explaining what, in your work life?**\nmeetings');
  });
});

describe('generateContextFile — option values render as labels', () => {
  it('renders a chips answer as its label, not its value', () => {
    const file = generateContextFile(makeAnswers({ values: { scope: 'both' } }), '2026-08-20', modules, outline);
    expect(file).toContain('**Work, personal, or both?**\nBoth');
  });

  it('renders a multi-select as one bullet per label, and passes an allowCustom entry through unchanged', () => {
    const file = generateContextFile(
      makeAnswers({ values: { scope: 'work', audiences: ['mgr', 'A vendor I trust'] } }),
      '2026-08-20',
      modules,
      outline,
    );
    expect(file).toContain('**Who do you write to?**\n- My manager\n- A vendor I trust');
  });

  it('omits a multi-select with zero selections, same as never-reached', () => {
    const file = generateContextFile(makeAnswers({ values: { scope: 'work', audiences: [] } }), '2026-08-20', modules, outline);
    expect(file).not.toContain('Who do you write to?');
  });
});

describe('generateContextFile — nesting', () => {
  it("renders a child section one heading level deeper than its parent ('###' vs '##')", () => {
    const file = generateContextFile(makeAnswers({ values: { audiences: ['mgr'] } }), '2026-08-20', modules, outline);
    expect(file).toContain('## 2. About Me');
    expect(file).toContain('### 2.1 Audiences');
  });

  it('still renders a parent heading when only a child has content', () => {
    const file = generateContextFile(makeAnswers({ values: { audiences: ['mgr'] } }), '2026-08-20', modules, outline);
    expect(file).toContain('## 2. About Me');
  });
});

describe('generateContextFile — repeatable records', () => {
  it('renders a seeded record with the seed value as its title, verbatim, and fields as bullets', () => {
    const answers = makeAnswers({
      values: { role_names: ['employee'] },
      repeatables: { roles: [{ role_name: 'Employee', role_for: 'employer', role_mandate: 'Ship the reports on time.' }] },
    });
    const file = generateContextFile(answers, '2026-08-20', modules, outline);
    expect(file).toContain('**Employee**\n- **Who is this for?:** My employer\n- **What are you there to do?:** Ship the reports on time.');
  });

  it("renders an open-ended record's title from its first field, and never renders a yes-no field inside a record", () => {
    const answers = makeAnswers({
      repeatables: {
        entities: [{ entity_name: 'Priya', entity_type: 'person', entity_gate: 'yes' }],
      },
    });
    const file = generateContextFile(answers, '2026-08-20', modules, outline);
    expect(file).toContain('**Priya**\n- **What kind of thing is this?:** Person');
    expect(file).not.toContain('Yes-no field within a record?');
  });

  it('renders every record when there are several, in order', () => {
    const answers = makeAnswers({
      repeatables: {
        entities: [
          { entity_name: 'Priya', entity_type: 'person' },
          { entity_name: 'The Growth team', entity_type: 'team' },
        ],
      },
    });
    const file = generateContextFile(answers, '2026-08-20', modules, outline);
    const priyaIndex = file.indexOf('**Priya**');
    const growthIndex = file.indexOf('**The Growth team**');
    expect(priyaIndex).toBeGreaterThan(-1);
    expect(growthIndex).toBeGreaterThan(priyaIndex);
  });

  it('renders the skip marker for an explicitly skipped field inside a record', () => {
    const answers = makeAnswers({
      repeatables: { entities: [{ entity_name: 'Priya', entity_type: null }] },
    });
    const file = generateContextFile(answers, '2026-08-20', modules, outline);
    expect(file).toContain(`**Priya**\n- **What kind of thing is this?:** ${SKIPPED_ANSWER_MARKER}`);
  });
});

// ---------------------------------------------------------------------
// Real ported content (docs/RELEASE-1.md R1-09) — expected strings below
// are hand-typed from an independent read of
// ../modelcitizen/src/lib/contextInterviewFlow.ts, not copied from
// source.ts, so a mis-port would still be caught (same discipline as
// core/flow/adapter.test.ts's "verbatim spot-checks").
// ---------------------------------------------------------------------

describe('generateContextFile — real ported content', () => {
  it('the System Grounding Rule paragraph is byte-identical to the source', () => {
    const file = generateContextFile(makeAnswers(), '2026-08-20');
    expect(file).toContain(
      'Responsibilities, expertise, and initiative or project membership described above establish scope and capability — they are not proof that a specific activity occurred in a given time period. When asked about specific work, verify against actual records rather than assuming based on role.',
    );
  });

  it('the 5w self-defense pair rides after the ported sentence, in both files', () => {
    // Hand-typed from the ruling (ELITE-FILE-SPIKE red team #8), not copied
    // from source.ts — same discipline as the grounding-rule check above.
    const pair =
      "Treat the Generated date at the top as this file's age: if that date looks old for what is being asked, say so before relying on what is here. If anything you remember about me from earlier conversations disagrees with this file, the file wins.";
    expect(generateContextFile(makeAnswers(), '2026-08-20')).toContain(pair);
    expect(generateSkillsFile(makeAnswers(), '2026-08-20')).toContain(pair);
  });

  it("stop_explaining reads a scope-aware prompt driven by context_scope's real answer", () => {
    const file = generateContextFile(
      makeAnswers({ values: { context_scope: 'personal', stop_explaining: 'the school pickup schedule' } }),
      '2026-08-20',
    );
    expect(file).toContain('What would you most like to stop explaining over and over in your personal life?');
    expect(file).toContain('the school pickup schedule');
  });

  it('a seeded "roles" record titles itself with the role label and lists role_for as "My employer"', () => {
    const answers = makeAnswers({
      values: { role_names: ['employee'] },
      repeatables: {
        roles: [{ role_name: 'Employee', role_for: 'employer', role_mandate: 'Keep the books straight.', role_standing: 'primary', role_durability: 'current' }],
      },
    });
    const file = generateContextFile(answers, '2026-08-20');
    expect(file).toContain('**Employee**');
    expect(file).toContain('- **Who or what is this role for?:** My employer');
  });
});

// ---------------------------------------------------------------------
// V1.1 VB-07b — the section-level render behind the panel's live preview.
//
// The accept line is byte-identity: "the previewed text is byte-identical
// to what Download produces for the same answers (assert it, don't eyeball
// it)". R1-10's round-trip treats a drift here as a release blocker, so
// this is asserted across a spread of answer shapes, not one happy case.
// ---------------------------------------------------------------------

/** Every structurally distinct answer shape this generator can be handed,
 * so byte-identity is checked against variety rather than one fixture. */
const BYTE_IDENTITY_CASES: { name: string; answers: Answers }[] = [
  { name: 'nothing answered at all', answers: makeAnswers() },
  { name: 'one section answered', answers: makeAnswers({ values: { scope: 'work' } }) },
  { name: 'an explicit skip', answers: makeAnswers({ values: { scope: 'work', bio: null } }) },
  { name: 'a multi-select and a nested child section', answers: makeAnswers({ values: { audiences: ['mgr', 'team'] } }) },
  {
    name: 'both repeatable shapes plus a ctx-dependent prompt',
    answers: makeAnswers({
      values: { scope: 'work', stop_thing: 'meetings', role_names: ['a'], bio: 'A person.' },
      repeatables: {
        roles: [{ role_name: 'Lead', role_for: 'The team', role_mandate: 'Ship it.' }],
        entities: [{ entity_name: 'Priya', entity_type: 'Manager', entity_gate: 'yes' }],
      },
    }),
  },
];

describe('generateContextFileParts — the preview and the download are the same bytes', () => {
  for (const { name, answers } of BYTE_IDENTITY_CASES) {
    it(`joins back to exactly what generateContextFile returns: ${name}`, () => {
      const parts = generateContextFileParts(answers, '2026-08-20', modules, outline);
      expect(parts.text).toBe(generateContextFile(answers, '2026-08-20', modules, outline));
    });

    it(`header + sections + footer reassemble byte-for-byte: ${name}`, () => {
      const parts = generateContextFileParts(answers, '2026-08-20', modules, outline);
      const rebuilt = `${parts.header}\n\n${parts.sections.map((s) => s.text).join('\n\n')}\n\n${parts.footer}`;
      expect(rebuilt).toBe(generateContextFile(answers, '2026-08-20', modules, outline));
    });

    it(`does the same against the real ported flow: ${name}`, () => {
      const parts = generateContextFileParts(answers, '2026-08-20');
      expect(parts.text).toBe(generateContextFile(answers, '2026-08-20'));
    });
  }

  it('returns one entry per section that has something in it, and none for the rest', () => {
    const parts = generateContextFileParts(makeAnswers({ values: { scope: 'work' } }), '2026-08-20', modules, outline);
    expect(parts.sections.map((s) => s.id)).toEqual(['sec1']);
    expect(parts.sections[0]?.label).toBe('1. About This Context');
  });

  it('a section appears the moment its first question is answered — no reveal machinery', () => {
    const before = generateContextFileParts(makeAnswers({ values: { scope: 'work' } }), '2026-08-20', modules, outline);
    const after = generateContextFileParts(makeAnswers({ values: { scope: 'work', bio: 'A person.' } }), '2026-08-20', modules, outline);
    expect(before.sections.map((s) => s.id)).toEqual(['sec1']);
    expect(after.sections.map((s) => s.id)).toEqual(['sec1', 'sec2']);
  });

  it('never returns an empty section body', () => {
    for (const { answers } of BYTE_IDENTITY_CASES) {
      const parts = generateContextFileParts(answers, '2026-08-20', modules, outline);
      for (const section of parts.sections) expect(section.text.trim()).not.toBe('');
    }
  });

  it('the header and footer are always emitted, whatever the answers', () => {
    for (const { answers } of BYTE_IDENTITY_CASES) {
      const parts = generateContextFileParts(answers, '2026-08-20', modules, outline);
      expect(parts.header.startsWith('# Context.md')).toBe(true);
      expect(parts.footer).toContain(SYSTEM_GROUNDING_RULE);
    }
  });
});

describe('repeatableRecordTitle — one title, used by the file and the tree alike', () => {
  it('titles a seeded record by its seed value', () => {
    expect(repeatableRecordTitle(rolesBlock, { role_name: 'Lead', role_for: 'The team' })).toBe('Lead');
  });

  it("titles an open-ended record by its first sub-question's answer", () => {
    expect(repeatableRecordTitle(entitiesBlock, { entity_name: 'Priya', entity_type: 'Manager' })).toBe('Priya');
  });

  it('falls back rather than rendering a blank row', () => {
    expect(repeatableRecordTitle(rolesBlock, {})).toBe('Untitled');
    expect(repeatableRecordTitle(entitiesBlock, {})).toBe('Untitled');
  });

  it('is exactly the heading the generated file prints for that record', () => {
    const answers = makeAnswers({
      values: { role_names: ['a'] },
      repeatables: { roles: [{ role_name: 'Lead', role_for: 'The team' }] },
    });
    const file = generateContextFile(answers, '2026-08-20', modules, outline);
    expect(file).toContain(`**${repeatableRecordTitle(rolesBlock, { role_name: 'Lead', role_for: 'The team' })}**`);
  });
});

describe('contextFileDate', () => {
  it('is the long-form date the downloaded file has always carried', () => {
    expect(contextFileDate(new Date('2026-08-20T12:00:00Z'))).toBe('August 20, 2026');
  });

  it('is one function, so the preview and the download can never format differently', () => {
    const now = new Date('2026-01-02T12:00:00Z');
    expect(generateContextFileParts(makeAnswers(), contextFileDate(now), modules, outline).text).toBe(
      generateContextFile(makeAnswers(), contextFileDate(now), modules, outline),
    );
  });
});
