import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Answers } from '../../src/schema/storage.types';
import { pastRunCard } from './fixtures/runCard';

/**
 * V1.2 VB-10 accept criteria, driven in a real browser:
 *
 *   "a question is fully readable and answerable before its animation
 *    finishes; a keypress completes the text instantly; the label doesn't
 *    re-type when moving between questions inside one module; reduced motion
 *    shows everything at once."
 *
 * Every one of those is a claim about a running browser and a real keyboard.
 * The component tests (src/panel/components/Typed.test.tsx) prove the wiring
 * against a fake clock; they cannot prove that a keystroke which ends the
 * animation also lands in the field, that nothing on the screen moves while
 * the question prints, or that the label survives forty-nine remounts without
 * reprinting. Those are the things that would actually be felt.
 *
 * `innerText` and `textContent` are used against each other throughout, and
 * that is deliberate rather than incidental: the characters not yet typed are
 * `visibility: hidden`, so `innerText` is what is on screen and `textContent`
 * is the whole question. "Half printed" is exactly `innerText.length <
 * textContent.length`, and "the DOM always holds the whole question" is
 * exactly `textContent === question`.
 *
 * Self-contained launch helpers, per this repo's one-spec-stands-alone
 * convention (see brand-mark.spec.ts and file-tree.spec.ts).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * The print is driven by a 10ms `setInterval`, and Chrome clamps timers to one
 * a second in a window it believes is occluded — which four of Playwright's
 * five headed windows always are. Without these flags a spec about a 700ms
 * animation fails for a reason that has nothing to do with the animation.
 * Copied from brand-mark.spec.ts, which needs them for the same reason.
 *
 * They only ever make the animation run *closer to* how it runs on a real
 * person's screen, so they cannot mask a regression in anything asserted here.
 */
const NO_THROTTLING = [
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-background-timer-throttling',
];

async function launchExtension(
  options: { reduce?: boolean } = {},
): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, ...NO_THROTTLING],
    reducedMotion: options.reduce ? 'reduce' : 'no-preference',
  });
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
  return { context, sw, id };
}

async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
}

/** Counts every `setInterval` the page ever asks for, from before the panel's
 * own bundle runs — the same trick brand-mark.spec.ts plays on
 * `requestAnimationFrame`, and for the same reason: "reduced motion schedules
 * nothing" is a claim about absence, and absence has to be measured from the
 * first line of script rather than sampled afterwards. */
function installTimerProbe(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as { __intervals: number };
    w.__intervals = 0;
    // Wrapped, not replaced: the intervals still run, so the non-reduced
    // control test below watches a print that is genuinely printing.
    const original = window.setInterval as unknown as (...args: unknown[]) => unknown;
    // `defineProperty` rather than assignment: this file is type-checked with
    // Node's lib, where `setInterval` returns a `Timeout` and not the DOM's
    // `number`, and the two signatures do not overlap.
    Object.defineProperty(window, 'setInterval', {
      configurable: true,
      writable: true,
      value: (...args: unknown[]) => {
        w.__intervals += 1;
        return original.apply(window, args);
      },
    });
  });
}

const intervalCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __intervals: number }).__intervals);

const answersFrom = (sw: Worker) =>
  sw.evaluate(async () => {
    const stored = await chrome.storage.local.get('wb:answers');
    return (stored['wb:answers'] ?? null) as Answers | null;
  });

/** What is on screen, and what the DOM holds, for one selector. */
function readText(page: Page, selector: string) {
  return page.$eval(selector, (el) => ({
    shown: (el as HTMLElement).innerText,
    whole: el.textContent ?? '',
  }));
}

/**
 * Watches `.flow-q` for as long as the page lives, recording what it saw of one
 * particular question.
 *
 * A `MutationObserver` rather than a `requestAnimationFrame` sampler, which is
 * what this was first written as and is worth recording as a finding: driving
 * the panel from Playwright starves rAF badly — a five-question walk that took
 * 600ms of wall clock delivered *twelve* frames, and the one moment that
 * mattered fell between two of them. An observer fires on the DOM change
 * itself, so a print that lasted a single frame is still caught. Sampled in
 * the page either way: a print is under a second and a round-trip is tens of
 * milliseconds, so polling from the test would see a handful of moments and
 * call it evidence.
 */
