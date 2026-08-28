import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import {
  BRAIN_MIN_HEIGHT,
  BRAIN_NAV_BAND,
  BRAIN_OPEN_HEIGHT,
  BRAIN_STAGE_IDEAL,
  BRAIN_STAGE_PAD,
  BRAIN_YIELD_BAND,
} from '../../src/core/drawer/mode';
import { drawerBounds } from '../../src/core/drawer/height';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V2.0 VB-70 — the visual's height governs the mode, both ways.
 *
 * docs/V2.0-REFINEMENT.md: "The stage's displayed height becomes the minimum
 * for Brain to be available. Drag below it → auto-transitions to List. Drag
 * above it while List is open → Brain becomes offerable again." With two things
 * named as the ways it goes wrong: it must not **thrash** at the boundary, and
 * it must not **yank** somebody who chose List back into Brain.
 *
 * The arithmetic is proved without a browser (src/core/drawer/mode.test.ts) —
 * the fold, the hysteresis, the jitter, the NaN. What only a browser can answer
 * is here:
 *
 *  - that the threshold really is the STAGE and not a number beside it, checked
 *    against the box the globe is painted into at the moment the mode changes;
 *  - that a pointer parked on the boundary and wobbling changes the mode once
 *    and then leaves it alone, sampled on every move;
 *  - that Brain comes back for the person who never stopped asking for it;
 *  - and that it does not come back for the person who pressed `List`, however
 *    much room they make.
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

/** The same fixture the VB-12 and VB-14b specs use: far enough in that both
 * modes have real state to draw. */
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

