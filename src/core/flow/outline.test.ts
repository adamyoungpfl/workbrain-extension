import { describe, it, expect } from 'vitest';
import type { AnswerValue, FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import { contextModules, contextOutline } from './flow';
import {
  currentQuestionIdFor,
  currentSectionId,
  navigationTargetFor,
  outlineNodeCurrent,
  outlineNodeReached,
  outlineNodeState,
  positionForQuestionId,
  repeatableBlocksForNode,
} from './outline';

// ---------------------------------------------------------------------
// Synthetic fixture, in the style of runner.test.ts's: small enough to
// reason about, shaped like the real outline (a nested section, a section
// fed by a repeatable, a section nothing touches).
// ---------------------------------------------------------------------

const introStep: Step = { id: 'intro1', module: 1, section: 0, eyebrow: 'E', q: 'Hi', kind: 'intro' };
const nameStep: Step = { id: 'name', module: 1, section: 1, eyebrow: 'E', q: 'Name?', kind: 'text', key: 'name' };
const rolesSeedStep: Step = {
  id: 'role_names',
  module: 1,
  section: 2,
  eyebrow: 'E',
  q: 'Roles?',
  kind: 'multi',
  key: 'role_names',
  options: [
    { v: 'lead', l: 'Team lead' },
    { v: 'ic', l: 'Individual contributor' },
  ],
};
const gateStep: Step = { id: 'gate', module: 1, section: 3, eyebrow: 'E', q: 'Gate?', kind: 'yesno', key: 'gate' };
const laterStep: Step = { id: 'later', module: 1, section: 4, eyebrow: 'E', q: 'Later?', kind: 'text', key: 'later' };

const rolesBlock: RepeatableBlock = {
  id: 'roles',
  seedFrom: { questionId: 'role_names', seedField: 'role_name' },
  addAnotherPrompt: '',
  fields: [
    { id: 'role_for', module: 1, section: 2, eyebrow: 'E', q: 'For whom?', kind: 'text', key: 'role_for' },
    { id: 'role_mandate', module: 1, section: 2, eyebrow: 'E', q: 'Mandate?', kind: 'text', key: 'role_mandate' },
  ],
};
const entitiesBlock: RepeatableBlock = {
  id: 'entities',
  addAnotherPrompt: 'Another?',
  fields: [
    { id: 'entity_name', module: 1, section: 3, eyebrow: 'E', q: 'Who?', kind: 'text', key: 'entity_name' },
    { id: 'entity_type', module: 1, section: 3, eyebrow: 'E', q: 'What kind?', kind: 'text', key: 'entity_type' },
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
    nodes: [introStep, nameStep, rolesSeedStep, rolesBlock, gateStep, entitiesBlock, laterStep],
  },
];

const outline: FileOutlineNode[] = [
  {
    id: 'secA',
    label: 'A. About',
    questionIds: ['intro1', 'name'],
    children: [{ id: 'secA-1', label: 'A.1 Roles', questionIds: ['role_names', 'role_for', 'role_mandate'] }],
  },
  { id: 'secB', label: 'B. World', questionIds: ['gate', 'entity_name', 'entity_type'] },
  { id: 'secC', label: 'C. Later', questionIds: ['later'] },
];

const secA = outline[0]!;
const secA1 = secA.children![0]!;
const secB = outline[1]!;
const secC = outline[2]!;

const NO_VALUES: Record<string, AnswerValue> = {};

describe('outlineNodeReached', () => {
  it('is false for a section nothing has been recorded against', () => {
    expect(outlineNodeReached(secC, NO_VALUES)).toBe(false);
  });

  it('is true once any of the section\'s own questions has a value', () => {
    expect(outlineNodeReached(secA, { intro1: null })).toBe(true);
  });

  it('counts an explicit skip — the question was asked, just not answered with content', () => {
    expect(outlineNodeReached(secC, { later: null })).toBe(true);
  });

  it('recurses: a parent is reached as soon as one of its children is', () => {
    expect(outlineNodeReached(secA, { role_names: ['lead'] })).toBe(true);
    expect(outlineNodeReached(secA1, { role_names: ['lead'] })).toBe(true);
  });

  it('does not leak across sections', () => {
    expect(outlineNodeReached(secB, { name: 'Ada' })).toBe(false);
  });

  it('reads only top-level values — a repeatable\'s seed question is what marks its section', () => {
    // role_for lives inside a record, never in `values`; role_names does not.
    expect(outlineNodeReached(secA1, NO_VALUES)).toBe(false);
    expect(outlineNodeReached(secA1, { role_names: ['lead'] })).toBe(true);
  });
});

describe('outlineNodeCurrent', () => {
  it('is false when nothing is being asked', () => {
    expect(outlineNodeCurrent(secA, null)).toBe(false);
  });

  it('matches the section that lists the question', () => {
    expect(outlineNodeCurrent(secB, 'entity_name')).toBe(true);
    expect(outlineNodeCurrent(secA, 'entity_name')).toBe(false);
  });

  it('recurses, so a mid-repeatable sub-question lights its parent too', () => {
    expect(outlineNodeCurrent(secA, 'role_mandate')).toBe(true);
    expect(outlineNodeCurrent(secA1, 'role_mandate')).toBe(true);
  });
});

describe('outlineNodeState', () => {
  it('is untouched with no answers and nothing current', () => {
    expect(outlineNodeState(secC, NO_VALUES, null)).toBe('untouched');
  });

  it('is reached once answered and not current', () => {
    expect(outlineNodeState(secC, { later: 'x' }, 'name')).toBe('reached');
  });

  it('is current even before its own first answer exists', () => {
    expect(outlineNodeState(secC, NO_VALUES, 'later')).toBe('current');
  });

  it('current wins over reached', () => {
    expect(outlineNodeState(secC, { later: 'x' }, 'later')).toBe('current');
  });
});

describe('currentQuestionIdFor', () => {
  it('reads a step position', () => {
    expect(currentQuestionIdFor({ kind: 'step', step: nameStep, location: { in: 'top' } })).toBe('name');
  });

  it('reads a reflect position — the same question, one screen on', () => {
    expect(currentQuestionIdFor({ kind: 'reflect', step: nameStep, location: { in: 'top' } })).toBe('name');
  });

  it('reads a repeatable field by its own id', () => {
    expect(
      currentQuestionIdFor({
        kind: 'step',
        step: rolesBlock.fields[1]!,
        location: { in: 'repeatable', blockId: 'roles', recordIndex: 0 },
      }),
    ).toBe('role_mandate');
  });

  it('reports the block\'s first field for add-another, so the section stays lit', () => {
    expect(currentQuestionIdFor({ kind: 'add-another', block: entitiesBlock, recordIndex: 1 })).toBe('entity_name');
  });

  it('is null where the panel is genuinely nowhere in the file', () => {
    expect(currentQuestionIdFor({ kind: 'done' })).toBe(null);
    expect(currentQuestionIdFor({ kind: 'module-intro', module: modules[0]! })).toBe(null);
  });
});

describe('currentSectionId', () => {
  it('finds the top-level section holding the question, not the child', () => {
    expect(currentSectionId(outline, 'role_mandate')).toBe('secA');
  });

  it('is null when nothing is being asked', () => {
    expect(currentSectionId(outline, null)).toBe(null);
  });

  it('is null for a question no section lists', () => {
    expect(currentSectionId(outline, 'not_a_question')).toBe(null);
  });
});

describe('navigationTargetFor', () => {
  it('is the section\'s first listed question', () => {
    expect(navigationTargetFor(secB)).toBe('gate');
  });

  it('is undefined for a section listing nothing', () => {
    expect(navigationTargetFor({ id: 'x', label: 'X', questionIds: [] })).toBe(undefined);
  });
});

describe('positionForQuestionId', () => {
  it('resolves a top-level question to a top-level step position', () => {
    expect(positionForQuestionId(modules, 'name')).toEqual({ kind: 'step', step: nameStep, location: { in: 'top' } });
  });

  it('resolves a repeatable sub-question up to the block\'s own start', () => {
    expect(positionForQuestionId(modules, 'role_mandate')).toEqual({
      kind: 'step',
      step: rolesBlock.fields[0],
      location: { in: 'repeatable', blockId: 'roles', recordIndex: 0 },
    });
  });

  it('resolves the block\'s own id the same way', () => {
    expect(positionForQuestionId(modules, 'entities')).toEqual({
      kind: 'step',
      step: entitiesBlock.fields[0],
      location: { in: 'repeatable', blockId: 'entities', recordIndex: 0 },
    });
  });

  it('is null for a question that is not in the flow', () => {
    expect(positionForQuestionId(modules, 'nope')).toBe(null);
  });

  it('never returns a reflect position — this is review navigation, it lands on the question', () => {
    const pos = positionForQuestionId(modules, 'name');
    expect(pos?.kind).toBe('step');
  });
});

describe('repeatableBlocksForNode', () => {
  it('finds the block whose fields the section lists', () => {
    expect(repeatableBlocksForNode(modules, secA1).map((b) => b.id)).toEqual(['roles']);
    expect(repeatableBlocksForNode(modules, secB).map((b) => b.id)).toEqual(['entities']);
  });

  it('finds none for a section with no repeatable behind it', () => {
    expect(repeatableBlocksForNode(modules, secC)).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// The real ported outline — the thing that actually ships. These are the
// assumptions the tree's navigation rests on, asserted rather than assumed.
// ---------------------------------------------------------------------

describe('the shipped Context outline', () => {
  it('has ten top-level sections', () => {
    expect(contextOutline).toHaveLength(10);
  });

  it('every section\'s first question id resolves to a real position', () => {
    for (const node of contextOutline) {
      const target = navigationTargetFor(node);
      expect(target, `${node.id} lists no questions`).toBeTruthy();
      expect(positionForQuestionId(contextModules, target!), `${node.id} -> ${target}`).not.toBe(null);
    }
  });

  it('every section is untouched before a single question is answered', () => {
    for (const node of contextOutline) {
      expect(outlineNodeState(node, {}, null), node.id).toBe('untouched');
    }
  });

  it('answering the very first question lights exactly one section', () => {
    const lit = contextOutline.filter((node) => outlineNodeReached(node, { orientation_ready: null }));
    expect(lit.map((n) => n.id)).toEqual(['sec1']);
  });

  it('2.1 Roles is fed by the roles repeatable, so its records can render under it', () => {
    const aboutMe = contextOutline.find((n) => n.id === 'sec2')!;
    const roles = aboutMe.children!.find((c) => c.id === 'sec2-1')!;
    expect(repeatableBlocksForNode(contextModules, roles).map((b) => b.id)).toEqual(['roles']);
  });

  it('every top-level section resolves as current for at least one real question', () => {
    for (const node of contextOutline) {
      const target = navigationTargetFor(node)!;
      expect(currentSectionId(contextOutline, target), node.id).toBe(node.id);
    }
  });
});
