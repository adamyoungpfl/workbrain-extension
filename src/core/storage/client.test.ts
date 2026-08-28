import { describe, it, expect, vi } from 'vitest';
import type { Migration } from '../../schema/storage.types';
import type { StorageBackend } from './client';
import { getLocal, setLocal, getSync, setSync, initStorage } from './client';

/**
 * client.ts is core/storage's one deliberate exception to the "no chrome.*"
 * rule (see the module's own header comment), kept testable by taking its
 * backend as an injected parameter — so these tests never mock chrome.*.
 */
function fakeBackend(seed: Record<string, unknown> = {}): StorageBackend {
  const store: Record<string, unknown> = { ...seed };
  return {
    get: async (keys) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
    set: async (items) => {
      Object.assign(store, items);
    },
  };
}

describe('getLocal / setLocal', () => {
  it('round-trips a value through the backend', async () => {
    const backend = fakeBackend();
    await setLocal('wb:skills', [{ id: '1', title: 't', body: 'b', source: 'self', addedAt: 'now' }], backend);
    const result = await getLocal('wb:skills', backend);
    expect(result).toEqual([{ id: '1', title: 't', body: 'b', source: 'self', addedAt: 'now' }]);
  });

  it('returns undefined for a key that was never set', async () => {
    const backend = fakeBackend();
    expect(await getLocal('wb:skills', backend)).toBeUndefined();
  });

  it('setLocal never throws — a failed write reports ok:false instead', async () => {
    const backend: StorageBackend = {
      get: async () => ({}),
      set: async () => {
        throw new Error('quota exceeded');
      },
    };
    const result = await setLocal('wb:skills', [], backend);
    expect(result).toEqual({ ok: false, reason: 'quota exceeded' });
  });
});

describe('getSync / setSync', () => {
  it('round-trips prefs through the backend', async () => {
    const backend = fakeBackend();
    const prefs = {
      narrator: false,
      mic: false,
      reducedMotion: 'system' as const,
      handoff: 'manual' as const,
      packUrls: [],
      dictationHint: true,
      turnHint: true,
    };
    await setSync('wb:prefs', prefs, backend);
    expect(await getSync('wb:prefs', backend)).toEqual(prefs);
  });
});

