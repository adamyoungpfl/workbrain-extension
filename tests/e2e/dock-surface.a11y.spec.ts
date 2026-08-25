import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds } from '../../src/core/drawer/height';
import { BRAIN_MIN_HEIGHT } from '../../src/core/drawer/mode';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.4 VB-22's accessibility floor, on the real panel.
 *
 * The behaviour spec measures contrast from real pixels, which is the part
 * axe cannot do here: axe reads a control's *computed* background and gives up
 * on a gradient rather than sampling it, so a bar like this one is exactly the
 * case an automated scan is blind to. What this file is for is everything else
 * — that dressing the chrome in the stage's colour did not cost a name, a
 * target, a ring or a keyboard step, at the two heights and in the two modes
 * where a mistake would show.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const PANEL = { width: 400, height: 760 };
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

async function openQuestion(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[1]!.id));
  const page = await context.newPage();
  // Scanned still, for the same reason the other drawer a11y specs are: axe
  // measures one instant and the panel's typewriters pass through half-printed
  // text. It also holds the stage's colour transition still, which is what
  // reduced motion is meant to do to it (Flow.css).
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.filedrawer-handle');
  await page.getByRole('button', { name: S.next, exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
  return page;
}

async function setHeight(page: Page, height: number): Promise<void> {
  await page.locator('.filedrawer-handle').focus();
  await page.keyboard.press(height === BOUNDS.min ? 'Home' : 'End');
  await expect
    .poll(() => page.locator('.filedrawer-handle').getAttribute('aria-valuenow'))
    .toBe(String(height));
}

test('axe finds no violations with the chrome dressed in either stage (VB-22)', async () => {
  const { context, sw, id } = await launch();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await page.getByRole('button', { name: mode === 'brain' ? S.drawerModeBrain : S.drawerModeList, exact: true }).click();
    await expect(page.locator('.flowshell')).toHaveAttribute('data-stage', mode);
    for (const height of [BOUNDS.max, Math.max(BOUNDS.min, mode === 'brain' ? BRAIN_MIN_HEIGHT : 0)]) {
      if (height !== BOUNDS.max && mode === 'brain') continue; // Home hands Brain to List.
      await setHeight(page, height);
      const results = await new AxeBuilder({ page }).include('.flowshell').withTags([...WCAG]).analyze();
      expect(results.violations, `${mode} at ${height}px`).toEqual([]);
    }
  }

  await context.close();
});

test('the glyph toggles are named, sized and reachable by keyboard (VB-22)', async () => {
  const { context, sw, id } = await launch();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, BOUNDS.max);

  for (const label of [S.drawerModeBrain, S.drawerModeList]) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toHaveCount(1);
    const box = (await button.boundingBox())!;
    expect(box.width, `${label} target width`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${label} target height`).toBeGreaterThanOrEqual(44);

    // The glyph itself is out of the accessibility tree: it is a picture of
    // the name, not a second one.
    await expect(button.locator('svg[aria-hidden="true"]')).toHaveCount(1);

    await button.focus();
    const ring = await button.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) || 0, colour: s.outlineColor };
    });
    expect(ring.style, `${label} focus ring`).not.toBe('none');
    expect(ring.width, `${label} focus ring width`).toBeGreaterThanOrEqual(2);
  }

  // Both modes are still driven from the keyboard alone, and the drawer's
  // stage follows.
  for (const [label, stage] of [
    [S.drawerModeBrain, 'brain'],
    [S.drawerModeList, 'list'],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flowshell')).toHaveAttribute('data-stage', stage);
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }

  await context.close();
});
