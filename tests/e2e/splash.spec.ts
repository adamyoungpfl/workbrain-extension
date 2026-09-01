import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORBIT_STILL } from '../../src/core/geometry/markOrbit';
import { SPLASH_BEATS } from '../../src/core/splash/sequence';
import { S } from '../../src/panel/strings';

/**
 * V2.7 VB-128 — the splash is the show (docs/V2.7-SPLASH-WOW.md, Option 1):
 * the dark stage with the mark burning in its gravity, the soft white
 * swell, the movie-intro reveal, the ten-count dressed as a cycling
 * loading line, and the hand-off to Home — on its own after the count, or
 * instantly on any click at any moment.
 *
 * What is proven where: the beats' arithmetic (ordering, the 4–5s reveal
 * window, the swell's whisper-per-frame softness) lives in
 * core/splash/sequence.test.ts at fractions of a millisecond; what is
 * argued here is only what is true of the running extension —
 *
 *   - the show opens dark with the mark re-projecting in real 3D and NO
 *     title card yet; the reveal arrives on the clock with the wordmark,
 *     the tagline, the real button and the loading line;
 *   - any click at any phase lands on Home; Escape works from frame one;
 *     a letter key still costs nothing; a press through the splash never
 *     acts on a covered control;
 *   - the show ends on its own — the ten-count hands over (the deliberate
 *     return of VB-34's self-ending, recorded in the doc);
 *   - once per browser session, unchanged;
 *   - and under prefers-reduced-motion the composed reveal renders
 *     immediately with not one animation frame ever scheduled, the words
 *     holding still, the hand-off still honoured.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../dist');

/** The pose the reveal's mark must hold when nothing is allowed to move. */
const STILL_POSE = ORBIT_STILL.nodes.map((n) => `${n.cx},${n.cy},${n.r}`);

const REVEAL_TIMEOUT = (SPLASH_BEATS.revealAt + 4) * 1000;

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

async function waitForFrames(page: Page, n: number) {
  const from = await frameCount(page);
  await page.waitForFunction(
    (target) => (window as unknown as { __rafCount: number }).__rafCount >= target,
    from + n,
    { timeout: 15000 },
  );
}

async function launchPanel(
  options: { reduce?: boolean } = {},
): Promise<{ context: BrowserContext; page: Page; url: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ],
    reducedMotion: options.reduce ? 'reduce' : 'no-preference',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const url = `chrome-extension://${id}/panel.html`;
  const page = await context.newPage();
  await installFrameProbe(page);
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(url);
  return { context, page, url };
}

const readPose = (page: Page, selector: string) =>
  page.$$eval(`${selector} circle`, (circles) =>
    circles.map(
      (c) => `${c.getAttribute('cx')},${c.getAttribute('cy')},${c.getAttribute('r')}`,
    ),
  );

