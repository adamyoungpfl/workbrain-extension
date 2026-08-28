#!/usr/bin/env node
/**
 * BR-01 — the copy review, photographed.
 *
 *   npm run build && node scripts/copy-shots.mjs
 *
 * Writes `store/copy/` : one 400px panel screenshot per SCREEN, plus an index
 * saying which `[DRAFT]` strings are visible on it and exactly where.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The first review page listed the strings by the FILE they live in, which is
 * the order a compiler cares about and the worst possible order for judging
 * copy: "Later", "Keep going" and "Not now" sit next to each other with
 * nothing to say which screen each one is the escape hatch on. Adam, plainly:
 * "I can't align the values in each row to what each one means contextually."
 *
 * So the unit of review becomes the SCREEN, not the file, and every string is
 * shown on a picture of the place it appears, with a numbered marker on the
 * words themselves. The panel pixels are the real built extension — same rule
 * as store-shots.mjs, because a review of a mock is a review of the mock.
 *
 * ── HOW A STRING IS FOUND ON A SCREEN ─────────────────────────────────────
 *
 * By its own text, against the rendered DOM. A template (`${n} new lines in
 * your file.`) becomes a regex with its holes widened. Matching on text rather
 * than on a data-attribute means NOTHING has to be instrumented for the
 * review, so the panel photographed is byte-for-byte the panel that ships.
 *
 * A string no walk reaches is not a failure and is not hidden: the index
 * carries the uncovered ones so the review page can show them apart, with
 * their note, rather than quietly implying the screens are the whole product.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'store/copy');
mkdirSync(OUT, { recursive: true });

const STRINGS = JSON.parse(readFileSync(process.env.WB_STRINGS ?? join(OUT, 'strings.json'), 'utf8'));

/** A draft string as something to look for in rendered text. */
function matcher(text) {
  const first = text.split('\n').find((l) => l.trim().length > 2) ?? text;
  const esc = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return esc.replace(/\\\$\\\{[^}]*\\\}/g, '.{0,40}?');
}
const LOOKUP = STRINGS.map((s) => ({ id: s.id, pat: matcher(s.text) })).filter(
  (s) => s.pat.length > 4,
);

const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString();

/** Half-finished, so most surfaces have something real to show. */
const SEED = {
  values: {
    goal_service: 'chatgpt',
    goal_want: 'Draft my Monday status update the way I would.',
    orientation_ready: null,
    context_scope: 'work',
    stop_explaining: 'The context behind the project I am leading right now.',
    architecture_orientation: null,
    preferred_name: 'Adam',
    self_description: 'I lead the team that keeps our reporting accurate and on time.',
    role_names: ['manager', 'business-owner'],
    responsibilities_list: 'The budget, the vendor contracts, and the final go/no-go call.',
    entities_gate: 'yes',
  },
  repeatables: {
    roles: [
      {
        role_name: 'Manager',
        role_for: 'employer',
        role_mandate: 'Keep the reporting accurate, on time, and trusted by leadership.',
        role_standing: 'primary',
        role_durability: 'current',
      },
      { role_name: 'Business owner', role_for: 'clients', role_mandate: 'Win the work and keep it.' },
    ],
  },
  answeredAt: {
    preferred_name: iso(9),
    self_description: iso(9),
    stop_explaining: iso(6),
    responsibilities_list: iso(4),
    context_scope: iso(9),
    'roles#0#role_mandate': iso(3),
  },
  reflectedAt: { self_description: iso(9), stop_explaining: iso(6) },
};

const browser = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  reducedMotion: 'reduce',
});
const sw = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
const ID = new URL(sw.url()).host;
await sw.evaluate((a) => chrome.storage.local.set({ 'wb:answers': a }), SEED);

/** Every visible run of text on screen, with where it is. */
async function visibleText(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      const t = (node.textContent ?? '').trim();
      if (t.length < 2) continue;
      const el = node.parentElement;
      const r = el?.getBoundingClientRect();
      if (!r || r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > window.innerHeight) continue;
      // ON TOP, not merely in the layout. The splash and every sheet is an
      // overlay with the surface still mounted underneath, so a rect test
      // alone called Home's twenty-one strings "visible" on the splash. Ask
      // the browser what is actually painted at that point.
      const hit = document.elementFromPoint(
        Math.min(window.innerWidth - 1, r.left + Math.min(r.width / 2, 60)),
        Math.min(window.innerHeight - 1, r.top + r.height / 2),
      );
      if (!hit || !(el.contains(hit) || hit.contains(el))) continue;
      out.push({ t, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    // Labels that live on attributes rather than in text: a control whose only
    // word is its accessible name would otherwise be invisible to this.
    document.querySelectorAll('[aria-label]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.top > window.innerHeight) return;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !(el.contains(hit) || hit.contains(el))) return;
      out.push({ t: el.getAttribute('aria-label') ?? '', x: r.left, y: r.top, w: r.width, h: r.height });
    });
    return out;
  });
}

