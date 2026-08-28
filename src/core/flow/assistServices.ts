import type { FlowContext } from '../../schema/flow.types';

/**
 * V2.5 VB-119 — where each AI service LIVES, so the assist sheet's step 2
 * can hand the person a door as well as an instruction ("Paste it into
 * ChatGPT" + a link that opens ChatGPT in the browser).
 *
 * Authored beside the service-additions seam (proofAdditions.ts) on the
 * same reasoning: the ported snapshot stays byte-identical, and everything
 * this repo adds about a service joins through its own module. The KEYS are
 * the one service list's own keys (ALL_PROOF_SERVICES / the goal gate's
 * options — asserted in assistServices.test.ts), so a stored `goal_service`
 * answer resolves here with no mapping layer.
 *
 * 'other' has NO entry, deliberately: its label is a title, not a name
 * (V2.4 VB-105), and there is nowhere to open. The sheet renders no link —
 * the instruction alone still works, which is the degradation rule
 * (docs/GUARDRAILS.md: the panel simply does less, and says nothing).
 *
 * These are [DRAFT] public front doors, not deep links — each one is the
 * address a person would type, loads signed-out, and lands on the composer
 * or the service's own way there. Nothing here is fetched: the map is data,
 * the panel renders a plain anchor, and the person's own click is what
 * leaves the panel (no fetch, no beacon, nothing observed).
 */
export const ASSIST_SERVICE_URLS: Record<string, string> = {
  // [DRAFT]
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/',
  copilot: 'https://copilot.microsoft.com/',
  grok: 'https://grok.com/',
  perplexity: 'https://www.perplexity.ai/',
};

/**
 * The public URL for the AI the person said they use most (the goal gate's
 * `goal_service`), or `undefined` when there is nothing to open — 'other',
 * an unanswered gate, or a stored key this map has never heard of. The
 * caller pairs this with `goalServiceLabelFor` (reflectFrames.ts): no
 * label, no link, one sentence either way.
 */
export function assistServiceUrlFor(ctx: FlowContext): string | undefined {
  // BR-02 (DEF-1) — see FlowContext.contextAnswers. The service is a fact
  // about the person, not about the file being answered.
  const key = (ctx.contextAnswers ?? ctx.answers)['goal_service'];
  if (typeof key !== 'string') return undefined;
  return ASSIST_SERVICE_URLS[key];
}
