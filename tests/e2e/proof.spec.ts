import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../src/schema/flow.types';
import type { Answers } from '../../src/schema/storage.types';
import { readFile } from 'node:fs/promises';

// R1-11 accept criteria (docs/RELEASE-1.md): "Four steps: baseline,
// with-context, grade, recommendations. Manual copy/paste only. Service
// chips drive the per-service attach hint. Accept: completing it writes one
// score to wb:report.scores; the pasted text is never parsed, scored, or
// stored beyond the field it was pasted into." See docs/TESTING.md for the
// launchPersistentContext pattern — kept as its own self-contained spec
// file, matching reflect.spec.ts's and download-import.spec.ts's own note
// that this repo keeps each spec file standalone.
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

/** R1-12: the Context flow's own "done" screen no longer exists — Home
 * replaced it (see App.tsx / Flow.tsx's `onDone`), and the proof loop's own
 * entry point ("Prove it works") moved there with it. See flow.spec.ts's
 * header comment on the same routing change. */
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

/**
 * A minimal "the Context interview is already done" fixture, so this spec
 * can reach the proof loop's own entry point (Home's "Prove it works"
 * button, shown once there's any real progress — see Home.tsx) without
 * re-walking all ~40 Context questions itself — download-import.spec.ts's
 * own `buildDoneAnswers` does the same thing for the same reason, and is
 * duplicated rather than imported, matching this repo's established "each
 * spec file stays self-contained" convention (see reflect.spec.ts's own
 * header comment).
 */
function buildDoneAnswers(modules: Module[]): Answers {
  const now = new Date().toISOString();
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
        const picks = (step.options ?? []).slice(0, 1).map((o) => o.v);
        stampTop(key, picks);
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

  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    const records = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [rolesBlock!.seedFrom!.seedField]: label };
      for (const field of rolesBlock!.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A test answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[rolesBlock.id] = records;
    records.forEach((record, recordIndex) => {
      for (const [fk, v] of Object.entries(record)) {
        if (fk === rolesBlock!.seedFrom!.seedField) continue;
        const compound = `${rolesBlock!.id}#${recordIndex}#${fk}`;
        answeredAt[compound] = now;
        if (typeof v === 'string') reflectedAt[compound] = now;
      }
    });
  }

  // BS-03d — the judged landing assembles its statements from what the
  // person named, so this fixture names somebody and something. Without
  // these the checklist falls to its two-statement floor, which is a real
  // state but not the one this walk is about.
  repeatables['entities'] = [{ entity_name: 'Priya' }];
  repeatables['initiatives_records'] = [{ initiative_name: 'Northstar' }];

  return { values, repeatables, answeredAt, reflectedAt };
}

async function storedLocal(sw: Worker): Promise<Record<string, unknown>> {
  return sw.evaluate(() => chrome.storage.local.get(['wb:answers', 'wb:report']));
}

/**
 * BS-03a — a file with NOTHING left to ask and no skip in it: every
 * top-level question answered, both gates closed so no repeatable is left
 * offering an "is there another one?" screen, and no `null` anywhere. This
 * is the seed `fileFinished` says yes to, which is what opens Skills and
 * what the interrupt tests need in order to reach `done` cleanly.
 * (The same shape file-slots.spec.ts builds; duplicated per this repo's
 * fixtures-live-with-their-spec convention.)
 */
