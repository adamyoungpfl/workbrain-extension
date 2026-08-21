import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DEEP_DIVE } from '../../src/core/flow/deepDive';
import { EXPAND_MS } from '../../src/core/motion/disclosure';
import { SHIMMER_KEYFRAME, SHIMMER_STAGGER_MS, attractMs } from '../../src/core/motion/shimmer';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.1 VB-03 accept criteria (docs/V1.1-REFINEMENT.md): "every `deepDive`
 * entry's `a` is reachable via keyboard, closes on re-click, and doesn't
 * shift focus away from the question."
 *
 * V1.3 VB-15 and VB-16 (docs/V1.3-REFINEMENT.md) add three more, and all
 * three are things a unit test would happily lie about:
 *
 *  - **"visibly tighter chips; every one still ≥44×44 to the pointer and to
 *    axe"** — two numbers about the same control that now differ on purpose.
 *    Asserted here by measuring the painted bubble *and* the box that
 *    receives the press, and by asking `elementFromPoint` what is actually
 *    under a pointer six pixels above the paint.
 *  - **"siblings animate out, closing restores them; focus never lost"** —
 *    sampled frame by frame, with `document.activeElement` read on every one
 *    of those frames rather than once at the end.
 *  - **"reduced motion still discoverable"** — the shimmer's still form is a
 *    real computed colour, not the absence of an animation.
 *
 * Unit tests can prove the phase machine; they cannot prove any of that. This
 * repo has been bitten once by a feature that passed every unit test and was
 * broken in the browser (see docs/TESTING.md), so this file drives the built
 * extension.
 *
 * Self-contained launch helpers, matching this repo's convention that each
 * spec file stands alone (see reflect.spec.ts's own header).
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

/**
 * Records every CSS animation that starts and ends on the page, and — when
 * asked — freezes each shimmer on its own first frame.
 *
 * Installed before the panel loads, because the attract is over in half a
 * second and a test that polls for it is a test that fails on a slow machine.
 *
 * The two jobs are deliberately separable. Recording answers "did it play,
 * once, staggered, and then stop"; freezing answers "does the sweep actually
 * move", which needs a frame held still to measure and therefore an attract
 * that never finishes. A tracer doing both at once would prove neither. Note
 * the pause is scoped to the animation that just started: pausing *all* of
 * them on the first event would freeze the staggered ones inside their delay,
 * where they have not started and now never will.
 */
async function traceAnimations(page: Page, freeze: 'freeze' | 'watch' = 'watch'): Promise<void> {
  await page.addInitScript(
    ([keyframe, mode]) => {
      const started: { name: string; pseudo: string | null; at: number }[] = [];
      const ended: string[] = [];
      Object.assign(window, { __wbAnimStarted: started, __wbAnimEnded: ended });
      document.addEventListener(
        'animationstart',
        (event) => {
          const e = event as AnimationEvent;
          started.push({ name: e.animationName, pseudo: e.pseudoElement || null, at: performance.now() });
          if (mode !== 'freeze' || e.animationName !== keyframe) return;
          for (const animation of document.getAnimations()) {
            const effect = animation.effect as KeyframeEffect | null;
            if (
              (animation as CSSAnimation).animationName === keyframe &&
              effect?.target === e.target &&
              (effect?.pseudoElement ?? '') === (e.pseudoElement ?? '')
            ) {
              animation.pause();
            }
          }
        },
        true,
      );
      document.addEventListener(
        'animationend',
        (event) => ended.push((event as AnimationEvent).animationName),
        true,
      );
    },
    [SHIMMER_KEYFRAME, freeze] as const,
  );
}

/** Wait until `count` sweeps have been seen, rather than guessing at a delay. */
async function waitForShimmers(page: Page, count: number): Promise<void> {
  await page.waitForFunction(
    ([keyframe, n]) =>
      (window as unknown as { __wbAnimStarted: { name: string }[] }).__wbAnimStarted.filter(
        (s) => s.name === keyframe,
      ).length >= (n as number),
    [SHIMMER_KEYFRAME, count] as const,
  );
}

async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  return page;
}

