import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { Step } from '../../src/schema/flow.types';
import { S } from '../../src/panel/strings';

/**
 * V1.1 VB-04: the rephrase trigger is now an icon-button beside the question
 * heading rather than a quiet text button below the answer area. A glyph with
 * no text is exactly the kind of control that passes a unit test and fails a
 * real person, so this asserts the four things that actually make it usable —
 * it is reachable by keyboard, it has a real accessible name, it meets the
 * 44x44 floor, and pressing it still cycles the wording — against the real
 * ported interview data, not a fixture.
 *
 * Same launchPersistentContext pattern as flow.spec.ts (see docs/TESTING.md):
 * Playwright can't open Chrome's own side-panel chrome, so panel.html is
 * driven as an ordinary extension page at a 400px viewport.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/** The first question in the real data carrying `rephrasings`, and how many
 * it carries — asserted against the source rather than hard-coded, so this
 * test fails loudly if the content is re-ported differently rather than
 * quietly testing a question that no longer has alternates. */
const SCOPE_STEP = contextModules
  .flatMap((m) => m.nodes)
  // 'fields' in node distinguishes a RepeatableBlock from a Step — the same
  // narrowing core/flow/runner.ts uses when it walks a module's nodes.
  .filter((node): node is Step => !('fields' in node))
  .find((step) => step.id === 'context_scope');

async function launchPanel(
  opts: { reducedMotion?: 'reduce' | 'no-preference'; freshInstall?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview now opens on the goal gate. This spec's
  // subject sits past it, so the walk-in seeds a passed gate — the same two
  // answers a person gives at minute one — and lands where it always did.
  if (!opts.freshInstall) await sw.evaluate(async () => {
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
  const page = await context.newPage();
  if (opts.reducedMotion) await page.emulateMedia({ reducedMotion: opts.reducedMotion });
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
  return { context, page };
}

/** Q1 is the intro (`orientation_ready`); Next alone advances it, landing on
 * `context_scope` — the first question with rephrasings. */
async function goToRephrasableQuestion(page: Page): Promise<void> {
  // V2.3 VB-90: with the gate seeded the ladder skips — the flow opens here.
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
}

/** Tabs from the top of the document until `locator` holds focus. Returns the
 * number of Tab presses it took, so a caller can assert it was reached at all
 * rather than merely being focusable via .focus(). */
async function tabUntilFocused(page: Page, selector: string, max = 25): Promise<number> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    const onTarget = await page.evaluate(
      (sel) => !!document.activeElement?.matches(sel),
      selector,
    );
    if (onTarget) return i;
  }
  throw new Error(`"${selector}" was never reached after ${max} Tab presses`);
}

test.describe('Rephrase icon-button (VB-04)', () => {
  test('is keyboard-reachable, named, ≥44x44, and cycles the question wording', async () => {
    expect(SCOPE_STEP, 'context_scope should exist in the ported data').toBeTruthy();
    const rephrasings = SCOPE_STEP?.rephrasings ?? [];
    expect(rephrasings.length, 'context_scope should still carry rephrasings').toBeGreaterThan(0);

    const { context, page } = await launchPanel();
    await goToRephrasableQuestion(page);

    // 1 — a real accessible name, not a bare glyph. getByRole resolves the
    //     name the same way an assistive tech would, so this passing *is*
    //     the assertion that aria-label carries S.rephrase's text.
    const button = page.getByRole('button', { name: S.rephrase, exact: true });
    await expect(button).toBeVisible();
    // The glyph itself is decorative and must not leak into that name.
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');

    // 2 — the 44x44 floor, even though the glyph is 17px.
    const box = await button.boundingBox();
    expect(box, 'the rephrase button should be rendered').not.toBeNull();
    expect(box!.width, 'rephrase button width').toBeGreaterThanOrEqual(44);
    expect(box!.height, 'rephrase button height').toBeGreaterThanOrEqual(44);

    // 3 — reachable by Tab, with a visible focus ring when it lands.
    await tabUntilFocused(page, '.flow-rephrase');
    await expect(button).toBeFocused();
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = getComputedStyle(el);
      const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
      return hasOutline || hasBoxShadow;
    });
    expect(ring, 'the focused rephrase button should show a visible ring').toBe(true);

    // 4 — activating it from the keyboard still cycles the wording, exactly as
    //     the old text button did: base -> each rephrasing -> back to base.
    const heading = page.locator('.flow-q');
    const base = (await heading.textContent())?.trim();
    expect(base).toBeTruthy();

    const seen: string[] = [];
    for (let i = 0; i < rephrasings.length; i++) {
      await page.keyboard.press('Enter');
      const shown = (await heading.textContent())?.trim() ?? '';
      expect(shown, `rephrasing ${i + 1} should differ from the base question`).not.toBe(base);
      expect(seen, `rephrasing ${i + 1} should differ from the earlier ones`).not.toContain(shown);
      seen.push(shown);
    }

    // One more press wraps back to the original phrasing.
    await page.keyboard.press('Enter');
    await expect(heading).toHaveText(base!);

    // The heading itself is still a plain heading — the button next to it must
    // not have been folded into the question's own accessible name.
    await expect(page.getByRole('heading', { name: base!, exact: true })).toBeVisible();

    await context.close();
  });

  test('a question without rephrasings shows no rephrase control', async () => {
    // A fresh install: only there is the opening intro still reachable
    // (VB-90's ladder skips for the seeded, gate-passed walk-ins).
    const { context, page } = await launchPanel({ freshInstall: true });
    // Q1, the why screen, has no rephrasings — intros never carry the control.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');
    await expect(page.locator('.flow-rephrase')).toHaveCount(0);
    await context.close();
  });
});

