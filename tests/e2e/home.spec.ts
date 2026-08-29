import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { DUE_AFTER_DAYS } from '../../src/core/freshness/clocks';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY, ROLE_NAME_SEED_FIELD } from '../../src/core/freshness/nextMove';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { S } from '../../src/panel/strings';
import { pastRunCard } from './fixtures/runCard';

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
    // BS-06 (§6) put the price on the verb. One question at the interview's
    // own pace rounds to one minute (core/recommend/estimate.ts).
    const cta = page.getByRole('button', { name: 'Answer one question · 1 min', exact: true });
    await expect(cta).toBeVisible();

    // --- the CTA deep-links straight into the Context flow at
    // role_durability, keyboard-only, not a fresh flow from question one ---
    await cta.focus();
    await page.keyboard.press('Enter');
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
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
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    await expect(page.locator('.flow')).toHaveAttribute('data-position', 'add-another');
    await page.getByRole('button', { name: 'No', exact: true }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');

    // Every other question in the fixture was already answered, so this was
    // the only thing left and the interview finishes here.
    //
    // BS-03a (§3, Adam's P3): finishing Context hands straight into the
    // proof rather than back to Home — "momentum beating a reset". This
    // fixture has never run one, so it fires. The way back to Home is the
    // mark, which is the door VB-112 built for exactly this.
    // BS-05d: a run's payoff card can stand between two questions.
    await pastRunCard(page);
    // BS-05d + BS-03a: the last answer closes a run AND finishes the file,
    // so payoff cards land before the proof does — more than one of them, as
    // a block ending and a run ending can both fall on the same press. Drain
    // whatever stands in the way rather than assuming a fixed number.
    // (Noted in docs/BETA-SPRINT.md as a sequencing question for §5.)
    await expect
      .poll(
        async () => {
          await pastRunCard(page);
          return await page.locator('.flow').getAttribute('data-step-id');
        },
        { timeout: 15_000 },
      )
      .toMatch(/^proof/);
    await page.getByRole('button', { name: S.goHome, exact: true }).click();

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

    await expect(page.getByRole('button', { name: 'Start with a few questions', exact: true })).toBeVisible();
    await expect(page.getByText('New here? If you already made a file, bring it with you.')).toBeVisible();
    // V2.9 VB-145: the import door moved to the top of the UI — an upload
    // control on the chrome bar, opening a sheet that says the one thing
    // that matters (the file you bring in replaces what is here) and offers
    // the careful path beside the quick one.
    await page.getByRole('button', { name: 'Bring in a file', exact: true }).click();
    await expect(page.getByText('The file you bring in replaces what is here now.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download mine first, then pick', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Just pick a file', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    // BS-06 (§6): the dormant tiles are ROWS now, and a waiting row holds no
    // control at all — a disabled button in the tab order is a promise the
    // screen cannot keep. The wait is said in words, in the row.
    const prove = page.locator('.home-row', { hasText: S.proofCta });
    await expect(prove).toHaveClass(/is-waiting/);
    await expect(prove).toContainText(S.tileWaitsOnContext);
    await expect(prove.locator('button, a')).toHaveCount(0);
    await expect(page.locator('.home-row', { hasText: S.tileDownload })).toHaveClass(/is-waiting/);

    await context.close();
  });

  // ────────────────────────────────────────────────────────── V1.1 VB-01
  test('with empty storage the welcome state renders the promise, the cost and the CTA', async () => {
    const { context, sw, id } = await launchExtension();
    // Explicit rather than assumed: this is the "nothing has ever been
    // answered" case, which is the only one that shows this screen.
    const before = await sw.evaluate(() => chrome.storage.local.get('wb:answers'));
    expect(before['wb:answers']).toBeUndefined();

    const page = await openPanel(context, id);
    const welcome = page.locator('.home-welcome');
    await expect(welcome).toBeVisible();
    // BS-06 (§6), Adam's D3: the mark left this card with the lockups. The
    // chrome bar says "this is Workbrain" once, for every Home state.
    await expect(welcome.locator('svg.brand-mark')).toHaveCount(0);

    // --- the mark: really drawn, really the node graph, and now on the
    // CHROME BAR rather than in this card. BS-06 moved it; the claims about
    // the drawing itself are unchanged and follow it, because "the node
    // graph really renders and its tokens really resolve" is worth pinning
    // wherever the mark lives. ---
    const mark = page.locator('.home-chrome svg.brand-mark');
    await expect(mark).toBeVisible();
    await expect(mark.locator('circle')).toHaveCount(12);
    await expect(mark.locator('line')).toHaveCount(30);
    const markBox = await mark.boundingBox();
    expect(markBox?.width).toBeGreaterThan(12);
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
    await expect(meter).toHaveAttribute('aria-valuetext', `0% ${S.meterLabel}, ${S.stepBoth(S.steps[0], S.steps[1])}`);

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

    // --- STILL, and no loop. ---
    // BS-06: the entrance itself moved with the mark. Home's only mark is
    // the chrome bar's, which is drawn `entrance={false}` on purpose — it
    // survives every state, so an arrival animation would replay on every
    // return to Home. What still matters here, and is asserted, is that
    // nothing about it MOVES: no rotation, no pulse, no ticking.
    // brand-mark.spec.ts owns the entrance, on the splash's mark, which is
    // the one that actually arrives.
    await expect(mark).toHaveCSS('opacity', '1');
    const first = await mark.evaluate((el) => getComputedStyle(el).transform);
    await page.waitForTimeout(500);
    expect(await mark.evaluate((el) => getComputedStyle(el).transform)).toBe(first);

    await context.close();
  });

  test('the chrome mark is fully drawn under prefers-reduced-motion, with nothing animating', async () => {
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

    // BS-06 moved Home's only mark to the chrome bar (Adam's D3), so the
    // still-version claim follows it: the whole mark, at full opacity,
    // immediately, with nothing animating.
    const mark = page.locator('.home-chrome svg.brand-mark');
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
    // BS-06 (§6), Adam's D3 — THE LOCKUP IS GONE TOO. It said "this is
    // Workbrain" a second time inside 180px of the chrome bar that already
    // said it, and the chrome bar wins because it survives every state.
    await expect(page.locator('.home-lockup')).toHaveCount(0);
    await expect(page.locator('.home-welcome .brand-mark')).toHaveCount(0);
    // Exactly one mark on the screen, and it is the chrome's.
    await expect(page.locator('.home svg.brand-mark')).toHaveCount(1);
    await expect(page.locator('.home-chrome svg.brand-mark')).toHaveCount(1);
    // The facts the lockup's meta line printed are still on the screen — the
    // meter and the file cards derive them from the same answers.
    await expect(page.locator('.meter')).toBeVisible();
    await expect(page.locator('.home-card[data-file="context"]')).toBeVisible();

    await context.close();
  });

  test('Workbrain+ keeps its door and loses its pitch (BS-06)', async () => {
    // §6: "The four bullets and the price belong on the page already
    // linked. On Home they cost about 230px and make the panel read as a
    // storefront on the screen people open to do work." This reverses V2.8
    // VB-134 and V2.9 VB-147's reprice — Adam's D3, taken knowingly.
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);

    const link = page.getByRole('link', { name: /Workbrain\+/ });
    await expect(link).toHaveAttribute('href', 'https://www.model-citizen.org/work-brain/plus');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noreferrer/);

    // The door survives; the storefront does not.
    await expect(page.locator('.home-cta')).toHaveCount(0);
    await expect(page.locator('.home')).not.toContainText('Starting at $1K a month');
    await expect(page.locator('.home')).not.toContainText('Billed monthly on the site.');
    for (const good of S.plusBullets) {
      await expect(page.locator('.home')).not.toContainText(good);
    }

    await context.close();
  });

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

