import { describe, it, expect } from 'vitest';
import { NodeSummaryCard } from './NodeSummary';
import { mount } from './testUtils';
import { S } from '../strings';
import type { NodeSummary } from '../../core/flow/nodeSummary';
import type { Recommendation } from '../../core/recommend/types';

/**
 * V1.5 VB-27 — the card, as markup.
 *
 * What it draws and what it deliberately leaves out. The three ways it opens,
 * where it sits and the fact that Escape closes it are all things a browser
 * decides, and they are proved in tests/e2e/node-summary.spec.ts against a
 * real pointer, a real focus ring and real geometry.
 */

const ROLES: NodeSummary = {
  nodeId: 'sec2-1',
  label: '2.1 Roles',
  items: 3,
  itemKind: 'record',
  categoryBy: 'Who or what is this role for?',
  categories: [
    { label: 'My employer', count: 2 },
    { label: 'My community', count: 1 },
  ],
  categoriesHidden: 0,
  answered: 12,
  total: 13,
  skipped: 1,
  ageDays: 96,
  elapsed: { value: 3, unit: 'month' },
};

const ONE_ANSWER: NodeSummary = {
  nodeId: 'sec2-4',
  label: '2.4 Decision Rights',
  items: 1,
  itemKind: 'answer',
  categoryBy: '',
  categories: [],
  categoriesHidden: 0,
  answered: 1,
  total: 1,
  skipped: 0,
  ageDays: 0,
  elapsed: { value: 0, unit: 'day' },
};

const ROLE_STALE: Recommendation = {
  id: 'role-stale:0',
  kind: 'role-stale',
  nodeId: 'sec2-1',
  rank: 120,
  target: { in: 'repeatable', blockId: 'roles', recordIndex: 0, questionId: 'role_durability' },
  role: 'Manager / Team Lead',
  elapsed: { value: 7, unit: 'month' },
};

const render = (summary: NodeSummary, recommendation?: Recommendation) =>
  mount(
    <NodeSummaryCard
      id="summary-1"
      summary={summary}
      recommendation={recommendation}
      place="bottom"
      room={220}
    />,
  );

describe('NodeSummaryCard — what it says', () => {
  it('names the node the way the file names it, not the way the stage does', () => {
    const { container, unmount } = render(ROLES);
    expect(container.querySelector('.nodesummary-name')!.textContent).toBe('2.1 Roles');
    unmount();
  });

  it('counts records as things the person named, and answers as answers', () => {
    const named = render(ROLES);
    expect(named.container.querySelector('.nodesummary-count')!.textContent).toContain('3 things named here');
    named.unmount();

    const answered = render(ONE_ANSWER);
    expect(answered.container.querySelector('.nodesummary-count')!.textContent).toContain('1 answer here');
    answered.unmount();
  });

  it('prints the age as a fact about the file — "3 months old", never a count of neglect', () => {
    const { container, unmount } = render(ROLES);
    const count = container.querySelector('.nodesummary-count')!.textContent!;
    expect(count).toContain('3 months old');
    expect(count).not.toMatch(/not|haven|since you/i);
    unmount();
  });

  it('says "written today" rather than "0 days old"', () => {
    const { container, unmount } = render(ONE_ANSWER);
    expect(container.querySelector('.nodesummary-count')!.textContent).toContain(S.summaryToday);
    unmount();
  });

  it('lists every category with its own count, biggest first, as core ordered them', () => {
    const { container, unmount } = render(ROLES);
    const cats = [...container.querySelectorAll('.nodesummary-cat')].map((c) => c.textContent);
    expect(cats).toEqual(['My employer — 2', 'My community — 1']);
    unmount();
  });

  it('names the distribution with the question it groups by — heard, not printed', () => {
    // A whole spoken sentence costs two of the four lines this card gets at
    // 260px, and the labels under it already say what they are. It is the
    // list's accessible name instead, so nothing is lost to a screen reader.
    const { container, unmount } = render(ROLES);
    expect(container.querySelector('.nodesummary-cats')!.getAttribute('aria-label')).toBe(
      'Who or what is this role for?',
    );
    unmount();
  });

  it('says how many categories were left over rather than quietly dropping them', () => {
    const { container, unmount } = render({ ...ROLES, categoriesHidden: 2 });
    expect(container.querySelector('.nodesummary-cat[data-more="true"]')!.textContent).toBe('2 more');
    unmount();
  });

  it('draws no category row at all where a node has no records', () => {
    const { container, unmount } = render(ONE_ANSWER);
    expect(container.querySelector('.nodesummary-cats')).toBeNull();
    unmount();
  });

  it('prints the counts and the skips, in the List\'s own words', () => {
    const { container, unmount } = render(ROLES);
    expect(container.querySelector('.nodesummary-metrics')!.textContent).toBe('12 of 13 answered · 1 skipped');
    unmount();
  });

  it('drops the answered count where every question in the node is in', () => {
    // "1 answer here" then "1 of 1 answered" is one fact typed twice; so is
    // "3 things named here" then "13 of 13 answered".
    const one = render(ONE_ANSWER);
    expect(one.container.querySelector('.nodesummary-metrics')).toBeNull();
    one.unmount();

    const full = render({ ...ROLES, answered: 13, total: 13, skipped: 0 });
    expect(full.container.querySelector('.nodesummary-metrics')).toBeNull();
    full.unmount();
  });

  it('keeps the answered count where a node of answers is only part done', () => {
    const { container, unmount } = render({ ...ONE_ANSWER, items: 1, answered: 1, total: 3 });
    expect(container.querySelector('.nodesummary-metrics')!.textContent).toBe('1 of 3 answered');
    unmount();
  });

  it('prints no metrics line at all when the caller had no health for the node', () => {
    const { container, unmount } = render({ ...ROLES, answered: 0, total: 0, skipped: 0 });
    expect(container.querySelector('.nodesummary-metrics')).toBeNull();
    unmount();
  });

  /** docs/GUARDRAILS.md: real metrics only. Counts and a date, and no digit on
   * this card that is a fraction of anything. */
  it('shows no percentage and no score anywhere', () => {
    const { container, unmount } = render(ROLES, ROLE_STALE);
    expect(container.textContent).not.toMatch(/%|score|health|\bout of 100\b/i);
    unmount();
  });
});

