import { useEffect, useState } from 'react';
import { parseBeat, beatsPlainText, beatHoldMs, BEAT_FADE_MS } from '../../core/flow/beats';
import { prefersReducedMotion } from '../cues/verbs';
import './Beats.css';

export interface BeatsProps {
  /** The authored sequence. One beat is legal and simply never advances. */
  beats: readonly string[];
}

/**
 * V1.1 VB-05 — the timed `beats` read, at last actually rendered.
 *
 * `Step.beats` has existed since the R1-05 port and has been authored on
 * `architecture_orientation` the whole time; nothing displayed it, so that
 * screen printed all of it as one flat paragraph. This is the renderer the
 * field always specified (see core/flow/source.ts's `beats` doc comment):
 * beat one holds for roughly its own reading time, fades out, beat two fades
 * in, stopping on the last.
 *
 * Decisions worth keeping:
 *
 * - **Nothing is parsed as markup.** `__emphasis__` becomes real React nodes
 *   built from `core/flow/beats.ts`'s segment list. No `innerHTML`, no
 *   `dangerouslySetInnerHTML` — docs/GUARDRAILS.md forbids it outright, and
 *   `npm run audit` fails the build on either.
 *
 * - **Reduced motion gets every beat at once**, in order, with no timers and
 *   no fade. The still version carries the same words, which is the actual
 *   requirement — not merely "the animation is off".
 *
 * - **Assistive tech never waits.** While the sequence is playing, the
 *   animated paragraph is `aria-hidden` and the full plain text sits beside
 *   it, visually hidden. A screen reader gets the whole read immediately
 *   instead of one beat at a time on a timer it cannot control. Under
 *   reduced motion every beat is real text on screen, so the duplicate is
 *   not rendered at all and nothing is announced twice.
 *
 * - **The preference is read once, at mount.** A beat sequence is a few
 *   seconds long and the screen is remounted per position (see Flow.tsx's
 *   `key={positionKey(...)}`), so re-reading it mid-play would only buy the
 *   ability to change the rules underneath a person mid-sentence.
 */
export function Beats({ beats }: BeatsProps) {
  const [reduced] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const current = beats[index];
    if (current === undefined || index >= beats.length - 1) return; // last beat: nothing to advance to

    // One effect, two timers, both keyed on the beat now showing. The
    // sibling implementation this is ported from hit a real race splitting
    // this across effects that each cancelled the other's work; keeping the
    // hold and the swap in one effect — and moving to the next beat in a
    // single state update — means this effect's cleanup can only ever clear
    // timers that belong to the beat it is leaving.
    const hold = beatHoldMs(current);
    const fadeOutAt = setTimeout(() => setFading(true), hold);
    const swapAt = setTimeout(() => {
      setIndex((i) => i + 1);
      setFading(false);
    }, hold + BEAT_FADE_MS);
    return () => {
      clearTimeout(fadeOutAt);
      clearTimeout(swapAt);
    };
  }, [beats, index, reduced]);

  if (reduced) {
    return (
      <div className="beats is-still" data-beats-total={beats.length}>
        {beats.map((beat, i) => (
          <p className="beat" key={i}>
            {renderBeat(beat)}
          </p>
        ))}
      </div>
    );
  }

  const current = beats[index] ?? '';
  return (
    <div className="beats" data-beats-total={beats.length} data-beat-index={index}>
      {/* `key` makes each beat a fresh element, so its entrance animation
          replays instead of only the first one ever playing. */}
      <p className={fading ? 'beat is-out' : 'beat'} key={index} aria-hidden="true">
        {renderBeat(current)}
      </p>
      <p className="beats-sr">{beatsPlainText(beats)}</p>
    </div>
  );
}

/** Segments to nodes. The emphasis is carried by weight and an underline,
 * never by colour alone (docs/GUARDRAILS.md) — see Beats.css. */
function renderBeat(beat: string) {
  return parseBeat(beat).map((segment, i) =>
    segment.emphasis ? (
      <span className="beat-em" key={i}>
        {segment.text}
      </span>
    ) : (
      <span key={i}>{segment.text}</span>
    ),
  );
}
