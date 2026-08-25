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

/**
 * V2.0 VB-62 — the field that NAMES one record of an open-ended block, and the
 * fields that make up its body.
 *
 * Until VB-62 both were positional: `fields[0]` was the name, `fields.slice(1)`
 * was the body, spelled out separately in `generate.ts`, `parse.ts`,
 * `nodeDetails.ts` and `multiples.ts`. Reordering the entity cycle to ask the
 * KIND first broke that assumption in four places at once, so it is resolved
 * here instead — the file's record heading, the file's bullets, the panel's
 * record list and the globe's detail grid have to agree about what a record is
 * called, and now they agree because they ask the same two functions.
 *
 * A SEEDED block has no name field of its own: its records are titled by
 * `seedFrom.seedField`, which is seed data rather than an answered question, so
 * `nameStepFor` is `undefined` there and every field is a body field. That is
 * the same split `renderRepeatableRecord` has always made.
 *
 * A `nameField` naming a question the block does not have falls back to the
 * first field rather than throwing: a record with a heading is always better
 * than a surface that will not render, and `overrides.test.ts` asserts the real
 * data resolves properly.
 */
export function nameStepFor(block: RepeatableBlock): Step | undefined {
  if (block.seedFrom) return undefined;
  if (block.nameField) {
    const named = block.fields.find((field) => field.id === block.nameField);
    if (named) return named;
  }
  return block.fields[0];
}

/** Everything except the name field, in the block's own order — what the file
 * prints as bullets under the record's heading, and what the parser reads back
 * in the same order. */
export function bodyFieldsFor(block: RepeatableBlock): Step[] {
  const name = nameStepFor(block);
  return name ? block.fields.filter((field) => field !== name) : block.fields;
}

/** `Step.q`/repeatable field prompts are always `(ctx) => string` in the
 * real ported data, but the schema (flow.types.ts's `Phrase`) allows a
 * plain string too — resolve either the same way generate.ts and
 * parse.ts both need to. */
export function resolvePhrase(phrase: Phrase, ctx: FlowContext): string {
  return typeof phrase === 'function' ? phrase(ctx) : phrase;
}
