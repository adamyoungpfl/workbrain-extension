import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

// R1-11 accept criteria (docs/RELEASE-1.md): "Four steps: baseline,
// with-context, grade, recommendations. Manual copy/paste only. Service
// chips drive the per-service attach hint. Accept: completing it writes one
// score to wb:report.scores; the pasted text is never parsed, scored, or
// stored beyond the field it was pasted into." See docs/TESTING.md for the
// launchPersistentContext pattern — kept as its own self-contained spec
// file, matching reflect.spec.ts's and download-import.spec.ts's own note
// that this repo keeps each spec file standalone.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** R1-12: the Context flow's own "done" screen no longer exists — Home
 * replaced it (see App.tsx / Flow.tsx's `onDone`), and the proof loop's own
 * entry point ("Prove it works") moved there with it. See flow.spec.ts's
 * header comment on the same routing change. */
async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

/**
 * A minimal "the Context interview is already done" fixture, so this spec
 * can reach the proof loop's own entry point (Home's "Prove it works"
 * button, shown once there's any real progress — see Home.tsx) without
 * re-walking all ~40 Context questions itself — download-import.spec.ts's
 * own `buildDoneAnswers` does the same thing for the same reason, and is
 * duplicated rather than imported, matching this repo's established "each
 * spec file stays self-contained" convention (see reflect.spec.ts's own
 * header comment).
 */
function buildDoneAnswers(modules: Module[]): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  function stampTop(key: string, value: AnswerValue) {
    values[key] = value;
    answeredAt[key] = now;
    if (typeof value === 'string') reflectedAt[key] = now;
  }

  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;

  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        // By id, not by `seedFrom`: V2.0 VB-64 added a second seeded block
        // (`audiences`), and "the last seeded block wins" would have quietly
        // built this fixture's role records into the wrong one.
        if (node.id === 'roles') rolesBlock = node;
        continue;
      }
      const step = node;
      const key = step.key ?? step.id;

      if (step.id === 'professional_name') {
        stampTop(key, null);
      } else if (step.id === 'entities_gate' || step.id === 'initiatives_gate') {
        stampTop(key, 'no');
      } else if (step.id === 'role_names') {
        roleNamesStep = step;
        const picks = (step.options ?? []).slice(0, 1).map((o) => o.v);
        stampTop(key, picks);
      } else if (step.kind === 'intro') {
        stampTop(key, null);
      } else if (step.kind === 'yesno') {
        stampTop(key, 'yes');
      } else if (step.kind === 'chips') {
        stampTop(key, step.options?.[0]?.v ?? 'x');
      } else if (step.kind === 'multi') {
        stampTop(key, step.options?.length ? [step.options[0]!.v] : []);
      } else {
        stampTop(key, `A test answer for ${step.id}.`);
      }
    }
  }

  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    const records = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [rolesBlock!.seedFrom!.seedField]: label };
      for (const field of rolesBlock!.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A test answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[rolesBlock.id] = records;
    records.forEach((record, recordIndex) => {
      for (const [fk, v] of Object.entries(record)) {
        if (fk === rolesBlock!.seedFrom!.seedField) continue;
        const compound = `${rolesBlock!.id}#${recordIndex}#${fk}`;
        answeredAt[compound] = now;
        if (typeof v === 'string') reflectedAt[compound] = now;
      }
    });
  }

  return { values, repeatables, answeredAt, reflectedAt };
}

async function storedLocal(sw: Worker): Promise<Record<string, unknown>> {
  return sw.evaluate(() => chrome.storage.local.get(['wb:answers', 'wb:report']));
}

