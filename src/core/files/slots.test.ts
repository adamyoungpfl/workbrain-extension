import { describe, it, expect } from 'vitest';
import { FILE_SLOT_IDS, actionsGenerated, fileFinished, fileSlots } from './slots';
import { sectionHealthMap } from '../freshness/sectionHealth';
import { contextModules, contextOutline } from '../flow/flow';
import type { AnswerValue, FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';

/**
 * V1.7 VB-36. Two layers, the same shape `sectionHealth.test.ts` uses:
 *
 * 1. A tiny synthetic flow, where the boundary that matters — the moment the
 *    LAST question is answered and a locked row has to stop saying "finish
 *    Context.md first" — is visible in this file itself.
 * 2. The REAL ported flow and outline, so the shelf is asserted against the
 *    twelve modules that actually ship rather than against a fixture that
 *    agrees with it by construction.
 */

const NOW = new Date('2026-08-24T12:00:00.000Z');

function step(id: string, over: Partial<Step> = {}): Step {
  return { id, module: 1, section: 0, eyebrow: 'E', q: 'Q?', kind: 'text', key: id, ...over };
}

const gatedBlock: RepeatableBlock = {
  id: 'things',
  skipIf: (ctx) => ctx.answers.things_gate !== 'yes',
  addAnotherPrompt: 'Another?',
  fields: [step('thing_name')],
};

const modules: Module[] = [
  {
    id: 'm1',
    n: 1,
    title: 'M',
    purpose: 'p',
    required: true,
    estimatedMinutes: [1, 1],
    nodes: [step('beat', { kind: 'intro' }), step('name'), step('things_gate', { kind: 'yesno' }), gatedBlock, step('voice')],
  },
];

const outline: FileOutlineNode[] = [
  { id: 'sec2', label: '2. About Me', questionIds: ['beat', 'name'] },
  { id: 'sec3', label: '3. My World', questionIds: ['things_gate', 'thing_name'] },
  { id: 'sec6', label: '6. How I Communicate', questionIds: ['voice'] },
];

function answers(over: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...over };
}

// ───────────────────────────────────────────────────────────── the shelf

describe('fileSlots — one slot per file in the work brain', () => {
  it('is the three files, in build order, always all three', () => {
    expect(fileSlots({}).map((s) => s.id)).toEqual(['context', 'skills', 'actions']);
    expect(FILE_SLOT_IDS).toEqual(['context', 'skills', 'actions']);
  });

  /** V2.2: Skills joined BUILT (its interview shipped), so two doors and one
   * lock — and the lock is Actions', which is not a door at all any more but
   * a derivation (see actionsGenerated below). This test asserted "Context is
   * the only one" for as long as that was true; the claim moved with the
   * product. */
  it('Skills.md is built AND earned: locked behind Context, open once Context is finished', () => {
    const fresh = fileSlots({});
    expect(fresh.find((s) => s.id === 'context')?.state).toBe('open');
    expect(fresh.find((s) => s.id === 'skills')?.state).toBe('locked');
    expect(fresh.find((s) => s.id === 'actions')?.state).toBe('locked');

    const earned = fileSlots({ context: true });
    expect(earned.find((s) => s.id === 'skills')?.state).toBe('open');
    expect(earned.find((s) => s.id === 'actions')?.state).toBe('locked');
  });

  /** V2.2 — Actions is never an interview: no amount of finishing turns its
   * slot 'open'. What finishing Skills does instead is make the DERIVED file
   * available, which is `actionsGenerated`'s answer, not `state`'s. */
  it('Actions.md never opens as an interview — it generates when Skills is finished', () => {
    const slots = fileSlots({ context: true, skills: true });
    expect(slots.find((s) => s.id === 'actions')?.state).toBe('locked');
    expect(actionsGenerated({ skills: true })).toBe(true);
    expect(actionsGenerated({ skills: false })).toBe(false);
    expect(actionsGenerated({})).toBe(false);
  });

  it('each slot names the file before it, and the first names none', () => {
    const [context, skills, actions] = fileSlots({});
    expect(context?.after).toBe(null);
    expect(skills?.after).toBe('context');
    expect(actions?.after).toBe('skills');
  });

  /**
   * The whole reason `afterFinished` exists: "Finish Context.md first" is true
   * and useful right up to the moment somebody finishes Context.md, and a lie
   * from then on.
   */
  it('afterFinished flips only for the file whose predecessor is finished', () => {
    const before = fileSlots({});
    expect(before.map((s) => s.afterFinished)).toEqual([false, false, false]);

    const after = fileSlots({ context: true });
    expect(after.find((s) => s.id === 'skills')?.afterFinished).toBe(true);
    // Skills.md cannot be finished — it does not exist — so Actions.md keeps
    // saying "finish Skills.md first" forever, which stays true.
    expect(after.find((s) => s.id === 'actions')?.afterFinished).toBe(false);
  });

  it('the first slot never reports a finished predecessor, even if one is claimed', () => {
    // A caller cannot accidentally make Context.md print a prerequisite line.
    expect(fileSlots({ context: true })[0]?.afterFinished).toBe(false);
  });
});

// ──────────────────────────────────────────────────── is the file finished

