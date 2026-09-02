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
import type { AnswerValue, RepeatableBlock } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { S } from '../../src/panel/strings';
import { pastRunCard } from './fixtures/runCard';

/**
 * V2.5 VB-122 — role_for as the divided line, on the real screen.
 *
 * What this file proves:
 *  - the geometry IS the meaning: five options rest on the LEFT half of a
 *    divided track, and the crossed one stands on the RIGHT half — position,
 *    not colour, is what changed;
 *  - a DRAG across the divider crosses; released short of it, nothing is
 *    selected and the option comes home;
 *  - FLAG 4's keyboard: focus + Space crosses the line, arrows rove, and
 *    crossing a second option brings the first back to the left;
 *  - it stays chips + Next — crossing never advances, Next commits the KEY;
 *  - back-compat: a stored ported key the line no longer offers ('employer')
 *    appears as a crossed held entry wearing its ported label, and the
 *    stored string never changes;
 *  - add-your-own still works, and the custom entry lands crossed;
 *  - reduced motion (context-level): the cross is instant, the landed state
 *    identical — with an axe pass.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

const rolesBlock = contextModules
  .flatMap((m) => m.nodes)
  .find((n): n is RepeatableBlock => 'fields' in n && n.id === 'roles')!;
const roleForStep = rolesBlock.fields.find((f) => f.id === 'role_for')!;

/** Every answer up to — not including — role_for, derived by walking the
 * real flow (the roles-loop.spec pattern), so it stays correct as questions
 * move. Landing there means role_names was answered and reconciled. */
function answersUpToRoleFor(): Answers {
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
    if (pos.step.id === 'role_for') return answers;
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
  throw new Error('never reached role_for');
}

