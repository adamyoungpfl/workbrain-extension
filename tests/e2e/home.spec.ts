import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DUE_AFTER_DAYS } from '../../src/core/freshness/clocks';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY, ROLE_NAME_SEED_FIELD } from '../../src/core/freshness/nextMove';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';

// R1-12 accept criteria (docs/RELEASE-1.md): "Files with freshness, one
// next-move card, the quiet 'talk to a person' row. Derived entirely —
// nothing about progress is stored. Accept: changing a durability answer
// changes the next move with no other action." See docs/TESTING.md for the
// launchPersistentContext pattern — kept as its own self-contained spec
// file, matching this repo's other e2e specs' own note that each stays
// standalone.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

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
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  return page;
}

/**
 * A fully-answered Context interview (mirroring download-import.spec.ts's
 * and proof.spec.ts's own `buildDoneAnswers`, duplicated per this repo's
 * "each spec file stays self-contained" convention) except for one
 * deliberate wrinkle: the single seeded `roles` record's own
 * `role_durability` answer is real — a genuine "Current" pick — but its
 * `answeredAt` is backdated well past `DUE_AFTER_DAYS`, simulating a role
 * that was current *when answered* and has since gone stale. Every other
 * question, including that same role's other three fields, is answered
 * just now — this is what proves the due signal really is
 * "durability + elapsed time" and not just "everything is old".
 */
function buildAnswersWithOneDueRole(modules: Module[]): { answers: Answers; roleLabel: string } {
  const now = new Date().toISOString();
  const staleAt = new Date(Date.now() - (DUE_AFTER_DAYS + 30) * 24 * 60 * 60 * 1000).toISOString();
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  function stampTop(key: string, value: AnswerValue) {
    values[key] = value;
    answeredAt[key] = now;
    if (typeof value === 'string') reflectedAt[key] = now;
  }

  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;

  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        if (node.seedFrom) rolesBlock = node;
        continue;
      }
      const step = node;
      const key = step.key ?? step.id;

      if (step.id === 'professional_name') {
        stampTop(key, null);
      } else if (step.id === 'entities_gate' || step.id === 'initiatives_gate') {
        stampTop(key, 'no');
      } else if (step.id === 'role_names') {
        roleNamesStep = step;
        stampTop(key, (step.options ?? []).slice(0, 1).map((o) => o.v));
      } else if (step.kind === 'intro') {
        stampTop(key, null);
      } else if (step.kind === 'yesno') {
        stampTop(key, 'yes');
      } else if (step.kind === 'chips') {
        stampTop(key, step.options?.[0]?.v ?? 'x');
      } else if (step.kind === 'multi') {
        stampTop(key, step.options?.length ? [step.options[0]!.v] : []);
      } else {
        stampTop(key, `A test answer for ${step.id}.`);
      }
    }
  }

  let roleLabel = '';
  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    const records = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      roleLabel = label;
      const record: Record<string, AnswerValue> = { [ROLE_NAME_SEED_FIELD]: label };
      for (const field of rolesBlock!.fields) {
        const fk = field.key ?? field.id;
        record[fk] =
          field.id === ROLE_DURABILITY_KEY
            ? 'current' // the real "Current" option's key — core/flow/source.ts
            : field.kind === 'chips'
              ? (field.options?.[0]?.v ?? 'x')
              : `A test answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[rolesBlock.id] = records;
    records.forEach((record, recordIndex) => {
      for (const [fk, v] of Object.entries(record)) {
        if (fk === ROLE_NAME_SEED_FIELD) continue;
        const compound = `${ROLES_BLOCK_ID}#${recordIndex}#${fk}`;
        const at = fk === ROLE_DURABILITY_KEY ? staleAt : now;
        answeredAt[compound] = at;
        if (typeof v === 'string' && fk !== ROLE_DURABILITY_KEY) reflectedAt[compound] = at;
      }
    });
  }

  return { answers: { values, repeatables, answeredAt, reflectedAt }, roleLabel };
}

test.describe('Home surface (R1-12)', () => {
  test('a due role_durability answer drives the next-move card and file badge, its CTA deep-links to the right question, and answering it changes the next move with no other action', async () => {
    const { context, sw, id } = await launchExtension();
    const { answers, roleLabel } = buildAnswersWithOneDueRole(contextModules);
    // Sanity check on the fixture itself, before any of R1-12's own code runs.
    expect(answers.repeatables[ROLES_BLOCK_ID]?.[0]?.[ROLE_DURABILITY_KEY]).toBe('current');
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);

    const page = await openPanel(context, id);

    // --- the next-move card: heading, the reason in the person's own
    // words (no fabricated "said it'd last a year" — see strings.ts's
    // fixed driftBecauseRole), and the file's own "due" badge ---
    await expect(page.getByText('One part of your file is out of date')).toBeVisible();
    await expect(page.getByText(`You said your ${roleLabel} role was current.`)).toBeVisible();
    await expect(page.getByText('1 due')).toBeVisible();
    const cta = page.getByRole('button', { name: 'Answer one question', exact: true });
    await expect(cta).toBeVisible();

    // --- the CTA deep-links straight into the Context flow at
    // role_durability, keyboard-only, not a fresh flow from question one ---
    await cta.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', ROLE_DURABILITY_KEY);
    // The already-given answer is pre-selected, same as any Back navigation.
    // Not `exact: true` — a pressed Pill's accessible name picks up its own
    // "✓" (Pill.css's `::before`), so the real rendered name is "✓ Current".
    await expect(page.getByRole('button', { name: 'Current' })).toHaveAttribute('aria-pressed', 'true');

    // --- answer it "Historical" — R1-12's own accept line: no other
    // action should be needed for the next move to change ---
    await page.getByRole('button', { name: 'Historical', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');

    // Every other question in the fixture was already answered, so this
    // was the only thing left — Flow hands back to Home on its own.
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.getByText('Your file is current')).toBeVisible();
    await expect(page.getByText('Nothing to do. Come back when something changes at work.')).toBeVisible();
    await expect(page.getByText('One part of your file is out of date')).toHaveCount(0);
    await expect(page.getByText('Current', { exact: true })).toBeVisible(); // the file's own badge, now fresh

    // --- storage: the durability answer really did change, nothing else did ---
    const stored = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    const restored = stored['wb:answers'] as Answers;
    expect(restored.repeatables[ROLES_BLOCK_ID]?.[0]?.[ROLE_DURABILITY_KEY]).toBe('historical');
    expect(restored.repeatables[ROLES_BLOCK_ID]?.[0]?.[ROLE_NAME_SEED_FIELD]).toBe(roleLabel);

    await context.close();
  });

  test('the empty state shows the "bring your file" hint and Import still works with nothing answered yet', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);

    await expect(page.getByText('You have not started yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start with a few questions', exact: true })).toBeVisible();
    await expect(page.getByText('New here? If you already made a file, bring it with you.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'I already have a file', exact: true })).toBeVisible();

    // No due/current banner, no "Prove it works" offer — there is nothing to
    // measure or prove yet.
    await expect(page.getByRole('button', { name: 'Prove it works', exact: true })).toHaveCount(0);

    await context.close();
  });

  test('the quiet "talk to a person" row is a real external link, not a script-driven button', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);

    const link = page.getByRole('link', { name: /Talk to a person/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', 'https://www.model-citizen.org/contact');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await context.close();
  });
});