test.describe('VB-128 — the show opens', () => {
  test('dark stage, the wall of panels, and no title card yet', async () => {
    const { context, page } = await launchPanel();

    const splash = page.locator('.splash');
    await expect(splash).toHaveCount(1);
    await expect(splash).toHaveAttribute('data-phase', 'show');
    /* SUPERSEDED 2026-09-01 (V2.9, Adam). Was "the mark in its glow" — VB-128
       burned the logo in the field for the whole show. The sequence is now
       "builds fading to white and then BURST with the logo lockup", and a logo
       that has been on screen for four seconds cannot burst. The show is a
       wall of panels; the mark is what the white breaks into. */
    await expect(page.locator('.splash-stage canvas')).toHaveCount(1);
    await expect(page.locator('.splash-stage .brand-mark')).toHaveCount(0);
    await expect(page.locator('.splash-glow')).toHaveCount(0);
    // The movie has not reached its title card: no name, no button.
    await expect(page.locator('.splash-wordmark')).toHaveCount(0);
    await expect(page.locator('.splash-cost')).toHaveCount(0);

    // It covers the panel, opaquely, on its own dark field.
    const box = (await splash.boundingBox())!;
    expect(box.width).toBe(400);
    expect(box.height).toBeGreaterThanOrEqual(700);
    const layer = await splash.evaluate((el) => ({
      position: getComputedStyle(el).position,
      z: getComputedStyle(el).zIndex,
      opaque: getComputedStyle(el).backgroundColor,
    }));
    expect(layer.position).toBe('fixed');
    expect(Number(layer.z)).toBeGreaterThanOrEqual(50);
    expect(layer.opaque).not.toContain('rgba');

    await context.close();
  });

  test('does not gate the panel’s first paint — Home is built underneath it', async () => {
    const { context, page } = await launchPanel();
    await expect(page.locator('.splash')).toHaveCount(1);

    await page.waitForSelector('.home');
    const home = (await page.locator('.home').boundingBox())!;
    expect(home.height).toBeGreaterThan(100);
    await expect(page.getByRole('button', { name: /^Context\.md/ })).toBeAttached();
    await expect(page.locator('.splash')).toHaveCount(1);

    await context.close();
  });

  test('the reveal arrives on the clock: wordmark, tagline, the two sentences, the doors', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash-wordmark', { timeout: REVEAL_TIMEOUT });

    await expect(page.locator('.splash')).toHaveAttribute('data-phase', 'reveal');
    await expect(page.locator('.splash-wordmark')).toHaveText('Workbrain');
    await expect(page.locator('.splash-tagline')).toHaveText(
      'How you do anything is how your AI does everything.',
    );
    // BR-01 (Adam, 2026-08-28): the "Open your work brain" button is gone —
    // the surface itself is the way in, and has been since V2.6 VB-126. So
    // the reveal now ends in the two sentences rather than in a control, and
    // this test's stack is one item shorter.
    await expect(page.locator('.splash-enter')).toHaveCount(0);
    // BS-09 (§9): the cycling word and the drain bar are replaced by the
    // two sentences that answer "what is this and what will it cost me".
    await expect(page.locator('.splash-cost')).toBeVisible();
    await expect(page.locator('.splash-what')).toBeVisible();

    // Centred, and stacked in the movie order: mark, promise, cost, what.
    const mark = (await page.locator('.splash-lockup .brand-mark').boundingBox())!;
    const tagline = (await page.locator('.splash-tagline').boundingBox())!;
    const cost = (await page.locator('.splash-cost').boundingBox())!;
    const what = (await page.locator('.splash-what').boundingBox())!;
    expect(Math.abs(mark.x + mark.width / 2 - 200)).toBeLessThan(1.5);
    expect(Math.abs(tagline.x + tagline.width / 2 - 200)).toBeLessThan(1.5);
    expect(tagline.y).toBeGreaterThan(mark.y + mark.height);
    expect(cost.y).toBeGreaterThan(tagline.y);
    expect(what.y).toBeGreaterThan(cost.y);

    await context.close();
  });

  test('the tagline is legible on the dark field — measured, not assumed', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash-tagline', { timeout: REVEAL_TIMEOUT });
    const ratio = await page.evaluate(() => {
      const parse = (c: string) => c.match(/[\d.]+/g)!.map(Number);
      const lum = (rgb: number[]) => {
        const [r, g, b] = rgb.slice(0, 3).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const el = document.querySelector('.splash-tagline')!;
      const fgRaw = parse(getComputedStyle(el).color);
      const bg = parse(getComputedStyle(document.querySelector('.splash')!).backgroundColor);
      // The tagline rides white at an alpha; composite it over the field.
      const alpha = fgRaw.length > 3 ? fgRaw[3]! : 1;
      const fg = fgRaw.slice(0, 3).map((c, i) => c * alpha + bg[i]! * (1 - alpha));
      const a = lum(fg);
      const b = lum(bg);
      const hi = Math.max(a, b);
      const lo = Math.min(a, b);
      return (hi + 0.05) / (lo + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await context.close();
  });

  /* BS-09 (§9) — THE CYCLING LOADING LINE IS GONE, and so is the drain bar
     it cycled beside. A first-time tester reads the tagline in two seconds
     and then waits; the held seconds now answer the question they are
     actually asking. What replaces the old test is the claim below. */
  test('the held seconds carry the decision: what it costs, what you get, and a way past', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-lockup').waitFor({ timeout: REVEAL_TIMEOUT });

    // Nothing draining, nothing cycling — §9: "nothing spins and nothing
    // counts down", because a bar draining toward a hand-over is pressure
    // applied to the decision the seconds exist for.
    await expect(page.locator('.splash-loader')).toHaveCount(0);
    await expect(page.locator('.splash-drain')).toHaveCount(0);

    // The two sentences, and they are the same promise the welcome screen
    // makes one screen later.
    await expect(page.locator('.splash-cost')).toHaveText(S.splashCost);
    await expect(page.locator('.splash-what')).toHaveText(S.splashWhat);

    // And the product does not promise a file it hides: Actions is out for
    // the beta (V2.9 VB-146), so no count of files is claimed here at all.
    expect(S.splashWhat).not.toMatch(/\bthree\b/i);

    // The way past, said out loud rather than merely available.
    await expect(page.getByRole('button', { name: S.splashStraight, exact: true })).toBeVisible();

    await context.close();
  });

  /**
   * The tour door's test, re-aimed at the door that replaced it.
   *
   * BS-09's tour door came off on 2026-08-31 when the splash became a
   * two-button choice — and what it opened is not lost: V2.5 VB-114's dime
   * tour IS the interview's first three steps, so a person taking EITHER
   * button still meets it. That is what this now asserts, which is the
   * stronger claim: the orientation does not depend on a door.
   */
  test('the baseline door goes into the interview, not by way of Home', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-lockup').waitFor({ timeout: REVEAL_TIMEOUT });

    const door = page.getByRole('button', { name: S.splashBaseline, exact: true });
    await expect(door).toBeVisible();
    await door.click();

    await page.waitForSelector('.flow', { timeout: 10_000 });
    /* Straight to the BASELINE QUESTION. `goal_want` is what the baseline
       measures, and the offer to run it cannot appear until it has an answer —
       so a door that landed on the interview's top fell past the very thing it
       promised. tests/e2e/baseline-door.spec.ts walks the whole path; this
       pins the destination.

       Not by way of Home: `.home` is UNDER the splash and always has been
       (VB-34), so what "not by way of Home" means is that the flow is up. */
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'goal_want');

    await context.close();
  });
});

