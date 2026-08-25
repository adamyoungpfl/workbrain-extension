import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DEEP_DIVE } from '../../src/core/flow/deepDive';
import { EXPAND_MS } from '../../src/core/motion/disclosure';
import { ROTATE_MS, ROTATION_INTERACTIONS } from '../../src/core/motion/rotation';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.8 VB-42 — one follow-up at a time, as a text link, rotating.
 * V2.0 VB-57 — and the tidy that removes its visible stop, its underline and
 * its indent.
 *
 * VB-42's accept (docs/V1.8-REFINEMENT.md) was: "one at a time, rotating on a
 * 5s cycle; stops on typing, hover, focus and on Next; a visible way to stop
 * it; never steals focus; reduced motion shows a static list; contrast holds
 * for whichever link colour is chosen (aqua-green on white is the risky one —
 * measure it)." All of that is still measured below except the visible stop,
 * which VB-57 deletes.
 *
 * **THE DELETION IS THE RISKY PART OF THIS TASK AND IT IS WHY THIS FILE GREW.**
 * "Show all" was WCAG 2.2.2's mechanism. docs/V2.0-REFINEMENT.md FLAG 1,
 * decided by Adam on 2026-08-24, replaces it with a rule rather than another
 * control: **the rotation stops permanently on any interaction and never
 * resumes.** A rule is only a rule if every one of its cases holds, so each
 * interaction FLAG 1 names is proved here **on its own** — one fresh question
 * per gesture, nothing else touched — and each is then left alone for three
 * more cycles, with the cause removed where a cause can be removed (focus
 * moves away; the open follow-up is closed again). If any single wiring were
 * missing, exactly one of those tests would fail, which is the point of
 * splitting them.
 *
 * The rest of VB-57 is paint, and paint is measured rather than described:
 *
 *  - **the underline is gone**, so the replacement signal has to be real. The
 *    document's colour is stripped with a greyscale filter and what is left is
 *    measured: the chevron's own painted pixels against the ground it is on,
 *    and the link's weight against the body text beside it.
 *  - **left-justified** is the link's painted left edge against the question's,
 *    read off the live document.
 *  - **no "Show all"** anywhere on screen, on any question, in either state —
 *    and not in the shipped bundle either.
 *
 * Everything here is a claim about a running browser, and most of them are
 * claims a unit test would happily lie about: five seconds is a wall clock,
 * "stops on hover" is a pointer over a painted box, contrast is a computed
 * colour against the colour actually behind it. `src/core/motion/rotation.ts`
 * has the unit tests for the machine; this file is the browser.
 *
 * Self-contained launch helpers, per this repo's convention that each spec
 * file stands alone (see reflect.spec.ts's own header).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../dist');
const SHOTS = path.resolve(HERE, '../../test-results/vb57');

async function launchExtension(
  reducedMotion: 'reduce' | 'no-preference' = 'no-preference',
): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion,
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  return page;
}

/** Home -> the Context interview, the same path deep-dive.spec.ts takes. */
async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');
}

/**
 * Answers every Context question except `leaveUnanswered`, so `findPosition`
 * lands straight on it. Duplicated from tests/e2e/deep-dive.spec.ts, per this
 * repo's standalone-spec convention — the alternative is a shared helper that
 * every spec has to be re-read to understand.
 */
