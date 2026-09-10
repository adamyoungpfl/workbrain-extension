/**
 * V3.0 pass 5j — THE PROOF BUNDLE (Adam's OPEN #9 ruling, 2026-09-09:
 * "A then C. sessionStorage-until-tab-close, yes on grounds").
 *
 * One text blob carries the three things the site's Proving Grounds needs:
 * the captured ask, the baseline answer, and the context file. It moves by
 * CLIPBOARD on the person's own press and lands in a static page that
 * transmits nothing — the hosted-grounds amendment in docs/GUARDRAILS.md
 * is this format's charter.
 *
 * THE FORMAT IS A CONTRACT with site/site.js's parser (and the site
 * README's table): fence lines exactly as below, sections in this order,
 * content verbatim between them. Add fields by adding fences; never rename
 * one — a bundle in someone's notes app from last month must still paste.
 */

export interface ProofBundle {
  /** The captured ask, word for word. */
  task: string;
  /** What their AI answered before the file existed. */
  answer: string;
  /** Context.md, byte for byte as the generator wrote it. */
  file: string;
}

const HEAD = '===WORKBRAIN PROOF BUNDLE v1===';
const F_PROMPT = '===PROMPT===';
const F_BASELINE = '===BASELINE ANSWER===';
const F_FILE = '===CONTEXT FILE===';
const F_END = '===END===';

export function buildProofBundle(bundle: ProofBundle): string {
  return [
    HEAD,
    F_PROMPT,
    bundle.task,
    F_BASELINE,
    bundle.answer,
    F_FILE,
    bundle.file,
    F_END,
    '',
  ].join('\n');
}

/** The mirror of the site's own parser, kept here so the roundtrip is a
 * unit test rather than a hope. Returns null for anything that is not a
 * v1 bundle — the site degrades to its file-only intake on the same
 * verdict. */
export function parseProofBundle(text: string): ProofBundle | null {
  const t = text.trim();
  if (!t.startsWith(HEAD)) return null;
  const iPrompt = t.indexOf(F_PROMPT);
  const iBase = t.indexOf(F_BASELINE);
  const iFile = t.indexOf(F_FILE);
  const iEnd = t.lastIndexOf(F_END);
  if (iPrompt < 0 || iBase < iPrompt || iFile < iBase || iEnd < iFile) return null;
  const cut = (from: number, fence: string, to: number) =>
    t.slice(from + fence.length, to).replace(/^\n/, '').replace(/\n$/, '');
  return {
    task: cut(iPrompt, F_PROMPT, iBase),
    answer: cut(iBase, F_BASELINE, iFile),
    file: cut(iFile, F_FILE, iEnd),
  };
}