test.describe('VB-129 — the shard field', () => {
  test('the stage canvas is really painting: shards on the field, and moving', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash-canvas');

    // Both samples land INSIDE the show (it swells away at ~3.8s and the
    // stage unmounts with it — an open-ended poll here once outlived the
    // canvas under fleet load and read null).
    const sample = () =>
      page.evaluate(() => {
        const canvas = document.querySelector('.splash-canvas') as HTMLCanvasElement | null;
        if (!canvas) return null;
        const g = canvas.getContext('2d')!;
        const data = g.getImageData(0, 0, canvas.width, Math.min(400, canvas.height)).data;
        let painted = 0;
        for (let i = 3; i < data.length; i += 16) if (data[i]! > 0) painted++;
        // The movement signature samples the WHOLE readback, not a corner —
        // a corner can be legitimately empty two frames running while the
        // field tumbles elsewhere (a real flake, caught under fleet load).
        const sig: number[] = [];
        for (let i = 0; i < data.length; i += 997) sig.push(data[i]!);
        return { painted, strip: sig.join(',') };
      });

    /* PAST THE TONE STAGE FIRST (2026-09-02). The wall now deliberately opens
       STILL — one light shade across every panel, so the mosaic reads as a
       patchwork before it reads as anything else — and only then starts
       cutting. Two samples taken inside that opening are identical, which is
       the design working, not the canvas being dead.

       `stageAt` puts the tone stage at 16% of the run to the swell; this
       clears it with room and still lands well before the stage unmounts. */
    await page.waitForTimeout(900);

    const first = await sample();
    expect(first, 'the stage left before the first look').not.toBeNull();
    expect(first!.painted, 'the canvas is blank — no shards were drawn').toBeGreaterThan(40);
    // And it is a living field, not a still: the pixels change frame to frame.
    await page.waitForTimeout(280);
    const second = await sample();
    expect(second, 'the stage left before the second look').not.toBeNull();
    expect(second!.strip).not.toBe(first!.strip);

    await context.close();
  });

  test('under reduced motion the stage never mounts — the law by construction', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splash-wordmark', { timeout: 4000 });
    await expect(page.locator('.splash-canvas')).toHaveCount(0);
    expect(await frameCount(page)).toBe(0);
    await context.close();
  });
});