async function openMidInterview(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
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
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
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

const brainButton = (page: Page) => page.getByRole('button', { name: S.drawerModeBrain, exact: true });
const listButton = (page: Page) => page.getByRole('button', { name: S.drawerModeList, exact: true });
const drawerMode = (page: Page) => page.locator('.filedrawer').getAttribute('data-mode');
const announcedHeight = async (page: Page) =>
  Number(await page.locator('.filedrawer-handle').getAttribute('aria-valuenow'));

/** The drawer's own height, its stage's box, and the globe painted into it —
 * all read on one frame, because the claim under test is about how the three
 * relate at a single moment. */
async function boxes(page: Page): Promise<{ drawer: number; stage: number; globe: number }> {
  return page.evaluate(() => {
    const height = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().height;
    return {
      drawer: height('.filedrawer'),
      stage: height('.filedrawer-stage'),
      globe: height('.brainglobe'),
    };
  });
}

/** Press on the grip and move the pointer to an absolute y — the grip's centre
 * sits on the drawer's top edge, so the height is `panel - pointer y`. */
async function dragHandleTo(page: Page, y: number): Promise<void> {
  const box = (await page.locator('.filedrawer-grip').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y, { steps: 6 });
  await page.mouse.up();
}

/** Waits out a mode change: nothing flying, and the drawer standing where the
 * handle says it is. Lifted verbatim from tests/e2e/drawer-modes.spec.ts, for
 * the reasons documented there. */
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

async function openBrain(page: Page): Promise<void> {
  await brainButton(page).click();
  await drawerSettled(page);
  expect(await drawerMode(page)).toBe('brain');
}

test.describe('VB-70 — the visual’s height governs the mode', () => {
  /**
   * THE PINNING, MEASURED RATHER THAN ASSUMED.
   *
   * The claim is that the threshold is the stage's own displayed height, so it
   * is checked where that is true or false: at the height Brain hands over, the
   * stage's content box is EXACTLY the globe painted into it. Not "about" — the
   * stage clips (`overflow: hidden`, FileDrawer.css), so a box one pixel short
   * of the picture is a globe with its edge cut off and nothing would fail.
   */
  test('at the handover height the stage exactly holds the globe it is drawing', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await openBrain(page);

    await dragHandleTo(page, PANEL.height - BRAIN_MIN_HEIGHT);
    await drawerSettled(page);
    expect(await announcedHeight(page), 'the drag did not land on the threshold').toBe(BRAIN_MIN_HEIGHT);
    expect(await drawerMode(page), 'the threshold itself is still Brain').toBe('brain');

    const at = await boxes(page);
    // V2.1 VB-74: the stage's box now holds two things — the nav band above
    // the picture, then the picture — with the padding around them. So the
    // stage less its padding is the band plus the globe, exactly.
    expect(at.stage - BRAIN_STAGE_PAD * 2).toBeCloseTo(at.globe + BRAIN_NAV_BAND, 0);
    // And the picture at the handover is the IDEAL — V2.1 VB-75's whole
    // point. This line used to expect BRAIN_STAGE_MIN: the globe at the
    // threshold was the smallest legal globe, and there is no such thing any
    // more. One pixel less room and the answer is List, not a smaller picture.
    expect(at.globe).toBeCloseTo(BRAIN_STAGE_IDEAL, 0);

    // One pixel shorter and the mode is gone — because the box would now be
    // smaller than the smallest globe there is.
    await dragHandleTo(page, PANEL.height - (BRAIN_MIN_HEIGHT - 1));
    await expect.poll(() => drawerMode(page), { timeout: 3000 }).toBe('list');
    expect(await announcedHeight(page)).toBe(BRAIN_MIN_HEIGHT - 1);

    await context.close();
  });

  /**
   * THE THING THE SPEC NAMES FIRST: "a drag hovering on the threshold must not
   * flip modes every frame."
   *
   * Driven the way a hand does it — the pointer held on the boundary, wobbling
   * a few pixels either side, forty samples — with the mode read after every
   * single move. Without hysteresis this produces a mode that alternates, and
   * every alternation starts a 520ms morph that never gets to finish.
   */
  test('a pointer jittering on the boundary changes the mode once, then leaves it alone', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await openBrain(page);

    const grip = (await page.locator('.filedrawer-grip').boundingBox())!;
    const x = grip.x + grip.width / 2;
    await page.mouse.move(x, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, PANEL.height - BRAIN_MIN_HEIGHT, { steps: 8 });

    const seen: string[] = [];
    for (let move = 0; move < 40; move++) {
      const wobble = [0, -1, 1, -2, 2, -3, 3][move % 7]!;
      await page.mouse.move(x, PANEL.height - BRAIN_MIN_HEIGHT + wobble);
      seen.push((await drawerMode(page))!);
    }
    await page.mouse.up();

    const flips = seen.filter((mode, index) => index > 0 && mode !== seen[index - 1]).length;
    expect(flips, `the mode thrashed: ${seen.join(',')}`).toBeLessThanOrEqual(1);
    expect(seen[seen.length - 1], 'it did not settle in the mode that works at any size').toBe('list');

    // And it is settled, not merely slow: it stays where it landed.
    await drawerSettled(page);
    expect(await drawerMode(page)).toBe('list');

    await context.close();
  });

  /**
   * THE RETURN LEG, AND ITS BAND.
   *
   * Coming back over the threshold is deliberately NOT enough — that is the
   * same boundary the drag just left, and treating it as the way back is what
   * makes a hand's jitter into a mode change. `BRAIN_YIELD_BAND` of honest room
   * is what buys Brain back.
   */
  test('Brain returns when there is room again — but not on the threshold it left', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await openBrain(page);

    // Nobody pressed List. The height did.
    await dragHandleTo(page, PANEL.height - (BRAIN_MIN_HEIGHT - 30));
    await expect.poll(() => drawerMode(page), { timeout: 3000 }).toBe('list');
    await drawerSettled(page);

    // V2.1 VB-74 capped the return band by the panel's own headroom: the nav
    // band put BRAIN_MIN_HEIGHT within six pixels of a 700px viewport's
    // ceiling, and a return leg demanding the full sixteen was demanding a
    // height this drawer is not allowed to reach — Brain would have been
    // unreachable by drag on the panel's own standard height. So the band
    // here is the slack that exists, not the constant.
    const ceiling = drawerBounds(PANEL.height).max;
    const returnAt = Math.min(BRAIN_MIN_HEIGHT + BRAIN_YIELD_BAND, ceiling);

    // Back to just inside the (capped) band: still List, because that is the
    // point.
    await dragHandleTo(page, PANEL.height - (returnAt - 2));
    await drawerSettled(page);
    expect(await announcedHeight(page)).toBe(returnAt - 2);
    expect(await drawerMode(page), 'Brain came back inside the hysteresis band').toBe('list');

    // The whole (capped) band clear of the threshold, and Brain is back — the
    // request never changed.
    await dragHandleTo(page, PANEL.height - returnAt);
    await expect.poll(() => drawerMode(page), { timeout: 3000 }).toBe('brain');
    await drawerSettled(page);
    await expect(brainButton(page)).toHaveAttribute('aria-pressed', 'true');

    // And what came back is a globe the stage can really hold.
    const at = await boxes(page);
    expect(at.stage - BRAIN_STAGE_PAD * 2).toBeGreaterThanOrEqual(at.globe - 0.5);

    await context.close();
  });

  /**
   * THE OTHER THING THE SPEC NAMES: "a person who explicitly chose List must
   * not be thrown into Brain just because they made the drawer taller."
   *
   * Auto-transition OUT of Brain is a necessity; auto-transition INTO it is a
   * suggestion, and a suggestion is not something that happens to you. The only
   * way into Brain is to ask for it — which stays one press away the whole
   * time, so nothing is taken from anybody by refusing to do it for them.
   */
  test('choosing List is respected however tall the drawer gets', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await openBrain(page);

    await listButton(page).click();
    await drawerSettled(page);
    expect(await drawerMode(page)).toBe('list');

    // Short, then taller than Brain's own opening height — every threshold this
    // feature has, crossed in the direction that would put Brain back.
    await dragHandleTo(page, PANEL.height - (BRAIN_MIN_HEIGHT - 40));
    await drawerSettled(page);
    await dragHandleTo(page, PANEL.height - (BRAIN_OPEN_HEIGHT + 40));
    await drawerSettled(page);

    expect(await announcedHeight(page)).toBeGreaterThan(BRAIN_OPEN_HEIGHT);
    expect(await drawerMode(page), 'the drawer yanked someone into Brain').toBe('list');
    await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.filetree-row').first()).toBeVisible();

    // Brain is still offered, and still one press away — "available", not
    // "reopened".
    await expect(brainButton(page)).toBeEnabled();
    await brainButton(page).click();
    await drawerSettled(page);
    expect(await drawerMode(page)).toBe('brain');

    await context.close();
  });
});
