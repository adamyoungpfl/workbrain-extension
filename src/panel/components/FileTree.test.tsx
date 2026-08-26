import { describe, it, expect, beforeAll } from 'vitest';
import { act } from 'react';
import { FileTree } from './FileTree';
import { mount } from './testUtils';
import { S } from '../strings';
import { sectionCompletionPercent, sectionHealthFor } from '../../core/freshness/sectionHealth';
import { splitSectionLabel } from '../../core/flow/sectionLabel';
import { sectionNodeGradient } from './BrainGlobe';
import type { FileOutlineNode, Module, RepeatableBlock } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';

/**
 * V1.1 VB-07. The derivations themselves are tested without a browser in
 * core/flow/outline.test.ts; this covers what only the component can be wrong
 * about — which rows are real navigation, what the glyph column says, the
 * accordion's override rule, and the record sub-items.
 *
 * The typewriter is deliberately not asserted here: jsdom has no
 * `matchMedia` (see `prefersReducedMotion`'s guard, which then reports "not
 * reduced"), and a character-by-character interval under fake timers proves
 * only that `setInterval` works. Its real contract — "does not replay on a
 * resumed session" — is asserted end to end in tests/e2e/file-tree.spec.ts,
 * against a real browser, which is where this repo has been bitten before.
 */

/**
 * jsdom has no `matchMedia` at all, so `prefersReducedMotion()` falls through
 * to "not reduced" and every state change here starts a real 15ms interval
 * that then updates state outside `act`. Declaring the preference is both
 * quieter and more honest: these tests are about structure and behaviour, and
 * the reduced-motion rendering is the one whose correctness they can actually
 * assert. That the animation itself runs is proved in a real browser, in
 * tests/e2e/file-tree.spec.ts.
 */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

const rolesBlock: RepeatableBlock = {
  id: 'roles',
  seedFrom: { questionId: 'role_names', seedField: 'role_name' },
  addAnotherPrompt: '',
  fields: [{ id: 'role_for', module: 1, section: 1, eyebrow: 'E', q: 'For whom?', kind: 'text', key: 'role_for' }],
};

const modules: Module[] = [
  {
    id: 'm1',
    n: 1,
    title: 'Mod',
    purpose: 'p',
    required: true,
    estimatedMinutes: [1, 1],
    nodes: [
      { id: 'name', module: 1, section: 0, eyebrow: 'E', q: 'Name?', kind: 'text', key: 'name' },
      { id: 'role_names', module: 1, section: 1, eyebrow: 'E', q: 'Roles?', kind: 'multi', key: 'role_names' },
      rolesBlock,
      { id: 'later', module: 1, section: 2, eyebrow: 'E', q: 'Later?', kind: 'text', key: 'later' },
    ],
  },
];

const outline: FileOutlineNode[] = [
  {
    id: 'sec1',
    label: '1. About Me',
    questionIds: ['name'],
    children: [{ id: 'sec1-1', label: '1.1 Roles', questionIds: ['role_names', 'role_for'] }],
  },
  { id: 'sec2', label: '2. Later', questionIds: ['later'] },
];

function makeAnswers(overrides: Partial<Answers> = {}): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {}, ...overrides };
}

function renderTree(answers: Answers, currentQuestionId: string | null, currentSectionId: string | null) {
  return mount(
    <FileTree
      outline={outline}
      modules={modules}
      answers={answers}
      currentQuestionId={currentQuestionId}
      currentSectionId={currentSectionId}
      onNavigate={() => {}}
    />,
  );
}

function rows(container: Element) {
  return Array.from(container.querySelectorAll('.filetree-row')) as HTMLElement[];
}

function rowFor(container: Element, nodeId: string) {
  return container.querySelector(`.filetree-row[data-node-id="${nodeId}"]`) as HTMLElement;
}

function click(el: HTMLElement) {
  act(() => el.click());
}

