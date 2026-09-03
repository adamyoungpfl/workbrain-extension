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
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

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
  await page.waitForSelector('.splashreveal', { timeout: 15_000 });
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

  test('answering it brings up the offer, and passing leaves for Home', async () => {
    const { context, page } = await open();
    await page.getByRole('button', { name: S.splashBaseline, exact: true }).click();
    await page.waitForSelector('.flow');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'goal_want');

    await page.locator('.flow .field').first().fill('Draft my Monday update the way I would.');
    // Submit, not Next (Adam, 2026-09-02): the door's own nav dress.
    await page.getByRole('button', { name: S.baselineSubmit, exact: true }).click();

    // The offer, with NO DRAWER — the file does not exist yet, so there is
    // nothing for it to show.
    await expect(page.locator('.baselineoffer')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.filedrawer')).toHaveCount(0);

    /* SUPERSEDED 2026-09-01, at Adam's word, and recorded rather than quietly
       rewritten.

       This assertion used to read "passing costs nothing and the interview
       carries on", and it was right for the screen it was written against: the
       offer was a step somebody could decline on the way past. Two things
       changed it.

       The prompt is no longer restated here, so this screen is no longer part
       of the goal question — it is an errand, and an errand somebody declines
       is an errand they leave. And "Not now" landing on question one made the
       bail-out a door into the very thing being declined, which is the one
       thing a bail-out must not be.

       WHAT THE OLD ASSERTION PROTECTED SURVIVES: passing still costs nothing,
       the interview is still identical for anybody who never saw this, and the
       proof's own baseline still runs later. Home is where starting lives, so
       nothing is out of reach — it is one press further away, and that press
       is the person's. */
    /* V3.0 pass 3h: the doors live in step 3's stage - open it first. */
    await page.locator('.stepstack-row').nth(2).click();
    await page.getByRole('button', { name: S.baselineLater, exact: true }).click();
    await expect(page.locator('.baselineoffer')).toHaveCount(0);
    await expect(page.locator('.flow')).toHaveCount(0);
    await expect(page.locator('.home')).toBeVisible({ timeout: 10_000 });

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
