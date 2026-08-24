import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { DRAWER_REST_HEIGHT } from '../../src/core/drawer/height';
import { BRAIN_MIN_HEIGHT, BRAIN_OPEN_HEIGHT, MORPH_LAND_MS, MORPH_MS } from '../../src/core/drawer/mode';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.2 VB-14b accept criteria, driven in a real browser.
 *
 * The unit tests (src/core/drawer/mode.test.ts) prove the arithmetic: which
 * mode a height allows, what choosing Brain does to the height, where each
 * flying node's two ends are. None of that is the feature. What this spec is
 * for is everything only a browser can answer:
 *
 *  - that a mode change is a MORPH and not a swap — sampled every frame, so a
 *    node that teleported would be caught with two positions and no third;
 *  - that it survives being interrupted half way through;
 *  - that dragging the drawer short really hands Brain over to List, and that
 *    dragging back up hands it back;
 *  - that a lit node in Brain navigates exactly as a row in List does;
 *  - that the idle turn stops dead at the peek and when the panel is hidden,
 *    and what it costs while it runs;
 *  - that a reduced-motion visitor gets an instant change with everything
 *    still reachable.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
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

/** Same fixture the VB-07 and VB-12 specs use: far enough in that the file has
 * written, current and untouched sections, so both modes have real state. */
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

/**
 * Counts every frame anyone asks for, from before the app loads.
 *
 * NOT zero on this screen, and that is not this task's doing: V1.2 VB-13 ships
 * `STATUS_MARK_SPIN = 'continuous'`, so the brand mark beside the module label
 * is already asking for a frame forever while the interview is open. The globe
 * running or not is therefore measured as the *difference* between two rates —
 * one loop's worth of frames a second — rather than against zero, which the
 * panel has not been able to reach since VB-13.
 */
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

/** How many frames a second the page as a whole is asking for, over `ms`. One
 * rAF loop is worth about sixty of them. */
async function frameRate(page: Page, ms = 600): Promise<number> {
  const before = await frames(page);
  await page.waitForTimeout(ms);
  return Math.round((((await frames(page)) - before) * 1000) / ms);
}

/** The globe's pose, read off the picture: every vertex's depth, as one
 * string. It changes if and only if the geometry turned. */
const globePose = (page: Page) =>
  page
    .locator('.brainglobe-node')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-depth')).join(','));

async function openMidInterview(
  context: BrowserContext,
  sw: Worker,
  id: string,
  options: { reducedMotion?: 'reduce' | 'no-preference'; frames?: boolean } = {},
): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[3]!.id));
  const page = await context.newPage();
  if (options.frames) await countFrames(page);
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: options.reducedMotion });
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V1.7 VB-34. The splash runs its own animation loop for the first couple
  // of seconds of a session, including the 320ms it spends fading out after
  // it has stopped taking clicks. The frame-rate baselines below mean "the
  // status mark, and nothing else", so wait until that is true.
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /Context\.md/ }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  return page;
}

const brainButton = (page: Page) => page.getByRole('button', { name: S.drawerModeBrain, exact: true });
const listButton = (page: Page) => page.getByRole('button', { name: S.drawerModeList, exact: true });
const drawerMode = (page: Page) => page.locator('.filedrawer').getAttribute('data-mode');
const announcedHeight = async (page: Page) =>
  Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow'));

/**
 * Waits out a mode change: the flight layer gone AND the drawer's own height
 * settled where the handle says it is.
 *
 * Both halves are load-bearing. The morph is measured in a passive effect, so
 * for a frame or two after a click there is genuinely nothing flying yet and
 * "no nodes" would pass before it started; and choosing Brain resizes the
 * drawer over 320ms, so a test that measured anything before that finished
 * would measure the drawer mid-travel. The short wait first is what stops the
 * poll succeeding in the gap before either has begun.
 */
async function drawerSettled(page: Page): Promise<void> {
  await page.waitForTimeout(80);
  await expect
    .poll(
      async () => {
        const flying = await page.locator('.filedrawer-morph-node').count();
        const box = (await page.locator('.filedrawer').boundingBox())!;
        return flying === 0 && Math.abs(box.height - (await announcedHeight(page))) < 1.5;
      },
      { timeout: 5000 },
    )
    .toBe(true);
}

/** Press on the grip and move the pointer to an absolute y — the same gesture
 * tests/e2e/drawer-drag.spec.ts uses, and for the same reason: the grip's
 * centre sits on the drawer's top edge, so the height is `panel - pointer y`. */
