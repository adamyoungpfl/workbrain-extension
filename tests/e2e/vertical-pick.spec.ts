import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page } from '@playwright/test';

/**
 * V2.4 VB-108, rebuilt by V2.5 VB-118 — context_scope as icon tiles, on the
 * real screen.
 *
 * What this file proves:
 *  - the treatment is the VB-118 tile grammar (`.vpick`): free-standing
 *    glyph, label and radio mark per choice, three across, 44px floor held;
 *  - it stays chips + Next — picking never advances (the guardrail);
 *  - keyboard: the roving tabindex answers the arrows, Space selects;
 *  - under prefers-reduced-motion the motion is gone and the information is
 *    not: same tiles, same glyphs, same selected state — with an axe pass.
 *
 * The walk-in seeds a passed gate (the V2.3 pattern), which lands the panel
 * straight on context_scope — the subject.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function openOnContextScope(
  opts: { reducedMotion?: 'reduce' } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  // reducedMotion rides the CONTEXT, not an emulateMedia after load — the
  // preference has to be true before the panel mounts, because mount is when
  // motion-reading code reads it (V2.5 house rule; brain-globe.a11y precedent).
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}),
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

test.describe('the vertical pick tiles (VB-118)', () => {
  test('three tiles, each a free-standing glyph + label + radio mark, on the 44px floor', async () => {
    const { context, page } = await openOnContextScope();

    const group = page.locator('.flow .vpick');
    await expect(group).toHaveCount(1);
    // VB-118 replaced VB-108's stood-up pills — the old posture is gone.
    await expect(page.locator('.flow .pillgroup')).toHaveCount(0);

    const tiles = page.locator('.flow .vpick .vpick-tile');
    await expect(tiles).toHaveCount(3);
    await expect(tiles.nth(0)).toHaveText('Work');
    await expect(tiles.nth(1)).toHaveText('Personal');
    await expect(tiles.nth(2)).toHaveText('Both');

    // The claim below is about the SETTLED layout — wait out the staggered
    // entrance (vpick-arrive translates each tile up into place; measured
    // mid-flight under machine load, a later tile still carries a few px of
    // translateY and the baseline assertion reads the animation, not the
    // design). Settled means every tile's computed transform is identity.
    await expect
      .poll(async () =>
        page.evaluate(() =>
          [...document.querySelectorAll('.vpick .vpick-tile')].every(
            (el) => getComputedStyle(el).transform === 'none',
          ),
        ),
      )
      .toBe(true);

    // Tiles, not rows: the three stand side by side on one baseline.
    const boxes = [];
    for (let i = 0; i < 3; i++) boxes.push((await tiles.nth(i).boundingBox())!);
    expect(boxes[1]!.x).toBeGreaterThanOrEqual(boxes[0]!.x + boxes[0]!.width);
    expect(boxes[2]!.x).toBeGreaterThanOrEqual(boxes[1]!.x + boxes[1]!.width);
    for (const box of boxes) {
      expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThan(2);
      // Every tile keeps the 44px floor, both axes.
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }

    // One decorative drawing and one radio mark per choice — and the mark
    // adds no words: the label is the whole accessible name.
    for (let i = 0; i < 3; i++) {
      await expect(tiles.nth(i).locator('.vpick-glyph svg[aria-hidden="true"]')).toHaveCount(1);
      await expect(tiles.nth(i).locator('.vpick-radio[aria-hidden="true"]')).toHaveCount(1);
    }

    // Deliberately not a button-look: no border and no fill at rest.
    const rest = await tiles.nth(0).evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderStyle, background: s.backgroundColor };
    });
    expect(rest.border).toBe('none');
    expect(rest.background).toBe('rgba(0, 0, 0, 0)');

    await context.close();
  });

  test('stays chips + Next: picking selects, goes nowhere, and Next is the door', async () => {
    const { context, page } = await openOnContextScope();

    await page.locator('.flow .vpick .vpick-tile').first().click();
    await expect(page.locator('.flow .vpick .vpick-tile').first()).toHaveAttribute('aria-pressed', 'true');
    // No auto-advance (docs/GUARDRAILS.md).
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');

    await context.close();
  });

  test('the keyboard is the whole path: arrows rove, Space selects, Next commits', async () => {
    const { context, page } = await openOnContextScope();

    const tiles = page.locator('.flow .vpick .vpick-tile');
    await tiles.first().focus();
    // Arrows run both axes (core/choice/roving.ts) — Down and Right both step.
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Personal');
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Both');
    await page.keyboard.press('Home');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Work');

    await page.keyboard.press('Space');
    await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');

    // The focus ring is visible — a real computed outline, not outline: none.
    const outline = await tiles.first().evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');

    await context.close();
  });

  test('reduced motion: the drift is gone, the information is not — and axe is clean', async () => {
    const { context, page } = await openOnContextScope({ reducedMotion: 'reduce' });

    const tiles = page.locator('.flow .vpick .vpick-tile');
    await expect(tiles).toHaveCount(3);

    // The still version carries the whole instruction: tiles, glyphs, marks…
    for (let i = 0; i < 3; i++) {
      await expect(tiles.nth(i).locator('.vpick-glyph svg')).toBeVisible();
      await expect(tiles.nth(i).locator('.vpick-radio')).toBeVisible();
    }
    // …with every animation actually off, tile and glyph alike.
    const animations = await page.evaluate(() =>
      [...document.querySelectorAll('.vpick .vpick-tile, .vpick .vpick-glyph svg')].map(
        (el) => getComputedStyle(el).animationName,
      ),
    );
    for (const name of animations) expect(name).toBe('none');

    // …and the selected state still reads: the radio dot is painted scale(1),
    // not left mid-transition — the mark, not motion, says what is picked.
    await tiles.first().click();
    await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
    const dot = await tiles
      .first()
      .locator('.vpick-radio')
      .evaluate((el) => getComputedStyle(el, '::after').transform);
    expect(dot).toBe('matrix(1, 0, 0, 1, 0, 0)');

    const scan = await new AxeBuilder({ page })
      .include('.flow')
      .exclude('.app-ground')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);

    await context.close();
  });
});
