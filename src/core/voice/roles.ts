/**
 * V1.3 VB-18 — WHICH VOICE READS WHAT.
 *
 * The narrator reads with a voice per *content type*, not one voice hard-wired
 * into every call site. Three roles exist from the first line of this feature:
 *
 *   'question'  — the question on screen, and the "add another?" prompt.
 *   'followUp'  — a deeper-dive answer the person opened (V1.1 VB-03).
 *   'recap'     — module transitions, intro beats, and the reflect playback.
 *
 * WHY THE TABLE EXISTS BEFORE THE DECISION DOES. docs/V1.3-REFINEMENT.md is
 * explicit: Adam has not chosen between one voice for everything and a voice
 * per content type, and "build for (b), ship configured as (a)". So every role
 * points at `NARRATOR_VOICE` today and shipping three voices is editing three
 * lines of `VOICE_PLAN` — not threading a new argument through every call site
 * after the fact, which is the refactor this avoids for the price of one type
 * and one lookup.
 *
 * NOTHING HERE TOUCHES A BROWSER. `speechSynthesis.getVoices()` hands back
 * `SpeechSynthesisVoice` objects; this module deals in `InstalledVoice`, a
 * structural subset of them, so the whole resolution is decidable in a unit
 * test with no DOM at all (CLAUDE.md's one architectural rule). The panel half
 * — the utterance, the cancel, the toggle — is src/panel/voice/.
 */

export type VoiceRole = 'question' | 'followUp' | 'recap';

/** Every role, in the order a dev audition should demonstrate them. */
export const VOICE_ROLES: readonly VoiceRole[] = ['question', 'followUp', 'recap'];

/**
 * One installed voice, as much of it as any decision here depends on. The
 * shape is a subset of the DOM's `SpeechSynthesisVoice`, so the real list
 * passes straight in without adapting.
 */
export interface InstalledVoice {
  readonly name: string;
  /** BCP-47, e.g. `en-US`. */
  readonly lang: string;
  /** False means the voice is synthesised on someone else's server. */
  readonly localService: boolean;
  readonly default: boolean;
}

/** What a role asks for. Names are preferences, not requirements — a machine
 * that has none of them still gets read to. */
export interface VoiceChoice {
  /** Voice names, best first. Matched case-insensitively, exactly and then by
   * prefix — Windows names its voices "Microsoft Zira Desktop - English
   * (United States)", so an exact-only match would silently never fire there. */
  readonly candidates: readonly string[];
  /** The language to speak in when no candidate is installed. */
  readonly lang: string;
  /** 0.1–10, 1 is the voice's own pace. */
  readonly rate: number;
  /** 0–2, 1 is the voice's own pitch. */
  readonly pitch: number;
}

/**
 * THE ONE VOICE THIS SHIPS WITH.
 *
 * Chosen to be the operating system's own best default rather than a
 * particular vendor's: `Samantha` is macOS's default en-US voice, the
 * `Microsoft * Desktop` pair is Windows', and everything after that is a
 * fallback for a machine with neither.
 *
 * **Every candidate is a locally-installed voice, deliberately.** Chrome also
 * exposes network voices (`Google US English` and friends) whose quality is
 * better and which stop working on a plane — docs/GUARDRAILS.md's "no feature
 * that only works online" rules them out as a default, and `resolveVoice`
 * below enforces that independently of this list.
 *
 * Adam picks the real one by ear, not from these names — see
 * src/panel/voice/audition.ts, which reads a real interview question in every
 * installed voice. When he picks, this is the line that changes.
 */
export const NARRATOR_VOICE: VoiceChoice = {
  candidates: [
    'Samantha',
    'Microsoft Zira Desktop',
    'Microsoft David Desktop',
    'Microsoft Zira',
    'Daniel',
  ],
  lang: 'en-US',
  rate: 1,
  pitch: 1,
};

/**
 * THE MAPPING TABLE. One entry per role, and shipping (a) is all three
 * pointing at the same one.
 *
 * To ship (b) — a voice per content type — give `followUp` and `recap` their
 * own `VoiceChoice` here. Nothing else in the product changes: every call site
 * already says which role it is speaking in.
 */
