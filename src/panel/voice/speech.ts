import { utteranceFor, type InstalledVoice } from '../../core/voice/roles';
import type { Narration } from '../../core/voice/narration';

/**
 * V1.3 VB-18 — the part of the narrator that genuinely needs a browser.
 *
 * Native `SpeechSynthesis`: free, offline, no key, no server, nothing leaves
 * the browser — the same story as everything else in this product, and the
 * only kind of voice that satisfies docs/GUARDRAILS.md's "no feature that only
 * works online". Ported from the sibling app's own narrator
 * (`../modelcitizen/src/components/WorkBrainContextInterview.tsx`), minus its
 * microphone: VB-18 defers that to its own task after the store submission,
 * because `SpeechRecognition` triggers a capture permission. **There is no mic
 * code in this feature, deliberately** — tests/e2e/narrator.spec.ts asserts
 * that the built panel never touches `getUserMedia` or `SpeechRecognition`.
 *
 * WHAT IS HERE AND WHAT IS NOT. Which voice a role gets, and what a screen
 * says, are decisions with no browser in them and live in core/voice/. This
 * module owns the three things that cannot: the utterance object, the cancel,
 * and the list of voices the machine actually has installed.
 *
 * CANCEL BEFORE SPEAK, ALWAYS. `speechSynthesis` has a queue, and every path
 * into it here empties that queue first. A narrator that finishes the previous
 * screen's sentence before starting this one is the failure VB-18 names as
 * "the main way this feature becomes hateful", and it is a queue behaviour by
 * default rather than a bug you have to write.
 */

interface SpeechApis {
  readonly synth: SpeechSynthesis;
  readonly Utterance: typeof SpeechSynthesisUtterance;
}

/**
 * The speech API pair, or `null` where there is none.
 *
 * Read from the global on every call rather than captured once: this module
 * loads before the panel renders, and its tests install a fake between import
 * and use. Both halves are checked — a browser with `speechSynthesis` but no
 * `SpeechSynthesisUtterance` is not a browser this can speak in, and the
 * silent degradation is the same either way.
 */
function speechApis(): SpeechApis | null {
  const scope = globalThis as unknown as {
    speechSynthesis?: SpeechSynthesis;
    SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  };
  const synth = scope.speechSynthesis;
  const Utterance = scope.SpeechSynthesisUtterance;
  if (!synth || typeof Utterance !== 'function') return null;
  return { synth, Utterance };
}

/**
 * Whether this browser can narrate at all.
 *
 * The panel renders no toggle where this is false. Not an error, not a banner,
 * not a disabled control explaining itself — docs/GUARDRAILS.md's degradation
 * rule: the panel simply does less, and says nothing about it.
 *
 * IT DOES NOT READ `window.speechSynthesis`, AND THAT IS THE WHOLE POINT.
 * `speechSynthesis` is an accessor on `window`, and getting it once — not
 * calling anything on it, just reading it — makes Chrome start the operating
 * system's speech service. Measured on macOS, in this extension's own panel:
 * `!!window.speechSynthesis` takes 567ms, `getVoices()` 570ms, and
 * `'speechSynthesis' in window` 0ms. The panel's own rendering is unaffected
 * either way — the DOM timeline is identical — but everything else going
 * through the browser process waits behind it. The toggle mounts on the first
 * screen of the interview, so paying that for a person who never turns the
 * narrator on would be a cost taken from everybody for the benefit of a few.
 * (Found by measurement, after tests/e2e/typewriter.spec.ts started failing
 * three unrelated assertions — which is precisely what that spec is for.)
 *
 * `in` does not invoke the accessor, and `SpeechSynthesisUtterance` is an
 * ordinary global constructor with nothing behind it, so this pair is free and
 * says the same thing. The engine is first touched when someone asks for a
 * voice, which is the one moment a pause is both expected and unnoticeable.
 */
export function narratorSupported(): boolean {
  const scope = globalThis as unknown as { SpeechSynthesisUtterance?: unknown };
  return 'speechSynthesis' in globalThis && typeof scope.SpeechSynthesisUtterance === 'function';
}

