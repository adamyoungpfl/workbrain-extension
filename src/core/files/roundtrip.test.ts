import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import { generateContextFile } from './generate';
import { parseContextFile } from './parse';

/**
 * The round-trip property test (docs/RELEASE-1.md R1-09's accept
 * criterion): `parse(generate(answers))` restores `values`/`repeatables`
 * exactly. `answeredAt`/`reflectedAt` have no representation in the file
 * format and are correctly not covered — the file isn't a full state
 * backup of timestamps, just of the answers themselves.
 *
 * One more thing the file format inherently can't cover, by the ported
 * generator's own long-standing design (not something introduced here):
 * a `yesno`/`intro` question's own value is never written to the file at
 * all (see generate.ts's `renderFileSection`, mirroring the source's
 * `renderFileSection` exactly on this point) — only what it gates (a
 * repeatable's records) shows up. Fixtures below only put answerable
 * (text/chips/multi) keys in `values`, since a gate/intro key could never
 * round-trip through a format that never wrote it out in the first place.
 */

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...overrides };
}

function roundTrip(
  answers: Answers,
  modules: Module[] | undefined = undefined,
  outline: FileOutlineNode[] | undefined = undefined,
): { values: Answers['values']; repeatables: Answers['repeatables'] } {
  const file =
    modules && outline
      ? generateContextFile(answers, '2026-08-20', modules, outline)
      : generateContextFile(answers, '2026-08-20');
  const result = modules && outline ? parseContextFile(file, modules, outline) : parseContextFile(file);
  if (!result.ok) throw new Error(`expected a parseable file, got failure reason "${result.reason}"`);
  return result.answers;
}

