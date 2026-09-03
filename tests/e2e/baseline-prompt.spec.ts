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
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

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
  await page.waitForSelector('.splashreveal');
  /* The hold pass: under full motion the key is HELD until its ring arms; a
     reduced-motion click arms instantly, same as everywhere. */
  if (reduced) {
    await page.getByRole('button', { name: S.splashBaseline, exact: true }).click();
  } else {
    // Held (2026-09-02): the fill only advances under a held pointer.
    await page.getByRole('button', { name: S.splashBaseline, exact: true }).hover();
    await page.mouse.down();
    await page.waitForSelector(".splash-holdkey[data-live='on']", { timeout: 15_000 });
    await page.mouse.up();
  }
  await page.waitForSelector('.flow--prompt', { timeout: 20_000 });
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
    /* SUPERSEDED 2026-09-02 (Adam): the chrome ROW is back, carrying one
       control. The first fold took the narrator out with "Jump to…", on the
       reasoning that both were interview chrome. That was wrong about the
       narrator: reading the question aloud is not a way around the screen, it
       is the screen being clearer — and this is the question most likely to be
       met by somebody who would rather be told what to do than read it.

       What the old assertion protected survives as the line below: the JUMP is
       still gone, and it was the jump that said "interview". */
    await expect(page.locator('.flow-jump')).toHaveCount(0);
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

test('there is no stem, and the question sits on the box', async () => {
  const { context, page } = await openBaseline(true);
  try {
    /* The stem ("Tell your AI to…") was a grammatical rail, and the seeds
       becoming whole imperative prompts made it a second teacher for a lesson
       already taught. The label reverts to the question, hidden — it is still
       the field's programmatic NAME, and deleting it would leave a box with no
       accessible name at all. */
    const label = page.locator('.flow-field-sr-label .field-label');
    await expect(label).toHaveCount(1);
    const box = await label.boundingBox();
    expect(box?.width ?? 0).toBeLessThan(3);
    // The field still answers to it.
    // The question reworked 2026-09-02 (Adam's baseline brief) - the name
    // follows the wording, as it must.
    await expect(page.locator('textarea.field')).toHaveAccessibleName(/To set your baseline/);

    // And the space it held is closed rather than left as a hole.
    const gap = await page.evaluate(() => {
      const q = document.querySelector('.flow-q')!.getBoundingClientRect();
      const f = document.querySelector('textarea.field')!.getBoundingClientRect();
      return Math.round(f.top - q.bottom);
    });
    expect(gap).toBeLessThanOrEqual(24);
  } finally {
    await context.close();
  }
});

