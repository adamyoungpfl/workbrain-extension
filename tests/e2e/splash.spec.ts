import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORBIT_STILL } from '../../src/core/geometry/markOrbit';

/**
 * V1.7 VB-34 accept criteria, amended by V2.1 VB-73 and simplified by V2.6
 * VB-126: "loops smoothly without a visible seam; reduced motion is a still
 * frame with the same information; the tagline is in strings.ts" — and the
 * VB-126 contract that replaced the doors: the splash is pure arrival, any
 * click lands on Home, one full-surface control is the keyboard path, Escape
 * still closes, and the covered panel is inert.
 *
 * WHAT IS PROVEN WHERE, AND WHY THE SPLIT
 * The loop's smoothness is a property of a pure function of time, and
 * `src/core/geometry/markOrbit.test.ts` measures it at 1,440 moments of every
 * loop — including the wrap, where it compares the step across the seam
 * against the biggest step the path takes anywhere else. A browser can sample
 * a few dozen frames and would prove far less. So the seam is not re-argued
 * here; what is argued here is everything that is only true of the running
 * extension:
 *
 *   - the splash is on screen at all, on a fresh session,
 *   - the mark on it is genuinely re-projecting in 3D rather than a CSS spin,
 *   - a real key press and a real click each end it,
 *   - it does not come back within the session,
 *   - under `prefers-reduced-motion` not one animation frame is ever
 *     requested — asserted by wrapping `requestAnimationFrame` before the
 *     panel's own bundle runs, the same technique brand-mark.spec.ts uses,
 *     because "nothing appears to move" and "no loop is running" are
 *     different claims and only the second one is the guardrail,
 *   - and the panel underneath is fully built the whole time, which is what
 *     "must not gate the panel's first paint" means in practice.
 *
 * Self-contained launch helpers, per this repo's one-spec-stands-alone
 * convention (see brand-mark.spec.ts and flow-progress.spec.ts).
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../dist');

/** The pose the splash must be showing when nothing is allowed to move. */
const STILL_POSE = ORBIT_STILL.nodes.map((n) => `${n.cx},${n.cy},${n.r}`);

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

/** Wait for `n` more animation frames than the page has already asked for. */
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
      // Playwright runs several headed windows at once and Chrome throttles
      // rAF in windows it believes are occluded. Same three flags, same
      // reason, as brand-mark.spec.ts: they only ever make frames more
      // likely, so they cannot mask a regression in the assertions below.
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

