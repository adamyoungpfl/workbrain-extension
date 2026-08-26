import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_PROOF_SERVICES, SERVICE_PERSONAS } from '../../src/core/flow/serviceThemes';

/**
 * V2.4 VB-105 — the themed service chips, driven on the real gate.
 *
 * A fresh interview walks its orientation ladder into the goal gate's
 * "Which AI do you use most?" — the first place the service list renders.
 * What this file proves, against the running panel rather than the data:
 *
 *  - the list is the MERGED one (ported four + Grok + Perplexity + other),
 *    read from core/flow/serviceThemes.ts rather than hard-coded, so a
 *    census change fails loudly here too;
 *  - every chip wears its persona as paint only (FLAG 4): theme class +
 *    aria-hidden drawing, accessible name still exactly the service label;
 *  - picking a chip selects and NEVER advances (the no-auto-advance
 *    guardrail) — Next is still the only way forward;
 *  - axe finds nothing wrong with the themed screen.
 *
 * Same launchPersistentContext pattern as flow.spec.ts (docs/TESTING.md).
 * No seeded gate here, on purpose — the gate IS the subject.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

const EXPECTED = ALL_PROOF_SERVICES.map((s) => s.key);

async function openOnTheGate(opts: { reducedMotion?: 'reduce' } = {}) {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    // The axe scan asks for this: reduced-motion must hold from FIRST PAINT
    // — the wall canvas and the typewriter read the preference at mount, so
    // emulateMedia after load leaves them animating, and under parallel
    // load axe samples mid-transition colors (a 58-violation phantom, seen
    // twice in full runs, never isolated).
    ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}),
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  // The orientation ladder (VB-90): why → canvas → brain → go, Next each.
  for (const rung of ['orientation_ready', 'wb_canvas', 'wb_brain_flip', 'wb_go']) {
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', rung);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'goal_service');
  return { context, page };
}

test.describe('themed service chips (VB-105)', () => {
  test('the gate asks with all seven services, each dressed in its persona, named by its label alone', async () => {
    const { context, page } = await openOnTheGate();

    const pills = page.locator('.flow .pillgroup .pill');
    await expect(pills).toHaveCount(EXPECTED.length);

    // V2.4 VB-108 is context_scope-only (decision 10): the gate's chips stay
    // the wrap they were, not a vertical list.
    await expect(page.locator('.flow .pillgroup')).not.toHaveClass(/\bpillgroup-vertical\b/);

    for (let i = 0; i < EXPECTED.length; i++) {
      const key = EXPECTED[i]!;
      const persona = SERVICE_PERSONAS[key]!;
      const pill = pills.nth(i);
      // Paint: the persona travels as a theme class and a decorative drawing.
      await expect(pill, key).toHaveClass(new RegExp(`\\bpill-theme-${persona}\\b`));
      await expect(pill.locator('svg[aria-hidden="true"]'), key).toHaveCount(1);
      // Meaning: the accessible name is the printed service label — the
      // persona word appears nowhere on the screen (FLAG 4).
      const name = await pill.textContent();
      expect(name, key).not.toMatch(new RegExp(persona, 'i'));
    }

    // The two additions are real, labelled buttons; "other" wears its whole
    // new title ([DRAFT], VB-105) and is still one chip.
    await expect(page.getByRole('button', { name: 'Grok', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Perplexity', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: "Something Cooler You Don't Even Know About", exact: true }),
    ).toBeVisible();

    await context.close();
  });

  test('picking a themed chip selects it and goes nowhere — Next is still the only door', async () => {
    const { context, page } = await openOnTheGate();

    await page.getByRole('button', { name: 'Grok', exact: true }).click();
    // Re-queried by theme class: a selected pill's accessible name gains the
    // group-wide ✓ (every pill has done this since R1), so the name locator
    // stops matching the moment the click lands — which is itself the proof
    // the persona class is on the same button the label named.
    const grok = page.locator('.flow .pill-theme-investigator');
    await expect(grok).toHaveAttribute('aria-pressed', 'true');
    // No auto-advance (docs/GUARDRAILS.md): the pick leaves the person here.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'goal_service');

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'goal_want');

    await context.close();
  });

  test('axe finds no violations on the themed gate, resting and with a selection', async () => {
    const { context, page } = await openOnTheGate({ reducedMotion: 'reduce' });

    // Same scope and tags as ideas.a11y.spec.ts, same reason: the excluded
    // best-practice rules are about the panel shell, not this screen.
    const scan = () =>
      new AxeBuilder({ page })
        .include('.flow')
        // The app-ground canvas is aria-hidden decoration composited at 4%
        // opacity (VB-111). axe's color-contrast sampler reads the canvas's
        // RAW bitmap — vivid panels, ignoring the compositing opacity — and
        // under full-suite load produced a 58-violation phantom against
        // colors no person ever sees. The real contrast claims live in the
        // token measurements and the pixel-sampling specs.
        .exclude('.app-ground')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

    expect((await scan()).violations).toEqual([]);

    // Selected state repaints the chip in its persona tone under inverse
    // ink — scanned separately because that is the state FLAG 4's contrast
    // arithmetic is really about. SETTLE FIRST: the label's color rides a
    // 200ms transition, and under full-suite load axe has twice caught it
    // mid-flight (#d4d5d6 en route to white — 3.25:1 that no person ever
    // sees). The stillness poll is the repo's own move (VB-74's suites):
    // two identical samples a frame apart, then scan.
    await page.getByRole('button', { name: 'Perplexity', exact: true }).click();
    const chip = page.locator('.pill-theme-explorer[aria-pressed="true"]');
    await expect(chip).toBeVisible();
    // A plain settle wait, double the 200ms transition (the ideas.spec
    // precedent): the paint rides inner faces a computed-style poll on the
    // button cannot see.
    await page.waitForTimeout(400);
    expect((await scan()).violations).toEqual([]);

    await context.close();
  });
});
