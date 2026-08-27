import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import {
  DRAWER_CRUMB_NOTE,
  DRAWER_HANDLE_BAND,
  DRAWER_HANDLE_OVERHANG,
} from '../../src/core/drawer/height';
import { FLOW_NAV_CLEARANCE } from '../../src/core/flow/dock';
import { splitSectionLabel } from '../../src/core/flow/sectionLabel';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.9 VB-52 + VB-51 — the breadcrumb as navigation, and the bottom view bar.
 *
 * The rules are proved without a browser in src/core/files/breadcrumb.test.ts
 * (the trail's shape at each tier, and that it is a pure function of the one
 * `BrainNav` both views read) and in src/core/files/toggle.test.ts (a locked
 * file is not enterable). What only a real browser can prove is what this file
 * is for:
 *
 * 1. **The trail navigates.** Pressing a rung switches file, and pressing
 *    `Work brain` goes up a tier.
 * 2. **THE TRAIL AND THE BRAIN'S ZOOM ARE ONE STATE.** Change it by one route
 *    and assert the other has already followed — in both directions. This is
 *    the assertion Adam's decision of 2026-08-24 exists to protect.
 * 3. **A locked file is not enterable and says what unlocks it**, exactly as it
 *    does on Home's shelf, because it is the same fold (core/files/slots.ts).
 * 4. **VB-47's toggle above the list is gone**, along with the sticky way-up
 *    beside it.
 * 5. **The bottom bar switches view**, and it is below the visual.
 * 6. **The count is in the drawer and NOT on the question screen** —
 *    `FlowProgress` still prints no number (VB-02).
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const DAY_MS = 24 * 60 * 60 * 1000;
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

/** A file with real answers in it, aged so several sections read as due. Built
 * by walking the shipped modules, so what lands in storage is what the real
 * flow produces rather than a fixture that agrees with itself. */
function midInterview(): Answers {
  const ago = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of contextModules) {
    if (module.id === 'initiatives') break;
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
      answeredAt[key] = ago(300);
      if (typeof value === 'string') reflectedAt[key] = answeredAt[key]!;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

async function openDrawer(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), midInterview());
  const page = await context.newPage();
  await page.setViewportSize(PANEL);
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: S.browseEdit, exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.crumbs');
  await page.waitForSelector('.filetree-row');
  return page;
}

const rung = (page: Page, seg: string) => page.locator(`.crumbs-seg[data-seg="${seg}"]`);
const chip = (page: Page, file: string) => page.locator(`.crumbs-file[data-file="${file}"]`);
const tier = (page: Page) => page.locator('.brainglobe').getAttribute('data-tier');

/** The drawer's height stops changing. A mode change rides the drawer's own
 * 320ms settle, and the bands move with it. */
async function drawerSettled(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const first = (await page.locator('.filedrawer').boundingBox())!.height;
      await page.waitForTimeout(80);
      return Math.round(Math.abs((await page.locator('.filedrawer').boundingBox())!.height - first));
    })
    .toBe(0);
}

/* ─────────────────────────────────────────── the trail, as a trail ─────── */

