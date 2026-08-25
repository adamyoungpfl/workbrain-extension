/**
 * V1.8 VB-49 — where the dictation hint shows, and which shortcut it names.
 *
 * THIS PRODUCT DOES NOT BUILD A MICROPHONE, AND THIS FILE IS THE WHOLE OF WHAT
 * IT BUILDS INSTEAD. docs/V1.8-REFINEMENT.md VB-49 records four independent
 * reasons a microphone is not viable here, each sufficient on its own: audio
 * leaves the device by default and falls back to a cloud engine *silently*;
 * the permission prompt cannot render in a side panel at all; `audioCapture`
 * is gated to platform apps and a hardcoded Google allowlist, so there is no
 * permission to ask for; and cloud recognition is transmission, which is
 * collection, which would have to be disclosed against a listing that
 * currently declares none.
 *
 * The answer field is a plain `<textarea>`, so the dictation the person
 * already has types into it today — macOS Dictation (Fn twice) and Windows
 * voice typing (Win + H), through the OS input stack, with no permission, no
 * prompt, no disclosure and no audio ever touching the extension. The only
 * real weakness of that path is that nobody knows it is there, which is a copy
 * problem. So: one quiet line, once.
 *
 * Nothing in this module reads a device, a permission or a capability. It
 * takes the user-agent string it is given and answers two questions.
 *
 * WHERE. The first open text question after the person picks their scope,
 * which is `stop_explaining` in the ported flow (core/flow/source.ts) — the
 * first screen where there is a real paragraph to write rather than an option
 * to pick, and therefore the first place talking beats typing.
 *
 * NEVER TWICE. `dismissed` is a stated preference, and typing is the same
 * answer said differently: someone already typing does not need to be told
 * they could talk. Both close it for good — see src/panel/components/
 * DictationHint.tsx for the persistence, which is `wb:prefs`, the same store
 * the narrator toggle uses.
 */

/**
 * The one question that carries the hint. A constant rather than a `Step`
 * flag: it is a fact about *this flow's shape* — the first open text question
 * after `context_scope` — decided once here, where the reason for it is
 * written down, rather than as a boolean somebody could set on a second
 * question without noticing this one already has it.
 */
export const DICTATION_STEP_ID = 'stop_explaining';

/**
 * The two desktop platforms with dictation built in.
 *
 * NOT "with no setup to do", which is what this said until V2.1 and was wrong:
 * macOS ships Dictation switched off, and its shortcut is user-configurable
 * and commonly claimed by third-party dictation apps. The hint's copy now
 * names the setting and hedges the shortcut for exactly that reason — see
 * `S.dictationMac`. Nothing about the platform detection changed, because the
 * detection was never the problem; the sentence it printed was.
 */
export type DictationPlatform = 'mac' | 'windows' | null;

/**
 * Which shortcut this person has, from the user-agent string.
 *
 * `navigator.userAgent` and `navigator.platform` are both passed in, because
 * neither is reliable alone: `platform` is frozen at `'MacIntel'` on every
 * Mac including Apple silicon, and Chrome's UA reduction has been trimming the
 * platform token for years. Reading both and agreeing on either is enough for
 * a hint — the cost of being wrong is one line of copy naming a shortcut the
 * person does not have, not a broken feature, so there is no case for asking
 * for a permission or a capability to do better.
 *
 * Anything else — Linux, ChromeOS, anything unrecognised — is `null`, and the
 * hint does not appear. There is no equivalent built-in dictation to point at
 * there, and a hint that names a shortcut nobody has is worse than silence.
 */
export function dictationPlatform(userAgent: string, platform = ''): DictationPlatform {
  const s = `${userAgent} ${platform}`;
  if (/Mac|iPhone|iPad|iPod/i.test(s)) return 'mac';
  if (/Windows|Win32|Win64|WOW64/i.test(s)) return 'windows';
  return null;
}

export interface DictationHintInput {
  /** The question on screen. */
  readonly stepId: string;
  readonly platform: DictationPlatform;
  /** They pressed the dismiss, in this session or any earlier one. */
  readonly dismissed: boolean;
  /** There is text in the field — they are already answering. */
  readonly typed: boolean;
}

/** Whether the hint belongs on screen right now. */
export function showsDictationHint(input: DictationHintInput): boolean {
  if (input.stepId !== DICTATION_STEP_ID) return false;
  if (input.platform === null) return false;
  return !input.dismissed && !input.typed;
}
