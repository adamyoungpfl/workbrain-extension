import type { Module, FileOutlineNode } from '../../schema/flow.types';
import { adaptContextFlow } from './adapter';
import { buildProofModule } from './proofAdapter';
import type { ProofCopy } from './proofAdapter';
import { SKILLS_INTERVIEW_MODULES, SKILLS_FILE_OUTLINE } from './skillsSource';
import { SKILLS_ADD_ANOTHER } from './addAnother';

/**
 * The Context interview — ported verbatim at R1-05 from
 * ../modelcitizen/src/lib/contextInterviewFlow.ts via source.ts + adapter.ts.
 * See docs/RELEASE-1.md.
 *
 * skills/actions/drift have no real content yet — that's other tasks' job,
 * not this one's, so this module only exports what's actually been built
 * rather than force-fitting an incomplete `Flows` record.
 */
const { modules, outline } = adaptContextFlow();

export const contextModules: Module[] = modules;
export const contextOutline: FileOutlineNode[] = outline;

/**
 * V2.2 VB-81 — the Skills interview, through the SAME adapter. The adapter
 * was generic over its source from the day it was written (its parameters
 * were only ever defaulted to Context's content); "adaptContextFlow" is a
 * historical name, not a constraint. Skills has no deep-dive entries in v1
 * (an empty map, deliberately) and its own add-another entry.
 */
const skillsAdapted = adaptContextFlow(SKILLS_INTERVIEW_MODULES, SKILLS_FILE_OUTLINE, {}, SKILLS_ADD_ANOTHER);

export const skillsModules: Module[] = skillsAdapted.modules;
export const skillsOutline: FileOutlineNode[] = skillsAdapted.outline;

/**
 * R1-11: the proof loop, one module. Re-exported from here (rather than
 * having App.tsx import proofAdapter.ts directly) purely so this file stays
 * the one place that assembles a ready `Module[]` per flow — but unlike
 * `contextModules`, this can't be built eagerly at import time: its copy
 * is real panel chrome (src/panel/strings.ts), and core/ never imports
 * panel/ (see proofAdapter.ts's header comment). The caller supplies it.
 */
export function buildProofModules(copy: ProofCopy): Module[] {
  return [buildProofModule(copy)];
}
export type { ProofCopy };
