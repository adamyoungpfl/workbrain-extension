import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BrandMark } from '../components';
import { narratorSupported, stopSpeaking } from '../voice/speech';
import { cue } from '../voice/cues';
import { loadPrefs, useNarratorPref } from '../voice/prefs';
import { idleGlowAt, pulseAt } from '../../core/splash/launch';
import { HOLD_MS, chargeAt, dischargeAt } from '../../core/splash/rocket';
import {
  CLAIM_TRUE,
  COUNT_FROM,
  REVEAL_REST,
  REVEAL_SETTLED,
  ROLODEX_TURN_MS,
  claimWordAt,
  countAt,
  linkAt,
  orPairAt,
  partAt,
  rolodexAt,
} from '../../core/splash/reveal';
import type { RevealPart } from '../../core/splash/reveal';
import { REVEAL_SIMPLE } from '../../core/splash/reveal';
import { S } from '../strings';
import { richTagline, taglineLines } from './Splash';
import './SplashReveal.css';

/**
 * V2.9 — THE REVEAL, DRAWN (Adam, 2026-09-02). Slice 2 of 4.
 *
 * Every position, opacity and beat comes from core/splash/reveal.ts. This file
 * owns three things and nothing else: where the parts sit at rest, the path
 * between two of them, and the clock that asks the spine what to paint.
 *
 * ── POSITIONS ARE WRITTEN TO STYLE, NOT THROUGH REACT ─────────────────────
 * Five parts moving at sixty frames a second is three hundred renders a
 * second if opacity and transform go through state. They go straight to the
 * element, exactly as `Splash` already does for its swell — React is left
 * holding only the things that change a handful of times: the counter's digits,
 * which turn the rolodex is on, and which privacy line is up.
 *
 * ── THE CONNECTOR IS COMPUTED FROM LIVE POSITIONS ─────────────────────────
 * Adam: "a glowing path or arrow links to the next section… the arrow stays
 * connected and adjusts its path for the movement to the left."
 *
 * So it cannot be a drawn line with its own timing — it has to know where both
 * ends actually are. The resting boxes are measured ONCE after layout, and
 * every frame the endpoints are that box plus the offset the spine is already
 * applying to the part. One source for where things are; the path follows for
 * free rather than being animated in parallel and kept in step by hand.
 */

const PARTS: RevealPart[] = ['lockup', 'tagline', 'time', 'privacy', 'baseline', 'launch'];

interface Box {
  cx: number;
  top: number;
  bottom: number;
  /** The key inside an action part, when there is one — measured so a
   *  link can aim at the pill rather than at the full-width row the part
   *  actually is. */
  key?: { cx: number; cy: number; w: number; h: number };
  /** The "OR" between the pills, when the part carries one — the grown
   *  squiggle runs from under it into the key below. */
  or?: { cx: number; top: number; bottom: number };
  /** The eta chip's lower edge - the upper squiggle's landfall measures
   *  off it (Adam, 2026-09-02: "clear of the average completion time
   *  marker"), so clearance holds by construction if the chip changes. */
  eta?: { bottom: number };
}

export interface SplashRevealProps {
  /** Seconds since the reveal began. Under reduced motion the caller passes
   *  the settled time once and never again. */
  elapsed: () => number;
  /** No clock at all: paint the settled frame and schedule nothing. */
  still: boolean;
  onBaseline?: ((voiced: boolean) => void) | undefined;
  onStraight: (voiced: boolean) => void;
}

/**
 * V2.9 — THE SPLIT PILL (Adam, 2026-09-02, from a reference image).
 *
 * "The split of the button with the labels distinct is a good pattern" —
 * one button in two segments: the narrated main, filled and named with its
 * "(narrated)" qualifier, and a compact Silent segment beside it wearing
 * the struck silhouette. The recommended path reads as the button; the
 * silent path is right there, distinct, never hidden. His reference's
 * arrow and progress bar stay out, at his word.
 *
 * WHAT SURVIVES FROM THE RING: everything that was ever load-bearing.
 * Holding is still the press — the pill's outline brightens and its glow
 * grows on core's charge clock, arming is what a click used to be, an early
 * release drains fast. The held segment still writes the narrator
 * preference at the arm (4a's law: the press is the answer). Reduced
 * motion still arms on a plain click, and where no speech engine exists
 * the silent segment does not render — one quiet pill, the same collapse
 * the cluster has had since 4a.
 *
 * The class names `splash-holdkey`/`-side` and the `data-side`/`data-live`
 * attributes carry over unchanged — they are the seam the e2e suite and
 * the film script hold, and the seam did not change, only the shape.
 */
