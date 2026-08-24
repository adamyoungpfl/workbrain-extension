import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { fileFinished } from '../../src/core/files/slots';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.8 VB-47 — the file-type toggle, and the storage change under it.
 *
 * The rules are proved without a browser in src/core/files/toggle.test.ts
 * (which file a press really lands on, and what a locked one may truthfully
 * say) and src/core/storage/client.test.ts (a pre-V1.8 install keeps every
 * answer). What only a real browser can prove is what this file is for:
 *
 * 1. **THE MIGRATION-SAFETY ONE, AND IT IS THE IMPORTANT ONE.** An install
 *    seeded in the OLD shape — one `wb:answers` key and nothing else — opens
 *    the panel and reads its Context answers exactly as before. Seeded through
 *    the extension's own service worker into real `chrome.storage.local`, not
 *    through a fake backend, so this is the actual read path.
 * 2. The `[ ] 9 not yet` summary tag is gone.
 * 3. The toggle switches file — the pressed segment is the file the drawer is
 *    drawing, and pressing it again keeps it there.
 * 4. A locked file explains itself, in words, without a tooltip, and IS NOT
 *    ENTERABLE: it never becomes the pressed segment, whatever is done to it.
 * 5. The strip is really a control strip: 44px targets, a visible focus ring,
 *    nothing distinguished by colour alone, and it stays put while the list
 *    scrolls under it — the sticky behaviour it inherits from the counts strip
 *    it replaced (tests/e2e/section-health.spec.ts).
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const DAY_MS = 24 * 60 * 60 * 1000;

async function launchExtension(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  return { context, sw, id };
}

/**
 * THE OLD SHAPE, EXACTLY. One `wb:answers` key holding a whole `Answers`, and
 * not one other key — which is every install made between R1-01 and V1.8. No
 * `wb:meta` either: the panel writes that on first open, and an install that
 * has one at the current version takes the same path (proved in
 * core/storage/client.test.ts).
 */
async function seedOldInstall(sw: Worker, answers: Answers): Promise<void> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
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

async function openList(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: S.fileGoThrough, exact: true }).click();
  await page.waitForSelector('.flow');
  if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await page.waitForSelector('.filetree-row');
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
  // The height lands as state immediately and the box catches up over a 320ms
  // settle, during which the drawer's own top edge is still travelling.
  await expect
    .poll(async () => {
      const first = (await page.locator('.filedrawer').boundingBox())!.y;
      await page.waitForTimeout(60);
      return Math.round(Math.abs((await page.locator('.filedrawer').boundingBox())!.y - first));
    })
    .toBe(0);
  return page;
}

const segment = (page: Page, file: string) => page.locator(`.filetypes-item[data-file="${file}"]`);

/* ───────────────────────────────────────────── the storage change ──────── */

test.describe('VB-47 — one answers key per file', () => {
  /**
   * THE MIGRATION-SAFETY TEST. `wb:answers` gained two siblings and did not
   * change its own name, shape or meaning, so an install that has been running
   * since R1-01 must lose nothing — and must not be migrated, since there is
   * nothing to migrate.
   */
  test('an install with only wb:answers still reads every Context answer', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = midInterview();
    await seedOldInstall(sw, seeded);

    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 760 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');

    // Home read them: the file row is not the "nothing here yet" state, and it
    // reports the age of the answers that were seeded.
    await expect(page.getByRole('button', { name: /^Context\.md/ })).toBeVisible();
    await expect(page.locator('.home-filelist')).not.toContainText(S.notBuiltYet);

    // The file view read them: every section that was answered says so.
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.waitForSelector('.fileview');
    const done = await page.locator('.fileview [data-health="done"], .fileview [data-health="due"]').count();
    expect(done, 'the seeded sections did not come back').toBeGreaterThan(0);

    // And the interview resumed from them rather than from question one: the
    // drawer's own list shows written sections.
    await page.getByRole('button', { name: S.fileGoThrough, exact: true }).click();
    await page.waitForSelector('.filetree-row');
    const written = await page.locator('.filetree-row[data-life="lit"]').count();
    expect(written, 'the drawer shows nothing written — the answers were lost').toBeGreaterThan(0);

    // NOTHING WAS REWRITTEN OR MOVED. The key is still there, holding the same
    // object, and the two new keys were not invented on the way past.
    const after = await sw.evaluate(() =>
      chrome.storage.local.get(['wb:answers', 'wb:answers:skills', 'wb:answers:actions']),
    );
    expect(after['wb:answers']).toEqual(seeded);
    expect(after['wb:answers:skills']).toBeUndefined();
    expect(after['wb:answers:actions']).toBeUndefined();

    await context.close();
  });
});

