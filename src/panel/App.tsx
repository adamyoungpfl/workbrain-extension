import './tokens.css';
import { useState } from 'react';
import { Flow } from './surfaces/Flow';
import { FlowDone } from './surfaces/FlowDone';
import { Button } from './components';
import { contextModules, buildProofModules } from '../core/flow/flow';
import { serviceStepOptions } from '../core/flow/proofAdapter';
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

/**
 * Renders the Context interview directly — Home doesn't exist until R1-12,
 * and a vertical slice means the panel does something usable now rather
 * than stay a placeholder. `surface` is the provisional stand-in for real
 * navigation: in-memory only (a reopen defaults back to Context, which —
 * once already finished — immediately re-offers the same way back into the
 * proof loop), same as everything else here being "replaced by the real
 * surface router ('home' | 'flow' | 'sheet') at R1-12" — see
 * docs/ARCHITECTURE.md.
 */
export default function App() {
  const [surface, setSurface] = useState<'context' | 'proof'>('context');

  if (surface === 'proof') {
    return <Flow modules={proofModules} renderDone={() => <p className="flow-q">{S.proofFinished}</p>} />;
  }

  return (
    <Flow
      modules={contextModules}
      renderDone={(answers, persist) => (
        <>
          <p className="flow-q">{S.flowDone}</p>
          <FlowDone answers={answers} onImport={persist} />
          <Button type="button" variant="secondary" onClick={() => setSurface('proof')}>
            {S.proofCta}
          </Button>
        </>
      )}
    />
  );
}
