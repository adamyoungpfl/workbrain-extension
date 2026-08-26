import { describe, it, expect } from 'vitest';
import { sectionCompletionPercent, sectionHealthFor, sectionHealthMap, summariseSectionHealth } from './sectionHealth';
import { halfLifeFor } from './halfLives';
import { contextModules, contextOutline } from '../flow/flow';
import type { FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';

/**
 * V1.3 VB-19. Two layers on purpose:
 *
 * 1. A tiny synthetic flow, where every boundary is visible in the test file
 *    itself — five states, the skip/left distinction, the per-record counting,
 *    the gate, and the half-life boundary at exactly N days.
 * 2. The REAL ported flow and outline, so the shapes this actually ships
 *    against (intro steps, seeded `roles`, the `entities` gate) are asserted
 *    rather than assumed.
 */

const NOW = new Date('2026-08-20T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * DAY_MS).toISOString();
}

function step(id: string, over: Partial<Step> = {}): Step {
  return { id, module: 1, section: 0, eyebrow: 'E', q: 'Q?', kind: 'text', key: id, ...over };
}

const openBlock: RepeatableBlock = {
  id: 'things',
  skipIf: (ctx) => ctx.answers.things_gate !== 'yes',
  addAnotherPrompt: 'Another?',
  fields: [step('thing_name'), step('thing_why')],
};

const seededBlock: RepeatableBlock = {
  id: 'roles',
  seedFrom: { questionId: 'role_names', seedField: 'role_name' },
  addAnotherPrompt: '',
  fields: [step('role_for'), step('role_durability', { kind: 'chips' })],
};

const modules: Module[] = [
  {
    id: 'm1',
    n: 1,
    title: 'M',
    purpose: 'p',
    required: true,
    estimatedMinutes: [1, 1],
    nodes: [
      step('beat', { kind: 'intro' }),
      step('name'),
      step('about'),
      step('role_names', { kind: 'multi' }),
      seededBlock,
      step('things_gate', { kind: 'yesno' }),
      openBlock,
      step('voice'),
    ],
  },
];

/** Two top-level sections plus a child, mirroring the real outline's shape:
 * a parent with its own questions AND children that roll up into it. */
const outline: FileOutlineNode[] = [
  {
    id: 'sec2',
    label: '2. About Me',
    questionIds: ['beat', 'name', 'about'],
    children: [{ id: 'sec2-1', label: '2.1 Roles', questionIds: ['role_names', 'role_for', 'role_durability'] }],
  },
  { id: 'sec3', label: '3. My World', questionIds: ['things_gate', 'thing_name', 'thing_why'] },
  { id: 'sec6', label: '6. How I Communicate', questionIds: ['voice'] },
];

function answers(over: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...over };
}

function healthOf(node: FileOutlineNode, a: Answers, currentQuestionId: string | null = null, now: Date = NOW) {
  return sectionHealthFor(node, modules, a, currentQuestionId, now);
}

const sec2 = outline[0]!;
const sec2Roles = sec2.children![0]!;
const sec3 = outline[1]!;
const sec6 = outline[2]!;

