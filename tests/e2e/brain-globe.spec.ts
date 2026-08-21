import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * V1.2 VB-14a — the Brain globe, driven in a real browser.
 *
 * The unit tests prove the geometry and the component's own wiring. They
 * cannot prove any of the things this feature actually lives or dies by,
 * because jsdom has no layout, no compositor and no pointer: that a drag
 * really turns it, that it coasts and settles, that labels disappear while it
 * moves and come back when it stops, that the fly-in takes the time it is
 * supposed to and the children arrive one after another, and — the one that
 * matters most — that a reduced-motion visitor gets a globe that changes state
 * instantly with no frame loop running behind it at all.
 *
 * Scans tests/e2e/fixtures/brain-globe.tsx, served by vite.harness.config.ts.
 * Its own page rather than a section of harness.html: a stage that claims
 * `touch-action` and pointer capture has no business sitting in the middle of
 * the R1-03 component gallery several other specs scan.
 *
 * The viewport is the panel's own 400px throughout — a globe that only works
 * at desktop width would be no use to this product.
 */

const PANEL = { width: 400, height: 700 };

/** Counts every frame anyone asks for, before the app loads. The
 * reduced-motion bar is zero, and "zero" cannot be observed after the fact. */
async function countFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __wbFrames: number };
    w.__wbFrames = 0;
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      w.__wbFrames += 1;
      return original(callback);
    };
  });
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __wbFrames: number }).__wbFrames);

async function open(page: Page): Promise<void> {
  await page.setViewportSize(PANEL);
  await page.goto('/brain-globe.html');
  await page.waitForSelector('.brainglobe');
}

/**
 * The pose, read off the picture: each vertex's depth, keyed by vertex.
 *
 * Keyed, not in paint order. Paint order sorts by depth, so the k-th entry is
 * "the k-th furthest node" — a profile an icosahedron very nearly preserves
 * however it is turned, which makes a positional comparison pass on a globe
 * that never moved. Found the hard way.
 */
async function depths(page: Page): Promise<Record<string, number>> {
  return page.locator('.brainglobe-node').evaluateAll((nodes) =>
    Object.fromEntries(nodes.map((node) => [node.getAttribute('data-node-index')!, Number(node.getAttribute('data-depth'))])),
  );
}

const depthValues = (map: Record<string, number>) => Object.values(map);

