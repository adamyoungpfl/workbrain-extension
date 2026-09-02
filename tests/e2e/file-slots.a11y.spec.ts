import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { contrastRatio, isOpaque, over, parseCssColor } from '../../src/core/color/contrast';
import type { Rgb } from '../../src/core/color/contrast';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.7 VB-36 / VB-37's accessibility floor, on the real panel.
 *
 * TWO THINGS HERE ARE NOT AXE'S JOB, AND THEY ARE THE REASON THIS FILE EXISTS.
 *
 *  1. **A locked row is a DISABLED control, and axe's contrast rule skips
 *     disabled controls entirely.** docs/GUARDRAILS.md does not: the floor is
 *     4.5:1 on text, full stop, and the sentence a locked row carries —
 *     "Finish Context.md first" — is the whole point of the row. So the
 *     painted colours are read back out of the browser and the ratio is
 *     computed here. This caught a real failure: the shipped `.filerow.locked`
 *     rule was `opacity: 0.55`, which put the name at 3.8:1 and the subtitle at
 *     2.0:1 the moment Home actually rendered one.
 *  2. **A section row that is not a door is a `<div>`, not a control**, so
 *     nothing in axe measures it either. Same treatment.
 *
 * Everything else is a straight WCAG scan of the two surfaces, plus the
 * keyboard path and the 44px floor, which are claims about the whole screen
 * rather than about one rule.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const TARGET_MIN = 44;

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/** A part-written file, so both the shelf and the file view have something to
 * say — mirroring file-slots.spec.ts's own fixture, per this repo's
 * one-spec-stands-alone convention. */
function partlyWritten(): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  const stepsById = new Map<string, Step>();
  for (const module of contextModules) {
    for (const node of module.nodes) if (!('fields' in node)) stepsById.set(node.id, node);
  }
  for (const id of [...contextOutline[0]!.questionIds, 'preferred_name', 'thinking_style']) {
    const step = stepsById.get(id);
    if (!step) throw new Error(`fixture drifted: ${id} is not a top-level step any more`);
    const key = step.key ?? step.id;
    let value: AnswerValue;
    if (step.kind === 'intro') value = null;
    else if (step.kind === 'yesno') value = 'yes';
    else if (step.kind === 'chips') value = step.options?.[0]?.v ?? 'x';
    else if (step.kind === 'multi') value = step.options?.length ? [step.options[0]!.v] : [];
    else value = `A test answer for ${step.id}.`;
    values[key] = value;
    answeredAt[key] = now;
    if (typeof value === 'string') reflectedAt[key] = now;
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

async function openHome(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), partlyWritten());
  const page = await context.newPage();
  // Scanned still, for the reason the other a11y specs here document: axe
  // measures one instant, and an entrance animation passes through partial
  // states on its way in.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

async function openFile(page: Page): Promise<void> {
  // V2.4 VB-102: the row opens the browse canvas — FileView's heir.
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.waitForSelector('.browse');
}

/**
 * The colour a piece of text is actually painted in, and the colour it is
 * actually painted on — walking up for the first opaque background, the same
 * way button-cluster.spec.ts reads a control's ground.
 */
async function inkAndGround(page: Page, selector: string): Promise<{ ink: Rgb; ground: Rgb }> {
  const read = await page.locator(selector).first().evaluate((el) => {
    const ink = getComputedStyle(el).color;
    const grounds: string[] = [];
    let node: HTMLElement | null = el as HTMLElement;
    while (node) {
      grounds.push(getComputedStyle(node).backgroundColor);
      node = node.parentElement;
    }
    grounds.push(getComputedStyle(document.body).backgroundColor, 'rgb(255, 255, 255)');
    return { ink, grounds };
  });

  const ink = parseCssColor(read.ink);
  if (!isOpaque(ink)) throw new Error(`text at ${selector} is not painted in an opaque colour`);
  // Composite down from the first opaque ancestor background back up to the
  // element's own, so a translucent layer in between is not silently ignored.
  const stack = read.grounds.map(parseCssColor);
  const firstOpaque = stack.findIndex((c) => isOpaque(c));
  let ground = stack[firstOpaque] as Rgb;
  for (let i = firstOpaque - 1; i >= 0; i--) {
    const layer = stack[i];
    if (layer) ground = over(layer, ground);
  }
  return { ink, ground };
}

// ─────────────────────────────────────────────────────────────── the scans

test('axe finds no violations on the shelf, with a locked slot on it (VB-36)', async () => {
  const { context, sw, id } = await launch();
  const page = await openHome(context, sw, id);

  // The scan is only worth anything if the locked slot is really rendered.
  // V2.6 VB-125b: the shelf wears the card grammar — Skills as a locked card
  // in the duo. V2.9 VB-146 hides Actions for the beta, so the duo is the
  // whole shelf and there is one lock on it, not two.
  await expect(page.locator('.home-card.is-locked')).toHaveCount(1);
  await expect(page.locator('.home-actrow')).toHaveCount(0);

  const results = await new AxeBuilder({ page }).include('.home').withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await context.close();
});

test('axe finds no violations on the file view (VB-37)', async () => {
  const { context, sw, id } = await launch();
  const page = await openHome(context, sw, id);
  await openFile(page);

  // Both kinds of row on screen: doors and not-doors.
  // Both kinds of row are on screen: select buttons for reached sections,
  // static labels for untouched ones (VB-103's select mode keeps VB-37's
  // reached/unreached split).
  await expect(page.locator('.browse .filetree-nav')).not.toHaveCount(0);
  await expect(page.locator('.browse .filetree-static')).not.toHaveCount(0);

  const results = await new AxeBuilder({ page }).include('.browse').withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await context.close();
});

