import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds } from '../../src/core/drawer/height';
import { BRAIN_MIN_HEIGHT } from '../../src/core/drawer/mode';
import { DOCK_BOUNDARY_MIN_CONTRAST, DOCK_TEXT_MIN_CONTRAST } from '../../src/core/drawer/chrome';
import { channelDistance, contrastRatio, isOpaque, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.9 VB-50 accept criteria, driven in a real browser.
 *
 * "The whole panel is a single colour. No hover tint, no pressed state, no
 * 'default to background' — buttons through to the bottom bar read as one fluid
 * piece of app rather than controls sitting on a surface."
 *
 * Four claims, and every one of them is about paint, so every assertion here is
 * made on paint:
 *
 *  1. **ONE COLOUR.** The drawer is sampled down its whole height, in both
 *     modes, at both drag ends. A stylesheet that sets one background and a
 *     screen that shows three are the same stylesheet, which is why this walks
 *     the pixels rather than reading a rule.
 *  2. **THE RING SURVIVED.** Adam's decision of 2026-08-24: "'No tone change on
 *     click' removes the tint, not the ring. Pressed states may go; focus
 *     states may not." So every focusable control in the drawer — the handle,
 *     the trail's rungs, the file chips, the work shelf, the tree's rows and
 *     disclosures, the two view glyphs — is focused with a key and its ring is
 *     read back. This is the assertion the task is most likely to ship a
 *     regression in, because removing outlines is the fastest way to make a
 *     surface look seamless.
 *  3. **EVERYTHING IS STILL LEGIBLE ON IT.** Removing the tints removed the
 *     grounds these controls were being measured against. Each one's ink is
 *     therefore re-measured against the pixel really painted behind it: 4.5:1
 *     for text, 3:1 for a glyph or a boundary (docs/GUARDRAILS.md).
 *  4. **HOVER STILL SAYS SOMETHING.** Without a tint, a control that does
 *     nothing on hover reads as dead. Every hoverable control has to change in
 *     a way that is not a background: a line under the word, a bar under the
 *     glyph, or the ink lifting.
 *
 * It also carries the three assertions that outlived tests/e2e/drawer-frame.spec.ts.
 * That file was V1.6 VB-29's, and VB-50 deletes the frame it was written about —
 * but three of its tests were never about the frame: the grip straddles the
 * drawer's top edge, the controls at the drawer's edges keep their 44px, and
 * nothing inside is clipped or pushed sideways. They are here rather than
 * deleted with the rest.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb50');
const PANEL = { width: 400, height: 760 };
const BOUNDS = drawerBounds(PANEL.height);

/** How far a painted pixel may sit from the colour we asked for before the two
 * are disagreeing rather than rounding. */
const PAINT_TOLERANCE = 4;

/** The one column of the panel with no control on it at any height, in any
 * mode: the trail pads 8px, the list's body pads 14, the stage pads 10, and the
 * grip is centred. Two pixels in is ground everywhere. */
const GROUND_X = 2;

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** The same fixture the VB-22, VB-29 and VB-41 specs use: far enough in that
 * the file has written, current and untouched sections. */
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
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.filedrawer-handle');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: S.next, exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  // The question types itself in; let it finish so nothing is mid-print when a
  // screenshot is taken.
  await page.waitForTimeout(900);
  await page.mouse.move(2, 2);
  return page;
}

/**
 * Every pixel this spec judges comes through here — a screenshot decoded back
 * inside the page onto a canvas, which is the only way to read what was painted
 * without a decoding dependency (docs/DEPENDENCIES.md: two runtime
 * dependencies, and no good reason for a third). Device pixel ratio is 1, so a
 * CSS pixel is a screenshot pixel.
 *
 * One shot per call rather than per point: a column of two hundred pixels is
 * one screenshot, and the whole column is guaranteed to be the same frame.
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
  // The pointer is left over the panel after a drag and would put a hover state
  // into every measurement below; park it somewhere harmless.
  await page.mouse.move(2, 2);
}

async function chooseMode(page: Page, mode: 'brain' | 'list'): Promise<void> {
  await page
    .getByRole('button', { name: mode === 'brain' ? S.drawerModeBrain : S.drawerModeList, exact: true })
    .click();
  await expect(page.locator('.flowshell')).toHaveAttribute('data-stage', mode);
  await page.mouse.move(2, 2);
  // The morph and the drawer's settle.
  await page.waitForTimeout(700);
}

/** The two drag ends, per mode. Brain hands over to List below its own minimum
 * (core/drawer/mode.ts), so testing Brain lower than that tests List twice. */
