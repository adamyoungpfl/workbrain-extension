import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import {
  NAV_MELT_CLUSTER_MS,
  NAV_MELT_DROP,
  NAV_MELT_STAGGER_MS,
  NAV_RISE_DELAY_MS,
  navMeltClusterMs,
} from '../../src/core/flow/navMelt';
import AxeBuilder from '@axe-core/playwright';
import { FLOW_NAV_TARGET } from '../../src/core/flow/dock';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.9 VB-53 accept criteria, driven in a real browser.
 *
 * "On advancing, the nav buttons melt down into the bar, and only the buttons
 * valid for the next question rise back out to reform."
 *
 * src/core/flow/navMelt.test.ts proves the arithmetic — 200ms end to end, a
 * travel a press can still land inside, and what becomes of each control
 * across a swap. It cannot prove any of the four things this file is for, and
 * every one of them is measured rather than inferred from a class:
 *
 *  · **It happens.** Real computed transforms, sampled every frame of a real
 *    advance: a copy of the outgoing cluster genuinely translating down and
 *    squashing, and the live cluster genuinely translating up. Plus painted
 *    pixels, because a matrix is still not a picture.
 *  · **It never gates input.** Next is pressed with the melt frozen in flight
 *    and the live controls still invisible, and the answer is read back out
 *    of the person's own storage. VB-10's typewriter holds this line by
 *    typing during the print; this is the same proof for the same rule.
 *  · **Only the valid buttons come back.** Asserted for a question with and
 *    without Skip and with and without Back, off `data-nav-fate`, which the
 *    panel stamps from the two clusters actually on screen.
 *  · **It survives being interrupted.** Presses 40ms apart, forwards and
 *    backwards, and then the cluster has to be exactly what the position it
 *    landed on demands — no leftovers, no missing control, nothing mid-flight.
 *
 * And under `prefers-reduced-motion` none of it is *scheduled*: no copy is
 * ever made, no class is ever added, no animation ever exists.
 *
 * ── V2.0 ADDS THE TWO THINGS THAT WERE NEVER LOCKED ──────────────────────
 * V1.9 was measurably right about all of the above and still not what Adam
 * asked for, in two ways nothing here was watching:
 *
 *  · **It has to play on EVERY question**, not only where the cluster
 *    changes. Every test above advances between two screens that offer
 *    different controls, so a build in which the gesture only fired on a
 *    changed button set would have passed all of them. Adam's requirement is
 *    the opposite one: *"a visibly detectable animation on each page change …
 *    even if it happens to be the same kind as the last."* `consecutive
 *    advances` below presses Next four times through questions that all offer
 *    Back, Next and Skip, and demands the gesture every time.
 *  · **It has to be a wave, not a blink.** Three words leaving together is
 *    one event the eye discards, and that is why V1.9's melt was never seen.
 *    `the cluster moves in sequence` reads the controls' own transforms and
 *    demands that they are at genuinely different points at the same moment.
 *
 * Both are read off the screen. Neither can be satisfied by a class.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb53');
const PANEL = { width: 400, height: 760 };

/** The two keyframes this task adds, by name. Everything else the page may be
 * animating at the same moment — the drawer's settle, a colour transition —
 * is somebody else's cue and must not be counted as this one. */
const MELT_ANIMATIONS = ['nav-melt', 'nav-rise'];

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** The same fixture the VB-11, VB-22, VB-30 and VB-41 specs use. */
function answersUpToModule(modules: Module[], stopBeforeModuleId: string): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of modules) {
    if (module.id === stopBeforeModuleId) break;
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const step: Step = node;
      const key = step.key ?? step.id;
      let value: AnswerValue;
      if (step.kind === 'intro') value = null;
      else if (step.kind === 'yesno') value = 'no';
      else if (step.kind === 'chips') value = step.options?.[0]?.v ?? 'x';
      else if (step.kind === 'multi') value = step.options?.length ? [step.options[0]!.v] : [];
      else value = `A test answer for ${step.id}.`;
      values[key] = value;
      answeredAt[key] = now;
      if (typeof value === 'string') reflectedAt[key] = now;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

const answersFrom = (sw: Worker) =>
  sw.evaluate(async () => {
    const stored = await chrome.storage.local.get('wb:answers');
    return (stored['wb:answers'] ?? null) as Answers | null;
  });

/**
 * The panel, sitting on the transition screen into "About Me" — one module
 * answered, the next one not.
 *
 * Chosen because the three questions either side of it are exactly the four
 * cases VB-53 has to be right about, without seeding anything artificial:
 *
 *   transition   Next only            (no Back — nothing behind it yet)
 *   ↓ Next
 *   preferred_name   Back, Next, Skip (Back and Skip ARRIVE)
 *   ↓ Next
 *   professional_name  Back, Next, Skip  (all three REFORM), and optional, so
 *                    it is the question Next can be pressed on mid-melt
 *   ↑ Back to the transition          (Back and Skip MELT and do not return)
 */
async function openTransition(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, 'about-me'));
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.filedrawer-handle');
  await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
  await settle(page);
  return page;
}

/** Everything this task can be mid-flight, over and done with. */
async function settle(page: Page): Promise<void> {
  await expect.poll(() => runningMelts(page)).toBe(0);
  await expect.poll(() => page.locator('.flow-melt > *').count()).toBe(0);
}

const runningMelts = (page: Page) =>
  page.evaluate(
    (names) =>
      document
        .getAnimations()
        .filter((a) => names.includes((a as unknown as { animationName?: string }).animationName ?? ''))
        .length,
    MELT_ANIMATIONS,
  );

/**
 * Holds every frame of the melt still, so a press or a screenshot lands
 * *provably* mid-gesture rather than probably mid-gesture.
 *
 * A round trip is a handful of milliseconds and the whole gesture is 200, so
 * racing it would make these tests a coin toss on a loaded machine — and a
 * flaky test of "it never gates input" is worse than none. One stylesheet,
 * added before the press, is the whole trick: the classes are the panel's own,
 * the animations are the panel's own, and only the clock is borrowed.
 */
async function freezeMelt(page: Page) {
  return page.addStyleTag({
    // `.navbtn-face` and not the classed element itself: what animates is the
    // control's ink, inside the button (components/NavButton.tsx), because
    // nothing pressable is allowed to move.
    content: '.is-melting .navbtn-face, .is-rising .navbtn-face { animation-play-state: paused !important; }',
  });
}

/** Puts the clock back and lets the gesture finish normally. */
async function thawMelt(page: Page, frozen: Awaited<ReturnType<typeof freezeMelt>>): Promise<void> {
  await frozen.evaluate((el) => (el as HTMLElement).remove());
  await settle(page);
}

/** Winds every frozen melt to one moment, and says how many it found. Zero
 * means the test is proving nothing and should say so. */
function holdAt(page: Page, at: number): Promise<number> {
  return page.evaluate(
    ({ names, at }) => {
      const running = document
        .getAnimations()
        .filter((a) => names.includes((a as unknown as { animationName?: string }).animationName ?? ''));
      for (const animation of running) animation.currentTime = at;
      return running.length;
    },
    { names: MELT_ANIMATIONS, at },
  );
}

interface ControlState {
  id: string;
  fate: string | null;
  /** The computed matrix, as the six numbers a 2D transform has. `null` where
   * the browser reports `none`, which is the resting value. */
  matrix: number[] | null;
  opacity: number;
  /** The 44px box, measured — the floor this cue is not allowed to erode, and
   * the box VB-10 does not allow to move while a question prints. */
  box: { width: number; height: number; top: number };
}

interface ClusterState {
  live: ControlState[];
  ghost: ControlState[];
}

/** What both clusters are, right now, read off the page rather than assumed. */
function clusterState(page: Page): Promise<ClusterState> {
  return page.evaluate(() => {
    const read = (root: ParentNode) =>
      [...root.querySelectorAll<HTMLElement>('.navbtn[data-nav]')].map((el) => {
        // What moves is the INK — `.navbtn-face`, inside the button. The
        // button and its wrapper are what must not move, so both are read.
        const face = el.querySelector<HTMLElement>('.navbtn-face');
        const style = getComputedStyle(face ?? el);
        const transform = style.transform;
        const numbers =
          transform && transform !== 'none'
            ? transform
                .slice(transform.indexOf('(') + 1, -1)
                .split(',')
                .map((n) => Number(n.trim()))
            : null;
        const button = el.querySelector<HTMLElement>('.btn');
        const rect = button?.getBoundingClientRect();
        return {
          id: el.getAttribute('data-nav') ?? '',
          fate: el.getAttribute('data-nav-fate'),
          matrix: numbers,
          opacity: Number(getComputedStyle(el).opacity) * Number(style.opacity),
          box: {
            width: rect?.width ?? 0,
            height: rect?.height ?? 0,
            top: Math.round(rect?.top ?? 0),
          },
        };
      });
    const foot = document.querySelector('.flowshell .flow-foot');
    const layer = document.querySelector('.flow-melt');
    return { live: foot ? read(foot) : [], ghost: layer ? read(layer) : [] };
  });
}

/** Which screen the panel is on, as one string. Position AND step, because a
 * text question and its reflect screen share a step id and are two different
 * pages — a check on the step alone would call that advance a no-op. */
const whereWeAre = async (page: Page) => {
  const flow = page.locator('.flow');
  return `${await flow.getAttribute('data-position')}/${await flow.getAttribute('data-step-id')}`;
};

const ids = (controls: readonly ControlState[]) => controls.map((c) => c.id);
const fateOf = (controls: readonly ControlState[], id: string) =>
  controls.find((c) => c.id === id)?.fate ?? null;

/** How far down a control has been pushed, in px, from its computed matrix. */
const dropOf = (control: ControlState) => (control.matrix ? (control.matrix[5] ?? 0) : 0);
/** What its height has been scaled to. 1 is unsquashed. */
const squashOf = (control: ControlState) => (control.matrix ? (control.matrix[3] ?? 1) : 1);

/**
 * Every frame of one advance, sampled inside the page.
 *
 * A round trip per frame would miss most of a 200ms gesture, so the sampler
 * runs in the page on `requestAnimationFrame` and the whole recording is read
 * back afterwards. `press` happens inside the same evaluate, so recording
 * starts before the click rather than a round trip after it.
 */
function recordAdvance(page: Page, label: string): Promise<ClusterState[]> {
  return page.evaluate(
    async ({ label, ms }) => {
      const read = (root: ParentNode) =>
        [...root.querySelectorAll<HTMLElement>('.navbtn[data-nav]')].map((el) => {
          // What moves is the INK — `.navbtn-face`, inside the button. The
          // button and its wrapper are what must not move, so both are read.
          const face = el.querySelector<HTMLElement>('.navbtn-face');
          const style = getComputedStyle(face ?? el);
          const transform = style.transform;
          const numbers =
            transform && transform !== 'none'
              ? transform
                  .slice(transform.indexOf('(') + 1, -1)
                  .split(',')
                  .map((n) => Number(n.trim()))
              : null;
          const button = el.querySelector<HTMLElement>('.btn');
          const rect = button?.getBoundingClientRect();
          return {
            id: el.getAttribute('data-nav') ?? '',
            fate: el.getAttribute('data-nav-fate'),
            matrix: numbers,
            opacity: Number(getComputedStyle(el).opacity) * Number(style.opacity),
            box: {
              width: rect?.width ?? 0,
              height: rect?.height ?? 0,
              top: Math.round(rect?.top ?? 0),
            },
          };
        });
      const frames: ClusterState[] = [];
      const started = performance.now();
      const sample = () => {
        const foot = document.querySelector('.flowshell .flow-foot');
        const layer = document.querySelector('.flow-melt');
        frames.push({ live: foot ? read(foot) : [], ghost: layer ? read(layer) : [] });
        if (performance.now() - started < ms) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      const button = [...document.querySelectorAll<HTMLElement>('.flowshell .flow-foot .btn')].find(
        (b) => (b.textContent ?? '').trim() === label,
      );
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, ms + 80));
      return frames;
    },
    // The whole WAVE, not one control's gesture: with the V2.0 stagger the
    // last control on the bar is still rising after the first has settled,
    // and a window of `NAV_MELT_GESTURE_MS` would stop recording before the
    // end of what is being measured.
    { label, ms: NAV_MELT_CLUSTER_MS },
  );
}

/** Fills whatever the question on screen is asking for, so that pressing Next
 * actually advances. A required question with an empty field does not move,
 * and a melt that correctly does not play because the page did not change is
 * the exact false negative that hid this bug: the gesture was reported as
 * "fires almost never" from four presses that never left the question. */
async function answerCurrent(page: Page, text: string): Promise<void> {
  const field = page.locator('.flow input.field, .flow textarea.field').first();
  if (await field.count()) await field.fill(text);
}

/* ─────────────────────────────────────────────────────────────────────── */

test.describe('VB-53 — the buttons melt into the bar and rise back out', () => {
  test('the outgoing cluster really sinks, and the incoming one really rises', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    const before = await clusterState(page);
    expect(ids(before.live), 'the transition screen offers Next and nothing else').toEqual(['next']);
    expect(before.ghost, 'nothing is melting before anything has been pressed').toEqual([]);

    const frames = await recordAdvance(page, S.next);

    // THE MELT. A copy of the outgoing cluster's ink, pushed down and going
    // flat — measured off the browser's own matrix, not off a class name.
    const sinking = frames.filter((f) => f.ghost.some((c) => dropOf(c) > 1 && squashOf(c) < 1));
    expect(sinking.length, 'no frame showed a copy of the old cluster sinking').toBeGreaterThan(0);
    const deepest = Math.max(...frames.flatMap((f) => f.ghost.map(dropOf)));
    const flattest = Math.min(...frames.flatMap((f) => f.ghost.map(squashOf)), 1);
    expect(deepest, 'the copy travelled further than the melt is allowed to').toBeLessThanOrEqual(NAV_MELT_DROP + 0.5);
    expect(deepest, 'the copy barely moved').toBeGreaterThan(NAV_MELT_DROP / 3);
    expect(flattest, 'the copy never went flat, so it slid rather than melted').toBeLessThan(0.2);

    // THE RISE. The live cluster's ink, coming back up out of the bar.
    const rising = frames.filter((f) => f.live.some((c) => dropOf(c) > 1));
    expect(rising.length, 'no frame showed the new cluster still on its way up').toBeGreaterThan(0);
    const liveDrop = Math.max(...frames.flatMap((f) => f.live.map(dropOf)));
    expect(liveDrop).toBeGreaterThan(0);
    expect(liveDrop).toBeLessThanOrEqual(NAV_MELT_DROP + 0.5);

    /* THE TWO RULES THIS CUE IS NOT ALLOWED TO BREAK, checked on every frame
       of a real advance rather than argued about in a comment.

       NOTHING PRESSABLE MOVES. Only the ink travels; the 44px box stays the
       same size and stays on the same line. That is what keeps every frame
       pressable, and it is also V1.2 VB-10's promise — nothing on the screen
       moves while a question prints — which this cue would otherwise break on
       every one of forty-nine answers.

       NOTHING IS EVER PAINTED FAINT. There is no opacity in this gesture at
       all: the ink leaves by having no height, not by having no contrast.
       docs/GUARDRAILS.md's 4.5:1 floor is unconditional, and a cross-fade
       spends most of its frames under it. */
    /* V2.3 VB-94 amended the first rule's letter, not its spirit. The
       cluster is in-flow now, so between two QUESTIONS its resting line
       legitimately moves with the content above it — the outgoing ghosts
       stay on the line the old cluster painted (the layer is pinned to that
       box at capture), and the incoming cluster rises on its own new line.
       What must still never happen is a pressable box moving DURING the cue:
       within any one frame the live row is one row, and across the cue the
       live row's line never wanders once it exists. */
    for (const frame of frames) {
      for (const control of [...frame.live, ...frame.ghost]) {
        expect(control.opacity, `${control.id} was painted part-way faded`).toBe(1);
      }
      const liveTops = frame.live.map((c) => c.box.top);
      if (liveTops.length > 1) {
        expect(Math.max(...liveTops) - Math.min(...liveTops), 'the live row split onto two lines mid-cue').toBeLessThanOrEqual(1);
      }
      for (const control of frame.live) {
        expect(control.box.height, 'a live control fell under the 44px floor mid-rise').toBeGreaterThanOrEqual(
          FLOW_NAV_TARGET - 0.5,
        );
        expect(control.box.width).toBeGreaterThanOrEqual(FLOW_NAV_TARGET - 0.5);
      }
    }
    const liveLines = new Set(frames.flatMap((f) => f.live.map((c) => Math.round(c.box.top))));
    expect(liveLines.size, 'the live cluster wandered between lines while the cue played').toBeLessThanOrEqual(1);

    // THE OVERLAP. The band is never empty: on some frame the old cluster is
    // still on screen and the new one has already started to come out.
    const bothMoving = frames.filter(
      (f) => f.ghost.some((c) => squashOf(c) > 0.02) && f.live.some((c) => dropOf(c) > 0.5),
    );
    expect(bothMoving.length, 'the rise did not overlap the melt — it queued behind it').toBeGreaterThan(0);

    // AND IT ENDS. Nothing filled forwards, nothing left in the layer.
    await settle(page);
    const after = await clusterState(page);
    expect(after.ghost, 'a copy was left behind after the gesture').toEqual([]);
    for (const control of after.live) {
      expect(control.matrix, `${control.id} did not come back to rest`).toBeNull();
      expect(control.opacity).toBe(1);
    }

    await context.close();
  });

  test('it plays on every question change, including ones that change no button', async () => {
    /* THE REGRESSION THAT SHIPPED, LOCKED.
     *
     * Every other test in this file advances between two screens that offer
     * different controls, so a build in which the gesture only played when
     * the cluster changed would pass all of them — and the thing Adam asked
     * for is the opposite one: a visibly detectable animation on each page
     * change "even if it happens to be the same kind as the last."
     *
     * So this walks six real advances in a row and demands the gesture on
     * every one of them, then demands that most of those advances were the
     * case nothing else here covers: the same controls before and after. It
     * is written as a walk rather than as four hand-picked questions because
     * the flow's content is not this task's to depend on — what is being
     * locked is "every page change", and the run reports how many of its
     * changes were the interesting kind rather than assuming.
     *
     * Skip is the control pressed where a question offers one: it advances
     * without an answer and without sending a text question to its reflect
     * screen, which is what gives a run of consecutive questions offering the
     * identical Back / Next / Skip. Which control was pressed is nothing to
     * the gesture — it plays on the change, not on the press.
     */
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await settle(page);

    const PRESSES = 6;
    let unchanged = 0;
    for (let press = 1; press <= PRESSES; press++) {
      const from = await whereWeAre(page);
      const before = ids((await clusterState(page)).live).sort();
      const skippable = before.includes('skip');
      if (!skippable) await answerCurrent(page, `An answer for press ${press}.`);

      const frames = await recordAdvance(page, skippable ? S.skip : S.next);

      const to = await whereWeAre(page);
      expect(to, `press ${press} did not leave ${from}, so nothing is being proved`).not.toBe(from);

      // IT MOVED. Real transforms on both clusters, on this press: a copy of
      // the outgoing cluster sinking, and the live one coming up.
      const sank = frames.some((f) => f.ghost.some((c) => dropOf(c) > 1 && squashOf(c) < 1));
      const rose = frames.some((f) => f.live.some((c) => dropOf(c) > 1));
      expect(sank, `press ${press} (${from} -> ${to}): no copy of the old cluster sank`).toBe(true);
      expect(rose, `press ${press} (${from} -> ${to}): the new cluster never rose`).toBe(true);

      const state = await clusterState(page);
      const after = ids(state.live).sort();
      if (after.join() === before.join()) {
        unchanged++;
        // EVERY control took part. A cluster where Back melts and Next holds
        // still reads as a glitch rather than as a system — and `reforms` is
        // navMelt.ts's own name for exactly this case, the one it documents
        // as "the common case — Next, on every advance" and the one the
        // shipped build never played.
        for (const control of state.live) {
          expect(fateOf(state.live, control.id), `press ${press}: ${control.id} sat the gesture out`).toBe('reforms');
        }
      }
      await settle(page);
    }

    expect(
      unchanged,
      `only ${unchanged} of ${PRESSES} advances kept the same button set, so this run did not test the case it exists for`,
    ).toBeGreaterThanOrEqual(4);

    await context.close();
  });

  test('the cluster moves in sequence, not in unison', async () => {
    /* WHY THE MELT WAS NEVER SEEN, AND THE FIX, AS A MEASUREMENT.
     *
     * V1.9 moved all three controls on one clock. Three words leaving
     * together is a single event and the eye discards it — and it left a
     * window where the band was nearly empty, which reads as a fault rather
     * than a gesture. V2.0 gives each control the identical 200ms gesture
     * `NAV_MELT_STAGGER_MS` after the one to its left.
     *
     * Asserted off the controls' own transforms, because "staggered" is a
     * claim about what is on screen and not about a `calc()`. Nothing here
     * looks at a delay, a class or a custom property.
     */
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await settle(page);
    await answerCurrent(page, 'Ada');

    const frames = await recordAdvance(page, S.next);

    // ── THE MELT IS A WAVE. On some frame one copy is already well on its way
    // into the bar while another has not started to move at all.
    const stagger = frames.filter((f) => {
      const drops = f.ghost.map(dropOf);
      return drops.length >= 2 && Math.max(...drops) > NAV_MELT_DROP / 3 && Math.min(...drops) < 0.5;
    });
    expect(stagger.length, 'every copy sank on the same clock — this is V1.9’s blink').toBeGreaterThan(0);

    // ── AND SO IS THE RISE.
    const risingWave = frames.filter((f) => {
      const squashes = f.live.map(squashOf);
      return squashes.length >= 2 && Math.max(...squashes) > 0.5 && Math.min(...squashes) < 0.05;
    });
    expect(risingWave.length, 'the whole cluster came back up at once').toBeGreaterThan(0);

    // ── THE ORDER IS THE ORDER THEY STAND IN. The wave runs left to right, so
    // a control is never further through the gesture than the one on its left.
    for (const frame of frames) {
      for (let i = 1; i < frame.ghost.length; i++) {
        const left = dropOf(frame.ghost[i - 1]!);
        const here = dropOf(frame.ghost[i]!);
        expect(here, 'a control melted ahead of the one to its left').toBeLessThanOrEqual(left + 0.5);
      }
    }

    // ── NOBODY SITS IT OUT. Over the whole wave every control on the bar both
    // sank and rose; a cluster where one word holds still is a glitch.
    const cluster = ids((await clusterState(page)).live);
    expect(cluster.length).toBeGreaterThan(1);
    for (const id of cluster) {
      const sank = frames.some((f) => f.ghost.some((c) => c.id === id && dropOf(c) > 1));
      const rose = frames.some((f) => f.live.some((c) => c.id === id && dropOf(c) > 1));
      expect(sank || rose, `${id} never moved`).toBe(true);
    }

    // ── AND THE STAGGER IS REAL RATHER THAN A ROUNDING ERROR: measured off
    // when each copy first moves, the gap between neighbours is close to the
    // one core/flow/navMelt.ts derived.
    const firstMove = (id: string) => frames.findIndex((f) => f.ghost.some((c) => c.id === id && dropOf(c) > 0.5));
    const starts = ids(frames.find((f) => f.ghost.length > 1)?.ghost ?? []).map(firstMove);
    expect(starts.length, 'there were never two copies to compare').toBeGreaterThan(1);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i]!, 'two controls started on the same frame').toBeGreaterThan(starts[i - 1]!);
    }

    // Never gated, staggered or not: the boxes stayed put and stayed 44px.
    for (const frame of frames) {
      for (const control of frame.live) {
        expect(control.opacity).toBe(1);
        expect(control.box.height).toBeGreaterThanOrEqual(FLOW_NAV_TARGET - 0.5);
      }
    }

    await settle(page);
    await context.close();
  });

  test('only the buttons the next question offers rise back out', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    // ── ARRIVING: a question with a Back and a Skip, after one with neither.
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    const arriving = await clusterState(page);
    expect(ids(arriving.live).sort()).toEqual(['back', 'next', 'skip']);
    expect(fateOf(arriving.live, 'next')).toBe('reforms');
    expect(fateOf(arriving.live, 'back'), 'Back was there before? It was not.').toBe('arrives');
    expect(fateOf(arriving.live, 'skip')).toBe('arrives');
    // The old cluster is still on screen as a copy, and it held only Next.
    expect(ids(arriving.ghost)).toEqual(['next']);
    expect(fateOf(arriving.ghost, 'next')).toBe('reforms');
    await settle(page);

    // ── MELTING AWAY: back to a screen with neither, from one with both.
    await page.getByRole('button', { name: S.back, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
    const melting = await clusterState(page);
    expect(ids(melting.ghost).sort(), 'the copy is of the cluster that was there').toEqual([
      'back',
      'next',
      'skip',
    ]);
    expect(fateOf(melting.ghost, 'back')).toBe('melts');
    expect(fateOf(melting.ghost, 'skip')).toBe('melts');
    expect(fateOf(melting.ghost, 'next')).toBe('reforms');
    // And the thing VB-53 actually asks for: they do not come back.
    expect(ids(melting.live), 'a button rose that this screen does not offer').toEqual(['next']);
    await settle(page);
    expect(ids((await clusterState(page)).live)).toEqual(['next']);

    await context.close();
  });

  test('Next pressed mid-melt still advances, and the answer is stored', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await settle(page);

    const NAME = 'Ada';
    const TITLE = 'Head of Doing The Work';
    await page.locator('.flow input.field').fill(NAME);

    // The advance whose melt gets interrupted. Frozen in flight rather than
    // raced against, so the press below is provably mid-gesture rather than
    // probably mid-gesture, and held half-way through the rise's delay — the
    // point at which the live cluster has not begun to come out of the bar at
    // all and every one of its controls is still invisible.
    const frozen = await freezeMelt(page);
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'professional_name');
    const inFlight = await holdAt(page, Math.round(NAV_RISE_DELAY_MS / 2));
    expect(inFlight, 'nothing was in flight, so nothing is being proved').toBeGreaterThan(0);

    const held = await clusterState(page);
    expect(held.ghost.length, 'the old cluster is still sinking').toBeGreaterThan(0);
    for (const control of held.live) {
      expect(squashOf(control), 'the live cluster should still be flat at this point').toBeLessThan(0.02);
      expect(control.box.height, 'and still a full 44px target').toBeGreaterThanOrEqual(FLOW_NAV_TARGET - 0.5);
      expect(control.box.width).toBeGreaterThanOrEqual(FLOW_NAV_TARGET - 0.5);
    }

    /* AND AXE FINDS NOTHING WRONG WITH THE FRAME. This is the assertion the
       first build of VB-53 failed: a cross-fading copy of "Skip" measured
       1.27:1 against the canvas, and tests/e2e/dictation-hint.spec.ts caught
       it because its own sweep runs straight after an answer. There is no
       opacity in this gesture any more, so a frozen mid-melt frame has to be
       as clean as a resting one — and this is where that is held, on the
       frame itself rather than by luck of timing somewhere else. */
    const midMelt = await new AxeBuilder({ page })
      .disableRules(['region', 'page-has-heading-one', 'landmark-one-main'])
      .withRules(['color-contrast', 'target-size', 'button-name'])
      .analyze();
    expect(midMelt.violations, 'axe found a problem in a frame of the melt').toEqual([]);

    // Now answer it. Typing and Enter both reach a control nobody can see yet
    // — which is the whole rule: the melt is decoration over a question that
    // is already live, and it is never a gate in front of one.
    const field = page.locator('.flow input.field');
    await field.focus();
    await page.keyboard.type(TITLE);
    await page.keyboard.press('Enter');

    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'self_description');
    // Read back out of the person's own storage, not out of the field.
    await expect.poll(async () => (await answersFrom(sw))?.values['professional_name']).toBe(TITLE);
    await expect.poll(async () => (await answersFrom(sw))?.values['preferred_name']).toBe(NAME);

    // The frozen gesture was replaced rather than left hanging: the interrupted
    // copies are gone and the cluster settles.
    await thawMelt(page, frozen);
    const after = await clusterState(page);
    expect(after.ghost).toEqual([]);
    for (const control of after.live) {
      expect(control.matrix).toBeNull();
      expect(control.opacity).toBe(1);
    }

    await context.close();
  });

  test('a press pressed again 40ms later leaves the right cluster, not a leftover', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    // Forwards and backwards, faster than one gesture, five times over. Each
    // press lands while the last one is still in the air.
    for (let i = 0; i < 5; i++) {
      await page.getByRole('button', { name: S.next, exact: true }).click({ force: true });
      await page.waitForTimeout(40);
      await page.getByRole('button', { name: S.back, exact: true }).click({ force: true });
      await page.waitForTimeout(40);
    }

    // Where that left us, and what that position demands. Back on the
    // transition screen there is nothing behind it, so Next and nothing else.
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
    await settle(page);
    const state = await clusterState(page);
    expect(ids(state.live), 'the cluster does not match the screen it is on').toEqual(['next']);
    expect(state.ghost, 'copies stacked up instead of being replaced').toEqual([]);
    for (const control of state.live) {
      expect(control.matrix, 'a control was left mid-gesture').toBeNull();
      expect(control.opacity, 'a control was left part-way faded').toBe(1);
      expect(control.box.height).toBeGreaterThanOrEqual(FLOW_NAV_TARGET - 0.5);
    }
    // Exactly one of each, and exactly one band: nothing was cloned into the
    // live cluster and nothing was left behind in the document.
    expect(await page.locator('.flowshell .flow-foot').count()).toBe(1);
    expect(await page.locator('.flowshell .flow-foot .navbtn').count()).toBe(1);
    // Nothing is still melting. (`.is-rising` deliberately stays on the live
    // control after its animation ends — it is re-added from the start on the
    // next question, VB-04's rule — so it is not a leftover.)
    expect(await page.locator('.is-melting').count()).toBe(0);

    // And it still works: one more press advances, as it always did.
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await settle(page);
    expect(ids((await clusterState(page)).live).sort()).toEqual(['back', 'next', 'skip']);

    await context.close();
  });

  test('reduced motion changes the buttons instantly, with nothing scheduled', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(PANEL);
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpToModule(contextModules, 'about-me'));
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.filedrawer-handle');
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');

    /**
     * NOT "nothing appears to move" — nothing is *scheduled*. Three watchers,
     * armed before the press:
     *   · every child ever added to the melt layer, so a copy that was made
     *     and removed within a frame is still caught;
     *   · every time either cue class is added anywhere;
     *   · the count of this task's animations, sampled every frame.
     * All three have to be zero for the whole gesture's length and beyond.
     */
    const watched = await page.evaluate(
      async ({ names, ms }) => {
        const seen = { copies: 0, classes: 0, animations: 0, frames: 0 };
        const layer = document.querySelector('.flow-melt');
        const shell = document.querySelector('.flowshell')!;
        const copyWatcher = new MutationObserver((records) => {
          for (const record of records) seen.copies += record.addedNodes.length;
        });
        if (layer) copyWatcher.observe(layer, { childList: true, subtree: true });
        const classWatcher = new MutationObserver((records) => {
          for (const record of records) {
            const el = record.target as HTMLElement;
            if (el.classList?.contains('is-melting') || el.classList?.contains('is-rising')) seen.classes++;
          }
        });
        classWatcher.observe(shell, { attributes: true, attributeFilter: ['class'], subtree: true });

        const started = performance.now();
        const sample = () => {
          seen.frames++;
          seen.animations += document
            .getAnimations()
            .filter((a) => names.includes((a as unknown as { animationName?: string }).animationName ?? ''))
            .length;
          if (performance.now() - started < ms) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);

        const button = [...document.querySelectorAll<HTMLElement>('.flowshell .flow-foot .btn')].find(
          (b) => (b.textContent ?? '').trim().length > 0,
        );
        button?.click();
        await new Promise((resolve) => setTimeout(resolve, ms + 120));
        copyWatcher.disconnect();
        classWatcher.disconnect();
        return seen;
      },
      { names: MELT_ANIMATIONS, ms: NAV_MELT_CLUSTER_MS * 2 },
    );

    // A few frames is enough to be watching; the numbers that matter are the
    // three zeroes below, and the observers behind two of them do not depend
    // on a frame landing at all.
    expect(watched.frames, 'the sampler never ran').toBeGreaterThanOrEqual(3);
    expect(watched.copies, 'a copy of the old cluster was made under reduced motion').toBe(0);
    expect(watched.classes, 'a melt class was applied under reduced motion').toBe(0);
    expect(watched.animations, 'a melt animation was scheduled under reduced motion').toBe(0);

    // Same end state, immediately: the buttons this question offers, at rest,
    // at full opacity, from the first frame anyone could look at.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    const state = await clusterState(page);
    expect(ids(state.live).sort()).toEqual(['back', 'next', 'skip']);
    expect(state.ghost).toEqual([]);
    for (const control of state.live) {
      expect(control.matrix).toBeNull();
      expect(control.opacity).toBe(1);
      expect(control.box.height).toBeGreaterThanOrEqual(FLOW_NAV_TARGET - 0.5);
    }

    await context.close();
  });

  test('what it looks like — every frame of the wave, as painted pixels', async () => {
    /* THE ONLY TEST THAT CAN ANSWER THE ACTUAL COMPLAINT.
     *
     * "The melt is not obvious at any point" is not a claim any assertion
     * about a matrix can settle, so this walks the real animation frame by
     * frame at 60Hz and reads the ink back off real screenshots — where it
     * sits in the band, and how much of it there is. What comes out is a
     * number that means something in a report: HOW MANY FRAMES OF THE GESTURE
     * A PERSON CAN SEE. V1.9's answer was about six; the sequence written to
     * test-results/vb53/ is what this one's looks like.
     *
     * The sweep is over the WAVE (`NAV_MELT_CLUSTER_MS`), not one control's
     * gesture, and every frame is a real frame of the real animation held
     * still rather than a pose staged for a photograph.
     */
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    // The pointer is parked off the cluster for every shot below: it is left
    // sitting on Next after a click, and a hover underline in the photograph
    // would be one more thing to explain away.
    await page.mouse.move(2, 2);

    // Advance once first, so the frames photographed below are the case Adam
    // actually complained about: Back/Next/Skip to Back/Next/Skip, a full
    // cluster reforming as itself.
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await settle(page);
    await answerCurrent(page, 'Ada');
    await page.mouse.move(2, 2);

    await page.screenshot({ path: path.join(SHOTS, 'a-before.png') });
    const rest = await bandInk(page);
    expect(rest.total, 'there is no cluster painted to begin with').toBeGreaterThan(0);
    const standing = ids((await clusterState(page)).live);
    expect(standing.sort(), 'the frames below are meant to be of a full cluster').toEqual([
      'back',
      'next',
      'skip',
    ]);

    const frozen = await freezeMelt(page);
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'professional_name');
    await page.mouse.move(2, 2);

    /** One 60Hz frame, in ms — what "how many frames is it visible for" counts
     * in. Not a duration of this cue's: the display's. */
    const FRAME_MS = 1000 / 60;
    // How long THIS cluster's wave runs: three controls here, and the sum is
    // core/flow/navMelt.ts's rather than restated as a number.
    const waveMs = navMeltClusterMs(standing.length);
    const sweep: { at: number; centroid: number; total: number }[] = [];
    for (let at = 0; at <= waveMs; at += FRAME_MS) {
      const held = Math.round(at);
      const inFlight = await holdAt(page, held);
      if (held === 0) expect(inFlight, 'nothing was in flight to photograph').toBeGreaterThan(0);
      await page.screenshot({ path: path.join(SHOTS, `wave-${String(held).padStart(3, '0')}ms.png`) });
      const ink = await bandInk(page);
      sweep.push({ at: held, centroid: ink.centroid, total: ink.total });
    }

    /* HOW MANY FRAMES IT IS VISIBLE FOR. A frame counts when the ink in the
       band is somewhere other than where it sits at rest, or when there is
       measurably less of it — either one is a frame on which a person can see
       that something is happening.

       The floor is stated against the wave's own length rather than as a
       magic number: at least two thirds of it. A gesture a person can see for
       under half its own duration is a gesture that has a still bit in the
       middle, which is what "not obvious at any point" felt like. */
    const visible = sweep.filter(
      (f) => Math.abs(f.centroid - rest.centroid) > 1 || f.total < rest.total * 0.9,
    );
    const framesInWave = waveMs / FRAME_MS;
    expect(
      visible.length,
      `the gesture was only legible on ${visible.length} of ${sweep.length} frames`,
    ).toBeGreaterThan((framesInWave * 2) / 3);

    // IT MOVED DOWN. A class toggling is not proof; ink sitting lower in the
    // same band is. Read as the deepest frame of the sweep, because with the
    // wave no single moment is "the" melt any more.
    const deepest = sweep.reduce((a, b) => (b.centroid > a.centroid ? b : a));
    expect(deepest.centroid, 'the cluster never sank — the ink is where it was').toBeGreaterThan(rest.centroid + 1);

    /* AND THE BAND IS NEVER EMPTY — the measurement that says most plainly
       why V1.9 was never seen, and the thing a stagger buys that a bigger or
       slower blink cannot.

       In unison, all three words are at the bottom of their melt at the same
       moment: the same sweep against the shipped V1.9 build finds a frame
       holding 26% of the resting ink, i.e. an empty band, for about four
       frames running. An empty band is not a small gesture, it is a hole, and
       a hole reads as the panel having glitched rather than as anything
       moving. Staggered, the emptiest frame still holds 59% — there is always
       a word standing still to see the moving ones against.

       Two fifths is the floor rather than the measured 59% so this is a rule
       about the shape of the gesture and not a snapshot of today's numbers.
       V1.9's 26% does not clear it, which is the point. */
    const emptiest = sweep.reduce((a, b) => (b.total < a.total ? b : a));
    expect(
      emptiest.total,
      'a frame of the gesture left the band all but empty — this is the V1.9 blink',
    ).toBeGreaterThan(rest.total * 0.4);

    await thawMelt(page, frozen);
    await page.screenshot({ path: path.join(SHOTS, 'z-reformed.png') });
    const reformed = await bandInk(page);

    // Back on the line it started on, and all of it back — the same three
    // controls this question offered before the press.
    expect(
      Math.abs(reformed.centroid - rest.centroid),
      'the cluster did not come back to the line it started on',
    ).toBeLessThan(1.5);
    expect(reformed.total).toBeGreaterThan(rest.total * 0.9);

    console.log(
      `VB-53 wave: legible on ${visible.length}/${sweep.length} frames at 60Hz ` +
        `(${Math.round(visible.length * FRAME_MS)}ms of ${waveMs}ms), ` +
        `deepest at ${deepest.at}ms, emptiest ${emptiest.at}ms at ${Math.round((emptiest.total / rest.total) * 100)}% of rest ink, ` +
        `stagger ${NAV_MELT_STAGGER_MS}ms, drop ${NAV_MELT_DROP}px`,
    );

    await context.close();
  });
});

interface BandInk {
  /** How many pixels of ink each row of the band holds. */
  rows: number[];
  /** How much ink there is in total. */
  total: number;
  /** Where the ink sits, in px below the top of the band — the number that
   * says the cluster went DOWN rather than merely changed. */
  centroid: number;
}

/**
 * Where the ink is inside the nav band, read back off a real screenshot — the
 * same decode-onto-a-canvas trick VB-41's spec uses, because this repo ships
 * two runtime dependencies and no image decoder.
 *
 * A class toggling is not proof and neither is a transform matrix; this is the
 * painted answer to "did the buttons move down". Ink is anything that is not
 * the band's own flat `--canvas`, sampled from a column the cluster never
 * reaches so the comparison is against the ground actually painted rather than
 * against a token restated here.
 */
async function bandInk(page: Page): Promise<BandInk> {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async (shot) => {
    // V2.5 VB-117: the foot anchors to the input, so its y MOVES between
    // questions of different content heights. The gesture's ink lives in
    // the UNION of the incoming foot's box and the melt layer's own box
    // (pinned at the outgoing foot) — sampling only one of them reads an
    // empty band mid-wave and cries blink where a person sees a continuous
    // gesture at the old spot.
    const footBox = document.querySelector('.flowshell .flow-foot')!.getBoundingClientRect();
    // The layer is MOUNTED at rest (empty, unpinned — its box is meaningless
    // then); only a layer actually carrying ghosts names the outgoing region.
    const meltEl = document.querySelector('.flow-melt');
    const meltBox = meltEl && meltEl.childElementCount > 0 ? meltEl.getBoundingClientRect() : null;
    const band = meltBox
      ? new DOMRect(
          Math.min(footBox.left, meltBox.left),
          Math.min(footBox.top, meltBox.top),
          Math.max(footBox.right, meltBox.right) - Math.min(footBox.left, meltBox.left),
          Math.max(footBox.bottom, meltBox.bottom) - Math.min(footBox.top, meltBox.top),
        )
      : footBox;
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const top = Math.round(band.top);
    // Down to the drawer's grip and no further. The grip straddles the band's
    // bottom edge (FileDrawer.css) and is dark on this ground, so including it
    // would swamp the ink the cluster paints and hide any movement in it.
    const grip = document.querySelector('.filedrawer-grip')?.getBoundingClientRect();
    const height = Math.round(grip ? Math.min(band.height, grip.top - band.top - 1) : band.height);
    // V2.4 VB-111: sample INSIDE the band's own box. The app ground is a
    // breathing textured canvas now — the page margins beside the band show
    // it, and pixels there read as "ink" against a flat ground sample,
    // swamping the cluster's signal until the wave measures as invisible
    // (found as a 0-of-20-frames failure, not reasoned about). The band
    // itself paints flat --ground and occludes the texture, so the box is
    // the honest measurement region — same claims, correct ground.
    const left = Math.max(0, Math.round(band.left));
    const width = Math.min(canvas.width - left, Math.round(band.width));
    const ground = context.getImageData(left + 2, top + 2, 1, 1).data;
    const rows: number[] = [];
    let total = 0;
    let weighted = 0;
    for (let row = 0; row < height; row++) {
      const data = context.getImageData(left, top + row, width, 1).data;
      let count = 0;
      for (let x = 0; x < data.length; x += 4) {
        const off =
          Math.abs(data[x]! - ground[0]!) + Math.abs(data[x + 1]! - ground[1]!) + Math.abs(data[x + 2]! - ground[2]!);
        if (off > 24) count++;
      }
      rows.push(count);
      total += count;
      weighted += count * row;
    }
    return { rows, total, centroid: total > 0 ? weighted / total : 0 };
  }, shot);
}
