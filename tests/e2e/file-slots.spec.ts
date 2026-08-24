import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { findPosition } from '../../src/core/flow/runner';
import { fileSectionRows, fileStartTarget } from '../../src/core/files/fileView';
import { fileFinished } from '../../src/core/files/slots';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.7 VB-36 (Home as file slots) and VB-37 (the file view), which are one
 * surface chain and so one spec.
 *
 * VB-36 accept: Home shows every slot with its status; the two that are not
 * built are LOCKED (Adam, 2026-08-24), not clickable, and say what unlocks
 * them in the row rather than in a tooltip.
 *
 * VB-37 accept: an active slot opens the file; from the file you can run the
 * interview for the whole thing OR click one section and do just that part,
 * landing on the right question in both cases; Back returns to Home.
 *
 * WHERE THE ARITHMETIC IS PROVEN. Which sections exist, which are doors and
 * where each door goes are pure folds tested without a browser
 * (src/core/files/fileView.test.ts, src/core/files/slots.test.ts). What is
 * argued here is only what is true of the running extension: that the panel
 * really renders those rows, that pressing them really moves the surface, and
 * that the question it lands on is the one the fold named. The expected
 * landing positions are IMPORTED from core rather than typed in, so a change
 * to the ported content moves the test with it instead of leaving it asserting
 * a stale id.
 *
 * Self-contained launch helpers, per this repo's one-spec-stands-alone
 * convention (see home.spec.ts and multiples.spec.ts).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

async function openHome(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  return page;
}

/** The file row itself. Anchored: VB-36's locked Skills.md row now also says
 * "Finish Context.md first", so an unanchored match is two buttons. */
const fileRow = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) });

/**
 * A part-written file: section 1 finished, section 2 begun, and one answer
 * away down in section 5 — so the sections split into reached and untouched,
 * and the section somebody would deep-link into is nowhere near where the
 * interview would resume.
 *
 * `reflectedAt` is stamped alongside every text answer for the reason
 * home.spec.ts's own fixture does: a text question with `interpret` set and no
 * reflection is "answered but not yet reflected", and `findPosition` routes
 * that to the reflect screen rather than treating it as done.
 */
function partlyWritten(): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  const stepsById = new Map<string, Step>();
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if (!('fields' in node)) stepsById.set(node.id, node);
    }
  }

  function record(id: string) {
    const step = stepsById.get(id);
    if (!step) throw new Error(`fixture drifted: ${id} is not a top-level step any more`);
    const key = step.key ?? step.id;
    let value: AnswerValue;
    if (step.kind === 'intro') value = null;
    else if (step.kind === 'yesno') value = 'yes';
    else if (step.kind === 'chips') value = step.options?.[0]?.v ?? 'x';
    else if (step.kind === 'multi') value = step.options?.length ? [step.options[0]!.v] : [];
    else value = `A test answer for ${step.id}.`;
    values[key] = value;
    answeredAt[key] = now;
    if (typeof value === 'string') reflectedAt[key] = now;
  }

  // 1. About This Context — every question in it.
  for (const id of contextOutline[0]!.questionIds) record(id);
  // 2. About Me — its first question only, so the section is begun.
  record('preferred_name');
  // 5. How I Think — its LAST question, so the section is reached but the
  // question its row opens to (its first) is still unanswered.
  record('thinking_style');

  return { values, repeatables: {}, answeredAt, reflectedAt };
}

/**
 * A file with nothing left to ask: every top-level question answered, both
 * gates said "no" and no role names picked, so no repeatable is left offering
 * an "is there another one?" screen. This is the one state where resuming
 * would resolve to `done` and bounce straight back to Home, and so the one
 * state where the whole-file button walks from the top instead.
 */
function nothingLeftToAsk(): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const key = node.key ?? node.id;
      let value: AnswerValue;
      if (node.id === 'entities_gate' || node.id === 'initiatives_gate') value = 'no';
      else if (node.id === 'role_names') value = [];
      else if (node.kind === 'intro') value = null;
      else if (node.kind === 'yesno') value = 'yes';
      else if (node.kind === 'chips') value = node.options?.[0]?.v ?? 'x';
      else if (node.kind === 'multi') value = node.options?.length ? [node.options[0]!.v] : [];
      else value = `A test answer for ${node.id}.`;
      values[key] = value;
      answeredAt[key] = now;
      if (typeof value === 'string') reflectedAt[key] = now;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

/** Whatever `Flow` would resume to, derived exactly as `Flow` derives it. */
function resumeStepId(answers: Answers): string {
  const position = findPosition(contextModules, answers, new Set(), new Set());
  if (position.kind !== 'step' && position.kind !== 'reflect') {
    throw new Error(`fixture drifted: the resume is a ${position.kind} screen, not a question`);
  }
  return position.step.id;
}

