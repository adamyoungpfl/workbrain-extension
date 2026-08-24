import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import {
  applyAnswer,
  applyReflect,
  applySeededAddAnother,
  findPosition,
  findSeedStep,
  findSeedTarget,
  reconcileSeededRepeatable,
} from '../../src/core/flow/runner';
import { S } from '../../src/panel/strings';
import type { AnswerValue, RepeatableBlock } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

/**
 * V1.7 VB-38 — add and edit the things that come in numbers, in a real
 * browser.
 *
 * The unit tests (src/core/flow/multiples.test.ts) prove the two writes and
 * that both survive a re-answer. They cannot prove what this feature actually
 * is, which is a sequence of screens: Home → the list → a name → the interview,
 * parked on the record that was just made.
 *
 * The one that matters most is the last: a role added HERE, from a list rather
 * than from the end of the roles loop, then found again through the drawer's
 * own "2.1 Roles" row, re-submitted unchanged — and still there, with every
 * answer inside it. `roles` is the one seeded repeatable and that walk is the
 * exact path on which an added role used to be deleted without a word
 * (docs/V1.4-REFINEMENT.md VB-20, docs/GUARDRAILS.md: never lose an answer
 * silently). The open-ended blocks get the same walk, because they are a
 * different mechanism and deserve their own proof rather than an argument by
 * analogy.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

const NEW_ROLE = 'Board member';
const NEW_ENTITY = 'Priya';

const rolesBlock = contextModules
  .flatMap((m) => m.nodes)
  .find((n): n is RepeatableBlock => 'fields' in n && n.id === 'roles')!;

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
 * The whole interview answered, every gate said yes, every "another?"
 * declined — so the person holds exactly one role, one entity and one
 * initiative. Walked through the real flow rather than hand-written, so it
 * stays correct as the ported questions move.
 */
function completedInterview(): Answers {
  let answers: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
  const declined = new Set<string>();
  const seenIntros = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    const pos = findPosition(contextModules, answers, declined, seenIntros);
    if (pos.kind === 'done') return answers;
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
    const value: AnswerValue =
      pos.step.kind === 'multi'
        ? [pos.step.options?.[0]?.v ?? 'x']
        : pos.step.kind === 'chips'
          ? (pos.step.options?.[0]?.v ?? 'x')
          : pos.step.kind === 'yesno'
            ? 'yes'
            : `A seeded answer for ${pos.step.id}.`;
    answers = applyAnswer(answers, pos.step, pos.location, value);
    if (pos.location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(contextModules, pos.step.id);
      if (seedTarget) answers = reconcileSeededRepeatable(answers, seedTarget, pos.step, value);
    }
  }
  throw new Error('the interview never finished');
}

/**
 * The same, plus a second role whose answers differ from the first's — so a
 * test that opens the SECOND row can prove it opened the second one rather
 * than landing on the first and looking identical.
 */
function twoRoles(): Answers {
  const seedStep = findSeedStep(contextModules, rolesBlock)!;
  let answers = applySeededAddAnother(completedInterview(), rolesBlock, seedStep, NEW_ROLE);
  const declined = new Set<string>();
  for (let guard = 0; guard < 20; guard++) {
    const pos = findPosition(contextModules, answers, declined, new Set());
    if (pos.kind === 'add-another') {
      if (pos.block.id === 'roles') break;
      declined.add(pos.block.id);
      continue;
    }
    if (pos.kind === 'done' || pos.kind === 'module-intro') break;
    if (pos.location.in !== 'repeatable' || pos.location.blockId !== 'roles') break;
    if (pos.kind === 'reflect') {
      answers = applyReflect(answers, pos.step, pos.location, 'The second role, in its own words.');
      continue;
    }
    // The LAST option, not the first — the first role took the first option,
    // so this makes every answer on the second record visibly different.
    answers = applyAnswer(
      answers,
      pos.step,
      pos.location,
      pos.step.kind === 'chips'
        ? (pos.step.options?.[pos.step.options.length - 1]?.v ?? 'x')
        : 'The second role, in its own words.',
    );
  }
  return answers;
}

async function openPanel(context: BrowserContext, sw: Worker, id: string, answers: Answers): Promise<Page> {
  await sw.evaluate(async (value) => {
    await chrome.storage.local.set({ 'wb:answers': value });
  }, answers);
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V1.7 VB-34's splash covers the panel for its dwell; any input skips it.
  await page.keyboard.press('Escape');
  await expect(page.locator('.splash')).toHaveCount(0);
  return page;
}

