import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORBIT_STILL } from '../../src/core/geometry/markOrbit';
import { MARK_STATIC_ANGLE, markFrame } from '../../src/core/geometry/markSpin';
import type { MarkFrame } from '../../src/core/geometry/markSpin';

/**
 * V1.2 VB-13 accept criteria: "rotates on the welcome screen; a reduced-motion
 * user gets the static mark and no rAF loop runs at all (assert the loop isn't
 * merely invisible); the status-bar mark never shifts the label's baseline as
 * it turns; no measurable frame cost on the interview screens."
 *
 * Every one of those is a claim about a running browser, and three of them are
 * claims that something is *absent*. Unit tests can prove the component does
 * not call `requestAnimationFrame` when it is told not to; only this can prove
 * that the built extension, under a real `prefers-reduced-motion`, never
 * schedules a frame — so `requestAnimationFrame` is wrapped by an init script
 * before the panel's own bundle runs, and the count is read afterwards.
 *
 * Self-contained launch helpers, per this repo's one-spec-stands-alone
 * convention (see flow-progress.spec.ts and deep-dive.spec.ts).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.WB_E2E_DIST ?? path.resolve(HERE, '../../dist');

const poseOf = (frame: MarkFrame) => frame.nodes.map((n) => `${n.cx},${n.cy},${n.r}`);

/**
 * The big mark orbits rather than spins, and an orbit's still equivalent is
 * the first viewpoint on its camera path — not the spin's static angle. Same
 * solid, same claim, different resting pose, and the component has said so
 * since V1.7 VB-34 (`BrandMark.tsx`: `spin === 'orbit' ? ORBIT_STILL : STILL`).
 */
const ORBIT_STILL_POSE = poseOf(ORBIT_STILL);

/**
 * And the STATUS mark's, which is a different pose for a reason the component
 * states: `spin === 'orbit' ? ORBIT_STILL : STILL` (BrandMark.tsx). The status
 * mark spins rather than orbits, so its rest is the spin's own static angle.
 *
 * It came back into this file on 2026-08-28 with the graph. While the status
 * mark was a silhouette its rest was an outline, and this constant lived only
 * in markSpin.test.ts — which is why the two poses had never had to be told
 * apart here before, and why the first build of the reversal asserted the
 * wrong one.
 */
const SPIN_STILL_POSE = poseOf(markFrame(MARK_STATIC_ANGLE));

/**
 * Counts every animation frame the page ever asks for, from before the first
 * line of the panel's own code runs.
 *
 * Wrapping rather than replacing: the frames still happen, so the non-reduced
 * tests below watch a mark that is genuinely animating rather than a stubbed
 * one. Nothing else in the panel bundle calls `requestAnimationFrame` today —
 * the mark is the only thing in this product that does.
 */
function installFrameProbe(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as { __rafCount: number };
    w.__rafCount = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      w.__rafCount += 1;
      return original(cb);
    };
  });
}

const frameCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __rafCount: number }).__rafCount);

/**
 * Wait until the page has asked for `n` more frames than it had.
 *
 * Everywhere below that used to be "sleep 150ms and assume nine frames
 * happened" is this instead. Wall-clock sleeps make a test that is really
 * about *frames* fail on a loaded machine, and a flaky animation test gets
 * deleted rather than fixed. Throws on timeout, which is the correct failure:
 * a mark that is not asking for frames is a mark that is not turning.
 */
async function waitForFrames(page: Page, n: number) {
  const from = await frameCount(page);
  await page.waitForFunction(
    (target) => (window as unknown as { __rafCount: number }).__rafCount >= target,
    from + n,
    { timeout: 15000 },
  );
}

/**
 * BS-06 (§6) moved this spec's subject. The welcome screen's big mark is gone
 * — the change spec's first Home item names chrome bar, lockup and welcome
 * card as three statements of "this is Workbrain" inside 180px and keeps only
 * the chrome bar's. So the panel's one large, moving, entrance-carrying mark
 * is now the splash's, and every claim below that used to be made about
 * `.home-welcome .brand-mark` is made about `.splash-lockup .brand-mark`
 * instead. The claims themselves did not change: same component, same loop,
 * same reduced-motion bar, same still pose.
 */
