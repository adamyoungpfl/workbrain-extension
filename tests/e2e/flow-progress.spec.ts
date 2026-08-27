import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { questionCount } from '../../src/core/flow/runner';

/**
 * V1.1 VB-02 accept criteria (docs/V1.1-REFINEMENT.md): "no raw numbers
 * rendered; the bar still exposes aria-valuenow/aria-valuetext for assistive
 * tech even though nothing is printed on screen".
 *
 * FlowProgress.test.tsx proves the component in isolation. It cannot prove the
 * thing that actually matters: that the real panel, walking real questions,
 * shows the right module title, moves the bar, and never prints a count. This
 * repo has been bitten once by a feature that passed every unit test and was
 * broken in the browser (docs/TESTING.md), so this drives the built extension.
 *
 * Self-contained launch helpers, per this repo's one-spec-stands-alone
 * convention (see deep-dive.spec.ts and reflect.spec.ts).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const TOTAL = questionCount(contextModules);

async function launchPanel(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview now opens on the goal gate. This spec's
  // subject sits past it, so the walk-in seeds a passed gate — the same two
  // answers a person gives at minute one — and lands where it always did.
  // Write-once: a reopen through this path must never wipe what the panel
  // has written since.
  await sw.evaluate(async () => {
    const existing = await chrome.storage.local.get('wb:answers');
    if (existing['wb:answers']) return;
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      'wb:answers': {
        values: { goal_service: 'chatgpt', goal_want: 'Draft my Monday status update the way I would.' },
        repeatables: {},
        answeredAt: { goal_service: now, goal_want: now },
        reflectedAt: { goal_want: now },
      },
    });
  });
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
  return { context, page };
}

/* BS-05a deleted `fillWidth`. The interview's bar is five marks of a run
   now, not a fill of a global total, so there is no width to measure — the
   marks' three states are asserted by `data-state` instead. The bar itself
   survives on the proof loop, which has no runs, and FlowProgress.test.tsx
   covers its fill. */

