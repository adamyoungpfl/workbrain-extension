import { useEffect, useRef, useState } from 'react';
import { BrandMark, Button } from '../components';
import { NARRATOR_ICON } from '../components/NarratorToggle';
import { narratorSupported } from '../voice/speech';
import { useNarratorPref } from '../voice/prefs';
import { S } from '../strings';
import './Splash.css';

/**
 * V1.7 VB-34, rebuilt by V2.1 VB-73 — the splash becomes a doorway.
 *
 * The mark on `core/geometry/markOrbit`'s camera path, the lockup, the
 * tagline — and now, underneath them, the decisions someone should make
 * before the first instruction: which door (build a file, or load one they
 * already have), and whether questions are read aloud.
 *
 * ── WHAT VB-73 REVERSED, AND WHAT IT KEPT ─────────────────────────────────
 *
 * VB-34 decided the splash "ends on its own", and its header argued that was
 * the thing that made it not a toll booth. VB-73 reverses that deliberately —
 * Adam: "I want the splash page to load and remain up until we click one of
 * the CTAs." The reversal is honest because the surface changed underneath
 * it: a splash with nothing on it that waits for a click is a toll booth, and
 * a doorway with a real choice on it that dismisses itself is a doorway that
 * slams. Same rule — a surface holds the screen only as long as it is doing
 * something — landing on opposite behaviours because the surface stopped
 * being decoration.
 *
 * Three VB-34 decisions are deliberately KEPT:
 *
 * 1. **It never gates the first paint.** App.tsx renders the real surface
 *    immediately and lays this over it; the 'asking' state renders no splash
 *    at all. The panel is built and laid out underneath the whole time.
 *
 * 2. **Once per browser session** — "a splash on every open is a toll booth
 *    on someone's own work" (Adam, 2026-08-24). VB-73 changed how the splash
 *    LEAVES, not how often it ARRIVES. `chrome.storage.session` is still the
 *    mechanism and App.tsx still does the read; see schema/storage.types.ts
 *    for why an in-memory area is not the persistence ARCHITECTURE forbids.
 *
 * 3. **A stray click never reaches a control nobody could see.** The overlay
 *    is opaque and the backdrop consumes its click — it dismisses, and the
 *    press ends there. Acting on a covered control costs trust.
 *
 * ── HOW IT LEAVES ─────────────────────────────────────────────────────────
 *
 * A click, and only a click — on a door, or on the backdrop:
 *
 *   · "Build your file" → Home, whose own CTA knows what building means for
 *     this person's actual state (start, resume, or reflect).
 *   · "Load your file"  → Home, and the file picker opens over it
 *     (`intent: 'load'` — App.tsx hands it to Home, Home to FileActions,
 *     which owns the input). If the picker cannot open, the person is
 *     standing next to "I already have a file" — the degradation is silent
 *     and one press deep, per docs/GUARDRAILS.md.
 *   · The backdrop → Home, nothing else. Not choosing is allowed.
 *   · Escape → same as the backdrop. The keyboard path out is not a choice
 *     and does not need one; the doors themselves are real buttons reached by
 *     Tab, because App.tsx marks the covered panel `inert` while this is up.
 *
 * Every other key does nothing. VB-34 let any key skip the splash because the
 * splash carried nothing; these keys now have a surface with controls on it,
 * and a keystroke that dismissed it would throw away the choice it exists to
 * offer.
 *
 * ── THE AUDIO TOGGLE, AND THE MICROPHONE THAT IS NOT HERE ─────────────────
 *
 * The toggle is the narrator preference — the same `wb:prefs.narrator` the
 * header toggle reads, through the same hook, so the two controls cannot
 * disagree. Where there is no speech engine there is no row, not a disabled
 * one (degradation rule; same check NarratorToggle makes).
 *
 * VB-73's notes asked for "audio and microphone" configuration. The
 * microphone toggle is DELIBERATELY NOT BUILT, per docs/V2.1-REFINEMENT.md's
 * flag: this product does not build a microphone (V1.8 VB-49 — four
 * independent blockers, each sufficient), so a toggle labelled "microphone"
 * would switch a hint, not a microphone, and a control that does less than
 * its name is the kind of small dishonesty this product has avoided
 * everywhere else. The splash offers audio only.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 *
 * VB-34's splash was `aria-hidden` — nothing on it was information. VB-73's
 * has three controls, so it is exposed, and the covered panel is `inert`
 * (App.tsx) for exactly as long as it shows: one account of the screen at a
 * time. Focus is not stolen — the first Tab lands on the first door because
 * everything underneath is inert, not because anything grabbed it. Reduced
 * motion still means the still pose and no frame loop (BrandMark checks
 * before scheduling anything), and the fade-out is skipped so the handover
 * is immediate.
 */

