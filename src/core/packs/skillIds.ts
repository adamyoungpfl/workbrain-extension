import type { Answers } from '../../schema/storage.types';

/**
 * V3 slice one (docs/SKILL-INTERCHANGE.md) — stable record identity.
 *
 * `mintSkillId` makes a `skl_` id; `alignRecordIds` keeps a block's id
 * array index-aligned with its records. Identity is the machinery the
 * library, sync, and re-import dedup stand on — and none of it ever
 * reaches the interface (no product nouns: nobody sees an id).
 */

/** RFC-4648 base32, lowercased — unambiguous in a URL, an export, a log. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const ID_LENGTH = 10;

/**
 * `skl_` + 10 base32 chars ≈ 50 bits — collision-safe for any personal or
 * library scale this product will ever see. Randomness is injectable so
 * tests are deterministic; the default is the platform's own CSPRNG (a Web
 * API, not chrome.* — core stays pure).
 */
export function mintSkillId(random: (bytes: number) => Uint8Array = defaultRandom): string {
  const bytes = random(ID_LENGTH);
  let id = 'skl_';
  for (let i = 0; i < ID_LENGTH; i++) id += ALPHABET[bytes[i]! % 32];
  return id;
}

function defaultRandom(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * The invariant, maintained: `recordIds[blockId]` ends up exactly as long as
 * `repeatables[blockId]`, existing ids kept in place, new tail records
 * minted, surplus truncated. Idempotent; returns the same object when
 * nothing changed, so callers can cheaply `===` it.
 *
 * SAFE BECAUSE APPEND-ONLY: every shipped record mutation appends
 * (multiples.ts). The first delete/reorder feature must splice the id array
 * in the same operation it splices the records — running this after a
 * mid-list delete would hand a later record its neighbour's identity, which
 * is the exact corruption ids exist to prevent.
 */
export function alignRecordIds(
  answers: Answers,
  blockId: string,
  random?: (bytes: number) => Uint8Array,
): Answers {
  const records = answers.repeatables[blockId] ?? [];
  const existing = answers.recordIds?.[blockId] ?? [];
  if (existing.length === records.length) return answers;

  const ids = existing.slice(0, records.length);
  while (ids.length < records.length) ids.push(mintSkillId(random));
  return { ...answers, recordIds: { ...answers.recordIds, [blockId]: ids } };
}
