import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';
import {
  ASSIST_ENCOURAGING_LEAD,
  ASSIST_LINE_COPY,
  ASSIST_LINE_RETURN,
  assistPasteLine,
} from '../../src/core/flow/assistCopy';

/**
 * V2.3 VB-94 built interview-me as an inline disclosure; V2.4 VB-107 as an
 * anchored popover; V2.5 VB-119 grows it up into **AI Assist** — the
 * popover's own tolerance note said it would die to this slice, and this
 * file is the prophecy fulfilled. The new truth it pins:
 *
 *  - the helper chip is named AI Assist, wears the drawn bubble-and-spark,
 *    and is a real 44px target;
 *  - pressing it DIMS the app and opens a FULL-HEIGHT SHEET — the
 *    guardrail-sanctioned mechanism (components/Sheet.tsx: role="dialog"
 *    aria-modal="false" and nothing beyond it, Escape closes, focus returns
 *    to the chip) — walking a three-step mini-interview, each step one
 *    short narrated line (core/flow/assistCopy.ts);
 *  - step 1 shows the exact prompt (interviewMePrompt, BYTE-IDENTICAL core:
 *    question verbatim, the goal, the concrete-specifics ask, the
 *    per-service line) in ReadOnlyBlock's trust chrome, with the copy
 *    control glowing via the flow's one sanctioned cue; copy auto-advances;
 *  - step 2 names THEIR AI (goalServiceLabelFor — the reflect voice line's
 *    own resolver), opens a plain door to it (assistServices.ts's URL map),
 *    and shows the generic drawn paste-and-send — no vendor UI;
 *  - step 3 takes the reply in a highlighted box IN THE SHEET; submit runs
 *    the existing normalizePastedReply path, closes the sheet, lands the
 *    text in the question's answer input — ordinary editable text — and the
 *    input pulses ONCE (the VB-106/107 wiring, reused and then retired by
 *    its own first iteration);
 *  - the fenced-paste round trip straight into the FIELD is unchanged, an
 *    ordinary paste is never touched, and a hand paste never starts a pulse;
 *  - reduced motion: every cue's still form carries the instruction;
 *  - axe finds nothing wrong with the sheet open.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchPanel(
  options: { reducedMotion?: 'reduce' } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  // For the real-copy/paste tests: the page reads and writes the clipboard.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview opens on the goal gate; this spec's subject
  // sits past it, so the walk-in seeds a passed gate — which also gives the
  // prompt a goal to ground itself in and (VB-119) a service to name and
  // open.
  await sw.evaluate(async () => {
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
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: options.reducedMotion });
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  return { context, page };
}

/** Seeded gates land on context_scope (pill + Next) — landing on
 * `stop_explaining`, the first multiline text question. The pointer parks
 * after the screen-swapping click: stationary hover HOLDS cues by design. */
async function goToTextQuestion(page: Page): Promise<void> {
  await page.locator('.flow .pillgroup .pill').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.mouse.move(0, 0);
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
}

/** A REAL paste — clipboard written, then the paste keystroke — so both
 * branches of the field's onPaste handler are proven against the browser's
 * own default action, not against a synthetic event that has none. */
async function pasteInto(page: Page, selector: string, text: string): Promise<void> {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await page.locator(selector).focus();
  await page.keyboard.press('ControlOrMeta+V');
}

const CHIP = '.flow-assist';
const SHEET = '.sheet-card.assist-sheet';

/** Open the sheet from the chip. */
async function openSheet(page: Page): Promise<void> {
  await page.locator(CHIP).click();
  await page.mouse.move(0, 0);
  await expect(page.locator(SHEET)).toBeVisible();
}

