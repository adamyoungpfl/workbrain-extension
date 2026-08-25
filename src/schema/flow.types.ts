/**
 * The interview flow, as data. The runner component is generic over these types —
 * adding a question is a data change, never a component change.
 *
 * SOURCE OF TRUTH for question wording: the existing Next.js implementation
 * (`contextInterviewFlow.ts`). Port it verbatim. Do not paraphrase the questions —
 * the voice is the product.
 */

export type FlowId = 'context' | 'proof' | 'skills' | 'actions' | 'drift';

export type AnswerValue = string | string[] | null;

/** Everything a q/panelQ/skipIf/interpret function can read — never write. */
export interface FlowContext {
  answers: Record<string, AnswerValue>;
  repeatables: Record<string, Record<string, AnswerValue>[]>;
  /**
   * V2.0 VB-62 — the ONE repeatable record being answered right now, when the
   * screen is inside a block. Absent everywhere else, and absent on purpose in
   * `core/files/generate.ts` and `core/files/parse.ts`: a `Phrase` that reads
   * this must therefore always have a record-free fallback, and that fallback
   * is what the generated file prints.
   *
   * WHY IT IS NOT DERIVABLE FROM `repeatables`
   * A phrase function is handed a context, not a position — it cannot know
   * which index it is being asked about, and "the last record" is wrong the
   * moment somebody edits an earlier one (core/flow/runner.ts's
   * `positionForRecord`, V1.7 VB-38). The caller that knows the record passes
   * it; nobody else can.
   *
   * WHY THE FILE DELIBERATELY DOES NOT GET IT
   * `parse.ts` matches a record's field labels against the same
   * `resolvePhrase` call `generate.ts` wrote them with. Keeping both
   * record-free keeps one stable label per question across every record, which
   * is what makes the round-trip an identity rather than a coincidence — and a
   * file whose bullet labels changed from record to record would be worse to
   * read anyway.
   */
  record?: Record<string, AnswerValue>;
}

/** Most questions are static text; a few are scope-aware (e.g. "in your work life" vs "in your personal life"). */
export type Phrase = string | ((ctx: FlowContext) => string);

export type QuestionKind =
  | 'chips'      // single select
  | 'multi'      // multi select, always with "+ add your own"
  | 'text'       // one field, optional prefill/ideas
  | 'yesno'      // gates a repeatable block
  | 'intro'      // narrative beat, no answer
  | 'reflect'    // plays an open-text answer back before committing
  | 'gen'        // shows a generated prompt, takes a pasted result
  | 'demo';      // one of the four proof steps

export interface Option {
  v: string;
  l: string;
  /** marks the suggested pick; drives the `pulse` cue */
  rec?: boolean;
}

/** How a text answer gets interpreted before the reflect/confirm step. */
export interface InterpretConfig {
  /** "echo" needs no AI — it reflects the person's own words back. "ai-assist" is the real hand-off. */
  via: 'ai-assist' | 'echo';
  buildPrompt?: (rawAnswer: string, ctx: FlowContext) => string;
  /** Shown ahead of the reflected value on the confirm step, e.g. "I heard:" */
  reflectPrefix?: string;
}

/** A cue link: play these, until this event fires, optionally say this. */
export interface CueLink {
  play: CueSpec[];
  until: CueEvent;
  say?: string;
}

/** `verb:target` — or `point:target|label` for the cross-surface pointer. */
export type CueSpec = string;

export type CueEvent =
  | 'choice' | 'type' | 'copy' | 'paste' | 'download'
  | 'attach' | 'next' | 'reflect' | 'none';

/**
 * One "deeper dive" pair: the follow-up question a person would actually ask
 * out loud, and its answer. V1.1 VB-03. The wording lives in
 * `src/core/flow/deepDive.ts`, keyed by question id — see that file's header
 * for why it isn't in `src/panel/strings.ts`.
 */
export interface DeepDiveEntry {
  q: string;
  a: string;
}