describe('FileTree', () => {
  it('renders every top-level section from question one, all untouched', () => {
    const { container } = renderTree(makeAnswers(), null, null);
    expect(rows(container)).toHaveLength(2);
    for (const row of rows(container)) expect(row.dataset.nodeState).toBe('untouched');
  });

  /**
   * V1.8 VB-47 — THE TREE NO LONGER NAMES THE FILE, AND CARRIES NO SUMMARY.
   *
   * Both stood above the sections and both moved out: the file-type toggle in
   * the drawer's own strip names the file now (its pressed segment IS the
   * filename), and VB-46 put the counts inside the rows. What is left here is
   * the list, which is what a tree of one file should be — so the tree starts
   * at its first section, and nothing above it.
   *
   * `HealthSummary` is untouched and still renders on `FileView`, which has no
   * right-hand column in its rows to bundle a count into; this asserts only
   * that the DRAWER'S tree does not draw one.
   */
  it('is the list and nothing above it — no file name, no summary strip', () => {
    const { container } = renderTree(makeAnswers({ values: { preferred_name: 'Ada' } }), null, null);
    const tree = container.querySelector('.filetree') as HTMLElement;
    expect(container.querySelector('.filetree-root')).toBe(null);
    expect(container.querySelector('.sectionhealth-summary')).toBe(null);
    expect(tree.firstElementChild!.classList.contains('filetree-list')).toBe(true);
  });

  /**
   * V1.8 VB-45 replaced the ASCII tile with the section's own orb from the
   * Brain visual — and had to keep the guarantee the tile was kept for. The
   * three states are told apart by the orb's FILL and by the MARK drawn in it,
   * neither of which is a colour, plus the hidden word beside it. The proof
   * that this survives colour actually being stripped from a real browser is
   * tests/e2e/section-health.spec.ts; this is the structural half.
   */
  it('marks state with a mark AND a word, never colour alone', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    const live = rowFor(container, 'sec1');
    const lit = rowFor(container, 'sec2');
    const dim = rowFor(container, 'sec1-1');

    // Each of the three wears its own life, and no two share a mark.
    expect(live.querySelector('.filetree-glyph')?.getAttribute('data-life')).toBe('live');
    expect(live.querySelector('.filetree-srstate')?.textContent).toBe(S.fileTreeStateCurrent);
    expect(lit.querySelector('.filetree-glyph')?.getAttribute('data-life')).toBe('lit');
    expect(lit.querySelector('.filetree-srstate')?.textContent).toBe(S.fileTreeStateReached);

    const markOf = (row: HTMLElement) => row.querySelector('.filetree-mark path')?.getAttribute('d') ?? null;
    expect(markOf(live)).not.toBe(null);
    expect(markOf(lit)).not.toBe(null);
    expect(markOf(live)).not.toBe(markOf(lit));
    // The greyed one is hollow AND empty — the two signals the other two have.
    if (dim) {
      expect(dim.querySelector('.filetree-glyph')?.getAttribute('data-life')).toBe('dim');
      expect(markOf(dim)).toBe(null);
      expect(dim.querySelector('.filetree-srstate')?.textContent).toBe(S.fileTreeStateUntouched);
    }
  });

  /**
   * V1.8 VB-45 — the orb wears the colour its own sphere wears in the globe.
   * Asserted as the same call the globe makes, so the two cannot drift.
   */
  it('gives each section the orb its sphere wears in the Brain visual', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    for (const [index, node] of outline.entries()) {
      expect(rowFor(container, node.id).querySelector('.filetree-glyph')?.getAttribute('data-gradient')).toBe(
        String(sectionNodeGradient(index)),
      );
    }
  });

  /**
   * V2.0 VB-56 — the blinking terminal cursor after the live section's name is
   * gone. This is the test that used to require one, inverted: the section
   * being written is still the only live row, and it still says so three ways
   * (its `data-life`, the caret in its orb and the word it prints out loud),
   * none of which is a character blinking beside its name.
   */
  it('gives the section being written no terminal cursor — the orb carries it', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    expect(container.querySelectorAll('.filetree-cursor')).toHaveLength(0);
    const live = rowFor(container, 'sec1');
    expect(live.dataset.life).toBe('live');
    expect(live.querySelector('.filetree-label')!.textContent).toBe('About Me'); // VB-96: title only
    expect(live.querySelector('.filetree-srstate')!.textContent).toBe(S.fileTreeStateCurrent);
  });

  it('makes a written or in-progress row real navigation', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    expect(rowFor(container, 'sec1').querySelector('.filetree-nav')).not.toBe(null);
    expect(rowFor(container, 'sec2').querySelector('.filetree-nav')).not.toBe(null);
  });

  it('never makes an unreached row clickable — jumping ahead would skip required questions', () => {
    const { container } = renderTree(makeAnswers(), 'name', 'sec1');
    const later = rowFor(container, 'sec2');
    expect(later.dataset.nodeState).toBe('untouched');
    expect(later.querySelector('.filetree-nav')).toBe(null);
    expect(later.querySelector('button')).toBe(null);
  });

  it('navigates to the section\'s first question id', () => {
    const seen: string[] = [];
    const { container } = mount(
      <FileTree
        outline={outline}
        modules={modules}
        answers={makeAnswers({ values: { later: 'x' } })}
        currentQuestionId="name"
        currentSectionId="sec1"
        onNavigate={(id) => seen.push(id)}
      />,
    );
    click(rowFor(container, 'sec2').querySelector('.filetree-nav') as HTMLElement);
    expect(seen).toEqual(['later']);
  });

  it('opens the section being answered, and only that one', () => {
    const { container } = renderTree(makeAnswers(), 'name', 'sec1');
    expect(rowFor(container, 'sec1').querySelector('.filetree-toggle')?.getAttribute('aria-expanded')).toBe('true');
    expect(rowFor(container, 'sec1-1')).not.toBe(null);
  });

  it('lets a manual expand override the active section, until the active section itself moves', () => {
    const answers = makeAnswers({ values: { later: 'x' } });
    const { container, rerender } = renderTree(answers, 'name', 'sec1');

    // Collapse the auto-opened section: the child disappears, and stays gone
    // across an unrelated re-render.
    click(rowFor(container, 'sec1').querySelector('.filetree-toggle') as HTMLElement);
    expect(rowFor(container, 'sec1-1')).toBe(null);
    rerender(
      <FileTree
        outline={outline}
        modules={modules}
        answers={answers}
        currentQuestionId="name"
        currentSectionId="sec1"
        onNavigate={() => {}}
      />,
    );
    expect(rowFor(container, 'sec1-1')).toBe(null);

    // Moving to a different section drops the override — sec1's children come
    // back the next time sec1 is the active section.
    rerender(
      <FileTree
        outline={outline}
        modules={modules}
        answers={answers}
        currentQuestionId="later"
        currentSectionId="sec2"
        onNavigate={() => {}}
      />,
    );
    rerender(
      <FileTree
        outline={outline}
        modules={modules}
        answers={answers}
        currentQuestionId="name"
        currentSectionId="sec1"
        onNavigate={() => {}}
      />,
    );
    expect(rowFor(container, 'sec1-1')).not.toBe(null);
  });

  it('renders each record as its own sub-item, titled the way the file titles it', () => {
    const answers = makeAnswers({
      values: { role_names: ['a', 'b'] },
      repeatables: { roles: [{ role_name: 'Team lead' }, { role_name: 'Parent' }] },
    });
    const { container } = renderTree(answers, 'role_for', 'sec1');
    const records = Array.from(container.querySelectorAll('.filetree-row.is-record .filetree-label')).map((el) => el.textContent);
    expect(records).toEqual(['Team lead', 'Parent']);
  });

  it('does not make a record row clickable — there is no per-record jump target', () => {
    const answers = makeAnswers({
      values: { role_names: ['a'] },
      repeatables: { roles: [{ role_name: 'Team lead' }] },
    });
    const { container } = renderTree(answers, 'role_for', 'sec1');
    for (const row of container.querySelectorAll('.filetree-row.is-record')) {
      expect(row.querySelector('button')).toBe(null);
    }
  });

  it('gives every disclosure control a real name, not a bare glyph', () => {
    const { container } = renderTree(makeAnswers(), 'name', 'sec1');
    const toggle = rowFor(container, 'sec1').querySelector('.filetree-toggle') as HTMLElement;
    expect(toggle.getAttribute('aria-label')).toBe(S.fileTreeCollapse('About Me'));
    click(toggle);
    expect(toggle.getAttribute('aria-label')).toBe(S.fileTreeExpand('About Me'));
  });

  it('gives every navigate control the section it goes to as its name', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    const nav = rowFor(container, 'sec2').querySelector('.filetree-nav') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe(S.fileTreeGoTo('Later'));
  });
});