/** Home -> the Context interview, keyboard-only, same as flow.spec.ts. */
async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
}

/**
 * Answers every Context question except `leaveUnanswered`, so `findPosition`
 * lands straight on it. Mirrors proof.spec.ts's / home.spec.ts's own
 * `buildDoneAnswers` (duplicated per the standalone-spec convention) with
 * the one hole punched in it.
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

/** The approved copy, read from the data rather than retyped — a drift here
 * should fail as a copy change, not as a stale string in a test. */
const ORIENTATION = DEEP_DIVE.orientation_ready!;
const VOICE_DIRECTNESS = DEEP_DIVE.voice_directness!;

test.describe('the deeper-dive follow-ups', () => {
  test('opens and closes on Enter, and never shifts focus away from the question', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // Question one, `orientation_ready` — two authored follow-ups.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');
    const chips = page.locator('.flow .deepdive-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.nth(0)).toHaveText(new RegExp(ORIENTATION[0]!.q));
    await expect(chips.nth(1)).toHaveText(new RegExp(ORIENTATION[1]!.q));

    // The old always-visible hint is gone — its content is what the chips
    // now hold, and printing both would say the same thing twice.
    await expect(page.locator('.flow .flow-hint')).toHaveCount(0);
    await expect(page.getByText('Context is a short, plain-text file', { exact: false })).toHaveCount(0);

    // Closed to begin with, and the answer is not readable.
    await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'false');
    const firstAnswer = page.locator('.flow .deepdive-answer').nth(0);
    await expect(firstAnswer).toBeHidden();

    // --- keyboard: focus the chip, press Enter ---
    const questionBefore = await page.locator('.flow-q').boundingBox();
    await chips.nth(0).focus();
    await page.keyboard.press('Enter');

    await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(firstAnswer).toBeVisible();
    await expect(firstAnswer).toHaveText(ORIENTATION[0]!.a);

    // Focus did not move — the accept criterion. Asserted on the live
    // document, not on Playwright's own idea of the focused locator.
    await expect(chips.nth(0)).toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.className)).toContain('deepdive-chip');

    // ...and the question itself has not moved or scrolled away under them.
    const questionAfter = await page.locator('.flow-q').boundingBox();
    expect(questionAfter?.y).toBe(questionBefore?.y);
    await expect(page.locator('.flow-q')).toBeVisible();

    // --- and closes again on a second press, focus still put ---
    await page.keyboard.press('Enter');
    await expect(chips.nth(0)).toHaveAttribute('aria-expanded', 'false');
    await expect(firstAnswer).toBeHidden();
    await expect(chips.nth(0)).toBeFocused();

    await context.close();
  });

  // ── V1.3 VB-15 — thinner chips, unchanged targets ───────────────────

  test('the bubble is visibly tighter than the 44px target it sits inside', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const measured = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.flow .deepdive-item')).map((item) => {
        const chip = item.querySelector('.deepdive-chip')!;
        const bubble = item.getBoundingClientRect();
        const target = chip.getBoundingClientRect();
        return {
          bubble: { w: bubble.width, h: bubble.height, top: bubble.top, bottom: bubble.bottom },
          target: { w: target.width, h: target.height, top: target.top, bottom: target.bottom },
        };
      }),
    );
    expect(measured.length).toBeGreaterThan(0);

    for (const [i, m] of measured.entries()) {
      // Tighter: a tag, not a button. V1.1 painted the full 44.
      expect(m.bubble.h, `bubble #${i} is not tighter than a button`).toBeLessThanOrEqual(32);
      // ...and the floor has not moved (docs/GUARDRAILS.md).
      expect(m.target.h, `target #${i} height`).toBeGreaterThanOrEqual(44);
      expect(m.target.w, `target #${i} width`).toBeGreaterThanOrEqual(44);
      // The extra height is real, and it is on both sides of the paint.
      expect(m.target.top).toBeLessThan(m.bubble.top);
      expect(m.target.bottom).toBeGreaterThan(m.bubble.bottom);
    }

    // Two rows of 44px targets, and they must not overlap each other.
    for (let i = 1; i < measured.length; i++) {
      const above = measured[i - 1]!.target;
      const below = measured[i]!.target;
      if (below.top > above.top) expect(below.top).toBeGreaterThanOrEqual(above.bottom - 0.5);
    }

    // To the pointer, not just to a rectangle: six pixels above the paint,
    // where V1.1 would have had nothing, the press still lands on the chip.
    const hit = await page.evaluate(() => {
      const item = document.querySelector('.flow .deepdive-item')!;
      const box = item.getBoundingClientRect();
      const el = document.elementFromPoint(box.left + box.width / 2, box.top - 6);
      return { tag: el?.tagName, cls: el?.className ?? '' };
    });
    expect(hit.tag).toBe('BUTTON');
    expect(hit.cls).toContain('deepdive-chip');

    await context.close();
  });

  test('axe agrees about the target size, with its own rule switched on', async () => {
    const { context, id } = await launchExtension('reduce');
    const page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.flow .deepdive-chip').first()).toBeVisible();

    // `target-size` ships disabled (it is WCAG 2.2 AA and axe leaves it off);
    // this feature is exactly the reason to turn it on. Its own floor is 24px,
    // which is not this repo's floor — the 44 is measured above.
    const results = await new AxeBuilder({ page }).include('.flow').withRules(['target-size']).analyze();
    expect(results.violations).toEqual([]);
    expect(results.passes.some((p) => p.id === 'target-size')).toBe(true);

    await context.close();
  });

  test('the focus ring is drawn around the bubble you can see', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    await page.locator('.flow .deepdive-chip').first().focus();
    const ring = await page.evaluate(() => {
      const chip = document.activeElement as HTMLElement;
      const item = chip.closest('.deepdive-item') as HTMLElement;
      const style = getComputedStyle(item);
      return {
        onTheChip: chip.className,
        width: parseFloat(style.outlineWidth),
        style: style.outlineStyle,
        colour: style.outlineColor,
        offset: style.outlineOffset,
      };
    });
    expect(ring.onTheChip).toContain('deepdive-chip');
    // 2px --primary, 2px offset — the same ring as every other control. It is
    // on the bubble because the button is 14px taller than the paint, and a
    // ring around empty space is not a visible focus indicator.
    expect(ring.width).toBeGreaterThanOrEqual(2);
    expect(ring.style).toBe('solid');
    expect(ring.colour).toBe('rgb(42, 79, 203)');
    expect(ring.offset).toBe('2px');

    await context.close();
  });

  // ── V1.3 VB-16 — the shimmer ────────────────────────────────────────

  test('the shimmer plays once per chip, staggered, and then the row is genuinely still', async () => {
    const { context, id } = await launchExtension();
    const page = await context.newPage();
    await traceAnimations(page, 'watch');
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    await enterInterview(page);
    await expect(page.locator('.flow .deepdive-item')).toHaveCount(2);
    await waitForShimmers(page, 2);

    // Wait the attract out, generously, then prove nothing is left running —
    // "still" means no frames requested, not an invisible animation.
    await page.waitForTimeout(attractMs(2) + 400);
    const after = await page.evaluate((keyframe) => {
      const started = (window as unknown as { __wbAnimStarted: { name: string; pseudo: string | null; at: number }[] })
        .__wbAnimStarted;
      const ended = (window as unknown as { __wbAnimEnded: string[] }).__wbAnimEnded;
      const shimmers = started.filter((s) => s.name === keyframe);
      const row = document.querySelector('.flow .deepdive') as HTMLElement;
      return {
        starts: shimmers.length,
        pseudos: shimmers.map((s) => s.pseudo),
        gap: shimmers.length > 1 ? shimmers[1]!.at - shimmers[0]!.at : 0,
        ends: ended.filter((n) => n === keyframe).length,
        mode: row.dataset.shimmer,
        running: document
          .getAnimations()
          .filter((a) => row.contains((a.effect as KeyframeEffect | null)?.target ?? null)).length,
      };
    }, SHIMMER_KEYFRAME);
    // One pass per chip, on the overlay, staggered by --fast — and the name
    // the stylesheet uses is the one core/motion/shimmer.ts exports, which
    // only a real browser can confirm.
    expect(after.starts).toBe(2);
    expect(after.pseudos).toEqual(['::after', '::after']);
    expect(after.gap).toBeGreaterThan(SHIMMER_STAGGER_MS * 0.5);
    expect(after.ends).toBe(2);
    // And then it burns out for good: no animation, not even a finished one.
    expect(after.mode).toBe('none');
    expect(after.running).toBe(0);

    await context.close();
  });

  test('the sweep genuinely moves — a coloured band crossing the chip', async () => {
    const { context, id } = await launchExtension();
    const page = await context.newPage();
    await traceAnimations(page, 'freeze');
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    await enterInterview(page);
    await waitForShimmers(page, 1);

    // Held on its first frame by the tracer, so it can be seeked and read.
    // A class toggling proves nothing; this is the paint being somewhere else.
    const sweep = await page.evaluate((keyframe) => {
      const item = document.querySelector('.flow .deepdive-item') as HTMLElement;
      const read = () => getComputedStyle(item, '::after').backgroundPositionX;
      const animation = document
        .getAnimations()
        .find((a) => (a as CSSAnimation).animationName === keyframe);
      if (!animation) return null;
      const at = (ms: number) => {
        animation.currentTime = ms;
        return read();
      };
      return {
        start: at(0),
        middle: at(160),
        end: at(320),
        image: getComputedStyle(item, '::after').backgroundImage,
      };
    }, SHIMMER_KEYFRAME);

    expect(sweep).not.toBeNull();
    expect(sweep!.start).not.toBe(sweep!.middle);
    expect(sweep!.middle).not.toBe(sweep!.end);
    // It ends where the resting chip sits, so a finished sweep shows nothing.
    expect(sweep!.end).toBe('0%');
    // A coloured band, not a grey one: --primary at low alpha.
    expect(sweep!.image).toContain('rgba(42, 79, 203');

    await context.close();
  });

  test('reduced motion schedules no shimmer at all, and the chips stay coloured', async () => {
    const { context, id } = await launchExtension('reduce');
    const page = await context.newPage();
    await traceAnimations(page);
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    await enterInterview(page);
    await expect(page.locator('.flow .deepdive-item')).toHaveCount(2);
    await page.waitForTimeout(attractMs(2) + 200);

    const still = await page.evaluate(() => {
      const started = (window as unknown as { __wbAnimStarted: { name: string }[] }).__wbAnimStarted;
      const item = document.querySelector('.flow .deepdive-item') as HTMLElement;
      const overlay = getComputedStyle(item, '::after');
      return {
        anyShimmer: started.filter((s) => s.name === 'wb-dd-shimmer').length,
        running: document.getAnimations().length,
        tint: overlay.backgroundColor,
        image: overlay.backgroundImage,
        chipInk: getComputedStyle(item.querySelector('.deepdive-chip')!).color,
      };
    });
    // Nothing was scheduled, not merely nothing seen.
    expect(still.anyShimmer).toBe(0);
    expect(still.running).toBe(0);
    // The still equivalent carries the same job: a steady coloured tint, so
    // the chips are as easy to find as the moving version made them.
    expect(still.image).toBe('none');
    expect(still.tint).toBe('rgba(42, 79, 203, 0.1)');
    // ...and the label is still the readable --ink-2 on top of it.
    expect(still.chipInk).toBe('rgb(82, 90, 103)');

    await context.close();
  });

  // ── V1.3 VB-16 — expand in place ────────────────────────────────────

  test('opening expands one bubble, removes the others, and animates the height', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.flow .deepdive-item')).toHaveCount(2);

    // Press it from the keyboard, then watch every frame for 400ms: the row's
    // height, how many chips are mounted, and — the thing that would break
    // silently — where the focus is.
    const trace = await page.evaluate(async (ms) => {
      const row = document.querySelector('.flow .deepdive') as HTMLElement;
      const chip = row.querySelector('.deepdive-chip') as HTMLButtonElement;
      const before = row.getBoundingClientRect().height;
      chip.focus();
      chip.click();
      const frames: { t: number; h: number; items: number; active: string }[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        frames.push({
          t: performance.now() - t0,
          h: row.getBoundingClientRect().height,
          items: row.querySelectorAll('.deepdive-item').length,
          active: `${document.activeElement?.tagName}.${document.activeElement?.className ?? ''}`,
        });
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { before, frames };
    }, EXPAND_MS * 2);

    const after = trace.frames.at(-1)!.h;
    expect(after).toBeGreaterThan(trace.before + 20);

    // It moved through the middle rather than cutting to the end: at least a
    // handful of frames sit strictly between the two heights.
    const between = trace.frames.filter((f) => f.h > trace.before + 1 && f.h < after - 1);
    expect(between.length).toBeGreaterThan(3);
    // ...and no frame overshoots either end.
    for (const f of trace.frames) {
      expect(f.h).toBeGreaterThanOrEqual(Math.min(trace.before, after) - 1);
      expect(f.h).toBeLessThanOrEqual(Math.max(trace.before, after) + 1);
    }
    // The sibling is mounted while it leaves, and gone once it has.
    expect(trace.frames[0]!.items).toBe(2);
    expect(trace.frames.at(-1)!.items).toBe(1);
    // Focus never fell to the body on any frame, including the ones either
    // side of the unmount.
    expect(trace.frames.every((f) => f.active.includes('deepdive-chip'))).toBe(true);
    expect(trace.frames.some((f) => f.active === 'BODY.')).toBe(false);

    // The end state: one bubble, its answer, and the focus still on it.
    await expect(page.locator('.flow .deepdive-item')).toHaveCount(1);
    await expect(page.locator('.flow .deepdive-chip')).toHaveCount(1);
    await expect(page.locator('.flow .deepdive-chip')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.flow .deepdive-answer')).toHaveText(ORIENTATION[0]!.a);
    await expect(page.locator('.flow .deepdive-chip')).toBeFocused();

    await context.close();
  });

  test('closing animates the siblings back to exactly the boxes they left from', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const boxesAt = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('.flow .deepdive-item')).map((el) => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
        }),
      );

    const rest = await boxesAt();
    expect(rest).toHaveLength(2);

    await page.locator('.flow .deepdive-chip').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow .deepdive-item')).toHaveCount(1);

    // Close it, and watch the way back the same way.
    const trace = await page.evaluate(async (ms) => {
      const row = document.querySelector('.flow .deepdive') as HTMLElement;
      const chip = row.querySelector('.deepdive-chip') as HTMLButtonElement;
      const before = row.getBoundingClientRect().height;
      chip.focus();
      chip.click();
      // One frame for React to commit the press. Sampling before that would
      // be reading the tree the click has not been applied to yet.
      await new Promise((r) => requestAnimationFrame(r));
      const frames: { h: number; items: number; active: string }[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        frames.push({
          h: row.getBoundingClientRect().height,
          items: row.querySelectorAll('.deepdive-item').length,
          active: `${document.activeElement?.tagName}.${document.activeElement?.className ?? ''}`,
        });
        await new Promise((r) => requestAnimationFrame(r));
      }
      return { before, frames };
    }, EXPAND_MS * 2);

    const after = trace.frames.at(-1)!.h;
    expect(after).toBeLessThan(trace.before - 20);
    expect(trace.frames.filter((f) => f.h < trace.before - 1 && f.h > after + 1).length).toBeGreaterThan(3);
    // The siblings are back for the whole way home, not conjured at the end.
    expect(trace.frames[0]!.items).toBe(2);
    expect(trace.frames.every((f) => f.items === 2)).toBe(true);
    expect(trace.frames.every((f) => f.active.includes('deepdive-chip'))).toBe(true);

    // Everything is exactly where it was, and nothing is left inline.
    expect(await boxesAt()).toEqual(rest);
    await expect(page.locator('.flow .deepdive-chip').first()).toBeFocused();
    await expect(page.locator('.flow .deepdive-chip').first()).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.querySelector('.flow .deepdive')!.getAttribute('style'))).toBe('');

    await context.close();
  });

  test('with motion off it opens and closes at once, and still keeps focus', async () => {
    const { context, id } = await launchExtension('reduce');
    const page = await openPanel(context, id);
    await enterInterview(page);

    // Watch it for a third of a second: with motion off the height must take
    // exactly two values — the one it had and the one it has. Any third value
    // is an animation, however short.
    const opened = await page.evaluate(async () => {
      const row = document.querySelector('.flow .deepdive') as HTMLElement;
      const chip = row.querySelector('.deepdive-chip') as HTMLButtonElement;
      const before = Math.round(row.getBoundingClientRect().height);
      chip.focus();
      chip.click();
      const heights: number[] = [];
      const ghosts: number[] = [];
      const actives: string[] = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 320) {
        heights.push(Math.round(row.getBoundingClientRect().height));
        ghosts.push(row.querySelectorAll('.is-leaving, .is-entering').length);
        actives.push(document.activeElement?.className ?? '');
        await new Promise((r) => requestAnimationFrame(r));
      }
      return {
        before,
        heights: [...new Set(heights)],
        items: row.querySelectorAll('.deepdive-item').length,
        ghosts: Math.max(...ghosts),
        answerHidden: (row.querySelector('.deepdive-answer') as HTMLElement).hidden,
        actives: [...new Set(actives)],
        running: document.getAnimations().length,
      };
    });
    expect(opened.items).toBe(1);
    expect(opened.ghosts).toBe(0);
    expect(opened.answerHidden).toBe(false);
    expect(opened.actives.every((c) => c.includes('deepdive-chip'))).toBe(true);
    expect(opened.running).toBe(0);
    expect(opened.heights.length).toBeLessThanOrEqual(2);
    expect(opened.heights).toContain(opened.before);

    const closed = await page.evaluate(async () => {
      const row = document.querySelector('.flow .deepdive') as HTMLElement;
      const chip = row.querySelector('.deepdive-chip') as HTMLButtonElement;
      chip.click();
      await new Promise((r) => requestAnimationFrame(r));
      return {
        items: row.querySelectorAll('.deepdive-item').length,
        active: document.activeElement?.className ?? '',
        running: document.getAnimations().length,
      };
    });
    expect(closed.items).toBe(2);
    expect(closed.active).toContain('deepdive-chip');
    expect(closed.running).toBe(0);

    await context.close();
  });

  test('aria-expanded stays true while it is open, and the answer sits in a live region', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const chip = page.locator('.flow .deepdive-chip').first();
    await chip.click();
    await expect(page.locator('.flow .deepdive-item')).toHaveCount(1);

    const wiring = await page.evaluate(() => {
      const open = document.querySelector('.flow .deepdive-chip') as HTMLButtonElement;
      const id = open.getAttribute('aria-controls')!;
      const answer = document.getElementById(id)!;
      return {
        expanded: open.getAttribute('aria-expanded'),
        resolves: !!answer,
        announced: answer.closest('[aria-live]')?.getAttribute('aria-live') ?? null,
        visible: !answer.hidden,
        // Every chip on screen still points at something that exists.
        allResolve: Array.from(document.querySelectorAll('.deepdive-chip')).every(
          (c) => !!document.getElementById(c.getAttribute('aria-controls') ?? ''),
        ),
      };
    });
    expect(wiring).toEqual({
      expanded: 'true',
      resolves: true,
      announced: 'polite',
      visible: true,
      allResolve: true,
    });

    await context.close();
  });

  test('axe finds no violations on the question, disclosure closed or open', async () => {
    const { context, id } = await launchExtension('reduce'); // scan the settled state
    const page = await openPanel(context, id);
    await enterInterview(page);

    /**
     * Three page-shell best-practice rules are switched off: they are all
     * about the document's own landmark/heading structure (`panel.html` +
     * App.tsx render no `<main>` and no `<h1>`), they fire identically on
     * this screen with the disclosure closed, and nothing VB-03 renders can
     * fix or worsen them. Everything else — name, role, state, contrast,
     * focus order, aria-controls resolution — stays on. Scanned in BOTH
     * states below precisely so "disabled a rule" can't hide a regression
     * this feature introduced: if opening a chip broke anything, the second
     * scan would differ from the first.
     */
    const scan = () =>
      new AxeBuilder({ page })
        .disableRules(['region', 'page-has-heading-one', 'landmark-one-main'])
        .analyze();

    expect((await scan()).violations).toEqual([]);

    await page.locator('.flow .deepdive-chip').nth(0).click();
    await expect(page.locator('.flow .deepdive-answer').nth(0)).toBeVisible();

    expect((await scan()).violations).toEqual([]);

    await context.close();
  });

  test('the three voice questions keep their worked examples visible AND get a deep-dive', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildAnswersExcept(contextModules, 'voice_directness');
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await enterInterview(page);
    // V1.4 VB-20: a fixture with every role answered now resumes at the roles
    // loop's "another role?" — the first unfinished thing in the flow, and
    // before this question. There isn't another; say so and carry on.
    if ((await page.locator('.flow').getAttribute('data-position')) === 'add-another') {
      await page.getByRole('button', { name: 'No', exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'voice_directness');

    // The examples are what make this question answerable at a glance, so
    // they stay inline — decided in docs/V1.1-REFINEMENT.md, not optional.
    const hint = page.locator('.flow .flow-hint');
    await expect(hint).toHaveCount(1);
    await expect(hint).toContainText('Diplomatic:');
    await expect(hint).toContainText('Blunt:');

    // ...and the deep-dive adds what the hint does not say. One follow-up:
    // there is nothing to remove, and it must still expand in place.
    const chip = page.locator('.flow .deepdive-chip');
    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveText(new RegExp(VOICE_DIRECTNESS[0]!.q));
    await chip.click();
    await expect(page.locator('.flow .deepdive-answer')).toHaveText(VOICE_DIRECTNESS[0]!.a);
    await expect(page.locator('.flow .deepdive-item')).toHaveCount(1);
    await expect(chip).toHaveAttribute('aria-expanded', 'true');

    await context.close();
  });

  test('a question with a hint and no deep-dive still renders its hint, untouched', async () => {
    // The proof loop's service picker (core/flow/proofAdapter.ts) is the
    // one shipped question that has a hint and no deep-dive — proof that
    // `hint` was not removed, only superseded where a deep-dive exists.
    const { context, sw, id } = await launchExtension();
    const seeded = buildAnswersExcept(contextModules, '__nothing__');
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_service');

    await expect(page.locator('.flow .flow-hint')).toHaveText('Which AI do you use most?');
    await expect(page.locator('.flow .deepdive-chip')).toHaveCount(0);

    await context.close();
  });
});

