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
//
// V2.5 VB-120 REBALANCES THE ENTRY (decision 2, CONFIRMED), and this file
// gains the two bypass truths without losing one R1-07 claim:
//  (a) an ASSISTED answer (the VB-119 sheet landed it — `assistedAt`
//      stamped at commit) never enters the recheck;
//  (b) an unassisted answer UNDER its kind's character threshold
//      (core/flow/assistThresholds.ts — multiline 80) skips it too, and
//      the AI Assist chip stands recommended instead;
//  (c) an unassisted answer at/over threshold reflects exactly as before —
//      every pre-existing test below is a (c) claim, its typed text grown
//      past the 80-character bar so it keeps meaning what it always meant.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchPanel(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  // VB-120 (a) walks the real INLINE assist (V2.8 VB-138), whose copy step
  // writes the clipboard.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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
  await page.getByRole('button', { name: 'Edit the file', exact: true }).focus();
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
 *
 * V2.5 VB-120: every raw a (c) caller hands this MUST run at least 80
 * characters — `stop_explaining` is multiline, and a shorter answer now
 * takes bypass (b) instead of landing here. The helper asserts it so a
 * future short string fails loudly at the source rather than as a
 * mysterious missing screen.
 */
async function driveToTextQuestion(page: Page): Promise<void> {
  // V2.3 VB-90: with the gate seeded the orientation ladder skips, so the
  // walk-in opens on context_scope — first tile ("Work"), keyboard-style
  // (V2.5 VB-118: that question's choices are icon tiles now).
  await page.locator('.flow .vpick .vpick-tile').first().focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.mouse.move(0, 0);
  // Q3: stop_explaining.
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
}

