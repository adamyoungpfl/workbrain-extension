import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrandMark } from '../components';
import {
  COUNT_FROM,
  REVEAL_SETTLED,
  ROLODEX_TURN_MS,
  countAt,
  linkAt,
  partAt,
  privacyLineAt,
  rolodexAt,
} from '../../core/splash/reveal';
import type { RevealPart } from '../../core/splash/reveal';
import { S } from '../strings';
import { taglineLines } from './Splash';
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

const PARTS: RevealPart[] = ['lockup', 'tagline', 'time', 'privacy', 'doors'];

interface Box {
  cx: number;
  top: number;
  bottom: number;
}

export interface SplashRevealProps {
  /** Seconds since the reveal began. Under reduced motion the caller passes
   *  the settled time once and never again. */
  elapsed: () => number;
  /** No clock at all: paint the settled frame and schedule nothing. */
  still: boolean;
  onBaseline?: (() => void) | undefined;
  onStraight: () => void;
  /** The read-aloud door, rendered by the caller so this file holds no prefs. */
  audio: React.ReactNode;
}

export function SplashReveal({ elapsed, still, onBaseline, onStraight, audio }: SplashRevealProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const partRefs = useRef<Partial<Record<RevealPart, HTMLDivElement | null>>>({});
  const pathRef = useRef<SVGPathElement | null>(null);
  const restRef = useRef<Partial<Record<RevealPart, Box>>>({});

  /* Only what changes a handful of times lives in React. */
  const [count, setCount] = useState(still ? countAt(REVEAL_SETTLED) : COUNT_FROM);
  const [turn, setTurn] = useState(0);
  const [line, setLine] = useState(0);

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

      /* The path, from the bottom of the tagline to the top of the time
         section, both offset by wherever the spine has those parts right now.
         A gentle S rather than a straight line: a curve reads as a route and a
         straight line reads as a rule. */
      const path = pathRef.current;
      const from = restRef.current.tagline;
      const to = restRef.current.time;
      if (path && from && to) {
        const link = linkAt(t, 'time');
        const a = partAt(t, 'tagline');
        const b = partAt(t, 'time');
        const x1 = from.cx + a.x;
        const y1 = from.bottom + a.y + 6;
        const x2 = to.cx + b.x;
        const y2 = to.top + b.y - 6;
        const mid = (y1 + y2) / 2;
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
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
        path.style.opacity = link.idle ? '0' : '1';
      }

      const c = countAt(t);
      setCount((was) => (was === c ? was : c));
      const r = rolodexAt(t);
      setTurn((was) => (was === r.turn ? was : r.turn));
      const l = privacyLineAt(t);
      setLine((was) => (was === l.index ? was : l.index));
      const el = partRefs.current.privacy;
      if (el) el.style.setProperty('--line-o', l.opacity.toFixed(3));
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
      // Not one frame scheduled. The settled frame IS the still version —
      // core's table gives it for free rather than needing a second layout.
      safePaint(REVEAL_SETTLED);
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
          <path ref={pathRef} className="splashreveal-path" fill="none" />
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
              {l}
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
        {/* The rolodex. `key` on the turn restarts the animation — without it
            React keeps the element and it plays once, ever. */}
        <p className="splashreveal-rolodex" key={turn}>
          {S.splashCostSub}
        </p>
      </div>

      {/* THE TWO CLAIMS: one slot taking turns, or both at once when nothing
          may move. Alternating is how two sentences fit in the room for one,
          and it is motion doing the fitting — so under reduced motion the
          still frame would carry the first claim and quietly drop the second.
          Stacked, both are kept. The section is a few pixels taller and says
          everything it was always meant to say. */}
      <div
        className="splashreveal-part"
        data-part="privacy"
        data-still={still ? 'on' : 'off'}
        ref={hold('privacy')}
      >
        {still ? (
          S.splashWhatLines.map((claim) => (
            <p key={claim} className="splashreveal-line">
              {claim}
            </p>
          ))
        ) : (
          <p className="splashreveal-line">{S.splashWhatLines[line]}</p>
        )}
      </div>

      <div className="splashreveal-part" data-part="doors" ref={hold('doors')}>
        {audio}
        <div className="splash-choice">
          {onBaseline && (
            <button type="button" className="splash-door" onClick={onBaseline}>
              {S.splashBaseline}
            </button>
          )}
          <button type="button" className="splash-door" onClick={onStraight}>
            {S.splashStraight}
          </button>
        </div>
      </div>
    </div>
  );
}
