import type { FlowContext, Step } from '../../schema/flow.types';
import { GOAL_GATE_NODES } from './overrides';

/**
 * V2.3 VB-95 — the reflect step becomes a quick check. "Here's what I've
 * got" turns into a per-question reframe spoken like a person — "So you
 * would say that right now…" — with the person's words quoted back in
 * italic, unboxed, and a way-forward line that names their own AI when the
 * goal gate (VB-93) captured which one they use.
 *
 * Templates live here, beside the reflect machinery, per the spec — not in
 * src/panel/strings.ts — because they are the interview's voice speaking,
 * same reasoning as overrides.ts's header. All copy [DRAFT] (V2.3's
 * operating rule), measured by this module's own reading-grade harness in
 * reflectFrames.test.ts.
 */

/**
 * [DRAFT] One reframe per interpret-bearing question — the six R1-07
 * exercises (runner.test.ts's confirmed list). Same sentiment, slight
 * wording variation, exactly as asked.
 */
export const REFLECT_LEADS: Record<string, string> = {
  stop_explaining: "So you would say that right now, the thing you'd most like to stop explaining is…",
  self_description: "So when someone asks what you do, you'd put it like this…",
  role_mandate: 'So this role, at its heart, is here to…',
  responsibilities_list: 'So day to day, the work on your plate looks like…',
  initiative_description: 'So this effort, in your words, is about…',
  terms_depend_on: 'So when you use these words, you mean…',
};

/** [DRAFT] For any interpret carrier this file has no bespoke line for. */
export const DEFAULT_REFLECT_LEAD = 'So you would say, in your words…';

/**
 * The lead for a reflect screen. A bespoke reframe wins; a step that
 * authored its own `reflectPrefix` keeps it (the Skills interview's
 * "Here's the recipe I heard:" is V2.2's own copy, not superseded here);
 * anything else gets the default.
 */
export function reflectLeadFor(step: Pick<Step, 'id' | 'interpret'>): string {
  return REFLECT_LEADS[step.id] ?? step.interpret?.reflectPrefix ?? DEFAULT_REFLECT_LEAD;
}

/**
 * Which AI the person said they use most (VB-93's `goal_service`), as its
 * printed label — resolved from GOAL_GATE_NODES so there is one list.
 * `undefined` for "other" on purpose: "use your Something else chat" is not
 * a sentence, so the voice line falls back to "your AI chat".
 */
export function goalServiceLabelFor(ctx: FlowContext): string | undefined {
  const key = ctx.answers['goal_service'];
  if (typeof key !== 'string' || key === '' || key === 'other') return undefined;
  for (const node of GOAL_GATE_NODES) {
    if (node.kind !== 'question' || node.id !== 'goal_service') continue;
    return node.options?.find((option) => option.key === key)?.label;
  }
  return undefined;
}

/**
 * [DRAFT] The way forward, printed under the quote and spoken by the
 * narrator — one string so the screen and the voice can never drift.
 *
 * Adapted from Adam's script ("If this looks good, click next. If you want
 * to edit it or use your [service] chat to make changes, the buttons are
 * below.") to name the buttons this screen actually has — keep / say it
 * again / tighten — since copy must never point at a control that is not
 * there (design-system §08). Flagged in docs/V2.3-REFINEMENT.md.
 */
export function reflectVoiceLine(serviceLabel: string | undefined): string {
  const chat = serviceLabel ? `your ${serviceLabel} chat` : 'your AI chat';
  return `If this sounds like you, keep it. To make changes, say it again — or use ${chat} to tighten it. The buttons are below.`;
}
