import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORBIT_STILL } from '../../src/core/geometry/markOrbit';
import { SPLASH_BEATS } from '../../src/core/splash/sequence';
import { S } from '../../src/panel/strings';
import {
  CLAIM_LANDS,
  CLAIM_TRUE,
  CLAIM_WORDS,
  COUNT_TO,
  REVEAL_REST,
  REVEAL_SETTLED,
  ROLODEX_STARTS,
  ROLODEX_TURNS,
  ROLODEX_TURN_MS,
} from '../../src/core/splash/reveal';
import { PULSE_MS } from '../../src/core/splash/launch';
import { HOLD_MS, LAUNCH_MS } from '../../src/core/splash/rocket';
import { partAt } from '../../src/core/splash/reveal';

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

/* V2.9 slice 2: the reveal is a SEQUENCE now, not a frame. The doors are the
   last part to land — `REVEAL_SETTLED` seconds after the white breaks — so a
   timeout sized for the old static reveal expires while the show is still
   playing. Derived from core rather than guessed, so a re-timing moves this
   with it instead of leaving a mystery flake behind. */
const REVEAL_TIMEOUT = (SPLASH_BEATS.revealAt + REVEAL_SETTLED + 4) * 1000;

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
  /* `init` runs before the first navigation. It has to: the show is once per
     browser session (VB-34), so a script installed by reloading arrives at a
     panel that has already decided not to play. */
  options: { reduce?: boolean; init?: () => void; narrator?: boolean } = {},
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
  /* Seeded through the worker, before the panel exists to read it. `wb:prefs`
     is one item written whole (prefs.ts), so this writes it whole too. */
  if (options.narrator !== undefined) {
    await sw.evaluate(async (on) => {
      await chrome.storage.sync.set({ 'wb:prefs': { narrator: on } });
    }, options.narrator);
  }
  const page = await context.newPage();
  await installFrameProbe(page);
  if (options.init) await page.addInitScript(options.init);
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(url);
  return { context, page, url };
}

/**
 * V2.9 slice 4 hold — the keys are HELD, not clicked. Pointer down, wait for
 * the ring to arm (`data-live` is written by the component at the arm, so
 * this waits on the product's own state rather than on a timer), pointer
 * up. `hover` carries Playwright's actionability wait, which is what holds
 * this back until the part is pressable at all.
 */
async function holdKey(
  page: Page,
  which: 'baseline' | 'launch',
  side: 'voiced' | 'silent' = 'voiced',
) {
  /* The ring pass: the SIDES are the controls — a real browser has a speech
     engine, so the sided form is what renders. The collapsed single button
     exists only where speech does not (jsdom's world, the unit suite's). */
  const key = page.locator(
    `${which === 'baseline' ? '.splash-basekey-key' : '.splash-launch-key'} .splash-holdkey-side[data-side='${side}']`,
  );
  await key.hover();
  await page.mouse.down();
  await page.waitForSelector(".splash-holdkey[data-live='on']", { timeout: 15_000 });
  await page.mouse.up();
}

/* The answer the elimination is left standing on. Indexed by core's own count
   rather than by a hard 3, and the count is asserted below — if the copy grew a
   fifth answer while core still said four, every check here would quietly be
   made against the wrong sentence. */
