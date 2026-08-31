/**
 * THE AUTOMATED RUNNER.
 *
 *   ANTHROPIC_API_KEY=… npx vite-node --config vitest.config.ts scripts/bench/api.ts
 *   npx vite-node --config vitest.config.ts scripts/bench/api.ts --dry
 *
 * Runs every prompt in a pack against every model whose key is present, saves
 * the answers, and runs the absence detector over each one. Writes
 * `store/bench/<stamp>/results.json`.
 *
 * ── WHAT IT DECIDES AND WHAT IT REFUSES TO ───────────────────────────────
 *
 * It produces answers and FLAGS. It does not score. The rubric's five other
 * dimensions — specific, voice, obeys, sendable, names-gaps — stay human,
 * because scoring "sounds like them" with a model means measuring the file
 * with the same class of system the file is being tested on. When those two
 * agree nothing has been learned; when they disagree nobody knows which was
 * wrong. That is a limitation to state, not to engineer around.
 *
 * ── THE THREE SAFETIES ───────────────────────────────────────────────────
 *
 * 1. NO KEY, NO RUN. A missing key skips that model loudly rather than
 *    silently producing a partial run somebody later reads as a whole one.
 * 2. A CEILING. `--max` caps the number of API calls, defaulting low. An
 *    unbounded loop against a paid API inside a build is a thing discovered
 *    on an invoice.
 * 3. `--dry` prints exactly what would be sent and calls nothing, so the
 *    runner can be verified without a key or a bill.
 *
 * ── AND IT IS NOT THE PRODUCT ────────────────────────────────────────────
 *
 * docs/GUARDRAILS.md bars the EXTENSION from making AI calls. This is
 * scripts/, it ships in nothing, and it runs against a synthetic persona. No
 * code path from the extension reaches this directory.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MODELS, MODEL_SET_VERSION } from './models';
import { detectAbsences } from './detect';
import type { Finding } from './detect';

const ROOT = new URL('../..', import.meta.url).pathname;
const STAMP = process.env.WB_BENCH_STAMP ?? 'run-001';
const PACK = join(ROOT, process.env.WB_BENCH_FILE ? 'store/bench/private' : 'store/bench', STAMP);

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
/* A full pack is cells x models. The default covers one model's worth of a
   three-variant, six-task pack with room to spare, so a first run is bounded
   by accident rather than by luck. Raise it deliberately. */
const MAX = Number(argv.find((a) => a.startsWith('--max='))?.split('=')[1] ?? 20);

if (!existsSync(join(PACK, 'manifest.json'))) {
  console.error(`  no pack at ${PACK} — run scripts/bench/run.ts first`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(PACK, 'manifest.json'), 'utf8'));

const live = MODELS.filter((m) => process.env[m.keyEnv]);
const skipped = MODELS.filter((m) => !process.env[m.keyEnv]);
for (const m of skipped) console.log(`  SKIPPING ${m.id} — ${m.keyEnv} is not set`);
if (!DRY && live.length === 0) {
  console.error('  no keys present. Set one, or pass --dry to see what would be sent.');
  process.exit(1);
}

/** One call, per vendor. Text in, text out — nothing else is needed here. */
async function ask(model: (typeof MODELS)[number], prompt: string): Promise<string> {
  const key = process.env[model.keyEnv]!;
  if (model.vendor === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model.model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = (await r.json()) as { content?: { text?: string }[]; error?: { message?: string } };
    if (j.error) throw new Error(j.error.message ?? 'anthropic error');
    return (j.content ?? []).map((c) => c.text ?? '').join('');
  }
  if (model.vendor === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model.model, messages: [{ role: 'user', content: prompt }] }),
    });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (j.error) throw new Error(j.error.message ?? 'openai error');
    return j.choices?.[0]?.message?.content ?? '';
  }
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model.model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  const j = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    error?: { message?: string };
  };
  if (j.error) throw new Error(j.error.message ?? 'google error');
  return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}

interface Result {
  model: string;
  task: string;
  variant: string;
  answer: string;
  findings: Finding[];
  error?: string;
}

const results: Result[] = [];
let calls = 0;

outer: for (const model of DRY ? MODELS : live) {
  for (const cell of manifest.cells as { task: string; variant: string; file: string }[]) {
    if (calls >= MAX) {
      // Labelled break: an inner `break` left the ceiling message printing once
      // per model, which reads as several ceilings rather than one.
      console.log(`  ceiling of ${MAX} calls reached — stopping. Raise it with --max=N.`);
      break outer;
    }
    const prompt = readFileSync(join(PACK, cell.file), 'utf8');
    const file = readFileSync(join(PACK, `Context.${cell.variant}.md`), 'utf8');
    calls += 1;
    if (DRY) {
      console.log(`  [dry] ${model.id} ${cell.task}/${cell.variant} — ${prompt.length} chars`);
      continue;
    }
    try {
      const answer = await ask(model, prompt);
      const findings = detectAbsences(answer, file);
      results.push({ model: model.id, task: cell.task, variant: cell.variant, answer, findings });
      const flag = findings.length ? `  ⚑ ${findings.map((f) => f.absence).join(', ')}` : '';
      console.log(`  ${model.id} ${cell.task}/${cell.variant} — ${answer.length} chars${flag}`);
    } catch (err) {
      results.push({
        model: model.id, task: cell.task, variant: cell.variant, answer: '', findings: [],
        error: String(err).slice(0, 140),
      });
      console.log(`  ${model.id} ${cell.task}/${cell.variant} — FAILED ${String(err).slice(0, 80)}`);
    }
  }
}

if (DRY) {
  console.log(`\n  ${calls} calls would be made across ${MODELS.length} models. Nothing was sent.`);
} else {
  writeFileSync(
    join(PACK, 'results.json'),
    JSON.stringify({ stamp: STAMP, modelSetVersion: MODEL_SET_VERSION, taskSetVersion: manifest.taskSetVersion, results }, null, 1),
  );
  const flagged = results.filter((r) => r.findings.length).length;
  console.log(`\n  ${results.length} answers, ${flagged} carrying at least one flag — wrote results.json`);
  console.log('  Flags are CANDIDATES. Confirm each by hand; the other five dimensions are yours.');
}
