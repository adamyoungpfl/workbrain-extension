import type { AnswerValue, FileOutlineNode, FlowContext, Module, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { outlineNodeCurrent, outlineNodeReached } from '../flow/outline';
import { daysSince, isDue, roughElapsed } from './clocks';
import type { Elapsed } from './clocks';
import { halfLifeFor } from './halfLives';

/**
 * V1.3 VB-19 — every file section's own health, derived.
 *
 * NOTHING HERE IS STORED. This is a fold over `wb:answers` plus the question
 * currently on screen, recomputed on every render, exactly like
 * `core/flow/outline.ts`'s three-way section state and `findPosition`'s
 * "which question am I on" (docs/ARCHITECTURE.md, "nothing derived is
 * stored"). There is no health record to go stale against the answers that
 * decide it: change an answer and the row changes, with no other action.
 *
 * `now` is an injected parameter and never read internally, the same
 * discipline `clocks.ts` holds itself to, so every boundary case in
 * `sectionHealth.test.ts` is a real repeatable assertion rather than a
 * snapshot of the day the suite happened to run.
 *
 * ── The five states ───────────────────────────────────────────────────────
 *
 *   here     the section being answered right now (from the live Position)
 *   done     every question answered, still inside its own half-life
 *   due      finished, but aged past that half-life (halfLives.ts)
 *   partly   some answered, some skipped, some still to go
 *   not-yet  nothing here at all
 *
 * `here` wins over everything: the section you are typing into is not usefully
 * described as "partly", and a pill telling somebody a section is incomplete
 * while they are in the middle of completing it is noise.
 *
 * `due` only ever applies to a *finished* section. A half-answered section is
 * already "partly" — that is the more actionable of the two, and stacking a
 * second flavour of "needs you" on it would just make the list shout.
 *
 * ── Counting: what "8 of 8" actually counts ───────────────────────────────
 *
 * The honest denominator is "questions the flow would really ask you, given
 * what you have already said" — not the raw length of `questionIds`. Three
 * things make those differ, and this file mirrors `core/flow/runner.ts`'s
 * `findInModule` on all three rather than reimplementing the rules:
 *
 * 1. **Intro steps are not questions.** `orientation_ready` and
 *    `architecture_orientation` are narrative beats with nothing to answer.
 *    Counting them would tell somebody a section has four questions when it
 *    has two.
 * 2. **A gate that says "no" removes its whole block.** Answer "no" to
 *    `entities_gate` and the four `entity_*` fields are never asked, so
 *    3. My World is genuinely "1 of 1" and genuinely finished. Counting the
 *    hidden fields would leave it permanently stuck at "1 of 5".
 * 3. **A repeatable's fields are counted per record.** Three roles is three
 *    sets of role questions, because that is what the file holds and what the
 *    person actually answered. A seeded block with no records yet (`roles`
 *    before `role_names` is answered) contributes nothing, exactly as the
 *    runner asks nothing there.
 *
 * A parent section rolls its children up: 2. About Me counts its own three
 * questions plus everything under 2.1–2.5, so the parent row is a true
 * summary of what is behind it rather than a third of the story. Staleness
 * still uses each node's OWN half-life for its OWN questions, so a stale role
 * makes the parent due on the roles clock, not on the parent's.
 */

/** One question the flow really asks, and what is recorded against it. */
interface Slot {
  /** `undefined` — never reached. `null` — explicitly skipped (runner.ts's
   * `applySkip`). Anything else — answered with content. */
  value: AnswerValue | undefined;
  /** Whether it was ever recorded at all, so a stored `null` is told apart
   * from a key that is simply absent. */
  recorded: boolean;
  /** The `answeredAt` stamp for this exact slot, using the same key
   * convention `wb:answers` does (plain at top level, `block#index#field`
   * inside a repeatable). */
  answeredAt: string | undefined;
}

export type SectionHealthState = 'here' | 'done' | 'due' | 'partly' | 'not-yet';

export interface SectionHealth {
  id: string;
  state: SectionHealthState;
  /** Questions the flow would really ask here, this section and everything
   * under it — the denominator in "8 of 8". */
  total: number;
  /** Answered with content. An explicit skip is not one of these. */
  answered: number;
  /** Explicitly skipped — asked, and passed on. */
  skipped: number;
  /** Never reached: `total - answered - skipped`. */
  left: number;
  /** Answered questions now past their own section's half-life. */
  due: number;
  /** The most recent stamp anywhere in the section, or null. */
  lastAnsweredAt: string | null;
  /** Whole days since `lastAnsweredAt`, or null when there is nothing. */
  ageDays: number | null;
  /** `ageDays` at human scale, for copy ("7 months"). Null with nothing. */
  elapsed: Elapsed | null;
  /** The clock applied to this node's own questions (halfLives.ts). Exposed
   * so the table stays inspectable from a test and from a row's markup. */
  halfLifeDays: number;
}

/** A section's own tally, before its children are rolled in. */
interface Tally {
  total: number;
  answered: number;
  skipped: number;
  due: number;
  lastAnsweredAt: string | null;
}

/** runner.ts's `storageKeyFor`, which is not exported and is one line. Kept
 * identical on purpose: a slot that reads a different key than the runner
 * writes would count every answer as missing. */
function storageKeyFor(step: Step): string {
  return step.outKey ?? step.key ?? step.id;
}

/** `answeredAt`'s compound key inside a repeatable — runner.ts's
 * `compoundKey`, same reason as above. */
function compoundKey(blockId: string, recordIndex: number, key: string): string {
  return `${blockId}#${recordIndex}#${key}`;
}

function slotFor(record: Record<string, AnswerValue>, key: string, stamp: string | undefined): Slot {
  return { value: record[key], recorded: key in record, answeredAt: stamp };
}

/**
 * Every question slot belonging to this node ITSELF — not its children, whose
 * ids live on their own nodes and are rolled up by `sectionHealthFor`.
 *
 * Walks the modules rather than the id list, because whether a question gets
 * asked is a property of the flow (gates, blocks, record counts) and not of
 * the outline. The outline only says which section a question lands in.
 */
function slotsForNode(modules: Module[], node: FileOutlineNode, answers: Answers): Slot[] {
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  const ids = new Set(node.questionIds);
  const slots: Slot[] = [];

  for (const module of modules) {
    for (const candidate of module.nodes) {
      if ('fields' in candidate) {
        const mine = candidate.fields.filter((field) => ids.has(field.id) && field.kind !== 'intro');
        if (mine.length === 0) continue;
        // A gate answered "no" (or a seed left empty) takes the whole block
        // out of the interview — `findInModule` skips it, so it is not work
        // anybody is being asked to do.
        if (candidate.skipIf?.(ctx)) continue;

        const records = answers.repeatables[candidate.id] ?? [];
        if (records.length === 0) {
          // Seeded blocks ask nothing until their seed question creates
          // records; open-ended ones ask their first record's fields.
          if (candidate.seedFrom) continue;
          for (const field of mine) {
            const key = storageKeyFor(field);
            slots.push(slotFor({}, key, answers.answeredAt[compoundKey(candidate.id, 0, key)]));
          }
          continue;
        }

        records.forEach((record, recordIndex) => {
          for (const field of mine) {
            const key = storageKeyFor(field);
            slots.push(slotFor(record, key, answers.answeredAt[compoundKey(candidate.id, recordIndex, key)]));
          }
        });
        continue;
      }

      if (!ids.has(candidate.id) || candidate.kind === 'intro') continue;
      if (candidate.skipIf?.(ctx)) continue;
      const key = storageKeyFor(candidate);
      slots.push(slotFor(answers.values, key, answers.answeredAt[key]));
    }
  }

  return slots;
}

function tally(slots: Slot[], halfLifeDays: number, now: Date): Tally {
  let answered = 0;
  let skipped = 0;
  let due = 0;
  let lastAnsweredAt: string | null = null;

  for (const slot of slots) {
    if (slot.answeredAt && (!lastAnsweredAt || slot.answeredAt > lastAnsweredAt)) lastAnsweredAt = slot.answeredAt;
    if (!slot.recorded) continue;
    if (slot.value === null) {
      skipped++;
      continue;
    }
    answered++;
    if (slot.answeredAt && isDue(slot.answeredAt, now, halfLifeDays)) due++;
  }

  return { total: slots.length, answered, skipped, due, lastAnsweredAt };
}

/** ISO strings sort lexicographically, which is the whole reason
 * `answeredAt` stores them as strings — see `mostRecentAnsweredAt`. */
function later(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return b > a ? b : a;
}

function merge(a: Tally, b: Tally): Tally {
  return {
    total: a.total + b.total,
    answered: a.answered + b.answered,
    skipped: a.skipped + b.skipped,
    due: a.due + b.due,
    lastAnsweredAt: later(a.lastAnsweredAt, b.lastAnsweredAt),
  };
}

/**
 * `not-yet` is deliberately tied to the tree's OWN definition of untouched
 * (`outlineNodeReached`) as well as to the count.
 *
 * The two can in principle disagree, because an intro beat is recorded in
 * `values` but is not a countable question: a section whose only recorded id
 * is a beat is "reached" to the tree — so its row is a real link — while
 * nothing in it has been answered. Letting that row also say "Not yet" would
 * have one row contradicting itself, so the count wins the wording ("0 of 2")
 * and the tree wins the state. In the shipped flow this is unreachable (the
 * only such section is the one you are standing in while it happens, which
 * resolves to `here`); the guard is here so a future outline change cannot
 * quietly introduce it.
 */
function stateFor(
  node: FileOutlineNode,
  rolled: Tally,
  answers: Answers,
  currentQuestionId: string | null,
): SectionHealthState {
  if (outlineNodeCurrent(node, currentQuestionId)) return 'here';
  if (rolled.answered + rolled.skipped === 0 && !outlineNodeReached(node, answers.values)) return 'not-yet';
  if (rolled.total > 0 && rolled.answered === rolled.total) return rolled.due > 0 ? 'due' : 'done';
  return 'partly';
}

/**
 * One section's health, rolled up over its children.
 *
 * Recurses through `into` so a single walk produces the whole map — a caller
 * rendering the tree needs every child's health too, and computing each one
 * independently would re-walk the modules once per node.
 */
function collect(
  node: FileOutlineNode,
  modules: Module[],
  answers: Answers,
  currentQuestionId: string | null,
  now: Date,
  into: Record<string, SectionHealth>,
): Tally {
  const halfLifeDays = halfLifeFor(node.id);
  let rolled = tally(slotsForNode(modules, node, answers), halfLifeDays, now);
  for (const child of node.children ?? []) {
    rolled = merge(rolled, collect(child, modules, answers, currentQuestionId, now, into));
  }

  const ageDays = rolled.lastAnsweredAt ? daysSince(rolled.lastAnsweredAt, now) : null;
  into[node.id] = {
    id: node.id,
    state: stateFor(node, rolled, answers, currentQuestionId),
    total: rolled.total,
    answered: rolled.answered,
    skipped: rolled.skipped,
    left: Math.max(0, rolled.total - rolled.answered - rolled.skipped),
    due: rolled.due,
    lastAnsweredAt: rolled.lastAnsweredAt,
    ageDays,
    elapsed: ageDays === null ? null : roughElapsed(ageDays),
    halfLifeDays,
  };
  return rolled;
}

/**
 * Health for every node in the outline, children included, keyed by node id.
 *
 * One object for the whole tree rather than a function a row calls: the rows
 * are rendered recursively and a per-row call would walk all twelve modules
 * once per row, thirty-odd times, on every keystroke of the interview.
 */
export function sectionHealthMap(
  outline: FileOutlineNode[],
  modules: Module[],
  answers: Answers,
  currentQuestionId: string | null,
  now: Date,
): Record<string, SectionHealth> {
  const map: Record<string, SectionHealth> = {};
  for (const node of outline) collect(node, modules, answers, currentQuestionId, now, map);
  return map;
}

/** One section, for a caller that genuinely only wants one. */
export function sectionHealthFor(
  node: FileOutlineNode,
  modules: Module[],
  answers: Answers,
  currentQuestionId: string | null,
  now: Date,
): SectionHealth {
  const map: Record<string, SectionHealth> = {};
  collect(node, modules, answers, currentQuestionId, now, map);
  return map[node.id] as SectionHealth;
}

export interface SectionHealthSummary {
  here: number;
  done: number;
  due: number;
  partly: number;
  notYet: number;
  /** Sections carrying something to come back to — due plus partly. Zero is
   * what "nothing needs you" means, and it is deliberately a count of real
   * things rather than a score (docs/GUARDRAILS.md: no composite score). */
  needsAttention: number;
}

/**
 * The counts across the top of the list.
 *
 * TOP-LEVEL SECTIONS ONLY, matching the "N of M sections" the drawer already
 * prints and the ten rows a person sees before expanding anything. Counting
 * children too would make the totals disagree with the list they sit above.
 *
 * This exists because VB-19 fixes the list in FILE ORDER — the list *is* the
 * file, and resorting it by urgency would stop it matching the thing it
 * represents. These counts do the "what needs attention" job instead, which
 * is the whole reason file order is affordable.
 */
export function summariseSectionHealth(
  outline: FileOutlineNode[],
  health: Record<string, SectionHealth>,
): SectionHealthSummary {
  const summary: SectionHealthSummary = { here: 0, done: 0, due: 0, partly: 0, notYet: 0, needsAttention: 0 };
  for (const node of outline) {
    const state = health[node.id]?.state;
    if (state === 'here') summary.here++;
    else if (state === 'done') summary.done++;
    else if (state === 'due') summary.due++;
    else if (state === 'partly') summary.partly++;
    else if (state === 'not-yet') summary.notYet++;
  }
  summary.needsAttention = summary.due + summary.partly;
  return summary;
}
