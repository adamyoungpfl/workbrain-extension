/**
 * THE CONTEXT FILE BENCHMARK — run pack generator.
 *
 *   npx vite-node --config vitest.config.ts scripts/bench/run.ts
 *
 * Writes `store/bench/<stamp>/` : one prompt file per task × variant, the
 * variant files themselves, and a manifest. Paste each prompt into whichever
 * AI is being measured, paste the answer back into the scoring page, and the
 * run is recorded.
 *
 * ── THIS IS A DEVELOPMENT TOOL AND IT IS NOT THE PRODUCT ─────────────────
 *
 * `docs/GUARDRAILS.md` says the product makes no AI calls of its own and never
 * transmits the person's content. Nothing here touches the extension: it lives
 * in `scripts/`, it ships in nothing, and it does not call an AI either — it
 * PRINTS prompts for a human to run. The content it prints is a synthetic
 * fixture, not anybody's file.
 *
 * ── AND IT IS MODEL-AGNOSTIC ON PURPOSE ──────────────────────────────────
 *
 * Adam: "If there is no standard, then I will work to establish a standard
 * that other models will have to measure up to." A harness that called one
 * vendor's API would measure that vendor. One that emits text a person pastes
 * anywhere measures the FILE, which is the thing under test — and it can be
 * pointed at a model nobody has shipped yet without changing a line.
 *
 * ── WHAT MAKES A RUN COMPARABLE TO THE ONE BEFORE IT ─────────────────────
 *
 * Three things are pinned and the manifest records all three: the task set's
 * version, the answers fixture's hash, and the variant ids. Change any of them
 * and the runs are not comparable — the manifest is what lets a later reader
 * tell whether they are looking at a result or at two different experiments.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextModules } from '../../src/core/flow/flow';
import { generateContextFile } from '../../src/core/files/generate';
import { ideasFor } from '../../src/core/flow/ideas';
import { BENCH_TASKS } from './tasks';
import { VARIANTS } from './variants';
import { ABSENT } from './persona';
import type { Answers } from '../../src/schema/storage.types';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';

const ROOT = new URL('../..', import.meta.url).pathname;
const STAMP = process.env.WB_BENCH_STAMP ?? 'run-001';
const OUT = join(
  ROOT,
  // A run against a real file goes somewhere git-ignored. See below.
  process.env.WB_BENCH_FILE ? 'store/bench/private' : 'store/bench',
  STAMP,
);
mkdirSync(OUT, { recursive: true });

/**
 * ONE SYNTHETIC PERSON, built from the flow's own example answers.
 *
 * Synthetic rather than real, and that is not squeamishness: a benchmark run
 * against somebody's actual file cannot be published, cannot be re-run by
 * anybody else, and cannot be compared across models — which is three of the
 * four things a standard has to be. Every text answer is the question's own
 * shipped `ideas[0]`, so the fixture is derived from the product rather than
 * invented beside it.
 */
function fixture(): Answers {
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const NOW = '2026-08-31T09:00:00.000Z';

  const answerFor = (step: Step): AnswerValue => {
    if (step.kind === 'intro') return null;
    if (step.kind === 'yesno') return 'yes';
    if (step.kind === 'chips') return step.options?.[0]?.v ?? 'x';
    if (step.kind === 'multi') return (step.options ?? []).slice(0, 2).map((o) => o.v);
    return ideasFor(step)[0] ?? `A realistic answer for ${step.id}.`;
  };

  for (const m of contextModules as Module[]) {
    for (const node of m.nodes) {
      if ('fields' in node) {
        const block = node as RepeatableBlock;
        repeatables[block.id] = [0].map(() => {
          const rec: Record<string, AnswerValue> = {};
          if (block.seedFrom) rec[block.seedFrom.seedField] = 'Manager';
          for (const f of block.fields) rec[f.key ?? f.id] = answerFor(f as Step);
          return rec;
        });
        continue;
      }
      const step = node as Step;
      const key = step.key ?? step.id;
      values[key] = answerFor(step);
      answeredAt[key] = NOW;
    }
  }
  return { values, repeatables, answeredAt, reflectedAt: {} };
}

