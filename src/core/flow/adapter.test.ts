import { describe, it, expect } from 'vitest';
import type { Module, RepeatableBlock, Step, Phrase, FlowContext, FileOutlineNode } from '../../schema/flow.types';
import type {
  Module as SrcModule,
  FileOutlineNode as SrcFileOutlineNode,
  Question as SrcQuestion,
  RepeatableBlock as SrcRepeatableBlock,
} from './source';
import { CONTEXT_FILE_OUTLINE, CONTEXT_INTERVIEW_MODULES } from './source';
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

  /**
   * 49 ported + 3 authored here (core/flow/overrides.ts): VB-64's
   * `audience_needs` and the seeded `audiences` block it lives in, plus
   * VB-61's and VB-63's framing beats. NOTHING IS REMOVED — an override that
   * deleted a question would delete somebody's answer with it — so this count
   * only ever grows, and the ported 49 are all still here.
   */
  it('ports 49 questions and adds our own 8 (V2.0 ×3, V2.3 ladder ×3 + goal gate ×2), across 4 repeatable blocks', () => {
    const all = everyStepIncludingRepeatableFields(modules);
    const authoredHere = [
      'entities_intro',
      'initiatives_intro',
      'audience_needs',
      'wb_canvas',
      'wb_brain_flip',
      'wb_go',
      'goal_service',
      'goal_want',
    ];
    expect(all).toHaveLength(57);
    for (const id of authoredHere) {
      expect(all.filter((s) => s.id === id), id).toHaveLength(1);
    }
    expect(all.filter((s) => !authoredHere.includes(s.id))).toHaveLength(49);
    // VB-90 + VB-93: the why screen, the ladder, then the gate — the flow's
    // first QUESTIONS are still the gate; everything before it is a screen.
    expect(all.slice(0, 6).map((s) => s.id)).toEqual([
      'orientation_ready',
      'wb_canvas',
      'wb_brain_flip',
      'wb_go',
      'goal_service',
      'goal_want',
    ]);
    expect(allRepeatables(modules).map((r) => r.id)).toEqual([
      'roles',
      'entities',
      'initiatives_records',
      'audiences',
    ]);
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

/**
 * V2.0, FLAG 2's own acceptance line: *"adapter.test.ts should assert that
 * `source.ts`'s own exports are untouched by any of it."*
 *
 * Four capture-flow items (VB-61..64) change what the interview asks. All of
 * them are attached here, by ./overrides.ts, and NONE of them may reach the
 * snapshot — not by editing it, and not by mutating it at run time, which is
 * the subtler failure: `CONTEXT_INTERVIEW_MODULES` is a module-level constant
 * shared by every caller, and one in-place `questions.sort()` inside the
 * adapter would silently rewrite the port for the whole process.
 *
 * So this asserts both halves:
 *  1. the snapshot still says what the port said (hand-copied values below,
 *     read from the source, not derived from it — a derived expectation would
 *     pass no matter what somebody changed);
 *  2. adapting does not change it — a structural digest taken before, compared
 *     after several adaptations.
 */
describe('source.ts stays the verbatim port (V2.0 FLAG 2)', () => {
  function digest(): string {
    return JSON.stringify(
      CONTEXT_INTERVIEW_MODULES.map((m) => ({
        id: m.id,
        nodes: m.nodes.map((n) =>
          n.kind === 'repeatable'
            ? { id: n.id, prompt: n.addAnotherPrompt, questions: n.questions.map((q) => `${q.id}:${q.type}`) }
            : { id: n.id, type: n.type },
        ),
      })),
    );
  }

  function sourceBlock(id: string): SrcRepeatableBlock {
    const found = CONTEXT_INTERVIEW_MODULES.flatMap((m) => m.nodes).find(
      (n): n is SrcRepeatableBlock => n.kind === 'repeatable' && n.id === id,
    );
    if (!found) throw new Error(`no source block "${id}"`);
    return found;
  }

  function sourceQuestion(id: string): SrcQuestion {
    const found = CONTEXT_INTERVIEW_MODULES.flatMap((m) => m.nodes).find(
      (n): n is Extract<typeof n, { kind: 'question' }> => n.kind === 'question' && n.id === id,
    );
    if (!found) throw new Error(`no source question "${id}"`);
    return found;
  }

  it('still asks both gates as yes-no questions, in the ported wording', () => {
    const entities = sourceQuestion('entities_gate');
    expect(entities.type).toBe('yes-no');
    expect(entities.prompt(EMPTY_CTX)).toBe(
      "Are there specific people, teams, tools, or processes worth telling AI about by name — the kind you'd expect it to recognize instead of re-explaining every time?",
    );
    expect(sourceQuestion('initiatives_gate').type).toBe('yes-no');
  });

  it('still asks the entity cycle name-first, and still gates its block on "yes"', () => {
    const entities = sourceBlock('entities');
    expect(entities.questions.map((q) => q.id)).toEqual([
      'entity_name',
      'entity_type',
      'entity_relevance',
      'entity_aliases',
    ]);
    expect(entities.skipIf?.({ answers: { entities_gate: 'yes' }, repeatables: {} })).toBe(false);
    expect(entities.skipIf?.({ answers: {}, repeatables: {} })).toBe(true);
  });

  it('still has audience_variance as one plain top-level question, and no audiences block', () => {
    const variance = sourceQuestion('audience_variance');
    expect(variance.type).toBe('text');
    expect(variance.skipIf).toBeUndefined();
    expect(variance.prompt(EMPTY_CTX)).toBe('Do any of these need something noticeably different from the rest?');
    expect(CONTEXT_INTERVIEW_MODULES.flatMap((m) => m.nodes).some((n) => n.id === 'audiences')).toBe(false);
    const sec7 = CONTEXT_FILE_OUTLINE.find((n) => n.id === 'sec7');
    expect(sec7?.questionIds).toEqual(['audiences_list', 'audience_variance']);
  });

  it('is not mutated by adapting it, however many times that happens', () => {
    const before = digest();
    adaptContextFlow();
    adaptContextFlow();
    expect(digest()).toBe(before);
  });

  it('and the adapted flow really did change — otherwise the above proves nothing', () => {
    const { modules, outline } = adaptContextFlow();
    const entities = modules
      .flatMap((m) => m.nodes)
      .find((n): n is RepeatableBlock => 'fields' in n && n.id === 'entities');
    expect(entities?.fields.map((f) => f.id)).toEqual([
      'entity_type',
      'entity_name',
      'entity_relevance',
      'entity_aliases',
    ]);
    expect(outline.find((n) => n.id === 'sec7')?.questionIds).toEqual([
      'audiences_list',
      'audience_variance',
      'audience_needs',
    ]);
  });
});
