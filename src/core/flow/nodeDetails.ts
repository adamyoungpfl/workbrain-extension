import type { AnswerValue, FileOutlineNode, FlowContext, Module, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import type { FlowLookups } from '../files/lookups';
import { bodyFieldsFor, buildFlowLookups, keyOf, resolvePhrase } from '../files/lookups';
import { formatAnswerValue, repeatableRecordTitle } from '../files/generate';
import { contextModules } from './flow';

/**
 * V1.4 VB-23 — what one outline node actually holds, as cells for a grid.
 *
 * The globe's sub-node split needs an information panel, and an information
 * panel needs information. This is that fold: an outline node plus `wb:answers`
 * in, a flat list of `label: value` cells out.
 *
 * It lives in `core/` and not beside BrainGlobe.tsx because it is a pure fold
 * over stored answers with real edge cases worth testing without a browser —
 * an explicitly skipped question, a seeded repeatable carrying three records,
 * a section whose own question list holds nothing. The component receives the
 * finished cells and decides only where to draw them (docs/ARCHITECTURE.md,
 * "if logic is worth testing it belongs in core").
 *
 * ── It says what the file says, not something close to it ─────────────────
 *
 * Every cell is built from the same two functions the generated Context.md is
 * built from — `formatAnswerValue` and `repeatableRecordTitle` in
 * core/files/generate.ts — so a role's title in the panel is the same string
 * as the heading in the downloaded file, and a chosen option resolves to the
 * same label. A second formatter would agree today and drift by V1.6, and a
 * panel telling somebody they said something slightly different from what
 * their own file says is worse than a panel with nothing in it.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 *
 * It never invents a cell. A question nobody has answered yet is absent, not
 * present-and-blank: `2.1 Roles` before the interview reaches it produces zero
 * cells, and the panel says so in one sentence rather than drawing five empty
 * boxes. An *explicitly skipped* question is a different thing and does get a
 * cell, carrying generate.ts's own `SKIPPED_ANSWER_MARKER` — the person
 * answered it, and "left unanswered on purpose" is an answer (see
 * docs/ARCHITECTURE.md, "wb:answers, precisely").
 */

export interface NodeDetail {
  /**
   * Which record this cell belongs to — a role's name, an entity's name — or
   * `''` for the section's own top-level answers. Cells arrive already grouped
   * and in file order, so a renderer starts a new heading whenever this
   * changes and never has to sort anything.
   */
  group: string;
  /** The question that was asked, resolved exactly as the file resolves it. */
  label: string;
  /** What the person said, flattened to a single line. Never empty. */
  value: string;
  /**
   * Whether this cell wants a whole row to itself rather than sitting beside
   * another. Decided here rather than in CSS because it is a fact about the
   * content's length, and the split panel gives the grid about 90px a column —
   * narrow enough that "does this fit" has one answer, not a media query's
   * worth. See `WIDE_VALUE_CHARS`.
   */
  wide: boolean;
}

/**
 * The threshold behind `wide`, in characters — and it reads the ANSWER, never
 * the question.
 *
 * That is not an oversight, it is the finding that settled the split's
 * proportions. The real questions are whole spoken sentences: "Is this your
 * primary role, a secondary role, or something occasional?" is 66 characters,
 * and every one of `2.1 Roles`' thirteen cells would be "wide" if the question
 * decided — which is not a grid, it is a list with extra steps. The answers to
 * those same questions are "My employer", "Primary", "Current": three words
 * that sit beside each other comfortably. So the answer is the cell's content
 * and sets its width, and the question is a caption under it (BrainGlobe.css
 * clamps that caption to two lines and keeps the whole of it in `title`).
 *
 * A grid column is ~90px at the panel's own 400px width, about 16 characters
 * of the 12px value. 24 is a line and a half: past that a two-up cell becomes
 * a column of one-word lines, which is harder to read than one wide cell and
 * looks like a bug.
 */
const WIDE_VALUE_CHARS = 24;

const isWide = (value: string) => value.length > WIDE_VALUE_CHARS;

/**
 * The second half of the width rule: a short cell with nobody to sit beside
 * takes the row anyway.
 *
 * The grid is two columns, so a run of short cells pairs up two at a time and
 * an odd one out would leave a hole the width of a whole column — which, at
 * 400px, is a third of the panel showing nothing. The real `2.1 Roles` hits
 * this on every record: "Who or what is this role for?" is short, the mandate
 * after it is long, so the first cell of every role was stranding half a row.
 *
 * Done here rather than with CSS `grid-auto-flow: dense`, which fixes the hole
 * by moving a later cell up into it. That would put the panel's visual order
 * out of step with its DOM order, and the DOM order is the order a screen
 * reader reads and the order the person's own file is written in
 * (WCAG 1.3.2). Widening one cell keeps every cell where it belongs.
 */
function pairUp(details: NodeDetail[]): NodeDetail[] {
  let runStart = 0;
  for (let i = 0; i <= details.length; i++) {
    const cell = details[i];
    // A run ends at a wide cell, at a change of group, or at the end.
    const breaks = !cell || cell.wide || cell.group !== details[runStart]?.group;
    if (!breaks) continue;
    const runLength = i - runStart;
    if (runLength > 0 && runLength % 2 === 1) details[i - 1] = { ...details[i - 1]!, wide: true };
    runStart = cell && cell.wide ? i + 1 : i;
  }
  return details;
}

/**
 * One line, whichever shape the answer was stored in.
 *
 * A multi-select is stored as a `string[]` and `formatAnswerValue` renders it
 * as `- one\n- two`, which in a cell is "one, two". A long text answer is one
 * string that may hold its own newlines, and those collapse to spaces — a
 * paragraph joined with commas would read as a list the person never wrote.
 */
function oneLine(stored: AnswerValue | undefined, formatted: string): string {
  if (Array.isArray(stored)) {
    return formatted
      .split('\n')
      .map((line) => line.replace(/^- /, '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return formatted.replace(/\s+/g, ' ').trim();
}

function cell(step: Step, stored: AnswerValue | undefined, group: string, ctx: FlowContext): NodeDetail | null {
  // `yesno` gates a repeatable and `intro` is a narrative beat — neither is
  // content, and neither is printed in the file either.
  if (step.kind === 'yesno' || step.kind === 'intro') return null;
  const formatted = formatAnswerValue(step, stored);
  if (!formatted) return null;
  const label = resolvePhrase(step.q, ctx);
  const value = oneLine(stored, formatted);
  if (!value) return null;
  return { group, label, value, wide: isWide(value) };
}

/** The fold itself, against lookups somebody else built — so walking a whole
 * outline builds them once rather than once per node. */
function detailsFor(
  node: FileOutlineNode,
  answers: Pick<Answers, 'values' | 'repeatables'>,
  lookups: FlowLookups,
  ctx: FlowContext,
): NodeDetail[] {
  const details: NodeDetail[] = [];
  const blocksSeen = new Set<string>();

  for (const questionId of node.questionIds) {
    const block = lookups.repeatableBlockForQuestionId.get(questionId);
    if (block) {
      blocksSeen.add(block.id);
      continue;
    }
    const step = lookups.stepsById.get(questionId);
    if (!step) continue;
    // By question id, not `keyOf` — a top-level answer is stored under its id
    // and generate.ts reads it the same way. `keyOf` is a repeatable field's
    // convention and is used below, inside a record.
    const built = cell(step, answers.values[questionId], '', ctx);
    if (built) details.push(built);
  }

  for (const blockId of blocksSeen) {
    const block = lookups.repeatableBlocksById.get(blockId);
    if (!block) continue;
    // A seeded block's title is its seed value, so every field is a cell. An
    // open-ended block's title is its NAME field's own answer, and generate.ts
    // drops that field from the body for exactly the same reason — printing it
    // as a cell would print the heading twice. One resolver decides which
    // field that is (V2.0 VB-62), so this cannot drift from
    // `renderRepeatableRecord`.
    const bodyFields = bodyFieldsFor(block);
    for (const record of answers.repeatables[blockId] ?? []) {
      const group = repeatableRecordTitle(block, record);
      for (const field of bodyFields) {
        const built = cell(field, record[keyOf(field)], group, ctx);
        if (built) details.push(built);
      }
    }
  }

  return pairUp(details);
}

/**
 * The cells for one outline node — its own answered questions first, then one
 * group per record of any repeatable block that belongs to it.
 *
 * Children are NOT walked. A node's children are their own nodes on the globe
 * with their own panels, and rolling `2.1 Roles` up into `2. About Me` would
 * make the parent's panel a copy of all five of its children's.
 */
export function nodeDetails(
  node: FileOutlineNode,
  answers: Pick<Answers, 'values' | 'repeatables'>,
  modules: Module[] = contextModules,
): NodeDetail[] {
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  return detailsFor(node, answers, buildFlowLookups(modules), ctx);
}

/**
 * Every node's cells, keyed by node id, children included — the shape a
 * renderer wants when it holds the whole outline and does not yet know which
 * node will be picked.
 *
 * One set of lookups for the whole tree, because the alternative is rebuilding
 * them fifteen times on every keystroke of the interview: the drawer holding
 * this is mounted for the whole session.
 */
export function nodeDetailsByNode(
  outline: readonly FileOutlineNode[],
  answers: Pick<Answers, 'values' | 'repeatables'>,
  modules: Module[] = contextModules,
): Record<string, NodeDetail[]> {
  const lookups = buildFlowLookups(modules);
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  const out: Record<string, NodeDetail[]> = {};
  const walk = (nodes: readonly FileOutlineNode[]) => {
    for (const node of nodes) {
      out[node.id] = detailsFor(node, answers, lookups, ctx);
      if (node.children) walk(node.children);
    }
  };
  walk(outline);
  return out;
}
