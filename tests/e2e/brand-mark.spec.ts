import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


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

/* poseOf retired with VB-13's subject (2026-09-03). */

/**
 * The big mark orbits rather than spins, and an orbit's still equivalent is
 * the first viewpoint on its camera path — not the spin's static angle. Same
 * solid, same claim, different resting pose, and the component has said so
 * since V1.7 VB-34 (`BrandMark.tsx`: `spin === 'orbit' ? ORBIT_STILL : STILL`).
 */
/* ORBIT_STILL_POSE retired with VB-13's subject (2026-09-03). */

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
/* SPIN_STILL_POSE retired with the narrator mark's lattice face (V3.0
   pass 4) - the corner draws the peaks now, and their stillness is
   asserted as animation-name none rather than a pose. */

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
/* BIG_MARK and its wait retired with VB-13's subject (2026-09-03): the
   reveal lockup is the static W Peaks now. */

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
  /* 4r: a fresh card funnels to the baseline, so the PLAIN interview's
     door is Context Development's own Start now (Finish it now once the
     file has anything in it). */
  await page.getByRole('button', { name: /Context Development/ }).click();
  await page.waitForSelector('.ctxhub');
  await page
    .locator("[data-file='context']")
    .getByRole('button', { name: /^(Start now|Finish it now)$/ })
    .click();
  await page.waitForSelector('.flow');
}

/**
 * Every node's centre and radius, as strings. The radii matter as much as the
 * positions: a flat CSS spin would move the nodes and leave every radius
 * alone, so a changing radius is the evidence that this is real 3D
 * re-projection with depth, which is the whole point of the port.
 */
/* readPose/readRadii retired with VB-13's subject (2026-09-03). */


/* ── VB-13 RETIRED WITH ITS SUBJECT (2026-09-03) ──────────────────────────
   "The big mark turns" was about the reveal lockup's orbiting icosahedron.
   Pass 3r replaced that lockup with the STATIC W Peaks — the shipped
   icon's own face (Adam: "the Work Brain logo (the new favicon version)").
   A drawing that does not move has no rotation to prove, no layout box to
   hold through a turn, and no frame loop to stop: the reduced-motion
   claims about the SPLASH survive in splash.spec.ts (frameCount(page)
   === 0 with the composed still, and the full-motion control), where the
   intro's orbiting marks still live. Git has these tests with the mark
   they measured. */

test.describe('VB-13 — reduced motion stops the loop, not just the movement', () => {
  /* The splash-mark stillness test retired with its subject (see the
     tombstone above) — splash.spec.ts carries the no-frames claim for the
     whole reveal, peaks included. */

  test('the interview screen schedules nothing either', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await intoTheFlow(page);
    /* V2.9: the header's mark moved to the opposite corner and became the
       narrator's control. The CLAIM here is unchanged and is the one worth
       keeping — an interview screen under reduced motion schedules no frames
       at all — so it now waits for the mark where the mark actually is. */
    /* V3.0 pass 4: the mark's face is the shipped icon's PEAKS now
       (PeaksMark.tsx), not the lattice. The claim this test carries is
       unchanged - an interview screen under reduced motion schedules no
       frames - and the stillness assertion moves onto the peaks: no dance
       animation may be running. */
    await page.waitForSelector('.narratormark .peaksmark-face');

    await page.waitForTimeout(800);
    expect(await frameCount(page)).toBe(0);
    const peakAnim = await page.$eval(
      '.narratormark .peaksmark-peak',
      (el) => getComputedStyle(el).animationName,
    );
    expect(peakAnim).toBe('none');

    await context.close();
  });

  test('without the preference, the loop really is running — so the test above means something', async () => {
    // A zero that would be zero either way proves nothing. This is the
    // control — re-aimed at the reveal itself (its paint loop) now that the
    // lockup's own orbit is gone with the icosahedron.
    const { context, page } = await launchPanel({ keepSplash: true });
    await page.waitForSelector('.splash[data-phase="reveal"]');
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
