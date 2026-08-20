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