const TRUE_ANSWER = S.splashLeaveAnswers[CLAIM_TRUE]!;
const TRUE_PHRASE = `${TRUE_ANSWER.amount} ${TRUE_ANSWER.verb}`;

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
    await expect(page.locator('.splashreveal-cost')).toHaveCount(0);

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
    await expect(page.locator('.splashreveal-cost')).toBeVisible();
    /* V2.9 slice 3b: the second section is a bold claim with a device under
       it, not a single line — `.splashreveal-own` is the line that carries the
       promise, and it is the one the stack is measured against. */
    await expect(page.locator('.splashreveal-own')).toBeVisible();

    // Centred, and stacked in the movie order: mark, promise, cost, what.
    const mark = (await page.locator('.splashreveal .brand-mark').boundingBox())!;
    const tagline = (await page.locator('.splash-tagline').boundingBox())!;
    const cost = (await page.locator('.splashreveal-cost').boundingBox())!;
    const what = (await page.locator('.splashreveal-own').boundingBox())!;
    /* V2.9 slice 2: the TIME section moves "up and slightly to the left" at
       Adam's word, so exact centring is no longer a claim the settled frame
       makes about every part. The mark and the tagline never move sideways —
       that IS still a claim, and it is the one checked. The stacking order
       below is what the sequence has to preserve. */
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
    await page.locator('.splashreveal').waitFor({ timeout: REVEAL_TIMEOUT });

    // Nothing draining, nothing cycling — §9: "nothing spins and nothing
    // counts down", because a bar draining toward a hand-over is pressure
    // applied to the decision the seconds exist for.
    await expect(page.locator('.splash-loader')).toHaveCount(0);
    await expect(page.locator('.splash-drain')).toHaveCount(0);

    // The two sentences, and they are the same promise the welcome screen
    // makes one screen later.
    /* V2.9 slice 2: two static paragraphs became two animated sections. The
       minutes stream down from thirty and the privacy claims alternate in one
       slot, so neither is a fixed string to read back. Both still land. */
    await expect(page.locator('.splashreveal-cost')).toContainText(S.splashCostUnit);
    /* V2.9 slice 3b: the second claim is arrived at rather than printed, so
       what lands is the bold line plus whichever answer the elimination is
       currently standing on — never an empty slot. */
    await expect(page.locator('.splashreveal-own')).toContainText(S.splashOwnSpan);
    await expect(page.locator(".splashreveal-phrase[data-on='on']")).not.toBeEmpty();

    // And the product does not promise a file it hides: Actions is out for
    // the beta (V2.9 VB-146), so no count of files is claimed here at all.
    expect(
      [...S.splashLeaveAnswers.map((a) => `${a.amount} ${a.verb}`), S.splashLeaveTail, S.splashOwnLead].join(
        ' ',
      ),
    ).not.toMatch(/\bthree\b/i);

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
    await page.locator('.splashreveal').waitFor({ timeout: REVEAL_TIMEOUT });

    await expect(
      page.getByRole('button', { name: S.splashBaseline, exact: true }),
    ).toBeVisible();
    await holdKey(page, 'baseline');

    await page.waitForSelector('.flow', { timeout: 15_000 });
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

    /* THE OPENING IS TRULY STILL NOW (the sketch pass, 2026-09-01): every
       panel is pinned to its first picture and the tint cycle that used to
       shimmer through the pinned stage is gone — Adam: "this relies only on
       the changing of images and not on the changing of color". `stageAt`
       holds the pinned stage until 46% of the run to the swell (~1.75s), so
       the first sample only proves PAINT, and the liveness check POLLS for
       the first cut instead of betting on a fixed 280ms gap that the old
       tint used to win. */
    await page.waitForTimeout(900);

    const first = await sample();
    expect(first, 'the stage left before the first look').not.toBeNull();
    expect(first!.painted, 'the canvas is blank — no sketches were drawn').toBeGreaterThan(40);
    // A living field once the cuts begin: some pixel changes before the
    // swell takes the wall (pinned ends ~1.75s; the stage leaves at 4.35s).
    await expect
      .poll(async () => (await sample())?.strip ?? first!.strip, { timeout: 2600 })
      .not.toBe(first!.strip);

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

    /* Sampled PAST THE PINNED OPENING (the sketch pass): the wall now holds
       its first pictures dead still until ~1.75s — stillness is the design,
       not a dead canvas — so both windows sit inside the cutting half of the
       show, and "faster" is early-cutting vs late-cutting. */
    await page.waitForTimeout(1800);
    const early = await sample(700);
    await page.waitForTimeout(250);
    const late = await sample(700);

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
    /* HELD via the keyboard (the hold pass): Enter down charges the same
       ring on the same clock, and releasing after the arm is the press. A
       tap deliberately does nothing under full motion — that is the hold
       doing its job. */
    await page.keyboard.down('Enter');
    await page.waitForSelector(".splash-holdkey[data-live='on']", { timeout: 15_000 });
    await page.keyboard.up('Enter');
    await expect(page.locator('.splash')).toHaveCount(0, {
      timeout: PULSE_MS + LAUNCH_MS + 6000,
    });
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

    await page.waitForSelector('.splashreveal-cost', { timeout: REVEAL_TIMEOUT });
    // 2026-08-31: the screen is a two-button CHOICE. The corner's Skip and the
    // tour door are gone — "go straight in" is one of these two now, and the
    // tour is still the interview's own first three steps. The baseline path
    // is first because it is the one that expires.
    /* 2026-09-02: a THIRD stop, and it is deliberately FIRST — a read-aloud
       toggle, so narration could be turned on before the path it applies to
       was chosen.

       SUPERSEDED, V2.9 slice 4a: the toggle is gone and the choice it offered
       is inside the door now. The baseline is two halves of one object —
       narrated and silent — so the preference is set by which half is pressed
       rather than by a control above them, and the keyboard walks exactly the
       three things this screen does: the loud door, the quiet one, the way
       straight in. A control reachable only after the choice it applies to is
       gone was the problem the toggle-first order solved; a choice that IS the
       door cannot have it. */
    /* The ring pass: four stops, the silent side of each key before its
       voiced one (left before right, the reading order), baseline key before
       launch. Every side's accessible name is the whole action in its own
       voice. */
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ??
            document.activeElement?.textContent ??
            '',
        ),
      );
    }
    expect(order).toEqual([
      S.splashBaselineSilent,
      S.splashBaseline,
      S.splashStraightSilent,
      S.splashStraight,
    ]);

    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('main[inert]')).toHaveCount(0);

    await context.close();
  });

  test('the show does NOT end on its own — it waits for a choice', async () => {
    test.setTimeout(40_000);
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splashreveal-cost', { timeout: REVEAL_TIMEOUT });

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

test.describe('V2.9 slice 3 — the sections stop', () => {
  test('the claims come to rest instead of swapping under the decision', async () => {
    test.setTimeout(40_000);
    const { context, page } = await launchPanel();
    await page.locator('.splashreveal').waitFor({ timeout: REVEAL_TIMEOUT });

    /* Slice 2 cycled two claims for as long as the panel was open, and the
       doors land at five seconds — so ten seconds in, a sentence was still
       changing underneath somebody's decision. `REVEAL_REST` is when core says
       the last thing has landed. After it the screen is a picture, and the
       phrase left standing is the TRUE one.

       This is the assertion the whole device exists for: the elimination must
       end on "Nothing leaves", never on a struck-out wrong answer. */
    await page.waitForTimeout((REVEAL_REST + 0.5) * 1000);
    const showing = page.locator(".splashreveal-phrase[data-on='on']");
    await expect(showing).toHaveText(TRUE_PHRASE);

    await page.waitForTimeout(4000);
    await expect(showing).toHaveText(TRUE_PHRASE);
    // And not still tipping, fading or being struck.
    const moving = await page.locator('.splashreveal-slot').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        strike: style.getPropertyValue('--strike').trim(),
        underline: style.getPropertyValue('--underline').trim(),
        opacity: style.opacity,
        transform: el.getAttribute('style') ?? '',
      };
    });
    expect(moving.strike).toBe('0.000');
    /* And the true answer wears the one mark on this screen that is not a
       rejection: a line UNDER its first word, fully drawn. */
    expect(moving.underline).toBe('1.000');
    expect(Number(moving.opacity)).toBeCloseTo(1, 2);
    /* Matched rather than compared: Chrome re-serialises the style attribute
       it is handed, so the "0.0" written by the paint loop reads back as "0".
       What is being asserted is face-on, not a string. */
    expect(moving.transform).toMatch(/rotateX\(0(\.0+)?deg\)/);

    await context.close();
  });

  test('the copy and the choreography agree on how many answers there are', async () => {
    /* Pure arithmetic, and it needs no browser — but it belongs beside the
       tests that rely on it. core counts the phrases and the panel holds them;
       a fifth answer added to one and not the other is a slot that either
       stops early or points past the end. */
    expect(S.splashLeaveAnswers).toHaveLength(CLAIM_WORDS);
    expect(TRUE_ANSWER).toBe(S.splashLeaveAnswers[S.splashLeaveAnswers.length - 1]);
  });

  test('the false answers are never said out loud', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splashreveal').waitFor({ timeout: REVEAL_TIMEOUT });

    /* THE ONE PLACE THIS PRODUCT CANNOT AFFORD TO BE MISREAD. The slot spends
       four seconds showing "Everything leaves your browser" and two more
       wrong answers after it — decoration of a claim, made of real words. A
       screen reader arriving mid-animation must never be handed one of them,
       so the whole animated line is aria-hidden and the claim is stated once,
       plainly, in the visually-hidden paragraph beside it. */
    await expect(page.locator('.splashreveal-leave')).toHaveAttribute('aria-hidden', 'true');
    const spoken = page.locator('.splashreveal-part[data-part="privacy"] .app-sr');
    await expect(spoken).toHaveText(`${TRUE_PHRASE} ${S.splashLeaveTail}`);

    // And what it says is the promise the rest of the product makes.
    expect(`${TRUE_PHRASE} ${S.splashLeaveTail}`).toContain(S.privacyNote);

    await context.close();
  });

  test('the tail never moves as the answers swap', async () => {
    test.setTimeout(40_000);
    const { context, page } = await launchPanel();
    await page.locator('.splashreveal').waitFor({ timeout: REVEAL_TIMEOUT });
    const t0 = Date.now();

    /* Every phrase lives in the same grid cell, so the slot is as wide as the
       widest of them. If it were sized to whichever phrase is showing, the
       words after it would jump left and right four times while somebody read
       them — the counter's jog, in a line of prose. */
    /* MEASURED AS LAYOUT, NOT AS PAINT. The slot is mid-flip for most of this
       window, and a bounding box is the TRANSFORMED box — it narrows as the
       phrase tips away, which the first version of this test read as the slot
       resizing. `offsetWidth` is the layout box, which is what the words after
       it actually sit against. */
    const widths = new Set<number>();
    const phrases = new Set<string>();
    /* SAMPLED ACROSS THE WHOLE DEVICE, from core's own clock. A fixed six-second
       window was right when an answer lasted 1.5s and wrong the moment Adam
       retimed them to 2.5 — it ran out before the second answer arrived and
       the test passed having watched nothing swap. `CLAIM_LANDS` moves with
       the timing, so this cannot go stale the same way twice. */
    const until = t0 + (CLAIM_LANDS + 0.5) * 1000;
    while (Date.now() < until) {
      const seen = await page.locator('.splashreveal-slot').evaluate((el) => ({
        width: (el as HTMLElement).offsetWidth,
        phrase: el.querySelector("[data-on='on']")?.textContent ?? '',
      }));
      widths.add(seen.width);
      phrases.add(seen.phrase);
      await page.waitForTimeout(120);
    }
    // The window has to have covered a swap, or there was nothing to hold still.
    expect(phrases.size).toBeGreaterThan(1);
    expect([...widths]).toHaveLength(1);

    await context.close();
  });

  test('the counter streams without the line jogging sideways', async () => {
    const { context, page } = await launchPanel();
    const count = page.locator('.splashreveal-count');
    await count.waitFor({ timeout: REVEAL_TIMEOUT });

    /* Thirty numbers land in this slot in under a second. Without tabular
       figures each one is a different width, and because the line is centred
       every digit change shoves the words either side of it — which on a
       counter is the only thing anybody sees. The box is the proof: same
       left edge, same width, whatever number is in it. */
    /* Sampled against a DEADLINE rather than a fixed number of polls: the
       count begins at 2.6s and lasts under a second, and a loop of sixty
       round trips ran out before it started on a fast machine — which is a
       test that passes for the wrong reason waiting to happen. */
    /* MEASURED INSIDE ITS OWN LINE, not against the viewport. The section
       itself moves up and left while the count is still running, and a
       viewport measurement reads that choreography as a jog — the first
       version of this test failed on the last number for exactly that reason
       and was right about the pixels and wrong about the cause. What a jog
       IS, is the digits changing width under the words either side of them,
       so the number's offset within its own paragraph is the thing to hold. */
    const seen = new Map<string, string>();
    const until = Date.now() + 5000;
    while (Date.now() < until) {
      const sample = await count.evaluate((el) => {
        const line = el.parentElement;
        if (!line) return null;
        const box = el.getBoundingClientRect();
        const within = line.getBoundingClientRect();
        return {
          text: el.textContent ?? '',
          at: `${(box.left - within.left).toFixed(1)}x${box.width.toFixed(1)}`,
        };
      });
      if (sample) seen.set(sample.text, sample.at);
      await page.waitForTimeout(25);
    }

    expect(seen.size, 'the counter really ran').toBeGreaterThan(2);
    expect(new Set(seen.values()).size, `the box moved: ${[...seen].join(', ')}`).toBe(1);

    await context.close();
  });

  test('the turn plays three times, when core says, and never at mount', async () => {
    test.setTimeout(40_000);
    /* THE TEST THAT WOULD HAVE CAUGHT IT. The first version of this asserted
       that the animation's DURATION had crossed from core into the stylesheet
       — which was true while the turn itself was broken. The line was keyed on
       `rolodexAt().turn`, which reads 0 both before the first turn and during
       it, so what actually played was the element mounting at reveal zero,
       with the section still invisible, and only two of the three turns ever
       reached the screen.

       A duration is not a turn. This counts turns. */
    const { context, page } = await launchPanel({
      init: () => {
        const w = window as unknown as { __turns: { at: number; ms: string }[] };
        w.__turns = [];
        const from = performance.now();
        new MutationObserver((records) => {
          for (const record of records) {
            const el = record.target as HTMLElement;
            if (el.matches?.('.splashreveal-rolodex') && el.dataset.turning === 'on') {
              /* The length is read HERE, while the turn is live. The animation
                 only exists while the line is marked as turning, so a reading
                 taken after the show is a reading of nothing. */
              w.__turns.push({
                at: (performance.now() - from) / 1000,
                ms: getComputedStyle(el).animationDuration,
              });
            }
          }
          /* Observed on `document`, not `document.documentElement`: an init
             script runs before the document has started parsing, and the
             element is not there yet to be handed to `observe`. */
        }).observe(document, {
          subtree: true,
          attributes: true,
          attributeFilter: ['data-turning'],
        });
      },
    });

    const line = page.locator('.splashreveal-rolodex');
    await line.waitFor({ timeout: REVEAL_TIMEOUT });
    // The turn is 620ms and the rests between are 900ms; three of them are
    // done by ROLODEX_STARTS + 4.6s. Wait past the last with room to spare.
    await page.waitForTimeout((ROLODEX_STARTS + 6) * 1000);

    const turns = await page.evaluate(
      () => (window as unknown as { __turns: { at: number; ms: string }[] }).__turns,
    );
    expect(turns).toHaveLength(ROLODEX_TURNS);

    /* And the first one is not the mount. The observer's clock starts at
       document load, the reveal starts SPLASH_BEATS.revealAt after it, and
       core holds the first turn ROLODEX_STARTS beyond that — so a turn played
       at mount would land at roughly zero and this would catch it. */
    expect(turns[0]!.at).toBeGreaterThan(SPLASH_BEATS.revealAt + ROLODEX_STARTS - 0.6);

    // Timed from one number: every turn runs for the length core counts it in.
    for (const turn of turns) expect(turn.ms).toBe(`${ROLODEX_TURN_MS / 1000}s`);

    await context.close();
  });
});

