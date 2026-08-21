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
  test('is one flat token fill, with no gradient and no highlight anywhere in the picture', async ({ page }) => {
    await open(page);
    const fills = await page
      .locator('.brainglobe-node:not([data-node-state="untouched"]) .brainglobe-sphere')
      .evaluateAll((orbs) => orbs.map((orb) => getComputedStyle(orb).fill));
    expect(fills.length).toBeGreaterThan(3);
    for (const fill of fills) {
      // A real rgb(), not `url(#…)`: the three-stop radial is gone.
      expect(fill).toMatch(/^rgb\(/);
    }
    // The five sphere gradients went with it; only the blooms and the field
    // are left.
    expect(await page.locator('radialGradient').count()).toBe(6);
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
  test('the orb features on the left and its details open on the right, without overlapping', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);

    const before = (await page.locator('.brainglobe-child-node[data-child-id="sec2-1"] .brainglobe-sphere').boundingBox())!;
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    const stage = (await page.locator('.brainglobe').boundingBox())!;
    const orb = (await page.locator('.brainglobe-child-node[data-picked="true"] .brainglobe-sphere').boundingBox())!;
    const panel = (await page.locator('.brainglobe-detail').boundingBox())!;

    // Left: the orb travelled, and grew into a feature.
    expect(centreX(orb)).toBeLessThan(stage.x + stage.width * 0.4);
    expect(orb.width).toBeGreaterThan(before.width * 2);
    // Right: the panel, entirely inside the stage and entirely clear of the orb.
    expect(panel.x).toBeGreaterThan(orb.x + orb.width);
    expect(panel.x + panel.width).toBeLessThanOrEqual(stage.x + stage.width + 1);
    expect(panel.y + panel.height).toBeLessThanOrEqual(stage.y + stage.height + 1);
    // Not hidden behind the way out, either.
    const back = (await page.locator('.brainglobe-back').boundingBox())!;
    expect(panel.y).toBeGreaterThanOrEqual(back.y + back.height);
    // And the whole cluster it came out of has gone.
    const others = await page
      .locator('.brainglobe-child-node[data-picked="false"]')
      .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute('opacity'))));
    expect(Math.max(...others)).toBeLessThan(0.02);
  });

  test('the panel carries the sub-node’s name and a real grid of its details', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    await expect(page.locator('.brainglobe-detail-name')).toHaveText('2.1 Roles');
    // The real stress case: three roles, thirteen cells, three headings.
    await expect(page.locator('.brainglobe-detail-cell')).toHaveCount(13);
    await expect(page.locator('.brainglobe-detail-record')).toHaveCount(3);
    await expect(page.locator('.brainglobe-detail-record').first()).toHaveText('Manager / Team Lead');

    // A GRID, not a list: at least one pair of cells shares a row — same top,
    // different left — which is the thing 400px makes hard and is why
    // `NodeDetail.wide` exists at all.
    const boxes = await page
      .locator('.brainglobe-detail-cell')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width })));
    const paired = boxes.filter((a, i) => boxes.some((b, j) => i !== j && Math.abs(a.y - b.y) < 2 && Math.abs(a.x - b.x) > 2));
    expect(paired.length, 'no two cells ever sat side by side — the grid is a list').toBeGreaterThanOrEqual(4);
    // ...and no paired cell is a sliver: two columns, not four.
    for (const cell of paired) expect(cell.w).toBeGreaterThan(60);

    // Nothing runs outside the panel it is in.
    const panel = (await page.locator('.brainglobe-detail').boundingBox())!;
    for (const cell of boxes) {
      expect(cell.x).toBeGreaterThanOrEqual(panel.x - 1);
      expect(cell.x + cell.w).toBeLessThanOrEqual(panel.x + panel.width + 1);
    }
  });

  test('the panel scrolls, and everything in it is reachable', async ({ page }) => {
    await open(page);
    await flyIntoAboutMe(page);
    await page.locator('.brainglobe-pin[data-child-id="sec2-1"]').click();
    await expect.poll(() => page.locator('.brainglobe').getAttribute('data-split'), { timeout: 2000 }).toBe('1.000');

    const scroll = await page.locator('.brainglobe-detail').evaluate((el) => ({
      scrollable: el.scrollHeight > el.clientHeight,
      focusable: el.getAttribute('tabindex') === '0',
    }));
    // Thirteen cells is taller than the stage, so this must be a real scroller
    // AND a real tab stop — a scrolling box a keyboard cannot reach is a box
    // whose bottom half does not exist.
    expect(scroll.scrollable).toBe(true);
    expect(scroll.focusable).toBe(true);

    const bottom = await page.locator('.brainglobe-detail').evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(bottom).toBeGreaterThan(0);
    await expect(page.locator('.brainglobe-detail-value').last()).toBeInViewport();
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