function buildAnswersExcept(modules: Module[], leaveUnanswered: readonly string[]): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  function stampTop(key: string, value: AnswerValue) {
    values[key] = value;
    answeredAt[key] = now;
    if (typeof value === 'string') reflectedAt[key] = now;
  }

  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;

  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        // By id, not by `seedFrom`: V2.0 VB-64 added a second seeded block
        // (`audiences`), and "the last seeded block wins" would have quietly
        // built this fixture's role records into the wrong one.
        if (node.id === 'roles') rolesBlock = node;
        continue;
      }
      const step = node;
      if (leaveUnanswered.includes(step.id)) continue;
      const key = step.key ?? step.id;

      if (step.id === 'entities_gate' || step.id === 'initiatives_gate') {
        stampTop(key, 'no');
      } else if (step.id === 'role_names') {
        roleNamesStep = step;
        stampTop(key, (step.options ?? []).slice(0, 1).map((o) => o.v));
      } else if (step.kind === 'intro') {
        stampTop(key, null);
      } else if (step.kind === 'yesno') {
        stampTop(key, 'yes');
      } else if (step.kind === 'chips') {
        stampTop(key, step.options?.[0]?.v ?? 'x');
      } else if (step.kind === 'multi') {
        stampTop(key, step.options?.length ? [step.options[0]!.v] : []);
      } else {
        stampTop(key, `A test answer for ${step.id}.`);
      }
    }
  }

  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    const records = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [rolesBlock!.seedFrom!.seedField]: label };
      for (const field of rolesBlock!.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A test answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[rolesBlock.id] = records;
    records.forEach((record, recordIndex) => {
      for (const [fk, v] of Object.entries(record)) {
        if (fk === rolesBlock!.seedFrom!.seedField) continue;
        const compound = `${rolesBlock!.id}#${recordIndex}#${fk}`;
        answeredAt[compound] = now;
        if (typeof v === 'string') reflectedAt[compound] = now;
      }
    });
  }

  return { values, repeatables, answeredAt, reflectedAt };
}

/**
 * Resume on the first of `unanswered`, with every other question answered.
 *
 * More than one can be left open, and one test needs that: proving the next
 * question rotates again means there has to BE a next question, and a fixture
 * with a single hole sends Next straight to the end of the interview.
 */
