import { describe, it, expect } from 'vitest';
import type { FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { contextModules, contextOutline } from './flow';
import { SKIPPED_ANSWER_MARKER } from '../files/generate';
import type { NodeDetail } from './nodeDetails';
import { nodeDetails, nodeDetailsByNode } from './nodeDetails';

/**
 * V1.4 VB-23.
 *
 * Two layers, deliberately. The synthetic fixture below owns the rules —
 * grouping, skipping, flattening, what counts as wide — because a rule is
 * easier to state against four questions than against forty-nine. The real
 * outline then owns the *shape*: `2.1 Roles` with three records is the panel's
 * stress case (docs/V1.4-REFINEMENT.md's VB-23), and asserting it against a
 * fixture would prove nothing about the content the panel actually has to hold.
 */

// ---------------------------------------------------------------------
// Synthetic fixture, in the style of outline.test.ts's.
// ---------------------------------------------------------------------

const introStep: Step = { id: 'intro1', module: 1, section: 0, eyebrow: 'E', q: 'Hi', kind: 'intro' };
const nameStep: Step = { id: 'name', module: 1, section: 1, eyebrow: 'E', q: 'Name?', kind: 'text', key: 'name' };
const aboutStep: Step = {
  id: 'about',
  module: 1,
  section: 1,
  eyebrow: 'E',
  q: 'In a sentence or two, what do you actually do all day?',
  kind: 'text',
  multiline: true,
};
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
const gateStep: Step = { id: 'gate', module: 1, section: 3, eyebrow: 'E', q: 'Any of these?', kind: 'yesno' };
const skippedStep: Step = { id: 'peeves', module: 1, section: 1, eyebrow: 'E', q: 'Peeves?', kind: 'text' };

const rolesBlock: RepeatableBlock = {
  id: 'roles',
  seedFrom: { questionId: 'hats', seedField: 'role_name' },
  addAnotherPrompt: '',
  fields: [
    {
      id: 'role_for',
      module: 1,
      section: 2,
      eyebrow: 'E',
      q: 'For?',
      kind: 'chips',
      options: [{ v: 'employer', l: 'My employer' }],
    },
    { id: 'role_mandate', module: 1, section: 2, eyebrow: 'E', q: 'Mandate?', kind: 'text' },
  ],
};
const entitiesBlock: RepeatableBlock = {
  id: 'entities',
  addAnotherPrompt: 'Another?',
  fields: [
    { id: 'entity_name', module: 1, section: 3, eyebrow: 'E', q: 'Who?', kind: 'text' },
    { id: 'entity_type', module: 1, section: 3, eyebrow: 'E', q: 'Kind?', kind: 'text' },
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
    nodes: [introStep, nameStep, aboutStep, skippedStep, hatsStep, rolesBlock, gateStep, entitiesBlock],
  },
];

const outline: FileOutlineNode[] = [
  {
    id: 'secA',
    label: 'A. About',
    questionIds: ['intro1', 'name', 'about', 'peeves'],
    children: [{ id: 'secA-1', label: 'A.1 Roles', questionIds: ['hats', 'role_for', 'role_mandate'] }],
  },
  { id: 'secB', label: 'B. World', questionIds: ['gate', 'entity_name', 'entity_type'] },
];

const secA = outline[0]!;
const secA1 = secA.children![0]!;
const secB = outline[1]!;

const answersOf = (partial: Partial<Pick<Answers, 'values' | 'repeatables'>>) => ({
  values: partial.values ?? {},
  repeatables: partial.repeatables ?? {},
});

describe('nodeDetails — a section\'s own answers', () => {
  it('is empty for a section nothing has been answered in — no blank cells', () => {
    expect(nodeDetails(secA, answersOf({}), modules)).toEqual([]);
  });

  it('gives a cell per answered question, labelled with the question that was asked', () => {
    // Two, because one on its own is widened to fill the row — see the
    // pairing rule further down.
    const details = nodeDetails(secA, answersOf({ values: { name: 'Ada', peeves: 'Jargon' } }), modules);
    expect(details).toEqual([
      { group: '', label: 'Name?', value: 'Ada', wide: false },
      { group: '', label: 'Peeves?', value: 'Jargon', wide: false },
    ]);
  });

  it('never shows a gate or a narrative beat — they are not content, and the file omits them too', () => {
    const details = nodeDetails(secB, answersOf({ values: { gate: 'yes' } }), modules);
    expect(details).toEqual([]);
  });

  it('keeps an explicitly skipped question, carrying the file\'s own marker', () => {
    const details = nodeDetails(secA, answersOf({ values: { peeves: null } }), modules);
    expect(details).toEqual([{ group: '', label: 'Peeves?', value: SKIPPED_ANSWER_MARKER, wide: true }]);
    expect(SKIPPED_ANSWER_MARKER.length).toBeGreaterThan(24);
  });

  it('flattens a multi-select to one line, resolving each option to its own label', () => {
    const details = nodeDetails(secA1, answersOf({ values: { hats: ['lead', 'ic'] } }), modules);
    expect(details[0]!.value).toBe('Team lead, Individual contributor');
  });

  it('flattens a typed paragraph with spaces, not commas — a comma join would invent a list', () => {
    const details = nodeDetails(secA, answersOf({ values: { about: 'I run reporting.\nI also coach.' } }), modules);
    expect(details[0]!.value).toBe('I run reporting. I also coach.');
  });
});

describe('nodeDetails — records', () => {
  const withRoles = answersOf({
    values: { hats: ['lead', 'ic'] },
    repeatables: {
      roles: [
        { role_name: 'Team lead', role_for: 'employer', role_mandate: 'Keep the reporting trusted.' },
        { role_name: 'Coach', role_for: 'employer', role_mandate: 'Run Saturday practice.' },
      ],
    },
  });

  it('groups every record\'s cells under the same title the file prints', () => {
    const details = nodeDetails(secA1, withRoles, modules);
    expect([...new Set(details.map((d) => d.group))]).toEqual(['', 'Team lead', 'Coach']);
  });

  it('resolves a record\'s chosen option to its label, exactly as the file does', () => {
    const details = nodeDetails(secA1, withRoles, modules);
    expect(details.find((d) => d.group === 'Team lead' && d.label === 'For?')!.value).toBe('My employer');
  });

  it('never repeats a seeded record\'s title as a cell of its own', () => {
    const details = nodeDetails(secA1, withRoles, modules);
    expect(details.filter((d) => d.value === 'Team lead' && d.group === 'Team lead')).toEqual([]);
  });

  it('drops an open-ended record\'s first field, which is already its heading', () => {
    const details = nodeDetails(
      secB,
      answersOf({ repeatables: { entities: [{ entity_name: 'Acme', entity_type: 'A client' }] } }),
      modules,
    );
    expect(details.map((d) => [d.group, d.label, d.value])).toEqual([['Acme', 'Kind?', 'A client']]);
  });

  it('a record whose fields are all empty still shows, as a heading with nothing under it', () => {
    const details = nodeDetails(secA1, answersOf({ repeatables: { roles: [{ role_name: 'Team lead' }] } }), modules);
    // No cells — the renderer draws the group heading from the record, and an
    // empty record is a real state (seeded, not yet filled in).
    expect(details).toEqual([]);
  });
});

describe('nodeDetails — which cells want a whole row', () => {
  it('a short question with a short answer sits beside another', () => {
    const details = nodeDetails(secA, answersOf({ values: { name: 'Ada', peeves: 'Jargon' } }), modules);
    expect(details.map((d) => d.wide)).toEqual([false, false]);
  });

  it('a long question does NOT take the row — the answer decides, or nothing ever pairs up', () => {
    const details = nodeDetails(secA, answersOf({ values: { name: 'Ada', about: 'Reporting.' } }), modules);
    expect(details[1]!.label.length).toBeGreaterThan(40);
    expect(details[1]!.wide).toBe(false);
  });

  it('a long answer takes the row, however short the question', () => {
    const details = nodeDetails(secA, answersOf({ values: { name: 'Ada Lovelace of the Analytical Engine' } }), modules);
    expect(details[0]!.wide).toBe(true);
  });

  it('a short answer with nobody to sit beside takes the row too', () => {
    // One cell in the whole section: pairing it with nothing would leave half
    // the panel's width empty.
    const alone = nodeDetails(secA, answersOf({ values: { name: 'Ada' } }), modules);
    expect(alone[0]!.wide).toBe(true);
  });

  it('pairing is per record — a role\'s last cell never pairs with the next role\'s first', () => {
    const details = nodeDetails(
      secA1,
      answersOf({
        repeatables: {
          roles: [
            { role_name: 'One', role_for: 'employer' },
            { role_name: 'Two', role_for: 'employer' },
          ],
        },
      }),
      modules,
    );
    // Two records, one short cell each. They are in different groups and are
    // drawn under different headings, so neither may pair with the other.
    expect(details.map((d) => [d.group, d.wide])).toEqual([
      ['One', true],
      ['Two', true],
    ]);
  });
});

describe('nodeDetailsByNode', () => {
  it('walks children as well as top-level sections', () => {
    const map = nodeDetailsByNode(outline, answersOf({ values: { name: 'Ada' } }), modules);
    expect(Object.keys(map).sort()).toEqual(['secA', 'secA-1', 'secB']);
  });

  it('agrees cell for cell with nodeDetails on the same node', () => {
    const answers = answersOf({ values: { name: 'Ada', hats: ['lead'] } });
    const map = nodeDetailsByNode(outline, answers, modules);
    expect(map['secA-1']).toEqual(nodeDetails(secA1, answers, modules));
  });

  it('a parent never swallows its children\'s cells', () => {
    const map = nodeDetailsByNode(outline, answersOf({ values: { name: 'Ada', hats: ['lead'] } }), modules);
    expect(map['secA']!.map((d) => d.label)).toEqual(['Name?']);
    expect(map['secA-1']!.map((d) => d.label)).toEqual(['Hats?']);
  });
});

// ---------------------------------------------------------------------
// The real thing. 2.1 Roles with several records is the panel's stress
// case — the one the split's proportions were settled against.
// ---------------------------------------------------------------------

describe('nodeDetails — the real 2.1 Roles, with three records', () => {
  const sec2 = contextOutline.find((node) => node.id === 'sec2')!;
  const roles = sec2.children!.find((node) => node.id === 'sec2-1')!;
  const answers = {
    values: { role_names: ['manager', 'volunteer-board', 'freelancer'] },
    repeatables: {
      roles: [
        {
          role_name: 'Manager / Team Lead',
          role_for: 'employer',
          role_mandate: 'Keep the team’s reporting accurate, on time, and trusted by leadership.',
          role_standing: 'primary',
          role_durability: 'current',
        },
        {
          role_name: 'Volunteer / Board Member',
          role_for: 'community',
          role_mandate: 'Raise money and awareness for a cause I care about.',
          role_standing: 'occasional',
          role_durability: 'current',
        },
        {
          role_name: 'Freelancer / Contractor',
          role_for: 'clients',
          role_mandate: 'Deliver design work clients are happy to pay for again.',
          role_standing: 'secondary',
          role_durability: 'historical',
        },
      ],
    },
  };

  it('is three groups plus the section\'s own answer, in file order', () => {
    const details = nodeDetails(roles, answers);
    expect(details.filter((d) => d.group === '').map((d) => d.value)).toEqual([
      'Manager / Team Lead, Volunteer / Board Member, Freelancer / Contractor',
    ]);
    expect([...new Set(details.map((d) => d.group))]).toEqual([
      '',
      'Manager / Team Lead',
      'Volunteer / Board Member',
      'Freelancer / Contractor',
    ]);
  });

  it('is thirteen cells — the number the split panel has to hold at once', () => {
    // One seed answer + three records × four fields. If the outline or the
    // roles block ever changes shape, this number moves and the proportions
    // in BrainGlobe.css want another look.
    expect(nodeDetails(roles, answers)).toHaveLength(13);
  });

  it('speaks in labels, never in stored keys — nothing reads "employer" or "primary"', () => {
    const values = nodeDetails(roles, answers).map((d) => d.value);
    expect(values).toContain('My employer');
    expect(values).toContain('Primary');
    expect(values).toContain('Historical');
    for (const value of values) expect(value).not.toMatch(/^(employer|clients|community|primary|current)$/);
  });

  it('pairs the short answers up, in pairs, with no half-empty rows', () => {
    const details = nodeDetails(roles, answers);
    // Every record ends "Primary / Current" — two short cells side by side.
    // If this ever drops to zero the panel has become a list and
    // BrainGlobe.css's grid is doing nothing.
    expect(details.filter((d) => !d.wide)).toHaveLength(6);
    expect(details.filter((d) => d.wide).length).toBeGreaterThan(0);

    // And no run of paired cells is ever odd — an odd one out would leave a
    // whole column of the 400px panel showing nothing.
    let run = 0;
    for (const detail of [...details, { wide: true } as NodeDetail]) {
      if (detail.wide) {
        expect(run % 2, 'a run of paired cells was left odd').toBe(0);
        run = 0;
      } else run += 1;
    }
  });

  it('every cell carries both halves — a panel never draws an empty box', () => {
    for (const detail of nodeDetails(roles, answers)) {
      expect(detail.label.length).toBeGreaterThan(0);
      expect(detail.value.length).toBeGreaterThan(0);
      expect(detail.value).not.toContain('\n');
    }
  });

  it('every real section resolves against the real flow without throwing', () => {
    const map = nodeDetailsByNode(contextOutline, answers, contextModules);
    // Ten sections plus About Me's five children.
    expect(Object.keys(map)).toHaveLength(15);
    expect(map['sec2-1']).toHaveLength(13);
  });
});
