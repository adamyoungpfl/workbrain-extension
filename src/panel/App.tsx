import './tokens.css';
import { useCallback, useEffect, useState } from 'react';
import { Flow } from './surfaces/Flow';
import { Home } from './surfaces/Home';
import { Splash } from './surfaces/Splash';
import { getSession, setSession } from '../core/storage/client';
import { Button } from './components';
import { contextModules, contextOutline, buildProofModules } from '../core/flow/flow';
import { serviceStepOptions } from '../core/flow/proofAdapter';
import type { Position } from '../core/flow/runner';
import { positionForTarget } from '../core/recommend/targets';
import type { RecommendationTarget } from '../core/recommend/types';
import { S } from './strings';

/**
 * R1-11: the proof loop's copy, injected into the pure builder — see
 * proofAdapter.ts's header comment on why this assembly can't happen in
 * core/ itself. Built once at module load, same as `contextModules`.
 */
const proofModules = buildProofModules({
  serviceOptions: serviceStepOptions(S.proofServiceOptions.map((o) => ({ key: o.key, label: o.label }))),
  heading: S.proofHeading,
  pickAI: S.proofPickAI,
  baselineQ: S.proofSub,
  withContextQ: S.proofWithFile,
  gradeQ: S.proofGrade,
  doneQ: S.proofDone,
});

type Surface = 'home' | 'flow';
type FlowKind = 'context' | 'proof';

/**
 * V1.7 VB-34. Whether the splash is on screen.
 *
 * Three states, not two, and the third is the important one. `'asking'` is
 * before the session read has come back: the panel renders its real surface
 * and no splash, so the first paint is the panel and cannot be delayed by
 * anything to do with the splash. If the answer turns out to be "not shown
 * yet", the splash arrives over the top a moment later. That ordering is
 * VB-34's "it must not gate the panel's first paint", implemented rather than
 * asserted.
 */
type SplashState = 'asking' | 'showing' | 'gone';

/**
 * Surface router (docs/ARCHITECTURE.md: 'home' | 'flow' | 'sheet' — no
 * sheet exists yet in Release 1, see docs/RELEASE-1.md's exclusion list, so
 * only the first two are real here). Defaults to Home, which is now the
 * landing point both for a fresh open *and* a just-finished interview
 * (`Flow`'s own `onDone`, R1-12) — there is no separate "I just finished"
 * screen anymore. `flowKind` and `jumpTo` are in-memory only, same as
 * everything else about which question is "current" (docs/ARCHITECTURE.md,
 * "nothing derived is stored") — a reopen always re-derives from `wb:answers`,
 * never from a remembered surface.
 */
export default function App() {
  const [surface, setSurface] = useState<Surface>('home');
  const [flowKind, setFlowKind] = useState<FlowKind>('context');
  const [jumpTo, setJumpTo] = useState<Position | undefined>(undefined);
  const [splash, setSplash] = useState<SplashState>('asking');

  /**
   * V1.7 VB-34 — once per browser session.
   *
   * The flag is written the moment the splash is *shown*, not when it is
   * dismissed. Someone who opens the panel, sees the splash start and closes
   * the panel mid-animation has seen it; showing it again on their next open
   * would be the every-open behaviour the decision rejected.
   *
   * `chrome.storage.session` rather than a module variable, because the side
   * panel's document does not survive being closed — see Splash.tsx's header
   * for the whole argument, and schema/storage.types.ts for why an in-memory
   * area is not the persistence docs/ARCHITECTURE.md forbids. A read that
   * fails answers `undefined`, which shows the splash: the worst case is a
   * brand moment somebody has already seen, and it costs them nothing.
   */
  useEffect(() => {
    let cancelled = false;
    void getSession('wb:splash').then((seen) => {
      if (cancelled) return;
      if (seen) {
        setSplash('gone');
        return;
      }
      setSplash('showing');
      void setSession('wb:splash', true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Stable, so the splash's own timers are never reset by a re-render. */
  const endSplash = useCallback(() => setSplash('gone'), []);

  function goHome() {
    setSurface('home');
    setJumpTo(undefined);
  }

  /**
   * V1.5 VB-28. The one place a recommendation's target becomes a real
   * `Position` (core/flow/runner.ts) — building one needs the actual ported
   * `Step` object, which core/recommend has no reason to hand around (it
   * deals in ids and record indices; see its own header on staying a pure
   * derivation over `wb:answers`). The lookup itself is pure and tested in
   * core/recommend/targets.ts; this is only the wiring.
   *
   * `undefined` back means the ported content no longer holds that question,
   * which lands the person on a plain resume rather than nowhere — see
   * `positionForTarget`'s own note on degrading instead of throwing.
   */
  function openContext(target?: RecommendationTarget) {
    setFlowKind('context');
    setJumpTo(target ? positionForTarget(contextModules, target) : undefined);
    setSurface('flow');
  }

  function openProof() {
    setFlowKind('proof');
    setJumpTo(undefined);
    setSurface('flow');
  }

  /**
   * The router, unchanged. It is a function now only so the splash can be
   * laid over whatever it returns without every branch below repeating the
   * overlay — the splash is on top of the panel, not one more surface the
   * panel can be showing instead.
   */
  function currentSurface() {
    if (surface === 'home') {
      return <Home onStart={() => openContext()} onOpenTarget={(target) => openContext(target)} onOpenProof={openProof} />;
    }

    if (flowKind === 'proof') {
      return (
        <Flow
          modules={proofModules}
          renderDone={() => (
            <>
              <p className="flow-q">{S.proofFinished}</p>
              <Button type="button" variant="secondary" onClick={goHome}>
                {S.backToFiles}
              </Button>
            </>
          )}
        />
      );
    }

    // V1.1 VB-07: only the Context flow passes an `outline`, because it is the
    // only flow that writes a file. The proof loop above deliberately does not —
    // there is nothing for a file tree to show there.
    return <Flow modules={contextModules} outline={contextOutline} initialPosition={jumpTo} onDone={goHome} />;
  }

  // The surface first, always, and the splash after it — in the markup and in
  // the order it renders. VB-34: the splash must not gate the panel's first
  // paint, and the cheapest way to guarantee that is for the panel never to
  // wait on it.
  return (
    <>
      {currentSurface()}
      {splash === 'showing' && <Splash onDone={endSplash} />}
    </>
  );
}
