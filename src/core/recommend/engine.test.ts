import { describe, it, expect } from 'vitest';
import {
  ENTITIES_BLOCK_ID,
  ENTITIES_GATE_ID,
  HOME_RECOMMENDATION_LIMIT,
  INITIATIVES_BLOCK_ID,
  INITIATIVES_GATE_ID,
  INITIATIVE_SUCCESS_ID,
  recommend,
  recommendationsByNode,
  recommendationsForNode,
  topRecommendations,
} from './engine';
import { dismiss, NO_DISMISSALS } from './dismissals';
import { RECOMMENDATION_WEIGHT } from './weights';
import { contextModules, contextOutline } from '../flow/flow';
import { DUE_AFTER_DAYS } from '../freshness/clocks';
import { halfLifeFor } from '../freshness/halfLives';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY, ROLE_NAME_SEED_FIELD } from '../freshness/nextMove';
import type { AnswerValue, FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';

/**
 * V1.5 VB-28. Two layers, matching core/freshness/sectionHealth.test.ts:
 *
 * 1. A tiny synthetic flow where every boundary is visible in this file — the
 *    silence gate, the stale boundary to the day, the parent/child rule, one
 *    recommendation per node, and dismissal.
 * 2. The REAL ported flow and outline, so the shapes this actually ships
 *    against (the seeded `roles` block, the two gates, the `entities` and
 *    `initiatives_records` blocks) are asserted rather than assumed.
 *
 * `now` is injected everywhere. Nothing here depends on the day it runs.
 */

const NOW = new Date('2026-08-23T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString();

// ────────────────────────────────────────────────── layer 1: synthetic flow

function step(id: string, over: Partial<Step> = {}): Step {
  return { id, module: 1, section: 0, eyebrow: 'E', q: 'Q?', kind: 'text', key: id, ...over };
}

const seededBlock: RepeatableBlock = {
  id: ROLES_BLOCK_ID,
  seedFrom: { questionId: 'role_names', seedField: ROLE_NAME_SEED_FIELD },
  addAnotherPrompt: '',
  fields: [step('role_for'), step(ROLE_DURABILITY_KEY, { kind: 'chips' })],
};

const openBlock: RepeatableBlock = {
  id: 'things',
  skipIf: (ctx) => ctx.answers.things_gate !== 'yes',
  addAnotherPrompt: 'Another?',
  fields: [step('thing_name'), step('thing_why')],
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

/** Real section ids, so `halfLifeFor` gives the real clocks: sec2 = 365,
 * sec2-1 = 182, sec3 = 120, sec6 = 730. */
const outline: FileOutlineNode[] = [
  {
    id: 'sec2',
    label: '2. About Me',
    questionIds: ['beat', 'name', 'about'],
    children: [
      { id: 'sec2-1', label: '2.1 Roles', questionIds: ['role_names', 'role_for', ROLE_DURABILITY_KEY] },
    ],
  },
  { id: 'sec3', label: '3. My World', questionIds: ['things_gate', 'thing_name', 'thing_why'] },
  { id: 'sec6', label: '6. How I Communicate', questionIds: ['voice'] },
];

interface BuildOptions {
  /** id -> how many days ago it was answered. Anything unlisted is today. */
  ages?: Record<string, number>;
  /** ids answered `null` — asked, and passed on. */
  passedOn?: string[];
  durability?: AnswerValue;
}

/** A finished synthetic file: every question the flow would really ask is
 * answered, `things_gate` says no so the open block is never asked. */
function synthetic({ ages = {}, passedOn = [], durability = 'current' }: BuildOptions = {}): Answers {
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const at = (id: string) => daysAgo(ages[id] ?? 0);
  const put = (id: string, value: AnswerValue) => {
    values[id] = passedOn.includes(id) ? null : value;
    answeredAt[id] = at(id);
  };

  put('beat', null);
  put('name', 'Ada');
  put('about', 'I run reporting.');
  put('role_names', ['a']);
  put('things_gate', 'no');
  put('voice', 'Direct.');

  const role: Record<string, AnswerValue> = {
    [ROLE_NAME_SEED_FIELD]: 'My employer',
    role_for: 'My employer',
    [ROLE_DURABILITY_KEY]: durability,
  };
  answeredAt[`${ROLES_BLOCK_ID}#0#role_for`] = at('role_for');
  answeredAt[`${ROLES_BLOCK_ID}#0#${ROLE_DURABILITY_KEY}`] = at(ROLE_DURABILITY_KEY);

  return { values, repeatables: { [ROLES_BLOCK_ID]: [role] }, answeredAt, reflectedAt: {} };
}

const run = (answers: Answers, over: Partial<Parameters<typeof recommend>[0]> = {}) =>
  recommend({ answers, now: NOW, outline, modules, ...over });

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

describe('silence — nothing to say is a real answer', () => {
  it('an empty file gets nothing at all', () => {
    // Somebody who has answered nothing is not behind on anything. The
    // welcome screen already has the one thing to do.
    expect(run(EMPTY)).toEqual([]);
  });

  it('a half-answered file gets nothing — the next question is the next move', () => {
    const partial = synthetic();
    delete partial.values.voice;
    delete partial.answeredAt.voice;
    expect(run(partial)).toEqual([]);
  });

  it('stays silent even when a half-answered file already holds something stale', () => {
    // The strongest form of the rule: there IS a real stale answer here, and
    // the engine still says nothing, because listing gaps to somebody who has
    // not finished is the "absence as failure" framing VB-28 rules out.
    const partial = synthetic({ ages: { voice: 9999, name: 9999, about: 9999 } });
    delete partial.values.about;
    delete partial.answeredAt.about;
    expect(run(partial)).toEqual([]);
  });

  it('A FINISHED, FRESH FILE GETS NOTHING — the case that proves this is not a nag machine', () => {
    expect(run(synthetic())).toEqual([]);
  });
});

describe('a section past its own half-life', () => {
  const clock = halfLifeFor('sec6'); // 730

  it('fires on the day the clock runs out, not the day after', () => {
    const recs = run(synthetic({ ages: { voice: clock } }));
    expect(recs).toHaveLength(1);
    expect(recs[0]!.kind).toBe('section-stale');
    expect(recs[0]!.nodeId).toBe('sec6');
  });

  it('says nothing the day before', () => {
    expect(run(synthetic({ ages: { voice: clock - 1 } }))).toEqual([]);
  });

  it('names the section without its file number, and how long ago', () => {
    const recs = run(synthetic({ ages: { voice: 365 * 3 } }));
    const rec = recs[0]!;
    if (rec.kind !== 'section-stale') throw new Error('expected section-stale');
    expect(rec.section).toBe('How I Communicate');
    expect(rec.elapsed).toEqual({ value: 3, unit: 'year' });
    expect(rec.target).toEqual({ in: 'top', questionId: 'voice' });
  });

  it('measures the newest answer in the section, not the oldest', () => {
    // `name` is ancient, `about` is today. 2. About Me as a whole has been
    // touched today, so it is not out of date — and saying it was would be
    // the false positive that teaches people to ignore the real ones.
    expect(run(synthetic({ ages: { name: 9999 } }))).toEqual([]);
  });

  it('ranks a section further past its clock above one only just past it', () => {
    const recs = run(synthetic({ ages: { voice: 730, things_gate: 240 } }));
    expect(recs.map((r) => r.nodeId)).toEqual(['sec3', 'sec6']);
    expect(recs[0]!.rank).toBeGreaterThan(recs[1]!.rank);
    // Both are still section-stale — urgency separates them inside the band,
    // it does not promote one out of it.
    expect(recs.every((r) => r.kind === 'section-stale')).toBe(true);
  });
});

describe('parent and child never say the same thing twice', () => {
  it('drops the parent when a child of it already spoke', () => {
    // Everything in 2. About Me and 2.1 Roles is 400 days old: past sec2's
    // 365 and past sec2-1's 182. The child is the more specific of the two.
    const ages = { name: 400, about: 400, role_names: 400, role_for: 400, role_durability: 400 };
    const recs = run(synthetic({ ages, durability: 'historical' }));
    expect(recs.map((r) => r.nodeId)).toEqual(['sec2-1']);
  });

  it('keeps the parent when no child of it is out of date', () => {
    // The only outline shape where that can happen: a child whose clock is
    // LONGER than its parent's. 2. About Me runs on 365 days, 2.5 Expertise
    // on 730, so at 400 days the parent has something to say and the child
    // genuinely does not (halfLives.ts: "expertise accrues, it does not lapse
    // on a schedule").
    const parentAndSlowChild: FileOutlineNode[] = [
      {
        id: 'sec2',
        label: '2. About Me',
        questionIds: ['beat', 'name', 'about'],
        children: [{ id: 'sec2-5', label: '2.5 Expertise', questionIds: ['voice'] }],
      },
    ];
    const answers = synthetic({ ages: { name: 400, about: 400, voice: 400 }, durability: 'historical' });
    const recs = recommend({ answers, now: NOW, outline: parentAndSlowChild, modules });
    expect(recs.map((r) => r.nodeId)).toEqual(['sec2']);
  });

  it('a parent is never out of date while anything under it is current', () => {
    // Roll-up reads the section's NEWEST answer, so one fresh sub-answer
    // makes the whole parent current. That is the property that keeps a
    // parent's sentence true whenever it is said at all.
    expect(run(synthetic({ ages: { name: 9999, about: 9999 }, durability: 'historical' }))).toEqual([]);
  });
});

describe('a role marked current that has aged out', () => {
  it('is a recommendation, carrying the role name and how long ago', () => {
    const recs = run(synthetic({ ages: { role_durability: DUE_AFTER_DAYS } }));
    const rec = recs[0]!;
    if (rec.kind !== 'role-stale') throw new Error('expected role-stale');
    expect(rec.role).toBe('My employer');
    expect(rec.nodeId).toBe('sec2-1');
    expect(rec.target).toEqual({
      in: 'repeatable',
      blockId: ROLES_BLOCK_ID,
      recordIndex: 0,
      questionId: ROLE_DURABILITY_KEY,
    });
  });

  it('never fires for a role already marked historical', () => {
    expect(run(synthetic({ ages: { role_durability: 9999 }, durability: 'historical' }))).toEqual([]);
  });

  it('wins its node when the whole section is old too — one fact, one recommendation', () => {
    const ages = { role_names: 400, role_for: 400, role_durability: 400 };
    const recs = run(synthetic({ ages }));
    expect(recs.filter((r) => r.nodeId === 'sec2-1')).toHaveLength(1);
    expect(recs[0]!.kind).toBe('role-stale');
  });
});

describe('a section every question of which was passed on', () => {
  it('is offered once, naming the section and how many questions are in it', () => {
    const recs = run(synthetic({ passedOn: ['voice'] }));
    const rec = recs[0]!;
    if (rec.kind !== 'section-empty') throw new Error('expected section-empty');
    expect(rec.section).toBe('How I Communicate');
    expect(rec.questions).toBe(1);
  });

  it('does not fire when only SOME of a section was passed on', () => {
    // One considered skip is an answer. Re-raising it one question at a time
    // would be the product arguing with a decision already made.
    expect(run(synthetic({ passedOn: ['name'] }))).toEqual([]);
  });

  it('is not also reported as out of date', () => {
    const recs = run(synthetic({ passedOn: ['voice'], ages: { voice: 9999 } }));
    expect(recs.map((r) => r.kind)).toEqual(['section-empty']);
  });
});

describe('dismissal', () => {
  const stale = synthetic({ ages: { voice: 9999 } });

  it('removes exactly the one that was hidden', () => {
    const [rec] = run(stale);
    const dismissals = dismiss(NO_DISMISSALS, rec!.id, NOW);
    expect(run(stale, { dismissals })).toEqual([]);
  });

  it('does not remove a different recommendation', () => {
    const two = synthetic({ ages: { voice: 9999, things_gate: 9999 } });
    const before = run(two);
    expect(before).toHaveLength(2);
    const dismissals = dismiss(NO_DISMISSALS, before[0]!.id, NOW);
    expect(run(two, { dismissals }).map((r) => r.id)).toEqual([before[1]!.id]);
  });

  it('uses an id that is the same on every render, so a dismissal keeps sticking', () => {
    const a = run(stale).map((r) => r.id);
    const later = recommend({ answers: stale, now: new Date(NOW.getTime() + 30 * DAY_MS), outline, modules });
    expect(later.map((r) => r.id)).toEqual(a);
  });

  it('takes the node out of the conversation rather than promoting its runner-up', () => {
    // sec4 holds an initiative with no finish line AND only one project.
    // Hiding the stronger offer must not put the weaker one in its place —
    // that is whack-a-mole, and a recommendation is meant to be quiet.
    const answers = realAnswers({ initiatives: 1 });
    answers.repeatables[INITIATIVES_BLOCK_ID]![0]![INITIATIVE_SUCCESS_ID] = null;
    const before = runReal(answers);
    expect(before.filter((r) => r.nodeId === 'sec4').map((r) => r.kind)).toEqual([
      'initiative-no-success',
    ]);
    const hidden = dismiss(NO_DISMISSALS, 'initiative-no-success:0', NOW);
    expect(runReal(answers, NOW, hidden).filter((r) => r.nodeId === 'sec4')).toEqual([]);
  });

  it('does not resurface a parent section when its child’s offer is hidden', () => {
    // Same fact at two levels of the outline. Having turned down the specific
    // one, the general one is not a second, different offer.
    const ages = { role_names: 400, role_for: 400, role_durability: 400, name: 400, about: 400 };
    const answers = synthetic({ ages, durability: 'historical' });
    const [child] = run(answers);
    expect(child!.nodeId).toBe('sec2-1');
    expect(run(answers, { dismissals: dismiss(NO_DISMISSALS, child!.id, NOW) })).toEqual([]);
  });

  it('ids carry no timestamp — a hidden offer cannot come back by ageing', () => {
    for (const rec of run(synthetic({ ages: { voice: 9999, things_gate: 9999 } }))) {
      expect(rec.id).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });
});

describe('the shape of a recommendation', () => {
  it('carries no score, no percentage, and no total', () => {
    // docs/GUARDRAILS.md: "A composite score out of 100. Real metrics only."
    // Asserted over the real object, not the type, so a stray field added at
    // runtime is caught too.
    const recs = run(synthetic({ ages: { voice: 9999, things_gate: 9999, role_durability: 9999 } }));
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      const keys = Object.keys(rec);
      expect(keys).not.toContain('score');
      expect(keys).not.toContain('percent');
      expect(keys).not.toContain('health');
      expect(keys).not.toContain('total');
      expect(keys).not.toContain('days');
    }
  });

  it('always names a node and somewhere concrete to act', () => {
    const recs = run(synthetic({ ages: { voice: 9999, things_gate: 9999, role_durability: 9999 } }));
    for (const rec of recs) {
      expect(rec.nodeId).toBeTruthy();
      expect(rec.target.questionId).toBeTruthy();
      expect(rec.id.startsWith(rec.kind)).toBe(true);
    }
  });
});

describe('taking a few rather than the whole list', () => {
  const many = synthetic({ ages: { voice: 9999, things_gate: 9999, role_durability: 9999 } });

  it('is already ranked, strongest first', () => {
    const recs = run(many);
    const ranks = recs.map((r) => r.rank);
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    expect(recs[0]!.kind).toBe('role-stale');
  });

  it('topRecommendations takes the top N and nothing else', () => {
    const recs = run(many);
    expect(topRecommendations(recs, 1)).toEqual([recs[0]]);
    expect(topRecommendations(recs, 0)).toEqual([]);
    expect(topRecommendations(recs, -3)).toEqual([]);
    expect(topRecommendations(recs, 99)).toEqual(recs);
  });

  it('Home takes three, and says so in one place', () => {
    expect(HOME_RECOMMENDATION_LIMIT).toBe(3);
    expect(topRecommendations(run(many)).length).toBeLessThanOrEqual(3);
  });

  it('groups by node for VB-27, keeping rank order inside each group', () => {
    const recs = run(many);
    const byNode = recommendationsByNode(recs);
    expect(Object.keys(byNode).sort()).toEqual([...new Set(recs.map((r) => r.nodeId))].sort());
    expect(recommendationsForNode(recs, 'sec2-1')).toEqual(byNode['sec2-1']);
    expect(recommendationsForNode(recs, 'nope')).toEqual([]);
  });
});

// ─────────────────────────────────────────────── layer 2: the real ported flow

/** A finished real file. Every question answered just now, both gates set by
 * the caller. Mirrors tests/e2e/home.spec.ts's own builder — same fixture
 * shape, so a change to the ported data breaks both together. */
function realAnswers(opts: {
  entities?: number;
  initiatives?: number;
  ageDays?: number;
  passedOn?: string[];
  durabilityAgeDays?: number;
} = {}): Answers {
  const { entities = 0, initiatives = 0, ageDays = 0, passedOn = [], durabilityAgeDays = 0 } = opts;
  const at = daysAgo(ageDays);
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;

  const answerFor = (s: Step): AnswerValue => {
    if (passedOn.includes(s.id)) return null;
    if (s.kind === 'intro') return null;
    if (s.kind === 'yesno') return 'yes';
    if (s.kind === 'chips') return s.options?.[0]?.v ?? 'x';
    if (s.kind === 'multi') return s.options?.length ? [s.options[0]!.v] : [];
    return `A test answer for ${s.id}.`;
  };

  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        // By id, not by `seedFrom`: V2.0 VB-64 added a second seeded block
        // (`audiences`), and "the last seeded block wins" would have quietly
        // built this fixture's role records into the wrong one.
        if (node.id === ROLES_BLOCK_ID) rolesBlock = node;
        continue;
      }
      const key = node.key ?? node.id;
      if (node.id === ENTITIES_GATE_ID) values[key] = entities > 0 ? 'yes' : 'no';
      else if (node.id === INITIATIVES_GATE_ID) values[key] = initiatives > 0 ? 'yes' : 'no';
      else values[key] = answerFor(node);
      if (node.id === 'role_names') roleNamesStep = node;
      answeredAt[key] = at;
      if (typeof values[key] === 'string') reflectedAt[key] = at;
    }
  }

  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    repeatables[rolesBlock.id] = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [ROLE_NAME_SEED_FIELD]: label };
      for (const field of rolesBlock!.fields) {
        record[field.key ?? field.id] =
          field.id === ROLE_DURABILITY_KEY ? 'current' : answerFor(field);
      }
      return record;
    });
    repeatables[rolesBlock.id]!.forEach((record, i) => {
      for (const key of Object.keys(record)) {
        if (key === ROLE_NAME_SEED_FIELD) continue;
        answeredAt[`${rolesBlock!.id}#${i}#${key}`] =
          key === ROLE_DURABILITY_KEY ? daysAgo(durabilityAgeDays) : at;
      }
    });
  }

  const fillBlock = (blockId: string, count: number, name: (i: number) => string) => {
    if (count === 0) return;
    const block = contextModules
      .flatMap((m) => m.nodes)
      .find((n): n is RepeatableBlock => 'fields' in n && n.id === blockId);
    if (!block) throw new Error(`no ${blockId} block in the ported data`);
    repeatables[blockId] = Array.from({ length: count }, (_, i) => {
      const record: Record<string, AnswerValue> = {};
      for (const field of block.fields) {
        const key = field.key ?? field.id;
        record[key] = field.id.endsWith('_name') ? name(i) : answerFor(field);
      }
      return record;
    });
    repeatables[blockId]!.forEach((record, i) => {
      for (const key of Object.keys(record)) answeredAt[`${blockId}#${i}#${key}`] = at;
    });
  };

  fillBlock(ENTITIES_BLOCK_ID, entities, (i) => `Person ${i + 1}`);
  fillBlock(INITIATIVES_BLOCK_ID, initiatives, (i) => `Project ${i + 1}`);

  return { values, repeatables, answeredAt, reflectedAt };
}