test.describe('VB-34 — the splash arrives', () => {
  test('is the mark, the name and the tagline, centred, on a fresh session', async () => {
    const { context, page } = await launchPanel();

    const splash = page.locator('.splash');
    await expect(splash).toHaveCount(1);
    await expect(page.locator('.splash-wordmark')).toHaveText('Workbrain');
    await expect(page.locator('.splash-tagline')).toHaveText(
      'How you do anything is how your AI does everything.',
    );
    // The whole icosahedron, not a degraded one.
    await expect(page.locator('.splash .brand-mark circle')).toHaveCount(12);
    await expect(page.locator('.splash .brand-mark line')).toHaveCount(30);

    // It covers the panel, and it is really the top layer rather than a card
    // that merely looks like one.
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
    // An opaque background, not a wash over the panel — no alpha component.
    expect(layer.opaque).not.toContain('rgba');

    // The lockup is centred across the panel, within a pixel.
    const mark = (await page.locator('.splash .brand-mark').boundingBox())!;
    const tagline = (await page.locator('.splash-tagline').boundingBox())!;
    expect(Math.abs(mark.x + mark.width / 2 - 200)).toBeLessThan(1);
    expect(Math.abs(tagline.x + tagline.width / 2 - 200)).toBeLessThan(1);
    // And the tagline is beneath the lockup, as VB-34 words it.
    expect(tagline.y).toBeGreaterThan(mark.y + mark.height);

    await context.close();
  });

  test('the tagline is legible — real contrast, not a decorative wash', async () => {
    const { context, page } = await launchPanel();
    // Measured by hand even though the splash is in the accessibility tree
    // now (VB-73) — the a11y suite's axe passes run on other surfaces, and
    // 4.5:1 is docs/GUARDRAILS.md's floor for any text a person must read.
    const ratio = await page.evaluate(() => {
      const parse = (c: string) => c.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const lum = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const text = document.querySelector('.splash-tagline')!;
      const fg = lum(parse(getComputedStyle(text).color));
      // The splash paints an opaque --canvas behind everything, tint included.
      const bg = lum(parse(getComputedStyle(document.querySelector('.splash')!).backgroundColor));
      const [hi, lo] = fg > bg ? [fg, bg] : [bg, fg];
      return (hi + 0.05) / (lo + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    await context.close();
  });

  test('does not gate the panel’s first paint — the panel is built underneath it', async () => {
    const { context, page } = await launchPanel();
    await expect(page.locator('.splash')).toHaveCount(1);

    // Home has rendered, laid out and is sitting there ready, while the
    // splash is still on screen. Nothing is waiting on the splash.
    await page.waitForSelector('.home');
    const home = (await page.locator('.home').boundingBox())!;
    expect(home.height).toBeGreaterThan(100);
    await expect(page.getByRole('button', { name: /^Context\.md/ })).toBeAttached();
    // Still covered — this is a "the panel is ready under it" claim, not a
    // "the splash left early" one.
    await expect(page.locator('.splash')).toHaveCount(1);

    await context.close();
  });
});

test.describe('VB-34 — the camera drifts', () => {
  test('re-projects in real 3D, and is not a CSS spin', async () => {
    const { context, page } = await launchPanel();
    const mark = '.splash .brand-mark';
    await page.waitForSelector(mark);

    const poses: string[] = [];
    const radii: string[] = [];
    for (let i = 0; i < 8; i++) {
      poses.push((await readPose(page, mark)).join(' '));
      radii.push(
        (await page.$$eval(`${mark} circle`, (cs) => cs.map((c) => c.getAttribute('r')))).join(' '),
      );
      await waitForFrames(page, 6);
      expect(await page.locator(`${mark} circle`).count()).toBe(12);
    }

    expect(new Set(poses).size, 'the mark never moved').toBeGreaterThan(5);
    // Radii change because the camera has perspective and is moving. A flat
    // CSS rotation would move every node and leave every radius alone.
    expect(
      new Set(radii).size,
      'positions moved but radii did not — that is a flat spin, not a camera',
    ).toBeGreaterThan(5);

    // Not a CSS transform doing it. Read as the matrix's off-diagonal terms
    // rather than as "the transform is none", because the mark's one-time
    // entrance is a real scale and may still be settling: a scale leaves b
    // and c at zero, and any rotation at all cannot.
    const [b, c] = await page.$eval(mark, (el) => {
      const t = getComputedStyle(el).transform;
      if (t === 'none') return [0, 0];
      const n = t.match(/[-\d.e]+/g)!.map(Number);
      return [n[1]!, n[2]!];
    });
    expect(Math.abs(b), 'the mark is being rotated by CSS').toBeLessThan(1e-6);
    expect(Math.abs(c), 'the mark is being rotated by CSS').toBeLessThan(1e-6);

    await context.close();
  });

  test('the mark’s own layout box never moves while the camera does', async () => {
    const { context, page } = await launchPanel();
    const mark = page.locator('.splash .brand-mark');
    await mark.waitFor();
    // Past the one-time entrance, which is a real fade-and-scale.
    await page.waitForTimeout(400);

    const boxes: string[] = [];
    for (let i = 0; i < 6; i++) {
      const box = (await mark.boundingBox())!;
      boxes.push(`${box.x},${box.y},${box.width},${box.height}`);
      await waitForFrames(page, 5);
    }
    expect(new Set(boxes).size, 'the mark resized or moved as the camera drifted').toBe(1);

    await context.close();
  });

  test('stays inside its own frame — nothing clips at any point in the loop', async () => {
    const { context, page } = await launchPanel();
    const mark = '.splash .brand-mark';
    await page.waitForSelector(mark);

    for (let i = 0; i < 10; i++) {
      const worst = await page.$$eval(`${mark} circle`, (cs) =>
        cs.reduce((acc, c) => {
          const cx = Number(c.getAttribute('cx'));
          const cy = Number(c.getAttribute('cy'));
          const r = Number(c.getAttribute('r'));
          return Math.min(acc, cx - r, cy - r, 240 - cx - r, 240 - cy - r);
        }, Infinity),
      );
      expect(worst, 'a node crossed the edge of the viewBox').toBeGreaterThan(0);
      await waitForFrames(page, 6);
    }

    await context.close();
  });
});

test.describe('V2.6 VB-126 — pure arrival: any click lands on Home', () => {
  /**
   * VB-73's doors are gone (Adam, 2026-08-26: "remove the buttons from the
   * splash page… any click from the splash page will load to the home
   * page"), and the surface is held for the wow treatment. What is kept:
   * the panel is fully built underneath (the first-paint test above is
   * untouched), it stays until told to go (no dwell, no letter-key skip),
   * a press through it never acts on a covered control, and Escape still
   * closes. What is new: the whole surface is one named control, and any
   * click anywhere is the same door.
   */
  test('a letter key does NOT dismiss it, and neither does time', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    await page.keyboard.press('a');
    // Well past the old dwell (2.4s) — VB-34's version was gone by now on
    // either count. Still here is the point.
    await page.waitForTimeout(3200);
    await expect(page.locator('.splash')).toHaveCount(1);

    await context.close();
  });

  test('Escape dismisses it', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    // And the panel is immediately usable.
    await expect(page.getByRole('button', { name: /^Context\.md/ })).toBeVisible();

    await context.close();
  });

  test('a click anywhere — the wordmark, the corner — lands on Home', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    // On the lockup itself: the picture ignores the pointer, so this press
    // falls through to the full-surface control underneath it.
    await page.locator('.splash-wordmark').click({ force: true });
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('.home')).toHaveCount(1);
    await expect(page.locator('.flow')).toHaveCount(0);
    await context.close();

    // And a corner, nowhere near anything drawn — the same door.
    const second = await launchPanel();
    await second.page.waitForSelector('.splash');
    await second.page.mouse.click(12, 640);
    await expect(second.page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(second.page.locator('.home')).toHaveCount(1);
    await second.context.close();
  });

  test('the one control is real: named, focusable, and Enter works', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    const enter = page.getByRole('button', { name: 'Open your work brain', exact: true });
    await expect(enter).toHaveCount(1);
    await enter.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('.home')).toHaveCount(1);

    await context.close();
  });

  test('a press through the splash never acts on the control it is covering', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');
    await page.waitForSelector('.home');

    // Aim at the middle of a real button on Home, through the splash. The
    // trust property survives VB-126 unchanged: the press dismisses the
    // splash and ends there — it must not act on a control nobody could see.
    const target = page.getByRole('button', { name: /^Context\.md/ });
    const box = (await target.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.waitForTimeout(600);
    await expect(page.locator('.home')).toHaveCount(1);
    await expect(page.locator('.flow')).toHaveCount(0);

    await context.close();
  });

  test('the covered panel is inert while the splash is up, and live after', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash');

    // One account of the screen at a time: the splash's control is the only
    // reachable one while it shows, which is what makes it the first Tab
    // stop without anything stealing focus.
    await expect(page.locator('main[inert]')).toHaveCount(1);
    await page.keyboard.press('Tab');
    const first = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(first).toBe('splash-enter');

    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    await expect(page.locator('main[inert]')).toHaveCount(0);

    await context.close();
  });
});

