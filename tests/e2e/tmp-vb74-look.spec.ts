import { test, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { Module, Step, AnswerValue } from '../../src/schema/flow.types';

/** TEMPORARY — VB-74 visual check. Delete after looking. */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

test('VB-74 look: the nav band at three depths', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;

  // Seed the same mid-interview file work-brain.spec.ts seeds (its own
  // answersUpToModule, copied — the scratch cannot import from a spec).
  const upTo = (modules: Module[], stopBeforeModuleId: string) => {
    const now = new Date().toISOString();
    const values: Record<string, AnswerValue> = {};
    const answeredAt: Record<string, string> = {};
    const reflectedAt: Record<string, string> = {};
    for (const module of modules) {
      if (module.id === stopBeforeModuleId) break;
      for (const node of module.nodes) {
        if ('fields' in node) continue;
        const step: Step = node;
        const key = step.key ?? step.id;
        let value: AnswerValue;
        if (step.kind === 'intro') value = null;
        else if (step.kind === 'yesno') value = 'no';
        else if (step.kind === 'chips') value = step.options?.[0]?.v ?? 'x';
        else if (step.kind === 'multi') value = step.options?.length ? [step.options[0]!.v] : [];
        else value = `A test answer for ${step.id}.`;
        values[key] = value;
        answeredAt[key] = now;
        if (typeof value === 'string') reflectedAt[key] = now;
      }
    }
    return { values, repeatables: {}, answeredAt, reflectedAt };
  };
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, upTo(contextModules, contextModules[3]!.id));

  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.splash');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.screenshot({ path: 'vb74-debug-home.png' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  console.log('STEP fileview');
  await page.getByRole('button', { name: /Go through (the questions|them again)/ }).click();
  await page.waitForSelector('.filetree-row');
  console.log('STEP brain-toggle');
  await page.getByRole('button', { name: 'Brain', exact: true }).click();
  console.log('STEP nav-band');
  await page.waitForTimeout(1200);
  console.log('MODE', await page.locator('.filedrawer').getAttribute('data-mode'));
  console.log('NAV COUNT', await page.locator('.brainglobe-nav').count());
  await page.screenshot({ path: 'vb74-debug-after-toggle.png' });
  await page.waitForSelector('.brainglobe-nav');
  await page.waitForTimeout(1600);
  const drawer = page.locator('.filedrawer');
  await page.screenshot({ path: 'vb74-debug-full.png' });
  await drawer.screenshot({ path: 'vb74-file-tier.png' });

  // Fly into a section.
  await page.locator('.brainglobe-pin[data-section-id]').first().evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(1400);
  await drawer.screenshot({ path: 'vb74-inside.png' });

  // Home, all the way out.
  await page.locator('.brainglobe-nav').getByRole('button', { name: 'Home', exact: true }).evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(1400);
  await drawer.screenshot({ path: 'vb74-work-tier.png' });

  await context.close();
});
