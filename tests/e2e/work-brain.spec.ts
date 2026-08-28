import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { contrastRatio, parseCssColor } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { openPastPeek } from './fixtures/drawer';

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
const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb59');
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
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  // V2.4 VB-102: the browse canvas's Edit button sits mid-panel — park the
  // pointer so a stationary hover cannot hold a cue (ideas.spec precedent).
  await page.mouse.move(0, 0);
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
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

/** Out to the work brain, from inside the file — V2.1 VB-74: the nav band's
 * Back, above the stage, which replaced the corner disc. */
function bandBack(page: Page) {
  return page.locator('.brainglobe-nav').getByRole('button', { name: S.navBack, exact: true });
}
async function pullBack(page: Page): Promise<void> {
  await bandBack(page).click();
  await tierSettled(page, 0);
}

test.describe('VB-48 — the top tier is the work brain', () => {
  test('a node per SHOWN file, and the one with content IS its own solid', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    // The drawer opens inside Context, exactly where it opened before V1.8.
    expect(await tier(page)).toBe('file');
    expect(await tierClock(page)).toBe(1);

    await pullBack(page);
    expect(await tier(page)).toBe('work');

    // One node per SHOWN file, named, in shelf order. V2.9 VB-146 hides
    // Actions for the beta from the one list in core/files/slots.ts, and the
    // work tier reads the same fold Home and the trail do.
    const names = await page.locator('.brainglobe-pin.is-file').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-file-id')),
    );
    expect(names).toEqual(['context', 'skills']);

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
    await expect(fileNode(page, 'skills')).toHaveAttribute('aria-disabled', 'true');
    // V2.9 VB-146: the hidden file has no node to press.
    await expect(page.locator('.brainglobe-pin.is-file[data-file-id="actions"]')).toHaveCount(0);

    // Pressing one explains THAT one and moves nothing. `force`, because
    // Playwright refuses to click an `aria-disabled` control — which is the
    // point of it being marked that way.
    await fileNode(page, 'skills').click({ force: true });
    await expect(note).toHaveText(`${S.fileSkills} · ${S.lockedNeedsFirst(S.fileContext)}`);
    expect(await tier(page)).toBe('work');

    // The keyboard cannot get in either, and the node is still REACHABLE —
    // a disabled control would take its sentence out of the tab order with it.
    await fileNode(page, 'skills').focus();
    await expect(fileNode(page, 'skills')).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await tier(page)).toBe('work');

    // The empty file is told apart by shape, not by colour alone: a dashed
    // rim with nothing in it, against a solid that is really there. One of
    // them now rather than two — V2.9 VB-146 hides Actions for the beta.
    const dashes = await page
      .locator('.brainglobe-file-node[data-locked="true"] .brainglobe-file-shell')
      .evaluateAll((circles) =>
        circles.map((circle) => {
          const style = getComputedStyle(circle);
          return { dash: style.strokeDasharray, fill: style.fill };
        }),
      );
    expect(dashes.length).toBe(1);
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

    for (const file of ['context', 'skills']) {
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

    // ...and out again by the ladder — the nav band's Back, which VB-52's
    // one-navigation rule routes through the same `pullBack`. (V2.4 VB-112
    // retired the root RUNG as a tier move: it is the door to the Home page
    // now, asserted in breadcrumb.spec.ts.)
    await showBrain(page);
    await page.locator('.brainglobe-nav').getByRole('button', { name: S.navBack, exact: true }).click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('work');

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

    // The file switcher still names the file inside a file — V1.9 VB-52 moved
    // it from VB-47's strip into the trail, and it is still the one control
    // that says which file the drawer is drawing.
    await expect(page.locator('.crumbs-seg[data-seg="file"]')).toContainText(S.fileContext);

    await context.close();
  });

  test('the way out of a file and the way out of a section are one ladder', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    // V2.1 VB-74: one Back, at every level, in the band above the stage —
    // the ladder's shape never changes, only how far up it there is to go.
    // Inside a section it is enabled and one press means one rung.
    // DOM-level click (tmp-vb74-look.spec.ts's move): the pin orbits, and
    // after VB-93 grew section 1 its neighbours sit near a z-resort, so
    // Playwright's stability wait can starve. This test is about the Escape
    // ladder — pin pointer-actionability is brain-globe.a11y.spec.ts's job.
    await page.locator('.brainglobe-pin[data-section-id="sec2"]').evaluate((el) => (el as HTMLElement).click());
    await expect(bandBack(page)).toBeVisible();
    expect(await bandBack(page).getAttribute('aria-disabled')).toBeNull();

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

/**
 * V2.1 VB-74 — the way out leaves the picture. This block tested VB-59's
 * corner disc; the disc is gone, and the claims move to what replaced it: a
 * nav band above the stage holding Back and Home, fixed while the picture
 * moves, the same two words at every depth. The 44px floor survives the
 * band's 30px height by overhanging the stage (the drawer handle's own
 * painted-versus-pressable split), which is exactly the kind of arrangement
 * that quietly loses the floor — so the target is measured, not assumed.
 */
test.describe('VB-74 — the way out is a band above the stage', () => {
  test('Back and Home are 44px targets in a fixed row, and Back does the move', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    const back = bandBack(page);
    await expect(back).toBeVisible();

    // V2.3 VB-91 — icons again, one round after the band printed words: two
    // controls named Back shared the screen (the interview footer's and this),
    // and Adam resolved it by making the stage side iconic. The NAME survives
    // as the aria-label (one name at every depth, strings.ts's navBack); the
    // drawn chevron is aria-hidden, a picture of it, never a second one.
    expect((await back.textContent())!.trim()).toBe('');
    expect(await back.getAttribute('aria-label')).toBe(S.navBack);
    await expect(back.locator('svg')).toHaveCount(1);

    // The band's row is 30px; the TARGET is still 44, by overhang — measured,
    // because this split is exactly where a floor quietly goes missing.
    const box = (await back.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    // Home stands beside it, and out here — already at the top once out — it
    // must never pretend otherwise. (At the file tier both are live.)
    const home = page.locator('.brainglobe-nav').getByRole('button', { name: S.navHome, exact: true });
    await expect(home).toBeVisible();
    const homeBox = (await home.boundingBox())!;
    expect(homeBox.width).toBeGreaterThanOrEqual(44);
    expect(homeBox.height).toBeGreaterThanOrEqual(44);

    // AND THE ROW DOES NOT TRAVEL WITH THE VISUAL: drag the globe and the
    // band's box does not move — that sentence is the whole of VB-74. The
    // drawer is still settling from showBrain's own grow for ~320ms, and the
    // band rides the drawer's chrome, so the baseline is taken only once the
    // box has genuinely stopped (the photograph test's own poll) — otherwise
    // this measures the settle, not the drag.
    await expect
      .poll(async () => {
        const first = (await page.locator('.brainglobe-nav').boundingBox())!.y;
        await page.waitForTimeout(80);
        return Math.round(Math.abs((await page.locator('.brainglobe-nav').boundingBox())!.y - first));
      })
      .toBe(0);
    const before = (await page.locator('.brainglobe-nav').boundingBox())!;
    const stageBox = (await page.locator('.brainglobe').boundingBox())!;
    await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(stageBox.x + stageBox.width / 2 + i * 12, stageBox.y + stageBox.height / 2);
    const during = (await page.locator('.brainglobe-nav').boundingBox())!;
    await page.mouse.up();
    expect(Math.abs(during.x - before.x)).toBeLessThan(1);
    expect(Math.abs(during.y - before.y)).toBeLessThan(1);

    // AND IT STILL DOES THE MOVE. Same button, same function, same tier.
    expect(await tier(page)).toBe('file');
    await back.click();
    await tierSettled(page, 0);
    expect(await tier(page)).toBe('work');

    await context.close();
  });

  test('it rings on the keyboard, and the keyboard can press it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    const back = bandBack(page);
    // Reached with the KEYBOARD, because that is what `:focus-visible` is a
    // question about — a ring measured after a programmatic focus can pass on a
    // stylesheet that only rings mouse users. V2.1 VB-74's band FOLLOWS the
    // pins in the markup (the disc's own order, kept deliberately — see the
    // band's JSX comment), so from a section node the walk is forward. Tabbed
    // rather than a counted number of stops: the stage's tab order is the
    // globe's business and this test is not the place to pin it.
    await page.locator('.brainglobe-pin[data-section-id]').first().focus();
    for (let i = 0; i < 30; i++) {
      if (await back.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(back).toBeFocused();
    const ring = await back.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, style: style.outlineStyle, visible: element.matches(':focus-visible') };
    });
    expect(ring.visible).toBe(true);
    expect(ring.style).toBe('solid');
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);

    await page.keyboard.press('Enter');
    await tierSettled(page, 0);
    expect(await tier(page)).toBe('work');

    await context.close();
  });

  /**
   * For a person to look at. The assertions above say the control is 44 square,
   * named and ringed; they cannot say whether a disc in that corner still reads
   * as the way out of the file, or whether the chevron sits centred in it. The
   * corner is photographed close enough to see the ink.
   */
  test('the band above the stage, resting and focused — for a person to look at (VB-74)', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    // The drawer opens all the way, so the stage is the size somebody really
    // looks at it, and the shot is not of a globe squeezed into a peek.
    const handle = page.locator('.filedrawer-handle');
    await handle.focus();
    await page.keyboard.press('End');

    const back = bandBack(page);
    await expect(back).toBeVisible();
    // The drawer settles over 320ms and the band rides its chrome, so the
    // clip is taken from a box that has stopped moving — otherwise the row
    // is photographed where the button WAS.
    await expect
      .poll(async () => {
        const first = (await back.boundingBox())!.y;
        await page.waitForTimeout(80);
        return Math.round(Math.abs((await back.boundingBox())!.y - first));
      })
      .toBe(0);
    const box = (await back.boundingBox())!;
    const corner = {
      x: Math.max(0, box.x - 24),
      y: Math.max(0, box.y - 24),
      width: box.width + 48,
      height: box.height + 48,
    };

    await page.screenshot({ path: path.join(SHOTS, 'stage.png') });
    await page.screenshot({ path: path.join(SHOTS, 'corner.png'), clip: corner });

    // Hover BEFORE the keyboard reaches it: a hover shot taken after focusing
    // is a picture of the focus ring, and the two treatments would be
    // impossible to tell apart in the one place they are being compared.
    await back.hover();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, 'corner-hover.png'), clip: corner });
    await page.mouse.move(PANEL.width / 2, PANEL.height / 2);

    await page.locator('.brainglobe-pin[data-section-id]').first().focus();
    for (let i = 0; i < 30; i++) {
      if (await back.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(back).toBeFocused();
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, 'corner-focus.png'), clip: corner });

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
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    // V2.4 VB-102: one Edit door whatever the file's state — on a finished
    // file it restarts from question one instead of bouncing off done.
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.mouse.move(0, 0);
    await page.waitForSelector('.flow');
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
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

    // V2.2 — finished Context UNLOCKS Skills now. V2.9 VB-146 hides Actions,
    // which was the one file still locked at this point, so with Context
    // finished there is nothing left on the work tier to explain and the lock
    // line has nothing to say. The same fold as Home's shelf and the trail.
    await expect(page.locator('.brainglobe-locknote')).toHaveCount(0);

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
    await bandBack(page).click();
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
