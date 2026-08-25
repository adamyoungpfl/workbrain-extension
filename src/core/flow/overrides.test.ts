import { describe, it, expect } from 'vitest';
import type { Answers } from '../../schema/storage.types';
import type { AnswerValue, FlowContext, Module, Phrase, RepeatableBlock, Step } from '../../schema/flow.types';
import { CONTEXT_FILE_OUTLINE, CONTEXT_INTERVIEW_MODULES } from './source';
import { contextModules, contextOutline } from './flow';
import { allOverrideCopy, allOverrideReasons, overrideTargets } from './overrides';
import { multipleGroups } from './multiples';
import {
  applyAnswer,
  applySeededAddAnother,
  findPosition,
  findSeedStep,
  reconcileSeededRepeatable,
  seededNameTaken,
} from './runner';
import { fileFinished } from '../files/slots';
import { generateContextFile } from '../files/generate';
import { parseContextFile } from '../files/parse';
import { sectionHealthMap } from '../freshness/sectionHealth';

/**
 * V2.0 VB-61 · VB-62 · VB-63 · VB-64 — the capture-flow overrides.
 *
 * Four jobs, mirroring deepDive.test.ts and addAnother.test.ts:
 *
 * 1. Keep the id-keyed overrides honest against the real port — an override
 *    naming a question that has been renamed upstream is otherwise completely
 *    silent: it simply never applies, and the flow keeps its old shape.
 * 2. Prove each change actually landed in the adapted flow, including the
 *    branch every phrase falls back to.
 * 3. Prove nothing an existing file already holds is lost — the whole reason
 *    the two gate changes are written as "a recorded no still means no".
 * 4. Measure this copy's reading level, since `npm run audit`'s rule only
 *    reads src/panel/strings.ts and would never see a word of this file.
 */

const NOW = new Date('2026-08-25T12:00:00.000Z');
const YESTERDAY = new Date('2026-08-24T12:00:00.000Z').toISOString();

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

function everyStep(modules: Module[]): Step[] {
  return modules.flatMap((m) => m.nodes.flatMap((node) => ('fields' in node ? node.fields : [node])));
}

function step(id: string): Step {
  const found = everyStep(contextModules).find((s) => s.id === id);
  if (!found) throw new Error(`no step "${id}"`);
  return found;
}

function block(id: string): RepeatableBlock {
  const found = contextModules.flatMap((m) => m.nodes).find((n): n is RepeatableBlock => 'fields' in n && n.id === id);
  if (!found) throw new Error(`no block "${id}"`);
  return found;
}

function ask(phrase: Phrase, ctx: Partial<FlowContext> = {}): string {
  const full: FlowContext = { answers: {}, repeatables: {}, ...ctx };
  return typeof phrase === 'function' ? phrase(full) : phrase;
}

const ctxFor = (answers: Answers): FlowContext => ({ answers: answers.values, repeatables: answers.repeatables });

// ── 1 · the overrides are honest about what they point at ──────────────────

describe('the override module', () => {
  it('gives every override a reason, in its own data', () => {
    const reasons = allOverrideReasons();
    expect(reasons.length).toBeGreaterThan(0);
    for (const why of reasons) expect(why.trim().length, why).toBeGreaterThan(20);
  });

  it('every question, block and section it names exists in the real port', () => {
    const targets = overrideTargets();
    const sourceNodes = CONTEXT_INTERVIEW_MODULES.flatMap((m) => m.nodes);
    const questionIds = new Set(
      sourceNodes.flatMap((n) => (n.kind === 'repeatable' ? n.questions.map((q) => q.id) : [n.id])),
    );
    const blockIds = new Set(sourceNodes.filter((n) => n.kind === 'repeatable').map((n) => n.id));
    const topLevelIds = new Set(sourceNodes.filter((n) => n.kind === 'question').map((n) => n.id));
    const sectionIds = new Set(CONTEXT_FILE_OUTLINE.map((n) => n.id));

    for (const id of targets.questionIds) expect(questionIds.has(id), `question "${id}"`).toBe(true);
    for (const id of targets.blockIds) expect(blockIds.has(id), `block "${id}"`).toBe(true);
    for (const id of targets.insertionAnchors) expect(topLevelIds.has(id), `anchor "${id}"`).toBe(true);
    for (const id of targets.outlineSectionIds) expect(sectionIds.has(id), `section "${id}"`).toBe(true);
    for (const id of targets.nameFieldBlockIds) expect(blockIds.has(id), `name field block "${id}"`).toBe(true);
    for (const id of targets.gateBlockIds) expect(blockIds.has(id), `gated block "${id}"`).toBe(true);
    for (const id of targets.gateQuestionIds) expect(topLevelIds.has(id), `gate "${id}"`).toBe(true);
    for (const id of targets.placeholderQuestionIds) expect(questionIds.has(id), `placeholder "${id}"`).toBe(true);
  });

  it('every question it authors resolves to exactly one file section', () => {
    // `adaptContextFlow` throws on an unhomed question, so reaching this line
    // at all is most of the proof — this pins the section it landed in.
    expect(step('audience_needs').section).toBe(
      contextOutline.findIndex((node) => node.id === 'sec7') + 5, // sec2 has five children ahead of it
    );
    expect(contextOutline.find((n) => n.id === 'sec7')?.questionIds).toContain('audience_needs');
  });
});

