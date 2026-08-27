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
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed. These
  // tests are about Home, and before this line their first click would have
  // been the dismissal rather than the press they meant.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
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
        // By id, not by `seedFrom`: V2.0 VB-64 added a second seeded block
        // (`audiences`), and "the last seeded block wins" would have quietly
        // built this fixture's role records into the wrong one.
        if (node.id === 'roles') rolesBlock = node;
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

    // V1.4 VB-20: finishing a role's last question now ends the roles loop by
    // asking whether there is another one. There isn't — say so, keyboard-only
    // like everything else here, and the flow carries on exactly as before.
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');
    await page.getByRole('button', { name: 'No', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');

    // Every other question in the fixture was already answered, so this
    // was the only thing left — Flow hands back to Home on its own.
    // V2.8 VB-132a: the all-current banner is gone (redundant beside the
    // card's own status) — the quiet state is genuinely quiet, and the
    // card says Current.
    await expect(page.locator('.home')).toBeVisible();
    await expect(page.getByText('Your file is current')).toHaveCount(0);
    await expect(page.getByText('One part of your file is out of date')).toHaveCount(0);
    await expect(page.locator('.home-recs')).toHaveClass(/is-quiet/);
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

    // V1.1 VB-01 replaced the old "You have not started yet." card with the
    // welcome lockup — covered in full by the welcome test below.
    await expect(page.getByRole('button', { name: 'Start with a few questions', exact: true })).toBeVisible();
    await expect(page.getByText('New here? If you already made a file, bring it with you.')).toBeVisible();
    // V2.6 VB-125c: the import door lives in the Move-file sheet now — one
    // tile press deep, still one press from Home.
    await page.getByRole('button', { name: 'Move file', exact: true }).click();
    await expect(page.getByRole('button', { name: 'I already have a file', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // No due/current banner, and nothing to prove yet — the proof tile is
    // there (the row is the map) but genuinely disabled, the same gate that
    // used to hide the button.
    await expect(page.getByRole('button', { name: 'Prove it works', exact: true })).toBeDisabled();

    await context.close();
  });

  // ────────────────────────────────────────────────────────── V1.1 VB-01
  test('with empty storage the welcome state renders the mark, the wordmark and the CTA, and the CTA really starts the interview', async () => {
    const { context, sw, id } = await launchExtension();
    // Explicit rather than assumed: this is the "nothing has ever been
    // answered" case, which is the only one that shows this screen.
    const before = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    expect(before['wb:answers']).toBeUndefined();

    const page = await openPanel(context, id);
    const welcome = page.locator('.home-welcome');
    await expect(welcome).toBeVisible();

    // --- the mark: really drawn, really sized, and really the node graph ---
    const mark = welcome.locator('svg.brand-mark');
    await expect(mark).toBeVisible();
    await expect(mark.locator('circle')).toHaveCount(12);
    await expect(mark.locator('line')).toHaveCount(30);
    const markBox = await mark.boundingBox();
    expect(markBox?.width).toBeGreaterThan(48);
    // Decorative — the wordmark beside it is what gets read out.
    await expect(mark).toHaveAttribute('aria-hidden', 'true');
    // Its colours resolve to the real brand tokens, not to nothing. A
    // mistyped custom property name would render the stops black in silence.
    const edgeStroke = await mark.locator('line').first().evaluate((el) => getComputedStyle(el).stroke);
    expect(edgeStroke).toBe('rgb(91, 127, 216)'); // --brand-edge
    const stopColor = await mark
      .locator('.brand-mark-node-1-from')
      .evaluate((el) => getComputedStyle(el).stopColor);
    expect(stopColor).toBe('rgb(47, 95, 230)'); // --brand-node-1-from

    // --- the name and the company: the chrome bar's, once, as real text ---
    // V2.6 VB-125: the welcome's own wordmark and byline left the card; the
    // chrome bar above says both for every Home state, so the brand is said
    // exactly once on this screen.
    const chromeBar = page.locator('.home-chrome');
    await expect(chromeBar).toBeVisible();
    await expect(chromeBar).toContainText('Workbrain');
    await expect(chromeBar).toContainText('Model Citizen');
    await expect(welcome.getByText('by Model Citizen', { exact: true })).toHaveCount(0);

    // --- the meter: present at 0%, the honest map of the journey ---
    const meter = page.locator('.meter');
    await expect(meter).toHaveAttribute('aria-valuenow', '0');
    await expect(meter).toHaveAttribute('aria-valuetext', '0% set up, Step 1 · Name');

    // --- the approved copy, verbatim ---
    await expect(page.getByRole('heading', { name: 'Teach AI who you are, once.' })).toBeVisible();
    await expect(
      page.getByText('Answer some questions. Get a file. Hand it to whatever AI you already use.'),
    ).toBeVisible();
    await expect(
      page.getByText('About fifteen minutes. You can stop anywhere and pick up where you left off.'),
    ).toBeVisible();
    // The two existing lines the redesign keeps.
    await expect(page.getByText('New here? If you already made a file, bring it with you.')).toBeVisible();
    await expect(
      page.getByText('Everything here lives in your browser. No account, nothing sent anywhere.'),
    ).toBeVisible();
    // And the line it replaced is gone.
    await expect(page.getByText('You have not started yet.')).toHaveCount(0);

    // --- one entrance, then nothing. No loop, no rAF, no ticking. ---
    const animation = await mark.evaluate((el) => {
      const s = getComputedStyle(el);
      return { name: s.animationName, count: s.animationIterationCount, fill: s.animationFillMode };
    });
    expect(animation.name).toBe('brand-mark-in');
    expect(animation.count).toBe('1');
    expect(animation.fill).toBe('both');
    // Settled: after the entrance the mark is fully opaque and back to its
    // own size, and stays that way — sampled twice, half a second apart, which
    // is what a rotation or a pulse would fail. (Computed `transform` reads as
    // the identity matrix rather than "none" while an animation with
    // `fill-mode: both` is holding its end frame; identity is the point, not
    // the spelling.)
    const identity = 'matrix(1, 0, 0, 1, 0, 0)';
    await expect(mark).toHaveCSS('opacity', '1');
    const first = await mark.evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(500);
    const second = await mark.evaluate((el) => getComputedStyle(el).transform);
    expect([first, second]).toEqual([identity, identity]);

    // --- keyboard-only: the CTA is reachable and really starts the flow ---
    const cta = page.getByRole('button', { name: 'Start with a few questions', exact: true });
    await cta.focus();
    await expect(cta).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toBeVisible();
    // Question one, not a resume — nothing has been answered.
    await expect(page.locator('.home-welcome')).toHaveCount(0);

    await context.close();
  });

  test('the welcome mark is still fully drawn under prefers-reduced-motion, with its entrance removed', async () => {
    const { context, id } = await launchExtension();
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 400, height: 700 });
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
    // is its keyboard exit, and nothing else about this walk-in changed.
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });

    // Scoped to the welcome card. V1.7 VB-34 put a second mark on the panel —
    // the splash's, on top for the first couple of seconds of a session — and
    // this test is about the welcome screen's own.
    const mark = page.locator('.home-welcome svg.brand-mark');
    await expect(mark).toBeVisible();
    // The still version carries everything the motion did: the whole mark,
    // at full opacity, immediately.
    await expect(mark.locator('circle')).toHaveCount(12);
    await expect(mark).toHaveCSS('animation-name', 'none');
    await expect(mark).toHaveCSS('opacity', '1');
    await expect(page.getByRole('heading', { name: 'Teach AI who you are, once.' })).toBeVisible();

    await context.close();
  });

  test('the welcome state is gone the moment a single answer exists', async () => {
    const { context, sw, id } = await launchExtension();
    // One real answer to the very first question is enough for `computeNextMove`
    // to stop returning 'start' — proving this screen is derived from
    // `wb:answers` and not from a "seen the welcome" flag anywhere.
    await sw.evaluate(() =>
      chrome.storage.local.set({
        'wb:answers': {
          values: { orientation_ready: null },
          repeatables: {},
          answeredAt: { orientation_ready: new Date().toISOString() },
          reflectedAt: {},
        },
      }),
    );

    const page = await openPanel(context, id);
    await expect(page.locator('.home-welcome')).toHaveCount(0);
    await expect(page.getByText('Teach AI who you are, once.')).toHaveCount(0);
    // V2.6 VB-125: the welcome's big mark is gone WITH the welcome, and the
    // file lockup stands in its place — the glyph, "Your work brain", the
    // tagline, and a meta line of real derivables.
    await expect(page.locator('.home-welcome .brand-mark')).toHaveCount(0);
    const lockup = page.locator('.home-lockup');
    await expect(lockup).toBeVisible();
    await expect(lockup.getByRole('heading', { name: 'Your work brain' })).toBeVisible();
    await expect(lockup).toContainText('How you do anything is how your AI does everything.');
    // One answer, stamped today: "1 file · Updated today · 1 KB" — every
    // claim derivable (FLAG 7), none of the template's invented ones.
    await expect(lockup.locator('.home-lockup-meta')).toHaveText('1 file · Updated today · 1 KB');

    await context.close();
  });

  test('every human door is a real external link with no prices on it, not a script-driven button', async () => {
    // V2.6 VB-125c: the "Talk to a person" row became the services card and
    // the TiM tile. The claim survives the clothes: each door is a REAL
    // link, to the site, in a new tab — and none of them prints a dollar
    // figure, because money never enters the extension (NORTH-STAR
    // decision 4; V2.6 decision 3).
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);

    const doors: [RegExp, string][] = [
      [/TiM services/, 'https://www.model-citizen.org/contact'],
      [/AI Coaching/, 'https://www.model-citizen.org/work-brain/ai-coaching'],
      [/Fractional CTO/, 'https://www.model-citizen.org/work-brain/fractional-cto'],
    ];
    for (const [name, href] of doors) {
      const link = page.getByRole('link', { name });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', href);
      await expect(link).toHaveAttribute('target', '_blank');
      await expect(link).toHaveAttribute('rel', /noreferrer/);
    }

    // No price anywhere on the surface — not on the offers, not in a note.
    const text = await page.locator('.home').innerText();
    expect(text).not.toMatch(/\$\s*\d/);
    expect(text.toLowerCase()).not.toMatch(/\/\s*mo\b|per month/);

    await context.close();
  });

  // ────────────────────────────────────────────────────────── V2.6 VB-127
  test('"See what\'s stored" lists exactly what exists, in plain words, and stores nothing about looking', async () => {
    const { context, sw, id } = await launchExtension();
    // Two context answers, one skill, one typed proof score, one hidden
    // suggestion — four rows, each a real count of authored things.
    const now = new Date().toISOString();
    await sw.evaluate(
      (seed) => chrome.storage.local.set(seed),
      {
        'wb:answers': {
          values: { orientation_ready: null, professional_name: 'Ada' },
          repeatables: {},
          answeredAt: { orientation_ready: now, professional_name: now },
          reflectedAt: { professional_name: now },
        },
        'wb:answers:skills': {
          values: {},
          repeatables: { skills: [{ skill_name: 'Weekly status' }] },
          answeredAt: { 'skills#0#skill_name': now },
          reflectedAt: {},
        },
        'wb:report': { scores: [{ service: 'chatgpt', baseline: 4, withContext: 9, at: now }] },
        'wb:recs': { dismissed: { 'stale:sec2': now } },
      },
    );

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: "See what's stored", exact: true }).click();
    const sheet = page.locator('.sheet-card');
    await expect(sheet).toBeVisible();

    // Every row is a count the person could verify; the whole-list claim
    // closes it. No key that does not exist gets a row (no version stamp
    // was seeded, so none is listed).
    await expect(sheet.getByText('Your Context answers — 2')).toBeVisible();
    await expect(sheet.getByText('Skills on your list — 1')).toBeVisible();
    await expect(sheet.getByText('Proof scores you typed — 1')).toBeVisible();
    await expect(sheet.getByText('Suggestions you hid — 1')).toBeVisible();
    await expect(sheet.getByText(/version stamp/)).toHaveCount(0);
    await expect(sheet.getByText('That is the whole list. None of it ever leaves your browser.')).toBeVisible();

    // Looking at the list is not an event: nothing new landed in storage.
    const keys = await sw.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).sort());
    expect(keys).toEqual(['wb:answers', 'wb:answers:skills', 'wb:recs', 'wb:report']);

    await context.close();
  });

  test('on a fresh install the storage sheet says so — "Nothing stored yet."', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);

    await page.getByRole('button', { name: "See what's stored", exact: true }).click();
    const sheet = page.locator('.sheet-card');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Nothing stored yet.')).toBeVisible();
    await expect(sheet.locator('.home-stored-list')).toHaveCount(0);

    await context.close();
  });
});