test.describe('VB-52 — the breadcrumb is where you are', () => {
  test('three rungs: the work brain, the file, and the section being written', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    expect(
      await page.locator('.crumbs-seg').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.seg)),
    ).toEqual(['work', 'file', 'section']);
    await expect(rung(page, 'work')).toHaveText(S.crumbWork);
    await expect(rung(page, 'file')).toContainText(S.fileContext);

    // The last rung names the section the interview is really in — the drawer's
    // own current row, without the numeral the file's heading carries.
    const live = page.locator('.filetree-row[data-node-state="current"]').first();
    const nodeId = (await live.getAttribute('data-node-id')) ?? '';
    const node = contextOutline.find((n) => n.id === nodeId)!;
    await expect(rung(page, 'section')).toHaveText(splitSectionLabel(node.label).title);

    // ...and it is where you ARE, so it is not a control at all.
    expect(await rung(page, 'section').evaluate((el) => el.tagName)).not.toBe('BUTTON');
    await expect(rung(page, 'section')).toHaveAttribute('aria-current', 'page');

    await context.close();
  });

  test('the count is on the trail, and the question screen still prints no number', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    // In the drawer: the short form, right at the end of the band. The number is
    // the drawer's own — every top-level section the interview has reached,
    // which is the same fold the work shelf's note prints (core/flow/outline.ts).
    const reached = await page
      .locator('.filetree-row[data-depth="0"]:not([data-node-state="untouched"])')
      .count();
    expect(reached, 'the fixture reached no sections — there is nothing to count').toBeGreaterThan(0);
    const count = page.locator('.crumbs-count');
    await expect(count).toBeVisible();
    await expect(count).toContainText(S.crumbCount(reached, contextOutline.length));
    // The same fact, whole, for anyone who cannot see it.
    await expect(count).toContainText(S.sectionsOf(reached, contextOutline.length));
    const box = (await count.boundingBox())!;
    const band = (await page.locator('.crumbs-row').boundingBox())!;
    expect(box.x + box.width, 'the count is not at the right end of the band').toBeGreaterThan(
      band.x + band.width - 60,
    );

    // ON THE QUESTION SCREEN: no number at all. VB-02's bar is unchanged and
    // carries its count only in `aria-valuetext` (components/FlowProgress.tsx).
    const progress = page.locator('.flowprogress');
    await expect(progress).toBeVisible();
    await expect(progress).not.toContainText(/\d+\s*\/\s*\d+/);
    await expect(progress).not.toContainText(/\d+ of \d+/);
    expect(await progress.getAttribute('aria-valuetext'), 'the bar lost its spoken count').toMatch(/\d/);

    await context.close();
  });

  test('at the work brain the trail is one rung, and it is the one you are on', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    // V2.4 VB-112: the root rung is the door HOME now — the work tier is
    // reached by the ladder (the nav band's Back), the other end of the
    // same navigation.
    await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
    await drawerSettled(page);
    await page.locator('.brainglobe-nav').getByRole('button', { name: S.navBack, exact: true }).click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('work');
    await expect(page.locator('.workshelf')).toHaveCount(1);
    await expect(page.locator('.crumbs-seg')).toHaveCount(1);
    await expect(page.locator('.crumbs-seg[data-seg="work"]')).toHaveAttribute('aria-current', 'page');
    // A count of one file's sections means nothing out here.
    await expect(page.locator('.crumbs-count')).toHaveCount(0);

    await context.close();
  });
});

/* ────────────────────────────────── one navigation, two routes ─────────── */

test.describe('VB-52 — the trail and the Brain’s zoom are one state', () => {
  test('pressing Work brain zooms the Brain out; the Brain’s own way up shortens the trail', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    // Into Brain, so both routes are on screen at once.
    await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
    await drawerSettled(page);
    await expect.poll(() => page.locator('.filedrawer').getAttribute('data-mode')).toBe('brain');
    expect(await tier(page)).toBe('file');

    // ROUTE ONE: the ladder — the nav band's Back. The trail followed the
    // globe without being told twice. (The trail's own root rung stopped
    // being a tier move at V2.4 VB-112 — it is the door Home now, asserted
    // in its own test below.)
    await page.locator('.brainglobe-nav').getByRole('button', { name: S.navBack, exact: true }).click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('work');
    await expect(page.locator('.crumbs-seg')).toHaveCount(1);

    // ROUTE TWO: the globe's own file node. The trail followed.
    await page.locator('.brainglobe-pin.is-file[data-file-id="context"]').click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('file');
    await expect(page.locator('.crumbs-seg[data-seg="file"]')).toHaveCount(1);
    await expect(rung(page, 'file')).toContainText(S.fileContext);

    // ROUTE THREE: the root rung — V2.4 VB-112's door. All the way out
    // means the Home page, from any tier.
    await rung(page, 'work').click();
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.flowshell')).toHaveCount(0);

    await context.close();
  });

  test('the file the trail names is the file the List is drawing', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    await expect(rung(page, 'file')).toContainText(S.fileContext);
    expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);

    // Out to the work brain (the ladder — VB-112 made the root rung the
    // door Home) and back in through the List's own shelf: the trail is the
    // same three rungs again, naming the same file.
    await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
    await drawerSettled(page);
    await page.locator('.brainglobe-nav').getByRole('button', { name: S.navBack, exact: true }).click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('work');
    // The shelf is the List's work-tier face — flip back to List to use it.
    await page.getByRole('button', { name: S.drawerModeList, exact: true }).click();
    await drawerSettled(page);
    await expect(page.locator('.workshelf')).toHaveCount(1);
    await page.locator('.workshelf-row[data-file="context"]').click();
    await expect(page.locator('.filetree-row').first()).toBeVisible();
    await expect(rung(page, 'file')).toContainText(S.fileContext);
    expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);

    await context.close();
  });
});

