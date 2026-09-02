import { useEffect, useLayoutEffect, useRef } from 'react';
import { LAUNCH_MS, SHAKE_MAX, rocketAt } from '../../core/splash/rocket';
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
/** The drawing's own numbers: the svg is 84×210, with the nozzle's lip — the
 *  point that sits ON the pad — at y 166, and the flame filling the rest. */
const SHIP_W = 84;
const SHIP_H = 210;
const NOZZLE_Y = 166;
/** Climb past the top by this much more than the pad's own height, so the
 *  flame clears the frame too and nothing lingers at the edge. */
const CLEAR_PX = 48;

export function SplashRocket({ onDone }: { onDone: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const shipRef = useRef<SVGSVGElement | null>(null);
  const flameRef = useRef<SVGGElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);
  const bloomRef = useRef<HTMLDivElement | null>(null);
  const whiteRef = useRef<HTMLDivElement | null>(null);
  /** One arrival, whichever of the loop or the fallback timer gets there. */
  const landed = useRef(false);
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
    const finish = () => {
      if (landed.current) return;
      landed.current = true;
      onDone();
    };
    /* THE DOOR OPENS ON TIME EVEN IF NOT ONE FRAME PAINTS. A throttled tab,
       a broken canvas, a throw in the loop — none of them may cost the
       person their arrival. Silent, per docs/GUARDRAILS.md. */
    const fallback = window.setTimeout(finish, LAUNCH_MS + 240);

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const f = rocketAt(now - t0);
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
      if (f.done) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallback);
    };
  }, [onDone]);

  return (
    /* Scenery, all of it, and it says so. Every word this screen had was
       already spoken by the reveal underneath; the flight carries no
       instruction — "you are in" is the arrival itself, which is why the
       reduced-motion version is simply arriving. */
    <div className="splash-rocketstage" ref={rootRef} aria-hidden="true">
      <div className="splash-rocket-trail" ref={trailRef} />
      <div className="splash-rocket-bloom" ref={bloomRef} />
      <div className="splash-rocket-white" ref={whiteRef} />
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
