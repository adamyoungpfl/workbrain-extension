/**
 * BS-03d (§3.3) — THE ONE-PAGE RECEIPT.
 *
 * "End on an artifact. The delta is the single most shareable thing the
 * product produces and today it evaporates." A tester who has just watched
 * their file change an answer has, until now, had nothing to keep and
 * nothing to forward — and forwarding it is the product's only organic
 * distribution.
 *
 * ── WHAT IT IS, AND WHAT IT IS NOT ────────────────────────────────────────
 *
 * A markdown FILE, in Context.md's own voice, saved by the person. Never a
 * hosted link: `docs/OPEN.md` #4 is still open and its default assumption
 * stands (D5). Nothing here is uploaded, and nothing about it is stored —
 * the receipt is assembled from what is already on screen at the moment they
 * ask for it, and then it belongs to them.
 *
 * It holds their content: the task they sent, both answers verbatim, and
 * what they ticked. That is the same trade `core/files/generate.ts` makes —
 * their words, in their file, on their machine — and it is why the panel can
 * print the AI's replies here having never read them.
 *
 * The copy lives in core beside the file it writes, exactly as
 * `core/files/source.ts` holds Context.md's own headings. CLAUDE.md's
 * one-file rule is about the PANEL's chrome; a generated document's text is
 * part of the document.
 */

export interface ProofReceipt {
  /** The one-line ask, in the person's own words. */
  task: string;
  /** What their AI wrote with nothing loaded. */
  before: string;
  /** …and with their file. */
  after: string;
  /** The statements they said were true of the second answer. */
  ticked: readonly string[];
  /** How many were offered. */
  of: number;
  /** Printed date, injected so the file is testable to the character. */
  on: string;
}

const TITLE = '# What my Context file changed';

/** A blank where an errand was skipped — the same voice `generate.ts` uses
 * for a question somebody passed on, rather than an empty heading. */
const NOT_CAPTURED = '_Not captured._';

function block(text: string): string {
  const trimmed = text.trim();
  return trimmed === '' ? NOT_CAPTURED : trimmed;
}

/**
 * The receipt, as markdown.
 *
 * Ordered the way somebody reads it back to a colleague: what was asked,
 * what came back without the file, what came back with it, and then the
 * count — because the count means nothing until the two answers are in front
 * of you.
 */
export function buildProofReceipt(receipt: ProofReceipt): string {
  const lines: string[] = [
    TITLE,
    '',
    `_${receipt.on} · made with Workbrain, on this machine._`,
    '',
    '## What I asked',
    '',
    block(receipt.task),
    '',
    '## What my AI wrote without my file',
    '',
    block(receipt.before),
    '',
    '## What it wrote with my file',
    '',
    block(receipt.after),
    '',
    '## What the second one got right',
    '',
  ];

  if (receipt.ticked.length === 0) {
    lines.push('_Nothing ticked._');
  } else {
    for (const statement of receipt.ticked) lines.push(`- ${statement}`);
  }
  lines.push('', `**${receipt.ticked.length} of ${receipt.of}**, judged by me — Workbrain never read either answer.`, '');

  return lines.join('\n');
}

/** The filename. One per proof run; the date makes two of them sortable. */
export function proofReceiptName(on: string): string {
  return `Workbrain proof — ${on}.md`;
}

/**
 * BS-04 (§4) — PROOF TWO'S RECEIPT.
 *
 * Same trade as the one above and deliberately the same shape: a markdown
 * file, in the person's own words, assembled at the moment they ask for it
 * and never stored or uploaded. D5 holds — a file, never a hosted link,
 * while `docs/OPEN.md` #4 stays open.
 *
 * What differs is the argument it carries. Proof one's receipt is two answers
 * and what changed between them. This one is a RECIPE AND A RUN: the steps
 * they wrote, which of them their AI actually did, and the count. §4: "the
 * artifact and the checklist are the argument."
 *
 * The steps print in their own order with a real tick or a real blank, rather
 * than a list of hits followed by a list of misses — somebody reading this
 * back is walking the recipe, and a reordered recipe is a different recipe.
 */
export interface CapabilityReceipt {
  /** The skill's name, theirs. */
  skill: string;
  /** The one sentence they sent. */
  ask: string;
  /** Every step they wrote, in order. */
  steps: readonly string[];
  /** The indices of the steps they said their AI did. */
  done: readonly number[];
  /** Printed date, injected so the file is testable to the character. */
  on: string;
}

const CAPABILITY_TITLE = '# What my AI did with my recipe';

export function buildCapabilityReceipt(receipt: CapabilityReceipt): string {
  const done = new Set(receipt.done);
  const lines: string[] = [
    CAPABILITY_TITLE,
    '',
    `_${receipt.on} · made with Workbrain, on this machine._`,
    '',
    `## ${receipt.skill}`,
    '',
    '### What I asked',
    '',
    block(receipt.ask),
    '',
    '### My steps, and what it did',
    '',
  ];

  if (receipt.steps.length === 0) {
    lines.push(NOT_CAPTURED);
  } else {
    receipt.steps.forEach((step, index) => {
      lines.push(`- [${done.has(index) ? 'x' : ' '}] ${step}`);
    });
  }

  lines.push(
    '',
    `**${done.size} of ${receipt.steps.length}**, first try — judged by me. Workbrain never read the reply.`,
    '',
  );

  return lines.join('\n');
}

/** The filename. Names the skill, because somebody runs this more than once. */
export function capabilityReceiptName(skill: string, on: string): string {
  const safe = skill.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return `Workbrain run — ${safe || 'skill'} — ${on}.md`;
}