describe('the five states', () => {
  it('not yet — nothing recorded anywhere in the section', () => {
    const h = healthOf(sec6, answers());
    expect(h.state).toBe('not-yet');
    expect(h.answered).toBe(0);
    expect(h.total).toBe(1);
    expect(h.lastAnsweredAt).toBe(null);
    expect(h.ageDays).toBe(null);
    expect(h.elapsed).toBe(null);
  });

  it('here — the question on screen belongs to it, whatever else is true', () => {
    // Half-answered AND ancient: still "here", because "here" wins.
    const a = answers({ values: { voice: 'plain' }, answeredAt: { voice: daysAgo(5000) } });
    expect(healthOf(sec6, a, 'voice').state).toBe('here');
    expect(healthOf(sec6, answers(), 'voice').state).toBe('here');
  });

  it('here also wins on a parent when the question is inside one of its children', () => {
    expect(healthOf(sec2, answers(), 'role_for').state).toBe('here');
  });

  it('done — every question answered, all inside the half-life', () => {
    const a = answers({
      values: { voice: 'plain' },
      answeredAt: { voice: daysAgo(10) },
    });
    const h = healthOf(sec6, a);
    expect(h.state).toBe('done');
    expect(h.answered).toBe(1);
    expect(h.total).toBe(1);
    expect(h.due).toBe(0);
    expect(h.ageDays).toBe(10);
  });

  it('due — finished, but past its own half-life', () => {
    const a = answers({
      values: { voice: 'plain' },
      answeredAt: { voice: daysAgo(halfLifeFor('sec6')) },
    });
    const h = healthOf(sec6, a);
    expect(h.state).toBe('due');
    expect(h.due).toBe(1);
    expect(h.answered).toBe(h.total);
  });

  it('partly — something answered, something still to go', () => {
    const a = answers({ values: { name: 'Ada' }, answeredAt: { name: daysAgo(1) } });
    const h = healthOf(sec2, a);
    expect(h.state).toBe('partly');
    expect(h.answered).toBe(1);
    expect(h.left).toBeGreaterThan(0);
  });

  it('partly — a skip is asked-and-passed, and never counts as answered', () => {
    const a = answers({
      values: { name: 'Ada', about: null },
      answeredAt: { name: daysAgo(1), about: daysAgo(1) },
    });
    const h = healthOf(sec2, a);
    // name + about are answered/skipped; role_names is still to go.
    expect(h.answered).toBe(1);
    expect(h.skipped).toBe(1);
    expect(h.state).toBe('partly');
  });

  it('a section where every question was skipped is partly, never done', () => {
    const a = answers({ values: { voice: null }, answeredAt: { voice: daysAgo(1) } });
    const h = healthOf(sec6, a);
    expect(h.state).toBe('partly');
    expect(h.answered).toBe(0);
    expect(h.skipped).toBe(1);
  });

  it('an aged, half-answered section stays partly — due is only ever a finished section', () => {
    const a = answers({ values: { name: 'Ada' }, answeredAt: { name: daysAgo(5000) } });
    const h = healthOf(sec2, a);
    expect(h.state).toBe('partly');
    expect(h.due).toBeGreaterThan(0); // the count is still honest...
    expect(h.state).not.toBe('due'); // ...the state simply does not use it here
  });
});

describe('the half-life boundary, per section', () => {
  it('is inclusive at exactly the threshold and clear the day before', () => {
    const threshold = halfLifeFor('sec6');
    const at = (n: number) =>
      healthOf(sec6, answers({ values: { voice: 'plain' }, answeredAt: { voice: daysAgo(n) } })).state;
    expect(at(threshold - 1)).toBe('done');
    expect(at(threshold)).toBe('due');
    expect(at(threshold + 1)).toBe('due');
  });

  it('a section on a short clock goes due while one on a long clock has not', () => {
    // The whole reason the table exists: the same answer age, two verdicts.
    const age = 150; // past My World's 120, well inside How I Communicate's 730
    expect(halfLifeFor('sec3')).toBeLessThan(age);
    expect(halfLifeFor('sec6')).toBeGreaterThan(age);

    const a = answers({
      values: { things_gate: 'no', voice: 'plain' },
      answeredAt: { things_gate: daysAgo(age), voice: daysAgo(age) },
    });
    expect(healthOf(sec3, a).state).toBe('due');
    expect(healthOf(sec6, a).state).toBe('done');
  });

  it('a section carries the clock it was actually judged on', () => {
    expect(healthOf(sec3, answers()).halfLifeDays).toBe(halfLifeFor('sec3'));
    expect(healthOf(sec6, answers()).halfLifeDays).toBe(halfLifeFor('sec6'));
  });

  it('an unanswered question is never due, however long the panel has been shut', () => {
    const h = healthOf(sec6, answers(), null, new Date(NOW.getTime() + 5000 * DAY_MS));
    expect(h.due).toBe(0);
    expect(h.state).toBe('not-yet');
  });
});

