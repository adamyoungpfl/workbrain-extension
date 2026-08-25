import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { contrastRatio } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.9 VB-54 — lit orbs, from one fixed point.
 *
 * The maths is proved without a browser (src/core/globe/lighting.ts's own
 * tests, including the sweep that shows the highlight never leaves the orb at
 * any position under any light). What only a browser can show is the thing the
 * feature is actually for, and it is a claim about a GROUP rather than about
 * any one orb: that twelve spheres look like twelve spheres in one room.
 *
 * V1.4 VB-23 deleted the previous highlight because it was baked into each
 * orb's own local box — every orb lit from its own top-left, wherever it sat,
 * which reads as stickers. So the assertions below are all comparative:
 *
 *  · every orb's highlight points the SAME WAY, toward one place;
 *  · orbs at different places have DIFFERENT offsets, and the further from the
 *    light the further toward the rim (a per-orb constant cannot do this);
 *  · turning the globe MOVES a given orb's highlight, because the orb moved
 *    relative to a light that did not;
 *  · and the List's rows are lit the same way, because VB-45's claim is that a
 *    row's orb and its sphere are one object.
 *
 * Plus the three floors this must not spend: the unified glow still resolves to
 * one colour, greyscale still tells an answered orb from an unanswered one, and
 * VB-45's deep hairline still clears WCAG 1.4.11's 3:1 on the near-white pane.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */

const PANEL = { width: 400, height: 700 };
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const DAY_MS = 24 * 60 * 60 * 1000;

// ── The globe half: the harness page ───────────────────────────────────────

async function openGlobe(page: Page, model?: 'empty' | 'complete'): Promise<void> {
  await page.setViewportSize(PANEL);
  await page.goto(model ? `/brain-globe.html?model=${model}` : '/brain-globe.html');
  await page.waitForSelector('.brainglobe');
}

/**
 * Every orb on the stage, with the light's three layers measured off the
 * rendered SVG in the coordinates it is actually drawn in.
 *
 * Read from the DOM's own numbers rather than from the function that produced
 * them: this spec's job is to fail if the component stops applying what core
 * says, and re-deriving core's answer here would make that impossible.
 */
async function litOrbs(page: Page) {
  return page.locator('.brainglobe-node[data-node-index]').evaluateAll((nodes) =>
    nodes.map((node) => {
      const sphere = node.querySelector('.brainglobe-sphere')!;
      const spec = node.querySelector('.brainglobe-spec')!;
      const terminator = node.querySelector('.brainglobe-terminator')!;
      const num = (el: Element, name: string) => Number(el.getAttribute(name));
      const cx = num(sphere, 'cx');
      const cy = num(sphere, 'cy');
      const r = num(sphere, 'r');
      return {
        index: node.getAttribute('data-node-index')!,
        state: node.getAttribute('data-node-state')!,
        depth: Number(node.getAttribute('data-depth')),
        cx,
        cy,
        r,
        // Offsets as fractions of the orb's own radius, which is the unit core
        // speaks in — so an orb at the back and one at the front are comparable.
        hx: (num(spec, 'cx') - cx) / r,
        hy: (num(spec, 'cy') - cy) / r,
        hr: num(spec, 'r') / r,
        sx: (num(terminator, 'cx') - cx) / r,
        sy: (num(terminator, 'cy') - cy) / r,
        sr: num(terminator, 'r') / r,
        specOpacity: Number(spec.getAttribute('opacity')),
        shade: Number(node.querySelector('.brainglobe-orb')!.getAttribute('data-shade')),
        limb: node.querySelector('.brainglobe-limb') !== null,
      };
    }),
  );
}

async function dragBy(page: Page, dx: number, dy: number): Promise<void> {
  const box = (await page.locator('.brainglobe').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx + (dx * i) / 12, cy + (dy * i) / 12);
  await page.mouse.up();
  await expect.poll(() => page.locator('.brainglobe').getAttribute('data-moving'), { timeout: 4000 }).toBe('false');
}

