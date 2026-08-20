import type { AnswerValue, FileOutlineNode, Module, RepeatableBlock } from '../../schema/flow.types';
import type { Position } from './runner';

/**
 * V1.1 VB-07 — the derivations behind the living file tree.
 *
 * Ported from ../modelcitizen/src/components/WorkBrainContextInterview.tsx
 * (`outlineNodeReached` / `outlineNodeCurrent`, source lines ~1648-1658) and
 * `cursorForQuestionId` in ../modelcitizen/src/lib/contextInterviewFlow.ts
 * (~line 1325). See docs/CONTENT-SOURCES.md's VB-07 rows.
 *
 * These live in `core/` rather than beside the component because they are
 * pure folds over `wb:answers` and the current position — exactly the kind of
 * logic docs/ARCHITECTURE.md says belongs here and gets tested without a
 * browser. Nothing in this file is stored: a section's state is recomputed on
 * every render, the same way `findPosition` recomputes "which question am I
 * on" (see runner.ts's header).
 *
 * The one real change from the source: `cursorForQuestionId` returned a
 * `{ moduleIndex, nodeIndex }` cursor because that runner *stored* a cursor.
 * This runner derives position instead, so the equivalent resolver here
 * returns a `Position` (runner.ts) — the same value `Flow.tsx`'s
 * `initialPosition` / `viewing` mechanism already accepts.
 */

/** The three states a section can be in. `current` wins over `reached`: the
 * section you are answering right now has necessarily been reached. */
export type OutlineNodeState = 'current' | 'reached' | 'untouched';

/**
 * Has anything in this section been answered? Recurses into children, so a
 * parent lights up as soon as any of its sub-sections does.
 *
 * Only top-level `values` are consulted, exactly as the source does — a
 * repeatable's own seed/gate question is a top-level id and is what marks its
 * section reached, which is why a section whose remaining ids only exist
 * inside records still resolves correctly. An explicit skip (`null`, see
 * runner.ts's `applySkip`) counts as reached: the question was asked and
 * answered, just not with content.
 */
export function outlineNodeReached(node: FileOutlineNode, values: Record<string, AnswerValue>): boolean {
  const selfReached = node.questionIds.some((id) => id in values);
  const childReached = node.children?.some((child) => outlineNodeReached(child, values)) ?? false;
  return selfReached || childReached;
}

/** Is the question on screen one of this section's — directly, or inside one
 * of its children? Ported unchanged. */
export function outlineNodeCurrent(node: FileOutlineNode, currentQuestionId: string | null): boolean {
  if (!currentQuestionId) return false;
  if (node.questionIds.includes(currentQuestionId)) return true;
  return node.children?.some((child) => outlineNodeCurrent(child, currentQuestionId)) ?? false;
}

/** The three-way fold both of the above feed. One function so the component
 * cannot accidentally order the two tests the other way round. */
export function outlineNodeState(
  node: FileOutlineNode,
  values: Record<string, AnswerValue>,
  currentQuestionId: string | null,
): OutlineNodeState {
  if (outlineNodeCurrent(node, currentQuestionId)) return 'current';
  if (outlineNodeReached(node, values)) return 'reached';
  return 'untouched';
}

/**
 * Which question id a `Position` is sitting on, for the "current section"
 * test above.
 *
 * `add-another` has no question of its own, so it reports the block's first
 * field — that field is what `CONTEXT_FILE_OUTLINE` actually lists, so the
 * section holding the records you are adding to stays lit while you decide
 * whether to add one more. `module-intro` and `done` are genuinely nowhere in
 * the file: a transition is between two questions, and `done` is past all of
 * them.
 */
export function currentQuestionIdFor(position: Position): string | null {
  if (position.kind === 'step' || position.kind === 'reflect') return position.step.id;
  if (position.kind === 'add-another') return position.block.fields[0]?.id ?? null;
  return null;
}

/** The top-level section the current question belongs to, or null. Drives the
 * accordion's auto-sync. */
export function currentSectionId(outline: FileOutlineNode[], currentQuestionId: string | null): string | null {
  return outline.find((node) => outlineNodeCurrent(node, currentQuestionId))?.id ?? null;
}

/** The question a section's row navigates to: its first listed id. Every
 * section's first id is a top-level question in the shipped data (the
 * section's own gate, seed, or opening question) — the source relies on the
 * same fact. */
export function navigationTargetFor(node: FileOutlineNode): string | undefined {
  return node.questionIds[0];
}

/**
 * `cursorForQuestionId`, re-aimed at this repo's derived `Position`.
 *
 * A sub-question that only exists inside a repeatable (`role_for`,
 * `entity_name`) resolves to that block's own start rather than trying to land
 * mid-loop — there is no "resume a specific past record" screen, so the
 * block's first field in its first record is the sensible target, exactly the
 * resolution the source performs.
 *
 * Returns a plain `step` position, never `reflect`: this is review
 * navigation, so it lands on the question itself. Answering from there goes
 * back through the reflect screen normally, because `applyAnswer` clears
 * nothing and `findPosition` re-derives it (runner.ts's `actionFor`).
 */
export function positionForQuestionId(modules: Module[], questionId: string): Position | null {
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        if (node.id !== questionId && !node.fields.some((field) => field.id === questionId)) continue;
        const first = node.fields[0];
        if (!first) return null;
        return { kind: 'step', step: first, location: { in: 'repeatable', blockId: node.id, recordIndex: 0 } };
      }
      if (node.id === questionId) return { kind: 'step', step: node, location: { in: 'top' } };
    }
  }
  return null;
}

/**
 * The repeatable blocks whose records belong under this section — i.e. any
 * block at least one of whose field ids the section lists.
 *
 * The source hard-codes `node.id === "sec2-1"` and shows role records only.
 * Its own comment gives the reason to generalise: *"the generated file
 * already gives each one its own titled block (renderRepeatableRecord), not
 * just a mention under '2.1 Roles', so the tree should show the same
 * structure instead of summarizing them away."* That is equally true of
 * entities under 3. My World and initiatives under 4. Initiatives, which
 * `core/files/generate.ts` renders as titled blocks in exactly the same way.
 * Doing it by data rather than by section id also means a future outline
 * change cannot silently drop the records from the tree.
 */
export function repeatableBlocksForNode(modules: Module[], node: FileOutlineNode): RepeatableBlock[] {
  const ids = new Set(node.questionIds);
  const blocks: RepeatableBlock[] = [];
  for (const module of modules) {
    for (const candidate of module.nodes) {
      if (!('fields' in candidate)) continue;
      if (candidate.fields.some((field) => ids.has(field.id))) blocks.push(candidate);
    }
  }
  return blocks;
}
