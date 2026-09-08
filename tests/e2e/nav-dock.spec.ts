import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Locator, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DRAWER_REST_HEIGHT, drawerBounds } from '../../src/core/drawer/height';
import { FLOW_NAV_HEIGHT, flowBottomReserve } from '../../src/core/flow/dock';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.2 VB-11 accept criteria, driven in a real browser.
 *
 * The unit tests (src/core/flow/dock.test.ts) prove the arithmetic. What they
 * cannot prove is the only thing this task actually is: that the buttons are
 * really touching the drawer's top edge on screen, at every height the drawer
 * can be dragged to, mid-drag as well as at rest; that pegging them there did
 * not put them over the question; and that moving them changed where they
 * paint and nothing about the order a keyboard reaches them in.
 *
 * Everything here measures real bounding boxes. A class or a DOM position
 * would prove nothing about a fixed-position element.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb11');
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
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  await page.waitForSelector('.filedrawer-handle');
}

/** The same fixture the VB-07 and VB-12 specs use. */
// V2.9: a stop id no module holds answers the whole flow — the seed a walk
// needs now that Home's proof tile waits for the interview to be over
// (VB-144).
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
  // BS-07a (§7.1): at the resting peek the drawer shows one status line
  // rather than a sliced list, so "the drawer has drawn its content" is now
  // either of those. This spec is about the drawer's GEOMETRY, so it must not
  // grow the drawer to get a row — that would be moving the thing it measures.
  await page.waitForSelector('.filetree-row, .filedrawer-status');
  return page;
}

/** A question with a real field on it — the tallest kind of screen the nav has
 * to stay clear of, and the one every "does it cover the question" assertion
 * below is made against. */
async function seedNameQuestion(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersUpToModule(contextModules, contextModules[1]!.id));
  const page = await openPanel(context, id);
  await enterInterview(page);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
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

/** Both boxes read in one evaluate, so a settle in flight cannot advance
 * between the two measurements and manufacture a gap that was never on screen. */
async function seam(page: Page): Promise<{ navBottom: number; drawerTop: number; navTop: number; navHeight: number }> {
  return page.evaluate(() => {
    // V2.3 VB-94: the docked band above the drawer is the SAVE NOTE now —
    // the cluster moved in-flow under the input. Same seam, new tenant.
    const nav = document.querySelector('.flow-save')!.getBoundingClientRect();
    const drawer = document.querySelector('.filedrawer')!.getBoundingClientRect();
    return { navBottom: nav.bottom, drawerTop: drawer.top, navTop: nav.top, navHeight: nav.height };
  });
}

async function setHeight(page: Page, key: string): Promise<void> {
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press(key);
  // Let the 320ms jump finish before anything is measured at rest.
  await page.waitForTimeout(420);
}

