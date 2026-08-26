import { describe, it, expect } from 'vitest';
import { PROOF_SERVICES, ATTACH_FALLBACK_SUFFIX } from './proofSource';
import { ALL_PROOF_SERVICES, PROOF_SERVICE_ADDITIONS, allAdditionCopy } from './proofAdditions';
import { attachHintFor } from './proofAdapter';

/**
 * V2.4 VB-105 (FLAG 3) — the additions seam. Three jobs:
 *
 * 1. Hold the boundary: importing the additions must leave the port snapshot
 *    byte-identical — the whole point of a seam is that the snapshot never
 *    learns it exists.
 * 2. Pin the merged list's shape: the spec's order, "other" still last and
 *    still the fallback.
 * 3. Measure the authored tips' reading level, since the audit only reads
 *    src/panel/strings.ts and the port's verbatim exemption does not cover a
 *    sentence this repo wrote (the overrides.test.ts convention).
 */

describe('the verbatim boundary holds (FLAG 3)', () => {
  it('PROOF_SERVICES is still exactly the five ported entries — the snapshot is untouched', () => {
    // The same census proofAdapter.test.ts pins; repeated here because THIS
    // file is the one that could have broken it.
    expect(PROOF_SERVICES.map((s) => s.key)).toEqual(['chatgpt', 'claude', 'gemini', 'copilot', 'other']);
  });

  it('the additions are grok and perplexity, and nothing ported', () => {
    expect(PROOF_SERVICE_ADDITIONS.map((s) => s.key)).toEqual(['grok', 'perplexity']);
    for (const addition of PROOF_SERVICE_ADDITIONS) {
      expect(PROOF_SERVICES.some((ported) => ported.key === addition.key), addition.key).toBe(false);
    }
  });
});

describe('ALL_PROOF_SERVICES — the one merged list', () => {
  it("matches the spec's roll-call, with 'other' kept last as the fallback seat", () => {
    expect(ALL_PROOF_SERVICES.map((s) => s.key)).toEqual([
      'chatgpt',
      'claude',
      'gemini',
      'copilot',
      'grok',
      'perplexity',
      'other',
    ]);
  });

  it('never duplicates a key, whatever the merge does', () => {
    const keys = ALL_PROOF_SERVICES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('carries every ported entry byte-identical — merged, not rewritten', () => {
    for (const ported of PROOF_SERVICES) {
      expect(ALL_PROOF_SERVICES.find((s) => s.key === ported.key)).toEqual(ported);
    }
  });
});

describe('the authored attach tips', () => {
  it('reach the with-context screen through attachHintFor, fallback sentence and all', () => {
    for (const addition of PROOF_SERVICE_ADDITIONS) {
      expect(attachHintFor(addition.key)).toBe(`${addition.attachTip} ${ATTACH_FALLBACK_SUFFIX}`);
    }
  });

  it("speak the ported tips' own voice — one sentence ending in attach Context.md", () => {
    for (const addition of PROOF_SERVICE_ADDITIONS) {
      expect(addition.attachTip, addition.key).toMatch(/^Click .+ near the message box and attach Context\.md\.$/);
    }
  });

  it('did not change what an unknown or unselected service falls back to', () => {
    const other = PROOF_SERVICES.find((s) => s.key === 'other')!;
    expect(attachHintFor(undefined)).toBe(`${other.attachTip} ${ATTACH_FALLBACK_SUFFIX}`);
    expect(attachHintFor('not-a-real-service')).toBe(`${other.attachTip} ${ATTACH_FALLBACK_SUFFIX}`);
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
  it('reads at grade 7 or below across every line it ships', () => {
    const grade = readingGrade(allAdditionCopy());
    expect(grade, `proofAdditions reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
  });

  it('never runs a sentence past 20 words (docs/design-system.html §08)', () => {
    for (const line of allAdditionCopy()) {
      for (const sentence of line.split(/(?<=[.?!])\s+/)) {
        const words = sentence.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
        expect(words.length, `"${sentence}"`).toBeLessThanOrEqual(20);
      }
    }
  });
});
