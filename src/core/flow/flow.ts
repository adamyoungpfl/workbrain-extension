import type { Module, FileOutlineNode } from '../../schema/flow.types';
import { adaptContextFlow } from './adapter';

/**
 * The Context interview — ported verbatim at R1-05 from
 * ../modelcitizen/src/lib/contextInterviewFlow.ts via source.ts + adapter.ts.
 * See docs/RELEASE-1.md.
 *
 * proof/skills/actions/drift have no real content yet — that's other
 * tasks' job, not this one's, so this module only exports what R1-05
 * actually produced rather than force-fitting an incomplete `Flows` record.
 */
const { modules, outline } = adaptContextFlow();

export const contextModules: Module[] = modules;
export const contextOutline: FileOutlineNode[] = outline;
