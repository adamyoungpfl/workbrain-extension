#!/usr/bin/env node
/**
 * Chrome Web Store listing images, captured from the real built extension.
 *
 *   npm run build && node scripts/store-shots.mjs
 *
 * Writes store/ : four 1280x800 screenshots and one 440x280 promo tile.
 *
 * The panel is 400px wide and the store wants 1280x800, so each shot is the
 * real panel composed onto a ground with one line of copy. The panel pixels are
 * never redrawn or mocked — they are a screenshot of the actual extension with
 * real seeded answers, because a listing image that does not match what installs
 * is the fastest way to earn a one-star review.
 *
 * Playwright is already a devDependency (docs/DEPENDENCIES.md); nothing new.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'store');
const ICON = readFileSync(join(ROOT, 'public/icons/128.png')).toString('base64');
mkdirSync(OUT, { recursive: true });

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();

/** A believable half-finished file: enough that the surfaces have something to
 * show, not so much that the images promise a filled-in product nobody has yet. */
const SEED = {
  values: {
    orientation_ready: null, context_scope: 'work',
    stop_explaining: 'The context behind the project I am leading right now.',
    architecture_orientation: null,
    preferred_name: 'Adam', professional_name: '',
    self_description: 'I lead the team that keeps our reporting accurate and on time.',
    role_names: ['manager', 'business-owner'],
    responsibilities_list: 'The budget, the vendor contracts, and the final go/no-go call.',
    contribution_boundaries: 'I give input on the roadmap; the product lead decides.',
    negative_responsibility: null,
    decision_rights: 'Anything under ten thousand is my call.',
    expertise: 'How our reporting pipeline actually works.',
    entities_gate: 'yes',
  },
  repeatables: {
    roles: [
      { role_name: 'Manager / Team Lead', role_for: 'My employer', role_mandate: 'Keep reporting accurate, on time, and trusted.', role_standing: 'Primary', role_durability: 'current' },
      { role_name: 'Business Owner', role_for: 'Clients', role_mandate: 'Deliver work clients pay for again.', role_standing: 'Secondary', role_durability: 'current' },
    ],
    entities: [
      { entity_name: 'Priya', entity_type: 'Person', entity_relevance: 'My manager. Final approver on anything over budget.', entity_aliases: '' },
      { entity_name: 'The Growth team', entity_type: 'Team', entity_relevance: 'Owns customer acquisition. I partner with them monthly.', entity_aliases: 'Growth' },
    ],
  },
  answeredAt: {}, reflectedAt: {},
};
for (const k of Object.keys(SEED.values)) SEED.answeredAt[k] = iso(2);
SEED.answeredAt['roles#0#role_durability'] = iso(212); // one real, due role
for (const [b, recs] of Object.entries(SEED.repeatables)) {
  recs.forEach((r, i) => Object.keys(r).forEach((k) => { SEED.answeredAt[`${b}#${i}#${k}`] = iso(2); }));
}

const SHOTS = [
  { file: '1-home', caption: 'Your file, and whether it is still true.', where: 'home' },
  { file: '2-question', caption: 'One question at a time. Skip anything. Stop anywhere.', where: 'question' },
  { file: '3-brain', caption: 'Watch it come together as you answer.', where: 'brain' },
  { file: '4-proof', caption: 'Then prove it works, in the AI you already use.', where: 'proof' },
];

const browser = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
const sw = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;

