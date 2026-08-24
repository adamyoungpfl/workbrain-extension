import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds } from '../../src/core/drawer/height';
import { BRAIN_MIN_HEIGHT } from '../../src/core/drawer/mode';
import {
  DOCK_BOUNDARY_MIN_CONTRAST,
  DOCK_FRAME,
  DOCK_TEXT_MIN_CONTRAST,
} from '../../src/core/drawer/chrome';
import { FLOW_NAV_HEIGHT } from '../../src/core/flow/dock';
import { channelDistance, contrastRatio, isOpaque, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.4 VB-22 accept criteria, driven in a real browser — what is left of them
 * after V1.7 VB-41.
 *
 * VB-22 made the docked nav and the drawer read as one surface, with a fade
 * above the handle. VB-41 unmakes exactly that half of it: the nav is text on
 * the panel's own canvas now, deliberately NOT continuous with the drawer, and
 * the gradient this file used to model pixel for pixel does not exist. Those
 * two tests — "the fade begins wherever the bar has been dragged to" and "no
 * line at the seam" — were deleted rather than loosened, because a loosened
 * assertion about a fade that is gone would be a test that can only pass.
 * tests/e2e/button-cluster.spec.ts is where the replacement lives, and it
 * measures the same way: real pixels, three drag heights, both modes.
 *
 * What is still VB-22's, and is still here: the drawer's own chrome from the
 * handle down. The head band is the Brain field in both modes (V1.6 VB-30),
 * its glyphs and its count are legible on it, and the two mode toggles are
 * glyphs with names rather than words.
 *
 * EVERYTHING HERE IS MEASURED. Contrast is computed from real screenshot
 * pixels and real computed styles. The screenshots the last test writes are
 * for a person to look at, because "reads as one surface" is not an assertion.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb22');
const PANEL = { width: 400, height: 760 };
const BOUNDS = drawerBounds(PANEL.height);

/** How far a painted pixel may sit from the model before the two are
 * disagreeing rather than rounding. A gradient is dithered; four levels out of
 * 255 is well inside that and nowhere near a colour being wrong. */
const PAINT_TOLERANCE = 4;

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** The same fixture the VB-07, VB-11, VB-12 and VB-14b specs use: far enough
 * in that the file has written, current and untouched sections. */
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

/** A question carrying the whole bar — Back, Next and Skip. */
async function openQuestion(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[1]!.id));
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.filedrawer-handle');
  await page.getByRole('button', { name: S.next, exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
  // The question types itself in; let it finish so nothing is mid-print when a
  // screenshot is taken.
  await page.waitForTimeout(900);
  return page;
}

/**
 * Every pixel this spec judges comes through here.
 *
 * A screenshot, decoded back inside the page onto a canvas — which is the only
 * way to read what was painted without a decoding dependency, and this repo
 * ships two runtime dependencies and no more (docs/DEPENDENCIES.md). The
 * device pixel ratio is 1 here, so a CSS pixel is a screenshot pixel and the
 * coordinates below mean what they say.
 */
async function pixels(page: Page, points: readonly { x: number; y: number }[]): Promise<Rgb[]> {
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
    { shot, points: points.map((p) => ({ x: p.x, y: p.y })) },
  );
}

interface Geometry {
  drawerTop: number;
  navTop: number;
  navBottom: number;
  /** An x with no control on it at any height in the bar — the column every
   * ramp sample is read from. Computed from the real boxes rather than
   * guessed, so a wider button can never quietly move a probe onto itself. */
  emptyX: number;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const nav = document.querySelector('.flow-foot')!.getBoundingClientRect();
    const drawer = document.querySelector('.filedrawer')!.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.flow-foot .btn')].map((b) =>
      b.getBoundingClientRect(),
    );
    // The widest gap between two adjacent buttons in the row.
    let emptyX = nav.left + 4;
    let widest = 0;
    for (let i = 1; i < buttons.length; i++) {
      const gap = buttons[i]!.left - buttons[i - 1]!.right;
      if (gap > widest) {
        widest = gap;
        emptyX = (buttons[i]!.left + buttons[i - 1]!.right) / 2;
      }
    }
    return { drawerTop: drawer.top, navTop: nav.top, navBottom: nav.bottom, emptyX };
  });
}