async function dragHandleTo(page: Page, y: number): Promise<void> {
  const box = (await page.locator('.filedrawer-grip').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y, { steps: 6 });
  await page.mouse.up();
}

/**
 * Records where every flying node is, every frame, in the page — plus where
 * the globe sphere it is heading for is on the same frame.
 *
 * Sampled in the page rather than over the wire because a morph is 520ms and a
 * round trip per read would sample it four or five times at best. The sphere
 * is tracked alongside so the landing can be checked against where the target
 * actually was at the end, not where it was when the flight began.
 *
 * V1.6 VB-32 records each sample's SIZE as well as its centre — `[x, y, w, h]`
 * — because "the flight ends on the row's own glyph" is a claim about how big
 * the node is when it gets there as much as about where it is.
 */
async function trackMorph(page: Page, sectionId: string): Promise<void> {
  await page.evaluate((id) => {
    const w = window as unknown as { __wbTrack: number[][]; __wbTarget: number[][] };
    w.__wbTrack = [];
    w.__wbTarget = [];
    const round = (n: number) => Math.round(n * 10) / 10;
    const centre = (el: Element | null) => {
      if (!el) return null;
      const box = el.getBoundingClientRect();
      return [round(box.x + box.width / 2), round(box.y + box.height / 2), round(box.width), round(box.height)];
    };
    const tick = () => {
      const node = centre(document.querySelector(`.filedrawer-morph-node[data-node-id="${id}"]`));
      if (node) w.__wbTrack.push(node);
      const sphere = centre(document.querySelector(`.brainglobe-node[data-section-id="${id}"] .brainglobe-sphere`));
      if (sphere) w.__wbTarget.push(sphere);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, sectionId);
}

const readTrack = (page: Page) =>
  page.evaluate(() => ({
    node: (window as unknown as { __wbTrack: number[][] }).__wbTrack,
    target: (window as unknown as { __wbTarget: number[][] }).__wbTarget,
  }));

test.describe('VB-14b — two modes in one drawer', () => {
  test('it opens on List, and Brain is a choice with a name', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    // The drawer opens on the tame, navigable mode — a globe drawn into the
    // resting peek is the unusable version of it.
    expect(await drawerMode(page)).toBe('list');
    await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(brainButton(page)).toHaveAttribute('aria-pressed', 'false');
    // Both names come from strings.ts, and both are found the way anyone using
    // them would: by role and name.
    await expect(page.getByRole('group', { name: S.drawerModes })).toHaveCount(1);

    // The tree is the thing on screen; the globe is mounted but hidden — which
    // is what keeps it measurable for the morph without being reachable.
    await expect(page.locator('.filetree-row').first()).toBeVisible();
    expect(await page.locator('.filedrawer-stage').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');

    await context.close();
  });

  test('choosing Brain while the drawer is short expands it to fit the globe', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    expect(await announcedHeight(page)).toBe(DRAWER_REST_HEIGHT);
    expect(DRAWER_REST_HEIGHT).toBeLessThan(BRAIN_OPEN_HEIGHT);

    await brainButton(page).click();
    await drawerSettled(page);

    expect(await announcedHeight(page)).toBe(BRAIN_OPEN_HEIGHT);
    expect((await page.locator('.filedrawer').boundingBox())!.height).toBeCloseTo(BRAIN_OPEN_HEIGHT, 0);
    expect(await drawerMode(page)).toBe('brain');

    // And what arrived is a real globe at a real size, not a badge.
    const stage = (await page.locator('.brainglobe').boundingBox())!;
    expect(stage.width).toBeGreaterThan(200);
    expect(stage.height).toBeGreaterThan(200);
    await expect(page.locator('.brainglobe-pin[data-section-id]')).toHaveCount(contextOutline.length);

    await context.close();
  });

  test('the mode change is a morph, not a swap — every node is caught in flight', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    await trackMorph(page, 'sec1');
    await brainButton(page).click();
    await drawerSettled(page);
    const { node, target } = await readTrack(page);

    // It really flew: many frames, many distinct positions. A swap dressed up
    // as a morph would produce one position, or two.
    expect(node.length, 'the morph layer was never drawn').toBeGreaterThan(8);
    const distinct = new Set(node.map((point) => point.join(','))).size;
    expect(distinct, 'the node teleported — it had no intermediate positions').toBeGreaterThan(5);

    // And it travelled: the first and last samples are a long way apart, with
    // samples strictly between them on both axes.
    const first = node[0]!;
    const last = node[node.length - 1]!;
    const travelled = Math.hypot(last[0]! - first[0]!, last[1]! - first[1]!);
    expect(travelled, 'the node did not go anywhere').toBeGreaterThan(40);
    const between = node.filter((point) => {
      const fromStart = Math.hypot(point[0]! - first[0]!, point[1]! - first[1]!);
      const toEnd = Math.hypot(point[0]! - last[0]!, point[1]! - last[1]!);
      return fromStart > 8 && toEnd > 8;
    });
    expect(between.length, 'no sample was between the two ends — that is a jump').toBeGreaterThan(3);

    // It landed on the sphere it was aimed at, measured on the same frame.
    const sphere = target[target.length - 1]!;
    expect(Math.hypot(last[0]! - sphere[0]!, last[1]! - sphere[1]!), 'the node missed its sphere').toBeLessThan(14);

    await context.close();
  });

  /**
   * V1.6 VB-32 — THE ORB BECOMES THE ROW.
   *
   * The flight itself never regressed; what it stopped doing was reading as
   * itself. This is the same test VB-14b wrote, with the landing tightened
   * from "somewhere within fourteen pixels of the marker" — which a dot fading
   * out beside it also passes — to the thing the task actually asks for: the
   * node ends ON the row's own glyph, at the glyph's own size and position.
   *
   * The tolerance is one pixel because both numbers come from the same DOM on
   * the same frame; anything looser would let the old behaviour back in.
   */
  test('the morph runs both ways, and an orb ends as its row’s own marker', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    await brainButton(page).click();
    await drawerSettled(page);

    await trackMorph(page, 'sec1');
    await listButton(page).click();
    await drawerSettled(page);
    const { node } = await readTrack(page);

    expect(node.length).toBeGreaterThan(8);
    expect(new Set(node.map((point) => point.join(','))).size).toBeGreaterThan(5);

    // The row's own marker is where it ended up — and what size it ended at.
    const glyph = (await page.locator('.filetree-row[data-node-id="sec1"] .filetree-glyph').boundingBox())!;
    const last = node[node.length - 1]!;
    expect(Math.abs(last[0]! - (glyph.x + glyph.width / 2)), 'not on the marker’s x').toBeLessThanOrEqual(1);
    expect(Math.abs(last[1]! - (glyph.y + glyph.height / 2)), 'not on the marker’s y').toBeLessThanOrEqual(1);
    // At the marker's own size: the smaller side of a marker that is wider
    // than it is tall, which is what puts an orb the height of the tile dead
    // centre on it (core/drawer/mode.ts's `endOf`).
    const marker = Math.min(glyph.width, glyph.height);
    expect(last[2]!, 'the orb did not arrive at the marker’s size').toBeCloseTo(marker, 0);
    expect(last[3]!, 'the orb did not arrive at the marker’s size').toBeCloseTo(marker, 0);
    // It GREW into the marker rather than shrinking away inside it — the
    // specific thing VB-32 is about.
    expect(last[2]!, 'the orb shrank into a bullet on the way in').toBeGreaterThan(node[0]![2]! * 0.5);

    await context.close();
  });

  /**
   * V1.6 VB-32's other half: the hand-off. The flight lands ON the mark, which
   * means the last frame has an orb and the mark it became in one box — so the
   * layer stands still for `MORPH_LAND_MS` and gives way rather than blinking
   * out. Asserted as a phase that really happens, with nothing moving in it.
   */
  test('the landed orbs hand over to the marks instead of blinking out', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    await brainButton(page).click();
    await drawerSettled(page);

    // Sampled every frame in the page: a 120ms phase is shorter than a poll
    // over the wire can reliably catch, and what is being claimed is about
    // frames anyway.
    await page.evaluate(() => {
      const w = window as unknown as { __wbLand: (string | number)[][] };
      w.__wbLand = [];
      const tick = () => {
        const layer = document.querySelector('.filedrawer-morph');
        const node = document.querySelector('.filedrawer-morph-node');
        if (layer) {
          const box = node?.getBoundingClientRect();
          w.__wbLand.push([
            layer.getAttribute('data-phase') ?? 'none',
            Number(getComputedStyle(layer).opacity),
            box ? Math.round((box.x + box.width / 2) * 10) / 10 : -1,
            box ? Math.round(box.width * 10) / 10 : -1,
            getComputedStyle(layer).transitionDuration,
          ]);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await listButton(page).click();
    await drawerSettled(page);
    const frames = await page.evaluate(() => (window as unknown as { __wbLand: (string | number)[][] }).__wbLand);

    // Caught in the hand-off: the layer says `land`, it is on its way out
    // under its own 120ms, and the node it is handing over is still there at
    // its landed size while it goes.
    const landing = frames.filter((frame) => frame[0] === 'land' && frame[3] !== -1);
    expect(landing.length, 'there was no hand-off — the orbs blinked out').toBeGreaterThan(2);
    expect(landing[0]![4], 'the hand-off has no clock').toBe(`${MORPH_LAND_MS / 1000}s`);
    // Nothing moves in it, and nothing resizes: it is a stand-still phase.
    const still = new Set(landing.map((frame) => `${frame[2]},${frame[3]}`));
    expect(still.size, 'the nodes kept moving during the hand-off').toBe(1);
    // And it really does fade: full strength when it starts, gone by the end.
    expect(Number(landing[0]![1])).toBeGreaterThan(0.5);
    expect(Number(landing[landing.length - 1]![1])).toBeLessThan(0.5);

    // …and then it is gone, leaving the row's own marker on screen.
    await drawerSettled(page);
    expect(await page.locator('.filedrawer-morph-node').count()).toBe(0);
    await expect(page.locator('.filetree-row[data-node-id="sec1"] .filetree-glyph')).toBeVisible();

    await context.close();
  });

  test('interrupting a morph re-aims the nodes instead of breaking them', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    await trackMorph(page, 'sec1');
    await brainButton(page).click();
    // Half way through the 520ms flight, change your mind.
    await page.waitForTimeout(Math.round(MORPH_MS / 2));
    expect(await page.locator('.filedrawer-morph-node').count()).toBeGreaterThan(0);
    // Mid-flight, the drawer says where the flight is headed and the layer
    // says it is running rather than still on its start frame.
    expect(await page.locator('.filedrawer').getAttribute('data-morph')).toBe('brain');
    expect(await page.locator('.filedrawer-morph').getAttribute('data-phase')).toBe('run');
    await listButton(page).click();
    await drawerSettled(page);

    // Nothing is stuck: the drawer is in the mode last asked for, the flight
    // layer has gone, and the list is the thing on screen.
    expect(await drawerMode(page)).toBe('list');
    await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.filedrawer-body').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
    expect(await page.locator('.filedrawer-stage').evaluate((el) => getComputedStyle(el).visibility)).toBe('hidden');

    // The node was re-aimed mid-flight, not snapped back: it ends on its row.
    const { node } = await readTrack(page);
    const glyph = (await page.locator('.filetree-row[data-node-id="sec1"] .filetree-glyph').boundingBox())!;
    const last = node[node.length - 1]!;
    expect(Math.hypot(last[0]! - (glyph.x + glyph.width / 2), last[1]! - (glyph.y + glyph.height / 2))).toBeLessThan(14);

    // And the question is still answerable after all that.
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'step');

    await context.close();
  });

  test('dragging below the threshold hands Brain over to List, and back up returns it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    await brainButton(page).click();
    await drawerSettled(page);
    expect(await drawerMode(page)).toBe('brain');

    // Drag the drawer down past ~180px. Nobody pressed List — the height did.
    await dragHandleTo(page, PANEL.height - (BRAIN_MIN_HEIGHT - 30));
    expect(await announcedHeight(page)).toBeLessThan(BRAIN_MIN_HEIGHT);
    await expect.poll(() => drawerMode(page), { timeout: 3000 }).toBe('list');
    await drawerSettled(page);
    await expect(page.locator('.filetree-row').first()).toBeVisible();

    // Drag back up and Brain returns, because what is held is the request and
    // the request never changed.
    await dragHandleTo(page, PANEL.height - (BRAIN_MIN_HEIGHT + 80));
    await expect.poll(() => drawerMode(page), { timeout: 3000 }).toBe('brain');
    await drawerSettled(page);
    await expect(brainButton(page)).toHaveAttribute('aria-pressed', 'true');

    await context.close();
  });

  test('the module label and the thin bar stay above the drawer in both modes', async () => {
    // VB-14's open item 2: Brain answers "what's left" worse than a list does,
    // and these two are the agreed mitigation. Neither mode may drop them.
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);

    for (const mode of ['list', 'brain', 'list'] as const) {
      if (mode === 'brain') await brainButton(page).click();
      else await listButton(page).click();
      await drawerSettled(page);
      expect(await drawerMode(page)).toBe(mode);

      const progress = page.locator('.flowprogress');
      await expect(progress, mode).toBeVisible();
      const bar = (await progress.boundingBox())!;
      const drawer = (await page.locator('.filedrawer').boundingBox())!;
      expect(bar.y, mode).toBeGreaterThanOrEqual(0);
      expect(bar.y + bar.height, mode).toBeLessThanOrEqual(drawer.y + 1);
      // The bar is a real progressbar with a real value in both, not a strip.
      await expect(progress, mode).toHaveAttribute('aria-valuetext', /^Question \d+ of \d+$/);
    }

    await context.close();
  });
});

