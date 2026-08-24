import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { contrastRatio, parseCssColor } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.8 VB-48 — the work brain above the context brain, driven in a real
 * browser.
 *
 * The rules and the camera are proved without one in
 * src/core/globe/workBrain.test.ts: which presses are real moves, and that the
 * tier's transform is exactly the identity once you are inside a file. What
 * only a browser can answer is everything below:
 *
 *  1. the top tier really shows three file nodes, and the file with content is
 *     drawn as its own solid rather than as a symbol standing in for one;
 *  2. Context expands into that solid and back, as a MOVE — sampled across the
 *     flight, so a jump cut would be caught with two sizes and no third;
 *  3. a locked file says what unlocks it and is not enterable, by pointer or
 *     by keyboard;
 *  4. the navigation state really is shared: a change in the Brain shows in the
 *     List and a change in the List shows in the Brain, both ways;
 *  5. everything that shipped before still works from inside the file — the
 *     click-to-navigate, the Brain↔List morph, and the unified glow;
 *  6. reduced motion changes tier instantly, with everything reachable and no
 *     frame loop running behind it.
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

/** The same mid-interview file every drawer spec uses: written sections, one
 * being written now, and untouched ones after it. */
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

async function openMidInterview(
  context: BrowserContext,
  sw: Worker,
  id: string,
  options: { reducedMotion?: 'reduce'; frames?: boolean } = {},
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
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  return page;
}

/** Into Brain, and settled: the globe drawn, the drawer done resizing. */
async function showBrain(page: Page): Promise<void> {
  await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
  await expect.poll(() => page.locator('.filedrawer').getAttribute('data-mode')).toBe('brain');
  await expect.poll(async () => page.locator('.filedrawer-morph-node').count(), { timeout: 5000 }).toBe(0);
}

const stage = (page: Page) => page.locator('.brainglobe');
const tier = (page: Page) => stage(page).getAttribute('data-tier');
const tierClock = async (page: Page) => Number(await stage(page).getAttribute('data-tier-clock'));
const fileNode = (page: Page, file: string) => page.locator(`.brainglobe-pin.is-file[data-file-id="${file}"]`);

/** Waits for the tier camera to arrive at one end or the other. */
async function tierSettled(page: Page, at: 0 | 1): Promise<void> {
  await expect.poll(() => tierClock(page), { timeout: 4000 }).toBe(at);
}

/** Out to the work brain, from inside the file. */
async function pullBack(page: Page): Promise<void> {
  await page.getByRole('button', { name: S.workBrainBack, exact: true }).first().click();
  await tierSettled(page, 0);
}

