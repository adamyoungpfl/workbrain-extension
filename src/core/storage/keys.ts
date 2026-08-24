import type { LocalState, SessionState, SyncState } from '../../schema/storage.types';

/**
 * Every wb:* key, split by which chrome.storage area it lives in.
 * See docs/ARCHITECTURE.md's storage contract table. Typed against
 * LocalState/SyncState so a typo'd or renamed key is a compile error.
 */

export const LOCAL_KEYS: readonly (keyof LocalState)[] = [
  'wb:meta',
  'wb:answers',
  // V1.8 VB-47 — one answers key per file, not one store namespaced by flow.
  // Additive in exactly the way `wb:recs` was: an install that predates V1.8
  // has neither key, which reads as "that file has nothing in it", so there is
  // nothing to migrate from and SCHEMA_VERSION does not move. `wb:answers`
  // above is still Context's and is untouched — see schema/storage.types.ts.
  'wb:answers:skills',
  'wb:answers:actions',
  'wb:skills',
  'wb:packs',
  'wb:report',
  // V1.5 VB-28 — hidden recommendations. Additive: an install that predates
  // it simply has no such key, which `readDismissals` reads as "nothing
  // hidden", so there is nothing to migrate from.
  'wb:recs',
] as const;

/** Preferences only — chrome.storage.sync caps near 100KB total, 8KB/item. Never answers. */
export const SYNC_KEYS: readonly (keyof SyncState)[] = ['wb:prefs'] as const;

/**
 * V1.7 VB-34. In-memory for the life of the browser session and gone after
 * it — see the SessionState comment in schema/storage.types.ts for why the
 * splash needs an area that outlives a panel close and nothing else.
 * Deliberately absent from `reset.ts`: there is nothing here to lose.
 */
export const SESSION_KEYS: readonly (keyof SessionState)[] = ['wb:splash'] as const;

export type LocalKey = (typeof LOCAL_KEYS)[number];
export type SyncKey = (typeof SYNC_KEYS)[number];
export type SessionKey = (typeof SESSION_KEYS)[number];
