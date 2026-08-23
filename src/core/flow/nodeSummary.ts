import type { AnswerValue, FileOutlineNode, FlowContext, Module, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import type { Elapsed } from '../freshness/clocks';
import type { SectionHealth } from '../freshness/sectionHealth';
import { formatAnswerValue } from '../files/generate';
import { keyOf, resolvePhrase } from '../files/lookups';
import { contextModules } from './flow';
import { repeatableBlocksForNode } from './outline';

/**
 * V1.5 VB-27 — what one node holds, in one glance.
 *
 * The fold behind the floating summary a secondary node shows on hover, on
 * focus and on activation: an outline node plus `wb:answers` plus the health
 * the panel already derived, in — a count, a set of categories and two real
 * metrics, out.
 *
 * ── It is NOT a second nodeDetails ────────────────────────────────────────
 *
 * `./nodeDetails.ts` answers "what does this node say", cell by cell, for the
 * panel that opens when a sub-node is picked. This answers the cheaper
 * question the summary asks — "how much is in here, of what kinds, and how
 * old is it" — and it deliberately never carries an answer's text. A summary
 * that quoted the person's own sentences would be the detail panel drawn
 * smaller, and hovering would then be the same act as picking.
 *
 * That rule is why the only categories here are a DISTRIBUTION over records
 * (three roles, two of them for an employer) and never a re-listing of a
 * multi-select answer. Both are shapes you could honestly call "categories";
 * only one of them is a fact about the node rather than a copy of what
 * somebody wrote, and the other one is already on the detail panel next door.
 *
 * The two agree by construction where they overlap: both read the records
 * through `repeatableBlocksForNode` and resolve an option to its label through
 * `formatAnswerValue`, so a category here is spelled exactly as the same
 * answer is spelled in the generated file.
 *
 * ── REAL METRICS ONLY ─────────────────────────────────────────────────────
 *
 * Counts, names and one date. There is no score in this type and nowhere to
 * put one — the same discipline `core/recommend/types.ts` holds itself to, for
 * the same reason: docs/GUARDRAILS.md rules out "a composite score out of 100.
 * Real metrics only", and a shape with no field for a percentage cannot grow
 * one by accident. `answered`/`total` are two counts printed as two counts;
 * they are never divided.
 *
 * ── Nothing is stored ─────────────────────────────────────────────────────
 *
 * Recomputed from `wb:answers` on every render, exactly like the health it is
 * handed and the details beside it (docs/ARCHITECTURE.md, "nothing derived is
 * stored"). There is no summary cache, and there is nothing here that could go
 * stale against the answers that decide it.
 *
 * ── No copy in here ───────────────────────────────────────────────────────
 *
 * Not one sentence. The counts come out as numbers and the categories come out
 * as the file's own option labels; the words around them live in
 * `src/panel/strings.ts` where CLAUDE.md says every user-facing string lives
 * and where the reading-level check can see them. That is also what lets the
 * summary and a future surface print the same node at two different lengths
 * without either owning the wording.
 */

/** One category and how many of this node's items are in it. */
export interface NodeSummaryCategory {
  /** The option's own label, resolved exactly as the generated file spells
   * it — "My employer", not "employer". */
  label: string;
  count: number;
}

/**
 * What an item IS in this node, which is a fact about the node's shape rather
 * than a wording choice.
 *
 *   `record` — the node owns a repeatable block and the items are its records:
 *              three roles, four people, two projects. Countable things the
 *              person named.
 *   `answer` — the node has no records, so the items are the questions in it
 *              that have been answered. A section of plain questions has no
 *              other honest unit.
 */
export type NodeSummaryItemKind = 'record' | 'answer';

export interface NodeSummary {
  nodeId: string;
  /** The file's own name for the node, e.g. "2.1 Roles". The globe's short
   * name is core/flow/globeLabels.ts's job and is a different question — and
   * the two together are why this is worth carrying: the stage prints the
   * short one, so the file's real name is genuinely new information. */
  label: string;
  /** How many items. Never zero — a node with nothing in it has no summary at
   * all, which is what a `null` return below is for. */
  items: number;
  itemKind: NodeSummaryItemKind;
  /** The question the categories group by, in the file's own words, or `''`
   * when there is nothing to group by. Carried so the panel can say what the
   * categories ARE rather than printing a bare row of labels. */
  categoryBy: string;
  /** Biggest first, then alphabetical. Capped — see CATEGORY_LIMIT. */
  categories: NodeSummaryCategory[];
  /** Categories real but not listed, because of the cap. Zero almost always. */
  categoriesHidden: number;
  /** Straight from `SectionHealth`, carried rather than re-derived so the
   * summary and the List mode's row can never disagree about one section.
   * Both are 0 when the caller has no health for this node, which is a real
   * state (the globe runs as a showcase with no flow state at all) and the
   * panel prints no metrics line for it rather than "0 of 0". */
  answered: number;
  total: number;
  skipped: number;
  /** Whole days since the newest answer anywhere in the node, or null. */
  ageDays: number | null;
  /** The same age at human scale, for copy ("3 months"). Null with nothing. */
  elapsed: Elapsed | null;
}

/**
 * How many categories a summary lists.
 *
 * Four, and the cap is about the panel and not about the data: the card is
 * ~250px wide at the size the drawer opens Brain at, and a fifth row pushes the
 * metrics line past the half of the stage the card is allowed (it must never
 * cover the node it describes — BrainGlobe.css). The count of what is left over
 * is carried (`categoriesHidden`) rather than dropped, so the panel can say so
 * instead of quietly under-reporting the file.
 */
export const CATEGORY_LIMIT = 4;

/**
 * Which field the items are grouped by: the block's first single select.
 *
 * By SHAPE, not by a table of ids. A single-select field is the one kind of
 * question in this interview whose answers form a small closed set, which is
 * what makes a distribution over it meaningful — and the first one in each
 * block is, in every block the file has, the question that says what kind of
 * thing the record is: `entity_type` for a person or tool in My World (the
 * example docs/V1.5-REFINEMENT.md gives), `role_for` for a role, and
 * `initiative_status` for a project.
 *
 * A table of ids would have produced the same three answers today and gone
 * silently wrong the first time a block was reordered or added.
 */
function categoryField(block: { fields: Step[] }): Step | undefined {
  return block.fields.find((field) => field.kind === 'chips');
}

function tallyCategories(
  field: Step,
  records: readonly Record<string, AnswerValue>[],
): { categories: NodeSummaryCategory[]; hidden: number } {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = record[keyOf(field)];
    // `undefined` never reached it, `null` was passed on. Neither is a
    // category, and inventing an "unanswered" bucket would turn a summary of
    // what somebody wrote into a list of what they did not.
    if (value === undefined || value === null) continue;
    const label = formatAnswerValue(field, value);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const all = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    // Biggest first; ties alphabetical, so the order is the same on every
    // render rather than the order a Map happened to be filled in.
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.label < b.label ? -1 : 1));

  return { categories: all.slice(0, CATEGORY_LIMIT), hidden: Math.max(0, all.length - CATEGORY_LIMIT) };
}

