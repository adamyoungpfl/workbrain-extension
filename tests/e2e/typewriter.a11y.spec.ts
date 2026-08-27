import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V1.2 VB-10, scanned at the one moment that is new.
 *
 * The rest of the a11y project scans finished screens, and a finished screen
 * here is byte-for-byte what V1.1 shipped — the print leaves nothing behind.
 * The state worth scanning is the one that only exists for a few hundred
 * milliseconds: a heading whose visible text is a fragment, with the rest of
 * the sentence sitting in the DOM `visibility: hidden`.
 *
 * Two real ways that could be wrong, and both are the kind of thing that gets
 * found in the wild rather than in review:
 *
 *  - **`empty-heading`.** For the first tick nothing is typed at all. Hidden
 *    text is not in the accessibility tree, so without the `aria-label`
 *    Typed.tsx adds while printing, this is a heading with no name.
 *  - **`color-contrast`.** The reason the remainder is `visibility: hidden`
 *    rather than transparent text: axe measures transparent text against its
 *    background and fails it, and a scan that happened to land mid-print would
 *    report a violation that is invisible five hundred milliseconds later.
 *
 * So this scan deliberately does NOT emulate reduced motion — unlike every
 * other a11y spec in this suite, which does. Under reduced motion there is
 * nothing here to scan.
 *
 * The panel's clock is dilated so the state holds still for the scan. An axe
 * pass takes a few hundred milliseconds and a question prints in about one
 * second, so left alone this test would be a race: it would pass, and on a
 * loaded machine it would quietly become a scan of the finished screen. The
 * page's own `performance.now` is slowed twentyfold instead, which is the one
 * clock the print reads (core/motion/typewriter.ts is elapsed-time driven).
 * Nothing about the markup changes — this is the real half-printed DOM, held
 * long enough to look at, not a fixture built to resemble one.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Slows the page's clock by `factor`, from the moment the script runs, before
 * any of the panel's own code has executed. */
function dilateClock(page: import('@playwright/test').Page, factor: number) {
  return page.addInitScript((slow) => {
    const real = performance.now.bind(performance);
    const from = real();
    Object.defineProperty(performance, 'now', {
      configurable: true,
      writable: true,
      value: () => from + (real() - from) / slow,
    });
  }, factor);
}

test('axe finds no violations on a question that is still typing (VB-10)', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      // The print is a 10ms interval, and Chrome clamps timers in a window it
      // believes is occluded — which would finish this print before the scan
      // and quietly turn the test into a scan of the ordinary screen.
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-90: the fresh opening is the why screen, which reads as beats —
  // no .flow-q to scan mid-print. Seed a passed gate so the walk-in lands on
  // an ordinary typing question, same as typewriter.spec.ts.
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
  await dilateClock(page, 20);
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
  // V2.4: the seeded walk-in opens on context_scope, whose pills now ENTER
  // with VB-108's animation — and this scan runs deliberately mid-motion,
  // which is the pills' own entrance frames, not this spec's subject (the
  // typing heading). Walk one question further, to a text question with no
  // pills, and scan the print there. (The entrance-fade's own every-frame
  // contrast is flagged in docs/V2.4-REFINEMENT.md for the next pass.)
  await page.locator('.flow .vpick .vpick-tile').first().click(); // VB-118: tiles
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForSelector('.flow[data-step-id="stop_explaining"]');

  // The scan has to happen while the question is genuinely half-printed, or it
  // proves nothing at all — so that is asserted first, from the DOM, and again
  // afterwards, so a print that finished during the scan cannot pass silently.
  const stillPrinting = () =>
    page.$eval('.flow-q', (el) => ({
      shown: (el as HTMLElement).innerText.length,
      whole: (el.textContent ?? '').length,
      label: el.getAttribute('aria-label'),
    }));

  const before = await stillPrinting();
  expect(before.shown, 'the print was already over; nothing new is being scanned').toBeLessThan(
    before.whole,
  );
  expect(before.label, 'a printing heading must carry its whole question').not.toBeNull();

  // Same scope and same rule set as the other flow scans (see
  // rephrase.a11y.spec.ts on why the three excluded best-practice rules are
  // about the panel shell and not about anything here).
  const results = await new AxeBuilder({ page })
    .include('.flow')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);

  const after = await stillPrinting();
  expect(after.shown, 'the print finished before axe ran').toBeLessThan(after.whole);

  await context.close();
});
