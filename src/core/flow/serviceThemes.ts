/**
 * V2.4 VB-105 — WHICH SERVICE WEARS WHICH PERSONA, AND ON WHICH QUESTIONS.
 *
 * ── DESIGN-ONLY, BY DECISION (FLAG 4) ─────────────────────────────────────
 *
 * A persona is a color and an icon and NOTHING else. The chip's printed label
 * and its accessible name are the service's own name ("Claude", never
 * "Scholar"); the persona word below never prints, never speaks, and never
 * carries a meaning the label doesn't (docs/GUARDRAILS.md: nothing by colour
 * alone — trivially met, because the colour says nothing at all). The persona
 * keys exist so a stylesheet class and an icon lookup have something stable to
 * hang on: `pill-theme-scholar` is a CSS hook, not a word anyone reads.
 *
 * ── WHY THE MAP IS HERE AND NOT AN `if` IN THE SURFACE ────────────────────
 *
 * The `core/choice/orbs.ts` rule, verbatim: this is a panel-era decision about
 * presentation, recorded in exactly one place, keyed by the data it decorates.
 * The census test (serviceThemes.test.ts) holds this map 1:1 against
 * `ALL_PROOF_SERVICES`, so a service added without a persona — or a persona
 * orphaned by a service rename — fails CI instead of rendering half-themed.
 *
 * The assignments are Adam's (docs/V2.4-REFINEMENT.md VB-105, decision 2):
 * ChatGPT Aristocrat · Claude Scholar · Gemini Muse · Copilot Colleague ·
 * Grok Investigator · Perplexity Explorer · Other Innovator.
 */

import { ALL_PROOF_SERVICES } from './proofAdditions';

export type ServicePersona =
  | 'aristocrat'
  | 'scholar'
  | 'muse'
  | 'colleague'
  | 'investigator'
  | 'explorer'
  | 'innovator';

export const SERVICE_PERSONAS: Record<string, ServicePersona> = {
  chatgpt: 'aristocrat',
  claude: 'scholar',
  gemini: 'muse',
  copilot: 'colleague',
  grok: 'investigator',
  perplexity: 'explorer',
  other: 'innovator',
};

/**
 * The two questions that ask the service list — the goal gate's opener
 * (overrides.ts's GOAL_GATE_NODES) and the proof loop's pre-gate picker
 * (proofAdapter.ts). One list, one look (VB-105): both wear the same themed
 * treatment because both consult this one module.
 */
export const SERVICE_CHOICE_QUESTIONS: readonly string[] = ['goal_service', 'proof_service'] as const;

/**
 * Whether this question's chips wear the service personas. `kind` is checked
 * as well as `id` — the orbs.ts reasoning: a question that stopped being a
 * chips pick would have to stop dressing like one, and this is the line that
 * would notice.
 */
export function usesServiceThemes(step: { id: string; kind: string }): boolean {
  return step.kind === 'chips' && SERVICE_CHOICE_QUESTIONS.includes(step.id);
}

/**
 * The persona a service key wears, or undefined for a value that is not a
 * service — a custom "add your own" entry, a corrupted stored answer. An
 * unthemed chip is the graceful shape of that: plain, still labelled, still a
 * working button.
 */
export function personaForService(serviceKey: string): ServicePersona | undefined {
  return SERVICE_PERSONAS[serviceKey];
}

/** Re-exported beside the map so the one import a surface needs is this file. */
export { ALL_PROOF_SERVICES };
