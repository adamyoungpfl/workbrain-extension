import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PACK_FORMAT } from '../../src/core/packs/skillsPack';
import { contextModules } from '../../src/core/flow/flow';
import type { Answers } from '../../src/schema/storage.types';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';

/**
 * V2.5 VB-124 — the share/backup surface: V3 slice one's core, in front of
 * a person on the SKILLS browse canvas. Pinned here:
 *  - "Save a copy of my skills" downloads the `self` pack, valid envelope,
 *    and the minted ids land back in the store (export is a minting moment);
 *  - "Add skills from a file" imports a pack: new ids append, same ids
 *    update in place, the toast says what happened;
 *  - a file that is not a pack is refused in the degradation voice;
 *  - the row exists ONLY on the skills canvas (Context has no share row);
 *  - axe finds nothing wrong.
 */
const DIST = process.env.WB_E2E_DIST ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const SCRATCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-results/vb124');

const NOW = '2026-08-26T12:00:00.000Z';

/** Context finished, in the standalone-spec convention (proof.spec's shape):
 * the Skills row unlocks only for a BUILT-AND-EARNED Context. */
function doneContext(): Answers {
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;
  const stamp = (key: string, value: AnswerValue) => {
    values[key] = value;
    answeredAt[key] = NOW;
    if (typeof value === 'string') reflectedAt[key] = NOW;
  };
  for (const module of contextModules as Module[]) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        if (node.id === 'roles') rolesBlock = node;
        continue;
      }
      const step = node;
      const key = step.key ?? step.id;
      // Everything gets a REAL answer: a skip keeps its section 'partly'
      // and fileFinished (the Skills row's lock) demands no partly left.
      if (step.id === 'entities_gate' || step.id === 'initiatives_gate') stamp(key, 'no');
      else if (step.id === 'role_names') {
        roleNamesStep = step;
        stamp(key, (step.options ?? []).slice(0, 1).map((o) => o.v));
      } else if (step.kind === 'intro') stamp(key, null);
      else if (step.kind === 'yesno') stamp(key, 'yes');
      else if (step.kind === 'chips') stamp(key, step.options?.[0]?.v ?? 'x');
      else if (step.kind === 'multi') stamp(key, step.options?.length ? [step.options[0]!.v] : []);
      else stamp(key, `A test answer for ${step.id}.`);
    }
  }
  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    repeatables[rolesBlock.id] = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [rolesBlock!.seedFrom!.seedField]: label };
      for (const field of rolesBlock!.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A test answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[rolesBlock.id]!.forEach((record, ri) => {
      for (const fk of Object.keys(record)) {
        answeredAt[`${rolesBlock!.id}#${ri}#${fk}`] = NOW;
        reflectedAt[`${rolesBlock!.id}#${ri}#${fk}`] = NOW;
      }
    });
  }
  return { values, repeatables, answeredAt, reflectedAt };
}

function skillsSeed(): Answers {
  return {
    values: {},
    repeatables: {
      skills: [
        { skill_name: 'Weekly status', skill_trigger: 'Every Friday.', skill_steps: '1. Gather. 2. Draft.', skill_output: 'One page.' },
      ],
    },
    answeredAt: { 'skills#0#skill_trigger': NOW, 'skills#0#skill_steps': NOW },
    reflectedAt: {},
  };
}

async function launchOnSkills(): Promise<{ context: BrowserContext; page: Page; sw: import('@playwright/test').Worker }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion: 'reduce',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  await sw.evaluate(
    async ({ skills, context }) => {
      // Context finished: the Skills row unlocks only for built-and-earned.
      await chrome.storage.local.set({ 'wb:answers:skills': skills, 'wb:answers': context });
    },
    { skills: skillsSeed(), context: doneContext() },
  );
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${(new URL(sw.url())).host}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return { context, page, sw };
}

async function openSkillsCanvas(page: Page): Promise<void> {
  const row = page.getByRole('button', { name: /^Skills\.md/ });
  await row.click();
  await page.waitForSelector('.browse');
}

