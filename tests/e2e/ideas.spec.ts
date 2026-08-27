import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { S } from '../../src/panel/strings';

/**
 * V1.1 VB-08: the "give me an example" button. `Step.ideas` has been in the
 * ported data since R1-05 — 22 questions, 94 written starter answers — and
 * nothing rendered any of it until this control existed. So this drives the
 * real thing against the real content: the examples asserted here are read out
 * of `contextModules`, not hard-coded, and a re-port that changed them would
 * fail this file rather than quietly testing a question that no longer has any.
 *
 * Same launchPersistentContext pattern as flow.spec.ts and rephrase.spec.ts
 * (see docs/TESTING.md): Playwright can't open Chrome's own side-panel chrome,
 * so panel.html is driven as an ordinary extension page at a 400px viewport.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/** Every step in the real flow, repeatable fields included. */
const ALL_STEPS: Step[] = contextModules.flatMap((m) =>
  // 'fields' in node distinguishes a RepeatableBlock from a Step — the same
  // narrowing core/flow/runner.ts uses when it walks a module's nodes.
  m.nodes.flatMap((node) => ('fields' in node ? node.fields : [node])),
);

/** The first question in the real data carrying `ideas`: `stop_explaining`,
 * module one's third node, two screens from the start. Asserted against the
 * source rather than hard-coded. */
const IDEA_STEP = ALL_STEPS.find((s) => s.id === 'stop_explaining');
const IDEAS = IDEA_STEP?.ideas ?? [];

async function launchPanel(
  opts: { reducedMotion?: 'reduce' | 'no-preference' } = {},
): Promise<{ context: BrowserContext; page: Page; sw: Worker }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview now opens on the goal gate. This spec's
  // subject sits past it, so the walk-in seeds a passed gate — the same two
  // answers a person gives at minute one — and lands where it always did.
  // Write-once: a reopen through this path must never wipe what the panel
  // has written since.
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
  return { context, page, sw };
}

/**
 * Q1 is the intro (`orientation_ready`); Next alone advances it, landing on
 * `context_scope`, a pill question. Picking its first option and pressing Next
 * lands on `stop_explaining` — the first text question carrying examples.
 */
async function goToIdeaQuestion(page: Page): Promise<void> {
  // V2.3 VB-90: with the gate seeded, the ladder and the why screen skip —
  // the walk-in lands straight on context_scope. V2.5 VB-118: its choices
  // are icon tiles now.
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
  await page.locator('.flow .vpick .vpick-tile').first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
}

/** Tabs from the top of the document until `locator` holds focus. Returns the
 * number of Tab presses it took, so a caller can assert it was reached at all
 * rather than merely being focusable via .focus(). */
async function tabUntilFocused(page: Page, selector: string, max = 25): Promise<number> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    const onTarget = await page.evaluate((sel) => !!document.activeElement?.matches(sel), selector);
    if (onTarget) return i;
  }
  throw new Error(`"${selector}" was never reached after ${max} Tab presses`);
}

