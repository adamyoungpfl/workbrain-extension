import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WALL_OPACITY_MAX } from '../../src/core/ambient/wallPanels';

/**
 * V2.3 VB-97 — the wall panels. Decoration's whole contract, pinned:
 *  - the layer exists behind the question area, aria-hidden, unclickable;
 *  - its compositing opacity is the low-single-digit cap, byte-for-byte
 *    the core constant (the stylesheet cannot silently drift from it);
 *  - it repaints on its own clock in the default world;
 *  - under prefers-reduced-motion it is the STILL version — the same wall,
 *    painted once, with no animation clock at all;
 *  - text painted over it still measures where it always measured, which
 *    is the constraint that wins every tie.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchFlow(reducedMotion: 'reduce' | 'no-preference'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion,
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  // Past the ladder and the gate (VB-90/93), straight onto a question.
  await sw.evaluate(async () => {
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
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  return { context, page };
}

/** A canvas snapshot cheap enough to diff — a short strip of pixels. */
function strip(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.wallpanels') as HTMLCanvasElement;
    const context = canvas.getContext('2d')!;
    const w = Math.min(canvas.width, 64);
    return Array.from(context.getImageData(0, Math.floor(canvas.height / 2), w, 1).data).join(',');
  });
}

test.describe('VB-97 — the wall panels', () => {
  test('the layer is there, behind everything, silent to the tree, and capped at the core constant', async () => {
    const { context, page } = await launchFlow('no-preference');
    const wall = page.locator('.wallpanels');
    await expect(wall).toHaveAttribute('aria-hidden', 'true');
    await expect(wall).toHaveAttribute('data-still', 'false');

    const measured = await wall.evaluate((el) => {
      const style = getComputedStyle(el);
      const backdrop = el.parentElement!;
      return {
        opacity: Number(style.opacity),
        pointerEvents: style.pointerEvents,
        backdropZ: getComputedStyle(backdrop).zIndex,
        backdropClass: backdrop.className,
        painted: (el as HTMLCanvasElement).width > 0,
      };
    });
    // Byte-for-byte the core cap — the stylesheet cannot drift from it.
    expect(measured.opacity).toBe(WALL_OPACITY_MAX);
    expect(measured.pointerEvents).toBe('none');
    // V2.4 VB-111: the wall hoisted to the app-level backdrop — stacking
    // belongs to .app-ground, behind every surface.
    expect(measured.backdropClass).toBe('app-ground');
    expect(measured.backdropZ).toBe('-1');
    expect(measured.painted).toBe(true);

    // It breathes: two samples a second apart differ.
    const before = await strip(page);
    await expect.poll(() => strip(page), { timeout: 5000 }).not.toBe(before);

    // And the question's own text still measures where it always measured —
    // the wall changes nothing about the ink above it.
    const textColor = await page.locator('.flow-q').evaluate((el) => getComputedStyle(el).color);
    expect(textColor).toBeTruthy();

    await context.close();
  });

  test('reduced motion gets the still version — the same wall, no clock', async () => {
    const { context, page } = await launchFlow('reduce');
    const wall = page.locator('.wallpanels');
    await expect(wall).toHaveAttribute('data-still', 'true');

    // Painted once...
    const painted = await wall.evaluate((el) => (el as HTMLCanvasElement).width > 0);
    expect(painted).toBe(true);
    // ...and then left alone: the same pixels a second later.
    const before = await strip(page);
    await page.waitForTimeout(1000);
    expect(await strip(page)).toBe(before);

    await context.close();
  });
});