/* ─────────────────────────────────── the trail switches files ──────────── */

test.describe('VB-52 — the file rung is the switcher', () => {
  test('it offers the shown files, and choosing the one on screen keeps it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    await expect(rung(page, 'file')).toHaveAttribute('aria-expanded', 'false');
    await rung(page, 'file').click();
    await expect(page.locator('.crumbs-files')).toBeVisible();
    expect(
      await page.locator('.crumbs-file').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.file)),
    // V2.9 VB-146 — Actions is hidden for the beta, from the one list in
    // core/files/slots.ts that the trail, the shelf and the work tier all
    // read (BETA_HIDDEN_SLOTS).
    ).toEqual(['context', 'skills']);
    await expect(chip(page, 'context')).toContainText(S.fileContext);
    await expect(chip(page, 'skills')).toContainText(S.fileSkills);
    await expect(page.locator('.crumbs-file[data-file="actions"]')).toHaveCount(0);
    // Exactly one file is ever the one on screen.
    expect(await page.locator('.crumbs-file[aria-pressed="true"]').count()).toBe(1);

    // Choosing the file already on screen is a real press that lands on it.
    await chip(page, 'context').click();
    await expect(page.locator('.crumbs-files')).toHaveCount(0);
    await expect(rung(page, 'file')).toContainText(S.fileContext);
    expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);

    await context.close();
  });

  test('Escape closes it without choosing, and focus is never dropped', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    await rung(page, 'file').click();
    // Opening moves focus into what was opened — the chip for the file you are
    // in — because the rung that was pressed has just been replaced.
    await expect(chip(page, 'context')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.crumbs-files')).toHaveCount(0);
    // ...and closing gives it back.
    await expect(rung(page, 'file')).toBeFocused();

    await context.close();
  });

  test('a locked file is not enterable and says what unlocks it, in the trail', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);
    await rung(page, 'file').click();

    // The line is there before anything is pressed, and it is about the next
    // file along — in the sentence Home's own locked row prints.
    const note = page.locator('.crumbs-note');
    await expect(note).toBeVisible();
    await expect(note).toHaveText(`${S.fileSkills} · ${S.lockedNeedsFirst(S.fileContext)}`);
    // Never a tooltip.
    expect(await page.locator('.crumbs-file[title]').count()).toBe(0);

    // The whole truth reaches a screen reader on the chip itself, so it arrives
    // on focus rather than only after a press.
    await expect(chip(page, 'skills')).toHaveAttribute(
      'aria-label',
      S.fileToggleLockedName(S.fileSkills, S.lockedNeedsFirst(S.fileContext)),
    );

    for (const file of ['skills']) {
      await expect(chip(page, file)).toHaveAttribute('aria-disabled', 'true');

      // Pointer. `force`, because `aria-disabled` is exactly what Playwright
      // reads as "not enabled" — which is the point.
      await chip(page, file).click({ force: true });
      await expect(chip(page, file)).toHaveAttribute('aria-pressed', 'false');
      await expect(chip(page, 'context')).toHaveAttribute('aria-pressed', 'true');
      // It explains ITSELF instead of moving.
      await expect(note).toContainText(S.fileSkills);

      // Keyboard — the same refusal, through the other door.
      await chip(page, file).focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await expect(chip(page, file)).toHaveAttribute('aria-pressed', 'false');

      // And the list underneath never became a different file's.
      expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);
    }

    await context.close();
  });

  test('opening the files never draws over a control, and gives the globe its room back', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);
    await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
    await drawerSettled(page);

    const before = (await page.locator('.brainglobe').boundingBox())!;
    const bandBefore = (await page.locator('.crumbs').boundingBox())!;
    await rung(page, 'file').click();
    await page.waitForTimeout(120);
    const after = (await page.locator('.brainglobe').boundingBox())!;
    const bandAfter = (await page.locator('.crumbs').boundingBox())!;

    // The band takes the line the sentence needs...
    expect(Math.round(bandAfter.height - bandBefore.height)).toBe(DRAWER_CRUMB_NOTE);
    // ...and the picture gives up exactly that, rather than being drawn over.
    expect(Math.round(before.height - after.height)).toBe(DRAWER_CRUMB_NOTE);
    const stage = (await page.locator('.filedrawer-stage').boundingBox())!;
    expect(Math.round(bandAfter.y + bandAfter.height)).toBeLessThanOrEqual(Math.round(stage.y) + 1);

    await context.close();
  });
});