test.describe('VB-48 — the top tier is the work brain', () => {
  test('three file nodes, and the one with content IS its own solid', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    // The drawer opens inside Context, exactly where it opened before V1.8.
    expect(await tier(page)).toBe('file');
    expect(await tierClock(page)).toBe(1);

    await pullBack(page);
    expect(await tier(page)).toBe('work');

    // One node per file, named, in shelf order.
    const names = await page.locator('.brainglobe-pin.is-file').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-file-id')),
    );
    expect(names).toEqual(['context', 'skills', 'actions']);

    // The Context node is not a drawing of a brain — it is the brain, shrunk.
    // Its twelve real orbs are on the stage, inside its own node's footprint.
    const solid = await page.locator('.brainglobe-node .brainglobe-sphere').count();
    expect(solid).toBe(12);
    const node = (await fileNode(page, 'context').boundingBox())!;
    const orbs = await page.locator('.brainglobe-node .brainglobe-sphere').evaluateAll((circles) =>
      circles.map((circle) => {
        const box = circle.getBoundingClientRect();
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      }),
    );
    const centre = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    for (const orb of orbs) {
      expect(Math.hypot(orb.x - centre.x, orb.y - centre.y)).toBeLessThan(node.width);
    }

    // ...and the whole solid is genuinely smaller out here than it is inside.
    const outer = (await page.locator('.brainglobe-scene').boundingBox())!;
    await fileNode(page, 'context').click();
    await tierSettled(page, 1);
    const inner = (await page.locator('.brainglobe-scene').boundingBox())!;
    expect(inner.width).toBeGreaterThan(outer.width * 2.5);

    await context.close();
  });

  test('Context expands into its solid as a move, not a cut', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await pullBack(page);

    // Sampled in the page: a jump cut would show two sizes and nothing between.
    await page.evaluate(() => {
      const w = window as unknown as { __wbTier: number[] };
      w.__wbTier = [];
      const scene = document.querySelector('.brainglobe-scene');
      const tick = () => {
        if (scene) w.__wbTier.push(scene.getBoundingClientRect().width);
        if (w.__wbTier.length < 60) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await fileNode(page, 'context').click();
    await tierSettled(page, 1);
    const widths: number[] = await page.evaluate(() => (window as unknown as { __wbTier: number[] }).__wbTier);
    const distinct = new Set(widths.map((w) => Math.round(w)));
    expect(distinct.size, 'the solid teleported instead of growing').toBeGreaterThan(6);
    // Monotonic growth: it never bounces back on the way in.
    for (let i = 1; i < widths.length; i++) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]! - 0.6);

    // And back out again — the same move, in reverse.
    await pullBack(page);
    expect(await tier(page)).toBe('work');
    await expect(fileNode(page, 'context')).toBeVisible();

    await context.close();
  });

  test('a locked file says what unlocks it, and cannot be entered', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await pullBack(page);

    // The sentence is printed, unprompted, about the next file along — the
    // same words the drawer's toggle and Home's shelf print.
    const note = page.locator('.brainglobe-locknote');
    await expect(note).toHaveText(`${S.fileSkills} · ${S.lockedNeedsFirst(S.fileContext)}`);
    // ...and it is in the node's own name, so it is heard before it is pressed.
    await expect(fileNode(page, 'skills')).toHaveAttribute(
      'aria-label',
      S.fileToggleLockedName(S.fileSkills, S.lockedNeedsFirst(S.fileContext)),
    );
    await expect(fileNode(page, 'actions')).toHaveAttribute('aria-disabled', 'true');

    // Pressing one explains THAT one and moves nothing. `force`, because
    // Playwright refuses to click an `aria-disabled` control — which is the
    // point of it being marked that way.
    await fileNode(page, 'actions').click({ force: true });
    await expect(note).toHaveText(`${S.fileActions} · ${S.lockedNeedsFirst(S.fileSkills)}`);
    expect(await tier(page)).toBe('work');

    // The keyboard cannot get in either, and the node is still REACHABLE —
    // a disabled control would take its sentence out of the tab order with it.
    await fileNode(page, 'skills').focus();
    await expect(fileNode(page, 'skills')).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await tier(page)).toBe('work');

    // The empty files are told apart by shape, not by colour alone: a dashed
    // rim with nothing in it, against a solid that is really there.
    const dashes = await page
      .locator('.brainglobe-file-node[data-locked="true"] .brainglobe-file-shell')
      .evaluateAll((circles) =>
        circles.map((circle) => {
          const style = getComputedStyle(circle);
          return { dash: style.strokeDasharray, fill: style.fill };
        }),
      );
    expect(dashes.length).toBe(2);
    for (const shell of dashes) {
      expect(shell.dash).not.toBe('none');
      expect(shell.fill).toBe('none');
    }

    // The printed sentence is readable on the dark stage — 4.5:1, measured.
    const [ink, field] = await note.evaluate((element) => [
      getComputedStyle(element).color,
      getComputedStyle(document.querySelector('.brainglobe')!).backgroundColor,
    ]);
    expect(contrastRatio(parseCssColor(ink)!, parseCssColor(field)!)).toBeGreaterThanOrEqual(4.5);

    await context.close();
  });

  test('every file node meets the 44px floor and shows a focus ring', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await pullBack(page);

    for (const file of ['context', 'skills', 'actions']) {
      const hit = (await page.locator(`.brainglobe-pin.is-file[data-file-id="${file}"] .brainglobe-hit`).boundingBox())!;
      expect(hit.width, file).toBeGreaterThanOrEqual(44);
      expect(hit.height, file).toBeGreaterThanOrEqual(44);
    }

    // Reached with the KEYBOARD, because that is what `:focus-visible` is a
    // question about — a ring measured after a programmatic focus can pass on
    // a stylesheet that only rings mouse users.
    await fileNode(page, 'skills').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(fileNode(page, 'context')).toBeFocused();
    const outline = await fileNode(page, 'context').evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, style: style.outlineStyle, visible: element.matches(':focus-visible') };
    });
    expect(outline.visible).toBe(true);
    expect(outline.style).toBe('solid');
    expect(parseFloat(outline.width)).toBeGreaterThanOrEqual(2);

    await context.close();
  });
});

