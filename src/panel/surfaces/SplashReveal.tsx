import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BrandMark } from '../components';
import { NARRATOR_ICON } from '../components/NarratorToggle';
import { narratorSupported } from '../voice/speech';
import { loadPrefs, useNarratorPref } from '../voice/prefs';
import {
  CLAIM_TRUE,
  COUNT_FROM,
  REVEAL_REST,
  REVEAL_SETTLED,
  ROLODEX_TURN_MS,
  claimWordAt,
  countAt,
  linkAt,
  partAt,
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
}

/**
 * V2.9 slice 4a — THE BASELINE DOOR IS TWO DOORS THAT READ AS ONE OBJECT.
 *
 * Adam: "let's make it like a 2 button cluster displaying like a single
 * object… feel loosely like the are choosing the narrated or silent baseline
 * and that the narrated is the heavy lean, but optional. Like choosing which
 * door you enter the rocket from."
 *
 * The lean is carried by WEIGHT, not by wording: the narrated half is the
 * filled one with the mark's own gradient on it, the silent half is a quiet
 * strip under the same border. Both go to the same place. Which one is pressed
 * is how the narrator preference gets set, so nobody is asked a second
 * question to answer the one they just answered.
 *
 * ── WHERE THERE IS NO SPEECH ENGINE, THERE IS NO CHOICE ───────────────────
 * The cluster collapses to the single door it used to be. `NarratorToggle`
 * already works this way — "not a disabled button, not a note explaining
 * itself" — and offering somebody a narrated door their device cannot open
 * would be worse than the toggle this replaces. The support answer is decided
 * during the first render for the same reason it is there: a control that
 * appears one frame late moves everything under it.
 */
function BaselineCluster({ onEnter }: { onEnter: () => void }) {
  const { setOn } = useNarratorPref();
  const [choosable] = useState(() => narratorSupported());

  /* THE PREFERENCE HAS TO BE READ BEFORE IT CAN BE WRITTEN, and until this
     door existed something else always had. `setPref` returns early when the
     value it is handed matches the one in memory — so with nothing having
     loaded the stored answer, memory holds the default `false`, and somebody
     who had the narrator ON and pressed "Set it silently" wrote NOTHING and
     got the voice anyway. It was the read-aloud toggle that used to load them,
     and this door replaced it.

     Loaded on mount so the value is warm, AND awaited in the press so the
     ordering cannot race: the load resolves in a millisecond and the doors are
     not pressable for five seconds, but "in practice it has resolved" is not
     the same as "it has resolved". */
  useEffect(() => {
    void loadPrefs();
  }, []);

  const choose = async (on: boolean) => {
    await loadPrefs();
    setOn(on);
    onEnter();
  };

  if (!choosable) {
    return (
      <button type="button" className="splash-door" onClick={onEnter}>
        {S.splashBaseline}
      </button>
    );
  }

  /* `role="group"` and not a radiogroup: these are two doors, not two settings
     with a submit after them. Pressing one is both the answer and the way
     through, which is what "which door you enter from" means.

     THE GROUP'S LABEL ECHOES ITS FIRST BUTTON, and that is the cheaper of two
     costs. Without it, "Set it silently" is announced with nothing to say what
     is being set. With it, the loud door is read as "Set Your AI Baseline
     group, Set Your AI Baseline button" — repetitive, and heard once. The
     alternative was an `aria-label` on the quiet door carrying the context,
     which would make its accessible name differ from the words on it: a voice-
     control user says what they see, and a name that does not match the label
     is a control they cannot ask for. */
  return (
    <div className="splash-cluster" role="group" aria-label={S.splashBaseline}>
      <button
        type="button"
        className="splash-door splash-cluster-loud"
        onClick={() => void choose(true)}
      >
        {S.splashBaseline}
        <span className="splash-cluster-icon">{NARRATOR_ICON}</span>
      </button>
      <button
        type="button"
        className="splash-cluster-quiet"
        onClick={() => void choose(false)}
      >
        {S.splashBaselineSilent}
      </button>
    </div>
  );
}

export function SplashReveal({ elapsed, still, onBaseline, onStraight }: SplashRevealProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const partRefs = useRef<Partial<Record<RevealPart, HTMLDivElement | null>>>({});
  const pathRef = useRef<SVGPathElement | null>(null);
  const path2Ref = useRef<SVGPathElement | null>(null);
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
      ) => {
        const from = restRef.current[fromPart];
        const to = restRef.current[toPart];
        if (!path || !from || !to) return;
        const link = linkAt(t, toPart);
        const a = partAt(t, fromPart);
        const b = partAt(t, toPart);
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
      };
      drawLink(pathRef.current, 'tagline', 'time');
      drawLink(path2Ref.current, 'time', 'privacy');

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
          {/* Each names what it leads to, and the second one is a different
              colour for it: the first path belongs to the section above and is
              drawn in its cyan, the second hands over to the fuchsia the words
              below it start in. The change of colour IS the hand-off. */}
          <path ref={pathRef} className="splashreveal-path" data-link="time" fill="none" />
          <path ref={path2Ref} className="splashreveal-path" data-link="privacy" fill="none" />
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

      <div className="splashreveal-part" data-part="doors" ref={hold('doors')}>
        <div className="splash-choice">
          {onBaseline && <BaselineCluster onEnter={onBaseline} />}
          <button type="button" className="splash-door" onClick={onStraight}>
            {S.splashStraight}
          </button>
        </div>
      </div>
    </div>
  );
}