test.describe('V2.9 — the ring is the choice: sides, not a toggle', () => {
  const narratorPref = (page: Page) =>
    page.evaluate(async () => {
      const stored = await chrome.storage.sync.get('wb:prefs');
      return (stored['wb:prefs'] as { narrator?: boolean } | undefined)?.narrator ?? null;
    });

  test('holding the talking side goes in with the voice ON', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    /* Adam (2026-09-02): the voice choice lives IN the outline — talking
       silhouette at three o'clock, struck one at nine — and the held side is
       both the answer and the way through: 4a's law, back in a circle. */
    await holdKey(page, 'baseline', 'voiced');
    await expect(page.locator('.flow')).toHaveCount(1, { timeout: 15_000 });
    expect(await narratorPref(page)).toBe(true);

    await context.close();
  });

  test('and the struck side turns it OFF for somebody who had it on', async () => {
    /* Narrator already on — the only state where the silent side has
       anything to write, since `setPref` returns early on an unchanged
       value. */
    const { context, page } = await launchPanel({ narrator: true });
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });
    expect(await narratorPref(page)).toBe(true);

    await holdKey(page, 'baseline', 'silent');
    await expect(page.locator('.flow')).toHaveCount(1, { timeout: 15_000 });
    expect(await narratorPref(page)).toBe(false);

    await context.close();
  });

  test('both keys carry both sides, at the full target size, and no toggle stands apart', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    /* The hold pass's standalone toggle folded into the rings (Adam's ask,
       by name); each side is a real 44px control however small its chip
       draws, and its accessible name is the whole action in its own voice. */
    await expect(page.locator('.splash .narrator-toggle')).toHaveCount(0);
    for (const [key, name] of [
      ['.splash-basekey-key', S.splashBaseline],
      ['.splash-basekey-key', S.splashBaselineSilent],
      ['.splash-launch-key', S.splashStraight],
      ['.splash-launch-key', S.splashStraightSilent],
    ] as const) {
      const side = page.locator(key).getByRole('button', { name, exact: true });
      await expect(side).toHaveCount(1);
      const box = (await side.boundingBox())!;
      expect(box.width, `${name} is under the target floor`).toBeGreaterThanOrEqual(44);
      expect(box.height, `${name} is under the target floor`).toBeGreaterThanOrEqual(44);
    }

    await context.close();
  });

  test('a tap does not launch; a released hold drains and nothing happens', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    /* The hold IS the confirmation — this product refuses dialogs, so the
       charge is where the second thought lives. A tap and a half-hold must
       both come to nothing. */
    const side = page.locator(".splash-basekey-key .splash-holdkey-side[data-side='voiced']");
    await side.click();
    await side.hover();
    await page.mouse.down();
    await page.waitForTimeout(HOLD_MS * 0.3);
    await page.mouse.up();
    await page.waitForTimeout(600);

    await expect(page.locator('.splash-rocketstage')).toHaveCount(0);
    await expect(page.locator('.splash')).toHaveCount(1);
    await expect(page.locator('.flow')).toHaveCount(0);

    await context.close();
  });

  test('the armed ring fills in the key’s colour across the count', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    /* "Which ever side the[y] click the rest of the outline fills in that
       color during the countdown" — the fill circle's dash walks closed on
       the count's own clock. Two reads a beat apart prove it is FILLING,
       not merely on. */
    await holdKey(page, 'baseline', 'voiced');
    const fill = page.locator('.splash-basekey-key .splash-holdkey-fill');
    await expect(fill).toHaveCSS('opacity', '1', { timeout: 3000 });
    const at = async () =>
      fill.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));
    const first = await at();
    await page.waitForTimeout(500);
    const second = await at();
    expect(second, 'the ring is not filling').toBeLessThan(first);

    await context.close();
  });
});

