import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { FLOW_NAV_GAP } from '../../src/core/flow/dock';
import { drawerBounds } from '../../src/core/drawer/height';
import { CLUSTER_MAX_INTERNAL_GAP, inspectCluster, questionAreaHeight } from '../../src/core/flow/composition';
import type { MeasuredRow } from '../../src/core/flow/composition';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.3 VB-17, REWORKED — driven in a real browser against the real ported
 * interview.
 *
 * **Why this file was rewritten.** VB-17 shipped, this suite passed, and the
 * screen still looked wrong. The first build read "fill the top 60%" as "share
 * the leftover pixels out evenly", centred the answer band, and produced — at
 * 400x760, on `preferred_name` — a 124px hole between the question and its own
 * field AND a 140px one between the last control and the save note. Two dead
 * bands where V1.2 had one.
 *
 * The old suite measured the cluster's OUTER BOUNDS: the top row was near the
 * top, the bottom row was near the bar, the widest seam was under 35% of the
 * area. A 124px hole in the middle of a 507px area satisfies every one of
 * those. That is the hole this file exists to close: **every seam between two
 * adjacent things inside the cluster is measured, and held to
 * `CLUSTER_MAX_INTERNAL_GAP`.**
 *
 * The rule being checked, in one sentence: the question, its help and its
 * controls are one cluster spaced by ordinary related margins and anchored at
 * the top; the leftover room falls in exactly one seam, below the cluster and
 * above the dock, with the save note riding on top of it.
 *
 * EVERYTHING HERE MEASURES REAL BOUNDING BOXES. DOM order proves nothing about
 * a layout that distributes space, and a class toggling proves less. The
 * judging is core/flow/composition.ts's `inspectCluster`, unit-tested without a
 * browser; this file only supplies it with real geometry.
 *
 * Four real questions, chosen because they are the extremes of the ported
 * content and not because they are convenient:
 *  - `preferred_name` — the shortest. One line, one field, no hint.
 *  - `peeves` — ten options and an "add your own". The tallest.
 *  - `guardrails_list` — a tall multiline text question.
 *  - `voice_qualification` — three options under a hint that is three worked
 *    examples, i.e. tall in the part the layout must NOT stretch.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb17');
/** The panel Adam measured the failure in, so a number here and a number in
 * the bug report mean the same thing. */
const PANEL = { width: 400, height: 760 };
const DRAWER = drawerBounds(PANEL.height);

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/**
 * Every answer the flow needs to derive its way to `targetStepId`, and not one
 * more — so the panel opens on that exact question with the real content
 * behind it. Repeatable blocks are left empty on purpose: every one of them in
 * the ported data is either seeded from a top-level answer or gated by a
 * yes/no this fills with "no", so the derivation walks straight past them
 * (see core/flow/runner.ts's `findInModule`).
 */
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

async function openAt(context: BrowserContext, sw: Worker, id: string, stepId: string): Promise<Page> {
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
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  await page.waitForSelector('.filedrawer-handle');
  // The first question of a module is reached through its transition screen
  // (V1.1 VB-05) — which is a screen, not a question, so walk past it.
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', stepId);
  // The question types itself in (V1.2 VB-10). It reserves its final box from
  // the first frame, but the drawer's own scroll and the deep-dive chips land
  // over the next couple of frames — measure at rest, not mid-arrival.
  await page.waitForTimeout(400);
  return page;
}

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
}

async function box(target: Locator): Promise<Box> {
  const b = (await target.boundingBox())!;
  return { top: b.y, bottom: b.y + b.height, left: b.x, right: b.x + b.width, height: b.height, width: b.width };
}

/** The row pinned to the foot of the surface. Everything above it is the
 * cluster; the seam between them is the slack, and is the only one on this
 * screen allowed to be wide. */
const FOOT_ROW = '.flow-save';

/**
 * Every visible row of a question, top to bottom — the narrator toggle, the
 * module strip, the question and its help, whatever the answer band holds, and
 * the save note. Anything with no box (an sr-only span, an unrendered branch)
 * is skipped rather than counted as a zero-height row in the middle of the
 * page.
 *
 * These are the things a person sees as separate objects, which is what makes
 * the space between two of them a seam rather than an implementation detail.
 */
