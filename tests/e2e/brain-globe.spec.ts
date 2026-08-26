import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { channelDistance, contrastRatio, parseCssColor, relativeLuminance } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';

/**
 * V1.2 VB-14a — the Brain globe, driven in a real browser.
 *
 * The unit tests prove the geometry and the component's own wiring. They
 * cannot prove any of the things this feature actually lives or dies by,
 * because jsdom has no layout, no compositor and no pointer: that a drag
 * really turns it, that it coasts and settles, that a label stays legible
 * through the motion and travels with its own orb (V2.1 VB-77 — this line used
 * to say the opposite, and BrainGlobe.css records why it changed), that the
 * fly-in takes the time it is
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

/**
 * The harness, in one of its four models (tests/e2e/fixtures/brain-globe.tsx).
 * `half` is the default and is what every spec written before V1.5 drives.
 */
async function open(page: Page, model?: 'empty' | 'complete' | 'stale'): Promise<void> {
  await page.setViewportSize(PANEL);
  await page.goto(model ? `/brain-globe.html?model=${model}` : '/brain-globe.html');
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

test.describe('V2.1 VB-77 — labels ride their orb and do not blink', () => {
  /**
   * THIS TEST IS THE INVERSE OF THE ONE IT REPLACES, deliberately.
   *
   * VB-14's version asserted that a moving globe shows no label at all
   * (`opacity < 0.05` mid-drag) and that the names come back on settle. That
   * behaviour is gone — see BrainGlobe.css's VB-77 block for why the reason
   * behind it expired: labels are HTML pins that never receive the camera's
   * rotation, so nothing tumbles, and the globe drifts by default, so the rule
   * was hiding the names most of the time.
   *
   * What replaces it is the property Adam actually asked for: a name stays
   * legible THROUGH the motion, and it stays attached to its own orb while it
   * moves. Both halves are measured here rather than assumed, because "the
   * label is still on screen" would pass even if it were pinned to the stage
   * and its orb had slid out from under it.
   */
  test('a name stays readable through a drag, and travels with its own orb', async ({ page }) => {
    await open(page);
    const pin = page.locator('.brainglobe-pin[data-label-hidden="false"]').first();
    const label = pin.locator('.brainglobe-label');
    const opacity = () => label.evaluate((el) => Number(getComputedStyle(el).opacity));

    await expect.poll(opacity).toBeGreaterThan(0.6);
    const before = (await pin.boundingBox())!;

    const box = (await page.locator('.brainglobe').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width / 2 + i * 10, box.y + box.height / 2);

    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving')).toBe('true');

    // Mid-drag, and this is the whole point: real computed opacity, still above
    // the floor. Not "some label somewhere" — this pin's own name.
    expect(await opacity()).toBeGreaterThan(0.6);

    // And it moved, so we are not reading a name that simply never went
    // anywhere. The stage is 400px wide and the drag pushes 80px across it, so
    // a pin that shifted less than a couple of pixels is a pin that is pinned
    // to the stage rather than to its orb.
    const during = (await pin.boundingBox())!;
    expect(Math.abs(during.x - before.x) + Math.abs(during.y - before.y)).toBeGreaterThan(2);

    // The label sits on its own pin the whole way through — same box, no
    // separate coordinate system that could drift apart from it under motion.
    const labelBox = (await label.boundingBox())!;
    expect(labelBox.y).toBeGreaterThanOrEqual(during.y - 1);

    await page.mouse.up();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
    await expect.poll(opacity, { timeout: 2000 }).toBeGreaterThan(0.6);
  });

  /**
   * V2.3 VB-77 FLAG 3 — the depth cut is retired, and what replaces it is
   * stricter: every label persists, and every one is at or above the
   * contrast floor. The cut existed because a cross-fade to nothing paints
   * sub-floor frames (docs/GUARDRAILS.md; core/flow/navMelt.ts's header) —
   * a floor-CLAMP has no way down, so the 200ms transition only ever
   * interpolates between legal values. Far names sit small and
   * full-strength, which reads as distance: "the illusion of permanence".
   */
  test('every label persists, and none is ever painted faint (VB-77 FLAG 3)', async ({ page }) => {
    await open(page);
    const opacities = await page
      .locator('.brainglobe-label')
      .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));

    expect(opacities.length).toBeGreaterThan(0);
    for (const value of opacities) {
      expect(value, `a label was painted at ${value} — below the 8.8:1 floor`).toBeGreaterThanOrEqual(0.6);
    }
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
    // V1.5 VB-26: the short name on the stage, the real one in the tooltip.
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"] .brainglobe-label')).toHaveText('Roles');
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toHaveAttribute('title', '2.1 Roles');
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

  /**
   * V2.0 VB-69 EDITED THIS TEST, AND THE EDIT IS THE POINT OF VB-69.
   *
   * It used to read `.brainglobe`'s own `background-color` and expect the
   * field. The stage has no background of its own any more — the drawer it
   * sits in is that colour top edge to bottom edge (V1.9 VB-50), and a second
   * ground in the middle of it was the lighter rectangle Adam photographed.
   *
   * The claim is unchanged and is still worth making: the dark surface is
   * CONTAINED, and the page around it keeps the panel's light identity. So it
   * is measured one layer out, where the ground now is — and it gains the
   * other half of VB-69, that the stage itself paints nothing.
   */
  test('the dark stage is contained — the page around it keeps the panel’s own light identity', async ({ page }) => {
    await open(page);
    const stage = await page.locator('.brainglobe').evaluate((el) => getComputedStyle(el).backgroundColor);
    const ground = await page.getByTestId('stage').evaluate((el) => getComputedStyle(el).backgroundColor);
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // Transparent, in whichever way this browser spells it.
    expect(parseCssColor(stage)?.a ?? 0, 'the stage paints a ground of its own').toBe(0);
    expect(ground).toBe('rgb(6, 10, 22)');
    expect(body).not.toBe(ground);
  });
});

// ---------------------------------------------------------------------
// V1.4 VB-23 — the orbs, the cluster, and the split.
//
// Everything below is measured off the rendered page: real computed fills,
// real bounding boxes, real overlap arithmetic. A class that toggled would
// prove none of it (docs/TESTING.md).
// ---------------------------------------------------------------------

/** Fly into About Me. Reached from the keyboard, because at rest it is behind
 * the section in front of it. */
async function flyIntoAboutMe(page: Page): Promise<void> {
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.locator('.brainglobe').getAttribute('data-zoom'), { timeout: 3000 }).toBe('1.000');
  await expect(page.locator('.brainglobe-child-node')).toHaveCount(5);
}