export interface Step {
  id: string;
  /** module number for the progress rail; 0 = pre-flight */
  module: number;
  /** index into the flattened file outline, or negative for non-Context files */
  section: number;
  eyebrow: string;
  q: Phrase;
  /** shorter wording for a 400px panel — never edit `q` to make it fit, add this instead */
  panelQ?: Phrase;
  hint?: string;
  /**
   * V1.1 VB-03: follow-up questions the person can open under this one, each
   * revealing its answer inline. Where a step has these, they REPLACE the
   * always-visible `hint` — except for the three `voice_*` questions, whose
   * hint is a set of worked examples that must stay visible to keep the
   * question answerable (see core/flow/deepDive.ts's HINT_STAYS_VISIBLE).
   * Attached by the adapter from a separate id-keyed map, never authored on
   * the ported source questions themselves.
   */
  deepDive?: DeepDiveEntry[];
  kind: QuestionKind;
  /** where the answer is stored */
  key?: string;
  options?: Option[];
  /**
   * The example shown in an empty field.
   *
   * A `Phrase` since V2.0 VB-62, for the same reason `q` always was: once the
   * entity cycle asks what kind of thing this is FIRST, the questions after it
   * phrase themselves for a person or for a tool — and an example is part of
   * how a question reads, not decoration beside it. "What's their name?" over
   * *"e.g. Priya, the Growth team, Salesforce, the weekly review"* is a
   * question and an answer to a different one.
   *
   * Resolve it with `core/files/lookups.ts`'s `resolvePhrase`, never by
   * reading it as a string — most are still plain strings and both shapes have
   * to render the same way.
   */
  ph?: Phrase;
  prefill?: string;
  /** text only: textarea vs a single-line input */
  multiline?: boolean;
  /** Branching: return true to skip this node entirely, evaluated against answers so far. */
  skipIf?: (ctx: FlowContext) => boolean;
  /** Default true — false renders a visible Skip. How a runner uses this isn't decided by this schema. */
  required?: boolean;
  interpret?: InterpretConfig;
  /** Static starter answers offered via a "Generate ideas" button on text questions. */
  ideas?: string[];
  /** multi/chips: alongside the predefined options, offer a text input to add items not on the list. */
  allowCustom?: boolean;
  customPlaceholder?: string;
  /** Alternate phrasings of the same question, cycled via a "rephrase" affordance. */
  rephrasings?: Phrase[];
  /** Alternate option labels paired 1:1 with `rephrasings` — same `v`s, same order, only `l` may differ. */
  optionRephrasings?: Option[][];
  /** intro-only: a timed, one-at-a-time beat reveal instead of one dense paragraph. */
  beats?: string[];
  /** single/multi-select only, exactly 2 entries: a side-by-side two-panel comparison. */
  optionExamples?: string[];
  cues?: CueLink[];
  /** which illustration to show, keyed on an answer value */
  sketchOn?: Record<string, string | Record<string, string>>;
  /** for kind:'gen' */
  genKey?: string;
  outKey?: string;
}

export interface RepeatableBlock {
  id: string;
  /** seeded from a multi-select answer, one record per item, pre-filled into `seedField` */
  seedFrom?: { questionId: string; seedField: string };
  /** "" means never show — the block's record count is fixed by something else */
  addAnotherPrompt: string;
  /**
   * V1.4 VB-20: what to ask for the new record's NAME when a **seeded** block
   * is allowed to grow.
   *
   * A seeded block's records are rebuilt from its seed answer every time that
   * answer is re-submitted (see core/flow/runner.ts's
   * `reconcileSeededRepeatable`), so a record whose name is not in the seed
   * answer is deleted the next time someone goes Back and presses Next. A new
   * record therefore cannot just be appended: it has to be *named*, and the
   * name appended to the seed answer as well, which is what keeps the two in
   * step and turns the next reconcile into a no-op.
   *
   * Present means "this seeded block may grow, and this is the question that
   * names the new record". Absent (every other block) means the add-another
   * screen is the plain yes/no it has always been.
   */
  addAnotherName?: { prompt: string; placeholder: string };
  /**
   * V2.0 VB-62 — which field NAMES a record, when it is not the first one.
   *
   * An open-ended block's record has always been titled by `fields[0]`, in the
   * file and in every surface that lists records. VB-62 asks the entity cycle
   * to start with the KIND of thing rather than its name, which would have
   * made every entity in the file read "**Person**" and left the name buried
   * in a bullet. The ask order and the record's identity are two different
   * things; this is the second one, said out loud.
   *
   * Absent means `fields[0]`, which is what every other block still is.
   * Meaningless on a seeded block, whose name is `seedFrom.seedField` and is
   * not one of its questions at all. Resolve it through
   * `core/files/lookups.ts`'s `nameStepFor`/`bodyFieldsFor`, never by hand —
   * the file's title, the file's bullets and the panel's record list all have
   * to agree, and they only do because they ask the same function.
   */
  nameField?: string;
  /**
   * V2.0 VB-61/VB-63 — the yes/no question whose stored answer can take this
   * whole block out of the interview.
   *
   * `skipIf` is an opaque predicate, so nothing could read the link back out
   * of it. `core/files/restore.ts` needed exactly that link and had to guess:
   * it sliced `_gate` off the question's id and looked for a block by that
   * name. The guess worked for `entities_gate` -> `entities` and has been
   * WRONG SINCE R1-10 for `initiatives_gate`, whose block is
   * `initiatives_records` — so importing a file full of initiatives inferred
   * "no", and the person's own records went unreachable in the interview.
   * restore.ts's header called the explicit field the real fix and put it out
   * of scope; VB-63 makes it in scope, because a block that is REQUIRED must
   * not be switchable off by a naming coincidence.
   *
   * Absent means no gate — which is now true of every block for anybody
   * starting a file today, since neither gate is asked any more. It is only
   * ever set by `core/flow/overrides.ts`, whose business the gates now are.
   */
  gateQuestionId?: string;
  skipIf?: (ctx: FlowContext) => boolean;
  fields: Step[];
}

export interface Module {
  id: string;
  n: number;
  title: string;
  purpose: string;
  required: boolean;
  /** [low, high] minutes */
  estimatedMinutes: [number, number];
  nodes: (Step | RepeatableBlock)[];
}

/** A flow is its ordered modules — not a flat Step[]. A RepeatableBlock's record
 * count isn't known until the person is actually answering, so it can't be
 * flattened into static data; a runner expands it at run time. */
export type Flow = Module[];
export type Flows = Record<FlowId, Flow>;

/** A file's table of contents. Nested (a section may have sub-sections);
 * `Step.section` indexes into this tree flattened depth-first. */
export interface FileOutlineNode {
  id: string;
  label: string;
  /** every question id that belongs to this section, including repeatable sub-question ids */
  questionIds: string[];
  children?: FileOutlineNode[];
}