test.describe('VB-54 — one light, on the globe', () => {
  test('every orb is lit from the same place, and no two are lit identically', async ({ page }) => {
    await openGlobe(page);
    const orbs = await litOrbs(page);
    expect(orbs).toHaveLength(12);

    // 1 — ONE DIRECTION. The light is up and to the left of the stage, so every
    // highlight is up-left of its own orb's centre and every terminator is the
    // exact opposite. This is the assertion a per-orb constant would also pass,
    // and it is here because it is the half of the claim that is about
    // agreement rather than about variety.
    for (const orb of orbs) {
      expect(orb.hx, `orb ${orb.index} highlight is not toward the light`).toBeLessThan(0);
      expect(orb.hy, `orb ${orb.index} highlight is not toward the light`).toBeLessThan(0);
      expect(orb.sx, `orb ${orb.index} terminator is not opposite its highlight`).toBeGreaterThan(0);
      expect(orb.sy, `orb ${orb.index} terminator is not opposite its highlight`).toBeGreaterThan(0);
      expect(orb.limb, `orb ${orb.index} has no limb`).toBe(true);
    }

    // 2 — AND NOT ONE OFFSET. This is the half a baked-in highlight cannot
    // pass: the orbs are in different places, so they see the light from
    // different angles, so their highlights sit in different places.
    const offsets = new Set(orbs.map((orb) => `${orb.hx.toFixed(3)},${orb.hy.toFixed(3)}`));
    expect(offsets.size, 'every orb wears the same highlight — this is the sticker VB-24 deleted').toBe(orbs.length);

    // 3 — AND THE VARIATION IS THE RIGHT ONE. The light is up-left, so an orb
    // toward the bottom-right of the stage sees it from further off-axis and
    // its highlight is thrown further toward its own rim.
    const towardLight = [...orbs].sort((a, b) => a.cx + a.cy - (b.cx + b.cy));
    const nearest = towardLight[0]!;
    const furthest = towardLight[towardLight.length - 1]!;
    const reach = (orb: (typeof orbs)[number]) => Math.hypot(orb.hx, orb.hy);
    expect(reach(furthest), 'the far orb is not lit any more obliquely than the near one').toBeGreaterThan(
      reach(nearest) * 1.3,
    );
    // …and it is the one carrying the shading, for the same reason.
    expect(furthest.shade).toBeGreaterThan(nearest.shade);
  });

  test('the highlight never crosses the rim, at any orb, at any rotation', async ({ page }) => {
    await openGlobe(page);
    for (const drag of [
      [0, 0],
      [120, 30],
      [-160, -40],
      [90, -70],
    ] as const) {
      if (drag[0] !== 0 || drag[1] !== 0) await dragBy(page, drag[0], drag[1]);
      for (const orb of await litOrbs(page)) {
        // Measured in the drawing's own coordinates: the blob's own edge,
        // against the orb's rim at 1. VB-45's hairline on the List side depends
        // on this margin existing (core/globe/lighting.ts's HIGHLIGHT_REACH).
        expect(Math.hypot(orb.hx, orb.hy) + orb.hr, `orb ${orb.index} spills`).toBeLessThan(1);
        expect(Math.hypot(orb.sx, orb.sy) + orb.sr, `orb ${orb.index} shade spills`).toBeLessThan(1);
      }
    }
  });

  test('turning the globe moves the highlight ACROSS each orb — the light stays put', async ({ page }) => {
    await openGlobe(page);
    const before = await litOrbs(page);
    await dragBy(page, 150, 40);
    const after = await litOrbs(page);

    // Every orb has moved relative to a light that has not, so every orb is now
    // lit from a different angle. A highlight anchored in the orb's own box
    // would come back byte-identical here, which is the whole test.
    let moved = 0;
    for (const orb of after) {
      const was = before.find((entry) => entry.index === orb.index)!;
      if (Math.hypot(orb.hx - was.hx, orb.hy - was.hy) > 0.02) moved++;
      // Still one light, though — nothing has swung round to the other side.
      expect(orb.hx).toBeLessThan(0);
      expect(orb.hy).toBeLessThan(0);
    }
    expect(moved, 'the pose changed and the lighting did not').toBeGreaterThan(8);
  });

  test('an unanswered orb catches less of it — VB-24’s margin is not spent on this', async ({ page }) => {
    await openGlobe(page);
    const orbs = await litOrbs(page);
    const muted = orbs.filter((orb) => orb.state === 'untouched');
    const lit = orbs.filter((orb) => orb.state !== 'untouched' && orb.state !== 'structural');
    expect(muted.length).toBeGreaterThan(2);
    expect(lit.length).toBeGreaterThan(2);
    // Compared per unit of incoming light, so this is about the treatment and
    // not about which orbs happen to be nearest the source.
    const per = (group: typeof orbs) => Math.max(...group.map((orb) => orb.specOpacity / Math.max(0.01, 1 - orb.shade)));
    expect(per(muted)).toBeLessThan(per(lit));
  });

  test('the unified glow still resolves to one colour with the light on', async ({ page }) => {
    await openGlobe(page, 'complete');
    await expect(page.locator('.brainglobe')).toHaveAttribute('data-unified', 'true');

    // Every orb's own colour, and every shadow it casts on itself, is the one
    // colour. The HIGHLIGHT deliberately is not: it is the light's colour, and
    // the light does not change because the file did (BrainGlobe.css).
    const fills = await page
      .locator('.brainglobe-node .brainglobe-sphere')
      .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).fill))]);
    expect(fills).toHaveLength(1);

    const shadows = await page
      .locator('.brainglobe-stop-deep-1, .brainglobe-stop-deep-5')
      .evaluateAll((els) => [...new Set(els.map((el) => getComputedStyle(el).stopColor))]);
    expect(shadows, 'a unified solid with five different dark sides is five objects').toHaveLength(1);

    const speculars = await page
      .locator('.brainglobe-spec')
      .evaluateAll((els) => [...new Set(els.map((el) => el.getAttribute('fill')))]);
    expect(speculars, 'one light, one specular').toHaveLength(1);

    // And it is still lit, rather than flattened into one disc: the orbs are in
    // different places, so their highlights still are.
    const offsets = new Set((await litOrbs(page)).map((orb) => `${orb.hx.toFixed(3)},${orb.hy.toFixed(3)}`));
    expect(offsets.size).toBe(12);
  });
});