const centreX = (box: { x: number; width: number }) => box.x + box.width / 2;

test.describe('VB-23 — an answered node is a solid orb', () => {
  /**
   * V1.9 VB-54 EDITED THIS TEST, AND THE EDIT IS THE POINT OF VB-54.
   *
   * It used to end "…and no highlight anywhere in the picture", counting six
   * radial gradients: the field and the five blooms. That count was standing in
   * for the real claim, which was never "no gradients" — it was **no gradient
   * bound to an orb's own box**, because that is what made every orb wear an
   * identical highlight and read as a sticker.
   *
   * VB-54 adds gradients back and does not bring the problem back with them:
   * they are CENTRED and SHARED, and what varies per orb is where the circle
   * carrying one is placed under a single fixed light. So the assertion is
   * split in two — the sphere's own fill is still a flat token colour, and the
   * light's paint is scene-level rather than per-orb — and the second half is
   * proved by the two orbs' highlights being in different places, which the old
   * treatment could never have produced.
   */
  test('is one flat token fill — no gradient is bound to a sphere', async ({ page }) => {
    await open(page);
    const fills = await page
      .locator('.brainglobe-node:not([data-node-state="untouched"]) .brainglobe-sphere')
      .evaluateAll((orbs) => orbs.map((orb) => getComputedStyle(orb).fill));
    expect(fills.length).toBeGreaterThan(3);
    for (const fill of fills) {
      // A real rgb(), not `url(#…)`: the three-stop radial is gone.
      expect(fill).toMatch(/^rgb\(/);
    }
    // Five blooms, five limbs, five terminators, one specular. One specular
    // for twelve orbs is what "one light" costs.
    //
    // Sixteen and not seventeen since V2.0 VB-69: the seventeenth was the
    // STAGE's own radial, and it is the one gradient here that was not part of
    // an orb — it painted the box the orbs stand in, which is the lighter
    // rectangle VB-69 removes. Every gradient left belongs to a sphere.
    expect(await page.locator('radialGradient').count()).toBe(16);
    // And every one of them is CENTRED — `cx="50%"`, the orb's own middle. The
    // gradient VB-23 deleted was at `cx="34%"`, off-centre in each orb's own
    // box, which is the arrangement that made twelve orbs wear one highlight.
    const anchors = await page
      .locator('radialGradient')
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('cx')))]);
    expect(anchors).toEqual(['50%']);
    expect(await page.locator('.brainglobe-spec').count()).toBe(12);
    const specFills = await page
      .locator('.brainglobe-spec')
      .evaluateAll((els) => new Set(els.map((el) => el.getAttribute('fill'))).size);
    expect(specFills, 'the light is one paint, not one per orb').toBe(1);
  });

  test('solid does not mean flat — a far orb is smaller, dimmer and sunk toward its own deep colour', async ({ page }) => {
    await open(page);
    const measured = await page
      .locator('.brainglobe-node:not([data-node-state="untouched"])')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          depth: Number(node.getAttribute('data-depth')),
          // The rendered radius, in real pixels off the real layout.
          size: node.querySelector('.brainglobe-sphere')!.getBoundingClientRect().width,
          opacity: Number(node.getAttribute('opacity')),
          shade: Number(node.querySelector('.brainglobe-shade')!.getAttribute('opacity')),
        })),
      );
    const sorted = measured.sort((a, b) => a.depth - b.depth);
    const back = sorted[0]!;
    const front = sorted[sorted.length - 1]!;

    expect(front.size).toBeGreaterThan(back.size * 1.3);
    expect(front.opacity).toBeGreaterThan(back.opacity);
    expect(back.shade).toBeGreaterThan(front.shade);
    // ...and the shade never takes an orb over: it is a veil, not a repaint.
    expect(back.shade).toBeLessThan(0.45);
  });
});

test.describe('VB-23 — inside a section: size, no halo, and joints', () => {
  test('the centre orb is more than twice the sub-nodes, measured in real pixels', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    const centre = (await page.locator('.brainglobe-node[data-section-id="sec2"] .brainglobe-sphere').boundingBox())!;
    const children = await page
      .locator('.brainglobe-child-node .brainglobe-sphere')
      .evaluateAll((orbs) => orbs.map((orb) => orb.getBoundingClientRect().width));
    expect(children).toHaveLength(5);
    for (const child of children) expect(centre.width / child).toBeGreaterThan(2);
    // Every sub-node is the same size as every other: they are siblings.
    expect(Math.max(...children) - Math.min(...children)).toBeLessThan(1);
  });

  test('the halo is gone from the centre orb once the camera has arrived', async ({ page }) => {
    await open(page);
    // sec4 is the section being written now in the harness, and it wears the
    // only halo on the stage.
    await expect(page.locator('.brainglobe-halo')).toHaveCount(1);
    const at = () => page.locator('.brainglobe-halo').evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(await at()).toBeGreaterThan(0.9);

    // Reached from the keyboard: a pointer click on a node behind the ones in
    // front of it lands on whichever pin is topmost at those coordinates, and
    // this test is about a specific section.
    await page.keyboard.press('Tab');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
    }
    await expect(page.locator('.brainglobe-pin[data-section-id="sec4"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-zoom'), { timeout: 3000 }).toBe('1.000');
    expect(await at(), 'the centre orb kept its halo — hierarchy is size, not glow').toBeLessThan(0.02);

    // And it comes back on the way out, where it is the only mark of the
    // section being written now among ten equal siblings.
    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-zoom'), { timeout: 3000 }).toBe('0.000');
    expect(await at()).toBeGreaterThan(0.9);
  });

  test('a faint line joins the centre orb to every sub-node, rim to rim', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    const links = page.locator('.brainglobe-link');
    await expect(links).toHaveCount(5);

    const centre = (await page.locator('.brainglobe-node[data-section-id="sec2"] .brainglobe-sphere').boundingBox())!;
    for (let i = 0; i < 5; i++) {
      const link = links.nth(i);
      const opacity = await link.evaluate((el) => Number(getComputedStyle(el).strokeOpacity));
      // Faint: never competing with the orbs it joins. The near edges of the
      // solid itself run up to 0.78.
      expect(opacity).toBeGreaterThan(0.05);
      expect(opacity).toBeLessThanOrEqual(0.4);

      const id = await link.getAttribute('data-link-id');
      const orb = (await page.locator(`.brainglobe-child-node[data-child-id="${id}"] .brainglobe-sphere`).boundingBox())!;
      const line = (await link.boundingBox())!;
      // The line lives entirely in the gap: it starts outside the centre orb
      // and stops outside its sub-node, so nothing is drawn across an orb.
      const span = Math.hypot(centreX(orb) - centreX(centre), orb.y + orb.height / 2 - (centre.y + centre.height / 2));
      const gap = span - centre.width / 2 - orb.width / 2;
      const drawn = Math.hypot(line.width, line.height);
      expect(drawn).toBeLessThanOrEqual(gap + 2);
      expect(drawn).toBeGreaterThan(gap - 4);
    }
  });
});