function finishedFile(): Answers {
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

test.describe('The proof loop (R1-11)', () => {
  test('a full pass through all four steps writes exactly one with-context score, and the pasted grade text lives only in the field it was pasted into', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await expect(page.locator('.home')).toBeVisible();

    // --- entry point: Home offers the proof loop once there's any real
    // progress to prove (Home.tsx), reached keyboard-only (CLAUDE.md's
    // definition of done) ---
    await page.getByRole('button', { name: 'Prove it works', exact: true }).focus();
    await page.keyboard.press('Enter');

    // --- V2.3 VB-93: no pick-a-service screen — the goal gate answered
    // "which AI?" at interview minute one (goal_service is in the seed), so
    // the proof opens straight on the baseline, and the baseline prompt IS
    // the person's own goal, never the canned status-update line ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_baseline');
    const baselinePrompt = await page.locator('.flow .readonly').first().textContent();
    expect(baselinePrompt).toContain('A test answer for goal_want.');
    expect(baselinePrompt).not.toContain('Draft a status update for my manager.');
    const baselineAnswer = "Here's the status update with nothing loaded — generic, no specifics.";
    await page.locator('.flow textarea').fill(baselineAnswer);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // --- with-context: the SAME question again, and BS-03b's one paste ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_context');
    // §3.1: the attach step is gone from the main path, and the sentence
    // that replaces it says so.
    await expect(page.locator('.flow')).toContainText(
      'Your file comes along inside the message. You do not need to attach anything.',
    );
    // The per-service gesture survives as the secondary route, behind a
    // disclosure — kept for anyone who would rather attach, per §3.1.
    const attach = page.locator('.flow-attach');
    await expect(attach).toHaveCount(1);
    // Closed, so the gesture is off screen until somebody asks for it.
    // Asserted by VISIBILITY, not by text: a closed <details> still carries
    // its content in `textContent`, so `toContainText` would pass either way
    // and prove nothing.
    await expect(attach.locator('p')).toBeHidden();
    await attach.locator('summary').click();
    await expect(attach.locator('p')).toBeVisible();
    await expect(attach).toContainText('Click the + / paperclip near the message box and attach Context.md.');
    await expect(attach).toContainText("Or just paste Context.md’s text directly if you don’t see one.");

    const contextPrompt = await page.locator('.flow .readonly').first().textContent();
    expect(contextPrompt).toContain('A test answer for goal_want.'); // same goal, asked twice — the whole point
    // …and the file itself is in the copy, so one paste carries both.
    expect(contextPrompt).toContain('System Grounding Rule');
    expect(contextPrompt).toContain('Here is my Context file.');
    // The baseline, by contrast, carried none of it — the proof measures one
    // variable and this is where that is proved end to end.
    expect(baselinePrompt).not.toContain('System Grounding Rule');
    const contextAnswer = "Here's the status update with Context.md attached — specific to my actual role and team.";
    await page.locator('.flow textarea').fill(contextAnswer);
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // --- judge: no third round trip. The two answers side by side, and the
    // statements the person ticks (BS-03d, Adam's P1). ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_judge');
    // Nothing to copy and nothing to paste — the errand budget is spent.
    await expect(page.locator('.flow .readonly')).toHaveCount(0);
    await expect(page.locator('.flow textarea')).toHaveCount(0);

    // Both answers are shown, verbatim, with the line that says the panel
    // does not read them.
    await expect(page.locator('.proofjudge')).toContainText(baselineAnswer);
    await expect(page.locator('.proofjudge')).toContainText(contextAnswer);
    await expect(page.locator('.flow')).toContainText(
      'Shown exactly as your AI wrote them. Workbrain never reads or scores them.',
    );

    // The statements are ASSEMBLED from what this person actually said. The
    // seed names an entity and an initiative, so both specific checks are
    // offered alongside the two that need no context.
    const checks = page.locator('.proofjudge-check');
    await expect(checks).toHaveCount(4);
    await expect(checks.nth(0)).toContainText("Used Priya's name");
    await expect(checks.nth(1)).toContainText('Knew Northstar is mine');
    await expect(checks.nth(2)).toContainText('Sounded like me');
    await expect(checks.nth(3)).toContainText('Asked for the right thing');

    // Keyboard-only through the ticks — CLAUDE.md's definition of done, the
    // same standard the numeric fields were held to before they went.
    await checks.nth(0).locator('input').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');
    await expect(checks.nth(0).locator('input')).toBeChecked();
    await expect(checks.nth(1).locator('input')).toBeChecked();
    await expect(checks.nth(2).locator('input')).not.toBeChecked();

    // A photograph of the one screen this whole workstream is for — the
    // house's "for a person to look at" convention (question-fill.spec.ts,
    // save-note.spec.ts). Taken with two of the four ticked, which is the
    // state somebody is actually looking at when they decide.
    await page.screenshot({ path: 'test-results/bs03/judged-landing.png' });

    // Nothing is required: ticking is an observation, and the panel does not
    // argue with it.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    // --- the closing screen says what they observed, in their own tally ---
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_recommendations');
    await expect(page.locator('.flow')).toContainText('That is two out of four.');

    // BS-03d (§3.3) — END ON AN ARTIFACT. The delta is the most shareable
    // thing this product makes, and until now it evaporated.
    const receiptPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save this as a one-page receipt', exact: true }).click();
    const receipt = await receiptPromise;
    expect(receipt.suggestedFilename()).toMatch(/^Workbrain proof — .+\.md$/);
    const written = await readFile((await receipt.path())!, 'utf8');
    // Their words, their AI's words, and their own judgement — the whole
    // point being that it can be forwarded.
    expect(written).toContain('A test answer for goal_want.');
    expect(written).toContain(baselineAnswer);
    expect(written).toContain(contextAnswer);
    expect(written).toContain("Used Priya's name");
    expect(written).toContain('**2 of 4**, judged by me — Workbrain never read either answer.');

    // A FILE, never a link (D5, and docs/OPEN.md #4 still open): nothing
    // about the receipt is stored, and nothing is uploaded.
    const afterReceipt = await storedLocal(sw);
    expect(JSON.stringify(afterReceipt)).not.toContain('Workbrain proof');

    await page.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.flow')).toContainText("That's the whole loop.");

    // --- storage: read directly, not just the UI ---
    const stored = await storedLocal(sw);
    const answers = stored['wb:answers'] as Answers;
    const report = stored['wb:report'] as { scores: { at: string; value: number; of: number }[] } | undefined;

    expect(report?.scores).toHaveLength(1);
    // Their tally, and the denominator that makes it mean something.
    expect(report!.scores[0]!.value).toBe(2);
    expect(report!.scores[0]!.of).toBe(4);
    expect(typeof report!.scores[0]!.at).toBe('string');

    // NEITHER ANSWER EVER REACHES THE REPORT. The panel shows them and
    // records a number the person chose; it never keeps what the AI wrote.
    expect(JSON.stringify(report)).not.toContain(baselineAnswer);
    expect(JSON.stringify(report)).not.toContain(contextAnswer);

    // The two pasted answers live where they were pasted, and nowhere else.
    expect(answers.values.proof_baseline_answer).toBe(baselineAnswer);
    expect(answers.values.proof_context_answer).toBe(contextAnswer);
    // And the deleted step leaves no orphan behind: nothing writes
    // `proof_grade_text` any more, because nothing asks for a grade.
    expect(answers.values.proof_grade_text).toBeUndefined();

    await context.close();
  });

  test('skipping baseline/with-context degrades gracefully — the landing shows empty columns, never throws', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).click();

    // Skip baseline and with-context entirely (VB-93: the seed carries a
    // goal, so there is no pick-a-service screen to get past first).
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_baseline');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_context');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();

    // BS-03d: the grade step and its "[not captured]" rubric are gone with
    // the round trip. What has to degrade now is the landing — two answers
    // that were never pasted.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_judge');
    // It renders, with empty columns rather than a crash or a stray "undefined".
    await expect(page.locator('.proofjudge-col')).toHaveCount(2);
    await expect(page.locator('.proofjudge')).not.toContainText('undefined');
    // And the statements still stand: they are assembled from the person's
    // own answers, which exist whether or not the errand was run.
    await expect(page.locator('.proofjudge-check')).toHaveCount(4);

    // Past the landing with nothing ticked. There is no Skip here and there
    // should not be: ticking nothing already means "it got none of these
    // right", so Next IS the skip, and a second control offering the same
    // outcome would be the screen asking twice.
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_recommendations');
    await expect(page.locator('.flow .readonly')).toHaveCount(0);

    // A tally of zero out of four IS written, and that is the honest
    // outcome: they were shown two answers and said none of the statements
    // were true of the second. The old step wrote nothing here because
    // nothing had been typed; ticking nothing is an answer, not an absence.
    const stored = await storedLocal(sw);
    const report = stored['wb:report'] as { scores: { value: number; of: number }[] } | undefined;
    expect(report?.scores).toHaveLength(1);
    expect(report!.scores[0]!.value).toBe(0);
    expect(report!.scores[0]!.of).toBe(4);

    await context.close();
  });

  /**
   * V2.3 VB-93 back-compat — a file finished before the goal gate existed
   * has no goal_service answer, so the proof still opens on its own
   * pick-a-service screen and runs on the canned baseline line. The pre-gate
   * path is a permanent resident, not dead code: it serves every file from
   * before tonight.
   */
  test('a pre-gate file still gets the pick-a-service screen and the canned baseline', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    delete seeded.values['goal_service'];
    delete seeded.values['goal_want'];
    delete seeded.answeredAt['goal_service'];
    delete seeded.answeredAt['goal_want'];
    delete seeded.reflectedAt['goal_want'];
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).click();

    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_service');
    // V2.4 VB-105: the picker asks with the same merged, persona-dressed list
    // as the goal gate — seven chips, one look (service-chips.spec.ts drives
    // the gate side; this is the proof-picker side of "one list").
    await expect(page.locator('.flow .pillgroup .pill')).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Grok', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Claude', exact: true })).toHaveClass(/\bpill-theme-scholar\b/);
    await page.getByRole('button', { name: 'Claude', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_baseline');
    const baselinePrompt = await page.locator('.flow .readonly').first().textContent();
    expect(baselinePrompt).toContain('Draft a status update for my manager.');

    await context.close();
  });

  /* ── BS-03c (§3.2) — the held place ─────────────────────────────────────
     The panel used to look identical whether somebody was mid-errand in
     another tab or had not started, so coming back meant re-reading the
     screen to work out where they were. */
  test('copying holds the place: a confirmation, a box that wants content, and a way to try again', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_baseline');

    // Before the copy there is nothing to come back to, so the panel does
    // not claim a place is held.
    await expect(page.locator('.proofheld')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Copy the prompt again', exact: true })).toHaveCount(0);

    await page.locator('.readonly .copy').click();

    // Now it does — and it is announced, because somebody who pressed copy
    // may already be looking at the other tab.
    const held = page.locator('.proofheld');
    await expect(held).toBeVisible();
    await expect(held).toHaveAttribute('role', 'status');
    await expect(held).toContainText('Copied. Your place is held.');
    await expect(held).toContainText('When it answers, bring the answer back here.');

    // NOTHING SPINS AND NOTHING COUNTS DOWN (§3.2): there is no call to wait
    // for, so a spinner would be a lie and a timer would be pressure.
    await expect(page.locator('.flow [role="progressbar"]:not(.flowprogress)')).toHaveCount(0);
    const before = await held.textContent();
    await page.waitForTimeout(1500);
    expect(await held.textContent()).toBe(before);

    // The empty box visibly wants content — dashed, which is this product's
    // "empty" since the beta review reassigned it from "locked" (§1).
    const box = page.locator('.flow-field-sr-label textarea');
    expect(await box.evaluate((el) => getComputedStyle(el).borderStyle)).toBe('dashed');

    // The commonest real failure has one sentence of advice, and it does not
    // shout: closed until asked for.
    const asked = page.locator('.flow-attach').last();
    await expect(asked).toContainText('It asked me something instead. Now what?');
    await expect(asked.locator('p')).toBeHidden();
    await asked.locator('summary').click();
    await expect(asked.locator('p')).toBeVisible();

    // And the way to try again, which re-copies the same prompt.
    // Reading the clipboard needs the permission granted, the same way
    // interview-me.spec.ts grants it for the assist copy.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Copy the prompt again', exact: true }).click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('A test answer for goal_want.');

    // The moment something lands, the box is an answer rather than a gap —
    // and the held-place state stands down.
    await box.fill('What the AI wrote back.');
    await expect(held).toHaveCount(0);
    expect(await box.evaluate((el) => getComputedStyle(el).borderStyle)).not.toBe('dashed');

    await context.close();
  });

  test('a fresh step never claims a place is held from the step before it', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = buildDoneAnswers(contextModules);
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).click();
    await page.locator('.readonly .copy').click();
    await expect(page.locator('.proofheld')).toBeVisible();

    await page.locator('.flow textarea').fill('The baseline answer.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'proof_context');

    // The with-file errand has not been run yet, so nothing is waiting for
    // an answer. Claiming otherwise would be the panel telling somebody
    // they had already done something they had not.
    await expect(page.locator('.proofheld')).toHaveCount(0);

    await context.close();
  });

  /* ── BS-03a (§3), Adam's P3 — the proof interrupts ──────────────────────
     It used to wait in a tile somebody had to notice, at the end of a screen
     they had to scroll. Now finishing Context hands straight into it.
     Adam on the cost: "error on the side of momentum beating a reset." */
  test('finishing Context hands straight into the proof, not back to Home', async () => {
    const { context, sw, id } = await launchExtension();
    // One question short of finished, so the walk ENDS in this test rather
    // than being seeded past the moment under test.
    const seeded = finishedFile();
    const last = 'reference_example_second';
    delete seeded.values[last];
    delete seeded.answeredAt[last];
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.flow');
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', last);

    await page.locator('.flow textarea').fill('A last answer, written to finish the file.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Straight into the proof. No Home in between — that is the whole ruling.
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', /^proof/, { timeout: 10_000 });
    await expect(page.locator('.home')).toHaveCount(0);

    await context.close();
  });

  test('it interrupts ONCE — a re-finish does not hand them the same errand again', async () => {
    const { context, sw, id } = await launchExtension();
    const seeded = finishedFile();
    const last = 'reference_example_second';
    delete seeded.values[last];
    delete seeded.answeredAt[last];
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), seeded);
    // A proof that has already been run. Derived from what is stored, not
    // from a "seen it" flag — the same discipline every other state here
    // follows.
    await sw.evaluate(() =>
      chrome.storage.local.set({ 'wb:report': { scores: [{ at: '2026-08-01T00:00:00.000Z', value: 3, of: 4 }] } }),
    );

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: /^Context\.md/ }).click();
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.flow');
    await page.locator('.flow textarea').fill('A last answer, written to finish the file again.');
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // Home, and no second errand.
    await page.waitForSelector('.home');
    await expect(page.locator('.flow')).toHaveCount(0);

    await context.close();
  });

  test('the proof hands into Skills at the end, so the hour does not stall on Home', async () => {
    const { context, sw, id } = await launchExtension();
    // Skills opens on `fileFinished`, which is stricter than "nothing left to
    // ask": a skipped question is a gap. This seed has no skip in it.
    await sw.evaluate((answers) => chrome.storage.local.set({ 'wb:answers': answers }), finishedFile());

    const page = await openPanel(context, id);
    await page.getByRole('button', { name: 'Prove it works', exact: true }).click();
    // Straight to the end of the loop — this test is about the door there.
    for (let i = 0; i < 6; i++) {
      const step = await page.locator('.flow').getAttribute('data-step-id');
      if (step === 'proof_recommendations') break;
      const skip = page.getByRole('button', { name: 'Skip', exact: true });
      if (await skip.count()) await skip.click();
      else await page.getByRole('button', { name: 'Next', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    // §3: "Ends by handing straight into Skills." The door is only real when
    // Skills is genuinely open, which a finished Context file makes it.
    await expect(page.getByRole('button', { name: 'Now teach it a task you repeat', exact: true })).toBeVisible();

    await context.close();
  });
});