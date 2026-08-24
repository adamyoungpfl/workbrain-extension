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
  | { kind: 'reflect'; step: Step; location: StepLocation }
  | { kind: 'add-another'; block: RepeatableBlock; recordIndex: number }
  /** V1.1 VB-05: the transition screen shown once, immediately before a
   * module nobody has touched yet. Derived like every other position — see
   * `findPosition` — never a stored flag. */
  | { kind: 'module-intro'; module: Module }
  | { kind: 'done' };

/** A step's storage key. Most kinds key by their own id; `intro` has no `key`
 * (nothing to record) but still needs a mark that it was seen, or it would
 * be re-shown on every reopen — its own id serves that purpose. `gen` (R1-11
 * proof loop) is the one kind whose paste-in destination is deliberately
 * decoupled from its own id/key — `outKey` names where the generated
 * prompt's pasted result is stored, distinct from `genKey` (which prompt to
 * generate — resolved by the panel, not this module) — so it takes priority
 * when present. */
function storageKeyFor(step: Step): string {
  return step.outKey ?? step.key ?? step.id;
}

/** `answeredAt`/`reflectedAt`'s shared key convention: plain at top level,
 * compound inside a repeatable (a plain field key would collide across
 * records). Only `applyAnswer`, `applyReflect` and `findPosition` need this. */
function compoundKey(blockId: string, recordIndex: number, key: string): string {
  return `${blockId}#${recordIndex}#${key}`;
}

/** What's left to do for one field, given the record it lives in (top-level
 * `ctx.answers`, or one repeatable record). `undefined` means fully done —
 * answered, and reflected if it needs to be. A text field with `interpret`
 * set that has a typed (non-null) value but no `reflectedAt` entry yet is
 * "reflect", not "done": R1-07's whole point is that such an answer resumes
 * into the reflect screen on a fresh mount rather than being skipped past.
 * An explicitly skipped field (`null`, via applySkip) never needs reflecting
 * — there is nothing typed to play back. */
function actionFor(
  step: Step,
  record: Record<string, AnswerValue>,
  reflectKey: string,
  answers: Answers,
): 'step' | 'reflect' | undefined {
  const key = storageKeyFor(step);
  if (!(key in record)) return 'step';
  const value = record[key];
  if (step.kind === 'text' && step.interpret && typeof value === 'string' && !(reflectKey in answers.reflectedAt)) {
    return 'reflect';
  }
  return undefined;
}

function positionFor(action: 'step' | 'reflect', step: Step, location: StepLocation): Position {
  return action === 'reflect' ? { kind: 'reflect', step, location } : { kind: 'step', step, location };
}

/** The first field in a repeatable's current record still needing action —
 * either unanswered, or answered-but-unreflected. Mirrors `actionFor` but
 * walks a whole record's fields, computing each one's compound reflect key. */
function nextFieldAction(
  fields: Step[],
  record: Record<string, AnswerValue>,
  blockId: string,
  recordIndex: number,
  answers: Answers,
): { action: 'step' | 'reflect'; step: Step } | undefined {
  for (const f of fields) {
    const action = actionFor(f, record, compoundKey(blockId, recordIndex, storageKeyFor(f)), answers);
    if (action) return { action, step: f };
  }
  return undefined;
}

/** The first thing left to do inside ONE module, or undefined when that
 * module is finished (or entirely skipped). Lifted out of `findPosition`
 * unchanged at V1.1 VB-05 so the module transition can be decided per
 * module, at the moment a module is about to hand back a position. */
function findInModule(
  module: Module,
  ctx: FlowContext,
  answers: Answers,
  declinedBlocks: ReadonlySet<string>,
): Position | undefined {
  for (const node of module.nodes) {
    if ('fields' in node) {
      if (node.skipIf?.(ctx)) continue;
      const records = answers.repeatables[node.id] ?? [];

      if (records.length === 0) {
        if (node.seedFrom) continue; // nothing seeded yet — nothing to ask here
        const result = nextFieldAction(node.fields, {}, node.id, 0, answers);
        if (!result) continue; // a repeatable with no fields shouldn't happen, but don't hang on it
        return positionFor(result.action, result.step, { in: 'repeatable', blockId: node.id, recordIndex: 0 });
      }

      const lastIndex = records.length - 1;
      const result = nextFieldAction(node.fields, records[lastIndex]!, node.id, lastIndex, answers);
      if (result) {
        return positionFor(result.action, result.step, { in: 'repeatable', blockId: node.id, recordIndex: lastIndex });
      }
      // "" means this block never asks — the schema's own words
      // (RepeatableBlock.addAnotherPrompt). Until V1.4 VB-20 this line read
      // `if (node.seedFrom) continue`, which said the same thing about the one
      // seeded block in the data but said it twice, in two files. Now the
      // prompt alone decides: a seeded block that carries one asks, and it is
      // `addAnotherName` (see the schema) that makes asking safe.
      if (!node.addAnotherPrompt) continue;
      if (declinedBlocks.has(node.id)) continue; // said "no more" this session — move on
      return { kind: 'add-another', block: node, recordIndex: records.length };
    }

    if (node.skipIf?.(ctx)) continue;
    const key = storageKeyFor(node);
    const action = actionFor(node, ctx.answers, key, answers);
    if (action) return positionFor(action, node, { in: 'top' });
  }
  return undefined;
}