test.describe('VB-23 — clicking a sub-node splits the stage', () => {
  test('the orb features where it always did, and its text opens under it', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    const before = (await page.locator('.brainglobe-child-node[data-child-id="sec2-1"] .brainglobe-sphere').boundingBox())!;
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    const stage = (await page.locator('.brainglobe').boundingBox())!;
    const orb = (await page.locator('.brainglobe-child-node[data-picked="true"] .brainglobe-sphere').boundingBox())!;
    const panel = (await page.locator('.brainglobe-detail').boundingBox())!;

    // The orb travelled, and grew into a feature. V1.6 VB-31 moved the text
    // and left this exactly as it was — the node is where it has been since
    // V1.4, left of centre and on the vertical middle.
    expect(centreX(orb)).toBeLessThan(stage.x + stage.width * 0.4);
    expect(orb.width).toBeGreaterThan(before.width * 2);
    // The text: below the orb, entirely inside the stage, and clear of it.
    expect(panel.y).toBeGreaterThanOrEqual(orb.y + orb.height);
    expect(panel.x).toBeGreaterThanOrEqual(stage.x - 1);
    expect(panel.x + panel.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(panel.y + panel.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
    // (Until V2.1 VB-74 this also checked the panel cleared the corner back
    // control. The way out lives above the stage now, so there is nothing on
    // the picture for the panel to hide behind.)
    // And the whole cluster it came out of has gone.
    const others = await page
      .locator('.brainglobe-child-node[data-picked="false"]')
      .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('opacity'))));
    expect(Math.max(...others)).toBeLessThan(0.02);
  });

  test('the text carries the sub-node’s name and every one of its details', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    await expect(page.locator('.brainglobe-detail-name')).toHaveText('2.1 Roles');
    // The real stress case: three roles, thirteen cells, three headings.
    await expect(page.locator('.brainglobe-detail-cell')).toHaveCount(13);
    await expect(page.locator('.brainglobe-detail-record')).toHaveCount(3);
    await expect(page.locator('.brainglobe-detail-record').first()).toHaveText('Manager / Team Lead');

    // V1.6 VB-31: ONE COLUMN, in DOM order. The two-up grid went with the
    // bordered panel — free text centred under a node has one measure, and
    // reading order and visual order are the same thing again. No two cells
    // ever share a row, and each one takes the whole measure.
    const boxes = await page
      .locator('.brainglobe-detail-cell')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width })));
    const paired = boxes.filter((a, i) => boxes.some((b, j) => i !== j && Math.abs(a.y - b.y) < 2 && Math.abs(a.x - b.x) > 2));
    expect(paired.length, 'two cells sat side by side — this is a column, not a grid').toBe(0);

    // Nothing runs outside the block it is in, and every cell is the measure.
    const panel = (await page.locator('.brainglobe-detail').boundingBox())!;
    for (const cell of boxes) {
      expect(cell.x).toBeGreaterThanOrEqual(panel.x - 1);
      expect(cell.x + cell.w).toBeLessThanOrEqual(panel.x + panel.width + 1);
      expect(cell.w).toBeCloseTo(panel.width, 0);
    }
  });

  test('the text scrolls, and everything in it is reachable', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    const scroll = await page.locator('.brainglobe-detail').evaluate((el) => ({
      scrollable: el.scrollHeight > el.clientHeight,
      focusable: el.getAttribute('tabindex') === '0',
    }));
    // Thirteen cells is taller than any band this stage can offer, so this must
    // be a real scroller AND a real tab stop — a scrolling box a keyboard
    // cannot reach is a box whose bottom half does not exist.
    expect(scroll.scrollable).toBe(true);
    expect(scroll.focusable).toBe(true);

    const bottom = await page.locator('.brainglobe-detail').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(bottom).toBeGreaterThan(0);
    await expect(page.locator('.brainglobe-detail-value').last()).toBeInViewport();
  });

  test('the fade at the foot is drawn only when there is more below it', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    const block = page.locator('.brainglobe-detail');

    // `2.1 Roles`: thirteen answers, more than any band holds.
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    await expect(block).toHaveAttribute('data-scrolls', 'true');
    expect(await block.evaluate((el) => getComputedStyle(el).maskImage)).toContain('gradient');

    // `2.5 Expertise`: one answer and one question, which fits. A fade over a
    // block with nothing below it is a line greyed out for no reason — the
    // flag is measured off the real element, not guessed from the content.
    await page.keyboard.press('Escape');
    await page.locator('.brainglobe-pin[data-child-id="sec2-5"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    await expect(block).toHaveAttribute('data-scrolls', 'false');
    expect(await block.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    expect(await block.evaluate((el) => getComputedStyle(el).maskImage)).toBe('none');
  });

  test('it still navigates — the split is on top of click-to-navigate, not instead of it', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await expect(page.locator('[data-testid="selected"]')).toHaveText('sec2');
    await page.locator('.brainglobe-pin[data-child-id="sec2-3"]').click();
    // The sub-node is reported to the caller exactly as it was before VB-23.
    await expect(page.locator('[data-testid="selected"]')).toHaveText('sec2-3');
  });

  test('nothing about the split makes the panel scroll sideways', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('VB-23 — the split by keyboard', () => {
  test('a sub-node is reachable and openable with no pointer at all, and does not trap focus', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    // Tab from the section you are inside onto its first sub-node.
    await page.keyboard.press('Tab');
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
    await expect(page.locator('.brainglobe-detail')).toBeVisible();
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toHaveAttribute('aria-pressed', 'true');

    // Forward: the panel itself, then out of the globe entirely. No trap.
    await page.keyboard.press('Tab');
    await expect(page.locator('.brainglobe-detail')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('.brainglobe'))).toBe(false);
  });

  test('Escape closes the split first, and the section only on the second press', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('0.000');
    await expect(page.locator('.brainglobe-detail')).toHaveCount(0);
    // Still inside the section, with the whole cluster back.
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-inside', 'true');
    await expect(page.locator('.brainglobe-pin.is-child:not([hidden])')).toHaveCount(5);
    // Focus went back to the sub-node it closed, not to nowhere.
    await expect(page.locator('.brainglobe-pin[data-child-id="sec2-1"]')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-inside'), { timeout: 3000 }).toBe('false');
  });

  test('the featured orb is a control the whole way across, not a 44px square in the middle of it', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    const orb = (await page.locator('.brainglobe-child-node[data-picked="true"] .brainglobe-sphere').boundingBox())!;
    const hit = (await page.locator('.brainglobe-pin[data-child-id="sec2-1"] .brainglobe-hit').boundingBox())!;
    expect(hit.width).toBeGreaterThanOrEqual(44);
    expect(hit.width).toBeGreaterThanOrEqual(orb.width - 1);
    expect(Math.abs(centreX(hit) - centreX(orb))).toBeLessThan(2);

    // And pressing it again closes the split.
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('0.000');
  });
});

