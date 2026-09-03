import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const browser = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: false,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
const sw = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
const page = await browser.newPage();
await page.setViewportSize({ width: 400, height: 720 });
await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
await page.waitForSelector('.home', { timeout: 15000 });
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /Start with a few questions/ }).click();
await page.waitForSelector('.narratormark', { timeout: 15000 });
await page.waitForTimeout(1000);
await page.locator('.narratormark').click();
const s1 = [];
for (let i = 0; i < 6; i++) {
  s1.push(await page.evaluate(() => ({
    speaking: window.speechSynthesis.speaking,
    pending: window.speechSynthesis.pending,
    paused: window.speechSynthesis.paused,
    mark: document.querySelector('.narratormark')?.getAttribute('data-speaking'),
  })));
  await page.waitForTimeout(300);
}
console.log('APP PATH (dev bundle):', JSON.stringify(s1));
const raw = await page.evaluate(async () => {
  const u = new SpeechSynthesisUtterance('Raw check.');
  let started = false;
  u.onstart = () => (started = true);
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  await new Promise((r) => setTimeout(r, 1200));
  return { started, speaking: speechSynthesis.speaking, paused: speechSynthesis.paused };
});
console.log('RAW:', JSON.stringify(raw));
await browser.close();
