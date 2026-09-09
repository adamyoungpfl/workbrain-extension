import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, parseCssColor } from '../../src/core/color/contrast';
import { S } from '../../src/panel/strings';
import type { Answers } from '../../src/schema/storage.types';

/**
 * BS-04 (§4) — the accessibility floor for proof two.
 *
 * The interesting screen is the payoff. It is a fieldset of checkboxes whose
 * labels are the person's own sentences, a summary line that changes as they
 * tick, and two buttons — which is four ways for a name to go missing and one
 * for a change to be announced to nobody.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const TWO_SKILLS: Answers = {
  values: {},
  answeredAt: { skill_seed: new Date().toISOString() },
  reflectedAt: {},
  repeatables: {
    skills: [
      {
        skill_name: 'Weekly ops report',
        skill_trigger: 'weekly_monday',
        skill_tools: ['powerbi', 'teams'],
        skill_steps: '1. Pull the queue\n2. Group by severity\n3. Write the summary',
        skill_output: 'md_list_severity',
      },
      {
        skill_name: 'Board pack prep',
        skill_trigger: 'ad_hoc',
        skill_steps: '- Gather the decks\n- Merge them',
        skill_output: 'one_page_decisions',
      },
    ],
  },
};

async function launch(): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion: 'reduce',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  return { context, sw, id: new URL(sw.url()).host };
}

async function intoTheOffer(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers:skills': a }), TWO_SKILLS);
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  /* Pass 4i: Skill Development's own Grounds - Prove It runs the loop. */
  await page.getByRole('button', { name: new RegExp(S.rowSkillsHub) }).click();
  await page.waitForSelector('.skillshub');
  await page.getByRole('button', { name: S.pgProve, exact: true }).click();
  await page.waitForSelector('.capoffer');
  return page;
}

async function intoThePayoff(page: Page): Promise<void> {
  await page.locator('textarea').fill('Here is your weekly ops report, grouped by severity.');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForSelector('.capdone');
}

/** The ink and the ground actually painted behind a selector. */
async function inkAndGround(page: Page, selector: string) {
  return page.$eval(selector, (el) => {
    const style = getComputedStyle(el);
    let node: HTMLElement | null = el as HTMLElement;
    let ground = 'rgba(0, 0, 0, 0)';
    while (node) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        ground = bg;
        break;
      }
      node = node.parentElement;
    }
    return { ink: style.color, ground };
  });
}

const ratio = (pair: { ink: string; ground: string }) =>
  contrastRatio(parseCssColor(pair.ink)!, parseCssColor(pair.ground)!);

test('axe finds no violations on the offer (BS-04)', async () => {
  const { context, sw, id } = await launch();
  const page = await intoTheOffer(context, sw, id);
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
  await context.close();
});

test('axe finds no violations on the payoff, ticked and unticked (BS-04)', async () => {
  const { context, sw, id } = await launch();
  const page = await intoTheOffer(context, sw, id);
  await intoThePayoff(page);

  let results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await page.locator('.capdone-check input').nth(1).check();
  results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);

  await context.close();
});

test('every checkbox is named by the person’s own step, and the group by its own words (BS-04)', async () => {
  const { context, sw, id } = await launch();
  const page = await intoTheOffer(context, sw, id);
  await intoThePayoff(page);

  // Three real controls, each with the sentence they wrote as its name.
  for (const step of ['Pull the queue', 'Group by severity', 'Write the summary']) {
    await expect(page.getByRole('checkbox', { name: step, exact: true })).toHaveCount(1);
  }
  // The fieldset is named, and NOT with the heading — a screen reader that
  // reads the question and then reads it again as the group's name has been
  // told one thing twice.
  await expect(page.locator('.capdone-checks > legend')).toHaveText(S.capChecksLegend);
  expect(S.capChecksLegend).not.toBe(S.capDone);

  await context.close();
});

test('the whole line is the target, at the 44px floor (BS-04)', async () => {
  const { context, sw, id } = await launch();
  const page = await intoTheOffer(context, sw, id);
  await intoThePayoff(page);

  const rows = page.locator('.capdone-check');
  const count = await rows.count();
  for (let i = 0; i < count; i++) {
    const box = (await rows.nth(i).boundingBox())!;
    expect(box.height, `step row ${i} is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
  }
  // And every visible control on the screen, not only the checkboxes.
  for (const name of [S.capReceipt, S.capFixSteps]) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.height, `"${name}" is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
  }

  await context.close();
});

test('the count and the sentence under it both clear 4.5:1 (BS-04)', async () => {
  const { context, sw, id } = await launch();
  const page = await intoTheOffer(context, sw, id);
  await intoThePayoff(page);

  for (const selector of ['.capdone-tally', '.capdone-meaning', '.capdone-reply']) {
    const value = ratio(await inkAndGround(page, selector));
    expect(value, `${selector} reads at ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }
  await context.close();
});

test('the offer’s own text clears 4.5:1, including the quiet meta lines (BS-04)', async () => {
  const { context, sw, id } = await launch();
  const page = await intoTheOffer(context, sw, id);

  for (const selector of [
    '.capoffer-name',
    '.capoffer-sub',
    '.capoffer-meta',
    '.capoffer-label',
    '.capoffer-steps',
    '.capoffer-more',
    '.capoffer-ask',
  ]) {
    const value = ratio(await inkAndGround(page, selector));
    expect(value, `${selector} reads at ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }
  await context.close();
});

test('keyboard-only: reach a step, tick it, and see the count follow (BS-04)', async () => {
  const { context, sw, id } = await launch();
  const page = await intoTheOffer(context, sw, id);
  await intoThePayoff(page);

  const first = page.getByRole('checkbox', { name: 'Pull the queue', exact: true });
  await first.focus();
  // A visible ring, or the outline replacement the guardrail demands.
  const ring = await page.evaluate(() => {
    const el = document.activeElement?.closest('.capdone-check') as HTMLElement | null;
    if (!el) return null;
    const style = getComputedStyle(el);
    return { outline: style.outlineWidth !== '0px' && style.outlineStyle !== 'none' };
  });
  expect(ring?.outline, 'a focused step row has no visible ring').toBe(true);

  await page.keyboard.press('Space');
  await expect(first).toBeChecked();
  await expect(page.locator('.capdone-tally')).toHaveText('One of your three steps, first try.');

  await context.close();
});
