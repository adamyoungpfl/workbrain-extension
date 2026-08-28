import { describe, it, expect, vi } from 'vitest';
import type { Migration } from '../../schema/storage.types';
import { runMigrations } from './migrations';

// Synthetic fixtures — there is nothing real to migrate yet at
// SCHEMA_VERSION = 1, so the runner's mechanics are proved against
// migrations defined here, not the (empty) production list.
const toV2: Migration = { to: 2, up: (s) => ({ ...(s as object), v2: true }) };
const toV3: Migration = { to: 3, up: (s) => ({ ...(s as object), v3: true }) };
const FIXTURES = [toV2, toV3];

describe('runMigrations', () => {
  it('does nothing and never calls exportBeforeMigrate when already at the target version', () => {
    const exportBeforeMigrate = vi.fn();
    const result = runMigrations({ answers: {} }, 3, 3, FIXTURES, exportBeforeMigrate);
    expect(result).toEqual({ ok: true, state: { answers: {} }, toVersion: 3 });
    expect(exportBeforeMigrate).not.toHaveBeenCalled();
  });

  it('applies every migration in (fromVersion, toVersion] in ascending order', () => {
    const result = runMigrations({ a: 1 }, 1, 3, FIXTURES, () => {});
    expect(result).toEqual({ ok: true, state: { a: 1, v2: true, v3: true }, toVersion: 3 });
  });

  it('only applies migrations within range — ignores ones beyond toVersion', () => {
    const result = runMigrations({ a: 1 }, 1, 2, FIXTURES, () => {});
    expect(result).toEqual({ ok: true, state: { a: 1, v2: true }, toVersion: 2 });
  });

  it('calls exportBeforeMigrate exactly once, with the untouched original state, before any mutation', () => {
    const seen: unknown[] = [];
    const original = { a: 1 };
    runMigrations(original, 1, 3, FIXTURES, (s) => seen.push(s));
    expect(seen).toEqual([{ a: 1 }]);
    expect(seen[0]).toBe(original); // the exact reference, not a copy — nothing touched it first
  });

  it('reports which version failed and leaves the caller able to restore from the pre-migration snapshot', () => {
    const throwing: Migration = {
      to: 2,
      up: () => {
        throw new Error('boom');
      },
    };
    const restoreFrom: unknown[] = [];
    const result = runMigrations({ a: 1 }, 1, 2, [throwing], (s) => restoreFrom.push(s));
    expect(result).toEqual({ ok: false, reason: 'migration to schema v2 failed', failedAt: 2 });
    expect(restoreFrom).toEqual([{ a: 1 }]);
  });

  it('stops at the first failing migration — later migrations in range never run', () => {
    const passes: number[] = [];
    const good: Migration = {
      to: 2,
      up: (s) => {
        passes.push(2);
        return s;
      },
    };
    const bad: Migration = {
      to: 3,
      up: () => {
        throw new Error('boom');
      },
    };
    const never: Migration = {
      to: 4,
      up: (s) => {
        passes.push(4);
        return s;
      },
    };
    const result = runMigrations({ a: 1 }, 1, 4, [good, bad, never], () => {});
    expect(result).toEqual({ ok: false, reason: 'migration to schema v3 failed', failedAt: 3 });
    expect(passes).toEqual([2]);
  });
});

// ── V3 slice one: the v2 migration itself (docs/SKILL-INTERCHANGE.md) ─────

import { migrations } from './migrations';
import type { Answers } from '../../schema/storage.types';