/* ── V2.9 VB-147 + VB-144 — the three tiles, and the day they wake up ─────
   Adam: "Your next move should be 3 tiles... the Download file button and
   Prove It tiles, previously dormant, are now in color and obviously active
   after the Context Interview is complete."

   THE STATE IS DERIVED, NEVER STORED. There is no "has graduated" flag: the
   tiles read the same `fileFinished` fold Home's cards read, so somebody who
   goes back and empties a section is honestly told the file is unfinished
   again. `nothingLeftToAsk` is the finished file, built the way
   file-slots.spec.ts builds it. */
function nothingLeftToAsk(): Answers {
  const now = new Date().toISOString();
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      const key = node.key ?? node.id;
      let value: AnswerValue;
      if (node.id === 'entities_gate' || node.id === 'initiatives_gate') value = 'no';
      else if (node.id === 'role_names') value = [];
      else if (node.kind === 'intro') value = null;
      else if (node.kind === 'yesno') value = 'yes';
      else if (node.kind === 'chips') value = node.options?.[0]?.v ?? 'x';
      else if (node.kind === 'multi') value = node.options?.length ? [node.options[0]!.v] : [];
      else value = `A test answer for ${node.id}.`;
      values[key] = value;
      answeredAt[key] = now;
      if (typeof value === 'string') reflectedAt[key] = now;
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt };
}

