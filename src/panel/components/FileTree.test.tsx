import { describe, it, expect, beforeAll } from 'vitest';
import { act } from 'react';
import { FileTree } from './FileTree';
import { mount } from './testUtils';
import { S } from '../strings';
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

  it('names the file, and puts the person in the name once they give one', () => {
    const bare = renderTree(makeAnswers(), null, null);
    expect(bare.container.querySelector('.filetree-root')?.textContent).toBe('Context.md');
    bare.unmount();

    const named = renderTree(makeAnswers({ values: { preferred_name: 'Ada' } }), null, null);
    expect(named.container.querySelector('.filetree-root')?.textContent).toBe('Ada — Context.md');
    named.unmount();
  });

  it('marks state with a glyph AND a word, never colour alone', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    const current = rowFor(container, 'sec1');
    const reached = rowFor(container, 'sec2');

    expect(current.querySelector('.filetree-glyph')?.textContent).toBe('[>]');
    expect(current.querySelector('.filetree-srstate')?.textContent).toBe(S.fileTreeStateCurrent);
    expect(reached.querySelector('.filetree-glyph')?.textContent).toBe('[x]');
    expect(reached.querySelector('.filetree-srstate')?.textContent).toBe(S.fileTreeStateReached);
  });

  it('gives the section being written a terminal cursor, and nothing else one', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    expect(container.querySelectorAll('.filetree-cursor')).toHaveLength(1);
    expect(rowFor(container, 'sec1').querySelector('.filetree-cursor')).not.toBe(null);
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
    expect(toggle.getAttribute('aria-label')).toBe(S.fileTreeCollapse('1. About Me'));
    click(toggle);
    expect(toggle.getAttribute('aria-label')).toBe(S.fileTreeExpand('1. About Me'));
  });

  it('gives every navigate control the section it goes to as its name', () => {
    const { container } = renderTree(makeAnswers({ values: { later: 'x' } }), 'name', 'sec1');
    const nav = rowFor(container, 'sec2').querySelector('.filetree-nav') as HTMLElement;
    expect(nav.getAttribute('aria-label')).toBe(S.fileTreeGoTo('2. Later'));
  });
});
