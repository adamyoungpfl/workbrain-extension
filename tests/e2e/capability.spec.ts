import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S } from '../../src/panel/strings';
import type { Answers } from '../../src/schema/storage.types';

/**
 * BS-04 (§4) — PROOF TWO, THE CAPABILITY PROOF.
 *
 * §4's acceptance, verbatim: "the assembled prompt contains the user's steps,
 * output format, cadence and tool names verbatim; the checklist is generated
 * from their steps, not a fixed list; 'fix the step it missed' lands on that
 * step; the receipt saves; the surface is reachable after two skills without
 * finishing all of Skills."
 *
 * The assembly half is proved without a browser in
 * `src/core/proof/capability.test.ts`. What needs a real panel is everything
 * about ROUTING and about what is on the screen — the door's gate, the
 * cycle, the checklist being theirs, the fix landing on `skill_steps`, and
 * the receipt actually leaving as a file.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../../dist');

/** Two runnable recipes and nothing else — deliberately NOT a finished Skills
 * interview, because "without finishing all of Skills" is the acceptance. */
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
        skill_inputs: ['dashboard'],
        skill_steps: '1. Pull the queue\n2. Group by severity\n3. Write the summary',
        skill_output: 'md_list_severity',
        skill_autonomy: 'draft',
        skill_owner: 'mine',
        skill_data_home: 'in_tool',
      },
      {
        skill_name: 'Board pack prep',
        skill_trigger: 'ad_hoc',
        skill_tools: ['word'],
        skill_steps: '- Gather the decks\n- Merge them',
        skill_output: 'one_page_decisions',
      },
    ],
  },
};

