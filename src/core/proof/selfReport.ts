/**
 * WHAT THE AI SAYS IT USED, AND WHAT IT SAYS IT COULD NOT FIND.
 *
 * Adam, 2026-08-31, on a hosted "proving grounds": *"we could grab any other
 * metadata or details… that could tell us more about how to fine-tune the file
 * or the details within it."*
 *
 * The valuable half of that idea needs no server and no transmission. The
 * prompt can simply ASK, in a shape we can parse, and the person pastes the
 * answer back the way they already do.
 *
 * ── IT IS VISIBLE, WHICH IS WHAT MAKES IT LEGITIMATE ─────────────────────
 *
 * The request rides in the prompt the person reads before they send it —
 * `docs/GUARDRAILS.md`'s "not to their AI without them seeing the exact text
 * first". A hidden instruction would break exactly that clause, which is the
 * one the product spends its strictness on. Visible extra instructions are not
 * an injection; they are prompt.
 *
 * ── IT IS A CLAIM, NOT A TRACE ───────────────────────────────────────────
 *
 * A model's self-report about its own use of context is not instrumentation.
 * It is the model saying what it thinks it did, and it can be wrong in both
 * directions. So nothing here is treated as fact: `MISSING` is an invitation to
 * look at a question, never a verdict that the file is deficient, and the panel
 * says so where it shows it.
 *
 * ── AND NOTHING IS STORED ────────────────────────────────────────────────
 *
 * Kept for the screen it is read on and dropped. A log of what somebody's AI
 * said about their file, accumulated over runs, is a usage log — which is the
 * guardrail's flat ban, and the authorship test is unambiguous: the person did
 * not type this and we did not observe it, so it is neither theirs to keep nor
 * ours to gather.
 */

export interface SelfReport {
  /** Sections of the file the AI claims it drew on. */
  used: string[];
  /** What it says it needed and did not find — the tuning signal. */
  missing: string[];
  /** What it says it had to guess at. */
  unsure: string[];
}

/** The block the prompt asks for. One line per field, labels in caps. */
export const SELF_REPORT_ASK = `When you are done, add this block at the very end, exactly these three lines:

USED: which parts of my file you actually drew on
MISSING: anything you needed that my file did not contain
UNSURE: anything you had to guess at

Write "none" for any that do not apply.`;

const LABEL = /^\s*(USED|MISSING|UNSURE)\s*[:\-—]\s*(.*)$/i;

/**
 * A pasted line, ready to match against.
 *
 * Strips the markdown a model wraps a label in AND the list marker it may put
 * in front — "- **MISSING:** a date" is the single commonest shape and the
 * first version missed it, because `*` was in the character strip and the
 * leading "- " was not. One helper, used by both readers below, so the two
 * cannot drift into accepting different shapes.
 */
function clean(raw: string): string {
  return raw
    .replace(/[*_`#>]/g, '')
    .replace(/^\s*[-+•]\s*/, '')
    .trim();
}

/** Splits "a, b and c" into its items, and treats "none" as nothing. */
function items(value: string): string[] {
  const text = value.trim().replace(/^[[(]|[\])]$/g, '').trim();
  if (!text || /^(none|n\/a|nothing)\b/i.test(text)) return [];
  return text
    .split(/\s*(?:,|;|\band\b|•|•)\s*/i)
    .map((s) => s.replace(/^[-*\s]+|[.\s]+$/g, '').trim())
    .filter((s) => s.length > 1);
}

/**
 * Reads the block out of a pasted answer, wherever in it the model put it.
 *
 * Tolerant on purpose: models bold the labels, bullet them, or reorder them,
 * and a parser that only accepts one shape would report "the AI said nothing"
 * far more often than the AI said nothing. What it will NOT do is guess — a
 * paste with no block at all returns `null`, and the panel then shows nothing
 * rather than an empty report that looks like a finding.
 */
export function parseSelfReport(pasted: string): SelfReport | null {
  const found: SelfReport = { used: [], missing: [], unsure: [] };
  let any = false;

  for (const raw of pasted.split('\n')) {
    const m = LABEL.exec(clean(raw));
    if (!m) continue;
    any = true;
    const value = items(m[2] ?? '');
    const key = m[1]!.toUpperCase();
    if (key === 'USED') found.used = value;
    else if (key === 'MISSING') found.missing = value;
    else found.unsure = value;
  }
  return any ? found : null;
}

/**
 * The answer with the block taken off, for the screen that shows what the AI
 * actually wrote.
 *
 * The block is instrumentation the person did not ask for and should not have
 * to read past to see their own draft — but it is only removed from the END,
 * where the prompt asked for it. A model that mentions "missing" mid-paragraph
 * keeps its sentence.
 */
export function stripSelfReport(pasted: string): string {
  const lines = pasted.split('\n');
  let cut = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = clean(lines[i]!);
    if (line === '') continue;
    if (LABEL.test(line)) {
      cut = i;
      continue;
    }
    break;
  }
  return lines.slice(0, cut).join('\n').replace(/\s+$/, '');
}
