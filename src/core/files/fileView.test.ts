import { describe, it, expect } from 'vitest';
import { fileCanResume, fileSectionRows, fileStartTarget } from './fileView';
import { fileFinished } from './slots';
import { positionForQuestionId } from '../flow/outline';
import { contextModules, contextOutline } from '../flow/flow';
import type { FileOutlineNode, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';

/**
 * V1.7 VB-37. Same two layers `slots.test.ts` and `sectionHealth.test.ts`
 * use: a synthetic flow small enough that the interesting boundary is visible
 * in this file, then the REAL ported outline, so the file view is asserted
 * against the ten sections that actually ship.
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

describe('fileSectionRows', () => {
  it('is every top-level section, in file order, whatever is answered', () => {
    expect(fileSectionRows(outline, modules, answers(), NOW).map((r) => r.id)).toEqual(['sec2', 'sec3', 'sec6']);
    const some = answers({ values: { voice: 'plain' } });
    // The one answered section is LAST, and it stays last — file order, never
    // sorted by what needs attention.
    expect(fileSectionRows(outline, modules, some, NOW).map((r) => r.id)).toEqual(['sec2', 'sec3', 'sec6']);
  });

  it('carries each section’s own name and health, rolled up', () => {
    const rows = fileSectionRows(outline, modules, answers({ values: { name: 'Ada' } }), NOW);
    const about = rows.find((r) => r.id === 'sec2');
    expect(about?.label).toBe('2. About Me');
    // The intro beat is not a question — 1 of 1, not 1 of 2.
    expect(about?.health).toMatchObject({ state: 'done', total: 1, answered: 1 });
    expect(rows.find((r) => r.id === 'sec6')?.health.state).toBe('not-yet');
  });

  it('nothing is ever “here” — the file view is not the interview', () => {
    const rows = fileSectionRows(outline, modules, answers({ values: { name: 'Ada' } }), NOW);
    expect(rows.map((r) => r.health.state)).not.toContain('here');
  });

  // ───────────────────────────────────────────────── which rows are doors
  it('an untouched section is not a door — matching the drawer’s own rule', () => {
    expect(fileSectionRows(outline, modules, answers(), NOW).map((r) => r.target)).toEqual([null, null, null]);
  });

  it('answering one question in a section opens that section and no other', () => {
    const rows = fileSectionRows(outline, modules, answers({ values: { name: 'Ada' } }), NOW);
    expect(rows.find((r) => r.id === 'sec2')?.target).toBe('beat');
    expect(rows.find((r) => r.id === 'sec3')?.target).toBe(null);
    expect(rows.find((r) => r.id === 'sec6')?.target).toBe(null);
  });

  it('a SKIPPED question still opens its section — it was reached', () => {
    // The distinction docs/ARCHITECTURE.md draws: `null` is recorded, an
    // absent key is not. A section somebody walked through and passed on is
    // exactly the section they may want to go back and redo.
    const rows = fileSectionRows(outline, modules, answers({ values: { name: null } }), NOW);
    expect(rows.find((r) => r.id === 'sec2')?.target).toBe('beat');
  });

  it('a section whose only answers live inside a repeatable still opens, via its gate', () => {
    const a = answers({
      values: { things_gate: 'yes' },
      repeatables: { things: [{ thing_name: 'A thing' }] },
    });
    const row = fileSectionRows(outline, modules, a, NOW).find((r) => r.id === 'sec3');
    // The gate is the section's first listed id and a real top-level question,
    // so it is where the row lands — never mid-loop.
    expect(row?.target).toBe('things_gate');
  });

  it('a section listing no questions is never a door', () => {
    const empty: FileOutlineNode[] = [{ id: 'sec9', label: '9. Nothing', questionIds: [] }];
    expect(fileSectionRows(empty, modules, answers({ values: { name: 'Ada' } }), NOW)[0]?.target).toBe(null);
  });
});

describe('fileStartTarget', () => {
  it('is the first question of the first section', () => {
    expect(fileStartTarget(outline)).toBe('beat');
  });

  it('is null for a file with no sections — there is nothing to walk', () => {
    expect(fileStartTarget([])).toBe(null);
  });
});

describe('fileCanResume', () => {
  it('an untouched file has everything to resume to', () => {
    expect(fileCanResume(modules, answers())).toBe(true);
  });

  it('a part-written file still does', () => {
    expect(fileCanResume(modules, answers({ values: { beat: null, name: 'Ada' } }))).toBe(true);
  });

  it('a file with every question answered and no records left to ask about does not', () => {
    const done = answers({ values: { beat: null, name: 'Ada', things_gate: 'no', voice: 'v' } });
    expect(fileCanResume(modules, done)).toBe(false);
    // Which is exactly the case that has to walk from the top instead.
    expect(fileStartTarget(outline)).toBe('beat');
  });

  /**
   * THE CASE THE OBVIOUS SHORTCUT GETS WRONG, and the reason this asks the
   * runner instead of counting sections.
   *
   * Every question here is answered — `fileFinished` says so — but the block
   * still has an "is there another one?" screen to offer, because
   * `declinedBlocks` is ephemeral and empty on every mount. Deciding from the
   * section counts would send somebody back to question one while the
   * interview genuinely had something left to ask them.
   */
  it('a fully answered file that still holds records DOES resume — to its add-another screen', () => {
    const withRecords = answers({
      values: { beat: null, name: 'Ada', things_gate: 'yes', voice: 'v' },
      repeatables: { things: [{ thing_name: 'A thing' }] },
    });
    expect(fileFinished(outline, modules, withRecords, NOW)).toBe(true);
    expect(fileCanResume(modules, withRecords)).toBe(true);
  });
});

// ─────────────────────────────────────────────── against the real ported flow

describe('the real Context.md', () => {
  it('lists the ten shipped sections, in file order, none of them doors on a fresh file', () => {
    const rows = fileSectionRows(contextOutline, contextModules, answers(), NOW);
    expect(rows.map((r) => r.id)).toEqual(contextOutline.map((n) => n.id));
    expect(rows.every((r) => r.target === null)).toBe(true);
    expect(rows.every((r) => r.health.state === 'not-yet')).toBe(true);
  });

  it('every door it offers really resolves to a question in the shipped flow', () => {
    // The whole point of the surface: a row that opens must land somewhere.
    // Reach every section by recording its own first question, then check the
    // deep link the panel would hand `Flow` actually exists.
    const values: Record<string, string> = {};
    for (const node of contextOutline) {
      const first = node.questionIds[0];
      if (first) values[first] = 'x';
    }
    const rows = fileSectionRows(contextOutline, contextModules, answers({ values }), NOW);
    expect(rows.every((r) => r.target !== null)).toBe(true);
    for (const row of rows) {
      expect(positionForQuestionId(contextModules, row.target as string), `${row.id} -> ${row.target}`).not.toBe(null);
    }
  });

  it('the whole-file start really resolves too', () => {
    const target = fileStartTarget(contextOutline);
    expect(target).not.toBe(null);
    expect(positionForQuestionId(contextModules, target as string)).not.toBe(null);
  });
});
