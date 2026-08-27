import type { AnswerValue, FlowContext } from '../../schema/flow.types';
import type {
  FileOutlineNode as SrcFileOutlineNode,
  FlowNode as SrcFlowNode,
  Module as SrcModule,
  Question as SrcQuestion,
  RepeatableBlock as SrcRepeatableBlock,
} from './source';

/**
 * V2.0 VB-61 · VB-62 · VB-63 · VB-64 — THE CAPTURE-FLOW OVERRIDES.
 *
 * ── WHY THIS FILE EXISTS AT ALL (docs/V2.0-REFINEMENT.md, FLAG 2) ─────────
 *
 * `source.ts` is a byte-faithful snapshot of the ported interview and says so
 * in its own header: *"NOT hand-edited — any wording fix belongs upstream in
 * modelcitizen, then re-ported."* Four V2.0 items change what that interview
 * asks: a gate stops being optional, the entity cycle is reordered and typed,
 * a second gate stops being optional, and one catch-all question becomes one
 * question per audience. Adam's decision of 2026-08-24 is that all of it goes
 * through the adapter, **as ONE override module and not four ad-hoc edits** —
 * otherwise the port's provenance fragments and nobody can tell later which
 * questions came from modelcitizen and which this repo invented.
 *
 * So: everything below is this repo's own. Everything in `source.ts` is the
 * port. `adapter.test.ts` asserts that running any of this leaves `source.ts`'s
 * own exports untouched, which is the mechanical version of that sentence.
 *
 * It is the same seam `deepDive.ts` (V1.1 VB-03) and `addAnother.ts` (V1.4
 * VB-20) already use, widened: those two attach id-keyed *copy*, this one also
 * reshapes nodes. Both halves are consumed in exactly one place, `adapter.ts`.
 *
 * ── EVERY OVERRIDE CARRIES ITS OWN `why` ──────────────────────────────────
 *
 * Not decoration and not a comment: a required field, asserted non-empty by
 * `overrides.test.ts`. An override with no stated reason is how a data port
 * quietly becomes a fork.
 *
 * ── WHY THE OVERRIDES ARE WRITTEN IN THE SOURCE'S SHAPE ───────────────────
 *
 * They transform `SrcModule[]` *before* `adapter.ts` transforms it, so a
 * question this file authors is adapted by the same code path as a ported one
 * and picks up its section index, its deep dives, its eyebrow and its kind
 * mapping for free.
 *
 * Three things cannot be said in the source's shape, so they travel as
 * id-keyed maps instead, exactly like `DEEP_DIVE` and `ADD_ANOTHER` do:
 * `NAME_FIELDS` and `GATE_QUESTIONS` (the snapshot's block has no field for
 * either), and `PLACEHOLDERS` (the snapshot's `placeholder` is a plain string
 * and stays one, but VB-62 needs a phrase of the record).
 *
 * ── NOTHING HERE DELETES AN ANSWER ────────────────────────────────────────
 *
 * Two of these overrides turn a yes/no gate into a required block. Somebody
 * who already answered "no" finished their file under the old rule, and
 * docs/GUARDRAILS.md's degradation table ("never lose an answer silently")
 * makes their file's completeness ours to protect, not to quietly revoke. So
 * every gate override is written as *"a recorded 'no' still means no"*: a
 * stored decline keeps its block skipped, and a file with no such answer —
 * every new file, since the question is no longer askable — always asks.
 * The same shape covers `audience_variance` (VB-64), which stays in the flow
 * for exactly as long as somebody has an answer stored in it.
 *
 * ── COPY LIVES HERE, NOT IN src/panel/strings.ts ──────────────────────────
 *
 * These are interview questions — printed as the question on their own screen
 * and read aloud by the narrator (core/voice/narration.ts). Question wording
 * lives in `core/flow` beside the questions (CLAUDE.md, "Copy lives in one
 * file", and its stated exception). `npm run audit`'s reading-level rule only
 * measures `src/panel/strings.ts`, so — as with deepDive.ts and addAnother.ts —
 * this file carries the same measurement in its own test rather than shipping
 * unmeasured.
 */

