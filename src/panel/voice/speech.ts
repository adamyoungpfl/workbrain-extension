import { utteranceFor, type InstalledVoice } from '../../core/voice/roles';
import { announce, bumpWord, resetWords } from './activity';
import { stopClip } from './clips';
import { trace } from './trace';
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
/** Whether speak() has ever touched the engine. The FIRST call into
 * `speechSynthesis` — even a bare `cancel()` — stalls the main thread for
 * ~170ms in headless Chrome while the platform voice list loads, and a
 * stop on an engine that never spoke buys silence it already has. Found
 * when the splash's skip button billed that stall to its own door. */
let engineTouched = false;

export function stopSpeaking(): void {
  /* Conditional like speak()'s own cancel (V3.0 pass 3c round two): every
     screen unmount runs this through narration cleanup, and cancelling a
     quiet engine thousands of times per session is the storm that wedged
     the Mac speech daemon. Silence that already exists costs nothing. */
  stopClip();
  const apis = engineTouched ? speechApis() : null;
  if (apis && (apis.synth.speaking || apis.synth.pending)) apis.synth.cancel();
  // `cancel()` does not always fire `onend`, and a ring left pulsing after
  // silence is worse than one that never moved.
  announce(false);
}

/**
 * WHO IS LISTENING FOR THE VOICE (V2.9, Adam, 2026-09-02).
 *
 * TIM's avatar pulses while the narrator is speaking, and it pulses on the
 * WORDS rather than on a loop of its own. `onboundary` fires once per spoken
 * word, so a ring driven from it is genuinely tracking the voice — it slows
 * where the sentence slows, stops on a comma, and ends when the narrator does.
 * A decorative pulse on a timer would look approximately the same for about
 * two seconds and then visibly disagree with what is being said.
 *
 * A set of callbacks rather than a React context: `speak` is a plain function
 * called from a hook, and the thing that needs to know is a component that may
 * not be mounted. Subscribers that come and go cost nothing.
 */
/* The listener set and word count live in activity.ts now (V3.0 pass 3d)
   - one bus, two producers: this engine and the clip player. */

/**
 * Whether TIM has said anything yet this session.
 *
 * It gates his return drop, and the narrator suite is what found the need for
 * it: the drop fired the very first time somebody switched narration on, where
 * he has never spoken and there is nothing to have been interrupted. "Sorry, I
 * was on mute, where was I?" is only funny if he WAS somewhere — said cold, it
 * is a stranger apologising for a conversation that never happened.
 */
let everSpoke = false;

export function hasSpokenBefore(): boolean {
  return everSpoke;
}

/* The subscribe surface, re-exported from the bus so every importer keeps
   its address (V3.0 pass 3d). */
export { onSpeechActivity } from './activity';

/**
 * Say this, now, instead of whatever was being said.
 *
 * The voice comes from `utteranceFor` — the role table in core/voice/roles.ts
 * — so this function never decides which voice anything is read in. It only
 * carries out the decision.
 */
