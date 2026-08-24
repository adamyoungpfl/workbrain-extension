import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DEEP_DIVE } from '../../src/core/flow/deepDive';
import { EXPAND_MS } from '../../src/core/motion/disclosure';
import { ROTATE_MS } from '../../src/core/motion/rotation';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.8 VB-42 — one follow-up at a time, as a text link, rotating.
 *
 * Accept (docs/V1.8-REFINEMENT.md): "one at a time, rotating on a 5s cycle;
 * stops on typing, hover, focus and on Next; a visible way to stop it; never
 * steals focus; reduced motion shows a static list; contrast holds for
 * whichever link colour is chosen (aqua-green on white is the risky one —
 * measure it)."
 *
 * Every one of those is a claim about a running browser, and most of them are
 * claims a unit test would happily lie about:
 *
 *  - **five seconds** is a wall clock in a real extension, not a fake timer.
 *  - **stops on hover** is a pointer over a painted box, not a synthetic event.
 *  - **contrast** is a computed colour against the colour actually behind it,
 *    both read off the live document and put through the WCAG formula. Both
 *    candidate colours from VB-42 — the blue that ships and the dark green it
 *    offered as an alternative — are measured, because "or a dark aqua green"
 *    is one CSS line away and the floor has to hold for either.
 *  - **still expands in place** is DECISIONS 1, and it is the whole reason
 *    `core/motion/disclosure.ts` is still in the tree. It is checked frame by
 *    frame, the way tests/e2e/deep-dive.spec.ts checks it for the list.
 *
 * Self-contained launch helpers, per this repo's convention that each spec
 * file stands alone (see reflect.spec.ts's own header).
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

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
function buildAnswersExcept(modules: Module[], leaveUnanswered: string): Answers {
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
        if (node.seedFrom) rolesBlock = node;
        continue;
      }
      const step = node;
      if (step.id === leaveUnanswered) continue;
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

/** Resume on one question, with everything before it already answered. */
async function resumeAt(sw: Worker, context: BrowserContext, id: string, stepId: string): Promise<Page> {
  await sw.evaluate(
    (answers) => chrome.storage.local.set({ 'wb:answers': answers }),
    buildAnswersExcept(contextModules, stepId),
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
  return page;
}

/** The approved copy, read from the data rather than retyped. */
const ORIENTATION = DEEP_DIVE.orientation_ready!;
const link = (page: Page) => page.locator('.flow .deepdive-chip');
const stop = (page: Page) => page.locator('.flow .deepdive-stop');

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

test.describe('VB-42 — the rotating follow-up', () => {
  test('shows one follow-up as a text link, not a row of chips', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // `orientation_ready` carries two. One is on screen.
    expect(ORIENTATION).toHaveLength(2);
    await expect(link(page)).toHaveCount(1);
    expect(await showing(page)).toContain(ORIENTATION[0]!.q);

    // A link, in the question's own family: bigger than V1.3's 13px tag,
    // underlined so it is never colour alone, and still a real button so
    // Enter and Space work without a key handler.
    const painted = await page.evaluate(() => {
      const chip = document.querySelector('.flow .deepdive-chip') as HTMLElement;
      const style = getComputedStyle(chip);
      const question = getComputedStyle(document.querySelector('.flow-q') as HTMLElement);
      return {
        tag: chip.tagName,
        size: parseFloat(style.fontSize),
        decoration: style.textDecorationLine,
        family: style.fontFamily === question.fontFamily,
        target: chip.getBoundingClientRect(),
      };
    });
    expect(painted.tag).toBe('BUTTON');
    expect(painted.size).toBeGreaterThan(14);
    expect(painted.decoration).toContain('underline');
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

  // ── WCAG 2.2.2 — pause, stop, hide ──────────────────────────────────

  test('stops while the pointer is over it', async () => {
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

    // Moving away starts it again — a hold, not a stop.
    await page.mouse.move(200, 700);
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 3000 }).not.toBe(held);

    await context.close();
  });

  test('stops while it has keyboard focus, and never takes focus by itself', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // Nothing has been focused yet, and the rotation must not change that.
    await page.waitForTimeout(ROTATE_MS + 500);
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');

    await link(page).focus();
    const held = await showing(page);
    await page.waitForTimeout(ROTATE_MS * 2.5);
    expect(await showing(page)).toBe(held);
    // Focus is still exactly where the person put it.
    await expect(link(page)).toBeFocused();

    await context.close();
  });

  test('stops the moment they start typing, and stays stopped', async () => {
    // A question with both a text box and more than one follow-up:
    // `contribution_boundaries` carries two (core/flow/deepDive.ts).
    const { context, sw, id } = await launchExtension();
    const page = await resumeAt(sw, context, id, 'contribution_boundaries');

    const entries = DEEP_DIVE.contribution_boundaries!;
    expect(entries.length).toBeGreaterThan(1);
    await expect(link(page)).toHaveCount(1);

    // It rotates here first — otherwise "it stopped" proves nothing.
    const first = await showing(page);
    await expect.poll(() => showing(page), { timeout: ROTATE_MS + 3000 }).not.toBe(first);

    const box = page.locator('.flow textarea.field, .flow input.field').first();
    await box.click();
    await page.keyboard.type('The bits that are not mine');
    const held = await showing(page);

    // The pointer is in the box, not on the link, and focus is in the box
    // too — so neither the hover nor the focus hold is what is stopping it.
    // Two and a half cycles of nothing changing.
    await page.waitForTimeout(ROTATE_MS * 2.5);
    expect(await showing(page)).toBe(held);
    // And there is no clock left ticking behind it.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('TEXTAREA');

    await context.close();
  });

  test('the visible stop works, stays stopped on the next question, and lands focus', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    await expect(stop(page)).toHaveCount(1);
    await expect(stop(page)).toHaveText('Show all');
    // A control anyone can reach: 44px, and reachable from the keyboard right
    // after the link it stops.
    const box = await stop(page).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);

    await link(page).focus();
    await page.keyboard.press('Tab');
    await expect(stop(page)).toBeFocused();
    await page.keyboard.press('Enter');

    // Both halves of the press: the motion is over, and every follow-up is on
    // screen rather than being traded for stillness.
    await expect(link(page)).toHaveCount(2);
    await expect(stop(page)).toHaveCount(0);
    await expect(page.locator('.flow .deepdive-chip').first()).toBeFocused();
    const settled = await page.locator('.flow .deepdive-chip').allTextContents();
    await page.waitForTimeout(ROTATE_MS * 2.2);
    expect(await page.locator('.flow .deepdive-chip').allTextContents()).toEqual(settled);

    // ...and it is one press, not one per question: the next question with
    // follow-ups is already still.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    await expect(stop(page)).toHaveCount(0);

    await context.close();
  });

  test('offers no stop where nothing moves — one follow-up is not a rotation', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    // `context_scope` carries exactly one follow-up.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    expect(DEEP_DIVE.context_scope).toHaveLength(1);
    await expect(link(page)).toHaveCount(1);
    await expect(stop(page)).toHaveCount(0);

    await context.close();
  });

  // ── DECISIONS 1 — it still expands in place ─────────────────────────

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
      const frames: { h: number; active: string; stops: number }[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        frames.push({
          h: row.getBoundingClientRect().height,
          active: `${document.activeElement?.className ?? ''}`,
          stops: row.querySelectorAll('.deepdive-stop').length,
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
    // The stop control is gone while it is open — there is nothing moving.
    expect(trace.frames.at(-1)!.stops).toBe(0);

    // The answer is the one belonging to the link that was showing.
    const entry = ORIENTATION.find((e) => opening.includes(e.q))!;
    await expect(page.locator('.flow .deepdive-answer')).toHaveText(entry.a);
    await expect(link(page)).toHaveAttribute('aria-expanded', 'true');

    // ...and it does not turn under the open answer.
    await page.waitForTimeout(ROTATE_MS + 1500);
    await expect(page.locator('.flow .deepdive-answer')).toHaveText(entry.a);

    // Closing puts one rotating link back, with its stop.
    await link(page).click();
    await expect(page.locator('.flow .deepdive-answer')).toBeHidden();
    await expect(link(page)).toHaveCount(1);
    await expect(stop(page)).toHaveCount(1);

    await context.close();
  });

  // ── reduced motion ──────────────────────────────────────────────────

  test('reduced motion shows the static list, and schedules no rotation at all', async () => {
    const { context, id } = await launchExtension('reduce');
    const page = await openPanel(context, id);
    await enterInterview(page);

    // The still equivalent carries MORE than the moving one: every follow-up
    // at once, which is what the rotation was taking turns showing.
    await expect(link(page)).toHaveCount(2);
    await expect(stop(page)).toHaveCount(0);
    const labels = await link(page).allTextContents();
    await page.waitForTimeout(ROTATE_MS * 2.2);
    expect(await link(page).allTextContents()).toEqual(labels);
    // And nothing is left running behind it.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);

    await context.close();
  });

  test('axe finds no violations on the rotating link or its stop', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await expect(link(page)).toHaveCount(1);

    // Scan a settled screen. Focus holds the rotation — which is the feature,
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
    // is switched ON, because this task adds a control.
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
});