/* ───────────────────────────────────── VB-51 — the bottom bar ──────────── */

test.describe('VB-51 — the bottom bar switches view, and only view', () => {
  test('two icons, below the visual, and they change the mode', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    const bar = page.locator('.filedrawer-viewbar');
    await expect(bar).toBeVisible();
    expect(await bar.locator('button').count()).toBe(2);

    // BELOW the visual, and the last band of the drawer.
    const barBox = (await bar.boundingBox())!;
    const body = (await page.locator('.filedrawer-body').boundingBox())!;
    const drawer = (await page.locator('.filedrawer').boundingBox())!;
    expect(barBox.y).toBeGreaterThanOrEqual(body.y + body.height - 1);
    expect(Math.round(barBox.y + barBox.height)).toBeGreaterThanOrEqual(Math.round(drawer.y + drawer.height) - 9);
    // ...and the trail is above it, with the picture in between.
    const band = (await page.locator('.crumbs').boundingBox())!;
    expect(band.y + band.height).toBeLessThanOrEqual(barBox.y);

    // It switches VIEW.
    await page.getByRole('button', { name: S.drawerModeBrain, exact: true }).click();
    await drawerSettled(page);
    await expect.poll(() => page.locator('.filedrawer').getAttribute('data-mode')).toBe('brain');
    await expect(page.getByRole('button', { name: S.drawerModeBrain, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: S.drawerModeList, exact: true }).click();
    await expect.poll(() => page.locator('.filedrawer').getAttribute('data-mode')).toBe('list');

    // ...and the file it is a view OF never changed.
    await expect(rung(page, 'file')).toContainText(S.fileContext);

    await context.close();
  });

  test('nothing switches view or file above the visual any more', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    // VB-47's strip is gone, and so is the sticky way-up beside it.
    await expect(page.locator('.filetypes')).toHaveCount(0);
    await expect(page.locator('.filetypes-item')).toHaveCount(0);
    await expect(page.locator('.filedrawer-nav')).toHaveCount(0);
    await expect(page.locator('.workshelf-up')).toHaveCount(0);

    // The head band is the handle's alone: no mode buttons left in it.
    const head = (await page.locator('.filedrawer-head').boundingBox())!;
    const modes = (await page.locator('.filedrawer-modes').boundingBox())!;
    expect(modes.y).toBeGreaterThan(head.y + head.height);

    // And there is exactly ONE control anywhere in the drawer that changes file.
    expect(await page.locator('.crumbs-seg[data-seg="file"]').count()).toBe(1);

    await context.close();
  });
});

/* ───────────────────────────────── V2.0 VB-72: the air above the trail ─── */

/**
 * "Reduce the padding above the breadcrumb row in List. Measure against VB-58's
 * centred save note and VB-41's clearances rather than nudging until it looks
 * right — those numbers are asserted."
 *
 * So this measures both sides of the drawer's top edge in one pass, because the
 * complaint is a comparison rather than a number: above the seam, V1.7 VB-41
 * leaves 29px between the nav cluster's painted words and the edge, and 22px
 * between them and the top of the grip — both still held, in the file that owns
 * them (tests/e2e/button-cluster.spec.ts), and neither touched here. Below it,
 * the band under the grip ran the handle's whole 44 and the trail then centred
 * its words in its own 44, which put 53px of nothing between the grip and the
 * first word. The wide side of the seam was the empty one.
 *
 * VB-58's half of the sentence is the same shape and is asserted in
 * tests/e2e/save-note.spec.ts: 8px under the note, 25px above the nav's words,
 * deliberately under VB-41's 29 below them. Nothing here moves either number —
 * everything VB-72 changes is under the drawer's top edge.
 */