test.describe('VB-14b — navigation survives in both modes', () => {
  test('a lit node in Brain navigates exactly as a row in List does', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    const firstQuestion = contextOutline[0]!.questionIds[0]!;
    const before = await page.locator('.flow').getAttribute('data-step-id');

    // The List path, which VB-07 built and which must not regress.
    await page.locator('.filetree-row[data-node-id="sec1"] .filetree-nav').click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', firstQuestion);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', before!);

    // The Brain path: the same section, the same destination, the same Back.
    await brainButton(page).click();
    await drawerSettled(page);
    // Reached from the keyboard — the globe is one tab stop with a roving
    // focus, so this is also the whole keyboard path through it.
    await page.locator('.filedrawer-handle').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.brainglobe-pin[data-section-id="sec1"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', firstQuestion);

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', before!);

    await context.close();
  });

  test('an unreached section is not a jump in Brain either', async () => {
    // The same rule the tree enforces by not rendering a button: review
    // navigation, never a shortcut past questions the flow guarantees.
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await brainButton(page).click();
    await drawerSettled(page);

    const untouched = page.locator('.brainglobe-pin[data-node-state="untouched"]').first();
    await expect(untouched).toHaveCount(1);
    const stepId = await page.locator('.flow').getAttribute('data-step-id');
    await untouched.evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(200);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', stepId!);

    await context.close();
  });
});

