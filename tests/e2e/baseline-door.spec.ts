import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';

/**
 * D1 (docs/MEASUREMENT-SPINE.md) — the splash's baseline door, end to end.
 *
 * The bug this pins: the door used to open the interview at its top, and the
 * baseline offer cannot appear until `goal_want` has an answer — so somebody
 * who took the door fell straight past the thing they had chosen and met
 * orientation slide one instead. The door promised a baseline and delivered
 * the ordinary interview.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function open() {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion: 'reduce',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
  await page.waitForSelector('.splash-lockup', { timeout: 15_000 });
  return { context, page };
}

test.describe('the baseline door', () => {
  test('lands on the goal question, not on orientation', async () => {
    const { context, page } = await open();

    await page.getByRole('button', { name: S.splashBaseline, exact: true }).click();
    await page.waitForSelector('.flow', { timeout: 10_000 });

    // THE FIX. `goal_want` is the baseline question, and the door goes to it.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'goal_want');
    await expect(page.locator('.tourslide')).toHaveCount(0);

    await context.close();
  });

  test('answering it brings up the offer, and passing carries on into the interview', async () => {
    const { context, page } = await open();
    await page.getByRole('button', { name: S.splashBaseline, exact: true }).click();
    await page.waitForSelector('.flow');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'goal_want');

    await page.locator('.flow .field').first().fill('Draft my Monday update the way I would.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // The offer, with their own words as the task and NO DRAWER — the file
    // does not exist yet, so there is nothing for it to show.
    await expect(page.locator('.baselineoffer')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.baselineoffer-task')).toContainText('Draft my Monday update');
    await expect(page.locator('.filedrawer')).toHaveCount(0);

    // Passing costs nothing and the interview carries on — `findPosition`
    // resumes at the first unanswered step, which is orientation's opening.
    await page.getByRole('button', { name: S.baselineLater, exact: true }).click();
    await expect(page.locator('.baselineoffer')).toHaveCount(0);
    await expect(page.locator('.flow')).toHaveCount(1);

    await context.close();
  });

  test('the shorter road never meets the offer at all', async () => {
    const { context, page } = await open();

    await page.getByRole('button', { name: S.splashStraight, exact: true }).click();
    await page.waitForSelector('.home', { timeout: 10_000 });
    await expect(page.locator('.baselineoffer')).toHaveCount(0);

    await context.close();
  });
});