// ── The list half: the real extension ──────────────────────────────────────

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** Every section answered, so every row carries a filled orb to be lit. */
function answeredThroughout(): Answers {
  const ago = new Date(Date.now() - 300 * DAY_MS).toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  for (const module of contextModules) {
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
      answeredAt[key] = ago;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt: {} };
}

async function openList(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
  await expect
    .poll(async () => {
      const first = (await page.locator('.filedrawer').boundingBox())!.y;
      await page.waitForTimeout(60);
      return Math.round(Math.abs((await page.locator('.filedrawer').boundingBox())!.y - first));
    })
    .toBe(0);
  return page;
}

/** What each row's orb was told about the light, straight off the element. */
async function rowOrbs(page: Page) {
  return page.locator('.filetree-row[data-node-id] .filetree-glyph[data-gradient]').evaluateAll((els) =>
    els.map((el) => {
      const style = (el as HTMLElement).style;
      const pct = (name: string) => parseFloat(style.getPropertyValue(name));
      return {
        id: (el.closest('.filetree-row') as HTMLElement).dataset.nodeId!,
        life: (el as HTMLElement).dataset.life!,
        top: el.getBoundingClientRect().top,
        // Back into core's units: the custom properties are half-box
        // percentages, and half the box is one radius.
        hx: pct('--orb-hx') / 50,
        hy: pct('--orb-hy') / 50,
        sx: pct('--orb-sx') / 50,
        sy: pct('--orb-sy') / 50,
        hr: pct('--orb-spec-r') / 50,
        // The paint actually reached the element, rather than a variable that
        // is set and never read.
        painted: getComputedStyle(el).backgroundImage,
      };
    }),
  );
}

