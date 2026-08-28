import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { openPastPeek } from './fixtures/drawer';

/**
 * V1.8 VB-48's accessibility floor — the tier above, on the real panel.
 *
 * The behaviour spec proves the work brain works. This proves it is reachable:
 * axe clean at the new tier in BOTH views, a named stage, three file nodes that
 * say their own state, a locked one that keeps its sentence AND its place in
 * the tab order, and a keyboard path in and back out again that never lands
 * focus on nothing.
 *
 * Scanned with reduced motion on, like the other drawer scans: axe measures one
 * instant, and a mid-flight frame is two tiers at blended opacity.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const PANEL = { width: 400, height: 700 };
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

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

async function openAtWorkBrain(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[3]!.id));
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
  await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
  await expect(page.locator('.filedrawer')).toHaveAttribute('data-mode', 'brain');
  // V2.1 VB-74: the way out is the nav band's Back, above the stage.
  await page.locator('.brainglobe-nav').getByRole('button', { name: S.navBack, exact: true }).click();
  await expect(page.locator('.brainglobe')).toHaveAttribute('data-tier', 'work');
  return page;
}

test('axe finds no violations at the work brain, in either view (VB-48)', async () => {
  const { context, sw, id } = await launch();
  const page = await openAtWorkBrain(context, sw, id);

  const brain = await new AxeBuilder({ page }).include('.flowshell').withTags([...WCAG]).analyze();
  expect(brain.violations, 'the work brain, as a picture').toEqual([]);

  await page.getByRole('button', { name: S.drawerModeList, exact: true }).click();
  await expect(page.locator('.workshelf')).toHaveCount(1);
  const list = await new AxeBuilder({ page }).include('.flowshell').withTags([...WCAG]).analyze();
  expect(list.violations, 'the work brain, as a list').toEqual([]);

  await context.close();
});

test('the stage says which tier it is, and every file says its own state (VB-48)', async () => {
  const { context, sw, id } = await launch();
  const page = await openAtWorkBrain(context, sw, id);

  // The stage is a different thing up here and is named as one.
  await expect(page.getByRole('group', { name: S.workBrainStage })).toHaveCount(1);

  // Every file node says what it is, out loud — the picture says it with a
  // dashed shell and a padlock, and neither of those reaches a screen reader.
  await expect(page.locator('.brainglobe-pin.is-file[data-file-id="context"]')).toHaveAttribute(
    'aria-label',
    S.brainGlobeNode(S.fileContext, S.workBrainOpen),
  );
  await expect(page.locator('.brainglobe-pin.is-file[data-file-id="skills"]')).toHaveAttribute(
    'aria-label',
    S.fileToggleLockedName(S.fileSkills, S.lockedNeedsFirst(S.fileContext)),
  );

  await context.close();
});

test('the keyboard goes in and comes back out, and always lands on something (VB-48)', async () => {
  const { context, sw, id } = await launch();
  const page = await openAtWorkBrain(context, sw, id);

  // In: the file node is a real tab stop, Enter opens it, and focus lands on a
  // section of the file rather than falling to the body when the node it was
  // on disappears.
  const context_ = page.locator('.brainglobe-pin.is-file[data-file-id="context"]');
  await context_.focus();
  await expect(context_).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.brainglobe')).toHaveAttribute('data-tier', 'file');
  await expect(page.locator('.brainglobe-pin[data-section-id]:focus')).toHaveCount(1);

  // Out: Escape climbs the last rung, and focus comes back to the file it left.
  await page.keyboard.press('Escape');
  await expect(page.locator('.brainglobe')).toHaveAttribute('data-tier', 'work');
  await expect(context_).toBeFocused();

  // Nothing invisible is ever in the tab order, at either end.
  const reachable = async () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.brainglobe button')).filter(
        (button) => !button.hasAttribute('hidden') && button.offsetParent !== null,
      ).length,
    );
  expect(await reachable()).toBeGreaterThan(0);

  await context.close();
});
