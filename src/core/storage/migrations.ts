import type { Migration } from '../../schema/storage.types';

/**
 * Forward-only, one function per version bump. Empty at SCHEMA_VERSION = 1 —
 * there is nothing to migrate from yet. See docs/ARCHITECTURE.md.
 */
export const migrations: Migration[] = [];

export type MigrationResult =
  | { ok: true; state: unknown; toVersion: number }
  | { ok: false; reason: string; failedAt: number };

/**
 * Pure — no chrome.*, no file I/O, so it's testable without a browser.
 * `exportBeforeMigrate` is a caller-supplied hook, run once, before the
 * first mutation, on the untouched pre-migration state. The caller uses it
 * to write the pre-migration snapshot wherever restoring-on-failure reads
 * it back from; this function only guarantees *when* it runs, not how the
 * snapshot is stored — that's a DOM-adjacent concern core/ can't own, and
 * the real "download a file" implementation doesn't exist until R1-09/10.
 */
export function runMigrations(
  state: unknown,
  fromVersion: number,
  toVersion: number,
  available: Migration[],
  exportBeforeMigrate: (state: unknown) => void,
): MigrationResult {
  const applicable = available
    .filter((m) => m.to > fromVersion && m.to <= toVersion)
    .sort((a, b) => a.to - b.to);

  if (applicable.length === 0) {
    return { ok: true, state, toVersion: fromVersion };
  }

  exportBeforeMigrate(state);

  let current = state;
  for (const migration of applicable) {
    try {
      current = migration.up(current);
    } catch {
      return { ok: false, reason: `migration to schema v${migration.to} failed`, failedAt: migration.to };
    }
  }

  return { ok: true, state: current, toVersion };
}
