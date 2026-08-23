import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * V1.5 VB-27 — the accessibility floor for content that appears on hover.
 *
 * docs/V1.5-REFINEMENT.md names this the most likely accessibility failure in
 * the batch, and it is: a card that appears when a pointer passes over a node
 * is, by default, invisible to a keyboard, absent on a touch screen and
 * impossible to dismiss. So the three ways in are each proved on their own in
 * tests/e2e/node-summary.spec.ts, and what is checked here is the floor around
 * them — axe with the card open, the 44px targets it floats over, and the fact
 * that it adds no tab stop and steals no focus.
 *
 * Scans tests/e2e/fixtures/brain-globe.tsx in its `rich` model, at 400px.
 */

const PANEL = { width: 400, height: 700 };

async function insideAboutMe(page: import('@playwright/test').Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PANEL);
  await page.goto('/brain-globe.html?model=rich');
  await page.waitForSelector('.brainglobe');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('.brainglobe')).toHaveAttribute('data-inside', 'true');
  await expect(page.locator('.brainglobe-child-node')).toHaveCount(5);
}

test.describe('VB-27 — the node summary, accessibility', () => {
  test('axe finds no violations with a summary open, by pointer or by keyboard', async ({ page }) => {
    await insideAboutMe(page);

    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').hover();
    await expect(page.locator('.nodesummary')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    // And again on the keyboard's own path, where the card is also the focused
    // node's description.
    await page.mouse.move(2, 2);
    await page.keyboard.press('Tab');
    await expect(page.locator('.nodesummary')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the card names nothing and steals nothing: no tab stop, no focus, no live region', async ({ page }) => {
    await insideAboutMe(page);
    await page.keyboard.press('Tab');
    const card = page.locator('.nodesummary');
    await expect(card).toBeVisible();

    const shape = await card.evaluate((el) => ({
      focusables: el.querySelectorAll('a, button, input, select, textarea, [tabindex], [contenteditable]').length,
      tabindex: el.getAttribute('tabindex'),
      live: el.getAttribute('aria-live'),
      role: el.getAttribute('role'),
      scrolls: el.scrollHeight > el.clientHeight,
    }));
    // Nothing focusable inside, so there is nothing to trap; no `aria-live`,
    // because a description somebody went and asked for is not an event; and
    // it does not scroll, so it never needs to become a tab stop of its own
    // (axe's `scrollable-region-focusable`, WCAG 2.1.1).
    expect(shape).toEqual({ focusables: 0, tabindex: null, live: null, role: 'tooltip', scrolls: false });

    // Focus is still on the node the card describes — the card never took it.
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toBeFocused();
  });

  test('every control on the stage is still at least 44 x 44 with a card floating over it', async ({ page }) => {
    await insideAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').hover();
    await expect(page.locator('.nodesummary')).toBeVisible();

    const controls = page.locator('.brainglobe button:not([hidden])');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = (await controls.nth(i).boundingBox())!;
      expect(box.width, `control #${i} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `control #${i} height`).toBeGreaterThanOrEqual(44);
    }
  });

  /**
   * The card covers a third of a stage full of 44px targets. If it swallowed
   * their clicks, describing a node would have broken the globe underneath it
   * — so it is transparent to the pointer, and the node beneath a card is
   * still a node that can be pressed.
   */
  test('a node underneath the card is still reachable and still works', async ({ page }) => {
    await insideAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').hover();
    const card = (await page.locator('.nodesummary').boundingBox())!;

    const covered = await page.locator('.brainglobe-pin.is-child').evaluateAll(
      (pins, box) =>
        pins
          .map((el) => ({ id: el.getAttribute('data-child-id')!, rect: el.getBoundingClientRect() }))
          .filter(
            ({ rect }) =>
              rect.left < box.x + box.width &&
              box.x < rect.right &&
              rect.top < box.y + box.height &&
              box.y < rect.bottom,
          )
          .map(({ id }) => id),
      card,
    );
    // The layout only means anything if something really is underneath it.
    expect(covered.length).toBeGreaterThan(0);

    const target = covered[0]!;
    await page.locator(`.brainglobe-pin[data-child-id="${target}"]`).click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    await expect(page.locator('.brainglobe-detail')).toHaveAttribute('data-detail-id', target);
  });
});