describe('NodeSummaryCard — where a recommendation attaches', () => {
  it('prints the recommendation in the same words Home prints it in', () => {
    const { container, unmount } = render(ROLES, ROLE_STALE);
    expect(container.querySelector('.nodesummary-rec-headline')!.textContent).toBe(S.driftHeading(1));
    expect(container.querySelector('.nodesummary-rec-why')!.textContent).toBe(
      S.driftBecauseRole('Manager / Team Lead', '7 months'),
    );
    unmount();
  });

  it('carries the recommendation\'s own id, so hiding it on Home is the same offer', () => {
    const { container, unmount } = render(ROLES, ROLE_STALE);
    expect(container.querySelector('.nodesummary-rec')!.getAttribute('data-rec-id')).toBe('role-stale:0');
    unmount();
  });

  it('has no recommendation section at all when there is nothing to offer', () => {
    const { container, unmount } = render(ROLES);
    expect(container.querySelector('.nodesummary-rec')).toBeNull();
    unmount();
  });

  /**
   * The card opens on hover and closes when the pointer leaves. A control
   * inside it would be a control a person has to chase, and a tab stop that
   * was never announced. The recommendation is acted on where it can be seen
   * without hovering anything — Home's list.
   */
  it('holds nothing focusable, so there is nothing to trap and nothing to chase', () => {
    const { container, unmount } = render(ROLES, ROLE_STALE);
    expect(container.querySelectorAll('button, a, input, select, textarea, [tabindex]')).toHaveLength(0);
    unmount();
  });

  it('takes the room it was given, so it can never reach the node it describes', () => {
    const { container, unmount } = render(ROLES, ROLE_STALE);
    const card = container.querySelector('.nodesummary') as HTMLElement;
    expect(card.style.getPropertyValue('--nodesummary-room')).toBe('220px');
    unmount();
  });

  it('is a tooltip, named by nothing and described by everything it prints', () => {
    const { container, unmount } = render(ROLES, ROLE_STALE);
    const card = container.querySelector('.nodesummary')!;
    expect(card.getAttribute('role')).toBe('tooltip');
    expect(card.id).toBe('summary-1');
    unmount();
  });
});