async function driveToReflect(page: Page, raw: string): Promise<void> {
  expect(raw.trim().length, 'VB-120: a (c) drive needs ≥80 characters — see driveToReflect').toBeGreaterThanOrEqual(80);
  await driveToTextQuestion(page);
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
  assistedAt?: Record<string, string>;
}> {
  return page.evaluate(async () => {
    const result = (await chrome.storage.local.get('wb:answers')) as Record<string, unknown>;
    return result['wb:answers'] as {
      values: Record<string, unknown>;
      reflectedAt: Record<string, string>;
      assistedAt?: Record<string, string>;
    };
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
    // VB-120: grown past the 80-char bar so this stays a (c) drive.
    await driveToReflect(page, 'Quarterly roadmap decks, and the backstory behind every number leadership asks about.');

    await expect(page.locator('.flow-q')).toHaveText('Just a quick check.');
    await expect(page.locator('.flow-reflect-lead')).toHaveText(
      "So you would say that right now, the thing you'd most like to stop explaining is…",
    );
    const quote = page.locator('.flow-reflect-quote');
    await expect(quote).toHaveText('Quarterly roadmap decks, and the backstory behind every number leadership asks about.');
    // Italic and unboxed — their words, not product chrome.
    expect(await quote.evaluate((el) => getComputedStyle(el).fontStyle)).toBe('italic');
    expect(await quote.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    await expect(page.locator('.flow-reflect-cta')).toContainText('use your ChatGPT chat to tighten it');

    await context.close();
  });

  test('Keep it as-is commits the raw text byte-identically', async () => {
    const { context, page } = await launchPanel();
    // VB-120: grown past the 80-char bar so this stays a (c) drive — the
    // double spaces and punctuation the claim is about are untouched.
    const raw = 'The history of a decision I keep  having to re-justify — "budget cuts", mostly. It comes back around every quarter.';
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
    // VB-120: grown past the 80-char bar so this stays a (c) drive.
    const raw = 'I keep re-explaining the project history and who owns what on my team. Every new vendor asks the same five questions.';
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
    // VB-120: both drafts grown past the 80-char bar — the redo commits an
    // unreflected answer through the same rebalanced entry, so a short
    // second draft would skip the replay this test is about.
    const firstDraft = 'A rough first pass at this answer, written quickly so I can come back and say it better.';
    await driveToReflect(page, firstDraft);

    await page.getByRole('button', { name: 'Say it again', exact: true }).click();
    // "same draft, no data lost" — pre-filled with exactly what was typed.
    await expect(page.locator('.flow textarea')).toHaveValue(firstDraft);

    const secondDraft = 'A tighter second pass — with punctuation, and  extra  spacing, grown past the bar on purpose.';
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
    // VB-120: grown past the 80-char bar so the resume still has a reflect
    // screen to land on.
    const raw = 'Something I typed and then closed the panel before deciding what to do with it. It should still be waiting.';
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

  /**
   * V2.5 VB-120 (a) — the AI Assist sheet landed this answer, so the
   * recheck is bypassed: the interview trusts what the interview built.
   * The landed text runs WELL past the 80-char bar on purpose — an
   * unassisted answer this long reflects (every (c) test above), so the
   * straight-through here is provably the assisted mark's doing, not the
   * threshold's.
   */
  test('VB-120 (a): an assisted answer never enters the recheck, and the commit stamps assistedAt', async () => {
    const { context, page } = await launchPanel();
    await driveToTextQuestion(page);

    // V2.8 VB-138 — the real INLINE walk: activate, copy (the step), and
    // the reopened box takes the reply where the sheet's box used to.
    await page.locator('.flow-assist').click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.assistbar')).toBeVisible();
    await page.locator('.assistbar-copy').click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.assistbar')).toHaveCount(0);
    const landed =
      'The project history, who owns which system, and the standing decisions I keep having to re-justify to every new stakeholder.';
    await page.locator('.flow textarea').fill(landed);
    await expect(page.locator('.flow textarea')).toHaveValue(landed);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.mouse.move(0, 0);

    // No recheck: the interview moves straight on.
    await expect(page.locator('.flow')).not.toHaveAttribute('data-position', 'reflect');
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'stop_explaining');

    // The value committed byte-identically, with the how recorded beside
    // the what — assistedAt, the reflectedAt convention exactly — and no
    // reflectedAt stamp, because no reflect ever ran.
    const answers = await storedAnswers(page);
    expect(answers.values.stop_explaining).toBe(landed);
    expect(typeof answers.assistedAt?.stop_explaining).toBe('string');
    expect(answers.reflectedAt.stop_explaining).toBeUndefined();

    await context.close();
  });

  /**
   * V2.5 VB-120 (b) — under the per-kind threshold, unassisted: no recheck,
   * and the AI Assist chip stands recommended instead — the one sanctioned
   * cue at its gentle cadence, wording that never names a deficiency
   * (GUARDRAILS' no-guilt-nudges; FLAG 3).
   */
  test('VB-120 (b): a short unassisted answer skips the recheck; the chip stands recommended, live and non-shaming', async () => {
    const { context, page } = await launchPanel();
    await driveToTextQuestion(page);

    // Empty draft: under threshold, unassisted — the chip reads
    // "(Recommended)" and its paint breathes the sanctioned pulse. The
    // label carries the state in words, never colour alone.
    const chip = page.locator('.flow-assist');
    const paint = page.locator('.flow-assist .flow-chip-paint');
    await expect(chip).toHaveText('AI Assist (Recommended)');
    await expect(paint).toHaveClass(/flow-highlight/);
    expect(await paint.evaluate((el) => getComputedStyle(el).animationName)).toBe('flow-highlight-pulse');

    // The judgement is LIVE on the draft (FLAG 3 — nothing stored): typing
    // past the bar retires the nudge mid-question…
    const long = 'A first pass that keeps going until it is clearly past the eighty character bar.';
    await page.locator('.flow textarea').fill(long);
    await expect(chip).toHaveText('AI Assist');
    await expect(paint).not.toHaveClass(/flow-highlight/);
    // …and cutting back under it brings the offer back.
    const short = 'Quarterly roadmap decks.';
    await page.locator('.flow textarea').fill(short);
    await expect(chip).toHaveText('AI Assist (Recommended)');

    // V2.8 VB-138 — the nudged chip stands the INLINE bar in its
    // encouraging register: an offer about a strong start, never a word
    // about the draft. Pressing the chip again puts the box back, draft
    // intact.
    await chip.click();
    await page.mouse.move(0, 0);
    const lead = page.locator('.assistbar-lead');
    await expect(lead).toHaveText('A quick AI interview can give you a strong start.');
    for (const accusation of ['short', 'too', 'more detail']) {
      expect(((await lead.textContent()) ?? '').toLowerCase()).not.toContain(accusation);
    }
    await chip.click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.assistbar')).toHaveCount(0);
    await expect(page.locator('.flow textarea')).toHaveValue(short);

    // Submitting the short answer: no recheck — bypass (b) — and nothing
    // pretends otherwise in storage: no reflectedAt, no assistedAt.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.flow')).not.toHaveAttribute('data-position', 'reflect');
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'stop_explaining');

    const answers = await storedAnswers(page);
    expect(answers.values.stop_explaining).toBe(short);
    expect(answers.reflectedAt.stop_explaining).toBeUndefined();
    expect(answers.assistedAt?.stop_explaining).toBeUndefined();

    await context.close();
  });
});