async function resumeAt(
  sw: Worker,
  context: BrowserContext,
  id: string,
  ...unanswered: string[]
): Promise<Page> {
  const stepId = unanswered[0]!;
  await sw.evaluate(
    (answers) => chrome.storage.local.set({ 'wb:answers': answers }),
    buildAnswersExcept(contextModules, unanswered),
  );
  const page = await openPanel(context, id);
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  // V1.4 VB-20: a fixture with every role answered resumes at the roles loop's
  // "another role?" first. There isn't another; say so and carry on.
  if ((await page.locator('.flow').getAttribute('data-position')) === 'add-another') {
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', stepId);
  // Each question is a fresh mount (Flow.tsx keys StepView by position), so
  // the presses that got us here belong to screens that no longer exist and
  // this question's rotation starts running. The tests below prove that
  // before they prove anything stopped it.
  return page;
}

/** The approved copy, read from the data rather than retyped. */
const ORIENTATION = DEEP_DIVE.orientation_ready!;
const link = (page: Page) => page.locator('.flow .deepdive-chip');

/** The visible label, whichever follow-up is showing. */
async function showing(page: Page): Promise<string> {
  return ((await link(page).textContent()) ?? '').trim();
}

/** WCAG 2.x contrast, from two `rgb()` strings as the browser reports them. */
function contrast(a: string, b: string): number {
  const channel = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = (colour: string) => {
    const [r, g, blue] = colour.match(/\d+(\.\d+)?/g)!.slice(0, 3).map((n) => Number(n) / 255);
    return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(blue!);
  };
  const one = luminance(a);
  const two = luminance(b);
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
}

/** Nothing is under the pointer and nothing has focus — so whatever is holding
 * the rotation after this is not hover and not focus. */
async function letGo(page: Page): Promise<void> {
  await page.mouse.move(2, 2);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/**
 * Wait until the rotation has actually turned once, and hand back what is now
 * showing.
 *
 * Every "it stopped" test starts with this. Without it, a test that asserted
 * "the label did not change" would pass just as happily against a feature that
 * never started, which is the way this whole file could quietly rot.
 */
async function proveItIsRotating(page: Page): Promise<string> {
  const first = await showing(page);
  await expect
    .poll(() => showing(page), { timeout: ROTATE_MS + 4000, message: 'the rotation never started' })
    .not.toBe(first);
  return showing(page);
}

/** Three more cycles with the pointer and focus somewhere else. If the label is
 * the same at the end of that, nothing is moving and nothing is going to. */
async function expectStillStopped(page: Page, held: string, where: string): Promise<void> {
  await page.waitForTimeout(ROTATE_MS * 3);
  expect(await showing(page), `${where}: it started again`).toBe(held);
}

test.describe('VB-42 — the rotating follow-up', () => {
  test('shows one follow-up as a text link, not a row of chips', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // `orientation_ready` carries two. One is on screen.
    expect(ORIENTATION).toHaveLength(2);
    await expect(link(page)).toHaveCount(1);
    expect(await showing(page)).toContain(ORIENTATION[0]!.q);

    // A link, in the question's own family: bigger than V1.3's 13px tag, and
    // still a real button so Enter and Space work without a key handler.
    const painted = await page.evaluate(() => {
      const chip = document.querySelector('.flow .deepdive-chip') as HTMLElement;
      const style = getComputedStyle(chip);
      const question = getComputedStyle(document.querySelector('.flow-q') as HTMLElement);
      return {
        tag: chip.tagName,
        size: parseFloat(style.fontSize),
        family: style.fontFamily === question.fontFamily,
        target: chip.getBoundingClientRect(),
      };
    });
    expect(painted.tag).toBe('BUTTON');
    expect(painted.size).toBeGreaterThan(14);
    expect(painted.family).toBe(true);
    // The 44px floor has not moved (docs/GUARDRAILS.md).
    expect(painted.target.height).toBeGreaterThanOrEqual(44);

    await context.close();
  });

  test('the link colour clears 4.5:1 on the ground it is actually painted on', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const measured = await page.evaluate(() => {
      const chip = document.querySelector('.flow .deepdive-chip') as HTMLElement;
      // Walk up for the first ancestor that actually paints a background —
      // the link's own box is transparent, so "on white" has to be proved,
      // not assumed.
      const painted = (el: HTMLElement) => {
        const background = getComputedStyle(el).backgroundColor;
        return background && !/rgba\(0, 0, 0, 0\)|transparent/.test(background) ? background : null;
      };
      let node: HTMLElement | null = chip;
      let ground: string | null = null;
      while (node && !ground) {
        ground = painted(node);
        node = node.parentElement;
      }
      // Nothing up the chain paints: panel.html sets no background on `body`
      // or `html`, so the ground is the browser's own canvas, which a
      // transparent document composites onto — white. Asserted rather than
      // assumed, because "on white" is the whole claim being measured.
      const transparentDocument = !painted(document.body) && !painted(document.documentElement);
      const root = getComputedStyle(document.documentElement);
      return {
        ink: getComputedStyle(chip).color,
        ground: ground ?? 'rgb(255, 255, 255)',
        transparentDocument,
        // Both colours VB-42 offered, read from the generated tokens.
        blue: root.getPropertyValue('--primary').trim(),
        green: root.getPropertyValue('--green').trim(),
      };
    });

    // What ships: --primary, on the panel's white canvas.
    expect(measured.transparentDocument).toBe(true);
    expect(measured.ink).toBe('rgb(42, 79, 203)');
    expect(measured.ground).toBe('rgb(255, 255, 255)');
    expect(contrast(measured.ink, measured.ground)).toBeGreaterThanOrEqual(4.5);

    // ...and the alternative VB-42 named — "a dark aqua green" — clears it
    // too, so the choice stays a design decision rather than a constraint.
    // Hex from the token, converted the same way the browser reports rgb().
    const asRgb = (hex: string) => {
      const n = parseInt(hex.replace('#', ''), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    expect(contrast(asRgb(measured.green), measured.ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(asRgb(measured.blue), measured.ground)).toBeGreaterThanOrEqual(4.5);

    await context.close();
  });

  test('changes every five seconds, and keeps renewing', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const first = await showing(page);
    expect(first).toContain(ORIENTATION[0]!.q);

    // Not yet: a second before the cycle is up it is still the same link.
    await page.waitForTimeout(ROTATE_MS - 1200);
    expect(await showing(page)).toBe(first);

    // ...and then it turns, on its own, with nothing touched.
    await expect
      .poll(() => showing(page), { timeout: 3000 })
      .toContain(ORIENTATION[1]!.q);

    // It wraps rather than stopping at the end — "the list keeps renewing".
    await expect
      .poll(() => showing(page), { timeout: ROTATE_MS + 3000 })
      .toContain(ORIENTATION[0]!.q);

    await context.close();
  });

  test('the primary question and the status bar never move with it', async () => {
    // docs/V1.8-REFINEMENT.md DECISIONS 3, in Adam's own words: "the 5 second
    // is only on the follow up questions, not the actual primary questions
    // themselves... The status at the top stays aligned to the sequential
    // order of questions like it does now."
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await page.waitForTimeout(600); // let the question finish typing itself in

    const before = await page.evaluate(() => ({
      question: (document.querySelector('.flow-q') as HTMLElement).textContent,
      progress: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
      valuetext: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext'),
    }));

    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 3000 }).toContain(ORIENTATION[1]!.q);

    expect(await page.evaluate(() => ({
      question: (document.querySelector('.flow-q') as HTMLElement).textContent,
      progress: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow'),
      valuetext: document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext'),
    }))).toEqual(before);

    await context.close();
  });

  test('the block does not jump: a longer follow-up rotating in reserves its room', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const heightOf = () =>
      page.evaluate(() =>
        Math.round((document.querySelector('.flow .deepdive') as HTMLElement).getBoundingClientRect().height),
      );

    // One full cycle to meet every follow-up, then a second one to prove the
    // room it settled on holds — nothing below it moves under someone's hands.
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 3000 }).toContain(ORIENTATION[1]!.q);
    const settled = await heightOf();
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 3000 }).toContain(ORIENTATION[0]!.q);
    expect(await heightOf()).toBe(settled);
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 3000 }).toContain(ORIENTATION[1]!.q);
    expect(await heightOf()).toBe(settled);

    await context.close();
  });

  // ── WCAG 2.2.2 — the one reason that is still only a pause ──────────

  test('pauses while the pointer is over it, and starts again when it leaves', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const held = await showing(page);
    await link(page).hover();
    // Two and a half cycles under the pointer. A link that changed identity
    // here is one that could change between the decision to click and the
    // click, which is what the criterion is about.
    await page.waitForTimeout(ROTATE_MS * 2.5);
    expect(await showing(page)).toBe(held);

    // Moving away starts it again. Hover is the pointer resting on the way
    // past, not a person deciding something — FLAG 1 lists six interactions
    // and hover is not one of them (core/motion/rotation.ts).
    await page.mouse.move(200, 700);
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 3000 }).not.toBe(held);

    await context.close();
  });
});

