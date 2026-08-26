import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';

/**
 * V2.3 VB-94 built the interview-me escape hatch as an inline disclosure;
 * V2.4 VB-107 rebuilds it as an ANCHORED, NON-MODAL POPOVER (FLAG 1's
 * settlement) and VB-106 wires the flow's one sanctioned attention cue to
 * its copy. This file pins the new truth:
 *
 *  - the chip is a real 44px target and opens a popover floating above the
 *    helper row — never a modal: no focus trap, no aria-modal, Escape and
 *    outside-click dismiss it, focus returns to the trigger;
 *  - the popover names THEIR AI in the copy instruction (the goal gate's
 *    service, "your AI" when unknown) and carries the richer one-template
 *    prompt — question verbatim, their goal, the per-service line;
 *  - copy auto-dismisses the popover and the INPUT wears the highlight
 *    pulse (`.flow-highlight`) so it is obvious where the reply lands —
 *    and the first thing typed or pasted takes it off again;
 *  - the fenced-paste round trip is unchanged, an ordinary paste is never
 *    touched, and a paste alone never starts a pulse;
 *  - axe finds nothing wrong with the popover open.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function launchPanel(
  options: { reducedMotion?: 'reduce' } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  // For the real-paste tests: the page writes the clipboard itself.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview opens on the goal gate; this spec's subject
  // sits past it, so the walk-in seeds a passed gate — which also gives the
  // prompt a goal to ground itself in and (VB-107) a service to name.
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

/** Intro (Next), context_scope (pill + Next) — landing on `stop_explaining`,
 * the first multiline text question. */
