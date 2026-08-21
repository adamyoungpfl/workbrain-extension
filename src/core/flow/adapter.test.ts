import { describe, it, expect } from 'vitest';
import type { Module, RepeatableBlock, Step, Phrase, FlowContext, FileOutlineNode } from '../../schema/flow.types';
import type { Module as SrcModule, FileOutlineNode as SrcFileOutlineNode } from './source';
import { adaptContextFlow } from './adapter';

/** Top-level steps only — repeatable sub-questions are counted separately below. */
function allSteps(modules: Module[]): Step[] {
  return modules.flatMap((m) => m.nodes.filter((n): n is Step => !('fields' in n)));
}

function allRepeatables(modules: Module[]): RepeatableBlock[] {
  return modules.flatMap((m) => m.nodes.filter((n): n is RepeatableBlock => 'fields' in n));
}

function everyStepIncludingRepeatableFields(modules: Module[]): Step[] {
  return [...allSteps(modules), ...allRepeatables(modules).flatMap((r) => r.fields)];
}

function resolve(phrase: Phrase, ctx: FlowContext): string {
  return typeof phrase === 'function' ? phrase(ctx) : phrase;
}

const EMPTY_CTX: FlowContext = { answers: {}, repeatables: {} };

describe('adaptContextFlow — transform logic (synthetic fixtures)', () => {
  const fixtureModules: SrcModule[] = [
    {
      id: 'mod-a',
      number: 1,
      title: 'Mod A',
      purpose: 'test',
      required: true,
      estimatedMinutes: [1, 2],
      nodes: [
        {
          kind: 'question',
          id: 'q1',
          type: 'single-select',
          prompt: () => 'Pick one',
          options: [
            { key: 'x', label: 'X' },
            { key: 'y', label: 'Y', recommended: true },
          ],
        },
        {
          kind: 'repeatable',
          id: 'rep1',
          addAnotherPrompt: 'more?',
          questions: [{ id: 'sub1', type: 'text', prompt: () => 'Sub question' }],
        },
      ],
    },
  ];
  const fixtureOutline: SrcFileOutlineNode[] = [
    {
      id: 'sec1',
      label: 'Section 1',
      questionIds: ['q1'],
      children: [{ id: 'sec1-1', label: 'Section 1.1', questionIds: ['sub1'] }],
    },
  ];

  it('maps question types to the target QuestionKind vocabulary', () => {
    const { modules } = adaptContextFlow(fixtureModules, fixtureOutline);
    const step = allSteps(modules)[0];
    expect(step?.kind).toBe('chips');
  });

  it('maps option key/label/recommended to v/l/rec', () => {
    const { modules } = adaptContextFlow(fixtureModules, fixtureOutline);
    const step = allSteps(modules)[0];
    expect(step?.options).toEqual([
      { v: 'x', l: 'X' },
      { v: 'y', l: 'Y', rec: true },
    ]);
  });

  it('assigns section via depth-first outline flattening, including repeatable sub-questions', () => {
    const { modules } = adaptContextFlow(fixtureModules, fixtureOutline);
    const q1 = allSteps(modules)[0];
    const rep = allRepeatables(modules)[0];
    expect(q1?.section).toBe(0); // sec1
    expect(rep?.fields[0]?.section).toBe(1); // sec1-1, depth-first right after sec1
  });

  it('stamps module number and a derived eyebrow onto every step', () => {
    const { modules } = adaptContextFlow(fixtureModules, fixtureOutline);
    const q1 = allSteps(modules)[0];
    expect(q1?.module).toBe(1);
    expect(q1?.eyebrow).toBe('MODULE 1 · MOD A');
  });

  it('throws when a question id is missing from the outline — never silently misindexes', () => {
    const outlineMissingSub: SrcFileOutlineNode[] = [{ id: 'sec1', label: 'S', questionIds: ['q1'] }];
    expect(() => adaptContextFlow(fixtureModules, outlineMissingSub)).toThrow(/sub1/);
  });

  it('throws when a question id appears in more than one outline section', () => {
    const dupOutline: SrcFileOutlineNode[] = [
      { id: 'sec1', label: 'S', questionIds: ['q1'] },
      { id: 'sec2', label: 'S2', questionIds: ['q1', 'sub1'] },
    ];
    expect(() => adaptContextFlow(fixtureModules, dupOutline)).toThrow(/more than one/);
  });

  it('intro questions get no storage key; everything else is keyed by its own id', () => {
    const introFixture: SrcModule[] = [
      {
        id: 'm',
        number: 1,
        title: 'M',
        purpose: 'p',
        required: true,
        estimatedMinutes: [1, 1],
        nodes: [{ kind: 'question', id: 'intro1', type: 'intro', prompt: () => 'Hi' }],
      },
    ];
    const introOutline: SrcFileOutlineNode[] = [{ id: 's', label: 'S', questionIds: ['intro1'] }];
    const { modules } = adaptContextFlow(introFixture, introOutline);
    expect(allSteps(modules)[0]?.key).toBeUndefined();

    const { modules: textModules } = adaptContextFlow(fixtureModules, fixtureOutline);
    expect(allSteps(textModules)[0]?.key).toBe('q1');
  });
});