test.describe('VB-48 — one navigation, two views', () => {
  test('the tier the Brain is on is the tier the List is on', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await pullBack(page);

    // Pulled back in the Brain: the List behind it is the files, not the
    // sections of one file.
    await expect(page.locator('.workshelf')).toHaveCount(1);
    await expect(page.locator('.workshelf-row[data-file="context"]')).toContainText(S.fileContext);
    await expect(page.locator('.filetree-row')).toHaveCount(0);

    // Back in, from the LIST this time — the globe follows.
    await page.getByRole('button', { name: S.drawerModeList, exact: true }).click();
    await expect.poll(() => page.locator('.filedrawer').getAttribute('data-mode')).toBe('list');
    await page.locator('.workshelf-row[data-file="context"]').click();
    await expect(page.locator('.filetree-row').first()).toBeVisible();
    expect(await tier(page)).toBe('file');
    await tierSettled(page, 1);

    // ...and out again from the List's own way up.
    await page.getByRole('button', { name: S.workBrainBack, exact: true }).first().click();
    await expect(page.locator('.workshelf')).toHaveCount(1);
    expect(await tier(page)).toBe('work');

    await context.close();
  });

  test('a locked file is locked in the List too, in the same words', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await pullBack(page);
    await page.getByRole('button', { name: S.drawerModeList, exact: true }).click();

    const skills = page.locator('.workshelf-row[data-file="skills"]');
    await expect(skills).toHaveAttribute('aria-disabled', 'true');
    await expect(skills).toContainText(S.lockedNeedsFirst(S.fileContext));
    await skills.click({ force: true });
    await expect(page.locator('.workshelf')).toHaveCount(1);
    expect(await tier(page)).toBe('work');

    await context.close();
  });
});

test.describe('VB-48 — nothing below the new tier changed', () => {
  test('click-to-navigate, the morph and the file toggle all still work', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    // Click-to-navigate: a written section still moves the interview.
    const before = await page.locator('.flow').getAttribute('data-step-id');
    await page.locator('.brainglobe-pin[data-section-id="sec1"]').click();
    await expect.poll(() => page.locator('.flow').getAttribute('data-step-id')).not.toBe(before);

    // The morph still flies between the modes.
    await page.getByRole('button', { name: S.drawerModeList, exact: true }).click();
    await expect.poll(async () => page.locator('.filedrawer-morph-node').count(), { timeout: 2000 }).toBeGreaterThan(0);
    await expect.poll(async () => page.locator('.filedrawer-morph-node').count(), { timeout: 5000 }).toBe(0);
    await expect(page.locator('.filetree-row').first()).toBeVisible();

    // VB-47's toggle is still the switcher inside a file.
    await expect(page.locator('.filetypes-item[data-file="context"]')).toHaveAttribute('aria-pressed', 'true');

    await context.close();
  });

  test('the way out of a file and the way out of a section are one ladder', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    // Inside a section, the offer is "back to the whole file" and NOT the tier
    // above it — one rung at a time.
    await page.locator('.brainglobe-pin[data-section-id="sec2"]').click();
    await expect(page.getByRole('button', { name: S.brainGlobeBack, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: S.workBrainBack, exact: true }).first()).toBeHidden();

    // Escape climbs it: out of the section first, then out of the file.
    await page.locator('.brainglobe-pin[data-section-id="sec2"]').focus();
    await page.keyboard.press('Escape');
    await expect.poll(() => stage(page).getAttribute('data-zoom')).toBe('0.000');
    expect(await tier(page)).toBe('file');
    await page.keyboard.press('Escape');
    await expect.poll(() => tier(page)).toBe('work');

    await context.close();
  });
});

