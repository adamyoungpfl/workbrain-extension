import { PROOF_SERVICES } from './proofSource';
import type { ProofService } from './proofSource';

/**
 * V2.4 VB-105 (FLAG 3) — the services this repo ADDS to the ported list.
 *
 * `proofSource.ts` is a verbatim port snapshot and its own header says what
 * that means: any wording fix belongs upstream, and so would any new entry.
 * Grok and Perplexity are not in the upstream component at all — they are this
 * round's decision (Adam, decision 2) — so they join through the same seam
 * every other post-port change uses (overrides.ts's pattern): authored here,
 * merged by the consumers, and the snapshot stays byte-identical.
 * proofAdditions.test.ts asserts exactly that — `PROOF_SERVICES` still has its
 * five ported entries after this module has been imported.
 *
 * The attach tips are authored in the ported tips' own voice — one sentence,
 * "Click the <control> near the message box and attach Context.md." — because
 * they print in the same list, on the same screen, and a tip that suddenly
 * speaks differently would read as a seam. They ride this module's own
 * reading-grade harness (proofAdditions.test.ts), since neither `npm run
 * audit` nor the port's verbatim exemption covers a sentence this repo wrote.
 */

export const PROOF_SERVICE_ADDITIONS: ProofService[] = [
  // [DRAFT] V2.4 VB-105 — authored, not ported; same voice as the four tips
  // in proofSource.ts. Adam's morning review adjusts words.
  { key: 'grok', attachTip: 'Click the paperclip icon near the message box and attach Context.md.' },
  // [DRAFT]
  { key: 'perplexity', attachTip: 'Click the + near the message box and attach Context.md.' },
];

/**
 * The one service list the rest of the product should read: the ported four,
 * then the additions, then the ported "other" — kept LAST on purpose, because
 * `attachHintFor` (proofAdapter.ts) and the upstream component both treat the
 * final entry as the fallback for an unknown or unselected service.
 *
 * Order matches the spec's own roll-call (VB-105: ChatGPT · Claude · Gemini ·
 * Copilot · Grok · Perplexity · Other) and is asserted in
 * proofAdditions.test.ts so a careless merge cannot quietly demote "other"
 * from its fallback seat.
 */
export const ALL_PROOF_SERVICES: ProofService[] = [
  ...PROOF_SERVICES.slice(0, -1),
  ...PROOF_SERVICE_ADDITIONS,
  PROOF_SERVICES[PROOF_SERVICES.length - 1]!,
];

/** Every line of user-facing wording this file authors, for the reading-grade
 * and sentence-length harness — the overrides.ts convention. */
export function allAdditionCopy(): string[] {
  return PROOF_SERVICE_ADDITIONS.map((s) => s.attachTip);
}
