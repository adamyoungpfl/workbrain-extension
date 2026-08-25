/**
 * V1.3 VB-18 — WHAT THE NARRATOR SAYS ON A GIVEN SCREEN.
 *
 * One function decides both halves of every utterance: the words, and the
 * role those words are spoken in (see ./roles.ts). Keeping it here, over a
 * `Position` and `wb:answers`, means "advancing to question twelve reads
 * question twelve" is a unit test rather than something only a person wearing
 * headphones could ever check.
 *
 * THE RULES IT ENCODES
 *
 * - **Only what is on the screen.** The question, not the question and its
 *   hint; the wording currently showing, not the original one a rephrasing
 *   replaced. Someone listening and someone reading are on the same sentence.
 * - **Nothing is narrated that was not chosen.** This returns text for the
 *   screen the person is on; whether it is ever spoken is `Prefs.narrator`,
 *   and the panel asks nothing of the speech API while that is off.
 * - **`done` says nothing.** The interview handing off to Home is not a
 *   screen, and a voice reading the last question while Home paints would be
 *   the exact failure VB-18 calls "the main way this feature becomes hateful".
 *
 * COPY IS INJECTED, NOT WRITTEN HERE. Two things the narrator says are
 * interface copy rather than ported question wording — the module transition
 * beats and the reflect screen's spoken next step — and interface copy lives
 * in src/panel/strings.ts (CLAUDE.md). They arrive as `NarrationCopy` from
 * src/panel/voice/copy.ts, which is also what keeps this module free of any
 * import from the panel.
 */

import type { Answers } from '../../schema/storage.types';
import type { FlowContext, Step } from '../../schema/flow.types';
import type { Position } from '../flow/runner';
import { existingValue } from '../flow/runner';
import { beatsPlainText } from '../flow/beats';
import type { VoiceRole } from './roles';

/** One thing to say, and the voice role to say it in. */
export interface Narration {
  readonly role: VoiceRole;
  readonly text: string;
}

/** The panel's own words, for the two screens that speak them. */
export interface NarrationCopy {
  /** The reflect screen's ways forward, spoken. Never printed — the buttons
   * are on screen and say the same thing. */
  readonly reflectCta: string;
  /** A module transition's approved lines, in reading order, for a module id
   * that has any. Empty for one that does not. */
  readonly moduleIntro: (moduleId: string) => readonly string[];
}

export interface NarrationOptions {
  /** Which wording is showing: 0 is the question as written, 1 the first
   * rephrasing, and so on — exactly `StepView`'s own `rephraseIndex`. */
  readonly rephraseIndex?: number;
}

/** Collapses the whitespace a joined sentence picks up. A speech engine reads
 * a double space as a pause, so this is audible, not cosmetic. */
function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function resolvePhrase(phrase: Step['q'], ctx: FlowContext): string {
  return typeof phrase === 'function' ? phrase(ctx) : phrase;
}

/**
 * The question as it currently reads on screen, rephrasings included.
 *
 * No spoken connector ("another way to put it…") in front of a rephrasing,
 * unlike the sibling app: the panel prints the new wording, and a person who
 * pressed "ask me that a different way" a moment ago does not need telling
 * that is what happened.
 */
export function spokenQuestion(step: Step, ctx: FlowContext, rephraseIndex = 0): string {
  const rephrasings = step.rephrasings ?? [];
  const phrase = rephraseIndex === 0 ? step.q : (rephrasings[rephraseIndex - 1] ?? step.q);
  return tidy(resolvePhrase(phrase, ctx));
}

/** An intro screen: its beats if it has them (that is what is on screen — see
 * components/Beats.tsx), its own text if it does not. Emphasis markers are
 * stripped, so `__never__` is never read as underscores. */
function spokenIntro(step: Step, ctx: FlowContext): string {
  const beats = step.beats ?? [];
  if (beats.length > 0) return tidy(beatsPlainText(beats));
  return spokenQuestion(step, ctx);
}

/**
 * V1.1 VB-03's follow-up answers, spoken.
 *
 * The answer alone, not the chip's own question: the person pressed a control
 * whose label they had just read, and hearing it read back to them before the
 * answer is the kind of padding that makes a narrator tiring.
 */
export function narrationForFollowUp(answer: string): Narration | null {
  const text = tidy(answer);
  return text ? { role: 'followUp', text } : null;
}

/**
 * The context this screen's wording resolves against — including, when the
 * screen sits inside a repeatable, THE RECORD IT IS ABOUT.
 *
 * V2.0 VB-62: an entity question phrases itself for a person or for a tool,
 * and VB-64's audience question says the reader's name out loud. Both read
 * `ctx.record` (see schema/flow.types.ts). Without this the narrator would
 * read the fallback wording while the panel printed the specific one — and
 * this module's own first rule is "someone listening and someone reading are
 * on the same sentence".
 */
function contextFor(position: Position, answers: Answers): FlowContext {
  const base = { answers: answers.values, repeatables: answers.repeatables };
  if (position.kind !== 'step' && position.kind !== 'reflect') return base;
  if (position.location.in !== 'repeatable') return base;
  const record = answers.repeatables[position.location.blockId]?.[position.location.recordIndex];
  return record ? { ...base, record } : base;
}

/**
 * What this position narrates — or `null` for a screen with nothing to say.
 *
 * `answers` rather than a bare `FlowContext` because the reflect screen plays
 * back the answer that is actually stored, which is a lookup over
 * `wb:answers`, not over the context object questions read.
 */
export function narrationFor(
  position: Position,
  answers: Answers,
  copy: NarrationCopy,
  options: NarrationOptions = {},
): Narration | null {
  const ctx: FlowContext = contextFor(position, answers);

  if (position.kind === 'done') return null;

  if (position.kind === 'module-intro') {
    const lines = copy.moduleIntro(position.module.id);
    // No approved copy for this module: the title in the bar is all the screen
    // itself shows, so it is all there is to read. Degrade, never break.
    const text = lines.length > 0 ? tidy(beatsPlainText(lines)) : tidy(position.module.title);
    return text ? { role: 'recap', text } : null;
  }

  if (position.kind === 'add-another') {
    const text = tidy(position.block.addAnotherPrompt);
    return text ? { role: 'question', text } : null;
  }

  if (position.kind === 'reflect') {
    const stored = existingValue(answers, position.step, position.location);
    const raw = typeof stored === 'string' ? tidy(stored) : '';
    // Nothing typed means nothing to play back, and the buttons on a reflect
    // screen only make sense after the answer they act on.
    if (!raw) return null;
    const prefix = tidy(position.step.interpret?.reflectPrefix ?? '');
    const parts = [prefix, raw, tidy(copy.reflectCta)].filter(Boolean);
    return { role: 'recap', text: parts.join(' ') };
  }

  const { step } = position;
  if (step.kind === 'intro' || step.kind === 'demo') {
    const text = step.kind === 'intro' ? spokenIntro(step, ctx) : spokenQuestion(step, ctx);
    return text ? { role: 'recap', text } : null;
  }

  const text = spokenQuestion(step, ctx, options.rephraseIndex ?? 0);
  return text ? { role: 'question', text } : null;
}