test.describe('VB-48 — the complete state, one level up', () => {
  /**
   * The unified glow is the one thing on this stage that is a claim about the
   * WHOLE file, so it is the thing most likely to be lost by drawing that file
   * as a node. It must survive: out at the work brain, a finished Context is a
   * node that is one lit object, not a network of differently-lit parts.
   *
   * And the same answers that light it are the ones that unlock the file after
   * it — so this also catches the lock sentence going stale, which is the
   * failure `FileSlot.afterFinished` exists to prevent, now on a third surface.
   */
  test('a finished file still glows as one object when it is a node', async () => {
    const { context, sw, id } = await launchExtension();
    // Every module answered, today — `fileFinished`'s own bar.
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpToModule(contextModules, 'no-such-module'));
    const page = await context.newPage();
    await page.setViewportSize(PANEL);
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    await page.waitForSelector('.splash', { state: 'detached' });
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: /^Go through them again$/ }).click();
    await page.waitForSelector('.flow');
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await page.waitForSelector('.filetree-row');
    await showBrain(page);

    await expect(stage(page)).toHaveAttribute('data-unified', 'true');
    const insideFills = await page
      .locator('.brainglobe-node .brainglobe-sphere')
      .evaluateAll((circles) => circles.map((circle) => getComputedStyle(circle).fill));
    expect(new Set(insideFills).size, 'inside the file it is not one colour').toBe(1);

    await pullBack(page);
    await expect(stage(page)).toHaveAttribute('data-unified', 'true');
    const nodeFills = await page
      .locator('.brainglobe-node .brainglobe-sphere')
      .evaluateAll((circles) => circles.map((circle) => getComputedStyle(circle).fill));
    expect(new Set(nodeFills).size, 'the glow was lost on the way out').toBe(1);
    expect([...new Set(nodeFills)]).toEqual([...new Set(insideFills)]);

    // The file after it stops asking for something already done — the same
    // swap Home's shelf and the drawer's toggle make, from the same fold.
    await expect(page.locator('.brainglobe-locknote')).toHaveText(`${S.fileSkills} · ${S.lockedComingLater}`);

    await context.close();
  });
});

test.describe('VB-48 — reduced motion', () => {
  test('the tier changes instantly, with everything reachable', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, { reducedMotion: 'reduce', frames: true });
    await showBrain(page);

    // Every value the tier's clock takes while it changes, sampled per frame.
    // "Instant" is not "fast": a tween would leave a trail of fractions here,
    // and there must not be one.
    await page.evaluate(() => {
      const w = window as unknown as { __wbClock: string[] };
      w.__wbClock = [];
      const globe = document.querySelector('.brainglobe');
      const tick = () => {
        if (globe) w.__wbClock.push(globe.getAttribute('data-tier-clock') ?? '');
        if (w.__wbClock.length < 45) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByRole('button', { name: S.workBrainBack, exact: true }).first().click();
    await expect.poll(() => tier(page)).toBe('work');
    await expect.poll(() => tierClock(page)).toBe(0);
    const trail: string[] = await page.evaluate(() => (window as unknown as { __wbClock: string[] }).__wbClock);
    expect(new Set(trail)).toEqual(new Set(['1.000', '0.000']));
    await expect(fileNode(page, 'context')).toBeVisible();

    // ...and no loop is started to get there.
    //
    // Measured as a DIFFERENCE against this screen's own idle rate rather than
    // against zero: VB-13's status mark asks for a frame forever while the
    // interview is open, and the sampler above is still running its own. A tier
    // tween is 620ms of rAF, so it would show up as a second loop's worth of
    // frames over the same window.
    await page.waitForTimeout(900);
    const idleFrom = await frames(page);
    await page.waitForTimeout(300);
    const idle = (await frames(page)) - idleFrom;

    const from = await frames(page);
    await fileNode(page, 'context').click();
    await page.waitForTimeout(300);
    const during = (await frames(page)) - from;
    expect(await tierClock(page)).toBe(1);
    expect(during, `${during} frames against an idle ${idle}`).toBeLessThanOrEqual(idle + 4);

    // Everything the animated path offers is still on screen and reachable.
    await expect(page.locator('.brainglobe-pin[data-section-id="sec1"]')).toBeVisible();
    await page.locator('.brainglobe-pin[data-section-id="sec1"]').focus();
    await expect(page.locator('.brainglobe-pin[data-section-id="sec1"]')).toBeFocused();

    await context.close();
  });
});
