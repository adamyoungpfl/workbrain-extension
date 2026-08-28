import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MARK_SILHOUETTE_STILL,
  pointsAttribute,
} from '../../src/core/geometry/markSilhouette';
import { ORBIT_STILL } from '../../src/core/geometry/markOrbit';
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
const DIST = path.resolve(HERE, '../../dist');

/**
 * Which of the two status-bar behaviours is shipping, read out of the source
 * rather than imported from it.
 *
 * `FlowProgress.tsx` imports its own stylesheet and Playwright's runner cannot
 * parse CSS, so the module cannot be imported here the way core modules can.
 * Reading the one line keeps the spec pinned to the real constant: flip it and
 * these tests follow, rather than quietly testing the other mode.
 */
const STATUS_MARK_SPIN = (() => {
  const source = readFileSync(path.resolve(HERE, '../../src/panel/components/FlowProgress.tsx'), 'utf8');
  const found = /STATUS_MARK_SPIN\s*:\s*BrandMarkSpin\s*=\s*'([a-z]+)'/.exec(source)?.[1];
  if (found !== 'continuous' && found !== 'once') {
    throw new Error(`STATUS_MARK_SPIN is "${found}" — VB-13 ships one of continuous | once`);
  }
  return found;
})();

const poseOf = (frame: MarkFrame) => frame.nodes.map((n) => `${n.cx},${n.cy},${n.r}`);

/**
 * The big mark orbits rather than spins, and an orbit's still equivalent is
 * the first viewpoint on its camera path — not the spin's static angle. Same
 * solid, same claim, different resting pose, and the component has said so
 * since V1.7 VB-34 (`BrandMark.tsx`: `spin === 'orbit' ? ORBIT_STILL : STILL`).
 */
const ORBIT_STILL_POSE = poseOf(ORBIT_STILL);
// The spin's own static angle — `markFrame(MARK_STATIC_ANGLE)` — is still
// asserted node-for-node, in `markSpin.test.ts`. It left this file with the
// welcome mark, which was the only thing on screen that rested at it.

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
const BIG_MARK = '.splash-lockup .brand-mark';

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

/**
 * V1.7 VB-39. The status-bar mark is a silhouette now, so its pose is one
 * `points` attribute rather than twelve circles. Same idea as `readPose`: read
 * the geometry the component actually wrote, not a class it toggled.
 */
const readOutline = (page: Page, selector: string) =>
  page.$eval(`${selector} polygon`, (p) => p.getAttribute('points') ?? '');

/** The outline the panel must be showing when nothing is allowed to move. */
const STILL_OUTLINE = pointsAttribute(MARK_SILHOUETTE_STILL);

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
    // Past the one-time entrance, which is a real fade-and-scale and does
    // change the box — deliberately, once, on arrival. What must never change
    // is the box while the thing is *turning*.
    await page.waitForTimeout(500);

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
    await page.waitForSelector('.flowprogress-mark');

    await page.waitForTimeout(800);
    expect(await frameCount(page)).toBe(0);
    // V1.7 VB-39: this mark is the silhouette, so the still equivalent is the
    // still *outline* — the same solid at the same angle, and the same claim.
    expect(await readOutline(page, '.flowprogress-mark')).toBe(STILL_OUTLINE);

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

