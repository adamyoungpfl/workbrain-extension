import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { fileFinished } from '../../src/core/files/slots';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { openPastPeek } from './fixtures/drawer';

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
 * 2. The `[ ] 9 not yet` summary tag is gone — and so, since V1.9 VB-52, is the
 *    strip that replaced it. Its behaviour moved into the breadcrumb and is
 *    tested there (tests/e2e/breadcrumb.spec.ts); what is left here is that the
 *    control is really gone and that the storage change survived the move.
 * 3. A locked file stops asking for a file that is finished — the boundary in
 *    core/files/slots.ts, in a real browser.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
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
  // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
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
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });

    // Home read them: the file card is not the "nothing here yet" state.
    // (V2.6 VB-125b: the shelf wears the card grammar — the status lives on
    // the Context card now, and the walk-in selector is unchanged.)
    await expect(page.getByRole('button', { name: /^Context\.md/ })).toBeVisible();
    await expect(page.locator('.home-card[data-file="context"]')).not.toContainText(S.notBuiltYet);

    // The browse canvas read them (V2.4 VB-102 — FileView's heir): every
    // section that was answered says so.
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.waitForSelector('.browse');
    const done = await page.locator('.browse [data-health="done"], .browse [data-health="due"]').count();
    expect(done, 'the seeded sections did not come back').toBeGreaterThan(0);

    // And the interview resumed from them rather than from question one: the
    // drawer's own list shows written sections.
    await page.getByRole('button', { name: S.browseEdit, exact: true }).click();
    // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
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

/* ────────────────────────────────── and where its toggle went ──────────── */

test.describe('VB-47 — the strip is gone; the trail is the switcher', () => {
  /**
   * V1.9 VB-52. Adam's decision of 2026-08-24: "VB-47's file toggle above the
   * list is removed and its behaviour moves into the breadcrumb; the bottom bar
   * carries brain/list only." The BEHAVIOUR is tested where it now lives
   * (tests/e2e/breadcrumb.spec.ts). What belongs here is the other half of that
   * sentence — that the control this file was written for is really gone, and
   * that the storage change under it (above) survived the move untouched.
   */
  test('nothing above the list switches file any more', async () => {
    const { context, sw, id } = await launchExtension();
    await seedOldInstall(sw, midInterview());
    const page = await openList(context, id);

    // The strip, its segments and its printed line: gone.
    await expect(page.locator('.filetypes')).toHaveCount(0);
    await expect(page.locator('.filetypes-item')).toHaveCount(0);
    await expect(page.locator('.filetypes-note')).toHaveCount(0);

    // The `[ ] 9 not yet` summary tag VB-47 removed has not come back either.
    await expect(page.locator('.filedrawer .sectionhealth-summary')).toHaveCount(0);
    await expect(page.locator('.filedrawer-body')).not.toContainText(/\d+\s+not yet/i);

    // What the list starts with now is the file's first row, with the trail
    // above the scroll box entirely.
    const trail = (await page.locator('.crumbs').boundingBox())!;
    const body = (await page.locator('.filedrawer-body').boundingBox())!;
    expect(trail.y + trail.height).toBeLessThanOrEqual(body.y + 1);
    await expect(page.locator('.crumbs-seg[data-seg="file"]')).toContainText(S.fileContext);

    await context.close();
  });

  /**
   * The one that would have caught a locked file lying. `fileFinished` is the
   * same fold Home's shelf runs, so a file whose predecessor is finished has to
   * stop asking for it — on the trail as well as on the shelf. It lives here
   * rather than in breadcrumb.spec.ts because what it really tests is the
   * boundary in core/files/slots.ts that VB-47 built.
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
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    // The shelf and the trail must agree, so read the shelf first. V2.2:
    // finished Context now OPENS Skills (its interview shipped), so the shelf
    // stops saying anything locked about it — the signed-off ready line
    // stands where "Coming later" did, and no card asks for Context.
    // (V2.6 VB-125b: the shelf is the card duo now.)
    await expect(page.locator('.home-card[data-file="skills"]')).toContainText(S.skillsReady);
    await expect(page.locator('.home-duo')).not.toContainText(S.lockedNeedsFirst(S.fileContext));

    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: S.browseEdit, exact: true }).click();
    // BS-07a (§7.1): the peek is a status line now, not a sliced list.
  await openPastPeek(page);
    await page.locator('.crumbs-seg[data-seg="file"]').click();
    // On the trail: V2.2 unlocked Skills, and V2.9 VB-146 hid Actions — the
    // one file that was still locked here — for the beta. So with Context
    // finished, every file the trail OFFERS is open and the note has nothing
    // to explain. The claim this test exists for is unchanged and now
    // stronger: no locked line anywhere asks for a file that is finished.
    await expect(page.locator('.crumbs-file')).toHaveCount(2);
    await expect(page.locator('.crumbs')).not.toContainText(S.lockedNeedsFirst(S.fileContext));
    await expect(page.locator('.crumbs-note')).toHaveCount(0);

    await context.close();
  });
});
