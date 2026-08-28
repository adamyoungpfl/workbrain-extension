import type { FileOutlineNode, FlowContext, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { alignRecordIds } from '../packs/skillIds';
import { bodyFieldsFor, buildFlowLookups, keyOf, nameStepFor, resolvePhrase } from '../files/lookups';
import { SKIPPED_ANSWER_MARKER, formatAnswerValue } from '../files/generate';
import { applyAnswer, applySeededAddAnother, findSeedStep, seededNameTaken } from './runner';
import { splitSectionLabel } from './sectionLabel';

/**
 * V1.7 VB-38 — the things that come in numbers, as a list you can add to and
 * edit.
 *
 * Three blocks in the ported interview hold many of something: `roles`,
 * `entities`, `initiatives_records`. Until now the only way to reach the
 * second one of anything was to walk the interview to it, and the only way to
 * add one was to arrive at the end of that block's loop. This is the fold that
 * lets a surface list them and open one directly; `runner.ts`'s
 * `positionForRecord` / `positionForNewRecord` are the other half.
 *
 * ── THE TRAP THIS FILE EXISTS TO NOT REOPEN ───────────────────────────────
 *
 * V1.4 VB-20 (docs/V1.4-REFINEMENT.md) paid for this lesson once. `roles` is
 * SEEDED: `reconcileSeededRepeatable` rebuilds its record array from the
 * `role_names` answer with `.map()`, so **a record whose name is not in that
 * answer is deleted, with every answer inside it, the next time the seed
 * question is re-submitted** — no warning, no trace. Adding a role therefore
 * means writing the name to the seed answer AND to the record, together, which
 * is exactly what `applySeededAddAnother` does. This file does not re-implement
 * that; it calls it. Adding a second way to grow a seeded block would be adding
 * a second way to lose one.
 *
 * The open-ended blocks have no seed answer and nothing rebuilds them, so their
 * records are added the way `applyAnswer` already adds one — by answering the
 * first field, which IS the name (`entity_name`, `initiative_name`). Two block
 * shapes, two writes, one entry point (`applyAddRecord`) that picks between
 * them, so no caller has to know which kind it is holding.
 *
 * ── NOTHING HERE IS STORED ────────────────────────────────────────────────
 *
 * Every group, every record, every count is recomputed from `wb:answers` on
 * every render, exactly like `findPosition` and `sectionHealthMap`
 * (docs/ARCHITECTURE.md, "nothing derived is stored").
 *
 * ── NO COPY IS AUTHORED HERE ──────────────────────────────────────────────
 *
 * A group's title is the file's OWN section name ("Roles", "My World"), and the
 * question that names a new record is the one the interview already asks — the
 * block's first field for an open-ended block, `core/flow/addAnother.ts`'s
 * `namePrompt` for the seeded one. So the add screen asks the same words the
 * interview asks, and `src/panel/strings.ts` gains no wording for questions
 * that already exist (CLAUDE.md, "Copy lives in one file", and its stated
 * exception for interview wording).
 */

export interface MultipleRecord {
  /** Its index in `answers.repeatables[blockId]` — what a position needs. */
  index: number;
  /**
   * What this one is called. `''` when nothing names it yet — a record whose
   * name question was skipped, or one added by the interview's own loop.
   *
   * Empty rather than `core/files/generate.ts`'s "Untitled": that word is
   * written into the person's file and lives with the file's other wording,
   * whereas what an empty row says in the panel is interface copy and belongs
   * in `src/panel/strings.ts`. The string itself is otherwise identical to the
   * file's — same field, same value — so a row and its heading in Context.md
   * cannot disagree.
   */
  name: string;
  /** How many of this record's questions have an answer, skips included. */
  answered: number;
  total: number;
  /**
   * BS-08 (§8) — WHAT THIS RECORD ACTUALLY HOLDS, up to three things.
   *
   * "'4 of 5 answered' is a fact about the form. Print the two or three
   * things the record actually contains, and the list becomes a view of the
   * person's world."
   *
   * Their own words, flattened to one line each, in file order, formatted by
   * the same `formatAnswerValue` the generated file uses — so a row and the
   * heading it corresponds to in Context.md cannot disagree about what
   * somebody said. The name is not among them: it is the row's title.
   *
   * A SKIPPED ANSWER IS NOT A THING THE RECORD CONTAINS. It gets a real cell
   * in `nodeDetails` because that panel is an account of the questions; this
   * is an account of the CONTENT, and "left unanswered on purpose" printed as
   * a row's subtitle is noise where a fact should be. Empty when the record
   * holds nothing but its name yet.
   */
  detail: string[];
}

export interface MultipleGroup {
  blockId: string;
  /** The file's own section name for these records, e.g. "Roles". */
  title: string;
  /**
   * Whether this block's records are rebuilt from a seed answer — the whole
   * reason `applyAddRecord` exists rather than one `applyAnswer` call. Exposed
   * because a surface may want to say so; nothing about correctness depends on
   * a caller reading it.
   */
  seeded: boolean;
  /** The question that names a new record, asked in the interview's own words. */
  namePrompt: string;
  namePlaceholder: string;
  records: MultipleRecord[];
}

function ctxFor(answers: Answers): FlowContext {
  return { answers: answers.values, repeatables: answers.repeatables };
}

function blockById(modules: Module[], blockId: string): RepeatableBlock | undefined {
  return buildFlowLookups(modules).repeatableBlocksById.get(blockId);
}

/**
 * Which key in a record holds its name.
 *
 * A seeded block's name is seed data under `seedFrom.seedField` and is not one
 * of its questions at all. An open-ended block's name is one of its questions —
 * the one `core/files/generate.ts` renders as the record's heading before
 * dropping it from the body. This reads the same field through the same
 * resolver, so the panel and the file name a record identically even now that
 * the naming question is not always the first one asked (V2.0 VB-62).
 */
export function nameKeyFor(block: RepeatableBlock): string | undefined {
  if (block.seedFrom) return block.seedFrom.seedField;
  const named = nameStepFor(block);
  return named ? keyOf(named) : undefined;
}

function nameOf(block: RepeatableBlock, record: Record<string, unknown>): string {
  const key = nameKeyFor(block);
  const value = key ? record[key] : undefined;
  return typeof value === 'string' ? value.trim() : '';
}

/** Trimmed and case-folded, so "Priya" and "priya" count as one name — the
 * same comparison `runner.ts`'s `seededNameTaken` makes, for the same reason:
 * a name is how a record is found again. */
function fold(name: string): string {
  return name.trim().toLowerCase();
}

/** Depth-first, pre-order — the order `Step.section` indexes into (see
 * core/flow/adapter.ts's `flattenOutline`, which numbers the source outline
 * exactly this way). */
function flatten(nodes: readonly FileOutlineNode[], out: FileOutlineNode[] = []): FileOutlineNode[] {
  for (const node of nodes) {
    out.push(node);
    if (node.children) flatten(node.children, out);
  }
  return out;
}

/**
 * The section name the file gives these records, without its numeral — "2.1
 * Roles" prints here as "Roles".
 *
 * Taken from the outline rather than written down, so the multiples screen, the
 * drawer's tree and the generated Markdown all call a group the same thing. An
 * outline that no longer holds the block's section yields `''`, and the surface
 * shows nothing rather than a wrong name.
 */
function titleFor(block: RepeatableBlock, outline: readonly FileOutlineNode[]): string {
  const section = block.fields[0]?.section;
  if (section === undefined || section < 0) return '';
  const node = flatten(outline)[section];
  return node ? splitSectionLabel(node.label).title : '';
}

/**
 * The question that names a new record, and what its field shows while empty.
 *
 * A seeded block's naming question is `addAnotherName`, read off the block
 * itself rather than out of `core/flow/addAnother.ts`'s map: V2.0 VB-64 adds a
 * second seeded block whose copy comes from `core/flow/overrides.ts` instead,
 * and a surface has no business knowing which file a block's wording was
 * authored in. The adapter has already put both on the block.
 */
function nameQuestionFor(block: RepeatableBlock, ctx: FlowContext): { prompt: string; placeholder: string } {
  if (block.seedFrom) {
    const naming = block.addAnotherName;
    return { prompt: naming?.prompt ?? '', placeholder: naming?.placeholder ?? '' };
  }
  const named = nameStepFor(block);
  // `ph` is a `Phrase` since V2.0 VB-62 and resolves against a context with no
  // record here, because there IS no record yet — this is the screen that makes
  // one. That is the same record-free fallback the file prints, which is what
  // keeps this screen's example and the interview's the same words.
  return {
    prompt: named ? resolvePhrase(named.q, ctx) : '',
    placeholder: named?.ph === undefined ? '' : resolvePhrase(named.ph, ctx),
  };
}

/**
 * Every repeatable block the person can act on right now, with its records.
 *
 * A block whose `skipIf` is true is left out — the same test `findPosition`
 * makes before asking any of its questions. That is not a display nicety: a
 * record added to a block the interview skips would be orphaned, because
 * pressing Next inside it would step straight past the whole block. The way
 * back to a skipped block is its own gate question, in the interview, where
 * changing the answer is a decision rather than a side effect.
 */
export function multipleGroups(
  modules: Module[],
  outline: readonly FileOutlineNode[],
  answers: Answers,
): MultipleGroup[] {
  const ctx = ctxFor(answers);
  const groups: MultipleGroup[] = [];

  for (const module of modules) {
    for (const node of module.nodes) {
      if (!('fields' in node)) continue;
      if (node.skipIf?.(ctx)) continue;
      const name = nameQuestionFor(node, ctx);
      const records = (answers.repeatables[node.id] ?? []).map((record, index) => ({
        index,
        name: nameOf(node, record),
        answered: node.fields.filter((field) => keyOf(field) in record).length,
        total: node.fields.length,
        detail: recordDetail(node, record),
      }));
      groups.push({
        blockId: node.id,
        title: titleFor(node, outline),
        seeded: Boolean(node.seedFrom),
        namePrompt: name.prompt,
        namePlaceholder: name.placeholder,
        records,
      });
    }
  }

  return groups;
}

/**
 * BS-08 (§8) — the two or three things one record actually holds.
 *
 * File order, the file's own formatter, the name excluded (it is the row's
 * title), skipped answers excluded (see `MultipleRecord.detail`), and each
 * value flattened to one line — `formatAnswerValue` renders a multi-select as
 * a markdown list, which is right in a file and wrong in a 400px row.
 */
export const RECORD_DETAIL_MAX = 3;

function oneLine(value: string): string {
  return value
    .split('\n')
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter((line) => line !== '')
    .join(', ');
}

export function recordDetail(
  block: RepeatableBlock,
  record: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const field of bodyFieldsFor(block)) {
    if (out.length === RECORD_DETAIL_MAX) break;
    const value = record[keyOf(field)] as Parameters<typeof formatAnswerValue>[1];
    const formatted = formatAnswerValue(field, value);
    if (formatted === null || formatted === SKIPPED_ANSWER_MARKER) continue;
    const line = oneLine(formatted);
    if (line !== '') out.push(line);
  }
  return out;
}