// ── 2 · VB-61 and VB-63: the gates ─────────────────────────────────────────

describe('VB-61/VB-63 — both gates become framing, and both blocks become required', () => {
  it('stops asking each gate of anybody who has no answer stored in it', () => {
    for (const id of ['entities_gate', 'initiatives_gate']) {
      const gate = step(id);
      // The ported question itself is untouched — it is the file that decides
      // whether it is asked.
      expect(gate.kind, id).toBe('yesno');
      expect(ask(gate.q), id).toContain('Are there');
      expect(gate.skipIf?.(ctxFor(EMPTY)), id).toBe(true);
      expect(gate.skipIf?.({ answers: { [id]: 'no' }, repeatables: {} }), id).toBe(false);
      expect(gate.skipIf?.({ answers: { [id]: 'yes' }, repeatables: {} }), id).toBe(false);
    }
  });

  it('opens each section with a framing screen instead, carrying the help the gate had', () => {
    for (const [id, gateId] of [
      ['entities_intro', 'entities_gate'],
      ['initiatives_intro', 'initiatives_gate'],
    ] as const) {
      const intro = step(id);
      expect(intro.kind, id).toBe('intro');
      expect(intro.key, id).toBeUndefined();
      expect(ask(intro.q).length, id).toBeGreaterThan(0);
      // Skipped wherever the block it introduces is skipped — a framing screen
      // for a loop that never runs is a screen about nothing.
      expect(intro.skipIf?.({ answers: { [gateId]: 'no' }, repeatables: {} }), id).toBe(true);
      expect(intro.skipIf?.(ctxFor(EMPTY)), id).toBe(false);
      // V1.1 VB-03 wrote this help for the section, not for a yes/no — it
      // follows the screen that now opens the section (DEEP_DIVE_ALIASES).
      expect(intro.deepDive, id).toEqual(step(gateId).deepDive);
      expect(intro.deepDive?.length, id).toBeGreaterThan(0);
    }
  });

  it('sends a section row to the framing screen, never to a question nobody is asked', () => {
    for (const [sectionId, introId] of [
      ['sec3', 'entities_intro'],
      ['sec4', 'initiatives_intro'],
    ] as const) {
      expect(contextOutline.find((n) => n.id === sectionId)?.questionIds[0]).toBe(introId);
    }
  });

  it('asks the block from question one when nothing has been declined', () => {
    for (const [blockId, gateId] of [
      ['entities', 'entities_gate'],
      ['initiatives_records', 'initiatives_gate'],
    ] as const) {
      expect(block(blockId).skipIf?.(ctxFor(EMPTY)), blockId).toBe(false);
      expect(block(blockId).skipIf?.({ answers: { [gateId]: null }, repeatables: {} }), blockId).toBe(false);
    }
  });

  it('still honours a "no" recorded under the old rule, forever', () => {
    expect(block('entities').skipIf?.({ answers: { entities_gate: 'no' }, repeatables: {} })).toBe(true);
    expect(block('initiatives_records').skipIf?.({ answers: { initiatives_gate: 'no' }, repeatables: {} })).toBe(true);
  });

  /**
   * A "no" that outlives the question that produced it has to be READABLE by
   * anything that reconstructs a file — above all `core/files/restore.ts`,
   * which has to decide what a gate must have been for an imported file that
   * never wrote one down. It used to slice `_gate` off the question id and
   * look for a block by what was left; `initiatives_records` does not answer
   * to `initiatives`, so every import declared the section declined. See
   * `RepeatableBlock.gateQuestionId` and restore.test.ts.
   */
  it('says out loud which question gates which block, since skipIf cannot be read', () => {
    expect(block('entities').gateQuestionId).toBe('entities_gate');
    expect(block('initiatives_records').gateQuestionId).toBe('initiatives_gate');
    // The one the old guess got right, and the one it got wrong — spelled out
    // so the difference between them is on the record.
    expect(block('initiatives_records').gateQuestionId).not.toBe(`${block('initiatives_records').id}_gate`);
    // And nothing else claims a gate: the two seeded blocks never had one.
    for (const id of ['roles', 'audiences']) {
      expect(block(id).gateQuestionId, id).toBeUndefined();
    }
  });

  it('walks a brand-new file into the entity cycle rather than past it', () => {
    // The framing screen is seen (an intro is recorded, never skipped past
    // silently), and the very next thing the runner asks is the first field of
    // the first record — which is what "assume at least one" means in practice.
    const myWorld = contextModules.filter((m) => m.id === 'my-world');
    const seen = applyAnswer(EMPTY, step('entities_intro'), { in: 'top' }, null);
    const position = findPosition(myWorld, seen, new Set(), new Set(['my-world']));
    expect(position.kind).toBe('step');
    if (position.kind !== 'step') throw new Error('expected a step');
    expect(position.step.id).toBe('entity_type');
    expect(position.location).toEqual({ in: 'repeatable', blockId: 'entities', recordIndex: 0 });
  });

  it('still asks for another one after each record, in the ported words', () => {
    // "plus the add-another after each" (docs/V2.0-REFINEMENT.md VB-63). Both
    // blocks already carried the prompt and neither override touches it — the
    // assertion is that making the block required did not cost it, since a
    // required block that can only ever hold one item is a worse question.
    expect(block('entities').addAnotherPrompt).toBe('Want to tell AI about another person, team, tool, or process?');
    expect(block('initiatives_records').addAnotherPrompt).toBe('Want to tell AI about another initiative or project?');
  });

  it('leaves the initiatives order exactly as it was ported', () => {
    expect(block('initiatives_records').fields.map((f) => f.id)).toEqual([
      'initiative_name',
      'initiative_description',
      'initiative_status',
      'initiative_success',
      'initiative_constraints',
      'initiative_not_doing',
    ]);
    expect(block('initiatives_records').addAnotherPrompt).toBe('Want to tell AI about another initiative or project?');
  });
});

