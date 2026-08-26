import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds } from '../../src/core/drawer/height';
import { BRAIN_MIN_HEIGHT } from '../../src/core/drawer/mode';
import { DOCK_TEXT_MIN_CONTRAST } from '../../src/core/drawer/chrome';
import {
  FLOW_NAV_HEIGHT,
  FLOW_NAV_RING_REACH,
  FLOW_NAV_TARGET,
  navPaintGapAboveDrawer,
  navPaintHeight,
} from '../../src/core/flow/dock';
import { channelDistance, contrastRatio, isOpaque, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.7 VB-41 accept criteria, driven in a real browser.
 *
 * The task took the containers off Back / Next / Skip and the fade out from
 * under them. Both of those were carrying accessibility work, and this file
 * exists to prove the replacements really do it — on the screen, not in the
 * stylesheet:
 *
 *  - **the ground.** A label with no box of its own is read against whatever
 *    is behind it. So every control's ink is measured against the pixel the
 *    browser actually painted behind that control, at three drag heights, in
 *    both drawer modes. The band ought to be flat `--canvas` everywhere now —
 *    but "ought to" is the assumption VB-22's gradient was built to defeat, so
 *    the whole column is sampled rather than one pixel of it.
 *  - **the ring.** It moved from the 44px box you press to the 26px word you
 *    see (components/NavButton.tsx). It has to still be 2px, still visible,
 *    still inside the bar, and — the new one — still clear of the drawer's own
 *    handle underneath.
 *  - **the target.** 44 x 44, unchanged, even though nothing painted is that
 *    big any more. This is the half of V1.3 VB-15's split that is easiest to
 *    lose by accident.
 *  - **the separation.** The actual complaint: the buttons and the grab handle
 *    read as one thing. Measured as the real distance between the last painted
 *    pixel of the cluster and the top of the grip.
 *
 * The last test writes six screenshots — three heights, two modes — because
 * "they read as separate now" is not an assertion, it is something a person
 * has to look at.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb41');
const PANEL = { width: 400, height: 760 };
const BOUNDS = drawerBounds(PANEL.height);

/** How far a painted pixel may sit from the colour we asked for before the two
 * are disagreeing rather than rounding. */
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

/** The same fixture the VB-11, VB-22 and VB-30 specs use. */
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

/** A question carrying the whole cluster — Back, Next and Skip. */
async function openQuestion(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[1]!.id));
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
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
 * A screenshot, decoded back inside the page onto a canvas — the only way to
 * read painted pixels without a decoding dependency, and this repo ships two
 * runtime dependencies and no more (docs/DEPENDENCIES.md). The device pixel
 * ratio is 1 here, so a CSS pixel is a screenshot pixel.
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
  gripTop: number;
  navTop: number;
  navBottom: number;
  navLeft: number;
  navRight: number;
  /** An x with no control on it — the column the band's own colour is sampled
   * from. Computed from the real boxes rather than guessed. */
  emptyX: number;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const nav = document.querySelector('.flow-foot')!.getBoundingClientRect();
    const drawer = document.querySelector('.filedrawer')!.getBoundingClientRect();
    const grip = document.querySelector('.filedrawer-grip')!.getBoundingClientRect();
    const buttons = [...document.querySelectorAll('.flow-foot .btn')].map((b) => b.getBoundingClientRect());
    // Halfway between the panel's edge and the leftmost control: the cluster is
    // centred, so that column is empty for the whole height of the band.
    const emptyX = Math.max(2, Math.min(...buttons.map((b) => b.left)) / 2);
    return {
      drawerTop: drawer.top,
      gripTop: grip.top,
      navTop: nav.top,
      navBottom: nav.bottom,
      navLeft: nav.left,
      navRight: nav.right,
      emptyX,
    };
  });
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
  // The morph, the drawer's settle and the stage's own colour transition.
  await page.waitForTimeout(700);
}