test.describe('VB-23 — the split under reduced motion', () => {
  test('is already there: no frame, no travel, everything present', async ({ page }) => {
    await countFrames(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);

    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();

    await expect(page.locator('.brainglobe')).toHaveAttribute('data-split', '1.000');
    await expect(page.locator('.brainglobe-detail-cell')).toHaveCount(13);
    // Arrived, not travelling.
    const stage = (await page.locator('.brainglobe').boundingBox())!;
    const orb = (await page.locator('.brainglobe-child-node[data-picked="true"] .brainglobe-sphere').boundingBox())!;
    expect(centreX(orb)).toBeLessThan(stage.x + stage.width * 0.4);

    await page.keyboard.press('Escape');
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-split', '0.000');

    expect(await frames(page), 'a reduced-motion visitor must get no rAF loop at all').toBe(0);
  });

  test('the panel is fully drawn, not waiting on a fade that will never come', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();

    const panel = page.locator('.brainglobe-detail');
    expect(await panel.evaluate((el) => Number(getComputedStyle(el).opacity))).toBe(1);
    expect(await panel.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  });
});

// ---------------------------------------------------------------------
// V1.5 VB-24 / VB-25 / VB-26 — the illumination model.
//
// EVERYTHING HERE IS MEASURED OFF THE PAINTED PAGE. The rules themselves are
// pure functions with their own unit tests (src/core/globe/illumination.ts,
// src/core/flow/globeLabels.ts); what a browser is needed for is whether the
// picture that comes out of them is legible — real computed styles, real
// screenshot pixels, and the greyscale pass that proves state is never carried
// by colour alone.
// ---------------------------------------------------------------------

/**
 * A painted pixel, decoded back inside the page onto a canvas.
 *
 * The same technique tests/e2e/dock-surface.spec.ts uses, and for the same
 * reason: it is the only way to read what was actually painted without a
 * decoding dependency, and this repo ships two runtime dependencies and no
 * more (docs/DEPENDENCIES.md). The device pixel ratio is 1 here, so a CSS
 * pixel is a screenshot pixel.
 */
async function paintedAt(page: Page, points: readonly { x: number; y: number }[]): Promise<Rgb[]> {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ shot, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${shot}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return points.map((point) => {
        const data = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
        return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! / 255 };
      });
    },
    { shot, points: points.map((point) => ({ x: point.x, y: point.y })) },
  );
}

/**
 * One token's value, resolved by the browser rather than restated here — a
 * probe element painted with it and read back. Keeps this spec measuring the
 * product's own colours instead of a copy of them (and no hex may appear
 * outside the generated tokens.css anyway).
 */
