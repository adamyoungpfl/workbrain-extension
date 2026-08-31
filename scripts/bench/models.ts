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
  /**
   * Env vars that may hold the key, in order of preference. A LIST rather than
   * one name because keys live where they already live: Adam's are in
   * `../modelcitizen/.env.local` under `CHATGPT_API_KEY`, which is a perfectly
   * good name for a key and not worth a rename to satisfy this file.
   */
  keyEnv: readonly string[];
}

/** The first of a model's candidate vars that is actually set. */
export function keyFor(model: BenchModel): string | undefined {
  for (const name of model.keyEnv) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

/* gemini-2.5-pro is closed to new API users ("no longer available to new
   users", 2026-08-31), so the set names `gemini-pro-latest` — an alias, which
   is a deliberate trade: it survives a model retirement, and it means the
   manifest must record what the alias RESOLVED to on the day, or two runs a
   month apart quietly measure two different models. */
export const MODELS: readonly BenchModel[] = [
  { id: 'claude', vendor: 'anthropic', model: 'claude-sonnet-5', keyEnv: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'] },
  { id: 'gpt', vendor: 'openai', model: 'gpt-5', keyEnv: ['OPENAI_API_KEY', 'CHATGPT_API_KEY'] },
  { id: 'gemini', vendor: 'google', model: 'gemini-pro-latest', keyEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
];