test.describe('VB-14b — the idle turn, and what it costs', () => {
  test('the globe turns by itself in Brain, and stops dead at the peek', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, { frames: true });

    // List: the globe exists but nothing is asking it to move. This is also
    // the baseline rate — VB-13's status mark, and nothing else.
    const listRate = await frameRate(page);

    await brainButton(page).click();
    await drawerSettled(page);

    // It turns. Real geometry, not a CSS spin: every vertex's depth changes.
    const first = await globePose(page);
    await page.waitForTimeout(900);
    expect(await globePose(page), 'the globe never moved — there is no drift').not.toBe(first);
    const brainRate = await frameRate(page);
    expect(brainRate - listRate, 'no second loop appeared — the globe is not driving frames').toBeGreaterThan(20);

    // Down to the peek. Brain hands over, and its loop goes with it: the pose
    // stops changing and the page is back to one loop's worth of frames.
    await page.locator('.filedrawer-handle').focus();
    await page.keyboard.press('Home');
    await expect.poll(() => drawerMode(page), { timeout: 3000 }).toBe('list');
    await drawerSettled(page);
    await page.waitForTimeout(200);

    const parked = await globePose(page);
    const peekRate = await frameRate(page);
    expect(await globePose(page), 'the globe kept turning at the peek').toBe(parked);
    expect(peekRate, 'a loop is still running at the peek').toBeLessThan(listRate + 20);

    await context.close();
  });

  test('it pauses entirely when the panel loses visibility, and picks up again', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, { frames: true });
    const listRate = await frameRate(page);
    await brainButton(page).click();
    await drawerSettled(page);
    expect(await frameRate(page)).toBeGreaterThan(listRate + 20);

    // `document.visibilityState` cannot be emulated by Playwright, so it is
    // overridden and the event fired — which is what a browser does when the
    // panel is covered, and is exactly the code path that has to stop the loop.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);

    const frozen = await globePose(page);
    const hiddenRate = await frameRate(page, 800);
    expect(await globePose(page), 'the globe kept turning behind a hidden panel').toBe(frozen);
    expect(hiddenRate, 'the globe’s loop kept running behind a hidden panel').toBeLessThan(listRate + 20);

    // Back on screen, it picks the turn up again — a globe that stayed frozen
    // for the rest of the session would be worse than one that never moved.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(600);
    expect(await globePose(page), 'the globe never restarted').not.toBe(frozen);

    await context.close();
  });

  /**
   * VB-14's open item 3: "Measure it on the interview screens before
   * shipping." This is that measurement, run on the real panel with a real
   * question on screen, and it reports as well as asserts — the numbers are
   * quoted in the task's report.
   *
   * Two figures. Frames a second says how often the loop is asked for; the
   * throughput probe says what fraction of the main thread it is taking, by
   * counting how many units of fixed synchronous work the page can finish in
   * a second with the drift running and without it. The assertion is
   * deliberately loose — this runs on whatever machine happens to run it —
   * and the failure it exists to catch is a runaway loop, not a slow laptop.
   */
  test('the drift costs a measurable and small slice of the main thread', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, { frames: true });

    const probe = (ms: number) =>
      page.evaluate(async (budget) => {
        let done = 0;
        const unit = () => {
          let x = 0;
          for (let i = 1; i < 120000; i++) x += Math.sqrt(i);
          return x;
        };
        const end = performance.now() + budget;
        await new Promise<void>((resolve) => {
          const step = () => {
            unit();
            done += 1;
            if (performance.now() < end) setTimeout(step, 0);
            else resolve();
          };
          step();
        });
        return done;
      }, ms);

    // List: the globe is mounted and still. Whatever this costs is VB-13's
    // status mark plus the panel itself, and it is the baseline the globe's
    // own cost is measured against.
    const listWork = await probe(1000);

    await brainButton(page).click();
    await drawerSettled(page);
    const before = await frames(page);
    const driftWork = await probe(1000);
    const perSecond = (await frames(page)) - before;

    const share = Math.round((1 - driftWork / listWork) * 100);
    console.log(`  VB-14b drift: ${perSecond} frames/s requested with the globe turning`);
    console.log(`  VB-14b drift: ${share}% of main-thread throughput (${listWork} units/s in List, ${driftWork} in Brain)`);

    // It is running — a zero here would mean the measurement measured nothing.
    expect(perSecond).toBeGreaterThan(10);
    // ...and it is not eating the panel.
    expect(share, 'the idle turn is taking too much of the main thread').toBeLessThan(50);

    await context.close();
  });
});

