import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import {
  findPosition,
  applyAnswer,
  applyReflect,
  reconcileSeededRepeatable,
  findSeedTarget,
} from '../../src/core/flow/runner';
import { ADD_ANOTHER } from '../../src/core/flow/addAnother';
import { S } from '../../src/panel/strings';
import type { AnswerValue } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.4 VB-20 — "another role?" at the end of the roles loop, driven in a real
 * browser.
 *
 * The unit tests prove the derivation and the two writes. They cannot prove
 * the thing this feature is actually about, which is a sequence of screens: a
 * person adds a role at the end of the loop, answers four questions about it,
 * walks BACK to `role_names`, presses Next on it unchanged — and finds their
 * role, and its four answers, still there. `roles` is the one seeded
 * repeatable, and `reconcileSeededRepeatable` rebuilds its records from that
 * question every time it is re-submitted, so that walk is the exact path on
 * which an added role used to be deleted without a word (docs/GUARDRAILS.md:
 * never lose an answer silently).
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const ROLES_COPY = ADD_ANOTHER.roles!;
const NEW_ROLE = 'Board member';

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
 * Every answer up to — not including — `role_names`, derived by walking the
 * real flow rather than hand-written, so it stays correct as questions move.
 * Seeding storage puts the panel one press from the roles loop; the loop
 * itself is then walked in the browser, which is the part under test.
 *
 * Stopping *before* `role_names` matters: the Back history is session state,
 * so the only way a test can walk back to that question is to have answered it
 * on screen. That walk is the whole point of this file.
 */
function answersBeforeRoleNames(): Answers {
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
    if (pos.step.id === 'role_names') return answers;
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
  throw new Error('never reached role_names');
}

async function openAtRoleNames(context: BrowserContext, sw: Worker, id: string): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answersBeforeRoleNames());
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_names');
  return page;
}

const next = (page: Page) => page.getByRole('button', { name: S.next, exact: true }).click();

/** Answers whatever question is on screen the shortest legitimate way. */
async function answerCurrent(page: Page): Promise<void> {
  const position = await page.locator('.flow').getAttribute('data-position');
  if (position === 'reflect') {
    await page.getByRole('button', { name: S.reflectKeep, exact: true }).click();
    return;
  }
  const textarea = page.locator('.flow textarea');
  // V2.0 VB-60: a choice on this screen is a pill or an orb — `role_names` is
  // asked as orbs now (core/choice/orbs.ts) and every other question in this
  // loop is still pills. A walker that only knew one of them would answer
  // nothing on the other and pass anyway, because `role_names` is optional.
  const choice = page.locator(
    '.flow .pillgroup .pill:not(.pill-add), .flow .orbgroup .orbchoice:not(.orbchoice-add)',
  );
  if (await textarea.count()) await textarea.first().fill('What this role is there to do.');
  else if (await choice.count()) await choice.first().click();
  await next(page);
}

/** Walks the seeded role's four questions, landing on the add-another. */
async function answerOneRole(page: Page): Promise<void> {
  for (let guard = 0; guard < 12; guard++) {
    if ((await page.locator('.flow').getAttribute('data-position')) === 'add-another') return;
    await answerCurrent(page);
  }
  throw new Error('the roles loop never reached its add-another screen');
}

/** Picks a role on `role_names` and answers everything the loop then asks.
 * V2.0 VB-60: that question's choices are orbs. */
async function throughFirstRole(page: Page): Promise<void> {
  await page.locator('.flow .orbgroup .orbchoice').first().click();
  await next(page);
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');
  await answerOneRole(page);
}

