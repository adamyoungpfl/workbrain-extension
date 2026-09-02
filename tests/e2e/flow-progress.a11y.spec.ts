import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * VB-02's accept criterion is "axe clean". The component harness the rest of
 * the a11y project scans doesn't contain the flow surface, so this scans the
 * real panel parked on a question, with the bar on screen.
 *
 * The rule that matters most here is `aria-progressbar-name`: a
 * `role="progressbar"` with no accessible name is exactly the failure mode a
 * numberless bar invites, since there is no visible text left to name it by.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

test('axe finds no violations on a question showing the progress bar (VB-02)', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  await expect(page.locator('.flowprogress[role="progressbar"]')).toBeVisible();

  // Scoped to the flow surface, and to the WCAG rule tags rather than axe's
  // "best-practice" set. The best-practice rules that fire here (`region`,
  // `landmark-one-main`, `page-has-heading-one`) are all about the panel
  // *shell* — App.tsx renders no <main> and no <h1> — which is pre-existing,
  // unrelated to this bar, and not this task's file to change. Flagged in the
  // VB-02 report rather than silently fixed here.
  const results = await new AxeBuilder({ page })
    .include('.flow')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  // `aria-progressbar-name` lives in axe's best-practice set, not the WCAG
  // tags scanned above, so it is asserted explicitly rather than assumed.
  const nameCheck = await new AxeBuilder({ page })
    .include('.flow')
    .withRules(['aria-progressbar-name'])
    .analyze();
  expect(nameCheck.violations).toEqual([]);

  await context.close();
});
