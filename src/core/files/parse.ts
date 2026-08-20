import type { Answers } from '../../schema/storage.types';
import type { AnswerValue, FileOutlineNode, FlowContext, RepeatableBlock, Step } from '../../schema/flow.types';
import { contextModules, contextOutline } from '../flow/flow';
import { buildFlowLookups, keyOf, resolvePhrase, type FlowLookups } from './lookups';
import { SYSTEM_GROUNDING_RULE } from './source';
import { SKIPPED_ANSWER_MARKER } from './generate';

/**
 * The Context.md parser. Genuinely new work — the sibling app never reads
 * its own generated file back (see docs/CONTENT-SOURCES.md's R1-09 row).
 * Walks `contextOutline` in the same depth-first order `generate.ts` used
 * to write the file, resolving ctx-dependent prompts (e.g.
 * `stop_explaining`, which reads `context_scope`) incrementally against
 * what's already been parsed earlier in the same walk, rather than a
 * static heading-text -> question-id table — a static table can't work
 * here because a heading's exact text depends on answers the parser
 * hasn't seen yet when it starts reading.
 *
 * `cursorForQuestionId` (same source region as the generator) is
 * deliberately not ported — no outline-browsing UI exists yet to use it.
 */

export type ParsedAnswers = Pick<Answers, 'values' | 'repeatables'>;

export type ParseContextFileResult =
  | { ok: true; answers: ParsedAnswers }
  /** The one documented failure case (docs/GUARDRAILS.md's degradation
   * table, "Export parse fails"): the System Grounding Rule paragraph is
   * missing or altered. Returned as a result, not thrown — this repo's
   * message contract (docs/ARCHITECTURE.md) treats a failure as a normal
   * outcome the caller reads, never an exception it has to catch; the
   * actual person-facing copy ("I couldn't read that one. Here's how to
   * get a fresh export.") belongs to whichever panel surface consumes
   * this at R1-10, from src/panel/strings.ts, not to this core module. */
  | { ok: false; reason: 'grounding-rule-missing' };

interface HeadingBlock {
  level: number;
  label: string;
  body: string;
}

/** Splits the whole file into heading blocks (any `##`-`######` line),
 * each paired with the raw text between it and the next heading of ANY
 * level. That "next heading, any level" boundary is what makes this work
 * without tracking nesting explicitly: a parent section's own directly-
 * owned content is exactly what sits between its heading and its first
 * child's heading (see generate.ts's `renderFileSection` — a parent's own
 * `parts` are always written before any child section's heading), and
 * every node's `label` is fixed, static text (never ctx-dependent, unlike
 * question prompts) — so matching a node to its heading by label alone is
 * exact and needs no positional assumptions. */