describe('migration to schema v2 — record ids minted', () => {
  const v2 = migrations.find((m) => m.to === 2)!;

  function store(records: Record<string, string>[]): Answers {
    return { values: {}, repeatables: { skills: records }, answeredAt: {}, reflectedAt: {} };
  }

  it('exists, and is one of the two shipped so far', () => {
    expect(v2).toBeTruthy();
    // BS-11 (VB-142) added the fold of `reference_example_second`, below.
    expect(migrations).toHaveLength(2);
    expect(migrations.map((m) => m.to)).toEqual([2, 3]);
  });

  it('mints index-aligned ids for every answers store with records', () => {
    const state = {
      'wb:answers': {
        values: {},
        repeatables: { roles: [{ role_name: 'Team lead' }, { role_name: 'Parent' }] },
        answeredAt: {},
        reflectedAt: {},
      },
      'wb:answers:skills': store([{ skill_name: 'Weekly status' }]),
    };
    const out = v2.up(state) as Record<string, Answers>;
    expect(out['wb:answers']!.recordIds?.roles).toHaveLength(2);
    expect(out['wb:answers:skills']!.recordIds?.skills).toHaveLength(1);
    expect(out['wb:answers:skills']!.recordIds?.skills?.[0]).toMatch(/^skl_[a-z2-7]{10}$/);
    // Nothing else about the stores was touched.
    expect(out['wb:answers']!.repeatables.roles![0]!.role_name).toBe('Team lead');
  });

  it('a store with no records, a missing store, and non-answers junk all pass through valid', () => {
    const state = {
      'wb:answers': store([]),
      'wb:meta': { schemaVersion: 1, installedAt: 'x' },
      'wb:report': { scores: [] },
    };
    const out = v2.up(state) as Record<string, unknown>;
    expect((out['wb:answers'] as Answers).recordIds).toBeUndefined();
    expect(out['wb:meta']).toEqual({ schemaVersion: 1, installedAt: 'x' });
    expect(out['wb:report']).toEqual({ scores: [] });
  });

  it('is idempotent — running it twice mints nothing new', () => {
    const once = v2.up({ 'wb:answers:skills': store([{ skill_name: 'A' }]) }) as Record<string, Answers>;
    const id = once['wb:answers:skills']!.recordIds?.skills?.[0];
    const twice = v2.up(once) as Record<string, Answers>;
    expect(twice['wb:answers:skills']!.recordIds?.skills?.[0]).toBe(id);
  });
});

/**
 * BS-11 (V2.9 VB-142) — the reference module asks one question for three
 * examples, and `reference_example_second` no longer exists in the flow. The
 * claim: nobody part-way through the beta loses what they wrote.
 */
describe('migration to schema v3 — the second reference example is folded in', () => {
  const v3 = migrations.find((m) => m.to === 3)!;

  function answers(values: Record<string, unknown>): Answers {
    return { values: values as Answers['values'], repeatables: {}, answeredAt: {}, reflectedAt: {} };
  }
  const run = (values: Record<string, unknown>) =>
    (v3.up({ 'wb:answers': answers(values) }) as Record<string, Answers>)['wb:answers']!;

  it('joins the two with the blank line the new question asks people to use', () => {
    const out = run({ reference_example_primary: 'First one.', reference_example_second: 'Second one.' });
    expect(out.values['reference_example_primary']).toBe('First one.\n\nSecond one.');
    expect('reference_example_second' in out.values).toBe(false);
  });

  it('takes the second whole when there is no first — no leading blank line', () => {
    const out = run({ reference_example_second: 'The only one.' });
    expect(out.values['reference_example_primary']).toBe('The only one.');
  });

  it('drops a skip rather than folding a blank in', () => {
    const out = run({ reference_example_primary: 'Kept.', reference_example_second: null });
    expect(out.values['reference_example_primary']).toBe('Kept.');
    expect('reference_example_second' in out.values).toBe(false);
  });

  it('leaves a store that never held the key exactly as it was', () => {
    const before = { 'wb:answers': answers({ reference_example_primary: 'Kept.' }) };
    expect(v3.up(before)).toBe(before);
  });

  it('passes anything that is not an answers store straight through', () => {
    expect(v3.up({ 'wb:answers': 'nonsense' })).toEqual({ 'wb:answers': 'nonsense' });
  });
});
