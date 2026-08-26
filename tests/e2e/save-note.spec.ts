import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { drawerBounds, restingDrawerHeight } from '../../src/core/drawer/height';
import { FLOW_NAV_CLEARANCE, FLOW_NAV_GAP, FLOW_NAV_HEIGHT, FLOW_SAVE_NOTE_FOOT } from '../../src/core/flow/dock';
import { CLUSTER_MAX_INTERNAL_GAP, inspectCluster } from '../../src/core/flow/composition';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.8 VB-44 — the foot under "Saved on this device · Nothing leaves your
 * browser", measured in a real browser.
 * V2.0 VB-58 — and the same note, centred.
 *
 * VB-58 IS AN ALIGNMENT CHANGE AND NOTHING ELSE, which is why it lives in this
 * file rather than in one of its own: everything below already exists to hold
 * the numbers VB-44 tuned, and the one risk in centring the note is that
 * someone moves a number while they are in here. So `expectCentred` is called
 * from `expectFoot`, and every layout this file measures now asserts both.
 * The 8px foot and the 25px to the nav's painted words are unchanged.
 *
 * The note rides on VB-17's slack, so it is always the last row of the
 * question area, and the space beneath it was the surface's own 20px frame.
 * With the dock's 8px gap and the 9px the nav band leaves above its painted
 * words, that put 37px between a footnote and the word "Next" — where VB-41
 * deliberately left 29px between "Next" and the drawer. More air above the
 * cluster than below it groups the buttons with the drawer, which is the exact
 * confusion VB-41 exists to remove.
 *
 * THIS IS THE THIRD TASK TO TOUCH THIS REGION, so most of this file is about
 * what must NOT have moved:
 *
 *  - **VB-41's separation.** 29px from the painted cluster to the drawer's
 *    edge and 22px to the grip, at every height, in both modes. Restated here
 *    rather than left to button-cluster.spec.ts because this task is the one
 *    that could eat it.
 *  - **VB-17's one seam.** The cluster above the note is still one composed
 *    thing with no dead band inside it, and the slack still falls in the single
 *    seam above the note. Judged by the same `inspectCluster` that spec uses.
 *  - **The dock itself.** The reservation, the bar's height and the drawer's
 *    ceiling are untouched: this is padding inside the room the question
 *    already owns.
 *
 * The number the task is about is asserted in the one state that is the same on
 * every question at every drawer height — scrolled to the end of the page,
 * where the surface's foot is against the dock's reservation — and again at
 * rest on the questions short enough not to overflow.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb44');
const PANEL = { width: 400, height: 760 };
const DRAWER = drawerBounds(PANEL.height);

/** The surface's own frame, which the top and sides keep. The foot is the one
 * edge VB-44 changes, and the pair is what makes "tighter" measurable rather
 * than a claim. */
const SURFACE_FRAME = 20;

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** Every answer the flow needs to derive its way to `targetStepId`, and not one
 * more — the same fixture question-fill.spec.ts uses, for the same reason. */
function answersUpTo(modules: Module[], targetStepId: string): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const step: Step = node;
      if (step.id === targetStepId) return { values, repeatables: {}, answeredAt, reflectedAt };
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
  throw new Error(`no step called ${targetStepId} in the flow`);
}

async function openPanel(context: BrowserContext, sw: Worker, id: string, stepId: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpTo(contextModules, stepId));
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the interview is entered from
  // the file view — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  await page.waitForSelector('.filedrawer-handle');
  return page;
}

/** The module transition screen, which is the one screen carrying the note with
 * no answer band under it — its note is pinned by an auto margin instead
 * (Flow.css). Reached by stopping one step short of walking past it. */
async function openModuleIntro(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  const page = await openPanel(context, sw, id, 'preferred_name');
  await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
  await page.waitForTimeout(900);
  return page;
}

async function openAt(context: BrowserContext, sw: Worker, id: string, stepId: string): Promise<Page> {
  const page = await openPanel(context, sw, id, stepId);
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: S.next, exact: true }).click();
  }
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', stepId);
  // The question types itself in (V1.2 VB-10) and the drawer settles behind it.
  // Measure at rest, not mid-arrival.
  await page.waitForTimeout(1000);
  return page;
}

/** The rows a person sees as separate objects, so the space between two of
 * them is a seam. The same list question-fill.spec.ts measures VB-17 with. */