test.describe('VB-13 — the status-bar mark', () => {
  test('is present, left of the label, and set to the mode the ship constant names', async () => {
    const { context, page } = await launchPanel();
    await intoTheFlow(page);

    const mark = page.locator('.flowprogress-mark');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveAttribute('data-spin', STATUS_MARK_SPIN);

    const markBox = (await mark.boundingBox())!;
    const titleBox = (await page.locator('.flowprogress-title').boundingBox())!;
    expect(markBox.x + markBox.width).toBeLessThanOrEqual(titleBox.x);
    // The 44px control floor does not apply: this is decorative, not a
    // control. It is aria-hidden and nothing can focus or click it.
    await expect(mark).toHaveAttribute('aria-hidden', 'true');

    await context.close();
  });

  test('does not shift the label’s baseline as it turns', async () => {
    const { context, page } = await launchPanel();
    await intoTheFlow(page);
    await page.waitForSelector('.flowprogress-mark');

    const samples: string[] = [];
    const poses: string[] = [];
    for (let i = 0; i < 24; i++) {
      samples.push(
        await page.$eval('.flowprogress-title', (el) => {
          // The bottom of the first line box is the baseline's own reference.
          // Reading it to three decimals catches sub-pixel drift a rounded
          // boundingBox() would hide.
          const rect = el.getClientRects()[0]!;
          return `${rect.top.toFixed(3)}|${rect.bottom.toFixed(3)}|${rect.left.toFixed(3)}`;
        }),
      );
      poses.push(await readOutline(page, '.flowprogress-mark'));
      if (STATUS_MARK_SPIN === 'continuous') await waitForFrames(page, 3);
      else await page.waitForTimeout(40);
    }

    // The mark has to actually be moving during the window, or "the baseline
    // held" is a statement about a still picture.
    if (STATUS_MARK_SPIN === 'continuous') {
      expect(new Set(poses).size, 'the status mark was not turning').toBeGreaterThan(5);
    }
    expect(new Set(samples).size, `the label moved: ${[...new Set(samples)].join(' / ')}`).toBe(1);

    await context.close();
  });

  test('drops no frames on an interview screen', async () => {
    // The honest form of "no measurable frame cost". An animation that runs
    // necessarily costs *something* — the question is whether it costs enough
    // to be felt, and the thing that would be felt is a missed frame. So this
    // measures frame delivery, which is the observable, and the CPU share
    // separately below, which is the early warning.
    const { context, page } = await launchPanel();
    await intoTheFlow(page);
    await page.waitForSelector('.flowprogress-mark');

    const frames = await page.evaluate(
      () =>
        new Promise<{ count: number; median: number; p90: number }>((resolve) => {
          const stamps: number[] = [];
          const start = performance.now();
          function sample(t: number) {
            stamps.push(t);
            if (t - start < 2000) requestAnimationFrame(sample);
            else {
              const gaps = stamps.slice(1).map((v, i) => v - stamps[i]!).sort((a, b) => a - b);
              resolve({
                count: stamps.length,
                median: gaps[Math.floor(gaps.length / 2)] ?? 0,
                p90: gaps[Math.floor(gaps.length * 0.9)] ?? 0,
              });
            }
          }
          requestAnimationFrame(sample);
        }),
    );

    // Measured here: 120 frames in two seconds, median gap 16.7ms, worst 17.6.
    // The median is the assertion that matters — it says the steady state is a
    // full 60Hz with the mark running. The 90th percentile allows one frame in
    // ten to double up, which five headed Chrome windows sharing a laptop will
    // occasionally do for reasons that are not this component. `count` catches
    // the failure the other two would not: frames stopping altogether.
    expect(frames.count, `only ${frames.count} frames in 2s`).toBeGreaterThan(60);
    expect(frames.median, `median frame gap was ${frames.median.toFixed(1)}ms`).toBeLessThan(20);
    expect(frames.p90, `90th-percentile frame gap was ${frames.p90.toFixed(1)}ms`).toBeLessThan(34);

    await context.close();
  });

  test('costs a small, bounded share of the main thread', async () => {
    const { context, page } = await launchPanel();
    await intoTheFlow(page);
    await page.waitForSelector('.flowprogress-mark');

    // Chrome's own accounting, not a guess: total script time across a
    // two-second idle window on the question screen.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const read = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics');
      const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
      return { script: get('ScriptDuration'), task: get('TaskDuration'), at: get('Timestamp') };
    };

    const start = await read();
    await page.waitForTimeout(2000);
    const end = await read();

    const wall = end.at - start.at; // seconds
    const scriptShare = (end.script - start.script) / wall;
    const taskShare = (end.task - start.task) / wall;

    // Measured on this machine: about 1.5–2.5% script and 7–10% total task
    // time, against 0.05% with the loop switched off entirely by reduced
    // motion. Most of that difference is the browser producing 120 frames at
    // all, not the mark's own arithmetic. The thresholds are deliberately
    // generous — this is a smoke alarm for a loop that has become expensive
    // (a per-frame React render, a layout thrash), not a benchmark.
    expect(scriptShare, `script time was ${(scriptShare * 100).toFixed(1)}% of wall`).toBeLessThan(
      0.1,
    );
    expect(taskShare, `main thread was busy ${(taskShare * 100).toFixed(1)}% of wall`).toBeLessThan(
      0.25,
    );

    // And nothing about the question is being re-rendered to achieve it: the
    // question text node must be the same object it was two seconds ago.
    const stable = await page.evaluate(() => {
      const before = document.querySelector('.flow-q');
      return new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(before === document.querySelector('.flow-q')), 300);
      });
    });
    expect(stable).toBe(true);

    await context.close();
  });
});

/**
 * V1.7 VB-39 — the status-bar mark is the silhouette.
 *
 * Everything here is a measurement rather than a class check. "The mark is a
 * silhouette" is a claim about what is painted, and an element with the right
 * attribute that paints nothing would pass any assertion about markup.
 */
