/**
 * THE HEDGE REPAIR — turning a wish into an order.
 *
 * The baseline screen (`promptOnly` in nameGenerator.ts) asks somebody what
 * they would tell their AI to do, and sends what they type VERBATIM. That
 * makes the opening words load-bearing in a way no other question's are: a
 * prompt that begins "I would like to be able to..." is a description of a
 * want, and a model answering it describes the want back. A prompt that
 * begins "Point my AI at..." is a task, and a model does it.
 *
 * This matters to the measurement spine and not merely to the prose. The
 * same text is replayed at stage 2 and stage 3 (docs/MEASUREMENT-SPINE.md).
 * If the baseline is a wish, all three runs answer a wish, and the comparison
 * measures nothing about whether the file helped.
 *
 * ── WHY A CLOSED LIST AND NOT A CLASSIFIER ────────────────────────────────
 * "Does this sentence start with an imperative verb" is genuinely hard and
 * gets a lot of ordinary English wrong. "Does this sentence start with one of
 * thirty hedges people actually type" is easy, and every one of them is here
 * to be read. Anything not on the list is left completely alone — the failure
 * mode is silence, which is the right one: this offers a rewrite it is sure
 * of, or it offers nothing.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 * Not a grammar check and not a judgement of somebody's writing. It returns a
 * suggestion; the panel shows it beside what they wrote, and they press a
 * button or ignore it. Nothing is rewritten under them, which is also what
 * docs/GUARDRAILS.md requires of anything that becomes a prompt: "not to
 * their AI without them seeing the exact text first."
 */

/**
 * The openers, longest first — "I would like to be able to" has to be tried
 * before "I would like to", or the longer one is stripped down to "be able
 * to" and the result is worse than what it replaced. `asOrder` sorts rather
 * than trusting this order to be maintained by hand.
 *
 * Every entry is something a person types when they are being polite or
 * tentative with a machine, which is most people, most of the time. That is
 * not a flaw in them — it is what a decade of search boxes and a lifetime of
 * asking colleagues for favours teaches. The screen's job is to show that
 * this one box wants something else.
 */
const HEDGES: readonly string[] = [
  'i would like to be able to',
  "i'd like to be able to",
  'i want to be able to',
  'i would like my ai to',
  "i'd like my ai to",
  'i want my ai to',
  'i would like you to',
  "i'd like you to",
  'i would like to',
  "i'd like to",
  'i would love to',
  "i'd love to",
  'i want you to',
  'i want to',
  'i need you to',
  'i need to',
  'i am looking to',
  "i'm looking to",
  'i am trying to',
  "i'm trying to",
  'i wish i could',
  'i wish you would',
  'my goal is to',
  'it would be nice if you could',
  'it would be great if you could',
  'it would be helpful if you could',
  'it would be nice to',
  'it would be great to',
  'it would be helpful to',
  'can you please',
  'could you please',
  'would you please',
  'can you',
  'could you',
  'would you',
  'will you',
  'please',
];

/**
 * Below this, no suggestion. Somebody four words into a thought has not
 * written a wish yet, they are mid-sentence — offering to rewrite it would be
 * the screen interrupting rather than helping. Thirty characters is about a
 * clause, which is the earliest point at which there is something to rewrite.
 */
export const ORDER_HINT_MIN_CHARS = 30;

/** Curly and straight apostrophes are the same character to this. */
function flatten(text: string): string {
  return text.replace(/[‘’]/g, "'");
}

/**
 * The rewrite, or `null` when there is nothing sure to say.
 *
 * Returns null — deliberately, and in every one of these cases — when the
 * text is too short to have a shape yet, when no opener on the list matches,
 * or when stripping the opener would leave a fragment rather than a task.
 * A caller that gets null shows nothing at all.
 */
export function asOrder(text: string): string | null {
  const raw = text.trim();
  if (raw.length < ORDER_HINT_MIN_CHARS) return null;

  const flat = flatten(raw);
  const lower = flat.toLowerCase();

  // Longest match wins, whatever order the list above happens to be in.
  const hedge = [...HEDGES]
    .sort((a, b) => b.length - a.length)
    .find((h) => lower.startsWith(h + ' '));
  if (!hedge) return null;

  const rest = flat.slice(hedge.length).trim();
  // A stripped opener that leaves almost nothing was not really an opener —
  // "please" alone, or "can you help". Better to say nothing.
  if (rest.length < 12) return null;
  // It has to still start with a word. Stripping "I want to" off "I want to,
  // you know, do a thing" leaves a comma, and a suggestion that opens on
  // punctuation reads as a bug.
  if (!/^[a-z]/i.test(rest)) return null;

  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
