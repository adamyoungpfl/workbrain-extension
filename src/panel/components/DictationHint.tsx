import { useEffect, useState } from 'react';
import {
  DICTATION_STEP_ID,
  dictationPlatform,
  showsDictationHint,
  type DictationPlatform,
} from '../../core/flow/dictation';
import { loadPrefs, useDictationHintPref } from '../voice/prefs';
import { S } from '../strings';
import './DictationHint.css';

/**
 * V1.8 VB-49 — one line telling someone the dictation they already have works
 * in this box.
 *
 * **THIS IS NOT A MICROPHONE AND MUST NEVER BECOME ONE.** Nothing in this file
 * or in `core/flow/dictation.ts` touches `getUserMedia`, `SpeechRecognition`,
 * `webkitSpeechRecognition`, `MediaRecorder`, `navigator.mediaDevices` or any
 * permission — tests/e2e/dictation-hint.spec.ts greps the built bundle for
 * every one of those strings, the way tests/e2e/dev-reset.spec.ts greps for
 * the reset chord, so this stays true rather than merely being true today.
 *
 * docs/V1.8-REFINEMENT.md VB-49 records why, with four reasons each sufficient
 * on its own: speech recognition sends audio to a Google service by default
 * and falls back to it *silently*; the permission prompt does not render in a
 * side panel at all; `audioCapture` is gated to platform apps and a hardcoded
 * allowlist, so there is nothing to declare; and cloud recognition is
 * collection, which this listing declares none of. The answer field is a plain
 * `<textarea>`, so macOS Dictation and Windows voice typing already type into
 * it through the OS input stack — no permission, no prompt, no audio anywhere
 * near the extension. The only thing missing was that nobody knows.
 *
 * SO IT IS A LINE OF COPY, AND IT NEVER NAGS. It appears on one question —
 * the first with a real paragraph to write (`core/flow/dictation.ts`) — on the
 * two platforms with dictation built in, and it goes for good on either the
 * dismiss or the first thing typed. "For good" is `wb:prefs`, the same stated
 * preference store the narrator uses, which is why this waits for `loaded`
 * before rendering anything: its default is the loud one, and a hint someone
 * dismissed last month must not flash back for a frame while storage answers.
 *
 * Nothing announces, nothing takes focus, nothing appears late. The hint is
 * already on screen when the question arrives, in reading order under the box
 * it is about, so a screen reader meets it on the way to the field rather than
 * being interrupted by it.
 */
export interface DictationHintProps {
  /** The question on screen. Only one carries this. */
  stepId: string;
  /** There is something in the field already. */
  typed: boolean;
}

/**
 * The platform, read once. `navigator` rather than a permission or a
 * capability check — this is a hint about the person's own keyboard, and the
 * cost of being wrong is one line naming a shortcut they do not have.
 */
function usePlatform(): DictationPlatform {
  const [platform] = useState<DictationPlatform>(() =>
    typeof navigator === 'undefined'
      ? null
      : dictationPlatform(navigator.userAgent, navigator.platform),
  );
  return platform;
}

export function DictationHint({ stepId, typed }: DictationHintProps) {
  const { show, loaded, dismiss } = useDictationHintPref();
  const platform = usePlatform();

  useEffect(() => {
    void loadPrefs();
  }, []);

  /**
   * Typing retires it, not just for this screen but for good — VB-49's "never
   * again once dismissed **or once they have typed anything**". Someone who is
   * already writing does not need to be told they could talk instead, and they
   * will not need telling on the way back to this question either.
   */
  useEffect(() => {
    if (loaded && show && typed && stepId === DICTATION_STEP_ID && platform !== null) dismiss();
  }, [loaded, show, typed, stepId, platform, dismiss]);

  if (!loaded) return null;
  if (!showsDictationHint({ stepId, platform, dismissed: !show, typed })) return null;

  return (
    <div className="dictation">
      <p className="dictation-line">{platform === 'mac' ? S.dictationMac : S.dictationWindows}</p>
      <button type="button" className="dictation-dismiss" onClick={() => dismiss()}>
        {S.dictationDismiss}
      </button>
    </div>
  );
}
