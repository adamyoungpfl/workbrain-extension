import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { FLOW_NAV_GAP } from '../../src/core/flow/dock';
import { questionAreaHeight } from '../../src/core/flow/composition';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.3 VB-17 accept criteria, driven in a real browser against the real ported
 * interview.
 *
 * The unit tests (src/core/flow/composition.test.ts) prove the proportion the
 * geometry produces. What they cannot prove is the only thing this task
 * actually is: that a question with almost nothing on it no longer leaves half
 * the panel doing nothing, that the tallest questions in the ported data are
 * still whole at the drawer's resting height, and that both of those survive
 * the drawer being dragged to either end (V1.2 VB-12) with the navigation bar
 * riding on its edge (V1.2 VB-11).
 *
 * EVERYTHING HERE MEASURES REAL BOUNDING BOXES. DOM order proves nothing about
 * a layout that distributes space, and a class toggling proves less.
 *
 * Three real questions, chosen because they are the extremes of the ported
 * content and not because they are convenient:
 *  - `preferred_name` — the shortest. One line, one field, no hint.
 *  - `peeves` — ten options and an "add your own". The tallest.
 *  - `voice_qualification` — three options under a hint that is three worked
 *    examples, i.e. tall in the part the layout must NOT stretch.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb17');
const PANEL = { width: 400, height: 700 };

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
  await page.getByRole('button', { name: /Context\.md/ }).click();
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

/**
 * The composition, measured in one pass so nothing can move between reads.
 *
 * `bands` is every gap between two consecutive pieces of the question's own
 * content, top to bottom — which is what "a large dead band" actually means on
 * screen. The selectors are the visible rows of a question: the progress
 * strip, the question and its help, whatever the answer band holds, and the
 * save note. Anything with no box (an sr-only span, an unrendered branch) is
 * skipped rather than counted as a zero-height row in the middle of the page.
 */
async function composition(page: Page): Promise<{
  areaTop: number;
  areaBottom: number;
  areaContentBottom: number;
  contentBottom: number;
  navTop: number;
  drawerTop: number;
  bands: { after: string; gap: number }[];
  rows: { name: string; top: number; bottom: number }[];
}> {
  return page.evaluate(() => {
    const flow = document.querySelector('.flow') as HTMLElement;
    const nav = document.querySelector('.flow-foot')!.getBoundingClientRect();
    const drawer = document.querySelector('.filedrawer')!.getBoundingClientRect();
    const selectors = [
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
      '.flow-answer .flow-error',
      '.flow-answer .flow-reflect-actions',
      '.flow-save',
    ];
    const rows: { name: string; top: number; bottom: number }[] = [];
    for (const selector of selectors) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        const r = element.getBoundingClientRect();
        if (r.height <= 0 || r.width <= 0) continue;
        rows.push({ name: selector, top: r.top, bottom: r.bottom });
      }
    }
    rows.sort((a, b) => a.top - b.top);
    const bands: { after: string; gap: number }[] = [];
    for (let i = 1; i < rows.length; i++) {
      bands.push({ after: rows[i - 1]!.name, gap: Math.max(0, rows[i]!.top - rows[i - 1]!.bottom) });
    }
    const flowBox = flow.getBoundingClientRect();
    return {
      areaTop: flowBox.top,
      areaBottom: flowBox.bottom,
      // The surface's own bottom padding is not a dead band — it is the frame
      // every screen in this product is drawn inside.
      areaContentBottom: flowBox.bottom - parseFloat(getComputedStyle(flow).paddingBottom),
      contentBottom: rows.length ? rows[rows.length - 1]!.bottom : flowBox.top,
      navTop: nav.top,
      drawerTop: drawer.top,
      bands,
      rows,
    };
  });
}

function widestBand(bands: { after: string; gap: number }[]): { after: string; gap: number } {
  return bands.reduce((worst, band) => (band.gap > worst.gap ? band : worst), { after: 'nothing', gap: 0 });
}

async function setHeight(page: Page, key: string): Promise<number> {
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press(key);
  // Let the 320ms jump finish before anything is measured at rest.
  await page.waitForTimeout(420);
  await page.locator('.flow-q').first().click({ position: { x: 2, y: 2 } }).catch(() => undefined);
  return Number(await handle.getAttribute('aria-valuenow'));
}

/** Where the answer band's first control is right now — the thing the
 * distribution actually moves, and therefore the thing to watch during a
 * settle. */
async function answerTop(page: Page): Promise<number> {
  return page.evaluate(() => document.querySelector('.flow-answer > *')!.getBoundingClientRect().top);
}

