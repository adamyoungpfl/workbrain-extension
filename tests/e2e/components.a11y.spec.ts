import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Scans tests/e2e/fixtures/harness.tsx, served by vite.harness.config.ts —
// see docs/RELEASE-1.md R1-03 accept criteria.
test.describe('component harness — accessibility', () => {
  test('axe finds no violations with the sheet closed', async ({ page }) => {
    await page.goto('/harness.html');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('axe finds no violations with the sheet open', async ({ page }) => {
    // Force reduced motion so the scan reads the settled state, not a
    // mid-slide-up-animation frame with transiently blended contrast.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness.html');
    await page.getByRole('button', { name: 'Open sheet' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });

  test('every control is at least 44x44, including icon buttons and pills', async ({ page }) => {
    // Reduced motion avoids measuring mid-slide-up-transform geometry.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness.html');
    await page.getByRole('button', { name: 'Open sheet' }).click();
    const controls = page.locator('button, input, textarea, [role="group"] .pill');
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await controls.nth(i).boundingBox();
      expect(box, `control #${i} has no box (not rendered/visible)`).not.toBeNull();
      if (!box) continue;
      expect(box.width, `control #${i} width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `control #${i} height`).toBeGreaterThanOrEqual(44);
    }
  });

  test('arrow keys move focus within a pill group', async ({ page }) => {
    await page.goto('/harness.html');
    const group = page.getByRole('group', { name: 'Work, home, or both?' });
    await group.getByRole('button', { name: 'Work' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('button', { name: 'Home' })).toBeFocused();
  });

  // V2.5 VB-118 — the tile grammar keeps the same roving contract
  // (core/choice/roving.ts), proven on its own group the same way.
  test('arrow keys move focus within the vertical pick tiles', async ({ page }) => {
    await page.goto('/harness.html');
    const group = page.getByRole('group', {
      name: 'Are we building this primarily for your work, personal life, or both?',
    });
    // Port 4300 is shared across checkouts and `reuseExistingServer` keeps
    // whichever harness got there first — during parallel fleets that can be
    // a checkout from before VB-118, whose harness has no tile group. The
    // REAL keyboard proof runs against this checkout's own dist in
    // vertical-pick.spec.ts either way; this harness copy only runs where
    // the served harness actually carries the section.
    test.skip((await group.count()) === 0, 'shared harness server predates VB-118');
    await group.getByRole('button', { name: 'Work' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(group.getByRole('button', { name: 'Personal' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(group.getByRole('button', { name: 'Work' })).toBeFocused();
  });

  test('focus is visible on every focusable element after a full Tab pass', async ({ page }) => {
    await page.goto('/harness.html');
    // :not([tabindex="-1"]) must apply to every clause, not just [tabindex] —
    // a roving-tabindex pill is still a <button>, so `button:not([disabled])`
    // alone would wrongly count pills the Tab key actually skips over.
    const focusable = page.locator(
      ':is(a[href], button:not([disabled]), textarea, input, select, [tabindex]):not([tabindex="-1"])',
    );
    const count = await focusable.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await page.keyboard.press('Tab');
      // docs/GUARDRAILS.md requires a visible ring, not specifically the CSS
      // `outline` property — Field's focus state uses box-shadow instead,
      // an explicitly sanctioned "equal replacement" for outline:none.
      const focusRing = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const style = getComputedStyle(el);
        const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
        const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
        return { visible: hasOutline || hasBoxShadow };
      });
      expect(focusRing, `tab stop #${i} landed nowhere`).not.toBeNull();
      expect(focusRing?.visible, `tab stop #${i} has neither a visible outline nor a box-shadow ring`).toBe(
        true,
      );
    }
  });

  test('reduced motion keeps the sheet visible but removes its slide-up animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/harness.html');
    await page.getByRole('button', { name: 'Open sheet' }).click();
    const card = page.locator('.sheet-card');
    await expect(card).toBeVisible();
    const animationName = await card.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe('none');
  });
});
