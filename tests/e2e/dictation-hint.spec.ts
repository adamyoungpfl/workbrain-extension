import { test, expect, chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DICTATION_STEP_ID } from '../../src/core/flow/dictation';

/**
 * V1.8 VB-49 — point at the dictation the person already has. Do not build a
 * microphone.
 *
 * Accept (docs/V1.8-REFINEMENT.md): "the hint names the correct shortcut per
 * platform; appears on the right question only; dismissible and stays
 * dismissed; no microphone code, no `getUserMedia`, no `SpeechRecognition`, no
 * new permission (assert this — grep the built bundle); copy holds the
 * reading-level check."
 *
 * The last one is `npm run audit`'s job and runs on every build. The rest are
 * here, and the grep is the important one: a hint that quietly grew a
 * microphone would still pass every behavioural test in this file, so the
 * built bundle is searched for every API that could capture audio — the same
 * technique tests/e2e/dev-reset.spec.ts uses to prove the reset chord never
 * ships, with the same positive control so it cannot pass by scanning
 * nothing.
 *
 * Self-contained launch helpers, per this repo's standalone-spec convention.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = process.env.WB_E2E_DIST ?? path.join(ROOT, 'dist');

/**
 * Every string that would mean this product had started capturing audio.
 *
 * Property names and string literals both survive minification, which is what
 * makes this worth doing; function names do not, so none are listed. Each one
 * is here because VB-49 rules it out by name, or because it is the obvious
 * next thing somebody reaches for.
 */
const CAPTURE_APIS = [
  'getUserMedia', // the prompt that cannot render in a side panel
  'SpeechRecognition', // sends audio to a Google service by default
  'webkitSpeechRecognition',
  'audioCapture', // gated to platform apps and a Google allowlist
  'mediaDevices',
  'MediaRecorder',
  'AudioContext',
  'processLocally', // Chrome 139's experimental on-device flag
];

function bundleFiles(dir: string): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|mjs|html|json|css)$/.test(entry))
        out.push({ file: path.relative(dir, full), source: readFileSync(full, 'utf8') });
    }
  };
  walk(dir);
  return out;
}

async function launchExtension(): Promise<{ context: BrowserContext; id: string }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));

  // V2.3 VB-93: the interview now opens on the goal gate. This spec's
  // subject sits past it, so the walk-in seeds a passed gate — the same two
  // answers a person gives at minute one — and lands where it always did.
  // Write-once: a reopen through this path must never wipe what the panel
  // has written since.
  await sw.evaluate(async () => {
    const existing = await chrome.storage.local.get('wb:answers');
    if (existing['wb:answers']) return;
    const now = new Date().toISOString();
    await chrome.storage.local.set({
      'wb:answers': {
        values: { goal_service: 'chatgpt', goal_want: 'Draft my Monday status update the way I would.' },
        repeatables: {},
        answeredAt: { goal_service: now, goal_want: now },
        reflectedAt: { goal_want: now },
      },
    });
  });
  const id = new URL(sw.url()).host;
  return { context, id };
}

const AGENTS = {
  mac: ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/139.0.0.0 Safari/537.36', 'MacIntel'],
  windows: ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/139.0.0.0 Safari/537.36', 'Win32'],
  linux: ['Mozilla/5.0 (X11; Linux x86_64) Chrome/139.0.0.0 Safari/537.36', 'Linux x86_64'],
} as const;

/**
 * Open the panel as if the person were on `platform`.
 *
 * The override goes in before any of the panel's own code runs, so what is
 * being tested is the real detection in the real bundle reading a real
 * `navigator` — the machine running the suite is only ever one of the three.
 */
async function openPanel(
  context: BrowserContext,
  id: string,
  platform: keyof typeof AGENTS = 'mac',
): Promise<Page> {
  /* 4v: drop the held place (wb:resume) so this walk-in lands the way the
     suite's claims have always assumed - a fresh derive. Resume itself is
     proved end-to-end in resume.spec.ts. */
  {
    const heldSw = context.serviceWorkers()[0];
    if (heldSw) await heldSw.evaluate(() => chrome.storage.session.remove('wb:resume'));
  }
  const page = await context.newPage();
  await page.addInitScript(([userAgent, platformName]) => {
    Object.defineProperty(navigator, 'userAgent', { get: () => userAgent });
    Object.defineProperty(navigator, 'platform', { get: () => platformName });
  }, AGENTS[platform]);
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  return page;
}

/** Home -> the interview -> the question VB-49 puts the hint on. */
async function reachTheQuestion(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Context\.md/ }).click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  // V2.3 VB-90: the seeded walk-in skips the ladder and the gate, opening
  // on context_scope — one answer from the hint's question.
  if ((await page.locator('.flow').getAttribute('data-step-id')) === 'context_scope') {
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
  }
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', DICTATION_STEP_ID);
}

const hint = (page: Page) => page.locator('.dictation');