async function dragBy(page: Page, dx: number, dy: number, steps = 12): Promise<void> {
  const box = (await page.locator('.brainglobe').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
  await page.mouse.up();
}

test.describe('VB-14 — drag to rotate, with momentum and settle', () => {
  test('a drag turns the real geometry, not a flat card', async ({ page }) => {
    await open(page);
    const before = await depths(page);

    await dragBy(page, 90, -20);
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving')).toBe('false');
    const after = await depths(page);

    // Every node's depth is re-derived: a CSS transform on a flat drawing
    // would leave every vertex at exactly the depth it started at.
    expect(after).not.toEqual(before);
    const moved = Object.keys(before).filter((key) => Math.abs(after[key]! - before[key]!) > 0.15);
    expect(moved.length, 'no vertex changed depth — the drawing turned, the geometry did not').toBeGreaterThan(3);
    // ...and it is still a solid: the spread from back to front survives.
    expect(Math.max(...depthValues(after)) - Math.min(...depthValues(after))).toBeGreaterThan(0.5);
  });

  test('it coasts after the pointer lets go, then settles by itself', async ({ page }) => {
    await open(page);

    const box = (await page.locator('.brainglobe').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 12, cy);
    await page.mouse.up();

    // Momentum: the pose keeps changing after the pointer is gone.
    const atRelease = await depths(page);
    await page.waitForTimeout(120);
    const coasting = await depths(page);
    expect(coasting).not.toEqual(atRelease);

    // Settle: it stops on its own, and stays stopped.
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
    const settled = await depths(page);
    await page.waitForTimeout(250);
    expect(await depths(page)).toEqual(settled);
  });

  test('it cannot tumble past a pole however hard it is dragged upwards', async ({ page }) => {
    await open(page);
    // Far more vertical travel than ±1.2 radians of tilt could absorb.
    await dragBy(page, 0, -900, 40);
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving')).toBe('false');

    const clamped = await depths(page);

    // The clamp, proven the only way that cannot be argued with: dragging
    // another 900px in the same direction moves nothing at all. A globe with
    // no clamp would keep going and roll over its own pole.
    await dragBy(page, 0, -900, 40);
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
    expect(await depths(page)).toEqual(clamped);

    // And nothing has gone off the rails: still a solid, still twelve nodes.
    expect(Object.keys(clamped)).toHaveLength(12);
    expect(Math.max(...depthValues(clamped)) - Math.min(...depthValues(clamped))).toBeGreaterThan(0.5);
  });

  test('no frame loop runs when nobody is touching it', async ({ page }) => {
    // VB-14's open item 3: a per-frame loop would be the only continuously
    // running thing in this product. There is no idle drift, so an untouched
    // globe must be costing exactly nothing.
    await countFrames(page);
    await open(page);
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving')).toBe('false');
    const idle = await frames(page);
    await page.waitForTimeout(600);
    expect(await frames(page)).toBe(idle);
  });
});

test.describe('VB-14 — labels hide while moving, fade in when settled', () => {
  test('a moving globe shows no label, and a settled one shows them again', async ({ page }) => {
    await open(page);
    const label = page.locator('.brainglobe-pin[data-label-hidden="false"] .brainglobe-label').first();
    const opacity = () => label.evaluate((el) => Number(getComputedStyle(el).opacity));

    await expect.poll(opacity).toBeGreaterThan(0.6);

    const box = (await page.locator('.brainglobe').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);

    // Mid-drag: real computed opacity, not merely a class that toggled.
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving')).toBe('true');
    await expect
      .poll(() => page.locator('.brainglobe-label').evaluateAll((els) => Math.max(...els.map((el) => Number(getComputedStyle(el).opacity)))))
      .toBeLessThan(0.05);

    await page.mouse.up();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
    await expect.poll(opacity, { timeout: 2000 }).toBeGreaterThan(0.6);
  });

  test('the fade is the 200ms default, on the one easing curve', async ({ page }) => {
    await open(page);
    const style = await page.locator('.brainglobe-label').first().evaluate((el) => {
      const computed = getComputedStyle(el);
      return { duration: computed.transitionDuration, timing: computed.transitionTimingFunction };
    });
    expect(style.duration).toBe('0.2s');
    expect(style.timing.replace(/\s/g, '')).toBe('cubic-bezier(0.2,0,0,1)');
  });

  test('a far label reads as further away and still clears the contrast floor', async ({ page }) => {
    await open(page);
    const shown = await page
      .locator('.brainglobe-pin[data-label-hidden="false"]')
      .evaluateAll((pins) =>
        pins.map((pinEl) => {
          const label = pinEl.querySelector('.brainglobe-label') as HTMLElement;
          const computed = getComputedStyle(label);
          return {
            depth: Number(pinEl.getAttribute('data-depth')),
            size: Number.parseFloat(computed.fontSize),
            weight: Number(computed.fontWeight),
            opacity: Number(computed.opacity),
          };
        }),
      );
    expect(shown.length).toBeGreaterThan(1);
    const sorted = [...shown].sort((a, b) => a.depth - b.depth);
    const near = sorted[sorted.length - 1]!;
    const far = sorted[0]!;
    expect(near.size).toBeGreaterThan(far.size);
    expect(near.weight).toBeGreaterThanOrEqual(far.weight);
    expect(near.opacity).toBeGreaterThan(far.opacity);
    // 0.62 against --globe-field measures 8.8:1. Dimmer must never mean under 4.5:1.
    for (const value of shown) expect(value.opacity).toBeGreaterThanOrEqual(0.61);
    // And never so small it stops being text.
    for (const value of shown) expect(value.size).toBeGreaterThanOrEqual(11);
  });

  test('no label ever runs off the edge of the stage', async ({ page }) => {
    await open(page);
    const stage = (await page.locator('.brainglobe').boundingBox())!;
    const labels = page.locator('.brainglobe-pin[data-label-hidden="false"] .brainglobe-label');
    const count = await labels.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = (await labels.nth(i).boundingBox())!;
      expect(box.x, `label #${i} starts off the left edge`).toBeGreaterThanOrEqual(stage.x - 1);
      expect(box.x + box.width, `label #${i} runs off the right edge`).toBeLessThanOrEqual(stage.x + stage.width + 1);
    }
  });
});

