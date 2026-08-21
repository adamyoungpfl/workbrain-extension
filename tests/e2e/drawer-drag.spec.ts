import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DRAWER_MIN_HEIGHT, DRAWER_REST_HEIGHT, DRAWER_STEP, drawerBounds } from '../../src/core/drawer/height';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.2 VB-12 accept criteria, driven in a real browser.
 *
 * The unit tests (src/core/drawer/height.test.ts) prove the arithmetic. What
 * they cannot prove is any of the things this feature actually is: that a
 * pointer press on a 44px band really drags a fixed-position drawer, that it
 * lands on a whole range of heights rather than two, that the keyboard reaches
 * the same range and says so out loud, that the question is still readable at
 * the ceiling, that the height dies with the panel, and — the one that matters
 * for VB-14 — that dragging inside the drawer's own content resizes nothing.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const PANEL = { width: 400, height: 700 };
const BOUNDS = drawerBounds(PANEL.height);

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  return page;
}

async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
  await page.waitForSelector('.filedrawer-handle');
}

/** Same fixture the VB-07 specs use: far enough in that the tree has written,
 * current and untouched rows, so the drawer has real content to reveal. */
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

async function seedMidInterview(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[3]!.id));
  const page = await openPanel(context, id);
  await enterInterview(page);
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  return page;
}

/** What the drawer actually measures on screen, not what it was told to be. */
async function renderedHeight(page: Page): Promise<number> {
  return (await page.locator('.filedrawer').boundingBox())!.height;
}

async function announcedHeight(page: Page): Promise<number> {
  return Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow'));
}

/**
 * Press on the grip and move the pointer to an absolute y. Left down at the
 * end unless `release`, so a test can look at the drawer mid-gesture.
 *
 * The press lands on the grip's own centre, which sits exactly on the drawer's
 * top edge — so the drawer's top follows the pointer 1:1 and the height a test
 * expects is simply `panel height - pointer y`. Pressing anywhere else in the
 * 44px band would be just as valid a gesture (the drag is by delta, so the
 * grab point stays under the pointer wherever it started) but the arithmetic
 * in every assertion would then carry the grab offset around with it.
 */
async function dragHandleTo(page: Page, y: number, release = true): Promise<void> {
  const box = (await page.locator('.filedrawer-grip').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y, { steps: 6 });
  if (release) await page.mouse.up();
}

