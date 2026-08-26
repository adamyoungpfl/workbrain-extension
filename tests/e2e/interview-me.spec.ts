import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V2.3 VB-94 — the interview-me prompt, the escape hatch on open text
 * questions: the person's own AI interviews them and returns the finished
 * answer in one fenced block, pasted back into the same field.
 *
 * What this file pins:
 *  - the button is there on a text question, a real 44px target, and the
 *    disclosure carries the question verbatim plus the fence instruction;
 *  - the prompt is grounded in the goal gate's answer when one exists;
 *  - a fenced paste lands normalized and editable in the field;
 *  - an ordinary paste is never touched — reformatting text the person did
 *    not ask to have reformatted would be the product editing their words;
 *  - axe finds nothing wrong with the open disclosure.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchPanel(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  // For the real-paste tests: the page writes the clipboard itself.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview opens on the goal gate; this spec's subject
  // sits past it, so the walk-in seeds a passed gate — which also gives the
  // prompt a goal to ground itself in.
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
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  return { context, page };
}

/** Intro (Next), context_scope (pill + Next) — landing on `stop_explaining`,
 * the first multiline text question. */
async function goToTextQuestion(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.locator('.flow .pillgroup .pill').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
}

/** A REAL paste — clipboard written, then the paste keystroke — so both
 * branches of the onPaste handler are proven against the browser's own
 * default action, not against a synthetic event that has none. */
async function pasteInto(page: Page, selector: string, text: string): Promise<void> {
  await page.evaluate((value) => navigator.clipboard.writeText(value), text);
  await page.locator(selector).focus();
  await page.keyboard.press('ControlOrMeta+V');
}

test.describe('VB-94 — the interview-me prompt', () => {
  test('the button opens a prompt carrying the question, the fence instruction, and their goal', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);

    const button = page.locator('.flow-askai');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const block = page.locator('.flow-askai-block .readonly');
    await expect(block).toBeVisible();
    const prompt = (await block.textContent()) ?? '';
    // The question, verbatim — the person's AI must hear the same words.
    const question = (await page.locator('.flow-q').textContent()) ?? '';
    expect(question.length).toBeGreaterThan(10);
    expect(prompt).toContain(question.trim());
    expect(prompt).toContain('three backticks');
    // VB-93's goal, grounding the interview in what they said matters.
    expect(prompt).toContain('Draft my Monday status update the way I would.');
    await expect(page.locator('.flow-askai-hint')).toHaveText(
      'Run it in your AI. Paste the reply here — it lands ready to edit.',
    );

    // Toggles closed again — a disclosure, not a one-way door.
    await button.click();
    await expect(page.locator('.flow-askai-block')).toHaveCount(0);

    await context.close();
  });

  test('a fenced paste lands normalized and stays editable; an ordinary paste is untouched', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const field = '.flow textarea';

    // Ordinary paste first: no fence, no interference — the browser's own
    // paste inserts it, byte-identical.
    await pasteInto(page, field, 'My own words, pasted plain.');
    await expect(page.locator(field)).toHaveValue('My own words, pasted plain.');

    // The round trip: narration + two fences; the LAST fence is the answer,
    // bullets come off, and it REPLACES the field (the prompt asked their AI
    // for the whole answer).
    const reply = [
      'Great — based on your answers, here it is:',
      '```',
      'Draft one.',
      '```',
      'Tightened:',
      '```text',
      '- I translate vague asks into shippable specs.',
      '- I keep the team honest about scope.',
      '```',
    ].join('\n');
    await pasteInto(page, field, reply);
    await expect(page.locator(field)).toHaveValue(
      'I translate vague asks into shippable specs.\nI keep the team honest about scope.',
    );

    // Still an ordinary field: click into the frame and type.
    await page.locator(field).focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' And I sign my work.');
    await expect(page.locator(field)).toHaveValue(/And I sign my work\.$/);

    await context.close();
  });

  test('axe finds no violations with the disclosure open', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    await page.locator('.flow-askai').click();
    await expect(page.locator('.flow-askai-block .readonly')).toBeVisible();

    // Same scope and tags as rephrase.a11y.spec.ts, same reasoning about the
    // excluded best-practice shell rules.
    const results = await new AxeBuilder({ page })
      .include('.flow')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await context.close();
  });
});
