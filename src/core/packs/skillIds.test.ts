import { describe, it, expect } from 'vitest';
import { alignRecordIds, mintSkillId } from './skillIds';
import type { Answers } from '../../schema/storage.types';

/** Deterministic byte stream for tests — counts upward, so minted ids are
 * predictable and distinct. */
function counterRandom(start = 0): (bytes: number) => Uint8Array {
  let n = start;
  return (count) => Uint8Array.from({ length: count }, () => n++ % 256);
}

function answersWith(records: Record<string, string>[], ids?: string[]): Answers {
  return {
    values: {},
    repeatables: { skills: records },
    answeredAt: {},
    reflectedAt: {},
    ...(ids ? { recordIds: { skills: ids } } : {}),
  };
}

describe('mintSkillId', () => {
  it('is skl_ + 10 lowercase base32 chars', () => {
    expect(mintSkillId(counterRandom())).toMatch(/^skl_[a-z2-7]{10}$/);
  });

  it('is deterministic under injected randomness, and distinct across calls', () => {
    const a = mintSkillId(counterRandom(0));
    const b = mintSkillId(counterRandom(0));
    const c = mintSkillId(counterRandom(90));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('the default randomness is the platform CSPRNG — real ids collide never in practice', () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintSkillId()));
    expect(seen.size).toBe(200);
  });
});

describe('alignRecordIds — the invariant', () => {
  it('mints for a tail of new records, keeping existing ids in place', () => {
    const before = answersWith([{ skill_name: 'A' }, { skill_name: 'B' }], ['skl_keepme0000']);
    const after = alignRecordIds(before, 'skills', counterRandom());
    expect(after.recordIds?.skills).toHaveLength(2);
    expect(after.recordIds?.skills?.[0]).toBe('skl_keepme0000');
    expect(after.recordIds?.skills?.[1]).toMatch(/^skl_[a-z2-7]{10}$/);
  });

  it('is idempotent, and returns the SAME object when already aligned', () => {
    const once = alignRecordIds(answersWith([{ skill_name: 'A' }]), 'skills', counterRandom());
    const twice = alignRecordIds(once, 'skills', counterRandom(99));
    expect(twice).toBe(once); // no new ids, no new object — callers can ===
  });

  it('a block with no records aligns to nothing and changes nothing', () => {
    const empty = answersWith([]);
    expect(alignRecordIds(empty, 'skills')).toBe(empty);
  });

  it('truncates surplus ids when records shrank — and its doc says why that is only legal wholesale', () => {
    // The only shipped way records shrink is wholesale replacement (import/
    // restore), where ids arrive WITH the data. A mid-list delete feature
    // must splice ids itself — alignRecordIds after the fact would hand a
    // record its neighbour's identity. The truncation here is the wholesale
    // case's cleanup, not a delete mechanism.
    const before = answersWith([{ skill_name: 'A' }], ['skl_aaaaaaaaaa', 'skl_bbbbbbbbbb']);
    const after = alignRecordIds(before, 'skills');
    expect(after.recordIds?.skills).toEqual(['skl_aaaaaaaaaa']);
  });

  it('works for any block — roles and entities get identity by the same stroke', () => {
    const answers: Answers = {
      values: {},
      repeatables: { roles: [{ role_name: 'Team lead' }] },
      answeredAt: {},
      reflectedAt: {},
    };
    const after = alignRecordIds(answers, 'roles', counterRandom());
    expect(after.recordIds?.roles?.[0]).toMatch(/^skl_/);
  });
});