test.describe('VB-49 — the dictation hint', () => {
  test('names the Mac shortcut, under the box it is about', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id, 'mac');
    await reachTheQuestion(page);

    await expect(hint(page)).toHaveCount(1);
    // V2.1 fixed this line's copy — it asserted "Press the Fn key twice",
    // which promised a shortcut that ships off, is remappable, and is
    // commonly claimed by other dictation apps. The claim now is the fix's
    // own shape: the setting is named, the shortcut is hedged, and it is
    // still the Mac line and not the Windows one.
    await expect(hint(page)).toContainText('Turn on Dictation in Settings');
    await expect(hint(page)).not.toContainText('Windows');

    // Under the field, not floating beside the question: it is about the box.
    const boxes = await page.evaluate(() => {
      const field = document.querySelector('.flow textarea.field') as HTMLElement;
      const note = document.querySelector('.dictation') as HTMLElement;
      const dismiss = document.querySelector('.dictation-dismiss') as HTMLElement;
      return {
        field: field.getBoundingClientRect(),
        note: note.getBoundingClientRect(),
        dismiss: dismiss.getBoundingClientRect(),
      };
    });
    expect(boxes.note.top).toBeGreaterThanOrEqual(boxes.field.bottom - 1);
    expect(boxes.note.top - boxes.field.bottom).toBeLessThan(24);
    // The dismiss is a real target (docs/GUARDRAILS.md).
    expect(boxes.dismiss.height).toBeGreaterThanOrEqual(44);
    expect(boxes.dismiss.width).toBeGreaterThanOrEqual(44);

    await context.close();
  });

  test('names the Windows shortcut on Windows', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id, 'windows');
    await reachTheQuestion(page);

    await expect(hint(page)).toContainText('Press the Windows key and H');
    await expect(hint(page)).not.toContainText('Fn');

    await context.close();
  });

  test('says nothing where there is no built-in dictation to point at', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id, 'linux');
    await reachTheQuestion(page);

    await expect(hint(page)).toHaveCount(0);

    await context.close();
  });

  test('appears on that question and on no other', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id, 'mac');

    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.flow');

    // The question before it (VB-90: the seeded walk-in opens here).
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    await expect(hint(page)).toHaveCount(0);

    // The one it is on.
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', DICTATION_STEP_ID);
    await expect(hint(page)).toHaveCount(1);

    // ...and the next text question after it has none.
    await page.locator('.flow textarea.field').fill('The same three paragraphs about my team.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(hint(page)).toHaveCount(0);

    await context.close();
  });

  test('dismisses on the press, and stays dismissed after the panel is closed', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id, 'mac');
    await reachTheQuestion(page);

    // Keyboard, since that is the harder path: it is in the tab order after
    // the field, and it is a real button.
    await page.locator('.dictation-dismiss').focus();
    await expect(page.locator('.dictation-dismiss')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(hint(page)).toHaveCount(0);
    // Nothing else moved: the field is still there, still empty, still theirs.
    await expect(page.locator('.flow textarea.field')).toHaveValue('');

    // The panel document is destroyed when the side panel closes, so "never
    // again" has to survive a reload rather than a re-render.
    const second = await openPanel(context, id, 'mac');
    await reachTheQuestion(second);
    await expect(hint(second)).toHaveCount(0);

    await context.close();
  });

  test('goes for good the moment they type, without being dismissed', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id, 'mac');
    await reachTheQuestion(page);
    await expect(hint(page)).toHaveCount(1);

    await page.locator('.flow textarea.field').click();
    await page.keyboard.type('The');
    await expect(hint(page)).toHaveCount(0);

    // Clearing the box does not bring it back — they have typed, and VB-49
    // says once is once.
    await page.locator('.flow textarea.field').fill('');
    await expect(hint(page)).toHaveCount(0);

    const second = await openPanel(context, id, 'mac');
    await reachTheQuestion(second);
    await expect(hint(second)).toHaveCount(0);

    await context.close();
  });

  test('never takes focus, and axe finds nothing wrong with it', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id, 'mac');
    await reachTheQuestion(page);
    await expect(hint(page)).toHaveCount(1);

    // It arrives with the screen. It does not interrupt, and it is not a live
    // region — there is nothing to announce that reading order does not carry.
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY');
    expect(await page.locator('.dictation [aria-live]').count()).toBe(0);

    const results = await new AxeBuilder({ page })
      .disableRules(['region', 'page-has-heading-one', 'landmark-one-main'])
      .withRules(['color-contrast', 'target-size', 'button-name'])
      .analyze();
    expect(results.violations).toEqual([]);
    expect(results.passes.some((p) => p.id === 'color-contrast')).toBe(true);

    await context.close();
  });

  // ── the part that matters most: there is no microphone ────────────────

  test('the built bundle contains no audio capture of any kind', () => {
    const files = bundleFiles(DIST);
    expect(files.length).toBeGreaterThan(3);

    // The control: the hint's own copy IS in there, so this is searching the
    // real bundle and not an empty directory or the wrong folder. (V2.1: the
    // Mac marker tracks the rewritten line — see strings.ts's dictationMac.)
    const scripts = files.filter((f) => f.file.endsWith('.js'));
    expect(scripts.some((f) => f.source.includes('Turn on Dictation in Settings'))).toBe(true);
    expect(scripts.some((f) => f.source.includes('Press the Windows key and H'))).toBe(true);

    for (const api of CAPTURE_APIS) {
      const found = files.filter((f) => f.source.includes(api)).map((f) => f.file);
      expect(found, `${api} is in the shipped bundle — VB-49 rules it out`).toEqual([]);
    }
  });

  test('the manifest still asks for nothing but storage and the side panel', () => {
    const manifest = JSON.parse(readFileSync(path.join(DIST, 'manifest.json'), 'utf8')) as {
      permissions: string[];
      optional_permissions?: string[];
      host_permissions?: string[];
    };
    expect([...manifest.permissions].sort()).toEqual(['sidePanel', 'storage']);
    /* 5c: Tier 1 built - `scripting` is OPTIONAL, asked by the Go press
       alongside its one origin, never at install. The install ask stays
       exactly two lines. */
    expect(manifest.optional_permissions ?? []).toEqual(['scripting']);
    expect(manifest.host_permissions ?? []).toEqual([]);
  });
});
