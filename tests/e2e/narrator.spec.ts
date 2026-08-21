import { test, expect, chromium } from '@playwright/test';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Prefs } from '../../src/schema/storage.types';

/**
 * V1.3 VB-18's accept criteria, driven in a real browser:
 *
 *   "a toggle in the header reads and writes `Prefs.narrator` in sync storage;
 *    narration reads the current question and stops the moment the person
 *    advances, skips, or toggles it off; nothing is narrated that the person
 *    did not choose to hear; works offline; ≥44×44 with a real accessible name
 *    and a visible state, not colour alone."
 *
 * WHY THE SPEECH ENGINE IS A FAKE, AND WHAT THAT DOES AND DOES NOT PROVE.
 * `speechSynthesis` on this machine is the operating system's, so a suite that
 * used it would talk out loud on every `npm run check` and would depend on
 * which voices happen to be installed on whoever's laptop. So an instrumented
 * stand-in is installed before the panel's own script runs: it records every
 * `speak` and every `cancel` in order, and — the part that matters — it models
 * an utterance's *duration*, so "mid-utterance" is a real moment and
 * `speechSynthesis.speaking` is a real value rather than something eyeballed.
 *
 * That proves everything about the panel's own behaviour: what it says, when,
 * in what voice, and above all when it stops. It cannot prove the OS engine
 * makes a noise — that was verified separately, by hand, against the real
 * engine (180 voices, 41 of them English, on the machine this was built on),
 * which is also what `wbVoices` exists for.
 *
 * Self-contained launch helpers, per this repo's one-spec-stands-alone
 * convention (see typewriter.spec.ts and dev-reset.spec.ts).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');

/** Two voices, one of each kind, so the offline rule in core/voice/roles.ts is
 * exercised by the real wiring and not only by its unit test. */
const FAKE_VOICES = [
  { name: 'Google US English', lang: 'en-US', localService: false, default: true },
  { name: 'Samantha', lang: 'en-US', localService: true, default: false },
];

interface SpokenRecord {
  text: string;
  voice: string | null;
  lang: string;
  rate: number;
  pitch: number;
  /** 'speaking' until it either finishes or is cancelled. */
  outcome: 'speaking' | 'finished' | 'cancelled';
}

interface SpeechProbe {
  spoken: SpokenRecord[];
  calls: string[];
  /** Anything that would have triggered a capture permission. */
  captureTouched: string[];
}

/**
 * Installs the instrumented speech engine and the capture tripwires, before
 * any of the panel's own script runs.
 *
 * The tripwires are the other half of VB-18's scope: the microphone is
 * deferred to its own task because it needs a permission, so this feature must
 * never reach for `SpeechRecognition` or `getUserMedia`. Touching either is
 * recorded here and asserted to be empty at the end of a run that narrates
 * several screens.
 */
function installSpeechProbe(page: Page, voices = FAKE_VOICES) {
  return page.addInitScript((installed) => {
    const probe = { spoken: [], calls: [], captureTouched: [] } as unknown as SpeechProbe;
    (window as unknown as { __speech: SpeechProbe }).__speech = probe;

    class FakeUtterance {
      voice: { name: string } | null = null;
      lang = '';
      rate = 1;
      pitch = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    }

    let timer = 0;
    let current: SpokenRecord | null = null;

    const synth = {
      speaking: false,
      pending: false,
      getVoices: () => installed,
      addEventListener: () => {},
      removeEventListener: () => {},
      speak(utterance: FakeUtterance) {
        probe.calls.push('speak');
        const record: SpokenRecord = {
          text: utterance.text,
          voice: utterance.voice?.name ?? null,
          lang: utterance.lang,
          rate: utterance.rate,
          pitch: utterance.pitch,
          outcome: 'speaking',
        };
        probe.spoken.push(record);
        current = record;
        synth.speaking = true;
        window.clearTimeout(timer);
        // Roughly a real reading pace — long enough that every assertion below
        // about "mid-utterance" is genuinely mid-utterance.
        timer = window.setTimeout(
          () => {
            record.outcome = 'finished';
            synth.speaking = false;
            current = null;
            utterance.onend?.();
          },
          Math.max(2000, utterance.text.length * 60),
        );
      },
      cancel() {
        probe.calls.push('cancel');
        window.clearTimeout(timer);
        if (current && current.outcome === 'speaking') current.outcome = 'cancelled';
        current = null;
        synth.speaking = false;
      },
    };

    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });

    // --- capture tripwires: reading either of these is a failure ---
    for (const name of ['SpeechRecognition', 'webkitSpeechRecognition']) {
      Object.defineProperty(window, name, {
        configurable: true,
        get() {
          probe.captureTouched.push(name);
          return undefined;
        },
      });
    }
    const media = navigator.mediaDevices;
    if (media) {
      Object.defineProperty(media, 'getUserMedia', {
        configurable: true,
        get() {
          probe.captureTouched.push('getUserMedia');
          return () => Promise.reject(new Error('not in this feature'));
        },
      });
    }
  }, voices);
}

