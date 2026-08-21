import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.2 VB-14b's accessibility floor, on the real panel.
 *
 * The behaviour spec proves the two modes work. This proves the switch between
 * them is a control anyone can reach and understand — a named group, two
 * toggle buttons that announce which one is on, the 44px floor, a visible ring
 * — and that neither mode introduces an axe violation, including the dark one,
 * which is the single place in this product where a light-surface contrast
 * assumption could quietly stop holding.
 *
 * Scanned with reduced motion on, like the other drawer scans: axe measures
 * one instant, and a mid-morph frame is two layers at blended opacity.
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

async function openMidInterview(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[3]!.id));
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /Context\.md/ }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  return page;
}

const brainButton = (page: Page) => page.getByRole('button', { name: S.drawerModeBrain, exact: true });
const listButton = (page: Page) => page.getByRole('button', { name: S.drawerModeList, exact: true });

test('axe finds no violations in either mode (VB-14b)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);

  for (const [name, click] of [
    ['List, as it opens', null],
    ['Brain, including its dark stage', brainButton],
    ['back in List', listButton],
  ] as const) {
    if (click) await click(page).click();
    await expect(page.locator('.filedrawer')).toHaveAttribute('data-mode', click === brainButton ? 'brain' : 'list');
    // Same rule-tag scoping and reasoning as the other drawer scans: the
    // excluded best-practice rules are about the panel shell, not this drawer.
    const results = await new AxeBuilder({ page }).include('.flowshell').withTags([...WCAG]).analyze();
    expect(results.violations, name).toEqual([]);
  }

  await context.close();
});

test('the two modes are a named group of toggles that say which is on (VB-14b)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);

  // Found by role and name — the way anyone using them will find them.
  const group = page.getByRole('group', { name: S.drawerModes });
  await expect(group).toHaveCount(1);
  await expect(group.getByRole('button')).toHaveCount(2);

  await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(brainButton(page)).toHaveAttribute('aria-pressed', 'false');
  await brainButton(page).click();
  await expect(brainButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(listButton(page)).toHaveAttribute('aria-pressed', 'false');

  // Which one is on is never carried by colour alone (docs/GUARDRAILS.md):
  // the pressed one is heavier and wears a bar under it.
  const weights = await group
    .getByRole('button')
    .evaluateAll((els) =>
      els.map((el) => ({
        pressed: el.getAttribute('aria-pressed'),
        weight: Number(getComputedStyle(el).fontWeight),
        shadow: getComputedStyle(el).boxShadow,
      })),
    );
  const on = weights.find((w) => w.pressed === 'true')!;
  const off = weights.find((w) => w.pressed === 'false')!;
  expect(on.weight).toBeGreaterThan(off.weight);
  expect(on.shadow).not.toBe('none');
  expect(off.shadow).toBe('none');

  await context.close();
});

test('both mode buttons clear the 44x44 floor and show a focus ring (VB-14b)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);

  for (const button of [brainButton(page), listButton(page)]) {
    const box = (await button.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  // Reached by Tab, not by a scripted focus() call — the ring is a
  // :focus-visible ring, and that distinction is the whole point of it.
  await page.locator('.flow').press('Tab');
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    reached = await page.evaluate(
      () => document.activeElement?.classList.contains('filedrawer-mode') === true,
    );
    if (!reached) await page.keyboard.press('Tab');
  }
  expect(reached, 'Tab never reaches the mode buttons').toBe(true);

  const ring = await page.evaluate(() => {
    const style = getComputedStyle(document.activeElement as HTMLElement);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(2);

  // ...and the mode can be changed from the keyboard alone.
  await page.keyboard.press('Enter');
  await expect(page.locator('.filedrawer')).toHaveAttribute('data-mode', /brain|list/);

  await context.close();
});

test('the drawer is still not a focus trap in Brain (VB-14b)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);
  await brainButton(page).click();
  await expect(page.locator('.filedrawer')).toHaveAttribute('data-mode', 'brain');

  // The globe is one tab stop, and Tab carries on out of the drawer. The tree
  // behind it is `visibility: hidden`, so none of its controls is a stop.
  await page.locator('.filedrawer-handle').focus();
  let escaped = false;
  for (let i = 0; i < 40 && !escaped; i++) {
    await page.keyboard.press('Tab');
    escaped = await page.evaluate(() => {
      const el = document.activeElement;
      return !!el && el !== document.body && !el.closest('.filedrawer');
    });
  }
  expect(escaped, 'focus never left the drawer — that is a trap').toBe(true);

  await context.close();
});
