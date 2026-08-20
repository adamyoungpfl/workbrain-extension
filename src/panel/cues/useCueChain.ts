import { useCallback, useEffect, useRef, useState } from 'react';
import type { CueEvent, CueLink } from '../../schema/flow.types';
import { runCueChain } from './engine';
import type { CueChainController, CueEngineDeps, ParsedCueSpec } from './engine';
import { resolveCueTarget } from './registry';
import { applyCueVerb, clearCueMarks } from './verbs';
import type { PointerState } from './Pointer';

export interface UseCueChainResult {
  /** The current link's `say`, ready for `<CueAnnouncer text={say} />`. */
  say: string | undefined;
  /** The current `point` cue's target/label, ready for
   * `<Pointer state={pointer} />` — `null` whenever no `point` cue is
   * active, including a resolved-but-cross-surface (`page.*`) one. */
  pointer: PointerState | null;
  /** Hands the running chain an event — see engine.ts's `CueChainController`. */
  fire: (event: CueEvent) => void;
}

function toPointerState(cue: ParsedCueSpec): PointerState {
  return cue.label === undefined ? { target: cue.target } : { target: cue.target, label: cue.label };
}

/**
 * Wires the pure chain runner (engine.ts) to the real panel: resolves
 * targets through the shared registry (registry.ts), marks them through
 * the five DOM verbs (verbs.ts), and tracks the sixth verb — `point` — as
 * React state instead, since drawing its overlay needs geometry a class
 * toggle can't express (see Pointer.tsx). Restarts the chain whenever
 * `links` changes identity, and stops (clearing everything) on unmount or
 * whenever `links` becomes empty/undefined — so leaving a step never
 * leaves a stray cue marked on whatever the next step renders.
 *
 * Tracks exactly which elements *this* chain instance has marked, in
 * `markedElements`, and only ever clears those — never the whole document.
 * That isn't defensive polish: an earlier version called `clearAllCueMarks()`
 * (document-wide) here, and a real two-chains-on-one-page Playwright pass
 * (tests/e2e/cues.spec.ts, driving tests/e2e/fixtures/harness.tsx's two demo
 * sections at once) caught it in minutes — one chain's very first `clearAll`
 * silently erased a second, unrelated chain's already-live mark. See
 * verbs.ts's `clearCueMarks` for the fuller account.
 *
 * No real caller exists yet — R1-08 is engine-only, see the module doc
 * comment in engine.ts — but this is the seam a future step component
 * would use: `const { say, pointer, fire } = useCueChain(step.cues)`.
 */
export function useCueChain(links: readonly CueLink[] | undefined): UseCueChainResult {
  const [say, setSay] = useState<string | undefined>(undefined);
  const [pointer, setPointer] = useState<PointerState | null>(null);
  const controllerRef = useRef<CueChainController | null>(null);

  useEffect(() => {
    if (!links || links.length === 0) {
      setSay(undefined);
      setPointer(null);
      controllerRef.current = null;
      return;
    }

    const markedElements = new Set<HTMLElement>();

    const deps: CueEngineDeps<HTMLElement> = {
      resolve: resolveCueTarget,
      apply: (cue, elements) => {
        if (cue.verb === 'point') {
          setPointer(toPointerState(cue));
          return;
        }
        applyCueVerb(cue.verb, elements);
        elements.forEach((el) => markedElements.add(el));
      },
      clearAll: () => {
        setPointer(null);
        clearCueMarks(markedElements);
        markedElements.clear();
      },
      announce: setSay,
    };

    const controller = runCueChain(links, deps);
    controllerRef.current = controller;
    return () => {
      controller.stop();
      controllerRef.current = null;
    };
    // `links` is step data, not a value this hook should deep-compare —
    // a new step brings a new array identity the same way Flow.tsx's own
    // `key={positionKey(pos)}` treats a new question as a fresh mount
    // rather than an update (see that file's comment on StepView).
  }, [links]);

  const fire = useCallback((event: CueEvent) => controllerRef.current?.fire(event), []);

  return { say, pointer, fire };
}