test.describe('V2.9 slice 4b — the cable and the pulse', () => {
  test('the press is taken at once, and the door opens a beat later', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-launch').waitFor({ timeout: REVEAL_TIMEOUT });

    /* MEASURED, NOT SAMPLED. A watcher polling the wire's opacity is racing a
       420ms animation on a splash that is removed the moment it ends — it
       passed alone and failed beside three others, twice, for no reason the
       product would care about.

       What the product actually promises is in the TIMING: the press is
       acknowledged immediately and the door opens when the light lands. The
       beat between them is `PULSE_MS`, and the reduced-motion test below is
       the control — same press, no beat. */
    await expect(page.locator('.splash-launch-key')).toHaveAttribute('data-live', 'off');

    const from = Date.now();
    await holdKey(page, 'launch');
    // Acknowledged at the arm, not when the light arrives.
    await expect(page.locator('.splash-launch-key')).toHaveAttribute('data-live', 'on');

    /* THE MARKER IS THE SPLASH LEAVING, NOT HOME ARRIVING. Home is built
       underneath this screen from the first paint — deliberately, and there is
       a test for it — so `.home` is visible the whole time and waiting for it
       measures Playwright's own round trip. The first version of this test
       asserted 420ms against a 306ms number that had nothing to do with the
       product. */
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 8000 });
    const took = Date.now() - from;
    expect(took, 'the door opened before the light could have landed').toBeGreaterThanOrEqual(
      PULSE_MS * 0.8,
    );

    await context.close();
  });

  test('the wire lights, and the light walks it towards the door', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-launch').waitFor({ timeout: REVEAL_TIMEOUT });

    /* Held mid-pulse rather than chased: the light is asked about while it is
       still travelling, which is possible because the door does not open until
       it lands. Two reads, a frame apart, so this says "travelling" and not
       merely "on". */
    const light = page.locator('.splash-cable-light');
    await expect(light).toHaveCSS('opacity', '0');

    await holdKey(page, 'launch');
    await page.waitForTimeout(PULSE_MS * 0.35);

    const first = await light.evaluate((el) => ({
      opacity: getComputedStyle(el).opacity,
      offset: parseFloat(getComputedStyle(el).strokeDashoffset),
    }));
    await page.waitForTimeout(PULSE_MS * 0.3);
    const second = await light.evaluate((el) => parseFloat(getComputedStyle(el).strokeDashoffset));

    expect(Number(first.opacity)).toBe(1);
    // The dash walks from the far end INTO the door, so the offset falls.
    expect(second).toBeLessThan(first.offset);

    await context.close();
  });

  test('it cannot be pressed twice — one launch, however many clicks', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-launch').waitFor({ timeout: REVEAL_TIMEOUT });

    /* There is nothing to come back from: the key stays down and the door is
       on its way. A second press mid-pulse must not start a second one. */
    await holdKey(page, 'launch');
    const key = page.getByRole('button', { name: S.splashStraight, exact: true });
    await key.click({ force: true, timeout: 1000 }).catch(() => {});
    await key.click({ force: true, timeout: 1000 }).catch(() => {});

    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator('.home')).toBeVisible();

    await context.close();
  });

  test('the cable is scenery: aria-hidden, and never in the way of the door', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-launch').waitFor({ timeout: REVEAL_TIMEOUT });

    const cable = page.locator('.splash-cable');
    await expect(cable).toHaveAttribute('aria-hidden', 'true');
    expect(
      await cable.evaluate((el) => getComputedStyle(el).pointerEvents),
    ).toBe('none');

    /* It hangs BELOW the door, into the space under it — the doors are the
       last thing on this screen, so there is nothing down there to collide
       with, and nothing above it moves to make room. */
    const key = (await page.locator('.splash-launch-key').boundingBox())!;
    const wire = (await cable.boundingBox())!;
    expect(wire.y).toBeGreaterThanOrEqual(key.y + key.height - 1);

    await context.close();
  });

  test('reduced motion: no pulse, no clock, and the door still opens', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.locator('.splash-launch').waitFor({ timeout: 4000 });

    /* Not a faster pulse and not a still one — the door hands over at once,
       which is what this screen already does everywhere else. The cable stays,
       drawn and lit: it is scenery, and scenery is not motion. */
    await expect(page.locator('.splash-cable')).toHaveCount(1);
    const before = await frameCount(page);

    const from = Date.now();
    await page.getByRole('button', { name: S.splashStraight, exact: true }).click();
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 2000 });
    await expect(page.locator('.home')).toBeVisible();

    // The control for the test above: the same press, without the beat. There
    // is no fade under reduced motion either, so this is the whole cost.
    expect(Date.now() - from).toBeLessThan(PULSE_MS);
    expect(await frameCount(page), 'a frame loop ran under reduced motion').toBe(before);

    await context.close();
  });
});

