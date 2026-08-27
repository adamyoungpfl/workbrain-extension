import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { splitSectionLabel } from '../../src/core/flow/sectionLabel';
import { DRAWER_REST_HEIGHT } from '../../src/core/drawer/height';
import { generateContextFile, contextFileDate } from '../../src/core/files/generate';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Module, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.1 VB-07 + VB-07b accept criteria, driven in a real browser.
 *
 * The unit tests prove the derivations and the component's own wiring. They
 * cannot prove the things this repo has actually been bitten by: that the
 * drawer opens and closes from the keyboard, that it never traps focus, that
 * the question behind it stays reachable with it open, that a written row is
 * real navigation and an unreached one is inert, that resuming a saved session
 * does not replay the typewriter over every already-written row, and that the
 * previewed text is byte-for-byte what Download produces.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

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
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Edit the file', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
}

async function seedAnswers(sw: Worker, answers: Answers): Promise<void> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
}

/** Answers every top-level question up to (not including) a module, so the
 * panel lands inside it. Same helper module-intro.spec.ts uses, and for the
 * same reason: it is the cheapest way to put the panel at a known position. */
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

/** Module three onwards: far enough in that several sections are written, one
 * is being written, and several are still untouched. */
const MID_MODULE = contextModules[3]!;

/**
 * Open it as far as it goes.
 *
 * V1.2 VB-12 replaced the collapsed/expanded toggle these tests were written
 * against with a continuously draggable handle, so "open the drawer" is now
 * "send the handle to its maximum" — `End`, per the WAI-ARIA window-splitter
 * keys the handle implements. Everything each test then asserts is unchanged;
 * only the way the drawer is opened moved.
 */
async function openDrawer(page: Page): Promise<void> {
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
}

