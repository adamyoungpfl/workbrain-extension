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

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

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
  await page.getByRole('button', { name: /^Start with a few questions/ }).click();
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

/* ── BS-03a (§3) — the micro-proof, offered once ───────────────────────────
   Adam's P4, revised at build time: the second run boundary cannot carry it,
   because `entities` and `initiatives_records` are asked in the two modules
   AFTER About Me. The end of My World is the first boundary at which a
   person has named somebody — and a name coming back is the whole effect. */
test.describe('BS-03a — the micro-proof', () => {
  // Sixteen questions of real walking each; serial, with room on the clock.
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  /**
   * Walks the real interview to My World's boundary — sixteen questions.
   *
   * Seeding it instead was tried and abandoned: a derived seed cannot stop
   * at `entities_gate`, because the roles block's add-another intercepts
   * first and the browser re-offers it with an empty declined set. The walk
   * is slower and it is honest, which is why these three run serially with
   * room on the clock rather than racing four other workers for a CPU.
   */
  async function walkToOffer(context: BrowserContext, id: string) {
    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 760 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await page.getByRole('button', { name: /^Start with a few questions/ }).click();
    await page.waitForSelector('.flow');

    for (let i = 0; i < 80; i++) {
      // The question types itself in (V1.2 VB-10) and a card mounts after a
      // commit; read the screen settled, not mid-arrival.
      await page.waitForTimeout(160);

      // The CARD is checked before anything else, and the OFFER before the
      // card's own dismissal — the first draft of this walk dismissed every
      // card blind and could never have found the one it was looking for.
      if (await page.locator('.runcard').count()) {
        if (await page.locator('.runcard-offer').count()) return page;
        await page.getByRole('button', { name: S.runCardKeep, exact: true }).click();
        continue;
      }

      const position = await page.locator('.flow').getAttribute('data-position');
      if (position === 'add-another') {
        await page.getByRole('button', { name: 'No', exact: true }).click();
        // React commits the selection on its own schedule; pressing Next in
        // the same tick submits an empty choice and the screen stands still.
        await page.waitForTimeout(140);
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        continue;
      }

      // The tour's slides carry their own advance (V2.5 VB-114).
      const advance = page.locator('.tourslide-advance').first();
      if (await advance.count()) {
        await advance.click();
        continue;
      }

      // V2.5 VB-123: the merged role screen asks two tile facets at once, so
      // a walker that clicks one tile answers half a question.
      const facets = page.locator('.flow .vpick');
      const facetCount = await facets.count();
      for (let g = 0; g < facetCount; g++) {
        await facets.nth(g).locator('.vpick-tile').first().click();
      }

      const field = page.locator('.flow textarea, .flow input:not([type=checkbox]):not([type=number])').first();
      // Every text answer is the same name, so whatever the ladder reaches
      // for in My World, it reaches for somebody this walk really named.
      if (await field.count()) await field.fill('Priya');

      const choice = page.locator('.flow .pill:not(.pill-add), .flow .orbchoice:not(.orbchoice-add), .flow .dline-opt').first();
      if (!(await field.count()) && !facetCount && (await choice.count())) await choice.click();

      await page.getByRole('button', { name: 'Next', exact: true }).click().catch(() => {});
    }
    throw new Error('never reached the micro-proof offer');
  }

  test('is offered at the end of My World, and sends a task built from a real name', async () => {
    const { context, id } = await launchExtension();
    const page = await walkToOffer(context, id);

    // My World is TWO questions, so it earns no card by length — the offer
    // is what makes this boundary worth interrupting for.
    await expect(page.locator('.runcard-title')).toContainText('My World');
    await expect(page.locator('.runcard-offer')).toBeVisible();

    await page.getByRole('button', { name: S.microOfferGo, exact: true }).click();
    await expect(page.locator('.microproof')).toBeVisible();

    // One errand: a prompt to copy and a box to paste into. No baseline, no
    // second condition, nothing to score.
    await expect(page.locator('.microproof .readonly')).toHaveCount(1);
    const prompt = (await page.locator('.microproof .readonly').textContent()) ?? '';
    // The file rides inside it, exactly as the real proof does (BS-03b).
    expect(prompt).toContain('System Grounding Rule');
    // …and the task leans on somebody they actually named.
    expect(prompt).toContain('Priya');
    // The panel only ever promises a name it really put in the prompt.
    await expect(page.locator('.microproof-look')).toContainText('Priya');

    await context.close();
  });

  test('stores nothing at all — it is a demonstration, not a measurement', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await walkToOffer(context, id);
    await page.getByRole('button', { name: S.microOfferGo, exact: true }).click();
    await page.locator('#microproof-paste').fill('What the AI wrote back, with Priya in the first line.');
    await expect(page.locator('.microproof-done')).toBeVisible();
    await page.getByRole('button', { name: S.microBack, exact: true }).click();
    // Back to wherever the interview already was — which may be a module
    // transition, so wait for the errand to close rather than for a step id.
    await page.locator('.microproof').waitFor({ state: 'detached' });

    // No report, and nothing about the errand anywhere: a demonstration that
    // files a report about itself is measurement wearing a costume.
    const stored = await sw.evaluate(async () => await chrome.storage.local.get(null));
    expect(stored['wb:report']).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain('What the AI wrote back');
    expect(JSON.stringify(stored)).not.toMatch(/micro/i);

    await context.close();
  });

  test('is offered once — taking it or leaving it, it does not come back', async () => {
    const { context, id } = await launchExtension();
    const page = await walkToOffer(context, id);
    // Decline it: keep going without taking the errand.
    await page.getByRole('button', { name: S.runCardKeep, exact: true }).click();
    await page.locator('.runcard').waitFor({ state: 'detached' });

    // Walk on through the next boundaries; the offer never returns.
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(140);
      expect(await page.locator('.runcard-offer').count()).toBe(0);
      if (await page.locator('.runcard').count()) {
        await page.getByRole('button', { name: S.runCardKeep, exact: true }).click();
        continue;
      }
      const field = page.locator('.flow textarea, .flow input:not([type=checkbox]):not([type=number])').first();
      if (await field.count()) await field.fill('An answer.');
      const facets2 = page.locator('.flow .vpick');
      if (await facets2.count()) {
        for (let g = 0; g < (await facets2.count()); g++) {
          await facets2.nth(g).locator('.vpick-tile').first().click();
        }
      }
      const choice = page.locator('.flow .pill:not(.pill-add), .flow .dline-opt').first();
      if ((await choice.count()) && !(await field.count())) await choice.click();
      const next = page.getByRole('button', { name: 'Next', exact: true }).first();
      if (await next.count()) await next.click();
      else break;
    }

    await context.close();
  });
});