/**
 * V2.0 VB-57 / docs/V2.0-REFINEMENT.md FLAG 1.
 *
 * One test per interaction, each on a question nobody has touched, each
 * followed by three idle cycles with the pointer and focus taken away. These
 * are what make removing "Show all" legitimate rather than a regression, so
 * they are deliberately not folded into a loop over a helper: a single missing
 * wiring has to fail with the name of the gesture that is missing.
 */
test.describe('VB-57 — the rotation stops on any interaction and never resumes', () => {
  /* Every test in here sits through several REAL five-second cycles: one to
     prove the rotation started, then three more to prove nothing restarts it.
     That is the wall clock the feature is specified in, and faking it would
     mean proving something about a fake timer instead. Sixty seconds is the
     room those cycles need; nothing here is slow for any other reason. */
  test.describe.configure({ timeout: 60_000 });

  test('a click anywhere in the question area — not on the link', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    const held = await proveItIsRotating(page);

    // The heading. Not a control, not the link, nowhere near either hit box.
    await page.locator('.flow .flow-q').click();
    await letGo(page);
    await expectStillStopped(page, held, 'a click on the question');

    await context.close();
  });

  test('a keypress in the question area', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    const held = await proveItIsRotating(page);

    // Dispatched at the heading rather than typed on the hardware keyboard,
    // and that is not a shortcut. A hardware key goes to whatever has focus,
    // and focus arriving in the question area is itself an interaction — so
    // there is no gesture on a real keyboard that produces a keypress here
    // WITHOUT the focus stop having already fired. This is the only way to
    // watch the keypress wiring on its own, in a real browser, with the real
    // React handler. `DeepDive.test.tsx` holds the same case without a DOM.
    await page.locator('.flow .flow-q').dispatchEvent('keydown', { key: 'a', bubbles: true });
    await letGo(page);
    await expectStillStopped(page, held, 'a keypress');

    await context.close();
  });

  test('focus arriving — and it stays stopped after focus leaves again', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // Nothing has been focused yet, and the rotation must not change that.
    const held = await proveItIsRotating(page);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

    await link(page).focus();
    await expect(link(page)).toBeFocused();
    await page.waitForTimeout(ROTATE_MS * 1.5);
    expect(await showing(page)).toBe(held);

    // THE HALF V1.8 GOT WRONG. Focus was a hold; letting go started the clock
    // again. FLAG 1: "it must not restart when focus leaves."
    await letGo(page);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
    await expectStillStopped(page, held, 'focus, then focus leaving');

    await context.close();
  });

  test('typing an answer', async () => {
    // A question with both a text box and more than one follow-up:
    // `contribution_boundaries` carries two (core/flow/deepDive.ts).
    const { context, sw, id } = await launchExtension();
    const page = await resumeAt(sw, context, id, 'contribution_boundaries');

    const entries = DEEP_DIVE.contribution_boundaries!;
    expect(entries.length).toBeGreaterThan(1);
    await expect(link(page)).toHaveCount(1);
    const first = await showing(page);
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 4000 }).not.toBe(first);

    const box = page.locator('.flow textarea.field, .flow input.field').first();
    await box.click();
    await page.keyboard.type('The bits that are not mine');
    const held = await showing(page);

    // The pointer is in the box, not on the link — so the hover hold is not
    // what is stopping it. Focus stays in the box, which is where the person
    // put it, and nothing here moves it.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(ROTATE_MS * 3);
    expect(await showing(page)).toBe(held);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TEXTAREA');

    await context.close();
  });

  test('opening a follow-up — and it stays stopped after that follow-up is closed', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    const held = await proveItIsRotating(page);

    await link(page).click();
    await expect(link(page)).toHaveAttribute('aria-expanded', 'true');
    await page.waitForTimeout(EXPAND_MS + 100);

    // Closing it brings the collapsed link back. V1.8 held the clock only
    // while it was open; FLAG 1: "it must not restart when the follow-up
    // closes."
    await link(page).click();
    await expect(link(page)).toHaveAttribute('aria-expanded', 'false');
    await letGo(page);
    await expectStillStopped(page, held, 'opening a follow-up, then closing it');

    await context.close();
  });

  test('pressing rephrase', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await resumeAt(sw, context, id, 'contribution_boundaries');
    await expect(page.locator('.flow .flow-rephrase')).toHaveCount(1);

    const first = await showing(page);
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 4000 }).not.toBe(first);
    const held = await showing(page);

    await page.locator('.flow .flow-rephrase').click();
    await letGo(page);
    await expectStillStopped(page, held, 'pressing rephrase');

    await context.close();
  });

  test('it stays stopped for that question, and the next question rotates again', async () => {
    // The scope FLAG 1 gives it: "once stopped it stays stopped FOR THAT
    // QUESTION". A person who touched one question has not asked for a
    // different presentation of the product for ever — that was what the old
    // `wb:prefs.followUps` did, and it went with the control.
    //
    // `peeves` and `audiences_list` are consecutive, both carry two follow-ups
    // and both are pill questions, so answering one is a click rather than a
    // typed paragraph and no reflect screen comes between them.
    const { context, sw, id } = await launchExtension();
    const page = await resumeAt(sw, context, id, 'peeves', 'audiences_list');
    await proveItIsRotating(page);

    // Picking an option is a real interaction and a real answer at once.
    await page.locator('.flow .pillgroup button').first().click();
    await letGo(page);
    const held = await showing(page);
    await expectStillStopped(page, held, 'the touched question');

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'audiences_list');
    await expect(link(page)).toHaveCount(1);
    await proveItIsRotating(page);

    await context.close();
  });

  test('it freezes on the follow-up that was showing — stopping never spills the list', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const heightBefore = await page.locator('.flow .deepdive').evaluate((el) => el.getBoundingClientRect().height);
    const held = await proveItIsRotating(page);

    await page.locator('.flow .flow-q').click();
    await letGo(page);
    await page.waitForTimeout(ROTATE_MS);

    // Still one link, the one that was showing, in a block that is the same
    // height it was. The other stop this could have been — "show every
    // follow-up", which is what the deleted control did — would have grown the
    // block under the person's hands on a gesture nobody can avoid making.
    await expect(link(page)).toHaveCount(1);
    expect(await showing(page)).toBe(held);
    expect(
      await page.locator('.flow .deepdive').evaluate((el) => el.getBoundingClientRect().height),
    ).toBeCloseTo(heightBefore, 0);

    await context.close();
  });

  test('every interaction FLAG 1 names is wired: none of the six is missing', async () => {
    // The six tests above are one gesture each. This is the list itself, so
    // that adding a seventh reason to the machine without a test for it fails
    // here rather than passing silently.
    expect([...ROTATION_INTERACTIONS].sort()).toEqual([
      'click',
      'focus',
      'key',
      'open',
      'rephrase',
      'typing',
    ]);
  });
});

