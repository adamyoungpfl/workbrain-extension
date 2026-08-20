import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DEEP_DIVE } from '../../src/core/flow/deepDive';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.1 VB-03 accept criteria (docs/V1.1-REFINEMENT.md): "every `deepDive`
 * entry's `a` is reachable via keyboard, closes on re-click, and doesn't
 * shift focus away from the question."
 *
 * Unit tests can prove the toggle logic; they cannot prove the thing that
 * actually matters here — that a real person pressing a real key on a real
 * 400px panel gets the answer, keeps their place, and can carry on. This
 * repo has been bitten once by a feature that passed every unit test and
 * was broken in the browser (see docs/TESTING.md), so this file drives the
 * built extension.
 *
 * Self-contained launch helpers, matching this repo's convention that each
 * spec file stands alone (see reflect.spec.ts's own header).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  return page;
}

/** Home -> the Context interview, keyboard-only, same as flow.spec.ts. */
async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
}

/**
 * Answers every Context question except `leaveUnanswered`, so `findPosition`
 * lands straight on it. Mirrors proof.spec.ts's / home.spec.ts's own
 * `buildDoneAnswers` (duplicated per the standalone-spec convention) with
 * the one hole punched in it.
 */
function buildAnswersExcept(modules: Module[], leaveUnanswered: string): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  function stampTop(key: string, value: AnswerValue) {
    values[key] = value;
    answeredAt[key] = now;
    if (typeof value === 'string') reflectedAt[key] = now;
  }

  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;

  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        if (node.seedFrom) rolesBlock = node;
        continue;
      }
      const step = node;
      if (step.id === leaveUnanswered) continue;
      const key = step.key ?? step.id;

      if (step.id === 'entities_gate' || step.id === 'initiatives_gate') {
        stampTop(key, 'no');
      } else if (step.id === 'role_names') {
        roleNamesStep = step;
        stampTop(key, (step.options ?? []).slice(0, 1).map((o) => o.v));
      } else if (step.kind === 'intro') {
        stampTop(key, null);
      } else if (step.kind === 'yesno') {
        stampTop(key, 'yes');
      } else if (step.kind === 'chips') {
        stampTop(key, step.options?.[0]?.v ?? 'x');
      } else if (step.kind === 'multi') {
        stampTop(key, step.options?.length ? [step.options[0]!.v] : []);
      } else {
        stampTop(key, `A test answer for ${step.id}.`);
      }
    }
  }

  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    const records = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [rolesBlock!.seedFrom!.seedField]: label };
      for (const field of rolesBlock!.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A test answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[rolesBlock.id] = records;
    records.forEach((record, recordIndex) => {
      for (const [fk, v] of Object.entries(record)) {
        if (fk === rolesBlock!.seedFrom!.seedField) continue;
        const compound = `${rolesBlock!.id}#${recordIndex}#${fk}`;
        answeredAt[compound] = now;
        if (typeof v === 'string') reflectedAt[compound] = now;
      }
    });
  }

  return { values, repeatables, answeredAt, reflectedAt };
}

/** The approved copy, read from the data rather than retyped — a drift here
 * should fail as a copy change, not as a stale string in a test. */
const ORIENTATION = DEEP_DIVE.orientation_ready!;
const VOICE_DIRECTNESS = DEEP_DIVE.voice_directness!;

