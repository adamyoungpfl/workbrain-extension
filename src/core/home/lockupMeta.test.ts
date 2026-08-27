import { describe, it, expect } from 'vitest';
import { lockupMeta } from './lockupMeta';
import type { Answers } from '../../schema/storage.types';

/**
 * V2.6 VB-125 — the meta line's three claims, each checked as a derivation:
 * a file counts once it holds a stamp, the age is the newest stamp across
 * both interviews, and the size is the generated bodies' real bytes. The
 * template's "workbrain.zip · v3 · 84 KB" claims none of this could back;
 * what ships must be nothing a person could not verify themselves.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');

const answersAt = (stamps: Record<string, string>): Answers => ({
  values: {},
  repeatables: {},
  answeredAt: stamps,
  reflectedAt: {},
});

const EMPTY = answersAt({});

const base = {
  contextText: 'x'.repeat(2048),
  skillsText: 'y'.repeat(1024),
  actionsText: 'z'.repeat(512),
  actionsOn: false,
  now: NOW,
};

describe('lockupMeta', () => {
  it('a fresh install has no files, no age, no size', () => {
    expect(lockupMeta({ ...base, context: EMPTY, skills: EMPTY })).toEqual({
      files: 0,
      ageDays: null,
      kb: 0,
    });
  });

  it('one stamp makes one file, sized by its generated body', () => {
    const meta = lockupMeta({
      ...base,
      context: answersAt({ professional_name: NOW.toISOString() }),
      skills: EMPTY,
    });
    expect(meta.files).toBe(1);
    expect(meta.ageDays).toBe(0);
    expect(meta.kb).toBe(2); // 2048 bytes
  });

  it('skills add a file, and the derived Actions counts when generated', () => {
    const stamped = answersAt({ 'skills#0#skill_name': NOW.toISOString() });
    const two = lockupMeta({
      ...base,
      context: answersAt({ professional_name: NOW.toISOString() }),
      skills: stamped,
    });
    expect(two.files).toBe(2);
    const three = lockupMeta({
      ...base,
      actionsOn: true,
      context: answersAt({ professional_name: NOW.toISOString() }),
      skills: stamped,
    });
    expect(three.files).toBe(3);
    // 2048 + 1024 + 512 bytes ≈ 3.5 KB → 4.
    expect(three.kb).toBe(4);
  });

  it('the age is the newest stamp across BOTH interviews', () => {
    const old = new Date(NOW.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const newer = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const meta = lockupMeta({
      ...base,
      context: answersAt({ professional_name: old }),
      skills: answersAt({ 'skills#0#skill_name': newer }),
    });
    expect(meta.ageDays).toBe(2);
  });

  it('a tiny file still says 1 KB, never a rounded-down zero', () => {
    const meta = lockupMeta({
      ...base,
      contextText: 'short',
      context: answersAt({ professional_name: NOW.toISOString() }),
      skills: EMPTY,
    });
    expect(meta.kb).toBe(1);
  });

  it('multi-byte text is measured in bytes, not characters', () => {
    const meta = lockupMeta({
      ...base,
      contextText: '🧠'.repeat(512), // 4 bytes each → 2048 bytes
      context: answersAt({ professional_name: NOW.toISOString() }),
      skills: EMPTY,
    });
    expect(meta.kb).toBe(2);
  });
});