/** The fade out. §06's drawer duration — this is a full surface leaving. */
export const SPLASH_FADE_MS = 320;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** Which door was taken, if any. `null` is the backdrop or Escape: no choice
 * made, and Home as it stands is the answer. */
export type SplashIntent = 'build' | 'load' | null;

/**
 * The tagline, one sentence per line.
 *
 * Presentation, not content: the string stays whole and unsplit in
 * strings.ts, where it is reviewed, and nothing here can change a word of it.
 * What this fixes is a wrap. At 400px the line breaks on its own as "AI does
 * the work. You do the" / "thinking.", which leaves a one-word orphan under
 * seven words of headline — looked at, in a real panel, before deciding. The
 * sentences are the natural break and the line was written as two of them.
 */
function taglineLines(text: string): string[] {
  return text.split(/(?<=[.?!])\s+/);
}

export interface SplashProps {
  /** Called when the splash is finished and may be unmounted, carrying the
   * door that was taken. */
  onDone: (intent: SplashIntent) => void;
}

export function Splash({ onDone }: SplashProps) {
  const [leaving, setLeaving] = useState(false);
  /** One handover, however many ways it is triggered at once. */
  const handedOver = useRef(false);
  const narrator = useNarratorPref();
  /** Decided during the first render, exactly as NarratorToggle decides it —
   * an effect would paint the row a frame late and shift the doors under a
   * pointer already travelling toward them (the class of bug V2.0's 6px hunt
   * traced to a late-deciding NarratorToggle). */
  const [voiced] = useState(narratorSupported);

  const leave = useRef((intent: SplashIntent) => intent);
  leave.current = (intent: SplashIntent) => {
    if (handedOver.current) return intent;
    handedOver.current = true;
    const reduce =
      typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches;
    if (reduce) {
      onDone(intent);
      return intent;
    }
    // Fades out, then hands over. `pointer-events` is dropped for the
    // duration of the fade (see Splash.css), so the panel underneath is
    // live from the moment the splash starts leaving rather than from the
    // moment it finishes.
    setLeaving(true);
    window.setTimeout(() => onDone(intent), SPLASH_FADE_MS);
    return intent;
  };

  useEffect(() => {
    // Escape only. VB-34 listened for every kind of input here; VB-73's
    // surface has controls, and the one key that means "close this" is the
    // one key that should.
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') leave.current(null);
    }
    window.addEventListener('keydown', onKey, { capture: true, passive: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  return (
    // The backdrop's click is the dismissal, and stopPropagation on the card
    // below is what keeps a press on a door from also being a press on the
    // backdrop behind it. Not a keyboard trap: the card's own buttons are the
    // keyboard path, and Escape is handled above.
    <div
      className="splash"
      data-leaving={leaving ? 'on' : 'off'}
      onClick={() => leave.current(null)}
    >
      <div className="splash-lockup" onClick={(event) => event.stopPropagation()}>
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

        {/* The doors — the panel's own Button, not a bespoke control: the
            splash fades into Home and its buttons must be Home's buttons.
            Build is the one primary on this screen (§04's rule) because it is
            the product's own first move; Load is the door for someone arriving
            with a file — it lands beside Home's "I already have a file" and
            opens its picker when it can. Labels are Adam's own, from VB-73's
            notes, sentence-cased to match every other button in the panel. */}
        <div className="splash-doors">
          <Button type="button" onClick={() => leave.current('build')}>
            {S.splashBuild}
          </Button>
          <Button type="button" variant="secondary" onClick={() => leave.current('load')}>
            {S.splashLoad}
          </Button>
        </div>

        {/* The one configuration that belongs at the doorway. Same pref, same
            hook, same icon as the header's toggle — two controls, one answer.
            The label is visible here where the header's is an icon-button,
            because a doorway is where a person has never seen the icon. */}
        {voiced && (
          <button
            type="button"
            className="splash-voice"
            aria-pressed={narrator.on}
            onClick={() => narrator.setOn(!narrator.on)}
          >
            {/* The same drawing the header's toggle uses, keyed to the same
                attribute: `[aria-pressed]` shows the waves or the cross
                (Splash.css mirrors NarratorToggle.css's two rules), so the
                state is in the shape, never only in the colour. */}
            <span className="splash-voice-icon" aria-hidden="true">
              {NARRATOR_ICON}
            </span>
            {S.narrator}
            <span className="splash-voice-state">{narrator.on ? S.splashVoiceOn : S.splashVoiceOff}</span>
          </button>
        )}
      </div>
    </div>
  );
}
