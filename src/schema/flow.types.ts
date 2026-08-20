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
  /** index into the file outline, or negative for non-Context files */
  section: number;
  eyebrow: string;
  q: string;
  hint?: string;
  kind: QuestionKind;
  /** where the answer is stored */
  key?: string;
  options?: Option[];
  ph?: string;
  prefill?: string;
  cues?: CueLink[];
  /** which illustration to show, keyed on an answer value */
  sketchOn?: Record<string, string | Record<string, string>>;
  /** for kind:'gen' */
  genKey?: string;
  outKey?: string;
}

export interface RepeatableBlock {
  id: string;
  /** seeded from a multi-select, or a free "add another?" loop behind a yes/no */
  seedFrom?: string;
  fields: Step[];
}

export interface Module {
  n: number;
  title: string;
  nodes: (Step | RepeatableBlock)[];
}

export type Flow = Step[];
export type Flows = Record<FlowId, Flow>;
