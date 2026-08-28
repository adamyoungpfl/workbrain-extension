import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_FORMAT } from '../../src/core/packs/skillsPack';
import type { Answers } from '../../src/schema/storage.types';
import { S } from '../../src/panel/strings';

/**
 * V2.8 VB-133 — the Skill Redeemer, on the real panel with the network
 * intercepted: a live code lands the custom skill through the pack path
 * and says so; an unknown code and a dead network are one calm voice with
 * the sheet still standing and storage untouched; the whole flow is
 * keyboard-walkable and axe-clean. The URL scheme (static pack per code on
 * the site, CORS server-side) is decision 1's — the manifest still asks
 * for nothing beyond storage and sidePanel, which manifest.spec pins.
 */
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const NOW = '2026-08-27T12:00:00.000Z';

const PACK = {
  format: PACK_FORMAT,
  pack: { id: 'pak_custom', name: 'Custom skill', publisher: 'Model Citizen', version: 1, publishedAt: NOW },
  skills: [
    {
      id: 'skl_custom01',
      rev: 1,
      updatedAt: NOW,
      origin: { kind: 'authored' },
      body: { skill_name: 'Board pack prep', skill_steps: '1. Gather. 2. Assemble.' },
    },
  ],
  deleted: [],
};

async function launchHome(): Promise<{ context: BrowserContext; page: Page; sw: Worker }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
    reducedMotion: 'reduce',
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
  await page.waitForSelector('.home');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return { context, page, sw };
}

async function openSheet(page: Page): Promise<void> {
  await page.getByRole('button', { name: S.tileRedeem, exact: true }).click();
  await page.waitForSelector('.redeem');
}

test.describe('VB-133 — the Skill Redeemer', () => {
  test('a live code lands the skill, toasts, and closes the sheet', async () => {
    const { context, page, sw } = await launchHome();
    await context.route('https://www.model-citizen.org/packs/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PACK) }),
    );

    await openSheet(page);
    await page.locator('#redeem-code').fill('wb-1234-abcd');
    await page.getByRole('button', { name: 'Add it to my file', exact: true }).click();

    await expect(page.locator('.toast')).toContainText('Added 1 skill.');
    await expect(page.locator('.redeem')).toHaveCount(0);
    const stored = (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers:skills'))['wb:answers:skills'])) as Answers;
    expect(stored.repeatables['skills']).toHaveLength(1);
    expect(stored.repeatables['skills']![0]!.skill_name).toBe('Board pack prep');
    expect(stored.recordIds?.['skills']?.[0]).toBe('skl_custom01');

    await context.close();
  });

  test('an unknown code is one calm line — the sheet stands, storage untouched', async () => {
    const { context, page, sw } = await launchHome();
    await context.route('https://www.model-citizen.org/packs/**', (route) => route.fulfill({ status: 404, body: '' }));

    await openSheet(page);
    await page.locator('#redeem-code').fill('WB-0000-DEAD');
    await page.getByRole('button', { name: 'Add it to my file', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText("didn't answer");
    await expect(page.locator('.redeem')).toBeVisible();
    // The typed code survives — trying again is free.
    await expect(page.locator('#redeem-code')).toHaveValue('WB-0000-DEAD');
    const stored = await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers:skills'))['wb:answers:skills']);
    expect(stored).toBeUndefined();

    await context.close();
  });

  test('a dead network is the same voice — a plane is not an error', async () => {
    const { context, page } = await launchHome();
    await context.route('https://www.model-citizen.org/packs/**', (route) => route.abort());

    await openSheet(page);
    await page.locator('#redeem-code').fill('WB-1234-ABCD');
    await page.getByRole('button', { name: 'Add it to my file', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText("when you're online");
    await expect(page.locator('.redeem')).toBeVisible();

    await context.close();
  });

  test('a malformed code never touches the network at all', async () => {
    const { context, page } = await launchHome();
    let touched = false;
    await context.route('https://www.model-citizen.org/packs/**', (route) => {
      touched = true;
      return route.abort();
    });

    await openSheet(page);
    await page.locator('#redeem-code').fill('not a code!');
    await page.getByRole('button', { name: 'Add it to my file', exact: true }).click();

    await expect(page.getByRole('alert')).toContainText("doesn't look right");
    expect(touched).toBe(false);

    await context.close();
  });

  test('keyboard-only: Tab to the code, type, Enter redeems — and axe is clean', async () => {
    const { context, page, sw } = await launchHome();
    await context.route('https://www.model-citizen.org/packs/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PACK) }),
    );

    await openSheet(page);
    const results = await new AxeBuilder({ page })
      .include('.sheet-card')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.locator('#redeem-code').focus();
    await page.keyboard.type('WB-1234-ABCD');
    await page.keyboard.press('Enter');
    await expect(page.locator('.toast')).toContainText('Added 1 skill.');
    const stored = (await sw.evaluate(async () => (await chrome.storage.local.get('wb:answers:skills'))['wb:answers:skills'])) as Answers;
    expect(stored.repeatables['skills']).toHaveLength(1);

    await context.close();
  });
});