/**
 * V1.1 VB-05: has anybody put anything into this module at all? A single
 * recorded value anywhere in it — including an explicit skip, which is
 * `null` rather than absent (see `applySkip`) — is enough.
 *
 * This is the whole of the module-transition rule. Nothing marks a
 * transition as seen, because nothing needs to: the act of answering the
 * first question inside a module is itself the record that the person is
 * past its opening (docs/ARCHITECTURE.md, "nothing derived is stored").
 * That is also exactly what makes a close/reopen resume correctly for free.
 *
 * A repeatable counts as touched only when it holds a record with at least
 * one field in it — `applyAddAnother` appends a literally empty `{}`, and
 * a seeded block's records are created by answering its seed question,
 * which is itself an answer in the same module.
 */
function moduleHasAnyAnswer(module: Module, answers: Answers): boolean {
  for (const node of module.nodes) {
    if ('fields' in node) {
      const records = answers.repeatables[node.id] ?? [];
      if (records.some((record) => Object.keys(record).length > 0)) return true;
      continue;
    }
    if (storageKeyFor(node) in answers.values) return true;
  }
  return false;
}

const NO_MODULE_IDS: ReadonlySet<string> = new Set<string>();

/**
 * @param seenIntros V1.1 VB-05 — module ids whose transition screen the
 * person has already continued past *in this session*. Ephemeral session
 * state owned by the panel, exactly like `declinedBlocks`: a transition
 * writes nothing to `wb:answers` (there is no question on it to answer), so
 * this is what stops it reappearing between "continue" and the first answer
 * given inside the module. Nothing is persisted — a genuine close/reopen
 * mid-module resumes past the transition because the module already holds
 * an answer, not because anything was written down.
 */
export function findPosition(
  modules: Module[],
  answers: Answers,
  declinedBlocks: ReadonlySet<string>,
  seenIntros: ReadonlySet<string> = NO_MODULE_IDS,
): Position {
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };

  for (let i = 0; i < modules.length; i++) {
    const module = modules[i]!;
    const found = findInModule(module, ctx, answers, declinedBlocks);
    if (!found) continue;
    // Never before the first module (VB-05): module 1 already opens with
    // `orientation_ready` and closes with `architecture_orientation`'s
    // beats, so a transition there would be a third welcome in a row.
    if (i > 0 && !seenIntros.has(module.id) && !moduleHasAnyAnswer(module, answers)) {
      return { kind: 'module-intro', module };
    }
    return found;
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
  // A module transition sits between two questions, so it borrows the index
  // of the one it is about to introduce — the bar reads the same on the
  // transition as on the first question behind it, rather than jumping back.
  if (position.kind === 'module-intro') {
    let before = 0;
    for (const module of modules) {
      if (module.id === position.module.id) break;
      before += module.nodes.length;
    }
    return Math.min(before + 1, questionCount(modules));
  }
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

function positionNodeId(position: Extract<Position, { kind: 'step' | 'reflect' }>): string {
  return position.location.in === 'top' ? position.step.id : position.location.blockId;
}

/** The module containing a position — for the "Question N of Total · Module title" eyebrow. */
export function moduleFor(modules: Module[], position: Position): Module | undefined {
  if (position.kind === 'done') return undefined;
  if (position.kind === 'module-intro') return position.module;
  const targetId = position.kind === 'add-another' ? position.block.id : positionNodeId(position);
  return modules.find((m) => m.nodes.some((node) => node.id === targetId));
}

/** The block with this id, wherever it sits in the flow. */
function blockById(modules: Module[], blockId: string): RepeatableBlock | undefined {
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node && node.id === blockId) return node;
    }
  }
  return undefined;
}

