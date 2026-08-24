import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds } from '../../src/core/drawer/height';
import { BRAIN_MIN_HEIGHT } from '../../src/core/drawer/mode';
import {
  DOCK_BOUNDARY_MIN_CONTRAST,
  DOCK_FRAME,
  DOCK_TEXT_MIN_CONTRAST,
  NAV_RAMP_HEIGHT,
  navRampColorAt,
} from '../../src/core/drawer/chrome';
import { channelDistance, contrastRatio, isOpaque, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.4 VB-22 accept criteria, driven in a real browser.
 *
 * The unit tests prove the arithmetic and prove the *palette* clears
 * docs/GUARDRAILS.md (src/core/drawer/chrome.test.ts). Neither can prove the
 * only thing this task actually is, which is what a screen ends up painted:
 *
 *  - that the bar is visually continuous with the stage in both modes — no
 *    line, no step, the same colour either side of the seam;
 *  - that the fade **begins wherever the bar has been dragged to**, at every
 *    height, rather than sitting at a fixed one;
 *  - that the gradient the browser drew is the gradient core/drawer/chrome.ts
 *    describes, pixel for pixel;
 *  - and that every control in that bar clears 4.5:1 on its text and 3:1 on
 *    its boundary **at three drag positions in both modes**, measured against
 *    the colours actually on screen rather than against the ones we intended.
 *
 * EVERYTHING HERE IS MEASURED. Contrast is computed from real screenshot
 * pixels and real computed styles; a class name would prove nothing about a
 * gradient. The screenshots the last test writes are for a person to look at,
 * because "reads as one surface" is not an assertion.
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
  await page.getByRole('button', { name: /Context\.md/ }).click();
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

/** One token's value, resolved by the browser rather than restated here — a
 * probe element painted with it and read back. Keeps the spec honest about
 * measuring the product's colours instead of a copy of them. */
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

test('the fade begins wherever the bar has been dragged to (VB-22)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const canvas = await tokenColor(page, '--canvas');

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const where = `${mode} at ${name}`;
      const g = await geometry(page);
      expect(Math.round(g.navBottom), where).toBe(Math.round(g.drawerTop));

      // The stage colour, read from the drawer's own head band — not from a
      // token, so this is genuinely "the bar and the drawer are the same
      // colour" rather than "both were given the same variable".
      const [stage] = await pixels(page, [{ x: g.emptyX, y: g.drawerTop + 20 }]);

      // The whole ramp, sampled every 4px up from the drawer's edge, against
      // the model in core/drawer/chrome.ts. The model is anchored at the
      // drawer's top edge; if the fade sat at a fixed height instead of
      // tracking the handle, this would fail at two of the three drag
      // positions and pass at one.
      const rows: { x: number; y: number }[] = [];
      for (let up = 1; up < NAV_RAMP_HEIGHT; up += 4) {
        rows.push({ x: g.emptyX, y: Math.round(g.drawerTop) - up });
      }
      const painted = await pixels(page, rows);
      rows.forEach((row, index) => {
        // A screenshot row is a sample of the CSS pixel's MIDDLE, so the ramp
        // position it shows is half a pixel further from the edge than its
        // index. Ignoring that reads as an 8-level error in the foot, where
        // the ramp is climbing fastest — the model is right and the naive
        // coordinate is wrong.
        const up = g.drawerTop - (row.y + 0.5);
        const predicted = navRampColorAt(up, stage!, canvas);
        // Matched against the model within a pixel of where the model says it
        // is. In the foot the ramp climbs about fourteen levels per pixel, so a
        // colour tolerance alone would either have to be loose enough to hide a
        // real mistake or tight enough to fail on sub-pixel rounding; a
        // tolerance in POSITION says the thing actually being claimed — the
        // fade is where core/drawer/chrome.ts puts it, to the pixel.
        const off = [-1, -0.5, 0, 0.5, 1].map((dy) =>
          channelDistance(painted[index]!, navRampColorAt(up + dy, stage!, canvas)),
        );
        expect(
          Math.min(...off),
          `${where}: ${up}px above the handle painted rgb(${painted[index]!.r}, ${painted[index]!.g}, ${painted[index]!.b}), model says rgb(${Math.round(predicted.r)}, ${Math.round(predicted.g)}, ${Math.round(predicted.b)})`,
        ).toBeLessThanOrEqual(PAINT_TOLERANCE);
      });

      // Both ends stated plainly: the stage's own colour at the handle, the
      // panel's own white by the top of the bar.
      const [atHandle, atTop] = await pixels(page, [
        { x: g.emptyX, y: g.drawerTop - 1 },
        { x: g.emptyX, y: g.navTop + 1 },
      ]);
      // The bar's very first row is the stage's own colour — allowing for the
      // half pixel of ramp it has already climbed by the middle of that row,
      // which in the foot is worth about seven levels.
      expect(channelDistance(atHandle!, stage!), `${where}: the fade does not begin at the handle`)
        .toBeLessThanOrEqual(PAINT_TOLERANCE + 8);
      expect(channelDistance(atTop!, canvas), `${where}: the fade does not reach the panel white`)
        .toBeLessThanOrEqual(PAINT_TOLERANCE);
    }
  }

  await context.close();
});