const runReal = (answers: Answers, now: Date = NOW, dismissals = NO_DISMISSALS) =>
  recommend({ answers, now, dismissals, outline: contextOutline, modules: contextModules });

describe('the real ported flow', () => {
  it('a finished, fresh, real file has nothing to recommend', () => {
    expect(runReal(realAnswers())).toEqual([]);
  });

  it('an empty real file has nothing to recommend', () => {
    expect(runReal(EMPTY)).toEqual([]);
  });

  it('a real file with a stale role puts that first, by name', () => {
    const recs = runReal(realAnswers({ durabilityAgeDays: DUE_AFTER_DAYS }));
    const rec = recs[0]!;
    if (rec.kind !== 'role-stale') throw new Error('expected role-stale');
    expect(rec.role).toBeTruthy();
    expect(rec.rank).toBe(RECOMMENDATION_WEIGHT['role-stale']);
  });

  it('a named project whose finish line was passed on gets its own recommendation', () => {
    const answers = realAnswers({ initiatives: 2 });
    answers.repeatables[INITIATIVES_BLOCK_ID]![1]![INITIATIVE_SUCCESS_ID] = null;
    const recs = runReal(answers);
    const rec = recs.find((r) => r.kind === 'initiative-no-success');
    if (!rec || rec.kind !== 'initiative-no-success') throw new Error('expected initiative-no-success');
    expect(rec.initiative).toBe('Project 2');
    expect(rec.target).toEqual({
      in: 'repeatable',
      blockId: INITIATIVES_BLOCK_ID,
      recordIndex: 1,
      questionId: INITIATIVE_SUCCESS_ID,
    });
  });

  it('three projects with no finish line still produce ONE offer, not three', () => {
    const answers = realAnswers({ initiatives: 3 });
    for (const record of answers.repeatables[INITIATIVES_BLOCK_ID]!) record[INITIATIVE_SUCCESS_ID] = null;
    expect(runReal(answers).filter((r) => r.kind === 'initiative-no-success')).toHaveLength(1);
  });

  it('offers a second name when exactly one person or tool is named', () => {
    const recs = runReal(realAnswers({ entities: 1 }));
    const rec = recs.find((r) => r.kind === 'entities-thin');
    if (!rec || rec.kind !== 'entities-thin') throw new Error('expected entities-thin');
    expect(rec.named).toBe(1);
    expect(rec.nodeId).toBe('sec3');
  });

  it('says nothing about it once a second is named', () => {
    expect(runReal(realAnswers({ entities: 2 })).filter((r) => r.kind === 'entities-thin')).toEqual([]);
  });

  it('never pushes back on somebody who answered "no" to the gate', () => {
    // They answered the question. Overruling that answer would be the panel
    // telling them they are wrong about their own working life.
    const recs = runReal(realAnswers({ entities: 0, initiatives: 0 }));
    expect(recs.filter((r) => r.kind === 'entities-thin' || r.kind === 'initiatives-thin')).toEqual([]);
  });

  it('offers a second project when exactly one is named', () => {
    const recs = runReal(realAnswers({ initiatives: 1 }));
    expect(recs.filter((r) => r.kind === 'initiatives-thin')).toHaveLength(1);
  });

  it('ranks a real file’s offers strongest first, with the whole list stable', () => {
    const answers = realAnswers({ entities: 1, initiatives: 1, durabilityAgeDays: DUE_AFTER_DAYS });
    answers.repeatables[INITIATIVES_BLOCK_ID]![0]![INITIATIVE_SUCCESS_ID] = null;
    const recs = runReal(answers);
    expect(recs[0]!.kind).toBe('role-stale');
    // sec4 holds both an initiative-no-success and an initiatives-thin;
    // one node, one recommendation, and the stronger of the two wins.
    expect(recs.filter((r) => r.nodeId === 'sec4')).toHaveLength(1);
    expect(recs.find((r) => r.nodeId === 'sec4')!.kind).toBe('initiative-no-success');
    expect(recs).toEqual(runReal(answers)); // same input, same list, every time
  });

  it('a real file left untouched for years is out of date section by section, not all at once', () => {
    // Two of each named thing, because V2.0 VB-61/VB-63 made both blocks
    // required: a file whose My World and Initiatives hold nothing has no
    // answers in those sections to go stale, and two apiece keeps the "one
    // where the section is built for several" offer out of the way of the
    // staleness this test is about.
    const recs = runReal(realAnswers({ ageDays: 400, durabilityAgeDays: 400, entities: 2, initiatives: 2 }));
    // Every top-level section has its own clock, and only the ones actually
    // past theirs speak. 5. How I Think (730) and 6. How I Communicate (730)
    // and 9. Context Boundaries (730) are not yet due at 400 days.
    const spoken = recs.map((r) => r.nodeId);
    expect(spoken).toContain('sec3'); // 120
    expect(spoken).toContain('sec4'); // 90
    expect(spoken).not.toContain('sec5'); // 730
    expect(spoken).not.toContain('sec6'); // 730
    expect(spoken).not.toContain('sec9'); // 730
    // Every section that spoke is genuinely past its own clock.
    for (const rec of recs) {
      if (rec.kind !== 'section-stale') continue;
      expect(400).toBeGreaterThanOrEqual(halfLifeFor(rec.nodeId));
    }
  });

  it('a section of the real file that was entirely passed on is offered back, once', () => {
    // 9. Context Boundaries is two questions and nothing else.
    const answers = realAnswers({ passedOn: ['standards_list', 'guardrails_list'] });
    const recs = runReal(answers).filter((r) => r.nodeId === 'sec9');
    expect(recs).toHaveLength(1);
    const rec = recs[0]!;
    if (rec.kind !== 'section-empty') throw new Error('expected section-empty');
    expect(rec.section).toBe('Context Boundaries');
    expect(rec.questions).toBe(2);
  });

  it('works with no arguments beyond answers and a clock — the real data is the default', () => {
    expect(recommend({ answers: realAnswers(), now: NOW })).toEqual([]);
    expect(recommend({ answers: realAnswers({ entities: 1 }), now: NOW }).length).toBeGreaterThan(0);
  });
});