// ── 3 · VB-62: the item cycle ──────────────────────────────────────────────

describe('VB-62 — type first, then name, description, synonyms', () => {
  it('asks the four questions in the new order', () => {
    expect(block('entities').fields.map((f) => f.id)).toEqual([
      'entity_type',
      'entity_name',
      'entity_relevance',
      'entity_aliases',
    ]);
  });

  it('still titles a record by its name, not by its kind', () => {
    expect(block('entities').nameField).toBe('entity_name');
    const file = generateContextFile(
      { values: {}, repeatables: { entities: [{ entity_type: 'person', entity_name: 'Priya' }] } },
      'August 25, 2026',
    );
    expect(file).toContain('**Priya**');
    expect(file).not.toContain('**Person**');
  });

  const typed: [string, string, string, string][] = [
    // kind, name question, relevance question, aliases question
    ['person', "What's their name?", 'about them?', 'nicknames they go by?'],
    ['team', "What's this team called?", 'about this team?', 'shorthand this goes by?'],
    ['system-tool', "What's this tool called?", 'about this tool?', 'shorthand this goes by?'],
    ['process-workflow', "What's this process called?", 'about this process?', 'shorthand this goes by?'],
  ];

  for (const [kind, name, relevance, aliases] of typed) {
    it(`phrases the rest of the cycle for a ${kind}`, () => {
      const ctx = { record: { entity_type: kind } };
      expect(ask(step('entity_name').q, ctx)).toBe(name);
      expect(ask(step('entity_relevance').q, ctx)).toContain(relevance);
      expect(ask(step('entity_aliases').q, ctx)).toContain(aliases);
    });
  }

  it('falls back to the ported wording when no kind is known', () => {
    expect(ask(step('entity_name').q)).toBe("What's their name — or its name, if this is a tool or team?");
    expect(ask(step('entity_relevance').q)).toBe('In a sentence, why does AI need to know about this?');
    expect(ask(step('entity_aliases').q)).toBe('Any other names, nicknames, or shorthand this goes by?');
  });

  /**
   * The example under the field is part of how the question reads. Left
   * ported, "What's their name?" sat over *"e.g. Priya, the Growth team,
   * Salesforce, the weekly review"* — a question about one person answered
   * with four kinds of thing — and "Any other names or nicknames they go by?"
   * offered a person "'the CRM'" as an example of their own nickname. Caught
   * by looking at the real screens, not by a test.
   */
  it('gives the example the same kind of thing the question is about', () => {
    const phFor = (id: string, kind?: string) => {
      const ph = step(id).ph;
      if (ph === undefined) throw new Error(`"${id}" lost its placeholder`);
      return ask(ph, kind === undefined ? {} : { record: { entity_type: kind } });
    };
    expect(phFor('entity_name', 'person')).toBe('e.g. Priya, my manager');
    expect(phFor('entity_name', 'team')).toBe('e.g. the Growth team');
    expect(phFor('entity_name', 'system-tool')).toBe('e.g. Salesforce');
    expect(phFor('entity_name', 'process-workflow')).toBe('e.g. the weekly review');
    expect(phFor('entity_aliases', 'person')).not.toContain('CRM');
    expect(phFor('entity_aliases', 'system-tool')).toContain('CRM');
  });

  it('keeps the ported example as the fallback, which is the one every other surface shows', () => {
    const nameField = step('entity_name').ph;
    if (nameField === undefined) throw new Error('entity_name lost its placeholder');
    expect(ask(nameField)).toBe('e.g. Priya, the Growth team, Salesforce, the weekly review');
    // The add-a-record screen resolves without a record — there is no record
    // yet, it is the screen that makes one — so it shows exactly that.
    const world = multipleGroups(contextModules, contextOutline, EMPTY).find((g) => g.blockId === 'entities');
    expect(world?.namePlaceholder).toBe('e.g. Priya, the Growth team, Salesforce, the weekly review');
    expect(world?.namePrompt).toBe("What's their name — or its name, if this is a tool or team?");
  });

  it('leaves every other question its ported example, untouched by any of this', () => {
    expect(step('entity_relevance').ph).toBe('What they own, how you work together, why they come up...');
    expect(typeof step('preferred_name').ph).toBe('string');
  });

  it('falls back for a kind somebody typed themselves, rather than guessing', () => {
    expect(ask(step('entity_name').q, { record: { entity_type: 'A committee' } })).toBe(
      "What's their name — or its name, if this is a tool or team?",
    );
  });

  it('prints ONE stable label per question in the file, whatever kind the record is', () => {
    // generate.ts and parse.ts both resolve without a record, on purpose — see
    // schema/flow.types.ts's `FlowContext.record`. Two records of different
    // kinds must therefore produce identical bullet labels, or the parser
    // would be matching against text the generator did not write.
    const file = generateContextFile(
      {
        values: {},
        repeatables: {
          entities: [
            { entity_type: 'person', entity_name: 'Priya', entity_relevance: 'My manager.' },
            { entity_type: 'system-tool', entity_name: 'Salesforce', entity_relevance: 'Our CRM.' },
          ],
        },
      },
      'August 25, 2026',
    );
    const labels = [...file.matchAll(/^- \*\*(.+?):\*\*/gm)].map((m) => m[1]);
    expect(labels.filter((l) => l === 'In a sentence, why does AI need to know about this?')).toHaveLength(2);
  });
});