/* `.splashreveal`, not the old `.splash-lockup`: V2.9 slice 2 rebuilt the
   reveal as choreographed parts and the lockup classname went with it. These
   four tests spent days timing out on the stale selector and reading as
   machine flake — the 30s timeout looked identical to load. */
const BIG_MARK = ".splashreveal-part[data-part='lockup'] .brand-mark";

/** Holds the splash open and waits for its lockup — where the big mark lives. */
async function atTheBigMark(page: Page) {
  await page.waitForSelector('.splash[data-phase="reveal"]');
  await page.waitForSelector(BIG_MARK);
}

async function launchPanel(
  options: { reduce?: boolean; keepSplash?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      // This spec is the one in the suite that measures animation frames, and
      // Playwright runs five headed windows at once. Chrome throttles — and
      // eventually stops — `requestAnimationFrame` in a window it believes is
      // occluded, which four of those five always are. Without these, "the
      // mark is turning" fails intermittently for a reason that has nothing to
      // do with the mark. They only ever make frames *more* likely, so they
      // cannot mask a real regression in the assertions below.
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
    reducedMotion: options.reduce ? 'reduce' : 'no-preference',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await installFrameProbe(page);
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  // BS-06: the tests about the big mark keep the doorway open instead, because
  // that is where the big mark now is.
  if (!options.keepSplash) {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
  }
  return { context, page };
}

/** Walks Home into the interview, where the status-bar mark lives. */
async function intoTheFlow(page: Page) {
  // V1.7 VB-34. The splash animates over the panel for the first couple of
  // seconds of a session and keeps its loop running through its own fade.
  // The frame-cost measurements below are about the status mark's steady
  // state, so let the splash finish leaving before walking in.
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
}

/**
 * Every node's centre and radius, as strings. The radii matter as much as the
 * positions: a flat CSS spin would move the nodes and leave every radius
 * alone, so a changing radius is the evidence that this is real 3D
 * re-projection with depth, which is the whole point of the port.
 */
const readPose = (page: Page, selector: string) =>
  page.$$eval(`${selector} circle`, (circles) =>
    circles.map(
      (c) => `${c.getAttribute('cx')},${c.getAttribute('cy')},${c.getAttribute('r')}`,
    ),
  );

const readRadii = (page: Page, selector: string) =>
  page.$$eval(`${selector} circle`, (circles) => circles.map((c) => Number(c.getAttribute('r'))));


test.describe('VB-13 — the big mark turns', () => {
  test('rotates, in real 3D, and stays a whole icosahedron while it does', async () => {
    const { context, page } = await launchPanel({ keepSplash: true });
    const mark = BIG_MARK;
    await atTheBigMark(page);

    const poses: string[] = [];
    const radii: string[] = [];
    for (let i = 0; i < 10; i++) {
      poses.push((await readPose(page, mark)).join(' '));
      radii.push((await readRadii(page, mark)).join(' '));
      // Ten frames apart, not 150ms apart. At a nine-second revolution that is
      // 6° of turn — unmistakable, and it stays 6° however busy the machine is.
      await waitForFrames(page, 10);
      // The shape must never degrade mid-turn.
      expect(await page.locator(`${mark} circle`).count()).toBe(12);
      expect(await page.locator(`${mark} line`).count()).toBe(30);
    }

    expect(new Set(poses).size, 'the mark never moved').toBeGreaterThan(5);
    expect(
      new Set(radii).size,
      'positions moved but radii did not — that is a flat spin, not a sphere',
    ).toBeGreaterThan(5);

    // And it is not a CSS transform doing it. A `rotate()` here would turn the
    // drawing like a card and lose the depth entirely.
    const transform = await page.$eval(mark, (el) => getComputedStyle(el).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);

    await context.close();
  });

  test('turning never changes the mark’s own layout box', async () => {
    const { context, page } = await launchPanel({ keepSplash: true });
    await atTheBigMark(page);
    const mark = page.locator(BIG_MARK);
    // Past the one-time entrance AND the reveal's choreography: since V2.9
    // slice 2 the lockup part is deliberately translated up the screen as
    // the sections arrive (settled at 5.3s into the reveal, plus margin for
    // a loaded machine). What must never change is the box while the thing
    // is *turning* — the spine's transforms are somebody else's motion.
    await page.waitForTimeout(6500);

    const boxes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const box = (await mark.boundingBox())!;
      boxes.push(`${box.x},${box.y},${box.width},${box.height}`);
      await waitForFrames(page, 6);
    }
    expect(new Set(boxes).size, 'the mark resized or moved as it turned').toBe(1);

    await context.close();
  });
});