/** The three drag positions every assertion is repeated at, per mode. Brain
 * hands over to List below its own minimum (core/drawer/mode.ts), so testing
 * Brain lower than that would be testing List twice. */
function heightsFor(mode: 'brain' | 'list'): { name: string; height: number }[] {
  const lowest = mode === 'brain' ? Math.max(BOUNDS.min, BRAIN_MIN_HEIGHT) : BOUNDS.min;
  return [
    { name: 'min', height: lowest },
    { name: 'mid', height: Math.round((lowest + BOUNDS.max) / 2) },
    { name: 'max', height: BOUNDS.max },
  ];
}

const LABELS = [S.back, S.next, S.skip];

interface Control {
  label: string;
  ink: Rgb;
  background: Rgb | null;
  borderWidth: number;
  weight: number;
  chevrons: number;
  /** The box you can press. */
  hit: { top: number; bottom: number; left: number; right: number; centreX: number };
  /** The box you can see — the wrapper the ring hugs. */
  paint: { top: number; bottom: number; left: number; right: number };
}

async function controls(page: Page): Promise<Control[]> {
  const read: Control[] = [];
  for (const label of LABELS) {
    const button = page.locator('.flow-foot').getByRole('button', { name: label, exact: true });
    await expect(button, `${label} is not in the cluster`).toHaveCount(1);
    const measured = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      const hit = el.getBoundingClientRect();
      const paint = (el.closest('.navbtn') as HTMLElement).getBoundingClientRect();
      return {
        color: style.color,
        background: style.backgroundColor,
        borderWidth: parseFloat(style.borderTopWidth) || 0,
        weight: Number(style.fontWeight),
        chevrons: el.querySelectorAll('svg').length,
        hit: {
          top: hit.top,
          bottom: hit.bottom,
          left: hit.left,
          right: hit.right,
          centreX: hit.left + hit.width / 2,
        },
        paint: { top: paint.top, bottom: paint.bottom, left: paint.left, right: paint.right },
      };
    });
    const ink = parseCssColor(measured.color);
    expect(ink, `${label}: unreadable text colour`).not.toBeNull();
    read.push({
      label,
      ink: ink!,
      background: parseCssColor(measured.background),
      borderWidth: measured.borderWidth,
      weight: measured.weight,
      chevrons: measured.chevrons,
      hit: measured.hit,
      paint: measured.paint,
    });
  }
  return read;
}

test('the containers are gone, and the fade with them (VB-41)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const canvas = await tokenColor(page, '--canvas');

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const where = `${mode} at ${name}`;
      // V2.3 VB-94: the cluster is in content now, so a room shorter than its
      // question reads scrolled — geometry is taken at the end of the scroll,
      // the one state every layout is actually read in (save-note.spec's own
      // rule, applied here for the same reason).
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(120);
      const g = await geometry(page);

      // V2.3 VB-94: the cluster left the docked band for the content, and
      // the NOTE took its peg — measured in nav-dock.spec now. What this
      // cluster still owes: its own box keeps the band's height (the 44px
      // targets plus the clearance below the paint), and it ends clear of
      // the note's band rather than touching the drawer directly.
      expect(Math.round(g.navBottom - g.navTop), where).toBe(FLOW_NAV_HEIGHT);
      expect(g.navBottom, `${where}: the cluster runs into the note band`).toBeLessThanOrEqual(
        g.drawerTop - FLOW_NAV_HEIGHT + 1,
      );

      // NO CONTAINERS: nothing in the cluster has a ground or an edge of its
      // own. This is the assertion that fails if someone puts the boxes back.
      for (const control of await controls(page)) {
        expect(isOpaque(control.background), `${where}: ${control.label} has a background`).toBe(false);
        expect(control.borderWidth, `${where}: ${control.label} has a border`).toBe(0);
      }

      // NO FADE: the whole band, sampled every 3px from the drawer's edge to
      // the top of it, is the panel's own canvas. A gradient anywhere in here
      // — including the 8px foot VB-22's ramp did most of its work in — shows
      // up as a row that is not --canvas.
      const column: { x: number; y: number }[] = [];
      for (let up = 1; up < FLOW_NAV_HEIGHT; up += 3) {
        column.push({ x: g.emptyX, y: Math.round(g.drawerTop) - up });
      }
      const painted = await pixels(page, column);
      painted.forEach((sample, index) => {
        expect(
          channelDistance(sample, canvas),
          `${where}: ${Math.round(g.drawerTop) - column[index]!.y}px above the handle is not --canvas`,
        ).toBeLessThanOrEqual(PAINT_TOLERANCE);
      });

      // And the drawer's own edge is still the dark stage, one pixel below the
      // last of those. The seam is a plain edge now: that is what "colour
      // alone makes the transition smooth enough" comes down to.
      const [stage] = await pixels(page, [{ x: g.emptyX, y: g.drawerTop + 20 }]);
      expect(contrastRatio(stage!, canvas), `${where}: the seam is not a real edge`).toBeGreaterThan(10);
    }
  }

  await context.close();
});

