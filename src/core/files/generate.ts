import type { Answers } from '../../schema/storage.types';
import type { AnswerValue, FileOutlineNode, FlowContext, RepeatableBlock, Step } from '../../schema/flow.types';
import { contextModules, contextOutline } from '../flow/flow';
import { buildFlowLookups, keyOf, resolvePhrase } from './lookups';
import { FILE_TITLE, GROUNDING_RULE_HEADING, SYSTEM_GROUNDING_RULE, fileIntroLine } from './source';

/**
 * Context.md generation — a reimplementation of generateContextFile()
 * from ../modelcitizen/src/lib/contextInterviewFlow.ts (source lines
 * ~1334-1447) against this repo's already-adapted Module/Step/
 * FileOutlineNode schema. See source.ts's header comment for why this is
 * a reimplementation rather than a byte-copy, and docs/RELEASE-1.md's
 * R1-09 for the accept criteria.
 *
 * One deliberate, confirmed departure from the ported source's behaviour
 * (Adam's product decision, R1-09): the source treats "explicitly
 * skipped" (`answers[id] === null`) and "never reached" (`id` absent from
 * `answers`) identically — both are simply omitted from the file. This
 * repo distinguishes them: never-reached stays fully omitted, but an
 * explicit skip still prints its question heading with a plain,
 * human-readable marker instead of an answer, so R1-10's parser can tell
 * the two apart on reimport. See docs/ARCHITECTURE.md's "wb:answers,
 * precisely" for why that distinction matters to storage in the first
 * place.
 */

/** New copy, not ported — the confirmed-decision marker above. Written to
 * this file's own voice (plain declarative sentence, no jargon, doesn't
 * read as a placeholder token) per docs/design-system.html §08. Lives
 * here rather than src/panel/strings.ts because it's Context.md file
 * content, not panel UI chrome — the same reasoning that keeps ported
 * interview copy in core/flow/source.ts instead of strings.ts. */
export const SKIPPED_ANSWER_MARKER = 'Left unanswered on purpose.';

/** A predefined option's value resolves to its label; anything else (a
 * custom `allowCustom` add) already IS the literal text the person typed,
 * so it passes through unchanged. Mirrors the source's `optionLabelFor`. */
function optionLabelFor(step: Step, value: string): string {
  return step.options?.find((o) => o.v === value)?.l ?? value;
}

/** Renders one answer for the file: `undefined` (never reached) stays
 * fully omitted (returns null, same as the source); `null` (explicitly
 * skipped) renders the marker instead of being omitted — the one
 * confirmed departure from the source's formatAnswerValue, see the module
 * comment above.
 *
 * Exported since V1.4 VB-23 for core/flow/nodeDetails.ts, which shows the
 * same answers in the globe's detail panel. Exported rather than copied on
 * purpose: two formatters would drift, and the panel claiming a person said
 * something slightly different from what their own file says would be worse
 * than showing nothing at all. */
export function formatAnswerValue(step: Step, value: AnswerValue | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return SKIPPED_ANSWER_MARKER;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.map((v) => `- ${optionLabelFor(step, v)}`).join('\n');
  }
  if (!value.trim()) return null;
  return step.kind === 'chips' ? optionLabelFor(step, value) : value.trim();
}

/**
 * What one repeatable record is called, both in the file and — since V1.1
 * VB-07 — in the panel's file tree. Lifted out of `renderRepeatableRecord`
 * unchanged so the tree cannot drift from the heading the file actually
 * prints: a seeded block (roles) titles a record by its seed value, an
 * open-ended one (entities, initiatives) by its first sub-question's answer.
 */
export function repeatableRecordTitle(block: RepeatableBlock, record: Record<string, AnswerValue>): string {
  if (block.seedFrom) {
    const seedVal = record[block.seedFrom.seedField];
    return typeof seedVal === 'string' && seedVal ? seedVal : 'Untitled';
  }
  const firstField = block.fields[0];
  return (firstField && formatAnswerValue(firstField, record[firstField.id])) || 'Untitled';
}

/** One repeatable record (a role, an entity, an initiative) as its own
 * mini Q&A block. Mirrors the source's `renderRepeatableRecord`. */
function renderRepeatableRecord(block: RepeatableBlock, record: Record<string, AnswerValue>, ctx: FlowContext): string {
  const title = repeatableRecordTitle(block, record);
  const bodyFields: Step[] = block.seedFrom ? block.fields : block.fields.slice(1);
  const lines = bodyFields
    .filter((f) => f.kind !== 'yesno' && f.kind !== 'intro')
    .map((f) => {
      const formatted = formatAnswerValue(f, record[keyOf(f)]);
      return formatted ? `- **${resolvePhrase(f.q, ctx)}:** ${formatted.replace(/\n/g, ' ').replace(/^- /, '')}` : null;
    })
    .filter((line): line is string => line !== null);
  return lines.length ? `**${title}**\n${lines.join('\n')}` : `**${title}**`;
}