test.describe('VB-07 — the living file tree', () => {
  test('every section renders from question one, dim until reached', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const rows = page.locator('.filetree-row[data-node-id]');
    await expect(rows).toHaveCount(contextOutline.length);

    // The first question belongs to section one, so exactly that one is
    // current and every other section is untouched — nothing is hidden.
    await expect(page.locator('.filetree-row[data-node-state="current"]')).toHaveCount(1);
    await expect(page.locator('.filetree-row[data-node-state="untouched"]')).toHaveCount(contextOutline.length - 1);

    await context.close();
  });

  test('the current section is distinguishable by more than colour', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, MID_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    // Past the module transition, onto a real question.
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'step');

    // At least one — a sub-section and its parent are both "where you are",
    // which is what `outlineNodeCurrent` recursing means and what the source
    // does too, so this counts one-or-more rather than exactly one.
    const current = page.locator('.filetree-row[data-node-state="current"]').first();
    expect(await page.locator('.filetree-row[data-node-state="current"]').count()).toBeGreaterThanOrEqual(1);
    // An orb wearing a ring nothing else has, a mark drawn inside it and a
    // word for assistive tech — none of them colour (docs/GUARDRAILS.md:
    // nothing distinguished by colour alone). V2.0 VB-56 removed the fourth
    // signal, a blinking terminal cursor after the name, and this asserts its
    // absence rather than simply forgetting it.
    //
    // V1.8 VB-45 replaced the ASCII tile with the section's own orb from the
    // Brain visual. The three states still differ in three non-colour ways;
    // what carries them changed, and the greyscale read-back that proves it
    // lives in tests/e2e/section-health.spec.ts.
    await expect(current.locator('.filetree-glyph')).toHaveAttribute('data-life', 'live');
    await expect(current.locator('.filetree-mark')).toHaveCount(1);
    await expect(current.locator('.filetree-srstate')).toHaveText(S.fileTreeStateCurrent);
    await expect(current.locator('.filetree-cursor')).toHaveCount(0);

    const reached = page.locator('.filetree-row[data-life="lit"]').first();
    await expect(reached.locator('.filetree-glyph')).toHaveAttribute('data-life', 'lit');
    await expect(reached.locator('.filetree-mark')).toHaveCount(1);
    await expect(reached.locator('.filetree-srstate')).toHaveText(S.fileTreeStateReached);

    // The greyed one is the only one with nothing drawn inside its orb.
    const untouched = page.locator('.filetree-row[data-node-state="untouched"]').first();
    await expect(untouched.locator('.filetree-glyph')).toHaveAttribute('data-life', 'dim');
    await expect(untouched.locator('.filetree-mark')).toHaveCount(0);
    await expect(untouched.locator('.filetree-srstate')).toHaveText(S.fileTreeStateUntouched);

    await context.close();
  });

  test('clicking a written row navigates to that section, and Back returns', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, MID_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    const before = await page.locator('.flow').getAttribute('data-step-id');
    await openDrawer(page);

    // Section one's first question is `orientation_ready` — the very start.
    const firstSection = page.locator('.filetree-row[data-node-id="sec1"] .filetree-nav');
    await expect(firstSection).toHaveCount(1);
    await firstSection.click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', contextOutline[0]!.questionIds[0]!);

    // Nothing was lost: Back is the way home, exactly as it is from any other
    // position the panel can be viewing.
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', before!);

    await context.close();
  });

  test('an unreached row is not a control at all — no click, no tab stop', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await openDrawer(page);

    const untouched = page.locator('.filetree-row[data-node-state="untouched"]').first();
    await expect(untouched.locator('.filetree-nav')).toHaveCount(0);
    // Its own row holds no button of any kind (the disclosure toggle only
    // exists on a section that has children, and this assertion is about the
    // navigate control specifically).
    await expect(untouched.locator('button.filetree-nav')).toHaveCount(0);

    // Clicking the label does nothing: the panel stays on the same question.
    const stepId = await page.locator('.flow').getAttribute('data-step-id');
    await untouched.locator('.filetree-label').click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', stepId!);

    await context.close();
  });

  test('records show as their own sub-items, titled as the file titles them', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = answersUpToModule(contextModules, MID_MODULE.id);
    seeded.repeatables.roles = [{ role_name: 'Team lead' }, { role_name: 'Parent' }];
    await seedAnswers(sw, seeded);
    const page = await openPanel(context, id);
    await enterInterview(page);
    await openDrawer(page);

    // 2. About Me holds 2.1 Roles, which holds the records.
    const aboutMe = page.locator('.filetree-row[data-node-id="sec2"] .filetree-orbtoggle');
    if ((await aboutMe.getAttribute('aria-expanded')) !== 'true') await aboutMe.click();

    // V2.4 VB-110: records sit behind the one disclosure grammar now, with
    // their own freshness on the right.
    const recordsToggle = page.locator('.filetree-records-toggle');
    await expect(recordsToggle).toHaveText(/2 items/);
    await recordsToggle.click();
    await expect(page.locator('.filetree-row.is-record .filetree-label')).toHaveText(['Team lead', 'Parent']);
    await expect(page.locator('.filetree-row.is-record button')).toHaveCount(0);

    await context.close();
  });

  test('the accordion shows one section at a time and follows the active one', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await openDrawer(page);

    const expandedToggles = page.locator('.filetree-orbtoggle[aria-expanded="true"]');
    await expect(expandedToggles).toHaveCount(0); // section one has no children

    // Opening 2. About Me shows its five sub-sections, and it is the only
    // section open.
    await page.locator('.filetree-row[data-node-id="sec2"] .filetree-orbtoggle').click();
    await expect(expandedToggles).toHaveCount(1);
    await expect(page.locator('.filetree-row[data-node-id="sec2-1"]')).toHaveCount(1);

    await context.close();
  });
});

