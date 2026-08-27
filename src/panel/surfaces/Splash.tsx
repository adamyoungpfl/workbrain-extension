import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '../components';
import { S } from '../strings';
import './Splash.css';

/**
 * V1.7 VB-34, rebuilt by V2.1 VB-73, simplified by V2.6 VB-126 — the splash
 * becomes pure arrival.
 *
 * The mark on `core/geometry/markOrbit`'s camera path, the lockup, and the
 * tagline. Nothing else. VB-73's doors and voice row are REMOVED on Adam's
 * call (2026-08-26): "remove the buttons from the splash page. For the
 * moment, any click from the splash page will load to the home page. But, I
 * want to keep the splash page for something special to wow on app load."
 *
 * So the surface is held for the future wow treatment, and until that lands
 * it does exactly one thing: any click, Enter, Space or Escape hands over to
 * Home. The import door the splash used to carry ("Load your file") did not
 * lose its destination — Home's own "I already have a file" is the same move
 * and has been there the whole time; the splash's `intent` plumbing goes
 * with the door that needed it.
 *
 * ── WHAT SURVIVES FROM VB-34/VB-73, DELIBERATELY ──────────────────────────
 *
 * 1. **It never gates the first paint.** App.tsx renders the real surface
 *    immediately and lays this over it; the 'asking' state renders no splash
 *    at all.
 *
 * 2. **Once per browser session** — a splash on every open is a toll booth
 *    on someone's own work. `chrome.storage.session` is still the mechanism
 *    and App.tsx still does the read.
 *
 * 3. **A stray click never reaches a control nobody could see.** The whole
 *    surface consumes the press — it dismisses, and the press ends there.
 *    That was the backdrop's contract when there were doors; now it is the
 *    only contract.
 *
 * 4. **It stays until told to go.** No dwell timer, no key-skip on letter
 *    keys. The keys that leave are the ones that mean "go on" (Enter, Space,
 *    on the one real control) or "close this" (Escape) — a stray keystroke
 *    still costs nothing.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 *
 * One real button, stretched over the whole surface, named for where it
 * lands ("Open your work brain"). It sits UNDER the lockup in the stacking
 * order and the lockup ignores the pointer, so a click on the wordmark is a
 * click on the button. The text stays outside the button, so a screen
 * reader still meets the name and the tagline as content rather than losing
 * them inside a label. The covered panel is `inert` (App.tsx) for exactly
 * as long as this shows, so the first Tab lands here without anything
 * stealing focus. Reduced motion still means the still pose, no frame loop
 * (BrandMark checks before scheduling anything), and no exit fade.
 */

/** The fade out. §06's drawer duration — this is a full surface leaving. */
export const SPLASH_FADE_MS = 320;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The tagline, split for presentation only.
 *
 * The string stays whole and unsplit in strings.ts, where it is reviewed,
 * and nothing here can change a word of it. What this fixes is a wrap: at
 * 400px the sentence breaks on its own mid-clause and leaves an orphan. The
 * mirror's hinge — "…anything | is how…" — is the natural break, so the
 * split lands there when the hinge exists and falls back to sentence ends
 * for any other line.
 */
export function taglineLines(text: string): string[] {
  const hinge = text.split(/(?<=anything)\s+(?=is\b)/);
  if (hinge.length > 1) return hinge;
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

  const leave = useRef(() => {});
  leave.current = () => {
    if (handedOver.current) return;
    handedOver.current = true;
    const reduce =
      typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches;
    if (reduce) {
      onDone();
      return;
    }
    // Fades out, then hands over. `pointer-events` is dropped for the
    // duration of the fade (see Splash.css), so the panel underneath is
    // live from the moment the splash starts leaving rather than from the
    // moment it finishes.
    setLeaving(true);
    window.setTimeout(() => onDone(), SPLASH_FADE_MS);
  };

  useEffect(() => {
    // Escape still means "close this" — the one key that dismissed the
    // doorway keeps working now that the doorway is a welcome mat. Letter
    // keys still do nothing; Enter and Space belong to the button below.
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') leave.current();
    }
    window.addEventListener('keydown', onKey, { capture: true, passive: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  return (
    // The whole surface is the dismissal. The div's own click catches any
    // press the button somehow does not (the fade's pointer-events window),
    // and the button is the keyboard path.
    <div className="splash" data-leaving={leaving ? 'on' : 'off'} onClick={() => leave.current()}>
      <button
        type="button"
        className="splash-enter"
        aria-label={S.splashEnter}
        onClick={() => leave.current()}
      />
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
            // The space between the lines is kept, inside the later line, so
            // the paragraph's text is still the exact approved string end to
            // end. A block start collapses it on screen.
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