async function setHeight(page: Page, height: number): Promise<void> {
  const handle = page.locator('.filedrawer-handle');
  const box = (await handle.boundingBox())!;
  const startY = box.y + box.height / 2;
  const current = Number(await handle.getAttribute('aria-valuenow'));
  await page.mouse.move(box.x + box.width / 2, startY);
  await page.mouse.down();
  // One intermediate move, so this is a drag the browser believes rather than
  // a teleport, then the real target.
  await page.mouse.move(box.x + box.width / 2, startY - (height - current) / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2, startY - (height - current), { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => handle.getAttribute('aria-valuenow')).toBe(String(height));
}

async function chooseMode(page: Page, mode: 'brain' | 'list'): Promise<void> {
  await page
    .getByRole('button', { name: mode === 'brain' ? S.drawerModeBrain : S.drawerModeList, exact: true })
    .click();
  await expect(page.locator('.flowshell')).toHaveAttribute('data-stage', mode);
  // The morph, the drawer's settle and the stage's own colour transition.
  await page.waitForTimeout(700);
}

/**
 * The three drag positions every assertion below is repeated at, per mode.
 *
 * `mid` is a real drag to the middle of the range rather than a keypress: the
 * bar has to hold up wherever the grip is left, not only at the two ends. The
 * floor differs by mode because Brain hands over to List below its own minimum
 * (core/drawer/mode.ts) — testing Brain at a height Brain cannot exist at
 * would be testing List twice.
 */
function heightsFor(mode: 'brain' | 'list'): { name: string; height: number }[] {
  const lowest = mode === 'brain' ? Math.max(BOUNDS.min, BRAIN_MIN_HEIGHT) : BOUNDS.min;
  return [
    { name: 'min', height: lowest },
    { name: 'mid', height: Math.round((lowest + BOUNDS.max) / 2) },
    { name: 'max', height: BOUNDS.max },
  ];
}

test('the head band is the same dark field in both modes (VB-22, VB-30)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const band: Rgb[] = [];

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    await setHeight(page, BOUNDS.max);
    const g = await geometry(page);

    // V1.6 VB-30: the band is the Brain visual's dark field in BOTH modes, so
    // in List it deliberately sits on a light pane — the band belongs to the
    // drawer's chrome, not to the view under it.
    //
    // V1.7 VB-41 removed what used to be asserted either side of this line.
    // The bar above is the panel's own canvas now and the band is the stage,
    // so there IS a hard edge at the seam, and it is the thing that separates
    // the cluster from the handle. button-cluster.spec.ts measures it from the
    // other side.
    const [head] = await pixels(page, [{ x: g.emptyX, y: g.drawerTop + 20 }]);
    band.push(head!);
    if (mode === 'brain') {
      // Inside the frame and inside the stage's own padding, which is the one
      // column of the pane the globe's radial never reaches.
      const [pane] = await pixels(page, [{ x: DOCK_FRAME + 4, y: g.drawerTop + 60 }]);
      expect(channelDistance(head!, pane!), 'brain: the mode bar is not the stage’s colour')
        .toBeLessThanOrEqual(12);
    }
  }

  expect(channelDistance(band[0]!, band[1]!), 'the mode bar is not the same field in both modes')
    .toBeLessThanOrEqual(PAINT_TOLERANCE);

  await context.close();
});

test('the mode toggles lose their words and keep their names (VB-22)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, BOUNDS.max);

  for (const [mode, label] of [
    ['brain', S.drawerModeBrain],
    ['list', S.drawerModeList],
  ] as const) {
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button, `${label} is not findable by name`).toHaveCount(1);
    // A glyph, not a word: nothing printed, and the name comes from the label.
    expect((await button.innerText()).trim(), `${label} still prints a word`).toBe('');
    await expect(button.locator('svg')).toHaveCount(1);
    const box = (await button.boundingBox())!;
    expect(box.width, `${label} target`).toBeGreaterThanOrEqual(44);
    expect(box.height, `${label} target`).toBeGreaterThanOrEqual(44);

    await chooseMode(page, mode);
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    // Never colour alone: the pressed one also carries a fill, a bar under it
    // and a heavier glyph stroke.
    const pressed = await button.evaluate((el) => ({
      fill: getComputedStyle(el).backgroundColor,
      bar: getComputedStyle(el).boxShadow,
      stroke: getComputedStyle(el.querySelector('svg')!).strokeWidth,
    }));
    expect(isOpaque(parseCssColor(pressed.fill)), `${label} pressed fill`).toBe(true);
    expect(pressed.bar, `${label} pressed bar`).not.toBe('none');
    expect(parseFloat(pressed.stroke), `${label} pressed stroke`).toBeGreaterThan(2);
  }

  // And the count beside them goes light with the band — V1.6 VB-30: it goes
  // light and STAYS light, so this now also holds the two modes to one ink on
  // one band rather than to two that each happen to clear the floor.
  const counts: { ink: Rgb; band: Rgb }[] = [];
  for (const mode of ['brain', 'list'] as const) {
    await chooseMode(page, mode);
    const count = page.locator('.filedrawer-count');
    const g = await geometry(page);
    const ink = parseCssColor(await count.evaluate((el) => getComputedStyle(el).color))!;
    const [band] = await pixels(page, [{ x: g.emptyX, y: g.drawerTop + 20 }]);
    expect(contrastRatio(ink, band!), `${mode}: the section count on the band`).toBeGreaterThanOrEqual(
      DOCK_TEXT_MIN_CONTRAST,
    );
    counts.push({ ink, band: band! });

    // The glyphs beside it, on the same band and under the same rule (VB-30:
    // light icons in both modes). A glyph is a non-text indicator, so the
    // floor is 1.4.11's — measured against the band it is drawn on, not the
    // one it used to be drawn on.
    const glyph = parseCssColor(
      await page
        .getByRole('button', { name: mode === 'brain' ? S.drawerModeList : S.drawerModeBrain, exact: true })
        .evaluate((el) => getComputedStyle(el).color),
    )!;
    expect(contrastRatio(glyph, band!), `${mode}: the unpressed mode glyph on the band`)
      .toBeGreaterThanOrEqual(DOCK_BOUNDARY_MIN_CONTRAST);
  }
  expect(channelDistance(counts[0]!.ink, counts[1]!.ink), 'the section count changes with the mode')
    .toBeLessThanOrEqual(1);
  // Light, said as the thing it means: nearer the panel's white than its ink.
  expect(contrastRatio(counts[1]!.ink, counts[1]!.band), 'the count is not light on the band')
    .toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);

  await context.close();
});

test('the drawer edge, at three heights in both modes — for a person to look at (VB-22)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      // The pointer is left over the panel after a drag and would put a hover
      // state in the shot; park it somewhere harmless first.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, `${mode}-${name}.png`) });
      const g = await geometry(page);
      // And the edge itself, close up: the bar, the seam and the head band.
      await page.screenshot({
        path: path.join(SHOTS, `${mode}-${name}-edge.png`),
        clip: { x: 0, y: g.navTop - 10, width: PANEL.width, height: FLOW_NAV_HEIGHT + 64 },
      });
    }
  }

  await context.close();
});