/**
 * THE ASSERTION THIS TASK IS MOST LIKELY TO SHIP A REGRESSION IN.
 *
 * Every control, at three drag heights, in both modes, with its ink measured
 * against the pixel actually painted behind it — sampled inside its own hit box
 * but above and below the word, so it is the ground under that control rather
 * than a hopeful reading off some other part of the band.
 */
test('every control clears 4.5:1 on the ground behind it, at min, mid and max drag, in both modes (VB-41)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const measured: string[] = [];

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      for (const control of await controls(page)) {
        const where = `${mode} at ${name}: ${control.label}`;
        // Two samples inside the pressable box and outside the painted one:
        // the ground above the word and the ground below it. Sampling the
        // word's own centre would sometimes land on a glyph and measure the
        // ink against itself.
        const grounds = await pixels(page, [
          { x: control.hit.centreX, y: control.hit.top + 2 },
          { x: control.hit.centreX, y: control.hit.bottom - 2 },
        ]);
        for (const [index, ground] of grounds.entries()) {
          const at = index === 0 ? 'above' : 'below';
          const ratio = contrastRatio(control.ink, ground);
          measured.push(`${where} — ${ratio.toFixed(2)}:1 on the ground ${at} it`);
          expect(ratio, `${where}: label on the ground ${at} it`).toBeGreaterThanOrEqual(
            DOCK_TEXT_MIN_CONTRAST,
          );
        }
      }
    }
  }

  console.log(`\n  VB-41 measured contrast\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
  await context.close();
});

test('the target is still 44 x 44 though nothing painted is (VB-41)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const g = await geometry(page);
      for (const control of await controls(page)) {
        const where = `${mode} at ${name}: ${control.label}`;
        expect(control.hit.bottom - control.hit.top, `${where} target height`).toBeGreaterThanOrEqual(
          FLOW_NAV_TARGET,
        );
        expect(control.hit.right - control.hit.left, `${where} target width`).toBeGreaterThanOrEqual(
          FLOW_NAV_TARGET,
        );
        // The painted box is genuinely smaller — this is V1.3 VB-15's split, so
        // it is worth stating that the shrink really happened rather than only
        // that the target survived it.
        expect(Math.round(control.paint.bottom - control.paint.top), `${where} painted height`).toBe(
          navPaintHeight(),
        );
        // The hit box overhangs it evenly, and stays inside the band.
        expect(control.hit.top, `${where} target inside the band`).toBeGreaterThanOrEqual(g.navTop - 0.5);
        expect(control.hit.bottom, `${where} target inside the band`).toBeLessThanOrEqual(g.navBottom + 0.5);
      }
    }
  }

  await context.close();
});

test('the ring hugs the word, and stays inside the band and off the handle (VB-41)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const primary = await tokenColor(page, '--primary');

  for (const { name, height } of heightsFor('brain')) {
    await chooseMode(page, 'brain');
    await setHeight(page, height);
    const g = await geometry(page);

    for (const label of LABELS) {
      const where = `at ${name}: ${label}`;
      const button = page.locator('.flow-foot').getByRole('button', { name: label, exact: true });
      // Reached the way a person reaching for a focus ring reaches for one.
      // `:focus-visible` is a statement about how focus arrived: Chrome only
      // matches a programmatic `focus()` when the last input was a key, and
      // the drag above was a mouse. Without this Tab the ring genuinely is not
      // drawn, and the test would be right to say so.
      await page.keyboard.press('Tab');
      await button.focus();
      const ring = await button.evaluate((el) => {
        const painted = el.closest('.navbtn') as HTMLElement;
        const style = getComputedStyle(painted);
        const box = painted.getBoundingClientRect();
        return {
          style: style.outlineStyle,
          width: parseFloat(style.outlineWidth) || 0,
          offset: parseFloat(style.outlineOffset) || 0,
          colour: style.outlineColor,
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
          // …and nothing is drawing a second one on the button itself.
          onTheButton: getComputedStyle(el).outlineStyle,
        };
      });

      expect(ring.style, `${where}: no visible ring`).not.toBe('none');
      expect(ring.width, `${where}: ring under 2px`).toBeGreaterThanOrEqual(2);
      const colour = parseCssColor(ring.colour);
      expect(channelDistance(colour!, primary), `${where}: the ring is not --primary`).toBeLessThanOrEqual(
        PAINT_TOLERANCE,
      );
      expect(ring.onTheButton, `${where}: a second ring on the 44px box`).toBe('none');

      // It hugs the word: the box it is drawn around is the painted one, not
      // the 44px one.
      expect(Math.round(ring.bottom - ring.top), `${where}: the ring is not on the painted box`).toBe(
        navPaintHeight(),
      );

      // And it fits: inside the band at the top, and clear of the drawer's own
      // edge at the bottom, by the whole reach core/flow/dock.ts allows for.
      const reach = ring.width + ring.offset;
      expect(reach, `${where}: the ring reaches further than dock.ts allows`).toBeLessThanOrEqual(
        FLOW_NAV_RING_REACH,
      );
      expect(ring.top - reach, `${where}: the ring is above the band`).toBeGreaterThanOrEqual(g.navTop - 0.5);
      expect(g.drawerTop - (ring.bottom + reach), `${where}: the ring reaches the drawer`).toBeGreaterThan(0);
      // Never over the handle's grip, which straddles that edge.
      expect(g.gripTop - (ring.bottom + reach), `${where}: the ring reaches the grip`).toBeGreaterThan(0);
    }
  }

  await context.close();
});

test('the cluster is centred, and clear of the grab handle (VB-41)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  const measured: string[] = [];

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      const where = `${mode} at ${name}`;
      const g = await geometry(page);
      const cluster = await controls(page);

      // CENTRED: the same air either side of the group.
      const leftAir = Math.min(...cluster.map((c) => c.hit.left)) - g.navLeft;
      const rightAir = g.navRight - Math.max(...cluster.map((c) => c.hit.right));
      expect(Math.abs(leftAir - rightAir), `${where}: the cluster is not centred`).toBeLessThanOrEqual(1);

      // THE COMPLAINT, MEASURED. The distance from the last painted pixel of
      // the cluster to the drawer's edge, and to the top of the grip — which
      // is the thing the buttons were being mistaken for.
      const paintedBottom = Math.max(...cluster.map((c) => c.paint.bottom));
      const toEdge = g.drawerTop - paintedBottom;
      const toGrip = g.gripTop - paintedBottom;
      measured.push(`${where} — ${Math.round(toEdge)}px to the drawer’s edge, ${Math.round(toGrip)}px to the grip`);
      // V2.3 VB-94: the fixed VB-41 clearance now belongs to the note band
      // (save-note.spec measures it). The cluster's own promise is looser and
      // still real: its paint never comes within the note band plus the old
      // clearance of the drawer, so nothing pressable is ever mistaken for
      // the grip — which now sits a whole band further away than it did.
      expect(toEdge, `${where}: the cluster is not clear of the drawer`).toBeGreaterThanOrEqual(
        navPaintGapAboveDrawer(),
      );
      expect(toGrip, `${where}: the cluster is not clear of the grip`).toBeGreaterThanOrEqual(16);
      // The grip really is where this thinks it is — a grip that had moved
      // would make the number above true and meaningless.
      expect(g.gripTop, `${where}: the grip is not straddling the edge`).toBeLessThan(g.drawerTop);
    }
  }

  console.log(`\n  VB-41 separation\n${measured.map((line) => `    ${line}`).join('\n')}\n`);
  await context.close();
});

test('nothing in the cluster is carried by colour alone (VB-41)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);
  await setHeight(page, BOUNDS.max);
  const cluster = await controls(page);

  const back = cluster.find((c) => c.label === S.back)!;
  const next = cluster.find((c) => c.label === S.next)!;
  const skip = cluster.find((c) => c.label === S.skip)!;

  // Every one of them is a word, found by that word — the primary thing that
  // makes this cluster safe.
  for (const control of cluster) {
    const button = page.locator('.flow-foot').getByRole('button', { name: control.label, exact: true });
    expect((await button.innerText()).trim(), `${control.label} prints nothing`).not.toBe('');
  }

  // And "which of these is the primary" is carried three ways, not one: the
  // word, a chevron, and the weight.
  expect(next.chevrons, 'Next has no chevron').toBe(1);
  expect(back.chevrons, 'Back has no chevron').toBe(1);
  expect(skip.chevrons, 'Skip should be a word on its own').toBe(0);
  expect(next.weight, 'the primary is not heavier than the secondary').toBeGreaterThan(back.weight);
  expect(back.weight, 'the secondary is not heavier than the quiet one').toBeGreaterThan(skip.weight);
  // The chevrons are pictures of the words beside them, not second names.
  expect(await page.locator('.flow-foot svg:not([aria-hidden="true"])').count()).toBe(0);

  await context.close();
});

test('the cluster at three drawer heights in both modes — for a person to look at (VB-41)', async () => {
  const { context, sw, id } = await launchExtension();
  const page = await openQuestion(context, sw, id);

  for (const mode of ['list', 'brain'] as const) {
    await chooseMode(page, mode);
    for (const { name, height } of heightsFor(mode)) {
      await setHeight(page, height);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, `${mode}-${name}.png`) });
      const g = await geometry(page);
      // And the thing this task is about, close up: the cluster, the space
      // under it, and the handle it must not be mistaken for.
      await page.screenshot({
        path: path.join(SHOTS, `${mode}-${name}-cluster.png`),
        clip: { x: 0, y: g.navTop - 24, width: PANEL.width, height: FLOW_NAV_HEIGHT + 72 },
      });
    }
  }

  // One with the ring up, since that is the state the whole VB-15 split exists
  // to serve and the one a screenshot pass would otherwise never show. The Tab
  // is not decoration: `:focus-visible` only matches a programmatic focus when
  // the last input was a key, so without it this shot shows no ring at all.
  await page.keyboard.press('Tab');
  await page.locator('.flow-foot').getByRole('button', { name: S.next, exact: true }).focus();
  await page.waitForTimeout(150);
  const g = await geometry(page);
  await page.screenshot({
    path: path.join(SHOTS, 'focus-ring.png'),
    clip: { x: 0, y: g.navTop - 24, width: PANEL.width, height: FLOW_NAV_HEIGHT + 72 },
  });

  await context.close();
});
