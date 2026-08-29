#!/usr/bin/env node
/**
 * R-14 — the interview canvas, measured before it is redesigned.
 *
 *   npm run build && node scripts/canvas-census.mjs
 *
 * Writes `store/canvas/census.json`: for every question in the Context flow,
 * at BOTH ends of the drawer's drag, what the screen actually is — the
 * question's rendered height and type size, how many visual lines it takes,
 * where the rephrase control lands, and how much room the answer is left.
 *
 * ── WHY MEASURE FIRST ─────────────────────────────────────────────────────
 *
 * Adam: "My focus is on the consistency of the letter sizes and the
 * consistency of finding and hitting the rephrase button… Big changes in text
 * size and text length will create fall off."
 *
 * Both halves of that are claims about numbers this product has never written
 * down. The question is the one element on the screen whose size is not fixed:
 * `TypedHeading` prints whatever the flow hands it, and the flow's questions
 * run from four words to thirty. The rephrase control rides the question's own
 * row, so it moves down the screen as the question grows — which is exactly
 * the "consistency of finding and hitting it" being named.
 *
 * A template built without this is a template built against a guess. So this
 * is the input to the concepts, not a report on them.
 *
 * NOTHING IS MOCKED: it drives the real built extension, the same rule
 * store-shots.mjs and copy-shots.mjs follow.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'store/canvas');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  reducedMotion: 'reduce',
});
const sw = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
const ID = new URL(sw.url()).host;

const page = await browser.newPage();
await page.setViewportSize({ width: 400, height: 760 });
await page.goto(`chrome-extension://${ID}/panel.html`);
await page.waitForSelector('.home');
await page.keyboard.press('Escape');
await page.waitForSelector('.splash', { state: 'detached' });
await page.getByRole('button', { name: /Context\.md/ }).first().click();
await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
await page.waitForSelector('.flow');

/** One screen, measured. */
async function measure(where) {
  return page.evaluate((drawer) => {
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const q = document.querySelector('.flow-q');
    if (!q) return null;
    const style = getComputedStyle(q);
    const size = parseFloat(style.fontSize);
    const lineHeight = parseFloat(style.lineHeight) || size * 1.2;
    const qBox = q.getBoundingClientRect();
    const rephrase = document.querySelector('.flow-rephrase');
    const answer = document.querySelector('.flow-answer');
    const foot = document.querySelector('.flow-foot');
    return {
      drawer,
      stepId: document.querySelector('.flow')?.getAttribute('data-step-id') ?? null,
      words: (q.textContent ?? '').trim().split(/\s+/).length,
      chars: (q.textContent ?? '').trim().length,
      fontPx: Number(size.toFixed(1)),
      lineHeightPx: Number(lineHeight.toFixed(1)),
      // Visual lines, not source lines: the whole point is what wrapping does.
      lines: Math.max(1, Math.round(qBox.height / lineHeight)),
      question: box('.flow-q'),
      hint: box('.flow-hint'),
      // WHERE THE REPHRASE CONTROL IS. Its own box, and its distance from the
      // top of the panel — the number "consistency of finding it" is about.
      rephrase: rephrase ? box('.flow-rephrase') : null,
      answerArea: box('.flow-answer'),
      cluster: box('.flow-foot'),
      answerRoom: answer && foot
        ? Math.round(foot.getBoundingClientRect().top - answer.getBoundingClientRect().top)
        : null,
    };
  }, where);
}

/** Drag the drawer to one end. Home is the peek, End is the ceiling. */
async function setDrawer(key) {
  const grip = page.locator('[role="separator"]').first();
  await grip.focus();
  await page.keyboard.press(key);
  await page.waitForTimeout(420);
  await page.mouse.move(0, 0);
  return Number(await grip.getAttribute('aria-valuenow'));
}

/**
 * EVERY TOP-LEVEL QUESTION, REACHED THROUGH "Jump to…" RATHER THAN WALKED.
 *
 * The first build of this walked the interview, pressing Skip. It stalled:
 * screens with no Skip, no Next and no drawer handle made `focus()` and
 * `click()` sit out their full timeouts, and ninety iterations of that is
 * twenty minutes of nothing. BS-05f built a filter over the outline that
 * lands on any question by name, which is the door this needs — and using it
 * also means the census measures the same screens a person reaches, by the
 * route a person uses.
 *
 * Fields of a repeatable are out: they have no top-level position, so `Jump`
 * does not offer them (core/flow/jumpTo.ts) and neither does this.
 */
const QUESTIONS = JSON.parse(
  readFileSync(join(ROOT, 'store/script/questions.json'), 'utf8'),
).filter((q) => !q.inRepeatable && q.kind !== 'intro' && q.kind !== 'demo');

async function jumpTo(question) {
  const door = page.getByRole('button', { name: 'Jump to…', exact: true });
  if (!(await door.count())) return false;
  await door.click();
  await page.waitForSelector('#jump-query');
  // Its own first six words are enough to be unique, and safer than the whole
  // sentence: `jumpMatches` requires every word to land.
  await page.locator('#jump-query').fill(question.split(/\s+/).slice(0, 6).join(' '));
  await page.waitForTimeout(220);
  const row = page.locator('.jump-row').first();
  if (!(await row.count())) {
    await page.keyboard.press('Escape');
    return false;
  }
  await row.click();
  await page.waitForTimeout(420);
  await page.mouse.move(0, 0);
  return true;
}

const rows = [];
for (const q of QUESTIONS) {
  try {
    if (!(await jumpTo(q.question))) continue;
    if (!(await page.locator('.flow-q').count())) continue;
    const peek = await setDrawer('Home');
    const atPeek = await measure(peek);
    const tall = await setDrawer('End');
    const atCeiling = await measure(tall);
    await setDrawer('Home');
    if (atPeek && atCeiling) rows.push({ stepId: q.id, kind: q.kind, peek: atPeek, ceiling: atCeiling });
  } catch {
    // A question the filter cannot reach is not a failure of the census.
  }
}

writeFileSync(join(OUT, 'census.json'), JSON.stringify(rows, null, 1));

// The summary is the interesting part, so print it rather than making somebody
// open the JSON to learn whether there is a problem.
const at = (k) => rows.map((r) => r[k]);
const nums = (list, pick) => list.map(pick).filter((n) => typeof n === 'number');
const span = (list) => (list.length ? `${Math.min(...list)}–${Math.max(...list)}` : 'n/a');

for (const end of ['peek', 'ceiling']) {
  const set = at(end);
  const withRephrase = set.filter((r) => r.rephrase);
  console.log(`\n  ── at the ${end} ──`);
  console.log(`  question height   ${span(nums(set, (r) => r.question?.h))} px`);
  console.log(`  visual lines      ${span(nums(set, (r) => r.lines))}`);
  console.log(`  type size         ${span(nums(set, (r) => r.fontPx))} px`);
  console.log(`  words             ${span(nums(set, (r) => r.words))}`);
  console.log(`  answer room       ${span(nums(set, (r) => r.answerRoom))} px`);
  console.log(
    `  rephrase top      ${span(nums(withRephrase, (r) => r.rephrase.y))} px  (on ${withRephrase.length}/${set.length} questions)`,
  );
}
console.log(`\n  ${rows.length} questions measured — wrote store/canvas/census.json`);

await browser.close();
