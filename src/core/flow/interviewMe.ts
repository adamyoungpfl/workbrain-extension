import type { FlowContext } from '../../schema/flow.types';

/**
 * V2.3 VB-94 — the interview-me prompt: the escape hatch for a person who
 * freezes at an open text box. Their own AI interviews them — a few short
 * questions, follow-ups allowed — and hands back a finished answer inside
 * one fenced block, which they copy once and paste into the waiting input.
 *
 * Two halves, both pure:
 *  - `interviewMePrompt` builds the prompt (copy below is [DRAFT] — V2.3's
 *    operating rule: built tonight, Adam's morning review adjusts words; it
 *    lives in core beside the other prompt builders, same reasoning as
 *    `overrides.ts`'s header — interview wording is not panel chrome).
 *  - `normalizePastedReply` lands the paste — the sibling repo's
 *    `parseStepLines` move (WorkBrainSkillsBuilder.tsx) generalized from
 *    "a list of steps" to "any answer": unwrap the fence, strip the
 *    bullets, settle the whitespace. What lands is editable text in the
 *    ordinary field — click into the frame and type, no edit button.
 *
 * The trust line this file must never cross (docs/GUARDRAILS.md): the
 * pasted reply is the person's own content, typed into a field they can
 * see and edit. Nothing here stores, scores, or transmits anything.
 */

/**
 * The fenced block the prompt asks for, and the one thing the paste
 * handler looks for. A plain string, not a regex, so the prompt template
 * and the detector can never drift apart.
 */
export const ANSWER_FENCE = '```';

/**
 * [DRAFT] The prompt a person copies into their own AI. Grounded in the
 * question on screen and — when the goal gate captured one (VB-93) — the
 * thing they said they most want their AI to do better, so the interview
 * starts from what matters to them rather than from zero.
 */
export function interviewMePrompt(question: string, ctx: FlowContext): string {
  const want = ctx.answers['goal_want'];
  const goalLine =
    typeof want === 'string' && want.trim() !== ''
      ? `\nFor context, the thing I most want you to do better for me: "${want.trim()}"\n`
      : '\n';
  return `I'm answering this question about how I work, and I'd rather talk it out than write it cold:

"${question}"
${goalLine}
Interview me. Ask me 3 to 5 short questions, one at a time — follow-ups are fine. When you have enough, write my answer for me: first person, my words and details, no preamble.

Put the finished answer alone inside one fenced code block (three backticks) so I can copy it in one click.`;
}

/**
 * Landed once per line: numbering and bullets ("1.", "1)", "-", "*", "•")
 * come off, because however the AI formatted its list, what belongs in the
 * answer is the text. Same expression as the sibling's `parseStepLines`.
 */
const LINE_MARKER = /^\s*(?:\d+[.)]|[-*•])\s*/;

/**
 * True when a paste looks like it came back from the interview-me round
 * trip — the fence is the signature. Ordinary pastes must land untouched
 * (never reformat text the person did not ask to have reformatted), so the
 * caller gates on this before normalizing.
 */
export function looksLikeFencedReply(text: string): boolean {
  return text.includes(ANSWER_FENCE);
}

/**
 * The paste, made ready for the field:
 *  1. When fenced blocks are present, keep only the LAST one — an AI often
 *     narrates before its final answer, and the answer is the fence.
 *     (A language tag on the opening fence — "```text" — is dropped.)
 *  2. Strip per-line numbering/bullets.
 *  3. Settle whitespace: trailing space off each line, runs of blank lines
 *     down to one, blank edges trimmed.
 */
export function normalizePastedReply(text: string): string {
  let body = text;
  const fenced = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
  const last = fenced[fenced.length - 1];
  if (last) {
    body = last[1] ?? '';
  } else if (text.includes(ANSWER_FENCE)) {
    // A lone/unterminated fence: take what follows the first fence line.
    const at = text.indexOf(ANSWER_FENCE);
    const lineEnd = text.indexOf('\n', at);
    body = lineEnd === -1 ? '' : text.slice(lineEnd + 1);
  }
  const lines = body.split('\n').map((line) => line.replace(LINE_MARKER, '').trimEnd());
  const settled: string[] = [];
  for (const line of lines) {
    if (line === '' && settled[settled.length - 1] === '') continue;
    settled.push(line);
  }
  return settled.join('\n').trim();
}
