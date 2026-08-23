import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { RecommendationRow, recommendationCopy } from './Recommendation';
import { mount } from './testUtils';
import { S } from '../strings';
import type { Recommendation } from '../../core/recommend/types';

const EVERY_KIND: Recommendation[] = [
  {
    id: 'role-stale:0',
    kind: 'role-stale',
    nodeId: 'sec2-1',
    rank: 120,
    target: { in: 'repeatable', blockId: 'roles', recordIndex: 0, questionId: 'role_durability' },
    role: 'My employer',
    elapsed: { value: 7, unit: 'month' },
  },
  {
    id: 'section-stale:sec3',
    kind: 'section-stale',
    nodeId: 'sec3',
    rank: 100,
    target: { in: 'top', questionId: 'entities_gate' },
    section: 'My World',
    elapsed: { value: 5, unit: 'month' },
  },
  {
    id: 'initiative-no-success:1',
    kind: 'initiative-no-success',
    nodeId: 'sec4',
    rank: 80,
    target: { in: 'repeatable', blockId: 'initiatives_records', recordIndex: 1, questionId: 'initiative_success' },
    initiative: 'the Atlas migration',
  },
  {
    id: 'section-empty:sec9',
    kind: 'section-empty',
    nodeId: 'sec9',
    rank: 60,
    target: { in: 'top', questionId: 'standards_list' },
    section: 'Context Boundaries',
    questions: 2,
  },
  {
    id: 'entities-thin:sec3',
    kind: 'entities-thin',
    nodeId: 'sec3',
    rank: 40,
    target: { in: 'repeatable', blockId: 'entities', recordIndex: 0, questionId: 'entity_name' },
    named: 1,
  },
  {
    id: 'initiatives-thin:sec4',
    kind: 'initiatives-thin',
    nodeId: 'sec4',
    rank: 20,
    target: { in: 'repeatable', blockId: 'initiatives_records', recordIndex: 0, questionId: 'initiative_name' },
    named: 1,
  },
];

/** Words that would turn help into a scold. VB-28's own test case: "Most
 * people name three or four people here" is help; "You've only named one" is
 * a scold. This is that line, held by a test. */
const SCOLDING = [
  /\bonly\b/i,
  /\bstill\b haven/i,
  /\bfail/i,
  /\bneglect/i,
  /\bshould have\b/i,
  /\bforgot/i,
  /\bmissing\b/i,
  /\bincomplete\b/i,
  /\bempty\b/i,
  /\boverdue\b/i,
  /\bdays ago\b/i,
];

describe('recommendationCopy', () => {
  it.each(EVERY_KIND)('gives every kind a headline, a reason and an action ($kind)', (rec) => {
    const copy = recommendationCopy(rec);
    expect(copy.headline.length).toBeGreaterThan(0);
    expect(copy.why.length).toBeGreaterThan(0);
    expect(copy.action.length).toBeGreaterThan(0);
  });

  it('names the concrete thing, in the person’s own words', () => {
    expect(recommendationCopy(EVERY_KIND[0]!).why).toContain('My employer');
    expect(recommendationCopy(EVERY_KIND[1]!).headline).toContain('My World');
    expect(recommendationCopy(EVERY_KIND[2]!).headline).toContain('the Atlas migration');
    expect(recommendationCopy(EVERY_KIND[3]!).headline).toContain('Context Boundaries');
  });

  it('reuses R1-12’s approved words for the stale role, unchanged', () => {
    const copy = recommendationCopy(EVERY_KIND[0]!);
    expect(copy.headline).toBe(S.driftHeading(1));
    expect(copy.why).toBe(S.driftBecauseRole('My employer', S.agoLabel(7, 'month')));
    expect(copy.action).toBe(S.driftAction(1));
  });

  it.each(EVERY_KIND)('never scolds ($kind)', (rec) => {
    const copy = recommendationCopy(rec);
    for (const line of [copy.headline, copy.why, copy.action]) {
      for (const pattern of SCOLDING) {
        expect(line, `${line} matched ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it.each(EVERY_KIND)('keeps every line under twenty words ($kind)', (rec) => {
    const copy = recommendationCopy(rec);
    for (const line of [copy.headline, copy.why, copy.action]) {
      expect(line.split(/\s+/).length, line).toBeLessThan(20);
    }
  });

  it('never prints a score, a percentage or a grade', () => {
    for (const rec of EVERY_KIND) {
      const copy = recommendationCopy(rec);
      const all = `${copy.headline} ${copy.why} ${copy.action}`;
      expect(all).not.toMatch(/%/);
      expect(all).not.toMatch(/\bscore\b/i);
      expect(all).not.toMatch(/out of \d/i);
      expect(all).not.toMatch(/\d+\s*\/\s*\d+/);
    }
  });

  it('handles a one-question section without a plural', () => {
    const one: Recommendation = { ...EVERY_KIND[3]!, questions: 1 } as Recommendation;
    expect(recommendationCopy(one).why).not.toMatch(/questions/);
  });
});

describe('RecommendationRow', () => {
  const rec = EVERY_KIND[2]!;

  it('prints the headline and what pressing it does', () => {
    const { container } = mount(<RecommendationRow rec={rec} onAct={() => {}} onHide={() => {}} />);
    const copy = recommendationCopy(rec);
    expect(container.querySelector('.rec-row-headline')?.textContent).toBe(copy.headline);
    expect(container.querySelector('.rec-row-action')?.textContent).toBe(copy.action);
  });

  it('is two separate buttons, never a button inside a button', () => {
    const { container } = mount(<RecommendationRow rec={rec} onAct={() => {}} onHide={() => {}} />);
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(container.querySelector('button button')).toBeNull();
  });

  it('hands the whole recommendation back, so the caller never re-derives it', () => {
    const onAct = vi.fn();
    const onHide = vi.fn();
    const { container } = mount(<RecommendationRow rec={rec} onAct={onAct} onHide={onHide} />);
    const [act1, hide] = [...container.querySelectorAll('button')] as HTMLButtonElement[];
    act(() => act1!.click());
    act(() => hide!.click());
    expect(onAct).toHaveBeenCalledWith(rec);
    expect(onHide).toHaveBeenCalledWith(rec);
  });

  it('gives the hide control a name of its own, so three of them are three controls', () => {
    const a = mount(<RecommendationRow rec={EVERY_KIND[2]!} onAct={() => {}} onHide={() => {}} />);
    const b = mount(<RecommendationRow rec={EVERY_KIND[4]!} onAct={() => {}} onHide={() => {}} />);
    const nameOf = (m: { container: HTMLElement }) =>
      m.container.querySelector('.rec-row-hide')?.getAttribute('aria-label');
    expect(nameOf(a)).toBeTruthy();
    expect(nameOf(a)).not.toBe(nameOf(b));
  });

  it('carries its kind and id in the markup, so a test can point at one', () => {
    const { container } = mount(<RecommendationRow rec={rec} onAct={() => {}} onHide={() => {}} />);
    const row = container.querySelector('.rec-row')!;
    expect(row.getAttribute('data-rec-kind')).toBe(rec.kind);
    expect(row.getAttribute('data-rec-id')).toBe(rec.id);
  });
});