function watchQuestion(page: Page, question: string) {
  return page.evaluate((target) => {
    const w = window as unknown as {
      __minShown: number;
      __sawWhole: boolean;
      __brokenDom: number;
      __boxes: Set<string>;
    };
    w.__minShown = Number.POSITIVE_INFINITY;
    w.__sawWhole = false;
    w.__brokenDom = 0;
    w.__boxes = new Set<string>();

    const look = () => {
      const el = document.querySelector<HTMLElement>('.flow-q');
      if (!el) return;
      const shown = el.innerText;
      if ((el.textContent ?? '') === target) {
        w.__minShown = Math.min(w.__minShown, shown.length);
        if (shown === target) w.__sawWhole = true;
        const box = el.getBoundingClientRect();
        w.__boxes.add(`${box.x},${box.y},${box.width},${box.height}`);
      } else if (target.startsWith(shown) && shown.length < target.length) {
        // Mid-print, but the DOM is not holding the whole question: the
        // reservation is broken and everything below the heading is about to
        // move as it wraps.
        w.__brokenDom += 1;
      }
    };
    new MutationObserver(look).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    look();
  }, question);
}

const watched = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      __minShown: number;
      __sawWhole: boolean;
      __brokenDom: number;
      __boxes: Set<string>;
    };
    return {
      minShown: w.__minShown,
      sawWhole: w.__sawWhole,
      brokenDom: w.__brokenDom,
      boxes: [...w.__boxes],
    };
  });

/** Q1 is an intro — Next alone advances it. Q2 is `context_scope`, three
 * pills. Q3 is `stop_explaining`, a multiline text field. */
async function toContextScope(page: Page): Promise<void> {
  await enterInterview(page);
  // V2.3 VB-90: the seeded walk-in skips the ladder and the gate — the flow
  // opens here.
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
}

async function toStopExplaining(page: Page): Promise<void> {
  await toContextScope(page);
  // V2.5 VB-118: context_scope's choices are icon tiles.
  await page.locator('.flow .vpick .vpick-tile').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // BS-05d: a run's payoff card can stand between two questions.
  await pastRunCard(page);
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
}

