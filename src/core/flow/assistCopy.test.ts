import { describe, it, expect } from 'vitest';
import {
  ASSIST_ENCOURAGING_LEAD,
  ASSIST_LINE_COPY,
  ASSIST_LINE_RETURN,
  allAssistCopy,
  assistPasteLine,
  assistStepLine,
} from './assistCopy';

describe('the AI Assist sheet lines (VB-119)', () => {
  it('walks copy → paste-into → paste-back, one line per step', () => {
    expect(assistStepLine(1, undefined)).toBe(ASSIST_LINE_COPY);
    expect(assistStepLine(2, 'ChatGPT')).toBe('Paste it into ChatGPT.');
    expect(assistStepLine(3, undefined)).toBe(ASSIST_LINE_RETURN);
  });

  it('names their AI on step 2 and degrades to "your AI", never to a broken sentence', () => {
    expect(assistPasteLine('Claude')).toBe('Paste it into Claude.');
    expect(assistPasteLine(undefined)).toBe('Paste it into your AI.');
    expect(assistPasteLine(undefined)).not.toContain('undefined');
  });

  it('every line is short — a narrator beat, not a paragraph', () => {
    for (const line of allAssistCopy()) {
      expect(line.split(/\s+/).length, line).toBeLessThanOrEqual(12);
    }
  });

  /**
   * VB-120 FLAG 3 — GUARDRAILS' no-guilt-nudges, held as an assertion. The
   * encouraging lead is an offer about a strong start; the moment it names
   * a deficiency ("short", "too", "more", "only", "just a few words") it is
   * a shame nudge wearing a smile, and this test fails the build instead of
   * leaving that to a reviewer's eye.
   */
  it('the encouraging lead never names a deficiency', () => {
    const lead = ASSIST_ENCOURAGING_LEAD.toLowerCase();
    for (const accusation of ['short', ' too ', 'more detail', 'only', 'not enough', 'longer', 'brief']) {
      expect(lead, `"${ASSIST_ENCOURAGING_LEAD}" reads as a verdict`).not.toContain(accusation);
    }
    // And it stays an offer: no "your answer" — it is about the interview,
    // not about what is already in the box.
    expect(lead).not.toContain('your answer');
  });
});

// ── reading level, which the audit cannot see ──────────────────────────────

/**
 * The audit's own Flesch-Kincaid, transcribed — same numbers as
 * overrides.test.ts / interviewMe.test.ts, for the same reason: these lines
 * are user-facing copy living in core, so they carry their own measurement.
 */
function readingGrade(strings: string[]): number {
  const syllables = (word: string) => {
    const groups = word.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '').match(/[aeiouy]+/g);
    return Math.max(1, groups ? groups.length : 1);
  };
  let words = 0;
  let sentences = 0;
  let syllableCount = 0;
  for (const s of strings) {
    const ws = s.split(/\s+/).filter(Boolean);
    words += ws.length;
    sentences += Math.max(1, (s.match(/[.?!]/g) ?? []).length);
    for (const w of ws) syllableCount += syllables(w);
  }
  return 0.39 * (words / sentences) + 11.8 * (syllableCount / words) - 15.59;
}

describe('reading level (npm run audit cannot see this file)', () => {
  it('reads at grade 7 or below across every line it ships', () => {
    const grade = readingGrade(allAssistCopy());
    expect(grade, `assistCopy reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
  });

  it('never runs a sentence past 20 words (docs/design-system.html §08)', () => {
    for (const line of allAssistCopy()) {
      for (const sentence of line.split(/(?<=[.?!])\s+/)) {
        const words = sentence.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
        expect(words.length, `"${sentence}"`).toBeLessThanOrEqual(20);
      }
    }
  });
});