function heightsFor(mode: 'brain' | 'list'): { name: string; height: number }[] {
  const lowest = mode === 'brain' ? Math.max(BOUNDS.min, BRAIN_MIN_HEIGHT) : BOUNDS.min;
  return [
    { name: 'min', height: lowest },
    { name: 'max', height: BOUNDS.max },
  ];
}

/* ── 1. ONE COLOUR ───────────────────────────────────────────────────────── */

/**
 * V2.0 VB-72 MADE THIS WALK EXACT INSTEAD OF LUCKY, AND FOUND OUT WHY.
 *
 * It used to step three pixels at a time and assert every sample was the field.
 * That passed for two versions because of an alignment nobody chose: the list's
 * rows are 44 tall with a 1px rule between them, so the rules landed on
 * y ≡ 0 (mod 3) and the walk read y ≡ 1. VB-72 lifts the whole body twenty
 * pixels and the same rule starts landing on them.
 *
 * The rules are not a regression and never were. `--dock-line` is the drawer's
 * declared hairline (core/drawer/chrome.ts's `DOCK_LINE_TOKEN`) and the one
 * thing in here deliberately under 3:1, because a divider carries no meaning —
 * VB-50 removed grounds, not rules. So the walk now reads EVERY pixel and holds
 * a stricter claim than the one it was making: each one is the field, or it is
 * that hairline and it is exactly one pixel of it. A pane, a tint or a two-pixel
 * band all fail; the rule between two rows does not.
 */
