import type { Elapsed } from '../freshness/clocks';

/**
 * V1.5 VB-28 — what a recommendation IS, as a type.
 *
 * ── Real metrics only ─────────────────────────────────────────────────────
 *
 * Every variant below carries counts, names and dates and NOTHING ELSE. There
 * is no `score`, no `health`, no `percent`, and there is deliberately nowhere
 * to put one: docs/GUARDRAILS.md rules out "a composite score out of 100. Real
 * metrics only", and a type with no field for a score cannot grow one by
 * accident. `rank` is the one number here that is not shown to anybody — see
 * ./weights.ts, which explains why it is an ordering key and never a reading.
 *
 * ── No sentences in here ──────────────────────────────────────────────────
 *
 * A recommendation carries `kind` plus the facts behind it; the wording lives
 * in src/panel/strings.ts, where CLAUDE.md says every user-facing string
 * lives and where the reading-level check can see it. That split is also what
 * lets VB-27's node summary and Home print the same recommendation at two
 * different lengths without either of them owning the copy.
 *
 * ── Node-addressable ──────────────────────────────────────────────────────
 *
 * Every recommendation names the outline node it belongs to (`nodeId`) and a
 * concrete place to go and act (`target`). VB-27 attaches recommendations to
 * the node summary by grouping on `nodeId`; Home turns `target` into a real
 * `Position` (./targets.ts) and deep-links straight at the question.
 */

/** The structural gaps this engine can see, all derivable from `wb:answers`.
 *
 * There is deliberately no qualitative kind here — no "this answer is vague",
 * no "this could be more specific". That half is a judgment about content,
 * `src/panel/strings.ts` already promises "The panel never reads or scores
 * it", and it is parked in docs/BACKLOG-file-quality-and-intake.md waiting on
 * the person's own AI. Adding a kind here that reads an answer's text would
 * break that promise silently. */
export type RecommendationKind =
  /** A role marked "current" whose answer has aged past the roles clock.
   * The one signal R1-12 already surfaced on Home; folded in here rather
   * than left as a second engine — see ./engine.ts. */
  | 'role-stale'
  /** Nothing in this whole section has been touched inside its own
   * half-life (core/freshness/halfLives.ts). */
  | 'section-stale'
  /** Every question in this section was passed on. */
  | 'section-empty'
  /** A named initiative whose "what does success look like" was skipped. */
  | 'initiative-no-success';

/**
 * Where acting on this recommendation lands.
 *
 * Mirrors core/flow/runner.ts's own `StepLocation` rather than inventing a
 * second address shape, and adds the question id — a location on its own says
 * which record, not which question in it. ./targets.ts turns one of these
 * into the real `Position` the flow runner takes.
 */
export type RecommendationTarget =
  | { in: 'top'; questionId: string }
  | { in: 'repeatable'; blockId: string; recordIndex: number; questionId: string };

interface RecommendationBase {
  /**
   * Stable across renders, and the key a dismissal is stored under.
   *
   * Built from the kind plus whatever makes this instance distinct (a node
   * id, a record index) — never from a timestamp or an index into the ranked
   * list, both of which would make "I hid that one" mean something different
   * on the next render. `dismissals.ts` explains the other half of that
   * contract.
   */
  id: string;
  kind: RecommendationKind;
  /** The `CONTEXT_FILE_OUTLINE` node this belongs to. */
  nodeId: string;
  /** Higher goes first. Never shown. See ./weights.ts. */
  rank: number;
  target: RecommendationTarget;
}

export type Recommendation =
  | (RecommendationBase & {
      kind: 'role-stale';
      /** The role in the person's own words, e.g. "My employer". */
      role: string;
      /** How long ago they said it was current. A date, not a debt. */
      elapsed: Elapsed;
    })
  | (RecommendationBase & {
      kind: 'section-stale';
      /** The section's own name from the file, without its number. */
      section: string;
      elapsed: Elapsed;
    })
  | (RecommendationBase & {
      kind: 'section-empty';
      section: string;
      /** How many questions are in it. */
      questions: number;
    })
  | (RecommendationBase & {
      kind: 'initiative-no-success';
      /** The initiative's own name, as they typed it. */
      initiative: string;
    });

/* BS-08 (§8), Adam's D8 — `entities-thin` and `initiatives-thin` left this
   union. They were the only two kinds here that were not a structural gap:
   "most people name three or four" is a COMPARISON, not a hole in the file,
   and it now lives on the list it is about. See ./engine.ts's note where the
   rule used to be. */