test('the bar and the stage are one surface, with no line at the seam (VB-22)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const band: Rgb[] = [];

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    await setHeight(page, BOUNDS.max);
    const g = await geometry(page);
    // Rows straddling the seam: the last row of the bar, then four inside the
    // drawer's head. V1.2 drew a --border-i rule across exactly here — the
    // "strips stacked on the drawer" this task removes — and the head band
    // above the stage was --canvas. Both would show up as a row that is not
    // the stage's own colour.
    //
    // Measured against the stage rather than against each other, deliberately:
    // the bar's foot is a gradient and its neighbouring rows differ by design.
    // What "no line" means is that nothing here is a colour the surface does
    // not have.
    const top = Math.round(g.drawerTop);
    const column = [-1, 0, 1, 2, 3].map((offset) => ({ x: g.emptyX, y: top + offset }));
    const painted = await pixels(page, column);
    const stage = painted[painted.length - 1]!;
    painted.forEach((sample, index) => {
      expect(
        channelDistance(sample, stage),
        `${mode}: a line at the seam, ${column[index]!.y - top}px from the drawer's edge`,
      ).toBeLessThanOrEqual(PAINT_TOLERANCE + 4);
    });

    // V1.6 VB-30 CHANGES WHAT "ONE SURFACE" MEANS BELOW THE SEAM, and this is
    // the half of this test that had to move with it. Until V1.6 the head band
    // and the drawer's content were the same colour in both modes, because the
    // band followed the mode. The band is the Brain visual's dark field in both
    // modes now, so in List it deliberately sits ON a light pane — the bar
    // belongs to the chrome, not to the view under it.
    //
    // What is still asserted, and is the whole of VB-30: the band is the SAME
    // colour in both modes, and it is the colour the Brain visual's own field
    // is (sampled from the stage in Brain, where band and pane still agree).
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

/**
 * THE ASSERTION THIS WHOLE TASK IS MOST LIKELY TO SHIP A REGRESSION IN.
 *
 * Every control in the bar, at three drag heights, in both modes, measured:
 *
 *  - its label against the ground the label is actually on. If the control has
 *    an opaque background of its own, that is the ground — the gradient passes
 *    behind it, which is the whole reason the buttons have one. If it does not,
 *    the ground is the painted pixel behind the label, whatever the ramp
 *    happens to be there.
 *  - its boundary against the ramp beside it, at its bottom edge, its middle
 *    and its top edge. A control with neither a border nor an opaque ground
 *    claims no boundary and is identified by its text alone, so it is not held
 *    to 1.4.11 — and the text check above is then the one doing the work.
 */
test('every nav control clears the floor at min, mid and max drag, in both modes (VB-22)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const measured: string[] = [];

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const g = await geometry(page);

      for (const label of [S.back, S.next, S.skip]) {
        const button: Locator = page.locator('.flow-foot').getByRole('button', { name: label, exact: true });
        await expect(button).toHaveCount(1);
        const where = `${mode} at ${name}: ${label}`;

        const style = await button.evaluate((el) => {
          const s = getComputedStyle(el);
          const box = el.getBoundingClientRect();
          return {
            color: s.color,
            background: s.backgroundColor,
            border: s.borderTopColor,
            borderWidth: parseFloat(s.borderTopWidth) || 0,
            top: box.top,
            bottom: box.bottom,
            centreX: box.left + box.width / 2,
            centreY: box.top + box.height / 2,
          };
        });

        const ink = parseCssColor(style.color);
        expect(ink, `${where}: unreadable text colour`).not.toBeNull();
        const own = parseCssColor(style.background);

        // The ground the label is read against.
        let ground: Rgb;
        if (isOpaque(own)) {
          ground = own;
        } else {
          [ground] = (await pixels(page, [{ x: style.centreX, y: style.centreY }])) as [Rgb];
        }
        const text = contrastRatio(ink!, ground);
        measured.push(`${where} — text ${text.toFixed(2)}:1`);
        expect(text, `${where}: label on its ground`).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);

        // The outer edge, if it claims one: the border when it is drawn and
        // opaque, otherwise the opaque ground itself.
        const border = parseCssColor(style.border);
        const edge = style.borderWidth > 0 && isOpaque(border) ? border : isOpaque(own) ? own : null;
        if (!edge) {
          measured.push(`${where} — no boundary claimed, identified by its text`);
          continue;
        }

        // The ramp beside it, read from a column with no control on it, at the
        // three heights the control's own edge passes through.
        const beside = await pixels(
          page,
          [style.bottom - 1, style.centreY, style.top + 1].map((y) => ({ x: g.emptyX, y })),
        );
        for (const [index, sample] of beside.entries()) {
          const at = ['bottom edge', 'middle', 'top edge'][index]!;
          const ratio = contrastRatio(edge, sample);
          measured.push(`${where} — boundary at its ${at} ${ratio.toFixed(2)}:1`);
          expect(ratio, `${where}: boundary against the ramp at its ${at}`).toBeGreaterThanOrEqual(
            DOCK_BOUNDARY_MIN_CONTRAST,
          );
        }
      }
    }
  }

  // Printed, so a run says what the numbers were and not only that they passed.
  console.log(`\n  VB-22 measured contrast\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
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
        clip: { x: 0, y: g.navTop - 10, width: PANEL.width, height: NAV_RAMP_HEIGHT + 64 },
      });
    }
  }

  await context.close();
});