/** Home → the list of roles, people and projects. */
async function openMultiples(page: Page): Promise<void> {
  await page.getByRole('button', { name: new RegExp(S.multiplesTitle) }).click();
  await page.waitForSelector('.multiples');
}

function group(page: Page, title: string) {
  return page.locator('.multiples-group').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
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
  const input = page.locator('.flow input.field');
  const pills = page.locator('.flow .pillgroup .pill:not(.pill-add)');
  if (await textarea.count()) await textarea.first().fill('An answer typed on this screen.');
  else if (await pills.count()) await pills.first().click();
  else if (await input.count()) await input.first().fill('An answer typed on this screen.');
  await next(page);
}

/**
 * Answers whatever the interview asks until ONE record holds every one of its
 * fields — declining any other block's "another?" along the way.
 *
 * The detour is real, not a test artifact: a deep link parks somebody inside
 * one record, and the moment they answer it the flow derives the next thing
 * left to do anywhere, which for a finished file is the roles loop asking
 * whether there is another. Saying no is what a person does there, so that is
 * what this does. Storage is the oracle for "finished", rather than the screen
 * — the point of the walk is what ends up written down.
 */
async function finishRecord(
  page: Page,
  sw: Worker,
  blockId: string,
  index: number,
  fieldIds: string[],
): Promise<void> {
  for (let guard = 0; guard < 24; guard++) {
    const record = (await storedAnswers(sw)).repeatables[blockId]?.[index] ?? {};
    if (fieldIds.every((id) => id in record)) return;
    if ((await page.locator('.flow').getAttribute('data-position')) === 'add-another') {
      await page.getByRole('button', { name: S.no, exact: true }).click();
      await next(page);
      continue;
    }
    await answerCurrent(page);
  }
  throw new Error(`${blockId}[${index}] never collected all of its answers`);
}

/** The drawer, open as far as it goes — the WAI-ARIA window-splitter keys the
 * handle implements (see tests/e2e/file-tree.spec.ts, same helper). */
async function openDrawer(page: Page): Promise<void> {
  const handle = page.locator('.filedrawer-handle');
  await handle.focus();
  await page.keyboard.press('End');
  await expect(handle).toHaveAttribute('aria-valuenow', (await handle.getAttribute('aria-valuemax'))!);
}

/** Navigates to a section's first question through the drawer's own tree —
 * the only way back to an earlier question from a deep link, and a real one.
 * `under` names a parent section whose disclosure has to be open first (the
 * list is an accordion, V1.6 VB-33). */
