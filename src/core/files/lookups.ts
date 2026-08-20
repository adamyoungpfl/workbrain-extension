import type { FlowContext, Module, Phrase, RepeatableBlock, Step } from '../../schema/flow.types';

/**
 * The flat-lookup indices generate.ts and parse.ts both need — the
 * this-repo-schema equivalent of the source's ALL_QUESTIONS_BY_ID /
 * QUESTION_TO_REPEATABLE_BLOCK / REPEATABLE_BLOCKS_BY_ID (see source.ts's
 * header comment). Built from `Module[]` (this repo's already-adapted
 * shape), not from the sibling repo's own types.
 *
 * Deliberately NOT built once at module load the way the source builds
 * its equivalents: generate.ts and parse.ts both accept `modules` as an
 * injected parameter (defaulting to the real `contextModules`) so tests
 * can exercise them against small synthetic fixtures, matching
 * core/flow/adapter.ts's `adaptContextFlow(sourceModules = ..., ...)`
 * pattern — a module-load-time cache would go stale against a fixture
 * passed in by a test. The real data is small enough (49 questions) that
 * rebuilding this per call costs nothing that matters.
 */
export interface FlowLookups {
  stepsById: Map<string, Step>;
  repeatableBlockForQuestionId: Map<string, RepeatableBlock>;
  repeatableBlocksById: Map<string, RepeatableBlock>;
}

export function buildFlowLookups(modules: Module[]): FlowLookups {
  const stepsById = new Map<string, Step>();
  const repeatableBlockForQuestionId = new Map<string, RepeatableBlock>();
  const repeatableBlocksById = new Map<string, RepeatableBlock>();

  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        repeatableBlocksById.set(node.id, node);
        for (const field of node.fields) {
          stepsById.set(field.id, field);
          repeatableBlockForQuestionId.set(field.id, node);
        }
      } else {
        stepsById.set(node.id, node);
      }
    }
  }

  return { stepsById, repeatableBlockForQuestionId, repeatableBlocksById };
}

/** A step's storage key — mirrors core/flow/runner.ts's private
 * `storageKeyFor` exactly (not imported from there: that function isn't
 * exported, and duplicating a two-line convention is cheaper and less
 * coupling than exporting a runner-internal for one caller). Most kinds
 * key by their own id; `intro` has no `key` but this never gets called on
 * an intro step here — both generate.ts and parse.ts filter those out
 * before looking up a storage key, same as the source does. */
export function keyOf(step: Step): string {
  return step.key ?? step.id;
}

/** `Step.q`/repeatable field prompts are always `(ctx) => string` in the
 * real ported data, but the schema (flow.types.ts's `Phrase`) allows a
 * plain string too — resolve either the same way generate.ts and
 * parse.ts both need to. */
export function resolvePhrase(phrase: Phrase, ctx: FlowContext): string {
  return typeof phrase === 'function' ? phrase(ctx) : phrase;
}
