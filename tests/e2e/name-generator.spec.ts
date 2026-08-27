import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { contextModules } from '../../src/core/flow/flow';
import { FAMOUS_FIRSTS, FAMOUS_LASTS } from '../../src/core/flow/nameGenerator';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V2.4 VB-109 — the name generator, on the real screens.
 *
 * What this file proves against the running panel:
 *  - the two name questions offer the generator and no longer offer the
 *    example button (the spec's "lose examples-as-suggestions");
 *  - a press drops a poolable "First Last" into the field as ordinary
 *    editable text, the next press deals a different one, and the live
 *    region speaks what landed — the ideas mechanic, different well;
 *  - professional_name's blank-means-same-name survives: drop a name, clear
 *    it, move on — no error, no requirement invented;
 *  - axe finds nothing wrong before or after a press.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention
 * (the answersUpTo/openAt pattern from question-fill.spec.ts).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

const POOL_NAME = new RegExp(`^(${FAMOUS_FIRSTS.join('|')}) (${FAMOUS_LASTS.join('|')})$`);

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** Every answer the flow needs to derive its way to `targetStepId` — the
 * question-fill.spec.ts helper, unchanged in shape. */
function answersUpTo(modules: Module[], targetStepId: string): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const step: Step = node;
      if (step.id === targetStepId) return { values, repeatables: {}, answeredAt, reflectedAt };
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
  throw new Error(`no step called ${targetStepId} in the flow`);
}

async function openAt(context: BrowserContext, sw: Worker, id: string, stepId: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpTo(contextModules, stepId));

  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', stepId);
  return page;
}

test.describe('the name generator (VB-109)', () => {
  test('preferred_name deals names into the field — and no longer offers examples', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'preferred_name');

    // The trade the spec names: generator in, examples out. The ported
    // `ideas` are untouched data — the SCREEN just no longer offers them.
    const generator = page.getByRole('button', { name: S.makeUpName, exact: true });
    await expect(generator).toBeVisible();
    await expect(page.getByRole('button', { name: S.giveExample, exact: true })).toHaveCount(0);
    // The other helper is still there — VB-109 replaces examples, not help.
    // (V2.5 VB-119 renamed it AI Assist; VB-121 removes it from the name
    // questions in its own slice, where this claim flips.)
    await expect(page.getByRole('button', { name: S.assist, exact: true })).toBeVisible();

    // A press lands a name from the pools, as ordinary editable field text.
    await generator.click();
    const field = page.locator('#flow-preferred_name');
    const first = await field.inputValue();
    expect(first).toMatch(POOL_NAME);
    // …spoken for anyone who cannot see it land (the ideas live region).
    await expect(page.locator('.flow-idea-live').first()).toHaveText(first);

    // The next press deals a different name — the button cycles.
    await generator.click();
    const second = await field.inputValue();
    expect(second).toMatch(POOL_NAME);
    expect(second).not.toBe(first);

    // Ordinary text: the person can edit or replace what chance dealt.
    await field.fill('Ada');
    await expect(field).toHaveValue('Ada');

    await context.close();
  });

  test("professional_name keeps blank-means-same-name: deal, clear, move on", async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'professional_name');

    // The ported semantics, on screen: the blank is offered in the question's
    // own words and the example under the field.
    await expect(page.locator('.flow-q')).toContainText('Leave this blank');
    const field = page.locator('#flow-professional_name');
    await expect(field).toHaveAttribute('placeholder', "Leave blank if it's the same");

    // Deal a name, think better of it, clear it — and blank still means
    // same-name: Next advances with no error and no invented requirement.
    await page.getByRole('button', { name: S.makeUpName, exact: true }).click();
    expect(await field.inputValue()).toMatch(POOL_NAME);
    await field.fill('');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'self_description');
    await expect(page.locator('.flow-error')).toHaveCount(0);

    await context.close();
  });

  test('axe finds no violations, resting and with a dealt name (reduced motion)', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'preferred_name');
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const scan = () =>
      new AxeBuilder({ page })
        .include('.flow')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

    expect((await scan()).violations).toEqual([]);
    await page.getByRole('button', { name: S.makeUpName, exact: true }).click();
    await expect(page.locator('#flow-preferred_name')).not.toHaveValue('');
    expect((await scan()).violations).toEqual([]);

    await context.close();
  });
});