describe('adaptContextFlow — real content (docs/RELEASE-1.md R1-05)', () => {
  const { modules, outline } = adaptContextFlow();

  it('ports all 11 modules', () => {
    expect(modules).toHaveLength(11);
  });

  it('ports 49 questions total (35 top-level + 14 repeatable sub-questions) across 3 repeatable blocks', () => {
    expect(everyStepIncludingRepeatableFields(modules)).toHaveLength(49);
    expect(allRepeatables(modules)).toHaveLength(3);
  });

  it('every question renders — resolves to non-empty text, including all 3 scope-aware branches', () => {
    for (const step of everyStepIncludingRepeatableFields(modules)) {
      expect(resolve(step.q, EMPTY_CTX).length, `step "${step.id}" q`).toBeGreaterThan(0);
    }
    const stopExplaining = everyStepIncludingRepeatableFields(modules).find((s) => s.id === 'stop_explaining');
    if (!stopExplaining) throw new Error('stop_explaining not found');
    const work = resolve(stopExplaining.q, { answers: { context_scope: 'work' }, repeatables: {} });
    const personal = resolve(stopExplaining.q, { answers: { context_scope: 'personal' }, repeatables: {} });
    const both = resolve(stopExplaining.q, { answers: { context_scope: 'both' }, repeatables: {} });
    expect(work).toContain('work life');
    expect(personal).toContain('personal life');
    expect(both.endsWith('life?')).toBe(true);
    expect(new Set([work, personal, both]).size).toBe(3);
  });

  it('every outline question id resolves to a real ported question (no orphans)', () => {
    const ids = new Set(everyStepIncludingRepeatableFields(modules).map((s) => s.id));
    function walk(nodes: FileOutlineNode[]) {
      for (const node of nodes) {
        for (const qid of node.questionIds) {
          expect(ids.has(qid), `outline id "${qid}" has no matching question`).toBe(true);
        }
        if (node.children) walk(node.children);
      }
    }
    walk(outline);
  });

  it('has exactly 6 interpret blocks, all via "ai-assist" — "echo" has no real usage to port', () => {
    const withInterpret = everyStepIncludingRepeatableFields(modules).filter((s) => s.interpret);
    expect(withInterpret).toHaveLength(6);
    expect(withInterpret.every((s) => s.interpret?.via === 'ai-assist')).toBe(true);
  });

  it("flattens the outline into 10 top-level sections, About Me's 5 sub-sections nested under it", () => {
    expect(outline).toHaveLength(10);
    const aboutMe = outline.find((o) => o.id === 'sec2');
    expect(aboutMe?.children).toHaveLength(5);
  });
});

