import { describe, it, expect } from 'vitest';
import type { AnswerValue } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { contextModules, contextOutline } from '../flow/flow';
import {
  applyAnswer,
  applyReflect,
  findPosition,
  findSeedTarget,
  reconcileSeededRepeatable,
} from '../flow/runner';
import { sectionHealthMap } from '../freshness/sectionHealth';
import { PAIRED_PICKS, PAIR_CAPTIONS, pairFor, pairedStepsFor, usesPairedPick } from './pairedPick';

/**
 * V2.5 VB-123 — the paired screen's seam, held against the real flow.
 *
 * The mechanism (see pairedPick.ts's header) leans on `findPosition`
 * behaving exactly as it always has — so the tests here are mostly runner
 * walks: the merged commit takes the flow PAST both keys, a pre-merge file
 * with half an answer resumes onto the missing half, and the section's
 * arithmetic still counts two questions. Plus the copy harness: the
 * captions are interview wording in core, which `npm run audit` cannot see
 * (the overrides.test.ts arrangement, same numbers).
 */

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

const pair = PAIRED_PICKS[0]!;
const steps = pairedStepsFor(contextModules, pair);
if (!steps) throw new Error('the pair does not resolve against the shipped flow');
const { anchor, companion } = steps;
const AT = { in: 'repeatable', blockId: 'roles', recordIndex: 0 } as const;

/** Everything up to — not including — role_standing, walked through the
 * real flow (the divided-line.spec pattern) so it stays correct as
 * questions move. */
function atTheStanding(): Answers {
  let answers: Answers = EMPTY;
  const declined = new Set<string>();
  const seenIntros = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    const pos = findPosition(contextModules, answers, declined, seenIntros);
    if (pos.kind === 'done') break;
    if (pos.kind === 'module-intro') {
      seenIntros.add(pos.module.id);
      continue;
    }
    if (pos.kind === 'add-another') {
      declined.add(pos.block.id);
      continue;
    }
    if (pos.kind === 'reflect') {
      answers = applyReflect(answers, pos.step, pos.location, 'A kept answer.');
      continue;
    }
    if (pos.step.id === 'role_standing') return answers;
    const value: AnswerValue =
      pos.step.kind === 'multi'
        ? [pos.step.options?.[0]?.v ?? 'x']
        : pos.step.kind === 'chips'
          ? (pos.step.options?.[0]?.v ?? 'x')
          : pos.step.kind === 'yesno'
            ? 'no'
            : 'A seeded answer for this question.';
    answers = applyAnswer(answers, pos.step, pos.location, value);
    if (pos.location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(contextModules, pos.step.id);
      if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
    }
  }
  throw new Error('never reached role_standing');
}

function positionIn(answers: Answers): string {
  const pos = findPosition(contextModules, answers, new Set(), new Set());
  return pos.kind === 'step' ? pos.step.id : pos.kind;
}

describe('the census', () => {
  it('is one pair: role_standing anchored, role_durability riding', () => {
    expect(PAIRED_PICKS).toEqual([{ anchorId: 'role_standing', companionId: 'role_durability' }]);
    expect(pairFor('role_standing')).toEqual(pair);
    expect(pairFor('role_durability')).toEqual(pair);
    expect(pairFor('role_for')).toBeUndefined();
  });

  it('claims both halves as chips questions, and only as chips questions', () => {
    expect(usesPairedPick(anchor)).toBe(true);
    expect(usesPairedPick(companion)).toBe(true);
    expect(usesPairedPick({ id: 'role_standing', kind: 'text' })).toBe(false);
    expect(usesPairedPick({ id: 'context_scope', kind: 'chips' })).toBe(false);
  });

  it('resolves both halves to the real steps, ported options intact', () => {
    expect(anchor.options?.map((o) => o.v)).toEqual(['primary', 'secondary', 'occasional']);
    expect(companion.options?.map((o) => o.v)).toEqual(['current', 'historical']);
    // The merge is a screen, not a schema change: both keys, both labels,
    // exactly as ported — the round-trip law's data end.
    expect(companion.options?.map((o) => o.l)).toEqual(['Current', 'Historical']);
  });

  it('carries a caption for each half, and only for the halves', () => {
    expect(Object.keys(PAIR_CAPTIONS).sort()).toEqual(['role_durability', 'role_standing']);
  });
});

describe('the runner needs no teaching (the mechanism, walked)', () => {
  it('the merged commit answers both keys, and the flow walks past the companion', () => {
    let answers = atTheStanding();
    expect(positionIn(answers)).toBe('role_standing');
    // What the merged screen's one Next writes: both keys, one commit each.
    answers = applyAnswer(answers, anchor, AT, 'primary');
    answers = applyAnswer(answers, companion, AT, 'current');
    // role_durability never becomes a position of its own.
    expect(positionIn(answers)).not.toBe('role_durability');
    expect(answers.repeatables.roles?.[0]?.role_standing).toBe('primary');
    expect(answers.repeatables.roles?.[0]?.role_durability).toBe('current');
  });

  it('a pre-merge record with only the standing resumes ON the mark, standalone', () => {
    let answers = atTheStanding();
    answers = applyAnswer(answers, anchor, AT, 'secondary');
    // Yesterday's file stopped here: standing answered, durability never
    // asked. findPosition lands on the companion — the paired renderer then
    // shows the standing pre-filled (what exists) and asks the mark (what
    // doesn't). Asked standalone, answered in company.
    expect(positionIn(answers)).toBe('role_durability');
  });

  it('a record with only the mark resumes on the standing — the pair is symmetric', () => {
    let answers = atTheStanding();
    answers = applyAnswer(answers, companion, AT, 'historical');
    expect(positionIn(answers)).toBe('role_standing');
  });

  it('an explicit skip is an entry: a skipped mark is never re-demanded by the runner', () => {
    let answers = atTheStanding();
    answers = applyAnswer(answers, anchor, AT, 'primary');
    answers = applyAnswer(answers, companion, AT, null);
    expect(positionIn(answers)).not.toBe('role_durability');
    expect(positionIn(answers)).not.toBe('role_standing');
  });

  it('sectionHealth still counts the two questions separately — a screen, not a schema', () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    const sec21 = () => {
      let answers = atTheStanding();
      answers = applyAnswer(answers, anchor, AT, 'primary');
      answers = applyAnswer(answers, companion, AT, 'current');
      return sectionHealthMap(contextOutline, contextModules, answers, null, now)['sec2-1'];
    };
    const health = sec21();
    // 2.1 Roles: role_names, role_for, role_mandate, role_standing,
    // role_durability — five questions, and the merged screen's commit
    // answers the last two as two.
    expect(health?.total).toBe(5);
    expect(health?.answered).toBe(5);
  });
});

// ── the captions ride the same harness as every core-authored line ─────────

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

describe('the captions (npm run audit cannot see this file)', () => {
  const lines = Object.values(PAIR_CAPTIONS);

  it('reads at grade 7 or below', () => {
    const grade = readingGrade(lines);
    expect(grade, `pairedPick.ts reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
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
