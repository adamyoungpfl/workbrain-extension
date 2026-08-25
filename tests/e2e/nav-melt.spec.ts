import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import {
  NAV_MELT_DROP,
  NAV_MELT_GESTURE_MS,
  NAV_MELT_MS,
  NAV_RISE_DELAY_MS,
  NAV_RISE_MS,
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
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
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
    { label, ms: NAV_MELT_GESTURE_MS },
  );
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
    const restingTop = before.live[0]!.box.top;
    for (const frame of frames) {
      for (const control of [...frame.live, ...frame.ghost]) {
        expect(control.opacity, `${control.id} was painted part-way faded`).toBe(1);
      }
      for (const control of frame.live) {
        expect(control.box.height, 'a live control fell under the 44px floor mid-rise').toBeGreaterThanOrEqual(
          FLOW_NAV_TARGET - 0.5,
        );
        expect(control.box.width).toBeGreaterThanOrEqual(FLOW_NAV_TARGET - 0.5);
        expect(control.box.top, 'a pressable box moved while the cue played').toBe(restingTop);
      }
    }

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
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
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
      { names: MELT_ANIMATIONS, ms: NAV_MELT_GESTURE_MS * 2 },
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

  test('what it looks like — the melt in flight, and the cluster reformed', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openTransition(context, sw, id);

    // The pointer is parked off the cluster for every shot below: it is left
    // sitting on Next after a click, and a hover underline in the photograph
    // would be one more thing to explain away.
    await page.mouse.move(2, 2);
    await page.screenshot({ path: path.join(SHOTS, 'a-before.png') });
    const rest = await bandInk(page);
    expect(rest.total, 'there is no cluster painted to begin with').toBeGreaterThan(0);

    // Hold the gesture at the moment the melt is most legible: the old cluster
    // part-way into the bar, the new one still under it. A real frame of the
    // real animation, stopped rather than staged.
    const frozen = await freezeMelt(page);
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await page.mouse.move(2, 2);
    // A quarter of the way into the melt. §06's curve is fast out, so by then
    // the cluster is already half gone, and this is the frame where it is
    // furthest from both of its end states — the one worth photographing.
    expect(await holdAt(page, Math.round(NAV_MELT_MS / 4)), 'nothing was in flight to photograph').toBeGreaterThan(0);
    await page.screenshot({ path: path.join(SHOTS, 'b-melting.png') });
    const melting = await bandInk(page);

    // THE PAINT ACTUALLY MOVED, AND IT MOVED DOWN. A class toggling is not
    // proof; ink sitting lower in the same band is.
    expect(melting.total, 'the band went blank instead of melting').toBeGreaterThan(0);
    expect(melting.centroid, 'the cluster did not sink — the ink is where it was').toBeGreaterThan(
      rest.centroid + 1,
    );

    // And again, at the moment the rise is most legible.
    await holdAt(page, NAV_RISE_DELAY_MS + Math.round(NAV_RISE_MS / 5));
    await page.screenshot({ path: path.join(SHOTS, 'c-rising.png') });
    const rising = await bandInk(page);
    expect(rising.total).toBeGreaterThan(0);
    expect(rising.centroid, 'the cluster is not on its way back up').toBeGreaterThan(rest.centroid);

    await thawMelt(page, frozen);
    await page.screenshot({ path: path.join(SHOTS, 'd-reformed.png') });
    const reformed = await bandInk(page);

    // Back on the line it started on, with more of it — this screen offers
    // three controls where the last offered one.
    expect(
      Math.abs(reformed.centroid - rest.centroid),
      'the cluster did not come back to the line it started on',
    ).toBeLessThan(1.5);
    expect(reformed.total).toBeGreaterThan(rest.total);

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
    const band = document.querySelector('.flowshell .flow-foot')!.getBoundingClientRect();
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
    const ground = context.getImageData(2, top + 2, 1, 1).data;
    const rows: number[] = [];
    let total = 0;
    let weighted = 0;
    for (let row = 0; row < height; row++) {
      const data = context.getImageData(0, top + row, canvas.width, 1).data;
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
