import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { halfLifeFor } from '../../src/core/freshness/halfLives';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.3 VB-19 — section health in List mode, driven in a real browser.
 *
 * The derivation itself is proved without a browser in
 * src/core/freshness/sectionHealth.test.ts, boundary by boundary. What only a
 * browser can prove is what this file is for:
 *
 * - THE CRITICAL ONE: every state stays readable with colour fully removed.
 *   Asserted twice — once by checking each row carries a non-colour signal,
 *   and once by really stripping colour from the page and re-reading it, so a
 *   future change that moves the distinction into a tint fails here.
 *   **V1.6 VB-33 AND V1.8 VB-45 EACH EXTENDED THAT PASS RATHER THAN REPLACING
 *   IT.** VB-33 turned the row's state marker from bare text into a tile and
 *   the read-back started checking the tile's fill; VB-45 turned the tile into
 *   the Brain visual's own orb, and the read-back now checks the orb's FILL,
 *   the MARK drawn inside it and the RING only the live one wears — as well as
 *   the pill's own word and glyph, and the count VB-46 prints beside them.
 * - That the row still navigates, and that an empty section is still not a
 *   control at all.
 * - That the rows stay in FILE ORDER whatever their status.
 * - That nothing new is written to storage.
 * - That a 400px panel holds the longest real section name beside its pill
 *   without clipping either or scrolling the page sideways.
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

async function seedAnswers(sw: Worker, answers: Answers): Promise<void> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
}

/**
 * One seeded file that puts ALL FIVE states on screen at once.
 *
 * - Module one is answered a year ago. 1. About This Context is on a 365-day
 *   clock, so it is finished and **due**.
 * - Two questions inside 2. About Me are skipped, so it is **partly**.
 * - `entities_gate` is answered "no", which takes the whole entities block out
 *   of the interview, so 3. My World is genuinely finished and **done**.
 * - Nothing in module five is answered, so the interview resumes there and
 *   4. Initiatives is **here**.
 * - Everything after it is **not yet**.
 */
function fiveStateAnswers(): Answers {
  const ago = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();
  const OLD_MODULE = 'orientation';
  const SKIPPED = new Set(['professional_name', 'negative_responsibility']);

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
      if (SKIPPED.has(step.id)) value = null;
      values[key] = value;
      // Comfortably past sec1's own clock, comfortably inside everything else's.
      answeredAt[key] = ago(module.id === OLD_MODULE ? halfLifeFor('sec1') + 30 : 12);
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
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
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
  // settle (FileDrawer.css), during which the drawer's own top edge is still
  // travelling — so anything measured in absolute page coordinates has to wait
  // for it, or it is measuring a drawer mid-flight.
  await expect
    .poll(async () => {
      const first = (await page.locator('.filedrawer').boundingBox())!.y;
      await page.waitForTimeout(60);
      return Math.round(Math.abs((await page.locator('.filedrawer').boundingBox())!.y - first));
    })
    .toBe(0);
  return page;
}

/**
 * V1.8 VB-45 — what the row's ORB has to say without any colour at all, per
 * `sectionLife` state (core/freshness/sectionLife.ts, the same rule the Brain
 * visual reads).
 *
 * VB-33 kept an ASCII tile here precisely because state must survive
 * greyscale; VB-45 replaces the tile with the section's own orb and has to keep
 * that guarantee. Three signals, none of them a hue, and no two states sharing
 * a combination:
 *
 *   ·  FILL — hollow only when nothing is answered.
 *   ·  MARK — a tick when something is, a caret on the one being written,
 *             nothing at all in a hollow one. Drawn, so it is a shape and not
 *             a colour.
 *   ·  RING — only the live one wears one (a spread shadow, not an inset).
 */
const ORB: Record<string, { filled: boolean; mark: 'tick' | 'caret' | null; ring: boolean }> = {
  dim: { filled: false, mark: null, ring: false },
  lit: { filled: true, mark: 'tick', ring: false },
  live: { filled: true, mark: 'caret', ring: true },
};

