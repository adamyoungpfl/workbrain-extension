import {
  CONTEXT_INTERVIEW_MODULES,
  CONTEXT_FILE_OUTLINE,
} from './source';
import { DEEP_DIVE } from './deepDive';
import { ADD_ANOTHER } from './addAnother';
import type { AddAnotherCopy } from './addAnother';
import {
  DEEP_DIVE_ALIASES,
  GATE_QUESTIONS,
  INSERTED_BLOCK_ADD_ANOTHER,
  NAME_FIELDS,
  PLACEHOLDERS,
  applyFlowOverrides,
  applyOutlineOverrides,
} from './overrides';
import type {
  Question as SrcQuestion,
  Module as SrcModule,
  RepeatableBlock as SrcRepeatableBlock,
  QuestionOption as SrcOption,
  QuestionType as SrcQuestionType,
  FileOutlineNode as SrcFileOutlineNode,
} from './source';
import type {
  Module,
  Step,
  RepeatableBlock,
  Option,
  FileOutlineNode,
  QuestionKind,
  DeepDiveEntry,
} from '../../schema/flow.types';

/**
 * Transforms source.ts's verbatim snapshot into this repo's schema shape.
 * Pure — no chrome.*, no DOM. Field renaming and the QuestionType ->
 * QuestionKind mapping are mechanical; the one real computation is
 * resolving each question's `section` against CONTEXT_FILE_OUTLINE,
 * flattened depth-first (see docs/RELEASE-1.md's R1-05 plan).
 *
 * Source and outline are parameters (defaulting to the real production
 * data) so tests can exercise the transform against small synthetic
 * fixtures — the same injected-data pattern core/storage/migrations.ts
 * and core/storage/client.ts already use.
 */

const KIND_MAP: Record<SrcQuestionType, QuestionKind> = {
  intro: 'intro',
  text: 'text',
  'single-select': 'chips',
  'multi-select': 'multi',
  'yes-no': 'yesno',
};

function adaptOption(o: SrcOption): Option {
  return o.recommended ? { v: o.key, l: o.label, rec: o.recommended } : { v: o.key, l: o.label };
}

function adaptOutlineNode(node: SrcFileOutlineNode): FileOutlineNode {
  return node.children
    ? { id: node.id, label: node.label, questionIds: node.questionIds, children: node.children.map(adaptOutlineNode) }
    : { id: node.id, label: node.label, questionIds: node.questionIds };
}

/** Depth-first pre-order flattening: a node's own index comes before its
 * children's, matching how a rail/outline UI would walk the tree. */
export function flattenOutline(nodes: SrcFileOutlineNode[]): {
  flat: SrcFileOutlineNode[];
  indexByQuestionId: Map<string, number>;
} {
  const flat: SrcFileOutlineNode[] = [];
  const indexByQuestionId = new Map<string, number>();

  function walk(node: SrcFileOutlineNode) {
    const index = flat.length;
    flat.push(node);
    for (const questionId of node.questionIds) {
      if (indexByQuestionId.has(questionId)) {
        throw new Error(`question "${questionId}" appears in more than one outline section`);
      }
      indexByQuestionId.set(questionId, index);
    }
    for (const child of node.children ?? []) walk(child);
  }

  for (const node of nodes) walk(node);
  return { flat, indexByQuestionId };
}

function sectionFor(questionId: string, indexByQuestionId: Map<string, number>): number {
  const index = indexByQuestionId.get(questionId);
  if (index === undefined) {
    throw new Error(`question "${questionId}" has no entry in the file outline`);
  }
  return index;
}

/** Everything the per-question transform needs to look up by id. Grouped
 * rather than passed as loose parameters — VB-03 added the second lookup,
 * and a third would otherwise mean editing four signatures again. */
interface Lookups {
  indexByQuestionId: Map<string, number>;
  /** V1.1 VB-03 — per-question follow-up copy, see ./deepDive.ts. */
  deepDive: Record<string, DeepDiveEntry[]>;
  /** V1.4 VB-20 — per-block "another one?" copy, see ./addAnother.ts. */
  addAnother: Record<string, AddAnotherCopy>;
}

