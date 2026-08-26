import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * V1.2 VB-09 — the dev-only reset.
 *
 * Accept (docs/V1.2-REFINEMENT.md): "works in `npm run dev`; a `grep` of the
 * production bundle finds no trace of it; the audit still passes."
 *
 * Two tests, one per half of that:
 *
 *  1. The **development** build really resets. `npm run dev`'s defining
 *     property is `import.meta.env.DEV === true`, which `vite build` also
 *     produces when NODE_ENV is development — so this builds the extension
 *     that way into test-results/ and drives the real panel, with real
 *     chrome.storage in both areas. That is a stronger check than a dev
 *     server could give: the dev server serves modules over HTTP, where an
 *     unpacked extension is what a person actually loads while dogfooding.
 *
 *  2. The **production** build contains no trace. Greps every emitted chunk
 *     for the literals only this feature could have put there, with a
 *     positive control so the test cannot pass by scanning nothing.
 *
 * Self-contained, per this repo's e2e convention (see home.spec.ts).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const DEV_DIST_REL = path.join('test-results', 'dev-extension');
const DEV_DIST = path.join(ROOT, DEV_DIST_REL);

/**
 * Every string this feature puts into a bundle. If any of these turns up in
 * dist/, the dead-code elimination the whole design rests on has stopped
 * working — which is exactly the kind of silent regression a bundler upgrade
 * causes. Property names survive minification, and so do string literals;
 * function names do not, which is why none are listed here.
 */
const DEV_ONLY_LITERALS = [
  'KeyR', // core/dev/resetChord.ts — the chord's physical key
  'Ctrl+Alt+Shift+R', // core/dev/resetChord.ts — DEV_RESET_CHORD_LABEL
  '[workbrain] dev reset', // src/panel/devReset.ts — its log line
  'storage.sync.clear', // core/storage/reset.ts — the sync wipe
  'storage.local.clear', // core/storage/reset.ts — the local wipe
];

function jsChunks(dir: string): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|mjs|html|json)$/.test(entry))
        out.push({ file: path.relative(dir, full), source: readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out;
}

async function launch(extensionDir: string): Promise<{ context: BrowserContext; sw: Worker; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
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
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

/** One real answer is enough for Home to stop showing the welcome state. */
const SEEDED_ANSWERS = {
  values: { orientation_ready: null },
  repeatables: {},
  answeredAt: { orientation_ready: '2026-01-01T00:00:00.000Z' },
  reflectedAt: {},
};

const SEEDED_PREFS = {
  narrator: false,
  mic: false,
  reducedMotion: 'system',
  handoff: 'manual',
  packUrls: [],
};

test.describe('VB-09 · dev-only reset', () => {
  test('in a development build the chord clears both storage areas and lands back on welcome, with no reopen', async () => {
    // `vite build` with NODE_ENV=development is the one thing that makes
    // `import.meta.env.DEV` true in an emitted bundle — plain
    // `--mode development` is not enough, Vite forces NODE_ENV=production
    // for the build command. Into test-results/, which is already gitignored.
    execFileSync(
      path.join(ROOT, 'node_modules', '.bin', 'vite'),
      ['build', '--mode', 'development', '--outDir', DEV_DIST_REL, '--emptyOutDir'],
      { cwd: ROOT, env: { ...process.env, NODE_ENV: 'development' }, stdio: 'pipe' },
    );

    // Sanity: the build we are about to drive really does contain the chord.
    // Without this, a build that silently stripped it would make the reset
    // assertions below unfalsifiable.
    const devChunks = jsChunks(DEV_DIST);
    expect(devChunks.some((c) => c.source.includes('Ctrl+Alt+Shift+R'))).toBe(true);

    const { context, sw, id } = await launch(DEV_DIST);

    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), SEEDED_ANSWERS);
    await sw.evaluate((p) => chrome.storage.sync.set({ 'wb:prefs': p }), SEEDED_PREFS);
    expect(await sw.evaluate(() => chrome.storage.local.get(null))).toHaveProperty('wb:answers');
    expect(await sw.evaluate(() => chrome.storage.sync.get(null))).toHaveProperty('wb:prefs');

    const page = await openPanel(context, id);
    // Seeded answers mean Home is past the welcome state — the state the
    // reset has to get back to.
    await expect(page.locator('.home-welcome')).toHaveCount(0);

    // Go one surface deeper, into the interview, so the reset is proven from
    // where a person actually is when they want one — mid-flow, not sitting
    // on Home. Also puts real focus somewhere inside the tree.
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    // V1.7 VB-37: the file row opens the FILE, and the file view is where the
    // interview is entered from — see src/panel/surfaces/FileView.tsx.
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await expect(page.locator('.flow')).toBeVisible();

    // The chord itself, from the keyboard, exactly as a person would press it.
    await page.keyboard.press('Control+Alt+Shift+KeyR');

    // --- back to the welcome screen on its own: no reopen, no navigation
    // by the test, and demonstrably a different document than the one that
    // was mid-flow a moment ago ---
    await expect(page.locator('.home-welcome')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'Teach AI who you are, once.' })).toBeVisible();
    await expect(page.locator('.flow')).toHaveCount(0);

    // --- and both storage areas are genuinely empty, not just local ---
    expect(await sw.evaluate(() => chrome.storage.local.get(null))).toEqual({});
    expect(await sw.evaluate(() => chrome.storage.sync.get(null))).toEqual({});

    await context.close();
  });

  test('the production bundle contains no trace of the reset, and still behaves normally', async () => {
    // dist/ is the artifact `npm run build` just produced — the same bytes
    // every other e2e spec loads.
    const chunks = jsChunks(DIST);
    expect(chunks.length).toBeGreaterThan(0);

    // Positive control: prove the grep can find something in these files at
    // all, so "no matches" means absence and not a bad path or empty read.
    expect(chunks.some((c) => c.source.includes('Teach AI who you are, once.'))).toBe(true);

    for (const literal of DEV_ONLY_LITERALS) {
      const found = chunks.filter((c) => c.source.includes(literal)).map((c) => c.file);
      expect(found, `"${literal}" leaked into the production bundle: ${found.join(', ')}`).toEqual([]);
    }

    // The panel still works with the branch gone — a reset chord that was
    // stripped must be inert, not broken. Pressing it in production does
    // nothing at all, and storage survives.
    const { context, sw, id } = await launch(DIST);
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), SEEDED_ANSWERS);

    const page = await openPanel(context, id);
    await expect(page.locator('.home-welcome')).toHaveCount(0);

    await page.keyboard.press('Control+Alt+Shift+KeyR');
    await page.waitForTimeout(600);

    await expect(page.locator('.home')).toBeVisible();
    await expect(page.locator('.home-welcome')).toHaveCount(0);
    expect(await sw.evaluate(() => chrome.storage.local.get(null))).toHaveProperty('wb:answers');

    await context.close();
  });
});
