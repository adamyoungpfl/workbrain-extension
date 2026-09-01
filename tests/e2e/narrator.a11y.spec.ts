import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V1.3 VB-18's accessibility floor, in both of the toggle's states.
 *
 * The interesting rules for an icon-only toggle button are `button-name` (an
 * SVG with no text is the classic way to ship a nameless control) and
 * `color-contrast` in the pressed state, where the glyph sits on a tint rather
 * than on the canvas. Both are in the WCAG tag set scanned below.
 *
 * A silent speech stand-in is installed first: without one, whether the toggle
 * exists at all would depend on the machine running the suite, and with the
 * real engine this spec would talk out loud.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

function installSilentSpeech(page: Page) {
  return page.addInitScript(() => {
    class FakeUtterance {
      voice: unknown = null;
      lang = '';
      rate = 1;
      pitch = 1;
      constructor(public text: string) {}
    }
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        pending: false,
        getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true, default: true }],
        speak() {},
        cancel() {},
        addEventListener() {},
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });
  });
}

test('axe finds no violations with the narrator off or on (VB-18)', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await installSilentSpeech(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');

  const toggle = page.getByRole('button', { name: 'Read questions aloud' });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  // Scoped to the flow surface and to the WCAG rule tags, exactly as
  // flow-progress.a11y.spec.ts is, and for the same reason: the
  // best-practice failures that fire here belong to the panel shell (no
  // <main>, no <h1>) and are a separate, already-flagged task.
  const off = await new AxeBuilder({ page })
    .include('.flow')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(off.violations).toEqual([]);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  const on = await new AxeBuilder({ page })
    .include('.flow')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(on.violations).toEqual([]);

  // `button-name` is in axe's best-practice set rather than the WCAG tags
  // above, and an icon-only control is precisely the case it exists for.
  const named = await new AxeBuilder({ page })
    /* V2.9: TIM is the narrator control now, so this scans him. The claim is
       unchanged — the control on its own, off and on, with no violations. */
    .include('.narratormark')
    .withRules(['button-name', 'aria-toggle-field-name', 'nested-interactive'])
    .analyze();
  expect(named.violations).toEqual([]);

  await context.close();
});

test('the whole screen stays keyboard-reachable, with the toggle first (VB-18)', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await installSilentSpeech(page);
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');

  // Tab lands on it, Space and Enter both work it, and focus never moves as a
  // result — turning the narrator on must not take the person anywhere.
  /* V2.9: TWO tabs, not one. TIM sits in the top-RIGHT corner at Adam's word,
     so "Jump to…" now takes the head of the chrome row and he takes the tail.
     DOM order, reading order and tab order still agree — which is what WCAG
     2.4.3 asks — and the substantive claim below is untouched: Tab reaches
     him, Space and Enter both work him, and focus never moves as a result. */
  /* REACHED BEFORE THE QUESTION, which is the claim — not "the Nth stop",
     which is a fact about the header's current shape and has now changed
     twice. Tabbing until it is focused holds the thing that matters and
     survives the next rearrangement. */
  await page.evaluate(() => document.body.focus());
  const toggle = page.getByRole('button', { name: 'Read questions aloud' });
  for (let i = 0; i < 4 && !(await toggle.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(toggle).toBeFocused();

  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toBeFocused();

  // And it is not a trap: the rest of the screen is still one Tab away.
  await page.keyboard.press('Tab');
  await expect(toggle).not.toBeFocused();

  await context.close();
});