const FOOT_ROW = '.flow-save';
const ROW_SELECTORS = [
  '.narrator',
  '.flowprogress',
  '.flow-q-row',
  '.beats',
  '.flow-hint',
  '.deepdive',
  '.flow-answer .field',
  '.flow-answer .pillgroup',
  '.flow-answer .readonly',
  '.flow-answer .flow-idea-row',
  '.flow-answer .flow-custom',
  '.flow-answer .flow-reflect-actions',
  '.modintro-preview',
  FOOT_ROW,
];

interface Measured {
  /** The surface's frame, read back rather than restated. */
  padTop: number;
  padBottom: number;
  flowBottom: number;
  noteBottom: number;
  noteTop: number;
  /** The gap a person sees: note to the first painted pixel of the cluster. */
  noteToPaint: number;
  /** …and VB-41's, on the other side of it. */
  paintToDrawer: number;
  paintToGrip: number;
  inkTop: number;
  inkBottom: number;
  navTop: number;
  drawerTop: number;
  /** V2.0 VB-58 — the note's own painted text, and the box it sits in. Read
   * from the spans rather than from the paragraph: the paragraph is a full-
   * width block whichever way its content is aligned, so its own box says
   * nothing about whether the words are centred. */
  centring: { inkLeft: number; inkRight: number; areaLeft: number; areaRight: number; align: string };
  /** Whether the question is taller than the room it was given, in which case
   * the note is pushed down by content rather than sitting on the slack. */
  overflowing: boolean;
  /** Whether the page is at the end of its scroll — the other state the foot
   * is read in, and the only one a tall question is ever read in. */
  scrolledToEnd: boolean;
  rows: { name: string; top: number; bottom: number }[];
}

/** Everything in one pass, so nothing can move between two reads. */
async function measure(page: Page): Promise<Measured> {
  return page.evaluate(
    ({ selectors, navGap }) => {
      const flow = document.querySelector('.flow') as HTMLElement;
      const style = getComputedStyle(flow);
      const flowBox = flow.getBoundingClientRect();
      const note = document.querySelector('.flow-save')!.getBoundingClientRect();
      const nav = document.querySelector('.flow-foot')!.getBoundingClientRect();
      const drawer = document.querySelector('.filedrawer')!.getBoundingClientRect();
      const grip = document.querySelector('.filedrawer-grip')!.getBoundingClientRect();
      const painted = [...document.querySelectorAll('.flow-foot .navbtn')].map((n) => n.getBoundingClientRect());
      const paintBottom = Math.max(...painted.map((p) => p.bottom));
      const noteEl = document.querySelector('.flow-save') as HTMLElement;
      const spans = [...noteEl.querySelectorAll('span')].map((s) => s.getBoundingClientRect());
      const flowStyle = getComputedStyle(flow);
      const rows: { name: string; top: number; bottom: number }[] = [];
      for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          const r = element.getBoundingClientRect();
          if (r.height <= 0 || r.width <= 0) continue;
          rows.push({ name: selector, top: r.top, bottom: r.bottom });
        }
      }
      rows.sort((a, b) => a.top - b.top);
      return {
        padTop: parseFloat(style.paddingTop),
        padBottom: parseFloat(style.paddingBottom),
        flowBottom: flowBox.bottom,
        noteBottom: note.bottom,
        noteTop: note.top,
        // V2.3 VB-94: the note is the docked band; the cluster is in-flow
        // above it. The old fixed note→cluster gutter became the elastic
        // seam, and "clearance above the drawer" became the band's own
        // integrity — measured below as ink kept out of the handle's reach.
        noteToPaint: note.top - paintBottom,
        paintToDrawer: drawer.top - paintBottom,
        paintToGrip: grip.top - paintBottom,
        inkTop: Math.min(...spans.map((s) => s.top)),
        inkBottom: Math.max(...spans.map((s) => s.bottom)),
        navTop: nav.top,
        drawerTop: drawer.top,
        centring: {
          inkLeft: Math.min(...spans.map((s) => s.left)),
          inkRight: Math.max(...spans.map((s) => s.right)),
          // The room the note has to be centred in: the surface's content box.
          areaLeft: flowBox.left + parseFloat(flowStyle.paddingLeft),
          areaRight: flowBox.right - parseFloat(flowStyle.paddingRight),
          align: getComputedStyle(noteEl).textAlign,
        },
        overflowing: flowBox.bottom > note.top - navGap + 1,
        scrolledToEnd:
          window.scrollY > 0 &&
          window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 1,
        rows,
      };
    },
    { selectors: ROW_SELECTORS, navGap: FLOW_NAV_GAP },
  );
}

async function setHeight(page: Page, key: 'Home' | 'End'): Promise<number> {
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press(key);
  // Let the 320ms jump finish before anything is measured at rest.
  await page.waitForTimeout(420);
  await page.mouse.move(2, 2);
  return Number(await handle.getAttribute('aria-valuenow'));
}

