import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { halfLifeFor } from '../../src/core/freshness/halfLives';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.3 VB-19's accessibility floor, scanned on the real panel with ALL FIVE
 * states on screen at once.
 *
 * file-tree.a11y.spec.ts already scans the drawer, but only ever with the
 * tree's three states in it. The pills add three tinted fills and one hollow
 * one, on top of a row that already carried a colour, and contrast maths over
 * a tint is exactly the sort of thing that passes by eye and fails by
 * measurement — which is what this exists to catch.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const DAY_MS = 24 * 60 * 60 * 1000;
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** The same five-state seed the behaviour spec uses — see its comment. */
function fiveStateAnswers(): Answers {
  const ago = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();
  const SKIPPED = new Set(['professional_name', 'negative_responsibility']);
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of contextModules) {
    if (module.id === 'initiatives') break;
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const step: Step = node;
      const key = step.key ?? step.id;
      let value: AnswerValue;
      if (step.kind === 'intro') value = null;
      else if (step.kind === 'yesno') value = 'no';
      else if (step.kind === 'chips') value = step.options?.[0]?.v ?? 'x';
      else if (step.kind === 'multi') value = step.options?.length ? [step.options[0]!.v] : [];
      else value = `A test answer for ${step.id}.`;
      if (SKIPPED.has(step.id)) value = null;
      values[key] = value;
      answeredAt[key] = ago(module.id === 'orientation' ? halfLifeFor('sec1') + 30 : 12);
      if (typeof value === 'string') reflectedAt[key] = answeredAt[key]!;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

async function openList(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, fiveStateAnswers());
  const page = await context.newPage();
  // Scanned still, for the reason file-tree.a11y.spec.ts documents: axe
  // measures one instant and the tree's typewriter passes through partially
  // printed labels on its way in.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.sectionhealth-pill');
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
  return page;
}

test('axe finds no violations with every health state on screen (VB-19)', async () => {
  const { context, sw, id } = await launch();
  const page = await openList(context, sw, id);

  // The scan below is only worth anything if all five really are rendered.
  const states = new Set<string>();
  for (const node of contextOutline) {
    states.add((await page.locator(`.filetree-row[data-node-id="${node.id}"]`).getAttribute('data-health'))!);
  }
  expect([...states].sort()).toEqual(['done', 'due', 'here', 'not-yet', 'partly']);

  const results = await new AxeBuilder({ page }).include('.filedrawer').withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await context.close();
});

test('every pill and every detail line clears 4.5:1 against what it sits on (VB-19)', async () => {
  const { context, sw, id } = await launch();
  const page = await openList(context, sw, id);

  // axe's own contrast rule, aimed squarely at the new text. Scoped to the
  // pills and detail lines so a violation elsewhere cannot be mistaken for a
  // pass here — and asserted to have really run, since an empty result from a
  // rule that never applied would be a silent pass.
  const results = await new AxeBuilder({ page })
    .include('.filedrawer')
    .withRules(['color-contrast'])
    .analyze();
  expect(results.violations).toEqual([]);
  expect(results.passes.length, 'the contrast rule never ran').toBeGreaterThan(0);

  await context.close();
});

test('the health pills add no control, no tab stop and no live region (VB-19)', async () => {
  const { context, sw, id } = await launch();
  const page = await openList(context, sw, id);

  // Status text, not controls: nothing here may be focusable, and nothing may
  // announce itself while somebody is trying to answer a question
  // (docs/GUARDRAILS.md — nothing steals focus, and no nudges).
  await expect(page.locator('.sectionhealth-pill [tabindex], .sectionhealth-pill button, .sectionhealth-pill a')).toHaveCount(0);
  // V1.8 VB-47 replaced the counts strip above the list with the file-type
  // toggle, so the "no live region in the drawer" rule now runs over that
  // strip: a toggle whose locked buttons announced themselves would be exactly
  // the interruption this test exists to prevent. A locked button carries its
  // whole sentence in its own name instead (components/FileTypeToggle.tsx).
  await expect(page.locator('.filetypes [aria-live], .filetree [aria-live]')).toHaveCount(0);

  // The group above the list has a real name rather than being an unlabelled
  // group — the same requirement, now the toggle's.
  await expect(page.locator('.filetypes-row')).toHaveAttribute('aria-label', /\S/);

  await context.close();
});