test.describe('VB-128 — the camera still drifts', () => {
  test('the wall cuts, and cuts faster as it goes', async () => {
    /* SUPERSEDED 2026-09-01 (V2.9, Adam). This used to prove the SHOW'S MARK
       re-projected in real 3D rather than spinning flat — a real guarantee
       about a thing that is no longer on the stage. The mark still proves that
       for itself in the reveal, one describe below.

       What replaces it is the guarantee the new show actually makes: the
       panels never move, and their CONTENT changes at a rate that rises. That
       is the whole of "no single action is important" — the eye is never asked
       to follow anything — and the whole of the acceleration Adam asked for. */
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash-stage canvas');

    /* ONE ROUND-TRIP PER WINDOW. The sampling loop runs inside the page and
       returns a count, rather than the harness stepping frames and reading
       pixels forty-four times.

       That was the actual cost of the first two versions of this test — not
       the pixels but the round-trips. It passed alone and timed out at thirty
       seconds under a full parallel suite, twice, because each `evaluate` and
       each frame-step is a message across the wire and this was doing about
       ninety of them.

       Six patches rather than single pixels: one fixed pixel can sit on the
       same flat colour either side of a cut and report the wall dead, which is
       how the drawn panels broke the original. A patch cannot be fooled that
       way. */
    /* The canvas is resolved ONCE, up front. It is removed from the DOM when
       the reveal lands at 4.35s, and a locator resolved after that point waits
       thirty seconds for an element that is never coming back — which is
       exactly how this test timed out even running alone. Everything below has
       to finish inside the show. */
    const stage = await page.locator('.splash-stage canvas').elementHandle();
    const sample = (ms: number) =>
      stage!.evaluate((el, span) => {
        const c = el as HTMLCanvasElement;
        const g = c.getContext('2d')!;
        const patches = [
          [60, 90],
          [280, 200],
          [140, 350],
          [320, 470],
          [80, 560],
          [240, 650],
        ];
        const seen = new Set<string>();
        const started = performance.now();
        return new Promise<number>((resolve) => {
          const tick = () => {
            const px: string[] = [];
            for (const [x, y] of patches) {
              const d = g.getImageData(x as number, y as number, 10, 10).data;
              let r = 0;
              let gr = 0;
              let b = 0;
              for (let i = 0; i < d.length; i += 4) {
                r += d[i] as number;
                gr += d[i + 1] as number;
                b += d[i + 2] as number;
              }
              const n = d.length / 4;
              px.push(`${Math.round(r / n)},${Math.round(gr / n)},${Math.round(b / n)}`);
            }
            seen.add(px.join('|'));
            if (performance.now() - started < span) requestAnimationFrame(tick);
            else resolve(seen.size);
          };
          requestAnimationFrame(tick);
        });
      }, ms);

    /* Sampled across MORE THAN ONE HOLD. The first hold is the longest of the
       show, so a window shorter than it can legitimately catch no cut at all
       and call the wall dead. */
    const early = await sample(800);
    await page.waitForTimeout(700);
    const late = await sample(800);

    // It is cutting at all...
    expect(early, 'the wall never changed').toBeGreaterThan(1);
    // ...and by the end it is cutting more often across the same span of
    // frames than it was at the start.
    expect(late, 'the cuts did not speed up').toBeGreaterThanOrEqual(early);

    // And the panels themselves never moved: the canvas is one fixed box.
    const box = (await page.locator('.splash-stage canvas').boundingBox())!;
    await waitForFrames(page, 10);
    const later = (await page.locator('.splash-stage canvas').boundingBox())!;
    expect(later).toEqual(box);

    await context.close();
  });
});

