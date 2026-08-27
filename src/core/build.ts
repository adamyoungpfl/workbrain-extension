/**
 * WHICH BUILD IS THIS — beta sprint BS-00.
 *
 * The beta is a feedback-collection exercise (docs/BETA-CHANGE-SPEC.md §2),
 * and a report that cannot be tied to a build is a report you cannot act on.
 * When a friend says "it did the thing", the first question is which version
 * they were holding. Until now there was no answer: `manifest.config.ts` said
 * `0.1.0` while every document and every commit said V2.9.
 *
 * So the manifest's version IS the round — 2.9.0 — and it is the one place the
 * number lives. Vite replaces `__WB_VERSION__` with a string literal at build
 * time from that same manifest object (see vite.config.ts), so the panel, the
 * store listing and the doc trail cannot drift apart. There is no second
 * source to forget to bump.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 *
 * It is not telemetry and it is not an install id. Nothing here is stored,
 * nothing is derived from the person or their device, and nothing leaves the
 * browser unless they press send in their own mail client with the text in
 * front of them (§2's feedback door). A build number is a fact about the
 * SOFTWARE, not about the person running it — which is the side of
 * docs/GUARDRAILS.md's authorship test this sits on.
 */

/** The manifest's version, replaced at build time. */
export const BUILD_VERSION: string = __WB_VERSION__;

/**
 * What the splash and the feedback sheet print — "Beta · 2.9.0".
 *
 * The word is here rather than in `strings.ts` only in its assembled form:
 * `S.buildStamp` owns the wording and calls this for the number, so the copy
 * rule (every user-facing string in one file) still holds.
 */
export function buildLabel(version: string = BUILD_VERSION): string {
  return version;
}
