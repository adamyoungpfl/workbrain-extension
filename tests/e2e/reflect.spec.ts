import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// R1-07 accept criteria (docs/RELEASE-1.md): "Open-text answers play back
// verbatim before committing. Keep / tighten with my AI / say it again.
// Accept: the played-back text is byte-identical to what was typed." See
// docs/TESTING.md for the launchPersistentContext pattern this mirrors from
// tests/e2e/flow.spec.ts — kept as its own file/self-contained launch
// helpers rather than importing from flow.spec.ts, matching how this repo
// keeps each spec file standalone.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchPanel(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const page = await openPanel(context);
  return { context, page };
}

/** R1-12: Home is the surface a fresh open lands on — see flow.spec.ts's
 * own header comment on this same change, kept duplicated here per this
 * repo's established "each spec file stays self-contained" convention. */
async function openPanel(context: BrowserContext): Promise<Page> {
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview now opens on the goal gate. This spec's
  // subject sits past it, so the walk-in seeds a passed gate — the same two
  // answers a person gives at minute one — and lands where it always did.
  await sw.evaluate(async () => {
    // Write-once: a reopen inside a test must never wipe what the panel has
    // written since (the mid-reflect resume test reopens through this path).
    const existing = await chrome.storage.local.get('wb:answers');
    if (existing['wb:answers']) return;
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      'wb:answers': {
        values: { goal_service: 'chatgpt', goal_want: 'Draft my Monday status update the way I would.' },
        repeatables: {},
        answeredAt: { goal_service: now, goal_want: now },
        reflectedAt: { goal_want: now },
      },
    });
  });
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
  return page;
}

/**
 * Drives the panel from the first question up to and including typing +
 * submitting `stop_explaining` — the first of the six interpret-bearing
 * questions (see docs/RELEASE-1.md R1-07 and core/flow/runner.test.ts's
 * comment on the full list) — landing on its reflect screen. `raw` is typed
 * byte-for-byte, deliberately including double spaces and punctuation a
 * naive trim/normalize would disturb, so callers can assert the played-back
 * text against it exactly.
 */
async function driveToReflect(page: Page, raw: string): Promise<void> {
  // Q1: intro (orientation) — Next alone advances it, nothing to answer.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // Q2: context_scope, a chip question — first pill ("Work"), keyboard-style.
  await page.locator('.flow .pillgroup .pill').first().focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // Q3: stop_explaining.
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
  await page.locator('.flow textarea').fill(raw);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-position', 'reflect');
}

/** Reads wb:answers straight from chrome.storage — the strongest possible
 * check that what got committed is byte-identical, independent of anything
 * the DOM happens to render. */
async function storedAnswers(page: Page): Promise<{
  values: Record<string, unknown>;
  reflectedAt: Record<string, string>;
}> {
  return page.evaluate(async () => {
    const result = (await chrome.storage.local.get('wb:answers')) as Record<string, unknown>;
    return result['wb:answers'] as { values: Record<string, unknown>; reflectedAt: Record<string, string> };
  });
}