test('the drawer is one colour, every pixel of its height, in both modes (VB-50)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const field = await tokenColor(page, '--globe-field');
  const canvas = await tokenColor(page, '--canvas');
  // `--dock-line` is declared as this token, in Flow.css, on the shell.
  const line = await tokenColor(page, '--globe-edge-far');
  const measured: string[] = [];

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const where = `${mode} at ${name}`;
      const drawer = (await page.locator('.filedrawer').boundingBox())!;

      // From one pixel below the drawer's top edge to the panel's own last row.
      // That is the handle band, the breadcrumb, the visual, the view bar and
      // — where V1.6 VB-29's frame used to be — the bottom edge itself.
      const column: { x: number; y: number }[] = [];
      for (let y = Math.round(drawer.y) + 1; y < PANEL.height; y += 1) {
        column.push({ x: GROUND_X, y });
      }
      const painted = await pixels(page, column);
      let worst = 0;
      let run = 0;
      let rules = 0;
      const closeRun = (at: number) => {
        if (run === 0) return;
        expect(run, `${where}: a ${run}px band at ${at}px down the drawer, where only a rule may be`).toBeLessThanOrEqual(1);
        rules += 1;
        run = 0;
      };
      painted.forEach((sample, index) => {
        const down = column[index]!.y - Math.round(drawer.y);
        const distance = channelDistance(sample, field);
        if (distance <= PAINT_TOLERANCE) {
          worst = Math.max(worst, distance);
          closeRun(down);
          return;
        }
        // Not the field. The only other thing allowed in this column is the
        // drawer's own hairline between two rows.
        expect(
          channelDistance(sample, line),
          `${where}: ${down}px down the drawer is neither the one colour nor its rule`,
        ).toBeLessThanOrEqual(PAINT_TOLERANCE);
        run += 1;
      });
      closeRun(painted.length);
      measured.push(
        `${where} — ${painted.length} samples, worst ${worst} levels off the field, ${rules} hairlines`,
      );

      // AND THE FRAME IS REALLY GONE. V1.6 VB-29 put 8px of --canvas down both
      // sides and across the bottom; drawer-frame.spec.ts walked in from the
      // edge until the pixels stopped being canvas. This walks the same rows
      // and asserts the opposite: the very first pixel of each edge is already
      // the field. A frame narrower than 8px would have passed a loosened
      // version of the old test and fails this one.
      const edges = await pixels(page, [
        { x: 0, y: Math.round(drawer.y + drawer.height / 2) },
        { x: PANEL.width - 1, y: Math.round(drawer.y + drawer.height / 2) },
        { x: Math.round(PANEL.width / 2), y: PANEL.height - 1 },
      ]);
      for (const [index, pixel] of edges.entries()) {
        const side = ['left', 'right', 'bottom'][index];
        expect(channelDistance(pixel, field), `${where}: the ${side} edge is not the field`).toBeLessThanOrEqual(
          PAINT_TOLERANCE,
        );
        expect(channelDistance(pixel, canvas), `${where}: a white frame is back on the ${side}`).toBeGreaterThan(
          40,
        );
      }

      // No rounded corners left either: the drawer's own box declares none, so
      // the panel's bottom corners are the field rather than the canvas showing
      // through a curve.
      const [corner] = await pixels(page, [{ x: 0, y: PANEL.height - 1 }]);
      expect(channelDistance(corner!, field), `${where}: the bottom left corner is rounded`).toBeLessThanOrEqual(
        PAINT_TOLERANCE,
      );
    }
  }

  console.log(`\n  VB-50 one colour\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
  await context.close();
});

/* ── V2.0 VB-69: THE ONE GROUND VB-50 MISSED ─────────────────────────────
 *
 * The test above walks x = 2, and x = 2 is beside the globe rather than
 * through it. That is exactly the column in which the stage's own field was
 * invisible — same token, same colour — while a person looking at the panel
 * saw a lighter rounded rectangle in the middle of the drawer, because what
 * drew it was the stage's radial GLOW and not its flat fill.
 *
 * So this walks the column the other test cannot: down the middle, through the
 * picture's own box. Two halves, because there were two grounds to remove:
 *
 *   · WITH THE PICTURE HIDDEN, every pixel of that column is the one colour.
 *     Hiding `.brainglobe`'s children leaves the stage's own box painting
 *     whatever it paints, so a `background` put back on `.brainglobe` fails
 *     here even though it would be the very same token.
 *   · WITH THE PICTURE SHOWING, the top inch of the stage's box — where the
 *     radial was at its brightest and where nothing is drawn — is the one
 *     colour too. The gradient measured about eleven levels above the field
 *     there, which is three times PAINT_TOLERANCE.
 *
 * And the way out of a file (VB-59's disc) is asked what it fills, because it
 * was the second `background: var(--globe-field)` in the file: a fill that
 * repainted the surface it stands on in order to punch a hole in the picture.
 */
test('the stage has no ground of its own — one colour through the visual (VB-69)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const field = await tokenColor(page, '--globe-field');
  const measured: string[] = [];

  await chooseMode(page, 'brain');
  for (const { name, height } of heightsFor('brain')) {
    await setHeight(page, height);
    const where = `brain at ${name}`;
    const drawer = (await page.locator('.filedrawer').boundingBox())!;
    const stage = (await page.locator('.brainglobe').boundingBox())!;
    const middle = Math.round(stage.x + stage.width / 2);
    /**
     * WHAT THE COLUMN IS ALLOWED TO MISS.
     *
     * Straight down the middle of the picture is also straight down the middle
     * of the grip, and at the smallest stage it passes the trail's words and
     * the two view glyphs as well. Those are ink, not ground, and this test is
     * about ground — so the rows they stand on are dropped, from their real
     * boxes at this height rather than from a guess about where a word ends.
     * Everything else in the column is ground and has to be the one colour.
     */
    const taken = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.filedrawer-grip, .crumbs-item, .crumbs-count, .filedrawer-viewbar button',
        ),
      ].map((el) => {
        const box = el.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      }),
    );
    const isGround = (x: number, y: number): boolean =>
      taken.every((box) => x < box.left - 3 || x > box.right + 3 || y < box.top - 3 || y > box.bottom + 3);

    // THE PICTURE SHOWING. Two pixels inside the top edge of the stage's box,
    // across it — clear of the topmost orb and of the disc in the corner, and
    // right where the radial's centre used to spill.
    const rim = await pixels(
      page,
      [0.25, 0.5, 0.75].map((across) => ({
        x: Math.round(stage.x + stage.width * across),
        y: Math.round(stage.y) + 2,
      })),
    );
    for (const [index, pixel] of rim.entries()) {
      expect(
        channelDistance(pixel, field),
        `${where}: the top of the stage's box, ${[25, 50, 75][index]}% across, is not the drawer's colour`,
      ).toBeLessThanOrEqual(PAINT_TOLERANCE);
    }

    // THE PICTURE HIDDEN. `visibility` on the children only: the box itself
    // still paints, which is the whole point of hiding them one level down.
    await page.locator('.brainglobe').evaluate((root) => {
      for (const child of [...root.children]) (child as HTMLElement).style.visibility = 'hidden';
    });
    const column: { x: number; y: number }[] = [];
    for (let y = Math.round(drawer.y) + 1; y < PANEL.height; y += 3) {
      if (isGround(middle, y)) column.push({ x: middle, y });
    }
    const painted = await pixels(page, column);
    let worst = 0;
    painted.forEach((sample, index) => {
      const distance = channelDistance(sample, field);
      worst = Math.max(worst, distance);
      expect(
        distance,
        `${where}: ${column[index]!.y - Math.round(drawer.y)}px down the middle of the drawer is not the one colour`,
      ).toBeLessThanOrEqual(PAINT_TOLERANCE);
    });
    // ...and the walk really did cross the stage rather than skirting it: the
    // rows inside the picture's own box are most of what was sampled.
    const inStage = column.filter((point) => point.y > stage.y && point.y < stage.y + stage.height).length;
    expect(inStage, `${where}: the column missed the stage`).toBeGreaterThan(stage.height / 6);
    measured.push(
      `${where} — ${painted.length} samples down the middle (${inStage} inside the picture), worst ${worst} levels off the field`,
    );
    await page.locator('.brainglobe').evaluate((root) => {
      for (const child of [...root.children]) (child as HTMLElement).style.visibility = '';
    });
  }

  // And said in the stylesheet as well as in the pixels. A flat fill in the
  // field's own token is invisible in a screenshot — that is exactly why it
  // survived VB-50 — so the box is also asked what it declares.
  const box = parseCssColor(await page.locator('.brainglobe').evaluate((el) => getComputedStyle(el).backgroundColor));
  expect(isOpaque(box), 'the stage declares a ground of its own').toBe(false);

  // The way out: words standing on the surface, never a fill of their own —
  // VB-59's disc and VB-69's second removal established the claim on the
  // corner control; V2.1 VB-74 moved the control to the nav band and the
  // claim moved with it.
  const navOut = page.locator('.brainglobe-nav-btn').first();
  await expect(navOut).toBeVisible();
  const fill = parseCssColor(await navOut.evaluate((el) => getComputedStyle(el).backgroundColor));
  expect(isOpaque(fill), 'the way out paints a ground of its own').toBe(false);

  console.log(`\n  VB-69 through the stage\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
  await context.close();
});