// ── 4 · VB-64: per audience ────────────────────────────────────────────────

describe('VB-64 — one question per audience, on the roles pattern', () => {
  const audiences = () => block('audiences');

  it('is a seeded block over the audiences they already picked', () => {
    expect(audiences().seedFrom).toEqual({ questionId: 'audiences_list', seedField: 'audience_name' });
    expect(audiences().fields.map((f) => f.id)).toEqual(['audience_needs']);
  });

  it('names the reader in the question, since nothing else on the screen does', () => {
    expect(ask(step('audience_needs').q, { record: { audience_name: 'My manager' } })).toBe(
      "My manager — what's different about writing to them?",
    );
    expect(ask(step('audience_needs').q)).toBe("What's different about writing to this reader?");
  });

  it('produces one record per selected audience, keeping detail already given', () => {
    const seedStep = step('audiences_list');
    let answers = applyAnswer(EMPTY, seedStep, { in: 'top' }, ['manager', 'team']);
    answers = reconcileSeededRepeatable(answers, audiences(), seedStep, ['manager', 'team']);
    expect(answers.repeatables.audiences).toEqual([{ audience_name: 'My manager' }, { audience_name: 'My team' }]);

    answers = applyAnswer(answers, step('audience_needs'), { in: 'repeatable', blockId: 'audiences', recordIndex: 0 }, 'Headline first.');
    answers = reconcileSeededRepeatable(answers, audiences(), seedStep, ['manager', 'team']);
    expect(answers.repeatables.audiences?.[0]).toEqual({ audience_name: 'My manager', audience_needs: 'Headline first.' });
  });

  /**
   * VB-20'S TRAP, ASSERTED DIRECTLY (docs/V1.4-REFINEMENT.md).
   *
   * A record whose name is not in the seed answer is deleted by the next
   * reconcile, with every answer inside it. This is the test that would fail
   * if `audiences` ever grew a second way to add a record.
   */
  it('an audience added mid-loop survives the seed question being re-submitted', () => {
    const seedStep = findSeedStep(contextModules, audiences());
    if (!seedStep) throw new Error('the audiences block lost its seed question');

    let answers = applyAnswer(EMPTY, seedStep, { in: 'top' }, ['manager']);
    answers = reconcileSeededRepeatable(answers, audiences(), seedStep, ['manager']);
    answers = applySeededAddAnother(answers, audiences(), seedStep, 'The board');
    answers = applyAnswer(answers, step('audience_needs'), { in: 'repeatable', blockId: 'audiences', recordIndex: 1 }, 'Numbers only.');

    // The name landed in the seed answer as well — that is the whole fix.
    expect(answers.values.audiences_list).toEqual(['manager', 'The board']);

    const selected = answers.values.audiences_list as string[];
    const after = reconcileSeededRepeatable(answers, audiences(), seedStep, selected);
    expect(after.repeatables.audiences).toEqual([
      { audience_name: 'My manager' },
      { audience_name: 'The board', audience_needs: 'Numbers only.' },
    ]);
  });

  it('refuses a duplicate name, which is the same data loss by another route', () => {
    const seedStep = findSeedStep(contextModules, audiences())!;
    let answers = applyAnswer(EMPTY, seedStep, { in: 'top' }, ['manager']);
    answers = reconcileSeededRepeatable(answers, audiences(), seedStep, ['manager']);
    expect(seededNameTaken(answers, audiences(), seedStep, 'my manager')).toBe(true);
    expect(applySeededAddAnother(answers, audiences(), seedStep, 'My manager')).toBe(answers);
  });

  it('carries the copy that lets it grow at all', () => {
    expect(audiences().addAnotherPrompt).toBe('Want to tell AI about another reader?');
    expect(audiences().addAnotherName).toEqual({
      prompt: 'Who else do you write to?',
      placeholder: 'A short name for them',
    });
  });

  it('asks nothing when nobody picked an audience', () => {
    expect(audiences().skipIf?.(ctxFor(EMPTY))).toBe(true);
    expect(audiences().skipIf?.({ answers: { audiences_list: ['manager'] }, repeatables: {} })).toBe(false);
  });

  it('asks the old catch-all question of nobody new', () => {
    expect(step('audience_variance').skipIf?.(ctxFor(EMPTY))).toBe(true);
    expect(step('audience_variance').skipIf?.({ answers: { audience_variance: 'Not much.' }, repeatables: {} })).toBe(
      false,
    );
  });
});

