import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { findPosition } from '../../src/core/flow/runner';
import { fileStartTarget } from '../../src/core/files/fileView';
import { fileAsked, fileFinished } from '../../src/core/files/slots';
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
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

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
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
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

test.describe('VB-36 — Home is the set of files (V2.6 VB-125b, the card grammar)', () => {
  test('every SHOWN file has its card, with its status: Context.md open, Skills.md locked', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);

    // V2.9 VB-146 — Adam: "let's hide it for now until we get through the
    // Context and Skills flow end to end." Actions' own row is GONE from the
    // shelf, along with every other place it appeared, from one list in
    // core/files/slots.ts (BETA_HIDDEN_SLOTS). Its derivations are all still
    // there and still tested — this is a fold in the interface, not a
    // deletion of the file.
    const contextCard = page.locator('.home-card[data-file="context"]');
    const skillsCard = page.locator('.home-card[data-file="skills"]');
    await expect(contextCard).toHaveCount(1);
    await expect(skillsCard).toHaveCount(1);
    await expect(page.locator('[data-file="actions"]')).toHaveCount(0);
    await expect(page.locator('.home')).not.toContainText('Actions.md');
    await expect(contextCard.locator('.home-card-file')).toHaveText('Context.md');
    await expect(skillsCard.locator('.home-card-file')).toHaveText('Skills.md');

    // The open one is a real control and says where the file stands.
    await expect(contextCard).toBeEnabled();
    await expect(contextCard.locator('.home-card-status')).toHaveText('Not built yet');

    // The one that is not built is locked, and says what holds it — in the
    // card, as text, not in a title attribute a pointer has to hover.
    await expect(skillsCard).toBeDisabled();
    await expect(skillsCard).toHaveClass(/is-locked/);
    await expect(skillsCard.locator('.home-card-pill')).toHaveText('Locked');
    await expect(skillsCard).not.toHaveAttribute('title', /./);
    await expect(skillsCard.locator('.home-card-reason')).toHaveText('Finish Context.md first');

    await context.close();
  });

  test('a locked card cannot be pressed, cannot be tabbed to, and opens nothing', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);
    const skills = page.locator('.home-card[data-file="skills"]');

    // Clicked with the pointer, forced past Playwright's own actionability
    // check so this is a real "what happens if somebody hits it" rather than a
    // test that times out politely.
    await skills.click({ force: true });
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.browse')).toHaveCount(0);
    await expect(page.locator('.flow')).toHaveCount(0);

    // And it is not in the tab order — a disabled button never is.
    await expect(skills).toHaveJSProperty('disabled', true);

    await context.close();
  });

  test('finishing Context.md stops the next card telling somebody to finish Context.md', async () => {
    const { context, sw, id } = await launch();
    const answers = nothingLeftToAsk();
    // The claim only means something if the file really is finished.
    expect(fileFinished(contextOutline, contextModules, answers, new Date())).toBe(true);
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);

    const page = await openHome(context, id);
    const skillsCard = page.locator('.home-card[data-file="skills"]');
    // V2.2 — this test used to pin the OPPOSITE: finished Context left Skills
    // at "Coming later", because its interview did not exist. It does now, so
    // finishing Context genuinely opens the door, saying the signed-off line.
    await expect(skillsCard).toBeEnabled();
    await expect(skillsCard.locator('.home-card-status')).toHaveText(
      'Ready when you are — about ten minutes',
    );
    // V2.9 VB-146: and Actions is still nowhere on the page, finished
    // Context or not.
    await expect(page.locator('.home')).not.toContainText('Actions.md');
    // And the finished Context card says so, with its bar genuinely full.
    await expect(page.locator('.home-card[data-file="context"] .home-card-status')).toHaveText('Current');

    await context.close();
  });

  test('the locked cards are told apart by more than colour, and never by colour alone', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);

    // Three independent signals, any one of which survives on its own: a word
    // in the pill, a sentence in the card, and a padlock.
    const locked = page.locator('.home-card[data-file="skills"]');
    await expect(locked.locator('.home-card-pill')).toHaveText('Locked');
    await expect(locked.locator('.home-card-reason')).toHaveText(/Finish/);
    await expect(locked.locator('.home-card-chip svg')).toHaveCount(1);

    // BS-06, Adam's D4 — THE DASHED EDGE IS GONE. It was a fourth signal and
    // it was the weakest one: §6 reads a dashed square as broken rather than
    // as waiting, and "dormant items become rows that explain when they
    // unlock, not dashed disabled squares" applies to the cards too. What
    // replaced it is the reason sentence, which says the same thing in words
    // somebody can act on. The edge is now the same edge the open card has.
    await expect(locked).toHaveCSS('border-style', 'solid');
    await expect(page.locator('.home-card[data-file="context"]')).toHaveCSS('border-style', 'solid');

    await context.close();
  });
});

// ─────────────────────────────────────────── VB-102/103, the browse canvas

/**
 * V2.4 VB-102 retired FileView: a file row on Home opens the BROWSE CANVAS —
 * the Brain on top, the List below, Edit as the one door into the interview.
 * VB-103: rows and orbs share one selection; a browse press selects, never
 * navigates (decision 7a). These are the retired surface's claims, restated
 * against the surface that replaced it.
 */