test('the note turns from advice into a declaration once typing starts', async () => {
  const { context, page } = await openBaseline(false);
  try {
    const chars = page.locator('.decl-ch');
    /* Read the two colours off the document rather than writing them in. The
       claim is a RELATIONSHIP — resting grey is the hint colour, lit is the
       same `--primary` the Next button beside it is painted in — and a literal
       hex here would just break the day a token moves. */
    const { grey, primary } = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const paint = (v: string) => {
        const probe = document.createElement('span');
        probe.style.color = v;
        document.body.appendChild(probe);
        const out = getComputedStyle(probe).color;
        probe.remove();
        return out;
      };
      return { grey: paint(cs.getPropertyValue('--ink-2')), primary: paint(cs.getPropertyValue('--primary')) };
    });
    expect(grey).not.toBe(primary);
    await expect(chars.first()).toHaveCSS('color', grey);

    /* The whole direction reaches assistive technology as ONE string, not as
       ninety fragments — the split run beside it is aria-hidden.

       Asserted on STRUCTURE rather than on the prose. The first version quoted
       the sentence and broke the next time Adam edited a word, which taught
       nothing: what must hold is that the hidden copy is the same text the
       visible run is built from, and that authored line breaks survive as
       lines. */
    const whole = (await page.locator('.decl-whole').textContent()) ?? '';
    expect(whole.trim().length).toBeGreaterThan(20);
    const authoredLines = whole.split('\n').filter((l) => l.trim() !== '').length;
    await expect(page.locator('.decl-line')).toHaveCount(authoredLines);
    const painted = (await page.locator('.decl-line').allTextContents()).join(' ').replace(/\s+/g, ' ');
    expect(painted.trim()).toBe(whole.replace(/\s+/g, ' ').trim());

    await page.locator('textarea.field').click();
    await page.keyboard.type('D');

    // Mid-sweep the front of the line has turned and the end has not: that
    // difference IS the reading-order effect, and a gradient across the
    // element's box could not produce it on a wrapped paragraph.
    let staggered = false;
    for (let i = 0; i < 40 && !staggered; i += 1) {
      const [head, tail] = await Promise.all([
        chars.first().evaluate((el) => getComputedStyle(el).color),
        chars.last().evaluate((el) => getComputedStyle(el).color),
      ]);
      if (head !== tail) staggered = true;
      await page.waitForTimeout(20);
    }
    expect(staggered).toBe(true);

    // It finishes lit, and stays lit even when the box is emptied again: the
    // line stopped being advice the moment they started writing.
    await expect(chars.last()).toHaveCSS('color', primary, { timeout: 5000 });
    await page.locator('textarea.field').fill('');
    await expect(chars.first()).toHaveCSS('color', primary);
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
  /* The whole ladder takes ~26s of typewriter time, and the hold pass put
     ~5.5s of arrival (hold + count + fog) in front of it — over the default
     30s budget by arithmetic, not by flake. */
  test.setTimeout(50_000);
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

/**
 * THE FORK, after the answer lands (Adam, 2026-09-01). Pressing "I ran it"
 * used to record the run and walk straight into question one. That spent the
 * best moment in the product without using it: somebody holding their AI's
 * no-file answer is the only audience for whom "build the file" can be put as
 * "improve THIS" rather than as fifty questions.
 */
async function toBaselineOffer(page: Page): Promise<void> {
  await page.waitForSelector('.prompt-tw');
  await page.locator('.prompt-tw').first().click();
  await page.getByRole('button', { name: /Submit/ }).click();
  await page.waitForSelector('.baselineoffer');
}

/** V3.0 pass 3h: the paste box and the doors live in step 3's stage - the
 * cluster's third box opens it. */
async function toStep3(page: Page): Promise<void> {
  await page.locator('.baselineoffer-panel').nth(2).click();
  await page.waitForSelector('#baseline-paste');
}

const ANSWER =
  'Here are a few ways to explain your role. The Quick Dinner Party Pitch: ' +
  '"Companies generate massive amounts of raw operational data every second."';

test('the answer lands on a fork, and is saved before either door is taken', async () => {
  const { context, page } = await openBaseline(true);
  try {
    await toBaselineOffer(page);
    await toStep3(page);
    await page.locator('#baseline-paste').fill(ANSWER);
    await page.getByRole('button', { name: S.baselineGo }).click();

    // It does NOT leave the screen.
    await expect(page.locator("[data-position='baseline-landed']")).toBeVisible();
    await expect(page.getByRole('button', { name: S.baselineImprove })).toBeVisible();
    await expect(page.getByRole('button', { name: S.baselineHome })).toBeVisible();
    // Their AI's answer is handed back — it is the thing the primary door
    // offers to improve, so it has to be on screen when the offer is made.
    await expect(page.locator('.baselineoffer-answer')).toContainText('Dinner Party');

    // Written on landing, not routed through a door: a baseline somebody took
    // is theirs whichever way they leave.
    const runs = await page.evaluate(
      () =>
        new Promise<{ stage: string }[]>((r) =>
          chrome.storage.local.get('wb:report', (x) => r(x['wb:report']?.runs ?? [])),
        ),
    );
    expect(runs.map((v) => v.stage)).toEqual(['baseline']);
  } finally {
    await context.close();
  }
});

test('going home keeps the baseline, and does not re-offer it', async () => {
  const { context, page } = await openBaseline(true);
  try {
    await toBaselineOffer(page);
    await toStep3(page);
    await page.locator('#baseline-paste').fill(ANSWER);
    await page.getByRole('button', { name: S.baselineGo }).click();
    await page.getByRole('button', { name: S.baselineHome }).click();

    await expect(page.locator('.baselineoffer')).toHaveCount(0);
    const runs = await page.evaluate(
      () =>
        new Promise<{ stage: string; answer: string }[]>((r) =>
          chrome.storage.local.get('wb:report', (x) => r(x['wb:report']?.runs ?? [])),
        ),
    );
    expect(runs).toHaveLength(1);
    expect(runs[0]!.answer).toContain('Dinner Party');
  } finally {
    await context.close();
  }
});

test('the offer screen fills the panel too — no dock hole, no scroll', async () => {
  const { context, page } = await openBaseline(true);
  try {
    await toBaselineOffer(page);
    /* V3.0 pass 3h restage: the guided cluster replaced the full-panel
       composer, and the save note rides step 3's stage rather than the
       viewport edge. The claim that SURVIVES is the dock-hole one: no
       vertical overflow at any step of the errand. */
    const overflowAt = () =>
      page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
    expect(await overflowAt()).toBe(0);
    await toStep3(page);
    expect(await overflowAt()).toBe(0);
  } finally {
    await context.close();
  }
});

test('the offer screen is laid out like the question before it', async () => {
  const { context, page } = await openBaseline(true);
  try {
    await page.waitForSelector('.prompt-tw');
    // The same header, with the same bar in the same state: this screen is an
    // errand from the goal question, not a step past it, and a header that
    // changes shape between two screens of one path reads as two designs.
    /* Compared through the progressbar's own ARIA values, not its pixels. That
       is the stable contract — where the bar says the person is — and it does
       not break the day the bar is redrawn. (My first pass compared
       `.flowprogress-run`, which is the run beat, not the bar at all.) */
    const bar = page.locator('[role="progressbar"]');
    const goalBar = await bar.evaluate((el) => ({
      now: el.getAttribute('aria-valuenow'),
      max: el.getAttribute('aria-valuemax'),
    }));

    await page.locator('.prompt-tw').first().click();
    await page.getByRole('button', { name: /Submit/ }).click();
    await page.waitForSelector('.baselineoffer');

    await expect(page.locator('.flowprogress')).toContainText(S.baselineEyebrow);
    const offerBar = await bar.evaluate((el) => ({
      now: el.getAttribute('aria-valuenow'),
      max: el.getAttribute('aria-valuemax'),
    }));
    // Nothing advanced: this screen is an errand from the goal question, and
    // the bar says nothing advanced.
    expect(offerBar).toEqual(goalBar);

    // The prompt is NOT restated — it is on their clipboard and was on the
    // screen before in their own words.
    await expect(page.locator('.baselineoffer-task')).toHaveCount(0);

    /* V3.0 pass 3h restage: the box lives in step 3's stage now, sized as
       a card rather than the whole panel - the surviving claims are that
       it exists at a real working height, the screen still does not
       scroll, and the doors sit DIRECTLY under it in order. */
    await page.locator('.baselineoffer-panel').nth(2).click();
    await page.waitForSelector('#baseline-paste');
    const { boxH, overflow } = await page.evaluate(() => ({
      boxH: Math.round(document.querySelector('textarea.field')!.getBoundingClientRect().height),
      overflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(boxH).toBeGreaterThanOrEqual(140);
    expect(overflow).toBe(0);

    // One centred action with the bail-out under it, in that order.
    const doors = await page.locator('.baselineoffer-doors button').allTextContents();
    expect(doors).toEqual([S.baselineGo, S.baselineLater]);
  } finally {
    await context.close();
  }
});

test('"Not now" leaves for Home instead of walking deeper into the interview', async () => {
  const { context, page } = await openBaseline(true);
  try {
    await toBaselineOffer(page);
    await toStep3(page);
    await page.getByRole('button', { name: S.baselineLater }).click();
    await page.waitForTimeout(400);
    // It used to mark the baseline passed and advance to question one, which
    // made the bail-out a door into the very thing somebody was declining.
    await expect(page.locator('.baselineoffer')).toHaveCount(0);
    await expect(page.locator('.flow--prompt')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