test.describe('V2.9 — Your next move, and the graduation it waits for', () => {
  /**
   * BS-06 (§6)'s acceptance, as three measurements rather than three
   * opinions: "Home fits in roughly one and a half panel heights; the
   * recommendation is the first content under the chrome and the only filled
   * primary; no disabled dashed tiles remain; the plus card is a single-row
   * door."
   */
  test('the recommendation is the first thing under the chrome, and the only filled primary (BS-06)', async () => {
    const { context, sw, id } = await launchExtension();
    const { answers } = buildAnswersWithOneDueRole(contextModules);
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);
    const page = await openPanel(context, id);

    // Order, read off the DOM rather than off pixel positions — the meter and
    // the file shelf both used to come first, and this is the swap.
    const order = await page.$eval('.home', (home) =>
      [...home.children].map((child) => child.className.split(' ')[0]),
    );
    expect(order[0]).toBe('home-chrome');
    expect(order[1]).toBe('home-recs');
    // BS-06's own sheet door made the meter a wrapped row rather than a
    // direct child of `.home`; the claim is still "the hero is above it".
    expect(order.indexOf('home-recs')).toBeLessThan(order.indexOf('home-meter'));

    // And it is the only filled primary anywhere on the screen. The welcome
    // card has one too, but the two states never coexist — this is the
    // returning state, and here the hero stands alone.
    await expect(page.locator('.home .btn-primary')).toHaveCount(1);
    await expect(page.locator('.home-recs .btn-primary')).toHaveCount(1);

    /**
     * §6's acceptance is "Home fits in roughly one and a half panel heights",
     * against the 760px panel the review measured. It opened at ~1,470px.
     *
     * THE BOUND MOVED ONCE, FROM 1.5 TO 1.6, AND IT IS WORTH WRITING DOWN
     * WHY. §6 counted five rows. §4 then shipped proof two, a surface that
     * did not exist when Home was measured, and gave it the sixth — about
     * 60px. Holding 1.5 would have meant cutting something §6 kept in order
     * to fit something §6 never weighed, which is arithmetic driving design.
     * The subtitles were shortened to one line each in the same pass, which
     * is the part of the overage that was really slack.
     *
     * AND IT MOVED A SECOND TIME, 1.6 → 1.65, on R-01 (Adam, 2026-08-28).
     * Three of those subtitles got longer on purpose and now wrap to two
     * lines — Workbrain+'s tag, the Certified banner's, and Skill Training's
     * "unlocks automatically with your 2nd skill". Six pixels, all of it
     * words somebody chose to say. Naming the cause here rather than nudging
     * the number quietly, because the next six pixels should have to justify
     * themselves the same way: if Home ever needs to be shorter, the lever is
     * the length of these sentences, not the layout under them.
     */
    const height = await page.$eval('.home', (home) => Math.round(home.getBoundingClientRect().height));
    expect(height, `Home is ${height}px tall`).toBeLessThan(760 * 1.65);

    await context.close();
  });

  /**
   * BS-06 put a "What moves this?" door beside the percentage; Adam removed
   * it on 2026-08-28 ("remove this link, we don't need it") and the sheet
   * went with it. What that test really guarded survives here: the meter's
   * whole drawing is one `aria-hidden` progressbar, so nothing interactive
   * may live inside it — a control in there is a control a screen reader
   * never meets.
   */
  test('the meter is a drawing, with no control inside it (BS-06)', async () => {
    const { context, sw, id } = await launchExtension();
    const { answers } = buildAnswersWithOneDueRole(contextModules);
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), answers);
    const page = await openPanel(context, id);

    await expect(page.locator('.meter')).toBeVisible();
    await expect(page.locator('.meter button, .meter a')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'What moves this?' })).toHaveCount(0);
    await expect(page.locator('.meterwhat')).toHaveCount(0);

    await context.close();
  });

  test('six rows, and the three that wait explain themselves in words (BS-06/BS-04)', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);

    /**
     * BS-06 (§6) — the tiles became rows. "A plain row list with a subtitle
     * says more in less height, and dormant items become rows that explain
     * themselves instead of disabled squares."
     */
    const rows = page.locator('.home-row');
    // BS-04 (§4) added the third: proof two, waiting on two recipes.
    await expect(rows).toHaveCount(6);
    await expect(rows.nth(0)).toContainText(S.tileDownload);
    await expect(rows.nth(1)).toContainText(S.proofCta);
    await expect(rows.nth(2)).toContainText(S.capCta);
    await expect(rows.nth(3)).toContainText(S.tileRedeem);
    await expect(rows.nth(4)).toContainText(S.libTitle);
    await expect(rows.nth(5)).toContainText(S.plusTitle);

    // A waiting row says what it is waiting for, in the row, as text — and
    // the three of them wait on different things, said in their own words.
    await expect(rows.nth(0)).toHaveClass(/is-waiting/);
    await expect(rows.nth(0)).toContainText(S.tileWaitsOnContext);
    await expect(rows.nth(1)).toContainText(S.tileWaitsOnContext);
    await expect(rows.nth(2)).toHaveClass(/is-waiting/);
    await expect(rows.nth(2)).toContainText(S.capRowWaiting);

    // AND IT HOLDS NO CONTROL AT ALL. A disabled button in the tab order is
    // a promise the screen cannot keep — §1 took the dashed disabled square
    // away and this is what replaced it, not a quieter version of it.
    await expect(rows.nth(0).locator('button, a')).toHaveCount(0);
    await expect(rows.nth(2).locator('button, a')).toHaveCount(0);
    await expect(page.locator('.home-tile')).toHaveCount(0);

    // The fourth never waits: a redeem code works on day one.
    await expect(rows.nth(3)).not.toHaveClass(/is-waiting/);
    await expect(rows.nth(3).locator('button')).toHaveCount(1);

    await context.close();
  });

  test('finishing the Context file makes both waiting rows real (BS-06)', async () => {
    const { context, sw, id } = await launchExtension();
    await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), nothingLeftToAsk());

    const page = await openPanel(context, id);
    const rows = page.locator('.home-row');
    for (const index of [0, 1]) {
      await expect(rows.nth(index)).not.toHaveClass(/is-waiting/);
      await expect(rows.nth(index).locator('button')).toHaveCount(1);
    }
    // …and they stop saying they are waiting.
    await expect(page.locator('.home-rows')).not.toContainText(S.tileWaitsOnContext);

    // The download really downloads — one press, no sheet.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: new RegExp(`^${S.tileDownload}`) }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('Context.md');
    await expect(page.getByText('Downloaded. Keep it somewhere you will find it.')).toBeVisible();

    await context.close();
  });

  test('the Certified Skills door is a row like the rest (BS-06)', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);

    const link = page.getByRole('link', { name: new RegExp(S.libTitle) });
    await expect(link).toHaveAttribute('href', 'https://www.model-citizen.org/work-brain/skills-library');
    await expect(link).toHaveAttribute('target', '_blank');
    // The spanning banner is gone with the tiles it was spanning past.
    await expect(page.locator('.home-lib')).toHaveCount(0);

    await context.close();
  });
});