test.describe('The proof loop (R1-11)', () => {
  test('a full pass through all four steps writes exactly one with-context score, and the pasted grade text lives only in the field it was pasted into', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await expect(page.locator('.home')).toBeVisible();

    // --- entry point: Home offers the proof loop once there's any real
    // progress to prove (Home.tsx), reached keyboard-only (CLAUDE.md's
    // definition of done) ---
    await page.getByRole('button', { name: 'Prove it works', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_service');

    // --- service picker (existing chips kind, no new rendering), selected
    // via Space same as flow.spec.ts's own keyboard-only pill selection ---
    await page.getByRole('button', { name: 'ChatGPT', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // --- baseline: the ported prompt is shown read-only, verbatim ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_baseline');
    const baselinePrompt = await page.locator('.flow .readonly').first().textContent();
    expect(baselinePrompt).toContain('Draft a status update for my manager.');
    const baselineAnswer = "Here's the status update with nothing loaded — generic, no specifics.";
    await page.locator('.flow textarea').fill(baselineAnswer);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // --- with-context: the SAME prompt again, plus the per-service attach
    // hint, ported verbatim and chosen by the service picked above ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_context');
    await expect(page.locator('.flow')).toContainText(
      'Click the + / paperclip near the message box and attach Context.md.',
    );
    await expect(page.locator('.flow')).toContainText("Or just paste Context.md’s text directly if you don’t see one.");
    const contextPrompt = await page.locator('.flow .readonly').first().textContent();
    expect(contextPrompt).toContain('Draft a status update for my manager.');
    const contextAnswer = "Here's the status update with Context.md attached — specific to my actual role and team.";
    await page.locator('.flow textarea').fill(contextAnswer);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // --- grade: the generated rubric prompt embeds both pasted answers ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_grade');
    const gradePrompt = await page.locator('.flow .readonly').first().textContent();
    expect(gradePrompt).toContain('5. The top 2-3 specific areas of opportunity');
    expect(gradePrompt).toContain(baselineAnswer);
    expect(gradePrompt).toContain(contextAnswer);

    const pastedGrade =
      'Answer 2 is far more specific to your actual role and team. Baseline: 6/10. With Context.md: 9/10. Top opportunity: clarify your manager relationship.';
    await page.locator('.flow textarea').fill(pastedGrade);

    // Required score fields — Next is blocked until both are filled.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    const numberInputs = page.locator('.flow input[type="number"]');
    // Keyboard-only through the two new score fields — CLAUDE.md's
    // definition of done requires the keyboard-only path on any changed
    // screen, same standard reflect.spec.ts holds itself to.
    await numberInputs.nth(0).focus();
    await page.keyboard.type('6');
    await page.keyboard.press('Tab');
    await page.keyboard.type('9');
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');

    // --- recommendations: relays the pasted grade text verbatim, read-only,
    // plus the computed (never persisted) score difference ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_recommendations');
    await expect(page.locator('.flow')).toContainText('3 points higher with your file.');
    const relayed = await page.locator('.flow .readonly').first().textContent();
    expect(relayed).toContain(pastedGrade);

    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toContainText("That's the whole loop.");

    // --- storage: read directly, not just the UI ---
    const stored = await storedLocal(sw);
    const answers = stored['wb:answers'] as Answers;
    const report = stored['wb:report'] as { scores: { at: string; value: number }[] } | undefined;

    expect(report?.scores).toHaveLength(1);
    expect(report!.scores[0]!.value).toBe(9); // with-context score, never the baseline number
    expect(typeof report!.scores[0]!.at).toBe('string');

    // The pasted grade text lives only in the one field it was pasted into —
    // never duplicated into wb:report, never parsed into anything else.
    expect(answers.values.proof_grade_text).toBe(pastedGrade);
    expect(JSON.stringify(report)).not.toContain(pastedGrade);
    expect(JSON.stringify(report)).not.toContain(baselineAnswer);
    expect(JSON.stringify(report)).not.toContain(contextAnswer);

    // The two typed scores are exactly what was typed, not derived/rounded.
    expect(answers.values.proof_score_baseline).toBe('6');
    expect(answers.values.proof_score_context).toBe('9');

    await context.close();
  });

  test('skipping baseline/with-context degrades gracefully — the grade prompt shows "[not captured]", never throws', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).click();

    await page.getByRole('button', { name: 'Claude', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Skip baseline and with-context entirely.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_baseline');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_context');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();

    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_grade');
    const gradePrompt = await page.locator('.flow .readonly').first().textContent();
    expect(gradePrompt).toContain('[not captured]');

    // Skip the grade step too — reaching recommendations with nothing pasted.
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_recommendations');
    await expect(page.locator('.flow .readonly')).toHaveCount(0);

    // No score was ever written — nothing was typed to write.
    const stored = await storedLocal(sw);
    expect(stored['wb:report']).toBeUndefined();

    await context.close();
  });
});