function VoiceGlyph({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
      <circle cx="9" cy="8.4" r="3.4" fill="currentColor" />
      <path
        d="M3.2 19.6 C3.6 15.4 6 13.4 9 13.4 C12 13.4 14.4 15.4 14.8 19.6 Z"
        fill="currentColor"
      />
      <path
        d="M16.6 6.8 C18 8 18 11 16.6 12.2"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M18.9 4.9 C21.2 6.9 21.2 12.1 18.9 14.1"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinecap="round"
      />
      {off && (
        <path
          d="M3.5 3.5 L20.5 20.5"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function HoldKey({
  className,
  still,
  names,
  radio,
  onArmed,
  children,
}: {
  className: string;
  still: boolean;
  names: { voiced: string; silent: string };
  /** The transmission spoken while the voiced side loads. */
  radio?: 'radioBaseline' | 'radioLaunch' | undefined;
  onArmed: (voiced: boolean) => void;
  children: ReactNode;
}) {
  const { setOn } = useNarratorPref();
  const [sided] = useState(() => narratorSupported());
  const pillRef = useRef<HTMLSpanElement | null>(null);
  const raf = useRef(0);
  const holding = useRef(false);
  const armedRef = useRef(false);
  const chargeNow = useRef(0);
  const voicedHold = useRef(false);
  const [live, setLive] = useState(false);

  /* 4a's lesson, still load-bearing: the preference must be READ before a
     segment can write it, and this key is the splash's only reader. */
  useEffect(() => {
    void loadPrefs();
  }, []);

  /* The charge is the OUTLINE waking up: border and glow ramp together on
     core's clock. Written straight to style — nothing per-frame through
     React — and through custom properties so the stylesheet stays the one
     place the pill's look lives. */
  const paint = (charge: number) => {
    const pill = pillRef.current;
    if (!pill) return;
    try {
      pill.style.setProperty('--charge', charge.toFixed(3));
    } catch {
      /* Silent, per docs/GUARDRAILS.md — a pill that cannot glow costs the
         glow, never the arming: the clocks below run regardless. */
    }
  };

  const arm = (voiced: boolean) => {
    if (armedRef.current) return;
    armedRef.current = true;
    holding.current = false;
    setLive(true);
    paint(1);
    /* The segment IS the answer (4a's law): written at the arm, awaited so
       the ordering cannot race the stored value, and only where a segment
       existed to choose. */
    void (async () => {
      if (sided) {
        await loadPrefs();
        setOn(voiced);
      }
      /* THE CHOICE RIDES THE CALLBACK (Adam, 2026-09-02, the sync brief):
         the pref write above is storage-async and React-late, and the
         count's "3" can beat it - so the side someone actually held travels
         with the arm, and the digits gate on IT, not on the round trip. */
      onArmed(voiced);
    })();
  };

  /* THE HOLD IS BACK (Adam, 2026-09-02: "require the hold down until they
     are full to activate so that someone can backoff if they are unsure").
     The fill still sweeps left to right on core's clock — the same load he
     asked to keep — but it only advances while the key is held, and an
     early release drains it fast: the backoff is relief, not a rewind.

     AND THE RADIO RIDES THE VOICED HOLD: "like the old NASA radio
     transmissions during launch" — the line is spoken through the
     narrator's engine while the fill loads, cut off by the backoff, and
     handed over to the counted digits at the arm. Holding Silent asked for
     silence, so Silent loads quietly. */
  const start = (voiced: boolean) => {
    if (armedRef.current || holding.current) return;
    /* Which SIDE is loading — the fill and the colour inversion are scoped
       to it in the stylesheet. */
    pillRef.current?.setAttribute('data-loading', voiced ? 'voiced' : 'silent');
    if (still) {
      arm(voiced);
      return;
    }
    holding.current = true;
    voicedHold.current = voiced;
    if (voiced && radio) cue(radio);
    cancelAnimationFrame(raf.current);
    const t0 = performance.now() - chargeNow.current * HOLD_MS;
    const tick = (now: number) => {
      if (!holding.current) return;
      const c = chargeAt(now - t0);
      chargeNow.current = c.charge;
      paint(c.charge);
      if (c.armed) {
        arm(voiced);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const release = () => {
    if (!holding.current) return;
    holding.current = false;
    /* The backoff, acknowledged: a voiced hold that got somewhere but NOT
       all the way stands down out loud; a glancing touch just goes quiet.
       An ARMED hold is neither — it fired, the count owns the audio, and
       the release is just a finger coming off a button that already lit.
       (Speaking here also costs the engine's first-touch stall, which the
       reduced-motion press-cost test bills to the door.) */
    if (armedRef.current) {
      /* nothing — the count is talking */
    } else if (voicedHold.current && chargeNow.current > 0.12) {
      cue('standby');
    } else {
      stopSpeaking();
    }
    cancelAnimationFrame(raf.current);
    const from = chargeNow.current;
    const t0 = performance.now();
    const tick = (now: number) => {
      if (holding.current || armedRef.current) return;
      const c = dischargeAt(from, now - t0);
      chargeNow.current = c;
      paint(c);
      if (c > 0) {
        raf.current = requestAnimationFrame(tick);
      } else {
        pillRef.current?.setAttribute('data-loading', '');
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const holdHandlers = (voiced: boolean) => ({
    onPointerDown: () => start(voiced),
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
    onKeyDown: (e: { key: string; repeat: boolean; preventDefault: () => void }) => {
      if (e.key === ' ' || e.key === 'Enter') {
        /* preventDefault keeps Space from scrolling AND from firing the
           native click on keyup — the click path is reduced motion's. */
        e.preventDefault();
        if (!e.repeat) start(voiced);
      }
    },
    onKeyUp: (e: { key: string }) => {
      if (e.key === ' ' || e.key === 'Enter') release();
    },
    onClick: () => {
      if (still) arm(voiced);
    },
  });

  if (!sided) {
    /* No speech engine, no segments — one quiet pill, 4a's collapse. */
    return (
      <span
        ref={pillRef}
        className={`splash-holdkey splash-split ${className}`}
        data-live={live ? 'on' : 'off'}
      >
        <button
          type="button"
          className="splash-door splash-split-main splash-split-main--only"
          {...holdHandlers(false)}
        >
          <span className="splash-split-fill" aria-hidden="true" />
          <span className="splash-split-label">{children}</span>
        </button>
      </span>
    );
  }

  return (
    <span
      ref={pillRef}
      className={`splash-holdkey splash-split ${className}`}
      data-live={live ? 'on' : 'off'}
    >
      <button
        type="button"
        className="splash-door splash-split-main splash-holdkey-side"
        data-side="voiced"
        /* The mock moved the "(narrated)" qualifier out of the visible label
           and into the caption below it; the accessible name keeps it, so
           the button still says which temperament it is to anyone who
           cannot see where the caption sits. Name begins with the words on
           the button — the voice-control law — and the caption is hidden
           from AT so nothing is read twice. */
        aria-label={names.voiced}
        {...holdHandlers(true)}
      >
        <span className="splash-split-fill" aria-hidden="true" />
        <span className="splash-split-label" aria-hidden="true">
          {children}
        </span>
        <span className="splash-split-sub" aria-hidden="true">
          {S.splashNarratedShort}
        </span>
      </button>
      <button
        type="button"
        className="splash-split-silent splash-holdkey-side"
        data-side="silent"
        aria-label={names.silent}
        title={names.silent}
        {...holdHandlers(false)}
      >
        <span className="splash-split-fill" aria-hidden="true" />
        <VoiceGlyph off />
        <span className="splash-split-caption">{S.splashSilentShort}</span>
      </button>
    </span>
  );
}

/** "2 minutes, 4 seconds" as "2m 04s" — specific to the second, which is
 *  the whole reassurance being bought (Adam, 2026-09-02: "the specificity
 *  makes it feel tried and not unknown"). */
function fmtEta(total: number): string {
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/** A random draw in [lo, hi] seconds, once per open — Adam's ranges. */
function drawEta(lo: number, hi: number): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function EtaChip({ seconds }: { seconds: number }) {
  return (
    <p className="splash-eta">
      <span className="splash-eta-label">{S.splashAvgLabel}</span>
      <span className="splash-eta-value">{fmtEta(seconds)}</span>
    </p>
  );
}

/** The baseline pill and its time chip. */
function BaselineKey({ onEnter, still }: { onEnter: (voiced: boolean) => void; still: boolean }) {
  const [eta] = useState(() => drawEta(124, 192));
  return (
    <div className="splash-basekey">
      <HoldKey
        className="splash-basekey-key"
        still={still}
        names={{ voiced: S.splashBaseline, silent: S.splashBaselineSilent }}
        radio={'radioBaseline'}
        onArmed={onEnter}
      >
        {(() => {
          /* The break, re-derived for the rename (Adam, 2026-09-02:
             "INITIATE PRE-LAUNCH"): first word up top, the rest below -
             still from the one string, so a rewording reflows instead of
             splitting a stale pair. */
          const words = S.splashBaselineLabel.split(' ');
          return (
            <>
              {words[0]}{' '}
              <br />
              {words.slice(1).join(' ')}
            </>
          );
        })()}
      </HoldKey>
      <EtaChip seconds={eta} />
    </div>
  );
}

/**
 * V2.9 slice 4b — THE LAUNCH DOOR, AND THE CABLE IT IS PLUGGED INTO.
 *
 * Adam: "Below the Launch Button when dormant, should look like a simple
 * control panel button in the modern theme and aesthetic of the site. It
 * should have a 'cable' that is attached to it that is glowing faintly. When
 * the launch button is hit, the animation is a pulse coming through the wire,
 * into the button and then the fade out and rocket sequence."
 *
 * ── THE HOLD IS ACCEPTED BEFORE THE LIGHT MOVES ───────────────────────────
 * V2.9 slice 4 hold: the key is a circular HoldKey now — charging it is the
 * press. Arming fires the pulse, the pulse's arrival starts the countdown
 * and the flight, exactly the 4b seam with a longer handshake in front.
 *
 * ── NO CLOCK UNDER REDUCED MOTION ─────────────────────────────────────────
 * Not a faster pulse, not a still one: the door hands over immediately, which
 * is what this screen already does everywhere else. The cable stays, drawn and
 * lit — it is scenery, and scenery is not motion.
 */
function LaunchDoor({ onLaunch, still }: { onLaunch: (voiced: boolean) => void; still: boolean }) {
  const [eta] = useState(() => drawEta(758, 1435));
  const keyRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const cableRef = useRef<SVGPathElement | null>(null);
  const lightRef = useRef<SVGPathElement | null>(null);
  const firing = useRef(false);

  /* THE CABLE RUNS TO THE BOTTOM-RIGHT CORNER (Adam, 2026-09-01: "The
     squiggly below should flow towards the bottom right corner but go all
     the way to the corner"). The corner is a fact about the panel, not about
     this drawing, so the path is built from a measurement: key to corner,
     with two bends on the way. Measured at rest, before the paint loop
     applies any transform — the same moment the reveal measures its own
     boxes — and compensated by the offset the launch part settles at, which
     comes from core rather than being typed here twice.

     The tail FADES rather than stopping (his own alternative, pre-approved:
     "we can fade to black so it looks purposeful") — a gradient to nothing
     over the dark field, so wherever the drawn line ends it reads as running
     on into the dark rather than as being cut. The JSX carries a short
     fallback path: where measurement fails, the wire is merely short, and
     the pulse still has a length to walk. */
  useLayoutEffect(() => {
    const key = keyRef.current;
    const svg = svgRef.current;
    const cable = cableRef.current;
    const light = lightRef.current;
    if (!key || !svg || !cable || !light) return;
    const box = key.getBoundingClientRect();
    /* The FINAL rest, not the arrival: the simplification lifts the keys
       184px after everything else has gone, and the corner is where the
       person lingers — so the wire is measured for where the key ENDS UP.
       Early on it overshoots below the frame, which the tail-fade makes
       purposeful. */
    const settle = partAt(REVEAL_SIMPLE, 'launch');
    const startX = box.left + box.width / 2 + settle.x;
    const startY = box.bottom + settle.y;
    const w = window.innerWidth - startX;
    const h = window.innerHeight - startY;
    /* 24, was 40: on a short panel the corner run is a short hop, and a
       short hop drawn beats a fallback squiggle pretending nothing
       changed. Below ~24px there is genuinely nothing to draw through. */
    if (w < 40 || h < 24) return;
    const mx = w / 2;
    const my = h / 2;
    const d =
      `M 0 0 C ${(-mx * 0.3).toFixed(1)} ${(h * 0.28).toFixed(1)}, ` +
      `${(mx * 1.3).toFixed(1)} ${(h * 0.22).toFixed(1)}, ${mx.toFixed(1)} ${my.toFixed(1)} ` +
      `S ${(w * 0.7).toFixed(1)} ${(h * 0.78).toFixed(1)}, ${w.toFixed(1)} ${h.toFixed(1)}`;
    svg.style.width = `${w}px`;
    svg.style.height = `${h}px`;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    cable.setAttribute('d', d);
    light.setAttribute('d', d);
  }, []);
  /* WHETHER THERE IS A LOOP TO CARRY THE LIGHT. The press used to decide by
     re-testing the effect's own guards from outside it — `still`, and whether
     the path element exists — which is a copy of a condition rather than the
     condition. Two ways it went wrong: the effect also bails when the cable
     reports no length, and a press in that state armed a pulse nothing was
     running, so the door never opened at all; and a press that arrived while
     the effect was between a cleanup and its next run took the instant branch
     and skipped the pulse, which is the flake this replaces. One flag, set by
     the loop that does the work. */
  const wired = useRef(false);

  /* The wire's slow breath, and then the light travelling it. One loop for
     both: they are the same wire and a second clock could only disagree with
     the first. */
  useEffect(() => {
    if (still) return;
    const path = lightRef.current;
    const cable = cableRef.current;
    if (!path || !cable) return;
    const length = typeof cable.getTotalLength === 'function' ? cable.getTotalLength() : 0;
    if (!length) return;
    path.style.strokeDasharray = `${length * 0.16} ${length}`;

    wired.current = true;
    let raf = 0;
    const t0 = performance.now();
    let firedAt = 0;
    const tick = (now: number) => {
      try {
        cable.style.opacity = idleGlowAt(now - t0).toFixed(3);
        if (firing.current) {
          if (!firedAt) firedAt = now;
          const pulse = pulseAt(now - firedAt);
          path.style.opacity = '1';
          /* Drawn from the far end INTO the button: the dash walks the path
             backwards, so travelled 1 is the light sitting where the cable
             meets the door. */
          path.style.strokeDashoffset = `${length * (1 - pulse.travelled)}`;
          if (pulse.arrived) {
            firing.current = false;
            onLaunch(firedVoiced.current);
            return;
          }
        }
      } catch {
        /* Silent, per docs/GUARDRAILS.md. A cable that cannot draw itself
           costs the animation and never the door: the press has already been
           taken, and `onLaunch` is called on the same frame the light lands. */
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      wired.current = false;
      cancelAnimationFrame(raf);
    };
  }, [still, onLaunch]);

  /* The side that armed, held across the pulse's flight - the light lands
     a beat after the choice, and the choice must land with it. */
  const firedVoiced = useRef(false);
  const armed = (voiced: boolean) => {
    firedVoiced.current = voiced;
    if (!wired.current) {
      // Nothing is running to carry the light. Open the door.
      onLaunch(voiced);
      return;
    }
    firing.current = true;
  };

  return (
    <div className="splash-launch" ref={keyRef}>
      {/* The cable. Decoration, and says so — it carries no instruction the
          button does not, and the door works with it painted or not. The
          layout effect above rebuilds the geometry to reach the corner; this
          markup is the degraded short wire it starts from. */}
      <svg
        ref={svgRef}
        className="splash-cable"
        viewBox="0 0 200 200"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {/* The tail's fade into the dark, in the wire's own colour. The
              gradient runs the box's diagonal — the same direction the wire
              travels — and the LIGHT does not use it: a pulse arriving out
              of the faded dark is power coming in from beyond the frame. */}
          <linearGradient id="wb-cable-fade" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--globe-node-2-mid)' }} />
            <stop offset="0.72" style={{ stopColor: 'var(--globe-node-2-mid)' }} />
            <stop offset="1" style={{ stopColor: 'var(--globe-node-2-mid)', stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path
          ref={cableRef}
          className="splash-cable-line"
          d="M 0 0 C -20 56, 130 44, 100 100 S 140 156, 200 200"
          fill="none"
        />
        <path
          ref={lightRef}
          className="splash-cable-light"
          d="M 0 0 C -20 56, 130 44, 100 100 S 140 156, 200 200"
          fill="none"
        />
      </svg>
      <HoldKey
        className="splash-launch-key"
        still={still}
        names={{ voiced: S.splashStraight, silent: S.splashStraightSilent }}
        radio={'radioLaunch'}
        onArmed={armed}
      >
        {(() => {
          /* TWO ROWS, mirroring INITIATE PRE-LAUNCH (Adam, 2026-09-02):
             first word over the rest, derived from the one string. */
          const words = S.splashStraightLabel.split(' ');
          return (
            <>
              {words[0]}{' '}
              <br />
              {words.slice(1).join(' ')}
            </>
          );
        })()}
      </HoldKey>
      <EtaChip seconds={eta} />
    </div>
  );
}

export function SplashReveal({ elapsed, still, onBaseline, onStraight }: SplashRevealProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const partRefs = useRef<Partial<Record<RevealPart, HTMLDivElement | null>>>({});
  const pathRef = useRef<SVGPathElement | null>(null);
  const path2Ref = useRef<SVGPathElement | null>(null);
  /* The button-region squiggles retired (Adam, 2026-09-02: "Get rid of
     the little squigglies in the loading sequence above and around the
     buttons") - what stands in the region now is the grown pair below. */
  const orUpRef = useRef<SVGPathElement | null>(null);
  const orDownRef = useRef<SVGPathElement | null>(null);
  const orGradRef = useRef<SVGLinearGradientElement | null>(null);
  const slotRef = useRef<HTMLSpanElement | null>(null);
  const rolodexRef = useRef<HTMLParagraphElement | null>(null);
  const restRef = useRef<Partial<Record<RevealPart, Box>>>({});

  /* Only what changes a handful of times lives in React. */
  const [count, setCount] = useState(still ? countAt(REVEAL_SETTLED) : COUNT_FROM);
  /* Which phrase is in the slot. It starts on the TRUE one in the still
     version, so the false phrases are never on screen for even the one frame
     between mount and the first paint — this is the claim the whole product
     rests on, and "briefly wrong" is not a state it may be in. Four values
     over five seconds otherwise — React's business. Where it is tipped to and how far it is struck are sixty values
     a second, and go straight to style below. */
  const [claim, setClaim] = useState(still ? CLAIM_TRUE : 0);

  /* THE RESTING BOXES, measured once after layout and never again. Measuring
     per frame would be a forced reflow sixty times a second to learn something
     that does not change — the parts MOVE by transform, which does not alter
     layout at all. */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    /* The turn's length, handed to the stylesheet from the same constant that
       counts the turns. It goes through the DOM rather than through a React
       style prop for the same reason every other number here does: this is a
       fact the paint needs, not state. */
    root.style.setProperty('--rolodex-turn', `${ROLODEX_TURN_MS}ms`);
    const frame = root.getBoundingClientRect();
    const next: Partial<Record<RevealPart, Box>> = {};
    for (const part of PARTS) {
      const el = partRefs.current[part];
      if (!el) continue;
      const b = el.getBoundingClientRect();
      next[part] = {
        cx: b.left - frame.left + b.width / 2,
        top: b.top - frame.top,
        bottom: b.bottom - frame.top,
      };
      const key = el.querySelector('.splash-holdkey');
      if (key) {
        const kb = key.getBoundingClientRect();
        next[part]!.key = {
          cx: kb.left - frame.left + kb.width / 2,
          cy: kb.top - frame.top + kb.height / 2,
          w: kb.width,
          h: kb.height,
        };
      }
      const etaEl = el.querySelector('.splash-eta');
      if (etaEl) {
        const eb = etaEl.getBoundingClientRect();
        next[part]!.eta = { bottom: eb.bottom - frame.top };
      }
      const orEl = el.querySelector('.splash-or');
      if (orEl) {
        const ob = orEl.getBoundingClientRect();
        next[part]!.or = {
          cx: ob.left - frame.left + ob.width / 2,
          top: ob.top - frame.top,
          bottom: ob.bottom - frame.top,
        };
      }
    }
    restRef.current = next;
  }, []);

  useEffect(() => {
    const paint = (t: number) => {
      for (const part of PARTS) {
        const el = partRefs.current[part];
        if (!el) continue;
        const at = partAt(t, part);
        el.style.opacity = at.opacity.toFixed(3);
        el.style.transform = `translate3d(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px, 0)`;
        // Absent parts must not be reachable — an invisible button is still a
        // tab stop and still takes a click.
        el.style.pointerEvents = at.opacity > 0.98 ? 'auto' : 'none';
        el.setAttribute('aria-hidden', at.opacity < 0.05 ? 'true' : 'false');
      }

      /* THE TWO CONNECTORS, each from the bottom of one section to the top of
         the next, both offset by wherever the spine has those parts right now.
         A gentle S rather than a straight line: a curve reads as a route and a
         straight line reads as a rule — and with one section leaning left and
         the next leaning right, the S is what the lean is FOR.

         Written once and run twice rather than copied: the second link is the
         same geometry between a different pair, and two copies of this would
         be two places to fix the day the curve changes. */
      const drawLink = (
        path: SVGPathElement | null,
        fromPart: RevealPart,
        toPart: RevealPart,
        /* How SQUIGGLY (Adam, 2026-09-01: "a squiggly line"). Zero keeps the
           original gentle S the sections wear; the links into the actions
           bend twice, because a route into a button is allowed to be having
           more fun than a route between two paragraphs. */
        wiggle = 0,
      ) => {
        const from = restRef.current[fromPart];
        const to = restRef.current[toPart];
        if (!path || !from || !to) return;
        const link = linkAt(t, toPart);
        const a = partAt(t, fromPart);
        const b = partAt(t, toPart);
        let d: string;
        {

          const x1 = from.cx + a.x;
          const y1 = from.bottom + a.y + 6;
          const x2 = to.cx + b.x;
          const y2 = to.top + b.y - 6;
          const mid = (y1 + y2) / 2;
          d = wiggle
            ? /* Two bends: out one way, through the middle, in from the other —
                 the S command mirrors the last control point, which is what
                 keeps the second bend smooth however far apart the ends are. */
              `M ${x1} ${y1} C ${x1 - wiggle} ${y1 + (y2 - y1) * 0.3}, ` +
              `${(x1 + x2) / 2 + wiggle} ${mid - (y2 - y1) * 0.12}, ${(x1 + x2) / 2} ${mid} ` +
              `S ${x2 + wiggle} ${y2 - (y2 - y1) * 0.3}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
        }
        path.setAttribute('d', d);
        /* THE DRAW-ON IS OPTIONAL, THE PATH IS NOT. `getTotalLength` is SVG
           geometry, and not every environment implements it — jsdom does not,
           and an unguarded call took the WHOLE reveal down with it there: the
           lockup, the sections and the doors all vanished because a decorative
           line could not measure itself.

           That is the degradation law with a real example attached. Where the
           measurement exists the path draws itself on; where it does not, it
           simply appears. Nothing else on the screen is allowed to depend on
           a connector. */
        if (typeof path.getTotalLength === 'function') {
          const len = path.getTotalLength();
          path.style.strokeDasharray = `${len}`;
          path.style.strokeDashoffset = `${len * (1 - link.drawn)}`;
        }
        path.style.opacity = link.idle ? '0' : link.fade.toFixed(3);
      };
      drawLink(pathRef.current, 'tagline', 'time');
      drawLink(path2Ref.current, 'time', 'privacy');
      /* Both action links ride the CENTRE LINE now (the mock pass, Adam,
         2026-09-02): the route from the promise wiggles left and right on
         its way down into the top pill, and a short bow joins the pills
         through the "or". The colour still hands itself forward — fuchsia
         to blue, blue to aqua — which is what makes five separate things
         one route. */
      /* THE FINAL ACTION (Adam, 2026-09-02): the region's old squiggles are
         gone; in their place, once everything has settled, a short squiggle
         GROWS from OR outward to each pill. Both start at the word, so the
         growth radiates from the fork itself - and both ride one shared
         userSpaceOnUse gradient held symmetric around OR's own centre, so
         the purple-to-green hand-off crosses exactly at the word
         (`orPairAt`, core). Padding 6-8px at every landfall. */
      {
        const base = restRef.current['baseline'];
        const part = restRef.current['launch'];
        const up = orUpRef.current;
        const down = orDownRef.current;
        const grad = orGradRef.current;
        if (up && down && base?.key && part?.or && part.key) {
          const a = partAt(t, 'baseline');
          const b = partAt(t, 'launch');
          const pair = orPairAt(t);
          const orX = part.or.cx + b.x;
          const orCy = (part.or.top + part.or.bottom) / 2 + b.y;
          const seg = (x1: number, ya: number, x2: number, yb: number) => {
            const m = (ya + yb) / 2;
            return (
              `M ${x1.toFixed(1)} ${ya.toFixed(1)} C ${(x1 - 9).toFixed(1)} ${m.toFixed(1)}, ` +
              `${(x2 + 9).toFixed(1)} ${m.toFixed(1)}, ${x2.toFixed(1)} ${yb.toFixed(1)}`
            );
          };
          const upperFoot = base.eta
            ? base.eta.bottom + 8
            : base.key.cy + base.key.h / 2 + 14;
          up.setAttribute('d', seg(orX, part.or.top + b.y - 8, base.key.cx + a.x, upperFoot + a.y));
          down.setAttribute(
            'd',
            seg(orX, part.or.bottom + b.y + 8, part.key.cx + b.x, part.key.cy + b.y - part.key.h / 2 - 14),
          );
          if (grad) {
            const yTop = base.key.cy + a.y + base.key.h / 2;
            const yBot = part.key.cy + b.y - part.key.h / 2;
            const reach = Math.max(orCy - yTop, yBot - orCy, 1);
            grad.setAttribute('y1', (orCy - reach).toFixed(1));
            grad.setAttribute('y2', (orCy + reach).toFixed(1));
          }
          for (const path of [up, down]) {
            if (typeof path.getTotalLength === 'function') {
              const len = path.getTotalLength();
              path.style.strokeDasharray = `${len}`;
              path.style.strokeDashoffset = `${len * (1 - pair.drawn)}`;
            }
            path.style.opacity = pair.drawn > 0.01 ? '1' : '0';
          }
        }
      }

      const c = countAt(t);
      setCount((was) => (was === c ? was : c));
      /* THE TURN IS AN ATTRIBUTE, NOT A REACT KEY.
         It was `key={turn}`, which remounts the element and replays its CSS
         animation — and that was wrong twice over. `rolodexAt` reports turn 0
         both BEFORE the first turn and DURING it, so the key never changed
         when the first turn was due: what actually played was the mount, at
         reveal zero, with the section still invisible. Two of the three turns
         reached the screen, and the one that did not was the first.

         Keyed to `turning` instead, the animation is applied exactly while
         core says a turn is happening and removed when it is not. It cannot
         play at a moment core did not ask for, because there is no moment
         outside `turning` when the declaration exists. */
      const r = rolodexAt(t);
      const rolodex = rolodexRef.current;
      const turning = r.turning ? 'on' : 'off';
      if (rolodex && rolodex.dataset.turning !== turning) rolodex.dataset.turning = turning;

      /* The elimination. Which phrase is showing goes through React four
         times; how far it is tipped and how far it is struck are written
         straight to the slot, sixty times a second. Both come from the one
         call, so they cannot disagree about which phrase is being struck. */
      const w = claimWordAt(t);
      setClaim((was) => (was === w.index ? was : w.index));
      const slot = slotRef.current;
      if (slot) {
        slot.style.transform = `perspective(340px) rotateX(${w.rotate.toFixed(1)}deg)`;
        slot.style.opacity = w.opacity.toFixed(3);
        slot.style.setProperty('--strike', w.strike.toFixed(3));
        slot.style.setProperty('--underline', w.underline.toFixed(3));
      }
    };

    const safePaint = (t: number) => {
      /* A reveal that throws is a black screen with two invisible buttons on
         it. Nothing painted here is load-bearing — every word is in the DOM
         already and only its position and opacity come from this — so a
         failure costs the animation and never the screen. */
      try {
        paint(t);
      } catch {
        /* Silent, per docs/GUARDRAILS.md: there is no state in which this
           product is broken, only states in which it is doing less. */
      }
    };

    if (still) {
      /* Not one frame scheduled. The settled frame IS the still version —
         core's table gives it for free rather than needing a second layout.

         PAINTED AT `REVEAL_REST`, NOT `REVEAL_SETTLED`. The parts are identical
         at both (they stop at the earlier one and never move again), but the
         SECTIONS are not: at REVEAL_SETTLED the elimination is still on its
         first wrong answer, so a still frame drawn there would say "Everything
         leaves your browser" and leave it there. The still version has to be
         the END of the argument, not a photograph taken during it. */
      safePaint(REVEAL_REST);
      return;
    }
    let raf = 0;
    const tick = () => {
      safePaint(elapsed());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still, elapsed]);

  const hold = (part: RevealPart) => (el: HTMLDivElement | null) => {
    partRefs.current[part] = el;
  };

  return (
    <div className="splashreveal" ref={rootRef}>
      {/* Decoration, and says so: the route between two sections carries no
          information a reader does not already have from the sections.

          AND SO IT IS NOT IN THE STILL VERSION. Its whole job is to lead the
          eye INTO something arriving — it draws itself just ahead of the
          section it points at. Where nothing arrives because everything is
          already there, it points at nothing, and what is left on a settled
          screen is a small bright squiggle between two paragraphs. Nothing is
          lost by dropping it: the guardrail is that the still version keeps
          the INSTRUCTION, and this line never carried one. */}
      {!still && (
        <svg className="splashreveal-links" aria-hidden="true" focusable="false">
          <defs>
            {/* The hand-offs, as gradients this time: the route into the
                baseline arrives in the privacy section's fuchsia and leaves
                in the heading's blue; the route into the launch key arrives
                in that blue and leaves in the aqua the count wears. Stops
                carry tokens through `style` because presentation attributes
                do not resolve `var()`. */}
            <linearGradient id="wb-link-baseline" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--splash-link)' }} />
              <stop offset="1" style={{ stopColor: 'var(--splash-link-end)' }} />
            </linearGradient>
            <linearGradient id="wb-link-launch" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--splash-link-end)' }} />
              <stop offset="1" style={{ stopColor: 'var(--globe-node-2-solid)' }} />
            </linearGradient>
          </defs>
          {/* Each names what it leads to, and the second one is a different
              colour for it: the first path belongs to the section above and is
              drawn in its cyan, the second hands over to the fuchsia the words
              below it start in. The change of colour IS the hand-off. */}
          <path ref={pathRef} className="splashreveal-path" data-link="time" fill="none" />
          <path ref={path2Ref} className="splashreveal-path" data-link="privacy" fill="none" />
          {/* The grown pair's shared gradient - vertical, re-anchored every
              frame so its midpoint IS the word OR's centre. */}
          <linearGradient
            ref={orGradRef}
            id="wb-or-grad"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0" style={{ stopColor: 'var(--splash-link-end)' }} />
            <stop offset="1" style={{ stopColor: 'var(--globe-node-2-solid)' }} />
          </linearGradient>
          <path ref={orUpRef} className="splashreveal-orlink" fill="none" />
          <path ref={orDownRef} className="splashreveal-orlink" fill="none" />
        </svg>
      )}

      <div className="splashreveal-part" data-part="lockup" ref={hold('lockup')}>
        <BrandMark size={104} spin="orbit" />
        <p className="splash-wordmark">{S.appName}</p>
      </div>

      <div className="splashreveal-part" data-part="tagline" ref={hold('tagline')}>
        <p className="splash-tagline">
          {taglineLines(S.splashTagline).map((l, i) => (
            <span key={l} className="splash-tagline-line">
              {i > 0 ? ' ' : ''}
              {richTagline(l)}
            </span>
          ))}
        </p>
      </div>

      <div className="splashreveal-part" data-part="time" ref={hold('time')}>
        <p className="splashreveal-cost">
          {S.splashCostLead}{' '}
          {/* `tabular-nums` in the stylesheet: without it the line jogs
              sideways every time a digit changes width, which on a counter
              running thirty numbers is the only thing anybody sees. */}
          <span className="splashreveal-count">{count}</span> {S.splashCostUnit}
        </p>
        {/* The rolodex. The paint loop marks it while core says it is turning;
            the stylesheet hangs the animation off that mark. */}
        <p className="splashreveal-rolodex" data-turning="off" ref={rolodexRef}>
          {S.splashCostSub}
        </p>
      </div>

      {/* THE SECOND SECTION, built like the first: a bold line with two words
          picked out, and under it a quiet line with a device that runs and
          then stops.

          IT IS ONE SENTENCE THE PERSON WATCHES BE ARRIVED AT. Three wrong
          answers go up and are struck out, and the true one is what is left
          standing — which is a different kind of promise from the same words
          printed on a screen.

          AND THE FALSE ONES ARE NEVER SAID OUT LOUD. Everything in the slot is
          decoration of a claim, so the slot is hidden from assistive tech and
          the claim itself is stated once, plainly, in `.app-sr` beside it. A
          screen reader that arrived mid-animation would otherwise read
          "Everything leaves your browser" — the exact opposite of the
          promise, in the one place the product cannot afford to be misread. */}
      <div className="splashreveal-part" data-part="privacy" ref={hold('privacy')}>
        <p className="splashreveal-own">
          {S.splashOwnLead}{' '}
          {/* THE FLAG IS GONE (Adam, 2026-09-01). It was a chequered flag on
              the word "finish", and before that a mark floating above the
              line. What replaced it is the colour: the path into this section
              is fuchsia, these words start in that same fuchsia and travel to
              a purple, and the line under the answer below is fuchsia again.
              A drawn icon said "finish line" once, in one place; the through-
              line says it three times down the screen without a second idea
              on the field. */}
          <span className="splashreveal-span">{S.splashOwnSpan}</span>
        </p>

        <p className="splashreveal-leave" aria-hidden="true">
          {/* EVERY PHRASE IS IN THE DOM, ALL THE TIME, one on top of another in
              a single grid cell — so the slot is as wide as the widest of them
              and the tail never moves as they swap. Measuring the widest and
              pinning it in JavaScript would be the same answer, computed less
              reliably and re-computed on every font change. */}
          <span className="splashreveal-slot" ref={slotRef}>
            {S.splashLeaveAnswers.map((answer, i) => (
              <span
                key={answer.amount}
                className="splashreveal-phrase"
                data-on={i === claim ? 'on' : 'off'}
              >
                {/* The amount is its own span because the last one is
                    underlined and the verb after it is not. */}
                <span className="splashreveal-amount">{answer.amount}</span> {answer.verb}
              </span>
            ))}
          </span>{' '}
          {S.splashLeaveTail}
        </p>
        <p className="app-sr">
          {S.splashLeaveAnswers[CLAIM_TRUE]?.amount} {S.splashLeaveAnswers[CLAIM_TRUE]?.verb}{' '}
          {S.splashLeaveTail}
        </p>
      </div>

      {/* THE ACTIONS ARE TWO PARTS NOW, in the sections' own pattern (Adam,
          2026-09-01): each arrives on its own beat and settles with its own
          lean. Without a baseline to offer there is no baseline part at all —
          the links that would point at it simply find no box and draw
          nothing, which is the degradation law doing layout. */}
      {onBaseline && (
        <div className="splashreveal-part" data-part="baseline" ref={hold('baseline')}>
          <BaselineKey onEnter={onBaseline} still={still} />
        </div>
      )}
      <div className="splashreveal-part" data-part="launch" ref={hold('launch')}>
        {/* The fork said out loud, the mock's own way: one small word
            between the two pills, with the connecting squiggle bowing
            around it. */}
        <span className="splash-or">{S.splashOr}</span>
        <LaunchDoor onLaunch={onStraight} still={still} />
      </div>
      {/* THE PROMISE, at the foot of the loading page (Adam, 2026-09-02:
          "Add the light gray 'Saved on this device Nothing leaves'
          disclaimer down on the bottom of the loading page"). The same two
          spans every flow screen carries (flow-save), pinned to the panel's
          bottom edge for the whole dark sequence — quiet furniture, not a
          part, so it neither rises nor simplifies with the choreography. */}
      <p className="splashreveal-disclaimer" aria-hidden="true">
        <span>{S.savedNote}</span>
        <span>{S.privacyNote}</span>
      </p>
    </div>
  );
}