test.describe('VB-14 — click a node to fly in', () => {
  test('the camera pushes in over 620ms and the section lands dead centre', async ({ page }) => {
    await open(page);
    // Reached from the keyboard, which turns the globe to face it first —
    // a node on the far side is behind the ones in front of it, by design.
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');

    const started = Date.now();
    await page.keyboard.press('Enter');
    // Sampled mid-flight: the zoom is a real animation with intermediate
    // values, not a state that flips.
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-zoom')).not.toBe('0.000');
    const midway = Number(await page.locator('.brainglobe').getAttribute('data-zoom'));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1);

    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-zoom'), { timeout: 3000 }).toBe('1.000');
    const took = Date.now() - started;
    // 620ms plus the 56ms stagger tail, with room for a slow CI box. The
    // point of the assertion is that it is nowhere near the rejected 320ms.
    expect(took).toBeGreaterThan(450);
    expect(took).toBeLessThan(2500);

    await expect(page.locator('[data-testid="selected"]')).toHaveText('sec2');

    // Dead centre: the section flown into is the middle of the stage.
    const stage = (await page.locator('.brainglobe').boundingBox())!;
    const hit = (await page.locator('.brainglobe-pin[data-section-id="sec2"] .brainglobe-hit').boundingBox())!;
    expect(Math.abs(hit.x + hit.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(6);
    expect(Math.abs(hit.y + hit.height / 2 - (stage.y + stage.height / 2))).toBeLessThan(6);
  });

  test('the five children arrive one after another, and every one of them arrives', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');

    // Sample every frame, in the page, so no round trip can miss the stagger.
    await page.evaluate(() => {
      const w = window as unknown as { __wbStagger: boolean };
      w.__wbStagger = false;
      const tick = () => {
        const nodes = [...document.querySelectorAll('.brainglobe-child-node')];
        const opacities = nodes.map((node) => Number(node.getAttribute('opacity')));
        if (opacities.length >= 2 && opacities[0]! < 1 && opacities[0]! > opacities[opacities.length - 1]!) {
          w.__wbStagger = true;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.keyboard.press('Enter');
    await expect(page.locator('.brainglobe-child-node')).toHaveCount(5);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __wbStagger: boolean }).__wbStagger), { timeout: 3000 })
      .toBe(true);

    // They all get there. The fifth only does because the stagger clock is
    // allowed to run to 1.09 — see ZOOM_TAIL in BrainGlobe.tsx.
    await expect
      .poll(
        () =>
          page
            .locator('.brainglobe-child-node')
            .evaluateAll((nodes) => Math.min(...nodes.map((node) => Number(node.getAttribute('opacity'))))),
        { timeout: 3000 },
      )
      .toBeGreaterThan(0.99);

    // The real hierarchy, not an invented one: About Me's own five.
    await expect(page.locator('.brainglobe-pin.is-child')).toHaveCount(5);
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"] .brainglobe-label')).toHaveText('2.1 Roles');
  });

  test('Escape brings it back out, and the whole file is there again', async ({ page }) => {
    await open(page);
    await page.locator('.brainglobe-pin[data-section-id="sec1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-inside'), { timeout: 3000 }).toBe('true');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-inside'), { timeout: 3000 }).toBe('false');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-zoom'), { timeout: 3000 }).toBe('0.000');
    await expect(page.locator('[data-testid="selected"]')).toHaveText('none');
    await expect(page.locator('.brainglobe-pin[data-section-id]:not([hidden])')).toHaveCount(10);
  });

  test('a drag that happens to end over a node does not open it', async ({ page }) => {
    await open(page);
    const box = (await page.locator('.brainglobe-pin[data-section-id="sec1"]').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width / 2 - 60 + i * 6, box.y + box.height / 2);
    await page.mouse.up();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
    await expect(page.locator('[data-testid="selected"]')).toHaveText('none');
  });
});