test('no element inside the drawer paints a ground that is not the one colour (VB-50)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const field = await tokenColor(page, '--globe-field');

  /**
   * THE COLUMN THE TEST ABOVE CANNOT SEE.
   *
   * A pixel walk down one column proves that column. It cannot prove a ground
   * that is inset from it — a row whose own box starts fourteen pixels in, a
   * chip, a card — and those are exactly the grounds VB-50 removes. So this
   * walks the DOM instead and asks every element in the drawer what it paints.
   *
   * Two things are excluded, and both are the same distinction rather than a
   * convenience. `.brainglobe` is the PICTURE, and a picture with a light
   * source in it (V1.9 VB-54) has depth by design. `.filetree-glyph` is that
   * same picture's orb, standing in a row since V1.8 VB-45 — its fill is a
   * SPHERE, not a ground, which is why VB-45 could put it in both views at
   * once. VB-50 is about the surface controls sit on, not about flattening the
   * marks drawn on it.
   */
  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    await setHeight(page, BOUNDS.max);
    const painted = await page.locator('.filedrawer').evaluate((root) => {
      const found: { where: string; colour: string }[] = [];
      for (const element of root.querySelectorAll<HTMLElement>('*')) {
        if (element.closest('.brainglobe') || element.closest('.filetree-glyph')) continue;
        const colour = getComputedStyle(element).backgroundColor;
        // Anything with any opacity at all, however slight.
        if (/^rgba\(.*,\s*0\)$/.test(colour) || colour === 'transparent') continue;
        found.push({
          where: `${element.tagName.toLowerCase()}.${element.className.toString().split(' ')[0]}`,
          colour,
        });
      }
      return found;
    });

    for (const ground of painted) {
      const parsed = parseCssColor(ground.colour);
      expect(parsed, `${mode}: unreadable background on ${ground.where}`).not.toBeNull();
      expect(
        channelDistance(parsed!, field),
        `${mode}: ${ground.where} paints ${ground.colour}, which is not the drawer's one colour`,
      ).toBeLessThanOrEqual(PAINT_TOLERANCE);
    }
    expect(painted.length, `${mode}: nothing in the drawer paints at all`).toBeGreaterThan(0);
  }

  await context.close();
});

/* ── The inventory every remaining test walks ────────────────────────────── */

interface Control {
  /** What it is, for a failure message. */
  what: string;
  locator: Locator;
  /** Text has to clear 4.5:1; a glyph or a boundary clears 3:1. */
  kind: 'text' | 'glyph';
  /** Where the ring is drawn, if it is not on the control itself — the file
   * chips put it on the chip, because on the button it would enclose eight
   * pixels of empty space above and below the only thing anybody can see. */
  ring?: string;
}

/**
 * Every focusable control the drawer can show, in the state that shows it.
 *
 * Two of them are behind a press — the file chips live inside the breadcrumb's
 * disclosure, and the work shelf only exists at the tier above the file — so
 * this opens each in turn rather than pretending the drawer has one screen.
 */