const probeOf = (page: Page): Promise<SpeechProbe> =>
  page.evaluate(() => (window as unknown as { __speech: SpeechProbe }).__speech);

const isSpeaking = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.speechSynthesis.speaking);

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
  await installSpeechProbe(page);
  await page.setViewportSize({ width: 400, height: 700 });
  await page.goto(`chrome-extension://${id}/panel.html`);
  await page.waitForSelector('.home');
  return page;
}

async function enterInterview(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Context\.md/ }).click();
  await page.waitForSelector('.flow');
}

const toggle = (page: Page) => page.getByRole('button', { name: 'Read questions aloud' });

/** Q1 is `orientation_ready`, an intro. Q2 is `context_scope`, three pills. */
async function toContextScope(page: Page): Promise<void> {
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'orientation_ready');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
}

const questionText = (page: Page) => page.locator('.flow-q').first().textContent();

test.describe('the toggle', () => {
  test('is a real control: 44×44, named, with a state that is not colour alone', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    const button = toggle(page);
    await expect(button).toBeVisible();

    // docs/GUARDRAILS.md's floor, measured rather than assumed.
    const box = await button.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    // A toggle button, not a checkbox pretending to be one, and off first:
    // nothing is ever narrated that the person did not choose to hear.
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    // It is the first thing in the tab order on the screen, and the ring is a
    // real 2px --primary one.
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    // Drawn on the painted face rather than on the 44px hit box — a ring round
    // the whole target would enclose empty space on three sides of a 30px
    // control (see NarratorToggle.css).
    const ring = await button.evaluate((el) => {
      const face = getComputedStyle(el, '::before');
      return {
        width: face.outlineWidth,
        style: face.outlineStyle,
        colour: face.outlineColor,
        offset: face.outlineOffset,
      };
    });
    expect(ring.style).toBe('solid');
    expect(parseFloat(ring.width)).toBeGreaterThanOrEqual(2);
    expect(parseFloat(ring.offset)).toBeGreaterThanOrEqual(2);
    // --primary, the one ring colour docs/GUARDRAILS.md names.
    expect(ring.colour).toBe('rgb(42, 79, 203)');

    // THE STATE IS A DIFFERENT DRAWING, not a different colour. Both halves
    // are always in the DOM; which one is painted is what changes, and it is
    // still true with every colour in the page forced to the same value.
    const shownParts = () =>
      page.evaluate(() => {
        const wavesEl = document.querySelector('.narrator-waves');
        const muteEl = document.querySelector('.narrator-mute');
        const shown = (el: Element | null) => (el ? Number(getComputedStyle(el).opacity) : -1);
        return { waves: shown(wavesEl), mute: shown(muteEl) };
      });

    const off = await shownParts();
    expect(off.mute).toBe(1);
    expect(off.waves).toBe(0);

    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(200); // the 120ms cross-fade
    const on = await shownParts();
    expect(on.waves).toBe(1);
    expect(on.mute).toBe(0);

    await context.close();
  });

  test('writes Prefs.narrator to SYNC storage, and it survives a reopen', async () => {
    const { context, sw, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    await toggle(page).click();
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true');

    const stored = await sw.evaluate(async () => {
      const sync = await chrome.storage.sync.get('wb:prefs');
      const local = await chrome.storage.local.get('wb:prefs');
      return { sync: sync['wb:prefs'] as Prefs | undefined, local: local['wb:prefs'] };
    });
    expect(stored.sync?.narrator).toBe(true);
    // Sync, not local — a preference settles across the person's devices;
    // their answers never do (docs/ARCHITECTURE.md).
    expect(stored.local).toBeUndefined();
    // The write preserves the rest of the object, including the mic
    // preference this task deliberately does not touch.
    expect(stored.sync?.mic).toBe(false);
    expect(stored.sync?.packUrls).toEqual([]);

    // Reopening the panel is a fresh document reading sync storage again.
    await page.close();
    const reopened = await openPanel(context, id);
    await enterInterview(reopened);
    await expect(toggle(reopened)).toHaveAttribute('aria-pressed', 'true');

    // Turning it off writes that back too, rather than only forgetting it.
    await toggle(reopened).click();
    await expect(toggle(reopened)).toHaveAttribute('aria-pressed', 'false');
    const after = await sw.evaluate(async () => {
      const sync = await chrome.storage.sync.get('wb:prefs');
      return (sync['wb:prefs'] as Prefs | undefined)?.narrator;
    });
    expect(after).toBe(false);

    await context.close();
  });
});