// ─────────────────────────────────────────────────────────── VB-36, the shelf

test.describe('VB-36 — Home is the set of files', () => {
  test('every file has a slot, with its status: Context.md open, Skills.md and Actions.md locked', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);

    const rows = page.locator('.home-filelist .filerow');
    await expect(rows).toHaveCount(3);
    // In build order, which is the order they get written in.
    await expect(rows.nth(0).locator('.nm')).toHaveText('Context.md');
    await expect(rows.nth(1).locator('.nm')).toHaveText('Skills.md');
    await expect(rows.nth(2).locator('.nm')).toHaveText('Actions.md');

    // The open one is a real control and says where the file stands.
    await expect(rows.nth(0)).toBeEnabled();
    await expect(rows.nth(0).locator('.sb')).toHaveText('Not built yet');

    // The two that are not built are locked, and each says what unlocks it —
    // in the row, as text, not in a title attribute a pointer has to hover.
    for (const n of [1, 2]) {
      await expect(rows.nth(n)).toBeDisabled();
      await expect(rows.nth(n)).toHaveClass(/locked/);
      await expect(rows.nth(n).locator('.badge')).toHaveText('Locked');
      await expect(rows.nth(n)).not.toHaveAttribute('title', /./);
    }
    await expect(rows.nth(1).locator('.sb')).toHaveText('Finish Context.md first');
    await expect(rows.nth(2).locator('.sb')).toHaveText('Finish Skills.md first');

    await context.close();
  });

  test('a locked slot cannot be pressed, cannot be tabbed to, and opens nothing', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);
    const skills = page.locator('.home-filelist .filerow').nth(1);

    // Clicked with the pointer, forced past Playwright's own actionability
    // check so this is a real "what happens if somebody hits it" rather than a
    // test that times out politely.
    await skills.click({ force: true });
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.fileview')).toHaveCount(0);
    await expect(page.locator('.flow')).toHaveCount(0);

    // And it is not in the tab order — a disabled button never is.
    await expect(skills).toHaveJSProperty('disabled', true);

    await context.close();
  });

  test('finishing Context.md stops the next slot telling somebody to finish Context.md', async () => {
    const { context, sw, id } = await launch();
    const answers = nothingLeftToAsk();
    // The claim only means something if the file really is finished.
    expect(fileFinished(contextOutline, contextModules, answers, new Date())).toBe(true);
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);

    const page = await openHome(context, id);
    const rows = page.locator('.home-filelist .filerow');
    // "Finish Context.md first" was true this morning and is an instruction
    // they have already carried out now, so the row says the thing that is
    // still true instead. Actions.md keeps waiting on a file that cannot be
    // finished, so its line does not move.
    await expect(rows.nth(1).locator('.sb')).toHaveText('Coming later');
    await expect(rows.nth(2).locator('.sb')).toHaveText('Finish Skills.md first');
    // Still locked. Finishing the file before it is not what unlocks it.
    await expect(rows.nth(1)).toBeDisabled();

    await context.close();
  });

  test('the locked rows are told apart by more than colour, and never by colour alone', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);
    const rows = page.locator('.home-filelist .filerow');

    // Four independent signals, any one of which survives on its own: a word
    // in the badge, a sentence in the row, a padlock, and a dashed edge.
    const locked = rows.nth(1);
    await expect(locked.locator('.badge')).toHaveText('Locked');
    await expect(locked.locator('.sb')).toHaveText(/Finish/);
    await expect(locked.locator('.ic svg')).toHaveCount(1);
    await expect(locked).toHaveCSS('border-style', 'dashed');
    // The open row is not dashed, so the edge really is a distinction.
    await expect(rows.nth(0)).toHaveCSS('border-style', 'solid');

    await context.close();
  });
});

// ──────────────────────────────────────────────────────── VB-37, the file view

