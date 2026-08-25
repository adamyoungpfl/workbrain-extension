import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules, contextOutline } from '../../src/core/flow/flow';
import { halfLifeFor } from '../../src/core/freshness/halfLives';
import { sectionCompletionPercent, sectionHealthMap } from '../../src/core/freshness/sectionHealth';
import { splitSectionLabel } from '../../src/core/flow/sectionLabel';
import { S } from '../../src/panel/strings';
import type { AnswerValue, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.6 VB-33 — List mode as a modern accordion, driven in a real browser.
 *
 * WHAT IS AND IS NOT NEW HERE. The derivation under this restyle already
 * shipped: VB-19's `core/freshness/sectionHealth` computes the five states, the
 * counts and the staleness, and VB-07's accordion already opened one section at
 * a time and followed the active one. Both are proved where they live —
 * `sectionHealth.test.ts`, `FileTree.test.tsx`, `section-health.spec.ts` — and
 * this file does not restate them. What it covers is what the restyle is
 * actually accountable for, and what only a browser can answer:
 *
 *  - THE PERCENTAGE the rows now print, checked against the same pure function
 *    the panel calls rather than against a hard-coded number, and checked for
 *    being one per section and never a total anywhere.
 *  - THAT EVERY ROW SAYS ALL FOUR THINGS: count, percentage, freshness, state.
 *  - THAT THE ACCORDION STILL WORKS — collapse, expand, one at a time, and
 *    still following the section being answered when that moves.
 *  - THAT IT IS LEGIBLE AT 400px: nothing clipped, nothing truncated, nothing
 *    overlapping, no sideways scroll, and every row still one 44px band.
 *  - THAT THE SHAPE IS REALLY A RESTYLE — measured computed styles, never a
 *    class name, because a class that stopped matching a rule would still be
 *    on the element.
 *
 * The greyscale proof lives in `section-health.spec.ts`, extended there rather
 * than copied here, so there is one place that says "colour is never the only
 * signal" and it is the place that already said it.
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
 * The same seeded file `section-health.spec.ts` uses, so both specs describe
 * one screen: module one answered a year ago (due), two questions skipped
 * inside 2. About Me (partly), the entities gate closed so 3. My World finishes
 * (done), the interview resuming at 4. Initiatives (here), and everything after
 * it untouched (not yet). Five states, one file, several real percentages.
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
      answeredAt[key] = ago(module.id === OLD_MODULE ? halfLifeFor('sec1') + 30 : 12);
      if (typeof value === 'string') reflectedAt[key] = answeredAt[key]!;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

/**
 * THE WIDEST ROW THE SHIPPED FLOW CAN PRODUCE: every question answered, every
 * gate open, five records in every repeatable block, and the whole thing
 * written nearly a year ago. That gives two-digit counts on both sides of the
 * "of" and the longest freshness phrase `agoLabel` produces — "11 months" —
 * which together are the meta line a 400px column has to survive.
 *
 * Built by walking the real modules rather than by listing ids, so a flow that
 * grows a block or a field widens this fixture with it instead of leaving the
 * test measuring a shape the product no longer has.
 */
function everythingAnsweredLongAgo(): Answers {
  const stamp = new Date(Date.now() - 340 * DAY_MS).toISOString();
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  const answerFor = (step: Step): AnswerValue => {
    if (step.kind === 'intro') return null;
    // Yes on every gate, so no block is taken out of the count.
    if (step.kind === 'yesno') return 'yes';
    if (step.kind === 'chips') return step.options?.[0]?.v ?? 'x';
    if (step.kind === 'multi') return step.options?.length ? [step.options[0]!.v] : ['x'];
    return `A test answer for ${step.id}.`;
  };

  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        repeatables[node.id] = Array.from({ length: 5 }, (_unused, index) => {
          const record: Record<string, AnswerValue> = {};
          for (const field of node.fields) {
            const key = field.outKey ?? field.key ?? field.id;
            record[key] = answerFor(field);
            answeredAt[`${node.id}#${index}#${key}`] = stamp;
          }
          return record;
        });
        continue;
      }
      const key = node.outKey ?? node.key ?? node.id;
      const value = answerFor(node);
      values[key] = value;
      answeredAt[key] = stamp;
      if (typeof value === 'string') reflectedAt[key] = stamp;
    }
  }
  // A seeded block needs its seed question to have as many names as records.
  values.role_names = ['One', 'Two', 'Three', 'Four', 'Five'];
  return { values, repeatables, answeredAt, reflectedAt };
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
  // settle (FileDrawer.css), so anything measured in page coordinates has to
  // wait for the drawer's own top edge to stop travelling.
  await expect
    .poll(async () => {
      const first = (await page.locator('.filedrawer').boundingBox())!.y;
      await page.waitForTimeout(60);
      return Math.round(Math.abs((await page.locator('.filedrawer').boundingBox())!.y - first));
    })
    .toBe(0);
  return page;
}