test.describe('VB-72 — less air above the breadcrumbs', () => {
  test('the trail starts one band down, and the handle keeps a 44px target above it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    const g = await page.evaluate(() => {
      const box = (selector: string) => {
        const found = document.querySelector(selector);
        if (!found) return null;
        const rect = found.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
      };
      return {
        drawer: box('.filedrawer')!,
        handle: box('.filedrawer-handle')!,
        grip: box('.filedrawer-grip')!,
        crumbs: box('.crumbs-row')!,
        rung: box('.crumbs-seg.is-here .crumbs-label')!,
        navHitBottom: Math.max(
          ...[...document.querySelectorAll('.flow-foot .btn')].map((el) => el.getBoundingClientRect().bottom),
        ),
      };
    });

    // THE BAND IS THE BAND, and the trail begins at the bottom of it.
    expect(Math.round(g.crumbs.top - g.drawer.top), 'the trail does not start at the band').toBe(
      DRAWER_HANDLE_BAND,
    );

    // THE TARGET IS STILL 44, and the rest of it is above the drawer's edge.
    expect(g.handle.height, 'the handle is under the 44px floor').toBeGreaterThanOrEqual(44);
    expect(Math.round(g.drawer.top - g.handle.top), 'the handle does not overhang as core says').toBe(
      DRAWER_HANDLE_OVERHANG,
    );
    expect(Math.round(g.handle.height), 'the band and the overhang do not add up to the target').toBe(
      DRAWER_HANDLE_BAND + DRAWER_HANDLE_OVERHANG,
    );

    // AND IT TAKES NO PRESS — V2.3 VB-94: the band above the drawer holds
    // the save NOTE now (the cluster moved in-flow), so the overhang's
    // neighbour is the note's ink. Same guarantee, new tenant: the handle's
    // reach and the words never overlap, and the clearance is exactly VB-41's.
    const noteInkBottom = await page
      .locator('.flow-save span')
      .evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().bottom)));
    expect(g.handle.top, 'the handle reaches into the note’s ink').toBeGreaterThanOrEqual(noteInkBottom - 0.5);
    expect(g.drawer.top - noteInkBottom, 'VB-41’s clearance moved').toBeGreaterThanOrEqual(FLOW_NAV_CLEARANCE - 1);

    // AND THE GRIP DID NOT MOVE: still straddling the edge, half above it.
    expect(g.grip.top, 'the grip is not straddling the edge').toBeLessThan(g.drawer.top);
    expect(g.grip.bottom, 'the grip is not straddling the edge').toBeGreaterThan(g.drawer.top);
    expect(Math.round(g.drawer.top - g.grip.top), 'the grip moved off the seam').toBe(
      Math.round(g.grip.height / 2),
    );

    // AND NOTHING WAS TAKEN OFF THE TRAIL to pay for it: every rung is still a
    // 44px target (core/drawer/height.ts's note on why the band is the floor).
    for (const rungBox of await page.locator('.crumbs-seg').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().height),
    )) {
      expect(rungBox, 'a rung is under the 44px floor').toBeGreaterThanOrEqual(44);
    }

    await context.close();
  });

  test('the air under the grip is no longer twice the air above it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    const measured = await page.evaluate(() => {
      const grip = document.querySelector('.filedrawer-grip')!.getBoundingClientRect();
      const word = document.querySelector('.crumbs-seg.is-here .crumbs-label')!.getBoundingClientRect();
      // The painted box of the nav cluster, which is what VB-41 measures — the
      // wrapper the ring hugs, not the 44px hit box around it.
      const cluster = Math.max(
        ...[...document.querySelectorAll('.flow-foot .navbtn')].map((el) => el.getBoundingClientRect().bottom),
      );
      return { above: grip.top - cluster, below: word.top - grip.bottom };
    });

    // Both are real air, and neither has collapsed: the trail must not end up
    // welded to the grip either.
    expect(measured.above, 'the cluster is on top of the grip').toBeGreaterThan(8);
    expect(measured.below, 'the trail is welded to the grip').toBeGreaterThan(8);

    // THE COMPLAINT, MEASURED. It was 53px against VB-41's 22 — two and a half
    // times as much air on the side with nothing in it. The bound is stated
    // against the number VB-41 asserts rather than against a number that looked
    // right, so tightening one side tightens this too.
    expect(
      measured.below,
      `${Math.round(measured.below)}px under the grip against ${Math.round(measured.above)}px above it`,
    ).toBeLessThan(measured.above * 2);

    console.log(
      `\n  VB-72 either side of the seam — ${Math.round(measured.above)}px above the grip, ${Math.round(
        measured.below,
      )}px below it\n`,
    );

    await context.close();
  });
});