export const VOICE_PLAN: Readonly<Record<VoiceRole, VoiceChoice>> = {
  question: NARRATOR_VOICE,
  followUp: NARRATOR_VOICE,
  recap: NARRATOR_VOICE,
};

export type VoicePlan = Readonly<Record<VoiceRole, VoiceChoice>>;

/** What this role asks to be read in. */
export function voiceFor(role: VoiceRole, plan: VoicePlan = VOICE_PLAN): VoiceChoice {
  return plan[role];
}

/** Whether every role currently resolves to the same entry — i.e. whether the
 * product is shipping (a) or (b). Exported so a test can state which one is
 * shipping rather than a comment claiming it. */
export function isSingleVoicePlan(plan: VoicePlan = VOICE_PLAN): boolean {
  return VOICE_ROLES.every((role) => plan[role] === plan.question);
}

/** The base language, so `en-GB` can stand in for `en-US` rather than nothing. */
function languageOf(lang: string): string {
  return lang.toLowerCase().split('-')[0] ?? '';
}

function matches(voice: InstalledVoice, candidate: string): boolean {
  const name = voice.name.toLowerCase();
  const wanted = candidate.toLowerCase();
  return name === wanted || name.startsWith(wanted);
}

function pick(voices: readonly InstalledVoice[], choice: VoiceChoice): InstalledVoice | null {
  for (const candidate of choice.candidates) {
    const exact = voices.find((v) => v.name.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
    const prefixed = voices.find((v) => matches(v, candidate));
    if (prefixed) return prefixed;
  }
  const sameLocale = voices.find((v) => v.lang.toLowerCase() === choice.lang.toLowerCase());
  if (sameLocale) return sameLocale;
  const language = languageOf(choice.lang);
  const sameLanguage = voices.find((v) => languageOf(v.lang) === language);
  if (sameLanguage) return sameLanguage;
  return voices.find((v) => v.default) ?? null;
}

/**
 * The installed voice a choice resolves to, or `null` for "let the browser use
 * its own default".
 *
 * Order, and the reasoning for each step:
 *
 * 1. **Offline voices first.** The whole list is filtered to `localService`
 *    before anything is matched, because a narrator that goes silent without a
 *    network is a feature that only works online (docs/GUARDRAILS.md).
 * 2. **Named candidates, in order**, exactly and then by prefix.
 * 3. **The same locale**, then the same language — `en-GB` reading an `en-US`
 *    question is right, and a Polish voice reading it is not.
 * 4. **The machine's default voice.**
 * 5. **`null`.** A machine with no local voices at all (a bare Linux box, some
 *    CI images) is not told it cannot have a narrator: the utterance is spoken
 *    with whatever the browser picks, including a network voice, because at
 *    that point the alternative is silence. Degrade, never break.
 */
export function resolveVoice(
  choice: VoiceChoice,
  installed: readonly InstalledVoice[],
): InstalledVoice | null {
  const offline = installed.filter((v) => v.localService);
  return pick(offline, choice) ?? pick(installed, choice);
}

/** One utterance, described. The panel turns this into a real
 * `SpeechSynthesisUtterance`; this is the part worth asserting. */
export interface SpokenUtterance {
  readonly text: string;
  /** `null` means "do not set a voice" — the browser's own default speaks. */
  readonly voiceName: string | null;
  readonly lang: string;
  readonly rate: number;
  readonly pitch: number;
}

/**
 * What the browser is about to be asked to say, for this role, on this
 * machine.
 *
 * `lang` follows the resolved voice when there is one: a voice speaking a
 * language it was not built for is the worst of both, and `en-GB`'s Daniel
 * reading with `lang: 'en-US'` set is exactly that case.
 */
export function utteranceFor(
  role: VoiceRole,
  text: string,
  installed: readonly InstalledVoice[],
  plan: VoicePlan = VOICE_PLAN,
): SpokenUtterance {
  const choice = voiceFor(role, plan);
  const voice = resolveVoice(choice, installed);
  return {
    text,
    voiceName: voice?.name ?? null,
    lang: voice?.lang ?? choice.lang,
    rate: choice.rate,
    pitch: choice.pitch,
  };
}
