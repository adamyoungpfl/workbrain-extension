import { test, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';
import { ASSIST_ENCOURAGING_LEAD, ASSIST_LINE_RETURN, assistBarLine } from '../../src/core/flow/assistCopy';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V2.3 VB-94 built interview-me inline; V2.4 VB-107 as a popover; V2.5
 * VB-119 as a full-height sheet; V2.8 VB-138 brings it HOME — inline and
 * single-step, the sheet retired (Adam: "handle it all in the single
 * step"). The truth this file pins now:
 *
 *  - the chip is AI Assist, drawn bubble-and-spark, a real 44px target;
 *  - pressing it COLLAPSES the answer box and stands the bar in its spot:
 *    the "AI Assist Activated" tag, one instruction line saying the whole
 *    journey with the icon-led copy control at its end, a plain door to
 *    their AI (decision 6), and the FULL prompt behind an expander —
 *    present, never assumed read, still ReadOnlyBlock's trust chrome;
 *  - pressing the chip again puts the box back: changing your mind costs
 *    nothing, at every point;
 *  - COPYING IS THE STEP: the clipboard really carries the prompt, the tag
 *    clears, and the box reopens in the same spot wearing the paste
 *    instruction and the one sanctioned highlight;
 *  - a fenced paste lands normalized as ordinary editable text; Next
 *    stamps `assistedAt` at commit (V2.5's semantics, untouched);
 *  - the fenced-paste path straight into the field is unchanged;
 *  - reduced motion keeps every instruction; axe finds nothing wrong.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchPanel(
  options: { reducedMotion?: 'reduce' } = {},
): Promise<{ context: BrowserContext; page: Page; sw: Worker }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  // For the real-copy/paste tests: the page reads and writes the clipboard.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview opens on the goal gate; this spec's subject
  // sits past it, so the walk-in seeds a passed gate — which also gives the
  // prompt a goal to ground itself in and a service to name and open.
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
  return { context, page, sw };
}

/** Seeded gates land on context_scope (tile + Next) — landing on
 * `stop_explaining`, the first multiline text question. The pointer parks
 * after the screen-swapping click: stationary hover HOLDS cues by design. */
async function goToTextQuestion(page: Page): Promise<void> {
  await page.locator('.flow .vpick .vpick-tile').first().click();
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
const BAR = '.assistbar';

/** Stand the bar from the chip. */
async function activate(page: Page): Promise<void> {
  await page.locator(CHIP).click();
  await page.mouse.move(0, 0);
  await expect(page.locator(BAR)).toBeVisible();
}

test.describe('VB-138 — AI Assist, inline and single-step', () => {
  test('the chip stands the bar in the box\'s spot — tag, line, collapsed prompt — and is its own way back', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);

    // VB-120: with the draft empty the chip stands recommended; the drawn
    // bubble-and-spark rides in its paint, and the box you press is the
    // full accessibility floor.
    const chip = page.getByRole('button', { name: S.assistRecommended, exact: true });
    await expect(chip).toBeVisible();
    await expect(page.locator(`${CHIP} .assist-bubble`)).toBeVisible();
    await expect(page.locator(`${CHIP} .assist-spark`)).toBeVisible();
    const box = await chip.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    await activate(page);

    // The box collapsed; the tag marks the spot; the line says the whole
    // journey with their AI named (goalServiceLabelFor's resolution).
    await expect(page.locator('.flow textarea')).toHaveCount(0);
    await expect(page.locator('.assistbar-tag')).toHaveText(S.assistActivated);
    await expect(page.locator('.assistbar-line')).toHaveText(assistBarLine('ChatGPT'));
    // No sheet, no dialog, no dimming — this all happens in the flow.
    await expect(page.locator('.sheet-card')).toHaveCount(0);

    // The full prompt is PRESENT but never assumed read: behind the
    // expander, collapsed by default.
    const expander = page.getByRole('button', { name: S.assistReadPrompt, exact: true });
    await expect(expander).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`${BAR} .readonly`)).toHaveCount(0);

    // The door to their AI: a plain anchor, nothing sent (decision 6).
    const link = page.locator('.assistbar-link');
    await expect(link).toHaveText(S.assistOpenService('ChatGPT'));
    await expect(link).toHaveAttribute('href', 'https://chatgpt.com/');
    await expect(link).toHaveAttribute('target', '_blank');

    // And the chip is the way back out: press it again, the box returns.
    await page.locator(CHIP).click();
    await page.mouse.move(0, 0);
    await expect(page.locator(BAR)).toHaveCount(0);
    await expect(page.locator('.flow textarea')).toBeVisible();

    await context.close();
  });

  test('the expander shows the exact prompt in trust chrome — the question verbatim, the goal, the service line', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const question = ((await page.locator('.flow-q').textContent()) ?? '').trim();
    await activate(page);

    await page.getByRole('button', { name: S.assistReadPrompt, exact: true }).click();
    await expect(page.getByRole('button', { name: S.assistReadPrompt, exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const prompt = (await page.locator(`${BAR} .readonly`).textContent()) ?? '';
    expect(question.length).toBeGreaterThan(10);
    expect(prompt).toContain(question);
    expect(prompt).toContain('three backticks');
    expect(prompt).toContain('Draft my Monday status update the way I would.');
    expect(prompt).toContain('Before you write');
    expect(prompt).toContain('real names');
    expect(prompt).toContain('ChatGPT');

    await context.close();
  });

  test('copying is the step: the clipboard carries the prompt, the tag clears, the box reopens as the paste spot', async () => {
    const { context, page, sw } = await launchPanel();
    await goToTextQuestion(page);
    await activate(page);

    await page.locator('.assistbar-copy').click();
    await page.mouse.move(0, 0);

    // The clipboard really carries the prompt.
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('three backticks');

    // The bar and its tag are gone; the box stands in the same spot,
    // highlighted, wearing the paste instruction.
    await expect(page.locator(BAR)).toHaveCount(0);
    const field = page.locator('.flow textarea').first();
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute('placeholder', ASSIST_LINE_RETURN);
    await expect(field).toHaveClass(/flow-highlight/);

    // V2.9 VB-148 — Adam: "have a glowing highlight on the box and have the
    // cursor active." The cursor is really IN it: this is the one focus move
    // docs/GUARDRAILS.md's "nothing steals focus" allows, because it is the
    // answer to the person's own press — they asked for the prompt, and what
    // comes back is a box waiting for the paste.
    await expect(field).toBeFocused();
    // The glow is painted, not just a class name.
    const glow = await field.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(glow).not.toBe('none');

    // The round trip: the fenced reply lands normalized, ordinary and
    // editable; the highlight retires when something lands.
    await pasteInto(
      page,
      '.flow textarea',
      ['Here is a draft:', '```', 'Draft one.', '```', 'Tightened:', '```text', '- I translate vague asks into specs.', '- I keep scope honest.', '```'].join('\n'),
    );
    await expect(field).toHaveValue('I translate vague asks into specs.\nI keep scope honest.');
    await expect(field).not.toHaveClass(/flow-highlight/, { timeout: 5000 });
    await field.focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' And I sign my work.');
    await expect(field).toHaveValue(/And I sign my work\.$/);

    // V2.5's semantics, untouched by the new clothes: Next stamps
    // assistedAt at commit — the durable mark the recheck reads.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'stop_explaining');
    const stored = (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'])) as Answers;
    expect(stored.assistedAt?.['stop_explaining']).toBeTruthy();

    await context.close();
  });

  test('not liking the answer costs nothing: the chip re-activates, and the draft survives the round trip', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    await activate(page);
    await page.locator('.assistbar-copy').click();
    await page.mouse.move(0, 0);

    const field = page.locator('.flow textarea').first();
    await pasteInto(page, '.flow textarea', 'A first try I do not love.');
    await expect(field).toHaveValue('A first try I do not love.');

    // Back to the same spot: activate again — the tag stands again…
    await activate(page);
    await expect(page.locator('.assistbar-tag')).toHaveText(S.assistActivated);
    // …and stepping back out returns the box with the draft intact.
    await page.locator(CHIP).click();
    await page.mouse.move(0, 0);
    await expect(field).toHaveValue('A first try I do not love.');

    await context.close();
  });

  test('keyboard-only: chip to bar to copy to landed paste, no pointer at all', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);

    await page.locator(CHIP).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(BAR)).toBeVisible();
    // Focus was not stolen by the swap (GUARDRAILS: nothing steals focus).
    await expect(page.locator(CHIP)).toBeFocused();

    // Walk to the copy control and press it.
    await page.locator('.assistbar-copy').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(BAR)).toHaveCount(0);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('three backticks');

    // The box is back; paste with the keyboard; the answer lands.
    await pasteInto(page, '.flow textarea', ['```', 'Typed by keyboard alone.', '```'].join('\n'));
    await expect(page.locator('.flow textarea').first()).toHaveValue('Typed by keyboard alone.');

    await context.close();
  });

  test('the fenced-paste path into the FIELD is unchanged: plain untouched, fenced normalized, no pulse', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const field = page.locator('.flow textarea').first();

    // A plain paste is the person's own text — byte-untouched.
    await pasteInto(page, '.flow textarea', 'Just my own words, - dashes and all.');
    await expect(field).toHaveValue('Just my own words, - dashes and all.');
    await expect(field).not.toHaveClass(/flow-highlight/);

    // A fenced paste unwraps to the last fence, bullets off — and a hand
    // paste never starts the landing pulse.
    await field.fill('');
    await pasteInto(page, '.flow textarea', ['chatter', '```', '- Line one.', '- Line two.', '```'].join('\n'));
    await expect(field).toHaveValue('Line one.\nLine two.');
    await expect(field).not.toHaveClass(/flow-highlight/);

    await context.close();
  });

  test('the nudged open leads with the encouraging line — an offer, never a verdict', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);

    // Draft empty → under the threshold → the chip stands recommended, and
    // the bar it stands leads with the encouraging line.
    await expect(page.getByRole('button', { name: S.assistRecommended, exact: true })).toBeVisible();
    await activate(page);
    await expect(page.locator('.assistbar-lead')).toHaveText(ASSIST_ENCOURAGING_LEAD);

    // The ordinary open has no lead: step out, type past the bar, reopen.
    await page.locator(CHIP).click();
    await page.mouse.move(0, 0);
    await page
      .locator('.flow textarea')
      .fill('A substantial draft, comfortably past the eighty character bar, kept for the assist.');
    await expect(page.getByRole('button', { name: S.assist, exact: true })).toBeVisible();
    await activate(page);
    await expect(page.locator('.assistbar-lead')).toHaveCount(0);

    await context.close();
  });

  test('reduced motion: the bar stands still and every instruction survives', async () => {
    const { context, page } = await launchPanel({ reducedMotion: 'reduce' });
    await goToTextQuestion(page);
    await activate(page);

    await expect(page.locator('.assistbar-tag')).toHaveText(S.assistActivated);
    await expect(page.locator('.assistbar-line')).toHaveText(assistBarLine('ChatGPT'));

    await page.locator('.assistbar-copy').click();
    const field = page.locator('.flow textarea').first();
    await expect(field).toHaveAttribute('placeholder', ASSIST_LINE_RETURN);
    // The steady ring is the still form of the landing cue — no iterations
    // under reduced motion, so it stays until the person acts.
    await expect(field).toHaveClass(/flow-highlight/);
    await pasteInto(page, '.flow textarea', 'Landed under reduced motion.');
    await expect(field).not.toHaveClass(/flow-highlight/);

    await context.close();
  });

  test('axe finds no violations with the bar standing, collapsed and expanded', async () => {
    const { context, page } = await launchPanel({ reducedMotion: 'reduce' });
    await goToTextQuestion(page);
    await activate(page);

    const closed = await new AxeBuilder({ page })
      .include('.flow')
      .exclude('.app-ground')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(closed.violations).toEqual([]);

    await page.getByRole('button', { name: S.assistReadPrompt, exact: true }).click();
    const open = await new AxeBuilder({ page })
      .include('.flow')
      .exclude('.app-ground')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(open.violations).toEqual([]);

    await context.close();
  });
});