test.describe('VB-39 — the mark as a silhouette', () => {
  test('is one filled shape, and the big mark still has the whole graph', async () => {
    const { context, page } = await launchPanel({ keepSplash: true });

    // The big mark is untouched: VB-39 changes the small mark, not the one a
    // screen is built around.
    await atTheBigMark(page);
    await expect(page.locator(BIG_MARK)).toHaveAttribute('data-variant', 'graph');
    expect(await page.locator(`${BIG_MARK} circle`).count()).toBe(12);
    expect(await page.locator(`${BIG_MARK} line`).count()).toBe(30);

    await intoTheFlow(page);
    const mark = page.locator('.flowprogress-mark');
    await expect(mark).toHaveAttribute('data-variant', 'silhouette');
    expect(await page.locator('.flowprogress-mark polygon').count()).toBe(1);
    expect(await page.locator('.flowprogress-mark circle').count()).toBe(0);
    expect(await page.locator('.flowprogress-mark line').count()).toBe(0);

    await context.close();
  });

  test('actually paints — a real filled area, in the brand gradient', async () => {
    const { context, page } = await launchPanel();
    await intoTheFlow(page);
    await page.waitForSelector('.flowprogress-mark polygon');

    const painted = await page.evaluate(() => {
      const polygon = document.querySelector<SVGPolygonElement>('.flowprogress-mark polygon')!;
      const box = polygon.getBoundingClientRect();
      const fill = getComputedStyle(polygon).fill;
      const id = /url\(["']?#([^"')]+)/.exec(fill)?.[1] ?? '';
      const gradient = document.getElementById(id);
      const stops = gradient
        ? [...gradient.querySelectorAll('stop')].map((s) => getComputedStyle(s).stopColor)
        : [];
      return { width: box.width, height: box.height, fill, stops };
    });

    // The mark's box is 24px; the shadow of a solid inscribed in it fills most
    // of that in both axes. A collapsed or empty polygon fails here, and a
    // "silhouette" that is really an invisible element cannot pass.
    expect(painted.width).toBeGreaterThan(14);
    expect(painted.height).toBeGreaterThan(14);
    expect(painted.width).toBeLessThanOrEqual(24);
    expect(painted.height).toBeLessThanOrEqual(24);

    // Filled from the token gradient, and both stops resolve to a real,
    // opaque colour — not `none`, not a transparent default.
    expect(painted.fill).toMatch(/^url\(["']?#wb-mark-silhouette/);
    expect(painted.stops).toHaveLength(2);
    for (const stop of painted.stops) {
      expect(stop).toMatch(/^rgba?\(/);
      expect(stop).not.toMatch(/rgba\(0, 0, 0, 0\)/);
    }
    expect(painted.stops[0]).not.toBe(painted.stops[1]);

    await context.close();
  });

  test('the ink is really on the screen, not merely in the DOM', async () => {
    // The strongest form of "it paints": screenshot the 24px box and count
    // how much of it stops being the panel's background. A shape that renders
    // as nothing, or in the surface's own colour, fails this and passes every
    // attribute check above it.
    const { context, page } = await launchPanel({ reduce: true });
    await intoTheFlow(page);
    const mark = page.locator('.flowprogress-mark');
    await mark.waitFor();

    const shot = await mark.screenshot();
    const decoded = await page.evaluate(async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context2d = canvas.getContext('2d')!;
      context2d.drawImage(bitmap, 0, 0);
      const { data } = context2d.getImageData(0, 0, bitmap.width, bitmap.height);
      // The corner pixel is the surface behind the mark; anything far from it
      // is ink. Distance, not equality, so antialiasing counts as neither.
      const base = [data[0]!, data[1]!, data[2]!];
      let ink = 0;
      let blue = 0;
      for (let i = 0; i < data.length; i += 4) {
        const d =
          Math.abs(data[i]! - base[0]!) +
          Math.abs(data[i + 1]! - base[1]!) +
          Math.abs(data[i + 2]! - base[2]!);
        if (d > 90) {
          ink += 1;
          if (data[i + 2]! > data[i]!) blue += 1;
        }
      }
      return { ink, blue, total: (bitmap.width * bitmap.height) };
    }, [...shot]);

    // A hexagon-ish shadow inscribed in the box covers well over a third of
    // it, and nothing else in the box paints at all.
    expect(decoded.ink / decoded.total, `only ${decoded.ink} of ${decoded.total} pixels painted`)
      .toBeGreaterThan(0.35);
    // And it is the brand's blue-to-teal, not a grey or a black fallback:
    // every painted pixel is bluer than it is red.
    expect(decoded.blue / decoded.ink).toBeGreaterThan(0.95);

    await context.close();
  });

  test('turns when the module changes, and lands back on the still outline', async () => {
    const { context, page } = await launchPanel();
    await intoTheFlow(page);
    await page.waitForSelector('.flowprogress-mark polygon');

    // The first module's turn happens on arrival. Sample through it: the
    // outline must genuinely change shape, and stay a real polygon while it
    // does — the silhouette gains and loses corners as the solid turns, and a
    // frame with fewer than three of them would be a collapsed shape.
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const points = await readOutline(page, '.flowprogress-mark');
      seen.add(points);
      expect(points.split(' ').length).toBeGreaterThanOrEqual(6);
      await page.waitForTimeout(24);
    }
    expect(seen.size, 'the silhouette never moved').toBeGreaterThan(1);

    // Settled, it is exactly the pose the still mark ships — the same one
    // reduced motion gets, so motion carried nothing.
    await page.waitForTimeout(500);
    expect(await readOutline(page, '.flowprogress-mark')).toBe(STILL_OUTLINE);

    await context.close();
  });
});
