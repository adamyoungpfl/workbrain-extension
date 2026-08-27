import { useEffect, useRef, useState } from 'react';
import { BrandMark, Button } from '../components';
import { SplashStage } from './SplashStage';
import type { SplashStageHandle } from './SplashStage';
import {
  SPLASH_BEATS,
  idleProgress,
  loadingWordIndex,
  pullStrength,
  splashPhase,
  swellOpacity,
} from '../../core/splash/sequence';
import type { SplashPhase } from '../../core/splash/sequence';
import { S } from '../strings';
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
}

export function Splash({ onDone }: SplashProps) {
  const [leaving, setLeaving] = useState(false);
  /** Decided during the first render (NarratorToggle's rule): an effect
   * would paint the show a frame late — or paint it at all for someone who
   * asked for stillness. No matchMedia reads as "reduce": the still reveal
   * is the safe answer. */
  const [reduced] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia(REDUCE_QUERY).matches,
  );
  const [phase, setPhase] = useState<SplashPhase>(reduced ? 'reveal' : 'show');
  const [wordIndex, setWordIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  /** VB-129 — the shard canvas, painted by this component's one clock. */
  const stageRef = useRef<SplashStageHandle | null>(null);
  /** One handover, however many ways it is triggered at once. */
  const handedOver = useRef(false);
  const idleTimer = useRef<number | undefined>(undefined);

  const leave = useRef(() => {});
  leave.current = () => {
    if (handedOver.current) return;
    handedOver.current = true;
    window.clearTimeout(idleTimer.current);
    if (reduced) {
      onDone();
      return;
    }
    // Fades out, then hands over. `pointer-events` drops for the fade (see
    // Splash.css), so the panel underneath is live from the first frame of
    // the leaving rather than the last.
    setLeaving(true);
    window.setTimeout(() => onDone(), SPLASH_FADE_MS);
  };

  useEffect(() => {
    // Escape still means "close this", at every phase — the keyboard's way
    // out before the button exists to see. Letter keys still do nothing.
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') leave.current();
    }
    window.addEventListener('keydown', onKey, { capture: true, passive: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  useEffect(() => {
    if (reduced) {
      // The composed frame, at once — and the ten-count still runs, on a
      // once-per-second interval (a timeout is not an animation frame; the
      // zero-rAF law holds). The bar steps rather than glides.
      const started = Date.now();
      idleTimer.current = window.setTimeout(() => leave.current(), SPLASH_BEATS.idleMs);
      const stepper = window.setInterval(() => {
        rootRef.current?.style.setProperty('--drain', String(idleProgress(Date.now() - started)));
      }, 1000);
      return () => {
        window.clearTimeout(idleTimer.current);
        window.clearInterval(stepper);
      };
    }

    // The one clock. Phase and the loading word go through React (they
    // change a handful of times); everything per-frame goes straight to
    // style, which is also VB-129's seam — the canvas painter reads the
    // same elapsed time this loop owns.
    const t0 = performance.now();
    let raf = 0;
    let lastPhase: SplashPhase = 'show';
    let lastWord = -1;
    let enterAtMs: number | null = null;
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
      // The shards fly on the same clock (VB-129); once the reveal has the
      // screen the stage is unmounted and this is a no-op.
      stageRef.current?.paint(t);
      if (t >= SPLASH_BEATS.enterAt) {
        if (enterAtMs === null) {
          enterAtMs = now;
          idleTimer.current = window.setTimeout(() => leave.current(), SPLASH_BEATS.idleMs);
        }
        const ms = now - enterAtMs;
        const w = loadingWordIndex(ms, S.splashLoading.length);
        if (w !== lastWord) {
          lastWord = w;
          setWordIndex(w);
        }
        root?.style.setProperty('--drain', idleProgress(ms).toFixed(3));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer.current);
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
      onClick={() => leave.current()}
    >
      {/* The stage. VB-128 ships it with the mark burning in its gravity
          glow; VB-129 flies the shard windows in this same box. Decoration
          throughout — the reveal carries every word. */}
      {phase !== 'reveal' && (
        <div className="splash-stage" aria-hidden="true">
          <SplashStage ref={stageRef} />
          <div className="splash-glow" />
          <BrandMark size={116} spin="orbit" entrance={false} />
        </div>
      )}

      {/* The swell — opacity driven by core's own soft curve, never a
          square wave. Present in the DOM only while it could show. */}
      {!reduced && phase !== 'show' && <div className="splash-swell" aria-hidden="true" />}

      {phase === 'reveal' && (
        <div className="splash-lockup">
          <BrandMark size={132} spin="orbit" />
          <p className="splash-wordmark">{S.appName}</p>
          <p className="splash-tagline">
            {taglineLines(S.splashTagline).map((line, i) => (
              <span key={line} className="splash-tagline-line">
                {i > 0 ? ' ' : ''}
                {line}
              </span>
            ))}
          </p>
          <Button type="button" variant="primary" className="splash-enter" onClick={() => leave.current()}>
            {S.splashEnter}
          </Button>
          {/* The ten-count, dressed as a loading line (decision 5): action
              words cycling while the thin bar drains, then Home. Decoration
              — the button above is the control. Under reduced motion the
              first word holds still and the bar steps by the second. */}
          <div className="splash-idle" aria-hidden="true">
            <p className="splash-loader" key={wordIndex}>
              {S.splashLoading[wordIndex]}
            </p>
            <div className="splash-drain">
              <i />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