/**
 * The last non-empty voice list this document has seen.
 *
 * `getVoices()` is specified to return an empty array until the engine has
 * loaded its list, with a `voiceschanged` event when it has — and on some
 * platforms it empties again later, mid-session, for no reason the page can
 * see. Remembering the last real list means a question is never read in the
 * wrong voice because of the moment it happened to be asked.
 */
let cachedVoices: InstalledVoice[] = [];

function toInstalled(voice: SpeechSynthesisVoice): InstalledVoice {
  return {
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default,
  };
}

/** Every voice installed on this machine, as plain data core/ can decide over. */
export function installedVoices(): InstalledVoice[] {
  const apis = speechApis();
  if (!apis) return cachedVoices;
  const live = apis.synth.getVoices().map(toInstalled);
  if (live.length > 0) cachedVoices = live;
  return live.length > 0 ? live : cachedVoices;
}

/**
 * The two listeners this feature needs, installed once per panel — and **only
 * ever from `speak`**, never from a mount.
 *
 * It touches `speechSynthesis`, which is the expensive part. See
 * `narratorSupported` above for the measurement: the first read of that
 * accessor costs about 570ms of browser-side work while Chrome starts the
 * operating system's speech service. The panel's own rendering is unaffected —
 * the DOM timeline is identical — but everything else going through the
 * browser process waits behind it, and the first version of this file paid
 * that on the first screen of the interview for every person, including
 * everyone who never turns the narrator on. It is charged to the first
 * utterance instead: the one moment where a pause is both expected and
 * unnoticeable, because the person has just asked for a voice and a speech
 * engine takes a moment to start anyway.
 *
 * The two listeners themselves: a `voiceschanged` subscription, which is how
 * the voice list arrives on platforms that load it asynchronously, and a
 * `pagehide` cancel, because Chrome's speech queue outlives the document that
 * filled it and a panel closed mid-sentence must not leave a voice talking.
 */
let watching = false;
export function watchVoices(): void {
  const apis = speechApis();
  if (!apis || watching) return;
  watching = true;
  apis.synth.addEventListener?.('voiceschanged', () => {
    // Cheap by the time this fires: the engine has just finished loading the
    // list it is telling us about.
    installedVoices();
  });
  globalThis.addEventListener?.('pagehide', () => stopSpeaking());
}

/** Whether anything is being spoken right now — including an utterance still
 * queued but not yet started, which `speechSynthesis.speaking` reports as
 * `pending` instead. */
export function isSpeaking(): boolean {
  const apis = speechApis();
  if (!apis) return false;
  return apis.synth.speaking || apis.synth.pending;
}

/** Silence, immediately. Safe to call when nothing is speaking, and safe to
 * call in a browser that cannot speak at all. */
export function stopSpeaking(): void {
  speechApis()?.synth.cancel();
}

/**
 * Say this, now, instead of whatever was being said.
 *
 * The voice comes from `utteranceFor` — the role table in core/voice/roles.ts
 * — so this function never decides which voice anything is read in. It only
 * carries out the decision.
 */
export function speak(narration: Narration): void {
  const apis = speechApis();
  if (!apis || !narration.text.trim()) return;

  // The first call of a document enumerates the machine's voices, which is not
  // free — see `watchVoices` on why that cost belongs here and nowhere
  // earlier.
  watchVoices();
  const spoken = utteranceFor(narration.role, narration.text, installedVoices());
  const utterance = new apis.Utterance(spoken.text);
  utterance.lang = spoken.lang;
  utterance.rate = spoken.rate;
  utterance.pitch = spoken.pitch;
  if (spoken.voiceName) {
    const match = apis.synth.getVoices().find((v) => v.name === spoken.voiceName);
    // Only ever a real voice object from this engine: assigning anything else
    // to `utterance.voice` throws, and a narrator that throws is a narrator
    // that is silent for the rest of the session.
    if (match) utterance.voice = match;
  }

  apis.synth.cancel();
  apis.synth.speak(utterance);
}