async function controlsInDrawer(page: Page): Promise<Control[]> {
  const drawer = page.locator('.filedrawer');
  const controls: Control[] = [
    {
      what: 'the drag handle',
      locator: page.locator('.filedrawer-handle'),
      kind: 'glyph',
      // V2.0 VB-72: the handle's target reaches above the drawer's top edge for
      // the last twenty of its 44, where the dock's ring measures 1.69:1 on the
      // panel's canvas. The ring is on the band inside the drawer — the same
      // move the chips below make, for the same reason.
      ring: '.filedrawer-handle-band',
    },
    {
      what: 'the Work brain rung',
      locator: drawer.getByRole('button', { name: S.crumbWork, exact: true }),
      kind: 'text',
    },
    { what: 'the file rung', locator: page.locator('.crumbs-seg[data-seg="file"]'), kind: 'text' },
    {
      what: 'the Brain view glyph',
      locator: drawer.getByRole('button', { name: S.drawerModeBrain, exact: true }),
      kind: 'glyph',
    },
    {
      what: 'the List view glyph',
      locator: drawer.getByRole('button', { name: S.drawerModeList, exact: true }),
      kind: 'glyph',
    },
    { what: 'a section row', locator: page.locator('.filetree-nav').first(), kind: 'text' },
    { what: 'a section disclosure', locator: page.locator('.filetree-toggle').first(), kind: 'glyph' },
  ];
  return controls;
}

/** The ring on one control, read the way a person reaching for one reaches:
 * with a key, because `:focus-visible` is a statement about how focus arrived
 * and Chrome will not match a programmatic focus after a mouse. */
async function ringOf(page: Page, control: Control): Promise<{
  style: string;
  width: number;
  colour: Rgb | null;
  box: { top: number; bottom: number; left: number; right: number };
}> {
  await page.keyboard.press('Tab');
  await control.locator.focus();
  return control.locator.evaluate((el, selector) => {
    const painted = (selector ? el.querySelector(selector) : el) as HTMLElement;
    const style = getComputedStyle(painted);
    const box = painted.getBoundingClientRect();
    return {
      style: style.outlineStyle,
      width: parseFloat(style.outlineWidth) || 0,
      colour: style.outlineColor,
      box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
    };
  }, control.ring ?? null).then((read) => ({ ...read, colour: parseCssColor(read.colour) }));
}

/* ── 2. THE RING SURVIVED ────────────────────────────────────────────────── */

