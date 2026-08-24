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
 * V1.2 VB-11's accessibility floor, on the real panel.
 *
 * The behaviour spec proves the bar is welded to the drawer. This proves that
 * moving it there cost nothing: it is still three named controls at 44x44 with
 * rings that are not clipped by the bar they now live in, the note that came
 * out of it is still readable, and the whole docked pair is axe-clean at the
 * peek and at the ceiling — the two heights where a fixed bar could land on
 * something.
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

/** A question with Back, Next and Skip all present — the full bar. */
async function openQuestion(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[1]!.id));
  const page = await context.newPage();
  // Scanned still, for the same reason the other drawer a11y specs are: axe
  // measures one instant and the panel's typewriters pass through half-printed
  // text.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /Context\.md/ }).click();
  await page.waitForSelector('.filedrawer-handle');
  await page.getByRole('button', { name: S.next, exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
  return page;
}

async function setHeight(page: Page, key: string): Promise<void> {
  await page.locator('.filedrawer-handle').focus();
  await page.keyboard.press(key);
  await expect
    .poll(() => page.locator('.filedrawer-handle').getAttribute('aria-valuenow'))
    .toBe(String(key === 'Home' ? BOUNDS.min : BOUNDS.max));
}

test('axe finds no violations with the nav docked, at the peek or the ceiling (VB-11)', async () => {
  const { context, sw, id } = await launch();
  const page = await openQuestion(context, sw, id);

  for (const [name, key] of [
    ['at the peek', 'Home'],
    ['at the ceiling', 'End'],
  ] as const) {
    await setHeight(page, key);
    const results = await new AxeBuilder({ page }).include('.flowshell').withTags([...WCAG]).analyze();
    expect(results.violations, name).toEqual([]);
  }

  await context.close();
});

test('the docked bar is three named controls with rings that fit inside it (VB-11)', async () => {
  const { context, sw, id } = await launch();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, 'End');

  // Found by role and name — every one of them is a word, so nothing in the
  // bar is carried by colour or position alone.
  for (const name of [S.back, S.next, S.skip]) {
    const button = page.locator('.flow-foot').getByRole('button', { name, exact: true });
    await expect(button).toHaveCount(1);

    const b = (await button.boundingBox())!;
    expect(b.height, name).toBeGreaterThanOrEqual(44);
    expect(b.width, name).toBeGreaterThanOrEqual(44);

    await button.focus();
    // V1.7 VB-41: the ring moved off the button and onto the painted word —
    // the button is 44px tall and the word is 26, so a ring on the button
    // would be a rectangle around eighteen pixels of nothing
    // (components/NavButton.tsx). Whichever element is actually drawing it is
    // what has to fit inside the bar, so this reads the wrapper where there is
    // one and the button itself where there is not.
    const ring = await button.evaluate((el) => {
      const painted = (el.closest('.navbtn') as HTMLElement | null) ?? el;
      const s = getComputedStyle(painted);
      const box = painted.getBoundingClientRect();
      const width = parseFloat(s.outlineWidth) || 0;
      const offset = parseFloat(s.outlineOffset) || 0;
      const bar = el.closest('.flow-foot')!.getBoundingClientRect();
      return {
        drawn: s.outlineStyle !== 'none' && width > 0,
        top: box.top - width - offset,
        bottom: box.bottom + width + offset,
        left: box.left - width - offset,
        barTop: bar.top,
        barBottom: bar.bottom,
        viewport: window.innerWidth,
        right: box.right + width + offset,
      };
    });
    // A ring the docked bar cut in half is a ring nobody can follow.
    expect(ring.drawn, `${name} has no visible focus ring`).toBe(true);
    expect(ring.top, `${name} ring above the bar`).toBeGreaterThanOrEqual(ring.barTop - 0.5);
    expect(ring.bottom, `${name} ring below the bar`).toBeLessThanOrEqual(ring.barBottom + 0.5);
    expect(ring.left, `${name} ring off the left edge`).toBeGreaterThanOrEqual(0);
    expect(ring.right, `${name} ring off the right edge`).toBeLessThanOrEqual(ring.viewport);
  }

  await context.close();
});

test('the note that left the bar is still one readable line (VB-11)', async () => {
  const { context, sw, id } = await launch();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, 'Home');

  // Both halves survived the move, in order, and axe is happy with the
  // contrast where it now sits.
  const note = page.locator('.flow-save');
  await expect(note).toContainText(S.savedNote);
  await expect(note).toContainText(S.privacyNote);
  const results = await new AxeBuilder({ page }).include('.flow-save').withTags([...WCAG]).analyze();
  expect(results.violations).toEqual([]);

  // Not focusable, not a control — it is a sentence, and it did not become a
  // tab stop by moving.
  expect(await note.evaluate((el) => el.querySelectorAll('a, button, [tabindex]').length)).toBe(0);

  await context.close();
});