/** Mirrors the source's `renderFileSection`. */
function renderFileSection(
  node: FileOutlineNode,
  ctx: FlowContext,
  depth: number,
  lookups: ReturnType<typeof buildFlowLookups>,
): string {
  const parts: string[] = [];
  const repeatableBlocksSeen = new Set<string>();

  for (const qid of node.questionIds) {
    const block = lookups.repeatableBlockForQuestionId.get(qid);
    if (block) {
      repeatableBlocksSeen.add(block.id);
      continue;
    }
    const step = lookups.stepsById.get(qid);
    if (!step || step.kind === 'yesno' || step.kind === 'intro') continue;
    const formatted = formatAnswerValue(step, ctx.answers[qid]);
    if (!formatted) continue;
    parts.push(`**${resolvePhrase(step.q, ctx)}**\n${formatted}`);
  }

  for (const blockId of repeatableBlocksSeen) {
    const block = lookups.repeatableBlocksById.get(blockId);
    if (!block) continue;
    const records = ctx.repeatables[blockId] ?? [];
    for (const record of records) parts.push(renderRepeatableRecord(block, record, ctx));
  }

  const childParts = (node.children ?? []).map((child) => renderFileSection(child, ctx, depth + 1, lookups)).filter(Boolean);
  const body = [...parts, ...childParts].join('\n\n');
  if (!body.trim()) return '';
  return `${'#'.repeat(depth + 1)} ${node.label}\n\n${body}`;
}

/** One top-level section of the generated file, kept whole. `id`/`label` are
 * its `FileOutlineNode`'s own, so a caller can line a section up against the
 * outline row that produced it without re-deriving anything. */
export interface ContextFileSection {
  id: string;
  label: string;
  /** The section's rendered markdown, heading included. Never empty — a
   * section with nothing answered is dropped, not returned blank. */
  text: string;
}

/**
 * The generated file, in pieces and whole.
 *
 * V1.1 VB-07b needs per-section output so the panel's live preview can render
 * (and animate) each section as its own node instead of re-rendering one
 * opaque string. `text` is the joined file, and it is the *only* thing
 * `generateContextFile` returns — the two can never drift, because there is
 * one assembly and both callers read it. That matters: R1-10's download/import
 * round-trip is asserted byte-for-byte, and its accept line treats a failure
 * there as a release blocker.
 */
export interface ContextFileParts {
  /** Title + the generated-on line, always emitted. */
  header: string;
  /** Only the sections with something in them — `renderFileSection` returns
   * '' for a section with an empty body, which is what makes sections appear
   * in the preview exactly as they are answered, with no reveal machinery. */
  sections: ContextFileSection[];
  /** The grounding-rule heading and paragraph, always emitted. */
  footer: string;
  /** Byte-identical to `generateContextFile` for the same arguments. */
  text: string;
}

/**
 * Turns `answers` into the real Context.md, section by section and joined —
 * mirrors the source's `generateContextFile`. `modules`/`outline` default to
 * the real ported flow (`contextModules`/`contextOutline`) and are only ever
 * overridden in tests, matching core/flow/adapter.ts's `adaptContextFlow`
 * pattern.
 */
export function generateContextFileParts(
  answers: Pick<Answers, 'values' | 'repeatables'>,
  generatedOn: string,
  modules = contextModules,
  outline: FileOutlineNode[] = contextOutline,
): ContextFileParts {
  const lookups = buildFlowLookups(modules);
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  const sections: ContextFileSection[] = [];
  for (const node of outline) {
    const text = renderFileSection(node, ctx, 1, lookups);
    if (text) sections.push({ id: node.id, label: node.label, text });
  }

  const header = `${FILE_TITLE}

${fileIntroLine(generatedOn)}`;
  const footer = `${GROUNDING_RULE_HEADING}

${SYSTEM_GROUNDING_RULE}
`;
  return {
    header,
    sections,
    footer,
    text: `${header}

${sections.map((section) => section.text).join('\n\n')}

${footer}`,
  };
}

/**
 * The downloaded file. Unchanged in behaviour and output — it is now one
 * field of `generateContextFileParts`, so the panel's live preview and the
 * download are literally the same bytes rather than two implementations that
 * agree today.
 */
export function generateContextFile(
  answers: Pick<Answers, 'values' | 'repeatables'>,
  generatedOn: string,
  modules = contextModules,
  outline: FileOutlineNode[] = contextOutline,
): string {
  return generateContextFileParts(answers, generatedOn, modules, outline).text;
}

/**
 * The `generatedOn` stamp both the download and the live preview use, so the
 * two agree byte-for-byte rather than by coincidence of formatting. Pure —
 * `Date` is not the DOM, and the clock is injectable for tests, the same
 * shape core/freshness/clocks.ts already uses.
 */
export function contextFileDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
