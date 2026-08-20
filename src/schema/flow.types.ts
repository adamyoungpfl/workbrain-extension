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
  kind: QuestionKind;
  /** where the answer is stored */
  key?: string;
  options?: Option[];
  ph?: string;
  prefill?: string;
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
  /** "" means never show — used by seeded blocks, whose record count is already fixed */
  addAnotherPrompt: string;
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