async function tokenValue(page: Page, property: string): Promise<Rgb> {
  const raw = await page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${name})`;
    document.body.append(probe);
    const read = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return read;
  }, property);
  const parsed = parseCssColor(raw);
  expect(parsed, `could not read ${property} (${raw})`).not.toBeNull();
  return parsed!;
}

/**
 * Every SECTION node, with what it is drawn as and where its orb is. The two
 * structural vertices are excluded — they carry no section and are muted
 * always, so counting them as "unanswered" would flatter every measurement
 * below (`[data-section-id]` alone matches them: theirs is empty, not absent).
 */
async function orbs(page: Page) {
  return page.locator('.brainglobe-node[data-node-state]:not([data-node-state="structural"])').evaluateAll((nodes) =>
    nodes.map((node) => {
      const sphere = node.querySelector('.brainglobe-sphere')!;
      const box = sphere.getBoundingClientRect();
      return {
        id: node.getAttribute('data-section-id')!,
        state: node.getAttribute('data-node-state')!,
        depth: Number(node.getAttribute('data-depth')),
        lit: node.querySelector('.brainglobe-orb')!.getAttribute('data-lit')!,
        fill: getComputedStyle(sphere).fill,
        radius: box.width / 2,
        bloom: node.querySelector('.brainglobe-bloom') !== null,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
    }),
  );
}

test.describe('VB-24 — solid orbs, muted and vibrant', () => {
  test('there is no hollow ring anywhere, at any state of the file', async ({ page }) => {
    for (const model of [undefined, 'empty', 'complete'] as const) {
      await open(page, model);
      await expect(page.locator('.brainglobe-hollow-ring')).toHaveCount(0);
      await expect(page.locator('.brainglobe-hollow-dot')).toHaveCount(0);
      // Twelve nodes, twelve orbs — the two structural ones included.
      await expect(page.locator('.brainglobe-node .brainglobe-sphere')).toHaveCount(12);
    }
  });

  test('an unanswered node is an object: solid fill, real radius, still legible at the back', async ({ page }) => {
    await open(page);
    const field = await tokenValue(page, '--globe-field');
    const drawn = await orbs(page);
    const muted = drawn.filter((orb) => orb.state === 'untouched');
    expect(muted.length).toBeGreaterThan(2);

    for (const orb of muted) {
      expect(orb.lit).toBe('muted');
      // A real colour, not `none` and not a `url(#…)`.
      expect(orb.fill, `${orb.id} has no solid fill`).toMatch(/^rgb\(/);
      expect(orb.radius, `${orb.id} is too small to be an orb`).toBeGreaterThan(2);
      expect(orb.bloom, `${orb.id} should not be blooming`).toBe(false);
    }

    // ...and what was PAINTED, at the very back of the solid, is still an
    // object against the field rather than the field itself. VB-24: "a muted
    // orb must not sink into the field colour."
    const back = [...muted].sort((a, b) => a.depth - b.depth)[0]!;
    const [pixel] = await paintedAt(page, [{ x: back.x, y: back.y }]);
    expect(
      contrastRatio(pixel!, field),
      `the furthest muted orb measures ${contrastRatio(pixel!, field).toFixed(2)}:1 on the field`,
    ).toBeGreaterThan(1.6);
  });

  test('an answered node is more lit than an unanswered one, measured in real pixels', async ({ page }) => {
    await open(page);
    const drawn = await orbs(page);
    const lit = drawn.filter((orb) => orb.state !== 'untouched');
    const muted = drawn.filter((orb) => orb.state === 'untouched');

    // Compared at comparable depth, so the answer is about state and not about
    // which way the globe happens to be turned.
    const brightest = [...lit].sort((a, b) => b.depth - a.depth)[0]!;
    const nearestMuted = [...muted].sort(
      (a, b) => Math.abs(b.depth - brightest.depth) - Math.abs(a.depth - brightest.depth),
    )[muted.length - 1]!;

    const [litPixel, mutedPixel] = await paintedAt(page, [
      { x: brightest.x, y: brightest.y },
      { x: nearestMuted.x, y: nearestMuted.y },
    ]);
    expect(relativeLuminance(litPixel!)).toBeGreaterThan(relativeLuminance(mutedPixel!) * 1.6);
    // The bloom and the radius are the two cues that are not brightness.
    expect(brightest.bloom).toBe(true);
    expect(nearestMuted.bloom).toBe(false);
    expect(nearestMuted.radius).toBeLessThan(brightest.radius);
  });

  test('and the difference survives greyscale — nothing here is carried by colour', async ({ page }) => {
    await open(page);
    // Every colour in the picture, collapsed to its luminance. If active and
    // inactive were only a hue apart, this is where it would show.
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
    const drawn = await orbs(page);
    const near = [...drawn].sort((a, b) => b.depth - a.depth);
    const lit = near.find((orb) => orb.state !== 'untouched')!;
    const muted = near.find((orb) => orb.state === 'untouched')!;

    const [litPixel, mutedPixel] = await paintedAt(page, [
      { x: lit.x, y: lit.y },
      { x: muted.x, y: muted.y },
    ]);
    expect(
      relativeLuminance(litPixel!) / relativeLuminance(mutedPixel!),
      'in greyscale an answered orb must still be plainly brighter than an unanswered one',
    ).toBeGreaterThan(1.5);
  });
});

/** Every edge, with the brightness core gave it and the opacity it drew. */
async function edgeLights(page: Page) {
  return page.locator('[data-edge]').evaluateAll((edges) =>
    edges.map((edge) => ({
      light: edge.getAttribute('data-edge-light')!,
      lit: Number(edge.querySelector('.brainglobe-edge-near')!.getAttribute('stroke-opacity')),
      base: Number(edge.querySelector('.brainglobe-edge-far')!.getAttribute('stroke-opacity')),
      stroke: getComputedStyle(edge.querySelector('.brainglobe-edge-near')!).stroke,
    })),
  );
}

test.describe('VB-25 — edges brighten from both ends', () => {
  test('an empty file is all structure and no light; a finished one is all light', async ({ page }) => {
    await open(page, 'empty');
    const empty = await edgeLights(page);
    expect(empty).toHaveLength(30);
    expect(new Set(empty.map((edge) => edge.light))).toEqual(new Set(['dim']));
    // Dim, never absent: the model is a real object from question one.
    for (const edge of empty) expect(edge.base).toBeGreaterThan(0.1);

    await open(page, 'complete');
    const full = await edgeLights(page);
    expect(new Set(full.map((edge) => edge.light))).toEqual(new Set(['bright']));
  });

  test('half-answered draws all three at once, and brighter really is brighter', async ({ page }) => {
    await open(page);
    const drawn = await edgeLights(page);
    expect(new Set(drawn.map((edge) => edge.light))).toEqual(new Set(['bright', 'mid', 'dim']));

    const best = (light: string) => Math.max(...drawn.filter((edge) => edge.light === light).map((edge) => edge.lit));
    expect(best('bright')).toBeGreaterThan(best('mid'));
    expect(best('mid')).toBeGreaterThan(best('dim'));
    expect(best('dim')).toBeGreaterThan(0);

    // The struts do not brighten with the light — they are the model, not the
    // progress. Every edge's base is drawn from depth alone.
    const bases = drawn.map((edge) => edge.base);
    for (const light of ['bright', 'mid', 'dim']) {
      const group = drawn.filter((edge) => edge.light === light).map((edge) => edge.base);
      expect(Math.max(...group)).toBeLessThanOrEqual(Math.max(...bases));
      expect(Math.min(...group)).toBeGreaterThanOrEqual(Math.min(...bases));
    }
  });
});