test.describe('Reflect step (R1-07)', () => {
  /**
   * V2.3 VB-95 — the quick check: the per-question reframe leads, the
   * person's words come back in an italic quote with no box, and the
   * way-forward line names the AI they picked at the goal gate (the walk-in
   * seeds chatgpt). One string drives the printed line and the narrator
   * (reflectFrames.ts), so this pins the printed half.
   */
  test('the reflect screen is a quick check in their language, naming their AI', async () => {
    const { context, page } = await launchPanel();
    await driveToReflect(page, 'Quarterly roadmap decks.');

    await expect(page.locator('.flow-q')).toHaveText('Just a quick check.');
    await expect(page.locator('.flow-reflect-lead')).toHaveText(
      "So you would say that right now, the thing you'd most like to stop explaining is…",
    );
    const quote = page.locator('.flow-reflect-quote');
    await expect(quote).toHaveText('Quarterly roadmap decks.');
    // Italic and unboxed — their words, not product chrome.
    expect(await quote.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
    expect(await quote.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('.flow-reflect-cta')).toContainText('use your ChatGPT chat to tighten it');

    await context.close();
  });

  test('Keep it as-is commits the raw text byte-identically', async () => {
    const { context, page } = await launchPanel();
    const raw = 'The history of a decision I keep  having to re-justify — "budget cuts", mostly.';
    await driveToReflect(page, raw);

    // Played back verbatim before any commit happens.
    // V2.3 VB-95: the person's words play back in the unboxed quote, not a
    // ReadOnlyBlock — that chrome is for generated content.
    const blockText = await page.locator('.flow .flow-reflect-quote').textContent();
    expect(blockText).toContain(raw);

    // Keyboard-only through this new screen too, not just a click — CLAUDE.md's
    // definition of done requires the keyboard-only path on any changed screen.
    await page.getByRole('button', { name: 'Keep it as-is', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'stop_explaining');

    const answers = await storedAnswers(page);
    expect(answers.values.stop_explaining).toBe(raw);
    expect(typeof answers.reflectedAt.stop_explaining).toBe('string');

    await context.close();
  });

  test('Tighten it with my AI commits the pasted result instead of the raw text', async () => {
    const { context, page } = await launchPanel();
    const raw = 'I keep re-explaining the project history and who owns what on my team.';
    await driveToReflect(page, raw);

    await page.getByRole('button', { name: 'Tighten it with my AI', exact: true }).click();

    // The generated prompt is read-only and contains the raw answer verbatim.
    const promptText = await page.locator('.flow .readonly').first().textContent();
    expect(promptText).toContain(raw);

    const tightened = 'Project history, team ownership';
    await page.locator('.flow textarea').fill(tightened);
    await page.getByRole('button', { name: 'Use this instead', exact: true }).click();
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'stop_explaining');

    const answers = await storedAnswers(page);
    expect(answers.values.stop_explaining).toBe(tightened);
    expect(typeof answers.reflectedAt.stop_explaining).toBe('string');

    await context.close();
  });

  test('Say it again returns to the same draft, and the resubmitted text plays back byte-identically', async () => {
    const { context, page } = await launchPanel();
    const firstDraft = 'A rough first pass at this answer.';
    await driveToReflect(page, firstDraft);

    await page.getByRole('button', { name: 'Say it again', exact: true }).click();
    // "same draft, no data lost" — pre-filled with exactly what was typed.
    await expect(page.locator('.flow textarea')).toHaveValue(firstDraft);

    const secondDraft = 'A tighter second pass — with punctuation, and  extra  spacing.';
    await page.locator('.flow textarea').fill(secondDraft);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Back on the reflect screen, now playing back the NEW text, byte-identically.
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'reflect');
    const blockText = await page.locator('.flow .flow-reflect-quote').textContent();
    expect(blockText).toContain(secondDraft);
    expect(blockText).not.toContain(firstDraft);

    await page.getByRole('button', { name: 'Keep it as-is', exact: true }).click();
    const answers = await storedAnswers(page);
    expect(answers.values.stop_explaining).toBe(secondDraft);

    await context.close();
  });

  test('closing the panel mid-reflect and reopening resumes on the reflect screen with the draft intact', async () => {
    const { context, page } = await launchPanel();
    const raw = 'Something I typed and then closed the panel before deciding what to do with it.';
    await driveToReflect(page, raw);

    // Typed and submitted, but no reflect action chosen yet — this is the
    // reflectedAt design's whole point: the raw answer is already persisted
    // (never lost), but the question is not "done" until reflected.
    let answers = await storedAnswers(page);
    expect(answers.values.stop_explaining).toBe(raw);
    expect(answers.reflectedAt.stop_explaining).toBeUndefined();

    await page.close();
    const reopened = await openPanel(context);

    await expect(reopened.locator('.flow')).toHaveAttribute('data-position', 'reflect');
    await expect(reopened.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
    const blockText = await reopened.locator('.flow .flow-reflect-quote').textContent();
    expect(blockText).toContain(raw);

    // And it is still a live, actionable reflect screen, not a dead end.
    await reopened.getByRole('button', { name: 'Keep it as-is', exact: true }).click();
    answers = await storedAnswers(reopened);
    expect(answers.values.stop_explaining).toBe(raw);
    expect(typeof answers.reflectedAt.stop_explaining).toBe('string');

    await context.close();
  });
});
