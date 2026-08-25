import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { DRAWER_CRUMB_NOTE } from '../../src/core/drawer/height';
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
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: S.fileGoThrough, exact: true }).click();
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

    await rung(page, 'work').click();
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

    // ROUTE ONE: the trail. The globe followed without being told twice.
    await rung(page, 'work').click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('work');
    await expect(page.locator('.crumbs-seg')).toHaveCount(1);

    // ROUTE TWO: the globe's own file node. The trail followed.
    await page.locator('.brainglobe-pin.is-file[data-file-id="context"]').click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('file');
    await expect(page.locator('.crumbs-seg[data-seg="file"]')).toHaveCount(1);
    await expect(rung(page, 'file')).toContainText(S.fileContext);

    // ROUTE THREE: the globe's own back button, the other end of the same move.
    await page.getByRole('button', { name: S.workBrainBack, exact: true }).first().click();
    await expect.poll(() => tier(page), { timeout: 3000 }).toBe('work');
    await expect(page.locator('.crumbs-seg')).toHaveCount(1);

    await context.close();
  });

  test('the file the trail names is the file the List is drawing', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    await expect(rung(page, 'file')).toContainText(S.fileContext);
    expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);

    // Out to the work brain and back in through the List's own shelf: the trail
    // is the same three rungs again, naming the same file.
    await rung(page, 'work').click();
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
  test('it offers the three files, and choosing the one on screen keeps it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openDrawer(context, sw, id);

    await expect(rung(page, 'file')).toHaveAttribute('aria-expanded', 'false');
    await rung(page, 'file').click();
    await expect(page.locator('.crumbs-files')).toBeVisible();
    expect(
      await page.locator('.crumbs-file').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.file)),
    ).toEqual(['context', 'skills', 'actions']);
    await expect(chip(page, 'context')).toContainText(S.fileContext);
    await expect(chip(page, 'skills')).toContainText(S.fileSkills);
    await expect(chip(page, 'actions')).toContainText(S.fileActions);
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
    await expect(chip(page, 'actions')).toHaveAttribute(
      'aria-label',
      S.fileToggleLockedName(S.fileActions, S.lockedNeedsFirst(S.fileSkills)),
    );

    for (const file of ['skills', 'actions']) {
      await expect(chip(page, file)).toHaveAttribute('aria-disabled', 'true');

      // Pointer. `force`, because `aria-disabled` is exactly what Playwright
      // reads as "not enabled" — which is the point.
      await chip(page, file).click({ force: true });
      await expect(chip(page, file)).toHaveAttribute('aria-pressed', 'false');
      await expect(chip(page, 'context')).toHaveAttribute('aria-pressed', 'true');
      // It explains ITSELF instead of moving.
      await expect(note).toContainText(file === 'skills' ? S.fileSkills : S.fileActions);

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