async function scrollToEnd(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(140);
}

/** VB-41's half of the geometry, which this task is the most likely thing to
 * eat. Asserted everywhere this file measures anything. */
function expectClearanceIntact(m: Measured, where: string): void {
  // V2.3 VB-94 — the band's tenant changed; the guarantees did not. The NOTE
  // is pegged to the drawer at the full band height, and its ink stays out of
  // the handle's overhanging 44px target (the top `--nav-clearance` of the
  // band), so no word ever sits under someone's thumb.
  expect(m.drawerTop - m.noteTop, `${where}: the note band is no longer pegged to the drawer`).toBeCloseTo(FLOW_NAV_HEIGHT, 0);
  // The handle's 44px target overhangs the DRAWER'S edge — the band's bottom
  // — so the ink must end a full clearance above it, not start one below the
  // band's top (the first draft asserted exactly the inverted region).
  expect(m.drawerTop - m.inkBottom, `${where}: the note's ink is under the handle's reach`).toBeGreaterThanOrEqual(FLOW_NAV_CLEARANCE - 1);
}

/** VB-17's half: one composed cluster, and the slack in the single seam above
 * the note. Judged by the same pure function question-fill.spec.ts uses. */
function expectOneSeam(m: Measured, where: string): void {
  const cluster = inspectCluster(m.rows, { footRow: FOOT_ROW });
  const worst = cluster.worst;
  expect(
    worst === null ? 0 : worst.gap,
    `${where}: dead band of ${Math.round(worst?.gap ?? 0)}px between ${worst?.after} and ${worst?.before}`,
  ).toBeLessThanOrEqual(CLUSTER_MAX_INTERNAL_GAP);
  expect(cluster.slack, `${where}: no foot row, so nothing is holding the slack down`).not.toBeNull();
}

/**
 * V2.0 VB-58 — the note is centred above the nav.
 *
 * Measured as painted ink rather than as a CSS property, and measured against
 * the room it sits in rather than against the viewport: the paragraph is a
 * block and fills the width whatever its alignment, so `text-align` alone
 * would be a claim about a stylesheet and not about what a person sees.
 *
 * Two pixels of tolerance, because the note is two spans separated by a middot
 * and the line's own trailing space is not painted.
 */
function expectCentred(m: Measured, where: string): void {
  const { inkLeft, inkRight, areaLeft, areaRight } = m.centring;
  expect(m.centring.align, `${where}: the note is not centred`).toBe('center');
  const leftGap = inkLeft - areaLeft;
  const rightGap = areaRight - inkRight;
  expect(leftGap, `${where}: the note starts at the left edge`).toBeGreaterThan(2);
  expect(
    Math.abs(leftGap - rightGap),
    `${where}: ${Math.round(leftGap)}px to the left of the note, ${Math.round(rightGap)}px to the right`,
  ).toBeLessThanOrEqual(2);
}

/**
 * The foot, in whichever of its two states this layout is in.
 *
 * A question that FITS its room is read where it opens: the surface's bottom
 * edge is the room's bottom edge, and the note is `saveNotePaintGapAboveNav()`
 * above the painted cluster. That is the state VB-44 is about.
 *
 * A question TALLER than its room is read scrolled, so the number is taken at
 * the end of the scroll — where it is one `PANEL_SURFACE_TOP` looser. Not a
 * second opinion about spacing: it is the panel document's own body margin,
 * which is 8px at the foot of the page exactly as it is 8px at the head of it
 * (core/flow/composition.ts names it for the head), so the page can always be
 * scrolled one margin further than the dock's reservation strictly needs.
 * Named rather than tolerated, so a change to the panel's frame shows up here
 * as a failure rather than as a fudge factor that was already big enough.
 */
function expectFoot(m: Measured, where: string): void {
  // V2.0 VB-58 changed the alignment and NOTHING ELSE. The arithmetic below is
  // VB-44's, unmoved, and it is asserted in the same breath as the centring so
  // that a future pass at this region cannot trade one for the other.
  expectCentred(m, where);
  expect(m.padBottom, `${where}: the foot`).toBe(FLOW_SAVE_NOTE_FOOT);
  expect(m.padTop, `${where}: the frame above`).toBe(SURFACE_FRAME);
  expect(m.padBottom, `${where}: the foot is no longer tighter than the frame`).toBeLessThan(m.padTop);
  // V2.3 VB-94: the note is the surface's fixed foot-band, so "nothing under
  // the note" is now literal — only the drawer is below it — and the old
  // exact gutter to the cluster became the ONE elastic seam (expectOneSeam's
  // whole subject). What stays fixed is that the cluster never crowds the
  // band closer than the gutter.
  if (!m.scrolledToEnd) {
    expect(m.overflowing, `${where}: a question taller than its room has to be read scrolled`).toBe(false);
  }
  expect(m.noteToPaint, `${where}: the cluster crowds the note band`).toBeGreaterThanOrEqual(FLOW_NAV_GAP - 1);
}