/** The word and the glyph a state must print, with no colour involved. */
const EXPECTED: Record<string, { glyph: string; word: string }> = {
  here: { glyph: '[>]', word: S.sectionStateHere },
  done: { glyph: '[x]', word: S.sectionStateDone },
  due: { glyph: '[!]', word: S.sectionStateDue },
  partly: { glyph: '[~]', word: S.sectionStatePartly },
  'not-yet': { glyph: '[ ]', word: S.fileTreeStateUntouched },
};

test.describe('VB-19 — five states, derived', () => {
  test('one seeded file puts every state on screen, each with its own words', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const seen: Record<string, string> = {};
    for (const node of contextOutline) {
      const row = page.locator(`.filetree-row[data-node-id="${node.id}"]`);
      const state = (await row.getAttribute('data-health'))!;
      expect(Object.keys(EXPECTED), `${node.id} reported "${state}"`).toContain(state);
      seen[state] = node.id;
    }
    expect(Object.keys(seen).sort()).toEqual(['done', 'due', 'here', 'not-yet', 'partly']);

    await context.close();
  });

  test('every row is distinguishable with no colour at all — the orb and the word carry it', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // 1 — the signals exist, per row, independent of any paint.
    for (const node of contextOutline) {
      const row = page.locator(`.filetree-row[data-node-id="${node.id}"]`);
      const state = (await row.getAttribute('data-health'))!;
      const pill = row.locator('.sectionhealth-pill');
      await expect(pill, node.id).toHaveCount(1);
      await expect(pill.locator('.sectionhealth-glyph'), node.id).toHaveText(EXPECTED[state]!.glyph);
      // The word is the pill's own text, minus the glyph beside it.
      expect((await pill.textContent())!.replace(EXPECTED[state]!.glyph, '').trim(), node.id).toBe(EXPECTED[state]!.word);
    }

    // 2 — and they survive colour actually being taken away. A greyscale
    // filter collapses every tint in the palette; if the only difference
    // between two states were a hue, this is where it would vanish.
    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
    const readBack = await page.locator('.filetree-row[data-node-id]').evaluateAll((els) =>
      els.map((el) => {
        const orb = el.querySelector('.filetree-glyph') as HTMLElement;
        const orbStyle = getComputedStyle(orb);
        const mark = orb.querySelector('.filetree-mark path');
        return {
          id: (el as HTMLElement).dataset.nodeId,
          state: (el as HTMLElement).dataset.health,
          life: (el as HTMLElement).dataset.life,
          text: el.querySelector('.sectionhealth-pill')?.textContent ?? '',
          // Whether the pill is filled or hollow is a third, non-colour signal.
          hollow: (el.querySelector('.sectionhealth-pill') as HTMLElement | null)?.classList.contains('is-hollow') ?? false,
          // ── V1.8 VB-45 — the row's own ORB, which replaced VB-33's ASCII
          // tile. Read as computed style and real geometry rather than as
          // classes, so a rule that stops applying fails here.
          orbBorderStyle: orbStyle.borderTopStyle,
          orbFilled: orbStyle.backgroundColor !== 'rgba(0, 0, 0, 0)',
          // The mark's PATH, so two states sharing one shape is a failure.
          orbMark: mark ? mark.getAttribute('d') : null,
          // A ring around the orb — a spread shadow, told apart from the
          // hairline INSIDE the orb that every filled one carries. The colours
          // are folded out first: `rgb(12, 28, 85)` carries commas of its own,
          // and splitting on those cuts one shadow into three.
          orbRing: orbStyle.boxShadow
            .replace(/rgba?\([^)]*\)/g, 'C')
            .split(',')
            .some((part) => part.trim() !== 'none' && part.trim() !== '' && !part.includes('inset')),
          // And the count and figure the greying is a redundancy for (VB-46).
          count: el.querySelector('.filetree-count')?.textContent ?? '',
          percent: el.querySelector('.filetree-percent')?.textContent ?? '',
        };
      }),
    );
    const marks = new Map<string, string | null>();
    for (const row of readBack) {
      const expected = EXPECTED[row.state!]!;
      expect(row.text, row.id).toContain(expected.glyph);
      expect(row.text, row.id).toContain(expected.word);
      expect(row.hollow, row.id).toBe(row.state === 'not-yet');

      // ── V1.8 VB-45, extending the same proof to the orb that replaced the
      // tile. Fill, mark and ring tell the three states apart with every hue
      // gone: a section with nothing in it is the only hollow, dashed, empty
      // one; the one being written is the only one wearing a ring; and no two
      // states draw the same mark.
      const orb = ORB[row.life!]!;
      expect(Object.keys(ORB), `${row.id} reported life "${row.life}"`).toContain(row.life);
      expect(row.orbFilled, `${row.id} orb fill`).toBe(orb.filled);
      expect(row.orbBorderStyle === 'dashed', `${row.id} orb outline`).toBe(!orb.filled);
      expect(row.orbMark === null, `${row.id} orb mark`).toBe(orb.mark === null);
      expect(row.orbRing, `${row.id} orb ring`).toBe(orb.ring);
      if (marks.has(row.life!)) expect(row.orbMark, `${row.id} mark`).toBe(marks.get(row.life!));
      marks.set(row.life!, row.orbMark);

      // VB-46: the greying is never the only way to know a row is at zero —
      // the count says it in figures too.
      expect(row.count, row.id).toMatch(/^\d+ of \d+$/);
      if (row.life === 'dim') expect(row.count, row.id).toMatch(/^0 of /);
    }
    // All three treatments really are on screen — otherwise the assertions
    // above are vacuously true on a file where every row is the same state.
    expect(new Set(readBack.map((row) => row.life)).size).toBe(3);
    // …and the three marks really are three different shapes.
    expect(new Set([...marks.values()]).size).toBe(3);

    // Every pill is still legible after the filter — none of them went
    // transparent-on-transparent.
    for (const pill of await page.locator('.filetree-row .sectionhealth-pill').all()) {
      await expect(pill).toBeVisible();
    }

    // And so is every percentage: VB-33's one new number must not be the thing
    // that only reads in colour either.
    for (const percent of await page.locator('.filetree-row .filetree-percent').all()) {
      await expect(percent).toBeVisible();
      await expect(percent).toHaveText(/^\d+% /);
    }

    await context.close();
  });

  /**
   * V1.8 VB-46 moved the count out of this line and into the bundle at the
   * row's right end, so what is left of the line is the one clause neither the
   * pill nor the figures can carry.
   */
  test('the detail line says what the pill and the figures cannot', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // A finished, aged section reports how long ago, and counts at the right.
    const due = page.locator('.filetree-row[data-health="due"]').first();
    await expect(due.locator('.filetree-detail')).toHaveText(/^answered .+ ago$/);
    await expect(due.locator('.filetree-count')).toHaveText(/^\d+ of \d+$/);

    // A part-done one reports what was passed on instead.
    const partly = page.locator('.filetree-row[data-health="partly"]').first();
    await expect(partly.locator('.filetree-detail')).toHaveText(/^\d+ skipped$/);

    // A section nobody has touched has nothing to date — and now says so in
    // figures, which is VB-46 overruling VB-19's suppression of the 0-state:
    // "A row at 0 of X is greyed out, showing 0%."
    const notYet = page.locator('.filetree-row[data-health="not-yet"]').first();
    await expect(notYet.locator('.filetree-detail')).toHaveCount(0);
    await expect(notYet.locator('.filetree-count')).toHaveText(/^0 of \d+$/);
    await expect(notYet.locator('.filetree-percent')).toHaveText(`0% ${S.sectionPercentComplete}`);
    await expect(notYet).toHaveAttribute('data-life', 'dim');

    await context.close();
  });

  test('the whole meta line reaches a screen reader — it is the row control\'s description', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const row = page.locator('.filetree-row[data-health="due"]').first();
    const nav = row.locator('.filetree-nav');
    const describedBy = await nav.getAttribute('aria-describedby');
    expect(describedBy, 'a row with a detail line must describe its control with it').toBeTruthy();
    // V1.6 VB-33 put a second fact on this line — the percentage — so the
    // description is the WRAPPER around both, not the count alone. Bound to
    // half the line, the new number would reach the screen and not the screen
    // reader. An attribute selector, not `#id`: React's `useId` mints ids like
    // `:r1:`, which are legal HTML ids and illegal CSS selectors.
    const described = page.locator(`[id="${describedBy}"]`);
    await expect(described).toHaveClass(/filetree-meta/);
    const detailText = (await row.locator('.filetree-detail').textContent())!;
    const countText = (await row.locator('.filetree-count').textContent())!;
    const percentText = (await row.locator('.filetree-percent').textContent())!;
    // V1.8 VB-46 put a third fact on the line — the count, moved out of the
    // clause and into the bundle — and the description is still the WHOLE of
    // it rather than any one part.
    await expect(described).toHaveText(detailText + countText + percentText);
    // And the figure names itself, for anyone who meets it without the count.
    expect(percentText).toMatch(new RegExp(`^\\d+% ${S.sectionPercentComplete}$`));

    await context.close();
  });

  test('nothing about health is stored — it is recomputed from the answers alone', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = fiveStateAnswers();
    await seedAnswers(sw, seeded);
    const page = await openList(context, id);
    await page.waitForSelector('.sectionhealth-pill');

    const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)));
    expect(keys.filter((k) => /health|stale|due|fresh|summary/i.test(k))).toEqual([]);
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'] as Answers);
    expect(stored).toEqual(seeded);

    await context.close();
  });

  test('answering a question changes its section\'s health on the same commit', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // 4. Initiatives is where the interview is, and its gate is on screen.
    const initiatives = page.locator('.filetree-row[data-node-id="sec4"]');
    await expect(initiatives).toHaveAttribute('data-health', 'here');
    // V1.8 VB-46: the count lives in the bundle at the right end now, and the
    // section being worked on is live whatever it reads.
    await expect(initiatives.locator('.filetree-count')).toHaveText(S.sectionAnsweredOf(0, 1));
    await expect(initiatives).toHaveAttribute('data-life', 'live');

    // Answering "no" finishes the section outright: the gate is the only
    // question it asks once the block behind it is closed. Picking and then
    // committing, in two acts — docs/GUARDRAILS.md rules out auto-advance.
    await page.getByRole('button', { name: S.no, exact: true }).click();
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(initiatives).toHaveAttribute('data-health', 'done');
    await expect(initiatives.locator('.sectionhealth-pill')).toContainText(S.sectionStateDone);

    // The panel is now on the next module's transition screen, where no
    // question is being asked — so nothing is "here", correctly, because
    // "here" is derived from the live question and there isn't one.
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'module-intro');
    await expect(page.locator('.filetree-row[data-health="here"]')).toHaveCount(0);

    // Continuing into the module hands "here" to the section that module
    // writes, and the one just finished keeps its "Done".
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.filetree-row[data-health="here"]')).toHaveCount(1);
    await expect(initiatives).toHaveAttribute('data-health', 'done');

    await context.close();
  });
});

