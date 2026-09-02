import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { contextModules } from '../../src/core/flow/flow';
import {
  applyAnswer,
  applyReflect,
  findPosition,
  findSeedTarget,
  reconcileSeededRepeatable,
} from '../../src/core/flow/runner';
import { PAIR_CAPTIONS, PAIRED_PICKS, pairedStepsFor } from '../../src/core/choice/pairedPick';
import type { AnswerValue } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { S } from '../../src/panel/strings';
import { pastRunCard } from './fixtures/runCard';

/**
 * V2.5 VB-123 — role_standing + role_durability as ONE screen, on the real
 * panel. One screen, STILL TWO STORED KEYS (decision 4): the merge is a
 * paired-question presentation seam (core/choice/pairedPick.ts holds the
 * mechanism note), so what this file proves is exactly the seam's contract:
 *
 *  - the standing screen carries BOTH facets in the VB-118 tile grammar —
 *    three standing tiles, and the current-or-past marker row under its own
 *    [DRAFT] caption;
 *  - one Next writes both keys; the companion never gets a screen of its
 *    own on the forward walk;
 *  - both facets are required on a fresh record — and the refusal says so;
 *  - a pre-merge record with only the standing answered resumes ON
 *    role_durability, where the same screen shows the standing pre-filled
 *    (what exists) and asks the mark (what doesn't) — and committing the
 *    mark does NOT re-stamp the untouched standing (the freshness clocks
 *    read those stamps);
 *  - the keyboard is the whole path, and reduced motion + axe hold.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

const pair = PAIRED_PICKS[0]!;
const steps = pairedStepsFor(contextModules, pair)!;

/** Everything up to — not including — role_standing, walked through the
 * real flow (the roles-loop.spec pattern). */
function answersUpToStanding(): Answers {
  let answers: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
  const declined = new Set<string>();
  const seenIntros = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    const pos = findPosition(contextModules, answers, declined, seenIntros);
    if (pos.kind === 'done') break;
    if (pos.kind === 'module-intro') {
      seenIntros.add(pos.module.id);
      continue;
    }
    if (pos.kind === 'add-another') {
      declined.add(pos.block.id);
      continue;
    }
    if (pos.kind === 'reflect') {
      answers = applyReflect(answers, pos.step, pos.location, 'A kept answer.');
      continue;
    }
    if (pos.step.id === pair.anchorId) return answers;
    const value: AnswerValue =
      pos.step.kind === 'multi'
        ? [pos.step.options?.[0]?.v ?? 'x']
        : pos.step.kind === 'chips'
          ? (pos.step.options?.[0]?.v ?? 'x')
          : pos.step.kind === 'yesno'
            ? 'no'
            : 'A seeded answer for this question.';
    answers = applyAnswer(answers, pos.step, pos.location, value);
    if (pos.location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(contextModules, pos.step.id);
      if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
    }
  }
  throw new Error('never reached role_standing');
}

async function launchOnPair(
  opts: { reducedMotion?: 'reduce'; standingStored?: string } = {},
): Promise<{ context: BrowserContext; page: Page; sw: Worker }> {
  // reducedMotion rides the CONTEXT — mount-read preferences need it set
  // before the panel exists (V2.5 house rule).
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}),
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  let answers = answersUpToStanding();
  if (opts.standingStored !== undefined) {
    // The pre-merge shape: standing answered yesterday, the mark never asked.
    answers = applyAnswer(answers, steps.anchor, { in: 'repeatable', blockId: 'roles', recordIndex: 0 }, opts.standingStored);
  }
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  // Park the pointer: a stationary hover holds rotating cues by design.
  await page.mouse.move(0, 0);
  await page.waitForSelector('.flow');
  await expect(page.locator('.flow')).toHaveAttribute(
    'data-step-id',
    opts.standingStored !== undefined ? pair.companionId : pair.anchorId,
  );
  return { context, page, sw };
}

