import './tokens.css';
import { useState } from 'react';
import { Flow } from './surfaces/Flow';
import { Home } from './surfaces/Home';
import { Button } from './components';
import { contextModules, buildProofModules } from '../core/flow/flow';
import { serviceStepOptions } from '../core/flow/proofAdapter';
import type { Position } from '../core/flow/runner';
import { ROLES_BLOCK_ID, ROLE_DURABILITY_KEY } from '../core/freshness/nextMove';
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
 * The one place Home's "answer this due role" deep-link becomes a real
 * `Position` (core/flow/runner.ts) — needs the actual ported `role_durability`
 * `Step` object, which core/freshness/nextMove.ts has no reason to import
 * just to hand back up (it only ever deals in record indices; see its own
 * header comment on staying a pure derivation over `wb:answers`). `roles`
 * is the one seeded repeatable in the real ported data (core/flow/runner.ts's
 * own comment on `reconcileSeededRepeatable` says the same) — `undefined`
 * here would mean that content changed shape, not a normal runtime case.
 */
function roleDurabilityPosition(recordIndex: number): Position | undefined {
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node && node.id === ROLES_BLOCK_ID) {
        const step = node.fields.find((f) => f.id === ROLE_DURABILITY_KEY);
        if (!step) return undefined;
        return { kind: 'step', step, location: { in: 'repeatable', blockId: ROLES_BLOCK_ID, recordIndex } };
      }
    }
  }
  return undefined;
}

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

  function openContext(recordIndexForDue?: number) {
    setFlowKind('context');
    setJumpTo(recordIndexForDue !== undefined ? roleDurabilityPosition(recordIndexForDue) : undefined);
    setSurface('flow');
  }

  function openProof() {
    setFlowKind('proof');
    setJumpTo(undefined);
    setSurface('flow');
  }

  if (surface === 'home') {
    return <Home onStart={() => openContext()} onAnswerDue={(recordIndex) => openContext(recordIndex)} onOpenProof={openProof} />;
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

  return <Flow modules={contextModules} initialPosition={jumpTo} onDone={goHome} />;
}
