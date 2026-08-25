import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { beatsPlainText, beatPlainText } from '../../src/core/flow/beats';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.1 VB-05 accept criteria (docs/V1.1-REFINEMENT.md): "reopening the panel
 * mid-module never replays a transition already passed; `prefers-reduced-
 * motion` gets the full beat text at once, no fade; every module in
 * `CONTEXT_INTERVIEW_MODULES` except the first gets exactly one transition,
 * verified by an e2e walk."
 *
 * The unit tests prove the derivation. They cannot prove the thing that has
 * bitten this repo before (see docs/TESTING.md): that a real panel, in a real
 * browser, actually shows the screen, advances off it, and does not write a
 * marker to storage on the way past. That is what this file drives.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
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
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

/** Home -> the Context interview, keyboard-only, same as flow.spec.ts. */
async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
}

/** Writes `wb:answers` straight into the extension's own storage from the
 * service worker, the same seeding trick home.spec.ts/deep-dive.spec.ts use.
 * The panel derives everything from it on the next load. */
async function seedAnswers(sw: Worker, answers: Answers): Promise<void> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
}

async function readAnswers(sw: Worker): Promise<Answers | undefined> {
  return sw.evaluate(async () => {
    const got = await chrome.storage.local.get('wb:answers');
    return got['wb:answers'] as Answers | undefined;
  });
}

/** Answers every top-level question in `modules` up to (but not including)
 * `stopBeforeModuleId`, so the panel lands exactly on that module's
 * transition. Repeatable blocks are left alone: both open-ended ones are
 * gated by a `yesno` question answered "no" here, and the seeded one only
 * exists once its seed question is answered, which it is. */
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

const SECOND_MODULE = contextModules[1]!;
const SECOND_COPY = S.moduleIntros[SECOND_MODULE.id as keyof typeof S.moduleIntros];

