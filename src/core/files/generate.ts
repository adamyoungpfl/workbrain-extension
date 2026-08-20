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
 * comment above. */
function formatAnswerValue(step: Step, value: AnswerValue | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return SKIPPED_ANSWER_MARKER;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return value.map((v) => `- ${optionLabelFor(step, v)}`).join('\n');
  }
  if (!value.trim()) return null;
  return step.kind === 'chips' ? optionLabelFor(step, value) : value.trim();
}

/** One repeatable record (a role, an entity, an initiative) as its own
 * mini Q&A block. Mirrors the source's `renderRepeatableRecord`. */
function renderRepeatableRecord(block: RepeatableBlock, record: Record<string, AnswerValue>, ctx: FlowContext): string {
  let title: string;
  let bodyFields: Step[];
  if (block.seedFrom) {
    const seedVal = record[block.seedFrom.seedField];
    title = typeof seedVal === 'string' && seedVal ? seedVal : 'Untitled';
    bodyFields = block.fields;
  } else {
    const [firstField, ...rest] = block.fields;
    title = (firstField && formatAnswerValue(firstField, record[firstField.id])) || 'Untitled';
    bodyFields = rest;
  }
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

/**
 * Turns `answers` into the real Context.md — mirrors the source's
 * `generateContextFile`. `modules`/`outline` default to the real ported
 * flow (`contextModules`/`contextOutline`) and are only ever overridden in
 * tests, matching core/flow/adapter.ts's `adaptContextFlow` pattern.
 */
export function generateContextFile(
  answers: Pick<Answers, 'values' | 'repeatables'>,
  generatedOn: string,
  modules = contextModules,
  outline: FileOutlineNode[] = contextOutline,
): string {
  const lookups = buildFlowLookups(modules);
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  const sections = outline.map((node) => renderFileSection(node, ctx, 1, lookups)).filter(Boolean);
  return `${FILE_TITLE}

${fileIntroLine(generatedOn)}

${sections.join('\n\n')}

${GROUNDING_RULE_HEADING}

${SYSTEM_GROUNDING_RULE}
`;
}
