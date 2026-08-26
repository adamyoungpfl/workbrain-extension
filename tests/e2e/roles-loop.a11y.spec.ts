import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import {
  findPosition,
  applyAnswer,
  applyReflect,
  reconcileSeededRepeatable,
  findSeedTarget,
} from '../../src/core/flow/runner';
import { S } from '../../src/panel/strings';
import type { AnswerValue } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.4 VB-20 adds a screen shape the panel did not have: a yes/no question
 * that reveals a second, differently-worded question under it. That reveal is
 * where an accessible name goes missing, so this scans the real panel parked
 * on it — before the reveal, after it, and again with the field carrying an
 * error, since the error is the state that adds `aria-invalid` and a described
 * -by relationship.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Every answer up to `role_names` — see roles-loop.spec.ts, same walk. */
function answersBeforeRoleNames(): Answers {
  let answers: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
  const declined = new Set<string>();
  const seenIntros = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    const pos = findPosition(contextModules, answers, declined, seenIntros);
    if (pos.kind === 'done') break;
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
    if (pos.step.id === 'role_names') return answers;
    const value: AnswerValue =
      pos.step.kind === 'multi'
        ? [pos.step.options?.[0]?.v ?? 'x']
        : pos.step.kind === 'chips'
          ? (pos.step.options?.[0]?.v ?? 'x')
          : pos.step.kind === 'yesno'
            ? 'no'
            : 'A seeded answer for this question.';
    answers = applyAnswer(answers, pos.step, pos.location, value);
    if (pos.location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(contextModules, pos.step.id);
      if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
    }
  }
  throw new Error('never reached role_names');
}

test('axe finds no violations on the "another role?" screen (VB-20)', async () => {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersBeforeRoleNames());

  const page = await context.newPage();
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
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_names');

  // Pick a role, then answer everything the loop asks about it.
  // V2.0 VB-60: `role_names` is asked as orbs; the rest of the loop is pills.
  await page.locator('.flow .orbgroup .orbchoice').first().click();
  await page.getByRole('button', { name: S.next, exact: true }).click();
  for (let guard = 0; guard < 12; guard++) {
    if ((await page.locator('.flow').getAttribute('data-position')) === 'add-another') break;
    if ((await page.locator('.flow').getAttribute('data-position')) === 'reflect') {
      await page.getByRole('button', { name: S.reflectKeep, exact: true }).click();
      continue;
    }
    const textarea = page.locator('.flow textarea');
    if (await textarea.count()) await textarea.first().fill('What this role is there to do.');
    else
      await page
        .locator('.flow .pillgroup .pill:not(.pill-add), .flow .orbgroup .orbchoice:not(.orbchoice-add)')
        .first()
        .click();
    await page.getByRole('button', { name: S.next, exact: true }).click();
  }
  await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');

  // Scoped to the flow surface, and to the WCAG rule tags rather than axe's
  // "best-practice" set — same exclusion, same reason, as ideas.a11y.spec.ts:
  // `region`, `landmark-one-main` and `page-has-heading-one` are all about the
  // panel shell, which this task does not own.
  const scan = () =>
    new AxeBuilder({ page })
      .include('.flow')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

  expect((await scan()).violations).toEqual([]);

  // Revealed: the field, its own visible label, its own question.
  await page.getByRole('button', { name: S.yes, exact: true }).click();
  await expect(page.locator('#flow-add-another-name')).toBeVisible();
  // Scan the settled screen, not a frame of the pill's 120ms colour change:
  // mid-transition a pill really is a low-contrast blend of the two ends, and
  // catching one is a fact about when the scan ran, not about what ships.
  // Settled means the pressed fill is exactly `--primary`.
  await expect
    .poll(() =>
      page.locator('.flow .pillgroup .pill[aria-pressed="true"]').evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe('rgb(42, 79, 203)');
  expect((await scan()).violations).toEqual([]);
  // The label is a real accessible name, not a paragraph sitting near a box.
  await expect(page.getByLabel('What do you call this role?')).toBeVisible();

  // And in the state that adds an alert and an invalid field.
  await page.getByRole('button', { name: S.next, exact: true }).click();
  await expect(page.locator('.flow [role="alert"]')).toHaveText(S.errNeedItsName);
  expect((await scan()).violations).toEqual([]);

  await context.close();
});
