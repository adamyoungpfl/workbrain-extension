import type { AnswerValue } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { alignRecordIds } from './skillIds';

/**
 * V3 slice one (docs/SKILL-INTERCHANGE.md) — the ONE format. Library packs,
 * shared skills, portal sync payloads and a person's own exports all travel
 * as `workbrain-pack@1`; there is no second schema to drift. Skills.md stays
 * the human/AI-facing rendering; this envelope is machinery.
 *
 * Everything docs/GUARDRAILS.md says about packs is enforced at the door:
 * data never code, hostile-input caps, markdown treated as text (nothing
 * here renders anything), refusal in the product's own voice — a format we
 * don't know is refused WHOLE; a skill that fails its caps is reported by
 * name and the rest import.
 */

export const PACK_FORMAT = 'workbrain-pack@1';
export const SKILLS_BLOCK_ID = 'skills';

/** Hostile-input caps (GUARDRAILS: a pack is untrusted third-party content). */
export const CAPS = {
  nameChars: 200,
  fieldChars: 10_000,
  skillsPerPack: 100,
} as const;

export interface PackSkill {
  id: string;
  /** Deferred accounting: always 1 until per-commit rev tracking ships with
   * the library (docs/SKILL-INTERCHANGE.md, Versions). The FIELD exists now
   * so no envelope ever has to change shape. */
  rev: number;
  /** Latest compound stamp across the record's fields, or null for a record
   * nobody has stamped. Denormalized into the envelope only — never stored
   * derived (docs/ARCHITECTURE.md). */
  updatedAt: string | null;
  origin: { kind: 'authored' };
  /** Keys are EXACTLY the interview's field ids. Unknown keys are preserved
   * on round-trip, never dropped (forward compat). */
  body: Record<string, string>;
}

export interface PackEnvelope {
  format: typeof PACK_FORMAT;
  pack: { id: string; name: string; publisher: string; version: number; publishedAt: string };
  skills: PackSkill[];
  /** Tombstones travel in the format from day one; applying them is
   * sync-land and deliberately NOT done by importSkillsPack below. */
  deleted: { id: string; at: string }[];
}

export type ImportReport =
  | {
      ok: true;
      answers: Answers;
      /** Skill names that landed, in envelope order. */
      imported: string[];
      /** Skills refused by name, each with the reason a person could act on. */
      skipped: { name: string; reason: string }[];
      /** Parsed and counted, never applied here (sync-land). */
      deletedIgnored: number;
    }
  | { ok: false; reason: string };

function latestStamp(answers: Answers, recordIndex: number, fields: string[]): string | null {
  let latest: string | null = null;
  for (const field of fields) {
    const at = answers.answeredAt[`${SKILLS_BLOCK_ID}#${recordIndex}#${field}`];
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}

function textFields(record: Record<string, AnswerValue>): Record<string, string> {
  const body: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') body[key] = value;
  }
  return body;
}

/**
 * The person's own skills as a pack of publisher `self` — which is exactly
 * what "share a skill", a portal sync payload, and a personal backup all
 * are. Aligns ids first (minting any unminted tail), so the returned
 * answers must replace the caller's copy: export is also the moment every
 * skill becomes library-ready.
 */
export function exportSkillsPack(
  answers: Answers,
  publishedAt: string,
  random?: (bytes: number) => Uint8Array,
): { envelope: PackEnvelope; answers: Answers } {
  const aligned = alignRecordIds(answers, SKILLS_BLOCK_ID, random);
  const records = aligned.repeatables[SKILLS_BLOCK_ID] ?? [];
  const ids = aligned.recordIds?.[SKILLS_BLOCK_ID] ?? [];
  const skills: PackSkill[] = records.map((record, index) => {
    const body = textFields(record);
    return {
      id: ids[index]!,
      rev: 1,
      updatedAt: latestStamp(aligned, index, Object.keys(body)),
      origin: { kind: 'authored' },
      body,
    };
  });
  return {
    envelope: {
      format: PACK_FORMAT,
      pack: { id: 'self', name: 'My skills', publisher: 'self', version: 1, publishedAt },
      skills,
      deleted: [],
    },
    answers: aligned,
  };
}

function capReason(body: Record<string, unknown>, name: string): string | null {
  if (name.length > CAPS.nameChars) return `its name runs past ${CAPS.nameChars} characters`;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'string') return `"${key}" is not text`;
    if (value.length > CAPS.fieldChars) return `"${key}" runs past ${CAPS.fieldChars} characters`;
  }
  return null;
}

/**
 * Envelope → store. Dedup is BY ID: a skill whose id is already here
 * replaces that record in place (its stamps refreshed to the envelope's
 * `updatedAt`); a new id appends. Names never dedupe — two people genuinely
 * have two "Weekly status" skills. Per GUARDRAILS' degradation voice, a
 * refusal says what to do next, not what went wrong internally.
 */
export function importSkillsPack(text: string, existing: Answers, importedAt: string): ImportReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "I couldn't read that one. Ask for a fresh copy of the pack." };
  }
  if (typeof parsed !== 'object' || parsed === null || (parsed as PackEnvelope).format !== PACK_FORMAT) {
    return { ok: false, reason: "That pack is from a newer Workbrain than this one. Update the extension, then try again." };
  }
  const envelope = parsed as PackEnvelope;
  const incoming = Array.isArray(envelope.skills) ? envelope.skills : [];
  if (incoming.length > CAPS.skillsPerPack) {
    return { ok: false, reason: `That pack holds more than ${CAPS.skillsPerPack} skills. Ask for it split into smaller packs.` };
  }

  let answers = alignRecordIds(existing, SKILLS_BLOCK_ID);
  const imported: string[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const skill of incoming) {
    const body = (skill && typeof skill === 'object' ? skill.body : null) ?? null;
    const name = typeof body?.['skill_name'] === 'string' ? body['skill_name'] : '';
    if (!body || name.trim() === '') {
      skipped.push({ name: name || '(unnamed)', reason: 'it has no name' });
      continue;
    }
    const reason = capReason(body, name);
    if (reason) {
      skipped.push({ name, reason });
      continue;
    }

    const ids = answers.recordIds?.[SKILLS_BLOCK_ID] ?? [];
    const records = answers.repeatables[SKILLS_BLOCK_ID] ?? [];
    const at = typeof skill.id === 'string' ? ids.indexOf(skill.id) : -1;
    const index = at >= 0 ? at : records.length;
    const nextRecords = records.slice();
    nextRecords[index] = { ...body };
    const nextIds = ids.slice();
    if (at < 0) nextIds.push(typeof skill.id === 'string' && skill.id ? skill.id : `skl_import${index}`);

    const answeredAt = { ...answers.answeredAt };
    const stamp = typeof skill.updatedAt === 'string' && skill.updatedAt ? skill.updatedAt : importedAt;
    for (const field of Object.keys(body)) {
      answeredAt[`${SKILLS_BLOCK_ID}#${index}#${field}`] = stamp;
    }

    answers = {
      ...answers,
      repeatables: { ...answers.repeatables, [SKILLS_BLOCK_ID]: nextRecords },
      recordIds: { ...answers.recordIds, [SKILLS_BLOCK_ID]: nextIds },
      answeredAt,
    };
    imported.push(name);
  }

  return {
    ok: true,
    answers,
    imported,
    skipped,
    deletedIgnored: Array.isArray(envelope.deleted) ? envelope.deleted.length : 0,
  };
}
