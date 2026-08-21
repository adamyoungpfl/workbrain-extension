import { useEffect, useRef } from 'react';
import {
  MARK_STATIC_ANGLE,
  MARK_SPIN_MS,
  MARK_VIEWBOX,
  markFrame,
  spinAngleAt,
  type MarkFrame,
} from '../../core/geometry/markSpin';
import { ease } from '../../core/motion/easing';
import './BrandMark.css';

/**
 * The Model Citizen node-graph mark — an icosahedron drawn as twelve nodes and
 * their thirty edges, and, as of V1.2 VB-13, one that turns.
 *
 * WHAT CHANGED FROM V1.1, AND WHY
 * VB-01 shipped this as a single static pose transcribed from
 * `../modelcitizen/public/mark.svg`, with a note arguing that a permanently
 * moving thing in a working panel is a cost with no benefit. Adam overrode
 * that in VB-13: the welcome screen gets the rotation from
 * `../modelcitizen/src/components/ModelSphere.tsx`.
 *
 * The geometry is no longer transcribed. It is computed, per frame, by
 * `core/geometry/markSpin` — real 3D vertices rotated and projected, so near
 * nodes grow and brighten and far ones shrink and dim as the solid turns. The
 * V1.1 drawing is not lost: it is exactly `markFrame(MARK_STATIC_ANGLE)`, the
 * pose `mark.svg` was exported at, asserted attribute-for-attribute in
 * `markSpin.test.ts`. Nothing about the still mark changed.
 *
 * REDUCED MOTION STOPS THE LOOP, NOT JUST THE MOVEMENT
 * `docs/GUARDRAILS.md` requires a still equivalent that carries the same
 * information; VB-13 additionally requires that no `requestAnimationFrame`
 * loop runs at all — "assert the loop isn't merely invisible". So the check
 * happens before anything is scheduled, and the first render already draws the
 * still pose. A reduced-motion user gets the V1.1 component's exact output and
 * one `matchMedia` call, and nothing is ever queued.
 *
 * HOW IT DRAWS
 * The element tree is fixed: thirty `<line>` slots and twelve `<circle>`
 * slots, written once by React and then addressed by index. Each frame writes
 * attributes into those slots — no React render per frame, no re-parenting for
 * depth order (the frame arrives already sorted furthest-first, so slot *i* is
 * simply the *i*th-furthest node).
 *
 * That is around 220 attribute writes per frame. Measured on the interview
 * screen it costs roughly 2% of the main thread in script and drops no frames
 * at all — 120 frames in two seconds, worst gap under 20ms. Honest about what
 * that means: an animation that runs is never *free*, and the reduced-motion
 * build measures at 0.05% because it produces no frames whatsoever. What the
 * measurement establishes is that nothing is ever felt. Both numbers come from
 * tests/e2e/brand-mark.spec.ts, which measures rather than assumes.
 *
 * Colours still come from `--brand-*` tokens via BrandMark.css classes: no hex
 * literal may exist outside the generated tokens.css. And the mark is still
 * purely decorative — `aria-hidden`, with the real selectable word
 * "Workbrain" beneath it on the welcome screen and the module title beside it
 * in the status bar, so nothing is distinguished by colour or motion alone.
 */

/** The pose `mark.svg` exports, and so what a still mark draws. */
const STILL: MarkFrame = markFrame(MARK_STATIC_ANGLE);

const GRADIENTS = [1, 2, 3, 4, 5] as const;

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * One 360° turn for `spin="once"`.
 *
 * This is `--slow` from design/tokens.json, in milliseconds, because a
 * `requestAnimationFrame` loop cannot read a CSS token. §06's three durations
 * are the only ones allowed and this is the longest: the turn marks a section
 * change — a sheet-scale event, not press feedback — and VB-04's 200ms icon
 * spin, the other full revolution in the product, is a direct response to a
 * press. At 20px, 360° in 200ms is a strobe rather than a turn.
 */
export const SPIN_ONCE_MS = 320;

/**
 * When the current `spinCue` last changed, on the shared clock.
 *
 * Module scope on purpose. `Flow` remounts its step view on every question, so
 * anything held in component state would restart the turn forty-nine times per
 * interview — the mark would spin on every question instead of on every
 * module. Holding the moment here means a remount mid-turn *continues* the
 * turn, and a remount after it *stays still*.
 *
 * Ephemeral, and deliberately so: a plain variable, alive for exactly as long
 * as the panel document is. Nothing here is derived state that gets persisted
 * (`docs/ARCHITECTURE.md`), and reopening the panel starts it over.
 *
 * Recording rather than consuming also makes it idempotent, which matters:
 * `<StrictMode>` invokes render bodies twice in development, and a
 * "has it changed since last time?" flag would answer differently on the
 * second call.
 */
let lastCue: { readonly cue: string; readonly startedAt: number } | null = null;

function spinStartFor(cue: string, now: number): number {
  if (!lastCue || lastCue.cue !== cue) lastCue = { cue, startedAt: now };
  return lastCue.startedAt;
}

/** Test seam: forget the remembered cue, so specs start from a clean slate. */
export function resetSpinCueMemory(): void {
  lastCue = null;
}

export type BrandMarkSpin =
  /** Turns for as long as it is on screen. The welcome screen's mark. */
  | 'continuous'
  /** Turns once when `spinCue` changes, then settles on the still pose. */
  | 'once'
  /** Never moves, and never schedules a frame. */
  | 'none';