test.describe('VB-34 — once per session', () => {
  test('does not come back when the panel is reopened in the same session', async () => {
    const { context, page, url } = await launchPanel();
    await page.waitForSelector('.splash');
    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0);

    // Reopening the side panel destroys and rebuilds this document — a fresh
    // load of the same page is exactly that, and it is why a module variable
    // could not have carried this.
    await page.goto(url);
    await page.waitForSelector('.home');
    await page.waitForTimeout(600);
    await expect(page.locator('.splash')).toHaveCount(0);

    // A second panel document — a second tab's worth of the same page —
    // does not get one either.
    const second = await context.newPage();
    await second.setViewportSize({ width: 400, height: 700 });
    await second.goto(url);
    await second.waitForSelector('.home');
    await second.waitForTimeout(600);
    await expect(second.locator('.splash')).toHaveCount(0);

    await context.close();
  });

  test('a new browser session gets it again — so the test above means something', async () => {
    // The control. `chrome.storage.session` is memory, and a new browser is a
    // new session, so this must show the splash or "once per session" would
    // really be "once ever", which is a different and worse product.
    const first = await launchPanel();
    await expect(first.page.locator('.splash')).toHaveCount(1);
    await first.context.close();

    const second = await launchPanel();
    await expect(second.page.locator('.splash')).toHaveCount(1);
    await second.context.close();
  });
});

test.describe('VB-34 — reduced motion', () => {
  test('is a still, composed frame, and not one animation frame is scheduled', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splash');

    // The bar is zero. Not "few", not "it settles" — no loop may exist.
    expect(await frameCount(page)).toBe(0);
    const before = await readPose(page, '.splash .brand-mark');

    await page.waitForTimeout(1200);
    expect(await frameCount(page), 'a frame loop is running under reduced motion').toBe(0);
    expect(await readPose(page, '.splash .brand-mark')).toEqual(before);

    // And the still frame is the camera path's own first viewpoint, not some
    // separate drawing that could drift from it.
    expect(before).toEqual(STILL_POSE);

    await context.close();
  });

  test('carries the same information as the moving one', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splash');

    await expect(page.locator('.splash .brand-mark circle')).toHaveCount(12);
    await expect(page.locator('.splash .brand-mark line')).toHaveCount(30);
    await expect(page.locator('.splash-wordmark')).toHaveText('Workbrain');
    await expect(page.locator('.splash-tagline')).toHaveText(
      'How you do anything is how your AI does everything.',
    );
    // Nothing fades either — a fade the person cannot see is 320ms of an
    // invisible overlay between them and their panel.
    const transition = await page.$eval('.splash', (el) => getComputedStyle(el).transitionDuration);
    expect(['0s', '0s, 0s']).toContain(transition);

    await context.close();
  });

  test('still dismissable, instantly — no fade and not one frame', async () => {
    const { context, page } = await launchPanel({ reduce: true });
    await page.waitForSelector('.splash');
    // VB-73: Enter used to be the proof here, because any key skipped it.
    // Escape is the keyboard exit now; under reduced motion the handover is
    // immediate, with no 320ms of invisible overlay and no frame loop.
    await page.keyboard.press('Escape');
    await expect(page.locator('.splash')).toHaveCount(0, { timeout: 1500 });
    expect(await frameCount(page)).toBe(0);
    await context.close();
  });

  test('without the preference the loop really is running — the control', async () => {
    const { context, page } = await launchPanel();
    await page.waitForSelector('.splash .brand-mark');
    await waitForFrames(page, 20);
    expect(await frameCount(page)).toBeGreaterThan(10);
    await context.close();
  });
});