test.describe('VB-05 — module transition screens', () => {
  test('the first module opens straight into its own first question, with no transition in front of it', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'step');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');
    await context.close();
  });

  test('a transition appears before an untouched module, plays its beats, and continues into the module', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, SECOND_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);

    const screen = page.locator('.flow');
    await expect(screen).toHaveAttribute('data-position', 'module-intro');
    await expect(screen).toHaveAttribute('data-module-id', SECOND_MODULE.id);

    // The module it introduces is named, and the approved copy is on screen.
    await expect(page.locator('.flowprogress-title')).toHaveText(SECOND_MODULE.title);
    await expect(page.locator('.beat')).toHaveCount(1);
    await expect(page.locator('.beat')).toHaveText(beatPlainText(SECOND_COPY.beats[0]!));
    // `__emphasis__` became a real element, and no underscores are printed.
    await expect(page.locator('.beat .beat-em')).toHaveCount(1);
    await expect(page.locator('.beats')).not.toContainText('__');
    // The preview is there from the start, not on a timer behind the beats.
    await expect(page.locator('.modintro-preview-line').first()).toHaveText(SECOND_COPY.preview[0]!);

    // ...and the second beat replaces the first, on its own, without a click.
    await expect(page.locator('.beat')).toHaveText(beatPlainText(SECOND_COPY.beats[1]!), { timeout: 20_000 });
    await expect(page.locator('.beat')).toHaveCount(1);

    // Continuing lands on the module's real first question.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(screen).toHaveAttribute('data-position', 'step');
    await expect(screen).toHaveAttribute('data-step-id', SECOND_MODULE.nodes[0]!.id);

    await context.close();
  });

  test('continuing writes nothing at all — the transition has no answer to record', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = answersUpToModule(contextModules, SECOND_MODULE.id);
    await seedAnswers(sw, seeded);
    const page = await openPanel(context, id);
    await enterInterview(page);

    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'step');

    // Byte-identical to what was seeded: no marker, no timestamp, no key for
    // the module or the transition itself (docs/ARCHITECTURE.md's "nothing
    // derived is stored" — the derivation is the whole feature).
    expect(await readAnswers(sw)).toEqual(seeded);
    // And nothing else in storage grew a transition-shaped key either.
    const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
    expect(keys.filter((k) => /intro|transition|seen/i.test(k))).toEqual([]);

    await context.close();
  });

  test('keyboard only: Back returns to the transition, and Enter carries on from it', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, SECOND_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);

    const screen = page.locator('.flow');
    await expect(screen).toHaveAttribute('data-position', 'module-intro');
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(screen).toHaveAttribute('data-position', 'step');

    // Back from the module's first question is the transition again.
    await page.getByRole('button', { name: 'Back', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(screen).toHaveAttribute('data-position', 'module-intro');
    await expect(page.locator('.beat')).toHaveCount(1);

    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(screen).toHaveAttribute('data-position', 'step');

    await context.close();
  });

  test('reopening mid-module resumes past the transition, and reopening on it shows it again', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = answersUpToModule(contextModules, SECOND_MODULE.id);
    await seedAnswers(sw, seeded);

    // Sitting on the transition, panel closed and reopened: still the
    // transition, because nothing in the module has been answered.
    let page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
    await page.close();

    page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');

    // Continue, answer the module's first question, then close and reopen —
    // the transition is behind them for good, on the answers alone.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'step');
    await page.locator('.flow input.field, .flow textarea').first().fill('Ada');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', SECOND_MODULE.nodes[1]!.id);
    await page.close();

    page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'step');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', SECOND_MODULE.nodes[1]!.id);

    await context.close();
  });

  test('prefers-reduced-motion: every beat is on screen at once, and it says the same thing', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, SECOND_MODULE.id));
    const page = await openPanel(context, id);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await enterInterview(page);

    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
    const beats = page.locator('.beat');
    await expect(beats).toHaveCount(SECOND_COPY.beats.length);
    for (const [i, beat] of SECOND_COPY.beats.entries()) {
      await expect(beats.nth(i)).toBeVisible();
      await expect(beats.nth(i)).toHaveText(beatPlainText(beat));
    }
    // The still version carries the same words as the played one — the
    // requirement is the content, not merely the absence of movement.
    expect((await beats.allTextContents()).join(' ')).toBe(beatsPlainText(SECOND_COPY.beats));

    // No fade is applied to any of them, and no beat is left transparent.
    const opacities = await beats.evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
    expect(opacities.every((o) => Number(o) === 1)).toBe(true);
    const animations = await beats.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(animations.every((a) => a === 'none')).toBe(true);

    // Nothing is announced twice: the sr-only copy only exists while the
    // sequence is still playing one beat at a time.
    await expect(page.locator('.beats-sr')).toHaveCount(0);

    await context.close();
  });

  test('the transition screen is axe-clean and every control clears the 44px floor', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, SECOND_MODULE.id));
    const page = await openPanel(context, id);
    // Scanned in the still state, deliberately. Axe measures one instant, and
    // any cross-fade necessarily passes through low opacity on its way out —
    // scanning mid-fade reports a contrast failure against a frame no one is
    // asked to read. The state that must be clean is the one a person who
    // cannot take motion actually gets, and it is the same markup either way.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterInterview(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');

    const results = await new AxeBuilder({ page }).include('.flow').analyze();
    expect(results.violations).toEqual([]);

    for (const button of await page.locator('.flow button').all()) {
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }

    await context.close();
  });

  test('architecture_orientation finally plays its own authored beats', async () => {
    const { context, sw, id } = await launchExtension();
    // Everything in module one answered except its closing intro.
    const upToLast = answersUpToModule(contextModules, contextModules[1]!.id);
    delete upToLast.values.architecture_orientation;
    delete upToLast.answeredAt.architecture_orientation;
    await seedAnswers(sw, upToLast);

    const page = await openPanel(context, id);
    await enterInterview(page);

    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'architecture_orientation');
    const step = contextModules[0]!.nodes.find((n) => n.id === 'architecture_orientation')!;
    if ('fields' in step) throw new Error('architecture_orientation should be a question, not a block');
    const authored = step.beats!;

    // One beat at a time — this screen printed all of it as one flat
    // paragraph until VB-05, which is the bug this feature fixes.
    await expect(page.locator('.beat')).toHaveCount(1);
    await expect(page.locator('.beat')).toHaveText(beatPlainText(authored[0]!));
    await expect(page.locator('.beat')).toHaveText(beatPlainText(authored[1]!), { timeout: 20_000 });

    await context.close();
  });
});
