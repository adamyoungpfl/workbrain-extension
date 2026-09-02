import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark, BuildStamp } from '../components';
import { SplashReveal } from './SplashReveal';
import { SplashRocket } from './SplashRocket';
import { S } from '../strings';
import { speak } from '../voice/speech';
import { useNarratorPref } from '../voice/prefs';
import { SPLASH_BEATS } from '../../core/splash/sequence';
import {
  pullStrength,
  splashPhase,
  swellOpacity,
} from '../../core/splash/sequence';
import type { SplashPhase } from '../../core/splash/sequence';
import './Splash.css';

/**
 * V1.7 VB-34 → V2.1 VB-73 → V2.6 VB-126 → V2.7 VB-128: the splash becomes
 * the SHOW (docs/V2.7-SPLASH-WOW.md, Option 1 confirmed).
 *
 * The sequence: a dark field where the mark burns and pulls (VB-129 flies
 * the shard windows in this stage; this slice ships the stage with the mark
 * and its gravity glow), accelerating to a soft white swell — a luminance
 * ramp held to a whisper-per-frame by core's own curve, never a strobe —
 * then the movie-intro reveal: mark, wordmark, tagline, the enter button,
 * and a ten-second count dressed as a cycling loading line before the
 * splash hands itself over to Home.
 *
 * ── THE SELF-ENDING IS BACK, ON PURPOSE ───────────────────────────────────
 * VB-34 ended on its own; VB-73 removed that because the surface carried
 * choices; VB-128 returns it because the surface is a show again — a show
 * that ends and hands over is a movie, not a door slamming. Recorded in
 * docs/V2.7-SPLASH-WOW.md. Unchanged from every earlier life: any click
 * exits instantly at every moment, Escape means "close this", letter keys
 * cost nothing, once per browser session (App.tsx), and the panel is fully
 * built underneath from the first frame.
 *
 * ── THE CLOCK, AND WHERE FRAMES ARE ALLOWED ───────────────────────────────
 * One rAF loop drives the whole sequence under full motion, writing the
 * per-frame values (--swell, --pull, --drain) straight to style so React
 * re-renders only on the phase and the loading word. Under reduced motion
 * there is NO loop and not one frame is ever scheduled (splash.spec's
 * probe): the composed reveal renders immediately — mark still, everything
 * visible — the count runs on a once-per-second interval, and the hand-off
 * still happens, because the still version carries the whole instruction.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 * The reveal's button is the one control and the one tab stop (the covered
 * panel is inert — App.tsx). The loading line is decoration and says so
 * (aria-hidden): a live region re-announcing a whimsy line every 1.4s would
 * be chatter, and the hand-off lands without stealing focus. Escape works
 * from the first frame, before any control exists to see.
 */

/** The fade out. §06's drawer duration — this is a full surface leaving. */
export const SPLASH_FADE_MS = 320;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The tagline, split for presentation only — the string stays whole in
 * strings.ts. The mirror's hinge is the natural break; sentence ends are
 * the fallback for any other line.
 */
export function taglineLines(text: string): string[] {
  const hinge = text.split(/(?<=anything)\s+(?=is\b)/);
  if (hinge.length > 1) return hinge;
  return text.split(/(?<=[.?!])\s+/);
}

export interface SplashProps {
  /** Called when the splash is finished and may be unmounted. */
  onDone: () => void;
  /* BS-09 (§9) put a TOUR DOOR here and 2026-08-31 takes it off, because the
     splash is a two-button choice now and a third control is the screen asking
     a second question at the moment it is asking its first.

     WHAT IS LOST IS THE SHORTCUT, NOT THE TOUR. V2.5 VB-114's dime tour IS the
     interview's first three steps, with the runner's `skipIf` keeping it away
     from anybody already underway — so a person who takes either button still
     meets it. The door was only a way to reach the same slides sooner.

     Recorded rather than deleted, per the `splashBuild` precedent: if the
     choice ever goes back to three, this is the one that was here. */
  /**
   * D1 (2026-08-31) — the measurement spine's front door
   * (docs/MEASUREMENT-SPINE.md). It opens a short path: the goal gate, then
   * the offer to run that goal with nothing loaded, then the interview.
   *
   * It could not simply "run the goal now": at the splash there is no goal
   * yet — `goal_want` is the interview's own first question — so the door has
   * to open the two questions that make a baseline possible rather than a
   * prompt with nothing in it. Optional, like the tour door beside it.
   */
  onBaseline?: (() => void) | undefined;
}