async function panel(where) {
  await sw.evaluate(async (v) => { await chrome.storage.local.set({ 'wb:answers': v }); }, SEED);
  const page = await browser.newPage();
  await page.setViewportSize({ width: 400, height: 720 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  // V2.1 VB-73: the splash is a doorway and stays until dismissed. The
  // listing photographs the surfaces, not the doorway — Escape, then wait for
  // it to be genuinely gone so no shot catches its fade.
  await page.keyboard.press('Escape');
  await page.waitForSelector('.splash', { state: 'detached' });

  if (where !== 'home') {
    await page.getByRole('button', { name: /Context\.md/ }).first().click();
    // V1.7 VB-37: the file row opens the FILE, and the file view is where the
    // interview is entered — the same two-step walk every e2e spec makes.
    // BS-06 rebuilt this door: it read "Go through the questions" until §6
    // put one verb on it, and this script broke silently at the first shot
    // after the panel it photographs.
    await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
    await page.waitForSelector('.flow');
    await page.waitForTimeout(700);
    // A reflect screen is a poor listing image — it shows the machinery, not
    // the question. So is a bare yes/no gate ("another role?"), which V1.4's
    // roles loop parks the resume on: a listing shot captioned "the questions
    // are the point" must show a question with some point to it. Step past
    // both until the screen holds a real box to write in.
    for (let i = 0; i < 10; i++) {
      const position = await page.locator('.flow').getAttribute('data-position');
      // BS-05d: a run's payoff card stands between two questions. It is a fine
      // screen and a poor listing image — the caption promises a question.
      if (await page.locator('.runcard').count()) {
        await page.getByRole('button', { name: 'Keep going', exact: true }).click().catch(() => {});
        await page.waitForTimeout(600);
        continue;
      }
      if (position === 'module-intro') {
        await page.getByRole('button', { name: 'Next', exact: true }).click();
        await page.waitForTimeout(600);
        continue;
      }
      if (position === 'reflect') {
        await page.getByRole('button', { name: 'Keep it as-is', exact: true }).click();
        await page.waitForTimeout(600);
        continue;
      }
      // A real box to write in — input or textarea. The old check named
      // `textarea.field` only, so a single-line question walked straight past
      // it and the loop ran on until it ran out.
      if ((await page.locator('.flow .field').count()) > 0) break;
      const no = page.getByRole('button', { name: 'No', exact: true });
      if (await no.count()) await no.click();
      // SKIP, NEVER NEXT. Next on an empty field is a failed submit, and the
      // question then wears "Answer this to keep going, or skip it." in red —
      // which is exactly what the last four listing images showed. Skip
      // advances without validating, and it is also the thing this shot's own
      // caption promises ("Skip anything").
      const skip = page.getByRole('button', { name: 'Skip', exact: true });
      if (await skip.count()) await skip.click();
      else await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForTimeout(700);
    }
  }
  if (where === 'brain') {
    const grip = page.locator('[role="separator"]').first();
    const b = await grip.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y - 150, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    // Exact, not /brain/i: the breadcrumb's "Work brain" rung also matches the
    // loose pattern and sits first in the DOM, which pulled the shot out to
    // the work tier instead of showing the globe.
    const brain = page.getByRole('button', { name: 'Brain', exact: true });
    if (await brain.count()) {
      await brain.click();
      // The globe and a settled pose — the drawer grows and the stage drifts
      // for a moment; a shot mid-motion is a smear.
      //
      // Waited on `.brainglobe-nav` until BS-07a's remainder DELETED that band
      // and gave its thirty pixels back to the stage. The stage itself is the
      // durable thing to wait for: it is what the shot is of.
      await page.waitForSelector('.brainglobe-svg');
      await page.waitForTimeout(2200);
    }
  }
  if (where === 'proof') {
    await page.goBack().catch(() => {});
    await page.goto(`chrome-extension://${id}/panel.html`);
    await page.waitForSelector('.home');
    const p = page.getByRole('button', { name: /Prove it works/i }).first();
    if (await p.count()) { await p.click(); await page.waitForSelector('.flow'); await page.waitForTimeout(600);
      const pill = page.locator('.flow .pillgroup .pill').first();
      if (await pill.count()) { await pill.click();
        await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(900); } }
  }
  await page.waitForTimeout(400);
  const buf = await page.screenshot();
  await page.close();
  return buf.toString('base64');
}

const composer = await browser.newPage();

for (const shot of SHOTS) {
  const b64 = await panel(shot.where);
  await composer.setViewportSize({ width: 1280, height: 800 });
  await composer.setContent(`<body style="margin:0;width:1280px;height:800px;display:flex;align-items:center;justify-content:center;gap:76px;
    background:radial-gradient(120% 100% at 22% 8%,#F4F7FD 0%,#E8EDF8 48%,#DDE4F2 100%);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <div style="max-width:430px">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:22px">
        <img src="data:image/png;base64,${ICON}" width="34" height="34" style="border-radius:9px"/>
        <span style="font-size:21px;font-weight:700;letter-spacing:-.02em;color:#6A3FD1">Workbrain</span>
      </div>
      <p style="font-size:34px;line-height:1.22;font-weight:680;letter-spacing:-.026em;color:#14161C;margin:0">${shot.caption}</p>
      <p style="font-size:16px;line-height:1.55;color:#4C5462;margin:20px 0 0">Answer some questions. Get a file. Hand it to whatever AI you already use.</p>
    </div>
    <img src="data:image/png;base64,${b64}" width="400" style="border-radius:16px;box-shadow:0 24px 60px rgba(21,24,29,.20),0 3px 10px rgba(21,24,29,.10)"/>
  </body>`);
  await composer.screenshot({ path: join(OUT, `${shot.file}.png`) });
  console.log(`  wrote store/${shot.file}.png`);
}

// 440x280 promo tile — the mark and the name, nothing else.
await composer.setViewportSize({ width: 440, height: 280 });
await composer.setContent(`<body style="margin:0;width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  background:radial-gradient(120% 100% at 50% 22%,#1B2547 0%,#0E1428 58%,#070A16 100%);font-family:-apple-system,BlinkMacSystemFont,sans-serif">
  <img src="data:image/png;base64,${ICON}" width="86" height="86" style="border-radius:22px"/>
  <div style="font-size:30px;font-weight:720;letter-spacing:-.024em;color:#EDF1FA">Workbrain</div>
  <div style="font-size:14.5px;color:#9DAAC6;text-align:center;max-width:330px;line-height:1.5">Teach AI who you are, once.</div>
</body>`);
await composer.screenshot({ path: join(OUT, 'promo-440x280.png') });
console.log('  wrote store/promo-440x280.png');

await browser.close();
