import { describe, it, expect } from 'vitest';
import { DEEP_DIVE, HINT_STAYS_VISIBLE, deepDiveFor, hintStaysVisible } from './deepDive';
import { adaptContextFlow } from './adapter';
import { DEEP_DIVE_ALIASES } from './overrides';
import type { Module, Step } from '../../schema/flow.types';

/**
 * V1.1 VB-03. Two jobs here:
 *
 * 1. Keep the id-keyed map honest against the real interview — a typo in a
 *    key is otherwise completely silent: the entry simply never renders.
 * 2. Measure this copy's reading level. `npm run audit`'s reading-level rule
 *    only reads src/panel/strings.ts, so this content — 42 pairs of newly
 *    authored, user-facing copy living in core/ — would ship unmeasured
 *    without the test at the bottom of this file.
 */

function everyStep(modules: Module[]): Step[] {
  return modules.flatMap((m) =>
    m.nodes.flatMap((node) => ('fields' in node ? node.fields : [node])),
  );
}

const { modules } = adaptContextFlow();
const steps = everyStep(modules);
const stepById = new Map(steps.map((s) => [s.id, s]));
const ids = Object.keys(DEEP_DIVE);

describe('deepDive data', () => {
  it('covers the 27 questions specified in docs/V1.1-COPY-DRAFT.md', () => {
    // The draft's own prose says "26 in total" (24 hinted questions plus
    // context_scope and rigor_before_acting), but it also authors a full
    // deep-dive for `negative_responsibility`, which carries no hint today
    // and so was not in that tally. The approved copy is the source of
    // truth, not its own count — all 27 sections ship. Flagged in the
    // VB-03 report rather than silently dropping approved copy.
    // V2.3 VB-89 adds 9 more (the [DRAFT] sweep over the open-text
    // questions V1.1 left bare — deepDive.ts's own comment lists the
    // factual one-liners deliberately kept bare).
    expect(ids).toHaveLength(36);
  });

  it('every entry has a non-empty question and a non-empty answer', () => {
    for (const [id, entries] of Object.entries(DEEP_DIVE)) {
      expect(entries.length, `"${id}" has no entries`).toBeGreaterThan(0);
      entries.forEach((entry, i) => {
        expect(entry.q.trim(), `"${id}"[${i}].q`).not.toBe('');
        expect(entry.a.trim(), `"${id}"[${i}].a`).not.toBe('');
      });
    }
  });

  it('every key names a question that actually exists in the interview', () => {
    for (const id of ids) {
      expect(stepById.has(id), `deepDive key "${id}" matches no question`).toBe(true);
    }
  });

  it('lists questions in flow order, so the file stays readable next to the interview', () => {
    const flowOrder = steps.map((s) => s.id).filter((id) => id in DEEP_DIVE);
    expect(ids).toEqual(flowOrder);
  });

  it('asks a real question — every `q` ends in a question mark', () => {
    for (const [id, entries] of Object.entries(DEEP_DIVE)) {
      for (const entry of entries) {
        expect(entry.q.endsWith('?'), `"${id}": "${entry.q}"`).toBe(true);
      }
    }
  });

  it('has no duplicate follow-up question within one step', () => {
    for (const [id, entries] of Object.entries(DEEP_DIVE)) {
      expect(new Set(entries.map((e) => e.q)).size, `"${id}" repeats a question`).toBe(entries.length);
    }
  });

  it('deepDiveFor reads the map; unknown ids come back undefined, never empty', () => {
    expect(deepDiveFor('role_names')).toBe(DEEP_DIVE.role_names);
    expect(deepDiveFor('preferred_name')).toBeUndefined();
  });
});

describe('the worked-example exception (VB-03, decided not open)', () => {
  it('names exactly the three voice questions', () => {
    expect([...HINT_STAYS_VISIBLE].sort()).toEqual([
      'voice_directness',
      'voice_formality',
      'voice_qualification',
    ]);
    expect(hintStaysVisible('voice_directness')).toBe(true);
    expect(hintStaysVisible('role_names')).toBe(false);
  });

  it('each of the three has BOTH a real hint and a deep-dive', () => {
    for (const id of HINT_STAYS_VISIBLE) {
      const step = stepById.get(id);
      expect(step, `no step "${id}"`).toBeDefined();
      expect(step?.hint, `"${id}" must keep a visible hint`).toBeTruthy();
      expect(step?.deepDive?.length, `"${id}" must also have a deep-dive`).toBeGreaterThan(0);
    }
  });

  it("their hints really are worked examples — the reason they stay visible", () => {
    for (const id of HINT_STAYS_VISIBLE) {
      // The ported hints read "Diplomatic: … Balanced: … Blunt: …" — three
      // labelled samples. If a rewrite ever turned one into prose, the
      // exception would no longer be justified and this should fail.
      expect(stepById.get(id)?.hint, `"${id}"`).toMatch(/:/);
    }
  });
});