test.describe('VB-25 — one unified glow, and what breaks it', () => {
  test('a complete, fresh file resolves to ONE colour — every orb, every edge', async ({ page }) => {
    await open(page, 'complete');
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-unified', 'true');

    const unified = await tokenValue(page, '--globe-unified');
    const drawn = await orbs(page);
    expect(drawn).toHaveLength(10);
    for (const orb of drawn) {
      const painted = parseCssColor(orb.fill)!;
      expect(channelDistance(painted, unified), `${orb.id} is not the unified colour`).toBeLessThanOrEqual(1);
    }
    for (const edge of await edgeLights(page)) {
      expect(channelDistance(parseCssColor(edge.stroke)!, unified)).toBeLessThanOrEqual(1);
    }
  });

  test('one stale section breaks it, and the model goes back to being a network', async ({ page }) => {
    await open(page, 'stale');
    // Every section is still answered — the edges are all bright — but one is
    // past its own half-life, so the file is not current and does not glow.
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-unified', 'false');
    expect(new Set((await edgeLights(page)).map((edge) => edge.light))).toEqual(new Set(['bright']));

    const unified = await tokenValue(page, '--globe-unified');
    const colours = new Set((await orbs(page)).map((orb) => orb.fill));
    expect(colours.size, 'a broken glow is many colours again').toBeGreaterThan(1);
    for (const fill of colours) expect(channelDistance(parseCssColor(fill)!, unified)).toBeGreaterThan(8);
  });

  test('is a state, not a celebration: nothing animates into it and nothing is announced', async ({ page }) => {
    await open(page, 'complete');
    // No keyframes anywhere in the picture — the only transitions on the stage
    // are the 120ms colour change and the label's own settle.
    const animations = await page.locator('.brainglobe *').evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const style = getComputedStyle(node);
        return style.animationName === 'none' ? [] : [style.animationName];
      }),
    );
    expect(animations, 'something fires when the glow arrives').toEqual([]);

    const colourChange = await page
      .locator('.brainglobe-node[data-section-id] .brainglobe-sphere')
      .first()
      .evaluate((el) => {
        const style = getComputedStyle(el);
        return { duration: style.transitionDuration, timing: style.transitionTimingFunction };
      });
    expect(colourChange.duration.split(',')[0]!.trim()).toBe('0.12s');
    expect(colourChange.timing.replace(/\s/g, '')).toContain('cubic-bezier(0.2,0,0,1)');

    // Said once, quietly, as a description of the stage — never fired at
    // anybody. There is no live region carrying it and no opposite sentence.
    const said = page.locator('.brainglobe-sr', { hasText: 'Every section is answered and up to date.' });
    await expect(said).toHaveCount(1);
    expect(await said.evaluate((el) => el.getAttribute('aria-live'))).toBeNull();

    await open(page, 'stale');
    await expect(page.locator('.brainglobe-sr', { hasText: 'Every section is answered' })).toHaveCount(0);
    await expect(page.locator('.brainglobe-sr[aria-live]')).toHaveText('');
  });

  test('reduced motion reaches the same state without moving into it', async ({ page }) => {
    await countFrames(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 'complete');
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-unified', 'true');

    const unified = await tokenValue(page, '--globe-unified');
    for (const orb of await orbs(page)) {
      expect(channelDistance(parseCssColor(orb.fill)!, unified)).toBeLessThanOrEqual(1);
    }
    expect(await frames(page), 'a reduced-motion visitor must get no rAF loop at all').toBe(0);
  });
});

test.describe('VB-26 — labels as icon lettering', () => {
  test('wear the interface\'s own label treatment, scaled for depth', async ({ page }) => {
    await open(page);
    const labels = await page
      .locator('.brainglobe-pin[data-section-id][data-label-hidden="false"] .brainglobe-label')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const style = getComputedStyle(node);
          return {
            text: node.textContent!,
            transform: style.textTransform,
            tracking: style.letterSpacing,
            weight: Number(style.fontWeight),
            size: Number.parseFloat(style.fontSize),
          };
        }),
      );
    expect(labels.length).toBeGreaterThan(2);
    for (const label of labels) {
      expect(label.transform).toBe('uppercase');
      // 0.08em of the label's own size, resolved by the browser.
      expect(Number.parseFloat(label.tracking)).toBeCloseTo(label.size * 0.08, 1);
      expect(label.weight).toBeGreaterThanOrEqual(600);
      expect(label.size).toBeGreaterThanOrEqual(11);
      expect(label.size).toBeLessThanOrEqual(14);
    }
    // Scaled for depth, not one flat size.
    expect(new Set(labels.map((label) => label.size)).size).toBeGreaterThan(1);
  });

  test('nothing is truncated, at any depth or any rotation', async ({ page }) => {
    await open(page);
    const clipped = async () =>
      page
        .locator('.brainglobe-pin[data-label-hidden="false"] .brainglobe-label')
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => node.scrollWidth > node.clientWidth + 0.5)
            .map((node) => `${node.textContent} (${node.scrollWidth} > ${node.clientWidth})`),
        );

    expect(await clipped(), 'a label is clipped at rest').toEqual([]);
    for (const dx of [70, -140, 90]) {
      await dragBy(page, dx, 30);
      await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
      expect(await clipped(), `a label is clipped after turning ${dx}px`).toEqual([]);
    }
  });

  test('the short name is on the stage and the real one is still on the node', async ({ page }) => {
    await open(page);
    const pin = page.locator('.brainglobe-pin[data-section-id="sec6"]');
    await expect(pin.locator('.brainglobe-label')).toHaveText('My Voice');
    await expect(pin).toHaveAttribute('title', '6. How I Communicate');
    // The name a screen reader hears contains the words that are on screen
    // (WCAG 2.5.3), and still says the state out loud.
    const name = (await pin.getAttribute('aria-label'))!;
    expect(name).toContain('My Voice');
    expect(name.length).toBeGreaterThan('My Voice'.length);
  });
});

test('VB-25 — under reduced motion the colour is simply there, with no trip into it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'complete');
  const durations = await page
    .locator('.brainglobe-node[data-section-id] .brainglobe-sphere')
    .evaluateAll((orbs) => orbs.map((orb) => getComputedStyle(orb).transitionDuration));
  for (const duration of durations) expect(duration).toBe('0s');
});

// ---------------------------------------------------------------------
// V1.6 VB-31 — the detail zoom's text, centred and free-floating.
//
// The placement itself is arithmetic and is proved without a browser
// (src/core/globe/detailBand.test.ts). What a browser is needed for is
// everything the arithmetic cannot promise: that the numbers were actually
// applied, that there is genuinely no box left, that the text really clears
// the orb once the browser has broken the lines, and — the new risk, because
// the panel that used to sit behind these words is gone — that the words are
// legible against the FIELD ITSELF, measured off painted pixels rather than
// assumed from a token.
//
// Both stages the drawer opens Brain at, and both ends of the content range:
// `2.1 Roles` is the fullest sub-section in the file (three records, thirteen
// answers, a recommendation) and `2.5 Expertise` is a single answer.
// ---------------------------------------------------------------------

const VB31_STAGES = [300, 260] as const;
const VB31_NODES = ['sec2-1', 'sec2-5'] as const;

async function openRich(page: Page, stage: number): Promise<void> {
  await page.setViewportSize(PANEL);
  await page.goto(`/brain-globe.html?model=rich&stage=${stage}`);
  await page.waitForSelector('.brainglobe');
}

/** Into `2. About Me` and then onto one of its sub-nodes, by keyboard — so the
 * pointer is parked at 0,0 and nothing on the stage is in a hover state. */