// ---------------------------------------------------------------------
// Synthetic fixture — same shape as generate.test.ts/parse.test.ts, kept
// deliberately small; used for the structural edge cases the real ported
// data doesn't happen to combine in one place (a nested section, a
// yes-no field living inside a record, an allowCustom entry sitting next
// to a predefined one in the same answer).
// ---------------------------------------------------------------------

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
const bioStep: Step = { id: 'bio', module: 1, section: 1, eyebrow: 'E', q: 'Describe yourself', kind: 'text', key: 'bio' };
const audiencesStep: Step = {
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
const entityGate: Step = { id: 'entity_gate', module: 3, section: 3, eyebrow: 'E', q: 'A yes-no field inside a record', kind: 'yesno', key: 'entity_gate' };
const entitiesBlock: RepeatableBlock = { id: 'entities', addAnotherPrompt: 'Another?', fields: [entityName, entityType, entityGate] };

const syntheticModules: Module[] = [
  { id: 'm1', n: 1, title: 'Orientation', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [scopeStep, scopeAwareStep] },
  { id: 'm1b', n: 1, title: 'Orientation', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [bioStep, audiencesStep] },
  { id: 'm2', n: 2, title: 'Roles', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [roleNameStep, rolesBlock] },
  { id: 'm3', n: 3, title: 'World', purpose: 'p', required: true, estimatedMinutes: [1, 1], nodes: [entitiesBlock] },
];
const syntheticOutline: FileOutlineNode[] = [
  { id: 'sec1', label: '1. About This Context', questionIds: ['scope', 'stop_thing'] },
  { id: 'sec2', label: '2. About Me', questionIds: ['bio'], children: [{ id: 'sec2-1', label: '2.1 Audiences', questionIds: ['audiences'] }] },
  { id: 'sec3', label: '3. Roles', questionIds: ['role_names', 'role_for', 'role_mandate'] },
  { id: 'sec4', label: '4. My World', questionIds: ['entity_name', 'entity_type', 'entity_gate'] },
];

describe('round-trip — synthetic fixtures (property test)', () => {
  const fixtures: { name: string; answers: Answers }[] = [
    {
      name: 'a plain spread of answered questions, including a ctx-dependent one',
      answers: makeAnswers({
        values: { scope: 'work', stop_thing: 'meetings', bio: 'I run ops.', audiences: ['mgr', 'A vendor I trust'] },
      }),
    },
    {
      name: 'an explicitly skipped question mixed in with answered ones',
      answers: makeAnswers({ values: { scope: 'personal', stop_thing: 'the school run', bio: null } }),
    },
    {
      name: 'multiple seeded repeatable records',
      answers: makeAnswers({
        values: { role_names: ['employee'] },
        repeatables: {
          roles: [
            { role_name: 'Employee', role_for: 'employer', role_mandate: 'Keep the reports accurate.' },
            { role_name: 'Volunteer', role_for: 'myself', role_mandate: 'Run the weekend fundraiser.' },
          ],
        },
      }),
    },
    {
      name: 'multiple open-ended repeatable records, one with a skipped field, a yes-no field never round-tripping',
      answers: makeAnswers({
        repeatables: {
          entities: [
            { entity_name: 'Priya', entity_type: 'person' },
            { entity_name: 'Salesforce', entity_type: null },
          ],
        },
      }),
    },
    {
      name: 'an entirely empty interview',
      answers: makeAnswers(),
    },
  ];

  for (const { name, answers } of fixtures) {
    it(`restores values and repeatables exactly: ${name}`, () => {
      const restored = roundTrip(answers, syntheticModules, syntheticOutline);
      expect(restored.values).toEqual(answers.values);
      expect(restored.repeatables).toEqual(answers.repeatables);
    });
  }
});

// ---------------------------------------------------------------------
// Real ported content (docs/RELEASE-1.md R1-09) — a single, larger fixture
// spanning several modules, built by hand from confirmed question ids and
// option keys (core/flow/source.ts). Covers the three cases the R1-09
// brief names explicitly: an explicitly skipped question, several
// repeatable records (both the seeded "roles" shape and the open-ended
// "entities"/"initiatives_records" shape), and the one real ctx-dependent
// prompt (`stop_explaining`, driven by `context_scope`).
// ---------------------------------------------------------------------

describe('round-trip — real ported content', () => {
  it('restores a realistic multi-module interview exactly', () => {
    const answers = makeAnswers({
      values: {
        context_scope: 'work',
        stop_explaining: 'the same onboarding walkthrough for every new hire',
        preferred_name: 'Jordan',
        professional_name: null, // explicitly skipped — required: false
        self_description: 'I run ops for a mid-size logistics team.',
        role_names: ['employee', 'manager'],
        responsibilities_list: 'Own the weekly ops review and the vendor relationships.',
        contribution_boundaries: 'Recruiting timelines, though I sit in on final interviews.',
        negative_responsibility: "People assume I own payroll — I don't.",
        decision_rights: 'Anything under $5k in vendor spend.',
        expertise: 'Our reporting pipeline, end to end.',
        audiences_list: ['manager', 'team', 'A very specific stakeholder'],
        // V2.0 VB-64 replaced this with one question per audience, but it is
        // still asked of anybody who already answered it, and their file still
        // prints it — so the round-trip has to carry both shapes at once.
        audience_variance: null, // explicitly skipped — required: false
        standards_list: ['cite-source', 'show-work', 'A rule of my own'],
        // BS-11 (VB-142): one question, three examples, the person's own blank
        // line between them — which the round-trip has to carry intact.
        reference_example_primary:
          'Finished the quarterly count this morning.\n\nThanks for flagging this — it is fixed now.',
      },
      repeatables: {
        roles: [
          {
            role_name: 'Employee',
            role_for: 'employer',
            role_mandate: 'Keep the reporting accurate, on time, and trusted by leadership.',
            role_standing: 'primary',
            role_durability: 'current',
          },
          {
            role_name: 'Manager / Team Lead',
            role_for: 'clients',
            role_mandate: 'Run the weekend fundraiser well.',
            role_standing: 'secondary',
            role_durability: 'historical',
          },
        ],
        entities: [
          {
            entity_name: 'Priya',
            entity_type: 'person',
            entity_relevance: 'My manager — final approver on anything over budget.',
            entity_aliases: null,
          },
          {
            entity_name: 'Salesforce',
            entity_type: 'system-tool',
            entity_relevance: 'Where every customer record lives.',
            entity_aliases: 'Also called the CRM',
          },
        ],
        // V2.0 VB-64: one record per selected audience, seeded exactly the way
        // `roles` is — including one whose answer was passed on.
        audiences: [
          { audience_name: 'My manager', audience_needs: 'The headline first, then the detail.' },
          { audience_name: 'My team', audience_needs: null },
          { audience_name: 'A very specific stakeholder', audience_needs: 'Plain words, no shorthand.' },
        ],
        initiatives_records: [
          {
            initiative_name: 'The Q4 rebrand',
            initiative_description: 'Rebuilding the site before the new fiscal year.',
            initiative_status: 'in-progress',
            initiative_success: 'The new site is live with zero broken links.',
            initiative_constraints: null,
            initiative_not_doing: 'Not touching the pricing page yet.',
          },
        ],
      },
    });

    const restored = roundTrip(answers);
    expect(restored.values).toEqual(answers.values);
    expect(restored.repeatables).toEqual(answers.repeatables);
  });
});
