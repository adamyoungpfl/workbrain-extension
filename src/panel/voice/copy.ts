import type { NarrationCopy } from '../../core/voice/narration';
import { goalServiceLabelFor, reflectVoiceLine } from '../../core/flow/reflectFrames';
import { S } from '../strings';

/**
 * The two things the narrator says that are interface copy rather than ported
 * question wording, handed to `core/voice/narration.ts`.
 *
 * It is one small module rather than an object built at the call site because
 * both screens that need it — the reflect playback in Flow.tsx and the module
 * transition in ModuleIntro.tsx — must say the same thing, and because
 * core/ may not import src/panel/strings.ts (CLAUDE.md's one architectural
 * rule). Injection is the seam.
 */

/** Widened from the `as const` literal in strings.ts, exactly as
 * ModuleIntro.tsx widens it: a module id with no transition copy is a lookup
 * that misses, not a type error. */
const INTROS: Record<string, { beats: readonly string[]; preview: readonly string[] }> = S.moduleIntros;

export const NARRATION_COPY: NarrationCopy = {
  // V2.3 VB-95 — computed, not a fixed string: it names the person's own AI
  // when the goal gate captured which one they use.
  reflectCta: (ctx) => reflectVoiceLine(goalServiceLabelFor(ctx)),
  /** Both halves of the screen, in the order they are read: the beats, then
   * the preview line under them. A person listening gets the screen, not the
   * top half of it. */
  moduleIntro: (moduleId) => {
    const copy = INTROS[moduleId];
    return copy ? [...copy.beats, ...copy.preview] : [];
  },
};