test.describe('VB-57 — no "Show all", and the link is not a colour', () => {
  test('there is no stop control on any question, in any state', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await resumeAt(sw, context, id, 'contribution_boundaries');

    for (const state of ['rotating', 'stopped', 'open'] as const) {
      if (state === 'stopped') {
        await page.locator('.flow .flow-q').click();
        await letGo(page);
      }
      if (state === 'open') {
        await link(page).click();
        await page.waitForTimeout(EXPAND_MS + 100);
      }
      await expect(page.locator('.deepdive-stop'), state).toHaveCount(0);
      expect(await page.locator('.flow').textContent(), state).not.toContain('Show all');
      // The follow-up area holds exactly one control: the link.
      await expect(page.locator('.flow .deepdive button'), state).toHaveCount(1);
    }

    await context.close();
  });

  test('and the words are not in the shipped bundle either', () => {
    const chunks: { file: string; source: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(js|mjs|html|json)$/.test(entry))
          chunks.push({ file: path.relative(DIST, full), source: readFileSync(full, 'utf8') });
      }
    };
    walk(DIST);

    // Positive control: the grep can find copy in these files.
    expect(chunks.some((c) => c.source.includes('More about this question'))).toBe(true);

    for (const gone of ['Show all', 'deepdive-stop', 'followUpsShowAll']) {
      const found = chunks.filter((c) => c.source.includes(gone)).map((c) => c.file);
      expect(found, `"${gone}" is still shipped: ${found.join(', ')}`).toEqual([]);
    }
  });

  test('the follow-up is left-justified with the question above it', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const edges = await page.evaluate(() => {
      const q = document.querySelector('.flow .flow-q') as HTMLElement;
      const chip = document.querySelector('.flow .deepdive-chip') as HTMLElement;
      const mark = document.querySelector('.flow .deepdive-mark') as HTMLElement;
      return {
        question: q.getBoundingClientRect().left,
        chip: chip.getBoundingClientRect().left,
        mark: mark.getBoundingClientRect().left,
        indent: parseFloat(getComputedStyle(chip).paddingLeft),
      };
    });

    // The first painted pixel of the follow-up sits on the first painted pixel
    // of the question. VB-42 shipped it 12px inside, which is what VB-57 is
    // about; there is no padding left to put it back.
    expect(edges.indent).toBe(0);
    expect(Math.round(edges.chip)).toBe(Math.round(edges.question));
    expect(Math.round(edges.mark)).toBe(Math.round(edges.question));

    await context.close();
  });

  /**
   * THE REPLACEMENT SIGNAL, MEASURED.
   *
   * docs/GUARDRAILS.md: nothing distinguished by colour alone. Taking the
   * underline off a coloured link leaves a coloured word, so two things have
   * to carry it instead — the chevron in front of the sentence, and the
   * weight. Both are measured here with every colour in the document removed,
   * because a signal that only exists in colour is exactly what a greyscale
   * pass finds.
   */
  test('with the underline gone, the chevron and the weight carry it — in greyscale', async () => {
    const { context, sw, id } = await launchExtension();
    // A question whose answer paragraph is real body text to compare against.
    const page = await resumeAt(sw, context, id, 'contribution_boundaries');

    const before = await page.evaluate(
      () => getComputedStyle(document.querySelector('.flow .deepdive-chip')!).textDecorationLine,
    );
    expect(before, 'the underline is still there').toBe('none');

    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
    await page.waitForTimeout(120);

    const measured = await page.evaluate(() => {
      const chip = document.querySelector('.flow .deepdive-chip') as HTMLElement;
      const mark = chip.querySelector('.deepdive-mark') as SVGElement;
      const label = chip.querySelector('.deepdive-chip-label') as HTMLElement;
      // The nearest ordinary prose on the same screen — the save note, which
      // is the body weight everything non-heading on this surface uses.
      const body = document.querySelector('.flow-save span') as HTMLElement;
      const weight = (el: Element) => Number(getComputedStyle(el).fontWeight);
      const box = mark.getBoundingClientRect();
      return {
        markBox: { x: box.x, y: box.y, width: box.width, height: box.height },
        markIsDrawn: mark.tagName.toLowerCase() === 'svg' && !!mark.querySelector('path'),
        markHidden: mark.getAttribute('aria-hidden'),
        linkWeight: weight(label),
        bodyWeight: weight(body),
        // Nothing else in the question area wears one of these, so the mark is
        // not a shape the eye has to tell from other shapes.
        marksOnScreen: document.querySelectorAll('.flow .deepdive-mark').length,
      };
    });

    // SIGNAL ONE — a drawn mark, decorative to a screen reader (the link's own
    // words are its name), and the only one in the question area.
    expect(measured.markIsDrawn).toBe(true);
    expect(measured.markHidden).toBe('true');
    expect(measured.marksOnScreen).toBe(1);
    expect(measured.markBox.width).toBeGreaterThanOrEqual(9);
    expect(measured.markBox.height).toBeGreaterThanOrEqual(9);

    // SIGNAL TWO — weight, and a real step of it rather than a hair.
    expect(measured.linkWeight - measured.bodyWeight).toBeGreaterThanOrEqual(100);

    // ...and the mark is really painted, in greyscale, at the non-text
    // contrast floor docs/GUARDRAILS.md sets (3:1). Read off the screenshot
    // rather than off the stylesheet: a stroke that is one hairline of
    // anti-aliasing would pass a computed-style check and fail a person.
    const shot = (await page.screenshot()).toString('base64');
    const ink = await page.evaluate(
      async ({ shot, box }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${shot}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const pad = 2;
        const data = ctx.getImageData(
          Math.round(box.x - pad),
          Math.round(box.y - pad),
          Math.round(box.width + pad * 2),
          Math.round(box.height + pad * 2),
        ).data;
        let darkest = 255;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) {
          const value = data[i]!; // greyscale: r === g === b
          if (value < darkest) darkest = value;
          if (value < 180) dark++;
        }
        return { darkest, dark, pixels: data.length / 4 };
      },
      { shot, box: measured.markBox },
    );

    const luminance = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const ratio = (1.05) / (luminance(ink.darkest) + 0.05);
    expect(ratio, `the chevron measures ${ratio.toFixed(2)}:1 on white in greyscale`).toBeGreaterThanOrEqual(3);
    // ...and it is a shape, not one stray pixel.
    expect(ink.dark, 'the chevron barely paints anything').toBeGreaterThanOrEqual(8);

    await page.screenshot({ path: path.join(SHOTS, 'greyscale-followup.png') });
    await context.close();
  });
});