test.describe('what it narrates', () => {
  test('says nothing at all until it is turned on', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toContextScope(page);
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.waitForTimeout(300);

    const probe = await probeOf(page);
    // Not one utterance, and not even a cancel: with the narrator off the
    // panel does not touch the speech API.
    expect(probe.spoken).toEqual([]);
    expect(probe.calls).toEqual([]);

    await context.close();
  });

  test('reads the question on screen, in the offline voice', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toContextScope(page);

    const question = (await questionText(page))?.trim();
    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);

    const probe = await probeOf(page);
    const spoken = probe.spoken[0];
    expect(spoken?.text).toBe(question);
    // core/voice/roles.ts prefers a locally-installed voice over the
    // better-sounding one that needs a network — docs/GUARDRAILS.md's "no
    // feature that only works online", proven through the real wiring.
    expect(spoken?.voice).toBe('Samantha');
    expect(spoken?.lang).toBe('en-US');
    // Cancel before speak, always.
    expect(probe.calls).toEqual(['cancel', 'speak']);

    await context.close();
  });

  test('reads a rephrasing as soon as it replaces the question', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toContextScope(page);
    // `stop_explaining` is the first question carrying rephrasings.
    await page.locator('.flow .pillgroup .pill').first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');

    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);
    const first = (await questionText(page))?.trim();

    await page.getByRole('button', { name: 'Ask me that a different way' }).click();
    await expect.poll(async () => (await questionText(page))?.trim()).not.toBe(first);
    const second = (await questionText(page))?.trim();

    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(2);
    const probe = await probeOf(page);
    expect(probe.spoken[0]?.text).toBe(first);
    // The wording on screen and the wording being read are never two
    // different questions: the first was cut off for the second.
    expect(probe.spoken[0]?.outcome).toBe('cancelled');
    expect(probe.spoken[1]?.text).toBe(second);

    await context.close();
  });

  test('reads a follow-up when one is opened, and stops when it is closed', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    // The opening screen carries two follow-up tags (V1.1 VB-03).
    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);

    const chip = page.locator('.deepdive-chip').first();
    await chip.click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(2);

    const answer = (await page.locator('.deepdive-answer').first().textContent())?.trim();
    const probe = await probeOf(page);
    expect(probe.spoken[1]?.text).toBe(answer);
    // The screen's own recap was cut off for it, not queued behind it.
    expect(probe.spoken[0]?.outcome).toBe('cancelled');

    expect(await isSpeaking(page)).toBe(true);
    await chip.click(); // close it again
    await expect.poll(() => isSpeaking(page)).toBe(false);
    // Closing stops; it does not start something else.
    expect((await probeOf(page)).spoken).toHaveLength(2);

    await context.close();
  });
});

