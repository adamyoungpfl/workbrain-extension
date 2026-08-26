import { describe, it, expect } from 'vitest';
import type { FlowContext } from '../../schema/flow.types';
import { ANSWER_FENCE, interviewMePrompt, looksLikeFencedReply, normalizePastedReply } from './interviewMe';

const EMPTY: FlowContext = { answers: {}, repeatables: {} };

describe('interviewMePrompt', () => {
  it('carries the question verbatim and asks for one fenced block', () => {
    const prompt = interviewMePrompt('What do people ask you to explain?', EMPTY);
    expect(prompt).toContain('"What do people ask you to explain?"');
    expect(prompt).toContain('3 to 5 short questions');
    expect(prompt).toContain('one fenced code block');
  });

  it('grounds itself in the goal when the gate captured one (VB-93)', () => {
    const ctx: FlowContext = { answers: { goal_want: 'Draft my Monday update.' }, repeatables: {} };
    expect(interviewMePrompt('Q?', ctx)).toContain('"Draft my Monday update."');
    // ...and says nothing about a goal when there is none to name.
    expect(interviewMePrompt('Q?', EMPTY)).not.toContain('For context');
    const skipped: FlowContext = { answers: { goal_want: null }, repeatables: {} };
    expect(interviewMePrompt('Q?', skipped)).not.toContain('For context');
  });

  it('never mentions the fence by a name a person cannot act on', () => {
    // The instruction spells out "three backticks" — the person's AI needs
    // the mechanic, not our constant's name.
    expect(interviewMePrompt('Q?', EMPTY)).toContain('three backticks');
  });
});

describe('looksLikeFencedReply', () => {
  it('is the gate: fences in, everything else untouched', () => {
    expect(looksLikeFencedReply('```\nanswer\n```')).toBe(true);
    expect(looksLikeFencedReply('plain pasted paragraph')).toBe(false);
    expect(looksLikeFencedReply(ANSWER_FENCE)).toBe(true);
  });
});

describe('normalizePastedReply', () => {
  it('unwraps a single fenced block', () => {
    expect(normalizePastedReply('```\nMy answer, in my voice.\n```')).toBe('My answer, in my voice.');
  });

  it('keeps only the LAST fence when the AI narrated first', () => {
    const paste = [
      'Great — based on your answers, here it is:',
      '```',
      'Draft one.',
      '```',
      'Actually, tightened:',
      '```',
      'Draft two — the keeper.',
      '```',
    ].join('\n');
    expect(normalizePastedReply(paste)).toBe('Draft two — the keeper.');
  });

  it('drops a language tag on the opening fence', () => {
    expect(normalizePastedReply('```text\nThe answer.\n```')).toBe('The answer.');
  });

  it('strips numbering and bullets, however the AI drew them', () => {
    const paste = '```\n1. First thing\n2) Second thing\n- Third\n* Fourth\n• Fifth\n```';
    expect(normalizePastedReply(paste)).toBe('First thing\nSecond thing\nThird\nFourth\nFifth');
  });

  it('settles whitespace: trailing space off, blank runs to one, edges trimmed', () => {
    const paste = '```\n\n\nLine one.   \n\n\n\nLine two.\n\n\n```';
    expect(normalizePastedReply(paste)).toBe('Line one.\n\nLine two.');
  });

  it('an unterminated fence still yields what follows it', () => {
    expect(normalizePastedReply('```\nThe answer nobody closed.')).toBe('The answer nobody closed.');
  });

  it('no fence at all: bullets and whitespace still settle (the caller gates, this stays total)', () => {
    expect(normalizePastedReply('- a\n- b')).toBe('a\nb');
  });
});

// ── reading level, which the audit cannot see ──────────────────────────────

/**
 * The audit's own Flesch-Kincaid, transcribed — same numbers as
 * overrides.test.ts / deepDive.test.ts, for the same reason: this prompt is
 * user-facing copy living in core, so it carries its own measurement.
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
  const lines = interviewMePrompt('What do people ask you to explain?', {
    answers: { goal_want: 'Draft my Monday update.' },
    repeatables: {},
  })
    .split('\n')
    .filter((line) => line.trim() !== '');

  it('reads at grade 7 or below', () => {
    const grade = readingGrade(lines);
    expect(grade, `interviewMe prompt reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
  });

  it('never runs a sentence past 20 words (docs/design-system.html §08)', () => {
    for (const line of lines) {
      for (const sentence of line.split(/(?<=[.?!])\s+/)) {
        const words = sentence.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
        expect(words.length, `"${sentence}"`).toBeLessThanOrEqual(20);
      }
    }
  });
});
