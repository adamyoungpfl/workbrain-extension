import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';


/**
 * BS-05d (§5) — the run's payoff.
 *
 * Five questions is a pace somebody can see the end of; this is what they
 * get for reaching it. The card can name a SECTION because Adam's D1 bounds
 * runs by their module, so a run boundary is always a section boundary.
 */

const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchExtension() {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return { context, sw, id: new URL(sw.url()).host };
}

/** Walk the interview until the first run card appears. */
async function walkToFirstCard(context: BrowserContext, id: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  /* The card is one big button since 2026-09-04 - the verb caption sits at
     the END of its accessible name, so the anchor goes. */
  await page.getByRole('button', { name: /Start with a few questions/ }).click();
  await page.waitForSelector('.flow');

  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(220);
    if (await page.locator('.runcard').count()) return page;
    const field = page.locator('.flow textarea, .flow input:not([type=checkbox]):not([type=number])').first();
    if (await field.count()) await field.fill('An answer, the way somebody would write one.');
    const choice = page.locator('.flow .pill, .flow .vpick-tile, .flow .orbchoice').first();
    if ((await choice.count()) && !(await field.count())) await choice.click();
    const advance = page.locator('.tourslide-advance').first();
    if (await advance.count()) {
      await advance.click();
      continue;
    }
    const next = page.getByRole('button', { name: 'Next', exact: true }).first();
    if (await next.count()) await next.click();
  }
  throw new Error('never reached a run card');
}


test.describe('BS-05d — the run boundary pays off', () => {
  test('names the section that just finished, and what landed in the file', async () => {
    const { context, id } = await launchExtension();
    const page = await walkToFirstCard(context, id);

    // It can name a section BECAUSE runs are module-bounded (D1). Under
    // strict fives this sentence could not exist — two sections would be
    // half-lit when it fired.
    await expect(page.locator('.runcard-title')).toHaveText('Orientation is lit up.');
    await expect(page.locator('.runcard-line')).toContainText('new lines in your file');
    // Sentence case, because these are sentences and the panel spells its
    // numbers (Adam's D1: no digit at all in the panel's own voice).
    expect(await page.locator('.runcard-line').textContent()).toMatch(/^[A-Z]/);
    await expect(page.locator('.runcard')).not.toContainText(/\d/);

    await context.close();
  });

  test('offers three real choices, and the stop is one of them', async () => {
    const { context, id } = await launchExtension();
    const page = await walkToFirstCard(context, id);

    /**
     * THE STOP IS THE POINT. `welcomeTime` has promised since V1.1 that
     * somebody can stop anywhere and pick up where they left off, and no
     * screen in the interview has ever offered it. An interview that only
     * says "next" is one people abandon rather than leave — and for a beta,
     * an abandonment is a report we never get.
     */
    await expect(page.getByRole('button', { name: S.runCardKeep, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: S.runCardRead, exact: true })).toBeVisible();
    const stop = page.getByRole('button', { name: S.runCardStop, exact: true });
    await expect(stop).toBeVisible();
    // Never hidden, and a real 44px control rather than a footnote.
    const box = (await stop.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    // And it says what stopping costs, which is nothing.
    await expect(page.locator('.runcard-stopnote')).toContainText('Everything is saved');

    // THREE, and no fourth thing competing with them. BS-03a's micro-proof
    // offer used to stand above these as the primary; Adam removed it on
    // 2026-08-28, and this is where that stays true.
    await expect(page.locator('.runcard-offer')).toHaveCount(0);
    await expect(page.locator('.runcard-doors button')).toHaveCount(3);

    await context.close();
  });

  test('keep going returns to exactly where the interview was', async () => {
    const { context, id } = await launchExtension();
    const page = await walkToFirstCard(context, id);

    await page.getByRole('button', { name: S.runCardKeep, exact: true }).click();
    // The card is a moment laid over the flow, not a position in it — so
    // dismissing it leaves the runner exactly where it already was.
    await expect(page.locator('.runcard')).toHaveCount(0);
    await page.waitForSelector('.flow[data-step-id]');

    await context.close();
  });

  test('stopping leaves for Home, and nothing about the card is written down', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await walkToFirstCard(context, id);

    await page.getByRole('button', { name: S.runCardStop, exact: true }).click();
    await page.waitForSelector('.home');

    // Nothing about runs, cards or "seen it" reaches storage. The card is a
    // moment held in memory for the session — deriving it would mean
    // replaying it on every reopen, and storing it would mean inventing a
    // flag this product does not keep.
    const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).sort());
    expect(keys.join(',')).not.toMatch(/run|card|seen|beat/i);

    await context.close();
  });

  test('does not fire again for a run already paid off this session', async () => {
    const { context, id } = await launchExtension();
    const page = await walkToFirstCard(context, id);
    await page.getByRole('button', { name: S.runCardKeep, exact: true }).click();
    await page.waitForSelector('.flow[data-step-id]');

    // Back into the run just finished, and forward out of it again: the
    // applause does not replay for work that was already applauded.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Next', exact: true }).first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('.runcard')).toHaveCount(0);

    await context.close();
  });
});

/* BS-03a's micro-proof offer is REMOVED from the run card (Adam, 2026-08-28:
   "remove this link for now, I don't want to introduce the microproof just
   yet"), and the whole describe that stood here goes with it — its three
   tests walked sixteen real questions to My World's boundary for the sole
   purpose of meeting an offer that is no longer made. The card no longer
   appears there at all: the offer was also the reason My World got an
   exception to the run-length rule, and the exception went with it.

   `surfaces/MicroProof.tsx` and its unit tests stay. What went is the
   interruption, not the work. The surviving claim — the card is three doors
   and nothing competes with them — is asserted in "offers three real
   choices" above, where it belongs. */
