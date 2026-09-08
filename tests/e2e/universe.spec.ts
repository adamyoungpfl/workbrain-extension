import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_UNIVERSE, UNIVERSE } from '../../src/core/splash/universe';

/**
 * V3.0 pass 1 — the universe as the app's canvas. This file SUCCEEDS
 * tests/e2e/wall-panels.spec.ts, which died with its subject (the canvas
 * wall retired when the splash's lattice field took the ground; the
 * component and its core stay benched the way SplashStage's did).
 *
 * Decoration's whole contract, re-pinned for the new scenery:
 *  - the layer exists behind every surface, aria-hidden, unclickable;
 *  - it is the SAME component the splash intro renders — one field, two
 *    hosts, consistency by construction;
 *  - all motion is CSS transform: nothing schedules frames, ever — the
 *    wall repainted on a canvas clock, the universe does not need one;
 *  - under prefers-reduced-motion every turn stills in the stylesheet and
 *    the field simply stands;
 *  - the orbs stay faint: presence times the host's exposure never
 *    approaches legibility-threatening opacity.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchHome(reducedMotion: 'reduce' | 'no-preference'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion,
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return { context, page };
}

test.describe('V3.0 — the universe grounds the app', () => {
  test('the app sky behind Home: lattices, aria-hidden, unclickable', async () => {
    const { context, page } = await launchHome('no-preference');
    try {
      const ground = page.locator('.app-ground .universe');
      await expect(ground).toHaveCount(1);
      await expect(page.locator('.app-ground')).toHaveAttribute('aria-hidden', 'true');
      /* The app's own denser sky since 2026-09-08 — the splash keeps the
         seven-lattice table it was composed with. */
      await expect(page.locator('.app-ground .universe-orb')).toHaveCount(APP_UNIVERSE.length);

      const probe = await page.evaluate(() => {
        const orbs = [...document.querySelectorAll('.app-ground .universe-orb')];
        const ground = document.querySelector('.app-ground')!;
        return {
          opacities: orbs.map((o) => Number(getComputedStyle(o).opacity)),
          pointer: getComputedStyle(ground).pointerEvents,
          z: getComputedStyle(ground).zIndex,
        };
      });
      expect(probe.pointer).toBe('none');
      expect(Number(probe.z)).toBeLessThan(0);
      /* PRESENT, not faint (Adam, 2026-09-08: "the background around that
         label should be the animated app, not a solid background") — the
         old < 0.3 ceiling described the 1.7-dim era, when the probe found
         a 543px lattice at 27% reading as a solid ground. The field now
         has to be SEEN through the tint law's translucent cards, so the
         ceiling moves to scenery's true upper bound: visible, never
         opaque, never competing with ink. */
      /* Faded to "a more subtle part of the background" once the wall came
         down (Adam, 2026-09-08) - the floor drops with the dial, the claim
         stays: present, never opaque, never competing with ink. */
      for (const o of probe.opacities) {
        expect(o).toBeGreaterThan(0.05);
        expect(o).toBeLessThan(0.6);
      }
    } finally {
      await context.close();
    }
  });

  test('one field, two hosts: the splash intro renders the same component', async () => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    });
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
    try {
      await page.waitForSelector('.splash-intro', { timeout: 15_000 });
      await expect(page.locator('.splash-intro-globe .universe')).toHaveCount(1);
      await expect(page.locator('.splash-intro-globe .universe-orb')).toHaveCount(UNIVERSE.length);
    } finally {
      await context.close();
    }
  });

  test('reduced motion: the field stands, every turn stilled, nothing scheduled', async () => {
    const { context, page } = await launchHome('reduce');
    try {
      // The field STAYS — scenery is not motion, and hiding it would make
      // reduced motion a different product rather than a stiller one.
      /* The app's own denser sky since 2026-09-08 — the splash keeps the
         seven-lattice table it was composed with. */
      await expect(page.locator('.app-ground .universe-orb')).toHaveCount(APP_UNIVERSE.length);
      const still = await page.evaluate(() => {
        const orb = document.querySelector('.app-ground .universe-orb')!;
        const inner = orb.querySelector('svg, [class]');
        return {
          orb: getComputedStyle(orb).animationName,
          inner: inner ? getComputedStyle(inner).animationName : 'none',
        };
      });
      expect(still.orb).toBe('none');
      expect(still.inner).toBe('none');
    } finally {
      await context.close();
    }
  });
});
