import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { contrastRatio, parseCssColor } from '../../src/core/color/contrast';
import {
  applyAnswer,
  applyReflect,
  findPosition,
  findSeedTarget,
  reconcileSeededRepeatable,
} from '../../src/core/flow/runner';
import { S } from '../../src/panel/strings';
import type { AnswerValue } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.7 VB-38 — the accessibility floor for a screen made of lists and a
 * revealed field.
 *
 * Three states, because the interesting one is not the resting list: it is the
 * field that appears under a group when "Add another" is pressed, and the same
 * field carrying a refusal. A reveal is where an accessible name goes missing
 * and where an error ends up announced to nobody, so all three are scanned,
 * and the text colours are measured rather than eyeballed
 * (docs/GUARDRAILS.md: text contrast ≥ 4.5:1, nothing distinguished by colour
 * alone).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The whole interview answered, so every group has something in it. */
function completedInterview(): Answers {
  let answers: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
  const declined = new Set<string>();
  const seenIntros = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    const pos = findPosition(contextModules, answers, declined, seenIntros);
    if (pos.kind === 'done') return answers;
    if (pos.kind === 'module-intro') {
      seenIntros.add(pos.module.id);
      continue;
    }
    if (pos.kind === 'add-another') {
      declined.add(pos.block.id);
      continue;
    }
    if (pos.kind === 'reflect') {
      answers = applyReflect(answers, pos.step, pos.location, 'A kept answer.');
      continue;
    }
    const value: AnswerValue =
      pos.step.kind === 'multi'
        ? [pos.step.options?.[0]?.v ?? 'x']
        : pos.step.kind === 'chips'
          ? (pos.step.options?.[0]?.v ?? 'x')
          : pos.step.kind === 'yesno'
            ? 'yes'
            : `A seeded answer for ${pos.step.id}.`;
    answers = applyAnswer(answers, pos.step, pos.location, value);
    if (pos.location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(contextModules, pos.step.id);
      if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
    }
  }
  throw new Error('the interview never finished');
}

async function openMultiples(
  answers: Answers = completedInterview(),
): Promise<{ context: BrowserContext; page: Page; sw: Worker }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);

  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await expect(page.locator('.splash')).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(S.multiplesTitle) }).click();
  await page.waitForSelector('.multiples');
  return { context, page, sw };
}

test('axe finds no violations on the list, with the name field open, or with it refused', async () => {
  const { context, page } = await openMultiples();

  // Scoped to this surface and to the WCAG tags, exactly as
  // roles-loop.a11y.spec.ts scopes its own scan: the panel document as a whole
  // carries no landmarks and no h1, which is a property of the shell every
  // surface shares and not something this screen introduces.
  const scan = () =>
    new AxeBuilder({ page })
      .include('.multiples')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

  expect((await scan()).violations).toEqual([]);

  await page.getByRole('button', { name: S.multipleAddTo('Roles') }).click();
  await expect(page.locator('.multiples input')).toBeVisible();
  expect((await scan()).violations).toEqual([]);

  await page.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();
  await expect(page.locator('.multiples [role="alert"]')).toHaveText(S.errNeedAName);
  expect((await scan()).violations).toEqual([]);

  await context.close();
});

