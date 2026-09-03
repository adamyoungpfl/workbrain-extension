import { S } from '../strings';
import { speak } from './speech';
import { playClip } from './clips';
import { trace } from './trace';

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
  /** The count itself (V3.0 pass 3d): the digits are fixed lines like any
   * other cue, so they ride the same files. */
  digit3: '3',
  digit2: '2',
  digit1: '1',
} as const;

export type SplashCue = keyof typeof SPLASH_CUES;

/** Play a named cue: the BUNDLED FILE first (public/cues/<name>.m4a -
 * the media path, deterministic, no speech daemon in the loop; V3.0 pass
 * 3d, and the ElevenLabs swap is now file-for-file), and the narrator
 * engine only as the fallback when a clip cannot play. A new cue replaces
 * a playing one either way - the choreography relies on it. */
export function cue(name: SplashCue): void {
  void playClip(name).then((played) => {
    if (played) return;
    trace('cue:fallback-tts', name);
    speak({ role: 'question', text: SPLASH_CUES[name] });
  });
}
