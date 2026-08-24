import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '../components';
import { S } from '../strings';
import './Splash.css';

/**
 * V1.7 VB-34 — the splash.
 *
 * The mark, drifting on `core/geometry/markOrbit`'s camera path, with the
 * lockup centred and the tagline under it. That is the whole surface.
 *
 * ── HOW OFTEN, AND WHY ────────────────────────────────────────────────────
 *
 * Once per browser session. Adam settled this on 2026-08-24: "a splash on
 * every open is a toll booth on someone's own work."
 *
 * The choice is `chrome.storage.session`, and it is the *only* mechanism that
 * says "session" here. A plain module variable — which is what everything
 * else ephemeral in this panel uses — would mean once per *panel document*,
 * and Chrome destroys the side panel's document every time the panel is
 * closed. Somebody who opens the panel, glances, closes it and reopens it
 * five seconds later would get the splash twice. That is the "every open"
 * behaviour, wearing a different name.
 *
 * `chrome.storage.session` is in memory, is cleared when Chrome closes, needs
 * no permission the extension does not already have, and never touches disk.
 * It is not a stored preference and it is not derived state kept around
 * (docs/ARCHITECTURE.md's rule is about `local` and `sync`, the two areas
 * that are still there tomorrow) — see schema/storage.types.ts's SessionState
 * comment for the full argument. App.tsx does the read; this component knows
 * nothing about storage.
 *
 * ── IT NEVER HOLDS ANYONE UP ──────────────────────────────────────────────
 *
 * Three separate guarantees, in order of how much they matter:
 *
 * 1. **It does not gate the panel's first paint.** App.tsx renders the real
 *    surface immediately and lays this over the top. The panel is built,
 *    laid out and ready underneath the whole time; the splash is a sheet of
 *    paper on a finished desk, not a loading screen.
 *
 * 2. **Any input ends it.** Pointer, key, touch, wheel — captured on
 *    `window` in the capture phase so nothing between here and the target
 *    can swallow the skip.
 *
 * 3. **It ends on its own.** This is the one that makes it not a toll booth.
 *    A splash that waits for a click is still a click somebody has to make
 *    before they can start work, however cheap that click is. So it holds for
 *    `SPLASH_DWELL_MS` and then leaves, and the skip is there for people who
 *    are faster than that rather than as the only way out.
 *
 * The overlay is opaque and does take the first click rather than passing it
 * through to whatever happens to be underneath. That is deliberate: passing
 * it through would mean a person's dismissing tap could start the interview
 * they could not see they were tapping. Consuming one click costs a moment;
 * acting on a control nobody could see costs trust.
 *
 * ── REDUCED MOTION ────────────────────────────────────────────────────────
 *
 * A still, composed frame carrying exactly the same three things: the mark,
 * the name, the tagline. `BrandMark`'s orbit mode checks the preference
 * before it schedules anything, so no frame loop ever starts — the still
 * frame is in the markup React writes, not painted in afterwards, and
 * `tests/e2e/splash.spec.ts` counts `requestAnimationFrame` from before the
 * bundle runs to prove it. The fade-out goes too: it would be 320ms of an
 * invisible overlay still on top, so under reduced motion this hands over the
 * instant it is done.
 *
 * Nothing here is information the person needs read aloud — the name is on
 * Home a second later and the tagline is a promise, not an instruction — so
 * the whole overlay is `aria-hidden`. That is the kinder answer as well as
 * the simpler one: a screen-reader user is never covered by this at all, and
 * reads the real panel from the first moment.
 */

/**
 * How long the splash holds before it leaves on its own.
 *
 * Not one of `docs/design-system.html` §06's three durations, and it is not
 * trying to be: those govern a thing changing state, and this is a dwell —
 * the same category as how long a toast stays. It is long enough to read
 * seven words and watch one camera move, and short enough that nobody who
 * ignores it feels stopped.
 *
 * The camera's loop is nine seconds (`ORBIT_PERIOD_MS`), so a person who sits
 * through the whole splash sees roughly a quarter of it. The loop is longer
 * than the splash on purpose: the point of a loop here is that the motion has
 * no beginning and no end to catch the eye, not that anybody is made to watch
 * a full revolution. Its seamlessness is asserted in markOrbit.test.ts, where
 * it can be measured at every moment rather than at the one a person happens
 * to see.
 */
export const SPLASH_DWELL_MS = 2400;

/** The fade out. §06's drawer duration — this is a full surface leaving. */
export const SPLASH_FADE_MS = 320;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The tagline, one sentence per line.
 *
 * Presentation, not content: the string stays whole and unsplit in
 * strings.ts, where it is reviewed, and nothing here can change a word of it.
 * What this fixes is a wrap. At 400px the line breaks on its own as "AI does
 * the work. You do the" / "thinking.", which leaves a one-word orphan under
 * seven words of headline — looked at, in a real panel, before deciding. The
 * sentences are the natural break and the line was written as two of them.
 *
 * Falls back to the whole string as one line if it ever stops containing a
 * sentence break, which wraps exactly as it does today rather than breaking.
 */
function taglineLines(text: string): string[] {
  return text.split(/(?<=[.?!])\s+/);
}

export interface SplashProps {
  /** Called when the splash is finished and may be unmounted. */
  onDone: () => void;
}

export function Splash({ onDone }: SplashProps) {
  const [leaving, setLeaving] = useState(false);
  /** One handover, however many ways it is triggered at once. */
  const handedOver = useRef(false);

  useEffect(() => {
    // No matchMedia means no way to know the preference, so assume reduce —
    // the same call BrandMark makes, for the same reason.
    const reduce =
      typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches;

    let dwell = 0;
    let fade = 0;

    function end() {
      if (handedOver.current) return;
      handedOver.current = true;
      window.clearTimeout(dwell);
      if (reduce) {
        onDone();
        return;
      }
      // Fades out, then hands over. `pointer-events` is dropped for the
      // duration of the fade (see Splash.css), so the panel underneath is
      // live from the moment the splash starts leaving rather than from the
      // moment it finishes.
      setLeaving(true);
      fade = window.setTimeout(onDone, SPLASH_FADE_MS);
    }

    dwell = window.setTimeout(end, SPLASH_DWELL_MS);

    // Capture phase, on window: the skip has to work no matter what is
    // underneath and no matter what stops propagation. Passive, and nothing
    // is prevented — the input is a skip, never a cancelled action.
    const options = { capture: true, passive: true } as const;
    const kinds = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const kind of kinds) window.addEventListener(kind, end, options);

    return () => {
      for (const kind of kinds) window.removeEventListener(kind, end, options);
      window.clearTimeout(dwell);
      window.clearTimeout(fade);
    };
  }, [onDone]);

  return (
    <div className="splash" data-leaving={leaving ? 'on' : 'off'} aria-hidden="true">
      <div className="splash-lockup">
        {/* Bigger than anywhere else the mark appears, because here it is the
            subject rather than a label's companion — and big enough that the
            node graph is the right drawing rather than the silhouette
            (see BrandMark.tsx on why 24px is not). */}
        <BrandMark size={148} spin="orbit" />
        {/* Real text, not a picture of a word — the same call the welcome
            screen's lockup makes, and the same string. */}
        <p className="splash-wordmark">{S.appName}</p>
        <p className="splash-tagline">
          {taglineLines(S.splashTagline).map((line, i) => (
            // The space between the sentences is kept, inside the second
            // line, so the paragraph's text is still the exact approved
            // string end to end. A block start collapses it on screen.
            <span key={line} className="splash-tagline-line">
              {i > 0 ? ' ' : ''}
              {line}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