describe('what the denominator counts', () => {
  it('leaves intro beats out — a narrative beat is not a question', () => {
    // sec2 lists `beat`, `name`, `about`; only two of them can be answered.
    // Its child adds role_names (the seeded block asks nothing yet).
    expect(healthOf(sec2, answers()).total).toBe(3);
    expect(healthOf(sec2Roles, answers()).total).toBe(1);
  });

  it('drops a whole block when its gate says no, so the section can finish', () => {
    const a = answers({ values: { things_gate: 'no' }, answeredAt: { things_gate: daysAgo(1) } });
    const h = healthOf(sec3, a);
    expect(h.total).toBe(1);
    expect(h.state).toBe('done');
  });

  it('counts a gated block once when the gate is open and nothing is in it yet', () => {
    const a = answers({ values: { things_gate: 'yes' }, answeredAt: { things_gate: daysAgo(1) } });
    const h = healthOf(sec3, a);
    expect(h.total).toBe(3); // the gate, plus one record's two fields
    expect(h.state).toBe('partly');
  });

  it('counts a repeatable per record — three records is three sets of questions', () => {
    const a = answers({
      values: { things_gate: 'yes' },
      repeatables: {
        things: [
          { thing_name: 'Priya', thing_why: 'My manager' },
          { thing_name: 'Growth', thing_why: 'The team' },
          { thing_name: 'CRM', thing_why: null },
        ],
      },
      answeredAt: { things_gate: daysAgo(1) },
    });
    const h = healthOf(sec3, a);
    expect(h.total).toBe(7); // 1 gate + 3 records x 2 fields
    expect(h.answered).toBe(6);
    expect(h.skipped).toBe(1);
    expect(h.state).toBe('partly');
  });

  it('asks nothing for a seeded block until its seed question creates records', () => {
    const bare = healthOf(sec2Roles, answers());
    expect(bare.total).toBe(1); // role_names only

    const seeded = answers({
      values: { role_names: ['a', 'b'] },
      repeatables: { roles: [{ role_name: 'Lead' }, { role_name: 'Parent' }] },
      answeredAt: { role_names: daysAgo(1) },
    });
    expect(healthOf(sec2Roles, seeded).total).toBe(5); // role_names + 2 x 2 fields
  });
});

describe('rolling a parent up over its children', () => {
  it('a parent counts everything under it, not just its own questions', () => {
    const a = answers({
      values: { name: 'Ada', about: 'Ops', role_names: ['a'] },
      repeatables: { roles: [{ role_name: 'Lead', role_for: 'My team', role_durability: 'current' }] },
      answeredAt: {
        name: daysAgo(1),
        about: daysAgo(1),
        role_names: daysAgo(1),
        'roles#0#role_for': daysAgo(1),
        'roles#0#role_durability': daysAgo(1),
      },
    });
    const h = healthOf(sec2, a);
    expect(h.total).toBe(5); // name, about + role_names, role_for, role_durability
    expect(h.answered).toBe(5);
    expect(h.state).toBe('done');
  });

  it('a stale child drags the parent due on the CHILD\'s clock, not the parent\'s', () => {
    const childClock = halfLifeFor('sec2-1');
    const parentClock = halfLifeFor('sec2');
    expect(childClock).toBeLessThan(parentClock);

    const age = childClock + 1; // past Roles, still inside About Me
    expect(age).toBeLessThan(parentClock);

    const a = answers({
      values: { name: 'Ada', about: 'Ops', role_names: ['a'] },
      repeatables: { roles: [{ role_name: 'Lead', role_for: 'My team', role_durability: 'current' }] },
      answeredAt: {
        name: daysAgo(1),
        about: daysAgo(1),
        role_names: daysAgo(age),
        'roles#0#role_for': daysAgo(age),
        'roles#0#role_durability': daysAgo(age),
      },
    });
    expect(healthOf(sec2Roles, a).state).toBe('due');
    expect(healthOf(sec2, a).state).toBe('due');
    expect(healthOf(sec2, a).due).toBe(3);
  });

  it('reports the most recent stamp anywhere in the section as its age', () => {
    const a = answers({
      values: { name: 'Ada', about: 'Ops' },
      answeredAt: { name: daysAgo(200), about: daysAgo(3) },
    });
    const h = healthOf(sec2, a);
    expect(h.ageDays).toBe(3);
    expect(h.elapsed).toEqual({ value: 3, unit: 'day' });
  });

  it('turns a long age into human-scale copy', () => {
    const a = answers({ values: { voice: 'plain' }, answeredAt: { voice: daysAgo(210) } });
    expect(healthOf(sec6, a).elapsed).toEqual({ value: 7, unit: 'month' });
  });
});