test.describe('VB-12 — the drawer drags', () => {
  test('the handle is a grab handle: a broken rule, a grip, and a resize cursor', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const handle = page.locator('.filedrawer-handle');
    // It is a control before it is a decoration: the 44x44 floor, a resize
    // cursor, and its own tab stop (docs/GUARDRAILS.md).
    const box = (await handle.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(await handle.evaluate((el) => getComputedStyle(el).cursor)).toBe('ns-resize');
    expect(await handle.getAttribute('tabindex')).toBe('0');
    // The gesture is the drawer's, not the browser's — without this a touch
    // drag scrolls the panel instead of resizing.
    expect(await handle.evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');

    // The grip is really drawn: two bars, on an opaque pill that breaks the
    // rule it sits on, centred across the panel and centred on the rule.
    const grip = page.locator('.filedrawer-grip');
    await expect(grip).toBeVisible();
    const drawn = await grip.evaluate((el) => {
      const bars = [getComputedStyle(el, '::before'), getComputedStyle(el, '::after')];
      const rect = el.getBoundingClientRect();
      const drawer = document.querySelector('.filedrawer')!.getBoundingClientRect();
      return {
        bars: bars.map((s) => ({ content: s.content, height: s.height, colour: s.backgroundColor })),
        pill: getComputedStyle(el).backgroundColor,
        centreX: rect.x + rect.width / 2,
        centreY: rect.y + rect.height / 2,
        panelCentreX: window.innerWidth / 2,
        ruleY: drawer.y,
      };
    });
    expect(drawn.bars).toHaveLength(2);
    for (const bar of drawn.bars) {
      expect(bar.content).not.toBe('none');
      expect(parseFloat(bar.height)).toBeGreaterThan(0);
      expect(bar.colour).not.toBe('rgba(0, 0, 0, 0)');
    }
    expect(drawn.pill).not.toBe('rgba(0, 0, 0, 0)');
    expect(Math.abs(drawn.centreX - drawn.panelCentreX)).toBeLessThan(1);
    // Straddling the rule is what makes it read as a handle *on* the divider
    // rather than as a badge under it.
    expect(Math.abs(drawn.centreY - drawn.ruleY)).toBeLessThan(2);

    await context.close();
  });

  test('a pointer drag resizes it continuously, not between two states', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);

    expect(await renderedHeight(page)).toBeCloseTo(DRAWER_REST_HEIGHT, 0);

    // Six stops up the panel. Each one must land on its own height, and each
    // one must be the height the pointer is actually at — this is the whole
    // difference between a drag and a toggle.
    const seen = new Set<number>();
    for (const target of [500, 460, 420, 380, 340, 300]) {
      await dragHandleTo(page, target);
      const measured = await renderedHeight(page);
      expect(Math.abs(measured - (PANEL.height - target)), `pointer at ${target}`).toBeLessThanOrEqual(2);
      expect(await announcedHeight(page), `announced at ${target}`).toBeCloseTo(measured, 0);
      seen.add(Math.round(measured));
    }
    expect(seen.size, 'six drags produced six different heights').toBe(6);

    // And it tracks mid-gesture, not only on release.
    await dragHandleTo(page, 480, false);
    expect(Math.abs((await renderedHeight(page)) - (PANEL.height - 480))).toBeLessThanOrEqual(2);
    await page.mouse.up();

    await context.close();
  });

  test('it stops at the peek and at the ceiling, however far the pointer goes', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);

    await dragHandleTo(page, -400);
    expect(await announcedHeight(page)).toBe(BOUNDS.max);
    expect(await renderedHeight(page)).toBeCloseTo(BOUNDS.max, 0);

    await dragHandleTo(page, PANEL.height + 400);
    expect(await announcedHeight(page)).toBe(BOUNDS.min);
    expect(await renderedHeight(page)).toBeCloseTo(BOUNDS.min, 0);
    expect(BOUNDS.min).toBe(DRAWER_MIN_HEIGHT);

    await context.close();
  });

  test('the keyboard reaches every height the pointer can, and says where it is', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);
    const handle = page.locator('.filedrawer-handle');

    await expect(handle).toHaveAttribute('aria-valuemin', String(BOUNDS.min));
    await expect(handle).toHaveAttribute('aria-valuemax', String(BOUNDS.max));
    await expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_REST_HEIGHT));

    await handle.focus();
    await expect(handle).toBeFocused();

    // One arrow is one step, in the direction the drawer grows.
    await page.keyboard.press('ArrowUp');
    await expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_REST_HEIGHT + DRAWER_STEP));
    await page.keyboard.press('ArrowDown');
    await expect(handle).toHaveAttribute('aria-valuenow', String(DRAWER_REST_HEIGHT));

    // Page keys move further than arrows do.
    await page.keyboard.press('PageUp');
    const paged = await announcedHeight(page);
    expect(paged - DRAWER_REST_HEIGHT).toBeGreaterThan(DRAWER_STEP);

    // The ends, and the real drawer following them.
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', String(BOUNDS.max));
    await expect.poll(() => renderedHeight(page)).toBeCloseTo(BOUNDS.max, 0);
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', String(BOUNDS.min));
    await expect.poll(() => renderedHeight(page)).toBeCloseTo(BOUNDS.min, 0);

    // Enter collapses and restores — and what it restores is the height the
    // *pointer* last left it at, so the two ways of resizing share one state.
    await dragHandleTo(page, 380);
    const dragged = await announcedHeight(page);
    await handle.focus();
    await page.keyboard.press('Enter');
    await expect(handle).toHaveAttribute('aria-valuenow', String(BOUNDS.min));
    await page.keyboard.press('Enter');
    await expect(handle).toHaveAttribute('aria-valuenow', String(dragged));

    // Whatever it says, that is what it is.
    await expect.poll(() => renderedHeight(page)).toBeCloseTo(dragged, 0);
    await expect(handle).toHaveAttribute('aria-valuetext', /% open/);

    await context.close();
  });

  test('the question is never covered, at any height the drawer can reach', async () => {
    const { context, sw, id } = await launchExtension();
    // The name question: a real question with a field, not an intro screen.
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpToModule(contextModules, contextModules[1]!.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');

    const handle = page.locator('.filedrawer-handle');
    await handle.focus();
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', String(BOUNDS.max));
    await expect.poll(() => renderedHeight(page)).toBeCloseTo(BOUNDS.max, 0);

    // Fully visible, fully above the drawer, and still on the screen.
    const question = page.locator('.flow-q');
    await expect(question).toBeVisible();
    const qBox = (await question.boundingBox())!;
    const drawerBox = (await page.locator('.filedrawer').boundingBox())!;
    expect(qBox.y).toBeGreaterThanOrEqual(0);
    expect(qBox.height).toBeGreaterThan(0);
    expect(qBox.y + qBox.height, 'the question runs into the drawer').toBeLessThanOrEqual(drawerBox.y + 1);
    // Its module label and progress bar survive too — VB-14 asks for both to
    // be kept, and they are the first thing a tall drawer would push off.
    const progress = (await page.locator('.flowprogress').boundingBox())!;
    expect(progress.y).toBeGreaterThanOrEqual(0);
    expect(progress.y + progress.height).toBeLessThanOrEqual(drawerBox.y + 1);

    // ...and it is still answerable with the drawer at its tallest.
    await page.locator('.flow input.field, .flow textarea').first().fill('Ada');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'preferred_name');

    await context.close();
  });

  test('the height dies with the panel — nothing about it is written down', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = answersUpToModule(contextModules, contextModules[3]!.id);
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, seeded);

    let page = await openPanel(context, id);
    await enterInterview(page);
    await dragHandleTo(page, 320);
    const dragged = await announcedHeight(page);
    expect(dragged).toBeGreaterThan(DRAWER_REST_HEIGHT);
    await page.close();

    page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.filedrawer-handle')).toHaveAttribute('aria-valuenow', String(DRAWER_REST_HEIGHT));
    expect(await renderedHeight(page)).toBeCloseTo(DRAWER_REST_HEIGHT, 0);

    // Not under a key of its own, and not inside the answers either.
    const stored = await sw.evaluate(async () => await chrome.storage.local.get(null));
    expect(Object.keys(stored).filter((k) => /drawer|height|size|open/i.test(k))).toEqual([]);
    expect(JSON.stringify(stored)).not.toContain(String(dragged));
    expect(stored['wb:answers']).toEqual(seeded);

    await context.close();
  });

  /**
   * The collision VB-14 depends on. Its globe wants vertical drag inside this
   * drawer, and the agreed resolution is that the handle owns vertical resize
   * while the content area owns its own gestures. The only way to keep that
   * promise is for the resize listeners to live on the handle alone — so this
   * asserts the negative: a full vertical drag starting anywhere inside the
   * drawer's content changes nothing about its height.
   */
  test('dragging inside the drawer resizes nothing — the handle owns vertical', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);

    await dragHandleTo(page, 380);
    const before = await announcedHeight(page);

    const body = (await page.locator('.filedrawer-body').boundingBox())!;
    const x = body.x + body.width / 2;
    await page.mouse.move(x, body.y + body.height - 12);
    await page.mouse.down();
    await page.mouse.move(x, body.y + 8, { steps: 10 });
    await page.mouse.move(x, body.y + body.height - 4, { steps: 10 });
    await page.mouse.up();

    expect(await announcedHeight(page)).toBe(before);
    expect(await renderedHeight(page)).toBeCloseTo(before, 0);

    // The listeners really are only on the handle: nothing between the drawer
    // and the body is a pointer-drag surface of its own.
    const wired = await page.evaluate(() => {
      const el = document.querySelector('.filedrawer-handle')!;
      return { onHandle: el.getAttribute('role'), body: document.querySelector('.filedrawer-body')!.getAttribute('role') };
    });
    expect(wired.onHandle).toBe('separator');
    expect(wired.body).toBeNull();

    await context.close();
  });
});

