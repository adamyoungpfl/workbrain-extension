import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * V1.2 VB-14a. The globe is the one dark surface in a light product, and the
 * one control in it that a person operates by dragging. Both of those are
 * places an accessibility floor gets quietly lost, so they are checked here
 * rather than argued about.
 *
 * Scans tests/e2e/fixtures/brain-globe.tsx, served by vite.harness.config.ts.
 */
test.describe('Brain globe — accessibility', () => {
  test('axe finds no violations, at rest and flown in', async ({ page }) => {
    // Reduced motion so the scan reads settled state rather than a mid-turn
    // frame with transiently blended contrast — the same reason the sheet
    // scan in components.a11y.spec.ts does it.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/brain-globe.html');
    await page.waitForSelector('.brainglobe');

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

    await page.locator('.brainglobe-pin[data-section-id="sec1"]').click();
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-inside', 'true');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  /**
   * V1.4 VB-23. The split is where an accessibility floor would most easily be
   * lost: it adds a scrolling box, a heading level, a description list and a
   * control that grows past its own hit target, all at 400px wide and all on
   * the one dark surface in the product.
   */
  test('axe finds no violations with the stage split', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/brain-globe.html');
    await page.waitForSelector('.brainglobe');

    // About Me, then its longest sub-section — thirteen cells, three record
    // headings, and a panel that has to scroll.
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-split', '1.000');
    await expect(page.locator('.brainglobe-detail-cell')).toHaveCount(13);

    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('every control on the stage is at least 44 x 44', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/brain-globe.html');
    await page.waitForSelector('.brainglobe');

    const check = async (where: string) => {
      const controls = page.locator('.brainglobe button:not([hidden])');
      const count = await controls.count();
      expect(count, where).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = (await controls.nth(i).boundingBox())!;
        expect(box, `${where}: control #${i} has no box`).not.toBeNull();
        expect(box.width, `${where}: control #${i} width`).toBeGreaterThanOrEqual(44);
        expect(box.height, `${where}: control #${i} height`).toBeGreaterThanOrEqual(44);
      }
    };

    await check('at rest');

    // V1.4 VB-23: and again with the stage split, where the featured sub-node
    // is a ~60px orb whose hit target grew with it.
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-split', '1.000');
    await check('with the stage split');
  });

  test('the split names itself, and its detail panel is reachable by keyboard', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/brain-globe.html');
    await page.waitForSelector('.brainglobe');

    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();

    // A named region, not an unlabelled box — and a real tab stop, because it
    // scrolls (axe's `scrollable-region-focusable`, WCAG 2.1.1).
    await expect(page.getByRole('region', { name: "What's in 2.1 Roles" })).toHaveCount(1);
    await expect(page.locator('.brainglobe-detail')).toHaveAttribute('tabindex', '0');

    // The sub-node says it is open, in words rather than by position. Its name
    // is the short one V1.5 VB-26 prints on the stage — a control's accessible
    // name has to contain the words on it (WCAG 2.5.3) — and the section's real
    // name is on the same button's `title`.
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toHaveAttribute('aria-label', 'Roles');
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toHaveAttribute('title', '2.1 Roles');
  });

  test('every section is named, and named with its state — never by colour alone', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/brain-globe.html');
    await page.waitForSelector('.brainglobe');

    const named = await page
      .locator('.brainglobe-pin[data-section-id]')
      .evaluateAll((pins) =>
        pins.map((pin) => ({
          name: pin.getAttribute('aria-label') ?? '',
          title: pin.getAttribute('title') ?? '',
          shown: pin.querySelector('.brainglobe-label')?.textContent ?? '',
        })),
      );
    expect(named).toHaveLength(10);
    for (const pin of named) {
      // V1.5 VB-26: the name is the short one printed on the node, plus the
      // state in words. The file's real section name — the numbered one — is
      // still there, as the node's `title`.
      expect(pin.name).toMatch(/^[A-Z].* — (Writing now|Written|Not yet)$/);
      expect(pin.name).toContain(pin.shown);
      expect(pin.title).toMatch(/^\d+(\.\d+)?\. .+/);
    }

    // The picture itself is hidden from assistive tech: it says the same
    // things with shapes, and the names above are what carries them.
    await expect(page.locator('.brainglobe svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('group', { name: 'Your file, as a globe' })).toHaveCount(1);
  });
});