test.describe('VB-14b — reduced motion', () => {
  test('the mode changes instantly, with no flight and no loop', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, { reducedMotion: 'reduce', frames: true });

    await brainButton(page).click();
    // Instant: the mode is already the new one, and no node was ever drawn.
    expect(await drawerMode(page)).toBe('brain');
    expect(await page.locator('.filedrawer-morph-node').count()).toBe(0);
    expect(await page.locator('.filedrawer-stage').evaluate((el) => getComputedStyle(el).visibility)).toBe('visible');
    expect(await page.locator('.filedrawer-stage').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await page.waitForTimeout(300);
    expect(await page.locator('.filedrawer-morph-node').count()).toBe(0);

    // No frame is ever asked for: not "the drift is invisible", but that the
    // loop was never started (docs/GUARDRAILS.md's still-equivalent rule).
    await page.waitForTimeout(500);
    expect(await frames(page), 'a reduced-motion visitor got a frame loop').toBe(0);

    await context.close();
  });

  test('everything is still reachable, in both modes, with the keyboard alone', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, { reducedMotion: 'reduce' });

    // Brain: the globe is one tab stop, every section is on the roving focus,
    // and every lit one still navigates.
    await brainButton(page).click();
    await page.locator('.filedrawer-handle').focus();
    await page.keyboard.press('Tab');
    const reached: string[] = [];
    for (let i = 0; i < contextOutline.length; i++) {
      reached.push(await page.evaluate(() => document.activeElement?.getAttribute('data-section-id') ?? ''));
      await page.keyboard.press('ArrowRight');
    }
    expect(new Set(reached).size).toBe(contextOutline.length);

    // ...and back to List, instantly, with the tree reachable again.
    await listButton(page).click();
    expect(await drawerMode(page)).toBe('list');
    await expect(page.locator('.filetree-row[data-node-id="sec1"] .filetree-nav')).toBeVisible();
    await page.locator('.filetree-row[data-node-id="sec1"] .filetree-nav').click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', contextOutline[0]!.questionIds[0]!);

    await context.close();
  });
});