test('every word on the screen clears 4.5:1, including the refusal', async () => {
  const { context, page } = await openMultiples();
  await page.getByRole('button', { name: S.multipleAddTo('Roles') }).click();
  await page.locator('.multiples input').fill('employee');
  await page.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();
  await expect(page.locator('.multiples [role="alert"]')).toHaveText(S.errNameTaken);

  const selectors = [
    '.multiples-title',
    '.multiples-sub',
    '.multiples-group-title',
    '.multiples .recordrow-name',
    '.multiples .recordrow-detail',
    '.multiples .recordrow-add',
    '.multiples .field-label',
    '.multiples-error',
  ];

  for (const selector of selectors) {
    const measured = await page.locator(selector).first().evaluate((el) => {
      // Walk up for the first painted background — every one of these sits on
      // the panel's own canvas or on a row that paints its own.
      let node: HTMLElement | null = el as HTMLElement;
      // The panel paints on the browser's own canvas, which computes as
      // transparent all the way up — so an unpainted chain means white, which
      // is what a screenshot of this screen actually shows.
      let background = 'rgb(255, 255, 255)';
      while (node) {
        const value = getComputedStyle(node).backgroundColor;
        if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
          background = value;
          break;
        }
        node = node.parentElement;
      }
      return { colour: getComputedStyle(el).color, background };
    });
    const ink = parseCssColor(measured.colour)!;
    const ground = parseCssColor(measured.background)!;
    const ratio = contrastRatio(ink, ground);
    expect
      .soft(ratio, `${selector} measures ${ratio.toFixed(2)}:1 on ${measured.background}`)
      .toBeGreaterThanOrEqual(4.5);
  }

  await context.close();
});

test('a refusal is announced, and nothing about it is carried by colour alone', async () => {
  const { context, page } = await openMultiples();
  await page.getByRole('button', { name: S.multipleAddTo('Roles') }).click();
  await page.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();

  // The refusal is a live region, so it reaches somebody who never sees the
  // red — and it is a whole sentence, so the red is decoration rather than
  // the message.
  const alert = page.locator('.multiples [role="alert"]');
  await expect(alert).toHaveText(S.errNeedAName);
  expect((await alert.textContent())!.length).toBeGreaterThan(12);

  // Each row's state is words too: "4 of 4 answered", never a coloured dot.
  // BS-08 (§8): the row's visible second line is what the record HOLDS; the
  // tally it used to print is now the sr-only line beside it.
  await expect(page.locator('.multiples .recordrow-sr').first()).toHaveText(S.recordAnswered(4, 4));

  await context.close();
});

/**
 * BS-08 (§8) — the two states the completed fixture cannot produce.
 *
 * Everything in `completedInterview()` is four-of-four and every group has
 * more than one record, so neither the "2 left" pill nor D8's norming line is
 * on that screen. They get their own fixture rather than a conditional inside
 * the loop above: a contrast check that silently skips a missing selector is
 * a contrast check that passes when the element disappears.
 */
test('the incomplete pill and the norming line clear 4.5:1 too (BS-08)', async () => {
  const answers = completedInterview();
  // One entity, holding nothing but its name — thin enough for the nudge and
  // incomplete enough for the pill.
  answers.repeatables['entities'] = [{ entity_name: 'Priya Raman' }];
  const { context, page } = await openMultiples(answers);

  const pill = page.locator('.multiples .recordrow-left').first();
  await expect(pill).toBeVisible();
  const norm = page.locator('.multiples .multiples-norm').first();
  await expect(norm).toBeVisible();
  // D8's line, on the list rather than in the recommendation stack.
  await expect(norm).toContainText(S.multiplesNorm('entities'));

  for (const selector of ['.multiples .recordrow-left', '.multiples .multiples-norm', '.multiples .multiples-norm-line']) {
    const measured = await page.locator(selector).first().evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      let background = 'rgb(255, 255, 255)';
      while (node) {
        const value = getComputedStyle(node).backgroundColor;
        if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
          background = value;
          break;
        }
        node = node.parentElement;
      }
      return { colour: getComputedStyle(el).color, background };
    });
    const ratio = contrastRatio(parseCssColor(measured.colour)!, parseCssColor(measured.background)!);
    expect
      .soft(ratio, `${selector} measures ${ratio.toFixed(2)}:1 on ${measured.background}`)
      .toBeGreaterThanOrEqual(4.5);
  }

  // And the incomplete state is never colour alone: the amber ring, the arc
  // it draws, and a word. The word is the one asserted here because it is the
  // one that survives a greyscale screen.
  await expect(pill).toHaveText(S.recordLeft(3));
  await expect(page.locator('.multiples .recordrow.is-partial')).not.toHaveCount(0);

  await context.close();
});