test.describe('VB-124 — the share/backup surface', () => {
  test('saving downloads the self pack, and the minted ids land back in the store', async () => {
    const { context, page, sw } = await launchOnSkills();
    await openSkillsCanvas(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save a copy of my skills', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('My skills.workbrain-pack.json');

    fs.mkdirSync(SCRATCH, { recursive: true });
    const file = path.join(SCRATCH, 'saved.json');
    await download.saveAs(file);
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(envelope.format).toBe(PACK_FORMAT);
    expect(envelope.pack.publisher).toBe('self');
    expect(envelope.skills).toHaveLength(1);
    expect(envelope.skills[0].body.skill_name).toBe('Weekly status');
    expect(envelope.skills[0].id).toMatch(/^skl_/);

    // Export is a minting moment: the id is now in the store too.
    const stored = (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers:skills'))['wb:answers:skills'])) as Answers;
    expect(stored.recordIds?.skills?.[0]).toBe(envelope.skills[0].id);

    // And the toast says so, politely.
    await expect(page.locator('.toast')).toContainText('Saved');

    await context.close();
  });

  test('adding from a file imports; a second add of the same pack updates in place', async () => {
    const { context, page, sw } = await launchOnSkills();
    await openSkillsCanvas(page);

    fs.mkdirSync(SCRATCH, { recursive: true });
    const packFile = path.join(SCRATCH, 'incoming.json');
    const pack = {
      format: PACK_FORMAT,
      pack: { id: 'pak_team', name: 'Team pack', publisher: 'Dana', version: 1, publishedAt: NOW },
      skills: [
        {
          id: 'skl_teamstatus',
          rev: 1,
          updatedAt: NOW,
          origin: { kind: 'authored' },
          body: { skill_name: 'Team standup notes', skill_steps: '1. Collect. 2. Post.' },
        },
      ],
      deleted: [],
    };
    fs.writeFileSync(packFile, JSON.stringify(pack));

    await page.locator('.skillsshare-input').setInputFiles(packFile);
    await expect(page.locator('.toast')).toContainText('Added 1 skill.');
    let stored = (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers:skills'))['wb:answers:skills'])) as Answers;
    expect(stored.repeatables.skills).toHaveLength(2);
    expect(stored.recordIds?.skills?.[1]).toBe('skl_teamstatus');

    // Same id again, edited body: updates in place, never duplicates.
    pack.skills[0]!.body.skill_steps = '1. Collect. 2. Post. 3. Archive.';
    fs.writeFileSync(packFile, JSON.stringify(pack));
    await page.locator('.skillsshare-input').setInputFiles(packFile);
    await expect(page.locator('.toast')).toContainText('Added 1 skill.');
    stored = (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers:skills'))['wb:answers:skills'])) as Answers;
    expect(stored.repeatables.skills).toHaveLength(2);
    expect(stored.repeatables.skills![1]!.skill_steps).toBe('1. Collect. 2. Post. 3. Archive.');

    await context.close();
  });

  test('a file that is not a pack is refused in the degradation voice', async () => {
    const { context, page } = await launchOnSkills();
    await openSkillsCanvas(page);

    fs.mkdirSync(SCRATCH, { recursive: true });
    const junk = path.join(SCRATCH, 'junk.json');
    fs.writeFileSync(junk, '<html>not a pack</html>');
    await page.locator('.skillsshare-input').setInputFiles(junk);
    await expect(page.locator('.toast')).toContainText('fresh copy');

    await context.close();
  });

  test('the row lives on the skills canvas only, and axe is clean with it there', async () => {
    const { context, page } = await launchOnSkills();

    // Context's canvas: no share row.
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.waitForSelector('.browse');
    await expect(page.locator('.skillsshare')).toHaveCount(0);
    await page.locator('.browse-head').getByRole('button', { name: 'Back', exact: true }).click();
    await page.waitForSelector('.home');

    // Skills': present, named in the person's own verbs, axe-clean.
    await openSkillsCanvas(page);
    await expect(page.locator('.skillsshare')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .include('.browse')
      .exclude('.app-ground')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await context.close();
  });
});