test.describe('VB-19 — the list is still the file', () => {
  test('rows stay in file order, whatever their status', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const ids = await page
      .locator('.filetree-row[data-node-id]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.nodeId));
    // Top-level rows, in the order the outline lists them — a due section
    // does not jump to the top.
    expect(ids.filter((rowId) => contextOutline.some((node) => node.id === rowId))).toEqual(
      contextOutline.map((node) => node.id),
    );

    await context.close();
  });

  test('an empty section is still not clickable, pill or no pill', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const notYet = page.locator('.filetree-row[data-health="not-yet"]');
    expect(await notYet.count()).toBeGreaterThan(0);
    for (const row of await notYet.all()) {
      await expect(row.locator('.filetree-nav')).toHaveCount(0);
      await expect(row.locator('button')).toHaveCount(0);
      // Its pill is text, not a control.
      await expect(row.locator('.sectionhealth-pill button, .sectionhealth-pill a')).toHaveCount(0);
    }

    // Clicking one changes nothing.
    const stepId = await page.locator('.flow').getAttribute('data-step-id');
    await notYet.first().locator('.filetree-label').click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', stepId!);

    await context.close();
  });

  test('a row with health still navigates to its section', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    await page.locator('.filetree-row[data-node-id="sec1"] .filetree-nav').click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', contextOutline[0]!.questionIds[0]!);

    await context.close();
  });
});

