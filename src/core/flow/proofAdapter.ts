import { BASELINE_PROMPT, ATTACH_FALLBACK_SUFFIX } from './proofSource';
import { ALL_PROOF_SERVICES } from './proofAdditions';
import type { FlowContext, Module, Option, Step } from '../../schema/flow.types';

/**
 * Transforms proofSource.ts's verbatim snapshot into this repo's schema
 * shape — the R1-11 counterpart to adapter.ts's `adaptContextFlow`. Pure —
 * no chrome.*, no DOM, and (unlike a full production default) deliberately
 * no import of src/panel/strings.ts either: core/ never depends on panel/
 * (see src/core/files/parse.ts's own comment making the same call for error
 * copy). The Context flow's adapter can default its params to real
 * production data because that data (the ported question wording) belongs
 * in core/. This flow's headings and chip labels are new panel chrome, not
 * ported content (docs/RELEASE-1.md's R1-11 plan is explicit about this),
 * so there is no "real production" version of them that belongs in core/ —
 * `buildProofModule` takes them all as one injected `ProofCopy`, the same
 * shape of seam core/storage/client.ts uses for the chrome.storage backend.
 */

export const PROOF_SCORE_BASELINE_KEY = 'proof_score_baseline';
export const PROOF_SCORE_CONTEXT_KEY = 'proof_score_context';
export const PROOF_BASELINE_ANSWER_KEY = 'proof_baseline_answer';
export const PROOF_CONTEXT_ANSWER_KEY = 'proof_context_answer';
export const PROOF_GRADE_TEXT_KEY = 'proof_grade_text';
export const PROOF_SERVICE_KEY = 'proof_service';

const EYEBROW = 'PROOF';

/** `Option.v` order/values must match `ALL_PROOF_SERVICES` (the ported list
 * plus V2.4 VB-105's additions, proofAdditions.ts) — asserted in
 * src/panel/serviceChips.test.tsx, which holds the panel's chip labels, the
 * goal gate's options and the persona map to the same seven keys. */
export function serviceStepOptions(labels: { key: string; label: string }[]): Option[] {
  return labels.map((l) => ({ v: l.key, l: l.label }));
}

/** Every string this module needs that isn't ported content — all of it
 * real copy from src/panel/strings.ts, injected by the caller (App.tsx).
 * Field names match the `S.*` key each one is expected to carry, so the
 * call site reads as a direct mapping. */
export interface ProofCopy {
  serviceOptions: Option[];
  heading: string; // S.proofHeading
  pickAI: string; // S.proofPickAI
  baselineQ: string; // S.proofSub
  withContextQ: string; // S.proofWithFile
  judgeQ: string; // S.proofJudge
  doneQ: string; // S.proofDone
}

/**
 * The proof loop as one module, five top-level steps: pick a service, then
 * the four steps the spec names (baseline / with-context / grade /
 * recommendations). Not required (`required: false`) — the whole flow is
 * reached by choice from the Context flow's done screen, not gated into a
 * person's path the way the Context modules are.
 */
export function buildProofModule(copy: ProofCopy): Module {
  const service: Step = {
    id: 'proof_service',
    module: 1,
    section: -1,
    eyebrow: EYEBROW,
    q: copy.heading,
    hint: copy.pickAI,
    kind: 'chips',
    key: PROOF_SERVICE_KEY,
    options: copy.serviceOptions,
    required: true,
    // V2.3 VB-93 — the goal gate already asked "which AI do you use most?"
    // at minute one, from the same service list. Asking again here would be
    // the demo opening on a question the person already answered, so the
    // pick only appears for a file from before the gate existed. Changing
    // the answer stays possible where it lives: section 1 of Context.md.
    skipIf: (ctx) => typeof ctx.answers['goal_service'] === 'string' && ctx.answers['goal_service'] !== '',
  };

  const baseline: Step = {
    id: 'proof_baseline',
    module: 1,
    section: -1,
    eyebrow: EYEBROW,
    q: copy.baselineQ,
    kind: 'gen',
    genKey: 'baseline',
    outKey: PROOF_BASELINE_ANSWER_KEY,
    required: true,
  };

  const withContext: Step = {
    id: 'proof_context',
    module: 1,
    section: -1,
    eyebrow: EYEBROW,
    q: copy.withContextQ,
    kind: 'gen',
    genKey: 'withContext',
    outKey: PROOF_CONTEXT_ANSWER_KEY,
    required: true,
  };

  /**
   * BS-03d (§3.3), Adam's P1 — THE THIRD ROUND TRIP IS GONE.
   *
   * This step used to copy an evaluation rubric out, have the AI grade its
   * own two answers, and ask the person to paste the grade back — a whole
   * third errand in another tab, for a number. §3's budget is three round
   * trips for the WHOLE hour (micro-proof, proof one, proof two), so proof
   * one had to drop to two, and the trip that goes is the one the person's
   * own eyes replace.
   *
   * What stands here now asks nothing of their AI: the two answers side by
   * side, and a short list of statements they tick. `kind: 'demo'` because
   * there is no prompt to copy and nothing to paste — the panel is showing
   * them what they already have and recording what they say about it.
   */
  const judge: Step = {
    id: 'proof_judge',
    module: 1,
    section: -1,
    eyebrow: EYEBROW,
    q: copy.judgeQ,
    kind: 'demo',
    genKey: 'judge',
  };

  const recommendations: Step = {
    id: 'proof_recommendations',
    module: 1,
    section: -1,
    eyebrow: EYEBROW,
    q: copy.doneQ,
    kind: 'demo',
    genKey: 'recommendations',
  };

  return {
    id: 'proof',
    n: 1,
    title: 'The proof',
    purpose: 'Show the file actually changing the answer.',
    required: false,
    estimatedMinutes: [5, 10],
    nodes: [service, baseline, withContext, judge, recommendations],
  };
}