describe('initStorage', () => {
  it('a fresh install writes meta at the current schema version and never calls exportBeforeMigrate', async () => {
    const backend = fakeBackend();
    const exportBeforeMigrate = vi.fn();
    const result = await initStorage({ exportBeforeMigrate, backend });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data.schemaVersion).toBe(3); // BS-11 (VB-142) bumped it again
    expect(new Date(result.data.installedAt).toString()).not.toBe('Invalid Date');
    expect(exportBeforeMigrate).not.toHaveBeenCalled();
    expect(await getLocal('wb:meta', backend)).toEqual(result.data);
  });

  it('already at the current version: returns the existing meta and writes nothing back', async () => {
    const meta = { schemaVersion: 3, installedAt: '2020-01-01T00:00:00.000Z' };
    const backend = fakeBackend({ 'wb:meta': meta });
    const setSpy = vi.spyOn(backend, 'set');
    const result = await initStorage({ exportBeforeMigrate: () => {}, backend });
    expect(result).toEqual({ ok: true, data: meta });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('behind the current version: migrates, exports the pre-migration snapshot first, and writes the migrated state back under the same keys', async () => {
    // SCHEMA_VERSION is really 3 (BS-11), so "behind" here means schemaVersion
    // 1 and the fixture migration bridges 1 -> 2. It does not have to reach the
    // current version: what this test proves is that a migration in range runs,
    // the snapshot goes out first, and the result is stamped at the target.
    const oldMeta = { schemaVersion: 1, installedAt: '2020-01-01T00:00:00.000Z' };
    const backend = fakeBackend({
      'wb:meta': oldMeta,
      'wb:answers': { values: { name: 'old' }, repeatables: {}, answeredAt: {} },
    });
    const bumpTo2: Migration = {
      to: 2,
      up: (s) => {
        const state = s as Record<string, unknown>;
        return {
          ...state,
          'wb:answers': { ...(state['wb:answers'] as object), migrated: true },
        };
      },
    };
    const snapshots: unknown[] = [];

    const result = await initStorage({
      exportBeforeMigrate: (s) => snapshots.push(s),
      backend,
      migrations: [bumpTo2],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data.schemaVersion).toBe(3);
    expect(result.data.installedAt).toBe(oldMeta.installedAt); // preserved, not reset

    // exported before anything changed
    expect((snapshots[0] as Record<string, unknown>)['wb:meta']).toEqual(oldMeta);

    const answers = await getLocal('wb:answers', backend);
    expect(answers).toEqual({ values: { name: 'old' }, repeatables: {}, answeredAt: {}, migrated: true });
    expect(await getLocal('wb:meta', backend)).toEqual(result.data);
  });

  /**
   * V1.8 VB-47 — THE MIGRATION-SAFETY TEST, and the important one in this file.
   *
   * `wb:answers` gained two siblings (`wb:answers:skills`, `wb:answers:actions`)
   * and did NOT change its own name, shape or meaning. So an install that has
   * been running since R1-01 — one `wb:meta` at the current version, one
   * `wb:answers` full of somebody's real words, and nothing else — must come
   * through untouched, with no migration run and nothing written back.
   *
   * Seeded in the OLD shape deliberately: exactly the keys such an install has,
   * and not one more. The assertion is that nothing is lost, nothing is
   * rewritten, and the two new keys read as absent rather than as empty answers
   * somebody has to be told about.
   */
  it('a pre-V1.8 install — only wb:answers — migrates to v2 keeping every answer, snapshot exported first', async () => {
    // V3 slice one: schemaVersion 1 is BEHIND now, so this install runs the
    // real v2 migration. The promise sharpens rather than changes: every
    // answer comes through byte-identical, the records gain their minted
    // ids and nothing else, the pre-migration snapshot is written before
    // any mutation, and the sibling keys still read as absent.
    const meta = { schemaVersion: 1, installedAt: '2024-05-05T00:00:00.000Z' };
    const existing = {
      values: { preferred_name: 'Ada', voice: 'Plain and direct.' },
      repeatables: { roles: [{ role_name: 'Founder' }] },
      answeredAt: { preferred_name: '2024-05-05T00:00:00.000Z' },
      reflectedAt: { voice: '2024-05-06T00:00:00.000Z' },
      // V2.5 VB-120 — the third stamp map rides the same survival promise
      // as the two above it: a migration may add identity, never drop how
      // an answer was made.
      assistedAt: { voice: '2024-05-06T00:00:00.000Z' },
    };
    const backend = fakeBackend({ 'wb:meta': meta, 'wb:answers': existing });
    const snapshots: unknown[] = [];

    const result = await initStorage({ exportBeforeMigrate: (s) => snapshots.push(s), backend });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.data.schemaVersion).toBe(3);
    expect(result.data.installedAt).toBe(meta.installedAt); // preserved, not reset
    expect((snapshots[0] as Record<string, unknown>)['wb:answers']).toEqual(existing);

    const migrated = (await getLocal('wb:answers', backend)) as typeof existing & {
      recordIds?: Record<string, string[]>;
    };
    // Nothing lost: field for field, plus identity and only identity.
    expect(migrated.values).toEqual(existing.values);
    expect(migrated.repeatables).toEqual(existing.repeatables);
    expect(migrated.answeredAt).toEqual(existing.answeredAt);
    expect(migrated.reflectedAt).toEqual(existing.reflectedAt);
    expect(migrated.assistedAt).toEqual(existing.assistedAt);
    expect(migrated.recordIds?.roles).toHaveLength(1);
    expect(migrated.recordIds?.roles?.[0]).toMatch(/^skl_[a-z2-7]{10}$/);
    // And the new keys are absent, which every reader already treats as
    // "that file has nothing in it" (see core/files/answersKey.ts).
    expect(await getLocal('wb:answers:skills', backend)).toBeUndefined();
    expect(await getLocal('wb:answers:actions', backend)).toBeUndefined();
  });

  /** The other half of the same promise: the new keys are real keys, and
   * writing one leaves Context's alone. */
  it('each file’s answers are their own key — writing Skills does not touch Context', async () => {
    const context = { values: { preferred_name: 'Ada' }, repeatables: {}, answeredAt: {}, reflectedAt: {} };
    const backend = fakeBackend({ 'wb:answers': context });
    const skills = { values: { how_i_work: 'In the morning.' }, repeatables: {}, answeredAt: {}, reflectedAt: {} };

    expect(await setLocal('wb:answers:skills', skills, backend)).toEqual({ ok: true, data: undefined });

    expect(await getLocal('wb:answers', backend)).toEqual(context);
    expect(await getLocal('wb:answers:skills', backend)).toEqual(skills);
  });

  it('a migration failure reports why and leaves existing storage untouched', async () => {
    const oldMeta = { schemaVersion: 0, installedAt: '2020-01-01T00:00:00.000Z' };
    const backend = fakeBackend({ 'wb:meta': oldMeta, 'wb:answers': { values: { name: 'old' } } });
    const broken: Migration = {
      to: 1,
      up: () => {
        throw new Error('bad shape');
      },
    };

    const result = await initStorage({ exportBeforeMigrate: () => {}, backend, migrations: [broken] });

    expect(result).toEqual({ ok: false, reason: 'migration to schema v1 failed' });
    // untouched — still the pre-migration meta, not partially advanced
    expect(await getLocal('wb:meta', backend)).toEqual(oldMeta);
  });
});
