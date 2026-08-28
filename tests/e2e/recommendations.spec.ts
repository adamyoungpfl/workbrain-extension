import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DUE_AFTER_DAYS } from '../../src/core/freshness/clocks';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY, ROLE_NAME_SEED_FIELD } from '../../src/core/freshness/nextMove';
import { HOME_RECOMMENDATION_LIMIT } from '../../src/core/recommend/engine';
import type { AnswerValue, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers, Dismissals } from '../../src/schema/storage.types';

/**
 * V1.5 VB-28 on the real panel.
 *
 * Accept (docs/V1.5-REFINEMENT.md): "recommendations derived purely from
 * stored answers, on every render, nothing persisted except dismissals; no
 * composite score anywhere; every one names a concrete next action;
 * dismissible and stays dismissed; works offline; reading level holds;
 * axe-clean."
 *
 * The dismissal half is the reason this is an e2e and not a unit test: it is
 * the one thing this feature writes to storage, and "stays dismissed" is a
 * claim about a real `chrome.storage.local` round trip across a real reopen.
 *
 * Self-contained, per this repo's e2e convention — the fixture builder below
 * is a widened cousin of home.spec.ts's, kept here rather than shared so a
 * change to one spec cannot silently reshape the other's fixture.
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

async function openPanel(context: BrowserContext, id: string): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 900 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

const ago = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

interface FixtureOptions {
  entities?: number;
  initiatives?: number;
  /** Question ids answered `null` — asked, and passed on. */
  passedOn?: string[];
  /** Days ago the one role's durability answer was given. */
  durabilityAgeDays?: number;
  /** Initiative record indices whose success criteria were passed on. */
  initiativesWithoutSuccess?: number[];
}

/**
 * A FINISHED real Context file, answered just now, with whichever structural
 * gaps the test asks for. Finished matters: the engine is deliberately silent
 * while any question is still waiting, so a half-built fixture would prove
 * nothing about the rules.
 */
function buildAnswers(opts: FixtureOptions = {}): { answers: Answers; roleLabel: string } {
  const {
    entities = 0,
    initiatives = 0,
    passedOn = [],
    durabilityAgeDays = 0,
    initiativesWithoutSuccess = [],
  } = opts;
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  const answerFor = (s: Step): AnswerValue => {
    if (passedOn.includes(s.id)) return null;
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
      if (node.id === 'entities_gate') values[key] = entities > 0 ? 'yes' : 'no';
      else if (node.id === 'initiatives_gate') values[key] = initiatives > 0 ? 'yes' : 'no';
      else values[key] = answerFor(node);
      if (node.id === 'role_names') roleNamesStep = node;
      answeredAt[key] = now;
      if (typeof values[key] === 'string') reflectedAt[key] = now;
    }
  }

  let roleLabel = '';
  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    repeatables[rolesBlock.id] = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      roleLabel = label;
      const record: Record<string, AnswerValue> = { [ROLE_NAME_SEED_FIELD]: label };
      for (const field of rolesBlock!.fields) {
        record[field.key ?? field.id] = field.id === ROLE_DURABILITY_KEY ? 'current' : answerFor(field);
      }
      return record;
    });
    repeatables[rolesBlock.id]!.forEach((record, i) => {
      for (const key of Object.keys(record)) {
        if (key === ROLE_NAME_SEED_FIELD) continue;
        answeredAt[`${ROLES_BLOCK_ID}#${i}#${key}`] =
          key === ROLE_DURABILITY_KEY ? ago(durabilityAgeDays) : now;
      }
    });
  }

  const fillBlock = (blockId: string, count: number, name: (i: number) => string) => {
    if (count === 0) return;
    const block = contextModules
      .flatMap((m) => m.nodes)
      .find((n): n is RepeatableBlock => 'fields' in n && n.id === blockId);
    if (!block) throw new Error(`no ${blockId} block in the ported data`);
    repeatables[blockId] = Array.from({ length: count }, (_, i) => {
      const record: Record<string, AnswerValue> = {};
      for (const field of block.fields) {
        const key = field.key ?? field.id;
        record[key] = field.id.endsWith('_name') ? name(i) : answerFor(field);
      }
      if (blockId === 'initiatives_records' && initiativesWithoutSuccess.includes(i)) {
        record.initiative_success = null;
      }
      return record;
    });
    repeatables[blockId]!.forEach((record, i) => {
      for (const key of Object.keys(record)) answeredAt[`${blockId}#${i}#${key}`] = now;
    });
  };

  fillBlock('entities', entities, (i) => `Person ${i + 1}`);
  fillBlock('initiatives_records', initiatives, (i) => `Project ${i + 1}`);

  return { answers: { values, repeatables, answeredAt, reflectedAt }, roleLabel };
}

