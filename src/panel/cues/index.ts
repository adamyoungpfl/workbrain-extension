export { runCueChain, parseCueSpec } from './engine';
export type { CueChainController, CueEngineDeps, CueVerbName, ParsedCueSpec } from './engine';

export { registerCueTarget, resolveCueTarget, clearCueRegistry, useCueTarget } from './registry';

export {
  applyCueVerb,
  clearAllCueMarks,
  clearCueMarks,
  prefersReducedMotion,
  sweep,
  ring,
  ringViolet,
  bob,
  focus,
} from './verbs';

export { useCueChain } from './useCueChain';
export type { UseCueChainResult } from './useCueChain';

export { Pointer } from './Pointer';
export type { PointerProps, PointerState } from './Pointer';

export { CueAnnouncer } from './CueAnnouncer';
export type { CueAnnouncerProps } from './CueAnnouncer';
