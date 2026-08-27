import { describe, it, expect } from 'vitest';
import {
  ASSIST_THRESHOLD_MULTILINE,
  ASSIST_THRESHOLD_OVERRIDES,
  ASSIST_THRESHOLD_SINGLE_LINE,
  assistThreshold,
  underAssistThreshold,
} from './assistThresholds';
import type { Step } from '../../schema/flow.types';

function step(over: Partial<Step> = {}): Step {
  return { id: 't1', module: 0, section: 0, eyebrow: '', q: 'Q?', kind: 'text', ...over };
}

describe('assistThreshold — the per-kind table (VB-120, FLAG 3)', () => {
  it('multiline text carries the [DRAFT] 80-character bar', () => {
    expect(assistThreshold(step({ multiline: true }))).toBe(ASSIST_THRESHOLD_MULTILINE);
    expect(ASSIST_THRESHOLD_MULTILINE).toBe(80);
  });

  it('single-line text is 0 — never nudged, recheck behaviour unchanged', () => {
    expect(assistThreshold(step())).toBe(ASSIST_THRESHOLD_SINGLE_LINE);
    expect(ASSIST_THRESHOLD_SINGLE_LINE).toBe(0);
    // length < 0 is impossible, which is the whole point.
    expect(underAssistThreshold(step(), '')).toBe(false);
    expect(underAssistThreshold(step(), 'x')).toBe(false);
  });

  it('non-text kinds have no bar at all', () => {
    for (const kind of ['chips', 'multi', 'yesno', 'intro', 'gen', 'demo'] as const) {
      expect(assistThreshold(step({ kind })), kind).toBe(0);
    }
  });

  it('a per-question override wins over the kind row — the seam works', () => {
    ASSIST_THRESHOLD_OVERRIDES['t1'] = 120;
    try {
      expect(assistThreshold(step({ multiline: true }))).toBe(120);
      expect(underAssistThreshold(step({ multiline: true }), 'x'.repeat(100))).toBe(true);
    } finally {
      delete ASSIST_THRESHOLD_OVERRIDES['t1'];
    }
    expect(assistThreshold(step({ multiline: true }))).toBe(80);
  });

  it('ships with no overrides — the table is the policy today', () => {
    expect(Object.keys(ASSIST_THRESHOLD_OVERRIDES)).toEqual([]);
  });
});

describe('underAssistThreshold — evaluated live, at the boundary', () => {
  const multiline = step({ multiline: true });

  it('79 characters is under, 80 is at — "at/over threshold reflects as today"', () => {
    expect(underAssistThreshold(multiline, 'x'.repeat(79))).toBe(true);
    expect(underAssistThreshold(multiline, 'x'.repeat(80))).toBe(false);
    expect(underAssistThreshold(multiline, 'x'.repeat(200))).toBe(false);
  });

  it('whitespace is not substance — trimmed before measuring', () => {
    expect(underAssistThreshold(multiline, ' '.repeat(120))).toBe(true);
    expect(underAssistThreshold(multiline, `  ${'x'.repeat(80)}  `)).toBe(false);
    // Interior whitespace is real prose and counts as typed — 41 words
    // with their 40 spaces is 81 characters, over the bar.
    expect(underAssistThreshold(multiline, `${'x '.repeat(41)}`.trimEnd())).toBe(false);
  });

  it('is a pure judgement over its arguments — nothing is stored anywhere (FLAG 3)', () => {
    // Structural, not behavioural: the module exports only constants and
    // pure functions. Judging the same text twice gives the same answer,
    // and there is no state to make it otherwise.
    expect(underAssistThreshold(multiline, 'short')).toBe(underAssistThreshold(multiline, 'short'));
  });
});