// ── 5 · a file finished under the old rules ────────────────────────────────

/**
 * Answers as they would already be sitting in `wb:answers` for somebody who
 * finished their Context.md before any of this shipped: both gates answered
 * "no", the catch-all audience question answered, and no entity, initiative or
 * per-audience record anywhere.
 */
function finishedUnderTheOldRules(): Answers {
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of CONTEXT_INTERVIEW_MODULES) {
    for (const node of module.nodes) {
      if (node.kind === 'repeatable') continue;
      const value: AnswerValue =
        node.type === 'intro'
          ? null
          : node.type === 'yes-no'
            ? 'no'
            : node.type === 'single-select'
              ? (node.options?.[0]?.key ?? 'x')
              : node.type === 'multi-select'
                ? []
                : `An answer for ${node.id}.`;
      values[node.id] = value;
      answeredAt[node.id] = YESTERDAY;
      if (typeof value === 'string') reflectedAt[node.id] = YESTERDAY;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

describe('a file that was finished yesterday is still finished today', () => {
  const old = finishedUnderTheOldRules();

  it('does not quietly become incomplete', () => {
    expect(fileFinished(contextOutline, contextModules, old, NOW)).toBe(true);
  });

  it('has nothing left to answer, so the panel does not reopen the interview', () => {
    expect(findPosition(contextModules, old, new Set(), new Set()).kind).toBe('done');
  });

  it('reports both declined sections exactly as they read before, one question each', () => {
    const health = sectionHealthMap(contextOutline, contextModules, old, null, NOW);
    for (const id of ['sec3', 'sec4']) {
      expect(health[id]?.total, id).toBe(1);
      expect(health[id]?.answered, id).toBe(1);
    }
  });

  it('reports both declined sections as done rather than as half-written', () => {
    const health = sectionHealthMap(contextOutline, contextModules, old, null, NOW);
    expect(health.sec3?.state).toBe('done');
    expect(health.sec4?.state).toBe('done');
    expect(health.sec7?.state).toBe('done');
  });

  it('still prints the audience answer it already holds, and reads it back', () => {
    const file = generateContextFile(old, 'August 25, 2026');
    expect(file).toContain('Do any of these need something noticeably different from the rest?');
    expect(file).toContain('An answer for audience_variance.');

    const parsed = parseContextFile(file);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.answers.values.audience_variance).toBe('An answer for audience_variance.');
  });
});

// ── 6 · reading level, which the audit cannot see ──────────────────────────

/**
 * The audit's own Flesch-Kincaid, transcribed — same numbers, so "grade 7"
 * means the same thing on both sides of the src/panel boundary. See
 * deepDive.test.ts and addAnother.test.ts, which do this for the same reason.
 */
function readingGrade(strings: string[]): number {
  const syllables = (word: string) => {
    const groups = word.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g);
    return Math.max(1, groups ? groups.length : 1);
  };
  let words = 0;
  let sentences = 0;
  let syllableCount = 0;
  for (const s of strings) {
    const ws = s.split(/\s+/).filter(Boolean);
    words += ws.length;
    sentences += Math.max(1, (s.match(/[.?!]/g) ?? []).length);
    for (const w of ws) syllableCount += syllables(w);
  }
  return 0.39 * (words / sentences) + 11.8 * (syllableCount / words) - 15.59;
}

describe('reading level (npm run audit cannot see this file)', () => {
  it('reads at grade 7 or below across every line it ships', () => {
    const grade = readingGrade(allOverrideCopy());
    expect(grade, `overrides.ts reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
  });

  it('never runs a sentence past 20 words (docs/design-system.html §08)', () => {
    for (const line of allOverrideCopy()) {
      for (const sentence of line.split(/(?<=[.?!])\s+/)) {
        const words = sentence.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
        expect(words.length, `"${sentence}"`).toBeLessThanOrEqual(20);
      }
    }
  });

  it('asks real questions — every authored prompt ends in a question mark', () => {
    for (const id of ['entity_type', 'entity_name', 'entity_relevance', 'entity_aliases', 'audience_needs']) {
      expect(ask(step(id).q).endsWith('?'), id).toBe(true);
    }
  });
});
