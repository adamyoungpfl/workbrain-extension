import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';
import { BASELINE_SEEDS } from '../../src/core/flow/overrides';

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
    const word = page.locator('.prompt-tw-word');
    // The field's own placeholder is empty — the cycling example IS the
    // placeholder, and two ghosts in one box was the thing being removed.
    expect(await page.locator('textarea.field').getAttribute('placeholder')).toBe('');

    /* It writes rather than cutting: the word is caught part-built.

       Sampled across a whole cycle rather than for a fixed count. The first
       version took 14 samples 90ms apart, which is 1.26s — comfortably
       INSIDE the 1.6s hold, so it could open on a finished word, see the
       same finished word fourteen times, and report that nothing was ever
       typed. Breaking early keeps the usual run short. */
    let partial: string | null = null;
    for (let i = 0; i < 90 && partial === null; i += 1) {
      const t = (await word.textContent()) ?? '';
      if (t !== '' && BASELINE_SEEDS.some((v) => v.startsWith(t) && v !== t)) partial = t;
      await page.waitForTimeout(40);
    }
    expect(partial).not.toBeNull();

    // Exactly where the box's own first character will land, and no wider than
    // the box — so taking it shifts nothing and it wraps where the field wraps.
    const { wordLeft, textLeft, press, over } = await page.evaluate(() => {
      const b = document.querySelector('.prompt-tw')!.getBoundingClientRect();
      const f = document.querySelector('textarea.field') as HTMLElement;
      const r = f.getBoundingClientRect();
      const cs = getComputedStyle(f);
      return {
        wordLeft: Math.round(b.left),
        textLeft: Math.round(r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth)),
        press: Math.round(b.height),
        over: Math.round(b.right - (r.right - parseFloat(cs.paddingRight))),
      };
    });
    expect(wordLeft).toBe(textLeft);
    expect(press).toBeGreaterThanOrEqual(44);
    expect(over).toBeLessThanOrEqual(1);

    /* Taking it commits a WHOLE word — never the fragment on screen — with one
       trailing space and the caret after it.

       The assertion is "some verb from the list", not "the verb that was
       painted a moment ago": the clock keeps running between reading the
       screen and pressing it, so pinning the exact word here would be a race
       this test loses on a slow machine. That the whole word survives a
       mid-type press is core/flow/typewriter.test.ts's job, where it is
       decidable. */
    await page.locator('.prompt-tw').click();
    const state = await page.evaluate(() => {
      const f = document.querySelector('textarea.field') as HTMLTextAreaElement;
      return { value: f.value, caret: f.selectionStart, focused: document.activeElement === f };
    });
    expect(BASELINE_SEEDS).toContain(state.value.trimEnd());
    expect(state.value.endsWith(' ')).toBe(true);
    expect(state.value.trimEnd().length).toBe(state.value.length - 1);
    expect(state.caret).toBe(state.value.length);
    expect(state.focused).toBe(true);

    // And it stands down once there is a character it could destroy.
    await expect(page.locator('.prompt-tw')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('under reduced motion the example is still, and the instruction survives it', async () => {
  const { context, page } = await openBaseline(true);
  try {
    const word = page.locator('.prompt-tw-word');
    const first = await word.textContent();
    await page.waitForTimeout(1500);
    // Nothing moves — not the word, not the sweep.
    expect(await word.textContent()).toBe(first);
    expect(
      await word.evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('none');

    // But it is still offered and still works, which is the floor
    // docs/GUARDRAILS.md sets: the still version carries the instruction.
    await expect(page.locator('.prompt-tw')).toBeEnabled();
    await page.locator('.prompt-tw').click();
    expect(await page.locator('textarea.field').inputValue()).toBe(`${first} `);
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
