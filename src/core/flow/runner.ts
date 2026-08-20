import type { Answers } from '../../schema/storage.types';
import type { AnswerValue, FlowContext, Module, RepeatableBlock, Step } from '../../schema/flow.types';

/**
 * Pure flow-walking logic — no chrome.*, no DOM (docs/ARCHITECTURE.md names this
 * file in the module map). "Which question am I on" is never stored (see
 * docs/ARCHITECTURE.md, "nothing derived is stored"); it's derived here, fresh,
 * from wb:answers every time. That's what makes a panel close/reopen resume in
 * the right place for free — there is no separate position to go stale.
 */

export type StepLocation = { in: 'top' } | { in: 'repeatable'; blockId: string; recordIndex: number };

export type Position =
  | { kind: 'step'; step: Step; location: StepLocation }
  | { kind: 'add-another'; block: RepeatableBlock; recordIndex: number }
  | { kind: 'done' };

/** A step's storage key. Most kinds key by their own id; `intro` has no `key`
 * (nothing to record) but still needs a mark that it was seen, or it would
 * be re-shown on every reopen — its own id serves that purpose. */
function storageKeyFor(step: Step): string {
  return step.key ?? step.id;
}

function firstMissingField(fields: Step[], record: Record<string, AnswerValue>): Step | undefined {
  return fields.find((f) => !(storageKeyFor(f) in record));
}

export function findPosition(
  modules: Module[],
  answers: Answers,
  declinedBlocks: ReadonlySet<string>,
): Position {
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };

  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        if (node.skipIf?.(ctx)) continue;
        const records = answers.repeatables[node.id] ?? [];

        if (records.length === 0) {
          if (node.seedFrom) continue; // nothing seeded yet — nothing to ask here
          const first = firstMissingField(node.fields, {});
          if (!first) continue; // a repeatable with no fields shouldn't happen, but don't hang on it
          return { kind: 'step', step: first, location: { in: 'repeatable', blockId: node.id, recordIndex: 0 } };
        }

        const lastIndex = records.length - 1;
        const missing = firstMissingField(node.fields, records[lastIndex]!);
        if (missing) {
          return { kind: 'step', step: missing, location: { in: 'repeatable', blockId: node.id, recordIndex: lastIndex } };
        }
        if (node.seedFrom) continue; // every seeded record is complete — move on
        if (declinedBlocks.has(node.id)) continue; // said "no more" this session — move on
        return { kind: 'add-another', block: node, recordIndex: records.length };
      }

      if (node.skipIf?.(ctx)) continue;
      if (!(storageKeyFor(node) in ctx.answers)) return { kind: 'step', step: node, location: { in: 'top' } };
    }
  }
  return { kind: 'done' };
}

/** Total top-level questions in a module, for the "Question N of Total" eyebrow —
 * repeatable records aren't counted since their count isn't fixed. */
export function questionCount(modules: Module[]): number {
  return modules.reduce((sum, m) => sum + m.nodes.length, 0);
}

/** The position's containing top-level node's 1-based index across the whole
 * flow (not per-module) — powers "Question N of Total". A repeatable's own
 * fields/add-another all share the block's own index; the record loop isn't
 * counted, since its length isn't fixed. */
export function topLevelIndex(modules: Module[], position: Position): number {
  if (position.kind === 'done') return questionCount(modules);
  const targetId = position.kind === 'add-another' ? position.block.id : positionNodeId(position);
  let n = 0;
  for (const module of modules) {
    for (const node of module.nodes) {
      n++;
      if (node.id === targetId) return n;
    }
  }
  return n;
}

function positionNodeId(position: Extract<Position, { kind: 'step' }>): string {
  return position.location.in === 'top' ? position.step.id : position.location.blockId;
}

/** The module containing a position — for the "Question N of Total · Module title" eyebrow. */
export function moduleFor(modules: Module[], position: Position): Module | undefined {
  if (position.kind === 'done') return undefined;
  const targetId = position.kind === 'add-another' ? position.block.id : positionNodeId(position);
  return modules.find((m) => m.nodes.some((node) => node.id === targetId));
}

/** Reads whatever is already stored for a position — used to re-populate a
 * field when navigating Back to a question already answered this session. */
export function existingValue(answers: Answers, step: Step, location: StepLocation): AnswerValue | undefined {
  const key = storageKeyFor(step);
  if (location.in === 'top') return answers.values[key];
  return answers.repeatables[location.blockId]?.[location.recordIndex]?.[key];
}

export function applyAnswer(answers: Answers, step: Step, location: StepLocation, value: AnswerValue): Answers {
  const key = storageKeyFor(step);
  const at = new Date().toISOString();

  if (location.in === 'top') {
    return {
      ...answers,
      values: { ...answers.values, [key]: value },
      answeredAt: { ...answers.answeredAt, [key]: at },
    };
  }

  const { blockId, recordIndex } = location;
  // A brand-new open-ended record's first field is answered before any
  // record exists at this index yet (findPosition treats a missing index
  // the same as an empty {} record) — .map() over the existing array would
  // silently no-op in that case, so extend the array instead of mapping it.
  const nextRecords = [...(answers.repeatables[blockId] ?? [])];
  nextRecords[recordIndex] = { ...nextRecords[recordIndex], [key]: value };
  return {
    ...answers,
    repeatables: { ...answers.repeatables, [blockId]: nextRecords },
    answeredAt: { ...answers.answeredAt, [`${blockId}#${recordIndex}#${key}`]: at },
  };
}

/** Explicitly skipped, distinct from never-visited — see the R1-06 plan.
 * `null` is already a valid AnswerValue; nothing new needed to represent it. */
export function applySkip(answers: Answers, step: Step, location: StepLocation): Answers {
  return applyAnswer(answers, step, location, null);
}

export function applyAddAnother(answers: Answers, blockId: string, wantsMore: boolean): Answers {
  if (!wantsMore) return answers;
  const records = answers.repeatables[blockId] ?? [];
  return { ...answers, repeatables: { ...answers.repeatables, [blockId]: [...records, {}] } };
}

/** The one `seedFrom` block in the ported data (`roles`, seeded from
 * `role_names`) is reconciled here: keep an existing record for a value
 * that's still selected (so re-answering the seed question doesn't discard
 * already-collected detail), add an empty record for a newly-selected value,
 * drop records for a deselected one. */
export function reconcileSeededRepeatable(
  answers: Answers,
  block: RepeatableBlock,
  seedStep: Step,
  selectedValues: string[],
): Answers {
  if (!block.seedFrom) return answers;
  const { seedField } = block.seedFrom;
  const labelFor = (v: string) => seedStep.options?.find((o) => o.v === v)?.l ?? v;
  const existing = answers.repeatables[block.id] ?? [];
  const nextRecords = selectedValues.map((v) => {
    const label = labelFor(v);
    return existing.find((r) => r[seedField] === label) ?? { [seedField]: label };
  });
  return { ...answers, repeatables: { ...answers.repeatables, [block.id]: nextRecords } };
}

/** Finds the repeatable block (if any) seeded from this question, so
 * answering it can trigger reconcileSeededRepeatable. Only 3 repeatables
 * exist in the ported data, so a linear scan on every Next is cheap. */
export function findSeedTarget(modules: Module[], questionId: string): RepeatableBlock | undefined {
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node && node.seedFrom?.questionId === questionId) return node;
    }
  }
  return undefined;
}