async function zoomTo(page: Page, childId: string): Promise<void> {
  await flyIntoAboutMe(page);
  await page.locator(`.brainglobe-pin[data-child-id="${childId}"]`).click();
  await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');
  // The click leaves the pointer on the orb, which holds that node's label
  // open over the first line of the text. Park it off the stage: this is about
  // the words, not about a hover nobody is performing.
  await page.mouse.move(1, 1);
}

test.describe('VB-31 — centred on the node, and free of any box', () => {
  for (const stage of VB31_STAGES) {
    for (const id of VB31_NODES) {
      test(`${id} at ${stage}px is centred on its node and never covers it`, async ({ page }) => {
        await openRich(page, stage);
        await zoomTo(page, id);

        const stageBox = (await page.locator('.brainglobe').boundingBox())!;
        const orb = (await page.locator('.brainglobe-child-node[data-picked="true"] .brainglobe-sphere').boundingBox())!;
        const text = (await page.locator('.brainglobe-detail').boundingBox())!;

        // CENTRED ON THE NODE. The allowance is half the orb's radius
        // (DETAIL_DRIFT in components/BrainGlobe.tsx), and it is spent only
        // because the node sits at 21% of the stage — a stage-wide column
        // centred there would run off the left edge. Half a radius is 14px at
        // 300 and 12px at 260: the text's axis is inside the orb.
        const drift = Math.abs(centreX(text) - centreX(orb));
        expect(drift, `${id} at ${stage}: the text is ${drift}px off its node`).toBeLessThanOrEqual(orb.width / 4 + 1);

        // NEVER OCCLUDES THE NODE. Not "usually below it" — below its lowest
        // painted pixel, which is what the band's own top is folded from.
        expect(text.y, `${id} at ${stage}: the text starts inside the orb`).toBeGreaterThanOrEqual(orb.y + orb.height);
        expect(overlapping(text, orb), `${id} at ${stage}: the text is on its own node`).toBe(false);

        // ON THE STAGE, WHICH CLIPS. A block half off the bottom is a block
        // with half its content missing.
        expect(text.x).toBeGreaterThanOrEqual(stageBox.x - 0.5);
        expect(text.y).toBeGreaterThanOrEqual(stageBox.y - 0.5);
        expect(text.x + text.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 0.5);
        expect(text.y + text.height).toBeLessThanOrEqual(stageBox.y + stageBox.height + 0.5);

        // And it is a measure, not a sliver: enough for the longest record
        // title in the file to sit on one line at the smallest stage.
        expect(text.width).toBeGreaterThan(stage * 0.4);
      });

      test(`${id} at ${stage}px has no panel, card or box around it`, async ({ page }) => {
        await openRich(page, stage);
        await zoomTo(page, id);

        const box = await page.locator('.brainglobe-detail').evaluate((el) => {
          const style = getComputedStyle(el);
          return {
            background: style.backgroundColor,
            image: style.backgroundImage,
            border: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
            shadow: style.boxShadow,
            radius: style.borderRadius,
            align: style.textAlign,
          };
        });
        // FREE-FLOATING. No fill of any kind behind the words, no edge around
        // them, and nothing pretending to be either.
        expect(box.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
        expect(box.image).toBe('none');
        expect(box.border).toEqual(['0px', '0px', '0px', '0px']);
        expect(box.shadow).toBe('none');
        expect(box.align).toBe('center');
        // A radius on a box with no fill and no edge is invisible; a radius is
        // only ever evidence that a box is still being drawn.
        expect(box.radius === '0px' || box.radius === '').toBe(true);

        // Nothing inside it is a box either — the record separator used to be
        // a hairline, and a hairline is an edge in one dimension.
        const insides = await page.locator('.brainglobe-detail *').evaluateAll((nodes) =>
          nodes.map((node) => {
            const style = getComputedStyle(node);
            return {
              tag: node.className,
              background: style.backgroundColor,
              widths: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
            };
          }),
        );
        expect(insides.length).toBeGreaterThan(2);
        for (const inside of insides) {
          expect(inside.background, inside.tag).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
          expect(inside.widths, inside.tag).toEqual(['0px', '0px', '0px', '0px']);
        }
      });
    }
  }

  test('is the same shape for a node with three records and for one with a single answer', async ({ page }) => {
    /**
     * VB-31's "structured identically every time" is a claim about the
     * REPEATING UNIT, not about the flattened list — the fullest node in the
     * file has three records and the emptiest has none, so the lists cannot be
     * equal and the shape still has to be. What must hold is that the block
     * always opens with the node's name, that a group is either a record and
     * its answers or just its answers, and that an answer is always the same
     * two parts in the same order.
     */
    const shapeOf = () =>
      page.locator('.brainglobe-detail').evaluate((root) => {
        const names = (element: Element) =>
          [...element.children].map((child) => (typeof child.className === 'string' ? child.className : ''));
        return {
          first: names(root)[0] ?? '',
          groups: [...root.querySelectorAll('.brainglobe-detail-group')].map(names),
          cells: [...root.querySelectorAll('.brainglobe-detail-cell')].map(names),
        };
      });

    const shapes: Record<string, Awaited<ReturnType<typeof shapeOf>>> = {};
    for (const id of VB31_NODES) {
      await openRich(page, 300);
      await zoomTo(page, id);
      shapes[id] = await shapeOf();

      // Every line is centred, not just the first.
      const aligns = await page
        .locator('.brainglobe-detail p, .brainglobe-detail dt, .brainglobe-detail dd')
        .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).textAlign));
      expect(aligns.length, id).toBeGreaterThan(1);
      for (const align of aligns) expect(align, id).toBe('center');
    }

    for (const id of VB31_NODES) {
      const shape = shapes[id]!;
      expect(shape.first, id).toBe('brainglobe-detail-name');
      expect(shape.groups.length, id).toBeGreaterThan(0);
      for (const group of shape.groups) {
        expect([
          ['brainglobe-detail-record', 'brainglobe-detail-grid'],
          ['brainglobe-detail-grid'],
        ]).toContainEqual(group);
      }
      expect(shape.cells.length, id).toBeGreaterThan(0);
      for (const cell of shape.cells) {
        expect(cell, id).toEqual(['brainglobe-detail-key', 'brainglobe-detail-value']);
      }
    }

    // ...and the one thing that does differ is the one thing the content
    // decides: three records against none.
    const records = (shape: Awaited<ReturnType<typeof shapeOf>>) =>
      shape.groups.filter((group) => group[0] === 'brainglobe-detail-record').length;
    expect(records(shapes['sec2-1']!)).toBe(3);
    expect(records(shapes['sec2-5']!)).toBe(0);
  });

  test('the single-answer node fits the smallest stage with nothing cut off', async ({ page }) => {
    await openRich(page, 260);
    await zoomTo(page, 'sec2-5');
    // The band is a cap, and a cap is only honest if what it caps fits inside
    // it. `2.5 Expertise` is one answer and one question and must never need a
    // scroll on the smallest stage the drawer opens Brain at.
    const clipped = await page.locator('.brainglobe-detail').evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(clipped, `${clipped}px of the text is cut off`).toBeLessThanOrEqual(1);
    // ...and the question really is whole, not ellipsed by the line clamp.
    const key = page.locator('.brainglobe-detail-key').first();
    const cut = await key.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(cut, 'the question is being clamped on a node with room to spare').toBeLessThanOrEqual(1);
  });
});