async function storedAnswers(sw: Worker): Promise<Answers> {
  return (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'])) as Answers;
}

const role = (a: Answers) => a.repeatables.roles?.[0] ?? {};

test.describe('the merged role screen (VB-123)', () => {
  test('one screen, two facets: the standing tiles and the marker row, one grammar', async () => {
    const { context, page } = await launchOnPair();

    // Two tile groups on one screen — the anchor at full size, the
    // companion as the compact marker row.
    const facets = page.locator('.flow .vpick');
    await expect(facets).toHaveCount(2);
    await expect(facets.nth(1)).toHaveClass(/\bvpick-compact\b/);

    const standing = facets.nth(0).locator('.vpick-tile');
    await expect(standing).toHaveText(['Primary', 'Secondary', 'Occasional']);
    const mark = facets.nth(1).locator('.vpick-tile');
    await expect(mark).toHaveText(['Current', 'Historical']);
    // Every tile draws, and every tile holds the 44px floor.
    for (const group of [standing, mark]) {
      for (let i = 0; i < (await group.count()); i++) {
        await expect(group.nth(i).locator('.vpick-glyph svg[aria-hidden="true"]')).toHaveCount(1);
        const box = (await group.nth(i).boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }

    // The companion facet wears its [DRAFT] caption; its group's ACCESSIBLE
    // name stays the real ported question.
    await expect(page.locator('.flow-pair-caption')).toHaveText(PAIR_CAPTIONS[pair.companionId]!);
    await expect(facets.nth(1)).toHaveAttribute(
      'aria-label',
      'Is this role current, or something from your past that\'s still useful context?',
    );

    await context.close();
  });

  test('both facets are required, the refusal says which, and one Next writes two keys', async () => {
    const { context, page, sw } = await launchOnPair();

    // Nothing picked: the refusal names both lists.
    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow [role="alert"]')).toHaveText(S.errPickBoth);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', pair.anchorId);

    // Standing picked, mark still empty: one list is missing, so errPickOne.
    await page.getByRole('button', { name: 'Primary', exact: true }).click();
    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow [role="alert"]')).toHaveText(S.errPickOne);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', pair.anchorId);

    // Both picked: one Next, two stored keys — and the loop moves on to its
    // add-another, never to a role_durability screen.
    await page.getByRole('button', { name: 'Current', exact: true }).click();
    // Selection never advances anything (the guardrail) — Next is the door.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', pair.anchorId);
    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');

    const stored = await storedAnswers(sw);
    expect(role(stored).role_standing).toBe('primary');
    expect(role(stored).role_durability).toBe('current');
    expect(stored.answeredAt['roles#0#role_standing']).toBeTruthy();
    expect(stored.answeredAt['roles#0#role_durability']).toBeTruthy();

    await context.close();
  });

  test('a pre-merge record resumes standalone on the mark: shows what exists, asks what doesn\'t, stamps only what changed', async () => {
    const { context, page, sw } = await launchOnPair({ standingStored: 'secondary' });
    const before = await storedAnswers(sw);
    const standingStampBefore = before.answeredAt['roles#0#role_standing'];

    // The position is role_durability itself — asked standalone, answered in
    // company: the standing facet is on screen, pre-filled, editable.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', pair.companionId);
    await expect(page.getByRole('button', { name: 'Secondary', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Now the STANDING facet is the captioned rider — the heading above is
    // the mark's own question.
    await expect(page.locator('.flow-pair-caption')).toHaveText(PAIR_CAPTIONS[pair.anchorId]!);

    await page.getByRole('button', { name: 'Historical', exact: true }).click();
    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');

    const after = await storedAnswers(sw);
    expect(role(after).role_durability).toBe('historical');
    expect(role(after).role_standing).toBe('secondary');
    // The untouched standing kept its stamp — freshness never lied to.
    expect(after.answeredAt['roles#0#role_standing']).toBe(standingStampBefore);
    expect(after.answeredAt['roles#0#role_durability']).toBeTruthy();

    await context.close();
  });

  test('Skip skips what is being asked: both when both are open, only the mark when the standing is stored', async () => {
    // Fresh: both facets open — one Skip records both as skipped.
    const fresh = await launchOnPair();
    await fresh.page.getByRole('button', { name: S.skip, exact: true }).click();
    let stored = await storedAnswers(fresh.sw);
    expect(role(stored).role_standing).toBeNull();
    expect(role(stored).role_durability).toBeNull();
    await fresh.context.close();

    // Pre-merge: the standing is an answer somebody gave — Skip, aimed at
    // the question in the heading, must not erase it.
    const resumed = await launchOnPair({ standingStored: 'secondary' });
    await resumed.page.getByRole('button', { name: S.skip, exact: true }).click();
    stored = await storedAnswers(resumed.sw);
    expect(role(stored).role_standing).toBe('secondary');
    expect(role(stored).role_durability).toBeNull();
    await resumed.context.close();
  });

  test('the keyboard is the whole path: rove, Space, Tab to the marker row, Space, Next', async () => {
    const { context, page, sw } = await launchOnPair();

    const facets = page.locator('.flow .vpick');
    await facets.nth(0).locator('.vpick-tile').first().focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Secondary');
    await page.keyboard.press('Space');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', pair.anchorId);

    // Tab leaves the standing group at its one roving stop and lands on the
    // marker row's — two groups, two stops, no cage.
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Current');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('Historical');
    await page.keyboard.press('Space');

    await page.getByRole('button', { name: S.next, exact: true }).focus();
    await page.keyboard.press('Enter');
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');

    const stored = await storedAnswers(sw);
    expect(role(stored).role_standing).toBe('secondary');
    expect(role(stored).role_durability).toBe('historical');

    await context.close();
  });

  test('reduced motion: still two facets, still every state — and axe is clean', async () => {
    const { context, page } = await launchOnPair({ reducedMotion: 'reduce' });

    const facets = page.locator('.flow .vpick');
    await expect(facets).toHaveCount(2);
    const animations = await page.evaluate(() =>
      [...document.querySelectorAll('.vpick .vpick-tile, .vpick .vpick-glyph svg')].map(
        (el) => getComputedStyle(el).animationName,
      ),
    );
    for (const name of animations) expect(name).toBe('none');

    await page.getByRole('button', { name: 'Occasional', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Occasional', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const scan = await new AxeBuilder({ page })
      .include('.flow')
      .exclude('.app-ground')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);

    await context.close();
  });
});
