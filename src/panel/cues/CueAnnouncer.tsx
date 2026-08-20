import './CueAnnouncer.css';

export interface CueAnnouncerProps {
  text: string | undefined;
}

/**
 * The `say` half of a `CueLink` — a visually-hidden node a screen reader
 * announces via `aria-live="polite"`, per docs/GUARDRAILS.md's
 * accessibility floor ("status changes announced via aria-live"). This is
 * NOT the narrator/TTS feature named in docs/RELEASE-1.md's out-of-scope
 * list — nothing here is spoken by the extension; it only gives assistive
 * tech something to read, the same mechanism Toast.tsx already uses for
 * confirmations.
 *
 * Always rendered (never conditionally mounted), even with an empty
 * `text` — an `aria-live` region only announces a *change* to its content,
 * so the node has to already exist in the accessibility tree before the
 * first thing it says, or that first announcement is silently dropped.
 */
export function CueAnnouncer({ text }: CueAnnouncerProps) {
  return (
    <div className="cue-announcer" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
