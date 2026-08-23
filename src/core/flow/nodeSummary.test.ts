import { describe, it, expect } from 'vitest';
import type { FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import type { SectionHealth } from '../freshness/sectionHealth';
import { sectionHealthMap } from '../freshness/sectionHealth';
import { contextModules, contextOutline } from './flow';
import { CATEGORY_LIMIT, nodeSummaries, nodeSummaryFor } from './nodeSummary';

/**
 * V1.5 VB-27.
 *
 * Two layers, the same way nodeDetails.test.ts is built. The synthetic fixture
 * owns the RULES — what counts as an item, how categories are tallied and
 * ordered, what is deliberately never in here — because a rule is easier to
 * state against four questions than against forty-nine. The real outline then
 * owns the SHAPE: `2.1 Roles` with three roles is the node the floating summary
 * was laid out against, and a fixture cannot prove anything about the content
 * the panel actually has to hold.
 */

// ---------------------------------------------------------------------
// Synthetic fixture
// ---------------------------------------------------------------------

const nameStep: Step = { id: 'name', module: 1, section: 1, eyebrow: 'E', q: 'Name?', kind: 'text' };
const hatsStep: Step = {
  id: 'hats',
  module: 1,
  section: 2,
  eyebrow: 'E',
  q: 'Hats?',
  kind: 'multi',
  options: [
    { v: 'lead', l: 'Team lead' },
    { v: 'ic', l: 'Individual contributor' },
  ],
};

/** A `Phrase` given as a function, like every prompt in the ported flow — so
 * `categoryBy` is proved to resolve rather than to stringify a function. */
const roleForStep: Step = {
  id: 'role_for',
  module: 1,
  section: 2,
  eyebrow: 'E',
  q: () => 'Who or what is this role for?',
  kind: 'chips',
  options: [
    { v: 'employer', l: 'My employer' },
    { v: 'clients', l: 'Clients' },
    { v: 'family', l: 'My family' },
    { v: 'community', l: 'My community' },
    { v: 'myself', l: 'Myself' },
  ],
};

const rolesBlock: RepeatableBlock = {
  id: 'roles',
  seedFrom: { questionId: 'hats', seedField: 'role_name' },
  addAnotherPrompt: '',
  fields: [
    roleForStep,
    { id: 'role_mandate', module: 1, section: 2, eyebrow: 'E', q: 'Mandate?', kind: 'text' },
    {
      id: 'role_standing',
      module: 1,
      section: 2,
      eyebrow: 'E',
      q: 'Standing?',
      kind: 'chips',
      options: [{ v: 'primary', l: 'Primary' }],
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
    nodes: [nameStep, hatsStep, rolesBlock],
  },
];

const outline: FileOutlineNode[] = [
  {
    id: 'secA',
    label: 'A. About',
    questionIds: ['name'],
    children: [{ id: 'secA-1', label: 'A.1 Roles', questionIds: ['hats', 'role_for', 'role_mandate', 'role_standing'] }],
  },
];

const secA = outline[0]!;
const secA1 = secA.children![0]!;

const answersOf = (partial: Partial<Pick<Answers, 'values' | 'repeatables'>>) => ({
  values: partial.values ?? {},
  repeatables: partial.repeatables ?? {},
});

/** A `SectionHealth`, built by hand so a test states the counts it is about
 * rather than deriving them somewhere else and asserting the derivation. */
const healthOf = (partial: Partial<SectionHealth>): SectionHealth => ({
  id: 'secA-1',
  state: 'done',
  total: 0,
  answered: 0,
  skipped: 0,
  left: 0,
  due: 0,
  lastAnsweredAt: null,
  ageDays: null,
  elapsed: null,
  halfLifeDays: 182,
  ...partial,
});

const threeRoles = answersOf({
  values: { hats: ['lead', 'ic'] },
  repeatables: {
    roles: [
      { role_name: 'Team lead', role_for: 'employer', role_mandate: 'Keep reporting trusted.', role_standing: 'primary' },
      { role_name: 'Coach', role_for: 'community', role_mandate: 'Run Saturday practice.', role_standing: 'primary' },
      { role_name: 'Consultant', role_for: 'employer', role_mandate: 'Advise on rollouts.', role_standing: 'primary' },
    ],
  },
});

// ---------------------------------------------------------------------

describe('nodeSummaryFor — nothing to summarise', () => {
  it('is null for a node with no records and nothing answered', () => {
    expect(nodeSummaryFor(secA1, answersOf({}), healthOf({ total: 4 }), modules)).toBeNull();
  });

  it('is null with no health at all and no records — the gate is items, not health', () => {
    expect(nodeSummaryFor(secA1, answersOf({}), undefined, modules)).toBeNull();
  });

  it('is null for a node whose every question was passed on — a skip is not an item', () => {
    const summary = nodeSummaryFor(secA, answersOf({ values: { name: null } }), healthOf({ total: 1, skipped: 1 }), modules);
    expect(summary).toBeNull();
  });
});

describe('nodeSummaryFor — items', () => {
  it('counts a node\'s records, and says they are records', () => {
    const summary = nodeSummaryFor(secA1, threeRoles, healthOf({ total: 9, answered: 9 }), modules)!;
    expect(summary.items).toBe(3);
    expect(summary.itemKind).toBe('record');
  });

  it('counts answered questions where a node holds no records', () => {
    const summary = nodeSummaryFor(secA, answersOf({ values: { name: 'Ada' } }), healthOf({ total: 1, answered: 1 }), modules)!;
    expect(summary.items).toBe(1);
    expect(summary.itemKind).toBe('answer');
  });

  it('carries the file\'s own name for the node, not a shortened one', () => {
    const summary = nodeSummaryFor(secA1, threeRoles, healthOf({}), modules)!;
    expect(summary.label).toBe('A.1 Roles');
    expect(summary.nodeId).toBe('secA-1');
  });
});

describe('nodeSummaryFor — categories', () => {
  it('groups records by the block\'s first single select, biggest first', () => {
    const summary = nodeSummaryFor(secA1, threeRoles, healthOf({}), modules)!;
    expect(summary.categories).toEqual([
      { label: 'My employer', count: 2 },
      { label: 'My community', count: 1 },
    ]);
    expect(summary.categoriesHidden).toBe(0);
  });

  it('says what the categories are, in the question\'s own resolved words', () => {
    const summary = nodeSummaryFor(secA1, threeRoles, healthOf({}), modules)!;
    expect(summary.categoryBy).toBe('Who or what is this role for?');
  });

  it('spells a category exactly as the generated file spells it', () => {
    // Stored as `employer`; the file prints the option's label. One resolver,
    // so the panel and the file can never disagree about one answer.
    const summary = nodeSummaryFor(secA1, threeRoles, healthOf({}), modules)!;
    expect(summary.categories.map((c) => c.label)).not.toContain('employer');
  });

  it('breaks a tie alphabetically, so the order is the same on every render', () => {
    const answers = answersOf({
      repeatables: {
        roles: [
          { role_name: 'One', role_for: 'myself' },
          { role_name: 'Two', role_for: 'clients' },
        ],
      },
    });
    const summary = nodeSummaryFor(secA1, answers, healthOf({}), modules)!;
    expect(summary.categories.map((c) => c.label)).toEqual(['Clients', 'Myself']);
  });

  it('never invents an "unanswered" bucket — a record with nothing there is simply not counted', () => {
    const answers = answersOf({
      repeatables: {
        roles: [
          { role_name: 'One', role_for: 'employer' },
          { role_name: 'Two' },
          { role_name: 'Three', role_for: null },
        ],
      },
    });
    const summary = nodeSummaryFor(secA1, answers, healthOf({}), modules)!;
    expect(summary.items).toBe(3);
    expect(summary.categories).toEqual([{ label: 'My employer', count: 1 }]);
  });

  it('caps the list and says how many are left over rather than under-reporting', () => {
    const answers = answersOf({
      repeatables: {
        roles: [
          { role_name: 'a', role_for: 'employer' },
          { role_name: 'b', role_for: 'clients' },
          { role_name: 'c', role_for: 'family' },
          { role_name: 'd', role_for: 'community' },
          { role_name: 'e', role_for: 'myself' },
        ],
      },
    });
    const summary = nodeSummaryFor(secA1, answers, healthOf({}), modules)!;
    expect(summary.categories).toHaveLength(CATEGORY_LIMIT);
    expect(summary.categoriesHidden).toBe(1);
  });

  it('has no categories where a node holds no records — it never re-lists an answer\'s own text', () => {
    // `hats` is a multi-select sitting in this node and IS a list of kinds the
    // person picked. It is deliberately not shown: the summary carries counts,
    // and the answers themselves are the detail panel's job (nodeDetails.ts).
    const answers = answersOf({ values: { hats: ['lead', 'ic'] } });
    const summary = nodeSummaryFor(secA1, answers, healthOf({ total: 4, answered: 1 }), modules)!;
    expect(summary.items).toBe(1);
    expect(summary.categories).toEqual([]);
    expect(summary.categoryBy).toBe('');
    expect(JSON.stringify(summary)).not.toContain('Team lead');
  });
});

describe('nodeSummaryFor — real metrics, carried and never re-derived', () => {
  it('passes the health\'s own counts and date through untouched', () => {
    const health = healthOf({ total: 9, answered: 8, skipped: 1, ageDays: 96, elapsed: { value: 3, unit: 'month' } });
    const summary = nodeSummaryFor(secA1, threeRoles, health, modules)!;
    expect(summary.answered).toBe(8);
    expect(summary.total).toBe(9);
    expect(summary.skipped).toBe(1);
    expect(summary.ageDays).toBe(96);
    expect(summary.elapsed).toEqual({ value: 3, unit: 'month' });
  });

  it('reports zeroes rather than guessing when the caller has no health for the node', () => {
    const summary = nodeSummaryFor(secA1, threeRoles, undefined, modules)!;
    expect(summary.items).toBe(3);
    expect(summary).toMatchObject({ answered: 0, total: 0, skipped: 0, ageDays: null, elapsed: null });
  });

  /**
   * docs/GUARDRAILS.md: "A composite score out of 100. Real metrics only."
   * The shape is asserted whole, so a percentage cannot arrive here quietly —
   * the same guard core/recommend/types.ts keeps over its own.
   */
  it('has no score, no percentage, and nowhere to put one', () => {
    const summary = nodeSummaryFor(secA1, threeRoles, healthOf({ total: 9, answered: 9 }), modules)!;
    expect(Object.keys(summary).sort()).toEqual([
      'ageDays',
      'answered',
      'categories',
      'categoriesHidden',
      'categoryBy',
      'elapsed',
      'itemKind',
      'items',
      'label',
      'nodeId',
      'skipped',
      'total',
    ]);
  });
});

describe('nodeSummaries — the whole outline at once', () => {
  it('keys by node id, children included', () => {
    const health = { secA: healthOf({ id: 'secA', total: 1, answered: 1 }), 'secA-1': healthOf({ total: 9, answered: 9 }) };
    const summaries = nodeSummaries(outline, { ...threeRoles, values: { ...threeRoles.values, name: 'Ada' } }, health, modules);
    expect(Object.keys(summaries).sort()).toEqual(['secA', 'secA-1']);
    expect(summaries['secA-1']!.items).toBe(3);
  });

  it('leaves a node with nothing in it OUT of the map, so `id in summaries` means "has items"', () => {
    const summaries = nodeSummaries(outline, answersOf({}), {}, modules);
    expect(summaries).toEqual({});
  });
});

// ---------------------------------------------------------------------
// The real file
// ---------------------------------------------------------------------

describe('nodeSummaryFor — the shipped outline', () => {
  const NOW = new Date('2026-08-23T12:00:00.000Z');
  const realRoles: Answers = {
    values: { preferred_name: 'Ada', role_names: ['manager', 'volunteer-board', 'freelancer'] },
    repeatables: {
      roles: [
        { role_name: 'Manager / Team Lead', role_for: 'employer', role_standing: 'primary', role_durability: 'current' },
        { role_name: 'Volunteer / Board Member', role_for: 'community', role_standing: 'occasional', role_durability: 'current' },
        { role_name: 'Freelancer / Contractor', role_for: 'clients', role_standing: 'secondary', role_durability: 'historical' },
      ],
    },
    answeredAt: { role_names: '2026-06-23T12:00:00.000Z' },
    reflectedAt: {},
  };

  const rolesNode = contextOutline.find((n) => n.id === 'sec2')!.children!.find((n) => n.id === 'sec2-1')!;

  it('summarises 2.1 Roles as three roles, grouped by who each one is for', () => {
    const health = sectionHealthMap(contextOutline, contextModules, realRoles, null, NOW);
    const summary = nodeSummaryFor(rolesNode, realRoles, health['sec2-1'], contextModules)!;
    expect(summary.label).toBe('2.1 Roles');
    expect(summary.items).toBe(3);
    expect(summary.itemKind).toBe('record');
    expect(summary.categoryBy).toBe('Who or what is this role for?');
    expect(summary.categories).toEqual([
      { label: 'Clients', count: 1 },
      { label: 'My community', count: 1 },
      { label: 'My employer', count: 1 },
    ]);
  });

  it('carries the same counts VB-19\'s own section health carries for that node', () => {
    const health = sectionHealthMap(contextOutline, contextModules, realRoles, null, NOW)['sec2-1']!;
    const summary = nodeSummaryFor(rolesNode, realRoles, health, contextModules)!;
    expect(summary.answered).toBe(health.answered);
    expect(summary.total).toBe(health.total);
    expect(summary.answered).toBeLessThan(summary.total); // three roles, mandates unanswered
  });

  it('every sub-section of 2. About Me is summarised once answered, and none before', () => {
    const health = sectionHealthMap(contextOutline, contextModules, realRoles, null, NOW);
    const summaries = nodeSummaries(contextOutline, realRoles, health, contextModules);
    expect(summaries['sec2-1']).toBeDefined();
    // Nothing has been answered in 2.2–2.5 yet, so there is nothing to show —
    // and the panel draws no floating summary there at all.
    for (const id of ['sec2-2', 'sec2-3', 'sec2-4', 'sec2-5']) expect(summaries[id]).toBeUndefined();
  });
});