async function pick(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function storedAnswers(sw: Worker): Promise<Answers> {
  return (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'])) as Answers;
}

test.describe('VB-20 — the roles loop asks for another', () => {
  test('the loop ends by asking, and only asks for a name once the answer is Yes', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await throughFirstRole(page);

    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');
    await expect(page.locator('.flow-q')).toHaveText(ROLES_COPY.prompt);

    // Nothing is asked before it is needed: no name field until "Yes".
    const name = page.locator('#flow-add-another-name');
    await expect(name).toHaveCount(0);

    await pick(page, S.yes);
    await expect(name).toBeVisible();
    // Its own printed question, not the screen's — the heading above asks
    // something else, so a hidden label would leave a box with no question.
    await expect(page.locator('label[for="flow-add-another-name"]')).toHaveText(ROLES_COPY.namePrompt);
    await expect(name).toHaveAttribute('placeholder', ROLES_COPY.namePlaceholder);

    // Changing the answer takes the question away again.
    await pick(page, S.no);
    await expect(name).toHaveCount(0);

    await context.close();
  });

  test('Yes with no name says what to do instead of losing the intent', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await throughFirstRole(page);

    await pick(page, S.yes);
    await next(page);
    await expect(page.locator('.flow [role="alert"]')).toHaveText(S.errNeedItsName);
    // Still on the same screen — nothing was added, nothing was skipped past.
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');

    // A name already on the list is refused too: the name is how the record
    // is found again, so two of them would collapse into one on the next
    // reconcile. (The seeded role is "Employee", the first option.)
    await page.locator('#flow-add-another-name').fill('employee');
    await next(page);
    await expect(page.locator('.flow [role="alert"]')).toHaveText(S.errNameTaken);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');

    await context.close();
  });

  test('answering No moves on and adds nothing', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await throughFirstRole(page);

    await pick(page, S.no);
    await next(page);

    // Forward, out of the roles block entirely — in the real flow that is the
    // next module introducing itself, which is a screen, not a role field.
    await expect(page.locator('.flow')).not.toHaveAttribute('data-position', 'add-another');
    const stepId = await page.locator('.flow').getAttribute('data-step-id');
    expect(['role_for', 'role_mandate', 'role_standing', 'role_durability']).not.toContain(stepId);

    const stored = await storedAnswers(sw);
    expect(stored.repeatables.roles).toHaveLength(1);
    expect(stored.values.role_names).toEqual(['employee']);

    await context.close();
  });

  test('adding a role appends to role_names AND to the records, then loops back for it', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await throughFirstRole(page);

    await pick(page, S.yes);
    await page.locator('#flow-add-another-name').fill(NEW_ROLE);
    await next(page);

    // The loop runs again, for the role just named.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');

    const afterAdd = await storedAnswers(sw);
    expect(afterAdd.values.role_names).toEqual(['employee', NEW_ROLE]);
    expect(afterAdd.repeatables.roles).toHaveLength(2);
    expect(afterAdd.repeatables.roles?.[1]).toEqual({ role_name: NEW_ROLE });
    // The originally-seeded role is untouched — same record, same answers.
    expect(afterAdd.repeatables.roles?.[0]?.role_name).toBe('Employee');

    // Re-enterable: answer this one and it asks again.
    await answerOneRole(page);
    await expect(page.locator('.flow-q')).toHaveText(ROLES_COPY.prompt);

    await context.close();
  });

  /**
   * THE test. Everything above is the setup for this one.
   */
  test('going Back to role_names and re-submitting it unchanged does NOT drop the added role', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await throughFirstRole(page);

    await pick(page, S.yes);
    await page.locator('#flow-add-another-name').fill(NEW_ROLE);
    await next(page);
    await answerOneRole(page);

    const before = await storedAnswers(sw);
    const addedBefore = before.repeatables.roles?.[1];
    // Its name plus all four answers. Sorted, because what comes back out of
    // chrome.storage is key-ordered by the storage layer, not by us.
    expect(Object.keys(addedBefore ?? {}).sort()).toEqual([
      'role_durability',
      'role_for',
      'role_mandate',
      'role_name',
      'role_standing',
    ]);

    // Walk back to the seed question, one Back at a time, the way a person
    // would who wanted to check what they had picked.
    for (let guard = 0; guard < 15; guard++) {
      if ((await page.locator('.flow').getAttribute('data-step-id')) === 'role_names') break;
      await page.getByRole('button', { name: S.back, exact: true }).click();
    }
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_names');

    // It is ON the list, and shown as picked — not silently selected behind a
    // row of choices that does not include it. V2.0 VB-60 made those choices
    // orbs; the guarantee is the same one.
    // Exact, and case-sensitive: one of the six built-in options is
    // "Volunteer / Board Member", which a loose substring match would also
    // find and quietly pass on.
    const addedPill = page.locator('.flow .orbgroup .orbchoice').filter({ hasText: new RegExp(`^${NEW_ROLE}$`) });
    await expect(addedPill).toHaveCount(1);
    await expect(addedPill).toHaveAttribute('aria-pressed', 'true');

    // Next, with nothing changed. This is the press that used to delete it.
    await next(page);
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'role_names');

    const after = await storedAnswers(sw);
    expect(after.values.role_names).toEqual(['employee', NEW_ROLE]);
    expect(after.repeatables.roles).toHaveLength(2);
    expect(after.repeatables.roles?.[1]).toEqual(addedBefore);
    expect(after.repeatables.roles?.[0]).toEqual(before.repeatables.roles?.[0]);

    await context.close();
  });

  test('the name field is a real 44px target, inside the panel, with a visible focus ring', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await throughFirstRole(page);
    await pick(page, S.yes);

    const field = page.locator('#flow-add-another-name');
    const box = (await field.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(400);

    // It sits under the pills, not over them, and close enough to read as
    // theirs — the 12px step .flow-add-name sets.
    const pillsBox = (await page.locator('.flow .pillgroup').boundingBox())!;
    const gap = box.y - (pillsBox.y + pillsBox.height);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(80); // label + its own 7px, plus the 12px step

    // Nothing about the panel scrolls sideways because of it.
    const overflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Focus is visible: the ring is a box-shadow, and it is only there when
    // the field has focus (Field.css) — asserted as a real computed change.
    const shadowAtRest = await field.evaluate((el) => getComputedStyle(el).boxShadow);
    await field.focus();
    const shadowFocused = await field.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadowFocused).not.toBe(shadowAtRest);
    expect(shadowFocused).not.toBe('none');

    await page.screenshot({ path: 'test-results/vb20-add-role.png' });
    await context.close();
  });

  test('the whole thing works from the keyboard alone', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openAtRoleNames(context, sw, id);
    await throughFirstRole(page);

    // Pills carry a roving tabindex: the first is "Yes".
    await page.locator('.flow .pillgroup .pill').first().focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#flow-add-another-name')).toBeVisible();

    // Tab reaches the field that just appeared — nothing grabbed focus for
    // the person, and nothing is stranded behind it either.
    for (let guard = 0; guard < 8; guard++) {
      if ((await page.evaluate(() => document.activeElement?.id)) === 'flow-add-another-name') break;
      await page.keyboard.press('Tab');
    }
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('flow-add-another-name');

    await page.keyboard.type('Scout leader');
    // Enter in a single-line field submits the form — the same Next.
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');

    const stored = await storedAnswers(sw);
    expect(stored.values.role_names).toEqual(['employee', 'Scout leader']);

    await context.close();
  });
});