test.describe('V2.9 slice 4c — the rocket', () => {
  test('the launch door flies it, and the whiteout hands over to Home', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-launch').waitFor({ timeout: REVEAL_TIMEOUT });

    /* The pulse is what starts the flight (4b's seam), so the whole exit is
       pulse + flight + the splash's own fade. The lower bound is the claim —
       an upper bound on a loaded workstation is the flake the suite already
       warns about, and the product makes no promise about slowness. */
    const from = Date.now();
    await holdKey(page, 'launch');
    await expect(page.locator('.splash-rocketstage')).toHaveCount(1, { timeout: 2500 });
    await expect(page.locator('.splash-rocketstage')).toHaveAttribute('data-mode', 'flight');
    await expect(page.locator('.splash-rocket')).toHaveCount(1);

    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 8000 });
    const took = Date.now() - from;
    expect(took, 'the door opened before the flight could have flown').toBeGreaterThanOrEqual(
      (PULSE_MS + LAUNCH_MS) * 0.8,
    );
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.flow')).toHaveCount(0);

    await context.close();
  });

  test('both doors launch: the baseline door flies the same rocket, into the interview', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    /* The hold pass split the routes: the launch key flies the rocket
       under the count; the baseline key rides the count's own plain fade to
       the same white (Adam: "the background around everything but the
       countdown number fades to white"). Same stage, same convergence, no
       ship on this route. */
    const from = Date.now();
    await holdKey(page, 'baseline');
    await expect(page.locator('.splash-rocketstage')).toHaveCount(1, { timeout: 2000 });
    await expect(page.locator('.splash-rocketstage')).toHaveAttribute('data-mode', 'fade');
    expect(
      await page.locator('.splash-rocket').evaluate((el) => getComputedStyle(el).display),
    ).toBe('none');

    await expect(page.locator('.flow')).toHaveCount(1, { timeout: 15_000 });
    expect(Date.now() - from, 'the interview arrived before the count ran').toBeGreaterThanOrEqual(
      LAUNCH_MS * 0.8,
    );

    await context.close();
  });

  test('the flight is scenery, and the doors under it are closed', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    await holdKey(page, 'baseline');
    const stage = page.locator('.splash-rocketstage');
    await expect(stage).toHaveCount(1, { timeout: 2000 });

    /* Every word this screen had was already spoken by the reveal; the
       flight carries no instruction, and says so. And the reveal is INERT
       for the flight's length: its doors are still in the DOM under an
       opaque stage, and an invisible button that still took an Enter could
       re-choose narration mid-air. */
    await expect(stage).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.splash-hold')).toHaveAttribute('inert', '');

    await context.close();
  });

  test('one flight, however many doors get pressed — the first press is the answer', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    await holdKey(page, 'baseline');
    await expect(page.locator('.splash-rocketstage')).toHaveCount(1, { timeout: 2000 });
    // A second answer thrown at the closed keys, mid-ride.
    await page
      .getByRole('button', { name: S.splashStraight, exact: true })
      .click({ force: true, timeout: 1000 })
      .catch(() => {});

    /* The first hold chose the interview; the stray press at the other key
       must not re-aim the ride at Home. */
    await expect(page.locator('.flow')).toHaveCount(1, { timeout: 15_000 });

    await context.close();
  });

  test('Escape mid-flight lands at the chosen door, not at Home', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    /* Escape still means "close this" at every phase — but the person
       already chose a destination, and a shortcut that changed their answer
       would be the screen overruling them. It finishes the transition
       early; it does not reopen the question. */
    await holdKey(page, 'baseline');
    await expect(page.locator('.splash-rocketstage')).toHaveCount(1, { timeout: 2000 });
    await page.keyboard.press('Escape');

    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 2500 });
    await expect(page.locator('.flow')).toHaveCount(1, { timeout: 8000 });

    await context.close();
  });

  test('reduced motion: no rocket from either door — arriving IS the still version', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.locator('.splash-basekey').waitFor({ timeout: 4000 });

    /* docs/V2.9-SLICE-4-LAUNCH.md: "Under reduced motion there is no rocket
       and the hand-off is immediate." The 4b reduced test is the straight
       door's control (and its zero-frames probe would catch a rocket loop);
       this is the baseline door's, because BOTH doors launch now and both
       must degrade the same way. */
    await page.getByRole('button', { name: S.splashBaseline, exact: true }).click();
    await expect(page.locator('.flow')).toHaveCount(1, { timeout: 2500 });
    await expect(page.locator('.splash-rocketstage')).toHaveCount(0);

    await context.close();
  });
});

