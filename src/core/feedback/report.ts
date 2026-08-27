import { BUILD_VERSION } from '../build';

/**
 * BS-02 — the feedback door's payload.
 *
 * The beta exists to collect what testers think, and until now there was no
 * way for one to tell us anything. `docs/GUARDRAILS.md` does not forbid this:
 * it forbids **silent** collection. Nothing here is stored, nothing is
 * observed, and nothing is transmitted by the extension — the person presses
 * send in their own mail client, with the whole text in front of them.
 *
 * ── WHY THE SHAPE IS A CLOSED LIST AND NOT A FREE OBJECT ──────────────────
 *
 * The one way this feature could betray the product is by carrying something
 * the person wrote. So the block is assembled from a fixed set of fields with
 * declared types, none of which is a string the person can type into:
 *
 *   build     a fact about the software (src/core/build.ts)
 *   surface   which screen they were on — one of a closed union
 *   step      the question id, e.g. `role_mandate`. An id from our own flow
 *             definition, never an answer to it
 *   at        when the report was written, to the minute
 *
 * A caller CANNOT pass an answer through this, because there is no field
 * whose type would accept one. That is the guard: not a filter over free
 * input, but a shape with nowhere to put it. `report.test.ts` walks a
 * fully-answered fixture and asserts none of its content can appear in the
 * output, which is the test that has to keep passing if a field is ever
 * added.
 *
 * A question ID is deliberately in and a question's TEXT is deliberately out.
 * "role_mandate" tells us where somebody was; the wording tells us nothing
 * more and starts a habit of moving the interview's content around.
 */

/** The screens a report can be written from. */
export type FeedbackSurface = 'home' | 'interview' | 'file' | 'list' | 'proof' | 'splash';

export interface FeedbackContext {
  surface: FeedbackSurface;
  /** The question on screen, when there is one. */
  step?: string | undefined;
  /** Injected so the block is testable to the character. */
  now?: Date | undefined;
  /** Injected for the same reason. */
  build?: string | undefined;
}

/** Minute precision: the hour a build misbehaved is useful, the second is not. */
function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}`
  );
}

/**
 * The block, as plain text the person can read in one glance before it goes
 * anywhere. Four lines, labelled, no punctuation games — somebody pasting
 * this into an email should be able to see exactly what it says about them,
 * which is nothing.
 */
export function diagnosticBlock(ctx: FeedbackContext): string {
  const lines = [
    `Build: ${ctx.build ?? BUILD_VERSION}`,
    `Screen: ${ctx.surface}`,
    `Question: ${ctx.step ?? 'none'}`,
    `Written: ${stamp(ctx.now ?? new Date())}`,
  ];
  return lines.join('\n');
}

/**
 * The `mailto:` a press opens. The extension does not send it — the person's
 * own mail client does, after they have read it and pressed send there.
 *
 * The body is the diagnostic block under a blank space for their words, in
 * that order, so the cursor lands where they type rather than after four
 * lines of machine text they have to scroll past.
 */
export function feedbackMailto(
  to: string,
  subject: string,
  lead: string,
  ctx: FeedbackContext,
): string {
  const body = `${lead}\n\n\n\n${diagnosticBlock(ctx)}\n`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
