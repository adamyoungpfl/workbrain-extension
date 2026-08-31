/**
 * THE FILE VARIANTS — every one from the SAME answers, so the file's shape is
 * the only thing that changes between runs.
 *
 * That is the whole discipline of this harness. If variant B were generated
 * from a different fixture, or a hand-edited file, any difference in the
 * results would be unattributable and the benchmark would be theatre.
 *
 * ── WHY B IS A TRANSFORM AND NOT A SECOND GENERATOR ──────────────────────
 *
 * `docs/FILE-VALIDATION.md` proposes four changes to `core/files/generate.ts`.
 * Building them into the generator first and measuring second would mean
 * shipping a change to the product on the strength of an argument. Applying
 * them as a transform over the real generator's output measures first and
 * ships second — and if the numbers do not move, nothing was shipped.
 *
 * The transform is deliberately conservative: it MOVES and PREPENDS, and it
 * never rewrites a sentence. So any difference measured is a difference of
 * structure, which is the claim being tested.
 */

/** A named shape of the same file. */
export interface Variant {
  id: string;
  name: string;
  /** What this variant is testing, in one sentence. */
  claim: string;
  build: (base: string) => string;
}

/**
 * The preamble from FILE-VALIDATION.md §3, strengthened 2026-08-31.
 *
 * The first version said only "where this file is silent, say so rather than
 * inventing a preference" — which covers PREFERENCES and leaves the harder
 * case open. Adam named it: a question that is ninety percent answerable with
 * one unanswerable thing slipped into it should come back saying that one
 * thing cannot be retrieved.
 *
 * That is the dangerous case and the previous wording did not reach it. A flat
 * refusal is easy to notice; a mostly-right answer with one invented thread
 * woven through it is not, because everything around the invention is correct.
 * So the instruction now says three things the old one did not: answer the
 * parts you can, NAME the parts you cannot, and treat leaving a part out
 * silently as the same failure as making it up.
 *
 * Authored once, never asked — this is not a question anybody has to answer.
 */
const PREAMBLE = `## How to use this file

This file describes how one person works. Use it to match their voice, respect
their constraints, and skip the context they would otherwise have to
re-explain. Prefer what is written here over your defaults.

**Answer only what this file supports.** Where it is silent, say so plainly
rather than inventing a preference, a fact, a number or a name.

**If part of a request cannot be answered from this file, answer the rest and
name the part you could not.** Do not quietly leave it out — an answer with a
gap nobody mentioned is indistinguishable from an answer that made something
up. Saying "this file does not tell me that" is always the better answer.`;

/** Splits a generated file into its `## ` sections, title and body kept whole. */
function sections(file: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = [];
  const lines = file.split('\n');
  let current: { title: string; body: string } | null = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) out.push(current);
      current = { title: line.slice(3).trim(), body: '' };
      continue;
    }
    if (current) current.body += line + '\n';
  }
  if (current) out.push(current);
  return out;
}

/** Everything above the first `## ` — the H1 and its provenance line. */
function head(file: string): string {
  const at = file.indexOf('\n## ');
  return at === -1 ? file : file.slice(0, at + 1);
}

/** Strips a leading numeral: "6. How I Communicate" -> "How I Communicate". */
const bare = (title: string) => title.replace(/^\d+\.\s*/, '');

/**
 * The order FILE-VALIDATION.md §2 argues for: instruction, then who they are,
 * then how to write for them, then what never to do, then the world, then the
 * examples last where recency weighting helps them.
 */
const ORDER = [
  'About Me',
  'How I Communicate',
  'How I Think',
  'Audience Profiles',
  'Context Boundaries',
  'System Grounding Rule',
  'My World',
  'Initiatives',
  'Vocabulary & Knowledge',
  'Reference Examples',
];

/** Sections that are about the PRODUCT rather than the person (§ "remove"). */
const PRODUCT_ONLY = ['About This Context'];

export const VARIANTS: readonly Variant[] = [
  {
    id: 'A',
    name: 'As it ships today',
    claim: 'The baseline. Whatever the generator produces, unaltered.',
    build: (base) => base,
  },
  {
    id: 'B',
    name: 'Instructed and reordered',
    claim:
      'A directive preamble at the top, the interview metadata dropped, and the sections in the order FILE-VALIDATION.md argues for — behaviour near the ends, the world in the middle, examples last.',
    build: (base) => {
      const kept = sections(base).filter((s) => !PRODUCT_ONLY.includes(bare(s.title)));
      const rank = (s: { title: string }) => {
        const i = ORDER.indexOf(bare(s.title));
        return i === -1 ? ORDER.length : i;
      };
      const ordered = [...kept].sort((a, b) => rank(a) - rank(b));
      // Renumbered, because a file that jumps from 5 to 7 reads as damaged.
      // The grounding rule is deliberately UNNUMBERED — it is a rule about the
      // whole file rather than another section of it — so it must not consume
      // an index either, which the first build of this got wrong.
      let n = 0;
      const body = ordered
        .map((s) => {
          const name = bare(s.title);
          const title = name === 'System Grounding Rule' ? name : `${++n}. ${name}`;
          return `## ${title}\n${s.body.replace(/\n+$/, '')}\n`;
        })
        .join('\n');
      return `${head(base)}\n${PREAMBLE}\n\n${body}`;
    },
  },
];