test.describe('VB-02 — module title + progress bar', () => {
  test('the breadcrumb is gone: a module title and a bar, and no digit on screen', async () => {
    const { context, page } = await launchPanel();

    // V2.3 VB-90: the seeded walk-in skips the ladder and the gate.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');

    // The first module's own title, verbatim from the ported data.
    await expect(page.locator('.flowprogress-title')).toHaveText('Orientation');

    // The old eyebrow element and its string are both gone.
    await expect(page.locator('.flow-eyebrow')).toHaveCount(0);
    await expect(page.getByText(/Question \d+ of \d+/)).toHaveCount(0);

    // Nothing anywhere in the flow surface prints a number. Read from the
    // rendered text, so an `aria-valuetext` that leaked into the DOM as
    // visible content would fail here.
    const visible = (await page.locator('.flow').innerText()).trim();
    expect(visible).not.toMatch(/\d/);

    await context.close();
  });

  test('the row carries the RUN for assistive tech, and moves as the flow advances', async () => {
    const { context, page } = await launchPanel();

    /**
     * BS-05a (§5) — the spoken value is run-scoped now.
     *
     * V1.1 VB-02 kept the global count for screen-reader users because the
     * bar drew a fraction of it. The bar is five marks of a RUN, so the
     * spoken value says the same thing the marks do — and §5's rule is that
     * no global total appears anywhere, including out loud. A screen-reader
     * user gets exactly what everybody else gets, which is the point.
     */
    const bar = page.locator('.flowprogress[role="progressbar"]');
    await expect(bar).toHaveCount(1);
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    // Orientation is four askable questions — its slides are not questions —
    // so the run is four long and no total of thirty-eight is spoken.
    await expect(bar).toHaveAttribute('aria-valuemax', '4');
    await expect(bar).toHaveAttribute('aria-valuenow', '2');
    await expect(bar).toHaveAttribute('aria-valuetext', 'Two left in this run');
    await expect(bar).not.toHaveAttribute('aria-valuetext', new RegExp(String(TOTAL)));
    // Named, or a screen reader announces an anonymous bar.
    await expect(bar).toHaveAttribute('aria-label', 'Orientation');

    // Four marks, and the standing one is where the person is.
    await expect(page.locator('.flowprogress-beat')).toHaveCount(4);
    await expect(page.locator('.flowprogress-beat[data-state="here"]')).toHaveCount(1);

    // The choice question — answer it, and the run advances. (V2.5 VB-118:
    // context_scope's choices are icon tiles.)
    await page.locator('.flow .vpick .vpick-tile').first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');

    await expect(bar).toHaveAttribute('aria-valuenow', '3');
    await expect(bar).toHaveAttribute('aria-valuetext', 'One left in this run');
    await expect(page.locator('.flowprogress-beat[data-state="done"]')).toHaveCount(3);

    // Still the same module, so the title is unchanged — the bar is what
    // moved, which is the whole design.
    await expect(page.locator('.flowprogress-title')).toHaveText('Orientation');

    await context.close();
  });

  test('the title changes when the module does, and the bar survives a close/reopen', async () => {
    const { context, page } = await launchPanel();

    const titles: string[] = [];
    let guard = 0;
    // Walks far enough to cross out of Orientation into the next module.
    // Generous cap; the walk breaks the moment the title changes.
    while (guard++ < 12) {
      // textContent, not innerText: the title is styled `text-transform:
      // uppercase`, so innerText would compare against the CSS rendering
      // rather than against the module title the data actually carries.
      const title = (await page.locator('.flowprogress-title').textContent()) ?? '';
      if (!titles.includes(title)) titles.push(title);
      if (titles.length > 1) break;

      const textarea = page.locator('.flow textarea');
      const textInput = page.locator('.flow input.field');
      // VB-118: context_scope's choices are tiles — the walker knows both.
      const pills = page.locator('.flow .pillgroup .pill, .flow .vpick .vpick-tile');
      if (await textarea.count()) {
        await textarea.first().fill('A short answer for this question.');
      } else if (await textInput.count()) {
        await textInput.first().fill('Alex');
      } else if (await pills.count()) {
        await pills.first().click();
      }
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForSelector('.flow, .home');
      // The reflect screen is the same position, one extra confirmation.
      if ((await page.locator('.flow').getAttribute('data-position')) === 'reflect') {
        await page.getByRole('button', { name: 'Keep it as-is', exact: true }).click();
      }
    }

    expect(titles[0]).toBe('Orientation');
    expect(titles.length, 'never left the first module').toBeGreaterThan(1);
    expect(titles[1]).not.toBe('Orientation');
    await expect(page.locator('.flowprogress[role="progressbar"]')).toHaveAttribute(
      'aria-label',
      titles[1]!,
    );

    // Position is derived from wb:answers, never stored — so is the bar.
    // Reopening lands on the same question with the same reading.
    const valueTextBefore = await page
      .locator('.flowprogress[role="progressbar"]')
      .getAttribute('aria-valuetext');
    const titleBefore = (await page.locator('.flowprogress-title').textContent()) ?? '';
    const panelUrl = page.url();
    await page.close();

    const reopened = await context.newPage();
    await reopened.setViewportSize({ width: 400, height: 700 });
    await reopened.goto(panelUrl);
    await reopened.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await reopened.keyboard.press('Escape');
    await reopened.waitForSelector('.splash', { state: 'detached' });
    await reopened.getByRole('button', { name: /^Context\.md/ }).click();
    // V1.7 VB-37: the file row opens the FILE, and the file view is where the
    // interview is entered from — see src/panel/surfaces/FileView.tsx.
    await reopened.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await reopened.waitForSelector('.flow');

    await expect(reopened.locator('.flowprogress-title')).toHaveText(titleBefore);
    await expect(reopened.locator('.flowprogress[role="progressbar"]')).toHaveAttribute(
      'aria-valuetext',
      valueTextBefore!,
    );

    await context.close();
  });
});