test.describe('VB-102 — the browse canvas', () => {
  test('an active slot opens the browse canvas, and Back returns to the shelf', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);

    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.browse')).toBeVisible();
    await expect(page.locator('.home')).toHaveCount(0);
    await expect(page.locator('.browse-title')).toHaveText('Context.md');
    // The Brain on top, the List below — one canvas, both representations.
    await expect(page.locator('.browse .brainglobe')).toBeVisible();
    await expect(page.locator('.browse .filetree-row[data-node-id]')).toHaveCount(contextOutline.length);

    // Back, from the keyboard, lands on the shelf again. Scoped to the
    // head: the globe's own nav band carries a Back of its own (the ladder).
    const back = page.locator('.browse-head').getByRole('button', { name: 'Back', exact: true });
    await back.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.browse')).toHaveCount(0);

    await context.close();
  });

  test('on a file nobody has started, Edit lands on the flow\'s own first question', async () => {
    const { context, id } = await launch();
    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.browse')).toBeVisible();

    const go = page.getByRole('button', { name: 'Edit the file', exact: true });
    await go.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toBeVisible();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', fileStartTarget(contextOutline)!);

    await context.close();
  });

  test('a row press SELECTS — the Brain mirrors it, and nothing navigates (VB-103)', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), partlyWritten());
    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.browse')).toBeVisible();

    const row = page.locator('.browse .filetree-row[data-node-id="sec5"] .filetree-nav');
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    await row.click();
    // Still the browse canvas — a browse press never enters the interview.
    await expect(page.locator('.browse')).toBeVisible();
    await expect(page.locator('.flow')).toHaveCount(0);
    // The row lights as the selection…
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.browse .filetree-row[data-node-id="sec5"]')).toHaveClass(/is-selected/);
    // …and the Brain flew into the same section (the pin press path).
    await expect(page.locator('.browse .brainglobe')).toHaveAttribute('data-inside', 'true');

    await context.close();
  });

  test('on a part-written file, Edit resumes exactly where the interview left off', async () => {
    const { context, sw, id } = await launch();
    const answers = partlyWritten();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);
    const resume = resumeStepId(answers);

    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', resume);

    await context.close();
  });

  test('a file with nothing left to ask restarts from question one rather than bouncing off done', async () => {
    const { context, sw, id } = await launch();
    const answers = nothingLeftToAsk();
    expect(findPosition(contextModules, answers, new Set(), new Set()).kind).toBe('done');
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);

    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    // One door whatever the file's state (VB-102): Edit, and on a finished
    // file it shows a real question instead of flashing the flow and
    // returning to Home.
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await expect(page.locator('.flow')).toBeVisible();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', fileStartTarget(contextOutline)!);
    await expect(page.locator('.home')).toHaveCount(0);

    await context.close();
  });

  test('the browse canvas stores nothing — a reopen lands on Home and re-derives', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), partlyWritten());
    const page = await openHome(context, id);
    await fileRow(page, 'Context\\.md').click();
    await expect(page.locator('.browse')).toBeVisible();

    const url = page.url();
    const keysWhileOpen = await sw.evaluate(() => chrome.storage.local.get(null));
    expect(Object.keys(keysWhileOpen).sort()).toEqual(['wb:answers']);

    await page.close();
    const reopened = await context.newPage();
    await reopened.setViewportSize({ width: 400, height: 760 });
    await reopened.goto(url);
    await expect(reopened.locator('.home')).toBeVisible();
    await expect(reopened.locator('.browse')).toHaveCount(0);

    await context.close();
  });
});

/* ── O3 (Adam, 2026-08-27) — a skip must not lock the next file ────────────
   Every question in the interview is skippable, and a skip writes `null` — a
   recorded answer that `core/recommend/engine.ts` deliberately never
   re-raises. The Skills door used to read `fileFinished`, so one press of
   Skip locked Skills.md permanently, with nothing to say which question it
   was and no route back. The doors read `fileAsked` now. */
test.describe('O3 — the door opens on "nothing left to ask"', () => {
  /** A finished interview with exactly one question passed on. */
  function withOneSkip(): Answers {
    const answers = nothingLeftToAsk();
    answers.values['professional_name'] = null;
    return answers;
  }

  test('a skipped question still opens Skills — the interview is over', async () => {
    const { context, sw, id } = await launch();
    const seeded = withOneSkip();
    // The two folds really do disagree about this file, which is the whole
    // reason the decision existed.
    expect(fileAsked(contextOutline, contextModules, seeded, new Date())).toBe(true);
    expect(fileFinished(contextOutline, contextModules, seeded, new Date())).toBe(false);
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), seeded);

    const page = await openHome(context, id);
    const skills = page.locator('.home-card[data-file="skills"]');
    await expect(skills).toBeEnabled();
    await expect(skills).not.toHaveClass(/is-locked/);
    // And it no longer tells somebody who finished the interview to finish it.
    await expect(page.locator('.home-duo')).not.toContainText('Finish Context.md first');

    await context.close();
  });

  test('the file still reports the gap honestly — the door moved, the truth did not', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), withOneSkip());

    const page = await openHome(context, id);
    // The Context card speaks in freshness and section counts, and a section
    // holding a skip is not "done" — so nothing here claims the file is
    // gapless just because the door opened.
    await expect(page.locator('.home-card[data-file="context"]')).not.toContainText('10 of 10');

    await context.close();
  });

  test('an UNFINISHED interview still keeps the door shut', async () => {
    // The change must not open the door early: unanswered is not skipped.
    const { context, sw, id } = await launch();
    const answers = nothingLeftToAsk();
    delete answers.values['professional_name'];
    delete answers.answeredAt['professional_name'];
    expect(fileAsked(contextOutline, contextModules, answers, new Date())).toBe(false);
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);

    const page = await openHome(context, id);
    await expect(page.locator('.home-card[data-file="skills"]')).toBeDisabled();
    await expect(page.locator('.home-duo')).toContainText('Finish Context.md first');

    await context.close();
  });
});
