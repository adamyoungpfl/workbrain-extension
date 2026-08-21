import type { StorageResult } from './client';

/**
 * V1.2 VB-09 — wipe both storage areas.
 *
 * Lives beside client.ts because core/storage is this repo's one sanctioned
 * place to name `chrome.*` (see client.ts's header comment and CLAUDE.md's
 * architectural rule); the panel never reaches for chrome.storage itself,
 * not even for a dev affordance.
 *
 * This is only ever called from the `import.meta.env.DEV` branch in
 * src/panel/main.tsx, so it is tree-shaken out of production builds.
 */

/** The one method a reset needs from a chrome.storage area. */
export interface ClearableArea {
  clear(): Promise<void>;
}

export interface ResetAreas {
  local: ClearableArea;
  sync: ClearableArea;
}

/**
 * Lazy bodies, so importing this module in a test (or in jsdom) never
 * touches `chrome` — same shape as client.ts's `chromeLocal`/`chromeSync`.
 */
const chromeAreas: ResetAreas = {
  local: { clear: () => chrome.storage.local.clear() },
  sync: { clear: () => chrome.storage.sync.clear() },
};

const reasonOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Clears `chrome.storage.local` **and** `chrome.storage.sync`.
 *
 * Both are attempted regardless of either failing — a half-reset that
 * silently stopped at the first error is worse than no reset, because the
 * next dogfooding pass starts from a state nobody can describe. Never
 * throws; a failure comes back as `{ ok: false }` with every reason in it,
 * matching client.ts's `StorageResult` contract.
 */
export async function clearAllStorage(areas: ResetAreas = chromeAreas): Promise<StorageResult<void>> {
  const settled = await Promise.allSettled([areas.local.clear(), areas.sync.clear()]);
  const reasons = settled
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => reasonOf(r.reason));

  return reasons.length === 0
    ? { ok: true, data: undefined }
    : { ok: false, reason: reasons.join('; ') };
}
