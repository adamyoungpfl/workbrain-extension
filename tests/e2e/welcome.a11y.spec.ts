import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V1.1 VB-01. The other a11y spec in this repo scans the component harness;
 * this one scans the real thing — the welcome screen as it actually renders
 * inside the packed extension, with empty storage.
 *
 * That distinction matters here specifically. The welcome state introduces
 * the one multi-colour element in the whole product (the brand mark) and the
 * one new type-scale entry (the wordmark), and both of those are exactly the
 * kind of thing that passes a unit test and fails a contrast check. It also
 * introduces the product's first screen a person meets with no prior context,
 * so its keyboard path has to be right on the first try.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function openWelcome(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  // Reduced motion so the scan reads the settled screen rather than a
  // mid-fade frame, whose transient opacity would make contrast unmeasurable
  // — the same reason components.a11y.spec.ts forces it for the sheet.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home-welcome');
  return { context, page };
}

/** The accessibility floor docs/GUARDRAILS.md actually commits to: WCAG 2.1
 * A and AA. Applied to the whole-panel scan below because the panel shell
 * (panel.html + App.tsx) has no `<main>` and no `<h1>`, which axe reports as
 * two *best-practice* findings against `<html>`. Both predate this screen and
 * belong to the shell, not to VB-01 — fixing them means restructuring every
 * surface's outer element, which is somebody's whole task and not a change to
 * smuggle in here. The `.home-welcome` scan right after runs with no tag
 * filter at all, so best-practice findings inside the new markup are still
 * caught. */
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('welcome screen — accessibility', () => {
  test('axe finds no WCAG A/AA violations anywhere on the panel in its welcome state', async () => {
    const { context, page } = await openWelcome();
    const results = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
    await context.close();
  });

  test('axe finds nothing at all — best practice included — inside the welcome lockup itself', async () => {
    const { context, page } = await openWelcome();
    const results = await new AxeBuilder({ page }).include('.home-welcome').analyze();
    expect(results.violations).toEqual([]);
    await context.close();
  });

  test('the CTA meets the 44x44 floor and every visible control on the screen does too', async () => {
    const { context, page } = await openWelcome();
    // Reachable controls only. FileActions keeps a visually-hidden 1px
    // `<input type="file">` in the tree, deliberately taken out of the tab
    // order and aria-hidden, that its own visible button opens on the
    // person's behalf — nobody can hit it, so a hit-target floor for it would
    // mean nothing. Everything a person can actually reach is measured.
    const controls = page.locator(
      ':is(button, a[href], input, textarea):not([tabindex="-1"]):not([aria-hidden="true"]):visible',
    );
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      const name = (await control.textContent())?.trim() || `#${i}`;
      const box = await control.boundingBox();
      expect(box, `"${name}" has no box (not rendered/visible)`).not.toBeNull();
      if (!box) continue;
      expect(box.width, `"${name}" width`).toBeGreaterThanOrEqual(44);
      expect(box.height, `"${name}" height`).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });

  test('a Tab pass reaches the CTA with a visible focus ring, and reaches it first', async () => {
    const { context, page } = await openWelcome();
    await page.keyboard.press('Tab');
    const cta = page.getByRole('button', { name: 'Start with a few questions', exact: true });
    // First tab stop on the screen: the one thing there is to do.
    await expect(cta).toBeFocused();
    // Read the *focused* element's own computed style — pressing Tab is what
    // puts it in :focus-visible, so this is the real ring, not a guess at one.
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const s = getComputedStyle(el);
      return {
        outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
        shadow: s.boxShadow !== 'none' && s.boxShadow !== '',
      };
    });
    expect(ring, 'Tab landed nowhere').not.toBeNull();
    expect(ring?.outline || ring?.shadow, 'the welcome CTA has no visible focus ring').toBe(true);
    await context.close();
  });

  test('the mark says nothing to a screen reader, and the name is real text instead', async () => {
    const { context, page } = await openWelcome();
    // Nothing in the mark is exposed: no role, no label, no title element.
    const mark = page.locator('svg.brand-mark');
    await expect(mark).toHaveAttribute('aria-hidden', 'true');
    await expect(mark.locator('title')).toHaveCount(0);
    // What is exposed is text, selectable and translatable.
    const wordmarkText = await page.locator('.home-welcome-wordmark').textContent();
    expect(wordmarkText).toBe('Workbrain');
    // And the section it heads is named by the headline, not by the picture.
    await expect(page.locator('.home-welcome')).toHaveAttribute('aria-labelledby', 'home-welcome-headline');
    await expect(page.locator('#home-welcome-headline')).toHaveText('Teach AI who you are, once.');
    await context.close();
  });
});