test.describe('VB-54 — the same light, on the List’s rows', () => {
  test('a column of orbs is lit from one place above it, and says so row by row', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answeredThroughout());
    const page = await openList(context, id);

    const rows = (await rowOrbs(page)).filter((row) => row.life !== 'dim');
    expect(rows.length).toBeGreaterThan(4);

    for (const row of rows) {
      // The same direction the globe's orbs are lit from — up and to the left —
      // which is what makes the morph one object moving rather than two
      // objects swapping (VB-45).
      expect(row.hx, `${row.id} highlight is not toward the light`).toBeLessThan(0);
      expect(row.hy, `${row.id} highlight is not toward the light`).toBeLessThan(0);
      expect(row.sx, `${row.id} terminator is not opposite it`).toBeGreaterThan(0);
      expect(row.sy, `${row.id} terminator is not opposite it`).toBeGreaterThan(0);
      // Three layers, and all three really painted.
      expect(row.painted.match(/radial-gradient/g) ?? []).toHaveLength(3);
      // Inside the rim, so VB-45's hairline is never painted over.
      expect(Math.hypot(row.hx, row.hy) + row.hr, `${row.id} spills`).toBeLessThan(1);
    }

    // THE ROW-BY-ROW PART, which is the whole reason this is a scene light and
    // not a constant: the light is above the list, so the further down a row
    // sits the higher up its own orb the highlight is thrown. Monotone, top to
    // bottom, with no two rows agreeing.
    const down = [...rows].sort((a, b) => a.top - b.top);
    for (let i = 1; i < down.length; i++) {
      expect(down[i]!.hy, `${down[i]!.id} is lit exactly like the row above it`).toBeLessThan(down[i - 1]!.hy);
    }
    expect(down[down.length - 1]!.hy).toBeLessThan(down[0]!.hy * 1.5);

    await context.close();
  });

  test('the orb’s silhouette still clears 3:1 on the pane after relighting', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answeredThroughout());
    const page = await openList(context, id);

    /**
     * The orb against the ground it is really drawn on, in real painted pixels.
     *
     * WHAT THIS ASKED BEFORE, AND WHY IT ASKS SOMETHING ELSE NOW. VB-45 put a
     * 1px inset ring in the orb's own deep colour on it to clear WCAG 1.4.11's
     * 3:1 against the NEAR-WHITE pane, where the lightest of the five fills
     * measured about 2.7:1 — so the darkest pixel on the rim was the thing that
     * had to hold, and this test read exactly that.
     *
     * V1.9 VB-50 takes the near-white pane away: the drawer is one colour from
     * its top edge to the bottom of the panel, and it is the globe's own field.
     * On that field the five fills are 4.24–6.74:1 (src/core/drawer/chrome.ts's
     * `DOCK_ORB_TOKENS`, held in chrome.test.ts), so the orb reads by its FILL
     * and the deep hairline is the DARK side of the same object rather than its
     * boundary — measuring the darkest rim pixel would now be measuring the
     * shadow, not the shape.
     *
     * So the question is the one 1.4.11 actually asks — is the orb tellable
     * apart from the ground it sits on — and it is asked of the body of the
     * orb, at the worst pixel on a circle inside the limb. The hairline itself
     * is untouched and still doing its original job on the LIGHT surface, where
     * `components/FileTree.tsx` also draws these rows
     * (`src/panel/surfaces/FileView.tsx`).
     *
     * The risk VB-54 introduced is unchanged and is still what this catches: a
     * highlight or a terminator that moves the fill far enough to take the orb
     * under the floor.
     */
    const box = (await page
      .locator('.filetree-row[data-life="lit"] .filetree-glyph[data-gradient]')
      .first()
      .boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const radius = box.width / 2;
    // Two and a half pixels in from the rim, which is the one band of the orb
    // that is neither of the two things this is not asking about: outside it is
    // VB-45's 1px hairline (the dark side of the object, not its boundary, on
    // this ground), and inside it is the tick — drawn in the orb's own deep
    // colour on purpose, because a white mark would sit at 2.9:1 on the
    // lightest fill (FileTree.css). What is left is the orb's own surface.
    const ring: Array<{ x: number; y: number }> = [];
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      ring.push({ x: centre.x + Math.cos(a) * (radius - 2.5), y: centre.y + Math.sin(a) * (radius - 2.5) });
    }
    const outside = { x: centre.x + radius + 4, y: centre.y };

    const shot = (await page.screenshot()).toString('base64');
    const pixels: Rgb[] = await page.evaluate(
      async ({ shot, points }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${shot}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context2d = canvas.getContext('2d')!;
        context2d.drawImage(image, 0, 0);
        return points.map((point) => {
          const data = context2d.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
          return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! / 255 };
        });
      },
      { shot, points: [...ring, outside] },
    );

    const pane = pixels[pixels.length - 1]!;
    // The worst pixel on the circle, not the average: an average hides exactly
    // the case this exists to catch, which is one side of the orb sinking into
    // the ground while the lit side carries the number.
    const worst = pixels
      .slice(0, ring.length)
      .reduce((least, pixel) =>
        contrastRatio(pixel, pane) < contrastRatio(least, pane) ? pixel : least,
      );
    expect(
      contrastRatio(worst, pane),
      `the orb's worst-lit pixel measures ${contrastRatio(worst, pane).toFixed(2)}:1 on the pane`,
    ).toBeGreaterThanOrEqual(3);

    await context.close();
  });

  test('with every colour stripped, the light says nothing state does not', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answeredThroughout());
    const page = await openList(context, id);
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });

    // VB-45's guarantee is that state survives colour being removed, and VB-54
    // must not quietly add a fourth signal that only shading carries. It does
    // not: a hollow orb has no light on it at all, and every filled one has the
    // same three layers whatever its state — the difference is still the fill,
    // the mark and the ring.
    const rows = await page.locator('.filetree-row[data-node-id] .filetree-glyph').evaluateAll((els) =>
      els.map((el) => ({
        life: (el as HTMLElement).dataset.life!,
        layers: (getComputedStyle(el).backgroundImage.match(/radial-gradient/g) ?? []).length,
        mark: el.querySelector('.filetree-mark path')?.getAttribute('d') ?? null,
      })),
    );
    expect(rows.length).toBe(contextOutline.length);
    for (const row of rows) {
      expect(row.layers, `a ${row.life} orb is lit differently from every other ${row.life} orb`).toBe(
        row.life === 'dim' ? 0 : 3,
      );
      expect(row.mark === null, `a ${row.life} orb's mark`).toBe(row.life === 'dim');
    }

    await context.close();
  });
});
