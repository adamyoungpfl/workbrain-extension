import { contextModules } from '../../core/flow/flow';
import { spokenQuestion } from '../../core/voice/narration';
import { VOICE_PLAN, VOICE_ROLES, resolveVoice, voiceFor } from '../../core/voice/roles';
import type { InstalledVoice } from '../../core/voice/roles';
import { installedVoices, stopSpeaking } from './speech';

/**
 * V1.3 VB-18 — hearing the candidates, so the voice is chosen by ear.
 *
 * `speechSynthesis.getVoices()` returns whatever is installed on the machine —
 * 180 of them on the Mac this was built on, 41 of them English — and their
 * quality varies enormously. docs/V1.3-REFINEMENT.md is explicit that Adam
 * should not be picking from a list of names: "hearing the actual candidates
 * read an actual interview question is the fastest path to picking one".
 *
 * So this reads a real question from the ported interview
 * (core/flow/source.ts's `stop_explaining`) in every installed voice, one
 * after another, announcing each one's name first.
 *
 * WHY IT IS A CONSOLE API AND NOT A SCREEN. Same reasoning as V1.2 VB-09's
 * reset chord, and the same mechanism: `src/panel/main.tsx` calls
 * `installVoiceAudition()` inside `if (import.meta.env.DEV)`, which Vite
 * replaces with a literal `false` for `npm run build`; Rollup then drops the
 * branch and this module never reaches `dist/`. tests/e2e/narrator.spec.ts
 * greps the built chunks to prove that rather than assuming it.
 *
 * It has to be that way round: docs/GUARDRAILS.md rules out a settings page,
 * and the voice is a default we choose once, not a control we ship. A picker
 * for it would be the settings page arriving one control at a time.
 */

/** Also a grep target for the production-bundle test — a literal only this
 * feature could have put in a chunk. */
const AUDITION_LOG = '[workbrain] voice audition';

/** The global this hangs off, in a development panel only. */
const GLOBAL_KEY = 'wbVoices';

/**
 * The question every candidate reads.
 *
 * A real one, from the real data: `stop_explaining` is the interview's first
 * open text question, it is a full sentence with a clause in the middle, and
 * it is long enough to expose a voice that runs its words together. Its scope
 * word comes from an earlier answer, and is resolved here against an empty
 * context — which is the wording someone who has not said whether this is for
 * work hears ("…in your life?").
 */
function sampleQuestion(): string {
  const steps = contextModules
    .flatMap((module) => module.nodes)
    .flatMap((node) => ('fields' in node ? node.fields : [node]));
  const step =
    steps.find((s) => s.id === 'stop_explaining') ?? steps.find((s) => s.kind === 'text') ?? steps[0];
  // No literal fallback sentence, deliberately: a hard-coded line here would be
  // user-facing copy living outside strings.ts (`npm run audit` says so), and a
  // panel with no interview data at all is not a state to write copy for.
  if (!step) return '';
  return spokenQuestion(step, { answers: {}, repeatables: {} });
}

interface SpeechApis {
  readonly synth: SpeechSynthesis;
  readonly Utterance: typeof SpeechSynthesisUtterance;
}

/** Its own tiny accessor rather than an export from speech.ts: that module
 * ships, this one does not, and a "speak in this arbitrary voice" entry point
 * in the shipped bundle would be API surface no shipped code has any use for. */
