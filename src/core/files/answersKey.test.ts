import { describe, it, expect } from 'vitest';
import { ANSWERS_KEY, answersKeyFor } from './answersKey';
import { FILE_SLOT_IDS } from './slots';
import { LOCAL_KEYS } from '../storage/keys';

/**
 * V1.8 VB-47 — one answers key per file.
 *
 * Small, and every line of it is a promise something else depends on:
 *
 * · **`wb:answers` is still Context's.** This is the whole reason no install
 *   needs migrating. If a refactor ever renames it, this fails here rather than
 *   in somebody's browser with two years of answers behind it.
 * · **The three keys are distinct**, and none of them collides with `wb:skills`
 *   — which is the skill LIST, a different thing with a confusingly close name.
 * · **Every key is a key storage actually reads.** A key missing from
 *   `LOCAL_KEYS` would be invisible to `initStorage`'s migration read and to
 *   `reset.ts`.
 */

describe('ANSWERS_KEY', () => {
  it('keeps Context on wb:answers, so a pre-V1.8 install needs no migration', () => {
    expect(ANSWERS_KEY.context).toBe('wb:answers');
  });

  it('gives every file its own key, and never reuses the skill list’s', () => {
    const keys = FILE_SLOT_IDS.map(answersKeyFor);
    expect(keys).toEqual(['wb:answers', 'wb:answers:skills', 'wb:answers:actions']);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('wb:skills');
  });

  it('names only keys chrome.storage.local really carries', () => {
    for (const key of FILE_SLOT_IDS.map(answersKeyFor)) expect(LOCAL_KEYS).toContain(key);
  });
});