/** Which generated prompt a `kind: 'gen'` step shows, resolved from its
 * `genKey` against what's already been pasted this session. Mirrors
 * evaluationPrompt's own graceful "[not captured]" fallback (proofSource.ts)
 * for a grade step reached with a skipped baseline/with-context answer —
 * nothing here re-derives that behaviour, it just calls the ported function. */
/**
 * V2.3 VB-93 — the goal gate's whole payoff, in one function. The proof loop
 * reads its answers out of the context file's own store, so the goal the
 * person named at question two of the interview is sitting right here in
 * `ctx` — and the baseline becomes THEIR question, verbatim, whenever it
 * exists. Adam, binding: the gate must "fuel the baseline and prove it at
 * the end of the flow". The canned line survives only as the fallback for a
 * pre-gate install that never named one.
 */
export function proofQuestion(ctx: FlowContext): string {
  const want = ctx.answers['goal_want'];
  return typeof want === 'string' && want.trim() !== '' ? want.trim() : BASELINE_PROMPT;
}

/**
 * BS-03b (§3.1) — THE FILE RIDES INSIDE THE MESSAGE.
 *
 * Attaching a downloaded file in another application is the single hardest
 * thing the hour asks of anyone, and it is unnecessary: the file is text.
 * So the with-file run puts the task and the whole of Context.md on the
 * clipboard together, and the person makes one paste.
 *
 * ── THE THREE THINGS THIS MUST NOT GET WRONG ──────────────────────────────
 *
 * 1. **The baseline never gets the file.** `promptFor` branches on `genKey`
 *    below and only the with-file run composes. The proof measures ONE
 *    variable; a baseline carrying the context would measure nothing, and it
 *    would do it invisibly.
 * 2. **The question is byte-identical in both runs.** The task string is
 *    the same `proofQuestion(ctx)` either way — this function appends, and
 *    never edits, so nothing about the ask can drift between the two.
 * 3. **The file is the file.** Not a summary, not a subset:
 *    `core/files/generate.ts`'s bytes, the same ones the drawer previews and
 *    the download writes. Including the reference examples, which the
 *    file always carries — the O4 rule holds prompts about something ELSE
 *    to a narrower diet, and here the file is the point.
 *
 * The lead-in sentence is addressed to the AI rather than to the person: the
 * person's own instruction ("your file comes along inside the message") is
 * on screen, where they can read it before they press anything.
 */
export function withContextPrompt(task: string, fileText: string, lead: string): string {
  return `${task}\n\n---\n${lead}\n\n${fileText}`;
}

/* BS-03d deleted the `grade` branch and, with it, the product's only use of
   `evaluationPrompt` (proofSource.ts). It also dissolved a defect the prompt
   audit had just found: the rubric asked the AI to judge "what this
   Context.md is missing" with the file absent from the prompt. There is no
   grader to mislead now. */
export function promptFor(genKey: string | undefined, ctx: FlowContext, fileText?: string, lead?: string): string {
  const task = proofQuestion(ctx);
  // 'baseline' and 'withContext' ask the exact same question — the whole
  // point of the proof is putting it twice, unchanged, once per condition.
  // BS-03b: what the with-file run adds is the FILE, appended, never a
  // different ask. No file text, no composition: a caller that cannot build
  // one (a pre-gate install, a test) gets the bare task and the loop still
  // works, which is the degradation docs/GUARDRAILS.md asks for.
  if (genKey === 'withContext' && fileText && lead) return withContextPrompt(task, fileText, lead);
  return task;
}

/** The per-service attach instruction plus the fixed fallback sentence,
 * for the with-context step. Falls back to the same "other" tip the source
 * component falls back to when nothing is selected (proofSource.ts,
 * mirroring WorkBrainContextInterview.tsx's own `?? fallback` at the point
 * it reads `selectedServiceInfo?.attachTip`). */
/** Which service the proof should speak to: the proof's own pick when the
 * person was asked here, else the goal gate's minute-one answer (VB-93) —
 * the same order the flow itself runs in, since the pick step skips itself
 * exactly when the gate answer exists. */
export function proofServiceFor(ctx: FlowContext): string | undefined {
  const picked = ctx.answers[PROOF_SERVICE_KEY];
  if (typeof picked === 'string' && picked !== '') return picked;
  const fromGoal = ctx.answers['goal_service'];
  return typeof fromGoal === 'string' && fromGoal !== '' ? fromGoal : undefined;
}

export function attachHintFor(serviceKey: string | undefined): string {
  // V2.4 VB-105 (FLAG 3): resolved against the MERGED list — the ported four
  // plus this repo's additions (proofAdditions.ts) — so Grok and Perplexity
  // get their authored tips without the snapshot being touched. 'other' is
  // still the final entry and still the fallback, by that file's own contract.
  const fallback = ALL_PROOF_SERVICES[ALL_PROOF_SERVICES.length - 1]!; // 'other'
  const info = ALL_PROOF_SERVICES.find((s) => s.key === serviceKey) ?? fallback;
  return `${info.attachTip} ${ATTACH_FALLBACK_SUFFIX}`;
}
