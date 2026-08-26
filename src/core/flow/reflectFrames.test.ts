import { describe, it, expect } from 'vitest';
import type { FlowContext } from '../../schema/flow.types';
import {
  DEFAULT_REFLECT_LEAD,
  REFLECT_LEADS,
  goalServiceLabelFor,
  reflectLeadFor,
  reflectVoiceLine,
} from './reflectFrames';
import { contextModules } from './flow';
import { SKILLS_INTERVIEW_MODULES } from './skillsSource';

const EMPTY: FlowContext = { answers: {}, repeatables: {} };

describe('reflectLeadFor', () => {
  it('covers all six interpret-bearing context questions with a bespoke reframe', () => {
    // The R1-07 list, confirmed in runner.test.ts.
    const six = [
      'stop_explaining',
      'self_description',
      'role_mandate',
      'responsibilities_list',
      'initiative_description',
      'terms_depend_on',
    ];
    for (const id of six) {
      expect(REFLECT_LEADS[id], id).toBeTruthy();
      expect(reflectLeadFor({ id })).toBe(REFLECT_LEADS[id]);
    }
    // ...and every reframe opens conversationally — the "So …" register is
    // the whole point of VB-95.
    for (const lead of Object.values(REFLECT_LEADS)) expect(lead.startsWith('So ')).toBe(true);
  });

  it('the six really are the interpret carriers in the shipped flow — the map cannot silently rot', () => {
    const carriers = contextModules
      .flatMap((m) => m.nodes)
      .flatMap((node) => ('fields' in node ? node.fields : [node]))
      .filter((step) => step.interpret)
      .map((step) => step.id);
    expect(carriers.sort()).toEqual(Object.keys(REFLECT_LEADS).sort());
  });

  it("a step with its own authored reflectPrefix keeps it — V2.2's skills copy is not superseded", () => {
    const step = { id: 'skill_steps', interpret: { via: 'ai-assist' as const, reflectPrefix: "Here's the recipe I heard:" } };
    expect(reflectLeadFor(step)).toBe("Here's the recipe I heard:");
    // And the real skills flow still carries at least one such prefix.
    const skillsPrefixes = SKILLS_INTERVIEW_MODULES.flatMap((m) => m.nodes)
      .flatMap((node) => ('questions' in node ? node.questions : 'kind' in node && node.kind === 'question' ? [node] : []))
      .map((q) => ('interpret' in q ? q.interpret?.reflectPrefix : undefined))
      .filter(Boolean);
    expect(skillsPrefixes.length).toBeGreaterThan(0);
  });

  it('anything else gets the default', () => {
    expect(reflectLeadFor({ id: 'never_heard_of_it' })).toBe(DEFAULT_REFLECT_LEAD);
  });
});

describe('goalServiceLabelFor', () => {
  it('resolves the gate answer to its printed label, from the one list', () => {
    expect(goalServiceLabelFor({ answers: { goal_service: 'chatgpt' }, repeatables: {} })).toBe('ChatGPT');
    expect(goalServiceLabelFor({ answers: { goal_service: 'claude' }, repeatables: {} })).toBe('Claude');
  });

  it('resolves the V2.4 VB-105 additions too — "use your Grok chat" is a sentence', () => {
    expect(goalServiceLabelFor({ answers: { goal_service: 'grok' }, repeatables: {} })).toBe('Grok');
    expect(goalServiceLabelFor({ answers: { goal_service: 'perplexity' }, repeatables: {} })).toBe('Perplexity');
    expect(reflectVoiceLine(goalServiceLabelFor({ answers: { goal_service: 'grok' }, repeatables: {} }))).toContain(
      'use your Grok chat',
    );
  });

  it('"other", empty, skipped, and pre-gate files all resolve to nothing', () => {
    // "use your Something else chat" is not a sentence.
    expect(goalServiceLabelFor({ answers: { goal_service: 'other' }, repeatables: {} })).toBeUndefined();
    expect(goalServiceLabelFor({ answers: { goal_service: null }, repeatables: {} })).toBeUndefined();
    expect(goalServiceLabelFor(EMPTY)).toBeUndefined();
  });
});

describe('reflectVoiceLine', () => {
  it('names their AI when the gate knows it, and stays a sentence when it does not', () => {
    expect(reflectVoiceLine('ChatGPT')).toContain('use your ChatGPT chat');
    expect(reflectVoiceLine(undefined)).toContain('use your AI chat');
  });

  it('only ever points at buttons this screen has: keep, say it again, tighten', () => {
    const line = reflectVoiceLine('Claude');
    expect(line).toContain('keep it');
    expect(line).toContain('say it again');
    expect(line).toContain('tighten');
    // Adam's original said "click next" — adapted, because there is no Next
    // on the reflect screen and copy never points at a control that is not
    // there (design-system §08).
    expect(line).not.toContain('next');
  });
});

// ── reading level, which the audit cannot see ──────────────────────────────

/** The audit's own Flesch-Kincaid, transcribed — same numbers as
 * overrides.test.ts, for the same reason. */
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
  const everyLine = [
    ...Object.values(REFLECT_LEADS),
    DEFAULT_REFLECT_LEAD,
    reflectVoiceLine('ChatGPT'),
    reflectVoiceLine(undefined),
  ];

  it('reads at grade 7 or below across every line it ships', () => {
    const grade = readingGrade(everyLine);
    expect(grade, `reflectFrames reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
  });

  it('never runs a sentence past 20 words (docs/design-system.html §08)', () => {
    for (const line of everyLine) {
      for (const sentence of line.split(/(?<=[.?!])\s+/)) {
        const words = sentence.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
        expect(words.length, `"${sentence}"`).toBeLessThanOrEqual(20);
      }
    }
  });
});
