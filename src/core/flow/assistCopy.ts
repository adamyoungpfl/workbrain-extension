/**
 * V2.5 VB-119 — what the AI Assist sheet SAYS, step by step.
 *
 * "Let my AI ask me" grew up into AI Assist: pressing the control dims the
 * app and runs a stepped mini-interview in a full-height sheet (FLAG 1,
 * confirmed — the sanctioned sheet mechanism wearing Adam's pause). Each
 * step is one short line, printed AND spoken — the narrator pairing rides
 * the same seam as every other interview line (core/voice/narration.ts's
 * Narration shape, injected through the panel's useNarration).
 *
 * The lines live HERE, in core, not in src/panel/strings.ts, because they
 * are the interview's voice speaking — the same reasoning as overrides.ts
 * and reflectFrames.ts's headers. Chrome around them (button labels, the
 * sheet's title) stays in strings.ts. All copy [DRAFT] — V2.5's operating
 * rule: built tonight, Adam's morning review adjusts words — measured by
 * this module's own reading-grade harness in assistCopy.test.ts.
 *
 * VB-120 (FLAG 3) adds the ENCOURAGING variant: when the sheet opens from
 * the "AI Assist (Recommended)" nudge, step 1 leads with one extra line in
 * the "a quick AI interview can give you a strong start" register. The law
 * that line must keep (docs/GUARDRAILS.md, "no nudges framed as guilt"):
 * it NEVER names a deficiency — not "short", not "too", not "more detail".
 * assistCopy.test.ts pins that as an assertion, not a hope.
 */

/** [DRAFT] Step 1 — the copy step. The control it points at is the sheet's
 * one glowing thing (the flow's sanctioned attention cue), so the words
 * carry the what and the glow only ever carries the where. */
export const ASSIST_LINE_COPY = 'Next, hit the copy button below.';

/**
 * [DRAFT] V2.8 VB-138 — the SINGLE-STEP instruction bar's one line, the
 * whole journey in a sentence: copy, carry it to their AI, come back. It
 * replaced the sheet's three step lines when assist went inline (Adam:
 * "handle it all in the single step"); the copy control sits at the line's
 * end, icon-led, and the full prompt stays behind an expander — present,
 * never assumed read.
 */
export function assistBarLine(serviceLabel: string | undefined): string {
  return `Copy this prompt and paste it into ${serviceLabel ?? 'your AI'}.`;
}

/** [DRAFT] Step 3 — the return trip. The box is in the sheet, highlighted;
 * submit lands the text in the question's own answer field, editable. */
export const ASSIST_LINE_RETURN = 'Paste what it wrote back into this box.';

/** [DRAFT] VB-120's encouraging lead — the ONLY wording difference between
 * the nudged sheet and the ordinary one. An offer about a strong start,
 * never a verdict about what is already typed. */
export const ASSIST_ENCOURAGING_LEAD = 'A quick AI interview can give you a strong start.';

/**
 * [DRAFT] Step 2 — the hand-off. Names THEIR AI when the goal gate captured
 * one (resolved by the caller via reflectFrames.ts's goalServiceLabelFor —
 * the same resolver the reflect voice line and the old popover used, so no
 * two screens can ever name different AIs), "your AI" when unknown.
 */
export function assistPasteLine(serviceLabel: string | undefined): string {
  return `Paste it into ${serviceLabel ?? 'your AI'}.`;
}

/** The three steps of the mini-interview, in walking order. */
export type AssistStep = 1 | 2 | 3;

/** The one printed-and-spoken line for a step — the panel renders exactly
 * this and hands exactly this to the narrator, so the screen and the voice
 * can never drift (the reflectVoiceLine rule, one surface over). */
export function assistStepLine(step: AssistStep, serviceLabel: string | undefined): string {
  if (step === 1) return ASSIST_LINE_COPY;
  if (step === 2) return assistPasteLine(serviceLabel);
  return ASSIST_LINE_RETURN;
}

/** Every line of user-facing wording this file authors, for the
 * reading-grade and sentence-length harness — the overrides.ts convention.
 * The step-2 line rides in its longest real form (a named service). */
export function allAssistCopy(): string[] {
  return [
    ASSIST_LINE_COPY,
    assistPasteLine('Perplexity'),
    assistPasteLine(undefined),
    ASSIST_LINE_RETURN,
    ASSIST_ENCOURAGING_LEAD,
    assistBarLine('Perplexity'),
    assistBarLine(undefined),
  ];
}