async function navigateToSection(
  page: Page,
  nodeId: string,
  expectStepId: string,
  under?: string,
): Promise<void> {
  await openDrawer(page);
  if (under) {
    const toggle = page.locator(`.filetree-row[data-node-id="${under}"] .filetree-toggle`);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  await page.locator(`.filetree-row[data-node-id="${nodeId}"] .filetree-nav`).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', expectStepId);
}

async function storedAnswers(sw: Worker): Promise<Answers> {
  return (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers'))['wb:answers'])) as Answers;
}

test.describe('VB-38 — the list of roles, people and projects', () => {
  test('Home offers it once there is more than one of something, and it lists what the file holds', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());

    const row = page.getByRole('button', { name: new RegExp(S.multiplesTitle) });
    await expect(row).toBeVisible();
    // One role, one entity, one initiative.
    await expect(row).toContainText(S.multiplesCount(3));

    await openMultiples(page);
    const titles = await page.locator('.multiples-group-title').allTextContents();
    // The file's own section names, not new ones invented for this screen.
    expect(titles).toEqual(['Roles', 'My World', 'Initiatives']);

    const roles = group(page, 'Roles');
    await expect(roles.locator('.filerow')).toHaveCount(1);
    await expect(roles.locator('.filerow .nm')).toHaveText('Employee');
    await expect(roles.locator('.filerow .sb')).toHaveText(S.multipleAnswered(4, 4));

    await context.close();
  });

  test('a fresh install is not offered a list of nothing', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, {
      values: {},
      repeatables: {},
      answeredAt: {},
      reflectedAt: {},
    });
    await expect(page.getByRole('button', { name: new RegExp(S.multiplesTitle) })).toHaveCount(0);
    await context.close();
  });

  /**
   * THE test for the seeded block. Everything else here is setup for it.
   */
  test('a role added here survives its seed question being re-submitted, with all of its answers', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());
    await openMultiples(page);

    // The name is asked in the interview's own words — the roles loop's own
    // naming question, not a new one written for this screen.
    const roles = group(page, 'Roles');
    await roles.getByRole('button', { name: S.multipleAddTo('Roles') }).click();
    await expect(roles.locator('label')).toHaveText('What do you call this role?');

    await roles.locator('input').fill(NEW_ROLE);
    await roles.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();

    // Straight into the interview, parked on the new role's first question.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');

    // Both writes, together — this pair is the whole reason the record lives
    // through what happens next.
    const afterAdd = await storedAnswers(sw);
    expect(afterAdd.values.role_names).toEqual(['employee', NEW_ROLE]);
    expect(afterAdd.repeatables.roles).toHaveLength(2);
    expect(afterAdd.repeatables.roles?.[1]).toEqual({ role_name: NEW_ROLE });

    await finishRecord(page, sw, 'roles', 1, ['role_for', 'role_mandate', 'role_standing', 'role_durability']);
    const before = (await storedAnswers(sw)).repeatables.roles?.[1];
    expect(Object.keys(before ?? {}).sort()).toEqual([
      'role_durability',
      'role_for',
      'role_mandate',
      'role_name',
      'role_standing',
    ]);

    // Back to the seed question the way a person would get there — the
    // drawer's own "2.1 Roles" row.
    await navigateToSection(page, 'sec2-1', 'role_names', 'sec2');

    // It is ON the list and shown as picked, not selected behind a row of
    // pills that does not include it. Exact and case-sensitive: one built-in
    // option is "Volunteer / Board Member", which a loose match would find.
    const addedPill = page.locator('.flow .pillgroup .pill').filter({ hasText: new RegExp(`^${NEW_ROLE}$`) });
    await expect(addedPill).toHaveCount(1);
    await expect(addedPill).toHaveAttribute('aria-pressed', 'true');

    // Next, with nothing changed. This is the press that used to delete it.
    await next(page);
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'role_names');

    const after = await storedAnswers(sw);
    expect(after.values.role_names).toEqual(['employee', NEW_ROLE]);
    expect(after.repeatables.roles).toHaveLength(2);
    expect(after.repeatables.roles?.[1]).toEqual(before);

    await context.close();
  });

  /**
   * The same walk for an OPEN-ENDED block, which grows by a different
   * mechanism and so gets its own proof.
   */
  test('a person added here survives the gate above them being re-answered, with all of their answers', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());
    await openMultiples(page);

    // Its name question is the block's own first question, verbatim.
    const world = group(page, 'My World');
    await world.getByRole('button', { name: S.multipleAddTo('My World') }).click();
    await expect(world.locator('label')).toHaveText("What's their name — or its name, if this is a tool or team?");

    await world.locator('input').fill(NEW_ENTITY);
    await world.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();

    // The name was just given, so the interview opens on the next thing it
    // does not know — not on the question that was answered a second ago.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'entity_type');

    const afterAdd = await storedAnswers(sw);
    expect(afterAdd.repeatables.entities).toHaveLength(2);
    expect(afterAdd.repeatables.entities?.[1]).toEqual({ entity_name: NEW_ENTITY });

    await finishRecord(page, sw, 'entities', 1, [
      'entity_type',
      'entity_relevance',
      'entity_aliases',
    ]);
    const before = (await storedAnswers(sw)).repeatables.entities?.[1];
    expect(Object.keys(before ?? {}).sort()).toEqual([
      'entity_aliases',
      'entity_name',
      'entity_relevance',
      'entity_type',
    ]);

    await navigateToSection(page, 'sec3', 'entities_gate');
    await next(page);
    await expect(page.locator('.flow')).not.toHaveAttribute('data-step-id', 'entities_gate');

    const after = await storedAnswers(sw);
    expect(after.repeatables.entities).toHaveLength(2);
    expect(after.repeatables.entities?.[1]).toEqual(before);

    await context.close();
  });

  test('opening a record edits that record and no other', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = twoRoles();
    const page = await openPanel(context, sw, id, seeded);
    await openMultiples(page);

    const roles = group(page, 'Roles');
    await expect(roles.locator('.filerow')).toHaveCount(2);
    await expect(roles.locator('.filerow .nm').nth(1)).toHaveText(NEW_ROLE);

    // The SECOND row. It opens at the record's first question, carrying that
    // record's own stored answer — which is a different option from the first
    // record's, so this proves which record was opened.
    await roles.locator('.filerow').nth(1).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');
    const chosen = seeded.repeatables.roles?.[1]?.role_for as string;
    const roleFor = rolesBlock.fields.find((f) => f.id === 'role_for')!;
    const chosenLabel = roleFor.options!.find((o) => o.v === chosen)!.l;
    await expect(page.locator('.flow .pillgroup .pill[aria-pressed="true"]')).toHaveText(chosenLabel);

    // Change it, and check the neighbour never moved.
    const other = page.locator('.flow .pillgroup .pill:not(.pill-add)').first();
    await other.click();
    await next(page);

    const after = await storedAnswers(sw);
    expect(after.repeatables.roles?.[0]).toEqual(seeded.repeatables.roles?.[0]);
    expect(after.repeatables.roles?.[1]?.role_name).toBe(NEW_ROLE);
    expect(after.repeatables.roles?.[1]?.role_for).not.toBe(chosen);
    // Every other answer on the edited record is untouched.
    expect(after.repeatables.roles?.[1]?.role_mandate).toBe(seeded.repeatables.roles?.[1]?.role_mandate);

    await context.close();
  });

  test('a name already on the list is refused, with a reason on screen, and nothing is written', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());
    await openMultiples(page);

    // Blank first: the field is open and empty, and the confirm says what to do.
    const roles = group(page, 'Roles');
    await roles.getByRole('button', { name: S.multipleAddTo('Roles') }).click();
    await roles.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();
    await expect(roles.locator('[role="alert"]')).toHaveText(S.errNeedAName);
    await expect(page.locator('.multiples')).toBeVisible();

    // Then a duplicate, in a different case — the name is how a record is
    // found again, so "employee" and "Employee" are one name.
    await roles.locator('input').fill('employee');
    await roles.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();
    await expect(roles.locator('[role="alert"]')).toHaveText(S.errNameTaken);
    await expect(page.locator('.multiples')).toBeVisible();
    await expect(roles.locator('.filerow')).toHaveCount(1);

    const stored = await storedAnswers(sw);
    expect(stored.repeatables.roles).toHaveLength(1);
    expect(stored.values.role_names).toEqual(['employee']);

    await context.close();
  });

  test('an open-ended duplicate is refused too, so two rows can never read the same', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());
    await openMultiples(page);

    const world = group(page, 'My World');
    const existing = await world.locator('.filerow .nm').first().textContent();
    await world.getByRole('button', { name: S.multipleAddTo('My World') }).click();
    await world.locator('input').fill((existing ?? '').toUpperCase());
    await world.getByRole('button', { name: S.multipleAddConfirm, exact: true }).click();

    await expect(world.locator('[role="alert"]')).toHaveText(S.errNameTaken);
    expect((await storedAnswers(sw)).repeatables.entities).toHaveLength(1);

    await context.close();
  });

  test('the whole screen works from the keyboard alone, and the way back is a control', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // Home → the list, by keyboard.
    await page.getByRole('button', { name: new RegExp(S.multiplesTitle) }).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.multiples');

    // Open a group's field, type into it, and submit with Enter — never
    // touching the mouse.
    const roles = group(page, 'Roles');
    await roles.getByRole('button', { name: S.multipleAddTo('Roles') }).focus();
    await page.keyboard.press('Enter');
    const field = roles.locator('input');
    await expect(field).toBeVisible();
    // Nothing stole focus when the field appeared.
    await expect(field).not.toBeFocused();
    await field.focus();
    await page.keyboard.type(NEW_ROLE);
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'role_for');

    await context.close();
  });

  test('the way back to Home is on the screen, and it goes there', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());
    await openMultiples(page);
    await page.getByRole('button', { name: S.backToFiles, exact: true }).click();
    await expect(page.locator('.home')).toBeVisible();
    await context.close();
  });

  test('every control clears 44px, and nothing runs off a 400px panel', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, sw, id, completedInterview());
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openMultiples(page);
    await group(page, 'Roles').getByRole('button', { name: S.multipleAddTo('Roles') }).click();

    const boxes = await page.locator('.multiples button, .multiples input').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { w: r.width, h: r.height, left: r.left, right: r.right, text: (el.textContent ?? '').slice(0, 24) };
      }),
    );
    expect(boxes.length).toBeGreaterThan(4);
    for (const box of boxes) {
      expect.soft(box.h, `height of "${box.text}"`).toBeGreaterThanOrEqual(44);
      expect.soft(box.left, `left of "${box.text}"`).toBeGreaterThanOrEqual(0);
      expect.soft(box.right, `right of "${box.text}"`).toBeLessThanOrEqual(400);
    }

    // The page itself never scrolls sideways.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await context.close();
  });
});