const ROW_SELECTORS = [
  '.narrator',
  '.flowprogress',
  '.flow-q-row',
  '.beats',
  '.flow-hint',
  '.deepdive',
  '.flow-answer .field',
  '.flow-answer .field-errmsg',
  '.flow-answer .pillgroup',
  '.flow-answer .readonly',
  '.flow-answer .flow-idea-row',
  '.flow-answer .flow-custom',
  '.flow-answer .flow-error',
  '.flow-answer .flow-reflect-actions',
  FOOT_ROW,
];

interface Composition {
  areaTop: number;
  areaBottom: number;
  areaContentBottom: number;
  contentBottom: number;
  footTop: number;
  footBottom: number;
  navTop: number;
  drawerTop: number;
  rows: MeasuredRow[];
}

/** The composition, measured in one pass so nothing can move between reads. */
async function composition(page: Page): Promise<Composition> {
  return page.evaluate((selectors) => {
    const flow = document.querySelector('.flow') as HTMLElement;
    // V2.3 VB-94: the surface's bottom chrome is the NOTE band now — the
    // cluster is a content row and composes with the question above it.
    const nav = document.querySelector('.flow-save')!.getBoundingClientRect();
    const drawer = document.querySelector('.filedrawer')!.getBoundingClientRect();
    const rows: { name: string; top: number; bottom: number }[] = [];
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const r = element.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;
        rows.push({ name: selector, top: r.top, bottom: r.bottom });
      }
    }
    rows.sort((a, b) => a.top - b.top);
    const flowBox = flow.getBoundingClientRect();
    return {
      areaTop: flowBox.top,
      areaBottom: flowBox.bottom,
      // The surface's own bottom padding is not a dead band — it is the frame
      // every screen in this product is drawn inside.
      areaContentBottom: flowBox.bottom - parseFloat(getComputedStyle(flow).paddingBottom),
      contentBottom: rows.length ? rows[rows.length - 1]!.bottom : flowBox.top,
      footTop: document.querySelector('.flow-foot')?.getBoundingClientRect().top ?? Number.NaN,
      footBottom: document.querySelector('.flow-foot')?.getBoundingClientRect().bottom ?? Number.NaN,
      navTop: nav.top,
      drawerTop: drawer.top,
      rows,
    };
  }, ROW_SELECTORS);
}

/**
 * THE ASSERTION THE OLD SUITE DID NOT HAVE.
 *
 * Every seam inside the cluster, held to the threshold, with the offender
 * named. The one seam below the cluster — the slack — is deliberately not
 * judged: on a short question at the drawer's peek it is most of the lower half
 * of the panel, and that is the composition working.
 */
function expectComposedCluster(c: Composition, where: string): void {
  const cluster = inspectCluster(c.rows, { footRow: FOOT_ROW });
  const worst = cluster.worst;
  expect(
    worst === null ? 0 : worst.gap,
    `${where}: dead band of ${Math.round(worst?.gap ?? 0)}px between ${worst?.after} and ${worst?.before}` +
      ` — every seam: ${cluster.internal.map((g) => `${g.after}→${g.before} ${Math.round(g.gap)}px`).join(', ')}`,
  ).toBeLessThanOrEqual(CLUSTER_MAX_INTERNAL_GAP);
}

/** ...and the other half of the same rule: the leftover room really is where
 * the cluster is not. */
function expectSlackBelowTheCluster(c: Composition, where: string): void {
  const cluster = inspectCluster(c.rows, { footRow: FOOT_ROW });
  expect(cluster.slack, `${where}: no foot row, so nothing is holding the slack down`).not.toBeNull();
  // The save note is the last thing before the bar, so the surface's content
  // reaches the bottom of the room rather than stopping half way up it.
  expect(c.areaContentBottom - c.contentBottom, `${where}: blank strip under the save note`).toBeLessThanOrEqual(4);
}