test.describe('VB-128 — every exit, at every moment', () => {
  test('a letter key does NOT dismiss it, and mid-show it is still there', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    await page.keyboard.press('a');
    await page.waitForTimeout(3200);
    await expect(page.locator('.splash')).toHaveCount(1);

    await context.close();
  });

  test('Escape dismisses it from frame one, before any button exists', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.getByRole('button', { name: /^Context\.md/ })).toBeVisible();

    await context.close();
  });

  test('a click anywhere mid-show lands on Home — the rest of the movie is optional', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    await page.mouse.click(12, 640);
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('.home')).toHaveCount(1);
    await expect(page.locator('.flow')).toHaveCount(0);

    await context.close();
  });

  test('the reveal’s button is real: named, focusable, Enter works', async () => {
    // Was the enter button's; it is SKIP's since BR-01 removed the other one.
    const { context, page } = await launchPanel();
    const cta = page.getByRole('button', { name: S.splashStraight, exact: true });
    await cta.waitFor({ timeout: REVEAL_TIMEOUT });

    await cta.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('.home')).toHaveCount(1);

    await context.close();
  });

  test('a press through the splash never acts on the control it is covering', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');
    await page.waitForSelector('.home');

    const target = page.getByRole('button', { name: /^Context\.md/ });
    const box = (await target.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.waitForTimeout(600);
    await expect(page.locator('.home')).toHaveCount(1);
    await expect(page.locator('.flow')).toHaveCount(0);

    await context.close();
  });

  test('the covered panel is inert while the splash is up; Tab walks the doors in order', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');
    await expect(page.locator('main[inert]')).toHaveCount(1);

    await page.waitForSelector('.splash-cost', { timeout: REVEAL_TIMEOUT });
    // 2026-08-31: the screen is a two-button CHOICE. The corner's Skip and the
    // tour door are gone — "go straight in" is one of these two now, and the
    // tour is still the interview's own first three steps. The baseline path
    // is first because it is the one that expires.
    /* 2026-09-02: a THIRD stop, and it is deliberately FIRST. The read-aloud
       toggle joins the screen so somebody can turn narration on before they
       choose a path — and a control that changes how the next screen behaves
       has to be reachable before the controls that take you there, or the
       keyboard route offers it only after the choice it applies to is gone. */
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement?.textContent ?? ''));
    }
    expect(order).toEqual([S.narratorShort, S.splashBaseline, S.splashStraight]);

    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('main[inert]')).toHaveCount(0);

    await context.close();
  });

  test('the show does NOT end on its own — it waits for a choice', async () => {
    test.setTimeout(40_000);
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash-cost', { timeout: REVEAL_TIMEOUT });

    /* THE SPLASH NO LONGER HANDS ITSELF OVER (2026-08-31). It waits, because
       it is asking a question with two answers and a screen that answers its
       own question after ten seconds is not asking one. Well past every clock
       this screen ever had, it is still there. */
    await page.waitForTimeout(SPLASH_BEATS.idleMs + 2000);
    await expect(page.locator('.splash')).toHaveCount(1);
    /* `.home` is UNDER the splash the whole time and always has been — VB-34:
       "the surface first, always, and the splash after it", so the panel never
       waits on the splash to paint. What "has not handed over" means here is
       that the splash is still up and still asking, not that Home is absent. */
    await expect(page.getByRole('button', { name: S.splashStraight, exact: true })).toBeVisible();

    await context.close();
  });
});

