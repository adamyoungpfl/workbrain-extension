import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const browser = await chromium.launchPersistentContext('', {
  channel: 'chrome',
  headless: false,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
});
const sw = browser.serviceWorkers()[0] ?? (await browser.waitForEvent('serviceworker'));
const page = await browser.newPage();
await page.goto(`chrome-extension://${new URL(sw.url()).host}/panel.html`);
await page.waitForSelector('.home', { timeout: 15000 });
const report = await page.evaluate(async () => {
  const synth = window.speechSynthesis;
  const out = { voicesAt0: synth.getVoices().length };
  await new Promise((r) => setTimeout(r, 1500));
  const voices = synth.getVoices();
  out.voicesAfter1500 = voices.length;
  out.localEn = voices.filter((v) => v.localService && v.lang.startsWith('en')).length;
  out.sampleLocal = voices.find((v) => v.localService && v.lang.startsWith('en'))?.name;
  out.defaultVoice = voices.find((v) => v.default)?.name;
  const attempt = async (label, pick) => {
    const u = new SpeechSynthesisUtterance('Check one two.');
    if (pick) u.voice = pick;
    const events = [];
    u.onstart = () => events.push('start');
    u.onend = () => events.push('end');
    u.onerror = (e) => events.push('error:' + e.error);
    synth.speak(u);
    await new Promise((r) => setTimeout(r, 2200));
    synth.cancel();
    return `${label}: [${events.join(',')}] speaking=${synth.speaking}`;
  };
  out.defaultAttempt = await attempt('default', null);
  const local = voices.find((v) => v.localService && v.lang.startsWith('en'));
  out.localAttempt = await attempt('local', local ?? null);
  return out;
});
console.log(JSON.stringify(report, null, 2));
await browser.close();