test.describe('VB-07 — the drawer is a dock, never a modal', () => {
  test('opens and closes from the keyboard alone', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // V1.2 VB-12: the toggle button became a draggable handle, so opening and
    // closing from the keyboard is now Enter on the handle — collapse to the
    // peek, and restore. The promise this test exists for is unchanged: the
    // drawer can be worked with no pointer at all.
    const handle = page.locator('.filedrawer-handle');
    const min = Number(await handle.getAttribute('aria-valuemin'));
    await handle.focus();
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
    await page.keyboard.press('Enter');
    await expect(handle).toHaveAttribute('aria-valuenow', String(min));
    await page.keyboard.press('Enter');
    expect(Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(min);

    // Its target is a real element, and the drawer is not an overlay.
    const controls = await handle.getAttribute('aria-controls');
    await expect(page.locator(`#${controls}`)).toHaveCount(1);
    await expect(page.locator('.filedrawer [role="dialog"]')).toHaveCount(0);

    await context.close();
  });

  test('never traps focus — Tab walks out of it and back to the question', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, MID_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await openDrawer(page);

    // Start on the last control inside the drawer and keep tabbing: focus must
    // leave the drawer within a bounded number of presses. A focus trap would
    // cycle forever inside it.
    const controls = page.locator('.filedrawer button');
    await controls.last().focus();
    let escaped = false;
    for (let i = 0; i < 40 && !escaped; i++) {
      await page.keyboard.press('Tab');
      escaped = await page.evaluate(() => {
        const el = document.activeElement;
        return !!el && el !== document.body && !el.closest('.filedrawer');
      });
    }
    expect(escaped, 'focus never left the drawer — that is a trap').toBe(true);

    await context.close();
  });

  test('the question behind it stays visible and answerable with it open', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, contextModules[1]!.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    await page.getByRole('button', { name: 'Next', exact: true }).click(); // past the module transition
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await openDrawer(page);

    // Not covered: the question's own box does not overlap the drawer's.
    const question = page.locator('.flow-q');
    await expect(question).toBeVisible();
    const qBox = (await question.boundingBox())!;
    const drawerBox = (await page.locator('.filedrawer').boundingBox())!;
    expect(qBox.y + qBox.height).toBeLessThanOrEqual(drawerBox.y + 1);

    // And it is genuinely answerable, keyboard-only, with the drawer open.
    await page.locator('.flow input.field, .flow textarea').first().fill('Ada');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'preferred_name');
    // The drawer survived the question changing, still open, still tracking.
    const handle = page.locator('.filedrawer-handle');
    await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
    expect(await page.locator('.filetree-row[data-node-state="current"]').count()).toBeGreaterThanOrEqual(1);

    await context.close();
  });

  test('collapsed is a peek, scrolled so the section being written is in it', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, MID_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await page.waitForSelector('.filetree-row[data-node-state="current"]');

    const peek = await page.evaluate(() => {
      const box = document.querySelector('.filedrawer-body') as HTMLElement;
      const row = document.querySelector('.filetree-row[data-node-state="current"]') as HTMLElement;
      return {
        boxHeight: box.clientHeight,
        scrollHeight: box.scrollHeight,
        scrollTop: box.scrollTop,
        rowTop: row.offsetTop,
        rowHeight: row.offsetHeight,
      };
    });

    // A peek: a couple of rows, with more below the fold.
    expect(peek.boxHeight).toBeLessThan(peek.scrollHeight);
    expect(peek.boxHeight / peek.rowHeight).toBeLessThan(5);
    // ...and the section being written is inside it, not scrolled past.
    expect(peek.rowTop).toBeGreaterThanOrEqual(peek.scrollTop - 1);
    expect(peek.rowTop + peek.rowHeight).toBeLessThanOrEqual(peek.scrollTop + peek.boxHeight + 1);

    // Expanding shows more of the same box without remounting it. Polled
    // rather than read once: the height is a real CSS transition, so reading
    // it the instant the class lands catches the starting value.
    await openDrawer(page);
    await expect
      .poll(() => page.evaluate(() => (document.querySelector('.filedrawer-body') as HTMLElement).clientHeight))
      .toBeGreaterThan(peek.boxHeight);

    await context.close();
  });

  test('how open it is is never written down — reopening the panel starts at the peek', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = answersUpToModule(contextModules, MID_MODULE.id);
    await seedAnswers(sw, seeded);

    let page = await openPanel(context, id);
    await enterInterview(page);
    await openDrawer(page);
    await page.close();

    page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.filedrawer-handle')).toHaveAttribute('aria-valuenow', String(DRAWER_REST_HEIGHT));

    // Nothing drawer-shaped was persisted anywhere.
    const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
    expect(keys.filter((k) => /drawer|tree|expand|open|height/i.test(k))).toEqual([]);
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'] as Answers);
    expect(stored).toEqual(seeded);

    await context.close();
  });
});