function apis(): SpeechApis | null {
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
 * The installed voices, once the engine has actually loaded them.
 *
 * `getVoices()` comes back empty on a cold engine and fills in later, so a
 * console session that starts with `wbVoices.list()` would otherwise be told
 * there are none — which happened on the first run of this, and is exactly the
 * sort of thing that makes a tool feel broken. Polls briefly, then gives up and
 * reports whatever there is.
 */
async function voicesReady(): Promise<InstalledVoice[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const voices = installedVoices();
    if (voices.length > 0) return voices;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return installedVoices();
}

/** English voices first, then everything else — the list is long, and the
 * interview is in English. */
async function auditionOrder(): Promise<InstalledVoice[]> {
  const voices = await voicesReady();
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const rest = voices.filter((v) => !v.lang.toLowerCase().startsWith('en'));
  return [...english, ...rest];
}

function say(text: string, voiceName: string | null): Promise<void> {
  return new Promise((resolve) => {
    const speech = apis();
    if (!speech) {
      resolve();
      return;
    }
    const utterance = new speech.Utterance(text);
    const match = voiceName ? speech.synth.getVoices().find((v) => v.name === voiceName) : undefined;
    if (match) {
      utterance.voice = match;
      utterance.lang = match.lang;
    }
    utterance.onend = () => resolve();
    // A voice that fails must not hang the walk on the one that broke.
    utterance.onerror = () => resolve();
    speech.synth.speak(utterance);
  });
}

export interface VoiceAudition {
  /** Every installed voice, as a table. */
  list(): Promise<void>;
  /** Which voice each role resolves to right now, on this machine. */
  roles(): Promise<void>;
  /** One voice, reading the sample question. */
  play(voiceName: string): Promise<void>;
  /** Every voice in turn — name, then the question. English first. `only`
   * filters by a substring of the name, e.g. `'Microsoft'`. */
  audition(options?: { only?: string; limit?: number }): Promise<void>;
  /** Stop, wherever it has got to. */
  stop(): void;
  /** The question the candidates read. */
  sample(): string;
}

let running = false;

/**
 * Puts the audition on `window.wbVoices` in a development panel.
 *
 * Returns an uninstall function, matching devReset.ts's shape — the panel
 * never calls it, but a test that installs this twice should not have to
 * reload to get a clean one.
 */
/**
 * V3.0 pass 3d — `wbAudio`, the flight recorder's console handle. Same
 * gate, same reasoning, same bundle-scan proof as wbVoices: a diagnosis
 * tool for the person at the keyboard, never shipped UI.
 *
 *   wbAudio.trace()  — the last 100 audio events, in order
 *   wbAudio.test()   — one clip then one utterance, end to end
 */
export function installAudioTrace(): () => void {
  const scope = globalThis as unknown as Record<string, unknown>;
  void (async () => {
    const { readTrace } = await import('./trace');
    const { cue } = await import('./cues');
    const { speak } = await import('./speech');
    scope['wbAudio'] = {
      trace: () => readTrace(),
      test: () => {
        cue('radioLaunch');
        window.setTimeout(() => speak({ role: 'question', text: 'And this is the narration engine.' }), 1600);
        return 'playing: clip, then engine - run wbAudio.trace() after';
      },
    };
  })();
  return () => {
    delete scope['wbAudio'];
  };
}

export function installVoiceAudition(): () => void {
  const scope = globalThis as unknown as Record<string, unknown>;

  const api: VoiceAudition = {
    sample: sampleQuestion,

    async list() {
      const voices = await auditionOrder();
      console.info(`${AUDITION_LOG}: ${voices.length} voices installed`);
      console.table(
        voices.map((v) => ({ name: v.name, lang: v.lang, offline: v.localService, default: v.default })),
      );
    },

    async roles() {
      const voices = await voicesReady();
      for (const role of VOICE_ROLES) {
        const choice = voiceFor(role, VOICE_PLAN);
        const resolved = resolveVoice(choice, voices);
        console.info(`${AUDITION_LOG}: ${role} → ${resolved?.name ?? '(browser default)'}`);
      }
    },

    async play(voiceName) {
      await voicesReady();
      stopSpeaking();
      await say(sampleQuestion(), voiceName);
    },

    async audition({ only, limit } = {}) {
      if (running) {
        console.warn(`${AUDITION_LOG}: already running — wbVoices.stop() first`);
        return;
      }
      const wanted = only?.toLowerCase();
      const voices = (await auditionOrder())
        .filter((v) => !wanted || v.name.toLowerCase().includes(wanted))
        .slice(0, limit ?? Number.POSITIVE_INFINITY);

      running = true;
      const question = sampleQuestion();
      console.info(`${AUDITION_LOG}: ${voices.length} voices — “${question}”`);
      for (const voice of voices) {
        if (!running) break;
        console.info(`${AUDITION_LOG}: ${voice.name} (${voice.lang})`);
        // The name in the voice itself, so the ear and the console never get
        // out of step during a long walk.
        await say(`${voice.name}.`, voice.name);
        if (!running) break;
        await say(question, voice.name);
      }
      running = false;
    },

    stop() {
      running = false;
      stopSpeaking();
    },
  };

  scope[GLOBAL_KEY] = api;
  console.info(
    `${AUDITION_LOG} ready — wbVoices.list(), wbVoices.audition(), wbVoices.play('Samantha'), wbVoices.roles()`,
  );

  return () => {
    api.stop();
    delete scope[GLOBAL_KEY];
  };
}