/* ─────────────────────────────────────────────────── the toggle ────────── */

test.describe('VB-47 — the toggle where the "not yet" tag was', () => {
  test('the tag is gone and three files stand in its place', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    // Gone: no summary strip, and no "N not yet" total anywhere in the drawer.
    await expect(page.locator('.filedrawer .sectionhealth-summary')).toHaveCount(0);
    await expect(page.locator('.filedrawer-body')).not.toContainText(/\d+\s+not yet/i);

    // In its place: one segment per file, in build order, in the same strip.
    const strip = page.locator('.filetypes');
    await expect(strip).toBeVisible();
    expect(
      await page.locator('.filetypes-item').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.file)),
    ).toEqual(['context', 'skills', 'actions']);
    await expect(segment(page, 'context')).toContainText(S.fileContext);
    await expect(segment(page, 'skills')).toContainText(S.fileSkills);
    await expect(segment(page, 'actions')).toContainText(S.fileActions);

    // And it is where the tag was: above the first row of the list. Read from
    // the top of the list, because the drawer opens scrolled to whatever
    // section is being written and the strip is sticky — rows pass UNDER it.
    await page.locator('.filedrawer-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(80);
    const stripBox = (await strip.boundingBox())!;
    const firstRow = (await page.locator('.filetree-row[data-node-id]').first().boundingBox())!;
    expect(stripBox.y + stripBox.height).toBeLessThanOrEqual(firstRow.y + 1);

    await context.close();
  });

  test('the toggle switches file — Context is the one on screen, and stays it', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    // The pressed segment names the file the drawer is really drawing: the
    // list under it is Context.md's own outline, section for section.
    await expect(segment(page, 'context')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);

    // Pressing it is a real press that lands on the same file, not a no-op
    // control: it keeps the file on screen and keeps its own pressed state.
    await segment(page, 'context').click();
    await expect(segment(page, 'context')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);

    // Exactly one file is ever the one on screen.
    expect(await page.locator('.filetypes-item[aria-pressed="true"]').count()).toBe(1);

    await context.close();
  });

  test('a locked file says what unlocks it, in the strip, without a tooltip', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    // The line is there before anything is pressed, and it is about the next
    // file along — with the sentence Home's own locked row prints.
    const note = page.locator('.filetypes-note');
    await expect(note).toBeVisible();
    await expect(note).toHaveText(`${S.fileSkills} · ${S.lockedNeedsFirst(S.fileContext)}`);
    // Not a tooltip: no `title` on any segment, and nothing hidden.
    expect(await page.locator('.filetypes-item[title]').count()).toBe(0);

    // The same sentence reaches a screen reader on the button itself, so it
    // arrives on focus rather than only after a press.
    await expect(segment(page, 'skills')).toHaveAttribute(
      'aria-label',
      S.fileToggleLockedName(S.fileSkills, S.lockedNeedsFirst(S.fileContext)),
    );
    await expect(segment(page, 'actions')).toHaveAttribute(
      'aria-label',
      S.fileToggleLockedName(S.fileActions, S.lockedNeedsFirst(S.fileSkills)),
    );

    // Pressing a locked one explains that one instead. `force`, because
    // `aria-disabled` is exactly what Playwright reads as "not enabled" — which
    // is the next test's point, and is why the sentence never depends on the
    // press.
    await segment(page, 'actions').click({ force: true });
    await expect(note).toHaveText(`${S.fileActions} · ${S.lockedNeedsFirst(S.fileSkills)}`);

    await context.close();
  });

  test('a locked file is not enterable, by pointer or by keyboard', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    for (const file of ['skills', 'actions']) {
      await expect(segment(page, file)).toHaveAttribute('aria-disabled', 'true');

      // Pointer.
      await segment(page, file).click({ force: true });
      await expect(segment(page, file)).toHaveAttribute('aria-pressed', 'false');
      await expect(segment(page, 'context')).toHaveAttribute('aria-pressed', 'true');

      // Keyboard — the same refusal, through the other door.
      await segment(page, file).focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await expect(segment(page, file)).toHaveAttribute('aria-pressed', 'false');
      await expect(segment(page, 'context')).toHaveAttribute('aria-pressed', 'true');

      // And the list underneath never became a different file's.
      expect(await page.locator('.filetree-row[data-node-id]').count()).toBe(contextOutline.length);
    }

    await context.close();
  });

  /**
   * The one that would have caught a locked row lying. `fileFinished` is the
   * same fold Home's shelf runs, so a file whose predecessor is finished has to
   * stop asking for it — in the drawer as well as on the shelf.
   */
  test('once Context is finished, the locked line stops asking for it', async () => {
    const { context, sw, id } = await launchExtension();
    const answers = midInterview();
    // Every question in the shipped flow, answered — the boundary
    // core/files/slots.test.ts walks, here in a real browser.
    for (const module of contextModules) {
      for (const node of module.nodes) {
        if ('fields' in node) continue;
        const step: Step = node;
        const key = step.key ?? step.id;
        if (answers.values[key] !== undefined) continue;
        let value: AnswerValue;
        if (step.kind === 'intro') value = null;
        else if (step.kind === 'yesno') value = 'no';
        else if (step.kind === 'chips') value = step.options?.[0]?.v ?? 'x';
        else if (step.kind === 'multi') value = step.options?.length ? [step.options[0]!.v] : [];
        else value = `A test answer for ${step.id}.`;
        answers.values[key] = value;
        answers.answeredAt[key] = new Date().toISOString();
        if (typeof value === 'string') answers.reflectedAt[key] = answers.answeredAt[key]!;
      }
    }
    expect(fileFinished(contextOutline, contextModules, answers, new Date()), 'the seed is not a finished file').toBe(
      true,
    );
    await seedOldInstall(sw, answers);

    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 760 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    // The shelf and the toggle must agree, so read the shelf first.
    await expect(page.locator('.home-filelist')).toContainText(S.lockedComingLater);
    await expect(page.locator('.home-filelist')).not.toContainText(S.lockedNeedsFirst(S.fileContext));

    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: S.fileGoThroughAgain, exact: true }).click();
    await page.waitForSelector('.filetree-row');
    await expect(page.locator('.filetypes-note')).toHaveText(`${S.fileSkills} · ${S.lockedComingLater}`);

    await context.close();
  });
});