test.describe('VB-07 — the terminal aesthetic', () => {
  test('a row types itself in when its own state changes, and the label ends whole', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, contextModules[1]!.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    await page.getByRole('button', { name: 'Next', exact: true }).click(); // past the transition
    await openDrawer(page);

    const aboutMeLabel = page.locator('.filetree-row[data-node-id="sec2"] .filetree-label');
    const full = splitSectionLabel(contextOutline[1]!.label).title; // VB-96: the row prints the title
    await expect(aboutMeLabel).toContainText(full);

    // Answering the first question of section two moves section one from
    // current to written — a live transition, so its label reprints itself.
    // Sampled straight after the commit; whatever it is caught mid-print, it
    // must always finish whole.
    await page.locator('.flow input.field, .flow textarea').first().fill('Ada');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.filetree-row[data-node-id="sec1"]')).toHaveAttribute('data-node-state', 'reached');
    await expect(page.locator('.filetree-row[data-node-id="sec1"] .filetree-label')).toHaveText(
      new RegExp(splitSectionLabel(contextOutline[0]!.label).title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );

    await context.close();
  });

  test('the typewriter really prints — a live transition is caught mid-label', async () => {
    const { context, sw, id } = await launchExtension();
    // Module one fully answered, so the panel opens on module two's
    // transition. No question is being asked there, so no row is current yet
    // and 2. About Me is still untouched — continuing is what moves it, which
    // is a real state change on that row and therefore a reprint.
    await seedAnswers(sw, answersUpToModule(contextModules, contextModules[1]!.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
    await expect(page.locator('.filetree-row[data-node-id="sec2"]')).toHaveAttribute('data-node-state', 'untouched');

    // Sample the row's label every animation frame, in the page, so no
    // round-trip latency can miss the print.
    await page.evaluate(() => {
      const w = window as unknown as { __wbMinLen?: number };
      w.__wbMinLen = Number.POSITIVE_INFINITY;
      const tick = () => {
        const el = document.querySelector('.filetree-row[data-node-id="sec2"] .filetree-label');
        if (el) w.__wbMinLen = Math.min(w.__wbMinLen!, (el.textContent ?? '').length);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.filetree-row[data-node-id="sec2"]')).toHaveAttribute('data-node-state', 'current');
    // However short it was caught, it always finishes whole.
    await expect(page.locator('.filetree-row[data-node-id="sec2"] .filetree-label')).toContainText(splitSectionLabel(contextOutline[1]!.label).title); // VB-96

    // It started from nothing and printed its way back. Polled rather than
    // read once: the reprint begins a tick after the commit, so a single read
    // taken the instant the assertions above resolve samples only the frames
    // before it starts. A run in which the label is never short is a run in
    // which the typewriter did not fire at all, and this fails.
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __wbMinLen: number }).__wbMinLen))
      .toBeLessThan(splitSectionLabel(contextOutline[1]!.label).title.length); // VB-96

    await context.close();
  });

  test('resuming a saved session does not replay the typewriter over written rows', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, MID_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);

    // Read every label as early as the tree exists. On a resumed session every
    // one of them must already be whole — this is the detail the port is
    // explicitly required to preserve, and the only way to catch it failing is
    // to look before any animation would have had time to finish.
    await page.waitForSelector('.filetree-row');
    const labels = await page.locator('.filetree-row[data-node-id] .filetree-label').allTextContents();
    expect(labels).toHaveLength(contextOutline.length);
    for (const [i, node] of contextOutline.entries()) {
      expect(labels[i]!.startsWith(splitSectionLabel(node.label).title), `"${labels[i]}" should already be the whole title of "${node.label}"`).toBe(true); // VB-96
    }

    await context.close();
  });

  test('prefers-reduced-motion: every state still reads, with nothing animating', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, MID_MODULE.id));
    const page = await openPanel(context, id);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
    await enterInterview(page);
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await openDrawer(page);

    // V2.0 VB-56 — THE BLINKING CURSOR IS GONE, at every motion preference.
    // This used to assert that reduced motion left it still and visible; there
    // is nothing left to keep still, and the live row is still marked by the
    // ring below, which is the cue that was always doing the work.
    await expect(page.locator('.filetree-cursor')).toHaveCount(0);
    await expect(page.locator('.filedrawer')).not.toContainText('▋');

    // All three states still say what they are, in words and in marks.
    for (const [life, marks, word] of [
      ['live', 1, S.fileTreeStateCurrent],
      ['lit', 1, S.fileTreeStateReached],
      ['dim', 0, S.fileTreeStateUntouched],
    ] as const) {
      const row = page.locator(`.filetree-row[data-life="${life}"]`).first();
      await expect(row.locator('.filetree-mark')).toHaveCount(marks);
      await expect(row.locator('.filetree-srstate')).toHaveText(word);
    }

    // V1.8 VB-46 — THE LIVE ROW WITHOUT ITS PULSE. The ring stays, still and
    // at full strength, so the live area is still marked by a shape nothing
    // else on the list wears. The instruction survives the animation being
    // removed, which is what docs/GUARDRAILS.md asks for.
    const live = page.locator('.filetree-row[data-life="live"] .filetree-glyph').first();
    const ring = await live.evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      return { animationName: after.animationName, opacity: after.opacity, width: after.width, shadow: getComputedStyle(el).boxShadow };
    });
    expect(ring.animationName).toBe('none');
    expect(Number(ring.opacity)).toBe(1);
    expect(parseFloat(ring.width)).toBeGreaterThan(0);
    expect(ring.shadow).not.toBe('none');

    // Labels are whole, not mid-print, and no preview section is animating.
    const labels = await page.locator('.filetree-row[data-node-id] .filetree-label').allTextContents();
    for (const [i, node] of contextOutline.entries()) expect(labels[i]!.startsWith(splitSectionLabel(node.label).title)).toBe(true); // VB-96
    const previewAnimations = await page
      .locator('.filepreview-section')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).animationName));
    expect(previewAnimations.every((a) => a === 'none')).toBe(true);

    await context.close();
  });
});