/**
 * ── THE TWO KINDS OF RUN, AND WHY BOTH ARE NEEDED ────────────────────────
 *
 * Adam, 2026-08-31: "I need to do this with a real example that I can actually
 * validate. The prompt is just for dummy data and so the details are all
 * generated."
 *
 * He is right, and it does not undo the case for the fixture — they measure
 * different things and a standard needs both:
 *
 *   · THE STANDARD RUN (the fixture, the default). Publishable, re-runnable by
 *     anybody, comparable across models. It measures the file's STRUCTURE, and
 *     it can do that because the person in it is nobody.
 *
 *   · THE VALIDATION RUN (`WB_BENCH_FILE`, a real downloaded Context.md).
 *     Private, not publishable, not comparable to anybody else's. It is the
 *     only way to score the dimensions that need a reader who knows the truth
 *     — "specific to them" and "invents nothing" cannot be judged honestly
 *     against a person who does not exist. A synthetic file makes fabrication
 *     INVISIBLE, because every detail in it was invented to begin with.
 *
 * Point it at a file the extension downloaded:
 *
 *   WB_BENCH_FILE=~/Downloads/Context.md WB_BENCH_STAMP=mine-001 \
 *     npx vite-node --config vitest.config.ts scripts/bench/run.ts
 *
 * A real run writes to `store/bench/private/` which is git-ignored, because a
 * personal context file is exactly the thing this product exists to keep off
 * other people's machines.
 */
const realFile = process.env.WB_BENCH_FILE;
const answers = fixture();
const base = realFile
  ? readFileSync(realFile, 'utf8')
  : generateContextFile(answers, '31 August 2026');
const fixtureHash = realFile
  ? `real:${createHash('sha256').update(base).digest('hex').slice(0, 12)}`
  : createHash('sha256').update(JSON.stringify(answers)).digest('hex').slice(0, 12);

/** The prompt a person actually pastes: the file, then the task. */
function promptFor(file: string, task: (typeof BENCH_TASKS)[number]): string {
  return `${file}\n\n---\n\n${task.prompt}`;
}

const manifest = {
  stamp: STAMP,
  taskSetVersion: 2,
  fixtureHash,
  generatedAt: '(stamp this when the run is filed — scripts cannot read the clock)',
  variants: VARIANTS.map((v) => ({ id: v.id, name: v.name, claim: v.claim })),
  /* R-16's ground truth. Everything IN the file is true of the persona by
     construction; this is the other half — what is deliberately not there, so
     "invents nothing" is a check against a written list rather than a feeling
     one scorer has and another does not. */
  absent: ABSENT,
  tasks: BENCH_TASKS.map((t) => ({ id: t.id, prompt: t.prompt, exercises: t.exercises, looksLike: t.looksLike })),
  cells: [] as { task: string; variant: string; file: string; bytes: number }[],
};

for (const variant of VARIANTS) {
  const file = variant.build(base);
  writeFileSync(join(OUT, `Context.${variant.id}.md`), file);
  for (const task of BENCH_TASKS) {
    const name = `${task.id}.${variant.id}.txt`;
    writeFileSync(join(OUT, name), promptFor(file, task));
    manifest.cells.push({ task: task.id, variant: variant.id, file: name, bytes: file.length });
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));

console.log(`  ${VARIANTS.length} variants x ${BENCH_TASKS.length} tasks = ${manifest.cells.length} prompts`);
for (const v of VARIANTS) {
  const bytes = manifest.cells.find((c) => c.variant === v.id)!.bytes;
  console.log(`    ${v.id}  ${String(bytes).padStart(5)} bytes  ${v.name}`);
}
console.log(`  fixture ${fixtureHash} — wrote ${realFile ? 'store/bench/private/' : 'store/bench/'}${STAMP}/`);
if (realFile) {
  console.log('  REAL FILE — this run is private, git-ignored, and not comparable to a fixture run.');
}