/** How many records the person holds across every block they can act on —
 * what a surface needs to decide whether to offer this at all. */
export function multipleRecordCount(
  modules: Module[],
  outline: readonly FileOutlineNode[],
  answers: Answers,
): number {
  return multipleGroups(modules, outline, answers).reduce((n, group) => n + group.records.length, 0);
}

/**
 * Is this name already one of the block's records?
 *
 * For the SEEDED block this is `runner.ts`'s `seededNameTaken` unchanged, and
 * it is a data-loss guard: two records sharing a name collapse into one on the
 * next reconcile and the second one's answers are gone (docs/GUARDRAILS.md,
 * "never lose an answer silently").
 *
 * For an open-ended block nothing rebuilds the records, so a duplicate loses
 * nothing — but the name is the only thing the list can tell two records apart
 * by, and two rows reading "Priya" means opening one and editing the other.
 * Refusing is the same answer for a different reason, and the same answer is
 * what makes the screen learnable.
 */
export function recordNameTaken(modules: Module[], answers: Answers, blockId: string, name: string): boolean {
  const block = blockById(modules, blockId);
  if (!block) return false;
  if (block.seedFrom) {
    const seedStep = findSeedStep(modules, block);
    return seedStep ? seededNameTaken(answers, block, seedStep, name) : true;
  }
  const wanted = fold(name);
  return (answers.repeatables[blockId] ?? []).some((record) => fold(nameOf(block, record)) === wanted);
}

