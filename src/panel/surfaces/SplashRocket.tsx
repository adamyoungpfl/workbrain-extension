import { useEffect, useLayoutEffect, useRef } from 'react';
import {
  DISSOLVE_HOLD_MS,
  DISSOLVE_MS,
  LAUNCH_MS,
  SHAKE_MAX,
  countdownAt,
  dissolveAt,
  rocketAt,
} from '../../core/splash/rocket';
import './SplashRocket.css';

/**
 * V2.9 slice 4c — THE ROCKET, DRAWN (Adam, 2026-09-01).
 *
 * "Materialize a rocket that is color on theme with the panel and the app as
 * the rest of the buttons and text and logos fade living only the dark
 * background. The rocket should be most lightly tones, with pops of color
 * from the app pallets… as the rocket materializes and sort of visually
 * rumbles and takes off upwards, behind it, a trail of white becomes the
 * whiteout that then fades into the home page."
 *
 * Every beat comes from core/splash/rocket.ts. This file owns three things:
 * the drawing, where the pad sits, and the clock that asks the spine what to
 * paint — the same split the reveal and the cable already have.
 *
 * ── ONE OPAQUE LAYER IS THE WHOLE FADE-OUT ────────────────────────────────
 * "Everything else fades" is not five elements each fading on its own
 * schedule: this surface is the dark field itself, fading in OVER the reveal.
 * One opacity on one layer, and the doors, the sections and the lockup all
 * sink into the dark together — which is also what makes it safe: nothing
 * under here had to be told anything, and if this surface fails to paint, the
 * reveal it covers is still a working screen.
 *
 * ── THE HAND-OFF DOES NOT DEPEND ON THE DRAWING ───────────────────────────
 * `onDone` fires when the clock says the flight is over — from the paint loop
 * when it runs, and from a plain timer when it does not. A launch that cannot
 * draw itself costs the cinema and never the arrival, which is the
 * degradation law with a rocket in it. Under reduced motion this component is
 * never mounted at all (Splash hands over immediately), so the zero-frames
 * law is kept by construction.
 */

/** Where the pad sits, as a fraction of the stage's height. Below centre,
 *  because the flight needs more sky above it than ground under it. */
const PAD_AT = 0.62;

/**
 * THE FOG (Adam, 2026-09-01): "smoke then sort of digitally dematerializing
 * like a fog disappearing to reveal either the home page or the baseline
 * page." Eight blurred puffs over a flat white base. The base thins first;
 * each puff holds a beat longer than its neighbour, drifts a little and
 * goes — which is the difference between fog CLEARING and a screen fading.
 *
 * The scatter is fixed, not rolled: a pure clock cannot roll dice, and fog
 * that clears the same way every arrival is fog a test can hold still.
 * Positions are percentages of the stage; sizes are px of blurred diameter;
 * `hold` is the fraction of the clearing each puff sits out before joining.
 */
const PUFFS = [
  { x: 12, y: 14, s: 250, hold: 0.0, dx: -36, dy: -26 },
  { x: 60, y: 8, s: 270, hold: 0.18, dx: 30, dy: -32 },
  { x: 30, y: 40, s: 300, hold: 0.34, dx: -28, dy: 8 },
  { x: 80, y: 36, s: 260, hold: 0.1, dx: 40, dy: 4 },
  { x: 8, y: 64, s: 280, hold: 0.26, dx: -34, dy: 20 },
  { x: 52, y: 60, s: 330, hold: 0.42, dx: 12, dy: 24 },
  { x: 86, y: 74, s: 250, hold: 0.2, dx: 38, dy: 30 },
  { x: 34, y: 88, s: 290, hold: 0.12, dx: -22, dy: 34 },
];
/** The drawing's own numbers: the svg is 84×210, with the nozzle's lip — the
 *  point that sits ON the pad — at y 166, and the flame filling the rest. */
const SHIP_W = 84;
const SHIP_H = 210;
const NOZZLE_Y = 166;
/** Climb past the top by this much more than the pad's own height, so the
 *  flame clears the frame too and nothing lingers at the edge. */
const CLEAR_PX = 48;

