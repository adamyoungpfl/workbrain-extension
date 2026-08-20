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
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
  return { context, page };
}

/** The rendered width of the fill, in CSS pixels — what a person actually
 * sees, not the inline style string the unit test already covers. */
async function fillWidth(page: Page): Promise<number> {
  const box = await page.locator('.flowprogress-fill').boundingBox();
  expect(box, 'the progress fill is not rendered').not.toBeNull();
  return box!.width;
}

test.describe('VB-02 — module title + progress bar', () => {
  test('the breadcrumb is gone: a module title and a bar, and no digit on screen', async () => {
    const { context, page } = await launchPanel();

    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');

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

  test('the bar carries the count for assistive tech, and moves as the flow advances', async () => {
    const { context, page } = await launchPanel();

    const bar = page.locator('.flowprogress[role="progressbar"]');
    await expect(bar).toHaveCount(1);
    await expect(bar).toHaveAttribute('aria-valuemin', '0');
    await expect(bar).toHaveAttribute('aria-valuemax', String(TOTAL));
    await expect(bar).toHaveAttribute('aria-valuenow', '1');
    await expect(bar).toHaveAttribute('aria-valuetext', `Question 1 of ${TOTAL}`);
    // Named, or a screen reader announces an anonymous bar.
    await expect(bar).toHaveAttribute('aria-label', 'Orientation');

    const firstWidth = await fillWidth(page);

    // Q1 is the intro — Next alone advances it.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');

    await expect(bar).toHaveAttribute('aria-valuenow', '2');
    await expect(bar).toHaveAttribute('aria-valuetext', `Question 2 of ${TOTAL}`);
    expect(await fillWidth(page)).toBeGreaterThan(firstWidth);

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
      const pills = page.locator('.flow .pillgroup .pill');
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
    await reopened.getByRole('button', { name: /Context\.md/ }).click();
    await reopened.waitForSelector('.flow');

    await expect(reopened.locator('.flowprogress-title')).toHaveText(titleBefore);
    await expect(reopened.locator('.flowprogress[role="progressbar"]')).toHaveAttribute(
      'aria-valuetext',
      valueTextBefore!,
    );

    await context.close();
  });
});