function summaryFrom(
  node: FileOutlineNode,
  answers: Pick<Answers, 'values' | 'repeatables'>,
  health: SectionHealth | undefined,
  ctx: FlowContext,
  modules: Module[],
): NodeSummary | null {
  const answered = health?.answered ?? 0;

  // The records this node owns, across every block that belongs to it —
  // `repeatableBlocksForNode` is the same resolver the file tree uses, so a
  // node's records here are exactly the records the file prints under it.
  const blocks = repeatableBlocksForNode(modules, node);
  const records = blocks.flatMap((block) => answers.repeatables[block.id] ?? []);

  let items = records.length;
  let itemKind: NodeSummaryItemKind = 'record';
  let categoryBy = '';
  let categories: NodeSummaryCategory[] = [];
  let categoriesHidden = 0;

  if (items > 0) {
    for (const block of blocks) {
      const field = categoryField(block);
      const blockRecords = answers.repeatables[block.id] ?? [];
      if (!field || blockRecords.length === 0) continue;
      const tallied = tallyCategories(field, blockRecords);
      if (tallied.categories.length === 0) continue;
      categoryBy = resolvePhrase(field.q, ctx);
      categories = tallied.categories;
      categoriesHidden = tallied.hidden;
      break;
    }
  } else {
    // No records — either the node has no blocks at all, or its gate took them
    // out of the interview. Either way the items are the answers.
    items = answered;
    itemKind = 'answer';
  }

  if (items === 0) return null;

  return {
    nodeId: node.id,
    label: node.label,
    items,
    itemKind,
    categoryBy,
    categories,
    categoriesHidden,
    answered,
    total: health?.total ?? 0,
    skipped: health?.skipped ?? 0,
    ageDays: health?.ageDays ?? null,
    elapsed: health?.elapsed ?? null,
  };
}

/**
 * One node's summary, or `null` when there is nothing in it yet.
 *
 * `null` is the whole gate on this feature: docs/V1.5-REFINEMENT.md says the
 * summary appears "where a secondary node HAS ITEMS", and a node with nothing
 * in it has nothing to summarise. The panel shows no floating panel at all
 * there rather than an empty one saying so — an empty tooltip is a tooltip
 * that taught somebody hovering is not worth doing.
 */
export function nodeSummaryFor(
  node: FileOutlineNode,
  answers: Pick<Answers, 'values' | 'repeatables'>,
  health: SectionHealth | undefined,
  modules: Module[] = contextModules,
): NodeSummary | null {
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  return summaryFrom(node, answers, health, ctx, modules);
}

/**
 * Every node's summary, keyed by node id, children included — the shape the
 * globe wants when it holds the whole outline and does not yet know which node
 * a pointer will land on.
 *
 * Nodes with nothing in them are ABSENT from the map rather than present as
 * `null`, so `id in summaries` is the same question as "does this node have
 * items".
 */
export function nodeSummaries(
  outline: readonly FileOutlineNode[],
  answers: Pick<Answers, 'values' | 'repeatables'>,
  health: Readonly<Record<string, SectionHealth>>,
  modules: Module[] = contextModules,
): Record<string, NodeSummary> {
  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  const out: Record<string, NodeSummary> = {};
  const walk = (nodes: readonly FileOutlineNode[]) => {
    for (const node of nodes) {
      const summary = summaryFrom(node, answers, health[node.id], ctx, modules);
      if (summary) out[node.id] = summary;
      if (node.children) walk(node.children);
    }
  };
  walk(outline);
  return out;
}