test.describe('V2.9 slice 4 polish — the fog, and the route to the corner', () => {
  test('the fog never lifts onto a screen nobody chose — zero naked-Home frames', async () => {
    test.setTimeout(60_000);
    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });

    /* THE SEAM THIS WHOLE FEATURE FIXES. The baseline route used to flash
       Home for as long as the interview took to mount. Now the interview is
       opened UNDER the whiteout and the splash only leaves once the fog has
       cleared — so there must never be a painted frame in which the splash
       is gone and the interview is not there. Counted in-page, per animation
       frame, because a wall-clock assertion here would measure the test
       machine instead of the product. */
    await page.evaluate(() => {
      const w = window as unknown as { __nakedFrames: number; __stop: boolean };
      w.__nakedFrames = 0;
      w.__stop = false;
      const probe = () => {
        if (w.__stop) return;
        if (!document.querySelector('.splash') && !document.querySelector('.flow')) {
          w.__nakedFrames += 1;
        }
        requestAnimationFrame(probe);
      };
      requestAnimationFrame(probe);
    });

    await holdKey(page, 'baseline');
    await page.waitForSelector('.flow', { timeout: 30_000 });
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 10_000 });

    const naked = await page.evaluate(() => {
      const w = window as unknown as { __nakedFrames: number; __stop: boolean };
      w.__stop = true;
      return w.__nakedFrames;
    });
    expect(naked, 'Home showed between the fog and the interview').toBe(0);

    await context.close();
  });

  test('the fog is real: the splash outlives the whiteout and dissolves, not fades', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-launch').waitFor({ timeout: REVEAL_TIMEOUT });

    await holdKey(page, 'launch');
    /* The stage flips to its fog dress at the whiteout — that attribute is
       the seam between the flight and the dissolve, and the dissolving
       splash has released its ground (Splash.css) so the fog thins over the
       app rather than over the dark field. */
    const stage = page.locator('.splash-rocketstage');
    await expect(stage).toHaveAttribute('data-fog', 'on', { timeout: 10_000 });
    await expect(page.locator('.splash')).toHaveAttribute('data-dissolving', 'on');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('.home')).toBeVisible();

    await context.close();
  });

  test('the heading is the sections’ own device, and the copy composes exactly', async () => {
    /* The accessible name is the whole heading; the panel renders it as lead
       plus a coloured span. If the three strings ever drift apart, the door
       stops being askable-for by voice — so the composition is pinned. */
    expect(`${S.splashBaselineLead} ${S.splashBaselineSpan}`).toBe(S.splashBaseline);

    const { context, page } = await launchPanel();
    await page.locator('.splash-basekey').waitFor({ timeout: REVEAL_TIMEOUT });
    await expect(page.locator('.splash-basekey .splash-cluster-span')).toHaveText(
      S.splashBaselineSpan,
    );
    await expect(
      page.getByRole('button', { name: S.splashBaseline, exact: true }),
    ).toBeVisible();

    await context.close();
  });

  test('the cable runs to the bottom-right corner of the panel', async () => {
    const { context, page } = await launchPanel();
    await page.locator('.splash-launch').waitFor({ timeout: REVEAL_TIMEOUT });

    /* ASSERTED AS ARITHMETIC, NOT AS A BOUNDING BOX. A bounding box carries
       whatever transform the paint loop last wrote, and on a starved machine
       that can be a frame from mid-arrival — this test failed by exactly the
       16px settle lean that way. The claim is about the MEASUREMENT MATH:
       the wire's anchor (offsets ignore transforms) plus the settled lean
       plus the size the layout effect computed must land on the panel's
       corner, because that is what "all the way to the corner" regresses
       through. The settle lean is core's own number, read from the page's
       real layout via the offset chain. */
    const geo = await page.evaluate(() => {
      const wrap = document.querySelector('.splash-launch') as HTMLElement | null;
      const svg = document.querySelector('.splash-cable') as SVGSVGElement | null;
      if (!wrap || !svg) return null;
      let x = 0;
      let y = 0;
      for (let el: HTMLElement | null = wrap; el; el = el.offsetParent as HTMLElement | null) {
        x += el.offsetLeft;
        y += el.offsetTop;
      }
      return {
        right: x + wrap.offsetWidth / 2 + parseFloat(svg.style.width || '0'),
        bottom: y + wrap.offsetHeight + parseFloat(svg.style.height || '0'),
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });
    expect(geo).not.toBeNull();
    /* Anchor + the settle lean (core's own number) + width = the right
       edge; anchor bottom + height = the bottom edge. A pixel of rounding
       either way is fine — dozens of missing pixels is the bug this catches. */
    const lean = partAt(REVEAL_SETTLED, 'launch').x;
    expect(geo!.right + lean).toBeGreaterThanOrEqual(geo!.vw - 2);
    expect(geo!.bottom).toBeGreaterThanOrEqual(geo!.vh - 2);

    await context.close();
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
    await expect(page.locator('.splashreveal-cost')).toBeVisible();

    // The mark holds the camera path's own still viewpoint.
    const before = await readPose(page, '.splashreveal .brand-mark');
    expect(before).toEqual(STILL_POSE);
    await page.waitForTimeout(1200);
    expect(await frameCount(page), 'a frame loop is running under reduced motion').toBe(0);
    expect(await readPose(page, '.splashreveal .brand-mark')).toEqual(before);

    await context.close();
  });

  test('reduced motion: the two sentences and the way past are all there, still', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.locator('.splashreveal').waitFor({ timeout: 4000 });

    // BS-09 deleted the drain bar AND the once-per-second stepper that drove
    // it under reduced motion — there is nothing left to step. What the
    // still version has to keep is the instruction, and it does: both
    // sentences, the button, the skip and the tour door.
    /* V2.9 slice 2: the still version is the SETTLED FRAME of the same
       storyboard — core's table gives it for free rather than needing a second
       layout — so both sections are present and finished, with the counter
       already landed on its final number rather than mid-stream. */
    await expect(page.locator('.splashreveal-cost')).toBeVisible();
    await expect(page.locator('.splashreveal-count')).toHaveText(String(COUNT_TO));
    /* V2.9 slice 3b — BOTH claims, and the second one already ARRIVED AT.
       The elimination is an argument made in time, and a still render has no
       time: what it must keep is the conclusion. A still frame painted at the
       wrong moment would sit there saying "Everything leaves your browser",
       which is the exact opposite of the promise, so this is checked rather
       than assumed. */
    await expect(page.locator('.splashreveal-own')).toBeVisible();
    await expect(page.getByText(S.splashOwnSpan, { exact: true })).toBeVisible();
    await expect(page.locator(".splashreveal-phrase[data-on='on']")).toHaveText(
      TRUE_PHRASE,
    );
    for (const wrong of S.splashLeaveAnswers.slice(0, CLAIM_TRUE)) {
      await expect(
        page.locator(`.splashreveal-phrase:has-text("${wrong.amount}")`).first(),
      ).toBeHidden();
    }
    await expect(page.getByRole('button', { name: S.splashStraight, exact: true })).toBeVisible();
    await expect(page.locator('.splash-drain')).toHaveCount(0);

    await context.close();
  });

  test('reduced motion waits too — the still version keeps the whole contract', async () => {
    test.setTimeout(30_000);
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splashreveal-cost', { timeout: 4000 });

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
