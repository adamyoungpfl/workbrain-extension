import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';
import { BASELINE_SEEDS } from '../../src/core/flow/overrides';
import { MAX_LINES } from '../../src/core/flow/typewriter';

/**
 * THE BASELINE SCREEN — the one question drawn as a prompt box rather than as
 * an interview step (`promptOnly`, core/flow/nameGenerator.ts).
 *
 * Everything here was found by looking at the screen rather than by a test
 * failing, which is why the screen now has one. The dead scroll under the save
 * note, the white card over the ground, the stem two sizes off its pair, and
 * an overlay measured against the wrong element and landing 550px low — none
 * of those break a build, and all of them are obvious in a screenshot.
 *
 * The walk-in is the splash's own baseline door, because that is the path a
 * person takes to this screen and the one that broke the first time (it landed
 * on orientation instead of the goal gate).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

async function openBaseline(reduced: boolean): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    ...(reduced ? { reducedMotion: 'reduce' as const } : {}),
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
  await page.waitForSelector('.splash-lockup');
  await page.getByRole('button', { name: S.splashBaseline, exact: true }).click();
  await page.waitForSelector('.flow--prompt');
  return { context, page };
}

test('the panel does not scroll, and the save note sits on the bottom edge', async () => {
  const { context, page } = await openBaseline(true);
  try {
    // The defect was 1022px of document in a 760px panel: `.flowshell` was
    // taking its 254px dock reservation on a screen with no dock.
    const { overflow, saveBottom, viewport } = await page.evaluate(() => ({
      overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      saveBottom: Math.round(document.querySelector('.flow-save')!.getBoundingClientRect().bottom),
      viewport: window.innerHeight,
    }));
    expect(overflow).toBe(0);
    expect(viewport - saveBottom).toBeLessThanOrEqual(12);
  } finally {
    await context.close();
  }
});

test('it wears none of the interview: no mark, no drawer, no dock, no deep-dives', async () => {
  const { context, page } = await openBaseline(true);
  try {
    await expect(page.locator('.flow-mark')).toHaveCount(0);
    await expect(page.locator('.filedrawer')).toHaveCount(0);
    await expect(page.locator('.flow-chrome')).toHaveCount(0);
    await expect(page.locator('.deepdive')).toHaveCount(0);
    // One ground: the question's bubble stops painting, so the only filled
    // surface left is the input itself.
    const bubble = await page
      .locator('.flow-bubble')
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bubble).toBe('rgba(0, 0, 0, 0)');
  } finally {
    await context.close();
  }
});

test('the stem and the note under the box are set at one size', async () => {
  const { context, page } = await openBaseline(true);
  try {
    const label = page.locator('.flow-field-sr-label .field-label');
    await expect(label).toHaveText(S.baselineStem);
    const [stem, note] = await Promise.all([
      label.evaluate((el) => getComputedStyle(el).fontSize),
      page.locator('.flow-order-note').evaluate((el) => getComputedStyle(el).fontSize),
    ]);
    expect(stem).toBe(note);
  } finally {
    await context.close();
  }
});

test('the seed example types itself, and taking one leaves a whole command', async () => {
  const { context, page } = await openBaseline(false);
  try {
    const newest = page.locator(".prompt-tw-line[data-age='0'] .prompt-tw-word");
    // The field's own placeholder is empty — the cycling stack IS the
    // placeholder, and two ghosts in one box was the thing being removed.
    expect(await page.locator('textarea.field').getAttribute('placeholder')).toBe('');

    /* It writes rather than cutting: the line is caught part-built.

       Sampled across a whole cycle rather than for a fixed count. The first
       version took 14 samples 90ms apart, which is 1.26s — comfortably
       INSIDE the hold, so it could open on a finished line, see the same
       finished line fourteen times, and report that nothing was ever typed.
       Breaking early keeps the usual run short. */
    let partial: string | null = null;
    for (let i = 0; i < 90 && partial === null; i += 1) {
      const t = (await newest.textContent()) ?? '';
      if (t !== '' && BASELINE_SEEDS.some((v) => v.startsWith(t) && v !== t)) partial = t;
      await page.waitForTimeout(40);
    }
    expect(partial).not.toBeNull();

    // Exactly where the box's own first character will land, and no wider than
    // the box — so taking it shifts nothing and it wraps where the field wraps.
    const { wordLeft, textLeft, over } = await page.evaluate(() => {
      const b = document.querySelector('.prompt-tw')!.getBoundingClientRect();
      const f = document.querySelector('textarea.field') as HTMLElement;
      const r = f.getBoundingClientRect();
      const cs = getComputedStyle(f);
      return {
        wordLeft: Math.round(b.left),
        textLeft: Math.round(r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)),
        over: Math.round(b.right - (r.right - parseFloat(cs.paddingRight))),
      };
    });
    expect(wordLeft).toBe(textLeft);
    expect(over).toBeLessThanOrEqual(1);

    /* Taking it commits a WHOLE example — never the fragment on screen — with
       one trailing space and the caret after it.

       The assertion is "some example from the list", not "the one painted a
       moment ago": the clock keeps running between reading the screen and
       pressing it, so pinning the exact line here would be a race this test
       loses on a slow machine. That the whole line survives a mid-type press
       is core/flow/typewriter.test.ts's job, where it is decidable. */
    await page.locator('.prompt-tw').first().click();
    const state = await page.evaluate(() => {
      const f = document.querySelector('textarea.field') as HTMLTextAreaElement;
      return { value: f.value, caret: f.selectionStart, focused: document.activeElement === f };
    });
    expect(BASELINE_SEEDS).toContain(state.value.trimEnd());
    expect(state.value.endsWith(' ')).toBe(true);
    expect(state.value.trimEnd().length).toBe(state.value.length - 1);
    expect(state.caret).toBe(state.value.length);
    expect(state.focused).toBe(true);

    // And the whole stack stands down once there is a character it could
    // destroy.
    await expect(page.locator('.prompt-tw')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('the stack builds, dims one rung per line, and caps', async () => {
  const { context, page } = await openBaseline(false);
  try {
    // It opens on one line: on the first pass there is no history, and showing
    // the end of the list as though it had gone by would be a lie.
    await expect(page.locator('.prompt-tw-line')).toHaveCount(1);

    // Then a line per completed example, up to the ladder's height.
    await expect(page.locator('.prompt-tw-line')).toHaveCount(MAX_LINES, { timeout: 30_000 });
    await page.waitForTimeout(4000);
    await expect(page.locator('.prompt-tw-line')).toHaveCount(MAX_LINES);

    const rungs = await page
      .locator('.prompt-tw-line')
      .evaluateAll((els) => els.map((e) => parseFloat((e as HTMLElement).style.opacity)));
    expect(rungs[0]).toBe(1);
    for (let i = 1; i < rungs.length; i += 1) {
      expect(rungs[i]!).toBeLessThan(rungs[i - 1]!);
    }
    // The last rung is near enough to the ground to read as leaving.
    expect(rungs[rungs.length - 1]!).toBeLessThan(0.1);

    // Only the newest carries a caret — two would be two claims about where
    // the writing is happening.
    expect(await page.locator('.prompt-tw-caret').count()).toBeLessThanOrEqual(1);
  } finally {
    await context.close();
  }
});

test('every line in the stack is its own 44px target, and none overlap', async () => {
  const { context, page } = await openBaseline(false);
  try {
    await expect(page.locator('.prompt-tw-line')).toHaveCount(MAX_LINES, { timeout: 30_000 });
    const boxes = await page
      .locator('.prompt-tw')
      .evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
        }),
      );
    for (const b of boxes) expect(b.bottom - b.top).toBeGreaterThanOrEqual(44);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom);
    }

    // A dim line is still a real offer: somebody who recognises the example
    // from two lines ago should not wait a loop for it to come back.
    const oldest = page.locator('.prompt-tw').last();
    const wanted = (await oldest.locator('.prompt-tw-word').textContent()) ?? '';
    await oldest.click();
    expect(await page.locator('textarea.field').inputValue()).toBe(`${wanted} `);
  } finally {
    await context.close();
  }
});

