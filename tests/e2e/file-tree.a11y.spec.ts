import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { openPastPeek } from './fixtures/drawer';

/**
 * VB-07's accessibility floor, scanned on the real panel — the component
 * harness the rest of the a11y project uses has no flow surface in it.
 *
 * Two things this covers that the behaviour spec cannot: axe's own contrast
 * maths over all three row states (the port's one real a11y sin was rendering
 * unreached rows below threshold, and this is what stops that coming back),
 * and the 44x44 floor on every control the drawer adds.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

function answersUpToModule(modules: Module[], stopBeforeModuleId: string): Answers {
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
}

/** Far enough in that all three row states are on screen at once — which is
 * the state that has to pass, not an empty tree. */
async function openMidInterview(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[3]!.id));

  const page = await context.newPage();
  // Scanned still, deliberately: axe measures one instant, and the tree's
  // typewriter necessarily passes through a partially printed label on its way
  // in. The state that must be clean is the one a person who cannot take
  // motion actually gets, and the markup is the same either way.
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
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
  return page;
}

/** V1.2 VB-12 — the collapsed/expanded toggle these tests were written
 * against is now a draggable handle, so "open it" is "send it to its
 * maximum": `End`, per the window-splitter keys the handle implements. */
async function openFully(page: Page): Promise<void> {
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
}

test('axe finds no violations on the file drawer, open or at the peek (VB-07)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);

  // All three states really are on screen, so the contrast scan below is
  // scanning what it is meant to.
  for (const state of ['current', 'reached', 'untouched']) {
    expect(await page.locator(`.filetree-row[data-node-state="${state}"]`).count(), state).toBeGreaterThan(0);
  }

  // Same rule-tag scoping and same reasoning as rephrase.a11y.spec.ts: the
  // excluded best-practice rules are about the panel shell, not this drawer.
  const peek = await new AxeBuilder({ page }).include('.filedrawer').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(peek.violations).toEqual([]);

  // V1.2 VB-12: opening it is now sending the drag handle to its maximum.
  await openFully(page);
  const open = await new AxeBuilder({ page }).include('.filedrawer').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(open.violations).toEqual([]);

  await context.close();
});

test('every control the drawer adds clears the 44x44 floor (VB-07)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);
  await openFully(page);

  for (const button of await page.locator('.filedrawer button').all()) {
    const box = await button.boundingBox();
    const name = (await button.getAttribute('aria-label')) ?? (await button.textContent());
    expect(box, `${name} has no box`).not.toBe(null);
    expect(box!.height, `${name} height`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `${name} width`).toBeGreaterThanOrEqual(44);
  }

  await context.close();
});

test('the flow surface as a whole stays axe-clean with the drawer docked under it (VB-07)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);
  await openFully(page);

  const results = await new AxeBuilder({ page }).include('.flowshell').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);

  await context.close();
});