async function goToTextQuestion(page: Page): Promise<void> {
  // V2.3 VB-90: with the gate seeded the ladder skips — context_scope first.
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

const POP = '.flow-askai-pop';

test.describe('VB-107 — interview-me v2: the anchored popover', () => {
  test('the chip opens an anchored popover: the richer prompt, their AI named, a 44px target', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);

    const button = page.locator('.flow-askai');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    // VB-106: the chip PAINTS as a 30px bubble, but the box you press is
    // still the full accessibility floor.
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    const pop = page.locator(POP);
    await expect(pop).toBeVisible();

    // ANCHORED: it floats ABOVE the helper row, beside its own trigger —
    // not a sheet, not a screen, not somewhere else pointing back.
    const popBox = (await pop.boundingBox())!;
    const trigBox = (await button.boundingBox())!;
    expect(popBox.y + popBox.height, 'the popover floats above its trigger').toBeLessThanOrEqual(
      trigBox.y + 1,
    );
    expect(popBox.y + popBox.height, 'and stays anchored to it, not far away').toBeGreaterThan(
      trigBox.y - 40,
    );

    // The prompt, in the ReadOnlyBlock with its copy button: the question
    // verbatim, the fence instruction, their goal — and V2.4's additions:
    // the concrete-specifics ask and the per-service line (decision 5a).
    const block = pop.locator('.readonly');
    await expect(block).toBeVisible();
    const prompt = (await block.textContent()) ?? '';
    const question = (await page.locator('.flow-q').textContent()) ?? '';
    expect(question.length).toBeGreaterThan(10);
    expect(prompt).toContain(question.trim());
    expect(prompt).toContain('three backticks');
    expect(prompt).toContain('Draft my Monday status update the way I would.');
    expect(prompt).toContain('Before you write');
    expect(prompt).toContain('real names');
    // One template, one per-service line — the walk-in seeded chatgpt.
    expect(prompt).toContain('ChatGPT');

    // The instruction line NAMES THEIR AI — "paste into ChatGPT", never the
    // generic shrug — exactly the string the panel ships.
    await expect(pop.locator('.flow-askai-hint')).toHaveText(S.interviewMeCopy('ChatGPT'));

    // Toggles closed again from its own trigger — a disclosure's contract.
    await button.click();
    await expect(page.locator(POP)).toHaveCount(0);
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    await context.close();
  });

  test('FLAG 1 — a popover, never a modal: no trap, Escape and outside-click dismiss, focus returns', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const button = page.locator('.flow-askai');

    await button.click();
    await expect(page.locator(POP)).toBeVisible();

    // NOT a modal: no dialog semantics anywhere on it, and opening it did
    // not steal focus — the trigger still has it (docs/GUARDRAILS.md:
    // nothing steals focus).
    await expect(page.locator(POP)).not.toHaveAttribute('role', /.+/);
    expect(await page.locator(`${POP}[aria-modal], ${POP} [aria-modal]`).count()).toBe(0);
    await expect(button).toBeFocused();

    // NO FOCUS TRAP: Tab walks INTO the popover (the copy button is simply
    // next in the document) and straight OUT the other side, with the
    // popover still open — focus is never fenced in.
    await page.keyboard.press('Tab');
    const onCopy = await page.evaluate(
      (pop) => document.querySelector(pop)!.contains(document.activeElement),
      POP,
    );
    expect(onCopy, 'Tab reaches the popover in document order').toBe(true);
    await page.keyboard.press('Tab');
    const escaped = await page.evaluate(
      (pop) => document.querySelector(pop)!.contains(document.activeElement),
      POP,
    );
    expect(escaped, 'and the very next Tab leaves it — no trap').toBe(false);
    await expect(page.locator(POP)).toBeVisible();

    // Escape dismisses from wherever focus is, and hands focus back to the
    // trigger — the standard way out of a popover, and the keyboard one.
    await page.keyboard.press('Escape');
    await expect(page.locator(POP)).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    // Outside-click dismisses too. The save note is "other UI" the popover
    // never covers (it floats UP from the helper row; the note band sits
    // below) — the question heading would be the natural target, but the
    // open popover overlaps it and Playwright rightly refuses to click
    // through a covering element.
    await button.click();
    await expect(page.locator(POP)).toBeVisible();
    await page.locator('.flow-save').click();
    await expect(page.locator(POP)).toHaveCount(0);

    await context.close();
  });

  test('copy auto-dismisses the popover and the INPUT pulses with the highlight outline (VB-106 wiring)', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    const button = page.locator('.flow-askai');
    const field = page.locator('.flow textarea');

    await button.click();
    await page.locator(`${POP} .readonly .copy`).click();

    // The popover has done its job and leaves; focus comes home to the
    // trigger rather than being stranded on an unmounted button.
    await expect(page.locator(POP)).toHaveCount(0);
    await expect(button).toBeFocused();

    // The prompt really is on the clipboard — the copy was the copy.
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('three backticks');

    // THE ONE SANCTIONED CUE (VB-106): the input wears the highlight pulse,
    // so it is obvious where the reply lands.
    await expect(field).toHaveClass(/flow-highlight/);
    const anim = await field.evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('flow-highlight-pulse');

    // It is state, not a one-shot: acting on the field is what takes it off.
    // The fenced reply landing (the whole point of the round trip) clears it.
    await pasteInto(page, '.flow textarea', '```\nThe answer, interviewed out of me.\n```');
    await expect(field).toHaveValue('The answer, interviewed out of me.');
    await expect(field).not.toHaveClass(/flow-highlight/);

    await context.close();
  });

  test('reduced motion: the pulse is a steady ring that still carries the instruction', async () => {
    const { context, page } = await launchPanel({ reducedMotion: 'reduce' });
    await goToTextQuestion(page);
    const field = page.locator('.flow textarea');

    await page.locator('.flow-askai').click();
    await page.locator(`${POP} .readonly .copy`).click();
    await expect(page.locator(POP)).toHaveCount(0);

    // Same class, no animation — the still form is the recommended chip's
    // own steady ring, present from the first frame (docs/GUARDRAILS.md:
    // the still version still carries the instruction).
    await expect(field).toHaveClass(/flow-highlight/);
    const still = await field.evaluate((el) => {
      const style = getComputedStyle(el);
      return { animation: style.animationName, shadow: style.boxShadow };
    });
    expect(still.animation).toBe('none');
    expect(still.shadow).not.toBe('none');

    await context.close();
  });

  test('a fenced paste lands normalized and stays editable; an ordinary paste is untouched — and neither starts a pulse', async () => {
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

    // VB-106's rule, stated from the other side: a paste alone never starts
    // the pulse. The pulse is the popover's copy saying "the reply lands
    // here" — after the reply HAS landed there is nothing left to point at.
    await expect(page.locator(field)).not.toHaveClass(/flow-highlight/);

    // Still an ordinary field: click into the frame and type.
    await page.locator(field).focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' And I sign my work.');
    await expect(page.locator(field)).toHaveValue(/And I sign my work\.$/);

    await context.close();
  });

  test('axe finds no violations with the popover open', async () => {
    const { context, page } = await launchPanel();
    await goToTextQuestion(page);
    await page.locator('.flow-askai').click();
    await expect(page.locator(`${POP} .readonly`)).toBeVisible();

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