export function Splash({ onDone, onBaseline }: SplashProps) {
  const [leaving, setLeaving] = useState(false);
  /** Decided during the first render (NarratorToggle's rule): an effect
   * would paint the show a frame late — or paint it at all for someone who
   * asked for stillness. No matchMedia reads as "reduce": the still reveal
   * is the safe answer. */
  const [reduced] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches,
  );
  const [phase, setPhase] = useState<SplashPhase>(reduced ? 'reveal' : 'show');

  const rootRef = useRef<HTMLDivElement | null>(null);
  /* The show's own zero, shared with the reveal so the two cannot drift. */
  const t0Ref = useRef(performance.now());
  /** One handover, however many ways it is triggered at once. */
  const handedOver = useRef(false);

  /** BS-09: one handover, and now two possible destinations — Home, or the
   * tour door's own. The guard and the fade are the same either way, which
   * is why this takes a `then` rather than growing a second function.
   *
   * V2.9 slice 4 polish: `then` OPENS the destination and `onDone` ALWAYS
   * ends the splash — they are no longer alternatives. The destination is
   * opened at the START of the exit rather than after it, so whatever is
   * being revealed has the exit's whole length to mount. App's `onBaseline`
   * stopped ending the splash itself for exactly this reason. */
  const leave = useRef((_then?: () => void) => {});
  leave.current = (then?: () => void) => {
    if (handedOver.current) return;
    handedOver.current = true;
    if (reduced) {
      then?.();
      onDone();
      return;
    }
    then?.();
    // Fades out, then hands over. `pointer-events` drops for the fade (see
    // Splash.css), so the panel underneath is live from the first frame of
    // the leaving rather than the last.
    setLeaving(true);
    window.setTimeout(() => onDone(), SPLASH_FADE_MS);
  };

  /* ── V2.9 slice 4c — THE ROCKET SITS BETWEEN THE PRESS AND THE LEAVING ────
     Adam: "as the rocket materializes and… takes off upwards, behind it, a
     trail of white becomes the whiteout that then fades into the home page."

     BOTH DOORS LAUNCH (docs/V2.9-SLICE-4-LAUNCH.md #1): leaving the splash is
     one moment however it is left, so the baseline doors arrive here directly
     and the launch door arrives through its cable's pulse — different routes,
     one rocket. The destination is parked in a ref for the flight's length,
     and Escape mid-flight goes THERE rather than falling back to Home: the
     person already chose, and a shortcut that changed their answer would be
     the screen overruling them.

     Under reduced motion there is no rocket and the hand-off is immediate —
     `leave` already does exactly that, and the still version's instruction
     ("you are in") is the arrival itself. */
  const [launching, setLaunching] = useState(false);
  /* THE FOG IS CLEARING (V2.9 slice 4 polish). Set at the whiteout, when the
     destination has been opened underneath: the splash stops being a surface
     (Splash.css strips its ground and its reveal) and what remains is the
     rocket stage's fog thinning over the place the person chose. */
  const [dissolving, setDissolving] = useState(false);
  const launchThen = useRef<(() => void) | undefined>(undefined);
  /** Which show the exit stage runs: the launch key flies the rocket under
   * the count; the baseline key rides plainly to the same white. Decided by
   * which key armed, before the stage mounts. */
  const flightRef = useRef(true);
  /** The guard is a ref, not the state: two presses in one tick both read
   * the state's stale `false`, and the second would re-aim the flight. */
  const launched = useRef(false);
  const launch = useRef((_then?: () => void) => {});
  launch.current = (then?: () => void) => {
    if (handedOver.current || launched.current) return;
    launched.current = true;
    launchThen.current = then;
    /* BOTH routes fly since 2026-09-02 ("Once it loads the whole screen
       dissolves to black to initiate the rocket launch sequence" — for
       each button). The fade-only mode remains in the stage, currently
       unreachable, should a route ever want the quiet exit back. */
    flightRef.current = true;
    if (reduced) {
      leave.current(then);
      return;
    }
    setLaunching(true);
  };

  /* THE COUNT, OUT LOUD — when the sound toggle says so (Adam, 2026-09-01:
     "a simple toggle layer that lets you make the button sound on/off before
     you press down"). The toggle IS the narrator preference, so the choice
     rides into the interview exactly as the two doors' choice did; here it
     only decides whether the digits are spoken. Read through a ref so the
     callback identity survives renders — a new identity would remount the
     stage's clock mid-air. */
  const { on: narrated } = useNarratorPref();
  const narratedRef = useRef(narrated);
  narratedRef.current = narrated;
  const speakDigit = useCallback((digit: number) => {
    if (narratedRef.current) speak({ role: 'question', text: String(digit) });
  }, []);
  /** The prop, held for the stable callbacks below — their identities must
   * survive re-renders or they would remount the flight's clock mid-air. */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  /** The whiteout is total: open the chosen door under the fog, once. The
   * destination is then CLEARED from the ref, so an Escape during the fog
   * cannot open it a second time — it only ends the splash early. */
  const arrive = useCallback(() => {
    if (handedOver.current) return;
    launchThen.current?.();
    launchThen.current = undefined;
    setDissolving(true);
  }, []);
  /** The fog has cleared. Everything is already open; only the unmount is
   * left, and the guard is shared with every other exit. */
  const landFlight = useCallback(() => {
    if (handedOver.current) return;
    handedOver.current = true;
    onDoneRef.current();
  }, []);

  useEffect(() => {
    // Escape still means "close this", at every phase — the keyboard's way
    // out before the button exists to see. Letter keys still do nothing.
    // Mid-flight it finishes the transition early, to the chosen door's own
    // destination; before any press `launchThen` is empty and it means Home,
    // as it always has.
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') leave.current(launchThen.current);
    }
    window.addEventListener('keydown', onKey, { capture: true, passive: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  useEffect(() => {
    if (reduced) {
      // The composed frame, at once — and the hold still runs. BS-09 deleted
      // the draining bar, and the once-per-second stepper that drove it goes
      // with it: there is nothing left to step, and a timer with no drawing
      // is a timer nobody asked for. The zero-rAF law is unaffected.
      return () => {
      };
    }

    // The one clock. Phase and the loading word go through React (they
    // change a handful of times); everything per-frame goes straight to
    // style, which is also VB-129's seam — the canvas painter reads the
    // same elapsed time this loop owns.
    const t0 = performance.now();
    t0Ref.current = t0;
    let raf = 0;
    let lastPhase: SplashPhase = 'show';
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const p = splashPhase(t);
      if (p !== lastPhase) {
        lastPhase = p;
        setPhase(p);
      }
      const root = rootRef.current;
      if (root) {
        root.style.setProperty('--swell', swellOpacity(t).toFixed(3));
        root.style.setProperty('--pull', pullStrength(t).toFixed(3));
      }
      /* THE SPLASH NO LONGER HANDS ITSELF OVER (Adam, 2026-08-31).
         VB-131 held it six seconds and then left for Home on its own. That
         made sense when arriving was the only thing this screen could do. It
         now offers a CHOICE — the baseline path or the shorter road — and a
         screen that answers its own question after six seconds is not offering
         one. So the clock still drives the show and drives nothing else. */
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    // The whole surface is still the dismissal, at every phase — a stray
    // click during the show is someone saying "yes, in", and it costs them
    // nothing but the rest of the movie.
    <div
      ref={rootRef}
      className="splash"
      data-phase={phase}
      data-leaving={leaving ? 'on' : 'off'}
      data-dissolving={dissolving ? 'on' : 'off'}
      /* THE SURFACE IS THE DISMISSAL ONLY WHILE THE SHOW IS RUNNING.
         A click mid-movie means "yes, in" and costs nothing but the rest of
         the animation. Once the reveal is up there is a question on screen
         with two answers, and a stray click that picked one of them for
         somebody would be the screen answering for them. */
      onClick={phase === 'reveal' ? undefined : () => leave.current()}
    >
      {/* The stage. VB-128 ships it with the mark burning in its gravity
          glow; VB-129 flies the shard windows in this same box. Decoration
          throughout — the reveal carries every word. */}
      {phase !== 'reveal' && (
        /* THE MAJESTIC OPEN (Adam, 2026-09-02): the mosaic wall retired for
           the brain model's own idiom — a huge, faint, pencil-grey mark
           turning on a white field, and over it the lockup, the tagline and
           the byline arriving in order. Then everything fades to black (the
           swell, wearing the field's dark now) and the sequence proper
           begins. Scenery throughout — the reveal carries every word for
           real. The mosaic (core/splash/mosaic.ts, SplashStage) stays on the
           bench, tested, should the wall be wanted back. */
        <div className="splash-stage" aria-hidden="true">
          <div className="splash-intro">
            <div className="splash-intro-globe">
              <BrandMark size={520} spin="orbit" />
            </div>
            <div className="splash-intro-card">
              <BrandMark size={92} spin="orbit" />
              <p className="splash-intro-name">{S.appName}</p>
              <p className="splash-intro-tagline">{S.splashTagline}</p>
              <p className="splash-intro-byline">{S.chromeCompany}</p>
            </div>
          </div>
        </div>
      )}

      {/* The swell — opacity driven by core's own soft curve, never a
          square wave. Present in the DOM only while it could show. */}
      {!reduced && phase !== 'show' && <div className="splash-swell" aria-hidden="true" />}

      {/* Any click already left; nothing said so, so people sat through it
          politely (§9). The stamp is BS-00's, here because "which build did
          you have" is the first question a report raises. Outside the lockup
          so both pin to the PANEL's corners rather than to the composition's,
          and so neither costs the lockup a pixel of its vertical rhythm. */}
      {/* The corner's Skip is gone with the auto hand-off: "go straight in" is
          one of the two buttons below now, and a third control saying the same
          thing is the screen asking twice. The stamp stays — "which build did
          you have" is the first question a report raises. */}
      {phase === 'reveal' && (
        <div className="splash-corners">
          <BuildStamp />
        </div>
      )}
      {phase === 'reveal' && (
        /* V2.9 slice 2 — the reveal is its own surface now (SplashReveal.tsx).
           It was a static stack of paragraphs; it is a sequence, and a
           sequence with five parts moving against each other belongs in one
           file with one clock rather than spread through this one.

           The clock is still THIS component's — `elapsed` reads the same rAF
           that drives the show, so the mosaic and the reveal cannot drift.
           Under reduced motion it is handed `still` and schedules nothing.

           V2.9 slice 4a: THE READ-ALOUD TOGGLE IS NOT PASSED IN ANY MORE. The
           baseline door became two doors — narrated and silent — so a mute
           control above them was the screen asking the same question twice,
           which is the objection BR-01 made when it deleted the third control
           from here. Nothing is lost: the toggle lives in the interview
           header, which is where somebody changes their mind rather than
           where they first decide.

           V2.9 slice 4c: the doors call `launch`, not `leave` — the rocket
           is what leaving looks like now, from either of them. The wrapper
           goes `inert` for the flight: the doors are still on screen under
           an opaque stage, and an invisible button that still takes an Enter
           could re-choose narration mid-air. One attribute closes every such
           door at once. */
        <div
          className="splash-hold"
          /* The spread, not a JSX attribute — App.tsx's own reasoning: React
             18 forwards `inert` as a plain attribute but its types predate
             the property. `''` sets it, absent removes it. */
          {...((launching ? { inert: '' } : {}) as Record<string, string>)}
        >
          <SplashReveal
            still={reduced}
            elapsed={() => (performance.now() - t0Ref.current) / 1000 - SPLASH_BEATS.revealAt}
            {...(onBaseline ? { onBaseline: () => launch.current(onBaseline) } : {})}
            onStraight={() => launch.current()}
          />
        </div>
      )}
      {/* The flight, then the fog. Mounted over everything this surface has —
          the reveal, the corners, the stamp — because it IS the surface
          leaving: the whiteout opens the chosen door underneath (`arrive`),
          the fog clears onto it, and only then does the splash unmount. Its
          own fallback timer holds the door, so the hand-off survives
          anything the drawing does. */}
      {launching && (
        <SplashRocket
          flight={flightRef.current}
          onDigit={speakDigit}
          onWhiteout={arrive}
          onDone={landFlight}
        />
      )}
    </div>
  );
}
