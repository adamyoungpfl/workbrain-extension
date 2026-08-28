import type { FlowContext, Module, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { buildFlowLookups, keyOf, resolvePhrase } from './lookups';
import { SKIPPED_ANSWER_MARKER, formatAnswerValue } from './generate';

/**
 * BS-05c (§5) — the line the answer just wrote, for the slip under it.
 *
 * §5: "Show the file writing itself, inline, once per answer. A two-line slip
 * under the answer holding the actual markdown that just landed. This is the
 * drawer's payoff delivered where the eye already is, and the cheapest way to
 * make the product feel like it is doing something."
 *
 * ── IT IS THE FILE'S OWN BYTES, NOT A DESCRIPTION OF THEM ─────────────────
 *
 * `**question**\nanswer` is exactly what `renderFileSection` pushes for a
 * top-level question (core/files/generate.ts), assembled here by calling the
 * same `formatAnswerValue` and the same `resolvePhrase`. The slip therefore
 * shows a substring of the download, not a rendering that looks like one —
 * which is the whole claim §5 is making. A second formatter would agree today
 * and drift by the next question type somebody adds.
 *
 * ── WHAT WRITES NOTHING ───────────────────────────────────────────────────
 *
 * `null`, and the panel shows no slip rather than an empty one:
 *
 *   · a SKIP. `formatAnswerValue` returns the file's own "left unanswered on
 *     purpose" marker, which is a real line in the file — but a slip saying
 *     the file just recorded a blank is the product congratulating itself for
 *     nothing. The drawer still shows it; the slip is for momentum.
 *   · a GATE (`yesno`) and an INTRO. Neither reaches the file at all, which
 *     `renderFileSection` decides by the same two `kind` checks.
 *   · a question inside a REPEATABLE. Its record is rendered whole, by the
 *     block, so there is no single line one field wrote — and naming one
 *     would be inventing a fact the file does not contain.
 */
export function writtenLineFor(
  questionId: string,
  answers: Pick<Answers, 'values' | 'repeatables'>,
  modules: Module[],
): string | null {
  const lookups = buildFlowLookups(modules);

  // A field of a repeatable writes into its record, not a line of its own.
  if (lookups.repeatableBlockForQuestionId.has(questionId)) return null;

  const step: Step | undefined = lookups.stepsById.get(questionId);
  if (!step || step.kind === 'yesno' || step.kind === 'intro') return null;

  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  const formatted = formatAnswerValue(step, answers.values[keyOf(step)]);
  if (!formatted || formatted === SKIPPED_ANSWER_MARKER) return null;

  return `**${resolvePhrase(step.q, ctx)}**\n${formatted}`;
}

/**
 * The line, split the way the slip reads it: the question it answered, and
 * WHAT THE PERSON WROTE.
 *
 * ── WHY THE ANSWER LEADS ──────────────────────────────────────────────────
 *
 * The first build showed the raw line and clamped it to two visual lines. On
 * a 400px panel a bolded question is three visual lines on its own, so the
 * clamp ate the answer and the slip showed nothing but the question somebody
 * had just finished reading — the exact opposite of §5's point, which is that
 * a person sees THEIR OWN WORDS becoming file content.
 *
 * So the two parts are separated here rather than truncated in CSS. `body` is
 * still the file's own bytes for the answer — `formatAnswerValue`'s output,
 * unaltered, bullets and all — and `heading` is the question exactly as the
 * file bolds it, for the caption. Neither is a rewording.
 */
export interface WrittenSlip {
  /** The question, as the file writes it, without the bold markers. */
  heading: string;
  /** What they wrote, verbatim, capped at `WRITTEN_SLIP_LINES` lines. */
  body: string[];
  /** Lines of the answer the cap left out. */
  more: number;
}

export const WRITTEN_SLIP_LINES = 2;

export function writtenSlip(line: string | null): WrittenSlip | null {
  if (!line) return null;
  const [first, ...rest] = line.split('\n');
  if (rest.length === 0) return null;

  // The cut is by LINE, not by character — a multi-select writes one bullet
  // per choice, so two lines is two whole choices rather than half a word.
  return {
    heading: (first ?? '').replace(/^\*\*|\*\*$/g, ''),
    body: rest.slice(0, WRITTEN_SLIP_LINES),
    more: Math.max(0, rest.length - WRITTEN_SLIP_LINES),
  };
}