describe('sectionHealthMap', () => {
  it('keys every node, children included, in one walk', () => {
    const map = sectionHealthMap(outline, modules, answers(), null, NOW);
    expect(Object.keys(map).sort()).toEqual(['sec2', 'sec2-1', 'sec3', 'sec6']);
  });

  it('never mutates the answers it reads', () => {
    const a = answers({ values: { name: 'Ada' }, answeredAt: { name: daysAgo(1) } });
    const before = JSON.stringify(a);
    sectionHealthMap(outline, modules, a, 'name', NOW);
    expect(JSON.stringify(a)).toBe(before);
  });
});

describe('the summary across the top', () => {
  it('counts top-level sections only, so it agrees with the rows above it', () => {
    const a = answers({
      values: { name: 'Ada', voice: 'plain' },
      answeredAt: { name: daysAgo(1), voice: daysAgo(1) },
    });
    const map = sectionHealthMap(outline, modules, a, null, NOW);
    const summary = summariseSectionHealth(outline, map);
    expect(summary.partly + summary.done + summary.due + summary.here + summary.notYet).toBe(outline.length);
    expect(summary.done).toBe(1); // 6. How I Communicate
    expect(summary.partly).toBe(1); // 2. About Me
    expect(summary.notYet).toBe(1); // 3. My World
    expect(summary.needsAttention).toBe(1);
  });

  it('is all not-yet on a file nobody has touched', () => {
    const map = sectionHealthMap(outline, modules, answers(), null, NOW);
    const summary = summariseSectionHealth(outline, map);
    expect(summary.notYet).toBe(outline.length);
    expect(summary.needsAttention).toBe(0);
  });
});

/**
 * V1.6 VB-33. One ratio of two counts the row already prints — see the long
 * note over `sectionCompletionPercent` for why that is a real metric and not
 * the composite score docs/GUARDRAILS.md rules out.
 */
describe('the completion percentage', () => {
  const at = (answered: number, total: number) => sectionCompletionPercent({ answered, total });

  it('is the plain ratio of answered to total', () => {
    expect(at(1, 2)).toBe(50);
    expect(at(3, 4)).toBe(75);
    expect(at(7, 13)).toBe(54);
  });

  it('reads 100 only when the section is genuinely finished', () => {
    expect(at(8, 8)).toBe(100);
    // 299 of 300 rounds to 100 and must not: one question is still unanswered.
    expect(at(299, 300)).toBe(99);
  });

  it('reads 0 only when nothing at all is answered', () => {
    expect(at(0, 6)).toBe(0);
    // 1 of 300 rounds to 0 and must not: something really was answered.
    expect(at(1, 300)).toBe(1);
  });

  it('is null when the section asks nothing — 0% of nothing is not a fact', () => {
    expect(at(0, 0)).toBeNull();
  });

  it('agrees with the count printed beside it, and a skip is not an answer', () => {
    // 3. My World asks its gate plus the two fields the open block holds once
    // the gate says yes. One answered, one skipped, one never reached.
    const a = answers({
      values: { things_gate: 'yes' },
      repeatables: { things: [{ thing_name: null }] },
      answeredAt: { things_gate: daysAgo(1), 'things#0#thing_name': daysAgo(1) },
    });
    const h = healthOf(sec3, a);
    expect(h.total).toBe(3);
    expect(h.answered).toBe(1);
    expect(h.skipped).toBe(1);
    // 1 of 3 — the skipped one is not in the file, so it is not in the number.
    expect(sectionCompletionPercent(h)).toBe(33);
  });

  it('is never rolled up into a file-level number — sections stay counted, not scored', () => {
    const map = sectionHealthMap(contextOutline, contextModules, answers(), null, NOW);
    const summary = summariseSectionHealth(contextOutline, map);
    // The summary is counts of sections. Nothing in it is a percentage.
    for (const value of Object.values(summary)) expect(Number.isInteger(value)).toBe(true);
    expect(summary.notYet).toBe(contextOutline.length);
  });
});

