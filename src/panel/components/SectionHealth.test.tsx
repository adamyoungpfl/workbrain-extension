import { describe, it, expect } from 'vitest';
import { HealthPill, HealthSummary, healthDetail } from './SectionHealth';
import { mount } from './testUtils';
import { S } from '../strings';
import type { SectionHealth, SectionHealthState, SectionHealthSummary } from '../../core/freshness/sectionHealth';

/**
 * V1.3 VB-19. The derivation is tested without a browser in
 * core/freshness/sectionHealth.test.ts and the rendering is tested in a real
 * one in tests/e2e/section-health.spec.ts. This covers the seam between them:
 * that every state prints a word AND a glyph, that the detail line composes
 * the way the copy rules say, and that the summary prints counts rather than
 * congratulations.
 */

function health(over: Partial<SectionHealth> = {}): SectionHealth {
  return {
    id: 'sec1',
    state: 'done',
    total: 8,
    answered: 8,
    skipped: 0,
    left: 0,
    due: 0,
    lastAnsweredAt: '2026-01-01T00:00:00.000Z',
    ageDays: 210,
    elapsed: { value: 7, unit: 'month' },
    halfLifeDays: 365,
    ...over,
  };
}

function summary(over: Partial<SectionHealthSummary> = {}): SectionHealthSummary {
  return { here: 0, done: 0, due: 0, partly: 0, notYet: 0, needsAttention: 0, ...over };
}

const ALL_STATES: SectionHealthState[] = ['here', 'done', 'due', 'partly', 'not-yet'];

describe('HealthPill', () => {
  it('gives every state a word and a glyph — never colour alone', () => {
    const seen = new Set<string>();
    for (const state of ALL_STATES) {
      const { container, unmount } = mount(<HealthPill state={state} />);
      const pill = container.querySelector('.sectionhealth-pill') as HTMLElement;
      const glyph = pill.querySelector('.sectionhealth-glyph') as HTMLElement;

      expect(glyph.textContent, state).toMatch(/^\[.\]$/);
      expect(glyph.getAttribute('aria-hidden'), state).toBe('true');
      const word = pill.textContent!.replace(glyph.textContent!, '').trim();
      expect(word.length, state).toBeGreaterThan(0);

      // Every glyph and every word is unique to its state, or the signal is
      // not actually carrying the distinction.
      expect(seen.has(glyph.textContent!), `glyph ${glyph.textContent}`).toBe(false);
      expect(seen.has(word), `word ${word}`).toBe(false);
      seen.add(glyph.textContent!).add(word);
      unmount();
    }
  });

  it('reuses the tree\'s own words for the state the tree already names', () => {
    const { container } = mount(<HealthPill state="not-yet" />);
    expect(container.querySelector('.sectionhealth-pill')!.textContent).toContain(S.fileTreeStateUntouched);
  });

  it('rides FileRow\'s badge, and marks the untouched one hollow as well as pale', () => {
    for (const state of ALL_STATES) {
      const { container, unmount } = mount(<HealthPill state={state} />);
      const pill = container.querySelector('.sectionhealth-pill') as HTMLElement;
      expect(pill.classList.contains('badge'), state).toBe(true);
      expect(pill.classList.contains('is-hollow'), state).toBe(state === 'not-yet');
      expect(pill.dataset.health, state).toBe(state);
      unmount();
    }
  });
});

describe('healthDetail', () => {
  it('says how much of the section is written, and how long ago', () => {
    expect(healthDetail(health())).toBe(`${S.sectionAnsweredOf(8, 8)} · ${S.sectionAnsweredAgo(S.agoLabel(7, 'month'))}`);
  });

  it('says what was passed on instead, when something was — one clause, never two', () => {
    const detail = healthDetail(health({ state: 'partly', answered: 3, skipped: 2, left: 1, total: 6 }))!;
    expect(detail).toBe(`${S.sectionAnsweredOf(3, 6)} · ${S.sectionSkipped(2)}`);
    expect(detail.split('·')).toHaveLength(2);
  });

  it('says "today" rather than "0 days ago"', () => {
    expect(healthDetail(health({ ageDays: 0, elapsed: { value: 0, unit: 'day' } }))).toBe(
      `${S.sectionAnsweredOf(8, 8)} · ${S.sectionAnsweredToday}`,
    );
  });

  it('is just the count when there is no stamp to report', () => {
    expect(healthDetail(health({ state: 'here', answered: 2, total: 6, left: 4, ageDays: null, elapsed: null, lastAnsweredAt: null }))).toBe(
      S.sectionAnsweredOf(2, 6),
    );
  });

  it('says nothing at all about a section nobody has touched', () => {
    expect(healthDetail(health({ state: 'not-yet', answered: 0, skipped: 0, left: 6, total: 6, ageDays: null, elapsed: null, lastAnsweredAt: null }))).toBe(null);
  });

  it('still speaks for the section being answered, even before its first answer', () => {
    // "Here" with nothing answered yet is the one empty section that earns a
    // second line: it is where the person is.
    expect(healthDetail(health({ state: 'here', answered: 0, skipped: 0, left: 6, total: 6, ageDays: null, elapsed: null, lastAnsweredAt: null }))).toBe(
      S.sectionAnsweredOf(0, 6),
    );
  });
});

describe('HealthSummary', () => {
  it('prints only what needs attention, in that order', () => {
    const { container } = mount(<HealthSummary summary={summary({ due: 2, partly: 3, notYet: 4, done: 1, needsAttention: 5 })} />);
    const pills = Array.from(container.querySelectorAll('.sectionhealth-pill')) as HTMLElement[];
    expect(pills.map((p) => p.dataset.healthSummary)).toEqual(['due', 'partly', 'not-yet']);
    expect(pills[0]!.textContent).toContain(S.badgeDue(2));
    expect(pills[1]!.textContent).toContain(S.sectionSummaryPartly(3));
    expect(pills[2]!.textContent).toContain(S.sectionSummaryNotYet(4));
  });

  it('leaves out a state with nothing in it', () => {
    const { container } = mount(<HealthSummary summary={summary({ due: 1, done: 9, needsAttention: 1 })} />);
    const pills = Array.from(container.querySelectorAll('.sectionhealth-pill')) as HTMLElement[];
    expect(pills.map((p) => p.dataset.healthSummary)).toEqual(['due']);
  });

  it('says how many sections are finished when nothing needs attention — a count, not a compliment', () => {
    const { container } = mount(<HealthSummary summary={summary({ done: 9, here: 1 })} />);
    const pills = Array.from(container.querySelectorAll('.sectionhealth-pill')) as HTMLElement[];
    expect(pills).toHaveLength(1);
    expect(pills[0]!.textContent).toContain(S.sectionSummaryDone(9));
    // Nothing congratulatory, nothing about a run, no score out of anything
    // (docs/GUARDRAILS.md).
    expect(container.textContent).not.toMatch(/great|nice|well done|streak|%|\/100/i);
  });

  it('is a named group, so a screen reader can describe it', () => {
    const { container } = mount(<HealthSummary summary={summary({ notYet: 10 })} />);
    const group = container.querySelector('.sectionhealth-summary') as HTMLElement;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe(S.sectionSummaryLabel);
  });
});