test.describe('VB-37 — the file view', () => {
  test('an active slot opens the file, and Back returns to the shelf', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);

    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.fileview')).toBeVisible();
    await expect(page.locator('.home')).toHaveCount(0);
    await expect(page.locator('.fileview-title')).toHaveText('Context.md');
    // Every section of the file is on it, in file order.
    const rows = page.locator('.fileview-item');
    await expect(rows).toHaveCount(contextOutline.length);
    for (const [index, node] of contextOutline.entries()) {
      await expect(rows.nth(index).locator('.nm')).toHaveText(node.label);
    }

    // Back, from the keyboard, lands on the shelf again.
    const back = page.getByRole('button', { name: 'Back to your files', exact: true });
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.fileview')).toHaveCount(0);

    await context.close();
  });

  test('on a file nobody has started, the whole-file door is the only one, and it lands on question one', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.fileview')).toBeVisible();

    // Nothing has been reached, so no section is a link — and the screen says
    // why rather than leaving ten inert rows unexplained.
    await expect(page.locator('.fileview-row.is-static')).toHaveCount(contextOutline.length);
    await expect(page.locator('.fileview-row:not(.is-static)')).toHaveCount(0);
    await expect(page.locator('.fileview-hint')).toHaveText(
      'Each section opens once you have answered something in it.',
    );

    // The whole file, keyboard-only, landing on the flow's own first question.
    const go = page.getByRole('button', { name: 'Go through the questions', exact: true });
    await go.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toBeVisible();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', fileStartTarget(contextOutline)!);

    await context.close();
  });

  test('on a part-written file the two doors go to two different places, and each goes to the right one', async () => {
    const { context, sw, id } = await launch();
    const answers = partlyWritten();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);

    // What the pure fold says should happen, computed before the panel opens.
    const rows = fileSectionRows(contextOutline, contextModules, answers, new Date());
    const think = rows.find((r) => r.id === 'sec5')!;
    const resume = resumeStepId(answers);
    expect(think.target, 'the fixture no longer reaches 5. How I Think').not.toBe(null);
    expect(resume, 'the fixture no longer separates the two doors').not.toBe(think.target);

    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.fileview')).toBeVisible();

    // --- door one: the section. It opens THAT part, not the resume. ---
    const section = page.locator('.fileview-row[data-section-id="sec5"]');
    await expect(section).not.toHaveClass(/is-static/);
    await section.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toBeVisible();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', think.target!);

    // --- door two: the whole file. Same screen, and it resumes instead. ---
    const back = await openHome(context, id);
    await fileRow(back, 'Context\\.md').click();
    await expect(back.locator('.fileview')).toBeVisible();
    await back.getByRole('button', { name: 'Go through the questions', exact: true }).click();
    await expect(back.locator('.flow')).toHaveAttribute('data-step-id', resume);

    await context.close();
  });

  test('a file with nothing left to ask offers to go through it again, and really shows a question', async () => {
    const { context, sw, id } = await launch();
    const answers = nothingLeftToAsk();
    // The fixture is only interesting if it really is the "nothing to resume
    // to" state — a resume here would land on `done` and bounce back to Home.
    expect(findPosition(contextModules, answers, new Set(), new Set()).kind).toBe('done');
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);

    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.fileview')).toBeVisible();

    // The button says the true thing, and pressing it lands on a real
    // question rather than flashing the flow and returning to Home.
    await expect(page.getByRole('button', { name: 'Go through the questions', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Go through them again', exact: true }).click();
    await expect(page.locator('.flow')).toBeVisible();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', fileStartTarget(contextOutline)!);
    await expect(page.locator('.home')).toHaveCount(0);

    await context.close();
  });

  test('a section nobody has reached is not a door, and says so in a word as well as a shade', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), partlyWritten());
    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.fileview')).toBeVisible();

    // 6. How I Communicate is untouched in the fixture.
    const untouched = page.locator('.fileview-row[data-section-id="sec6"]');
    await expect(untouched).toHaveClass(/is-static/);
    // Not a button at all, so there is nothing to press and nothing to tab to.
    expect(await untouched.evaluate((el) => el.tagName)).toBe('DIV');
    await expect(page.locator('.fileview-item', { has: untouched }).locator('.sectionhealth-pill')).toHaveText(
      /Not yet/,
    );

    // While the section that IS reached is a real control with a real name.
    const reached = page.locator('.fileview-row[data-section-id="sec5"]');
    expect(await reached.evaluate((el) => el.tagName)).toBe('BUTTON');
    await expect(reached).toHaveAttribute('aria-label', 'Go to 5. How I Think');

    await context.close();
  });

  test('the file view stores nothing — a reopen lands on Home and re-derives', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), partlyWritten());
    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.fileview')).toBeVisible();

    const url = page.url();
    const keysWhileOpen = await sw.evaluate(() => chrome.storage.local.get(null));
    // The only keys are the ones that existed before this surface was opened.
    expect(Object.keys(keysWhileOpen).sort()).toEqual(['wb:answers']);

    await page.close();
    const reopened = await context.newPage();
    await reopened.setViewportSize({ width: 400, height: 760 });
    await reopened.goto(url);
    // Home, not the file — which surface you were on is never written down.
    await expect(reopened.locator('.home')).toBeVisible();
    await expect(reopened.locator('.fileview')).toHaveCount(0);

    await context.close();
  });
});