test.describe('VB-10 — the question types itself in', () => {
  test('it really prints: caught mid-sentence, and it always finishes whole', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const question = (await page.locator('.flow-q').textContent()) ?? '';
    expect(question.length, 'the first question should be a long one').toBeGreaterThan(60);

    await watchQuestion(page, question);
    // However short it was caught, it always finishes whole.
    await expect.poll(async () => (await watched(page)).sawWhole).toBe(true);

    const seen = await watched(page);
    // A run in which the question is never partly printed is a run in which
    // the typewriter did nothing at all, and this fails.
    expect(seen.minShown, 'the question was never caught part-printed').toBeLessThan(
      question.length,
    );
    // And the DOM held the whole question on every single one of those frames.
    expect(seen.brokenDom).toBe(0);
    await expect(page.locator('.flow-q')).toHaveText(question);

    await context.close();
  });

  test('nothing on the screen moves while it prints', async () => {
    // The reason the un-typed characters are in the DOM at all. A question is
    // one to three lines at 400px, so printing into an empty box would walk
    // the field and the buttons down the panel as it wrapped — controls moving
    // under the pointer of someone trying to use them.
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const question = (await page.locator('.flow-q').textContent()) ?? '';
    await watchQuestion(page, question);

    const nextBefore = (await page.getByRole('button', { name: 'Next', exact: true }).boundingBox())!;
    await expect.poll(async () => (await watched(page)).sawWhole).toBe(true);
    const nextAfter = (await page.getByRole('button', { name: 'Next', exact: true }).boundingBox())!;

    const seen = await watched(page);
    expect(seen.boxes.length, `the question's own box changed: ${seen.boxes.join(' / ')}`).toBe(1);
    expect(nextAfter.y, 'Next moved while the question printed').toBe(nextBefore.y);

    await context.close();
  });

  test('a question is answerable before its animation finishes', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, id);
    await toStopExplaining(page);

    const question = (await page.locator('.flow-q').textContent()) ?? '';
    const field = page.locator('.flow textarea');
    // Focus moves without a key or a click, so the print is still running —
    // this is the person who already knows the question and starts typing.
    await field.focus();

    const midPrint = await readText(page, '.flow-q');
    expect(midPrint.shown.length, 'the print had already finished; nothing is being proved')
      .toBeLessThan(question.length);
    expect(midPrint.whole).toBe(question);

    const ANSWER = 'That my Tuesdays are always fully booked.';
    await page.keyboard.type(ANSWER);

    // Nothing was swallowed: every character reached the field, including the
    // first one, which was also the one that ended the animation.
    await expect(field).toHaveValue(ANSWER);
    await expect(page.locator('.flow-q .typed-rest')).toHaveCount(0);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // The commit moved the interview on. (V2.5 VB-120: an answer this short
    // now takes the recheck bypass and lands on the NEXT question rather
    // than the reflect screen this line used to see — the claim was always
    // "Next commits", and the step-id says so either way.)
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'stop_explaining');

    // And it committed correctly — read back out of the person's own storage,
    // not out of the field it was typed into.
    await expect
      .poll(async () => (await answersFrom(sw))?.values['stop_explaining'])
      .toBe(ANSWER);

    await context.close();
  });

  test('a keypress completes the text instantly', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const question = (await page.locator('.flow-q').textContent()) ?? '';
    const remaining = page.locator('.flow-q .typed-rest');
    await expect(remaining).toHaveCount(1);
    const before = await readText(page, '.flow-q');
    expect(before.shown.length).toBeLessThan(question.length);

    await page.keyboard.press('Shift');

    // A tight timeout on purpose: the whole question is over a second of
    // printing, so passing this inside 300ms cannot be the animation merely
    // finishing on its own.
    await expect(remaining).toHaveCount(0, { timeout: 300 });
    expect((await readText(page, '.flow-q')).shown).toBe(question);

    await context.close();
  });

  test('a click completes the text instantly, and still does what it was clicking', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await toContextScope(page);

    const question = (await page.locator('.flow-q').textContent()) ?? '';
    const remaining = page.locator('.flow-q .typed-rest');
    await expect(remaining).toHaveCount(1);

    // V2.5 VB-118: context_scope's choices are icon tiles.
    const firstPill = page.locator('.flow .vpick .vpick-tile').first();
    await firstPill.click();

    await expect(remaining).toHaveCount(0, { timeout: 300 });
    expect((await readText(page, '.flow-q')).shown).toBe(question);
    // The click was not spent on the animation: it picked the option too.
    await expect(firstPill).toHaveAttribute('aria-pressed', 'true');

    await context.close();
  });

  test('the heading keeps its whole accessible name while it prints', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const question = (await page.locator('.flow-q').textContent()) ?? '';
    // Mid-print, the characters on screen are a fragment — but the heading a
    // screen reader is given is the whole question, from the first frame.
    expect((await readText(page, '.flow-q')).shown.length).toBeLessThan(question.length);
    await expect(page.getByRole('heading', { name: question, exact: true })).toBeVisible();

    // And once it is finished, the label is gone — the visible text is the
    // name again, exactly as V1.1 shipped it.
    await expect(page.locator('.flow-q .typed-rest')).toHaveCount(0);
    expect(await page.locator('.flow-q').getAttribute('aria-label')).toBeNull();
    await expect(page.getByRole('heading', { name: question, exact: true })).toBeVisible();

    await context.close();
  });
});