async function capture(screen, page) {
  const runs = await visibleText(page);
  const hits = [];
  for (const s of LOOKUP) {
    let re;
    try { re = new RegExp(s.pat, 'i'); } catch { continue; }
    const run = runs.find((r) => re.test(r.t));
    if (!run) continue;
    if (hits.some((h) => h.id === s.id)) continue;
    hits.push({ id: s.id, x: Math.round(run.x), y: Math.round(run.y), w: Math.round(run.w), h: Math.round(run.h) });
  }
  const file = `${screen.file}.png`;
  await page.screenshot({ path: join(OUT, file) });
  console.log(`  ${file} — ${hits.length} draft strings`);
  return { ...screen, file, hits };
}

async function open(where) {
  const page = await browser.newPage();
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`chrome-extension://${ID}/panel.html`);
  await page.waitForSelector('.home');
  if (where !== 'splash') {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.splash', { state: 'detached' });
  }
  return page;
}

async function intoFlow(page) {
  await page.getByRole('button', { name: /Context\.md/ }).first().click();
  await page.getByRole('button', { name: 'Edit the file', exact: true }).click();
  await page.waitForSelector('.flow');
  await page.waitForTimeout(500);
}

/** Press through anything standing between us and a question. */
async function pastInterstitials(page, limit = 8) {
  for (let i = 0; i < limit; i++) {
    if (await page.locator('.runcard').count()) {
      await page.getByRole('button', { name: 'Keep going', exact: true }).click().catch(() => {});
      await page.waitForTimeout(400);
      continue;
    }
    if ((await page.locator('.flow').getAttribute('data-position')) === 'module-intro') {
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForTimeout(400);
      continue;
    }
    return;
  }
}

