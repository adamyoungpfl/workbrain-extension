import { describe, it, expect } from 'vitest';
import { ADD_ANOTHER, addAnotherCopyFor, needsName } from './addAnother';
import { adaptContextFlow } from './adapter';
import { CONTEXT_INTERVIEW_MODULES } from './source';
import type { RepeatableBlock } from '../../schema/flow.types';

/**
 * V1.4 VB-20. Three jobs, mirroring deepDive.test.ts:
 *
 * 1. Keep the id-keyed map honest against the real interview — a typo in a
 *    key is otherwise silent: the loop simply never asks.
 * 2. Prove this map only ever *adds* a prompt where the ported data asked
 *    nothing, and never overwrites ported wording.
 * 3. Measure this copy's reading level, since `npm run audit`'s rule only
 *    reads src/panel/strings.ts and would never see a word of this file.
 */

const { modules } = adaptContextFlow();

function allBlocks(): RepeatableBlock[] {
  return modules.flatMap((m) => m.nodes.filter((n): n is RepeatableBlock => 'fields' in n));
}

/** The same blocks as the snapshot saw them, before the adapter attached anything. */
const sourceBlocks = CONTEXT_INTERVIEW_MODULES.flatMap((m) =>
  m.nodes.filter((n): n is Extract<(typeof m.nodes)[number], { kind: 'repeatable' }> => n.kind === 'repeatable'),
);

describe('the add-another copy map', () => {
  it('names exactly the roles block — the one seeded repeatable in the data', () => {
    expect(Object.keys(ADD_ANOTHER)).toEqual(['roles']);
  });

  it('every key names a repeatable block that actually exists', () => {
    const ids = new Set(allBlocks().map((b) => b.id));
    for (const id of Object.keys(ADD_ANOTHER)) {
      expect(ids.has(id), `"${id}" matches no repeatable block`).toBe(true);
    }
  });

  it('every key names a SEEDED block — an open-ended one asks for itself already', () => {
    const byId = new Map(allBlocks().map((b) => [b.id, b]));
    for (const id of Object.keys(ADD_ANOTHER)) {
      expect(byId.get(id)?.seedFrom, `"${id}" is not seeded`).toBeDefined();
    }
  });

  it('only ever fills a gap: every block it names asked nothing in the ported snapshot', () => {
    // This map OVERRIDES `addAnotherPrompt`. A key naming a block whose
    // snapshot carries real wording would silently replace copy that was
    // ported verbatim — which source.ts's own header forbids.
    const byId = new Map(sourceBlocks.map((b) => [b.id, b]));
    for (const id of Object.keys(ADD_ANOTHER)) {
      expect(byId.get(id)?.addAnotherPrompt, `"${id}" already had ported wording`).toBe('');
    }
  });

  it('asks real questions — both prompts end in a question mark', () => {
    for (const copy of Object.values(ADD_ANOTHER)) {
      expect(copy.prompt.endsWith('?'), copy.prompt).toBe(true);
      expect(copy.namePrompt.endsWith('?'), copy.namePrompt).toBe(true);
    }
  });

  it('addAnotherCopyFor reads the map; an unknown block comes back undefined', () => {
    expect(addAnotherCopyFor('roles')).toBe(ADD_ANOTHER.roles);
    expect(addAnotherCopyFor('entities')).toBeUndefined();
  });
});

describe('needsName', () => {
  const roles = allBlocks().find((b) => b.id === 'roles')!;
  const entities = allBlocks().find((b) => b.id === 'entities')!;

  it('is true for the seeded block that carries a naming question', () => {
    expect(needsName(roles)).toBe(true);
  });

  it('is false for an open-ended block — its records are named by their first field', () => {
    expect(needsName(entities)).toBe(false);
  });

  it('is false for a seeded block with no naming question — it cannot safely grow', () => {
    const { seedFrom, id, addAnotherPrompt, fields } = roles;
    const noName: RepeatableBlock = { id, addAnotherPrompt, fields };
    if (seedFrom) noName.seedFrom = seedFrom;
    expect(needsName(noName)).toBe(false);
  });
});

/**
 * The audit's own Flesch-Kincaid, transcribed — same numbers, so "grade 7"
 * means the same thing on both sides of the src/panel boundary. See
 * deepDive.test.ts, which does this for the same reason.
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
    const all = Object.values(ADD_ANOTHER).flatMap((c) => [c.prompt, c.namePrompt, c.namePlaceholder]);
    const grade = readingGrade(all);
    expect(grade, `addAnother.ts reads at grade ${grade.toFixed(1)} — target is 7`).toBeLessThanOrEqual(7);
  });

  it('never runs a sentence past 20 words (docs/design-system.html §08)', () => {
    for (const copy of Object.values(ADD_ANOTHER)) {
      for (const line of [copy.prompt, copy.namePrompt, copy.namePlaceholder]) {
        const words = line.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
        expect(words.length, `"${line}"`).toBeLessThanOrEqual(20);
      }
    }
  });
});
