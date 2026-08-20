import { PROOF_SERVICES, BASELINE_PROMPT, ATTACH_FALLBACK_SUFFIX, evaluationPrompt } from './proofSource';
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

/** `Option.v` order/values must match `PROOF_SERVICES` — asserted in
 * proofAdapter.test.ts so the two can never silently drift apart. */
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
  gradeQ: string; // S.proofGrade
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

  const grade: Step = {
    id: 'proof_grade',
    module: 1,
    section: -1,
    eyebrow: EYEBROW,
    q: copy.gradeQ,
    kind: 'gen',
    genKey: 'grade',
    outKey: PROOF_GRADE_TEXT_KEY,
    required: true,
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
    nodes: [service, baseline, withContext, grade, recommendations],
  };
}

/** Which generated prompt a `kind: 'gen'` step shows, resolved from its
 * `genKey` against what's already been pasted this session. Mirrors
 * evaluationPrompt's own graceful "[not captured]" fallback (proofSource.ts)
 * for a grade step reached with a skipped baseline/with-context answer —
 * nothing here re-derives that behaviour, it just calls the ported function. */
export function promptFor(genKey: string | undefined, ctx: FlowContext): string {
  if (genKey === 'grade') {
    const before = ctx.answers[PROOF_BASELINE_ANSWER_KEY];
    const after = ctx.answers[PROOF_CONTEXT_ANSWER_KEY];
    return evaluationPrompt(typeof before === 'string' ? before : '', typeof after === 'string' ? after : '');
  }
  // 'baseline' and 'withContext' show the exact same prompt — the whole
  // point of the proof is asking it twice, unchanged, once per condition.
  return BASELINE_PROMPT;
}

/** The per-service attach instruction plus the fixed fallback sentence,
 * for the with-context step. Falls back to the same "other" tip the source
 * component falls back to when nothing is selected (proofSource.ts,
 * mirroring WorkBrainContextInterview.tsx's own `?? fallback` at the point
 * it reads `selectedServiceInfo?.attachTip`). */
export function attachHintFor(serviceKey: string | undefined): string {
  const fallback = PROOF_SERVICES[PROOF_SERVICES.length - 1]!; // 'other'
  const info = PROOF_SERVICES.find((s) => s.key === serviceKey) ?? fallback;
  return `${info.attachTip} ${ATTACH_FALLBACK_SUFFIX}`;
}