test.describe('VB-34 — once per session', () => {
  test('does not come back when the panel is reopened in the same session', async () => {
    const { context, page, url } = await launchPanel();
    await page.waitForSelector('.splash');
    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0);

    await page.goto(url);
    await page.waitForSelector('.home');
    await page.waitForTimeout(600);
    await expect(page.locator('.splash')).toHaveCount(0);

    const second = await context.newPage();
    await second.setViewportSize({ width: 400, height: 700 });
    await second.goto(url);
    await second.waitForSelector('.home');
    await second.waitForTimeout(600);
    await expect(second.locator('.splash')).toHaveCount(0);

    await context.close();
  });

  test('a new browser session gets the show again', async () => {
    const first = await launchPanel();
    await expect(first.page.locator('.splash')).toHaveCount(1);
    await first.context.close();

    const second = await launchPanel();
    await expect(second.page.locator('.splash')).toHaveCount(1);
    await second.context.close();
  });
});

test.describe('VB-128 — reduced motion', () => {
  test('is the composed reveal immediately, and not one animation frame is scheduled', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splash-wordmark', { timeout: 4000 });

    expect(await frameCount(page)).toBe(0);
    await expect(page.locator('.splash')).toHaveAttribute('data-phase', 'reveal');
    await expect(page.locator('.splash-wordmark')).toHaveText('Workbrain');
    await expect(page.locator('.splash-tagline')).toHaveText(
      'How you do anything is how your AI does everything.',
    );
    await expect(page.locator('.splash-cost')).toBeVisible();

    // The mark holds the camera path's own still viewpoint.
    const before = await readPose(page, '.splash-lockup .brand-mark');
    expect(before).toEqual(STILL_POSE);
    await page.waitForTimeout(1200);
    expect(await frameCount(page), 'a frame loop is running under reduced motion').toBe(0);
    expect(await readPose(page, '.splash-lockup .brand-mark')).toEqual(before);

    await context.close();
  });

  test('reduced motion: the two sentences and the way past are all there, still', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.locator('.splash-lockup').waitFor({ timeout: 4000 });

    // BS-09 deleted the drain bar AND the once-per-second stepper that drove
    // it under reduced motion — there is nothing left to step. What the
    // still version has to keep is the instruction, and it does: both
    // sentences, the button, the skip and the tour door.
    await expect(page.locator('.splash-cost')).toHaveText(S.splashCost);
    await expect(page.locator('.splash-what')).toHaveText(S.splashWhat);
    await expect(page.locator('.splash-cost')).toBeVisible();
    await expect(page.getByRole('button', { name: S.splashStraight, exact: true })).toBeVisible();
    await expect(page.locator('.splash-drain')).toHaveCount(0);

    await context.close();
  });

  test('reduced motion waits too — the still version keeps the whole contract', async () => {
    test.setTimeout(30_000);
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splash-cost', { timeout: 4000 });

    /* The still version keeps the WHOLE contract, and that now includes
       waiting: reduced motion changes how the screen arrives, never what it
       asks. Both doors are there and nothing hands over on its own. */
    await page.waitForTimeout(SPLASH_BEATS.idleMs + 2000);
    await expect(page.locator('.splash')).toHaveCount(1);
    await expect(page.getByRole('button', { name: S.splashStraight, exact: true })).toBeVisible();
    expect(await frameCount(page)).toBe(0);

    await context.close();
  });

  test('still dismissable, instantly — Escape, with no fade and not one frame', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splash');
    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    expect(await frameCount(page)).toBe(0);
    await context.close();
  });

  test('without the preference the clock really is running — the control', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash .brand-mark');
    await waitForFrames(page, 20);
    expect(await frameCount(page)).toBeGreaterThan(10);
    await context.close();
  });
});