export interface SplashRocketProps {
  /** True on the launch route: the rocket flies under the digits and its
   *  trail makes the white. False on the baseline route: no flight — the
   *  countdown's own plain ride to white does it (Adam, 2026-09-01: "the
   *  background around everything but the countdown number fades to
   *  white"). Both land on the identical full-white frame at zero, which is
   *  what lets the fog take over without knowing which key was held. */
  flight: boolean;
  /** The digit changed — 3, then 2, then 1. The splash gives it to the
   *  narrator when the sound toggle is on; the drawing here never speaks. */
  onDigit?: ((digit: number) => void) | undefined;
  /** The whiteout is total. Open the destination NOW, under the fog — what
   *  the clearing reveals must be the place the person chose, not a screen
   *  still loading. This is the seam that fixes the flash of Home the
   *  baseline route used to show. */
  onWhiteout: () => void;
  /** The fog has cleared; the splash may unmount. */
  onDone: () => void;
}

export function SplashRocket({ flight, onDigit, onWhiteout, onDone }: SplashRocketProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const shipRef = useRef<SVGSVGElement | null>(null);
  const flameRef = useRef<SVGGElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);
  const bloomRef = useRef<HTMLDivElement | null>(null);
  const whiteRef = useRef<HTMLDivElement | null>(null);
  const digitRef = useRef<HTMLDivElement | null>(null);
  const puffRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** One arrival, whichever of the loop or the fallback timer gets there. */
  const landed = useRef(false);
  /** One whiteout — the loop and the fallback must not both open the door. */
  const whitedOut = useRef(false);
  const geom = useRef({ climb: 700 });

  /* The pad, measured once. The stage is the whole splash, so the pad is a
     fraction of it rather than a number that is wrong on the first tall
     panel. Positions are written to style here and never touched again — the
     flight itself moves by transform only. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const h = root.clientHeight || 700;
    const padY = Math.round(h * PAD_AT);
    geom.current.climb = padY + CLEAR_PX;
    /* The bloom's gradient is centred on the pad through this property — the
       stylesheet cannot know where the pad landed, and a second copy of the
       fraction would be one a re-tuning misses. */
    root.style.setProperty('--rocket-pad', `${padY}px`);
    const ship = shipRef.current;
    if (ship) ship.style.top = `${padY - NOZZLE_Y}px`;
    const trail = trailRef.current;
    if (trail) trail.style.bottom = `${h - padY}px`;
  }, []);

  useEffect(() => {
    /* A re-run after the flight (the splash re-renders as it starts leaving)
       must not fly it again from zero. */
    if (landed.current) return;
    const arrive = () => {
      if (whitedOut.current) return;
      whitedOut.current = true;
      /* The stage flips to its fog dress — dark ground gone, flight hidden —
         through one attribute, so the drawing cannot half-change. Nothing is
         seen changing: the swap happens under a frame that is solid white,
         and the fog's own layers open solid white. */
      rootRef.current?.setAttribute('data-fog', 'on');
      onWhiteout();
    };
    const finish = () => {
      if (landed.current) return;
      landed.current = true;
      arrive();
      onDone();
    };
    /* THE DOOR OPENS ON TIME EVEN IF NOT ONE FRAME PAINTS. A throttled tab,
       a broken canvas, a throw in the loop — none of them may cost the
       person their arrival. Silent, per docs/GUARDRAILS.md. The flight's
       timer is swapped for the fog's at the whiteout, and the fog's is
       GENEROUS: opening the destination can hold the main thread for a
       while on a slow day, and a timer queued behind that block would fire
       the moment it lifted — cutting the fog exactly when it finally had
       frames to paint. A dead loop still ends inside three seconds. */
    let fallback = window.setTimeout(() => {
      arrive();
      fallback = window.setTimeout(finish, DISSOLVE_HOLD_MS + DISSOLVE_MS + 2000);
    }, LAUNCH_MS + 400);

    let raf = 0;
    const t0 = performance.now();
    /** The whiteout has happened; the next painted frame anchors the fog. */
    let arrived = false;
    /** The fog's zero — the first frame PAINTED after the destination went
     * in. Anchored to wall time at the whiteout instead, the interview's
     * mount (main-thread work between two ticks) would eat the fog's whole
     * length and the dissolve would never be seen — which is exactly what
     * the first cut of this did. The white frame simply HOLDS through the
     * block; white held is indistinguishable from white animating. */
    let foggedAt = 0;
    const tick = (now: number) => {
      const f = rocketAt(now - t0);

      /* THE COUNT, over both routes (Adam, 2026-09-01: "counts down 3, 2,
         1"). The digit goes through the DOM only when it changes — and that
         change is the narrator's cue; the pop and the fade ride digitP
         straight to style every frame. */
      const count = countdownAt(now - t0);
      const digitEl = digitRef.current;
      if (digitEl && !f.done) {
        try {
          const showing = digitEl.textContent;
          const next = String(count.digit);
          if (showing !== next) {
            digitEl.textContent = next;
            onDigit?.(count.digit);
          }
          const landing = Math.min(1, count.digitP * 4);
          digitEl.style.opacity = Math.min(1, count.digitP * 8).toFixed(3);
          digitEl.style.transform = `translate(-50%, -50%) scale(${(1.35 - 0.35 * landing).toFixed(3)})`;
        } catch {
          /* Silent, per docs/GUARDRAILS.md — the count is scenery. */
        }
      }

      /* ── PHASE TWO: THE FOG ─────────────────────────────────────────── */
      if (f.done) {
        if (!arrived) {
          arrived = true;
          arrive();
          window.clearTimeout(fallback);
          fallback = window.setTimeout(finish, DISSOLVE_HOLD_MS + DISSOLVE_MS + 2000);
          /* The destination mounts between this frame and the next; the
             fog starts counting when the next frame actually paints. */
          raf = requestAnimationFrame(tick);
          return;
        }
        if (!foggedAt) foggedAt = now;
        const fog = dissolveAt(now - foggedAt);
        try {
          const white = whiteRef.current;
          /* The base thins ahead of the puffs, so the destination starts
             showing THROUGH the fog rather than after it. */
          if (white) white.style.opacity = Math.max(0, 1 - fog.clear * 1.5).toFixed(3);
          PUFFS.forEach((puff, i) => {
            const el = puffRefs.current[i];
            if (!el) return;
            const local = Math.max(0, Math.min(1, (fog.clear - puff.hold) / (1 - puff.hold)));
            el.style.opacity = (1 - local).toFixed(3);
            el.style.transform =
              `translate(-50%, -50%) translate(${(puff.dx * local).toFixed(1)}px, ` +
              `${(puff.dy * local).toFixed(1)}px) scale(${(1 + 0.25 * local).toFixed(3)})`;
          });
        } catch {
          /* Silent, per docs/GUARDRAILS.md — fog that cannot draw costs the
             dissolve, and the fallback timer is already holding the door. */
        }
        if (fog.done) {
          finish();
          return;
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      /* ── PHASE ONE: THE FLIGHT — or, without one, the plain ride ────── */
      if (!flight) {
        /* The baseline route: no ship, no dark cover — the stage is
           transparent over the living reveal (data-mode='fade' strips its
           ground) and the white layer simply rises through the count.
           "The background around everything but the countdown number fades
           to white", exactly. */
        try {
          const root = rootRef.current;
          const white = whiteRef.current;
          if (root) root.style.opacity = '1';
          if (white) white.style.opacity = count.white.toFixed(3);
        } catch {
          /* Silent, per docs/GUARDRAILS.md. */
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      try {
        const root = rootRef.current;
        const ship = shipRef.current;
        const flame = flameRef.current;
        const trail = trailRef.current;
        const white = whiteRef.current;
        if (root) root.style.opacity = f.cover.toFixed(3);
        const rise = geom.current.climb * f.climb;
        if (ship) {
          ship.style.opacity = f.rocket.toFixed(3);
          /* The shake rides INSIDE the centring, and the settle is a scale:
             a thing materialising slightly small and arriving at full size
             reads as landing on the pad rather than as a fade. */
          ship.style.transform =
            `translate3d(calc(-50% + ${f.shake.toFixed(2)}px), ${(-rise).toFixed(1)}px, 0)` +
            ` scale(${(0.92 + 0.08 * f.rocket).toFixed(3)})`;
        }
        if (flame) {
          /* The flicker is the rumble's own value re-used — the flame
             gutters exactly when the airframe shivers, because they are one
             engine. A second noise source could only disagree. */
          const flick = Math.abs(f.shake) / SHAKE_MAX;
          flame.setAttribute(
            'transform',
            `translate(42 ${NOZZLE_Y}) scale(1 ${(0.45 + 0.6 * f.flame + 0.25 * flick).toFixed(3)})` +
              ` translate(-42 -${NOZZLE_Y})`,
          );
          flame.style.opacity = (f.flame * (0.72 + 0.28 * flick)).toFixed(3);
        }
        if (trail) {
          /* Pinned to the pad and grown to wherever the tail is now, so the
             trail can only ever connect the two — it is what the rocket is
             leaving, not a second animation underneath it. It thickens a
             little as the white rises, but the flooding is the bloom's job:
             a column scaled to fill the frame is a grey box with edges. */
          trail.style.height = `${rise.toFixed(1)}px`;
          trail.style.opacity = f.trail.toFixed(3);
          trail.style.transform = `translateX(-50%) scaleX(${(1 + 4 * f.white).toFixed(2)})`;
        }
        /* "A trail of white BECOMES the whiteout", in two layers with one
           clock: the bloom — soft light spreading from the pad — runs ahead
           of the flat white that must be total by the end. Ahead and behind
           of the same number, so they cannot disagree about when. */
        const bloom = bloomRef.current;
        if (bloom) bloom.style.opacity = Math.min(1, f.white * 1.8).toFixed(3);
        if (white) white.style.opacity = (f.white * f.white).toFixed(3);
      } catch {
        /* Silent, per docs/GUARDRAILS.md: the flight is scenery, and the
           fallback timer is already holding the door. */
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [flight, onDigit, onWhiteout, onDone]);

  return (
    /* Scenery, all of it, and it says so. Every word this screen had was
       already spoken by the reveal underneath; the flight carries no
       instruction — "you are in" is the arrival itself, which is why the
       reduced-motion version is simply arriving. */
    <div
      className="splash-rocketstage"
      ref={rootRef}
      data-mode={flight ? 'flight' : 'fade'}
      aria-hidden="true"
    >
      <div className="splash-rocket-trail" ref={trailRef} />
      <div className="splash-rocket-bloom" ref={bloomRef} />
      <div className="splash-rocket-white" ref={whiteRef} />
      {/* The count. Bold enough to hold against black AND white, because on
          the flight route it rides the dark field and on the fade route the
          ground whitens beneath it — that dual duty is exactly why Adam
          specced the colour that way. Gone the instant the fog takes over. */}
      <div className="splash-count" ref={digitRef} />
      {/* The fog, waiting its turn: invisible through the flight, and the
          shape the whiteout breaks into once it is total. Above the white so
          the puffs are what linger as the base thins. */}
      <div className="splash-rocket-fog">
        {PUFFS.map((puff, i) => (
          <div
            key={`${puff.x}-${puff.y}`}
            className="splash-rocket-puff"
            ref={(el) => {
              puffRefs.current[i] = el;
            }}
            style={{
              left: `${puff.x}%`,
              top: `${puff.y}%`,
              width: `${puff.s}px`,
              height: `${puff.s}px`,
            }}
          />
        ))}
      </div>
      <svg
        className="splash-rocket"
        ref={shipRef}
        viewBox={`0 0 ${SHIP_W} ${SHIP_H}`}
        focusable="false"
      >
        {/* The flame, under the airframe so its root stays behind the
            nozzle's lip. Warm pops on a light core — the one warm thing on a
            cool screen, which is what makes it read as fire. */}
        <g className="splash-rocket-flame" ref={flameRef}>
          <path
            className="splash-rocket-flame-outer"
            d="M42 166 C53 175 55 190 42 208 C29 190 31 175 42 166 Z"
          />
          <path
            className="splash-rocket-flame-mid"
            d="M42 168 C50 176 51 187 42 200 C33 187 34 176 42 168 Z"
          />
          <path
            className="splash-rocket-flame-core"
            d="M42 171 C47 177 48 184 42 192 C36 184 37 177 42 171 Z"
          />
        </g>
        {/* The fins wear the through-line's own two colours — the fuchsia
            the privacy section arrived in and the purple it travelled to —
            so the thing that flies is dressed in the journey it ends. */}
        <path className="splash-rocket-fin-left" d="M22 106 C9 120 5 140 8 158 L22 138 Z" />
        <path className="splash-rocket-fin-right" d="M62 106 C75 120 79 140 76 158 L62 138 Z" />
        {/* The airframe: light tones, as asked — paper on the dark field,
            with one shaded flank so it reads as a body rather than a
            sticker. */}
        <path
          className="splash-rocket-body"
          d="M42 4 C58 22 62 44 62 78 L62 132 C62 146 56 156 42 158 C28 156 22 146 22 132 L22 78 C22 44 26 22 42 4 Z"
        />
        <path
          className="splash-rocket-shade"
          d="M42 4 C58 22 62 44 62 78 L62 132 C62 146 56 156 42 158 Z"
        />
        {/* The pops: the doors' own cyan band, and a porthole ringed in the
            mark's bright cyan over deep glass. */}
        <rect className="splash-rocket-band" x="25" y="116" width="34" height="9" rx="4.5" />
        <circle className="splash-rocket-glass" cx="42" cy="64" r="12" />
        <circle className="splash-rocket-ring" cx="42" cy="64" r="12" />
        <path className="splash-rocket-nozzle" d="M33 158 L51 158 L55 166 L29 166 Z" />
      </svg>
    </div>
  );
}