/**
 * VB-04's press cue — "spin and swap". The animation IS the feature here, so
 * none of this asserts that a class toggles: it drives the real animations the
 * browser is running, reads the transform matrix the glyph is actually painted
 * with at chosen moments, and waits for the thing to finish.
 *
 * The button is pressed from the keyboard throughout. A mouse click leaves the
 * pointer sitting on the control, and `.btn-quiet:hover` changes both its
 * colours — which would quietly invalidate the reduced-motion assertions,
 * where the whole cue is a colour change.
 */
test.describe('Rephrase press cue (VB-04 animation)', () => {
  const RING = '.flow-rephrase .rephrase-ring';
  const MARK = '.flow-rephrase .rephrase-mark';
  /** Passed into the page as one object so both halves stay a named pair. */
  const HALVES = { ring: RING, mark: MARK };

  /** Focus the button and press it, without the mouse ever touching it. */
  async function pressRephrase(page: Page): Promise<void> {
    await page.locator('.flow-rephrase').focus();
    await page.keyboard.press('Enter');
  }

  test('spins the ring and swaps the mark, at the decided frames, and completes', async () => {
    const { context, page } = await launchPanel();
    await goToRephrasableQuestion(page);
    await pressRephrase(page);

    // 1 — both halves are really animating, for the system's duration, on the
    //     system's one curve. Named so a stray third animation would show up.
    const timings = await page.evaluate(
      ({ ring, mark }) =>
        [ring, mark].map((sel) => {
          const el = document.querySelector(sel)!;
          // A CSS animation carries its curve on the keyframes rather than on
          // the effect, so the declared value is what to read for the easing.
          const declared = getComputedStyle(el);
          return el.getAnimations().map((a) => ({
            name: (a as CSSAnimation).animationName,
            duration: a.effect!.getComputedTiming().duration,
            easing: declared.animationTimingFunction,
          }));
        }),
      HALVES,
    );
    expect(timings[0]).toEqual([
      { name: 'rephrase-ring-spin', duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    ]);
    expect(timings[1]).toEqual([
      { name: 'rephrase-mark-swap', duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    ]);

    // 1b — each half turns about its own centre, in the drawing's own 24-unit
    //      coordinates. Left to the default transform-box these would resolve
    //      against each group's bounding box and the ring would wobble instead
    //      of spinning, which no amount of "is it animating" would catch.
    const origins = await page.evaluate(
      ({ ring, mark }) =>
        [ring, mark].map((sel) => {
          const style = getComputedStyle(document.querySelector(sel)!);
          return { box: style.transformBox, origin: style.transformOrigin };
        }),
      HALVES,
    );
    expect(origins[0]).toEqual({ box: 'view-box', origin: '12px 12px' });
    expect(origins[1]).toEqual({ box: 'view-box', origin: '12px 13px' });

    // 2 — the ring genuinely turns. Sampled from the computed transform the
    //     glyph is painted with, at four points through the 200ms, and the
    //     angle has to keep climbing: a `rotate()` that never reaches the DOM
    //     (wrong transform-box, a typo'd keyframe) reads 0 at every sample.
    const spin = await page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      const anim = el.getAnimations()[0]!;
      const angleNow = () => {
        const m = new DOMMatrix(getComputedStyle(el).transform);
        return ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360;
      };
      anim.pause();
      const at: number[] = [];
      for (const t of [20, 60, 100, 140]) {
        anim.currentTime = t;
        at.push(angleNow());
      }
      anim.currentTime = 0;
      const start = angleNow();
      anim.currentTime = 200;
      const end = angleNow();
      return { at, start, end };
    }, RING);
    expect(spin.start).toBeCloseTo(0, 1);
    for (let i = 1; i < spin.at.length; i++) {
      expect(spin.at[i], `the ring should be further round at sample ${i + 1}`).toBeGreaterThan(
        spin.at[i - 1]!,
      );
    }
    expect(spin.at[0], 'the ring should have moved by 20ms').toBeGreaterThan(1);
    // A full turn lands back where it started — the glyph must not end tilted.
    expect(spin.end).toBeCloseTo(0, 1);

    // 3 — the mark dips out and comes back. 45% is a keyframe, so these are
    //     the decided values exactly, not something eased into.
    const swap = await page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      const anim = el.getAnimations()[0]!;
      anim.pause();
      const sample = (t: number) => {
        anim.currentTime = t;
        const style = getComputedStyle(el);
        return {
          scale: new DOMMatrix(style.transform).a,
          opacity: Number(style.opacity),
        };
      };
      return { start: sample(0), dip: sample(90), end: sample(200) };
    }, MARK);
    expect(swap.start.scale).toBeCloseTo(1, 3);
    expect(swap.start.opacity).toBeCloseTo(1, 3);
    expect(swap.dip.scale, 'the mark should be at 62% at 45%').toBeCloseTo(0.62, 3);
    expect(swap.dip.opacity, 'the mark should be at 45% opacity at the dip').toBeCloseTo(0.45, 3);
    expect(swap.end.scale).toBeCloseTo(1, 3);
    expect(swap.end.opacity).toBeCloseTo(1, 3);

    // 4 — left alone, a fresh press runs to the end by itself, and leaves the
    //     glyph exactly as it found it. (The samples above were taken on a
    //     paused animation; this one is never touched.)
    const finish = await page.evaluate(async ({ ring, mark }) => {
      const button = document.querySelector<HTMLButtonElement>('.flow-rephrase')!;
      button.click();
      const started = performance.now();
      await Promise.all(
        [ring, mark].map((sel) => document.querySelector(sel)!.getAnimations()[0]!.finished),
      );
      const elapsed = performance.now() - started;
      const still = [ring, mark].map((sel) => {
        const style = getComputedStyle(document.querySelector(sel)!);
        return { transform: style.transform, opacity: Number(style.opacity) };
      });
      return { elapsed, still };
    }, HALVES);
    expect(finish.elapsed, 'the cue should take about 200ms').toBeGreaterThan(150);
    expect(finish.elapsed, 'the cue should not outlast its own duration').toBeLessThan(600);
    for (const state of finish.still) {
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(state.transform);
      expect(state.opacity).toBeCloseTo(1, 3);
    }

    await context.close();
  });

  test('a press mid-flight restarts the cue rather than queueing behind it', async () => {
    const { context, page } = await launchPanel();
    await goToRephrasableQuestion(page);

    // Rephrase is meant to be pressed repeatedly, so the press that lands
    // while the last one is still playing is the normal case. It has to start
    // over: one animation on the element, back at the beginning, finishing a
    // full duration later rather than in whatever was left of the first.
    const result = await page.evaluate(async (sel) => {
      const button = document.querySelector<HTMLButtonElement>('.flow-rephrase')!;
      const ring = () => document.querySelector(sel)!;
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // The first press is held at 120ms rather than slept up to it: "the
      // press that lands mid-flight" then means exactly that on a fast machine
      // and a loaded one alike, instead of racing a timer against a 200ms cue.
      button.click();
      const first = ring().getAnimations()[0]!;
      first.pause();
      first.currentTime = 120;
      const mid = { count: ring().getAnimations().length, at: Number(first.currentTime) };

      // The press that has to start it over.
      button.click();
      const second = ring().getAnimations()[0]!;
      const after = {
        count: ring().getAnimations().length,
        // A CSS animation that has just been re-added is still pending, so it
        // has no time at all yet — which is itself an answer to "did it start
        // over?", so null travels out of the page rather than being flattened.
        at: second.currentTime === null ? null : Number(second.currentTime),
        // The strongest evidence available: a different animation object, so
        // the old one was genuinely thrown away rather than left running.
        replaced: second !== first,
      };
      // Raced against a deadline: a cue that never restarts never finishes
      // either, and that should read as a failed assertion rather than as the
      // whole test hanging until Playwright gives up on it.
      const played = async (anim: Animation) => {
        const startedAt = performance.now();
        const ran = await Promise.race([
          anim.finished.then(() => true),
          wait(1500).then(() => false),
        ]);
        return { ran, took: performance.now() - startedAt };
      };

      const restarted = await played(second);

      // And a burst, the way someone reading through the alternatives actually
      // presses it: still one animation, still a whole one.
      for (let i = 0; i < 6; i++) {
        button.click();
        await wait(12);
      }
      const burst = ring().getAnimations().length;
      const lastOfBurst = await played(ring().getAnimations()[0]!);

      return { mid, after, restarted, burst, lastOfBurst };
    }, RING);

    expect(result.mid.count, 'one animation while the first press is playing').toBe(1);
    expect(result.mid.at, 'the first press should be part-way through').toBe(120);
    expect(result.after.count, 'a second press must not add a second animation').toBe(1);
    expect(result.after.replaced, 'the second press should replace the running cue').toBe(true);
    expect(result.after.at === null || result.after.at < 30).toBe(true);
    expect(result.restarted.ran, 'the restarted cue should finish on its own').toBe(true);
    expect(result.restarted.took, 'and run its full length again').toBeGreaterThan(150);
    expect(result.restarted.took, 'not carry on from where the first press had reached').toBeLessThan(1000);
    expect(result.burst, 'rapid pressing must not stack animations').toBe(1);
    expect(result.lastOfBurst.ran, 'the last press of a burst still completes').toBe(true);
    expect(result.lastOfBurst.took, 'and still gets a whole cue').toBeGreaterThan(50);

    await context.close();
  });

  test('reduced motion: nothing moves, but the press still shows itself', async () => {
    const { context, page } = await launchPanel({ reducedMotion: 'reduce' });
    await goToRephrasableQuestion(page);

    const heading = page.locator('.flow-q');
    const base = (await heading.textContent())?.trim();

    const cue = await page.evaluate(async ({ ring, mark }) => {
      const button = document.querySelector<HTMLButtonElement>('.flow-rephrase')!;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      const paint = (el: Element) => {
        const style = getComputedStyle(el);
        return { color: style.color, background: style.backgroundColor, transform: style.transform };
      };

      const rest = paint(button);
      button.click();
      await frame();

      const pressed = paint(button);
      const moving = [ring, mark].map((sel) => {
        const el = document.querySelector(sel)!;
        return { anims: el.getAnimations().length, transform: getComputedStyle(el).transform };
      });
      const confirm = button.getAnimations().map((a) => (a as CSSAnimation).animationName);

      await Promise.all(button.getAnimations().map((a) => a.finished));
      // .btn transitions its background, so give the revert a moment to land.
      await new Promise((r) => setTimeout(r, 250));
      const settled = paint(button);
      return { rest, pressed, moving, confirm, settled };
    }, HALVES);

    // Nothing rotates and nothing scales — not a slower spin, no spin.
    for (const half of cue.moving) {
      expect(half.anims, 'no animation may run on the glyph under reduced motion').toBe(0);
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(half.transform);
    }

    // But the press still registers. A control that does nothing visible when
    // pressed reads as broken, which is a failing reduced-motion state, not a
    // passing one (docs/design-system.html §06).
    expect(cue.confirm).toEqual(['rephrase-confirm']);
    expect(cue.pressed.color, 'the press should change the button colour').not.toBe(cue.rest.color);
    expect(cue.pressed.background, 'the press should fill the button').not.toBe(cue.rest.background);
    // And it is a confirmation, not a new resting state.
    expect(cue.settled.color).toBe(cue.rest.color);
    expect(cue.settled.background).toBe(cue.rest.background);

    // The wording still cycles — the substantive feedback is the same in both
    // forms, so nothing here is carried by the colour alone.
    expect(base).toBeTruthy();
    await expect(heading).not.toHaveText(base!);

    await context.close();
  });
});