test.describe('VB-119 — AI Assist: the paused mini-interview', () => {
  test('the chip is AI Assist — drawn icon, 44px target — and opens a full-height sheet that dims the app', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);

    // VB-120: with the draft empty — under the multiline threshold,
    // unassisted — the chip stands in its recommended posture; its plain
    // name is the over-threshold state, pinned in reflect.spec.ts's (b).
    const chip = page.getByRole('button', { name: S.assistRecommended, exact: true });
    await expect(chip).toBeVisible();
    // The drawn bubble-and-spark rides inside the chip's paint.
    await expect(page.locator(`${CHIP} .assist-bubble`)).toBeVisible();
    await expect(page.locator(`${CHIP} .assist-spark`)).toBeVisible();
    // VB-106's split survives the rename: the paint is a bubble chip, the
    // box you press is still the full accessibility floor.
    const box = await chip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    await openSheet(page);

    // FULL-HEIGHT: the card runs the whole panel — Adam's pause, built as
    // the sanctioned sheet rather than beside it.
    const card = (await page.locator(SHEET).boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(card.height).toBeGreaterThanOrEqual(viewport.height - 2);
    // …and the backdrop dims whatever shows behind it.
    const dim = await page
      .locator('.sheet-backdrop')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(dim).toMatch(/rgba\(/);

    // The sanctioned semantics, and NOTHING beyond them: a non-modal
    // dialog, exactly what Sheet has always been.
    await expect(page.locator(SHEET)).toHaveAttribute('role', 'dialog');
    await expect(page.locator(SHEET)).toHaveAttribute('aria-modal', 'false');

    await context.close();
  });

  test('step 1 — the line, the exact prompt in trust chrome, the glowing copy control; copy advances', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const question = ((await page.locator('.flow-q').textContent()) ?? '').trim();
    // VB-120: a draft past the threshold makes this the ORDINARY open —
    // the encouraging lead belongs to the nudged open alone (its own
    // claims live in reflect.spec.ts's (b) and below in this file).
    await page
      .locator('.flow textarea')
      .fill('A substantial draft, comfortably past the eighty character bar, kept for the sheet.');
    await openSheet(page);

    // The step line — printed exactly as core authors it (the narrator
    // reads the same string; the two can never drift).
    await expect(page.locator(`${SHEET} .assist-line`)).toHaveText(ASSIST_LINE_COPY);
    // The ordinary open is NOT the encouraging variant (that wording
    // belongs to VB-120's nudge).
    await expect(page.locator(`${SHEET} .assist-lead`)).toHaveCount(0);

    // The prompt, seen in full before it goes anywhere (GUARDRAILS), in
    // ReadOnlyBlock's trust chrome — the question verbatim, the fence
    // instruction, their goal, and V2.4's additions, all byte-identical
    // core (interviewMe.ts untouched by this slice).
    const prompt = (await page.locator(`${SHEET} .readonly`).textContent()) ?? '';
    expect(question.length).toBeGreaterThan(10);
    expect(prompt).toContain(question);
    expect(prompt).toContain('three backticks');
    expect(prompt).toContain('Draft my Monday status update the way I would.');
    expect(prompt).toContain('Before you write');
    expect(prompt).toContain('real names');
    expect(prompt).toContain('ChatGPT');

    // THE ONE SANCTIONED CUE, on the copy control: the words above say
    // what, the glow says where.
    const copy = page.locator(`${SHEET} .assist-copy`);
    await expect(copy).toHaveClass(/flow-highlight/);
    expect(await copy.evaluate((el) => getComputedStyle(el).animationName)).toBe('flow-highlight-pulse');

    // Copy really copies, and completing the copy completes the step.
    await copy.click();
    await page.mouse.move(0, 0);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('three backticks');
    await expect(page.locator(`${SHEET} .assist-steps`)).toHaveAttribute('data-assist-step', '2');

    await context.close();
  });

  test('step 2 — their AI named, a real door to it, the drawn paste-and-send; started advances', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    await openSheet(page);
    await page.locator(`${SHEET} .assist-copy`).click();
    await page.mouse.move(0, 0);

    // The line names THEIR AI — the goal gate's service, resolved by the
    // same goalServiceLabelFor the reflect voice line uses.
    await expect(page.locator(`${SHEET} .assist-line`)).toHaveText(assistPasteLine('ChatGPT'));

    // The door: a plain anchor to the service's public front page, opening
    // in the browser — never a hand-off, nothing sent (assistServices.ts).
    const link = page.locator(`${SHEET} .assist-link`);
    await expect(link).toHaveText(S.assistOpenService('ChatGPT'));
    await expect(link).toHaveAttribute('href', 'https://chatgpt.com/');
    await expect(link).toHaveAttribute('target', '_blank');
    const linkBox = await link.boundingBox();
    expect(linkBox!.height).toBeGreaterThanOrEqual(44);

    // The GENERIC drawn scene — composer, pasted lines, circled send arrow;
    // its beats loop (reduced motion gets the finished still — own test).
    await expect(page.locator(`${SHEET} .assist-scene`)).toBeVisible();
    const anim = await page
      .locator(`${SHEET} .assist-scene-paste`)
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('assist-paste-in');

    await page.getByRole('button', { name: S.assistStarted, exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(page.locator(`${SHEET} .assist-steps`)).toHaveAttribute('data-assist-step', '3');

    await context.close();
  });

  test('step 3 — the highlighted box takes the reply; submit lands it in the answer input, editable, one pulse', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const field = page.locator('.flow textarea').first();
    await openSheet(page);
    await page.locator(`${SHEET} .assist-copy`).click();
    await page.getByRole('button', { name: S.assistStarted, exact: true }).click();
    await page.mouse.move(0, 0);

    await expect(page.locator(`${SHEET} .assist-line`)).toHaveText(ASSIST_LINE_RETURN);
    const box = page.locator('#assist-reply');
    // Highlighted while empty — the cue says which box — and focused, so
    // the very next keystroke is the paste itself.
    await expect(box).toHaveClass(/flow-highlight/);
    await expect(box).toBeFocused();

    // The round trip: narration + two fences — the LAST fence is the
    // answer, bullets come off (normalizePastedReply, the existing path).
    await pasteInto(
      page,
      '#assist-reply',
      ['Here is a draft:', '```', 'Draft one.', '```', 'Tightened:', '```text', '- I translate vague asks into specs.', '- I keep scope honest.', '```'].join(
        '\n',
      ),
    );
    await expect(box).not.toHaveClass(/flow-highlight/);
    await page.getByRole('button', { name: S.assistUse, exact: true }).click();
    await page.mouse.move(0, 0);

    // The sheet closes; the text lands in the question's own input,
    // normalized, as ordinary editable text.
    await expect(page.locator(SHEET)).toHaveCount(0);
    await expect(field).toHaveValue('I translate vague asks into specs.\nI keep scope honest.');

    // THE LANDING PULSE — the VB-106/107 wiring reused: the one sanctioned
    // cue, saying where the answer landed…
    await expect(field).toHaveClass(/flow-highlight/);
    expect(await field.evaluate((el) => getComputedStyle(el).animationName)).toBe('flow-highlight-pulse');
    // …and it pulses ONCE: the first iteration retires it (1.7s cadence —
    // give it two).
    await expect(field).not.toHaveClass(/flow-highlight/, { timeout: 5000 });

    // Still an ordinary field: click into the frame and type.
    await field.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' And I sign my work.');
    await expect(field).toHaveValue(/And I sign my work\.$/);

    await context.close();
  });

  test('FLAG 1 — the sheet is the sanctioned overlay: Escape closes, backdrop closes, focus returns to the chip', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const chip = page.locator(CHIP);

    // Escape, from wherever focus is inside the sheet.
    await openSheet(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(SHEET)).toHaveCount(0);
    await expect(chip).toBeFocused();

    // The backdrop press is the person moving on.
    await openSheet(page);
    await page.locator('.sheet-backdrop').click({ position: { x: 4, y: 4 } });
    await expect(page.locator(SHEET)).toHaveCount(0);

    // The close control works too, and hands focus home the same way.
    await openSheet(page);
    await page.locator('.sheet-close').click();
    await expect(page.locator(SHEET)).toHaveCount(0);
    await expect(chip).toBeFocused();

    // And nothing was lost: the question is exactly where they left it.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');

    await context.close();
  });

  test('keyboard-only: the whole walk, from chip to landed answer', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);

    // Reach and open the chip by keyboard.
    await page.locator(CHIP).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(SHEET)).toBeVisible();

    // Focus moved into the sheet (Sheet's contract: its first focusable).
    const inSheet = await page.evaluate(
      (sel) => document.querySelector(sel)!.contains(document.activeElement),
      SHEET,
    );
    expect(inSheet).toBe(true);

    // Tab to the glowing copy control and press it.
    await page.locator(`${SHEET} .assist-copy`).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(`${SHEET} .assist-steps`)).toHaveAttribute('data-assist-step', '2');

    // Step 2 rescued focus onto its own advance — Enter continues.
    await expect(page.getByRole('button', { name: S.assistStarted, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');

    // Step 3 focused the box itself; type (a paste would do the same).
    await expect(page.locator('#assist-reply')).toBeFocused();
    await page.keyboard.type('An answer talked out of me, typed back in.');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: S.assistUse, exact: true })).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator(SHEET)).toHaveCount(0);
    await expect(page.locator('.flow textarea').first()).toHaveValue(
      'An answer talked out of me, typed back in.',
    );
    // Focus came home to the chip — the person is exactly where they were.
    await expect(page.locator(CHIP)).toBeFocused();

    await context.close();
  });

  test('the fenced-paste path into the FIELD is unchanged: plain untouched, fenced normalized, no pulse', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const field = '.flow textarea';

    // Ordinary paste: no fence, no interference — byte-identical.
    await pasteInto(page, field, 'My own words, pasted plain.');
    await expect(page.locator(field)).toHaveValue('My own words, pasted plain.');

    // Fenced paste straight into the field (the VB-94 round trip without
    // the sheet): the LAST fence is the answer, bullets come off, it
    // REPLACES the field.
    const reply = ['Sure:', '```', 'Draft.', '```', 'Final:', '```text', '- One.', '- Two.', '```'].join('\n');
    await pasteInto(page, field, reply);
    await expect(page.locator(field)).toHaveValue('One.\nTwo.');

    // A hand paste never starts a pulse — the landing pulse belongs to the
    // sheet's submit alone (VB-119); after a reply has landed by hand there
    // is nothing left to point at.
    await expect(page.locator(field)).not.toHaveClass(/flow-highlight/);

    await context.close();
  });

  test('reduced motion: every cue is a steady mark that still carries the instruction', async () => {
    const { context, page } = await launchPanel({ reducedMotion: 'reduce' });
    await goToTextQuestion(page);
    await openSheet(page);

    // Step 1's copy control: same class, no animation, a steady ring.
    const copy = page.locator(`${SHEET} .assist-copy`);
    const still = await copy.evaluate((el) => {
      const style = getComputedStyle(el);
      return { animation: style.animationName, shadow: style.boxShadow };
    });
    expect(still.animation).toBe('none');
    expect(still.shadow).not.toBe('none');

    await copy.click();
    await page.mouse.move(0, 0);

    // Step 2's scene: the loop is off and the finished frame shows both
    // beats — lines already in the composer, send control present — while
    // the printed line above carries the instruction in words.
    for (const part of ['.assist-scene-paste', '.assist-scene-send']) {
      const anim = await page.locator(`${SHEET} ${part}`).evaluate((el) => getComputedStyle(el).animationName);
      expect(anim, part).toBe('none');
      await expect(page.locator(`${SHEET} ${part}`)).toBeVisible();
    }

    await page.getByRole('button', { name: S.assistStarted, exact: true }).click();
    await page.locator('#assist-reply').fill('Steady, not spinning.');
    await page.getByRole('button', { name: S.assistUse, exact: true }).click();

    // The landing mark on the input: the steady ring, present from the
    // first frame — and with no iterations to retire it, it stays until the
    // person acts on the field, which is the still form of "it landed
    // here".
    const field = page.locator('.flow textarea').first();
    await expect(field).toHaveClass(/flow-highlight/);
    const fieldStill = await field.evaluate((el) => {
      const style = getComputedStyle(el);
      return { animation: style.animationName, shadow: style.boxShadow };
    });
    expect(fieldStill.animation).toBe('none');
    expect(fieldStill.shadow).not.toBe('none');
    await field.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' More.');
    await expect(field).not.toHaveClass(/flow-highlight/);

    await context.close();
  });

  test('axe finds no violations with the sheet open, on every step', async () => {
    const { context, page } = await launchPanel({ reducedMotion: 'reduce' });
    await goToTextQuestion(page);
    await openSheet(page);

    // Same tags as rephrase.a11y.spec.ts; the scan covers the whole page —
    // the open sheet AND the dimmed app behind it.
    const scan = () =>
      new AxeBuilder({ page })
        .include('.flow')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

    expect((await scan()).violations).toEqual([]);

    await page.locator(`${SHEET} .assist-copy`).click();
    await page.mouse.move(0, 0);
    expect((await scan()).violations).toEqual([]);

    await page.getByRole('button', { name: S.assistStarted, exact: true }).click();
    await page.mouse.move(0, 0);
    expect((await scan()).violations).toEqual([]);

    await context.close();
  });

  test('VB-120 preview: the encouraging lead is authored and never shames (wiring lands with the nudge)', async () => {
    // The wording variant ships with the sheet (assistCopy.ts) and its
    // no-deficiency law is pinned in assistCopy.test.ts; this line keeps
    // the e2e layer honest about which register the lead is in.
    expect(ASSIST_ENCOURAGING_LEAD.toLowerCase()).not.toContain('short');
    expect(ASSIST_ENCOURAGING_LEAD.toLowerCase()).not.toContain('too');
  });
});
