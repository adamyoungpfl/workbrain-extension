import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import {
  DRAWER_REST_HEIGHT,
  drawerListRows,
  drawerShowsStatus,
} from '../../src/core/drawer/height';
import { S } from '../../src/panel/strings';
import { pastRunCard } from './fixtures/runCard';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * BS-07a (§7.1) — the drawer's chrome.
 *
 * Two of §7.1's items, and the two that stand on their own:
 *
 *   "Label the mode buttons. Two unlabelled glyphs on a dark field, choosing
 *   between two views most people have never seen."
 *
 *   "Replace the peek's zeroed row with a status line — '4 of 10 sections · 1
 *   line just added' says more than a row reading 0 of 6 and 0% under a trail
 *   that already names the section."
 *
 * The third — dropping Back and Home from the stage — waits for §7.2's leaf
 * card, which is where the close control that replaces Back lives. Shipping
 * it first would leave a flown-into section with no way out but Escape.
 */

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const PANEL = { width: 400, height: 760 };

/** A top-level text question late in the file — one answer, one line, no
 * block around it. Named rather than found, so a rename in the ported
 * interview fails this test loudly instead of quietly walking somewhere else. */
const TEXT_QUESTION = 'terms_depend_on';
/** And one AFTER it left unanswered too, so answering the first advances to
 * another question rather than finishing the interview — which would hand off
 * to Home and take the drawer, and the line being measured, off the screen. */
const NEXT_QUESTION = 'reference_example_primary';

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion: 'reduce',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return { context, sw, id: new URL(sw.url()).host };
}

/** Far enough in that the file has written and untouched sections both. */
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

/**
 * Everything answered except one named question, so the flow opens exactly on
 * it. Every gate is answered "no", which takes the repeatable blocks out of
 * the walk — the interview's own `skipIf`, not a trick — so the position is
 * deterministic rather than "wherever the walk happens to stop".
 */
function answersAllExcept(modules: Module[], ...questionIds: string[]): Answers {
  const answers = answersUpToModule(modules, '__none__');
  for (const id of questionIds) {
    delete answers.values[id];
    delete answers.answeredAt[id];
    delete answers.reflectedAt[id];
  }
  return answers;
}

async function openMidInterview(
  context: BrowserContext,
  sw: Worker,
  id: string,
  answers: Answers = answersUpToModule(contextModules, contextModules[3]!.id),
): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  // Park the pointer: a stationary hover holds rotating cues by design.
  await page.mouse.move(0, 0);
  await page.waitForSelector('.filedrawer');
  return page;
}

test.describe('BS-05b — the cluster', () => {
  test('Next is the only filled control on the question screen (BS-05b)', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, answersAllExcept(contextModules, TEXT_QUESTION, NEXT_QUESTION));
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', TEXT_QUESTION);

    /**
     * §5's acceptance: "Next is the only filled control on the question
     * screen." Measured on the PAINT rather than on the variant prop — the
     * census's own lesson, since Flow.css strips the fill from every button
     * in this cluster and only Next gets it back.
     */
    const painted = await page.$$eval('.flow-foot .navbtn', (ns) =>
      ns.map((n) => {
        const face = n.querySelector('.navbtn-face') as HTMLElement | null;
        return {
          nav: n.getAttribute('data-nav'),
          fill: face ? getComputedStyle(face).backgroundColor : 'none',
        };
      }),
    );
    const filled = painted.filter((c) => c.fill !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(c.fill));
    expect(filled.map((c) => c.nav)).toEqual(['next']);

    // And wide: it takes the room the two quiet words leave.
    const boxes = await page.$$eval('.flow-foot .navbtn', (ns) =>
      ns.map((n) => ({ nav: n.getAttribute('data-nav'), w: n.getBoundingClientRect().width })),
    );
    const next = boxes.find((b) => b.nav === 'next')!;
    for (const other of boxes.filter((b) => b.nav !== 'next')) {
      expect(next.w, `Next is not wider than ${other.nav}`).toBeGreaterThan(other.w * 2);
    }

    await context.close();
  });
});
test.describe('BS-05f — Jump to…', () => {
  test('opens on every question, in file order, before a word is typed', async () => {
    const { context, sw, id } = await launchExtension();
    // The deterministic fixture: it opens ON a question, where the chrome
    // row lives. The default one lands on a module transition, which has no
    // question chrome and therefore no door.
    const page = await openMidInterview(context, sw, id, answersAllExcept(contextModules, TEXT_QUESTION, NEXT_QUESTION));

    await page.getByRole('button', { name: S.jumpOpen, exact: true }).click();
    const rows = page.locator('.jump-row');
    await expect(rows).not.toHaveCount(0);

    /**
     * Opening it with an empty box is a legitimate use: a person who does not
     * know the word to search for is exactly who needs this, and a search
     * that shows nothing until you guess right is a search for people who
     * already know the answer.
     */
    const first = await rows.count();
    await expect(page.locator('.jump-count')).toHaveText(S.jumpCount(first));

    await context.close();
  });

  test('every word has to land, and the order never moves', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, answersAllExcept(contextModules, TEXT_QUESTION, NEXT_QUESTION));
    await page.getByRole('button', { name: S.jumpOpen, exact: true }).click();

    const before = await page.locator('.jump-row-q').allTextContents();
    await page.locator('#jump-query').fill('role');
    const narrowed = await page.locator('.jump-row-q').allTextContents();
    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed.length).toBeLessThan(before.length);
    // Still in the order they were, just fewer — where a question lives is
    // learnable only if the list does not re-rank under the person.
    expect(narrowed).toEqual(before.filter((q) => narrowed.includes(q)));

    // Typing more narrows rather than broadens.
    await page.locator('#jump-query').fill('role zzzz');
    await expect(page.locator('.jump-row')).toHaveCount(0);
    await expect(page.locator('.jump-empty')).toHaveText(S.jumpNothing);

    await context.close();
  });

  test('picking one lands on that question, and Back returns', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, answersAllExcept(contextModules, TEXT_QUESTION, NEXT_QUESTION));
    const startedOn = await page.locator('.flow').getAttribute('data-step-id');

    await page.getByRole('button', { name: S.jumpOpen, exact: true }).click();
    await page.locator('#jump-query').fill('never');
    await page.locator('.jump-row').first().click();

    // Landed, and the sheet is gone with it.
    await expect(page.locator('.jump')).toHaveCount(0);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'never_words');

    /**
     * AND BACK RETURNS. A search that stranded somebody would be worse than
     * no search — the jump goes through the same `history` every other move
     * uses, so the way out is the one they already know.
     */
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', startedOn!);

    await context.close();
  });

  test('it filters the QUESTIONS and never the answers', async () => {
    const { context, sw, id } = await launchExtension();
    // Every answer in this fixture is "A test answer for <id>." — so a query
    // for a word that appears only in ANSWERS must find nothing.
    const page = await openMidInterview(context, sw, id, answersAllExcept(contextModules, TEXT_QUESTION, NEXT_QUESTION));
    await page.getByRole('button', { name: S.jumpOpen, exact: true }).click();

    await page.locator('#jump-query').fill('A test answer for');
    await expect(page.locator('.jump-row')).toHaveCount(0);

    await context.close();
  });
});

