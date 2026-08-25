import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';

/**
 * VB-08 adds a bordered button and a live region to the question screen. The
 * component harness the rest of the a11y project scans doesn't contain the
 * flow surface, so this scans the real thing: the panel, parked on the first
 * question that actually renders the example button — once untouched, and
 * again after a press, since the press is what puts text into the live region
 * and into the field.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

test('axe finds no violations on a question offering an example (VB-08)', async () => {
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
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  // Q1 is the intro; Next lands on context_scope, and answering that lands on
  // stop_explaining — the first question carrying written examples.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.flow .pillgroup .pill').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.flow-idea')).toBeVisible();

  // Scoped to the flow surface, and to the WCAG rule tags rather than axe's
  // "best-practice" set. The excluded best-practice rules that fire here
  // (`region`, `landmark-one-main`, `page-has-heading-one`) are all about the
  // panel *shell* — App.tsx renders no <main> and no <h1> — which is
  // pre-existing, unrelated to this control, and not this task's file to
  // change. Same exclusion, same reason, as rephrase.a11y.spec.ts.
  const scan = () =>
    new AxeBuilder({ page })
      .include('.flow')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

  expect((await scan()).violations).toEqual([]);

  // And again with an example in the field and in the live region.
  await page.getByRole('button', { name: S.giveExample, exact: true }).click();
  await expect(page.locator('#flow-stop_explaining')).not.toHaveValue('');
  expect((await scan()).violations).toEqual([]);

  await context.close();
});