function extractHeadings(markdown: string): HeadingBlock[] {
  const headingRe = /^(#{2,6})\s+(.*)$/;
  const blocks: HeadingBlock[] = [];
  let current: { level: number; label: string; lines: string[] } | null = null;

  for (const line of markdown.split('\n')) {
    const m = headingRe.exec(line);
    if (m) {
      if (current) blocks.push({ level: current.level, label: current.label, body: current.lines.join('\n').trim() });
      current = { level: m[1]!.length, label: m[2]!.trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push({ level: current.level, label: current.label, body: current.lines.join('\n').trim() });
  return blocks;
}

interface RawBlock {
  heading: string;
  content: string;
}

/** Splits one section's own body into its Q&A / record blocks. Every
 * block the generator ever writes starts with a line that is a bold
 * heading and NOTHING else (`**question prompt**` or `**record title**`,
 * see generate.ts's `renderFileSection`/`renderRepeatableRecord`) — so a
 * line matching `^\*\*(.+)\*\*$` on its own reliably marks the start of a
 * new block, even when the content that follows is itself multi-line free
 * text with embedded blank lines. */
function splitBlocks(body: string): RawBlock[] {
  const boldLineRe = /^\*\*(.+)\*\*$/;
  const blocks: RawBlock[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of body.split('\n')) {
    const m = boldLineRe.exec(line);
    if (m) {
      if (current) blocks.push({ heading: current.heading, content: current.lines.join('\n').trim() });
      current = { heading: m[1]!, lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push({ heading: current.heading, content: current.lines.join('\n').trim() });
  return blocks;
}

const RECORD_FIELD_LINE_RE = /^-\s\*\*.+?:\*\*\s?.*$/;

/** Distinguishes a repeatable record's bullets from a plain answer BY
 * STRUCTURE (every content line is a `- **Field:** value` bullet), not by
 * where the block sits or how many blocks came before it — a plain
 * multi-select answer also renders as bullets, but as bare `- Label`
 * lines with no bold field name, so it never matches this. */
function looksLikeRecord(block: RawBlock): boolean {
  if (!block.content) return false;
  return block.content.split('\n').every((line) => RECORD_FIELD_LINE_RE.test(line));
}

/** A label resolves back to the option's own value; an unmatched label is
 * assumed to be a custom (`allowCustom`) entry, which the generator wrote
 * out as literal text in the first place — so it passes through
 * unchanged, the exact reverse of generate.ts's `optionLabelFor`.
 * `optionRephrasings` variants are checked too (per the R1-09 brief) even
 * though the real generator never renders a rephrased label — each
 * variant carries the same `v` as the base option it rephrases (see
 * flow.types.ts's `optionRephrasings` doc comment), so no extra
 * index-matching is needed once a variant entry is found. */
function valueForLabel(step: Step, label: string): string {
  const base = step.options?.find((o) => o.l === label);
  if (base) return base.v;
  for (const variant of step.optionRephrasings ?? []) {
    const match = variant.find((o) => o.l === label);
    if (match) return match.v;
  }
  return label;
}

/** The reverse of generate.ts's `formatAnswerValue` for one already-
 * isolated answer block. Returns `undefined` when the content can't be
 * read as this step's kind at all — the caller drops it rather than
 * guessing, per docs/GUARDRAILS.md's "drop an individual unmatched
 * heading rather than discarding the whole file". */
function parsePlainValue(step: Step, rawContent: string): AnswerValue | undefined {
  const trimmed = rawContent.trim();
  if (trimmed === SKIPPED_ANSWER_MARKER) return null;

  if (step.kind === 'multi') {
    if (!trimmed) return undefined;
    const values: string[] = [];
    for (const raw of trimmed.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^-\s(.*)$/.exec(line);
      if (!m) return undefined;
      values.push(valueForLabel(step, m[1]!));
    }
    return values.length ? values : undefined;
  }

  if (step.kind === 'chips') {
    return trimmed ? valueForLabel(step, trimmed) : undefined;
  }

  if (step.kind === 'text') {
    return trimmed ? trimmed : undefined;
  }

  return undefined; // yesno/intro never reach here — never written to the file in the first place
}

function parseRecordBlock(raw: RawBlock, block: RepeatableBlock, ctx: FlowContext): Record<string, AnswerValue> {
  const record: Record<string, AnswerValue> = {};
  let bodyFields = block.fields;

  if (block.seedFrom) {
    // Seeded blocks (e.g. "roles") store the title itself, verbatim, as
    // the seed field's value — see core/flow/runner.ts's
    // reconcileSeededRepeatable, which seeds records with the option's
    // LABEL text directly, not its key. No reversal needed.
    record[block.seedFrom.seedField] = raw.heading;
  } else {
    const [firstField, ...rest] = block.fields;
    bodyFields = rest;
    if (firstField) {
      const titleValue = parsePlainValue(firstField, raw.heading);
      record[keyOf(firstField)] = titleValue === undefined ? raw.heading : titleValue;
    }
  }

  const lines = raw.content ? raw.content.split('\n') : [];
  const fieldLineRe = /^-\s\*\*(.+?):\*\*\s?(.*)$/;
  let cursor = 0;
  for (const field of bodyFields) {
    if (field.kind === 'yesno' || field.kind === 'intro') continue;
    if (cursor >= lines.length) continue;
    const m = fieldLineRe.exec(lines[cursor]!);
    if (!m) continue;
    const [, fieldHeading, valueText] = m;
    if (fieldHeading !== resolvePhrase(field.q, ctx)) continue; // this field wasn't answered — try the next field against the same line
    const value = parsePlainValue(field, valueText ?? '');
    if (value !== undefined) record[keyOf(field)] = value;
    cursor++;
  }
  return record;
}

function parseNodeBody(node: FileOutlineNode, body: string, ctx: FlowContext, lookups: FlowLookups, out: ParsedAnswers): void {
  const blocks = splitBlocks(body);

  const plainIds: string[] = [];
  let repeatableBlock: RepeatableBlock | undefined;
  for (const qid of node.questionIds) {
    const block = lookups.repeatableBlockForQuestionId.get(qid);
    if (block) {
      // Real ported data never references more than one repeatable block
      // from a single outline node (roles/entities/initiatives each own
      // exactly one section) — the first one found is the only one this
      // parser resolves; see the module comment's scope note.
      repeatableBlock ??= block;
      continue;
    }
    plainIds.push(qid);
  }

  let idx = 0;
  for (const qid of plainIds) {
    const step = lookups.stepsById.get(qid);
    if (!step || step.kind === 'yesno' || step.kind === 'intro') continue; // never written to the file — nothing to consume
    if (idx >= blocks.length || looksLikeRecord(blocks[idx]!)) break; // structurally, we've reached the records section
    const expected = resolvePhrase(step.q, ctx);
    if (blocks[idx]!.heading !== expected) continue; // this question was never answered — try the next one against the same block
    const value = parsePlainValue(step, blocks[idx]!.content);
    if (value !== undefined) {
      out.values[qid] = value;
      ctx.answers[qid] = value;
    }
    idx++;
  }

  if (repeatableBlock) {
    const records: Record<string, AnswerValue>[] = [];
    while (idx < blocks.length) {
      records.push(parseRecordBlock(blocks[idx]!, repeatableBlock, ctx));
      idx++;
    }
    if (records.length) {
      out.repeatables[repeatableBlock.id] = records;
      ctx.repeatables[repeatableBlock.id] = records;
    }
  }
}

/**
 * Reads a Context.md back into `Answers.values`/`Answers.repeatables`.
 * `modules`/`outline` default to the real ported flow and are only ever
 * overridden in tests, matching generate.ts's own pattern.
 */
export function parseContextFile(
  markdown: string,
  modules = contextModules,
  outline: FileOutlineNode[] = contextOutline,
): ParseContextFileResult {
  const headings = extractHeadings(markdown);
  const grounding = headings.find((h) => h.label === 'System Grounding Rule');
  if (!grounding || grounding.body !== SYSTEM_GROUNDING_RULE.trim()) {
    return { ok: false, reason: 'grounding-rule-missing' };
  }

  const byLabel = new Map<string, HeadingBlock>();
  for (const h of headings) if (!byLabel.has(h.label)) byLabel.set(h.label, h);

  const lookups = buildFlowLookups(modules);
  const ctx: FlowContext = { answers: {}, repeatables: {} };
  const out: ParsedAnswers = { values: {}, repeatables: {} };

  function walk(node: FileOutlineNode): void {
    const heading = byLabel.get(node.label);
    if (heading) parseNodeBody(node, heading.body, ctx, lookups, out);
    for (const child of node.children ?? []) walk(child);
  }
  for (const node of outline) walk(node);

  return { ok: true, answers: out };
}