/** What the panel should be printing, computed the way the panel computes it —
 * from the same seeded answers, through the same pure functions. A hard-coded
 * table here would only prove that two people typed the same number. */
function expectedHealth(answers: Answers) {
  return sectionHealthMap(contextOutline, contextModules, answers, null, new Date());
}

test.describe('VB-33 — a section row says all four things', () => {
  test('count, percentage, freshness and state, on every row that has any', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = fiveStateAnswers();
    await seedAnswers(sw, seeded);
    const page = await openList(context, id);
    const health = expectedHealth(seeded);

    let withFreshness = 0;
    for (const node of contextOutline) {
      const row = page.locator(`.filetree-row[data-node-id="${node.id}"]`);
      const state = (await row.getAttribute('data-health'))!;
      const expected = health[node.id]!;

      // STATE — always, as a word in the pill, whatever else the row says.
      await expect(row.locator('.sectionhealth-pill'), node.id).toHaveCount(1);

      // COUNT — VB-19's, moved to the bundle at the right end by V1.8 VB-46,
      // and now printed on EVERY row including the ones at zero.
      await expect(row.locator('.filetree-count'), node.id).toHaveText(
        S.sectionAnsweredOf(expected.answered, expected.total),
      );

      // PERCENTAGE — VB-33's one new number, and it is the ratio of the two
      // counts printed beside it and nothing else.
      const percent = sectionCompletionPercent(expected)!;
      await expect(row.locator('.filetree-percent'), node.id).toHaveText(
        `${S.sectionPercent(percent)} ${S.sectionPercentComplete}`,
      );

      // FRESHNESS — the one clause the bundle cannot carry, and only where
      // there is one. A section with nothing recorded in it has nothing to
      // date, and a part-done one reports what was passed on instead, which is
      // VB-19's "one clause after the count".
      if (state === 'not-yet') {
        await expect(row.locator('.filetree-detail'), node.id).toHaveCount(0);
        continue;
      }
      if ((await row.locator('.filetree-detail').count()) === 0) continue;
      const detail = (await row.locator('.filetree-detail').textContent())!;
      if (/answered/.test(detail)) withFreshness++;
    }
    expect(withFreshness, 'at least one row reports how long ago it was written').toBeGreaterThan(0);

    await context.close();
  });

  test('the percentage agrees with the count beside it, row by row', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = fiveStateAnswers();
    await seedAnswers(sw, seeded);
    const page = await openList(context, id);

    // Read the two numbers off the screen and do the arithmetic here, so the
    // row is checked against itself rather than against the code that drew it.
    const rows = await page.locator('.filetree-row[data-node-id]').evaluateAll((els) =>
      els
        .filter((el) => el.querySelector('.filetree-percent'))
        .map((el) => ({
          id: (el as HTMLElement).dataset.nodeId,
          count: el.querySelector('.filetree-count')!.textContent ?? '',
          percent: el.querySelector('.filetree-percent')!.textContent ?? '',
        })),
    );
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      const [answered, total] = row.count.match(/^(\d+) of (\d+)/)!.slice(1).map(Number) as [number, number];
      const shown = Number(row.percent.match(/^(\d+)%/)![1]);
      expect(shown, `${row.id}: ${row.count} / ${row.percent}`).toBe(sectionCompletionPercent({ answered, total }));
      // The two honest edges: 100 only when finished, 0 only when empty.
      if (shown === 100) expect(answered, row.id).toBe(total);
      if (shown === 0) expect(answered, row.id).toBe(0);
    }

    await context.close();
  });

  test('no composite score anywhere — the percentages are per section and never summed', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // Every percentage on screen belongs to exactly one section row. V1.9
    // VB-52 put the breadcrumb above the list, where VB-19's counts used to be
    // and where V1.8's file strip briefly was — if a file-level figure ever
    // appeared there, this is where it would show. The trail carries a count of
    // SECTIONS (`3/10`, and that is a count, not a score); what it must never
    // grow is a percentage of the whole file.
    const all = await page.locator('.filetree .filetree-percent').count();
    const inRows = await page.locator('.filetree-row[data-node-id] .filetree-percent').count();
    expect(all).toBe(inRows);
    await expect(page.locator('.crumbs')).not.toContainText('%');

    await context.close();
  });
});

