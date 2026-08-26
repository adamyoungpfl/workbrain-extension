import type { Answers } from '../../schema/storage.types';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import { halfLifeFor } from './halfLives';
import { repeatableBlocksForNode } from '../flow/outline';
import { repeatableRecordTitle } from '../files/generate';

/**
 * V2.4 VB-110 — records become sub-rows, and every row gets a freshness
 * date. Two pure folds:
 *
 *  - `relativeAge` renders an ISO timestamp as the short relative form the
 *    list prints on each row's right edge ("today", "3d", "2w", "3mo",
 *    "1y") — decision 9: relative, not calendar dates.
 *  - `recordChildrenFor` synthesizes child rows from a section's repeatable
 *    RECORDS (roles, entities, initiatives, audiences) so the list's one
 *    existing children grammar — the accordion, the rows, the freshness
 *    treatment — renders them without a second rendering path. Each carries
 *    its own last-touched time and its own stale verdict against the owning
 *    section's half-life, which is what turns the list into the
 *    update-and-prune ritual's surface.
 *
 * Stale is a VERDICT here, never a nudge: the row prints the age and the
 * state; nothing counts, scores, or guilt-frames (docs/GUARDRAILS.md).
 * Color never carries it alone — the consumer prints the dot and the word
 * too (V2.4 FLAG 2).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordRow {
  /** Synthetic, stable per record position: `${sectionId}#rec#${blockId}#${index}`. */
  id: string;
  blockId: string;
  recordIndex: number;
  /** The record's own name — its nameField / seed field / first field, in
   * that order — or the numbered fallback for a record with no name yet. */
  label: string;
  /** Latest answeredAt across the record's fields; null when nothing in the
   * record has ever been answered. */
  lastAt: string | null;
  /** Age in whole days at `now`, or null with no timestamp. */
  ageDays: number | null;
  /** Past the owning section's half-life. */
  stale: boolean;
}

/** "today", "3d", "2w", "3mo", "1y" — short enough for a row's right edge. */
export function relativeAge(iso: string, now: Date): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const days = Math.floor(Math.max(0, now.getTime() - then) / DAY_MS);
  if (days < 1) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** runner.ts's compound-key shape for a repeatable field's answeredAt. */
function compoundKey(blockId: string, recordIndex: number, field: string): string {
  return `${blockId}#${recordIndex}#${field}`;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The record sub-rows for one outline section. Matching is the same move
 * sectionHealth makes: a block belongs to the section whose `questionIds`
 * its fields land in — the outline says where questions live, and records
 * follow their questions.
 */
export function recordChildrenFor(
  node: FileOutlineNode,
  modules: Module[],
  answers: Answers,
  now: Date,
): RecordRow[] {
  const halfLife = halfLifeFor(node.id);
  const rows: RecordRow[] = [];

  // Matching and titling are the outline's and the generator's own —
  // `repeatableBlocksForNode` / `repeatableRecordTitle` — so a record's row
  // here can never disagree with the heading the file actually prints.
  for (const block of repeatableBlocksForNode(modules, node)) {
    const records = answers.repeatables[block.id] ?? [];
    records.forEach((record, recordIndex) => {
      const title = repeatableRecordTitle(block, record);
      const label = title === 'Untitled' ? `${recordIndex + 1}.` : textOf(title) || `${recordIndex + 1}.`;

      let lastAt: string | null = null;
      for (const field of block.fields) {
        const key = field.key ?? field.id;
        const at = answers.answeredAt[compoundKey(block.id, recordIndex, key)];
        if (at && (!lastAt || at > lastAt)) lastAt = at;
      }
      const ageDays = lastAt === null ? null : Math.floor((now.getTime() - new Date(lastAt).getTime()) / DAY_MS);
      rows.push({
        id: `${node.id}#rec#${block.id}#${recordIndex}`,
        blockId: block.id,
        recordIndex,
        label,
        lastAt,
        ageDays,
        stale: ageDays !== null && ageDays >= halfLife,
      });
    });
  }
  return rows;
}