test.describe('VB-13 — reduced motion stops the loop, not just the movement', () => {
  test('not one animation frame is ever requested, and the still mark is the one we shipped', async () => {
    const { context, page } = await launchPanel({ reduce: true, keepSplash: true });
    const mark = BIG_MARK;
    await atTheBigMark(page);

    // The bar: zero. Not "few", not "it settles" — the loop must be absent.
    expect(await frameCount(page)).toBe(0);
    const before = await readPose(page, mark);

    await page.waitForTimeout(1200);
    expect(await frameCount(page), 'a frame loop is running under reduced motion').toBe(0);
    expect(await readPose(page, mark)).toEqual(before);

    // And what is on screen is exactly the pose the orbit rests at, node for
    // node — the still equivalent, not an arbitrary frame it happened to stop on.
    expect(before).toEqual(ORBIT_STILL_POSE);

    await context.close();
  });

  test('the interview screen schedules nothing either', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await intoTheFlow(page);
    /* V2.9: the header's mark moved to the opposite corner and became the
       narrator's control. The CLAIM here is unchanged and is the one worth
       keeping — an interview screen under reduced motion schedules no frames
       at all — so it now waits for the mark where the mark actually is. */
    await page.waitForSelector('.narratormark .brand-mark');

    await page.waitForTimeout(800);
    expect(await frameCount(page)).toBe(0);
    // Still the graph, and still resting at the same still pose the big one
    // does — the claim is unchanged, only which corner it is drawn in.
    expect(await readPose(page, '.narratormark .brand-mark')).toEqual(SPIN_STILL_POSE);

    await context.close();
  });

  test('without the preference, the loop really is running — so the test above means something', async () => {
    // A zero that would be zero either way proves nothing. This is the control.
    const { context, page } = await launchPanel({ keepSplash: true });
    await atTheBigMark(page);
    // Waits for the frames rather than for a stopwatch: on a loaded machine
    // this takes longer, but "did it schedule thirty frames" is the question,
    // and it is never "did it schedule thirty frames in 600ms".
    await waitForFrames(page, 30);
    expect(await frameCount(page)).toBeGreaterThan(10);
    await context.close();
  });
});

/* ── V2.9 — THE STATUS-BAR MARK IS GONE (Adam, 2026-09-02) ────────────────

   Two whole describes stood here. They held real claims: that it drew the
   STATIC pose rather than a spinning one, that it turned once per MODULE and
   not per question, and that it was the same logo as everywhere else rather
   than a simplified stand-in.

   Adam moved it: "dump the TIM character and instead replace that spot with
   the logo image (no title). It becomes the pulse that goes with the voice of
   the narrator." The header's left slot is empty now so the section label sits
   flush with the question block below it, and the mark is in the opposite
   corner driving the narrator.

   NOT EVERY CLAIM SURVIVED, and that is a decision rather than an oversight.
   It no longer turns once per module: it breathes on the narrator's word
   boundaries instead, and two motions on one element compete — the one tied to
   something audible wins. `STATUS_MARK_SPIN` is retired with the behaviour it
   named.

   The surviving claims are checked elsewhere rather than restated here:
   `narrator.spec` holds that it is a real named control whose state is a
   drawing, and `narrator.a11y.spec` scans it. This file keeps the claims about
   the mark that are still about the MARK — the welcome screen's orbit and the
   reduced-motion still — which is what it was always for. */