test.describe('VB-10 — the module label prints on a change, not on a question', () => {
  test('two questions inside one module leave the label alone; the next module prints it', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // The label prints once on arrival — a module appearing for the first
    // time is a change too.
    await expect(page.locator('.flowprogress-title')).toHaveText('Orientation');
    await expect.poll(async () => (await readText(page, '.flowprogress-title')).shown).toBe(
      'ORIENTATION',
    );

    // From here on, watch every DOM change. Anything that reprints the label —
    // even for the 110ms "Orientation" takes, even for a single frame — is
    // caught. See `watchQuestion` on why this is an observer and not a frame
    // sampler: a frame sampler misses exactly this.
    await page.evaluate(() => {
      const w = window as unknown as { __prints: string[]; __labels: Set<string> };
      w.__prints = [];
      w.__labels = new Set<string>();
      const look = () => {
        const el = document.querySelector<HTMLElement>('.flowprogress-title');
        if (!el) return;
        w.__labels.add(el.textContent ?? '');
        if (el.querySelector('.typed-rest')) w.__prints.push(el.textContent ?? '');
      };
      new MutationObserver(look).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      look();
    });
    const printsSeen = () =>
      page.evaluate(() => [...new Set((window as unknown as { __prints: string[] }).__prints)]);
    const labelsSeen = () =>
      page.evaluate(() => [...(window as unknown as { __labels: Set<string> }).__labels]);

    // Walk the rest of module one. Every one of these is a remount of the
    // whole status bar (Flow keys its step view by position), which is exactly
    // the thing that used to make a mount-triggered label print every time.
    // BS-05d raised the cap from 12: the walk now passes a run's payoff card
    // on its way out of Orientation, and each pass costs a turn.
    let guard = 0;
    while (guard++ < 16) {
      // BS-05d: a run's payoff card can stand between two questions.
      if (await pastRunCard(page)) continue;
      const position = await page.locator('.flow').getAttribute('data-position');
      if (position === 'module-intro') break;
      if (position === 'reflect') {
        await page.getByRole('button', { name: 'Keep it as-is', exact: true }).click();
      } else {
        const textarea = page.locator('.flow textarea');
        // VB-118: context_scope's choices are tiles — the walker knows both.
        const pills = page.locator('.flow .pillgroup .pill, .flow .vpick .vpick-tile');
        if (await textarea.count()) await textarea.first().fill('A short answer for this one.');
        else if (await pills.count()) await pills.first().click();
        await page.getByRole('button', { name: 'Next', exact: true }).click();
      }
      await page.waitForSelector('.flow');
      // BS-05d: that Next may have landed on a run's payoff card, which
      // carries no module label of its own — a celebration with a progress
      // bar on it would be the panel talking over itself. Nothing to check
      // this turn; the top of the loop walks past it.
      if (await page.locator('.runcard').count()) continue;
      // Still inside module one? Then the label must not have reprinted.
      if ((await page.locator('.flowprogress-title').textContent()) === 'Orientation') {
        expect(await printsSeen(), 'the label reprinted inside a single module').toEqual([]);
      }
    }

    // It really did reach the next module, and the label really did change.
    const labels = await labelsSeen();
    expect(labels.length, `never left the first module: ${labels.join(' / ')}`).toBeGreaterThan(1);
    // ...and printing it is exactly what happened when it did — the new
    // module's label, and only that one, was ever caught part-printed.
    expect(await printsSeen()).toEqual([labels[labels.length - 1]]);

    await context.close();
  });
});

test.describe('VB-10 — reduced motion', () => {
  test('every question is whole from its first frame, and no timer is ever scheduled', async () => {
    const { context, id } = await launchExtension({ reduce: true });
    const page = await context.newPage();
    await installTimerProbe(page);
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });

    // V2.7 VB-128: under reduced motion the splash legitimately schedules
    // ONE interval of its own — the ten-count's once-per-second bar stepper
    // (a progress indicator is information, and a timeout is not a frame).
    // It is cleared the moment the splash leaves; the claim below is about
    // the TYPEWRITER, so the walk measures what it schedules from here on.
    const baselineIntervals = await intervalCount(page);

    // Watch from before the interview even opens, so the first question's
    // arrival is inside the window rather than before it.
    await page.evaluate(() => {
      const w = window as unknown as { __everPartial: boolean };
      w.__everPartial = false;
      const look = () => {
        if (document.querySelector('.typed-rest')) w.__everPartial = true;
      };
      new MutationObserver(look).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
      look();
    });

    await enterInterview(page);
    const question = (await page.locator('.flow-q').textContent()) ?? '';
    // The whole thing, on screen, at the first look. Not a faster print — none.
    expect((await readText(page, '.flow-q')).shown).toBe(question);
    expect((await readText(page, '.flowprogress-title')).shown).toBe('ORIENTATION');

    // Two more arrivals, each of which would print under full motion.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    expect((await readText(page, '.flow-q')).shown).toBe(
      await page.locator('.flow-q').textContent(),
    );
    await page.locator('.flow .vpick .vpick-tile').first().click(); // VB-118: tiles
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
    expect((await readText(page, '.flow-q')).shown).toBe(
      await page.locator('.flow-q').textContent(),
    );

    expect(
      await page.evaluate(() => (window as unknown as { __everPartial: boolean }).__everPartial),
      'a partly-printed heading appeared under prefers-reduced-motion',
    ).toBe(false);

    // The bar: zero NEW intervals since the splash left. Not "it finishes
    // quickly" — the print is never started, so the interview schedules no
    // interval at all. The only other setInterval in the bundle is the
    // splash's reduced-motion ten-count stepper, measured out above and
    // gone with its surface.
    expect(
      (await intervalCount(page)) - baselineIntervals,
      'a print timer ran under reduced motion',
    ).toBe(0);

    await context.close();
  });

  test('without the preference the timer really does run — so the zero above means something', async () => {
    const { context, id } = await launchExtension();
    const page = await context.newPage();
    await installTimerProbe(page);
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await enterInterview(page);

    await expect.poll(() => intervalCount(page)).toBeGreaterThan(0);

    await context.close();
  });
});