const SCREENS = [
  {
    file: '01-splash',
    title: 'The splash',
    where: 'The first thing anybody sees, held until they choose (§9).',
    go: async () => { const p = await open('splash'); await p.waitForTimeout(900); return p; },
  },
  {
    file: '02-home',
    title: 'Home',
    where: 'The shelf: the meter, the files, what to do next (§6).',
    go: async () => { const p = await open(); await p.waitForTimeout(500); return p; },
  },
  {
    file: '03-home-storage',
    title: 'Home · what is stored',
    where: 'The sheet behind "See what\'s stored" — the privacy claim, checkable.',
    go: async () => {
      const p = await open();
      await p.getByRole('button', { name: /stored/i }).first().click().catch(() => {});
      await p.waitForTimeout(500);
      return p;
    },
  },
  {
    file: '04-question',
    title: 'A question',
    where: 'The screen somebody sees fifty times: prompt, box, cluster, chrome.',
    go: async () => { const p = await open(); await intoFlow(p); await pastInterstitials(p); return p; },
  },
  {
    file: '05-module-intro',
    title: 'A module interstitial',
    where: 'The slide between two sections — what the next run is for.',
    go: async () => {
      const p = await open();
      await intoFlow(p);
      for (let i = 0; i < 14; i++) {
        if ((await p.locator('.flow').getAttribute('data-position')) === 'module-intro') return p;
        if (await p.locator('.runcard').count()) {
          await p.getByRole('button', { name: 'Keep going', exact: true }).click().catch(() => {});
        } else {
          const skip = p.getByRole('button', { name: 'Skip', exact: true });
          if (await skip.count()) await skip.click();
          else await p.getByRole('button', { name: 'Next', exact: true }).click().catch(() => {});
        }
        await p.waitForTimeout(400);
      }
      return p;
    },
  },
  {
    file: '06-run-card',
    title: 'The run payoff card',
    where: 'Every fifth answer: what just landed, and the offer to stop (§5).',
    go: async () => {
      const p = await open();
      await intoFlow(p);
      for (let i = 0; i < 14; i++) {
        if (await p.locator('.runcard').count()) return p;
        if ((await p.locator('.flow').getAttribute('data-position')) === 'module-intro') {
          await p.getByRole('button', { name: 'Next', exact: true }).click();
        } else {
          const skip = p.getByRole('button', { name: 'Skip', exact: true });
          if (await skip.count()) await skip.click();
          else await p.getByRole('button', { name: 'Next', exact: true }).click().catch(() => {});
        }
        await p.waitForTimeout(400);
      }
      return p;
    },
  },
  {
    file: '07-assist',
    title: 'AI Assist, open',
    where: 'The bar that stands where the answer box was — copy, carry, come back.',
    go: async () => {
      const p = await open();
      await intoFlow(p);
      await pastInterstitials(p);
      for (let i = 0; i < 10; i++) {
        const chip = p.getByRole('button', { name: /AI Assist/ });
        if (await chip.count()) { await chip.first().click(); await p.mouse.move(0, 0); await p.waitForTimeout(500); return p; }
        const skip = p.getByRole('button', { name: 'Skip', exact: true });
        if (await skip.count()) await skip.click(); else break;
        await p.waitForTimeout(400);
      }
      return p;
    },
  },
  {
    file: '08-jump',
    title: 'Jump to…',
    where: 'The interview\'s own search (§5, BS-05f).',
    go: async () => {
      const p = await open();
      await intoFlow(p);
      await pastInterstitials(p);
      await p.getByRole('button', { name: 'Jump to…', exact: true }).click().catch(() => {});
      await p.waitForTimeout(500);
      return p;
    },
  },
  {
    file: '09-multiples',
    title: 'The list of roles',
    where: 'Rows that say what a record holds (§8).',
    go: async () => {
      const p = await open();
      await p.getByRole('button', { name: /Roles, people and projects/ }).first().click().catch(() => {});
      await p.waitForTimeout(700);
      return p;
    },
  },
  {
    file: '10-drawer-list',
    title: 'The drawer, as a list',
    where: 'The file writing itself — sections, counts, the peek line (§7.1).',
    go: async () => {
      const p = await open();
      await intoFlow(p);
      await pastInterstitials(p);
      const grip = p.locator('[role="separator"]').first();
      await grip.focus();
      for (let i = 0; i < 9; i++) await p.keyboard.press('ArrowUp');
      await p.mouse.move(0, 0);
      await p.waitForTimeout(700);
      return p;
    },
  },
  {
    file: '11-drawer-brain',
    title: 'The drawer, as the brain',
    where: 'The globe, its leaf card and its chips (§7.1, §7.2).',
    go: async () => {
      const p = await open();
      await intoFlow(p);
      await pastInterstitials(p);
      const grip = p.locator('[role="separator"]').first();
      await grip.focus();
      for (let i = 0; i < 9; i++) await p.keyboard.press('ArrowUp');
      await p.mouse.move(0, 0);
      await p.getByRole('button', { name: 'Brain', exact: true }).click().catch(() => {});
      await p.waitForSelector('.brainglobe-svg').catch(() => {});
      await p.waitForTimeout(2000);
      return p;
    },
  },
  {
    file: '12-proof',
    title: 'The proof',
    where: 'The round trip that shows the file working (§3).',
    go: async () => {
      const p = await open();
      await p.getByRole('button', { name: /Prove it works/i }).first().click().catch(() => {});
      await p.waitForSelector('.flow').catch(() => {});
      await p.waitForTimeout(700);
      return p;
    },
  },
  {
    file: '13-feedback',
    title: 'The feedback door',
    where: 'The beta\'s return channel — and what it says it carries (§2).',
    go: async () => {
      const p = await open();
      await p.getByRole('button', { name: /Feedback/i }).first().click().catch(() => {});
      await p.waitForTimeout(600);
      return p;
    },
  },
];

const screens = [];
for (const s of SCREENS) {
  let page;
  try {
    page = await s.go();
    screens.push(await capture(s, page));
  } catch (err) {
    console.log(`  ${s.file} — SKIPPED (${String(err).split('\n')[0].slice(0, 90)})`);
  } finally {
    await page?.close().catch(() => {});
  }
}

const seen = new Set(screens.flatMap((s) => s.hits.map((h) => h.id)));
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify({ screens, covered: [...seen], total: STRINGS.length }, null, 1),
);
console.log(`\n  ${seen.size} of ${STRINGS.length} draft strings photographed in place.`);
await browser.close();