describe('adaptContextFlow — verbatim spot-checks (hand-copied from the source read, not derived from source.ts)', () => {
  const { modules } = adaptContextFlow();
  const steps = everyStepIncludingRepeatableFields(modules);
  function byId(id: string): Step {
    const step = steps.find((s) => s.id === id);
    if (!step) throw new Error(`no step "${id}"`);
    return step;
  }

  it("stop_explaining's ideas are byte-identical to the source", () => {
    expect(byId('stop_explaining').ideas).toEqual([
      "The context behind the project I'm currently leading.",
      "Who's who on my team and what they each own.",
      'How I like things written — direct, no fluff, no corporate-speak.',
      'The history of a decision I keep having to re-justify.',
      "What I'm responsible for versus what I just get looped in on.",
    ]);
  });

  it("role_standing's rephrasings/optionRephrasings pair correctly, same v order, only l differs", () => {
    const roleStanding = byId('role_standing');
    expect(roleStanding.options).toEqual([
      { v: 'primary', l: 'Primary' },
      { v: 'secondary', l: 'Secondary' },
      { v: 'occasional', l: 'Occasional' },
    ]);
    expect(roleStanding.optionRephrasings).toEqual([
      [
        { v: 'primary', l: 'The main one' },
        { v: 'secondary', l: 'A side one' },
        { v: 'occasional', l: 'Just now and then' },
      ],
      [
        { v: 'primary', l: 'Top' },
        { v: 'secondary', l: 'Middle' },
        { v: 'occasional', l: 'Rarely' },
      ],
    ]);
  });

  it("shape_structure's optionExamples are the exact two-panel comparison text", () => {
    expect(byId('shape_structure').optionExamples).toEqual([
      'Vendor rollout — status\n· Phase 2 complete\n· Phase 3 slipped one week\n· Cause: vendor delay, 7/28\n· Ask: confirm 8/15 with Procurement.',
      "Quick update on the vendor rollout. Phase 2 wrapped on time, but Phase 3 slipped about a week after a vendor delay landed on the 28th. I'd like to confirm the new 8/15 date with Procurement.",
    ]);
  });

  it('guardrails_list marks exactly 3 of 4 options recommended', () => {
    const step = byId('guardrails_list');
    expect(step.options?.filter((o) => o.rec)).toHaveLength(3);
    expect(step.options?.find((o) => o.v === 'schema')?.rec).toBeUndefined();
  });

  it('the open-ended repeatables keep their ported add-another prompt, and no naming question', () => {
    const entities = allRepeatables(modules).find((r) => r.id === 'entities');
    expect(entities?.addAnotherPrompt).toBe('Want to tell AI about another person, team, tool, or process?');
    expect(entities?.seedFrom).toBeUndefined();
    expect(entities?.addAnotherName).toBeUndefined();
  });

  /**
   * V1.4 VB-20. `source.ts` still says `addAnotherPrompt: ""` for `roles` —
   * it is a verbatim snapshot and is not hand-edited — so the prompt the
   * roles loop now ends on can only be here, attached by the adapter from
   * ./addAnother.ts, alongside the question that names the new role. Both
   * halves matter: the prompt is what makes `findPosition` ask at all, and
   * `addAnotherName` is what makes answering "yes" survive the next reconcile.
   */
  it('the seeded "roles" repeatable gets its V1.4 add-another prompt AND a naming question', () => {
    const roles = allRepeatables(modules).find((r) => r.id === 'roles');
    expect(roles?.seedFrom).toEqual({ questionId: 'role_names', seedField: 'role_name' });
    expect(roles?.addAnotherPrompt).toBe('Want to tell AI about another role?');
    expect(roles?.addAnotherName).toEqual({
      prompt: 'What do you call this role?',
      placeholder: 'A short name for it',
    });
  });

  it('a block with no entry in the copy map keeps whatever the snapshot said, "" included', () => {
    const { modules: bare } = adaptContextFlow(undefined, undefined, undefined, {});
    const roles = allRepeatables(bare).find((r) => r.id === 'roles');
    expect(roles?.addAnotherPrompt).toBe('');
    expect(roles?.addAnotherName).toBeUndefined();
  });

  it('carries multiline through for textareas and leaves single-line text questions unset', () => {
    expect(byId('stop_explaining').multiline).toBe(true);
    expect(byId('preferred_name').multiline).toBeUndefined();
  });
});