/**
 * Four real gaps, so the list has more than it can show and the limit is a
 * real assertion rather than an accident of the fixture:
 *
 *   role-stale            (120) — a role marked current, seven months old
 *   initiative-no-success  (80) — "Project 1" has no finish line
 *   section-empty          (60) — 9. Context Boundaries entirely passed on
 *   entities-thin          (40) — one person named
 */
const FOUR_GAPS: FixtureOptions = {
  entities: 1,
  initiatives: 1,
  initiativesWithoutSuccess: [0],
  passedOn: ['standards_list', 'guardrails_list'],
  durabilityAgeDays: DUE_AFTER_DAYS + 30,
};

async function seed(sw: Worker, answers: Answers) {
  await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);
}

test.describe('Recommendations (V1.5 VB-28)', () => {
  test('a finished file with real structural gaps offers the strongest three, each naming a concrete action', async () => {
    const { context, sw, id } = await launchExtension();
    const { answers, roleLabel } = buildAnswers(FOUR_GAPS);
    await seed(sw, answers);
    const page = await openPanel(context, id);

    const region = page.locator('.home-recs');
    await expect(region).toBeVisible();

    // --- the card: the strongest one, in R1-12's own approved words ---
    await expect(region.getByText('One part of your file is out of date')).toBeVisible();
    await expect(region.getByText(`You said your ${roleLabel} role was current.`)).toBeVisible();
    // BS-06 (§6): the CARD's verb carries a time estimate, because the card
    // is the hero now. The rows below it do not — they are the quiet
    // alternatives, and three prices in a stack is a price list.
    await expect(
      region.getByRole('button', { name: 'Answer one question · 1 min', exact: true }).first(),
    ).toBeVisible();

    // --- the two quiet rows under it, in rank order ---
    const rows = region.locator('.rec-row');
    await expect(rows).toHaveCount(HOME_RECOMMENDATION_LIMIT - 1);
    await expect(rows.nth(0)).toHaveAttribute('data-rec-kind', 'initiative-no-success');
    await expect(rows.nth(1)).toHaveAttribute('data-rec-kind', 'section-empty');

    // Every one names the thing, in the person's own words, and says what
    // pressing it does — VB-28's "every one names a concrete next action".
    await expect(rows.nth(0).locator('.rec-row-headline')).toHaveText(
      'Tell AI what done looks like for Project 1',
    );
    await expect(rows.nth(0).locator('.rec-row-action')).toHaveText('Answer one question');
    await expect(rows.nth(1).locator('.rec-row-headline')).toHaveText(
      'Worth another look: Context Boundaries',
    );
    await expect(rows.nth(1).locator('.rec-row-action')).toHaveText('Open Context Boundaries');

    // --- the fourth is real but not shown: one strong beats five weak ---
    await expect(page.getByText('Most people name three or four here')).toHaveCount(0);

    // --- and it is ONE region, not two competing ones. The "what to do next"
    // card and the rows share a parent; there is no second suggestions block
    // anywhere else on the screen. ---
    await expect(page.locator('.home-recs')).toHaveCount(1);
    await expect(region.locator('.banner')).toHaveCount(1);
    await expect(page.locator('.banner')).toHaveCount(1);

    await context.close();
  });

  test('nothing is stored but the answers — the list is derived on every render', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);
    await expect(page.locator('.rec-row')).toHaveCount(2);

    const stored = await sw.evaluate(() => chrome.storage.local.get(null));
    // No recommendations key, no ranking, no cached list. `wb:recs` only
    // exists once something has actually been hidden.
    expect(Object.keys(stored).sort()).toEqual(['wb:answers']);

    await context.close();
  });

  test('the meter is the one percentage on the screen, and nothing grades anything', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);

    // docs/GUARDRAILS.md: "A composite score out of 100. Real metrics only."
    // V2.6 VB-125 drew this test's line where the guardrail draws it (the
    // same reading V1.6 VB-33 recorded for `sectionPercent`): what is banned
    // is an invented index dressed as precision, not arithmetic the person
    // could redo. The utilization meter's percent is four real ratios of
    // real counts with declared quarters (core/home/utilization.ts, Adam's
    // decided semantics — docs/V2.6-REFINEMENT.md decision 2), so it is the
    // ONE sanctioned percentage. Everything else on Home stays number-free:
    // strip the meter out and the original claim holds verbatim.
    const text = (await page
      .locator('.home')
      .evaluate((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelector('.meter')?.remove();
        return clone.innerText ?? clone.textContent ?? '';
      }))
      .toLowerCase();
    expect(text).not.toMatch(/\d\s*%/);
    expect(text).not.toMatch(/\bscore\b/);
    expect(text).not.toMatch(/\bhealth\b/);
    expect(text).not.toMatch(/out of \d/);
    expect(text).not.toMatch(/\d+\s*\/\s*\d+/);
    // What IS on screen is a real metric: a date, in the person's own terms.
    expect(text).toMatch(/\bmonths ago\b/);
    // And the one percentage there IS says what it measures, in words, and
    // never the word "score": the meter's own account of itself.
    const meter = page.locator('.meter');
    await expect(meter).toHaveCount(1);
    const valuetext = (await meter.getAttribute('aria-valuetext')) ?? '';
    // BR-01 (Adam, 2026-08-28): "set up" became "Optimized", and "Step 2 ·
    // Repeat" became the pair — "Current: X. Next Up: Y." The claim is
    // unchanged: the meter speaks its own number and never a grade.
    expect(valuetext).toMatch(/^\d+% Optimized, Current: .+\. Next Up: .+\.$/);
    expect(valuetext.toLowerCase()).not.toContain('score');

    await context.close();
  });

  test('a recommendation deep-links straight at its own question, keyboard-only', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);

    const row = page.locator('.rec-row[data-rec-kind="initiative-no-success"] .rec-row-act');
    await row.focus();
    await expect(row).toBeFocused();
    await page.keyboard.press('Enter');

    // Not a fresh flow from question one, and not the first record either —
    // the initiative it named.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'initiative_success');

    await context.close();
  });

  test('the card’s own action still deep-links the way R1-12’s did', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);

    const cta = page
      .locator('.home-recs .banner')
      .getByRole('button', { name: /^Answer one question/ });
    await cta.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', ROLE_DURABILITY_KEY);

    await context.close();
  });

  test('hiding one sticks — across a re-render, a reopen, and it never comes back', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);

    const initiative = page.locator('.rec-row[data-rec-kind="initiative-no-success"]');
    await expect(initiative).toHaveCount(1);
    const hide = initiative.locator('.rec-row-hide');
    await expect(hide).toHaveAttribute(
      'aria-label',
      'Hide this: Tell AI what done looks like for Project 1',
    );

    // Keyboard-only, like every other path in this product.
    await hide.focus();
    await page.keyboard.press('Enter');

    // Gone immediately, and the list is re-ranked rather than re-ordered by
    // hand — what is left is the gaps that were already under it.
    //
    // BS-08 (§8, D8) took `entities-thin` out of this engine, so the FOUR_GAPS
    // fixture now offers three. The claim survives the change: hiding one
    // leaves the rest standing, and the region does not collapse.
    await expect(initiative).toHaveCount(0);
    await expect(page.locator('.home-recs .banner')).toHaveCount(1);
    await expect(page.locator('.rec-row')).not.toHaveCount(0);

    // Focus went somewhere real rather than to the top of the document: the
    // control that had it has just unmounted.
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('home-recs');

    // --- the one thing this feature persists ---
    const stored = await sw.evaluate(() => chrome.storage.local.get('wb:recs'));
    const recs = stored['wb:recs'] as Dismissals;
    expect(Object.keys(recs.dismissed)).toEqual(['initiative-no-success:0']);
    expect(recs.dismissed['initiative-no-success:0']).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // --- and it survives a real reopen of the panel ---
    await page.close();
    const reopened = await openPanel(context, id);
    await expect(reopened.locator('.rec-row[data-rec-kind="initiative-no-success"]')).toHaveCount(0);
    await expect(reopened.getByText('Tell AI what done looks like for Project 1')).toHaveCount(0);
    // The others are all still there — a dismissal is one offer, not the
    // whole feature switched off.
    await expect(reopened.locator('.home-recs .banner')).toHaveCount(1);
    await expect(reopened.locator('.rec-row')).toHaveCount(1);

    await context.close();
  });

  test('hiding every one leaves the region genuinely quiet — and still focusable', async () => {
    const { context, sw, id } = await launchExtension();
    // BS-08 (§8, D8): "one person named" is no longer a recommendation at all
    // — it is a line on the multiples screen. So the one-gap fixture is a real
    // gap now: a project with no finish line.
    await seed(sw, buildAnswers({ initiatives: 1, initiativesWithoutSuccess: [0] }).answers);
    const page = await openPanel(context, id);

    // One gap only.
    await expect(page.locator('.home-recs .banner')).toHaveCount(1);
    await expect(page.locator('.rec-row')).toHaveCount(0);
    await page.getByRole('button', { name: /^Hide this: / }).click();

    // V2.8 VB-132a: the all-current banner is gone — redundant beside the
    // Context card's own status. The region survives EMPTY (its box
    // collapsed) so focus has somewhere to be after the control that was
    // pressed unmounts.
    await expect(page.getByText('Your file is current')).toHaveCount(0);
    await expect(page.locator('.home-recs')).toHaveCount(1);
    await expect(page.locator('.home-recs')).toHaveClass(/is-quiet/);
    const focused = await page.evaluate(() => document.activeElement?.className ?? '');
    expect(focused).toContain('home-recs');

    await context.close();
  });

  test('a finished, fresh, complete file is offered nothing at all', async () => {
    const { context, sw, id } = await launchExtension();
    // No gaps: both gates answered "no", every question answered today.
    await seed(sw, buildAnswers().answers);
    const page = await openPanel(context, id);

    await expect(page.locator('.rec-row')).toHaveCount(0);
    // Nothing at all now means exactly that (VB-132a): no banner either —
    // the card's Current status is the one account of a healthy file.
    await expect(page.getByText('Your file is current')).toHaveCount(0);
    await expect(page.locator('.home-recs')).toHaveClass(/is-quiet/);

    await context.close();
  });

  test('a half-finished file is offered nothing — the next question is the next move', async () => {
    const { context, sw, id } = await launchExtension();
    const { answers } = buildAnswers(FOUR_GAPS);
    // Take one answer back out. Every gap above is still really there.
    delete answers.values.peeves;
    delete answers.answeredAt.peeves;
    await seed(sw, answers);
    const page = await openPanel(context, id);

    await expect(page.locator('.rec-row')).toHaveCount(0);
    await expect(page.getByText('One part of your file is out of date')).toHaveCount(0);

    await context.close();
  });

  test('every control clears the 44px floor and shows a real focus ring', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);

    for (const selector of ['.rec-row-act', '.rec-row-hide']) {
      const controls = page.locator(selector);
      const count = await controls.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = await controls.nth(i).boundingBox();
        expect(box!.height, `${selector} height`).toBeGreaterThanOrEqual(44);
        expect(box!.width, `${selector} width`).toBeGreaterThanOrEqual(44);
      }
    }

    // A real ring, measured — not "a class toggles".
    const hide = page.locator('.rec-row-hide').first();
    await hide.focus();
    const ring = await hide.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBe('2px');
    expect(ring.color).toBe('rgb(42, 79, 203)'); // --primary

    // Nothing hangs off the 400px panel.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(overflow).toBeLessThanOrEqual(400);

    await context.close();
  });

  test('the rows are legible in greyscale — nothing here is carried by colour alone', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);

    await page.addStyleTag({ content: 'html { filter: grayscale(1) !important; }' });
    // Every row still says what it is and what pressing it does, in words.
    for (const row of await page.locator('.rec-row').all()) {
      expect((await row.locator('.rec-row-headline').innerText()).trim().length).toBeGreaterThan(0);
      expect((await row.locator('.rec-row-action').innerText()).trim().length).toBeGreaterThan(0);
    }
    await page.screenshot({ path: 'test-results/vb28-recommendations-greyscale.png', fullPage: true });

    await context.close();
  });

  test('screenshot: the whole region at 400px', async () => {
    const { context, sw, id } = await launchExtension();
    await seed(sw, buildAnswers(FOUR_GAPS).answers);
    const page = await openPanel(context, id);
    await page.locator('.home-recs').screenshot({ path: 'test-results/vb28-recommendations.png' });
    await page.screenshot({ path: 'test-results/vb28-home.png', fullPage: true });
    await context.close();
  });
});