// ───────────────────────────────────────── contrast axe will not measure

test('a locked slot’s name and its unlock line both clear 4.5:1 (VB-36)', async () => {
  const { context, sw, id } = await launch();
  const page = await openHome(context, sw, id);

  // The locked card carries three pieces of text — the friendly name, the
  // mono filename, and the reason — and axe skips all of them because the
  // card is a disabled control. GUARDRAILS does not.
  for (const part of ['.home-card-name', '.home-card-file', '.home-card-reason']) {
    const { ink, ground } = await inkAndGround(page, `.home-card.is-locked ${part}`);
    const ratio = contrastRatio(ink, ground);
    expect(ratio, `locked card ${part} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }

  // And the pill that says "Locked", which sits on its own fill.
  const pill = await inkAndGround(page, '.home-card.is-locked .home-card-pill');
  expect(contrastRatio(pill.ink, pill.ground)).toBeGreaterThanOrEqual(4.5);

  // V2.9 VB-146 — Actions' locked row used to make the same claims with its
  // own line. The row is hidden for the beta; the claim comes back with it.

  // BS-06 replaced VB-147's dormant tiles with waiting ROWS, and the reason
  // the check survives the swap is unchanged: a row that is not yet a door is
  // not a control, so axe skips its words, and dormant is "not yet" — never
  // "unreadable". Both halves of the row are checked, because the subtitle is
  // the half that says when it unlocks.
  await expect(page.locator('.home-row.is-waiting')).not.toHaveCount(0);
  for (const part of ['.home-row-label', '.home-row-sub']) {
    const dormant = await inkAndGround(page, `.home-row.is-waiting ${part}`);
    const ratio = contrastRatio(dormant.ink, dormant.ground);
    expect(ratio, `a waiting row's ${part} reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }

  await context.close();
});

test('a section that is not a door is still readable at 4.5:1 (VB-37)', async () => {
  const { context, sw, id } = await launch();
  const page = await openHome(context, sw, id);
  await openFile(page);

  const { ink, ground } = await inkAndGround(page, '.browse .filetree-static .filetree-label');
  const ratio = contrastRatio(ink, ground);
  expect(ratio, `an unreached section reads at ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);

  await context.close();
});

// ─────────────────────────────────────────────── targets and the keyboard

test('every row and button on both surfaces clears 44px (VB-36, VB-37)', async () => {
  const { context, sw, id } = await launch();
  const page = await openHome(context, sw, id);

  for (const selector of ['.home-card', '.home-tile', '.home-filelist .filerow']) {
    const rows = page.locator(selector);
    for (let i = 0; i < (await rows.count()); i++) {
      const box = (await rows.nth(i).boundingBox())!;
      expect(box.height, `${selector}[${i}] is ${box.height}px tall`).toBeGreaterThanOrEqual(TARGET_MIN);
    }
  }

  await openFile(page);
  const controls = page.locator('.browse .filetree-nav, .browse .btn, .browse .filetree-records-toggle, .browse .filetree-orbtoggle');
  for (let i = 0; i < (await controls.count()); i++) {
    const box = (await controls.nth(i).boundingBox())!;
    expect(box.height, `.browse control [${i}] is ${box.height}px tall`).toBeGreaterThanOrEqual(TARGET_MIN);
  }

  await context.close();
});

test('the keyboard path never lands on a locked slot, and reaches every door on the file view', async () => {
  const { context, sw, id } = await launch();
  const page = await openHome(context, sw, id);

  // Tab the whole of Home. A disabled control is not a tab stop, so the two
  // locked slots must never take focus — and the open card must.
  const seen: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    seen.push(await page.evaluate(() => (document.activeElement as HTMLElement)?.className ?? ''));
  }
  expect(seen.some((c) => c.includes('home-card') && !c.includes('is-locked'))).toBe(true);
  expect(seen.filter((c) => c.includes('is-locked'))).toEqual([]);

  // On the file view, every door and both buttons are reachable, and the rows
  // that are not doors are not tab stops.
  await openFile(page);
  // V2.4 VB-102: the browse canvas holds more tab stops than FileView did —
  // the globe (one stop, roving inside), the record disclosures, two action
  // buttons — so the walk starts from the top of the document and runs long
  // enough to cross all of them.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const doors = await page.locator('.browse .filetree-nav').count();
  const reached = new Set<string>();
  let sawGo = false;
  let sawBack = false;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      // V2.4: the tree's door is a button INSIDE the row — the id lives on
      // the row (data-node-id), so climb to it. FileView's flat rows carried
      // it on the control itself.
      const row = el?.closest('[data-node-id]');
      const isDoor = el?.classList.contains('filetree-nav') ?? false;
      return {
        cls: el?.className ?? '',
        section: isDoor ? (row?.getAttribute('data-node-id') ?? '') : '',
        text: el?.textContent ?? '',
      };
    });
    if (focused.section) reached.add(focused.section);
    if (focused.text.includes('Edit the file')) sawGo = true;
    if (focused.text.includes('Back')) sawBack = true;
    expect(focused.cls).not.toContain('is-static');
  }
  expect(reached.size).toBe(doors);
  expect(sawGo && sawBack, 'both of the file view’s buttons are reachable').toBe(true);

  // Nothing on either surface announces itself: a shelf and a file are states,
  // not events (docs/GUARDRAILS.md — no nudges, nothing steals focus).
  // The one polite region on this canvas is the globe's own; the list and
  // the chrome announce nothing — a file is a state, not an event.
  await expect(page.locator('.browse .filetree [aria-live], .browse-head [aria-live], .browse-actions [aria-live]')).toHaveCount(0);

  await context.close();
});