test.describe('BS-07a — the drawer chrome', () => {
  test('the mode buttons print their words, and the word IS the name', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    const brain = page.locator('.filedrawer-mode[data-mode="brain"]');
    const list = page.locator('.filedrawer-mode[data-mode="list"]');

    // PRINTED, not just announced. §7.1: "Make them labelled pills."
    await expect(brain.locator('.filedrawer-mode-word')).toHaveText(S.drawerModeBrain);
    await expect(list.locator('.filedrawer-mode-word')).toHaveText(S.drawerModeList);

    // And the accessible name is that same printed text — no `aria-label`
    // saying it a second time, because two names for one control agree today
    // and drift later.
    await expect(brain).not.toHaveAttribute('aria-label', /./);
    await expect(list).not.toHaveAttribute('aria-label', /./);
    await expect(page.getByRole('button', { name: S.drawerModeBrain, exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: S.drawerModeList, exact: true })).toHaveCount(1);

    // The 44px floor survives the change, on a control that grew a word.
    for (const control of [brain, list]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }

    // The chosen one is still told apart without colour: `aria-pressed`, and
    // a heavier word to go with the heavier glyph.
    await expect(list).toHaveAttribute('aria-pressed', 'true');
    await expect(brain).toHaveAttribute('aria-pressed', 'false');
    const chosenWeight = await list.locator('.filedrawer-mode-word').evaluate((el) => getComputedStyle(el).fontWeight);
    const otherWeight = await brain.locator('.filedrawer-mode-word').evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(chosenWeight)).toBeGreaterThan(Number(otherWeight));

    await context.close();
  });

  test('the peek says one true sentence instead of a sliced list', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    // The drawer opens at the peek, which is too short to be a list — one row
    // and part of another. That is a fact about the geometry, and core says so.
    expect(drawerShowsStatus(DRAWER_REST_HEIGHT)).toBe(true);
    expect(drawerListRows(DRAWER_REST_HEIGHT)).toBe(1);

    const status = page.locator('.filedrawer-status');
    await expect(status).toBeVisible();
    // No tree rows at all — the thing that was showing "0 of 4 · 0%" under a
    // trail that already named the section.
    await expect(page.locator('.filedrawer-body .filetree-row')).toHaveCount(0);

    // The sentence names sections, in the words the rest of the product uses.
    await expect(status).toContainText('of ' + String(contextOutline.length) + ' sections');

    await context.close();
  });

  test('one drag up and the list is back — the status line is a height, not a mode', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await expect(page.locator('.filedrawer-status')).toBeVisible();

    // Grow the drawer past two whole rows with the keyboard, which is the
    // path that does not depend on where a handle happens to be.
    const handle = page.locator('.filedrawer-handle');
    await handle.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(400);

    const height = await page.$eval('.filedrawer', (el) => Math.round(el.getBoundingClientRect().height));
    expect(drawerShowsStatus(height), `the drawer is ${height}px`).toBe(false);
    await expect(page.locator('.filedrawer-status')).toHaveCount(0);
    await expect(page.locator('.filedrawer-body .filetree-row')).not.toHaveCount(0);

    await context.close();
  });

  test('answering a question makes the line say how much longer the file got', async () => {
    const { context, sw, id } = await launchExtension();
    // Opens exactly on one text question, with everything else answered — so
    // this is about the file growing by that answer and nothing else.
    const page = await openMidInterview(context, sw, id, answersAllExcept(contextModules, TEXT_QUESTION, NEXT_QUESTION));
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', TEXT_QUESTION);

    const status = page.locator('.filedrawer-status');
    // Nothing was "just" added to a file somebody has only opened.
    await expect(status).toBeVisible();
    await expect(status).not.toContainText('just added');

    await page.locator('.flow textarea').first().fill('Cutting the reporting lag from days to hours.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.mouse.move(0, 0);
    await pastRunCard(page);

    // The file is longer, and the drawer says by how much — a fact about the
    // DOCUMENT, never a count of anything the person did.
    await expect(status).toContainText(/\d+ lines? just added/);

    await context.close();
  });
});