/**
 * V1.7 VB-38 — open ONE record of a repeatable block for editing, at its
 * first question.
 *
 * `core/flow/outline.ts`'s `positionForQuestionId` already resolves a
 * repeatable's field to `recordIndex: 0` — "there is no 'resume a specific
 * past record' screen", as its own comment says, because until now nothing
 * offered one. This is that screen's resolver, and it is the whole of the
 * "edit an existing one" half of VB-38: the same `{ kind: 'step' }` position
 * `Flow`'s `initialPosition` has accepted since R1-12, pointed at a record
 * the person picked instead of at the first one.
 *
 * The FIRST field, always, even when it is already answered — editing means
 * reviewing the record from the top, and `existingValue` re-populates each
 * field as it is reached, so nothing is retyped that was not changed. (An
 * unfinished record wants the opposite: see `positionForNewRecord`.)
 *
 * `undefined`, never a throw, when the block or its fields have gone — the
 * same degradation `positionForTarget` documents: the row does nothing new
 * rather than the panel breaking.
 */
export function positionForRecord(modules: Module[], blockId: string, recordIndex: number): Position | undefined {
  const step = blockById(modules, blockId)?.fields[0];
  if (!step) return undefined;
  return { kind: 'step', step, location: { in: 'repeatable', blockId, recordIndex } };
}

/**
 * V1.7 VB-38 — the same, for a record that was just added: its first
 * UNANSWERED field.
 *
 * A record added from the multiples screen is born holding its name (see
 * core/flow/multiples.ts's `applyAddRecord`), and for an open-ended block that
 * name is a real answer to a real question — `entity_name`, `initiative_name`.
 * Landing on a question that was just answered on the previous screen reads as
 * the panel not having heard, so the walk starts at the first thing genuinely
 * still to say.
 *
 * Falls back to the first field when everything is answered, which is what
 * makes this safe to call on any record: worst case it behaves exactly like
 * `positionForRecord`.
 *
 * Deliberately NOT `findPosition`. That derives the first thing left to do in
 * the WHOLE flow, which for a record added out of order would be some earlier
 * unanswered question in a different module entirely.
 */
export function positionForNewRecord(
  modules: Module[],
  answers: Answers,
  blockId: string,
  recordIndex: number,
): Position | undefined {
  const block = blockById(modules, blockId);
  const first = block?.fields[0];
  if (!block || !first) return undefined;
  const record = answers.repeatables[blockId]?.[recordIndex] ?? {};
  const step = block.fields.find((field) => !(storageKeyFor(field) in record)) ?? first;
  return { kind: 'step', step, location: { in: 'repeatable', blockId, recordIndex } };
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
    answeredAt: { ...answers.answeredAt, [compoundKey(blockId, recordIndex, key)]: at },
  };
}

/** Explicitly skipped, distinct from never-visited — see the R1-06 plan.
 * `null` is already a valid AnswerValue; nothing new needed to represent it. */
export function applySkip(answers: Answers, step: Step, location: StepLocation): Answers {
  return applyAnswer(answers, step, location, null);
}

/** R1-07: commits the reflect step's final choice — the raw text unchanged
 * (Keep) or the person's pasted, AI-tightened result (Tighten) — and stamps
 * `reflectedAt` so `findPosition` stops routing this question back through
 * the reflect screen. Deliberately separate from `applyAnswer`: a plain
 * re-answer (e.g. "Say it again") must NOT stamp `reflectedAt`, or the
 * retyped text would skip the reflect screen it's meant to go through. */