test.describe('VB-42 — it still expands in place, and reduced motion still wins', () => {
  test('clicking a rotating link runs the whole of VB-16, unchanged', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const opening = await showing(page);
    const trace = await page.evaluate(async (ms) => {
      const row = document.querySelector('.flow .deepdive') as HTMLElement;
      const chip = row.querySelector('.deepdive-chip') as HTMLButtonElement;
      const before = row.getBoundingClientRect().height;
      chip.focus();
      chip.click();
      const frames: { h: number; active: string }[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        frames.push({
          h: row.getBoundingClientRect().height,
          active: `${document.activeElement?.className ?? ''}`,
        });
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { before, frames };
    }, EXPAND_MS * 2);

    const after = trace.frames.at(-1)!.h;
    expect(after).toBeGreaterThan(trace.before + 20);
    // It moved through the middle rather than cutting: the FLIP in
    // core/motion/disclosure.ts is still what runs the click.
    const between = trace.frames.filter((f) => f.h > trace.before + 1 && f.h < after - 1);
    expect(between.length).toBeGreaterThan(3);
    // Focus stayed on the control that was pressed, on every frame.
    expect(trace.frames.every((f) => f.active.includes('deepdive-chip'))).toBe(true);

    // The answer is the one belonging to the link that was showing.
    const entry = ORIENTATION.find((e) => opening.includes(e.q))!;
    await expect(page.locator('.flow .deepdive-answer')).toHaveText(entry.a);
    await expect(link(page)).toHaveAttribute('aria-expanded', 'true');

    // ...and it does not turn under the open answer.
    await page.waitForTimeout(ROTATE_MS + 1500);
    await expect(page.locator('.flow .deepdive-answer')).toHaveText(entry.a);

    // Closing puts one link back — and it is not rotating any more (VB-57).
    await link(page).click();
    await expect(page.locator('.flow .deepdive-answer')).toBeHidden();
    await expect(link(page)).toHaveCount(1);

    await context.close();
  });

  test('reduced motion shows the static list, and schedules no rotation at all', async () => {
    const { context, id } = await launchExtension('reduce');
    const page = await openPanel(context, id);
    await enterInterview(page);

    // The still equivalent carries MORE than the moving one: every follow-up
    // at once, which is what the rotation was taking turns showing.
    await expect(link(page)).toHaveCount(2);
    const labels = await link(page).allTextContents();
    await page.waitForTimeout(ROTATE_MS * 2.2);
    expect(await link(page).allTextContents()).toEqual(labels);
    // And nothing is left running behind it.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    await context.close();
  });

  test('axe finds no violations on the rotating link', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await expect(link(page)).toHaveCount(1);

    // Scan a settled screen. Focus stops the rotation — which is the feature,
    // not a workaround — and the 200ms fade the link arrives on has to be
    // over before its colour is measured: text at 40% opacity is not the
    // colour anything ships, and a scan that landed mid-fade would be
    // measuring a frame rather than a decision.
    await link(page).focus();
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((animation) => {
          const target = (animation.effect as KeyframeEffect | null)?.target ?? null;
          return !!target?.closest?.('.deepdive');
        })
        .every((animation) => animation.playState !== 'running'),
    );

    // The three page-shell rules deep-dive.spec.ts disables are disabled for
    // the same reason: they are about panel.html's own landmarks and heading
    // structure and fire identically with this feature absent. `target-size`
    // is switched ON, because the link is the control this feature adds.
    const scan = () =>
      new AxeBuilder({ page })
        .disableRules(['region', 'page-has-heading-one', 'landmark-one-main'])
        .withRules([
          'color-contrast',
          'target-size',
          'button-name',
          'aria-valid-attr-value',
          'aria-allowed-role',
        ])
        .analyze();

    const results = await scan();
    expect(results.violations).toEqual([]);
    expect(results.passes.some((p) => p.id === 'color-contrast')).toBe(true);
    expect(results.passes.some((p) => p.id === 'target-size')).toBe(true);

    await context.close();
  });

  /**
   * The three states this task changed, for a person to look at — which is the
   * only way "the underline is gone and it still reads as a link" is ever
   * really checked.
   */
  test('mid-rotation, after a stop, and the save note — for a person to look at', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await page.waitForTimeout(900);

    const area = async () => {
      const box = (await page.locator('.flow .deepdive').boundingBox())!;
      return { x: 0, y: Math.max(0, Math.round(box.y) - 90), width: 400, height: 200 };
    };

    await page.screenshot({ path: path.join(SHOTS, 'rotation-first.png'), clip: await area() });
    await proveItIsRotating(page);
    await page.screenshot({ path: path.join(SHOTS, 'rotation-turned.png'), clip: await area() });

    await page.locator('.flow .flow-q').click();
    await letGo(page);
    await page.waitForTimeout(ROTATE_MS + 400);
    await page.screenshot({ path: path.join(SHOTS, 'rotation-stopped.png'), clip: await area() });

    const note = (await page.locator('.flow-save').boundingBox())!;
    await page.screenshot({
      path: path.join(SHOTS, 'save-note-centred.png'),
      clip: { x: 0, y: Math.max(0, Math.round(note.y) - 24), width: 400, height: 150 },
    });
    await page.screenshot({ path: path.join(SHOTS, 'whole-panel.png') });

    await context.close();
  });
});