test.describe('VB-44 — the save note sits at the foot of its area', () => {
  /**
   * THE NUMBER THE TASK IS ABOUT, ON REAL CONTENT.
   *
   * A short question and the tallest question in the flow, at the minimum, the
   * resting height and the maximum — six layouts, each read in the state a
   * person reads it in: where it opens if it fits, at the end of the scroll if
   * it does not.
   */
  test('is one gutter above the cluster, on a short and a tall question, at every drawer height', async () => {
    const { context, sw, id } = await launchExtension();
    const seen: string[] = [];

    for (const stepId of ['preferred_name', 'peeves']) {
      const page = await openAt(context, sw, id, stepId);

      for (const [name, key] of [
        ['resting', null],
        ['minimum', 'Home'],
        ['maximum', 'End'],
      ] as const) {
        const height = key ? await setHeight(page, key) : restingDrawerHeight(DRAWER);
        if (key) expect(height, `${stepId} ${name}`).toBe(name === 'minimum' ? DRAWER.min : DRAWER.max);
        const where = `${stepId} at the ${name} drawer height (${height}px)`;

        // Where it opens, if the question fits the room it was given.
        const opened = await measure(page);
        if (!opened.overflowing) {
          expectFoot(opened, `${where}, as it opens`);
          expectClearanceIntact(opened, `${where}, as it opens`);
          expectOneSeam(opened, `${where}, as it opens`);
          seen.push(`${where} — ${Math.round(opened.noteToPaint)}px to the cluster, unscrolled`);
        }

        // …and at the end of the scroll, which is the only state a question
        // taller than its room is ever read in.
        await scrollToEnd(page);
        const end = await measure(page);
        expectFoot(end, `${where}, scrolled to the end`);
        expectClearanceIntact(end, `${where}, scrolled to the end`);
        expectOneSeam(end, `${where}, scrolled to the end`);
        seen.push(`${where} — ${Math.round(end.noteToPaint)}px to the cluster, scrolled to the end`);

        await page.evaluate(() => window.scrollTo(0, 0));
      }
      await page.close();
    }

    console.log(`\n  VB-44 measured foot\n${seen.map((line) => `    ${line}`).join('\n')}\n`);
    await context.close();
  });

  /**
   * THE ASSERTION THAT KEEPS THIS FROM BEING A FREE PIXEL GRAB.
   *
   * VB-41 put 29px under the painted cluster so the buttons could not be
   * mistaken for the drawer's grab handle. In the composed layout — the
   * question inside its room, which is what VB-17 built and what a person sees
   * when a question opens — the air above the cluster has to stay under that,
   * or the grouping says the buttons belong to the drawer rather than to the
   * question. And in every state, including both ends of the scroll, it has to
   * stay clear of zero, or the footnote joins the bar it is sitting above.
   */
  test('leaves less air above the cluster than VB-41 leaves below it, and still a real gap', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'preferred_name');

    for (const [name, key] of [
      ['resting', null],
      ['minimum', 'Home'],
      ['maximum', 'End'],
    ] as const) {
      if (key) await setHeight(page, key);
      const where = `preferred_name at the ${name} drawer height`;
      const opened = await measure(page);
      expectClearanceIntact(opened, where);

      // The grouping rule, in the state it is a statement about. At the
      // maximum drag even the shortest question is taller than the room it is
      // left, so there is no composed layout to judge — it is read scrolled,
      // and the loop below is what holds that state.
      if (!opened.overflowing) {
        expect(
          opened.noteToPaint,
          `${where}: more air above the cluster than below it`,
        ).toBeLessThan(opened.paintToDrawer);
      }

      // …and at both ends of the scroll: never joined to the cluster, never
      // drawn over the band, and never further off than the composed foot plus
      // the one body margin the page can always be scrolled past it (see
      // `expectFoot`).
      for (const at of ['as it opens', 'scrolled to the end'] as const) {
        if (at === 'scrolled to the end') await scrollToEnd(page);
        const m = await measure(page);
        // V2.3 VB-94: the note no longer keeps a bounded distance from the
        // cluster — it is pegged to the drawer, and the cluster ends above
        // it. The claims hold in the state a person reads: an overflowing
        // layout scrolls, and until it is scrolled the fixed band overlays
        // whatever the fold left beneath it — that is what "reserve + scroll"
        // means, not a crowding bug.
        if (!m.overflowing || m.scrolledToEnd) {
          expect(m.noteToPaint, `${where} ${at}: the cluster crowds the note band`).toBeGreaterThanOrEqual(
            FLOW_NAV_GAP - 1,
          );
          expect(m.navTop, `${where} ${at}: the cluster is under the note band`).toBeLessThan(m.noteTop + 1);
        }
      }
      await page.evaluate(() => window.scrollTo(0, 0));
    }

    await context.close();
  });

  /**
   * The foot on the kinds of question the shell actually holds, where they
   * open, without anyone scrolling: a one-line field, a tall hint with options
   * under it, and a text box that spends the leftover room on itself (VB-17).
   */
  test('sits at the foot the moment the question opens, on every kind of screen', async () => {
    const { context, sw, id } = await launchExtension();
    let measured = 0;

    for (const stepId of ['preferred_name', 'voice_qualification', 'terms_depend_on']) {
      const page = await openAt(context, sw, id, stepId);
      for (const [name, key] of [
        ['resting', null],
        ['minimum', 'Home'],
      ] as const) {
        if (key) await setHeight(page, key);
        const where = `${stepId} at the ${name} drawer height`;
        const m = await measure(page);
        // A question this tall is read scrolled; the test above measures that
        // state. Here the point is the layout that needs no scrolling at all.
        if (m.overflowing) continue;
        expectFoot(m, where);
        expectClearanceIntact(m, where);
        expectOneSeam(m, where);
        measured++;
      }
      await page.close();
    }

    // A skip that skipped everything would make this test pass by measuring
    // nothing at all.
    // V2.3 VB-94: the in-flow cluster makes short rooms overflow sooner, so
    // fewer layouts open fully unscrolled — the floor drops with the reason
    // recorded rather than the sweep silently thinning.
    expect(measured, 'every layout overflowed — nothing was measured').toBeGreaterThanOrEqual(2);
    await context.close();
  });

  /** The one screen with no answer band under the note — its foot is the same
   * one, and the auto margin that pins it there is not disturbed. */
  test('the module transition gets the same foot', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openModuleIntro(context, sw, id);

    const m = await measure(page);
    expectFoot(m, 'the module transition');
    expectClearanceIntact(m, 'the module transition');

    await page.screenshot({ path: path.join(SHOTS, 'module-intro.png') });
    await context.close();
  });

  /** The surface with no dock keeps the frame it always had: its note is
   * followed by an ordinary footer rather than by the docked cluster, so there
   * is nothing under it for the foot to be tight against. */
  test('a flow with no drawer keeps the surface frame', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpTo(contextModules, 'preferred_name'));
    const page = await context.newPage();
    await page.setViewportSize(PANEL);
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    // The proof loop, which writes no file and so docks nothing.
    await page.getByRole('button', { name: S.proofCta }).click();
    await page.waitForSelector('.flow');

    await expect(page.locator('.flowshell')).toHaveCount(0);
    const pad = await page.locator('.flow').evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(pad).toBe(`${SURFACE_FRAME}px`);

    await context.close();
  });

  /** A short question and a tall one, at all three drawer heights — for a
   * person to look at, which is the only way "it sits closer to the bottom" is
   * ever really checked. */
  test('the foot at three drawer heights, short and tall — for a person to look at', async () => {
    const { context, sw, id } = await launchExtension();

    for (const stepId of ['preferred_name', 'voice_qualification']) {
      const page = await openAt(context, sw, id, stepId);
      for (const [name, key] of [
        ['rest', null],
        ['min', 'Home'],
        ['max', 'End'],
      ] as const) {
        if (key) await setHeight(page, key);
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(SHOTS, `${stepId}-${name}.png`) });
        const m = await measure(page);
        // And the region itself, close up: the note, the gap, the cluster, the
        // gap VB-41 left, and the handle none of them may be confused with.
        await page.screenshot({
          path: path.join(SHOTS, `${stepId}-${name}-foot.png`),
          clip: {
            x: 0,
            y: Math.max(0, Math.round(m.noteTop) - 30),
            width: PANEL.width,
            height: Math.min(PANEL.height - Math.max(0, Math.round(m.noteTop) - 30), 190),
          },
        });
      }
      await page.close();
    }

    await context.close();
  });
});
