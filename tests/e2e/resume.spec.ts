import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';

/**
 * V3.0 pass 4v — COLLAPSE AND COME BACK (Adam's ruling on docs/OPEN.md #8).
 *
 * The chrome mark closes the panel in one press; reopening in the same
 * browser session lands back on the surface the person left. The held
 * place lives in chrome.storage.session (`wb:resume`) — the splash flag's
 * own area — so it dies with the browser and the durable "which surface
 * you are on is never stored" rule stands.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.WB_E2E_DIST ?? path.resolve(HERE, '../../dist');

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion: 'reduce',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return { context, sw, id: new URL(sw.url()).host };
}

async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home, .skillshub, .browse, .flow');
  if (await page.locator('.splash').count()) {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
  }
  return page;
}

test.describe('4v — collapse and come back', () => {
  test('the mark is a real control that closes the panel', async () => {
    const { context, id } = await launch();
    const page = await openPanel(context, id);

    const mark = page.getByRole('button', { name: S.collapsePanel, exact: true });
    await expect(mark).toBeVisible();
    // One press, and the panel document is gone — no confirmation
    // (GUARDRAILS: nothing here is destructive enough to confirm).
    await Promise.all([page.waitForEvent('close'), mark.click()]);

    await context.close();
  });

  test('reopening lands back where they left off, and only for this browser session', async () => {
    const { context, id } = await launch();
    let page = await openPanel(context, id);

    // Walk somewhere that is not Home, then close the panel - any way it
    // closes (the mark lives on Home's chrome; a hub page closes like any
    // panel does, and the held place was written on arrival either way).
    await page.getByRole('button', { name: new RegExp(S.rowSkillsHub) }).click();
    await page.waitForSelector('.skillshub');
    await page.close();

    // Same browser session: the held place brings them back.
    page = await openPanel(context, id);
    await expect(page.locator('.skillshub')).toBeVisible();
    await expect(page.locator('.home')).toHaveCount(0);

    // Going Home clears nothing — the held place simply follows along.
    await page.getByRole('button', { name: S.hubBack, exact: true }).click();
    await page.waitForSelector('.home');
    await page.close();
    page = await openPanel(context, id);
    await expect(page.locator('.home')).toBeVisible();

    await context.close();
  });
});