test.describe('VB-19 — the counts across the top', () => {
  test('they agree with the rows underneath them', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const counted: Record<string, number> = {};
    for (const node of contextOutline) {
      const state = (await page.locator(`.filetree-row[data-node-id="${node.id}"]`).getAttribute('data-health'))!;
      counted[state] = (counted[state] ?? 0) + 1;
    }

    const summary = page.locator('.sectionhealth-summary');
    await expect(summary).toBeVisible();
    await expect(summary.locator('[data-health-summary="due"]')).toHaveText(new RegExp(`${counted.due}\\s*due`));
    await expect(summary.locator('[data-health-summary="partly"]')).toHaveText(new RegExp(`${counted.partly}\\s*partly`));
    await expect(summary.locator('[data-health-summary="not-yet"]')).toHaveText(new RegExp(`${counted['not-yet']}\\s*not yet`));

    await context.close();
  });

  test('they stay put while the list scrolls under them', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const summary = page.locator('.sectionhealth-summary');
    // From the top of the list. The drawer opens scrolled to whatever section
    // is being written (FileDrawer.tsx), so "before" has to be a known place.
    await page.locator('.filedrawer-body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(80);
    const before = (await summary.boundingBox())!;

    // Scrolled several rows down the tree — the range the summary is a
    // summary OF. It is pinned within the tree, so it does travel out with
    // the tree's own bottom edge once the file text below has taken the
    // screen; that is exactly what a section-scoped sticky heading does.
    const rowsMoved = await page.evaluate(() => {
      const box = document.querySelector('.filedrawer-body') as HTMLElement;
      const first = document.querySelector('.filetree-row[data-node-id]') as HTMLElement;
      const before = first.getBoundingClientRect().top;
      box.scrollTop += 160;
      return before - first.getBoundingClientRect().top;
    });
    expect(rowsMoved, 'the rows really did move under it').toBeGreaterThan(100);
    await page.waitForTimeout(120);
    const after = (await summary.boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    await expect(summary).toBeVisible();

    await context.close();
  });
});

