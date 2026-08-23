import './tokens.css';
import { useState } from 'react';
import { Flow } from './surfaces/Flow';
import { Home } from './surfaces/Home';
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