test.describe('Give me an example (VB-08)', () => {
  test('shows up only where the question carries examples', async () => {
    expect(IDEA_STEP, 'stop_explaining should exist in the ported data').toBeTruthy();
    expect(IDEAS.length, 'stop_explaining should still carry ideas').toBeGreaterThan(1);

    const { context, page } = await launchPanel();

    // V2.3 VB-90: the seeded walk-in skips the ladder and the gate, opening
    // on a choice question — which already shows every answer it accepts, so
    // no example button. (V2.5 VB-118: those choices are icon tiles.)
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    await expect(page.locator('.flow-idea')).toHaveCount(0);

    // And the text question that has them does show it.
    await page.locator('.flow .vpick .vpick-tile').first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
    await expect(page.locator('.flow-idea')).toHaveCount(1);

    await context.close();
  });

  test('is named, ≥44x44, keyboard-reachable, and not the screen’s primary', async () => {
    const { context, page } = await launchPanel();
    await goToIdeaQuestion(page);

    // A real accessible name. getByRole resolves it the way assistive tech
    // would, so this passing *is* the assertion that the label is the name.
    const button = page.getByRole('button', { name: S.giveExample, exact: true });
    await expect(button).toBeVisible();
    // The glyph is decorative and must not leak into that name.
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');

    const box = await button.boundingBox();
    expect(box, 'the example button should be rendered').not.toBeNull();
    expect(box!.width, 'example button width').toBeGreaterThanOrEqual(44);
    expect(box!.height, 'example button height').toBeGreaterThanOrEqual(44);

    // Reachable by Tab, with a visible focus ring when it lands. V2.4 VB-106:
    // the ring moved from the button to `.flow-chip-paint`, its painted
    // bubble — same claim (a visible ring on focus), new box, for NavButton's
    // reason: a ring around the 44px target would float 7px off the pill a
    // person actually sees. The button's own outline must be off, or there
    // would be two rings.
    await tabUntilFocused(page, '.flow-idea');
    await expect(button).toBeFocused();
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const own = getComputedStyle(el);
      const face = el.querySelector('.flow-chip-paint');
      if (!face) return null;
      const style = getComputedStyle(face);
      const hasOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
      return { onFace: hasOutline || hasBoxShadow, onButton: own.outlineStyle !== 'none' && parseFloat(own.outlineWidth) > 0 };
    });
    expect(ring?.onFace, 'the focused example button should show a visible ring on its bubble').toBe(true);
    expect(ring?.onButton, 'and not a second ring around the hit box').toBe(false);

    // Bordered, not filled: Next is this screen's one primary
    // (docs/design-system.html §04) and there must not be a second. V2.4
    // VB-106: the hairline lives on `.flow-chip-paint` now — the button is a
    // transparent 44px target and the BUBBLE is the bordered thing — so the
    // border is measured where it is painted. Same claim, one element down.
    const classes = await page.locator('.flow-idea').getAttribute('class');
    expect(classes).toContain('btn-secondary');
    expect(classes).not.toContain('btn-primary');
    expect(await page.locator('.flow .btn-primary').count()).toBe(1);
    const border = await page.evaluate(() => {
      const style = getComputedStyle(document.querySelector('.flow-idea .flow-chip-paint')!);
      return { width: parseFloat(style.borderTopWidth), color: style.borderTopColor };
    });
    expect(border.width).toBeGreaterThan(0);
    expect(border.color).not.toBe('rgba(0, 0, 0, 0)');

    await context.close();
  });

  test('drops real text into the real field, cycles in order, and wraps', async () => {
    const { context, page } = await launchPanel();
    await goToIdeaQuestion(page);

    const field = page.locator('#flow-stop_explaining');
    const button = page.locator('.flow-idea');
    await expect(field).toHaveValue('');

    // Each press produces the next written example, in the order the data
    // lists them. These strings come from the ported source, so this fails if
    // the button ever starts inventing or reordering.
    for (const idea of IDEAS) {
      await button.click();
      await expect(field).toHaveValue(idea);
    }
    // And one more press comes back round to the first.
    await button.click();
    await expect(field).toHaveValue(IDEAS[0]!);

    // It is an ordinary value, not a placeholder and not locked: the text is
    // in `value`, the field is editable, and what it announces to assistive
    // tech is the example that just landed.
    const state = await page.evaluate(() => {
      const el = document.querySelector<HTMLTextAreaElement>('#flow-stop_explaining')!;
      const live = document.querySelector('.flow-idea-live')!;
      return {
        value: el.value,
        placeholder: el.placeholder,
        readOnly: el.readOnly,
        disabled: el.disabled,
        announced: live.textContent,
        politeness: live.getAttribute('role'),
      };
    });
    expect(state.value).toBe(IDEAS[0]);
    expect(state.placeholder).not.toBe(IDEAS[0]);
    expect(state.readOnly).toBe(false);
    expect(state.disabled).toBe(false);
    expect(state.announced).toBe(IDEAS[0]);
    expect(state.politeness).toBe('status');

    await context.close();
  });

  test('the dropped-in text edits and commits exactly like typed text', async () => {
    const { context, page, sw } = await launchPanel();
    await goToIdeaQuestion(page);

    const field = page.locator('#flow-stop_explaining');
    await page.locator('.flow-idea').click();
    await expect(field).toHaveValue(IDEAS[0]!);

    // Editing it is just typing — the caret goes to the end and carries on.
    // (V2.5 VB-120: the suffix carries the whole line past the 80-char
    // threshold, so the commit below still lands on the reflect screen —
    // a shorter edit now takes bypass (b) instead. See reflect.spec.ts.)
    const edited = `${IDEAS[0]!} And the budget process, end to end, every quarter.`;
    await field.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' And the budget process, end to end, every quarter.');
    await expect(field).toHaveValue(edited);

    // Committing it goes through the same path a typed answer does. This
    // question interprets its answer, so Next lands on the reflect screen —
    // which reads from the *stored* answer, not the draft buffer, so seeing
    // the text there is proof it was written as an ordinary answer.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'reflect');
    // V2.3 VB-95: the played-back words live in the unboxed quote now.
    expect(await page.locator('.flow .flow-reflect-quote').textContent()).toContain(edited);

    // And it is in storage under the question's own key, byte for byte, with
    // nothing marking it as machine-supplied. Once committed there is no way
    // to tell it from something typed, which is the accept criterion.
    const stored = (await sw.evaluate(() => chrome.storage.local.get('wb:answers'))) as {
      'wb:answers'?: Answers;
    };
    expect(stored['wb:answers']?.values['stop_explaining']).toBe(edited);
    expect(JSON.stringify(stored['wb:answers'])).not.toContain('idea');

    await context.close();
  });

  test('is not offered on the reflect screen’s "Say it again" re-ask', async () => {
    // A deliberate placement decision, asserted so it stays one. By the time
    // someone reaches this screen they have already written an answer and the
    // field is pre-filled with it — the blank box this button exists for is
    // gone, and the only thing it could do here is overwrite their own words.
    const { context, page } = await launchPanel();
    await goToIdeaQuestion(page);

    // V2.5 VB-120: long enough to stay a reflect drive (the 80-char bar).
    const typed = 'The context behind my own work, in my own words, with enough substance to earn the quick check.';
    await page.locator('#flow-stop_explaining').fill(typed);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'reflect');

    await page.getByRole('button', { name: S.reflectRedo, exact: true }).click();
    // The same question, the same field, pre-filled with what they wrote.
    await expect(page.locator('#flow-stop_explaining')).toHaveValue(typed);
    await expect(page.locator('.flow-idea')).toHaveCount(0);

    await context.close();
  });
});

