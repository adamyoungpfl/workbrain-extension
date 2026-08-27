import { describe, it, expect } from 'vitest';
import type { RepeatableBlock, Step } from '../../schema/flow.types';
import { contextModules } from '../flow/flow';
import {
  DIVIDED_LINE_OFFERED,
  DIVIDED_LINE_QUESTIONS,
  heldLineOptions,
  offeredLineOptions,
  usesDividedLine,
} from './dividedLine';

/**
 * V2.5 VB-122 — the divided line's seam, held against the REAL flow.
 *
 * The renderer skips an offered key the data does not carry (a broken screen
 * would be worse than a missing tile) — so this file is where that drift is
 * loud: every offered key must resolve in the shipped role_for, the held
 * split must return exactly the ported keys the line no longer offers, and —
 * the back-compat law — every PORTED key must still resolve to its PORTED
 * label, because that label is what an old file printed and must go on
 * printing (overrides.test.ts holds the file end of the same contract).
 */

const roleFor = (() => {
  const roles = contextModules
    .flatMap((m) => m.nodes)
    .find((n): n is RepeatableBlock => 'fields' in n && n.id === 'roles');
  const step = roles?.fields.find((f) => f.id === 'role_for');
  if (!step) throw new Error('role_for missing from the shipped flow');
  return step;
})();

describe('the census', () => {
  it('is a list of one: role_for, and only as a chips question', () => {
    expect(DIVIDED_LINE_QUESTIONS).toEqual(['role_for']);
    expect(usesDividedLine(roleFor)).toBe(true);
    expect(usesDividedLine({ id: 'role_for', kind: 'text' })).toBe(false);
    expect(usesDividedLine({ id: 'context_scope', kind: 'chips' })).toBe(false);
  });

  it('offers decision 3\'s five, in decision 3\'s order, all resolving in the real data', () => {
    expect(DIVIDED_LINE_OFFERED.role_for).toEqual(['myself', 'family', 'team', 'my-clients', 'community']);
    const offered = offeredLineOptions(roleFor);
    expect(offered.map((o) => o.v)).toEqual(['myself', 'family', 'team', 'my-clients', 'community']);
    expect(offered.map((o) => o.l)).toEqual(['Myself', 'My family', 'My team', 'My clients', 'My community']);
  });

  it('offers nothing for a question with no entry — the seam is opt-in', () => {
    const other: Step = { id: 'context_scope', module: 1, section: 0, eyebrow: 'E', q: 'Q', kind: 'chips' };
    expect(offeredLineOptions(other)).toEqual([]);
    expect(heldLineOptions(other, ['work'])).toEqual([]);
  });
});

describe('the held split — old answers stay on the line (VB-122 back-compat)', () => {
  it('a ported key the line no longer offers comes back as a held entry, ported label intact', () => {
    expect(heldLineOptions(roleFor, ['employer'])).toEqual([{ v: 'employer', l: 'My employer' }]);
    expect(heldLineOptions(roleFor, ['clients'])).toEqual([{ v: 'clients', l: 'Clients' }]);
    expect(heldLineOptions(roleFor, ['organization'])).toEqual([
      { v: 'organization', l: 'An organization or nonprofit' },
    ]);
  });

  it('an offered key is never held — it is already on the line', () => {
    for (const key of DIVIDED_LINE_OFFERED.role_for!) {
      expect(heldLineOptions(roleFor, [key]), key).toEqual([]);
    }
  });

  it('a custom string is not held either — offListOptions owns what the data does not know', () => {
    expect(heldLineOptions(roleFor, ['The scout troop'])).toEqual([]);
  });

  it('nothing selected, nothing held', () => {
    expect(heldLineOptions(roleFor, [])).toEqual([]);
  });
});

describe('the back-compat law, at the data', () => {
  it('every ported key still resolves to its ported label in the shipped flow', () => {
    // These six strings are what pre-VB-122 files printed for each stored
    // key (core/files/generate.ts resolves value -> label). A changed or
    // dropped entry here is a changed file for somebody who did nothing.
    const ported: [string, string][] = [
      ['employer', 'My employer'],
      ['clients', 'Clients'],
      ['family', 'My family'],
      ['organization', 'An organization or nonprofit'],
      ['community', 'My community'],
      ['myself', 'Myself'],
    ];
    for (const [key, label] of ported) {
      expect(roleFor.options?.find((o) => o.v === key)?.l, key).toBe(label);
    }
  });

  it('the two NEW keys collide with nothing the port ever stored', () => {
    // 'team' and 'my-clients' must be new strings: if either had ever been a
    // storable key, a new answer would be indistinguishable from an old one
    // that meant something else.
    expect(['employer', 'clients', 'family', 'organization', 'community', 'myself']).not.toContain('team');
    expect(['employer', 'clients', 'family', 'organization', 'community', 'myself']).not.toContain('my-clients');
    expect(roleFor.options?.find((o) => o.v === 'team')?.l).toBe('My team');
    expect(roleFor.options?.find((o) => o.v === 'my-clients')?.l).toBe('My clients');
  });
});