/* ─────────────────────────────────────────── the strip, measured ───────── */

test.describe('VB-47 — the strip is a control strip', () => {
  test('every segment clears 44px, and paints smaller than it presses', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    const boxes = await page.locator('.filetypes-item').evaluateAll((els) =>
      els.map((el) => {
        const hit = el.getBoundingClientRect();
        const chip = el.querySelector('.filetypes-chip')!.getBoundingClientRect();
        return { hit: { w: hit.width, h: hit.height }, chip: { w: chip.width, h: chip.height } };
      }),
    );
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      // docs/GUARDRAILS.md's floor, icon-only controls included.
      expect(Math.round(box.hit.h)).toBeGreaterThanOrEqual(44);
      expect(Math.round(box.hit.w)).toBeGreaterThanOrEqual(44);
      // And the paint is deliberately smaller, so a 44px strip does not eat a
      // third of the drawer's peek (components/FileTypeToggle.css).
      expect(box.chip.h).toBeLessThan(box.hit.h);
      expect(Math.round(box.chip.h)).toBeGreaterThanOrEqual(24);
    }

    // The strip itself costs no more than the counts strip it replaced plus
    // its one line of explanation — measured, so a future restyle that doubles
    // it fails here rather than in the drawer.
    const strip = (await page.locator('.filetypes').boundingBox())!;
    expect(strip.height).toBeLessThanOrEqual(60);

    await context.close();
  });

  test('the file on screen is never told apart by colour alone', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    // Colour taken away entirely, and the three signals that are left are read
    // off real pixels: the pressed chip is FILLED and the locked ones are not,
    // the pressed chip carries a solid bar, and its label is heavier.
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
    await page.waitForTimeout(80);
    const read = await page.locator('.filetypes-item').evaluateAll((els) =>
      els.map((el) => {
        const chip = el.querySelector('.filetypes-chip') as HTMLElement;
        const style = getComputedStyle(chip);
        return {
          file: (el as HTMLElement).dataset.file,
          pressed: el.getAttribute('aria-pressed'),
          filled: style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent',
          bar: style.boxShadow !== 'none',
          weight: Number(style.fontWeight),
          dashed: style.borderStyle.includes('dashed'),
          lock: el.querySelectorAll('svg.filetypes-lock').length,
        };
      }),
    );
    const pressed = read.find((entry) => entry.pressed === 'true')!;
    expect(pressed.file).toBe('context');
    expect(pressed.filled, 'the pressed chip has no fill').toBe(true);
    expect(pressed.bar, 'the pressed chip has no bar under it').toBe(true);
    expect(pressed.lock).toBe(0);
    for (const entry of read.filter((e) => e.pressed === 'false')) {
      expect(entry.filled, `${entry.file} is filled like the pressed one`).toBe(false);
      expect(entry.bar).toBe(false);
      expect(entry.weight, `${entry.file} is as heavy as the pressed one`).toBeLessThan(pressed.weight);
      // A padlock and a broken edge, either of which reads on its own.
      expect(entry.lock, `${entry.file} has no padlock`).toBe(1);
      expect(entry.dashed, `${entry.file} has no dashed edge`).toBe(true);
    }

    await context.close();
  });

  test('every segment takes focus, and the ring is on the thing you can see', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    for (const file of ['context', 'skills', 'actions']) {
      await segment(page, file).focus();
      await expect(segment(page, file)).toBeFocused();
      const ring = await segment(page, file).evaluate((el) => {
        const chip = getComputedStyle(el.querySelector('.filetypes-chip')!);
        return { width: chip.outlineWidth, style: chip.outlineStyle, button: getComputedStyle(el).outlineStyle };
      });
      // 2px, visible, and on the chip rather than on the 44px box around it —
      // a ring round sixteen pixels of empty space is a rectangle near a focus
      // indicator, not one (components/FileTypeToggle.css).
      expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
      expect(ring.style).toBe('solid');
      expect(ring.button).toBe('none');
    }

    await context.close();
  });

  test('it stays put while the list scrolls under it', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    const strip = page.locator('.filetypes');
    await page.locator('.filedrawer-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(80);
    const before = (await strip.boundingBox())!;

    const rowsMoved = await page.evaluate(() => {
      const box = document.querySelector('.filedrawer-body') as HTMLElement;
      const first = document.querySelector('.filetree-row[data-node-id]') as HTMLElement;
      const top = first.getBoundingClientRect().top;
      box.scrollTop += 160;
      return top - first.getBoundingClientRect().top;
    });
    expect(rowsMoved, 'the rows really did move under it').toBeGreaterThan(100);
    await page.waitForTimeout(120);
    const after = (await strip.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await expect(strip).toBeVisible();
    // Opaque, so the rows do not show through it as they pass underneath.
    const ground = await strip.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(ground).not.toBe('rgba(0, 0, 0, 0)');

    await context.close();
  });
});
