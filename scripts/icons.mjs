/**
 * design/icon-peaks.svg -> public/icons/{16,32,48,128}.png
 *
 * The manifest wants PNGs; the artwork lives once, as SVG, beside the other
 * design sources. Rendered through Playwright's own Chromium (already a dev
 * dependency — no new package for an image job that runs four times a year)
 * with `omitBackground`, because W Peaks has no tile: the toolbar is the
 * ground, so the pixels outside the peaks must be transparent, not white.
 *
 * Run after any change to the SVG: `node scripts/icons.mjs`
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const svg = readFileSync(join(ROOT, 'design/icon-peaks.svg'), 'utf8');

const browser = await chromium.launch({ channel: 'chromium' });
const page = await browser.newPage();

for (const px of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`,
  );
  await page.screenshot({ path: join(ROOT, `public/icons/${px}.png`), omitBackground: true });
  console.log(`icons/${px}.png`);
}

await browser.close();