function adaptQuestion(
  question: SrcQuestion,
  moduleNumber: number,
  eyebrow: string,
  { indexByQuestionId, deepDive }: Lookups,
): Step {
  const step: Step = {
    id: question.id,
    module: moduleNumber,
    section: sectionFor(question.id, indexByQuestionId),
    eyebrow,
    q: question.prompt,
    kind: KIND_MAP[question.type],
  };
  if (question.type !== 'intro') step.key = question.id;
  if (question.hint !== undefined) step.hint = question.hint;
  // Attached here, not authored on the source question — source.ts is a
  // verbatim snapshot of the ported interview and stays that way. V2.0
  // VB-61/VB-63: a question this repo INSERTED may borrow the follow-ups
  // written for the ported question it stands in front of — see
  // ./overrides.ts's DEEP_DIVE_ALIASES for why that is a lookup rather than a
  // re-keying of V1.1's copy.
  const alias = DEEP_DIVE_ALIASES[question.id];
  const dive = deepDive[question.id] ?? (alias ? deepDive[alias] : undefined);
  if (dive) step.deepDive = dive;
  if (question.options) step.options = question.options.map(adaptOption);
  if (question.placeholder !== undefined) step.ph = question.placeholder;
  // V2.0 VB-62 — a placeholder that phrases itself for the kind of thing being
  // named. Attached here rather than patched onto the source question, because
  // `Question.placeholder` in the snapshot is a plain string and stays one.
  const placeholder = PLACEHOLDERS[question.id];
  if (placeholder) step.ph = placeholder.placeholder;
  if (question.multiline !== undefined) step.multiline = question.multiline;
  if (question.skipIf) step.skipIf = question.skipIf;
  if (question.required !== undefined) step.required = question.required;
  if (question.interpret) step.interpret = question.interpret;
  if (question.ideas) step.ideas = question.ideas;
  if (question.allowCustom !== undefined) step.allowCustom = question.allowCustom;
  if (question.customPlaceholder !== undefined) step.customPlaceholder = question.customPlaceholder;
  if (question.rephrasings) step.rephrasings = question.rephrasings;
  if (question.optionRephrasings) {
    step.optionRephrasings = question.optionRephrasings.map((variant) => variant.map(adaptOption));
  }
  if (question.beats) step.beats = question.beats;
  if (question.optionExamples) step.optionExamples = question.optionExamples;
  return step;
}

function adaptRepeatable(
  block: SrcRepeatableBlock,
  moduleNumber: number,
  eyebrow: string,
  lookups: Lookups,
): RepeatableBlock {
  // V1.4 VB-20. Attached here, not authored on the source block — source.ts is
  // a verbatim snapshot of the ported interview and stays that way, exactly as
  // with `deepDive` above. A block with no entry keeps its ported prompt,
  // including the deliberate "" that means "never ask".
  // V2.0 VB-64: a block this repo authored (see ./overrides.ts) carries its own
  // add-another copy, because the snapshot has none to fill in for it. Same
  // shape, same screen — read here so the two provenances converge in one
  // place rather than in the renderer.
  const grows = lookups.addAnother[block.id] ?? INSERTED_BLOCK_ADD_ANOTHER[block.id];
  const result: RepeatableBlock = {
    id: block.id,
    addAnotherPrompt: grows?.prompt ?? block.addAnotherPrompt,
    fields: block.questions.map((sub) => adaptQuestion(sub, moduleNumber, eyebrow, lookups)),
  };
  if (grows) result.addAnotherName = { prompt: grows.namePrompt, placeholder: grows.namePlaceholder };
  // V2.0 VB-62 — which field titles a record, where it is no longer the first
  // one. Attached here, never authored on the ported block: `nameField` has no
  // equivalent in the snapshot's own schema. See ./overrides.ts.
  const nameField = NAME_FIELDS[block.id]?.field;
  if (nameField) result.nameField = nameField;
  // V2.0 VB-61/VB-63 — which question's stored "no" still skips this block,
  // said out loud instead of guessed at from the block's name (see the
  // schema's own note on `gateQuestionId`, and ./overrides.ts).
  const gate = GATE_QUESTIONS[block.id]?.questionId;
  if (gate) result.gateQuestionId = gate;
  if (block.seedFrom) result.seedFrom = block.seedFrom;
  if (block.skipIf) result.skipIf = block.skipIf;
  return result;
}

function adaptModule(module: SrcModule, lookups: Lookups): Module {
  const eyebrow = `MODULE ${module.number} · ${module.title.toUpperCase()}`;
  return {
    id: module.id,
    n: module.number,
    title: module.title,
    purpose: module.purpose,
    required: module.required,
    estimatedMinutes: module.estimatedMinutes,
    nodes: module.nodes.map((node) =>
      node.kind === 'repeatable'
        ? adaptRepeatable(node, module.number, eyebrow, lookups)
        : adaptQuestion(node, module.number, eyebrow, lookups),
    ),
  };
}

/**
 * V2.0 VB-61 · VB-62 · VB-63 · VB-64 (docs/V2.0-REFINEMENT.md, FLAG 2) — the
 * capture-flow changes are applied HERE, to a copy, on the way through.
 * `source.ts` is a verbatim port and is never edited; ./overrides.ts is the one
 * file that says what this repo changed and why. Applied before the transform
 * so a question this repo authored is adapted by exactly the same code path as
 * a ported one — same section resolution, same deep-dive attachment, same kind
 * mapping — rather than by a second one that could drift.
 */
export function adaptContextFlow(
  sourceModules: SrcModule[] = CONTEXT_INTERVIEW_MODULES,
  sourceOutline: SrcFileOutlineNode[] = CONTEXT_FILE_OUTLINE,
  deepDive: Record<string, DeepDiveEntry[]> = DEEP_DIVE,
  addAnother: Record<string, AddAnotherCopy> = ADD_ANOTHER,
): { modules: Module[]; outline: FileOutlineNode[] } {
  const overriddenModules = applyFlowOverrides(sourceModules);
  const overriddenOutline = applyOutlineOverrides(sourceOutline);
  const { indexByQuestionId } = flattenOutline(overriddenOutline);
  return {
    modules: overriddenModules.map((m) => adaptModule(m, { indexByQuestionId, deepDive, addAnother })),
    outline: overriddenOutline.map(adaptOutlineNode),
  };
}
