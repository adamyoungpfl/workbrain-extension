import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

// R1-10 accept criteria (docs/RELEASE-1.md): "export -> clear storage ->
// import -> identical answers. This is the backup story; treat a failure
// here as a release blocker." See docs/TESTING.md for the
// launchPersistentContext pattern this mirrors from tests/e2e/flow.spec.ts —
// kept as its own file/self-contained launch helpers, matching how this
// repo keeps each spec file standalone (see reflect.spec.ts's own note).
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

/** R1-12: Download/Import (`FileActions`) now live on Home, not on the
 * Context flow's own "done" screen — Home replaced that screen entirely as
 * the place a finished interview lands (see App.tsx / Flow.tsx's `onDone`).
 * They're always visible there, not gated behind reaching "done" — see
 * FileActions.tsx's own header comment on why. */
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
 * Builds a synthetic-but-real `Answers` object that `findPosition`
 * (core/flow/runner.ts) considers fully "done" — walking the real
 * `contextModules` generically (first option for chips/single-select,
 * placeholder text for free text) rather than hand-typing all ~40
 * questions, which would be both huge and brittle against wording changes.
 *
 * Two things are deliberately steered rather than left generic, matching
 * this task's own accept criteria ("at least one explicitly-skipped
 * question ... and one repeatable record with multiple entries"):
 *  - `professional_name` (a real `required: false` text question) is left
 *    `null` — an explicit skip, not "never answered".
 *  - `role_names` (the real multi-select that seeds the `roles` repeatable)
 *    gets two picks, producing two seeded `roles` records.
 * `entities`/`initiatives` used to be gated off here via their own yes-no
 * answers. V2.0 VB-61/VB-63 removed that option — both blocks are required for
 * a complete file now — so this fixture fills one record in each, and the test
 * is stronger for it: all three repeatable shapes make the round trip, not one.
 *
 * That also matters for what this test asserts. A gate is a framing beat now
 * (an `intro`), and an intro's value is a skip; `core/files/restore.ts` fills
 * one back in as `null` on import, so a fixture still holding the old "no"
 * would fail the comparison below for a reason that has nothing to do with
 * downloading or importing. The grandfathered path — a decline recorded under
 * the old rule — is unit-tested in core/flow/overrides.test.ts instead.
 *
 * `answeredAt`/`reflectedAt` are stamped for every key generically — a
 * stray `reflectedAt` entry on a key that could never have needed one is
 * harmless (core/flow/runner.ts's `actionFor` only ever reads it for
 * `text`+`interpret` questions), and this sidesteps needing to know which
 * of the real questions carry `interpret` at all.
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
        continue; // repeatable blocks handled in the second pass below
      }
      const step = node;
      const key = step.key ?? step.id;

      if (step.id === 'professional_name') {
        stampTop(key, null); // the explicit skip this test is proving round-trips
      } else if (step.id === 'role_names') {
        roleNamesStep = step;
        const picks = (step.options ?? []).slice(0, 2).map((o) => o.v);
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
        if (fk === rolesBlock!.seedFrom!.seedField) continue; // never a real Step — runner.ts never stamps it either
        const compound = `${rolesBlock!.id}#${recordIndex}#${fk}`;
        answeredAt[compound] = now;
        if (typeof v === 'string') reflectedAt[compound] = now;
      }
    });
  }

  // V2.0 VB-61/VB-63: one record in each open-ended block, because a file with
  // none of either is no longer a finished file. Filled generically off the
  // real fields, so a reordered cycle (VB-62) needs no change here.
  for (const module of modules) {
    for (const node of module.nodes) {
      if (!('fields' in node) || node.seedFrom) continue;
      const record: Record<string, AnswerValue> = {};
      for (const field of node.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A test answer for ${field.id}.`;
        answeredAt[`${node.id}#0#${fk}`] = now;
        if (typeof record[fk] === 'string') reflectedAt[`${node.id}#0#${fk}`] = now;
      }
      repeatables[node.id] = [record];
    }
  }

  return { values, repeatables, answeredAt, reflectedAt };
}

