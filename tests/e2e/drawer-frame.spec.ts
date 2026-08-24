import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds } from '../../src/core/drawer/height';
import { BRAIN_MIN_HEIGHT } from '../../src/core/drawer/mode';
import { DOCK_FRAME } from '../../src/core/drawer/chrome';
import { channelDistance, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.6 VB-29 accept criteria, driven in a real browser.
 *
 * "Extend a white border down the sides and across the bottom of the drawer,
 * so the panel reads as one app with a framed pane inside it rather than a
 * surface that runs off the edge."
 *
 * Every claim in that sentence is about paint, so every assertion here is made
 * on paint: the frame is found by walking in from the panel's own edge until
 * the pixels stop being `--canvas`, at three drag heights in both modes. A
 * class name would prove nothing — the frame is a border on one element and a
 * radius on three, and any of them can be right while the screen is wrong.
 *
 * The two accept clauses that are not about the frame's presence are here too,
 * because they are the ways this could be present and still be a mistake:
 * nothing inside the drawer may be clipped by it, and it may not eat into the
 * 44px controls at the drawer's edges.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb29');
const PANEL = { width: 400, height: 760 };
const BOUNDS = drawerBounds(PANEL.height);

/** Two colours are the same colour if the screen puts them within this of each
 * other. Anti-aliasing on a rounded corner is worth a level or two; the pane
 * (`--surface`) is nine levels off `--canvas`, so this separates them. */
const SAME = 3;

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** The same fixture the VB-07, VB-11, VB-12, VB-14b and VB-22 specs use: far
 * enough in that the file has written, current and untouched sections. */
function answersUpToModule(modules: Module[], stopBeforeModuleId: string): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of modules) {
    if (module.id === stopBeforeModuleId) break;
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
      answeredAt[key] = now;
      if (typeof value === 'string') reflectedAt[key] = now;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

async function openQuestion(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[3]!.id));
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /Context\.md/ }).click();
  await page.waitForSelector('.filedrawer-handle');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: S.next, exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  // The question types itself in; let it finish so nothing is mid-print when a
  // screenshot is taken.
  await page.waitForTimeout(900);
  return page;
}

/**
 * Every pixel this spec judges comes through here — a screenshot decoded back
 * inside the page onto a canvas, which is the only way to read what was
 * painted without a decoding dependency (docs/DEPENDENCIES.md: two runtime
 * dependencies, and no good reason for a third). Device pixel ratio is 1, so a
 * CSS pixel is a screenshot pixel.
 *
 * One shot per call rather than per point: reading a row of forty pixels is
 * one screenshot, and the whole row is guaranteed to be the same frame.
 */
async function pixelRows(page: Page, rows: readonly { x: number; y: number }[][]): Promise<Rgb[][]> {
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ shot, rows }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${shot}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return rows.map((row) =>
        row.map((point) => {
          const data = context.getImageData(Math.round(point.x), Math.round(point.y), 1, 1).data;
          return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! / 255 };
        }),
      );
    },
    { shot, rows: rows.map((row) => row.map((p) => ({ x: p.x, y: p.y }))) },
  );
}

/** One token's value, resolved by the browser rather than restated here. */
async function tokenColor(page: Page, name: string): Promise<Rgb> {
  const value = await page.evaluate((property) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = `var(${property})`;
    document.body.append(probe);
    const read = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return read;
  }, name);
  const parsed = parseCssColor(value);
  expect(parsed, `could not read ${name} (${value})`).not.toBeNull();
  return parsed!;
}

async function setHeight(page: Page, height: number): Promise<void> {
  const handle = page.locator('.filedrawer-handle');
  const box = (await handle.boundingBox())!;
  const startY = box.y + box.height / 2;
  const current = Number(await handle.getAttribute('aria-valuenow'));
  await page.mouse.move(box.x + box.width / 2, startY);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, startY - (height - current) / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, startY - (height - current), { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => handle.getAttribute('aria-valuenow')).toBe(String(height));
  // The pointer is left over the panel after a drag and would put a hover
  // state in the next shot; park it somewhere harmless.
  await page.mouse.move(2, 2);
}

async function chooseMode(page: Page, mode: 'brain' | 'list'): Promise<void> {
  await page
    .getByRole('button', { name: mode === 'brain' ? S.drawerModeBrain : S.drawerModeList, exact: true })
    .click();
  await expect(page.locator('.flowshell')).toHaveAttribute('data-stage', mode);
  // The morph, the drawer's settle and the pane's own colour transition.
  await page.waitForTimeout(700);
}

/** The three drag positions every assertion is repeated at, per mode — the
 * same set VB-22's spec uses, and for the same reason: Brain does not exist
 * below its own minimum, so testing it there would test List twice. */
