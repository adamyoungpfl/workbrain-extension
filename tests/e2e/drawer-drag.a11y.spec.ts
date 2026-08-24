import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds } from '../../src/core/drawer/height';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.2 VB-12's accessibility floor, on the real panel.
 *
 * The behaviour spec proves the handle resizes. This proves it is a control
 * anyone can reach and understand: a real tab stop with a visible ring, a
 * name, a range that is announced and stays coherent at every height, and no
 * axe violation introduced at any of them — including the tallest, which is
 * the one that could push the question off the screen.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const PANEL = { width: 400, height: 700 };
const BOUNDS = drawerBounds(PANEL.height);
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
  // Scanned still, for the same reason file-tree.a11y.spec.ts is: axe measures
  // one instant, and the tree's typewriter passes through half-printed labels.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  return page;
}

test('axe finds no violations at the peek, mid-drag or at full height (VB-12)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();

  for (const [name, key] of [
    ['the resting peek', null],
    ['half way up', 'PageUp'],
    ['fully open', 'End'],
    ['collapsed', 'Home'],
  ] as const) {
    if (key) await page.keyboard.press(key);
    // Same rule-tag scoping and reasoning as file-tree.a11y.spec.ts: the
    // excluded best-practice rules are about the panel shell, not this drawer.
    const results = await new AxeBuilder({ page }).include('.flowshell').withTags([...WCAG]).analyze();
    expect(results.violations, name).toEqual([]);
  }

  await context.close();
});

test('the handle is a named, focusable separator that announces its range (VB-12)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);

  // Found by role and name, not by class — which is how anyone using it will
  // find it too.
  const handle = page.getByRole('separator', { name: S.drawerHandle });
  await expect(handle).toHaveCount(1);
  await expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
  // It names what it resizes, and that thing exists.
  const controls = await handle.getAttribute('aria-controls');
  await expect(page.locator(`#${controls}`)).toHaveCount(1);

  await handle.focus();
  for (const key of ['End', 'ArrowDown', 'PageDown', 'Home', 'Enter', 'ArrowUp']) {
    await page.keyboard.press(key);
    const values = await handle.evaluate((el) => ({
      now: Number(el.getAttribute('aria-valuenow')),
      min: Number(el.getAttribute('aria-valuemin')),
      max: Number(el.getAttribute('aria-valuemax')),
      text: el.getAttribute('aria-valuetext'),
      height: Math.round(el.closest('.filedrawer')!.getBoundingClientRect().height),
    }));
    expect(values.min, key).toBe(BOUNDS.min);
    expect(values.max, key).toBe(BOUNDS.max);
    expect(values.now, key).toBeGreaterThanOrEqual(values.min);
    expect(values.now, key).toBeLessThanOrEqual(values.max);
    // What it says is what it is — with reduced motion on there is no
    // transition to be caught inside.
    expect(values.height, key).toBe(values.now);
    // And it is said in words as well as pixels.
    expect(values.text, key).toMatch(/^\d+% open$/);
  }

  await context.close();
});

/**
 * Tab until the handle has focus, and say whether it ever did.
 *
 * Deliberately Tab rather than `locator.focus()`: the ring is a
 * `:focus-visible` ring, which is exactly the distinction between "someone is
 * navigating by keyboard" and "something was focused by script". A test that
 * called `focus()` after a click would assert the ring is absent and be right.
 */
async function tabToHandle(page: Page): Promise<boolean> {
  await page.locator('.flow').press('Tab');
  for (let i = 0; i < 40; i++) {
    if (await page.evaluate(() => document.activeElement?.classList.contains('filedrawer-handle') === true)) return true;
    await page.keyboard.press('Tab');
  }
  return false;
}

test('the handle clears the 44x44 floor and has a visible focus ring (VB-12)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);
  const handle = page.locator('.filedrawer-handle');

  const box = (await handle.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);

  expect(await tabToHandle(page), 'Tab never reaches the drag handle').toBe(true);
  const ring = await handle.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0,
      shadow: s.boxShadow !== 'none',
    };
  });
  expect(ring.outline || ring.shadow, 'the drag handle has no visible focus ring').toBe(true);

  await context.close();
});

test('the keyboard path runs through the handle without stopping at it (VB-12)', async () => {
  const { context, sw, id } = await launch();
  const page = await openMidInterview(context, sw, id);

  // Reachable by Tab alone from the top of the question — not only by a
  // scripted focus() call.
  expect(await tabToHandle(page), 'Tab never reaches the drag handle').toBe(true);

  // Arrow keys work where focus actually landed, not only where a test put it.
  const before = Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow'));
  await page.keyboard.press('ArrowUp');
  expect(Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow'))).toBeGreaterThan(before);

  // ...and Tab carries on out of it, into the tree and then out of the drawer
  // entirely. A resize control that swallowed Tab would be a trap.
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