test('every focusable control in the drawer still shows a ring (VB-50)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, BOUNDS.max);
  const accent = await tokenColor(page, '--globe-focus');
  const field = await tokenColor(page, '--globe-field');
  const measured: string[] = [];

  // The ring the whole drawer focuses with has to be a legal indicator on the
  // one surface in the first place. --primary is 2.90:1 here, which is why it
  // is not this (Flow.css, core/drawer/chrome.ts).
  expect(contrastRatio(accent, field), 'the drawer’s ring on its own field').toBeGreaterThanOrEqual(
    DOCK_BOUNDARY_MIN_CONTRAST,
  );

  const check = async (control: Control) => {
    const ring = await ringOf(page, control);
    expect(ring.style, `${control.what}: no visible focus ring`).not.toBe('none');
    expect(ring.width, `${control.what}: focus ring under 2px`).toBeGreaterThanOrEqual(2);
    expect(ring.colour, `${control.what}: unreadable ring colour`).not.toBeNull();
    expect(
      channelDistance(ring.colour!, accent),
      `${control.what}: the ring is not the drawer’s accent`,
    ).toBeLessThanOrEqual(PAINT_TOLERANCE);
    measured.push(`${control.what} — ${ring.width}px ${ring.style}`);
  };

  for (const control of await controlsInDrawer(page)) await check(control);

  // The file chips, which only exist while the trail is offering the files.
  await page.locator('.crumbs-seg[data-seg="file"]').click();
  await expect(page.locator('.crumbs')).toHaveAttribute('data-open', 'true');
  for (const file of ['context', 'skills', 'actions']) {
    await check({
      what: `the ${file} chip`,
      locator: page.locator(`.crumbs-file[data-file="${file}"]`),
      kind: 'text',
      // On the button the ring would enclose eight pixels of empty space above
      // and below the only thing anybody can see (Breadcrumb.css).
      ring: '.crumbs-chip',
    });
  }
  await page.keyboard.press('Escape');

  // And the work shelf, which is the list one tier up.
  await page.getByRole('button', { name: S.crumbWork, exact: true }).click();
  await page.waitForSelector('.workshelf-row');
  await check({ what: 'a work shelf row', locator: page.locator('.workshelf-row').first(), kind: 'text' });

  console.log(`\n  VB-50 focus rings\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
  await context.close();
});

/* ── 3. LEGIBLE ON THE FIELD ─────────────────────────────────────────────── */

test('every control is measured against the pixel really painted behind it (VB-50)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, BOUNDS.max);
  const measured: string[] = [];

  /** The ground behind one control: sampled inside its own hit box but above
   * and below whatever it prints, so it is the ground under THAT control
   * rather than a hopeful reading off some other part of the drawer. */
  const groundBehind = async (control: Control): Promise<Rgb[]> => {
    const box = (await control.locator.boundingBox())!;
    // Six pixels up from the bottom rather than two: the chosen view and the
    // file you are in wear a 2px accent bar along their own bottom edge now
    // (it is what replaced their fill), and a probe two pixels up lands on the
    // bar and measures the ink against itself.
    return pixels(page, [
      { x: box.x + box.width / 2, y: box.y + 3 },
      { x: box.x + box.width / 2, y: box.y + box.height - 6 },
    ]);
  };

  const check = async (control: Control) => {
    const style = await control.locator.evaluate((el) => {
      const read = getComputedStyle(el);
      return { color: read.color, background: read.backgroundColor };
    });
    const ink = parseCssColor(style.color);
    expect(ink, `${control.what}: unreadable ink`).not.toBeNull();
    // NO GROUND OF ITS OWN. This is the assertion that fails if someone puts a
    // tint back: every control in the drawer is transparent, at rest.
    expect(isOpaque(parseCssColor(style.background)), `${control.what} has a background of its own`).toBe(
      false,
    );
    const floor = control.kind === 'text' ? DOCK_TEXT_MIN_CONTRAST : DOCK_BOUNDARY_MIN_CONTRAST;
    for (const ground of await groundBehind(control)) {
      const ratio = contrastRatio(ink!, ground);
      expect(ratio, `${control.what}: ${control.kind} on the ground behind it`).toBeGreaterThanOrEqual(floor);
    }
    const ratio = contrastRatio(ink!, (await groundBehind(control))[0]!);
    measured.push(`${control.what} — ${ratio.toFixed(2)}:1 (${control.kind}, floor ${floor})`);
  };

  for (const control of await controlsInDrawer(page)) {
    // The handle prints nothing: its ink is not what is on screen, the grip's
    // two bars are (FileDrawer.css). Measured as the bar against the band.
    if (control.what === 'the drag handle') {
      const bar = parseCssColor(
        await page.locator('.filedrawer-grip').evaluate((el) => getComputedStyle(el, '::before').backgroundColor),
      );
      const band = (await page.locator('.filedrawer-head').boundingBox())!;
      const [ground] = await pixels(page, [{ x: band.x + 4, y: band.y + band.height / 2 }]);
      const ratio = contrastRatio(bar!, ground!);
      expect(ratio, 'the grip’s bars on the band').toBeGreaterThanOrEqual(DOCK_BOUNDARY_MIN_CONTRAST);
      measured.push(`the grip’s two bars — ${ratio.toFixed(2)}:1 (glyph, floor ${DOCK_BOUNDARY_MIN_CONTRAST})`);
      continue;
    }
    await check(control);
  }

  // The things in the list that are not controls but carry the file's state —
  // the count, the percentage and the section name. Removing the light pane
  // moved them onto the field, so they are read there. (A fourth stood here
  // until V2.0 VB-55: the health pill, which is no longer drawn on a row at
  // all. Its entry is deleted rather than left to be skipped by the
  // zero-count guard below, which would report a pass for a thing nobody
  // measured.)
  const readings: { what: string; ink: string; box: Locator }[] = [
    { what: 'the section name', ink: '.filetree-label', box: page.locator('.filetree-row').first() },
    { what: 'the meta count', ink: '.filetree-count', box: page.locator('.filetree-row').first() },
    { what: 'the percentage', ink: '.filetree-percent', box: page.locator('.filetree-row').first() },
    { what: 'the preview note', ink: '.filepreview-note', box: page.locator('.filepreview') },
  ];
  for (const reading of readings) {
    const element = reading.box.locator(reading.ink).first();
    if ((await element.count()) === 0) continue;
    const ink = parseCssColor(await element.evaluate((el) => getComputedStyle(el).color))!;
    const box = (await element.boundingBox())!;
    // Just outside the printed box, on the same row: the field it stands on.
    const [ground] = await pixels(page, [{ x: Math.max(2, box.x - 6), y: box.y + box.height / 2 }]);
    const ratio = contrastRatio(ink, ground!);
    expect(ratio, `${reading.what} on the field`).toBeGreaterThanOrEqual(DOCK_TEXT_MIN_CONTRAST);
    measured.push(`${reading.what} — ${ratio.toFixed(2)}:1 (text, floor ${DOCK_TEXT_MIN_CONTRAST})`);
  }

  console.log(`\n  VB-50 measured contrast on the one field\n${measured.map((l) => `    ${l}`).join('\n')}\n`);
  await context.close();
});

/* ── 4. HOVER STILL SAYS SOMETHING ───────────────────────────────────────── */

test('hover changes something, and that something is never a ground (VB-50)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, BOUNDS.max);
  const measured: string[] = [];

  /** What a control looks like, in the three properties hover is allowed to
   * move: the ink, the line under it, and the bar under a glyph. */
  const look = (locator: Locator, inner: string | null) =>
    locator.evaluate((el, selector) => {
      const target = (selector ? el.querySelector(selector) : el) as HTMLElement;
      const style = getComputedStyle(target);
      return {
        background: style.backgroundColor,
        color: style.color,
        decoration: style.textDecorationLine,
        shadow: style.boxShadow,
      };
    }, inner);

  const hoverable: { what: string; locator: Locator; inner: string | null }[] = [
    { what: 'the Work brain rung', locator: page.locator('.crumbs-seg[data-seg="work"]'), inner: '.crumbs-label' },
    { what: 'the file rung', locator: page.locator('.crumbs-seg[data-seg="file"]'), inner: '.crumbs-label' },
    {
      what: 'the unpressed view glyph',
      locator: page.getByRole('button', { name: S.drawerModeBrain, exact: true }),
      inner: null,
    },
    { what: 'a section row', locator: page.locator('.filetree-nav').first(), inner: '.filetree-label' },
    { what: 'a section disclosure', locator: page.locator('.filetree-toggle').first(), inner: '::self' },
  ];

  for (const control of hoverable) {
    const inner = control.inner === '::self' ? null : control.inner;
    const before = await look(control.locator, inner);
    await control.locator.hover();
    await page.waitForTimeout(200);
    const after = await look(control.locator, inner);

    // The ground never moves — that is the whole of VB-50.
    expect(isOpaque(parseCssColor(after.background)), `${control.what}: hover put a tint back`).toBe(false);
    // But something does, or the panel is dead under the pointer.
    const changed =
      before.color !== after.color ||
      before.decoration !== after.decoration ||
      before.shadow !== after.shadow;
    expect(changed, `${control.what}: nothing at all happens on hover`).toBe(true);
    const how = [
      before.color !== after.color ? 'ink' : null,
      before.decoration !== after.decoration ? 'underline' : null,
      before.shadow !== after.shadow ? 'bar' : null,
    ]
      .filter(Boolean)
      .join(' + ');
    measured.push(`${control.what} — ${how}`);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(150);
  }

  // And the chosen view, which is the one state VB-50 could have deleted by
  // accident: no fill, but a bar and a heavier stroke, so it still reads with
  // every hue stripped out.
  const chosen = page.getByRole('button', { name: S.drawerModeList, exact: true });
  await expect(chosen).toHaveAttribute('aria-pressed', 'true');
  const pressed = await chosen.evaluate((el) => ({
    fill: getComputedStyle(el).backgroundColor,
    bar: getComputedStyle(el).boxShadow,
    stroke: getComputedStyle(el.querySelector('svg')!).strokeWidth,
    quiet: getComputedStyle(el.parentElement!.querySelector('[aria-pressed="false"]')!.querySelector('svg')!)
      .strokeWidth,
  }));
  expect(isOpaque(parseCssColor(pressed.fill)), 'the chosen view still has a fill').toBe(false);
  expect(pressed.bar, 'the chosen view has no bar').not.toBe('none');
  expect(parseFloat(pressed.stroke), 'the chosen view is not the heavier glyph').toBeGreaterThan(
    parseFloat(pressed.quiet),
  );

  console.log(`\n  VB-50 hover\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
  await context.close();
});