export function applyReflect(answers: Answers, step: Step, location: StepLocation, finalValue: string): Answers {
  const key = storageKeyFor(step);
  const at = new Date().toISOString();

  if (location.in === 'top') {
    return {
      ...answers,
      values: { ...answers.values, [key]: finalValue },
      reflectedAt: { ...answers.reflectedAt, [key]: at },
    };
  }

  const { blockId, recordIndex } = location;
  const nextRecords = [...(answers.repeatables[blockId] ?? [])];
  nextRecords[recordIndex] = { ...nextRecords[recordIndex], [key]: finalValue };
  return {
    ...answers,
    repeatables: { ...answers.repeatables, [blockId]: nextRecords },
    reflectedAt: { ...answers.reflectedAt, [compoundKey(blockId, recordIndex, key)]: at },
  };
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

/** The inverse of `findSeedTarget`: the question a seeded block's records are
 * built from. V1.4 VB-20 needs it because growing the block means writing to
 * that question's own answer, not only to the records. */
export function findSeedStep(modules: Module[], block: RepeatableBlock): Step | undefined {
  const questionId = block.seedFrom?.questionId;
  if (!questionId) return undefined;
  for (const module of modules) {
    for (const node of module.nodes) {
      if (!('fields' in node) && node.id === questionId) return node;
    }
  }
  return undefined;
}

/** Trimmed and case-folded, for comparing one typed name against names that
 * already exist. Names are the seeded block's identity — see
 * `seededNameTaken` — so "employee" and "Employee" have to count as the same
 * name, not as two. */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * V1.4 VB-20. Is this name already one of the block's records, or already one
 * of the seed question's selected values?
 *
 * NOT a nicety — it is the second half of the data-loss fix.
 * `reconcileSeededRepeatable` finds a record by matching its seed field
 * against the seed answer's LABEL, so two entries with the same name resolve
 * to the same record: the second one's answers would be dropped the next time
 * the seed question is re-submitted, silently, which is the exact failure this
 * task exists to prevent (docs/GUARDRAILS.md, "never lose an answer
 * silently"). Both sides are checked — a value and its label are different
 * strings ("employee" vs "Employee") and either one colliding is enough to
 * cause it.
 */
export function seededNameTaken(
  answers: Answers,
  block: RepeatableBlock,
  seedStep: Step,
  name: string,
): boolean {
  if (!block.seedFrom) return false;
  const { seedField } = block.seedFrom;
  const taken = new Set<string>();
  for (const record of answers.repeatables[block.id] ?? []) {
    const existing = record[seedField];
    if (typeof existing === 'string') taken.add(nameKey(existing));
  }
  const selected = answers.values[storageKeyFor(seedStep)];
  if (Array.isArray(selected)) {
    for (const value of selected) {
      taken.add(nameKey(value));
      const label = seedStep.options?.find((o) => o.v === value)?.l;
      if (label) taken.add(nameKey(label));
    }
  }
  return taken.has(nameKey(name));
}

/**
 * V1.4 VB-20 — adds one more record to a SEEDED block, the only way that can
 * be done without losing it again.
 *
 * A seeded block's records are not the record of what exists; the seed answer
 * is. `reconcileSeededRepeatable` rebuilds the array from that answer with
 * `selectedValues.map(...)`, so a record appended on its own — the way
 * `applyAddAnother` appends to an open-ended block — is deleted, along with
 * every field answered inside it, the next time someone goes Back to the seed
 * question and presses Next. No warning, no trace.
 *
 * So this writes BOTH: the name onto the seed answer (as a custom value,
 * exactly what "+ add your own" already puts there — see the panel's
 * `addCustom`) and the record it seeds. Written as a pair, the next reconcile
 * finds the record by its own name and keeps it: a no-op instead of a
 * deletion. That is the whole design.
 *
 * The record's seed field holds the name verbatim, which is also what
 * `reconcileSeededRepeatable` stores (an option's label, or the value itself
 * for a custom one — for a name typed here they are the same string), so the
 * two paths produce identical records and nothing downstream can tell which
 * made a given role.
 *
 * `answeredAt` is stamped for the seed question, whose stored value genuinely
 * changed. It is NOT stamped for the record's seed field: no question was
 * answered there — the name is seed data, and the seeded records
 * `reconcileSeededRepeatable` creates carry no stamp either.
 *
 * Refuses (returning `answers` untouched) rather than half-applying when the
 * name is blank or already taken — see `seededNameTaken`.
 */
export function applySeededAddAnother(
  answers: Answers,
  block: RepeatableBlock,
  seedStep: Step,
  name: string,
): Answers {
  if (!block.seedFrom) return answers;
  const trimmed = name.trim();
  if (trimmed === '') return answers;
  if (seededNameTaken(answers, block, seedStep, trimmed)) return answers;

  const seedKey = storageKeyFor(seedStep);
  const selected = answers.values[seedKey];
  const nextSelected = [...(Array.isArray(selected) ? selected : []), trimmed];
  const records = answers.repeatables[block.id] ?? [];
  return {
    ...answers,
    values: { ...answers.values, [seedKey]: nextSelected },
    repeatables: {
      ...answers.repeatables,
      [block.id]: [...records, { [block.seedFrom.seedField]: trimmed }],
    },
    answeredAt: { ...answers.answeredAt, [seedKey]: new Date().toISOString() },
  };
}
