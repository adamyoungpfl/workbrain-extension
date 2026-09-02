import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DUE_AFTER_DAYS } from '../../src/core/freshness/clocks';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY, ROLE_NAME_SEED_FIELD } from '../../src/core/freshness/nextMove';
import type { AnswerValue, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.5 VB-28's accessibility floor, scanned on the real panel with the card
 * and both rows on screen at once.
 *
 * home.spec.ts's own a11y coverage never sees this region: before VB-28 the
 * only thing in that slot was a single Banner with one button in it. What is
 * new and worth measuring is three things axe is good at and eyes are not —
 * a heading level that now sits inside a labelled region, an icon button
 * whose only visible content is an SVG, and --ink-2 on the amber tint the
 * card's cross sits over.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const DAY_MS = 24 * 60 * 60 * 1000;
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
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
  // Scanned still, for the reason welcome.a11y.spec.ts documents: axe
  // measures one instant, and V2.6 VB-125c's rise-in entrance passes the
  // whole surface through partial opacity on its way in — a mid-fade frame
  // reads every ink lighter than it settles. Must precede the goto: the
  // animation starts at mount.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home-recs');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — and
  // the covered panel is `inert`, so a Tab walk that started under it would
  // find nothing at all. Escape, then genuinely gone.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

/** The same four-gap seed the behaviour spec uses — see its comment. */
function fourGapAnswers(): Answers {
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - (DUE_AFTER_DAYS + 30) * DAY_MS).toISOString();
  const passedOn = new Set(['standards_list', 'guardrails_list']);
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  const answerFor = (s: Step): AnswerValue => {
    if (passedOn.has(s.id)) return null;
    if (s.kind === 'intro') return null;
    if (s.kind === 'yesno') return 'yes';
    if (s.kind === 'chips') return s.options?.[0]?.v ?? 'x';
    if (s.kind === 'multi') return s.options?.length ? [s.options[0]!.v] : [];
    return `A test answer for ${s.id}.`;
  };

  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        // By id, not by `seedFrom`: V2.0 VB-64 added a second seeded block
        // (`audiences`), and "the last seeded block wins" would have quietly
        // built this fixture's role records into the wrong one.
        if (node.id === 'roles') rolesBlock = node;
        continue;
      }
      const key = node.key ?? node.id;
      values[key] = answerFor(node);
      if (node.id === 'role_names') roleNamesStep = node;
      answeredAt[key] = now;
      if (typeof values[key] === 'string') reflectedAt[key] = now;
    }
  }

  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    repeatables[rolesBlock.id] = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [ROLE_NAME_SEED_FIELD]: label };
      for (const field of rolesBlock!.fields) {
        record[field.key ?? field.id] = field.id === ROLE_DURABILITY_KEY ? 'current' : answerFor(field);
      }
      return record;
    });
    repeatables[rolesBlock.id]!.forEach((record, i) => {
      for (const key of Object.keys(record)) {
        if (key === ROLE_NAME_SEED_FIELD) continue;
        answeredAt[`${ROLES_BLOCK_ID}#${i}#${key}`] = key === ROLE_DURABILITY_KEY ? stale : now;
      }
    });
  }

  for (const [blockId, name] of [
    ['entities', 'Person 1'],
    ['initiatives_records', 'Project 1'],
  ] as const) {
    const block = contextModules
      .flatMap((m) => m.nodes)
      .find((n): n is RepeatableBlock => 'fields' in n && n.id === blockId)!;
    const record: Record<string, AnswerValue> = {};
    for (const field of block.fields) {
      record[field.key ?? field.id] = field.id.endsWith('_name') ? name : answerFor(field);
    }
    if (blockId === 'initiatives_records') record.initiative_success = null;
    repeatables[blockId] = [record];
    for (const key of Object.keys(record)) answeredAt[`${blockId}#0#${key}`] = now;
  }

  return { values, repeatables, answeredAt, reflectedAt };
}

test.describe('Recommendations — accessibility (V1.5 VB-28)', () => {
  test('the whole Home screen is axe-clean with a card and two rows on it', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), fourGapAnswers());
    const page = await openPanel(context, id);
    await expect(page.locator('.rec-row')).toHaveCount(2);

    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations).toEqual([]);

    await context.close();
  });

  test('every control in the region is reachable and named, keyboard-only', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), fourGapAnswers());
    const page = await openPanel(context, id);

    // Tab from the top of the document and collect what turns up inside the
    // region, in order. Six controls: the card's action and its cross, then
    // each row's action and cross.
    const seen: string[] = [];
    for (let i = 0; i < 40 && seen.length < 8; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || !el.closest('.home-recs')) return null;
        return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
      });
      if (inside !== null) seen.push(inside);
      else if (seen.length > 0) break; // left the region again
    }

    expect(seen).toHaveLength(6);
    for (const name of seen) expect(name.length, JSON.stringify(seen)).toBeGreaterThan(0);
    // The three hide controls are three DIFFERENT names, so a screen-reader
    // user can tell which offer they are turning down.
    const hides = seen.filter((n) => n.startsWith('Hide this:'));
    expect(hides).toHaveLength(3);
    expect(new Set(hides).size).toBe(3);

    await context.close();
  });

  test('the region is a named live region, and hiding one never steals focus', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), fourGapAnswers());
    const page = await openPanel(context, id);

    const region = page.locator('.home-recs');
    await expect(region).toHaveAttribute('aria-live', 'polite');
    await expect(region).toHaveAttribute('aria-label', 'What would help');

    // Focus stays inside the region rather than jumping to a dialog or to the
    // top of the page — docs/GUARDRAILS.md: "nothing steals focus".
    await page.locator('.rec-row .rec-hide').first().focus();
    await page.keyboard.press('Enter');
    const stillInside = await page.evaluate(
      () => document.activeElement?.closest('.home-recs') !== null,
    );
    expect(stillInside).toBe(true);
    // And no dialog appeared: an offer is declined, never confirmed.
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await context.close();
  });

  test('text contrast holds on the amber card and on the row tint', async () => {
    const { context, sw, id } = await launch();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), fourGapAnswers());
    const page = await openPanel(context, id);

    // Measured, not assumed: the cross on the card sits on --amber-tint, and
    // the row's second line sits on --surface. Both are --ink-2 (6.96:1 on
    // canvas) and both must still clear 4.5:1 on their own ground. Axe covers
    // this above; this pins the exact colours so a token change is caught by
    // name rather than as a mystery violation.
    const cardCross = await page.locator('.home-rec-card-hide').evaluate((el) => {
      const s = getComputedStyle(el);
      const banner = el.parentElement!.querySelector('.banner')!;
      return { color: s.color, bg: getComputedStyle(banner).backgroundColor };
    });
    expect(cardCross.color).toBe('rgb(82, 90, 103)'); // --ink-2
    expect(cardCross.bg).toBe('rgb(255, 244, 226)'); // --amber-tint

    const rowAction = await page.locator('.rec-row-action').first().evaluate((el) => getComputedStyle(el).color);
    expect(rowAction).toBe('rgb(82, 90, 103)'); // --ink-2, not the lighter --ink-3

    await context.close();
  });
});