test.describe('when it stops', () => {
  test('advancing cancels the previous screen mid-sentence', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);

    const firstScreen = (await questionText(page))?.trim();
    expect(await isSpeaking(page)).toBe(true);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(2);

    const probe = await probeOf(page);
    // The intro was still being read when Next was pressed, and it was cut
    // off — not left to finish over the top of the next question.
    expect(probe.spoken[0]?.text).toBe(firstScreen);
    expect(probe.spoken[0]?.outcome).toBe('cancelled');
    expect(probe.spoken[1]?.text).toBe((await questionText(page))?.trim());
    // A cancel lands between the two utterances, every time.
    expect(probe.calls).toEqual(['cancel', 'speak', 'cancel', 'cancel', 'speak']);

    await context.close();
  });

  test('skipping and going back cancel it too', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toContextScope(page);
    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);

    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(2);
    expect((await probeOf(page)).spoken[0]?.outcome).toBe('cancelled');

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(3);

    const probe = await probeOf(page);
    expect(probe.spoken[1]?.outcome).toBe('cancelled');
    expect(probe.spoken[2]?.text).toBe((await questionText(page))?.trim());

    await context.close();
  });

  test('turning it off stops it immediately, mid-utterance', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);

    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);
    expect(await isSpeaking(page)).toBe(true);

    await toggle(page).click();
    // Not "eventually", not after the sentence: the engine is silent on the
    // very next check, and nothing new was started.
    expect(await isSpeaking(page)).toBe(false);
    const probe = await probeOf(page);
    expect(probe.spoken).toHaveLength(1);
    expect(probe.spoken[0]?.outcome).toBe('cancelled');

    // And it stays silent while the person carries on working.
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    await page.waitForTimeout(300);
    expect((await probeOf(page)).spoken).toHaveLength(1);
    expect(await isSpeaking(page)).toBe(false);

    await context.close();
  });

  test('closing the panel stops it', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);
    expect(await isSpeaking(page)).toBe(true);

    // Chrome's speech queue outlives the document that filled it, so a panel
    // closed mid-sentence can leave a voice talking to an empty screen. The
    // event is dispatched here rather than actually closing the side panel —
    // the page has to survive for the assertion — but it is the same event the
    // browser fires on a real close, and the listener under test is the real
    // one (voice/speech.ts's `primeVoices`).
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    expect(await isSpeaking(page)).toBe(false);
    expect((await probeOf(page)).spoken[0]?.outcome).toBe('cancelled');

    await context.close();
  });
});