test('under reduced motion the example is still, and the instruction survives it', async () => {
  const { context, page } = await openBaseline(true);
  try {
    /* Under reduced motion the stack is a SHORT LIST rather than one frozen
       line: nothing is scheduled, and the fade ladder is dropped too, because
       a dimmed line means "this one is leaving" and with no motion there is
       no leaving for it to mean. */
    const lines = page.locator('.prompt-tw-line');
    await expect(lines).toHaveCount(3);
    const before = await lines.first().locator('.prompt-tw-word').textContent();
    await page.waitForTimeout(2500);
    expect(await lines.first().locator('.prompt-tw-word').textContent()).toBe(before);
    await expect(lines).toHaveCount(3);
    expect(
      await page.locator('.prompt-tw-word').first().evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');
    // No caret to blink, and every line at full strength.
    await expect(page.locator('.prompt-tw-caret')).toHaveCount(0);
    const rungs = await lines.evaluateAll((els) =>
      els.map((e) => parseFloat((e as HTMLElement).style.opacity)),
    );
    expect(rungs.every((o) => o === 1)).toBe(true);

    // But they are still offered and still work, which is the floor
    // docs/GUARDRAILS.md sets: the still version carries the instruction.
    await page.locator('.prompt-tw').first().click();
    expect(await page.locator('textarea.field').inputValue()).toBe(`${before} `);
  } finally {
    await context.close();
  }
});

test('a wish is offered as an order, and only when the person takes it', async () => {
  const { context, page } = await openBaseline(true);
  try {
    const field = page.locator('textarea.field');
    await field.fill('I would like to be able to point my AI at my inbox every morning');
    const card = page.locator('.flow-order');
    await expect(card).toBeVisible();
    await expect(page.locator('.flow-order-text')).toHaveText(
      'Point my AI at my inbox every morning',
    );
    // Nothing has been rewritten under them — what is on screen is still theirs.
    expect(await field.inputValue()).toContain('I would like to');

    await page.getByRole('button', { name: S.orderTake }).click();
    expect(await field.inputValue()).toBe('Point my AI at my inbox every morning');
    await expect(card).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('an answer that is already an order is left completely alone', async () => {
  const { context, page } = await openBaseline(true);
  try {
    await page.locator('textarea.field').fill('Draft my Monday status update the way I would');
    await expect(page.locator('.flow-order')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
