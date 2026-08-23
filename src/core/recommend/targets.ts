import type { Module, Step } from '../../schema/flow.types';
import type { Position } from '../flow/runner';
import type { RecommendationTarget } from './types';

/**
 * V1.5 VB-28 — a recommendation's target as a real flow `Position`.
 *
 * Lives in core/ rather than in App.tsx because it is a lookup over the
 * ported flow data with edge cases worth a test — a question inside a
 * repeatable, a question at top level, and an id that no longer exists
 * because the ported content changed shape. App.tsx had one hand-written
 * version of this for the single R1-12 deep link (`roleDurabilityPosition`);
 * this generalises it so every recommendation gets the same treatment rather
 * than each new one growing another special case in the surface.
 *
 * `undefined` — never a throw — when the id is not in the data. A missing
 * deep link degrades to "the button does nothing new" and the panel offers
 * the plain start instead (docs/GUARDRAILS.md: there is no state in which
 * this product is broken, only states in which it is doing less).
 */

function findTopStep(modules: Module[], questionId: string): Step | undefined {
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) continue;
      if (node.id === questionId) return node;
    }
  }
  return undefined;
}

function findBlockField(modules: Module[], blockId: string, questionId: string): Step | undefined {
  for (const module of modules) {
    for (const node of module.nodes) {
      if (!('fields' in node) || node.id !== blockId) continue;
      return node.fields.find((field) => field.id === questionId);
    }
  }
  return undefined;
}

export function positionForTarget(modules: Module[], target: RecommendationTarget): Position | undefined {
  if (target.in === 'top') {
    const step = findTopStep(modules, target.questionId);
    return step ? { kind: 'step', step, location: { in: 'top' } } : undefined;
  }
  const step = findBlockField(modules, target.blockId, target.questionId);
  if (!step) return undefined;
  return {
    kind: 'step',
    step,
    location: { in: 'repeatable', blockId: target.blockId, recordIndex: target.recordIndex },
  };
}