export function speak(narration: Narration): void {
  const apis = speechApis();
  engineTouched = apis !== null;
  if (!apis || !narration.text.trim()) return;

  // The first call of a document enumerates the machine's voices, which is not
  // free — see `watchVoices` on why that cost belongs here and nowhere
  // earlier.
  watchVoices();

  /* NEVER UTTER VOICELESSLY (V3.0 pass 3d). The list is empty on a
     session's first call (probed: 0, then 180 a beat later), and an
     utterance with no explicit voice falls to the browser default - which
     in real Chrome can be a NETWORK voice that never starts inside an
     extension panel: queued, silent, the exact wedge signature from
     Adam's machine. So a speak that arrives before the voices do WAITS
     for them - one pending narration, newest wins, voiceschanged or a
     1.2s ceiling releasing it - and every utterance then pins a real
     LOCAL voice below. */
  if (installedVoices().length === 0 && !voiceWaitSpent) {
    trace('tts:waiting-voices', narration.text.slice(0, 40));
    pendingSpeak = narration;
    if (!voiceWaitArmed) {
      voiceWaitArmed = true;
      const release = () => {
        if (!voiceWaitArmed) return;
        voiceWaitArmed = false;
        /* One wait per session, however it ends: a machine with NO voices
           at all must still speak (the engine's own default), and without
           this the ceiling re-entered the wait forever - the no-voices
           degradation test caught it. */
        voiceWaitSpent = true;
        apis.synth.removeEventListener?.('voiceschanged', release);
        const held = pendingSpeak;
        pendingSpeak = null;
        if (held) speak(held);
      };
      apis.synth.addEventListener?.('voiceschanged', release);
      window.setTimeout(release, 1_200);
    }
    return;
  }
  pendingSpeak = null;
  const spoken = utteranceFor(narration.role, narration.text, installedVoices());
  const utterance = new apis.Utterance(spoken.text);
  utterance.lang = spoken.lang;
  utterance.rate = spoken.rate;
  utterance.pitch = spoken.pitch;
  {
    const live = apis.synth.getVoices();
    const byName = spoken.voiceName ? live.find((v) => v.name === spoken.voiceName) : undefined;
    /* The role table's pick when it is installed; otherwise the first
       LOCAL English voice - never the browser default, which may be a
       network voice that silently refuses to start in an extension panel
       (see the wait above). Only ever a real voice object from this
       engine: assigning anything else throws, and a narrator that throws
       is silent for the rest of the session. */
    const local = byName ?? live.find((v) => v.localService && v.lang.startsWith('en'));
    if (local) utterance.voice = local;
    trace('tts:speak', `${(local?.name ?? 'default').slice(0, 30)} "${narration.text.slice(0, 40)}"`);
  }

  /* The activity signal. Wired on the utterance rather than polled, so the
     ring is driven by the engine's own account of where it is rather than by
     a guess sampled every hundred milliseconds. `onerror` is treated as an
     end: a narrator that fails silently must not leave a ring pulsing at
     something that stopped speaking. */
  utterance.onstart = () => {
    trace('tts:start', spoken.voiceName ?? 'default-voice');
    resetWords();
    announce(true);
  };
  utterance.onboundary = () => {
    bumpWord();
    announce(true);
  };
  utterance.onend = () => {
    trace('tts:end');
    announce(false);
    if (currentUtterance === utterance) currentUtterance = null;
  };
  utterance.onerror = (e) => {
    trace('tts:error', (e as SpeechSynthesisErrorEvent).error ?? '');
    announce(false);
    if (currentUtterance === utterance) currentUtterance = null;
  };

  /* CONDITIONAL, both of them (V3.0 pass 3c, round two): the app used to
     fire cancel() before EVERY utterance and resume() after - a no-op
     storm hundreds deep across one splash run, and no-op cancel/resume
     churn is the documented recipe for wedging macOS's speech daemon into
     the accepts-but-never-starts state Adam's machine kept landing in
     (utterances queued silently; a later cancel would briefly flush one -
     his "start of liftoff" on the wrong screen). Cancel only interrupts
     something actually being said; resume only lifts an actual pause. */
  if (apis.synth.speaking || apis.synth.pending) apis.synth.cancel();
  announce(false);
  everSpoke = true;
  /* THREE REAL-CHROME DEFENSES (V3.0, found chasing a silent dogfood
     build with a headed probe against the live engine):

     1. RETAIN the utterance. Chrome garbage-collects unreferenced
        utterances mid-speech - the module holds the current one until its
        own end/error and the next speak replaces it.
     2. RESUME after speak. A long-lived Chrome can wedge its synth in a
        paused state that survives extension reloads; resume() is a no-op
        when not paused and the cure when it is.
     3. (The probe's third finding - getVoices() empty on first call -
        graduated into the voice-wait at the top of this function: no
        utterance goes out voiceless at all now.) */
  currentUtterance = utterance;
  apis.synth.speak(utterance);
  /* Optional-called: the unit fakes model only what each claim needs, and
     a synth without resume() is also a synth that cannot wedge. */
  if (apis.synth.paused) apis.synth.resume?.();
}

/** The utterance being spoken, held against Chrome's utterance GC - see
 * the retention note in speak(). */
let currentUtterance: SpeechSynthesisUtterance | null = null;
/** One narration held while the voice list loads - newest wins. */
let pendingSpeak: Narration | null = null;
let voiceWaitArmed = false;
let voiceWaitSpent = false;