/**
 * VB-08's press cue — "pop + rays". The animation IS the feature here, so none
 * of this asserts that a class toggles: it drives the real animations the
 * browser is running, reads the transform and opacity the glyph is actually
 * painted with at chosen moments, and waits for the thing to finish.
 *
 * The button is pressed from the keyboard wherever the paint is being read. A
 * mouse click leaves the pointer sitting on the control, and `.btn-secondary:hover`
 * changes its background — which would quietly invalidate the reduced-motion
 * assertions, where the whole cue is a colour change.
 */
test.describe('Example press cue (VB-08 animation)', () => {
  const GLASS = '.flow-idea .idea-glass';
  const RAYS = '.flow-idea .idea-rays';
  /** Passed into the page as one object so both halves stay a named pair. */
  const HALVES = { glass: GLASS, rays: RAYS };

  /** Focus the button and press it, without the mouse ever touching it. */
  async function pressExample(page: Page): Promise<void> {
    await page.locator('.flow-idea').focus();
    await page.keyboard.press('Enter');
  }

  test('pops the bulb and fires the rays, at the decided frames, and completes', async () => {
    const { context, page } = await launchPanel();
    await goToIdeaQuestion(page);

    // 0 — at rest the rays are not part of the glyph at all. A permanently lit
    //     bulb would say "this is on", which is not what this button does.
    const atRest = await page.evaluate((sel) => {
      const style = getComputedStyle(document.querySelector(sel)!);
      return { opacity: Number(style.opacity), overflow: getComputedStyle(document.querySelector('.flow-idea svg')!).overflow };
    }, RAYS);
    expect(atRest.opacity).toBe(0);
    // The burst reaches past the top of the 24-unit box; the glyph must not
    // clip its own rays.
    expect(atRest.overflow).toBe('visible');

    await pressExample(page);

    // 1 — both halves are really animating, for the decided durations, on the
    //     system's one curve. The bulb runs at --fast (120ms), the design
    //     system's "below perception" band and deliberately quicker than
    //     VB-04's 200ms rephrase spin; the rays run a third longer so the
    //     flash is still travelling as the bulb settles.
    const timings = await page.evaluate(
      ({ glass, rays }) =>
        [glass, rays].map((sel) => {
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
      { name: 'idea-glass-pop', duration: 120, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    ]);
    expect(timings[1]).toEqual([
      { name: 'idea-rays-burst', duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    ]);
    // Faster than the other button on the same screen, which is the point.
    expect(timings[0]![0]!.duration).toBeLessThan(200);

    // 1b — each half moves about its own point, in the drawing's own 24-unit
    //      coordinates. Left to the default transform-box these would resolve
    //      against each group's bounding box, and the rays would spread about
    //      the middle of their own fan instead of flying off the bulb — which
    //      no amount of "is it animating" would catch.
    const origins = await page.evaluate(
      ({ glass, rays }) =>
        [glass, rays].map((sel) => {
          const style = getComputedStyle(document.querySelector(sel)!);
          return { box: style.transformBox, origin: style.transformOrigin };
        }),
      HALVES,
    );
    expect(origins[0]).toEqual({ box: 'view-box', origin: '12px 12px' });
    expect(origins[1]).toEqual({ box: 'view-box', origin: '12px 4.8px' });

    // 2 — the bulb genuinely swells and comes back. 45% is a keyframe, so
    //     1.22 is the decided value exactly, not something eased into.
    const pop = await page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      const anim = el.getAnimations()[0]!;
      anim.pause();
      const scaleAt = (t: number) => {
        anim.currentTime = t;
        return new DOMMatrix(getComputedStyle(el).transform).a;
      };
      return {
        start: scaleAt(0),
        rising: [scaleAt(20), scaleAt(40)],
        peak: scaleAt(54),
        falling: scaleAt(90),
        end: scaleAt(120),
      };
    }, GLASS);
    expect(pop.start).toBeCloseTo(1, 3);
    expect(pop.rising[0]!, 'the bulb should have started growing by 20ms').toBeGreaterThan(1.01);
    expect(pop.rising[1]!).toBeGreaterThan(pop.rising[0]!);
    expect(pop.peak, 'the bulb should be at 1.22 at 45%').toBeCloseTo(1.22, 3);
    expect(pop.falling).toBeLessThan(pop.peak);
    expect(pop.falling).toBeGreaterThan(1);
    expect(pop.end, 'and end exactly where it started').toBeCloseTo(1, 3);

    // 3 — the rays flash in and fade out while still growing. Opacity has to
    //     reach 1 and come back to 0, and the scale must keep climbing the
    //     whole way: a burst that shrank back would read as being sucked in.
    const burst = await page.evaluate((sel) => {
      const el = document.querySelector(sel)!;
      const anim = el.getAnimations()[0]!;
      anim.pause();
      const sample = (t: number) => {
        anim.currentTime = t;
        const style = getComputedStyle(el);
        return { scale: new DOMMatrix(style.transform).a, opacity: Number(style.opacity) };
      };
      return { start: sample(0), peak: sample(72), late: sample(158) };
    }, RAYS);
    expect(burst.start.scale, 'the rays should start at 55%').toBeCloseTo(0.55, 3);
    expect(burst.start.opacity).toBeCloseTo(0, 3);
    expect(burst.peak.scale, 'and be at 105% at 45%').toBeCloseTo(1.05, 3);
    expect(burst.peak.opacity, 'fully lit at 45%').toBeCloseTo(1, 3);
    expect(burst.late.scale, 'still growing as they go out').toBeCloseTo(1.25, 2);
    expect(burst.late.opacity, 'and gone by the end').toBeLessThan(0.05);

    // 4 — left alone, a fresh press runs to the end by itself and leaves the
    //     glyph exactly as it found it. (The samples above were taken on a
    //     paused animation; this one is never touched.)
    const finish = await page.evaluate(async ({ glass, rays }) => {
      const button = document.querySelector<HTMLButtonElement>('.flow-idea')!;
      button.click();
      const started = performance.now();
      await Promise.all(
        [glass, rays].map((sel) => document.querySelector(sel)!.getAnimations()[0]!.finished),
      );
      const elapsed = performance.now() - started;
      const still = [glass, rays].map((sel) => {
        const style = getComputedStyle(document.querySelector(sel)!);
        return { transform: style.transform, opacity: Number(style.opacity) };
      });
      return { elapsed, still };
    }, HALVES);
    expect(finish.elapsed, 'the cue should take about 160ms').toBeGreaterThan(120);
    expect(finish.elapsed, 'the cue should not outlast its own duration').toBeLessThan(600);
    for (const state of finish.still) {
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(state.transform);
    }
    // The bulb is back to full strength; the rays are gone again.
    expect(finish.still[0]!.opacity).toBeCloseTo(1, 3);
    expect(finish.still[1]!.opacity).toBe(0);

    await context.close();
  });

  test('a press mid-flight restarts the cue rather than queueing behind it', async () => {
    const { context, page } = await launchPanel();
    await goToIdeaQuestion(page);

    // With ten examples on the reference questions, the press that lands while
    // the last one is still playing is not an edge case — it is how someone
    // reads through them. It has to start over: one animation on each half,
    // back at the beginning, finishing a full duration later rather than in
    // whatever was left of the first.
    const result = await page.evaluate(async ({ glass, rays }) => {
      const button = document.querySelector<HTMLButtonElement>('.flow-idea')!;
      const field = document.querySelector<HTMLTextAreaElement>('#flow-stop_explaining')!;
      const halves = () => [glass, rays].map((sel) => document.querySelector(sel)!);
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // The first press is held at 60ms rather than slept up to it: "the press
      // that lands mid-flight" then means exactly that on a fast machine and a
      // loaded one alike, instead of racing a timer against a 120ms cue.
      button.click();
      const first = halves().map((el) => el.getAnimations()[0]!);
      for (const anim of first) {
        anim.pause();
        anim.currentTime = 60;
      }
      const mid = {
        counts: halves().map((el) => el.getAnimations().length),
        at: first.map((a) => Number(a.currentTime)),
      };

      // The press that has to start it over.
      button.click();
      const second = halves().map((el) => el.getAnimations()[0]!);
      const after = {
        counts: halves().map((el) => el.getAnimations().length),
        // A CSS animation that has just been re-added is still pending, so it
        // has no time at all yet — which is itself an answer to "did it start
        // over?", so null travels out of the page rather than being flattened.
        at: second.map((a) => (a.currentTime === null ? null : Number(a.currentTime))),
        // The strongest evidence available: different animation objects, so
        // the old ones were genuinely thrown away rather than left running.
        replaced: second.every((a, i) => a !== first[i]),
      };
      // Raced against a deadline: a cue that never restarts never finishes
      // either, and that should read as a failed assertion rather than as the
      // whole test hanging until Playwright gives up on it.
      const played = async (anims: Animation[]) => {
        const startedAt = performance.now();
        const ran = await Promise.race([
          Promise.all(anims.map((a) => a.finished)).then(() => true),
          wait(1500).then(() => false),
        ]);
        return { ran, took: performance.now() - startedAt };
      };

      const restarted = await played(second);

      // And a burst, the way someone flicking through ten examples actually
      // presses it: still one animation per half, still a whole one, and every
      // press still put its own example in the field.
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        button.click();
        // Read after the gap, not before it: React commits its own state on
        // its own schedule, and this is asserting what ends up in the field,
        // not how quickly React gets it there.
        await wait(8);
        seen.push(field.value);
      }
      const burstCounts = halves().map((el) => el.getAnimations().length);
      const lastOfBurst = await played(halves().map((el) => el.getAnimations()[0]!));

      return { mid, after, restarted, burstCounts, lastOfBurst, seen };
    }, HALVES);

    expect(result.mid.counts, 'one animation per half while the first press plays').toEqual([1, 1]);
    expect(result.mid.at, 'the first press should be part-way through').toEqual([60, 60]);
    expect(result.after.counts, 'a second press must not add a second animation').toEqual([1, 1]);
    expect(result.after.replaced, 'the second press should replace the running cue').toBe(true);
    for (const at of result.after.at) expect(at === null || at < 30).toBe(true);
    expect(result.restarted.ran, 'the restarted cue should finish on its own').toBe(true);
    expect(result.restarted.took, 'and run its full length again').toBeGreaterThan(120);
    expect(result.restarted.took, 'not carry on from where the first press had reached').toBeLessThan(1000);
    expect(result.burstCounts, 'rapid pressing must not stack animations').toEqual([1, 1]);
    expect(result.lastOfBurst.ran, 'the last press of a burst still completes').toBe(true);
    expect(result.lastOfBurst.took, 'and still gets a whole cue').toBeGreaterThan(40);

    // Not one press was dropped on the way: eight presses, eight examples, in
    // order, wrapping — the animation restarting is not allowed to cost the
    // thing the button is actually for. The two presses above already took the
    // first two examples, so the burst picks up from the third.
    const PRESSES_ALREADY_MADE = 2;
    const expected = Array.from(
      { length: 8 },
      (_, i) => IDEAS[(PRESSES_ALREADY_MADE + i) % IDEAS.length]!,
    );
    expect(result.seen).toEqual(expected);

    await context.close();
  });

  test('reduced motion: nothing moves, but the press still shows itself', async () => {
    const { context, page } = await launchPanel({ reducedMotion: 'reduce' });
    await goToIdeaQuestion(page);
    // V2.4 VB-108: context_scope became a vertical pick list, which moved its
    // Next button — and the mouse parks wherever it last clicked, which on
    // stop_explaining's layout is now over this very button. Chrome applies
    // the stationary-pointer :hover a beat later, between this test's rest
    // and settled samples, so rest read white and settled read the hover's
    // --surface. Park the pointer off the controls: this test is about the
    // press cue's paint, and a hover is not a press.
    await page.mouse.move(0, 0);

    const field = page.locator('#flow-stop_explaining');
    await expect(field).toHaveValue('');

    const cue = await page.evaluate(async ({ glass, rays }) => {
      const button = document.querySelector<HTMLButtonElement>('.flow-idea')!;
      // V2.4 VB-106: the visible control is `.flow-chip-paint`, the bubble
      // inside the transparent 44px button — the confirm fill and every
      // colour this test reads land there now, so that is what gets measured.
      // Same claims as before the chips; the probe follows the paint.
      const face = button.querySelector<HTMLElement>('.flow-chip-paint')!;
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      const paint = (el: Element) => {
        const style = getComputedStyle(el);
        return {
          color: style.color,
          background: style.backgroundColor,
          border: style.borderTopColor,
          transform: style.transform,
        };
      };

      const rest = paint(face);
      button.click();
      await frame();

      const pressed = paint(face);
      const moving = [glass, rays].map((sel) => {
        const el = document.querySelector(sel)!;
        const style = getComputedStyle(el);
        return { anims: el.getAnimations().length, transform: style.transform, opacity: Number(style.opacity) };
      });
      // Keyframe animations only: the press's colour change rides the face's
      // own TRANSITION, which getAnimations() also enumerates (as a
      // CSSTransition, animationName undefined) — and the colour change is
      // exactly what reduced motion is allowed to keep.
      const confirm = face
        .getAnimations()
        .map((a) => (a as CSSAnimation).animationName)
        .filter((name) => typeof name === 'string');

      await Promise.all(face.getAnimations().map((a) => a.finished));
      // The face transitions its background, so give the revert a moment to land.
      await new Promise((r) => setTimeout(r, 250));
      const settled = paint(face);
      return { rest, pressed, moving, confirm, settled };
    }, HALVES);

    // Nothing scales and no rays fire — not a slower pop, no pop.
    for (const half of cue.moving) {
      expect(half.anims, 'no animation may run on the glyph under reduced motion').toBe(0);
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(half.transform);
    }
    expect(cue.moving[1]!.opacity, 'and the rays stay invisible').toBe(0);

    // But the press still registers. A control that does nothing visible when
    // pressed reads as broken, which is a failing reduced-motion state, not a
    // passing one (docs/design-system.html §06).
    expect(cue.confirm).toEqual(['idea-confirm']);
    expect(cue.pressed.color, 'the press should change the button colour').not.toBe(cue.rest.color);
    expect(cue.pressed.background, 'the press should fill the button').not.toBe(cue.rest.background);
    expect(cue.pressed.border, 'and take its border with it').not.toBe(cue.rest.border);
    // And it is a confirmation, not a new resting state.
    expect(cue.settled.color).toBe(cue.rest.color);
    expect(cue.settled.background).toBe(cue.rest.background);

    // The example still lands in the field — the substantive feedback is the
    // same in both forms, so nothing here is carried by the colour alone.
    await expect(field).toHaveValue(IDEAS[0]!);

    await context.close();
  });
});