/**
 * V1.3 VB-19. The health derivation itself is covered in
 * core/freshness/sectionHealth.test.ts and the pill's own rendering in
 * SectionHealth.test.tsx; what is left for the tree is the wiring — that a
 * row carries its own section's health, that the detail line is bound to the
 * row's control, and that adding a pill did not quietly make an empty section
 * clickable.
 */
describe('FileTree — section health (VB-19)', () => {
  const YEAR_AGO = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString();
  const TODAY = new Date().toISOString();

  /**
   * V2.0 VB-55 — the pill is gone from every row and the health it reported is
   * not: `data-health` is what the row's accent, its due ring and every test
   * below read, and it is still derived per row.
   */
  it('gives every section row its own health, and no pill', () => {
    const { container } = renderTree(makeAnswers(), null, null);
    for (const row of rows(container)) {
      expect(row.dataset.health, row.dataset.nodeId).toBeDefined();
      expect(row.querySelector('.sectionhealth-pill'), row.dataset.nodeId).toBe(null);
    }
  });

  /**
   * V2.0 VB-55 — `due` is the one state the orb's three-way vocabulary cannot
   * draw (a due section and a done one are both finished, both lit, both at
   * 100%), so the word the pill used to print is kept as a hidden one. Without
   * it a screen reader would get less than a greyscale screen does, which is
   * the wrong side of that trade.
   */
  it('says "due" out loud on an aged section, and on no other', () => {
    const stale = renderTree(makeAnswers({ values: { later: 'x' }, answeredAt: { later: YEAR_AGO } }), 'name', 'sec1');
    const due = rowFor(stale.container, 'sec2');
    expect(due.dataset.health).toBe('due');
    expect(due.querySelector('[data-health-word="due"]')?.textContent).toBe(S.sectionStateDue);
    // Every other row on screen — none of them due — says no such thing.
    for (const row of rows(stale.container)) {
      if (row.dataset.health === 'due') continue;
      expect(row.querySelector('[data-health-word]'), row.dataset.nodeId).toBe(null);
    }
    stale.unmount();

    const fresh = renderTree(makeAnswers({ values: { later: 'x' }, answeredAt: { later: TODAY } }), 'name', 'sec1');
    const done = rowFor(fresh.container, 'sec2');
    expect(done.dataset.health).toBe('done');
    expect(done.querySelector('[data-health-word]')).toBe(null);
    fresh.unmount();
  });

  it('reports the section being answered as here, and an empty one as not yet', () => {
    const { container } = renderTree(makeAnswers(), 'name', 'sec1');
    expect(rowFor(container, 'sec1').dataset.health).toBe('here');
    expect(rowFor(container, 'sec2').dataset.health).toBe('not-yet');
  });

  it('reports a finished section as done, and the same section aged as due', () => {
    const fresh = renderTree(makeAnswers({ values: { later: 'x' }, answeredAt: { later: TODAY } }), 'name', 'sec1');
    expect(rowFor(fresh.container, 'sec2').dataset.health).toBe('done');
    fresh.unmount();

    const stale = renderTree(makeAnswers({ values: { later: 'x' }, answeredAt: { later: YEAR_AGO } }), 'name', 'sec1');
    expect(rowFor(stale.container, 'sec2').dataset.health).toBe('due');
    stale.unmount();
  });

  it('binds the WHOLE meta line to the row\'s own control, so it is not lost behind an aria-label', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' }, answeredAt: { later: TODAY } }), 'name', 'sec1');
    const row = rowFor(container, 'sec2');
    const nav = row.querySelector('.filetree-nav') as HTMLElement;
    // V1.6 VB-33 put a second thing on this line — the percentage — so the
    // description is now the wrapper around both, not the count alone. A
    // description bound to half the line is how the new number would reach the
    // screen and not the screen reader.
    const meta = row.querySelector('.filetree-meta') as HTMLElement;
    expect(meta).not.toBe(null);
    expect(nav.getAttribute('aria-describedby')).toBe(meta.id);
    expect(meta.id.length).toBeGreaterThan(0);
    expect(meta.querySelector('.filetree-detail')).not.toBe(null);
    expect(meta.querySelector('.filetree-percent')).not.toBe(null);
  });

  /**
   * V1.6 VB-33 — the percentage. One real ratio of the two counts printed
   * beside it, never a composite score: the reasoning is written out over
   * `sectionCompletionPercent` in src/core/freshness/sectionHealth.ts, and the
   * arithmetic itself is proved there. What is left for the tree is that the
   * figure it prints is the one that function returns, and that it says
   * "complete" out loud for anyone meeting it without the count.
   */
  it('prints the section\'s own completion percentage, with the word said out loud', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' }, answeredAt: { later: TODAY } }), 'name', 'sec1');
    const row = rowFor(container, 'sec2');
    const health = sectionHealthFor(outline[1]!, modules, makeAnswers({ values: { later: 'x' } }), null, new Date());
    const percent = row.querySelector('.filetree-percent') as HTMLElement;
    expect(percent.textContent).toBe(`${S.sectionPercent(sectionCompletionPercent(health)!)} ${S.sectionPercentComplete}`);
    expect(percent.querySelector('.filetree-sr')!.textContent!.trim()).toBe(S.sectionPercentComplete);
  });

  /**
   * V1.8 VB-46 REVERSED VB-19's rule here, deliberately: "A row at **0 of X**
   * is **greyed out**, showing **0%**." It can afford to now — the count and
   * the figure sit in a column that already exists at the row's right end
   * rather than opening a second line of their own.
   */
  it('prints 0 of X and 0% on a section nobody has touched, greyed', () => {
    const { container } = renderTree(makeAnswers(), 'name', 'sec1');
    const row = rowFor(container, 'sec2');
    expect(row.dataset.life).toBe('dim');
    expect(row.querySelector('.filetree-count')!.textContent).toBe(S.sectionAnsweredOf(0, 1));
    expect(row.querySelector('.filetree-percent')!.textContent).toBe(`${S.sectionPercent(0)} ${S.sectionPercentComplete}`);
    // …and no freshness clause: there is nothing to date.
    expect(row.querySelector('.filetree-detail')).toBe(null);
  });

  /**
   * V1.8 VB-46 — one rule decides which rows are illuminated, and it is
   * `core/freshness/sectionLife.ts`, which the Brain visual reads too.
   */
  it('lights a row from its first answer and greys it at 0 of X', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    // The one being worked on, whatever its count.
    expect(rowFor(container, 'sec1').dataset.life).toBe('live');
    // One answer in, so illuminated.
    expect(rowFor(container, 'sec2').dataset.life).toBe('lit');
    const empty = renderTree(makeAnswers(), null, null);
    expect(rowFor(empty.container, 'sec1').dataset.life).toBe('dim');
    expect(rowFor(empty.container, 'sec2').dataset.life).toBe('dim');
    empty.unmount();
  });

  it('keeps an empty section inert — a pill is not a control', () => {
    const { container } = renderTree(makeAnswers(), 'name', 'sec1');
    const row = rowFor(container, 'sec2');
    expect(row.dataset.health).toBe('not-yet');
    expect(row.querySelector('button')).toBe(null);
    expect(row.querySelector('.filetree-detail')).toBe(null);
    // Its counts are text on the row, not a control either.
    expect(row.querySelector('.filetree-counts button, .filetree-counts a')).toBe(null);
  });

  /**
   * V1.8 VB-47 removed the counts strip from this tree — VB-46 had already put
   * the same three facts inside every row, at its right end, so the strip was
   * the second telling and the drawer needed the space for the file-type
   * toggle. What used to be asserted here is asserted where it still exists:
   * `SectionHealth.test.tsx` for the component, and `FileView` for the surface
   * that still draws it.
   *
   * The row-level counts it was checked against are unchanged and are two
   * tests above this one.
   */
  it('carries no counts strip of its own — every count is on a row', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' }, answeredAt: { later: YEAR_AGO } }), 'name', 'sec1');
    expect(container.querySelectorAll('.sectionhealth-summary')).toHaveLength(0);
    // V2.0 VB-55: and no pills at all now, per row or as a total — the counts
    // that VB-46 bundled beside them are what the right end of a row is.
    expect(container.querySelectorAll('.sectionhealth-pill')).toHaveLength(0);
    expect(container.querySelectorAll('[data-health-summary]')).toHaveLength(0);
    expect(container.querySelectorAll('.filetree-counts')).toHaveLength(rows(container).length);
  });
});