async function setHeight(page: Page, key: string): Promise<number> {
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press(key);
  // Let the 320ms jump finish before anything is measured at rest.
  await page.waitForTimeout(420);
  // Bounded: the question lives in VB-137's scrollable zone now, and a
  // clipped heading would otherwise hold this settle-click to the test
  // timeout — the catch only helps once the click actually throws.
  await page
    .locator('.flow-q')
    .first()
    .click({ position: { x: 2, y: 2 }, timeout: 800 })
    .catch(() => undefined);
  return Number(await handle.getAttribute('aria-valuenow'));
}

/** Where the answer band's first control is right now — the thing the
 * distribution actually moves, and therefore the thing to watch during a
 * settle. */
async function answerTop(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('.flow-answer > *')!.getBoundingClientRect().top);
}

test.describe('VB-17 — one composed cluster, and the slack in one place', () => {
  /**
   * THE REGRESSION TEST FOR THIS REWORK.
   *
   * Four real questions at three drawer heights — the minimum, where the
   * question has the most room and therefore the most slack to misplace; the
   * height it opens at; and the maximum, where it has least. Twelve real
   * layouts, every seam in each of them measured.
   */
  test('no dead band inside the cluster, on the real content, at every drawer height', async () => {
    const { context, sw, id } = await launchExtension();

    for (const stepId of ['preferred_name', 'peeves', 'guardrails_list', 'voice_qualification']) {
      const page = await openAt(context, sw, id, stepId);

      // As it opens, before anything is dragged.
      expectComposedCluster(await composition(page), `${stepId} at the resting height`);

      for (const [name, key] of [
        ['minimum', 'Home'],
        ['maximum', 'End'],
      ] as const) {
        const height = await setHeight(page, key);
        expect(height, `${stepId} ${name}`).toBe(name === 'minimum' ? DRAWER.min : DRAWER.max);
        expectComposedCluster(await composition(page), `${stepId} at the ${name} drawer height (${height}px)`);
      }
      await page.close();
    }

    await context.close();
  });

  test('the shortest question fills the panel with one seam, not two', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'preferred_name');

    const c = await composition(page);
    const area = c.navTop - c.areaTop;

    // 1. The surface really is the room above the dock — not its content's
    //    natural height. V2.3 VB-94: the cluster now composes INSIDE this
    //    filled surface, so the fill still runs to the note band's gap, and
    //    the cluster additionally sits wholly inside it.
    expect(c.areaBottom).toBeGreaterThanOrEqual(c.navTop - FLOW_NAV_GAP - 2);
    expect(c.areaBottom).toBeLessThanOrEqual(c.navTop + 1);
    expect(c.footBottom, 'the cluster spills out of the surface').toBeLessThanOrEqual(c.areaBottom + 1);

    // 2. The cluster is one composed thing, and the slack is below it.
    expectComposedCluster(c, 'preferred_name');
    expectSlackBelowTheCluster(c, 'preferred_name');

    // 3. Exactly ONE seam on the whole screen is wide, and it is the one under
    //    the cluster. This is the difference between this build and the one it
    //    replaces, stated as plainly as it can be measured: the old layout had
    //    two, either side of the field.
    const cluster = inspectCluster(c.rows, { footRow: FOOT_ROW });
    const wide = [...cluster.internal, cluster.slack!].filter((g) => g.gap > CLUSTER_MAX_INTERNAL_GAP);
    expect(wide.map((g) => `${g.after}→${g.before}`)).toEqual([`${cluster.slack!.after}→${FOOT_ROW}`]);

    // 4. The question is still at the top, where it is read — and so is its
    //    field, which the previous build pushed a third of the way down the
    //    panel in the name of distributing space.
    const question = await box(page.locator('.flow-q'));
    const field = await box(page.locator('.flow-answer .field'));
    expect(question.top - c.areaTop).toBeLessThan(area * 0.2);
    expect(field.bottom - c.areaTop, 'the whole cluster sits in the upper third').toBeLessThan(area / 3);

    // 5. And the field is still a field: nothing stretched a single-line input
    //    into a panel to fill the room.
    expect(field.height).toBeLessThan(70);
    expect(field.top).toBeGreaterThan(question.bottom);

    await context.close();
  });

  test('a text question spends the room on its box instead of leaving it blank', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'terms_depend_on');

    // The one thing on this screen that can genuinely use the leftover room is
    // the box being written in, so it takes it — up to the ceiling Flow.css
    // sets, past which a field would have become a page.
    const field = await box(page.locator('.flow-answer textarea.field'));
    expect(field.height).toBeGreaterThan(96);
    expect(field.height).toBeLessThanOrEqual(320);

    const c = await composition(page);
    expectComposedCluster(c, 'terms_depend_on');
    expectSlackBelowTheCluster(c, 'terms_depend_on');

    await context.close();
  });

  test('the tallest question in the flow is whole at the resting drawer height', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'peeves');

    // Every one of the ten options is drawn, and none of them is a zero-height
    // box clipped out of existence by a layout claiming a proportion.
    // Every option, plus the "add your own" that follows them — this question
    // carries both, and the layout has to hold all eleven.
    const pills = page.locator('.flow-answer .pillgroup .pill');
    const options = page.locator('.flow-answer .pillgroup .pill:not(.pill-add)');
    expect(await options.count()).toBeGreaterThanOrEqual(10);
    for (let i = 0; i < (await pills.count()); i++) {
      const p = await box(pills.nth(i));
      expect(p.height, `option ${i}`).toBeGreaterThanOrEqual(30);
      expect(p.right, `option ${i} inside the panel`).toBeLessThanOrEqual(PANEL.width + 1);
    }

    // V2.8 VB-137 — the law this test holds INVERTED, deliberately: the
    // step column is CAPPED at the room above the dock and nothing ever
    // sinks under it. A question taller than the room scrolls INSIDE its
    // own bands (the prompt zone first, the answer band last), the page
    // itself no longer scrolls for a step, and the navigation stands
    // visible the whole time — Adam: "the action buttons are near the
    // input", on every kind of screen.
    const overflow = await page.evaluate(() => ({
      clipped: getComputedStyle(document.querySelector('.flow') as HTMLElement).overflow,
      pageScrolls:
        document.documentElement.scrollHeight - document.documentElement.clientHeight,
      answerScrolls: (() => {
        const band = document.querySelector('.flow-answer') as HTMLElement;
        return band.scrollHeight - band.clientHeight;
      })(),
    }));
    expect(overflow.clipped).toBe('hidden');
    // The tall list is the thing that scrolls; the room it scrolls in is
    // real (the band is on screen, above the note band and the drawer).
    expect(overflow.answerScrolls).toBeGreaterThan(0);

    // The navigation never left the screen — no scrolling required to act.
    const next = await box(page.getByRole('button', { name: 'Next', exact: true }));
    const c2 = await composition(page);
    expect(next.bottom, 'Next stands clear of the note band with no scroll at all').toBeLessThanOrEqual(c2.navTop + 1);

    // The last option is reachable by scrolling ITS band, and answerable.
    await options.last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(120);
    const last = await box(pills.last());
    expect(last.bottom).toBeLessThanOrEqual(c2.navTop + 1);
    await options.last().click();
    await expect(options.last()).toHaveAttribute('aria-pressed', 'true');

    await context.close();
  });

  test('a tall hint keeps its worked examples attached to the question', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'voice_qualification');

    const c = await composition(page);
    const question = await box(page.locator('.flow-q'));
    const hint = await box(page.locator('.flow-hint'));
    const pills = await box(page.locator('.flow-answer .pillgroup'));

    // The hint is three worked examples and is the reason this question is
    // answerable at a glance. It is part of the prompt, so it is deliberately
    // outside the band the leftover room is given to — and the controls are
    // deliberately inside it.
    const inTheBand = await page.evaluate(() => ({
      hint: !!document.querySelector('.flow-hint')!.closest('.flow-answer'),
      deepDive: !!document.querySelector('.deepdive')!.closest('.flow-answer'),
      question: !!document.querySelector('.flow-q')!.closest('.flow-answer'),
      options: !!document.querySelector('.pillgroup')!.closest('.flow-answer'),
    }));
    expect(inTheBand).toEqual({ hint: false, deepDive: false, question: false, options: true });
    expect(hint.top - question.bottom, 'gap between the question and its examples').toBeLessThan(24);
    expect(hint.height).toBeGreaterThan(60);
    // Nothing overlaps, everything is inside the room, and the options are
    // below the examples where they belong.
    expect(pills.top).toBeGreaterThanOrEqual(hint.bottom);
    expect(pills.bottom).toBeLessThanOrEqual(c.navTop + 1);

    expectComposedCluster(c, 'voice_qualification');
    expectSlackBelowTheCluster(c, 'voice_qualification');

    await context.close();
  });

  test('the rule holds at both ends of the drag, on both a short and a tall question', async () => {
    const { context, sw, id } = await launchExtension();

    for (const stepId of ['preferred_name', 'voice_qualification']) {
      const page = await openAt(context, sw, id, stepId);
      for (const key of ['Home', 'End']) {
        const height = await setHeight(page, key);
        const c = await composition(page);
        const where = `${stepId} at ${height}px`;

        // The surface is exactly the room the dock left it, at every height —
        // which is what makes "the top 60%" a rule about a layout rather than
        // a number that happens to be true once.
        expect(Math.round(c.areaBottom), where).toBeGreaterThanOrEqual(Math.round(c.navTop) - FLOW_NAV_GAP - 2);
        expect(questionAreaHeight(PANEL.height, height), where).toBeCloseTo(c.navTop - c.areaTop - FLOW_NAV_GAP, -1);

        // At the peek the question has the most room, and therefore the most
        // slack to put in the wrong place.
        expectComposedCluster(c, where);
        if (key === 'Home') expectSlackBelowTheCluster(c, where);

        // The question itself is always on screen and never under the chrome:
        // the module strip and the question are at the top at every height...
        const progress = await box(page.locator('.flowprogress'));
        const question = await box(page.locator('.flow-q'));
        expect(progress.top, where).toBeGreaterThanOrEqual(0);
        expect(question.bottom, where).toBeLessThanOrEqual(c.navTop + 1);

        // ...and everything below it can be scrolled clear of the dock, which
        // is what makes the dock a dock at a height where the room is small.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(120);
        const scrolled = await composition(page);
        // V2.3 VB-94: the note IS the bar and is fixed, so the last SCROLLING
        // row that must clear it is the foot.
        expect(scrolled.footBottom, `last row clear of the bar, ${where}`).toBeLessThanOrEqual(scrolled.navTop + 1);
        await page.evaluate(() => window.scrollTo(0, 0));

        expect(await page.getByRole('button', { name: 'Next', exact: true }).isVisible()).toBe(true);
      }
      await page.close();
    }

    await context.close();
  });

  test('the room travels with the drawer instead of snapping ahead of it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'preferred_name');

    const startingAnswerTop = await answerTop(page);
    const startingNoteTop = (await composition(page)).rows.find((row) => row.name === FOOT_ROW)!.top;
    await page.locator('.filedrawer-handle').focus();
    await page.keyboard.press('End');

    // Caught inside the 320ms jump, three times. The drawer takes the room
    // over a settle, so the question has to give it up over the same settle —
    // an untransitioned min-height would move the surface to its final size in
    // one frame and leave the drawer arriving underneath it afterwards.
    //
    // The cluster is anchored at the top now, so what moves during a settle is
    // the save note riding on the shrinking slack, not the field. Watched on
    // the note for exactly that reason: watching something that no longer moves
    // would make this test pass by accident.
    let sawMotion = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(60);
      const c = await composition(page);
      const note = c.rows.find((row) => row.name === FOOT_ROW)!;
      if (note.top < startingNoteTop - 4 && c.drawerTop > PANEL.height - DRAWER.max + 4) sawMotion = true;
    }
    expect(sawMotion, 'never caught the composition in flight — that is a snap, not a settle').toBe(true);

    // And the cluster stays anchored — V2.8 VB-137's version of the claim:
    // the column is CAPPED now, so at the ceiling the question zone yields
    // its few pixels and the field rides UP by exactly that yield — never
    // down, never under the dock. (The old zero-motion pin assumed the
    // slack below could absorb the whole drag; the cap spends it.) What the
    // rework banned stays banned: the field never slides DOWN the screen.
    const movedAnswerTop = await answerTop(page);
    expect(movedAnswerTop).toBeLessThanOrEqual(startingAnswerTop + 1);
    expect(startingAnswerTop - movedAnswerTop, 'the field moved more than the zone could have yielded').toBeLessThanOrEqual(24);

    // ...and both ended up where they belong. The surface is at least the room;
    // a question taller than it overflows and scrolls rather than being
    // squeezed.
    await page.waitForTimeout(420);
    const settled = await composition(page);
    expect(settled.areaBottom).toBeGreaterThanOrEqual(settled.navTop - FLOW_NAV_GAP - 2);
    expect(await page.locator('.flow').evaluate((el) => getComputedStyle(el).minHeight)).toBe(
      `${questionAreaHeight(PANEL.height, DRAWER.max)}px`,
    );
    const duration = await page.locator('.flow').evaluate((el) => ({
      property: getComputedStyle(el).transitionProperty,
      duration: getComputedStyle(el).transitionDuration,
      easing: getComputedStyle(el).transitionTimingFunction,
    }));
    expect(duration.property).toBe('min-height');
    expect(duration.duration).toBe('0.32s');
    expect(duration.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');

    // A nudge is the system's default 200ms, and a drag is neither.
    await page.keyboard.press('ArrowDown');
    await expect
      .poll(async () => page.locator('.flow').evaluate((el) => getComputedStyle(el).transitionDuration))
      .toBe('0.2s');

    await context.close();
  });

  test('reduced motion holds the question still and gives it the room at once', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpTo(contextModules, 'preferred_name'));
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.filedrawer-handle');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');

    await page.locator('.filedrawer-handle').focus();
    await page.keyboard.press('End');
    const durations = await page.evaluate(() => ({
      surface: getComputedStyle(document.querySelector('.flow') as HTMLElement).transitionDuration,
      drawer: getComputedStyle(document.querySelector('.filedrawer') as HTMLElement).transitionDuration,
    }));
    expect(durations.surface).toBe('0s');
    expect(durations.drawer).toBe('0s');

    // The still equivalent carries the same information: the question has its
    // new room from the first frame, fills it, and is still one cluster.
    const c = await composition(page);
    expect(c.areaBottom).toBeGreaterThanOrEqual(c.navTop - FLOW_NAV_GAP - 2);
    expect(await page.locator('.flow').evaluate((el) => getComputedStyle(el).minHeight)).toBe(
      `${questionAreaHeight(PANEL.height, Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow')))}px`,
    );
    expectComposedCluster(c, 'preferred_name, reduced motion');

    await context.close();
  });

  test('a flow with no drawer is untouched by any of this', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpTo(contextModules, 'peeves'));
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

    // The proof loop has no dock to fill down to, so it keeps V1.2's layout:
    // no shell, no min-height, an ordinary footer at the end of the content.
    await expect(page.locator('.flowshell')).toHaveCount(0);
    const minHeight = await page.locator('.flow').evaluate((el) => getComputedStyle(el).minHeight);
    expect(minHeight === 'auto' || minHeight === '0px').toBe(true);

    await context.close();
  });

  test('screenshots: three real questions, three drawer heights', async () => {
    const { context, sw, id } = await launchExtension();

    for (const stepId of ['preferred_name', 'peeves', 'voice_qualification']) {
      const page = await openAt(context, sw, id, stepId);
      // Rest first, as it opens, then either end of the drag — so no screenshot
      // depends on a toggle putting the drawer back where it started. The extra
      // wait is the typewriter (V1.2 VB-10) finishing the longest question:
      // it reserves its box from the first frame so it never moves anything,
      // but a half-typed heading in a screenshot is a picture of the wrong
      // moment.
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOTS, `${stepId}-rest.png`) });
      for (const [name, key] of [
        ['min', 'Home'],
        ['max', 'End'],
      ] as const) {
        await setHeight(page, key);
        await page.screenshot({ path: path.join(SHOTS, `${stepId}-${name}.png`) });
      }
      await page.close();
    }

    await context.close();
  });
});
