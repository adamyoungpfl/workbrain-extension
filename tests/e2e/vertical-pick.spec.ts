import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * V2.4 VB-108 — context_scope as a vertical pick list, on the real screen.
 *
 * What this file proves:
 *  - the treatment is the same .pillgroup grammar stood up (FLAG 5), so it
 *    really is rows: full-width, stacked, one drawn glyph per choice;
 *  - it stays chips + Next — picking never advances (the guardrail);
 *  - under prefers-reduced-motion the motion is gone and the information is
 *    not: same rows, same glyphs, same selected state.
 *
 * The walk-in seeds a passed gate (the V2.3 pattern), which lands the panel
 * straight on context_scope — the subject.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function openOnContextScope(
  opts: { reducedMotion?: 'reduce' } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
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
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: opts.reducedMotion });
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  // V2.4 VB-102: the browse canvas's Edit button sits mid-panel — park the
  // pointer so a stationary hover cannot hold a cue (ideas.spec precedent).
  await page.mouse.move(0, 0);
  await page.waitForSelector('.flow');
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
  return { context, page };
}

test.describe('the vertical pick list (VB-108)', () => {
  test('three rows, stacked, each with its drawn glyph — and the same pillgroup grammar', async () => {
    const { context, page } = await openOnContextScope();

    const group = page.locator('.flow .pillgroup');
    await expect(group).toHaveClass(/\bpillgroup-vertical\b/);

    const pills = page.locator('.flow .pillgroup .pill');
    await expect(pills).toHaveCount(3);
    await expect(pills.nth(0)).toHaveText('Work');
    await expect(pills.nth(1)).toHaveText('Personal');
    await expect(pills.nth(2)).toHaveText('Both');

    // Rows, not a wrap: every pill spans the same full track and each sits
    // wholly below the one before it.
    const boxes = [];
    for (let i = 0; i < 3; i++) boxes.push((await pills.nth(i).boundingBox())!);
    for (const box of boxes) expect(box.width).toBeGreaterThan(200);
    expect(boxes[1]!.y).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height);
    expect(boxes[2]!.y).toBeGreaterThanOrEqual(boxes[1]!.y + boxes[1]!.height);
    // And every row keeps the 44px floor.
    for (const box of boxes) expect(box.height).toBeGreaterThanOrEqual(44);

    // One decorative drawing per choice.
    for (let i = 0; i < 3; i++) {
      await expect(pills.nth(i).locator('.pill-glyph svg[aria-hidden="true"]')).toHaveCount(1);
    }

    await context.close();
  });

  test('stays chips + Next: picking selects, goes nowhere, and Next is the door (FLAG 5)', async () => {
    const { context, page } = await openOnContextScope();

    await page.locator('.flow .pillgroup .pill').first().click();
    await expect(page.locator('.flow .pillgroup .pill').first()).toHaveAttribute('aria-pressed', 'true');
    // No auto-advance (docs/GUARDRAILS.md).
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');

    await context.close();
  });

  test('reduced motion: the drift is gone, the information is not', async () => {
    const { context, page } = await openOnContextScope({ reducedMotion: 'reduce' });

    const pills = page.locator('.flow .pillgroup .pill');
    await expect(pills).toHaveCount(3);

    // The still version carries the whole instruction: rows, glyphs, labels…
    for (let i = 0; i < 3; i++) {
      await expect(pills.nth(i).locator('.pill-glyph svg')).toBeVisible();
    }
    // …with every animation actually off, row and glyph alike.
    const animations = await page.evaluate(() =>
      [...document.querySelectorAll('.pillgroup-vertical .pill, .pillgroup-vertical .pill-glyph svg')].map(
        (el) => getComputedStyle(el).animationName,
      ),
    );
    for (const name of animations) expect(name).toBe('none');

    // …and the selected state still reads: fill + checkmark, not motion.
    await pills.first().click();
    await expect(pills.first()).toHaveAttribute('aria-pressed', 'true');

    const scan = await new AxeBuilder({ page })
      .include('.flow')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);

    await context.close();
  });
});