describe('the adapter attaches deep-dives onto the real steps', () => {
  it('every mapped question carries its entries, byte-identical', () => {
    for (const [id, entries] of Object.entries(DEEP_DIVE)) {
      expect(stepById.get(id)?.deepDive, `"${id}"`).toEqual(entries);
    }
  });

  it('reaches repeatable sub-questions too, not just top-level steps', () => {
    const roleFor = modules
      .flatMap((m) => m.nodes)
      .flatMap((n) => ('fields' in n ? n.fields : []))
      .find((f) => f.id === 'role_for');
    expect(roleFor?.deepDive).toHaveLength(1);
  });

  /**
   * V2.0 VB-61/VB-63 added the one exception, and it is deliberately narrow: a
   * question this repo INSERTED may borrow the follow-ups written for the
   * ported question it now stands in front of, through
   * `core/flow/overrides.ts`'s `DEEP_DIVE_ALIASES`. That copy is about the
   * SECTION, not about answering yes or no, so it belongs on the screen that
   * opens the section. Asserted against the alias map rather than waved
   * through, so a third id cannot quietly acquire a follow-up nobody wrote for
   * it — and asserted byte-identical, so the alias is a pointer to V1.1's
   * approved copy rather than a second copy of it that could drift.
   */
  it('leaves every other question alone, bar the aliases V2.0 declares', () => {
    for (const step of steps) {
      if (step.id in DEEP_DIVE) continue;
      const alias = DEEP_DIVE_ALIASES[step.id];
      if (alias) {
        expect(step.deepDive, `"${step.id}" should carry "${alias}"'s`).toEqual(DEEP_DIVE[alias]);
        continue;
      }
      expect(step.deepDive, `"${step.id}" should have no deep-dive`).toBeUndefined();
    }
  });

  it('never invents a deep-dive when none is supplied', () => {
    const { modules: bare } = adaptContextFlow(undefined, undefined, {});
    expect(everyStep(bare).some((s) => s.deepDive)).toBe(false);
  });

  it('every question that hides its hint behind a deep-dive still shows something', () => {
    // The disclosure replaces the hint for these; if a question had a hint,
    // a deep-dive, and no entries, the person would lose the guidance
    // entirely. Guarded here rather than trusted to review.
    for (const id of ids) {
      if (hintStaysVisible(id)) continue;
      expect(stepById.get(id)?.deepDive?.length, `"${id}"`).toBeGreaterThan(0);
    }
  });
});

/**
 * Flesch-Kincaid grade, using `scripts/audit.mjs`'s exact formula and
 * syllable heuristic — deliberately the same numbers the audit would print,
 * so "grade 7" means the same thing on both sides of the src/panel boundary.
 * Every `q` and `a` is measured, with none of the audit's own >=25-character
 * filter, so short lines count here too.
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
  it('reads at grade 7 or below, across every question and answer', () => {
    const all = Object.values(DEEP_DIVE).flatMap((entries) => entries.flatMap((e) => [e.q, e.a]));
    expect(all).toHaveLength(108);
    const grade = readingGrade(all);
    expect(grade, `deepDive.ts reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
  });

  it('never runs a sentence past 20 words (docs/design-system.html §08)', () => {
    // "If a sentence runs past 20 words, split it" — 20 is the ceiling, not
    // the first failure. A standalone em dash is punctuation, not a word,
    // so it does not count towards the total.
    for (const [id, entries] of Object.entries(DEEP_DIVE)) {
      for (const entry of entries) {
        for (const sentence of `${entry.q} ${entry.a}`.split(/(?<=[.?!])\s+/)) {
          const words = sentence.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
          expect(words.length, `"${id}": "${sentence}"`).toBeLessThanOrEqual(20);
        }
      }
    }
  });
});