test.describe('VB-19 — it fits a 400px panel', () => {
  test('the longest real section name sits beside its pill without clipping either', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // Whatever the longest label in the shipped outline actually is — the
    // point is that the data decides, not a hard-coded string.
    const longest = [...contextOutline].sort((a, b) => b.label.length - a.label.length)[0]!;
    const row = page.locator(`.filetree-row[data-node-id="${longest.id}"]`);
    await row.scrollIntoViewIfNeeded();

    const geometry = await row.evaluate((el) => {
      const label = el.querySelector('.filetree-label') as HTMLElement;
      const pill = el.querySelector('.sectionhealth-pill') as HTMLElement;
      const rowBox = el.getBoundingClientRect();
      return {
        label: label.getBoundingClientRect(),
        pill: pill.getBoundingClientRect(),
        row: rowBox,
        labelClipped: label.scrollWidth > label.clientWidth + 1,
        pillClipped: pill.scrollWidth > pill.clientWidth + 1,
      };
    });

    expect(geometry.labelClipped, `"${longest.label}" is clipped`).toBe(false);
    expect(geometry.pillClipped, 'the pill is clipped').toBe(false);
    // The name ends before the pill starts — they never overlap.
    expect(geometry.label.right).toBeLessThanOrEqual(geometry.pill.left + 1);
    // And both are inside the row.
    expect(geometry.pill.right).toBeLessThanOrEqual(geometry.row.right + 1);

    await context.close();
  });

  test('the glyph column keeps the box the mode morph measures it by', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // core/drawer/mode.ts's `endOf` sizes a flying node from
    // `min(width, height) / 2` of the row marker it lands on. Letting the
    // glyph's box grow to the row's own height — the obvious way to align it
    // once a row has two lines in it — would silently double every landing
    // dot. This is that coupling, written down where a future layout change
    // will trip over it.
    const boxes = await page
      .locator('.filetree-row[data-node-id] .filetree-glyph')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    expect(boxes.length).toBeGreaterThan(0);
    for (const height of boxes) expect(height).toBeLessThan(20);

    await context.close();
  });

  test('nothing about health makes the panel scroll sideways', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await context.close();
  });

  test('a row that reports its health is no taller than one that does not', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const heights = await page
      .locator('.filetree-row[data-node-id]')
      .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
    // Every row is the 44px control band and nothing more: putting the detail
    // line inside the control rather than under it is what buys that, and
    // losing it would halve what the drawer's default peek can show.
    expect([...new Set(heights)]).toEqual([44]);

    await context.close();
  });
});