describe('fileFinished', () => {
  it('an empty file is not finished', () => {
    expect(fileFinished(outline, modules, answers(), NOW)).toBe(false);
  });

  it('a half-answered file is not finished', () => {
    const a = answers({ values: { name: 'Ada', things_gate: 'no' }, answeredAt: { name: '2026-08-01T00:00:00.000Z' } });
    expect(fileFinished(outline, modules, a, NOW)).toBe(false); // `voice` is still missing
  });

  it('answering the last question is what makes it finished — nothing else changes', () => {
    const base = { name: 'Ada', things_gate: 'no' };
    expect(fileFinished(outline, modules, answers({ values: base }), NOW)).toBe(false);
    expect(fileFinished(outline, modules, answers({ values: { ...base, voice: 'plain' } }), NOW)).toBe(true);
  });

  it('a gate answered "no" really does close its block — the hidden fields are not work', () => {
    // `thing_name` is never asked once `things_gate` is "no", so 3. My World is
    // genuinely finished at one question. Counting the hidden field would leave
    // this file permanently unfinishable.
    expect(fileFinished(outline, modules, answers({ values: { name: 'A', things_gate: 'no', voice: 'v' } }), NOW)).toBe(true);
    // Say "yes" and the record's own field becomes real work again.
    expect(fileFinished(outline, modules, answers({ values: { name: 'A', things_gate: 'yes', voice: 'v' } }), NOW)).toBe(false);
  });

  /**
   * SETTLED BY PRECEDENT, NOT BY TASTE — see `fileFinished`'s own comment.
   * `sectionHealth` counts a skip in `skipped` and never in `answered`, and
   * only `answered === total` is `done`. So a section holding a skip is
   * `partly`, and a file holding that section is not finished. This test says
   * the same thing one layer up, so the two modules can never drift apart
   * without one of them going red.
   */
  it('a skipped question leaves the file unfinished — a skip is recorded, not answered', () => {
    const skipped = answers({ values: { name: null, things_gate: 'no', voice: 'v' } });
    expect(fileFinished(outline, modules, skipped, NOW)).toBe(false);
    // The section holding the skip is exactly what sectionHealth calls it, and
    // this is the assertion that pins the two together.
    const health = sectionHealthMap(outline, modules, skipped, null, NOW);
    expect(health['sec2']?.state).toBe('partly');
    expect(health['sec2']).toMatchObject({ total: 1, answered: 0, skipped: 1, left: 0 });

    // Answering that same question with content — and nothing else changing —
    // is what finishes the file.
    expect(fileFinished(outline, modules, answers({ values: { name: 'Ada', things_gate: 'no', voice: 'v' } }), NOW)).toBe(true);
  });

  it('a skip is still told apart from never being reached', () => {
    // Both are unfinished, and they are unfinished for different reasons —
    // which is the distinction docs/ARCHITECTURE.md's "wb:answers, precisely"
    // depends on and `core/files/generate.ts` prints with its own marker.
    const skipped = answers({ values: { name: null, things_gate: 'no', voice: 'v' } });
    const never = answers({ values: { things_gate: 'no', voice: 'v' } });
    expect(fileFinished(outline, modules, skipped, NOW)).toBe(false);
    expect(fileFinished(outline, modules, never, NOW)).toBe(false);
    const skippedHealth = sectionHealthMap(outline, modules, skipped, null, NOW)['sec2'];
    const neverHealth = sectionHealthMap(outline, modules, never, null, NOW)['sec2'];
    expect(skippedHealth?.skipped).toBe(1);
    expect(neverHealth?.skipped).toBe(0);
    expect(neverHealth?.left).toBe(1);
  });

  it('an old but complete file is still finished — due is not unfinished', () => {
    const ancient = '2019-01-01T00:00:00.000Z';
    const a = answers({
      values: { name: 'A', things_gate: 'no', voice: 'v' },
      answeredAt: { name: ancient, things_gate: ancient, voice: ancient },
    });
    expect(fileFinished(outline, modules, a, NOW)).toBe(true);
  });

  it('a file with no sections at all is missing, not finished', () => {
    expect(fileFinished([], modules, answers({ values: { name: 'A' } }), NOW)).toBe(false);
  });
});

// ─────────────────────────────────────────────── against the real ported flow

describe('the real Context.md', () => {
  it('is not finished with nothing answered', () => {
    expect(fileFinished(contextOutline, contextModules, answers(), NOW)).toBe(false);
  });

  it('is finished once every question the real flow asks has been answered', () => {
    const a = answerEverything(contextModules);
    expect(fileFinished(contextOutline, contextModules, a, NOW)).toBe(true);

    // And one deletion is enough to take it back — proof the derivation is
    // reading the answers rather than a "done" flag.
    const missingOne = answers({ ...a, values: { ...a.values, thinking_style: undefined as unknown as AnswerValue } });
    delete missingOne.values.thinking_style;
    expect(fileFinished(contextOutline, contextModules, missingOne, NOW)).toBe(false);
  });
});

/**
 * Walks the real modules and answers everything the flow would really ask,
 * with both repeatable gates said "no" to — the shortest genuinely complete
 * Context.md there is.
 */
function answerEverything(mods: Module[]): Answers {
  const a = answers();
  const at = NOW.toISOString();
  for (const module of mods) {
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const key = node.outKey ?? node.key ?? node.id;
      if (node.id === 'entities_gate' || node.id === 'initiatives_gate') a.values[key] = 'no';
      else if (node.id === 'role_names') a.values[key] = [];
      else if (node.kind === 'intro') a.values[key] = null;
      else if (node.kind === 'yesno') a.values[key] = 'yes';
      else if (node.kind === 'chips') a.values[key] = node.options?.[0]?.v ?? 'x';
      else if (node.kind === 'multi') a.values[key] = node.options?.length ? [node.options[0]!.v] : [];
      else a.values[key] = `An answer for ${node.id}.`;
      a.answeredAt[key] = at;
    }
  }
  return a;
}
