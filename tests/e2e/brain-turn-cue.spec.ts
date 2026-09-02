import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { contrastRatio, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { openPastPeek } from './fixtures/drawer';

/**
 * V2.0 VB-71 — show that the brain can be turned.
 *
 * docs/V2.0-REFINEMENT.md: "Nothing on screen says the globe is draggable. Add
 * a one-time cue ... it appears once, not every visit; it must not block the
 * first drag; and under `prefers-reduced-motion` it is a static affordance
 * rather than a demonstration."
 *
 * Every one of those is a claim about a real browser, so all of it is here:
 *
 *  - it is where Adam drew it — a filled disc at the stage's top-left, the pair
 *    with the way-out control, measured against both boxes;
 *  - it is a real control with a real name and a 44 x 44 target, and its
 *    boundary clears 3:1 against the field it sits on, read off painted pixels;
 *  - the first drag works while it is up, and retires it;
 *  - it survives a reopen once seen, because the flag is in `wb:prefs`;
 *  - reduced motion gets the same disc with nothing scheduled — proved by
 *    photographing it twice half a second apart and comparing the bytes.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const PANEL = { width: 400, height: 700 };
const TARGET_MIN = 44;

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

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

/** The interview, mid-way, with the drawer on List — which is what the panel
 * opens on and therefore where every one of these journeys starts. */
async function openMidInterview(
  context: BrowserContext,
  sw: Worker,
  id: string,
  options: { reducedMotion?: 'reduce' | 'no-preference'; seed?: boolean } = {},
): Promise<Page> {
  if (options.seed !== false) {
    await sw.evaluate(async (value) => {
      await chrome.storage.local.set({ 'wb:answers': value });
    }, answersUpToModule(contextModules, contextModules[3]!.id));
  }
  const page = await context.newPage();
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
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
  return page;
}

const cue = (page: Page) => page.getByRole('button', { name: S.brainTurnCue, exact: true });
const brainButton = (page: Page) => page.getByRole('button', { name: S.drawerModeBrain, exact: true });
const listButton = (page: Page) => page.getByRole('button', { name: S.drawerModeList, exact: true });

/**
 * Open Brain and wait out the change.
 *
 * The short sleep first, then a poll — tests/e2e/drawer-modes.spec.ts's
 * `drawerSettled`, and for the reason documented there: the morph is measured
 * in a passive effect, so for a frame or two after the click there is genuinely
 * nothing flying yet and "no nodes" would pass before it started. Polled rather
 * than slept out for the rest, so a machine running five workers is not paying
 * a flat second per call.
 */
async function showBrain(page: Page): Promise<void> {
  await brainButton(page).click();
  await expect(page.locator('.filedrawer')).toHaveAttribute('data-mode', 'brain');
  await page.waitForTimeout(80);
  await expect.poll(() => page.locator('.filedrawer-morph-node').count(), { timeout: 8000 }).toBe(0);
}

/** The globe's pose, read off the picture: every vertex's depth as one string.
 * It changes if and only if the geometry really turned. */
const globePose = (page: Page) =>
  page
    .locator('.brainglobe-node')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-depth')).join(','));

/**
 * A screenshot, decoded back inside the page onto a canvas — the same technique
 * tests/e2e/dock-surface.spec.ts uses, and for the same reason: it is the only
 * way to read what was painted without a decoding dependency, and this repo
 * ships two runtime dependencies and no more (docs/DEPENDENCIES.md).
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
    { shot, points: points.map((point) => ({ x: point.x, y: point.y })) },
  );
}

test.describe('VB-71 — the cue that says the brain can be turned', () => {
  /**
   * WHERE ADAM DREW IT, AMENDED BY V2.1 VB-74. The cue was drawn as one of a
   * pair — "immediately left of the back control" — and VB-74 moved the way
   * out off the picture into the nav band above the stage, so the cue holds
   * the corner alone now. What has to hold is still a RELATIONSHIP rather
   * than fixed coordinates: the cue inside the picture's top-left, and the
   * band's controls above the picture, never on it.
   */
  test('it has the stage’s top-left to itself, under the nav band', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    await expect(cue(page)).toBeVisible();
    const disc = (await cue(page).boundingBox())!;
    const globe = (await page.locator('.brainglobe').boundingBox())!;

    /**
     * BS-07a (§7.1) took the band away, so the claim it anchored — "the way
     * out sits above the picture, not on it" — has nothing above the picture
     * left to measure. What VB-71 was really protecting is asserted below and
     * is unchanged: the cue has the top-left corner to ITSELF, inside the
     * stage, and never covers the sphere it describes.
     */

    // In the picture's top-left corner, and inside it — the stage clips
    // (`overflow: hidden`), so a disc hanging off the edge would be a disc with
    // a piece missing.
    expect(disc.x).toBeGreaterThanOrEqual(globe.x);
    expect(disc.y).toBeGreaterThanOrEqual(globe.y);
    expect(disc.x - globe.x).toBeLessThan(globe.width / 4);
    expect(disc.y - globe.y).toBeLessThan(globe.height / 4);

    // It never covers the thing it is describing: the middle of the globe,
    // where the sphere is, is nowhere near it.
    expect(disc.y + disc.height).toBeLessThan(globe.y + globe.height / 2);

    await context.close();
  });

  /**
   * INTERACTIVE, AND OBVIOUSLY SO — VB-71's own open question.
   *
   * "A disc that looks exactly like the back button but does nothing when
   * pressed is the worst of both. Pick one and make it obvious which." This is
   * a real control: a name, a 44 x 44 target, a visible focus ring, a keyboard
   * path, and a press that does something. And its boundary clears 3:1 against
   * the field, read off the pixels that were actually painted rather than off
   * the token it was written with.
   */
  test('it is a real control: named, 44 square, reachable, and it clears 3:1', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    const disc = (await cue(page).boundingBox())!;
    expect(disc.width).toBeGreaterThanOrEqual(TARGET_MIN);
    expect(disc.height).toBeGreaterThanOrEqual(TARGET_MIN);

    // The name is the tip, and it comes from strings.ts. The mark inside is a
    // picture of it and says nothing on its own.
    await expect(cue(page)).toHaveAttribute('title', S.brainTurnCue);
    expect(await page.locator('.brainturncue-mark').getAttribute('aria-hidden')).toBe('true');

    /* The rim, and the field on the other side of it, read off the pixels that
       were painted. Taken BEFORE anything is focused, deliberately: the focus
       ring is 2px at 2px of offset, so it lands exactly on the column this
       samples and would be measured as the boundary instead of the rim. */
    const [rimPaint, fieldPaint] = await pixels(page, [
      // Mid-height on the disc's left edge: one pixel of rim, with the drawer's
      // own field immediately outside it.
      { x: disc.x, y: disc.y + disc.height / 2 },
      { x: disc.x - 4, y: disc.y + disc.height / 2 },
    ]);
    expect(
      contrastRatio(rimPaint!, fieldPaint!),
      'the cue has no boundary anyone can see',
    ).toBeGreaterThanOrEqual(3);
    // The pixel really is the rim the stylesheet asked for, not a coincidence
    // of whatever the globe was doing behind it.
    const rim = parseCssColor(await cue(page).evaluate((el) => getComputedStyle(el).borderTopColor))!;
    expect([rimPaint!.r, rimPaint!.g, rimPaint!.b]).toEqual([rim.r, rim.g, rim.b]);

    // And it is FILLED — the shape that said "this one is the cue" when a
    // second disc stood beside it (VB-59's was open). The neighbour left for
    // the nav band (V2.1 VB-74), and the fill stays: a cue that reads as a
    // solid dot is a cue, not a button that lost its label.
    const fill = await cue(page).evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(parseCssColor(fill)!.a).toBeGreaterThan(0);

    // A focus ring somebody can see, reached BY TAB and not by a scripted
    // `focus()` — the ring is a `:focus-visible` ring, and how focus arrived is
    // the whole of that distinction (the convention in
    // tests/e2e/drawer-modes.a11y.spec.ts).
    await page.locator('.filedrawer-handle').focus();
    let reached = false;
    for (let step = 0; step < 20 && !reached; step++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.classList.contains('brainturncue') === true);
    }
    expect(reached, 'Tab never reaches the cue').toBe(true);
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as HTMLElement);
      return { width: Number.parseFloat(style.outlineWidth), style: style.outlineStyle };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);

    await context.close();
  });

  /**
   * IT MUST NOT BLOCK OR DELAY THE FIRST DRAG.
   *
   * So the drag is done with the cue on screen, from the middle of the globe,
   * and the picture has to turn — and then the cue has to go, because the
   * person has just done the thing it was going to tell them about.
   */
  test('the first drag works while it is up, and retires it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await expect(cue(page)).toBeVisible();

    const globe = (await page.locator('.brainglobe').boundingBox())!;
    const before = await globePose(page);
    await page.mouse.move(globe.x + globe.width / 2, globe.y + globe.height / 2);
    await page.mouse.down();
    await page.mouse.move(globe.x + globe.width / 2 + 60, globe.y + globe.height / 2, { steps: 6 });
    await page.mouse.up();

    expect(await globePose(page), 'the globe did not turn under the drag').not.toBe(before);
    await expect(cue(page)).toHaveCount(0);

    // And it is gone for good, not merely for this render.
    expect(await page.evaluate(async () => (await chrome.storage.sync.get('wb:prefs'))['wb:prefs'].turnHint)).toBe(
      false,
    );

    await context.close();
  });

  /**
   * ONCE, NOT EVERY VISIT — AND IT SURVIVES A REOPEN.
   *
   * The panel document is destroyed every time the side panel closes, so
   * "never again" has to be a fact in `wb:prefs` rather than a fact in memory.
   * Pressed here, because a press is the plainest way somebody says they have
   * read it; the reload is the reopen.
   */
  test('pressing it puts it away, and a reopened panel does not bring it back', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    await cue(page).click();
    await expect(cue(page)).toHaveCount(0);
    /* BS-07a (§7.1): there is no band for the cue's departure to shuffle any
       more. What still must not move is the stage itself — a picture that
       jumps when a hint retires is the same failure one layer down. */
    const globe = (await page.locator('.brainglobe').boundingBox())!;
    expect(globe.width).toBeGreaterThan(0);

    // The reopen. A side panel that closes destroys its document, and a reload
    // is the closest a test gets to that: everything in memory goes, the panel
    // comes back on Home, and the only thing that crossed the gap is
    // `wb:prefs`.
    await page.reload();
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.flow');
    // `seenIntros` is Flow's own ephemeral state, so a reopened panel meets the
    // module intro again — exactly as `openMidInterview` does on a first open.
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
    await showBrain(page);
    // Given a full second to flash back, which is the failure this test exists
    // for: a hint whose default is "show" reappearing while storage answers.
    await page.waitForTimeout(1000);
    await expect(cue(page)).toHaveCount(0);

    await context.close();
  });

  /**
   * LEAVING BRAIN WITH IT ON SCREEN COUNTS AS HAVING SEEN IT.
   *
   * VB-71's "it appears once, not every visit" — the alternative is a cue that
   * greets somebody on their tenth open because they have never happened to
   * drag. The stage was in front of them; that is the visit it gets.
   */
  test('leaving Brain retires it too', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await expect(cue(page)).toBeVisible();

    await listButton(page).click();
    await page.waitForTimeout(900);
    await showBrain(page);
    await page.waitForTimeout(600);
    await expect(cue(page)).toHaveCount(0);

    await context.close();
  });

    /**
   * R-06 (Adam, 2026-08-28) — IT NO LONGER STANDS DOWN, and this test says the
   * opposite of what it used to.
   *
   * The cue stood down while a section was flown into because the corner then
   * belonged to V1.8 VB-48's `Back to the whole file` pill, which stepped
   * sideways for it and wrapped to two lines. That pill left the stage at V2.1
   * VB-74 and the band it moved to was deleted at BS-07a, so the standing-down
   * has spent two versions defending the corner from nothing — while paying
   * for it in the one currency that matters here. Adam: "It pops up and
   * disappears right now and it doesn't look great."
   *
   * The half of the old claim that survives is the one it was really for: the
   * cue is not SPENT by any of this. Only turning the globe, or leaving Brain,
   * retires it.
   */
  test('a flown-in section leaves the cue exactly where it was, and does not spend it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);
    await expect(cue(page)).toBeVisible();
    const before = (await cue(page).boundingBox())!;

    /* Pressed, not dragged — a press is not a turn, so nothing here retires
       the cue. Dispatched rather than driven, which is the convention
       tests/e2e/drawer-modes.spec.ts already uses on this stage: the globe is
       drifting, so every pin moves a fraction of a pixel per frame and
       Playwright's stability check waits for it to stop, which it never does. */
    await page
      .locator('.brainglobe-pin[data-section-id]')
      .first()
      .evaluate((el) => (el as HTMLElement).click());
    await page.waitForTimeout(1200);

    // Still there, and in the same corner — anchored, not popping.
    await expect(cue(page)).toBeVisible();
    const after = (await cue(page).boundingBox())!;
    expect(Math.round(after.x)).toBe(Math.round(before.x));
    expect(Math.round(after.y)).toBe(Math.round(before.y));

    // And nothing was written: the stage was busy, not the cue seen.
    expect(
      await page.evaluate(async () => (await chrome.storage.sync.get('wb:prefs'))['wb:prefs']?.turnHint),
    ).not.toBe(false);

    await context.close();
  });

  /**
   * REDUCED MOTION: A STATIC AFFORDANCE, AND NOTHING SCHEDULED.
   *
   * The same disc, the same mark, the same sentence, the same 44px target — the
   * instruction was never in the movement, so the still version loses none of
   * it (docs/GUARDRAILS.md). "Schedules nothing" is checked the only way it can
   * be checked from outside: the cue is photographed twice, half a second
   * apart, and the two pictures have to be the same bytes.
   */
  test('under reduced motion it is drawn, not performed, and nothing is waiting to happen', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id, { reducedMotion: 'reduce' });
    await showBrain(page);

    await expect(cue(page)).toBeVisible();
    const arc = page.locator('.brainturncue-arc');
    const drawn = await arc.evaluate((el) => {
      const style = getComputedStyle(el);
      return { animation: style.animationName, offset: style.strokeDashoffset };
    });
    expect(drawn.animation, 'the arc still performs itself under reduced motion').toBe('none');
    // Fully drawn, this frame: the mark is there rather than on its way.
    expect(parseFloat(drawn.offset)).toBe(0);

    const first = await cue(page).screenshot();
    await page.waitForTimeout(500);
    const second = await cue(page).screenshot();
    expect(Buffer.compare(first, second), 'something was scheduled and changed the cue').toBe(0);

    // Still a control, and still says the same thing.
    await expect(cue(page)).toHaveAttribute('title', S.brainTurnCue);
    expect((await cue(page).boundingBox())!.height).toBeGreaterThanOrEqual(TARGET_MIN);

    await context.close();
  });

  /**
   * THE MOVING VERSION IS A MARK ARRIVING, NOT A DEMONSTRATION.
   *
   * One draw, on the system's own drawer duration and its one curve
   * (docs/design-system.html §06). Nothing here mimes a drag — which is exactly
   * why the still version above can be the same picture.
   */
  test('with motion allowed the arc draws itself once, on the system’s own curve', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openMidInterview(context, sw, id);
    await showBrain(page);

    const motion = await page.locator('.brainturncue-arc').evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        name: style.animationName,
        duration: style.animationDuration,
        count: style.animationIterationCount,
        easing: style.animationTimingFunction,
      };
    });
    expect(motion.name).not.toBe('none');
    expect(motion.duration).toBe('0.32s');
    expect(motion.count).toBe('1');
    expect(motion.easing).toBe('cubic-bezier(0.2, 0, 0, 1)');

    await context.close();
  });
});
