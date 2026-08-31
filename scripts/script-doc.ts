/**
 * R-15 — every question, its rephrasings, and what the narrator says.
 *
 *   npx vite-node scripts/script-doc.ts
 *
 * Writes `store/script/questions.json`: the interview in flow order, one entry
 * per question, carrying everything somebody needs to judge that screen
 * without opening it — the wording, every rephrasing, the SPOKEN script, the
 * shape of answer it wants, its hint and its deeper-dives.
 *
 * ── THE SPOKEN SCRIPT WAS ALREADY DERIVABLE, AND I SAID IT WAS NOT ────────
 *
 * Flagged to Adam as R-15's dependency: "the narrator's script is assembled at
 * render time, so nothing can answer 'what does this screen say out loud'
 * without running it." That was wrong. `core/voice/narration.ts`'s
 * `narrationFor` is a pure function of a position and the answers, and has
 * been since V1.3 — it takes the panel's two strings as an argument
 * (`NarrationCopy`) precisely so core never reaches into the panel for them.
 * Nothing had to be built; it only had to be read.
 *
 * ── WHY vite-node AND NOT A .mjs LIKE THE OTHER SCRIPTS ───────────────────
 *
 * The other two scripts in here talk to a browser and read JSON. This one
 * imports the flow itself, which is TypeScript, and the whole point is to
 * report what the product ACTUALLY says rather than a transcription of it.
 * `vite-node` ships inside vitest, which is already a devDependency — no new
 * package (docs/DEPENDENCIES.md).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextModules, contextOutline } from '../src/core/flow/flow';
import { buildFlowLookups, resolvePhrase } from '../src/core/files/lookups';
import { positionForQuestionId } from '../src/core/flow/outline';
import { narrationFor } from '../src/core/voice/narration';
import { deepDiveFor } from '../src/core/flow/deepDive';
import { splitSectionLabel } from '../src/core/flow/sectionLabel';
import { NARRATION_COPY } from '../src/panel/voice/copy';
import type { FileOutlineNode, FlowContext, Step } from '../src/schema/flow.types';
import type { Answers } from '../src/schema/storage.types';

const OUT = join(new URL('..', import.meta.url).pathname, 'store/script');
mkdirSync(OUT, { recursive: true });

/** An empty file. The document is about the QUESTIONS, so every wording
 *  resolves against nothing answered — which is also what a first-time person
 *  meets, and therefore the version worth judging. */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
const CTX: FlowContext = { answers: {}, repeatables: {} };

/** The panel's own two strings, handed to core the way `Flow` hands them over —
 *  so the script this reports is the script that plays. */
const COPY = NARRATION_COPY;

/** What shape of answer a question wants, in words somebody can think with. */
const KINDS: Record<string, string> = {
  text: 'Written — one box, as long or short as they like',
  chips: 'Pick one',
  multi: 'Pick any number, and add their own',
  yesno: 'Yes or no — it opens or closes a whole section',
  intro: 'Nothing. A screen to read',
  gen: 'Generated for them, to accept or redo',
  demo: 'A demonstration — nothing to answer',
};

interface Entry {
  id: string;
  section: string;
  sectionId: string;
  module: string;
  kind: string;
  kindNote: string;
  required: boolean;
  question: string;
  rephrasings: string[];
  spoken: string | null;
  hint: string | null;
  placeholder: string | null;
  deepDives: { q: string; a: string }[];
  ideas: number;
  options: string[];
  inRepeatable: string | null;
}

const lookups = buildFlowLookups(contextModules);
const entries: Entry[] = [];

function moduleTitleFor(questionId: string): string {
  for (const m of contextModules) {
    const has = (nodes: typeof m.nodes): boolean =>
      nodes.some((n) =>
        'fields' in n
          ? n.fields.some((f) => f.id === questionId) || n.id === questionId
          : n.id === questionId,
      );
    if (has(m.nodes)) return m.title;
  }
  return '';
}

function walk(nodes: readonly FileOutlineNode[]) {
  for (const node of nodes) {
    const section = splitSectionLabel(node.label).title;
    for (const qid of node.questionIds) {
      const step: Step | undefined = lookups.stepsById.get(qid);
      if (!step) continue;
      const block = lookups.repeatableBlockForQuestionId.get(qid);

      // The spoken script. A field of a repeatable has no top-level position,
      // so it gets none — which is honest: the narrator reads it inside a
      // record, and there is no record here to read it inside.
      let spoken: string | null = null;
      if (!block) {
        const position = positionForQuestionId(contextModules, qid);
        if (position) spoken = narrationFor(position, EMPTY, COPY)?.text ?? null;
      }

      entries.push({
        id: qid,
        section,
        sectionId: node.id,
        module: moduleTitleFor(qid),
        kind: step.kind,
        kindNote: KINDS[step.kind] ?? step.kind,
        required: step.required !== false,
        question: resolvePhrase(step.q, CTX),
        rephrasings: (step.rephrasings ?? []).map((r) => resolvePhrase(r, CTX)),
        spoken,
        hint: step.hint ?? null,
        placeholder: null,
        deepDives: [...(deepDiveFor(qid) ?? [])],
        ideas: step.ideas?.length ?? 0,
        options: (step.options ?? []).map((o) => o.l),
        inRepeatable: block ? block.id : null,
      });
    }
    if (node.children) walk(node.children);
  }
}
walk(contextOutline);

writeFileSync(join(OUT, 'questions.json'), JSON.stringify(entries, null, 1));

const spoken = entries.filter((e) => e.spoken).length;
const rephrased = entries.filter((e) => e.rephrasings.length > 0).length;
console.log(`  ${entries.length} questions`);
console.log(`  ${spoken} carry a spoken script; ${entries.length - spoken} are fields of a record`);
console.log(`  ${rephrased} have at least one rephrasing`);
console.log(`  wrote store/script/questions.json`);