/** One recipe. The door must not open on this. */
const ONE_SKILL: Answers = {
  ...TWO_SKILLS,
  repeatables: { skills: [TWO_SKILLS.repeatables['skills']![0]!] },
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

async function openHome(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

const seed = (sw: Worker, skills: Answers) =>
  sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers:skills': a }), skills);

async function intoTheRun(page: Page) {
  await page.getByRole('button', { name: S.capCta, exact: true }).click();
  await page.waitForSelector('.capoffer');
}

test.describe('BS-04 — proof two, the capability proof', () => {
  test('the door waits for two runnable recipes, and says so in words', async () => {
    const { context, sw, id } = await launch();

    // Nothing at all.
    let page = await openHome(context, id);
    let row = page.locator('.home-row').filter({ hasText: S.capCta });
    await expect(row).toHaveClass(/is-waiting/);
    await expect(row).toContainText(S.capRowWaiting);
    // A waiting row is not a disabled control — it is not a control at all.
    await expect(row.locator('button')).toHaveCount(0);
    await page.close();

    // One recipe is still not two. The gate counts RUNNABLE skills, so a
    // second one with no steps would not open it either.
    await seed(sw, ONE_SKILL);
    page = await openHome(context, id);
    row = page.locator('.home-row').filter({ hasText: S.capCta });
    await expect(row).toHaveClass(/is-waiting/);
    await page.close();

    // Two, and the door is real — with the Skills interview nowhere near
    // finished (§4: "without finishing all of Skills").
    await seed(sw, TWO_SKILLS);
    page = await openHome(context, id);
    row = page.locator('.home-row').filter({ hasText: S.capCta });
    await expect(row).not.toHaveClass(/is-waiting/);
    await expect(row).toContainText(S.capRowSub);
    await expect(page.getByRole('button', { name: S.capCta, exact: true })).toBeVisible();

    await context.close();
  });

  test('the offer is their own job description, and the copy carries the recipe', async () => {
    const { context, sw, id } = await launch();
    await seed(sw, TWO_SKILLS);
    const page = await openHome(context, id);
    await intoTheRun(page);

    const offer = page.locator('.capoffer');
    await expect(offer.locator('.capoffer-name')).toHaveText('Weekly ops report');
    // Step count and output shape, in words, from their own answers.
    await expect(offer.locator('.capoffer-sub')).toContainText('Three steps');
    await expect(offer.locator('.capoffer-sub')).toContainText('a single markdown list, grouped by severity');
    // Cadence and tools, as the interview worded them.
    await expect(offer).toContainText('Weekly, first thing Monday');
    await expect(offer).toContainText('Power BI / Tableau, Teams');
    // The FIRST TWO steps, in their words, and an honest count of the rest.
    await expect(offer.locator('.capoffer-steps li')).toHaveText(['Pull the queue', 'Group by severity']);
    await expect(offer.locator('.capoffer-more')).toContainText('one more');
    // And the one sentence they send.
    await expect(offer.locator('.capoffer-ask')).toHaveText('Run my Weekly ops report for this week.');

    // §4's acceptance on the assembled prompt: their steps, output format,
    // cadence and tool names, verbatim, in the block that gets copied.
    const promptText = await page.evaluate(() => document.body.innerText);
    for (const fragment of [
      'Run my Weekly ops report for this week.',
      'Pull the queue',
      'Group by severity',
      'Write the summary',
      'Weekly, first thing Monday',
      'Power BI / Tableau',
      'A single markdown list, grouped by severity',
    ]) {
      expect(promptText, `the copied prompt is missing "${fragment}"`).toContain(fragment);
    }
    // The whole recipe is there, so the third step shows in the block even
    // though the offer above it only previews two.
    expect(promptText).toContain('Write the summary');

    await context.close();
  });

  test('the secondary names the skill it switches to, and switching really switches', async () => {
    const { context, sw, id } = await launch();
    await seed(sw, TWO_SKILLS);
    const page = await openHome(context, id);
    await intoTheRun(page);

    const switcher = page.getByRole('button', { name: S.capSwitch('Board pack prep'), exact: true });
    await expect(switcher).toBeVisible();
    await switcher.click();

    await expect(page.locator('.capoffer-name')).toHaveText('Board pack prep');
    // Ad hoc has no period we can honestly name, so the ask has no tail.
    await expect(page.locator('.capoffer-ask')).toHaveText('Run my Board pack prep.');
    await expect(page.locator('.capoffer-steps li')).toHaveText(['Gather the decks', 'Merge them']);
    // And it cycles back rather than dead-ending on the last one.
    await expect(page.getByRole('button', { name: S.capSwitch('Weekly ops report'), exact: true })).toBeVisible();

    await context.close();
  });

  test('the checklist is their steps, the count is the sentence, and the receipt saves', async () => {
    const { context, sw, id } = await launch();
    await seed(sw, TWO_SKILLS);
    const page = await openHome(context, id);
    await intoTheRun(page);

    await page.locator('textarea').fill('Here is your weekly ops report, grouped by severity.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForSelector('.capdone');

    // Their reply, printed. The panel prints it having never read it.
    await expect(page.locator('.capdone-reply')).toContainText('grouped by severity');

    // THE CHECKLIST IS THEIRS — three boxes, their three lines, their order.
    const checks = page.locator('.capdone-check');
    await expect(checks).toHaveCount(3);
    await expect(checks).toHaveText([
      /Pull the queue/,
      /Group by severity/,
      /Write the summary/,
    ]);

    // Nothing ticked is a real state, and the sentence says so honestly.
    await expect(page.locator('.capdone-tally')).toHaveText('Zero of your three steps, first try.');

    await checks.nth(0).locator('input').check();
    await checks.nth(2).locator('input').check();
    await expect(page.locator('.capdone-tally')).toHaveText('Two of your three steps, first try.');
    await expect(page.locator('.capdone-meaning')).toContainText('Ask for it by name');

    // All three is its own sentence — the one somebody repeats.
    await checks.nth(1).locator('input').check();
    await expect(page.locator('.capdone-tally')).toHaveText('Every one of your three steps, first try.');
    await expect(page.locator('.capdone-meaning')).toContainText('never have to explain it again');

    // THE RECEIPT SAVES — a real download, named for the skill.
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: S.capReceipt, exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toContain('Weekly ops report');
    expect(file.suggestedFilename().endsWith('.md')).toBe(true);

    await context.close();
  });

  test('"fix the step it missed" lands on that skill’s steps question, not the record from the top', async () => {
    const { context, sw, id } = await launch();
    await seed(sw, TWO_SKILLS);
    const page = await openHome(context, id);
    await intoTheRun(page);

    // Switch to the SECOND recipe first, so a route that ignored the record
    // index would land on the wrong skill and this test would say so.
    await page.getByRole('button', { name: S.capSwitch('Board pack prep'), exact: true }).click();
    await page.locator('textarea').fill('I merged the decks.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForSelector('.capdone');

    await page.getByRole('button', { name: S.capFixSteps, exact: true }).click();

    // The steps question, of THAT record — not `skill_trigger`, which is the
    // record's first field and where `positionForRecord` would have landed.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'skill_steps');
    // Their existing lines are in the box, so a fix is an edit, not a retype.
    await expect(page.locator('textarea')).toHaveValue(/Gather the decks/);

    await context.close();
  });

  test('a run with nothing to run degrades to Home rather than to an empty screen', async () => {
    const { context, sw, id } = await launch();
    // The door is closed here, so the only way in would be a stale route.
    // What must never happen is a blank offer with a copy button on it.
    await seed(sw, ONE_SKILL);
    const page = await openHome(context, id);
    await expect(page.locator('.home-row').filter({ hasText: S.capCta })).toHaveClass(/is-waiting/);
    await expect(page.locator('.capoffer')).toHaveCount(0);
    await context.close();
  });
});