/**
 * V1.6 VB-33 — the accordion's new shape. The look itself is measured in a
 * real browser (tests/e2e/file-accordion.spec.ts); what only the component can
 * be wrong about is the structure that look is hung on.
 */
describe('FileTree — the accordion (VB-33)', () => {
  it('prints a section\'s TITLE alone — V2.3 VB-96: the numbering never reaches a reader', () => {
    const { container } = renderTree(makeAnswers(), null, null);
    for (const node of outline) {
      const label = rowFor(container, node.id).querySelector('.filetree-label') as HTMLElement;
      // The title only — the numeral survives in the outline and the file,
      // and never in the row a person reads.
      expect(label.textContent, node.id).toBe(splitSectionLabel(node.label).title);
      expect(label.querySelector('.filetree-num'), node.id).toBeNull();
    }
  });

  it('leads with the state marker and trails with the disclosure', () => {
    const { container } = renderTree(makeAnswers(), null, null);
    const row = rowFor(container, 'sec1');
    // The marker at the left is where a flying orb lands (core/drawer/mode.ts
    // measures this element), and the chevron at the far edge is what stops a
    // 44px control standing between the panel edge and every section name.
    expect(row.firstElementChild!.classList.contains('filetree-glyph')).toBe(true);
    expect(row.lastElementChild!.classList.contains('filetree-toggle')).toBe(true);
    // A childless section keeps the column, so the pills stay in one line.
    expect(rowFor(container, 'sec2').lastElementChild!.classList.contains('filetree-toggle-spacer')).toBe(true);
  });

  it('marks a child row as a card and a top-level row as a plain band', () => {
    const { container } = renderTree(makeAnswers({ values: { name: 'Ada' } }), 'role_names', 'sec1');
    expect(rowFor(container, 'sec1').classList.contains('is-child')).toBe(false);
    expect(rowFor(container, 'sec1').dataset.depth).toBe('0');
    // The accordion follows the active section, so 1.1 Roles is on screen.
    expect(rowFor(container, 'sec1-1').classList.contains('is-child')).toBe(true);
    expect(rowFor(container, 'sec1-1').dataset.depth).toBe('1');
  });

  it('still opens one section at a time and still follows the active one', () => {
    // Unchanged by VB-33 and asserted again here on purpose: the restyle sits
    // over VB-07's accordion rather than replacing it.
    const { container } = renderTree(makeAnswers({ values: { name: 'Ada' } }), 'role_names', 'sec1');
    expect(rowFor(container, 'sec1').querySelector('.filetree-toggle')!.getAttribute('aria-expanded')).toBe('true');
    click(rowFor(container, 'sec1').querySelector('.filetree-toggle') as HTMLElement);
    expect(rowFor(container, 'sec1').querySelector('.filetree-toggle')!.getAttribute('aria-expanded')).toBe('false');
    expect(rowFor(container, 'sec1-1')).toBe(null);
  });
});
