import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { contrastRatio, isOpaque, over, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.8 VB-47's accessibility floor, on the real panel.
 *
 * THE THING AXE WILL NOT DO HERE, AND THE REASON THIS FILE EXISTS: two of the
 * three segments are `aria-disabled`, and axe's contrast rule skips a disabled
 * control outright. docs/GUARDRAILS.md grants no such exemption — the floor is
 * 4.5:1 on text — and the text it skips is the filename of a locked file and
 * the sentence saying what unlocks it, which is the whole point of the strip.
 * So those colours are read back out of the browser and the ratio is computed
 * here, exactly as file-slots.a11y.spec.ts does for Home's locked rows, where
 * this treatment caught a real 2.0:1 failure.
 *
 * The rest is the floor as a whole: a WCAG scan of the drawer with the strip in
 * it, a full keyboard path through all three segments, and the 44px target.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TARGET_MIN = 44;

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** Part-written, so the drawer has a real list under the strip. */
function partlyWritten(): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of contextModules) {
    if (module.id === 'initiatives') break;
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

async function openList(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), partlyWritten());
  const page = await context.newPage();
  // Scanned still, for the reason every a11y spec here documents: axe measures
  // one instant, and an entrance animation passes through partial states.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: S.fileGoThrough, exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetypes');
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await page.waitForTimeout(200);
  return page;
}

/** The colour a piece of text is painted in and the colour it is painted on —
 * the same walk file-slots.a11y.spec.ts uses. */
async function inkAndGround(page: Page, selector: string): Promise<{ ink: Rgb; ground: Rgb }> {
  const read = await page.locator(selector).first().evaluate((el) => {
    const ink = getComputedStyle(el).color;
    const grounds: string[] = [];
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      grounds.push(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    grounds.push(getComputedStyle(document.body).backgroundColor, 'rgb(255, 255, 255)');
    return { ink, grounds };
  });

  const ink = parseCssColor(read.ink);
  if (!isOpaque(ink)) throw new Error(`text at ${selector} is not painted in an opaque colour`);
  const stack = read.grounds.map(parseCssColor);
  const firstOpaque = stack.findIndex((c) => isOpaque(c));
  let ground = stack[firstOpaque] as Rgb;
  for (let i = firstOpaque - 1; i >= 0; i--) {
    const layer = stack[i];
    if (layer) ground = over(layer, ground);
  }
  return { ink, ground };
}

test('axe finds no violations on the drawer with the file toggle in it (VB-47)', async () => {
  const { context, sw, id } = await launch();
  const page = await openList(context, sw, id);

  // The scan is only worth anything if the locked segments really rendered.
  await expect(page.locator('.filetypes-item[aria-disabled="true"]')).toHaveCount(2);

  const results = await new AxeBuilder({ page }).include('.filedrawer').withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await context.close();
});

test('a locked segment’s name and the unlock line both clear 4.5:1 (VB-47)', async () => {
  const { context, sw, id } = await launch();
  const page = await openList(context, sw, id);

  for (const selector of [
    '.filetypes-item[aria-disabled="true"] .filetypes-name',
    '.filetypes-item[aria-pressed="true"] .filetypes-name',
    '.filetypes-note',
  ]) {
    const { ink, ground } = await inkAndGround(page, selector);
    const ratio = contrastRatio(ink, ground);
    expect(ratio, `${selector} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }

  await context.close();
});

test('every segment is reachable and pressable from the keyboard alone (VB-47)', async () => {
  const { context, sw, id } = await launch();
  const page = await openList(context, sw, id);

  // Reachable by Tab from the segment before it — a locked one included, which
  // is the whole reason it is `aria-disabled` rather than `disabled`: its
  // sentence has to be reachable by somebody who cannot see the strip.
  await page.locator('.filetypes-item[data-file="context"]').focus();
  for (const file of ['skills', 'actions']) {
    await page.keyboard.press('Tab');
    await expect(page.locator(`.filetypes-item[data-file="${file}"]`)).toBeFocused();
  }

  // And the whole truth is in the focused control's own name.
  await expect(page.locator('.filetypes-item[data-file="actions"]')).toHaveAttribute(
    'aria-label',
    S.fileToggleLockedName(S.fileActions, S.lockedNeedsFirst(S.fileSkills)),
  );

  await context.close();
});

test('every segment clears the 44px target (VB-47)', async () => {
  const { context, sw, id } = await launch();
  const page = await openList(context, sw, id);

  const boxes = await page.locator('.filetypes-item').evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      return { w: box.width, h: box.height };
    }),
  );
  expect(boxes).toHaveLength(3);
  for (const box of boxes) {
    expect(Math.round(box.h)).toBeGreaterThanOrEqual(TARGET_MIN);
    expect(Math.round(box.w)).toBeGreaterThanOrEqual(TARGET_MIN);
  }

  await context.close();
});