test.describe('VB-33 — the sections collapse and expand', () => {
  test('a section opens to its sub-sections and closes again, from the chevron alone', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const toggle = page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle');
    const child = page.locator('.filetree-row[data-node-id="sec2-1"]');

    if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
    await expect(child).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(child).toHaveCount(1);
    // Every sub-section, not just the first.
    const children = contextOutline.find((node) => node.id === 'sec2')!.children!;
    await expect(page.locator('.filetree-row.is-child')).toHaveCount(children.length);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(child).toHaveCount(0);

    await context.close();
  });

  test('the chevron is a real 44px target at the far edge, and it turns', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const row = page.locator('.filetree-row[data-node-id="sec2"]');
    const toggle = row.locator('.filetree-toggle');
    const box = (await toggle.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    // Hard right: nothing in the row starts after it.
    const rowBox = (await row.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    expect(box.x).toBeGreaterThan(rowBox.x + rowBox.width / 2);

    // The turn is real rotation, not two icons swapped.
    const closedIsOpen = (await toggle.getAttribute('aria-expanded')) === 'true';
    if (closedIsOpen) await toggle.click();
    const closed = await row.locator('.filetree-chevron').evaluate((el) => getComputedStyle(el).transform);
    await toggle.click();
    await expect(row.locator('.filetree-chevron')).toHaveClass(/is-open/);
    await page.waitForTimeout(260);
    const open = await row.locator('.filetree-chevron').evaluate((el) => getComputedStyle(el).transform);
    expect(open).not.toBe(closed);

    await context.close();
  });

  test('the accordion still follows the section being answered when that moves', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // Opening a different section overrides the default...
    const sec2 = page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle');
    if ((await sec2.getAttribute('aria-expanded')) !== 'true') await sec2.click();
    await expect(sec2).toHaveAttribute('aria-expanded', 'true');

    // ...until the active section itself moves on. The interview is standing
    // in 4. Initiatives; answering its gate finishes it and walks into the
    // next module, whose section is 5. How I Think — which has no children, so
    // what the override is dropped in favour of is "nothing open".
    await page.getByRole('button', { name: S.no, exact: true }).click();
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await page.getByRole('button', { name: S.next, exact: true }).click();
    await expect(page.locator('.filetree-row[data-health="here"]')).toHaveCount(1);
    await expect(page.locator('.filetree-toggle[aria-expanded="true"]')).toHaveCount(0);
    await expect(page.locator('.filetree-row.is-child')).toHaveCount(0);

    await context.close();
  });

  test('one section is open at a time', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const withChildren = contextOutline.filter((node) => (node.children ?? []).length > 0);
    expect(withChildren.length).toBeGreaterThan(0);
    for (const node of withChildren) {
      await page.locator(`.filetree-row[data-node-id="${node.id}"] .filetree-toggle`).click();
      await expect(page.locator('.filetree-toggle[aria-expanded="true"]')).toHaveCount(1);
    }

    await context.close();
  });
});

