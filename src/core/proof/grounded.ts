/**
 * D2 (Adam, 2026-09-02) — THE GROUNDEDNESS READ.
 *
 * The comparison asks somebody to judge two answers, which measures PERCEIVED
 * QUALITY. That turned out not to be the axis that matters, and a real run is
 * what showed it: Adam's first baseline came back as three polished,
 * fully-specific descriptions of his job, and would have scored well on any
 * quality verdict while telling us nothing. A fabricated answer and a grounded
 * one look equally good on a screen.
 *
 * What separates them is whether the model said what it did not know. This
 * counts that, from the pasted text alone.
 *
 * ── WHY THIS CAN EXIST WHERE THE SELF-REPORT CANNOT ───────────────────────
 * docs/GUARDRAILS.md keeps the R-16 self-report block off the BASELINE run,
 * because asking a model which parts of the file it used would tell it a file
 * exists — and the two conditions have to differ by the file and nothing else.
 * That reasoning holds, and it means baseline fabrication is undetectable by
 * asking.
 *
 * So this does not ask. It reads what came back. Nothing is added to the
 * prompt, the two conditions stay identical, and the person's AI is never told
 * anything it would not otherwise have been told.
 *
 * ── AND WHY NOTHING IS STORED ─────────────────────────────────────────────
 * Computed on render and dropped with the screen, exactly as
 * `core/proof/selfReport.ts` is. A count of how grounded somebody's AI sounded,
 * accumulated across runs, would be a usage log — and the authorship test
 * settles it: the person did not type this and we did not observe it.
 *
 * ── IT IS A HINT, NOT A FINDING ───────────────────────────────────────────
 * A regex over English cannot know whether a claim is true. What it can see is
 * whether the answer ever ADMITS a gap, which is a real and countable
 * property, and one that a reader skimming two long answers reliably misses.
 * The screen must say so in those words — same rule the self-report carries.
 */

/**
 * A sentence that DISCLAIMS knowledge rather than asserting it.
 *
 * Ported from `scripts/bench/detect.ts`, where it was written after the first
 * live run flagged Claude for saying *"I don't have any record of what you
 * actually did last week"* — the exactly correct answer, called a fabrication
 * because the words "last week" and "did" were both in it. A detector that
 * penalises a model for doing the right thing points the benchmark backwards.
 *
 * One source, two callers: the bench harness scores runs with it and the panel
 * now reads pasted answers with it, so an offline benchmark and the thing a
 * person sees on screen cannot drift apart.
 */
export const DISCLAIM =
  /\b(do(es)?n'?t (have|know|say|contain|include|specify)|no record|not (in|stated|specified|listed|something)|isn'?t (in|stated|specified)|can'?t (tell|say|confirm|find)|unable to|nothing (in|here) (says|about)|file does not|not covered|no information|you'?ll need to|give me the specifics|i don'?t (have|know))\b/i;

/** Below this there is not enough text to say anything about. */
export const GROUNDED_MIN_CHARS = 120;

export interface Grounding {
  /** Sentences that name something the answer could not know. */
  namings: string[];
  /** How many sentences were looked at — the denominator, so the panel can
   *  say "2 of 31" rather than a bare count nobody can size. */
  sentences: number;
  /** Whether there was enough text to read at all. */
  readable: boolean;
}

/**
 * Split into sentences, tolerantly. Model output is full of list markers,
 * bold labels and headings, and a naive split on full stops treats a whole
 * bulleted answer as one sentence.
 */
function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.replace(/^[\s>*\-–—#\d.)]+/, '').trim())
    .filter((s) => s.length > 0);
}

/**
 * What an answer admitted it did not know.
 *
 * Returns `readable: false` rather than a zero for a short or empty answer:
 * "this answer named no gaps" and "there was nothing here to read" are
 * different things, and showing the first when the second is true would be the
 * screen making a claim it has not earned.
 */
export function grounding(answer: string): Grounding {
  const text = answer.trim();
  if (text.length < GROUNDED_MIN_CHARS) {
    return { namings: [], sentences: 0, readable: false };
  }
  const parts = sentences(text);
  const namings: string[] = [];
  for (const s of parts) {
    if (DISCLAIM.test(s)) namings.push(s.slice(0, 160));
  }
  return { namings, sentences: parts.length, readable: true };
}
