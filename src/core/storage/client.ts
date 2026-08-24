import type { LocalState, Meta, Migration, SessionState, SyncState } from '../../schema/storage.types';
import { SCHEMA_VERSION } from '../../schema/storage.types';
import { LOCAL_KEYS } from './keys';
import type { LocalKey, SessionKey, SyncKey } from './keys';
import { migrations as productionMigrations, runMigrations } from './migrations';

/**
 * The ONLY module in core/ that touches chrome.* — see CLAUDE.md's core
 * purity rule and docs/ARCHITECTURE.md's module map, which names this file
 * as the deliberate exception. Every function takes its storage backend as
 * an injected, defaulted parameter (the same pattern core/packs/fetch.ts
 * uses for its fetcher), so tests never need to mock chrome.storage.
 */
export interface StorageBackend {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const chromeLocal: StorageBackend = {
  get: (keys) => chrome.storage.local.get(keys as string[]),
  set: (items) => chrome.storage.local.set(items),
};

const chromeSync: StorageBackend = {
  get: (keys) => chrome.storage.sync.get(keys as string[]),
  set: (items) => chrome.storage.sync.set(items),
};

/**
 * V1.7 VB-34. In-memory, cleared when Chrome closes, and needs no permission
 * beyond the `storage` one granted at install.
 *
 * Degrades to nothing rather than throwing: `chrome.storage.session` arrived
 * in Chrome 102, and an older browser simply behaves as though the session
 * had only just begun. That is the correct failure for the one thing stored
 * here — the splash shows again — and it means no caller has to feature-test.
 */
const chromeSession: StorageBackend = {
  get: (keys) => chrome.storage.session?.get(keys as string[]) ?? Promise.resolve({}),
  set: (items) => chrome.storage.session?.set(items) ?? Promise.resolve(),
};

export type StorageResult<T> = { ok: true; data: T } | { ok: false; reason: string };

function toResult<T>(promise: Promise<T>): Promise<StorageResult<T>> {
  return promise.then(
    (data): StorageResult<T> => ({ ok: true, data }),
    (err: unknown): StorageResult<T> => ({
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    }),
  );
}

export async function getLocal<K extends LocalKey>(
  key: K,
  backend: StorageBackend = chromeLocal,
): Promise<LocalState[K] | undefined> {
  const result = await backend.get([key]);
  return result[key] as LocalState[K] | undefined;
}

/** Never throws. A failed write keeps the in-memory state the caller already has — see docs/GUARDRAILS.md. */
export function setLocal<K extends LocalKey>(
  key: K,
  value: LocalState[K],
  backend: StorageBackend = chromeLocal,
): Promise<StorageResult<void>> {
  return toResult(backend.set({ [key]: value }));
}

export async function getSync<K extends SyncKey>(
  key: K,
  backend: StorageBackend = chromeSync,
): Promise<SyncState[K] | undefined> {
  const result = await backend.get([key]);
  return result[key] as SyncState[K] | undefined;
}

export function setSync<K extends SyncKey>(
  key: K,
  value: SyncState[K],
  backend: StorageBackend = chromeSync,
): Promise<StorageResult<void>> {
  return toResult(backend.set({ [key]: value }));
}

/**
 * V1.7 VB-34. Reads the current browser session's ephemeral state.
 *
 * Never throws, and answers `undefined` for anything it cannot read — see
 * `chromeSession` above. Session state is only ever used for things whose
 * absence is harmless.
 */
export async function getSession<K extends SessionKey>(
  key: K,
  backend: StorageBackend = chromeSession,
): Promise<SessionState[K] | undefined> {
  const result = await backend.get([key]).catch(() => ({}) as Record<string, unknown>);
  return result[key] as SessionState[K] | undefined;
}

/** Never throws. A failed write means the splash shows once more. */
export function setSession<K extends SessionKey>(
  key: K,
  value: SessionState[K],
  backend: StorageBackend = chromeSession,
): Promise<StorageResult<void>> {
  return toResult(backend.set({ [key]: value }));
}

export interface InitStorageOptions {
  /** Called once, before any migration mutates state — see core/storage/migrations.ts. */
  exportBeforeMigrate: (state: unknown) => void;
  backend?: StorageBackend;
  /** Defaults to the real, currently-empty production list. Overridable for tests. */
  migrations?: Migration[];
}

/**
 * Reads wb:meta and brings local storage to SCHEMA_VERSION, if behind.
 * A fresh install (no wb:meta yet) just writes the current version — there
 * is nothing to migrate from. Never lose data silently: a migration
 * failure leaves existing storage untouched and reports why.
 */
export async function initStorage({
  exportBeforeMigrate,
  backend = chromeLocal,
  migrations = productionMigrations,
}: InitStorageOptions): Promise<StorageResult<Meta>> {
  const existingMeta = await getLocal('wb:meta', backend);

  if (!existingMeta) {
    const meta: Meta = { schemaVersion: SCHEMA_VERSION, installedAt: new Date().toISOString() };
    const result = await setLocal('wb:meta', meta, backend);
    return result.ok ? { ok: true, data: meta } : result;
  }

  if (existingMeta.schemaVersion === SCHEMA_VERSION) {
    return { ok: true, data: existingMeta };
  }

  const all = await backend.get(LOCAL_KEYS);
  const migrationResult = runMigrations(
    all,
    existingMeta.schemaVersion,
    SCHEMA_VERSION,
    migrations,
    exportBeforeMigrate,
  );
  if (!migrationResult.ok) {
    return { ok: false, reason: migrationResult.reason };
  }

  const migrated = migrationResult.state as Record<string, unknown>;
  const nextMeta: Meta = { schemaVersion: migrationResult.toVersion, installedAt: existingMeta.installedAt };
  return toResult(backend.set({ ...migrated, 'wb:meta': nextMeta })).then((result) =>
    result.ok ? { ok: true, data: nextMeta } : result,
  );
}
