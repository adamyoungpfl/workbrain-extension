/**
 * THE MODEL SET — named, and versioned beside the task set.
 *
 * This matters more than it looks. A benchmark that runs against whatever is
 * convenient measures convenience: results drift as defaults change, and two
 * runs a month apart stop being comparable without anybody noticing. So the
 * set is written down, carried in every manifest, and changed deliberately.
 *
 * `MODEL_SET_VERSION` moves whenever this list does. A run recorded under
 * version 1 and one under version 2 are two experiments, not two results.
 *
 * ── ON WHICH MODELS BELONG HERE ──────────────────────────────────────────
 *
 * The claim being tested is about the FILE, so the set wants breadth rather
 * than a favourite: several vendors, and within a vendor a current model
 * rather than the cheapest. A file that only helps one family is a finding,
 * not a failure — but it is a finding nobody can make with a set of one.
 *
 * Copilot is deliberately NOT here (Adam, 2026-08-31): its prompt guards vary
 * by corporate configuration, so a result against one tenant's Copilot
 * generalises to nothing. See docs/FILE-VALIDATION.md.
 */
export const MODEL_SET_VERSION = 1;

export interface BenchModel {
  id: string;
  vendor: 'anthropic' | 'openai' | 'google';
  /** The model string the vendor's API expects. */
  model: string;
  /** The env var holding the key. Absent key = this model is skipped, loudly. */
  keyEnv: string;
}

export const MODELS: readonly BenchModel[] = [
  { id: 'claude', vendor: 'anthropic', model: 'claude-sonnet-5', keyEnv: 'ANTHROPIC_API_KEY' },
  { id: 'gpt', vendor: 'openai', model: 'gpt-5', keyEnv: 'OPENAI_API_KEY' },
  { id: 'gemini', vendor: 'google', model: 'gemini-2.5-pro', keyEnv: 'GEMINI_API_KEY' },
];