test.describe('VB-14 — keyboard', () => {
  test('one tab stop, then arrows walk every section and the globe turns to face each', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('.brainglobe-pin[data-section-id="sec1"]')).toBeFocused();

    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const id = await page.evaluate(() => document.activeElement?.getAttribute('data-section-id') ?? '');
      seen.push(id);
      await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
      // Faced means faced: the focused node is dead front, depth 1.
      const depth = await page.evaluate(() => document.activeElement?.getAttribute('data-depth') ?? '');
      if (i > 0) expect(Number(depth)).toBeGreaterThan(0.99);
      await page.keyboard.press('ArrowRight');
    }
    expect(new Set(seen).size).toBe(10);
  });

  test('the focused node always shows its own name, even while everything moves', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');

    // Sampled every frame, in the page: the window in which the globe is both
    // turning AND the label has finished fading up is a couple of hundred
    // milliseconds wide, and a single round-trip read lands wherever it lands.
    await page.evaluate(() => {
      const w = window as unknown as { __wbFocusLit: boolean };
      w.__wbFocusLit = false;
      const tick = () => {
        const stage = document.querySelector('.brainglobe');
        const label = document.activeElement?.querySelector('.brainglobe-label') as HTMLElement | null;
        if (stage?.getAttribute('data-moving') === 'true' && label && Number(getComputedStyle(label).opacity) > 0.9) {
          w.__wbFocusLit = true;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    // One press, not several. Each press moves focus to the next node, and a
    // label that has only had 90ms to fade up has not finished — six presses
    // in a row tests the fade, not the rule.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);

    expect(
      await page.evaluate(() => (window as unknown as { __wbFocusLit: boolean }).__wbFocusLit),
      'the node you are on went nameless while the globe turned',
    ).toBe(true);
  });

  test('Tab leaves again — the globe is not a trap', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    await expect(page.locator('.brainglobe-pin[data-section-id="sec1"]')).toBeFocused();
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('.brainglobe'));
    expect(inside).toBe(false);
  });

  test('the focus ring is really drawn, in a colour that shows on the dark stage', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const computed = getComputedStyle(el);
      return { style: computed.outlineStyle, width: computed.outlineWidth, color: computed.outlineColor };
    });
    expect(ring.style).toBe('solid');
    expect(Number.parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
    // --globe-focus, 11.55:1 on --globe-field. Never `outline: none`.
    expect(ring.color).toBe('rgb(168, 199, 255)');
  });
});

test.describe('VB-14 — reduced motion', () => {
  test('no frame is ever scheduled, for any interaction', async ({ page }) => {
    await countFrames(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);

    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await dragBy(page, 70, -30);
    await page.waitForTimeout(400);

    // Not "the loop is invisible" — the loop was never asked for.
    expect(await frames(page), 'a reduced-motion visitor must get no rAF loop at all').toBe(0);
  });

  test('state changes instantly and completely — the fly-in is simply already there', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(page.locator('.brainglobe')).toHaveAttribute('data-inside', 'true');
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-zoom', '1.000');
    await expect(page.locator('.brainglobe-child-node')).toHaveCount(5);
    const arrived = await page
      .locator('.brainglobe-child-node')
      .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('opacity'))));
    expect(Math.min(...arrived)).toBeGreaterThan(0.99);
    await expect(page.locator('[data-testid="selected"]')).toHaveText('sec2');
  });

  test('every label is visible at once, and every one of them is readable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await expect(page.locator('.brainglobe-pin[data-section-id][data-label-hidden="false"]')).toHaveCount(10);
    const opacities = await page
      .locator('.brainglobe-pin[data-section-id] .brainglobe-label')
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));
    expect(opacities).toHaveLength(10);
    expect(Math.min(...opacities)).toBeGreaterThanOrEqual(0.61);
    // Nothing is waiting on a settle that will never come.
    const transitions = await page
      .locator('.brainglobe-label')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).transitionDuration));
    expect(transitions.every((duration) => duration === '0s')).toBe(true);
  });

  test('every node is still reachable and openable from the keyboard alone', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.keyboard.press('Tab');
    for (const section of ['sec1', 'sec2', 'sec3', 'sec4', 'sec5', 'sec6', 'sec7', 'sec8', 'sec9', 'sec10']) {
      await expect(page.locator(`.brainglobe-pin[data-section-id="${section}"]`)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="selected"]')).toHaveText(section);
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-testid="selected"]')).toHaveText('none');
      await page.keyboard.press('ArrowRight');
    }
  });
});

test.describe('VB-14 — it stays inside the panel', () => {
  test('nothing about the globe makes the panel scroll sideways', async ({ page }) => {
    await open(page);
    await dragBy(page, 120, -60);
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the dark stage is contained — the page around it keeps the panel’s own light identity', async ({ page }) => {
    await open(page);
    const stage = await page.locator('.brainglobe').evaluate((el) => getComputedStyle(el).backgroundColor);
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(stage).toBe('rgb(6, 10, 22)');
    expect(body).not.toBe(stage);
  });
});