function heightsFor(mode: 'brain' | 'list'): { name: string; height: number }[] {
  const lowest = mode === 'brain' ? Math.max(BOUNDS.min, BRAIN_MIN_HEIGHT) : BOUNDS.min;
  return [
    { name: 'min', height: lowest },
    { name: 'mid', height: Math.round((lowest + BOUNDS.max) / 2) },
    { name: 'max', height: BOUNDS.max },
  ];
}

/** How many pixels of `--canvas` there are before the pane starts, walking in
 * from one end of a row. `-1` if the row never stops being the canvas, which
 * is what "there is no pane here at all" looks like. */
function frameWidth(row: readonly Rgb[], canvas: Rgb): number {
  for (const [index, pixel] of row.entries()) {
    if (channelDistance(pixel, canvas) > SAME) return index;
  }
  return -1;
}

test('the frame is on the sides and the bottom, at every height in both modes (VB-29)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const canvas = await tokenColor(page, '--canvas');
  const measured: string[] = [];

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const where = `${mode} at ${name}`;
      const drawer = (await page.locator('.filedrawer').boundingBox())!;

      // Three rows down the pane — just under the head band, in the middle,
      // and near the bottom — read from both edges inward. A frame that is
      // only there at one height, or only beside the head band, fails here
      // rather than in a screenshot nobody opened.
      //
      // The lowest row stops a clear card radius above the pane's bottom edge
      // on purpose: inside the corner the pane really does start further in,
      // and a row measured there would be measuring the rounding (which the
      // test below measures properly) rather than the frame.
      const ys = [
        Math.round(drawer.y + 52),
        Math.round(drawer.y + drawer.height / 2),
        Math.round(drawer.y + drawer.height - DOCK_FRAME - 20),
      ];
      const rows = ys.flatMap((y) => [
        Array.from({ length: 40 }, (_, i) => ({ x: i, y })),
        Array.from({ length: 40 }, (_, i) => ({ x: PANEL.width - 1 - i, y })),
      ]);
      const painted = await pixelRows(page, rows);

      painted.forEach((row, index) => {
        const side = index % 2 === 0 ? 'left' : 'right';
        const y = ys[Math.floor(index / 2)]!;
        const width = frameWidth(row, canvas);
        expect(width, `${where}: no pane at all ${y - drawer.y}px down the ${side} edge`).not.toBe(-1);
        expect(
          width,
          `${where}: the ${side} frame is ${width}px, ${y - drawer.y}px down the drawer`,
        ).toBe(DOCK_FRAME);
        measured.push(`${where} — ${side} frame ${width}px at +${Math.round(y - drawer.y)}px`);
      });

      // And across the bottom, read up from the panel's own last row. The
      // drawer is pegged to the bottom of the panel, so this is the frame and
      // nothing else.
      const [column] = await pixelRows(page, [
        Array.from({ length: 20 }, (_, i) => ({ x: Math.round(PANEL.width / 2), y: PANEL.height - 1 - i })),
      ]);
      const bottom = frameWidth(column!, canvas);
      expect(bottom, `${where}: the bottom frame is ${bottom}px`).toBe(DOCK_FRAME);
      measured.push(`${where} — bottom frame ${bottom}px`);
    }
  }

  console.log(`\n  VB-29 measured frame\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
  await context.close();
});

test('the pane’s rounding is the panel’s own card radius (VB-29)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  // --r-lg, read from the browser rather than restated: 14px is the panel's
  // card radius and the frame has to agree with it, not with a number of its
  // own. The drawer's OUTER radius is that plus the frame's width, because a
  // border's inner radius is the outer one less its own thickness — which is
  // what makes the pane 14 and not 6.
  const cardRadius = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.borderRadius = 'var(--r-lg)';
    document.body.append(probe);
    const read = parseFloat(getComputedStyle(probe).borderBottomLeftRadius);
    probe.remove();
    return read;
  });
  expect(cardRadius).toBe(14);

  const box = await page.locator('.filedrawer').evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      left: parseFloat(s.borderLeftWidth),
      right: parseFloat(s.borderRightWidth),
      bottom: parseFloat(s.borderBottomWidth),
      top: parseFloat(s.borderTopWidth),
      bottomLeft: parseFloat(s.borderBottomLeftRadius),
      bottomRight: parseFloat(s.borderBottomRightRadius),
      topLeft: parseFloat(s.borderTopLeftRadius),
      clip: s.backgroundClip,
      overflow: s.overflow,
    };
  });
  expect(box.left, 'the left frame').toBe(DOCK_FRAME);
  expect(box.right, 'the right frame').toBe(DOCK_FRAME);
  expect(box.bottom, 'the bottom frame').toBe(DOCK_FRAME);
  // No frame across the top: the pane runs on up into the bar's own ramp,
  // which is what makes the two one object (VB-22).
  expect(box.top, 'a frame appeared across the top').toBe(0);
  expect(box.bottomLeft - box.left, 'the pane’s bottom left corner').toBe(cardRadius);
  expect(box.bottomRight - box.right, 'the pane’s bottom right corner').toBe(cardRadius);
  expect(box.topLeft, 'the top corners are not square').toBe(0);
  // The pane's own colour has to stop inside the frame, or the border is
  // painted over by the background it is supposed to frame.
  expect(box.clip).toBe('padding-box');
  // NOT by clipping: the grip straddles the drawer's top edge and would be cut
  // in half (see the next test).
  expect(box.overflow).toBe('visible');

  await context.close();
});

test('nothing inside the drawer is clipped by the frame (VB-29)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const where = `${mode} at ${name}`;
      const drawer = (await page.locator('.filedrawer').boundingBox())!;
      const pane = { left: drawer.x + DOCK_FRAME, right: drawer.x + drawer.width - DOCK_FRAME };

      // The grip is HALF ABOVE THE DRAWER'S TOP EDGE by design, so a frame
      // drawn with `overflow: hidden` would cut the handle's own mark in two.
      // Measured on the paint: its top bar is light against the dark stage, so
      // a light pixel above the drawer's edge is the top half of the grip
      // still being drawn.
      const grip = (await page.locator('.filedrawer-grip').boundingBox())!;
      expect(grip.y, `${where}: the grip does not straddle the edge`).toBeLessThan(drawer.y);
      const [above] = await pixelRows(page, [
        Array.from({ length: 8 }, (_, i) => ({ x: Math.round(grip.x + 12 + i), y: Math.round(grip.y + 4) })),
      ]);
      const stage = await tokenColor(page, '--globe-field');
      const lit = above!.filter((pixel) => channelDistance(pixel, stage) > 40).length;
      expect(lit, `${where}: the grip's top half is not painted`).toBeGreaterThan(4);

      // The controls at the drawer's own edges keep their 44px, and stay
      // inside the pane rather than being pushed under the frame.
      for (const label of [S.drawerModeBrain, S.drawerModeList]) {
        const button = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
        expect(button.width, `${where}: ${label} width`).toBeGreaterThanOrEqual(44);
        expect(button.height, `${where}: ${label} height`).toBeGreaterThanOrEqual(44);
        expect(button.x, `${where}: ${label} is under the frame`).toBeGreaterThanOrEqual(pane.left);
      }
      const handle = (await page.locator('.filedrawer-handle').boundingBox())!;
      expect(handle.height, `${where}: the handle's target`).toBeGreaterThanOrEqual(44);

      if (mode === 'list') {
        // The right-hand edge of the list: the disclosure is the last control
        // before the frame, and it keeps its whole target inside the pane.
        const toggle = await page.locator('.filetree-toggle').first().boundingBox();
        if (toggle) {
          expect(toggle.width, `${where}: the disclosure's target`).toBeGreaterThanOrEqual(44);
          expect(toggle.x + toggle.width, `${where}: the disclosure is under the frame`)
            .toBeLessThanOrEqual(pane.right + 0.5);
        }
        // And nothing in the list has been pushed sideways out of the pane —
        // a 400px panel may never scroll horizontally.
        const body = await page.locator('.filedrawer-body').evaluate((el) => ({
          scroll: el.scrollWidth,
          client: el.clientWidth,
        }));
        expect(body.scroll, `${where}: the list overflows the pane sideways`).toBeLessThanOrEqual(
          body.client,
        );
      } else {
        // Brain: the globe is sized from the room the frame leaves
        // (core/drawer/mode.ts), so it fits its stage rather than being cut
        // off by it.
        const stageBox = (await page.locator('.filedrawer-stage').boundingBox())!;
        const globe = (await page.locator('.brainglobe').boundingBox())!;
        expect(globe.x, `${where}: the globe is cut off at the left`).toBeGreaterThanOrEqual(stageBox.x - 0.5);
        expect(globe.x + globe.width, `${where}: the globe is cut off at the right`).toBeLessThanOrEqual(
          stageBox.x + stageBox.width + 0.5,
        );
        expect(globe.y + globe.height, `${where}: the globe is cut off at the bottom`).toBeLessThanOrEqual(
          stageBox.y + stageBox.height + 0.5,
        );
      }
    }
  }

  await context.close();
});

test('the drawer, framed, at three heights in both modes — for a person to look at (VB-29/VB-30)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, `${mode}-${name}.png`) });
      // And the two corners close up: the seam where the bar meets the pane,
      // and the bottom left corner where the frame turns.
      const drawer = (await page.locator('.filedrawer').boundingBox())!;
      await page.screenshot({
        path: path.join(SHOTS, `${mode}-${name}-corner.png`),
        clip: { x: 0, y: drawer.y + drawer.height - 56, width: 160, height: 56 },
      });
    }
  }

  await context.close();
});
