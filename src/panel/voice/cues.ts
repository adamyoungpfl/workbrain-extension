import { S } from '../strings';
import { speak } from './speech';

/* ─────────────────────────────────────────────────────────────────────────
   THE SPLASH'S AUDIO CUES, BY NAME — and the recording manifest.

   Adam, 2026-09-02: "For the sound effects or audio clips we need, we can
   use the Elevenlabs API which is what we will use to record all of the
   canvas narration once we are final approved copy on all questions for
   context and then skill interviews."

   Two consequences, written down so neither drifts:

   1. ElevenLabs is a RECORDING tool here, not a runtime dependency. The
      guardrails rule a live call out three ways at once — no feature that
      only works online, never transmit anything, no server of ours to hold
      a key. So once copy is approved, each cue below is generated ONCE and
      ships as a bundled clip; this registry is the list of what to record.

   2. Until those clips exist, the narrator engine reads every cue. That is
      why each moment goes through cue() rather than calling speak() where
      it happens: when the clips arrive, this file is the only place the
      swap occurs — the choreography never learns the difference.

   The counted digits (3, 2, 1) are NOT here: they are dynamic text spoken
   by the stage's clock, and will become three more clips in the same pass.
   ───────────────────────────────────────────────────────────────────────── */
export const SPLASH_CUES = {
  /** The opening voiceover, over the title card — narrated returners only:
   * the stored preference is the consent, and a first-time visitor has not
   * yet been offered the sound choice the pills carry. */
  intro: `${S.appName}. ${S.splashTagline}`,
  /** The voiced baseline hold. */
  radioBaseline: S.splashRadioBaseline,
  /** The voiced launch hold. */
  radioLaunch: S.splashRadioLaunch,
  /** A released hold stands down, out loud. */
  standby: S.splashRadioStandby,
  /** After the counted "1", in the breath before the whiteout. */
  liftoff: S.splashRadioLiftoff,
} as const;

export type SplashCue = keyof typeof SPLASH_CUES;

/** Play a named cue. Today: the narrator reads it (a new cue replaces a
 * playing one, which the choreography relies on). Later: the bundled
 * ElevenLabs clip, same name, same one call site per moment. */
export function cue(name: SplashCue): void {
  speak({ role: 'question', text: SPLASH_CUES[name] });
}