test.describe('VB-11 — the nav is docked to the drawer', () => {
  test('it sits on the drawer’s top edge at every height, and the seam never opens', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);

    // Five heights across the whole range, reached the way a person reaches
    // them. Home and End are the ends; the arrows land in between.
    const heights: number[] = [];
    for (const key of ['Home', 'ArrowUp', 'PageUp', 'PageUp', 'End']) {
      await setHeight(page, key);
      const s = await seam(page);
      const announced = Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow'));
      heights.push(announced);

      // The whole task, in one assertion: the bottom of the buttons and the
      // top of the drawer are the same line on screen.
      expect(Math.abs(s.navBottom - s.drawerTop), `seam at ${announced}px`).toBeLessThanOrEqual(1);
      // And the bar is a bar, not a box that grew with the drawer.
      expect(s.navHeight, `bar height at ${announced}px`).toBeCloseTo(FLOW_NAV_HEIGHT, 0);
    }

    // The heights really were different, or the test above proved nothing.
    expect(new Set(heights).size, 'five heights, five measurements').toBeGreaterThanOrEqual(4);
    expect(Math.min(...heights)).toBe(BOUNDS.min);
    expect(Math.max(...heights)).toBe(BOUNDS.max);

    // It spans the panel, like the drawer under it — one docked unit.
    const nav = await box(page.locator('.flow-save'));
    expect(nav.left).toBeCloseTo(0, 0);
    expect(nav.width).toBeCloseTo(PANEL.width, 0);

    // V1.7 VB-41 REPLACED THIS ASSERTION. Until then, Back stood in the
    // question's own 26px column, which is where V1.2 found it. The cluster is
    // centred now, so what is checked is that: the controls are one group,
    // centred in the panel, with the same air either side of it.
    //
    // tests/e2e/button-cluster.spec.ts owns the rest of VB-41; this one line
    // stays here because it is the assertion it directly replaces.
    const controls = await page.locator('.flow-foot .btn').all();
    const boxes = await Promise.all(controls.map((control) => box(control)));
    const leftAir = Math.min(...boxes.map((b) => b.left)) - nav.left;
    const rightAir = nav.right - Math.max(...boxes.map((b) => b.right));
    expect(Math.abs(leftAir - rightAir), 'the cluster is not centred').toBeLessThanOrEqual(1);

    await context.close();
  });

  test('it stays welded to the edge through a pointer drag, frame by frame', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);

    const grip = await box(page.locator('.filedrawer-grip'));
    await page.mouse.move(grip.left + grip.width / 2, grip.top + grip.height / 2);
    await page.mouse.down();

    // Sampled mid-gesture, not on release: a bar that catches up at the end is
    // not pegged, it is following.
    for (const y of [520, 470, 420, 370, 330]) {
      await page.mouse.move(grip.left + grip.width / 2, y, { steps: 4 });
      const s = await seam(page);
      expect(Math.abs(s.navBottom - s.drawerTop), `mid-drag at y=${y}`).toBeLessThanOrEqual(1);
      expect(Math.abs(s.drawerTop - y), `drawer tracking the pointer at y=${y}`).toBeLessThanOrEqual(2);
    }
    await page.mouse.up();

    // Nothing eases behind the grip — the drag has no transition on either half.
    const durations = await page.evaluate(() => ({
      drawer: getComputedStyle(document.querySelector('.filedrawer')!).transitionDuration,
      nav: getComputedStyle(document.querySelector('.flow-save')!).transitionDuration,
    }));
    expect(durations.drawer).toBe('0s');
    expect(durations.nav).toBe('0s');

    await context.close();
  });

  test('it travels with the drawer through a settle, not after it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedMidInterview(context, sw, id);

    const handle = page.locator('.filedrawer-handle');
    await handle.focus();
    await page.keyboard.press('End');

    // Caught inside the 320ms jump, three times. If the bar's `bottom` were
    // not transitioned to match the drawer's height, it would arrive instantly
    // and the seam would gape by up to the whole travel.
    let sawMotion = false;
    for (let i = 0; i < 3; i++) {
      await page.waitForTimeout(60);
      const s = await seam(page);
      expect(Math.abs(s.navBottom - s.drawerTop), `mid-settle sample ${i}`).toBeLessThanOrEqual(1);
      if (s.drawerTop > PANEL.height - BOUNDS.max + 4 && s.drawerTop < PANEL.height - DRAWER_REST_HEIGHT - 4) {
        sawMotion = true;
      }
    }
    expect(sawMotion, 'never caught it in flight — that is not a 320ms settle').toBe(true);

    await expect.poll(async () => Math.round((await seam(page)).drawerTop)).toBe(PANEL.height - BOUNDS.max);
    expect(Math.abs((await seam(page)).navBottom - (PANEL.height - BOUNDS.max))).toBeLessThanOrEqual(1);

    // The durations really are the system's two, on the system's one curve.
    const nav = await page.locator('.flow-save').evaluate((el) => {
      const s = getComputedStyle(el);
      return { property: s.transitionProperty, duration: s.transitionDuration, easing: s.transitionTimingFunction };
    });
    expect(nav.property).toBe('bottom');
    expect(nav.duration).toBe('0.32s');
    expect(nav.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');

    await page.keyboard.press('ArrowDown');
    await expect
      .poll(async () => (await page.locator('.flow-save').evaluate((el) => getComputedStyle(el).transitionDuration)))
      .toBe('0.2s');

    await context.close();
  });

  test('it never overlaps the question, at any height the drawer can reach', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedNameQuestion(context, sw, id);

    for (const key of ['Home', 'PageUp', 'End']) {
      await setHeight(page, key);
      const announced = await page.locator('.filedrawer-handle').getAttribute('aria-valuenow');

      const question = await box(page.locator('.flow-q'));
      const field = await box(page.locator('.flow input.field, .flow textarea').first());
      const progress = await box(page.locator('.flowprogress'));
      const s = await seam(page);

      expect(progress.top, `progress on screen at ${announced}px`).toBeGreaterThanOrEqual(0);
      expect(question.height, `question drawn at ${announced}px`).toBeGreaterThan(0);
      // Nothing the person is reading or typing into runs under the bar.
      expect(question.bottom, `question under the nav at ${announced}px`).toBeLessThanOrEqual(s.navTop + 1);
      expect(field.bottom, `field under the nav at ${announced}px`).toBeLessThanOrEqual(s.navTop + 1);

      // And the question is still answerable from there — the bar is chrome,
      // not a wall.
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    }

    // The reserve is what makes that true: the page is exactly the dock plus
    // its gap taller than the content it holds.
    const measured = await page.evaluate(() => {
      const shell = document.querySelector('.flowshell') as HTMLElement;
      return parseFloat(getComputedStyle(shell).paddingBottom);
    });
    expect(measured).toBe(flowBottomReserve(BOUNDS.max));

    // Answerable, not just visible.
    await page.locator('.flow input.field, .flow textarea').first().fill('Ada');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'preferred_name');

    await context.close();
  });

  test('the keyboard still reaches the question’s own controls before the nav', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedNameQuestion(context, sw, id);
    await setHeight(page, 'End');

    // Walk the panel from the top and record which region focus lands in, in
    // order, stopping the moment the ring wraps back to where it started.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    const seen: string[] = [];
    let first: string | null = null;
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const region = el.closest('.flow-foot') ? 'nav' : el.closest('.filedrawer') ? 'drawer' : 'question';
        const label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 24);
        return { region, id: `${region}:${label}` };
      });
      if (!where) continue;
      if (first === null) first = where.id;
      else if (where.id === first) break;
      seen.push(where.region);
    }

    const order = seen.join(' > ');
    const firstNav = seen.indexOf('nav');
    const lastQuestion = seen.lastIndexOf('question');
    expect(firstNav, `the nav is never reached: ${order}`).toBeGreaterThan(-1);
    expect(lastQuestion, `nothing in the question is focusable: ${order}`).toBeGreaterThan(-1);
    // Everything belonging to the question comes first. Fixed position moved
    // where the bar paints, not where it sits in the document.
    expect(lastQuestion, order).toBeLessThan(firstNav);
    // Three buttons, all of them together, and the drawer only after them —
    // the bar is one contiguous stop, not something interleaved with the file.
    expect(seen.filter((r) => r === 'nav').length, order).toBeGreaterThanOrEqual(2);
    expect(seen.indexOf('drawer'), `the drawer comes before the nav: ${order}`).toBeGreaterThan(
      seen.lastIndexOf('nav'),
    );

    await context.close();
  });

  test('every control in the bar still clears 44x44, at every height', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedNameQuestion(context, sw, id);

    for (const key of ['Home', 'PageUp', 'End']) {
      await setHeight(page, key);
      const buttons = page.locator('.flow-foot .btn');
      const count = await buttons.count();
      expect(count, 'the bar has controls in it').toBeGreaterThanOrEqual(2);
      for (let i = 0; i < count; i++) {
        const b = await box(buttons.nth(i));
        const label = (await buttons.nth(i).textContent())?.trim();
        expect(b.height, `${label} height`).toBeGreaterThanOrEqual(44);
        expect(b.width, `${label} width`).toBeGreaterThanOrEqual(44);
        // Inside the CLUSTER's own box — V2.3 VB-94 moved it in-flow, so
        // "the bar" it must not spill from is its own footer, wherever the
        // content put it, not the docked band (which is the note's now).
        const foot = await box(page.locator('.flow-foot'));
        expect(b.top, `${label} top`).toBeGreaterThanOrEqual(foot.top - 1);
        expect(b.bottom, `${label} bottom`).toBeLessThanOrEqual(foot.bottom + 1);
      }
    }

    await context.close();
  });

  test('V2.3 VB-94 — the note IS the docked band now, and the cluster sits above it in the content', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedNameQuestion(context, sw, id);
    await setHeight(page, 'Home');

    // This test used to pin the opposite arrangement (note in content, bar
    // docked). Adam swapped the tenants: the cluster pins under the input,
    // the note takes the band and rides the drawer.
    const note = page.locator('.flow-save');
    await expect(note).toHaveText(new RegExp(`${S.savedNote}.*${S.privacyNote}`));
    expect(await note.evaluate((el) => !!el.closest('.flow-foot'))).toBe(false);
    const n = await box(note);
    const s = await seam(page);
    // Docked: the note's band ends where the drawer begins.
    expect(Math.abs(n.bottom - s.drawerTop)).toBeLessThanOrEqual(1);
    // And the cluster is above it, in the content, clear of the band.
    const foot = await box(page.locator('.flow-foot'));
    expect(foot.bottom).toBeLessThanOrEqual(n.top + 1);

    await context.close();
  });

  test('a flow with no drawer keeps an ordinary footer', async () => {
    const { context, sw, id } = await launchExtension();
    // V2.9 VB-144: Home offers the proof loop once the interview is OVER —
    // the tile is dormant before that — so the seed answers every question.
    // A module id no module holds means the builder never stops early.
    /* Pass 4c: the proof opens at the interview's own finish now. */
    const seeded = answersUpToModule(contextModules, '__every_module__');
    delete seeded.values['reference_example_primary'];
    delete seeded.answeredAt['reference_example_primary'];
    delete seeded.reflectedAt['reference_example_primary'];
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, seeded);
    const page = await openPanel(context, id);
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.flow');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.locator('.flow[data-step-id="reference_example_primary"]').waitFor();
    await page.locator('.flow textarea').fill('A last answer, written to finish the file.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.locator('.flow[data-step-id="proof_baseline"]').waitFor({ timeout: 15_000 });
    await expect(page.locator('.flowshell')).toHaveCount(0);
    await expect(page.locator('.filedrawer')).toHaveCount(0);
    expect(await page.locator('.flow-foot').evaluate((el) => getComputedStyle(el).position)).toBe('static');

    await context.close();
  });

  test('screenshots at the peek, half way and full height', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await seedNameQuestion(context, sw, id);

    for (const [name, key] of [
      ['min', 'Home'],
      ['mid', 'PageUp'],
      ['max', 'End'],
    ] as const) {
      await setHeight(page, key);
      await page.screenshot({ path: path.join(SHOTS, `nav-dock-${name}.png`) });
    }

    await context.close();
  });
});

test.describe('VB-11 — motion', () => {
  test('reduced motion drops the settle on the bar as well as the drawer', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpToModule(contextModules, contextModules[3]!.id));
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(PANEL);
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await enterInterview(page);
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }

    const handle = page.locator('.filedrawer-handle');
    await handle.focus();
    await page.keyboard.press('End');

    // No transition to be caught inside — on either half.
    const durations = await page.evaluate(() => ({
      drawer: getComputedStyle(document.querySelector('.filedrawer')!).transitionDuration,
      nav: getComputedStyle(document.querySelector('.flow-save')!).transitionDuration,
    }));
    expect(durations.drawer).toBe('0s');
    expect(durations.nav).toBe('0s');

    // The instruction survives: the bar is on the drawer's new edge from the
    // first frame, which is the same information the settle carried.
    const s = await seam(page);
    expect(Math.round(s.drawerTop)).toBe(PANEL.height - BOUNDS.max);
    expect(Math.abs(s.navBottom - s.drawerTop)).toBeLessThanOrEqual(1);

    await context.close();
  });
});
