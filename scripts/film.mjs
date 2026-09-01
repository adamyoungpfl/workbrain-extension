#!/usr/bin/env node
/**
 * A filmstrip of the splash, so choreography can be LOOKED AT.
 *
 *   npm run build && node scripts/film.mjs --from 2 --to 6 --n 9
 *   node scripts/film.mjs --rolodex          # one turn, frozen, six poses
 *   node scripts/film.mjs --still            # the reduced-motion frame
 *
 * Writes film/ : the frames, and film/strip.png — one contact sheet with the
 * time under each frame.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────
 * A screenshot at one instant says almost nothing about a sequence, and
 * relaunching a browser per frame is the cost that makes people stop looking.
 * One launch, N frames, one image. It was written for the mosaic's tinting
 * pass, deleted, and wanted again within the day — so it lives here now.
 *
 * Playwright is already a devDependency (docs/DEPENDENCIES.md); nothing new.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'film');
mkdirSync(OUT, { recursive: true });

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const flag = (name) => process.argv.includes(`--${name}`);

/* The turn's length, kept in step with core/splash/reveal.ts by reading the
   custom property the stylesheet and the spine both hang off. Read from the
   page below rather than repeated here. */
const ROLODEX_MODE = flag('rolodex');
const EL = arg('el', '');
const STILL = flag('still');
const FROM = Number(arg('from', ROLODEX_MODE ? 3.0 : 2.0));
const TO = Number(arg('to', ROLODEX_MODE ? 3.62 : 6.0));
const N = Number(arg('n', ROLODEX_MODE ? 6 : 9));

const browser = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  ...(STILL ? { reducedMotion: 'reduce' } : {}),
});
const sw = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
const id = new URL(sw.url()).host;

const page = await browser.newPage();
await page.setViewportSize({ width: 400, height: 720 });
await page.goto(`chrome-extension://${id}/panel.html`);

/* THE ANCHOR IS THE REVEAL'S OWN ARRIVAL, not the navigation. `.splashreveal`
   mounts when the white breaks, which is t=0 for everything in the spine — so
   every frame below is labelled in the same seconds the table is written in. */
await page.waitForSelector('.splashreveal', { timeout: 30000 });
const t0 = Date.now();

if (ROLODEX_MODE) {
  /* THE TURN IS POSED, NOT CHASED. CSS animations do not run on a fake clock,
     and the shutter is slower than a 620ms turn — sampling it by waiting gets
     whatever frame the screenshot happens to land on.

     Held first until the whole reveal has settled, so each pose is seen where
     it actually plays: under a finished screen with the doors on it, not
     against a half-arrived one. By then the turn is long over, so each pose
     RESTARTS the animation and immediately pauses it at a negative delay —
     stepping the delay alone would only re-pose an animation still running.

     The name, duration and easing are read off the element rather than
     written here: this script scrubs the stylesheet's animation, it does not
     keep a second copy of it. */
  const settleAt = Number(arg('at', 9.0));
  const wait = t0 + settleAt * 1000 - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
}

const pose = (ms) =>
  page.evaluate((into) => {
    const el = document.querySelector('.splashreveal-rolodex');
    if (!el) return;
    const from = getComputedStyle(el);
    const spec = `${from.animationName} ${from.animationDuration} ${from.animationTimingFunction}`;
    el.style.animation = 'none';
    void el.offsetWidth; // the reflow that makes the restart a restart
    el.style.animation = spec;
    el.style.animationPlayState = 'paused';
    el.style.animationDelay = `-${into}ms`;
  }, ms);

const frames = [];
for (let i = 0; i < N; i += 1) {
  const at = N === 1 ? FROM : FROM + ((TO - FROM) * i) / (N - 1);
  if (ROLODEX_MODE) {
    await pose(Math.max(0, (at - FROM) * 1000).toFixed(0));
    await page.waitForTimeout(60);
  } else {
    const due = t0 + at * 1000;
    const wait = due - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }
  const real = (Date.now() - t0) / 1000;
  /* A whole 400px panel shrunk into a contact sheet hides exactly the thing a
     close pass is looking at. `--el` photographs one section instead, so the
     frames arrive big enough to judge. */
  const buf = EL ? await page.locator(EL).screenshot() : await page.screenshot();
  const label = ROLODEX_MODE ? `+${((at - FROM) * 1000).toFixed(0)}ms` : `${real.toFixed(2)}s`;
  frames.push({ label, data: buf.toString('base64') });
  writeFileSync(join(OUT, `frame-${String(i).padStart(2, '0')}.png`), buf);
}

/* The contact sheet. Composed in the same browser rather than by a library:
   an image dependency for a dev script would be a runtime dependency in the
   lockfile, and docs/DEPENDENCIES.md would have to argue for it. */
const W = EL ? 380 : 200;
const COLS = EL ? Math.min(frames.length, 2) : Math.min(frames.length, 5);
const sheet = await browser.newPage();
await sheet.setViewportSize({ width: COLS * (W + 16) + 24, height: 600 });
await sheet.setContent(`<body style="margin:0;background:#111;display:grid;
  grid-template-columns:repeat(${COLS},${W}px);gap:16px;padding:12px;font:12px ui-monospace,monospace;color:#bbb">
  ${frames
    .map(
      (f) => `<figure style="margin:0"><img src="data:image/png;base64,${f.data}" width="${W}"
        style="display:block;border:1px solid #333"><figcaption style="padding-top:6px">${f.label}</figcaption></figure>`,
    )
    .join('')}
</body>`);
await sheet.screenshot({ path: join(OUT, 'strip.png'), fullPage: true });

await browser.close();
console.log(`film/strip.png — ${frames.length} frames, ${frames[0].label} … ${frames[frames.length - 1].label}`);