test.describe('VB-33 — the restyle is real, and it fits 400px', () => {
  test('the row is a band with a hairline under it, not a card in a box', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const shape = await page.locator('.filetree > .filetree-list > .filetree-item').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        const row = getComputedStyle(el.querySelector('.filetree-row') as HTMLElement);
        return {
          borderBottom: s.borderBottomStyle === 'none' ? 0 : parseFloat(s.borderBottomWidth),
          rowBorder: row.borderTopStyle === 'none' ? 0 : parseFloat(row.borderTopWidth),
          rowBackground: row.backgroundColor,
        };
      }),
    );
    expect(shape.length).toBe(contextOutline.length);
    for (const [i, item] of shape.entries()) {
      // A hairline under every section but the last, and nothing else drawing.
      expect(item.borderBottom, `item ${i}`).toBe(i === shape.length - 1 ? 0 : 1);
      expect(item.rowBorder, `item ${i}`).toBe(0);
      expect(item.rowBackground, `item ${i}`).toBe('rgba(0, 0, 0, 0)');
    }

    await context.close();
  });

  test('an open section\'s children belong to the row above — by indent and a rule, not a card', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    /**
     * VB-33 drew these as light rounded cards on the near-white ground, and
     * called that "the one place a box earns its keep — it says 'these belong
     * to the row above' without a second rule competing with the hairlines".
     *
     * **V1.9 VB-50 reverses the box and keeps the sentence.** The drawer is one
     * colour from its top edge to the bottom of the panel now, so a filled card
     * inside it is exactly the "controls sitting on a surface" that task removes.
     * What says the same thing instead is what always said most of it: the
     * indent, plus a rule down the left of the group. So this test asserts the
     * MEANING VB-33 was buying — these rows are visibly subordinate to the one
     * above them — rather than the card it bought it with.
     *
     * It is written as an assertion that the ground is gone, not merely that a
     * card is optional: a fill creeping back is the regression worth catching.
     */
    const toggle = page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(page.locator('.filetree-row.is-child').first()).toBeVisible();

    const children = await page.locator('.filetree-row.is-child').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          background: s.backgroundColor,
          shadow: s.boxShadow,
          indent: parseFloat(s.marginLeft),
        };
      }),
    );
    expect(children.length).toBeGreaterThan(0);
    for (const child of children) {
      // No ground of its own — the whole of VB-50, said about this one box.
      expect(child.background, 'a child row has a ground again').toBe('rgba(0, 0, 0, 0)');
      // The rule that replaced it, down the left.
      expect(child.shadow, 'a child row has nothing marking it as one').not.toBe('none');
      // And the indent VB-33 already had, untouched.
      expect(child.indent).toBeGreaterThan(0);
    }

    await context.close();
  });

  test('the section name is the loud thing and its number is the quiet one', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    for (const node of contextOutline) {
      const label = page.locator(`.filetree-row[data-node-id="${node.id}"] .filetree-label`);
      // The label still prints the section's real title, whole. `startsWith`,
      // not equality: the section being written also carries the terminal
      // cursor VB-07 put after its name, which is not part of the label.
      expect((await label.textContent())!.startsWith(node.label), node.id).toBe(true);
      const set = await label.evaluate((el) => {
        const num = el.querySelector('.filetree-num') as HTMLElement;
        return {
          numeral: num.textContent,
          numWeight: Number(getComputedStyle(num).fontWeight),
          titleWeight: Number(getComputedStyle(el).fontWeight),
          family: getComputedStyle(el).fontFamily,
        };
      });
      expect(set.numeral, node.id).toBe(splitSectionLabel(node.label).numeral);
      expect(set.numWeight, node.id).toBeLessThan(set.titleWeight);
      // The register really changed: a section's name is no longer monospace.
      expect(set.family.toLowerCase(), node.id).not.toContain('mono');
    }

    await context.close();
  });

  test('every row is still one 44px band, and nothing in it is clipped or overlapping', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const toggle = page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(page.locator('.filetree-row.is-child').first()).toBeVisible();

    const rows = await page.locator('.filetree-row[data-node-id]').evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect();
        const pick = (sel: string) => {
          const found = el.querySelector(sel) as HTMLElement | null;
          return found ? { ...found.getBoundingClientRect().toJSON(), clipped: found.scrollWidth > found.clientWidth + 1 } : null;
        };
        return {
          id: (el as HTMLElement).dataset.nodeId,
          height: Math.round(box.height),
          right: box.right,
          left: box.left,
          label: pick('.filetree-label'),
          meta: pick('.filetree-meta'),
          detail: pick('.filetree-detail'),
          percent: pick('.filetree-percent'),
          pill: pick('.sectionhealth-pill'),
        };
      }),
    );

    expect(rows.length).toBeGreaterThan(contextOutline.length);
    for (const row of rows) {
      // Exactly the 44px control band, whether or not the row reports health.
      // Losing this halves what the drawer's default peek can show.
      expect(row.height, row.id).toBe(44);
      expect(row.label!.clipped, `${row.id} name clipped`).toBe(false);
      expect(row.pill!.clipped, `${row.id} pill clipped`).toBe(false);
      expect(row.pill!.right, `${row.id} pill outside the row`).toBeLessThanOrEqual(row.right + 1);
      expect(row.label!.left, `${row.id} name outside the row`).toBeGreaterThanOrEqual(row.left - 1);
      if (row.detail) {
        // THE ONE THAT MATTERS AT 400px: the meta line is set to ellipsis so a
        // long one can never push the row out of its band — which means a
        // truncated meta line is silent. On the shipped flow's own longest
        // content, nothing may be truncated.
        expect(row.detail.clipped, `${row.id} meta line truncated`).toBe(false);
        expect(row.percent!.clipped, `${row.id} percentage truncated`).toBe(false);
        // The count ends before the figure starts.
        expect(row.detail.right, `${row.id} count runs into the figure`).toBeLessThanOrEqual(row.percent!.left + 1);
        // And the pill CLEARS THE META LINE VERTICALLY. The meta line runs the
        // full width, under the pill's column — that is what buys it the room
        // the percentage needed (FileTree.css's `.filetree-main`) — so the two
        // are kept apart by the pill sitting on the name's line, not by the
        // meta line stopping short. If that ever slips, the count and the
        // status word print on top of each other.
        expect(row.pill!.bottom, `${row.id} pill sits across the meta line`).toBeLessThanOrEqual(row.meta!.top + 1);
        expect(row.pill!.right, `${row.id} pill outside the row`).toBeLessThanOrEqual(row.right + 1);
        expect(row.meta!.right, `${row.id} meta line outside the row`).toBeLessThanOrEqual(row.right + 1);
      }
    }

    await context.close();
  });

  test('the widest row the flow can produce still fits the column, unabbreviated', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, everythingAnsweredLongAgo());
    const page = await openList(context, id);

    // Open every section that has children, one after another, so the child
    // cards — the narrowest column in the list — are measured too.
    const parents = contextOutline.filter((node) => (node.children ?? []).length > 0);
    const widest: { id: string; text: string; width: number }[] = [];
    for (const parent of [null, ...parents]) {
      if (parent) {
        // Only if it is not already the one open — the accordion defaults to
        // whichever section is being answered, and clicking that one shuts it.
        const toggle = page.locator(`.filetree-row[data-node-id="${parent.id}"] .filetree-toggle`);
        if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
        await expect(page.locator('.filetree-row.is-child').first()).toBeVisible();
      }
      const rows = await page.locator('.filetree-row[data-node-id]').evaluateAll((els) =>
        els
          .map((el) => {
            const detail = el.querySelector('.filetree-detail') as HTMLElement | null;
            const count = el.querySelector('.filetree-count') as HTMLElement | null;
            const percent = el.querySelector('.filetree-percent') as HTMLElement | null;
            if (!detail || !count || !percent) return null;
            const over = (node: HTMLElement) => node.scrollWidth > node.clientWidth + 1;
            return {
              id: (el as HTMLElement).dataset.nodeId!,
              text: `${detail.textContent} ${count.textContent} ${percent.textContent}`,
              width: detail.scrollWidth,
              height: Math.round(el.getBoundingClientRect().height),
              clipped: over(detail) || over(count) || over(percent),
            };
          })
          .filter((row): row is NonNullable<typeof row> => row !== null),
      );
      for (const row of rows) {
        expect(row.clipped, `${row.id}: "${row.text}" does not fit`).toBe(false);
        expect(row.height, `${row.id} left its 44px band`).toBe(44);
        widest.push(row);
      }
    }

    // The fixture really did produce the hard case — two-digit counts and the
    // longest freshness phrase — rather than passing on short strings.
    const all = widest.map((row) => row.text).join(' | ');
    expect(all, 'the fixture never reached a two-digit count').toMatch(/\d\d of \d\d/);
    expect(all, 'the fixture never reached a months-old section').toMatch(/answered \d+ months ago/);

    await context.close();
  });

  test('nothing about the restyle makes the panel scroll sideways', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    const toggle = page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(page.locator('.filetree-row.is-child').first()).toBeVisible();

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
    expect(
      await page.locator('.filedrawer-body').evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(0);

    await context.close();
  });

  test('the marker keeps the small box the mode morph sizes a flying node from', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // VB-33 grew this from bare text into a tile on purpose — it is where
    // VB-32 wants an orb to land — but `core/drawer/mode.ts`'s `endOf` sizes
    // every flight from `min(width, height) / 2` of it, so it stays roughly orb
    // sized and never the row's own height.
    const boxes = await page
      .locator('.filetree-row[data-node-id] .filetree-glyph')
      .evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect();
          const row = (el.parentElement as HTMLElement).getBoundingClientRect();
          return { w: Math.round(box.width), h: Math.round(box.height), fromLeft: Math.round(box.left - row.left) };
        }),
      );
    expect(boxes.length).toBe(contextOutline.length);
    for (const box of boxes) {
      expect(box.h).toBeGreaterThanOrEqual(12);
      expect(box.h).toBeLessThan(20);
      expect(box.w).toBeLessThan(32);
      // At the row's left edge, which is the half of "it becomes the row's own
      // marker" that this file can assert on its own.
      expect(box.fromLeft).toBeLessThan(8);
    }

    await context.close();
  });

  test('reduced motion: the same rows, the same four facts, nothing animating', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await context.newPage();
    await page.setViewportSize({ width: 400, height: 760 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
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
    await page.waitForTimeout(400);

    // The chevron still points somewhere and the marker still has its fill;
    // they simply arrive rather than travel. The instruction survives the
    // animation being removed, which is what docs/GUARDRAILS.md asks for.
    const toggle = page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle');
    const still = await page.locator('.filetree-row[data-node-id="sec2"] .filetree-chevron').evaluate((el) => ({
      transition: getComputedStyle(el).transitionDuration,
      transform: getComputedStyle(el).transform,
    }));
    expect(still.transition).toBe('0s');
    expect(still.transform).not.toBe('none');
    expect(
      await page.locator('.filetree-row[data-node-id="sec1"] .filetree-glyph').evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe('0s');

    // And it still opens.
    await toggle.click();
    await expect(page.locator('.filetree-row[data-node-id="sec2-1"]')).toHaveCount(1);
    await expect(page.locator('.filetree-row[data-node-id="sec2-1"] .filetree-percent')).toHaveCount(1);

    await context.close();
  });

  test('the whole accordion is reachable and workable from the keyboard alone', async () => {
    const { context, sw, id } = await launchExtension();
    await seedAnswers(sw, fiveStateAnswers());
    const page = await openList(context, id);

    // Tab from the drawer handle until the first section's own two controls
    // come round, in the order the row draws them: go to the section, then
    // open it. A control that could not be reached would run this out.
    await page.locator('.filedrawer-handle').focus();
    const seen: string[] = [];
    for (let i = 0; i < 40 && seen.length < 2; i++) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        const row = el.closest('.filetree-row') as HTMLElement | null;
        if (!row || row.dataset.nodeId !== 'sec2') return null;
        return el.classList.contains('filetree-nav') ? 'nav' : el.classList.contains('filetree-toggle') ? 'toggle' : null;
      });
      if (where && !seen.includes(where)) seen.push(where);
    }
    expect(seen).toEqual(['nav', 'toggle']);

    // Both are usable from the keyboard: Enter on the chevron opens it.
    await page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle').focus();
    const wasOpen = (await page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle').getAttribute('aria-expanded')) === 'true';
    await page.keyboard.press('Enter');
    await expect(page.locator('.filetree-row[data-node-id="sec2"] .filetree-toggle')).toHaveAttribute(
      'aria-expanded',
      String(!wasOpen),
    );

    // ...and the focus ring is really painted, on both.
    for (const selector of ['.filetree-nav', '.filetree-toggle']) {
      const ring = await page.locator(`.filetree-row[data-node-id="sec2"] ${selector}`).evaluate((el) => {
        el.focus();
        const s = getComputedStyle(el);
        return { width: parseFloat(s.outlineWidth), style: s.outlineStyle };
      });
      expect(ring.style, selector).toBe('solid');
      expect(ring.width, selector).toBeGreaterThanOrEqual(2);
    }

    await context.close();
  });
});