describe('against the real ported flow', () => {
  const empty = answers();

  it('gives every real section a health, and starts them all at not yet', () => {
    const map = sectionHealthMap(contextOutline, contextModules, empty, null, NOW);
    for (const node of contextOutline) {
      expect(map[node.id], node.id).toBeDefined();
      expect(map[node.id]!.state, node.id).toBe('not-yet');
    }
  });

  it('never reports a section with no countable questions at all', () => {
    const map = sectionHealthMap(contextOutline, contextModules, empty, null, NOW);
    for (const node of contextOutline) expect(map[node.id]!.total, node.id).toBeGreaterThan(0);
  });

  it('counts 1. About This Context as its four real questions, not its two beats', () => {
    // orientation_ready and architecture_orientation are intro steps. The
    // four that count: V2.3 VB-93's goal gate pair (a fresh interview opens
    // on them, so they count here; for a file finished before the gate
    // shipped their skipIf hides them — overrides.test.ts §5 pins that) plus
    // the section's own two.
    const map = sectionHealthMap(contextOutline, contextModules, empty, null, NOW);
    expect(map.sec1!.total).toBe(4);
  });

  /**
   * V2.0 VB-61 — THE REGRESSION THIS WHOLE TEST EXISTS TO CATCH.
   *
   * My World is a required block now. Somebody who declined it UNDER THE OLD
   * RULE finished their file legitimately, and docs/GUARDRAILS.md's
   * degradation table makes that finished state ours to protect: they must not
   * open the panel the morning after an update and find the file incomplete
   * with no action of their own in between.
   *
   * `core/flow/overrides.ts` protects it by KEEPING the ported gate — asked of
   * nobody new, kept for everybody who already answered it — rather than
   * retyping it into a framing beat. The difference is exactly these numbers:
   * an intro is not a countable question, so retyping would have left this
   * section printing "0 of 0", dropping out of `sectionLife`'s lit state and
   * taking the finished file's unified glow with it. Keeping the question
   * leaves the section reading 1 of 1, done — byte for byte what it read
   * before the update, which is the point.
   */
  it('keeps 3. My World finished, and unchanged, for a file that said no under the old rule', () => {
    const a = answers({ values: { entities_gate: 'no' }, answeredAt: { entities_gate: daysAgo(1) } });
    const map = sectionHealthMap(contextOutline, contextModules, a, null, NOW);
    expect(map.sec3!.total).toBe(1);
    expect(map.sec3!.answered).toBe(1);
    expect(map.sec3!.state).toBe('done');
  });

  it('asks four questions in 3. My World for a file with no such answer stored', () => {
    // The other half of the same rule: nobody new can decline, so the block is
    // in the interview from the first question — one item, four questions.
    const map = sectionHealthMap(contextOutline, contextModules, empty, null, NOW);
    expect(map.sec3!.total).toBe(4);
    expect(map.sec3!.state).toBe('not-yet');
  });

  it('puts the section holding the live question into here, and only that one', () => {
    const map = sectionHealthMap(contextOutline, contextModules, empty, 'voice_directness', NOW);
    const here = contextOutline.filter((node) => map[node.id]!.state === 'here');
    expect(here.map((node) => node.id)).toEqual(['sec6']);
  });

  it('answers nothing and stores nothing — the map is a pure fold', () => {
    const a = answers({ values: { preferred_name: 'Ada' }, answeredAt: { preferred_name: daysAgo(400) } });
    const first = sectionHealthMap(contextOutline, contextModules, a, null, NOW);
    const second = sectionHealthMap(contextOutline, contextModules, a, null, NOW);
    expect(first).toEqual(second);
  });
});