test.describe('Download and import (R1-10)', () => {
  test('export -> clear storage -> import -> identical answers, including a skip and a multi-entry repeatable', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);

    // Confirms the fixture itself is doing what this test claims before
    // any of R1-10's own code runs.
    expect(seeded.values.professional_name).toBeNull();
    expect(seeded.repeatables.roles?.length).toBe(2);

    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await expect(page.locator('.home')).toBeVisible();
    // V2.6 VB-125c: the download/import pair lives in the Move-file sheet —
    // one tile press deep, then everything below is exactly as it was.
    await page.getByRole('button', { name: 'Move file', exact: true }).click();
    await page.waitForSelector('.sheet-card');

    // --- export -----------------------------------------------------
    const downloadButton = page.getByRole('button', { name: 'Download your file', exact: true });
    await expect(downloadButton).toBeVisible();
    const downloadPromise = page.waitForEvent('download');
    await downloadButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Context.md');
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    // Playwright saves the download under its own temp filename, not the
    // page's suggested one — re-wrap it with the real name before feeding
    // it back to the file input, or the extension's own (correct)
    // wrong-kind check rejects it on the temp name's missing ".md".
    const downloadedMarkdown = await readFile(downloadPath!, 'utf8');

    // Button relabels for a second download, per strings.ts's downloadAgain.
    await expect(page.getByRole('button', { name: 'Download it again', exact: true })).toBeVisible();
    await expect(page.getByText('Downloaded. Keep it somewhere you will find it.')).toBeVisible();

    // --- clear storage ------------------------------------------------
    await sw.evaluate(() => chrome.storage.local.remove('wb:answers'));
    const clearedCheck = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    expect(clearedCheck['wb:answers']).toBeUndefined();

    // --- import (still the same mounted Home — no reload happens between
    // clear and import). The visible Button calls the hidden
    // <input type=file>'s own .click() (FileActions.tsx) — in a real,
    // headed browser that opens the OS's native file chooser, which
    // Playwright must intercept via the 'filechooser' event rather than
    // driving `setInputFiles` on the input directly, or the still-open
    // native dialog leaves the page never receiving a 'change' event at
    // all. ---
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'I already have a file', exact: true }).click(),
    ]);
    await chooser.setFiles({
      name: 'Context.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(downloadedMarkdown),
    });

    // Toast.tsx renders a leading "✓ " glyph ahead of the message itself
    // (see Toast.tsx), so the match is intentionally not start-anchored.
    await expect(page.getByText(/Brought back .+ answers$/)).toBeVisible();

    // --- identical answers ---------------------------------------------
    const stored = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    const restored = stored['wb:answers'] as Answers;

    // A real top-level yesno/intro question's own value is never written to
    // the file at all (generate.ts's `renderFileSection`, documented at
    // length in roundtrip.test.ts) — an established, confirmed limitation
    // of the file format. `buildImportedAnswers` (core/files/restore.ts)
    // closes that gap by inference on import, which is why this compares
    // cleanly against the FULL original seed rather than a filtered
    // subset — see restore.ts's own header comment and restore.test.ts for
    // that inference tested in isolation.
    expect(restored.values).toEqual(seeded.values);
    expect(restored.values.professional_name).toBeNull(); // the explicit skip, specifically
    expect(restored.repeatables).toEqual(seeded.repeatables);
    expect(restored.repeatables.roles?.length).toBe(2); // the multi-entry repeatable, specifically

    await context.close();
  });

  test('a file of the wrong kind is rejected without touching storage, silently — no crash, no stack trace', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await expect(page.locator('.home')).toBeVisible();
    // V2.6 VB-125c: the download/import pair lives in the Move-file sheet —
    // one tile press deep, then everything below is exactly as it was.
    await page.getByRole('button', { name: 'Move file', exact: true }).click();
    await page.waitForSelector('.sheet-card');

    await page.getByRole('button', { name: 'I already have a file', exact: true }).click();
    await page.locator('.file-actions-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('just some notes, not a Context.md'),
    });

    await expect(page.getByRole('alert')).toHaveText('That looks like a different kind of file. Look for one ending in .md.');

    const stored = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    expect(stored['wb:answers']).toEqual(seeded); // untouched — nothing was imported

    await context.close();
  });

  test('an .md file missing the System Grounding Rule is rejected without touching storage', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await expect(page.locator('.home')).toBeVisible();
    // V2.6 VB-125c: the download/import pair lives in the Move-file sheet —
    // one tile press deep, then everything below is exactly as it was.
    await page.getByRole('button', { name: 'Move file', exact: true }).click();
    await page.waitForSelector('.sheet-card');

    await page.getByRole('button', { name: 'I already have a file', exact: true }).click();
    await page.locator('.file-actions-input').setInputFiles({
      name: 'Context.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Context.md\n\nSomeone hand-edited this and deleted the grounding rule.\n'),
    });

    await expect(page.getByRole('alert')).toHaveText('I could not read that file. Pick the Context.md you downloaded from here.');

    const stored = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    expect(stored['wb:answers']).toEqual(seeded); // untouched — nothing was imported

    await context.close();
  });
});
