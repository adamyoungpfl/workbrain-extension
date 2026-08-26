import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { contextModules } from '../../src/core/flow/flow';
import { questionCount } from '../../src/core/flow/runner';

// R1-06 accept criteria: "keyboard-only pass from first question to the end;
// answers persist across a panel close/reopen." See docs/TESTING.md for the
// launchPersistentContext pattern — Playwright can't open Chrome's own panel
// chrome, so panel.html is driven as an ordinary extension page instead.
const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const TOTAL_TOP_LEVEL = questionCount(contextModules);

async function launchPanel(): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const page = await openPanel(context);
  return { context, page };
}

/**
 * R1-12: Home is now the surface a fresh open lands on, empty-storage or
 * not (docs/ARCHITECTURE.md's router, "defaulting to Home" — see App.tsx).
 * Entering (or resuming — same handler, see Home.tsx's `onStart`) the
 * interview is one keyboard press on the "Context.md" file row away, so
 * this file's own "keyboard-only pass" claim covers the entry point too.
 */
async function openPanel(context: BrowserContext): Promise<Page> {
  const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway now and stays until dismissed — Escape
  // is its keyboard exit, and nothing else about this walk-in changed.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });
  await page.getByRole('button', { name: /^Context\.md/ }).focus();
  await page.keyboard.press('Enter');
  // V1.7 VB-37: the file row opens the FILE, and the file view is where the
  // interview is entered from — see src/panel/surfaces/FileView.tsx.
  await page.getByRole('button', { name: 'Go through the questions', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('.flow');
  return page;
}

/**
 * Answers whatever is currently on screen with a minimal, keyboard-only
 * interaction: types into a text field, or selects a choice. For a choice
 * question, the group's roving tabindex already starts on the first option,
 * so no arrow key is needed there — Space alone selects it. That "first
 * option" default picks a role for `role_names` and a reader for
 * `audiences_list`, which is exactly what exercises the two seeded repeatable
 * paths; the two open-ended blocks (entities, initiatives) are no longer
 * gated at all — V2.0 VB-61/VB-63 made both required, so this walk goes
 * through them whatever it clicks. V2.0 VB-60 draws THAT question's
 * choices as orbs rather than pills (core/choice/orbs.ts) — same roving
 * tabindex, same Space, a different group class — so the locator below has to
 * find either. It matters here more than anywhere: `role_names` is optional,
 * so a walker that could not select on it would leave the seeded repeatable
 * empty and this test would keep passing while covering half of what it
 * says it covers. An "add another?" prompt renders
 * identically (two pills, Yes/No) but is marked `data-position="add-another"`
 * specifically so this can choose "No" there instead, via one ArrowRight —
 * bounding every open-ended repeatable to exactly one record.
 *
 * A text answer for one of the six interpret-bearing questions (R1-07) lands
 * on the reflect screen — `data-position="reflect"` — instead of continuing;
 * this generic walk always chooses "Keep it as-is" there, since exercising
 * Tighten/Say-it-again byte-identically is reflect.spec.ts's own job, not
 * this full-flow smoke pass's.
 *
 * V1.1 VB-05 added a tenth-and-then-some kind of screen to walk past: a
 * module transition, `data-position="module-intro"`, before each of modules
 * two to eleven. There is nothing on it to answer — Next alone advances it,
 * exactly like an intro — so it needs no branch of its own here; the caller
 * counts them (module-intro.spec.ts is where the screen's own behaviour is
 * tested).
 */
async function answerCurrentQuestion(page: Page): Promise<void> {
  const form = page.locator('.flow');
  const position = await form.getAttribute('data-position');

  if (position === 'reflect') {
    await page.getByRole('button', { name: 'Keep it as-is', exact: true }).click();
    return;
  }

  const textarea = page.locator('.flow textarea');
  const textInput = page.locator('.flow input.field');
  const pills = page.locator('.flow .pillgroup .pill, .flow .orbgroup .orbchoice');

  if (await textarea.count()) {
    await textarea.first().focus();
    await page.keyboard.type('A keyboard-only answer for this question.');
  } else if (await textInput.count()) {
    await textInput.first().focus();
    await page.keyboard.type('Keyboard answer');
  } else if (await pills.count()) {
    await pills.first().focus();
    if (position === 'add-another') await page.keyboard.press('ArrowRight'); // -> "No"
    await page.keyboard.press('Space');
  }
  // intro: nothing to select, Next alone advances it

  await page.getByRole('button', { name: 'Next', exact: true }).click();
}

/**
 * V2.0 VB-62/VB-64 — what the type-first cycle is FOR, read off the screen.
 *
 * The walk below picks the first option everywhere, which makes `entity_type`
 * "Person" and `audiences_list` the first reader on the list. Every question
 * after those must therefore say so: this is the only place the record-aware
 * context is really assembled out of live storage (Flow.tsx) rather than
 * handed to a phrase by a unit test, so if that wiring came loose the panel
 * would quietly print the generic fallback and every other test would pass.
 *
 * A fragment, not the whole sentence — the wording itself is pinned in
 * core/flow/overrides.test.ts. What is being proved here is *which branch*.
 */
const RECORD_AWARE_WORDING: Record<string, string> = {
  entity_name: "What's their name?",
  entity_relevance: 'why does AI need to know about them?',
  entity_aliases: 'nicknames they go by?',
  // The em dash is the tell: the fallback reads "What's different about
  // writing to this reader?" and never names anybody.
  audience_needs: "— what's different about writing to them?",
};

test.describe('Context interview — flow runner (R1-06)', () => {
  test('a full keyboard-only pass reaches the end, exercising both repeatable shapes', async () => {
    const { context, page } = await launchPanel();

    const visited = new Set<string>();
    /** Every step id in the order it was actually put on screen — what proves
     * V2.0 VB-62's re-ordered item cycle really is the order somebody walks. */
    const order: string[] = [];
    const transitions: string[] = [];
    let guard = 0;
    // Generous cap: 38 top-level slots plus every repeatable field/add-another
    // this walk actually visits (entities: gate+4 fields+add-another=6;
    // initiatives: gate+6 fields+add-another=8; roles: 4 seeded fields), plus
    // one extra "Keep it as-is" loop turn for each of the six interpret-
    // bearing questions this walk passes through (R1-07), plus V1.1 VB-05's
    // ten module transitions — comfortably under 130 regardless of exact
    // wording or field counts.
    // R1-12: the Context flow's own "done" screen no longer exists — once
    // every question is answered, `Flow` hands off to Home on its own (see
    // Flow.tsx's `onDone`). There's a brief real gap between the last
    // answer and Home actually mounting (`onDone` only fires once the
    // triggering `chrome.storage` write has genuinely resolved — see
    // `savePending`'s own comment on why), during which neither `.flow`
    // nor `.home` is in the DOM yet, so each turn waits for whichever
    // shows up next rather than assuming `.flow` is always still there.
    // V2.0 adds a handful of screens to that count: VB-64's per-audience
    // question and its add-another, and VB-61/VB-63's two gates swapped for
    // two framing beats (one screen each, either way). 140 keeps the same
    // comfortable margin the 130 had.
    while (guard++ < 140) {
      await page.waitForSelector('.flow, .home');
      if (await page.locator('.home').count()) break;
      const stepId = await page.locator('.flow').getAttribute('data-step-id');
      if (stepId) {
        visited.add(stepId);
        if (order[order.length - 1] !== stepId) order.push(stepId);
        const wording = RECORD_AWARE_WORDING[stepId];
        // Retrying, because the question types itself on (V1.1 VB-10).
        if (wording) await expect(page.locator('.flow')).toContainText(wording);
      }
      if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
        transitions.push((await page.locator('.flow').getAttribute('data-module-id')) ?? '');
      }
      await answerCurrentQuestion(page);
    }

    await expect(page.locator('.home')).toBeVisible();
    // The file this interview just finished, freshly reflected on Home.
    await expect(page.getByText('Context.md')).toBeVisible();

    // Confirm the open-ended repeatables (entities, initiatives) and the
    // seeded ones (roles, audiences) were actually walked, not just skipped past.
    for (const id of ['entities_intro', 'entity_name', 'entity_type', 'initiatives_intro', 'initiative_name']) {
      expect(visited.has(id), `expected to have visited "${id}"`).toBe(true);
    }
    for (const id of ['role_names', 'role_for', 'role_mandate', 'role_standing', 'role_durability']) {
      expect(visited.has(id), `expected to have visited "${id}" (seeded roles)`).toBe(true);
    }
    for (const id of ['audiences_list', 'audience_needs']) {
      expect(visited.has(id), `expected to have visited "${id}" (V2.0 VB-64, seeded audiences)`).toBe(true);
    }

    // V2.0 VB-61/VB-63: nobody starting a file today is offered the chance to
    // decline either block — the two ported gates are asked of nobody new
    // (core/flow/overrides.ts), and this walk is the proof that a real person
    // going through the real interface never sees them.
    for (const id of ['entities_gate', 'initiatives_gate', 'audience_variance']) {
      expect(visited.has(id), `"${id}" should not be asked of a new file`).toBe(false);
    }

    // V2.0 VB-61/VB-62: My World opens with a framing beat and then walks a
    // typed item cycle — kind, then name, then why it matters, then what else
    // it is called. Asserted as the real on-screen sequence, not as flow data.
    const myWorld = order.slice(order.indexOf('entities_intro'), order.indexOf('entities_intro') + 5);
    expect(myWorld).toEqual(['entities_intro', 'entity_type', 'entity_name', 'entity_relevance', 'entity_aliases']);

    // VB-63 leaves the initiative order alone — only its gate changed.
    const initiatives = order.slice(order.indexOf('initiatives_intro'), order.indexOf('initiatives_intro') + 3);
    expect(initiatives).toEqual(['initiatives_intro', 'initiative_name', 'initiative_description']);

    // VB-64: the per-audience question comes after the list it is seeded from.
    expect(order.indexOf('audience_needs')).toBeGreaterThan(order.indexOf('audiences_list'));
    // Every base top-level id should appear somewhere (repeatable blocks
    // themselves aren't a visitable step id, so this is necessarily a subset).
    expect(visited.size).toBeGreaterThanOrEqual(TOTAL_TOP_LEVEL);

    // V1.1 VB-05: every module except the first introduced itself, exactly
    // once, in flow order — the accept criterion, walked rather than derived.
    expect(transitions).toEqual(contextModules.slice(1).map((m) => m.id));

    await context.close();
  });

  test('answers persist across a panel close/reopen', async () => {
    const { context, page } = await launchPanel();

    // V2.3 VB-93: the flow opens on the goal gate — service, then want —
    // then the port's own opening (intro -> context_scope -> stop_explaining).
    expect(await page.locator('.flow').getAttribute('data-step-id')).toBe('goal_service');
    await answerCurrentQuestion(page);
    expect(await page.locator('.flow').getAttribute('data-step-id')).toBe('goal_want');
    await answerCurrentQuestion(page);
    await answerCurrentQuestion(page);
    const secondStepId = await page.locator('.flow').getAttribute('data-step-id');
    expect(secondStepId).toBe('context_scope');
    await answerCurrentQuestion(page);

    const stepIdBeforeClose = await page.locator('.flow').getAttribute('data-step-id');
    const questionBeforeClose = await page.locator('.flow-q').textContent();
    expect(stepIdBeforeClose).toBe('stop_explaining');

    await page.close();
    const reopened = await openPanel(context);

    await expect(reopened.locator('.flow')).toHaveAttribute('data-step-id', stepIdBeforeClose!);
    await expect(reopened.locator('.flow-q')).toHaveText(questionBeforeClose!);

    // The scope-aware phrasing itself round-tripped too (not just the id) —
    // context_scope was answered "work" (first option), so stop_explaining's
    // dynamic prompt should read "work life", proving the actual stored
    // answer value survived the reopen, not just the position.
    await expect(reopened.locator('.flow-q')).toContainText('work life');

    await context.close();
  });
});