test.describe('VB-03 — the deeper-dive disclosure', () => {
  test('the disclosure replaces the hint paragraph, opens and closes on Enter, and never takes focus off the question', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // Question one, `orientation_ready` — two authored follow-ups.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');
    const chips = page.locator('.flow .deepdive-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveText(new RegExp(ORIENTATION[0]!.q));
    await expect(chips.nth(1)).toHaveText(new RegExp(ORIENTATION[1]!.q));

    // The old always-visible hint is gone — its content is what the chips
    // now hold, and printing both would say the same thing twice.
    await expect(page.locator('.flow .flow-hint')).toHaveCount(0);
    await expect(page.getByText('Context is a short, plain-text file', { exact: false })).toHaveCount(0);

    // Closed to begin with, and the answer is not readable.
    await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'false');
    const firstAnswer = page.locator('.flow .deepdive-answer').nth(0);
    await expect(firstAnswer).toBeHidden();

    // --- keyboard: focus the chip, press Enter ---
    const questionBefore = await page.locator('.flow-q').boundingBox();
    await chips.nth(0).focus();
    await page.keyboard.press('Enter');

    await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(firstAnswer).toBeVisible();
    await expect(firstAnswer).toHaveText(ORIENTATION[0]!.a);

    // Focus did not move — the accept criterion. Asserted on the live
    // document, not on Playwright's own idea of the focused locator.
    await expect(chips.nth(0)).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.className)).toContain('deepdive-chip');

    // ...and the question itself has not moved or scrolled away under them.
    const questionAfter = await page.locator('.flow-q').boundingBox();
    expect(questionAfter?.y).toBe(questionBefore?.y);
    await expect(page.locator('.flow-q')).toBeVisible();

    // --- and closes again on a second press, focus still put ---
    await page.keyboard.press('Enter');
    await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(firstAnswer).toBeHidden();
    await expect(chips.nth(0)).toBeFocused();

    await context.close();
  });

  test('each chip toggles on its own, and the answer is wired to its trigger', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const chips = page.locator('.flow .deepdive-chip');
    const answers = page.locator('.flow .deepdive-answer');

    await chips.nth(0).click();
    await chips.nth(1).click();
    await expect(answers.nth(0)).toBeVisible();
    await expect(answers.nth(1)).toBeVisible();
    await expect(answers.nth(1)).toHaveText(ORIENTATION[1]!.a);

    // Closing the second leaves the first exactly as it was.
    await chips.nth(1).click();
    await expect(answers.nth(1)).toBeHidden();
    await expect(answers.nth(0)).toBeVisible();

    // aria-controls really resolves, in the live DOM.
    const wired = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.deepdive-chip')).every((chip) => {
        const target = chip.getAttribute('aria-controls');
        return !!target && !!document.getElementById(target);
      }),
    );
    expect(wired).toBe(true);

    await context.close();
  });

  test('every trigger clears the 44x44 floor and shows a focus ring', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const chips = page.locator('.flow .deepdive-chip');
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await chips.nth(i).boundingBox();
      expect(box, `chip #${i} is not rendered`).not.toBeNull();
      expect(box!.width, `chip #${i} width`).toBeGreaterThanOrEqual(44);
      expect(box!.height, `chip #${i} height`).toBeGreaterThanOrEqual(44);
    }

    await chips.nth(0).focus();
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      return hasOutline || (style.boxShadow !== 'none' && style.boxShadow !== '');
    });
    expect(ring).toBe(true);

    await context.close();
  });

  test('axe finds no violations on the question, disclosure closed or open', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await page.emulateMedia({ reducedMotion: 'reduce' }); // scan the settled state
    await enterInterview(page);

    /**
     * Three page-shell best-practice rules are switched off: they are all
     * about the document's own landmark/heading structure (`panel.html` +
     * App.tsx render no `<main>` and no `<h1>`), they fire identically on
     * this screen with the disclosure closed, and nothing VB-03 renders can
     * fix or worsen them. Everything else — name, role, state, contrast,
     * focus order, aria-controls resolution — stays on. Scanned in BOTH
     * states below precisely so "disabled a rule" can't hide a regression
     * this feature introduced: if opening a chip broke anything, the second
     * scan would differ from the first.
     */
    const scan = () =>
      new AxeBuilder({ page })
        .disableRules(['region', 'page-has-heading-one', 'landmark-one-main'])
        .analyze();

    expect((await scan()).violations).toEqual([]);

    await page.locator('.flow .deepdive-chip').nth(0).click();
    await expect(page.locator('.flow .deepdive-answer').nth(0)).toBeVisible();

    expect((await scan()).violations).toEqual([]);

    await context.close();
  });

  test('the three voice questions keep their worked examples visible AND get a deep-dive', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildAnswersExcept(contextModules, 'voice_directness');
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'voice_directness');

    // The examples are what make this question answerable at a glance, so
    // they stay inline — decided in docs/V1.1-REFINEMENT.md, not optional.
    const hint = page.locator('.flow .flow-hint');
    await expect(hint).toHaveCount(1);
    await expect(hint).toContainText('Diplomatic:');
    await expect(hint).toContainText('Blunt:');

    // ...and the deep-dive adds what the hint does not say.
    const chip = page.locator('.flow .deepdive-chip');
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveText(new RegExp(VOICE_DIRECTNESS[0]!.q));
    await chip.click();
    await expect(page.locator('.flow .deepdive-answer')).toHaveText(VOICE_DIRECTNESS[0]!.a);

    await context.close();
  });

  test('a question with a hint and no deep-dive still renders its hint, untouched', async () => {
    // The proof loop's service picker (core/flow/proofAdapter.ts) is the
    // one shipped question that has a hint and no deep-dive — proof that
    // `hint` was not removed, only superseded where a deep-dive exists.
    const { context, sw, id } = await launchExtension();
    const seeded = buildAnswersExcept(contextModules, '__nothing__');
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_service');

    await expect(page.locator('.flow .flow-hint')).toHaveText('Which AI do you use most?');
    await expect(page.locator('.flow .deepdive-chip')).toHaveCount(0);

    await context.close();
  });
});
