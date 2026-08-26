import type { Answers, Migration } from '../../schema/storage.types';
import { alignRecordIds } from '../packs/skillIds';

/**
 * Forward-only, one function per version bump. See docs/ARCHITECTURE.md.
 * `runMigrations` guarantees the pre-migration export hook runs first
 * (GUARDRAILS' migration law: restore from the snapshot on failure).
 */

/** Duck-typed, not instanceof: migration state is whatever storage held. */
function looksLikeAnswers(value: unknown): value is Answers {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Answers).values === 'object' &&
    typeof (value as Answers).repeatables === 'object'
  );
}

export const migrations: Migration[] = [
  {
    // V3 slice one (docs/SKILL-INTERCHANGE.md): mint stable record ids for
    // every repeatable record already in any answers store — skills first
    // among equals, but roles/entities/initiatives/audiences get identity by
    // the same stroke, which is what makes them library-ready later for
    // free. Index-aligned by construction; nothing else about the store is
    // touched, and a store with no records gains nothing but stays valid.
    to: 2,
    up(state: unknown): unknown {
      const snapshot = { ...(state as Record<string, unknown>) };
      for (const key of ['wb:answers', 'wb:answers:skills', 'wb:answers:actions']) {
        const answers = snapshot[key];
        if (!looksLikeAnswers(answers)) continue;
        let next = answers;
        for (const blockId of Object.keys(answers.repeatables)) {
          next = alignRecordIds(next, blockId);
        }
        snapshot[key] = next;
      }
      return snapshot;
    },
  },
];

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