test.describe('VB-07b — the live file text', () => {
  test('the previewed text is byte-identical to what Download produces', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = answersUpToModule(contextModules, MID_MODULE.id);
    seeded.repeatables.roles = [{ role_name: 'Team lead', role_for: 'My team' }];
    await seedAnswers(sw, seeded);
    const page = await openPanel(context, id);
    await enterInterview(page);
    await openDrawer(page);

    const shown = (await page.locator('.filepreview-section').allTextContents()).join('\n\n');
    const downloaded = generateContextFile(seeded, contextFileDate());
    // The preview shows the sections; the download wraps them in the fixed
    // header and footer. Asserted as containment plus exact section text, not
    // eyeballed: every byte the preview prints is a byte the file has.
    expect(downloaded).toContain(shown);
    expect(shown.length).toBeGreaterThan(0);

    // And section by section, exactly.
    const sections = await page.locator('.filepreview-section').allTextContents();
    for (const section of sections) expect(downloaded).toContain(section);

    await context.close();
  });

  test('a section appears in the preview on the same commit that marks it reached', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, contextModules[1]!.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    await page.getByRole('button', { name: 'Next', exact: true }).click(); // past the transition
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'preferred_name');
    await openDrawer(page);

    const aboutMeHeading = `## ${contextOutline[1]!.label}`;
    await expect(page.locator('.filepreview')).not.toContainText(aboutMeHeading);

    await page.locator('.flow input.field, .flow textarea').first().fill('Ada');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // The tree row and the file text change together.
    await expect(page.locator('.filetree-row[data-node-id="sec2"]')).toHaveAttribute('data-node-state', 'current');
    await expect(page.locator('.filepreview')).toContainText(aboutMeHeading);
    await expect(page.locator('.filepreview')).toContainText('Ada');

    await context.close();
  });

  test('the preview carries its own note, and prints no markup', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, answersUpToModule(contextModules, MID_MODULE.id));
    const page = await openPanel(context, id);
    await enterInterview(page);
    await openDrawer(page);

    // V2.3 VB-98: the note became the disclosure toggle's own label.
    await expect(page.locator('.filepreview-toggle')).toContainText(S.filePreviewNote);
    // Markdown is shown as text, never rendered — a file is text, and this
    // repo renders untrusted-shaped content as text on principle.
    await expect(page.locator('.filepreview-section strong')).toHaveCount(0);
    await expect(page.locator('.filepreview-section h2')).toHaveCount(0);

    await context.close();
  });

  test('nothing in the drawer makes the panel scroll sideways', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = answersUpToModule(contextModules, MID_MODULE.id);
    seeded.values.self_description = 'A single unbroken token: ' + 'x'.repeat(400);
    await seedAnswers(sw, seeded);
    const page = await openPanel(context, id);
    await enterInterview(page);
    await openDrawer(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await context.close();
  });
});