test.describe('what it must never do', () => {
  test('never blocks or delays the person answering', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toContextScope(page);
    await page.locator('.flow .pillgroup .pill').first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'stop_explaining');

    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);
    expect(await isSpeaking(page)).toBe(true);

    // Mid-utterance, the field is an ordinary field: it takes focus, it takes
    // keystrokes, and nothing about the voice interferes with either.
    const field = page.locator('.flow textarea, .flow input[type="text"]').first();
    await field.click();
    await field.type('Explaining who our customers are, again.', { delay: 5 });
    await expect(field).toHaveValue('Explaining who our customers are, again.');
    // Typing does not silence the narrator either — VB-10's skip is for the
    // print, and this is not the print.
    expect(await isSpeaking(page)).toBe(true);

    await context.close();
  });

  test('asks for no permission, and ships no microphone', async () => {
    const { context, id } = await launchExtension();
    const page = await openPanel(context, id);
    await enterInterview(page);
    await toggle(page).click();
    await expect.poll(() => probeOf(page).then((p) => p.spoken.length)).toBe(1);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.locator('.flow')).toHaveAttribute('data-step-id', 'context_scope');
    await page.locator('.deepdive-chip').first().click().catch(() => {});
    await page.waitForTimeout(200);

    // Nothing in a narrating panel has read `SpeechRecognition` or reached for
    // `getUserMedia`. The mic is a separate task with a separate permission
    // decision, taken after the store submission (VB-18).
    expect((await probeOf(page)).captureTouched).toEqual([]);

    // And there is exactly one toggle up there, not two.
    await expect(page.locator('.narrator-toggle')).toHaveCount(1);
    await expect(page.locator('.narrator button')).toHaveCount(1);

    // The manifest is untouched: install-time permissions are still the two.
    const manifest = JSON.parse(readFileSync(path.join(DIST, 'manifest.json'), 'utf8')) as {
      permissions: string[];
      optional_permissions?: string[];
    };
    expect([...manifest.permissions].sort()).toEqual(['sidePanel', 'storage']);
    expect(manifest.optional_permissions ?? []).not.toContain('audioCapture');

    await context.close();
  });

  test('ships no speech-recognition or capture code at all', () => {
    const chunks: { file: string; source: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(js|mjs|html|json)$/.test(entry))
          chunks.push({ file: path.relative(DIST, full), source: readFileSync(full, 'utf8') });
      }
    };
    walk(DIST);

    // Positive control: the grep can find things in these files.
    expect(chunks.some((c) => c.source.includes('Read questions aloud'))).toBe(true);

    for (const banned of ['SpeechRecognition', 'getUserMedia', 'mediaDevices', 'audioCapture']) {
      const found = chunks.filter((c) => c.source.includes(banned)).map((c) => c.file);
      expect(found, `"${banned}" is in the shipped panel: ${found.join(', ')}`).toEqual([]);
    }

    // The dev-only voice audition is stripped by the same `import.meta.env.DEV`
    // branch that strips the reset chord — a console tool for choosing a voice
    // is not shipped UI (docs/GUARDRAILS.md rules out a settings page).
    for (const devOnly of ['wbVoices', '[workbrain] voice audition']) {
      const found = chunks.filter((c) => c.source.includes(devOnly)).map((c) => c.file);
      expect(found, `"${devOnly}" leaked into the production bundle: ${found.join(', ')}`).toEqual([]);
    }
  });

  test('works with no voices installed at all, and with no engine at all', async () => {
    const { context, id } = await launchExtension();

    // A machine whose engine reports nothing: still narrates, with the
    // browser's own default voice. Degrade, never break.
    const bare = await context.newPage();
    await installSpeechProbe(bare, []);
    await bare.setViewportSize({ width: 400, height: 700 });
    await bare.goto(`chrome-extension://${id}/panel.html`);
    await bare.waitForSelector('.home');
    await enterInterview(bare);
    await toggle(bare).click();
    await expect.poll(() => probeOf(bare).then((p) => p.spoken.length)).toBe(1);
    expect((await probeOf(bare)).spoken[0]?.voice).toBeNull();
    await bare.close();

    // A browser with no speech API at all: no toggle, no error, no note about
    // it. The interview is exactly the interview.
    const silent = await context.newPage();
    await silent.addInitScript(() => {
      // Deleted rather than set to `undefined`: the panel checks for the API
      // with `in` so that it never wakes the OS speech service just to find
      // out whether there is one (voice/speech.ts's `narratorSupported`), and
      // a property that exists holding `undefined` would not be the case being
      // modelled.
      delete (window as unknown as Record<string, unknown>).speechSynthesis;
      delete (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance;
    });
    await silent.setViewportSize({ width: 400, height: 700 });
    await silent.goto(`chrome-extension://${id}/panel.html`);
    await silent.waitForSelector('.home');
    await enterInterview(silent);
    await expect(silent.locator('.narrator-toggle')).toHaveCount(0);
    await expect(silent.locator('.flow-q').first()).toBeVisible();
    await expect(silent.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();

    await context.close();
  });
});