function textOf(value: AnswerValue | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** A phrase-resolving context carrying one record. Spelled out so a call site
 * can build one as a literal — `Question.prompt`'s parameter is the source's
 * own narrower context, which has no `record`, and an object literal with an
 * extra key would be refused at the call. */
function ctxWith(record: Record<string, AnswerValue>): FlowContext {
  return { answers: {}, repeatables: {}, record };
}

/**
 * Whichever kind of thing this record is, or `''` when nobody has said yet.
 *
 * Reads `ctx.record` — the ONE record being answered (see flow.types.ts) — and
 * never `ctx.repeatables`, which cannot say which record a phrase is being
 * asked about. `''` is the honest answer everywhere the record is absent: the
 * generated file, the globe's detail panel, the multiples screen. Every phrase
 * below falls back to the ported wording on it.
 *
 * A custom `allowCustom` value (the person typed their own kind) is not one of
 * the four keys and lands on the fallback, which is right — this repo has no
 * pre-written phrasing for a kind it has never seen.
 */
function entityKind(ctx: FlowContext): 'person' | 'team' | 'system-tool' | 'process-workflow' | '' {
  const value = textOf(ctx.record?.entity_type);
  return value === 'person' || value === 'team' || value === 'system-tool' || value === 'process-workflow'
    ? value
    : '';
}

// ── the copy this repo authors ─────────────────────────────────────────────

/**
 * VB-61's replacement for `entities_gate`, and VB-63's for `initiatives_gate`.
 *
 * The ported questions ask whether there are any. There is no longer a "no" to
 * give, so they stop being asked — but something still has to stand in front of
 * the block. A person who arrives at "What kind of thing is this?" with no
 * framing has been dropped into a loop with no idea how long it is or what it
 * is for, and the section still needs a top-level id to navigate to
 * (core/flow/outline.ts's `navigationTargetFor` resolves "3. My World" to its
 * first listed question).
 *
 * So each gate is replaced by an `intro` in the same position, which is a
 * screen rather than a question — and deliberately says that at least one is
 * expected, because that is the change.
 */
const ENTITIES_INTRO =
  "Now let's name the people, teams, tools, and processes AI should know. Everyone has at least one — we'll start with yours.";

const INITIATIVES_INTRO =
  "Now let's name the work you have underway. Not the day-to-day — the named efforts with their own goals.";

/**
 * The two intros, as real nodes.
 *
 * WHY THEY ARE NEW NODES RATHER THAN THE GATE RETYPED
 *
 * Retyping `entities_gate` from `yes-no` to `intro` is one line and it was the
 * first thing this file did. It is wrong, and the reason is worth keeping:
 * `core/freshness/sectionHealth.ts` does not count an intro as a question, so a
 * file that had already answered "no" would have gone from "3. My World · 1 of
 * 1 · done" to a section with a denominator of ZERO — printing "0 of 0",
 * dropping out of `sectionLife`'s lit state, and taking the finished file's
 * unified glow with it. Nobody would have touched their file; it would just
 * have started reading as broken.
 *
 * Keeping the ported question — asked of nobody new, kept for everybody who has
 * one stored — leaves those files rendering exactly as they render today, and
 * leaves `sectionHealth`, `sectionLife` and `fileFinished` untouched by this
 * batch. That is worth one extra node apiece.
 */
const ENTITIES_INTRO_QUESTION: SrcQuestion = {
  id: 'entities_intro',
  type: 'intro',
  prompt: () => ENTITIES_INTRO,
  // The framing belongs to the block: where the block is skipped, this is a
  // screen introducing something that is never going to happen. It also keeps
  // a file finished under the old rule resuming straight to "done" instead of
  // reopening the interview on two screens it has nothing to do with.
  skipIf: (ctx) => ctx.answers.entities_gate === 'no',
};

const INITIATIVES_INTRO_QUESTION: SrcQuestion = {
  id: 'initiatives_intro',
  type: 'intro',
  prompt: () => INITIATIVES_INTRO,
  skipIf: (ctx) => ctx.answers.initiatives_gate === 'no',
};

/** VB-64's per-audience question. See `AUDIENCES_BLOCK`. */
const AUDIENCE_NEEDS_FALLBACK = "What's different about writing to this reader?";

// ── the overrides ──────────────────────────────────────────────────────────

export interface QuestionOverride {
  /** Why this override exists. Asserted non-empty — see the header. */
  why: string;
  patch: (question: SrcQuestion) => SrcQuestion;
}

export interface BlockOverride {
  why: string;
  patch: (block: SrcRepeatableBlock) => SrcRepeatableBlock;
}

export interface NodeInsertion {
  why: string;
  /** The top-level question id this node is inserted directly after. */
  after: string;
  node: SrcFlowNode;
}

export interface OutlineOverride {
  why: string;
  /** Put in FRONT of that section's `questionIds` — which decides what the
   * section's own row navigates to (core/flow/outline.ts). */
  prependQuestionIds?: string[];
  /** V2.3 VB-90 — spliced in directly after `after`, in order. Exists so an
   * outline section can keep listing its questions in FLOW order when nodes
   * are inserted mid-module: `fileStartTarget`/`navigationTargetFor` read
   * position from this list, and a list that disagrees with the flow sends
   * navigation somewhere the interview would never start. */
  insertAfter?: { after: string; questionIds: string[] };
  /** Added at the end, in order. */
  addQuestionIds?: string[];
}

/** VB-62 — which field titles a record, where it is no longer the first one. */
export interface NameFieldOverride {
  why: string;
  field: string;
}

/** VB-61/VB-63 — which question can still switch a block off. */
export interface GateOverride {
  why: string;
  questionId: string;
}

/** VB-62 — a placeholder that phrases itself for the kind of thing this is.
 * A `Phrase`, not a string: `Question.placeholder` in the snapshot is a plain
 * string and always will be, so this travels as an id-keyed map. */
export interface PlaceholderOverride {
  why: string;
  placeholder: (ctx: FlowContext) => string;
}

/**
 * VB-64's per-audience block: the `roles` pattern, reused rather than
 * reinvented.
 *
 * `audience_variance` collected five audiences and then offered ONE text field
 * to explain all of them. This is a `seedFrom` block over the same
 * `audiences_list` answer, so `reconcileSeededRepeatable`,
 * `applySeededAddAnother` and `seededNameTaken` (all core/flow/runner.ts) run
 * it unchanged — one record per selected audience, and re-answering the seed
 * question keeps the detail already collected against a name that is still
 * selected.
 *
 * ── VB-20'S DATA-LOSS TRAP, WHICH APPLIES HERE VERBATIM ───────────────────
 *
 * `reconcileSeededRepeatable` rebuilds the record array with
 * `selectedValues.map(...)`, so **a record whose name is not in
 * `audiences_list` is deleted, with every answer in it, the next time that
 * question is re-submitted** (docs/V1.4-REFINEMENT.md VB-20). That is why this
 * block carries `addAnotherName` and not just an `addAnotherPrompt`: growing it
 * writes the new name to the seed answer AND the record together
 * (`applySeededAddAnother`), which makes the next reconcile a no-op instead of
 * a deletion. A seeded block that could grow without naming is the bug; the
 * name is the fix.
 *
 * The question itself carries the audience's name because nothing else on the
 * screen does — the panel prints one question at a time and never says which
 * record it is on. It reads the name off `ctx.record`, so the file (which
 * resolves without one) keeps a single stable label for the column instead of
 * a different one per record.
 */
const AUDIENCES_BLOCK: SrcRepeatableBlock = {
  kind: 'repeatable',
  id: 'audiences',
  seedFrom: { questionId: 'audiences_list', seedField: 'audience_name' },
  skipIf: (ctx) => !Array.isArray(ctx.answers.audiences_list) || ctx.answers.audiences_list.length === 0,
  addAnotherPrompt: 'Want to tell AI about another reader?',
  questions: [
    {
      id: 'audience_needs',
      type: 'text',
      multiline: true,
      required: false,
      prompt: (ctx: FlowContext) => {
        const name = textOf(ctx.record?.audience_name);
        return name ? `${name} — what's different about writing to them?` : AUDIENCE_NEEDS_FALLBACK;
      },
      hint: 'A different tone, more or less detail, a different format. Skip if this one gets what everyone else gets.',
      placeholder: "Optional — e.g. 'The headline first, then the detail.'",
      ideas: [
        'The headline first, then the detail.',
        'More formal than I am with my own team.',
        'Much shorter and punchier than anything else I write.',
        'Plain words only — no shorthand, no acronyms.',
      ],
    },
  ],
};

/** The copy that names a new audience, sitting on this block rather than in
 * `addAnother.ts`: that map is the wording for blocks the SNAPSHOT ships with
 * nothing to ask (its own test enforces it), and this block is not in the
 * snapshot at all. Same shape, same screen, one file per provenance. */
const AUDIENCES_ADD_ANOTHER_NAME = {
  prompt: 'Who else do you write to?',
  placeholder: 'A short name for them',
};

export const QUESTION_OVERRIDES: Record<string, QuestionOverride> = {
  orientation_ready: {
    why:
      'VB-90: the first screen becomes the "why" — two beats for someone who just ' +
      'installed it and does not yet see the point, on the beat machinery the port ' +
      'already ships. The id is kept so a file from before tonight, which has this ' +
      'screen answered, resumes exactly as it did; like the rest of the ladder it ' +
      'skips for anyone already past the gate or underway.',
    patch: (question) => {
      // Destructure rather than assign `hint: undefined` —
      // exactOptionalPropertyTypes makes "absent" and "undefined" different
      // claims, and the ported hint should be absent.
      const { hint: _hint, ...rest } = question;
      return {
        ...rest,
        beats: ORIENTATION_WHY_BEATS,
        prompt: () => ORIENTATION_WHY_BEATS.join(' ').replace(/__/g, ''),
        skipIf: pastTheLadder,
      };
    },
  },

  entities_gate: {
    why:
      'VB-61: My World assumes at least one item, so there is no "no" left to give — ' +
      'this question is asked of nobody new. It is kept, unedited, for every file that ' +
      'already holds an answer to it: that answer still decides whether their block is ' +
      'skipped, still counts as their section\'s one question, and still prints in their ' +
      'file. Removing it would change all three, silently, for somebody who did nothing.',
    patch: (question) => ({ ...question, skipIf: (ctx) => !('entities_gate' in ctx.answers) }),
  },

  initiatives_gate: {
    why: 'VB-63: the same change as VB-61, for the same reason — only the gate changes.',
    patch: (question) => ({ ...question, skipIf: (ctx) => !('initiatives_gate' in ctx.answers) }),
  },

  entity_type: {
    why:
      'VB-62: the cycle now starts here, so this question can no longer say "this" and ' +
      'mean something already named. It asks what is coming instead.',
    patch: (question) => ({
      ...question,
      prompt: () => 'What kind of thing do you want to tell AI about?',
      rephrasings: [() => 'Is this a person, a team, a tool, or a way of working?'],
      hint: 'Pick the closest fit, or add your own. The next few questions follow whichever you pick.',
    }),
  },

  entity_name: {
    why:
      'VB-62: with the kind already chosen, one wording no longer has to cover a person ' +
      'and a spreadsheet at once. The ported wording stays as the fallback, which is what ' +
      'the file and every review surface print.',
    patch: (question) => ({
      ...question,
      prompt: (ctx: FlowContext) => {
        switch (entityKind(ctx)) {
          case 'person':
            return "What's their name?";
          case 'team':
            return "What's this team called?";
          case 'system-tool':
            return "What's this tool called?";
          case 'process-workflow':
            return "What's this process called?";
          default:
            return "What's their name — or its name, if this is a tool or team?";
        }
      },
    }),
  },

  entity_relevance: {
    why: 'VB-62: same as entity_name — the kind is known by now, so the question can say it.',
    patch: (question) => ({
      ...question,
      prompt: (ctx: FlowContext) => {
        switch (entityKind(ctx)) {
          case 'person':
            return 'In a sentence, why does AI need to know about them?';
          case 'team':
            return 'In a sentence, why does AI need to know about this team?';
          case 'system-tool':
            return 'In a sentence, why does AI need to know about this tool?';
          case 'process-workflow':
            return 'In a sentence, why does AI need to know about this process?';
          default:
            return 'In a sentence, why does AI need to know about this?';
        }
      },
    }),
  },

  entity_aliases: {
    why:
      'VB-62: a person goes by a nickname and a tool goes by shorthand. Only the person ' +
      'branch is worth its own wording; everything else keeps the ported sentence.',
    patch: (question) => ({
      ...question,
      prompt: (ctx: FlowContext) =>
        entityKind(ctx) === 'person'
          ? 'Any other names or nicknames they go by?'
          : 'Any other names, nicknames, or shorthand this goes by?',
    }),
  },

  audience_variance: {
    why:
      'VB-64: replaced by one question per audience (see AUDIENCES_BLOCK). It is not ' +
      'deleted, because deleting it would drop an answer somebody already gave out of ' +
      'their generated file — so it is asked of nobody new and kept for everybody who ' +
      'has one stored. docs/GUARDRAILS.md: never lose an answer silently.',
    patch: (question) => ({
      ...question,
      skipIf: (ctx) => !('audience_variance' in ctx.answers),
    }),
  },

  role_for: {
    why:
      "V2.5 VB-122 (decision 3, confirmed): the answer becomes the divided line, and the " +
      "choices become the person's own circles — myself, my family, my team, my clients, " +
      'my community — plus add-your-own. The ported six anchored the role to institutions ' +
      '("My employer", "An organization or nonprofit"); the confirmed five speak in first ' +
      'person. THE PORTED OPTIONS ARE NOT DELETED: a stored answer resolves to its label ' +
      "in the generated file (core/files/generate.ts's formatAnswerValue), so dropping " +
      '"employer" would silently reprint yesterday\'s "My employer" as the raw key — the ' +
      'file changing for somebody who did nothing. So the three keys the new line does ' +
      'not offer ride along at the end, unoffered (core/choice/dividedLine.ts decides ' +
      'what the line offers; an old stored value shows as a crossed held entry), and ' +
      'myself / family / community keep their ported keys because their ported labels ' +
      'already read exactly as decision 3 wrote them. "My clients" is a NEW key ' +
      '(my-clients), not a relabel of the ported "clients": relabelling would change the ' +
      'printed file of everyone who answered "Clients" under the old list.',
    patch: (question) => ({
      ...question,
      options: [
        // [DRAFT] decision 3's five, in its own order.
        { key: 'myself', label: 'Myself' },
        { key: 'family', label: 'My family' },
        { key: 'team', label: 'My team' },
        { key: 'my-clients', label: 'My clients' },
        { key: 'community', label: 'My community' },
        // The ported keys the line no longer offers — kept, verbatim, so an
        // old file keeps printing and round-tripping byte-identically.
        { key: 'employer', label: 'My employer' },
        { key: 'clients', label: 'Clients' },
        { key: 'organization', label: 'An organization or nonprofit' },
      ],
    }),
  },
};

export const BLOCK_OVERRIDES: Record<string, BlockOverride> = {
  entities: {
    why:
      'VB-61: at least one item is required for a complete file, so the block is no ' +
      'longer gated on a "yes" — it is gated on NOT having a stored "no", which only a ' +
      'file finished under the old rule can have. VB-62 reorders the cycle to ' +
      'type -> name -> description -> synonyms; `nameField` keeps the record titled by ' +
      'its name (see ENTITY_NAME_FIELD).',
    patch: (block) => ({
      ...block,
      skipIf: (ctx) => ctx.answers.entities_gate === 'no',
      questions: orderBy(block.questions, ['entity_type', 'entity_name', 'entity_relevance', 'entity_aliases']),
    }),
  },

  initiatives_records: {
    why:
      'VB-63: at least one initiative required, grandfathered exactly like entities. ' +
      'THE EXISTING ORDER IS RIGHT AND STAYS — the add-another after each record is ' +
      'the ported prompt, untouched.',
    patch: (block) => ({ ...block, skipIf: (ctx) => ctx.answers.initiatives_gate === 'no' }),
  },
};

/**
 * V2.3 VB-93 — the goal gate: the flow's first two questions, before anything
 * the port asks. "No goal, no go" (Adam), kept inside the product's ethos by
 * being questions rather than a lock: the person is answering from second
 * one, and the answer is USED — the proof loop's baseline becomes their goal
 * verbatim (proofAdapter.ts's promptFor), the grade is framed against the
 * thing they named, and the reflect script names their service. Adam's own
 * words, binding (docs/V2.3-REFINEMENT.md VB-93): "We make the user complicit
 * in personalizing the demo to speak to what matters most to them at the
 * moment they engage, while they are inspired to act."
 *
 * STORED AS CONTEXT ANSWERS, not a separate key — a deliberate deviation from
 * the spec's first draft (`wb:goal`): the proof loop already reads its pasted
 * answers out of the context file's own answer store, so two ordinary answers
 * ride `ctx` into every prompt and template with zero new plumbing, and the
 * gate is exactly "the first two questions of the flow".
 *
 * The service list is PROOF_SERVICES — the one list this product has, reused,
 * with its own "something else" already in it.
 */
export const GOAL_GATE_QUESTION_IDS = ['goal_service', 'goal_want'] as const;

/**
 * V2.3 VB-90 — the orientation ladder: why this file, then a demo of the
 * canvas, replacing the ported first explainer's flat treatment. Real
 * interview steps on the same beat machinery, advancing on the same Next —
 * never a dismissible overlay pointing at UI (docs/GUARDRAILS.md's no-tour
 * rule, passed on V1.1's in-flow-narrative line; docs/V2.3-REFINEMENT.md
 * FLAG 1). The canvas and brain steps SHOW the real drawer in both modes
 * while they talk — Flow.tsx flips the drawer through its existing
 * requested-mode seam when these steps are on screen.
 *
 * The ladder runs ladder → goal gate: Adam's spec has "Go" leading into
 * "question one (which is now the goal gate)". Everything here skips for an
 * interview that is already past the gate or underway — orientation is for
 * someone who just installed it, never a summons back.
 */
function pastTheLadder(ctx: FlowContext): boolean {
  return ctx.answers['goal_want'] !== undefined || interviewAlreadyUnderway(ctx);
}

/** [DRAFT] The "why" beats — VB-90 step 1, patched onto the ported
 * `orientation_ready` (the id is load-bearing: a file from before tonight
 * has it answered, so keeping it means nobody is summoned back). */
export const ORIENTATION_WHY_BEATS = [
  'You already carry a way of working. AI starts from __zero__ every time you open a chat.',
  "We're going to write yours down __once__ — a plain file you hand to any AI you use.",
];

/**
 * V2.5 VB-114 — the DIME TOUR: the four-rung ladder tightens to three
 * slides, each mostly picture (components/TourSlide.tsx draws them), each
 * advanced by the tour's own button rather than the nav row. wb_brain_flip
 * is CONSOLIDATED into the canvas slide's illustration — the list and the
 * map are one drawing now, and the real drawer stays in List (the Brain
 * introduces itself on the browse canvas and the toggle). A stored
 * wb_brain_flip null from a V2.3–2.4 install reads as an unknown key and
 * costs nothing.
 */
export const ORIENTATION_LADDER_IDS = ['wb_canvas', 'wb_go'] as const;

export const ORIENTATION_LADDER_NODES: SrcFlowNode[] = [
  {
    kind: 'question',
    id: 'wb_canvas',
    type: 'intro',
    // [DRAFT] Slide two: where answers land — the list AND the map, one
    // drawing. The real drawer sits in List below it.
    prompt: () => 'Every answer lands in your file below — a list you can read, and a map that fills in.',
    skipIf: pastTheLadder,
  },
  {
    kind: 'question',
    id: 'wb_go',
    type: 'intro',
    // [DRAFT] Slide three: how to move — names the nav's own words, then
    // sets up the gate ("we set up the need for the skill that will follow
    // the context", Adam, VB-93).
    prompt: () => 'Back, Next and Skip sit under every question. Two quick questions first — off you go.',
    skipIf: pastTheLadder,
  },
];

/**
 * The gate is for people STARTING, not a summons for people who already
 * answered under the old rules — the same contract entities_intro's skipIf
 * keeps: a file finished yesterday resumes straight to "done", never
 * reopened onto screens that didn't exist when they finished. "Underway"
 * means any real answer beyond the gate itself (skips store null, and a
 * person who only ever skipped hasn't begun in any sense that matters).
 * Because skipped-questions don't count toward section health — the
 * declined-gates rule — this one predicate also keeps yesterday's file
 * reading as finished, not "partly".
 */
function interviewAlreadyUnderway(ctx: FlowContext): boolean {
  if (Object.keys(ctx.repeatables ?? {}).length > 0) return true;
  return Object.entries(ctx.answers).some(
    ([id, value]) => !(GOAL_GATE_QUESTION_IDS as readonly string[]).includes(id) && value !== null && value !== undefined,
  );
}

export const GOAL_GATE_NODES: SrcFlowNode[] = [
  {
    kind: 'question',
    id: 'goal_service',
    type: 'single-select',
    // [DRAFT — V2.3 copy rule: strings marked for Adam's morning review]
    prompt: () => 'Which AI do you use most?',
    hint: 'Your file works with any of them. Naming yours lets every example speak its language.',
    // The KEYS are the service list's own — ALL_PROOF_SERVICES since V2.4
    // VB-105 added Grok and Perplexity through the additions seam
    // (proofAdditions.ts; FLAG 3) — asserted in overrides.test.ts, so this
    // answer plugs straight into the proof loop's per-service attach tips.
    // The labels are authored here because interview wording lives in core
    // sources and the panel's own list cannot be imported into core.
    //
    // V2.4 VB-105: "other" stops shrugging. [DRAFT] — Adam's own title for
    // it ("the choice should feel easy and fun"); the KEY stays 'other', so
    // every stored answer, skip rule and attach-tip fallback is untouched.
    options: [
      { key: 'chatgpt', label: 'ChatGPT' },
      { key: 'claude', label: 'Claude' },
      { key: 'gemini', label: 'Gemini' },
      { key: 'copilot', label: 'Copilot' },
      { key: 'grok', label: 'Grok' },
      { key: 'perplexity', label: 'Perplexity' },
      { key: 'other', label: "Something Cooler You Don't Even Know About" },
    ],
    skipIf: (ctx) => ctx.answers['goal_service'] === undefined && interviewAlreadyUnderway(ctx),
  },
  {
    kind: 'question',
    id: 'goal_want',
    type: 'text',
    multiline: true,
    // [DRAFT]
    prompt: () => "What's the one thing you want it to do better today?",
    hint: 'Be specific and small — one real task from this week beats a wish. At the end, you will run exactly this and watch the difference. Your AI may decline some topics; pick something it can actually do.',
    placeholder: 'e.g. Draft my Monday status update the way I would',
    ideas: [
      'Draft a status update for my manager that sounds like me.',
      'Triage my inbox and tell me the three that matter.',
      'Turn my meeting notes into the summary my team expects.',
      'Write the first reply to a client email in my voice.',
    ],
    skipIf: (ctx) => ctx.answers['goal_want'] === undefined && interviewAlreadyUnderway(ctx),
  },
];

export const NODE_INSERTIONS: NodeInsertion[] = [
  {
    why:
      'VB-90: the orientation ladder — canvas, brain flip, go — real steps after the ' +
      '"why" screen, showing the actual drawer while they talk (FLAG 1: in-flow ' +
      'narrative, never an overlay).',
    after: 'orientation_ready',
    node: ORIENTATION_LADDER_NODES[0]!,
  },
  { why: 'VB-90/VB-114: the go rung of the same ladder.', after: 'orientation_ready', node: ORIENTATION_LADDER_NODES[1]! },
  {
    why:
      'VB-93: the goal gate — the flow\'s first two QUESTIONS, right where the ladder\'s ' +
      '"go" points ("Two quick questions first"). No goal, no go: the proof loop\'s ' +
      'baseline becomes this answer verbatim (proofAdapter.ts).',
    after: 'orientation_ready',
    node: GOAL_GATE_NODES[0]!,
  },
  { why: 'VB-93: the second half of the gate — the thing they want done better today.', after: 'orientation_ready', node: GOAL_GATE_NODES[1]! },
  {
    why:
      'VB-61: the framing that replaces the gate for everybody who is not being asked it ' +
      'any more — a screen, not a question, sitting exactly where the gate sat.',
    after: 'entities_gate',
    node: { kind: 'question', ...ENTITIES_INTRO_QUESTION },
  },
  {
    why: 'VB-63: the same, in front of the initiatives block.',
    after: 'initiatives_gate',
    node: { kind: 'question', ...INITIATIVES_INTRO_QUESTION },
  },
  {
    why: 'VB-64: one record per audience already picked, in place of one text field for all of them.',
    after: 'audience_variance',
    node: AUDIENCES_BLOCK,
  },
];

export const OUTLINE_OVERRIDES: Record<string, OutlineOverride> = {
  // V2.3 VB-93 — the goal gate's two answers open section 1 of the FILE as
  // well as the flow: the first thing any AI reads is what its person wants
  // it to do better, which is the gate paying for itself in the artifact.
  sec1: {
    why:
      'V2.3 VB-90 + VB-93 — the orientation ladder rides section 1 uncounted (intros ' +
      'carry no denominator weight, the skills-outline rule), and the goal gate\'s two ' +
      'answers open the file as they open the flow. Spliced after the why screen, not ' +
      'prepended, so the outline lists section 1 in FLOW order and fileStartTarget ' +
      'still lands the flow\'s real first screen.',
    insertAfter: { after: 'orientation_ready', questionIds: ['wb_canvas', 'wb_go', 'goal_service', 'goal_want'] },
  },
  sec3: {
    why:
      'VB-61: the new framing screen needs a home in section 3, or the adapter refuses it ' +
      '(every question must resolve to exactly one section). FIRST in the list, because a ' +
      "section's row navigates to its first id and the gate behind it is a question nobody " +
      'new is asked — landing somebody on a skipped question would show them a screen the ' +
      'interview itself would never give them.',
    prependQuestionIds: ['entities_intro'],
  },
  sec4: {
    why: 'VB-63: the same, for section 4.',
    prependQuestionIds: ['initiatives_intro'],
  },
  sec7: {
    why:
      'VB-64: the new per-audience question needs a home in section 7, or the adapter ' +
      'refuses it and section health would never count it. At the end, because the list ' +
      'it is seeded from is what section 7 opens with.',
    addQuestionIds: ['audience_needs'],
  },
};

/**
 * VB-61/VB-63 — where an inserted question borrows its follow-ups from.
 *
 * V1.1 VB-03 wrote real help for both gates ("What kind of thing belongs
 * here?"), keyed by question id in ./deepDive.ts. That copy is about the
 * SECTION, not about answering yes or no, so it belongs on the screen that now
 * opens the section — but the gate still exists for the files that answered it,
 * so the entry cannot simply be re-keyed, and deepDive.ts is V1.1's approved
 * copy rather than this batch's to rewrite.
 */
export const DEEP_DIVE_ALIASES: Record<string, string> = {
  entities_intro: 'entities_gate',
  initiatives_intro: 'initiatives_gate',
};

export const NAME_FIELDS: Record<string, NameFieldOverride> = {
  entities: {
    why:
      'VB-62 puts the kind first, but a record is still called by its name — otherwise ' +
      'every entity in the generated file would be titled "Person".',
    field: 'entity_name',
  },
};

/**
 * VB-61/VB-63 — which gate still governs which block, said explicitly.
 *
 * A gate's "no" now outlives the question that produced it: it is the one
 * thing that can still take a required block out of the interview, forever,
 * for a file that recorded one under the old rule. Something that permanent
 * cannot rest on `core/files/restore.ts` slicing `_gate` off a question id and
 * hoping a block answers to what is left — a guess that has been wrong for
 * `initiatives_gate` since R1-10 (`initiatives_records`, not `initiatives`),
 * and whose cost went up the moment the block became required. See
 * `RepeatableBlock.gateQuestionId`.
 */
export const GATE_QUESTIONS: Record<string, GateOverride> = {
  entities: {
    why:
      'VB-61: a recorded "no" is the only thing that still skips this block, so the ' +
      'question holding it is named rather than inferred from the block id.',
    questionId: 'entities_gate',
  },
  initiatives_records: {
    why:
      'VB-63: the same — and the one that was inferred WRONG, because this block is ' +
      'called initiatives_records and its gate is initiatives_gate.',
    questionId: 'initiatives_gate',
  },
};

/**
 * VB-62 — the placeholders that go with the type-aware prompts.
 *
 * The example under a field is part of how the question reads, not decoration:
 * "What's their name?" over *"e.g. Priya, the Growth team, Salesforce, the
 * weekly review"* asks about a person and then lists four kinds of thing, and
 * "Any other names or nicknames they go by?" over *"e.g. 'the CRM'"* offers a
 * person a piece of software as an example of their own nickname. The ported
 * strings are right for a question that has not yet been told what it is
 * about; they are wrong the moment it has been, which is exactly what VB-62
 * changed. Only these two need it — `entity_relevance`'s ported example reads
 * for any kind, so it keeps it.
 */
export const PLACEHOLDERS: Record<string, PlaceholderOverride> = {
  entity_name: {
    why:
      "VB-62: the ported example lists all four kinds, which reads as a shrug once the " +
      'kind is known. Each branch gives one example of the thing actually being named.',
    placeholder: (ctx) => {
      switch (entityKind(ctx)) {
        case 'person':
          return 'e.g. Priya, my manager';
        case 'team':
          return 'e.g. the Growth team';
        case 'system-tool':
          return 'e.g. Salesforce';
        case 'process-workflow':
          return 'e.g. the weekly review';
        default:
          return 'e.g. Priya, the Growth team, Salesforce, the weekly review';
      }
    },
  },
  entity_aliases: {
    why:
      "VB-62: the ported example is a tool's shorthand ('the CRM'), which is the wrong " +
      'kind of thing to offer somebody naming a person.',
    // Kept SHORTER than the ported line it replaces, not merely as short: a
    // single-line field at 400px clips its own example, and this one has to
    // fit beside a longer question than the ported wording sat under.
    placeholder: (ctx) =>
      entityKind(ctx) === 'person'
        ? 'Optional — e.g. initials, or a nickname'
        : "Optional — e.g. 'the CRM', initials, a nickname",
  },
};

/** The add-another copy for blocks THIS file authors, keyed by block id — the
 * snapshot has no wording for a block it never had. `adapter.ts` reads it the
 * same way it reads `ADD_ANOTHER`. */
export const INSERTED_BLOCK_ADD_ANOTHER: Record<string, { prompt: string; namePrompt: string; namePlaceholder: string }> = {
  audiences: {
    prompt: AUDIENCES_BLOCK.addAnotherPrompt,
    namePrompt: AUDIENCES_ADD_ANOTHER_NAME.prompt,
    namePlaceholder: AUDIENCES_ADD_ANOTHER_NAME.placeholder,
  },
};

// ── application ────────────────────────────────────────────────────────────

/** Reorders a block's questions into `ids`, keeping anything unnamed at the
 * end in its ported order. Throws on an id that is not there: a silent no-op
 * would leave the cycle in the old order with nothing to show for it. */
function orderBy(questions: SrcQuestion[], ids: string[]): SrcQuestion[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const ordered: SrcQuestion[] = [];
  for (const id of ids) {
    const question = byId.get(id);
    if (!question) throw new Error(`cannot reorder: no question "${id}" in this block`);
    ordered.push(question);
    byId.delete(id);
  }
  return [...ordered, ...byId.values()];
}

function overrideQuestion(question: SrcQuestion): SrcQuestion {
  const override = QUESTION_OVERRIDES[question.id];
  return override ? override.patch(question) : question;
}

function overrideNode(node: SrcFlowNode): SrcFlowNode {
  if (node.kind === 'repeatable') {
    const override = BLOCK_OVERRIDES[node.id];
    const block = override ? override.patch(node) : node;
    return { ...block, questions: block.questions.map(overrideQuestion) };
  }
  // `kind` is part of the node, not of the Question the override sees — it is
  // put back afterwards so an override can never accidentally drop it.
  return { kind: 'question', ...overrideQuestion(node) };
}

/**
 * The ported modules with every V2.0 capture change applied.
 *
 * Returns new objects all the way down for anything it touches, and never
 * mutates what it was given — `source.ts`'s exports are module-level constants
 * shared by every caller, and this function runs at import time.
 */
export function applyFlowOverrides(modules: SrcModule[]): SrcModule[] {
  const insertionsByAnchor = new Map<string, SrcFlowNode[]>();
  for (const insertion of NODE_INSERTIONS) {
    const list = insertionsByAnchor.get(insertion.after) ?? [];
    list.push(insertion.node);
    insertionsByAnchor.set(insertion.after, list);
  }

  return modules.map((module) => ({
    ...module,
    nodes: module.nodes.flatMap((node): SrcFlowNode[] => {
      const overridden = overrideNode(node);
      const inserted = node.kind === 'repeatable' ? undefined : insertionsByAnchor.get(node.id);
      return inserted ? [overridden, ...inserted] : [overridden];
    }),
  }));
}

/** The ported outline with the ids this file's new questions need. Same
 * no-mutation rule. */
export function applyOutlineOverrides(outline: SrcFileOutlineNode[]): SrcFileOutlineNode[] {
  const walk = (node: SrcFileOutlineNode): SrcFileOutlineNode => {
    const override = OUTLINE_OVERRIDES[node.id];
    const spliced = override?.insertAfter
      ? node.questionIds.flatMap((id) =>
          id === override.insertAfter!.after ? [id, ...override.insertAfter!.questionIds] : [id],
        )
      : node.questionIds;
    const next: SrcFileOutlineNode = {
      ...node,
      questionIds: [
        ...(override?.prependQuestionIds ?? []),
        ...spliced,
        ...(override?.addQuestionIds ?? []),
      ],
    };
    if (node.children) next.children = node.children.map(walk);
    return next;
  };
  return outline.map(walk);
}

/**
 * WHY NEITHER OF THOSE THROWS ON A TARGET THAT IS NOT THERE
 *
 * `adaptContextFlow` takes injected `modules`/`outline` so tests can exercise
 * the transform against three-question fixtures (see adapter.test.ts), and a
 * fixture is not expected to carry `audience_variance` or a section seven.
 * Refusing there would make every synthetic fixture in the repo carry this
 * file's anchors, which is the tail wagging the dog.
 *
 * Drift against the REAL port is caught instead by `overrideTargets()` below,
 * which `overrides.test.ts` asserts resolves completely — so a renamed
 * question fails CI loudly, in the one place that can tell the difference
 * between "missing" and "not applicable".
 */
export interface OverrideTargets {
  questionIds: string[];
  blockIds: string[];
  insertionAnchors: string[];
  outlineSectionIds: string[];
  nameFieldBlockIds: string[];
  gateBlockIds: string[];
  gateQuestionIds: string[];
  placeholderQuestionIds: string[];
  deepDiveAliasTargets: string[];
}

export function overrideTargets(): OverrideTargets {
  return {
    questionIds: Object.keys(QUESTION_OVERRIDES),
    blockIds: Object.keys(BLOCK_OVERRIDES),
    insertionAnchors: NODE_INSERTIONS.map((i) => i.after),
    outlineSectionIds: Object.keys(OUTLINE_OVERRIDES),
    nameFieldBlockIds: Object.keys(NAME_FIELDS),
    gateBlockIds: Object.keys(GATE_QUESTIONS),
    gateQuestionIds: Object.values(GATE_QUESTIONS).map((g) => g.questionId),
    placeholderQuestionIds: Object.keys(PLACEHOLDERS),
    deepDiveAliasTargets: Object.values(DEEP_DIVE_ALIASES),
  };
}

/** Every override's `why`, for the test that refuses an unexplained one. */
export function allOverrideReasons(): string[] {
  return [
    ...Object.values(QUESTION_OVERRIDES).map((o) => o.why),
    ...Object.values(BLOCK_OVERRIDES).map((o) => o.why),
    ...NODE_INSERTIONS.map((o) => o.why),
    ...Object.values(OUTLINE_OVERRIDES).map((o) => o.why),
    ...Object.values(NAME_FIELDS).map((o) => o.why),
    ...Object.values(GATE_QUESTIONS).map((o) => o.why),
    ...Object.values(PLACEHOLDERS).map((o) => o.why),
  ];
}

/** Every line of user-facing wording this file authors, for the reading-level
 * and sentence-length tests. Phrases are resolved in both directions — with a
 * record and without — so no branch ships unmeasured. */
export function allOverrideCopy(): string[] {
  const kinds: AnswerValue[] = ['person', 'team', 'system-tool', 'process-workflow', null];
  const lines: string[] = [ENTITIES_INTRO, INITIATIVES_INTRO];

  const bare: FlowContext = { answers: {}, repeatables: {} };

  for (const id of ['entity_type', 'entity_name', 'entity_relevance', 'entity_aliases']) {
    const override = QUESTION_OVERRIDES[id];
    if (!override) continue;
    const patched = override.patch({ id, type: 'text', prompt: () => '' });
    for (const kind of kinds) {
      lines.push(patched.prompt(ctxWith({ entity_type: kind })));
    }
    for (const rephrasing of patched.rephrasings ?? []) {
      lines.push(rephrasing(bare));
    }
    if (patched.hint) lines.push(patched.hint);
    const placeholder = PLACEHOLDERS[id];
    if (placeholder) {
      for (const kind of kinds) lines.push(placeholder.placeholder(ctxWith({ entity_type: kind })));
    }
  }

  // V2.5 VB-122 — the divided line reshapes role_for's option list, which
  // makes every label on it this repo's own copy: measured here like the rest.
  {
    const roleFor = QUESTION_OVERRIDES['role_for'];
    if (roleFor) {
      const patched = roleFor.patch({ id: 'role_for', type: 'single-select', prompt: () => '' });
      for (const option of patched.options ?? []) lines.push(option.label);
    }
  }

  for (const question of AUDIENCES_BLOCK.questions) {
    lines.push(question.prompt(bare));
    lines.push(question.prompt(ctxWith({ audience_name: 'My manager' })));
    if (question.hint) lines.push(question.hint);
    if (question.placeholder) lines.push(question.placeholder);
    lines.push(...(question.ideas ?? []));
  }

  lines.push(AUDIENCES_BLOCK.addAnotherPrompt, AUDIENCES_ADD_ANOTHER_NAME.prompt, AUDIENCES_ADD_ANOTHER_NAME.placeholder);

  // V2.3 VB-90 — the ladder's copy, markers stripped the way prompt() strips
  // them, plus the why-beats as printed.
  for (const node of ORIENTATION_LADDER_NODES) {
    if (node.kind === 'question') lines.push(node.prompt(bare));
  }
  lines.push(...ORIENTATION_WHY_BEATS.map((beat) => beat.replace(/__/g, '')));

  // V2.3 VB-93 — the goal gate's copy is authored here too, so it rides the
  // same reading-grade and sentence-length harness as everything else.
  for (const node of GOAL_GATE_NODES) {
    if (node.kind !== 'question') continue;
    lines.push(node.prompt(bare));
    if (node.hint) lines.push(node.hint);
    if (node.placeholder) lines.push(node.placeholder);
    for (const option of node.options ?? []) lines.push(option.label);
    lines.push(...(node.ideas ?? []));
  }
  return lines;
}