/**
 * Adds one record, named, to either kind of block — and returns where it
 * landed, so the caller can open it.
 *
 * `null` rather than a half-applied write when the name is blank, already
 * taken, or the block cannot be grown safely (a seeded block whose seed
 * question has gone). Nothing is lost by refusing: the record would hold no
 * answers yet. `applySeededAddAnother` refuses on the same terms and returns
 * the answers it was given, which is what the identity check below reads.
 */
export function applyAddRecord(
  modules: Module[],
  answers: Answers,
  blockId: string,
  name: string,
): { answers: Answers; recordIndex: number } | null {
  const block = blockById(modules, blockId);
  const trimmed = name.trim();
  if (!block || trimmed === '') return null;
  if (recordNameTaken(modules, answers, blockId, trimmed)) return null;

  const recordIndex = (answers.repeatables[blockId] ?? []).length;

  if (block.seedFrom) {
    const seedStep = findSeedStep(modules, block);
    if (!seedStep) return null;
    const next = applySeededAddAnother(answers, block, seedStep, trimmed);
    if (next === answers) return null;
    // V3 slice one: a record is born with its identity — see skillIds.ts.
    return { answers: alignRecordIds(next, blockId), recordIndex };
  }

  // Open-ended: the name IS one of the block's questions, so adding a record is
  // answering it. `applyAnswer` already extends the array for an index that
  // does not exist yet (see its own comment) and stamps `answeredAt` under the
  // compound key freshness reads — which is right here, and deliberately not
  // right for a seeded block's name, where nothing was asked.
  const nameStep: Step | undefined = nameStepFor(block);
  if (!nameStep) return null;
  return {
    // V3 slice one: identity at birth here too (skillIds.ts).
    answers: alignRecordIds(applyAnswer(answers, nameStep, { in: 'repeatable', blockId, recordIndex }, trimmed), blockId),
    recordIndex,
  };
}