/* ── What outlived drawer-frame.spec.ts ──────────────────────────────────── */

test('nothing in the drawer is clipped, and the edge controls keep their 44px (VB-50, was VB-29)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const where = `${mode} at ${name}`;
      const drawer = (await page.locator('.filedrawer').boundingBox())!;

      // THE GRIP STILL STRADDLES THE TOP EDGE. It is half above the drawer by
      // design, and the reason V1.6's frame could never be drawn with
      // `overflow: hidden`. Measured on the paint: its top bar is light against
      // the panel's white, so a dark pixel above the drawer's edge is the top
      // half of the grip still being drawn.
      const grip = (await page.locator('.filedrawer-grip').boundingBox())!;
      expect(grip.y, `${where}: the grip does not straddle the edge`).toBeLessThan(drawer.y);
      const field = await tokenColor(page, '--globe-field');
      // Two pixels down from the grip's own top edge — above its two bars,
      // which start at four — so what is read is the grip's GROUND. Inside the
      // drawer that ground is invisible; up here, over the panel's white, it is
      // the whole reason the bars are legible at all.
      const above = await pixels(
        page,
        Array.from({ length: 8 }, (_, i) => ({ x: Math.round(grip.x + 12 + i), y: Math.round(grip.y + 2) })),
      );
      const onGrip = above.filter((pixel) => channelDistance(pixel, field) <= PAINT_TOLERANCE).length;
      expect(onGrip, `${where}: the grip’s top half is not painted`).toBeGreaterThan(4);

      for (const label of [S.drawerModeBrain, S.drawerModeList]) {
        const button = (await page.getByRole('button', { name: label, exact: true }).boundingBox())!;
        expect(button.width, `${where}: ${label} width`).toBeGreaterThanOrEqual(44);
        expect(button.height, `${where}: ${label} height`).toBeGreaterThanOrEqual(44);
      }
      const handle = (await page.locator('.filedrawer-handle').boundingBox())!;
      expect(handle.height, `${where}: the handle's target`).toBeGreaterThanOrEqual(44);

      if (mode === 'list') {
        const toggle = await page.locator('.filetree-toggle').first().boundingBox();
        if (toggle) {
          expect(toggle.width, `${where}: the disclosure's target`).toBeGreaterThanOrEqual(44);
          expect(toggle.x + toggle.width, `${where}: the disclosure is off the panel`).toBeLessThanOrEqual(
            PANEL.width + 0.5,
          );
        }
        // A 400px panel may never scroll horizontally.
        const body = await page.locator('.filedrawer-body').evaluate((el) => ({
          scroll: el.scrollWidth,
          client: el.clientWidth,
        }));
        expect(body.scroll, `${where}: the list overflows sideways`).toBeLessThanOrEqual(body.client);
      } else {
        // The globe is sized from the room the drawer really leaves
        // (core/drawer/mode.ts) — eight pixels taller and sixteen wider than
        // before, now the frame is gone — so it has to still FIT.
        const stage = (await page.locator('.filedrawer-stage').boundingBox())!;
        const globe = (await page.locator('.brainglobe').boundingBox())!;
        expect(globe.x, `${where}: the globe is cut off at the left`).toBeGreaterThanOrEqual(stage.x - 0.5);
        expect(globe.x + globe.width, `${where}: the globe is cut off at the right`).toBeLessThanOrEqual(
          stage.x + stage.width + 0.5,
        );
        expect(globe.y + globe.height, `${where}: the globe is cut off at the bottom`).toBeLessThanOrEqual(
          stage.y + stage.height + 0.5,
        );
      }
    }
  }

  await context.close();
});