async function launchOnRoleFor(
  opts: { reducedMotion?: 'reduce'; storedRoleFor?: string } = {},
): Promise<{ context: BrowserContext; page: Page; sw: Worker }> {
  // reducedMotion rides the CONTEXT — the preference must be true before the
  // panel mounts (V2.5 house rule; emulateMedia after load is too late for
  // mount-read preferences).
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    ...(opts.reducedMotion ? { reducedMotion: opts.reducedMotion } : {}),
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  let answers = answersUpToRoleFor();
  if (opts.storedRoleFor !== undefined) {
    answers = applyAnswer(answers, roleForStep, { in: 'repeatable', blockId: 'roles', recordIndex: 0 }, opts.storedRoleFor);
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
  if (opts.storedRoleFor !== undefined) {
    // With role_for already stored, the flow resumes PAST it — the person's
    // own road back to a stored answer is the record list (V1.7 VB-38),
    // whose row opens the record for review at its first question: role_for.
    await page.getByRole('button', { name: new RegExp(S.multiplesTitle) }).click();
    await page.waitForSelector('.multiples');
    // BS-08 (§8): the record row is `.recordrow` now — a completeness ring
    // and what the record holds, in place of the shared file row.
    await page.locator('.multiples-group .recordrow').first().click();
  } else {
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  }
  // Park the pointer: a stationary hover holds rotating cues by design.
  await page.mouse.move(0, 0);
  await page.waitForSelector('.flow');
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');
  return { context, page, sw };
}

async function storedRoleFor(sw: Worker): Promise<AnswerValue | undefined> {
  const stored = (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'])) as Answers;
  return stored.repeatables.roles?.[0]?.role_for;
}

/** An option's horizontal centre, and the track's divider x. */
async function sides(page: Page, optionLabel: string): Promise<{ centre: number; divider: number }> {
  const option = page.locator('.flow .dline .dline-opt').filter({ hasText: new RegExp(`^${optionLabel}$`) });
  const box = (await option.boundingBox())!;
  const track = (await page.locator('.flow .dline-track').boundingBox())!;
  return { centre: box.x + box.width / 2, divider: track.x + track.width / 2 };
}

test.describe('the divided line (VB-122)', () => {
  test('five options wait on the left of a drawn divider, dim, with the door to add your own', async () => {
    const { context, page } = await launchOnRoleFor();

    const options = page.locator('.flow .dline .dline-opt');
    await expect(options).toHaveCount(5);
    await expect(options.nth(0)).toHaveText('Myself');
    await expect(options.nth(1)).toHaveText('My family');
    await expect(options.nth(2)).toHaveText('My team');
    await expect(options.nth(3)).toHaveText('My clients');
    await expect(options.nth(4)).toHaveText('My community');
    // The ported institutions are asked of nobody new.
    await expect(page.locator('.flow .dline')).not.toContainText('My employer');
    await expect(page.locator('.flow .dline')).not.toContainText('An organization or nonprofit');

    // Geometry: every option's centre sits LEFT of the divider, on the 44px
    // floor, with its drawn glyph grayscale (the black-and-white rest state).
    for (let i = 0; i < 5; i++) {
      const label = (await options.nth(i).textContent())!;
      const { centre, divider } = await sides(page, label);
      expect(centre, label).toBeLessThan(divider);
      const box = (await options.nth(i).boundingBox())!;
      expect(box.height, label).toBeGreaterThanOrEqual(44);
      await expect(options.nth(i)).toHaveAttribute('aria-pressed', 'false');
      const filter = await options.nth(i).locator('.dline-glyph').evaluate((el) => getComputedStyle(el).filter);
      expect(filter, label).toContain('grayscale(1)');
    }

    // The add-your-own door rides below the track.
    await expect(page.locator('.flow .dline .dline-add')).toHaveText(S.addYourOwn);

    await context.close();
  });

  test('a drag across the divider crosses; released short, nothing is picked', async () => {
    const { context, page } = await launchOnRoleFor();

    const option = page.locator('.flow .dline .dline-opt').filter({ hasText: /^My team$/ });
    let box = (await option.boundingBox())!;

    // Short drag: 30px right, released well before the divider — no answer.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await expect(option).toHaveAttribute('aria-pressed', 'false');
    const short = await sides(page, 'My team');
    expect(short.centre).toBeLessThan(short.divider);

    // The real drag: carry it past the divider and let go.
    box = (await option.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 220, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await page.mouse.move(0, 0);

    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const { centre, divider } = await sides(page, 'My team');
        return centre > divider;
      })
      .toBe(true);

    // Crossing never advances — Next is still the only door.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');
    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_mandate');

    await context.close();
  });

  test('the keyboard is a full path: arrows rove, Space crosses, a second cross brings the first back (FLAG 4)', async () => {
    const { context, page, sw } = await launchOnRoleFor();

    const options = page.locator('.flow .dline .dline-opt');
    await options.first().focus();
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('My family');
    await page.keyboard.press('Space');
    await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => (await sides(page, 'My family')).centre > (await sides(page, 'My family')).divider)
      .toBe(true);
    // No auto-advance (docs/GUARDRAILS.md).
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');

    // Cross another: the first comes back to the left, bodily.
    await page.keyboard.press('End');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe(S.addYourOwn);
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => document.activeElement?.textContent)).toBe('My community');
    await page.keyboard.press('Enter');
    await expect(options.nth(4)).toHaveAttribute('aria-pressed', 'true');
    await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(async () => {
        const { centre, divider } = await sides(page, 'My family');
        return centre < divider;
      })
      .toBe(true);

    // Next commits the KEY, not the label.
    await page.getByRole('button', { name: S.next, exact: true }).focus();
    await page.keyboard.press('Enter');
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_mandate');
    expect(await storedRoleFor(sw)).toBe('community');

    await context.close();
  });

  test('add your own opens the same custom field, and the new entry lands crossed', async () => {
    const { context, page, sw } = await launchOnRoleFor();

    await page.locator('.flow .dline .dline-add').click();
    const field = page.locator('#flow-custom-value');
    await expect(field).toBeVisible();
    await field.fill('The scout troop parents');
    await page.getByRole('button', { name: S.addYourOwnConfirm, exact: true }).click();
    await page.mouse.move(0, 0);

    const custom = page.locator('.flow .dline .dline-opt').filter({ hasText: /^The scout troop parents$/ });
    await expect(custom).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const { centre, divider } = await sides(page, 'The scout troop parents');
        return centre > divider;
      })
      .toBe(true);

    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_mandate');
    expect(await storedRoleFor(sw)).toBe('The scout troop parents');

    await context.close();
  });

  test('a stored ported key survives as a crossed held entry — label kept, string kept (back-compat is law)', async () => {
    const { context, page, sw } = await launchOnRoleFor({ storedRoleFor: 'employer' });

    // The held entry is ON the line, crossed, wearing its ported label —
    // alongside the five offered options.
    const options = page.locator('.flow .dline .dline-opt');
    await expect(options).toHaveCount(6);
    const held = options.filter({ hasText: /^My employer$/ });
    await expect(held).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(async () => {
        const { centre, divider } = await sides(page, 'My employer');
        return centre > divider;
      })
      .toBe(true);

    // Re-submitting unchanged keeps the stored string exactly as it was.
    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_mandate');
    expect(await storedRoleFor(sw)).toBe('employer');

    // And crossing an offered option instead returns the held entry to the
    // left rather than deleting it from the screen.
    await page.getByRole('button', { name: S.back, exact: true }).click();
    await page.mouse.move(0, 0);
    await options.filter({ hasText: /^Myself$/ }).click();
    await expect(held).toHaveAttribute('aria-pressed', 'false');
    await expect(held).toBeVisible();
    await page.getByRole('button', { name: S.next, exact: true }).click();
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    expect(await storedRoleFor(sw)).toBe('myself');

    await context.close();
  });

  test('reduced motion: the cross is instant, the landed state identical — and axe is clean', async () => {
    const { context, page } = await launchOnRoleFor({ reducedMotion: 'reduce' });

    const option = page.locator('.flow .dline .dline-opt').filter({ hasText: /^My clients$/ });
    // The transform transition is genuinely off — the cross cannot glide.
    const transition = await option.evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(transition).not.toContain('transform');

    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    const { centre, divider } = await sides(page, 'My clients');
    expect(centre).toBeGreaterThan(divider);

    const scan = await new AxeBuilder({ page })
      .include('.flow')
      .exclude('.app-ground')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(scan.violations).toEqual([]);

    await context.close();
  });
});
