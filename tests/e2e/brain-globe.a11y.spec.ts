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

  test('every control on the stage is at least 44 x 44', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/brain-globe.html');
    await page.waitForSelector('.brainglobe');

    const controls = page.locator('.brainglobe button:not([hidden])');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = (await controls.nth(i).boundingBox())!;
      expect(box, `control #${i} has no box`).not.toBeNull();
      expect(box.width, `control #${i} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `control #${i} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('every section is named, and named with its state — never by colour alone', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto('/brain-globe.html');
    await page.waitForSelector('.brainglobe');

    const names = await page
      .locator('.brainglobe-pin[data-section-id]')
      .evaluateAll((pins) => pins.map((pin) => pin.getAttribute('aria-label') ?? ''));
    expect(names).toHaveLength(10);
    for (const name of names) expect(name).toMatch(/^\d+\. .+ — (Writing now|Written|Not yet)$/);

    // The picture itself is hidden from assistive tech: it says the same
    // things with shapes, and the names above are what carries them.
    await expect(page.locator('.brainglobe svg')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('group', { name: 'Your file, as a globe' })).toHaveCount(1);
  });
});