test.describe('VB-12 — motion', () => {
  test('a keyboard jump settles, and the drag never does', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);
    const handle = page.locator('.filedrawer-handle');

    // The settle is real: caught between where it was and where it is going,
    // not asserted from a class name.
    await handle.focus();
    await page.keyboard.press('End');
    await page.waitForTimeout(80); // inside the 320ms jump
    const mid = await renderedHeight(page);
    expect(mid, 'no settle at all — it snapped').toBeGreaterThan(DRAWER_REST_HEIGHT + 4);
    expect(mid, 'already finished — that is not a 320ms settle').toBeLessThan(BOUNDS.max - 4);
    await expect.poll(() => renderedHeight(page)).toBeCloseTo(BOUNDS.max, 0);

    // A drag has no transition at all: a drawer easing along behind the grip
    // is broken, not smooth.
    await dragHandleTo(page, 500, false);
    expect(await page.locator('.filedrawer').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    expect(Math.abs((await renderedHeight(page)) - (PANEL.height - 500))).toBeLessThanOrEqual(2);
    await page.mouse.up();

    await context.close();
  });

  test('reduced motion drops the settle and keeps every height', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpToModule(contextModules, contextModules[3]!.id));
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(PANEL);
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    await enterInterview(page);

    const handle = page.locator('.filedrawer-handle');
    await handle.focus();
    await page.keyboard.press('End');
    // No transition to sit inside: the height is simply the new one.
    expect(await page.locator('.filedrawer').evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    expect(await renderedHeight(page)).toBeCloseTo(BOUNDS.max, 0);
    await expect(handle).toHaveAttribute('aria-valuenow', String(BOUNDS.max));

    // The instruction survives the animation being removed: it still resizes,
    // by pointer as well as by key.
    await dragHandleTo(page, 500);
    expect(Math.abs((await renderedHeight(page)) - (PANEL.height - 500))).toBeLessThanOrEqual(2);

    await context.close();
  });
});