export interface BrandMarkProps {
  /** Rendered size in px, square. The viewBox is 240×240 regardless. */
  size?: number;
  /** How it moves. Reduced motion overrides every value here with `none`. */
  spin?: BrandMarkSpin;
  /** For `spin="once"`: change this value to make it turn. */
  spinCue?: string;
  /**
   * The one-time fade-and-scale entrance. On by default, because the welcome
   * screen's mark arrives with the screen. Off for the status bar, where the
   * component remounts on every question and an entrance would be a flash on
   * each of them.
   */
  entrance?: boolean;
  className?: string;
}

export function BrandMark({
  size = 96,
  spin = 'continuous',
  spinCue = '',
  entrance = true,
  className,
}: BrandMarkProps) {
  const lines = useRef<(SVGLineElement | null)[]>([]);
  const circles = useRef<(SVGCircleElement | null)[]>([]);
  /** Which gradient each slot currently shows, so `fill` is only rewritten on
   * the frames where a node has actually overtaken another. */
  const fills = useRef<number[]>(STILL.nodes.map((n) => n.gradient));

  useEffect(() => {
    if (spin === 'none') return;
    // No matchMedia means no way to know the person's preference. Treat that
    // as "reduce": the still mark is the safe answer, and it is the same
    // drawing either way.
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCE_QUERY);

    let raf = 0;
    let live = true;

    function paint(frame: MarkFrame) {
      const edgeEls = lines.current;
      for (let i = 0; i < frame.edges.length; i++) {
        const el = edgeEls[i];
        if (!el) continue;
        const e = frame.edges[i]!;
        el.setAttribute('x1', String(e.x1));
        el.setAttribute('y1', String(e.y1));
        el.setAttribute('x2', String(e.x2));
        el.setAttribute('y2', String(e.y2));
        el.setAttribute('stroke-width', String(e.width));
        el.setAttribute('stroke-opacity', String(e.opacity));
      }
      const nodeEls = circles.current;
      for (let i = 0; i < frame.nodes.length; i++) {
        const el = nodeEls[i];
        if (!el) continue;
        const n = frame.nodes[i]!;
        el.setAttribute('cx', String(n.cx));
        el.setAttribute('cy', String(n.cy));
        el.setAttribute('r', String(n.r));
        if (fills.current[i] !== n.gradient) {
          el.setAttribute('fill', `url(#wb-mark-g${n.gradient})`);
          fills.current[i] = n.gradient;
        }
      }
    }

    function settle() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      // Whatever stopped it, the mark lands on the pose we ship still. Motion
      // is never the thing carrying the meaning.
      if (live) paint(STILL);
    }

    function runContinuous() {
      function frame() {
        // The absolute clock, not time-since-mount: a remount must not snap
        // the mark back to its start pose. See spinAngleAt's own note.
        paint(markFrame(spinAngleAt(performance.now(), MARK_SPIN_MS)));
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    }

    function runOnce() {
      const startedAt = spinStartFor(spinCue, performance.now());
      function frame() {
        const elapsed = performance.now() - startedAt;
        if (elapsed >= SPIN_ONCE_MS) {
          settle();
          return;
        }
        const turn = ease(elapsed / SPIN_ONCE_MS) * Math.PI * 2;
        paint(markFrame(MARK_STATIC_ANGLE + turn));
        raf = requestAnimationFrame(frame);
      }
      // A remount after the turn already finished must not start a new one,
      // and must not schedule a frame to discover that. It settles instead of
      // simply returning, so that arriving here from a mode change (rather
      // than from a remount) cannot leave the mark frozen mid-pose.
      if (performance.now() - startedAt >= SPIN_ONCE_MS) {
        settle();
        return;
      }
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (raf || query.matches) return;
      if (spin === 'continuous') runContinuous();
      else runOnce();
    }

    function onPreferenceChange() {
      if (query.matches) settle();
      else start();
    }

    start();
    query.addEventListener('change', onPreferenceChange);
    return () => {
      live = false;
      query.removeEventListener('change', onPreferenceChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [spin, spinCue]);

  return (
    <svg
      className={className ? `brand-mark ${className}` : 'brand-mark'}
      data-entrance={entrance ? 'on' : 'off'}
      data-spin={spin}
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      // Decorative: the wordmark next to it carries the name. Nothing in the
      // mark is information the person needs read out.
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {GRADIENTS.map((n) => (
          // Gradient ids are document-global in SVG. Prefixed rather than
          // bare `g1` so a second inline SVG on the same screen can never
          // collide with these. The welcome mark and the status-bar mark live
          // on different surfaces and never render together, so one shared
          // set of ids is correct and keeps the markup stable under test.
          <linearGradient key={n} id={`wb-mark-g${n}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className={`brand-mark-node-${n}-from`} />
            <stop offset="100%" className={`brand-mark-node-${n}-to`} />
          </linearGradient>
        ))}
      </defs>
      <g className="brand-mark-edges">
        {STILL.edges.map((e, i) => (
          <line
            key={i}
            ref={(el) => {
              lines.current[i] = el;
            }}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            strokeWidth={e.width}
            strokeOpacity={e.opacity}
            strokeLinecap="round"
          />
        ))}
      </g>
      {STILL.nodes.map((n, i) => (
        // Keyed by slot, not by vertex. The slots are depth positions —
        // furthest first — and which vertex occupies each one changes as the
        // solid turns. Keying by vertex would make React reorder twelve
        // elements every time two nodes swapped depth.
        <circle
          key={i}
          ref={(el) => {
            circles.current[i] = el;
          }}
          cx={n.cx}
          cy={n.cy}
          r={n.r}
          fill={`url(#wb-mark-g${n.gradient})`}
        />
      ))}
    </svg>
  );
}
