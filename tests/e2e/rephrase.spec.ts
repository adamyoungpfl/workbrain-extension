import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { Step } from '../../src/schema/flow.types';
import { S } from '../../src/panel/strings';

/**
 * V1.1 VB-04: the rephrase trigger is now an icon-button beside the question
 * heading rather than a quiet text button below the answer area. A glyph with
 * no text is exactly the kind of control that passes a unit test and fails a
 * real person, so this asserts the four things that actually make it usable —
 * it is reachable by keyboard, it has a real accessible name, it meets the
 * 44x44 floor, and pressing it still cycles the wording — against the real
 * ported interview data, not a fixture.
 *
 * Same launchPersistentContext pattern as flow.spec.ts (see docs/TESTING.md):
 * Playwright can't open Chrome's own side-panel chrome, so panel.html is
 * driven as an ordinary extension page at a 400px viewport.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The first question in the real data carrying `rephrasings`, and how many
 * it carries — asserted against the source rather than hard-coded, so this
 * test fails loudly if the content is re-ported differently rather than
 * quietly testing a question that no longer has alternates. */
const SCOPE_STEP = contextModules
  .flatMap((m) => m.nodes)
  // 'fields' in node distinguishes a RepeatableBlock from a Step — the same
  // narrowing core/flow/runner.ts uses when it walks a module's nodes.
  .filter((node): node is Step => !('fields' in node))
  .find((step) => step.id === 'context_scope');

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

/** Q1 is the intro (`orientation_ready`); Next alone advances it, landing on
 * `context_scope` — the first question with rephrasings. */
async function goToRephrasableQuestion(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
}

/** Tabs from the top of the document until `locator` holds focus. Returns the
 * number of Tab presses it took, so a caller can assert it was reached at all
 * rather than merely being focusable via .focus(). */
async function tabUntilFocused(page: Page, selector: string, max = 25): Promise<number> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    const onTarget = await page.evaluate(
      (sel) => !!document.activeElement?.matches(sel),
      selector,
    );
    if (onTarget) return i;
  }
  throw new Error(`"${selector}" was never reached after ${max} Tab presses`);
}

test.describe('Rephrase icon-button (VB-04)', () => {
  test('is keyboard-reachable, named, ≥44x44, and cycles the question wording', async () => {
    expect(SCOPE_STEP, 'context_scope should exist in the ported data').toBeTruthy();
    const rephrasings = SCOPE_STEP?.rephrasings ?? [];
    expect(rephrasings.length, 'context_scope should still carry rephrasings').toBeGreaterThan(0);

    const { context, page } = await launchPanel();
    await goToRephrasableQuestion(page);

    // 1 — a real accessible name, not a bare glyph. getByRole resolves the
    //     name the same way an assistive tech would, so this passing *is*
    //     the assertion that aria-label carries S.rephrase's text.
    const button = page.getByRole('button', { name: S.rephrase, exact: true });
    await expect(button).toBeVisible();
    // The glyph itself is decorative and must not leak into that name.
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');

    // 2 — the 44x44 floor, even though the glyph is 17px.
    const box = await button.boundingBox();
    expect(box, 'the rephrase button should be rendered').not.toBeNull();
    expect(box!.width, 'rephrase button width').toBeGreaterThanOrEqual(44);
    expect(box!.height, 'rephrase button height').toBeGreaterThanOrEqual(44);

    // 3 — reachable by Tab, with a visible focus ring when it lands.
    await tabUntilFocused(page, '.flow-rephrase');
    await expect(button).toBeFocused();
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
      return hasOutline || hasBoxShadow;
    });
    expect(ring, 'the focused rephrase button should show a visible ring').toBe(true);

    // 4 — activating it from the keyboard still cycles the wording, exactly as
    //     the old text button did: base -> each rephrasing -> back to base.
    const heading = page.locator('.flow-q');
    const base = (await heading.textContent())?.trim();
    expect(base).toBeTruthy();

    const seen: string[] = [];
    for (let i = 0; i < rephrasings.length; i++) {
      await page.keyboard.press('Enter');
      const shown = (await heading.textContent())?.trim() ?? '';
      expect(shown, `rephrasing ${i + 1} should differ from the base question`).not.toBe(base);
      expect(seen, `rephrasing ${i + 1} should differ from the earlier ones`).not.toContain(shown);
      seen.push(shown);
    }

    // One more press wraps back to the original phrasing.
    await page.keyboard.press('Enter');
    await expect(heading).toHaveText(base!);

    // The heading itself is still a plain heading — the button next to it must
    // not have been folded into the question's own accessible name.
    await expect(page.getByRole('heading', { name: base!, exact: true })).toBeVisible();

    await context.close();
  });

  test('a question without rephrasings shows no rephrase control', async () => {
    const { context, page } = await launchPanel();
    // Q1, the intro, has no rephrasings.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');
    await expect(page.locator('.flow-rephrase')).toHaveCount(0);
    await context.close();
  });
});