function overlapping(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * V1.6 VB-31 — CONTRAST AGAINST THE REAL FIELD, NOT AN ASSUMED ONE.
 *
 * The bordered panel gave these words a flat `--globe-panel` to sit on, and the
 * old measurement was against that. There is no panel now: the words sit on a
 * radial gradient with the featured orb's own bloom spilling into the top of
 * the band, and neither of those is a value anybody can look up. So this decodes
 * the painted page — the same technique dock-surface.spec.ts and the orb
 * measurements above use, and for the same reason: it is the only way to read
 * what was actually painted without a decoding dependency.
 *
 * Sampled where the text really is, at both stages, on both ends of the content
 * range, and for both the loud line and the quiet one.
 */
test.describe('VB-31 — the text is legible on the field it now sits on', () => {
  for (const stage of VB31_STAGES) {
    for (const id of VB31_NODES) {
      test(`${id} at ${stage}px clears 4.5:1 against the painted field`, async ({ page }) => {
        await openRich(page, stage);
        await zoomTo(page, id);

        /**
         * Every line of text that is actually on screen, and what colour it is
         * drawn in.
         *
         * ONLY WHAT IS ON SCREEN. `2.1 Roles` scrolls, so the answers below
         * the fold have real boxes well outside the stage, on the white
         * harness page under it. Sampling those measured pale ink on white and
         * reported 2.03:1 — a true measurement of nothing, and identical at
         * both stages, which is what gave it away. So each line is clipped to
         * the block's own visible box and sampled inside the part that shows.
         */
        const linesOnScreen = () =>
          page
            .locator('.brainglobe-detail-name, .brainglobe-detail-record, .brainglobe-detail-value, .brainglobe-detail-key')
            .evaluateAll((nodes) =>
              nodes
                .map((node) => {
                  const box = node.getBoundingClientRect();
                  const block = node.closest('.brainglobe-detail')!.getBoundingClientRect();
                  const top = Math.max(box.top, block.top);
                  const bottom = Math.min(box.bottom, block.bottom);
                  return {
                    kind: typeof node.className === 'string' ? node.className : '',
                    colour: getComputedStyle(node).color,
                    x: box.x + box.width / 2,
                    y: (top + bottom) / 2,
                    width: box.width,
                    shown: bottom - top,
                  };
                })
                .filter((line) => line.shown > 3),
            );

        /** The whole band, top and bottom: the field is a gradient with an
         *  orb's bloom in the top of it, so the words at the foot of a
         *  scrolled block are on a different colour from the ones at its head. */
        for (const scroll of ['top', 'bottom'] as const) {
          await page.locator('.brainglobe-detail').evaluate((el, where) => {
            el.scrollTop = where === 'top' ? 0 : el.scrollHeight;
          }, scroll);

          const lines = await linesOnScreen();
          expect(lines.length, `${id} at ${stage}, scrolled ${scroll}`).toBeGreaterThan(0);

          /**
           * WHAT IS BEHIND THE WORDS, WITH THE WORDS TAKEN AWAY.
           *
           * The first version of this sampled beside each line and kept
           * landing ON a letter — the text is centred, so the middle of the
           * block is the middle of a word — and measured the ink against
           * itself. So the block is hidden for one screenshot and the same
           * points are read off the bare field. Three points across each
           * line's own box, because the field is a gradient and its brightest
           * point under a line is not the line's centre.
           */
          const probes = lines.flatMap((line) => [
            { x: line.x - line.width / 2 + 2, y: line.y },
            { x: line.x, y: line.y },
            { x: line.x + line.width / 2 - 2, y: line.y },
          ]);
          await page.locator('.brainglobe-detail').evaluate((el) => {
            (el as HTMLElement).style.visibility = 'hidden';
          });
          const painted = await paintedAt(page, probes);
          await page.locator('.brainglobe-detail').evaluate((el) => {
            (el as HTMLElement).style.visibility = '';
          });

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            const ink = parseCssColor(line.colour)!;
            for (const behind of painted.slice(i * 3, i * 3 + 3)) {
              const ratio = contrastRatio(ink, behind);
              expect(
                ratio,
                `${id} at ${stage} scrolled ${scroll}: ${line.kind} measures ${ratio.toFixed(2)}:1 on the field`,
              ).toBeGreaterThanOrEqual(4.5);
            }
          }
        }
      });
    }
  }

  test('the brightest thing under the text is the orb’s own bloom, and it still clears', async ({ page }) => {
    // The worst case for this band by construction: the top of it is inside
    // the featured orb's bloom (BLOOM_SCALE is 2.7 radii), so the first line
    // sits on the lightest field the stage ever produces here. Sampled right
    // under the orb's rim, where the bloom is strongest.
    await openRich(page, 300);
    await zoomTo(page, 'sec2-1');

    const orb = (await page.locator('.brainglobe-child-node[data-picked="true"] .brainglobe-sphere').boundingBox())!;
    const text = (await page.locator('.brainglobe-detail').boundingBox())!;
    const [brightest] = await paintedAt(page, [{ x: centreX(orb), y: orb.y + orb.height + 3 }]);
    const ink = await tokenValue(page, '--globe-detail-key');
    const ratio = contrastRatio(ink, brightest!);
    expect(ratio, `the quietest ink measures ${ratio.toFixed(2)}:1 at the bloom's brightest`).toBeGreaterThanOrEqual(4.5);
    // And that sample really was inside the band, not above it.
    expect(orb.y + orb.height + 3).toBeLessThan(text.y + text.height);
  });
});