/* ── For a person to look at ─────────────────────────────────────────────── */

test('the one surface, in both modes and with a ring up — for a person to look at (VB-50)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, `${mode}-${name}.png`) });
      const drawer = (await page.locator('.filedrawer').boundingBox())!;
      // The two places a second colour used to be: the seam at the top, and
      // the bottom left corner where V1.6's frame turned.
      await page.screenshot({
        path: path.join(SHOTS, `${mode}-${name}-corner.png`),
        clip: { x: 0, y: PANEL.height - 60, width: 200, height: 60 },
      });
      await page.screenshot({
        path: path.join(SHOTS, `${mode}-${name}-seam.png`),
        clip: { x: 0, y: Math.max(0, drawer.y - 40), width: PANEL.width, height: 100 },
      });
    }
  }

  // A ring, up, on the chrome and in the list — the state the whole "the tint
  // goes, the ring stays" decision exists to protect, and the one a screenshot
  // pass would otherwise never show.
  await chooseMode(page, 'list');
  await setHeight(page, BOUNDS.max);
  await page.keyboard.press('Tab');
  await page.locator('.crumbs-seg[data-seg="file"]').focus();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'focus-crumb.png') });
  await page.locator('.filetree-nav').first().focus();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'focus-row.png') });
  await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).focus();
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(SHOTS, 'focus-view.png') });

  // And one with the pointer down on a row, so the hover language — a line
  // under the word, never a ground under the control — is on the screen.
  await page.locator('.filetree-nav').first().hover();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'hover-row.png') });

  await context.close();
});