test.describe('VB-17 — the question area fills the panel down to the dock', () => {
  test('the shortest question in the flow leaves no dead band', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAt(context, sw, id, 'preferred_name');

    const c = await composition(page);
    const area = c.navTop - c.areaTop;

    // 1. The surface really is the room above the dock — not its content's
    //    natural height, which is what left the strip in the first place.
    expect(c.areaBottom).toBeGreaterThanOrEqual(c.navTop - FLOW_NAV_GAP - 2);
    expect(c.areaBottom).toBeLessThanOrEqual(c.navTop + 1);

    // 2. And its content reaches the bottom of that room: the last thing the
    //    question prints sits just above the bar, not half a screen above it.
    expect(c.areaContentBottom - c.contentBottom, 'blank strip under the last row').toBeLessThanOrEqual(4);

    // 3. No single gap inside the question swallows the screen. Before this
    //    task the strip under the field was over half the area; the slack is
    //    now shared between two seams either side of the answer.
    const worst = widestBand(c.bands);
    expect(worst.gap, `widest band is after ${worst.after}`).toBeLessThan(area * 0.35);

    // 4. The question is still at the top, where it is read — filling the
    //    panel must not mean floating the question into the middle of it.
    const question = await box(page.locator('.flow-q'));
    expect(question.top - c.areaTop).toBeLessThan(area * 0.2);

    // 5. And the field is still a field: distributing space around it must not
    //    have stretched a single-line input into a panel.
    const field = await box(page.locator('.flow-answer .field'));
    expect(field.height).toBeLessThan(70);
    expect(field.top).toBeGreaterThan(question.bottom);

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

    // Nothing is cut off: the surface grew past the room instead of clipping,
    // and the page scrolls to reach the rest.
    const overflow = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      clipped: getComputedStyle(document.querySelector('.flow') as HTMLElement).overflow,
    }));
    expect(overflow.clipped).toBe('visible');
    expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);

    // The last option is reachable, and scrolled to the end of the page it is
    // clear of the docked bar — the reservation (V1.2 VB-11) still holds under
    // a surface taller than the panel. Scrolled to the *end*, not
    // `scrollIntoViewIfNeeded`: the browser stops as soon as an element is
    // inside the viewport, and the viewport includes the strip the drawer is
    // painted over. What the reserve promises is that the page can be scrolled
    // far enough, which is what this measures.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(120);
    const last = await box(pills.last());
    const end = await composition(page);
    expect(last.bottom).toBeLessThanOrEqual(end.navTop + 1);
    expect(end.contentBottom).toBeLessThanOrEqual(end.navTop + 1);

    // And it is answerable from there.
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
    // answerable at a glance. Space is distributed AROUND the answer, never
    // between a question and its own help — so the help is deliberately not in
    // the band the space is distributed into, and the controls are.
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

    const worst = widestBand(c.bands);
    expect(worst.gap, `widest band is after ${worst.after}`).toBeLessThan((c.navTop - c.areaTop) * 0.35);

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

        // At the peek the question has more room and still fills it; at full
        // height it has little and must not be covered by anything.
        if (key === 'Home') {
          expect(c.areaContentBottom - c.contentBottom, `blank strip, ${where}`).toBeLessThanOrEqual(4);
          const worst = widestBand(c.bands);
          expect(worst.gap, `widest band after ${worst.after}, ${where}`).toBeLessThan((c.navTop - c.areaTop) * 0.35);
        }

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
        expect(scrolled.contentBottom, `last row clear of the bar, ${where}`).toBeLessThanOrEqual(scrolled.navTop + 1);
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

    const before = await answerTop(page);
    await page.locator('.filedrawer-handle').focus();
    await page.keyboard.press('End');

    // Caught inside the 320ms jump, three times. The drawer takes the room
    // over a settle, so the question has to give it up over the same settle —
    // an untransitioned min-height would move the field to its final place in
    // one frame and leave the drawer arriving underneath it afterwards.
    let sawMotion = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(60);
      const now = await answerTop(page);
      const drawerTop = (await composition(page)).drawerTop;
      if (now < before - 4 && drawerTop > PANEL.height - 380 + 4) sawMotion = true;
    }
    expect(sawMotion, 'never caught the composition in flight — that is a snap, not a settle').toBe(true);

    // ...and both ended up where they belong. The surface is at least the
    // room — `preferred_name` is a hair taller than the room at full drawer
    // height, so it overflows and scrolls rather than being squeezed.
    await page.waitForTimeout(420);
    const settled = await composition(page);
    expect(settled.areaBottom).toBeGreaterThanOrEqual(settled.navTop - FLOW_NAV_GAP - 2);
    expect(await page.locator('.flow').evaluate((el) => getComputedStyle(el).minHeight)).toBe(
      `${questionAreaHeight(PANEL.height, 380)}px`,
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
    await page.getByRole('button', { name: /Context\.md/ }).click();
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
    // new room from the first frame, and fills it.
    const c = await composition(page);
    expect(c.areaBottom).toBeGreaterThanOrEqual(c.navTop - FLOW_NAV_GAP - 2);
    expect(await page.locator('.flow').evaluate((el) => getComputedStyle(el).minHeight)).toBe(
      `${questionAreaHeight(PANEL.height, Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow')))}px`,
    );

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
      for (const [name, key] of [
        ['min', 'Home'],
        ['rest', 'ArrowUp'],
        ['max', 'End'],
      ] as const) {
        if (name === 'rest') {
          // Back to where it opens, rather than a third arbitrary height.
          await setHeight(page, 'Home');
          await page.locator('.filedrawer-handle').focus();
          await page.keyboard.press('Enter');
          await page.waitForTimeout(420);
        } else {
          await setHeight(page, key);
        }
        await page.screenshot({ path: path.join(SHOTS, `${stepId}-${name}.png`) });
      }
      await page.close();
    }

    await context.close();
  });
});
