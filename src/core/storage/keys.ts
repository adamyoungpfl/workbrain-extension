import type { LocalState, SyncState } from '../../schema/storage.types';

/**
 * The five wb:* keys, split by which chrome.storage area they live in.
 * See docs/ARCHITECTURE.md's storage contract table. Typed against
 * LocalState/SyncState so a typo'd or renamed key is a compile error.
 */

export const LOCAL_KEYS: readonly (keyof LocalState)[] = [
  'wb:meta',
  'wb:answers',
  'wb:skills',
  'wb:packs',
  'wb:report',
] as const;

/** Preferences only — chrome.storage.sync caps near 100KB total, 8KB/item. Never answers. */
export const SYNC_KEYS: readonly (keyof SyncState)[] = ['wb:prefs'] as const;

export type LocalKey = (typeof LOCAL_KEYS)[number];
export type SyncKey = (typeof SYNC_KEYS)[number];
