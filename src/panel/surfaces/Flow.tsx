import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import {
  Beats,
  Button,
  DeepDive,
  DictationHint,
  Field,
  FlowProgress,
  NarratorToggle,
  NavButton,
  NavCluster,
  NAV_MELT_LAYER_CLASS,
  OrbGroup,
  PillGroup,
  ReadOnlyBlock,
  TypedHeading,
} from '../components';
import { ModuleIntro } from './ModuleIntro';
import { FileDrawer } from './FileDrawer';
import type { PillOption } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { ANSWERS_KEY } from '../../core/files/answersKey';
import type { AnswersKey } from '../../core/files/answersKey';
import type { FileSlotId } from '../../core/files/slots';
import type { FileCopy } from '../../core/files/source';
import { DRAWER_CLOSED_HEIGHT, DRAWER_REST_HEIGHT } from '../../core/drawer/height';
import { shownDrawerMode } from '../../core/drawer/mode';
import type { DrawerMode } from '../../core/drawer/mode';
import {
  FLOW_NAV_CLEARANCE,
  FLOW_NAV_HEIGHT,
  FLOW_NAV_LABEL,
  FLOW_SAVE_NOTE_FOOT,
  flowBottomReserve,
  navHitPadding,
  navPaintOverhang,
} from '../../core/flow/dock';
import { NAV_MELT_DROP, NAV_MELT_STAGGER_MS, NAV_RISE_DELAY_MS } from '../../core/flow/navMelt';
import { questionAreaOffset } from '../../core/flow/composition';
import {
  findPosition,
  applyAnswer,
  applySkip,
  applyReflect,
  applyAddAnother,
  applySeededAddAnother,
  seededNameTaken,
  reconcileSeededRepeatable,
  findSeedTarget,
  findSeedStep,
  questionCount,
  existingValue,
  topLevelIndex,
  moduleFor,
} from '../../core/flow/runner';
import type { Position, StepLocation } from '../../core/flow/runner';
import { needsName } from '../../core/flow/addAnother';
import { offListOptions } from '../../core/flow/customOptions';
import {
  promptFor,
  attachHintFor,
  PROOF_SCORE_BASELINE_KEY,
  PROOF_SCORE_CONTEXT_KEY,
  PROOF_GRADE_TEXT_KEY,
  PROOF_SERVICE_KEY,
} from '../../core/flow/proofAdapter';
import { hintStaysVisible } from '../../core/flow/deepDive';
import { usesOrbChoice } from '../../core/choice/orbs';
import { ideaAt, ideasFor } from '../../core/flow/ideas';
import { makeScoreEntry, appendScore, scoreDelta } from '../../core/report/scoring';
import { narrationFor, narrationForFollowUp } from '../../core/voice/narration';
import { NARRATION_COPY } from '../voice/copy';
import { useNarration } from '../voice/useNarration';
import { useNarratorPref } from '../voice/prefs';
import {
  ROTATION_RUNNING,
  stopRotation,
  stoppedBy as reasonFor,
  type RotationInteraction,
} from '../../core/motion/rotation';
import { speak, stopSpeaking } from '../voice/speech';
import type { AnswerValue, DeepDiveEntry, FileOutlineNode, FlowContext, Module, Option, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './Flow.css';

export interface FlowProps {
  modules: Module[];
  /** What to show once every step in `modules` is answered, for a flow that
   * ends with its own screen (the proof loop's recommendations recap, R1-11).
   * Ignored when `onDone` is given — see `onDone`. */
  renderDone?: (answers: Answers, persist: (next: Answers) => Promise<boolean>) => ReactNode;
  /**
   * R1-12: for a flow whose "done" state has no screen of its own — the
   * Context flow specifically — hand off to Home instead, which is now the
   * one place both a fresh open *and* a just-finished interview land (see
   * docs/ARCHITECTURE.md and App.tsx). Fires once, as soon as `findPosition`
   * resolves to `done`, via `useLayoutEffect` so the switch happens before
   * paint rather than flashing a "done" screen for one frame first. Does
   * NOT fire while the most recent save is still failed — see the
   * `saveError` branch below, which keeps the person on a screen that shows
   * the failure instead of silently carrying them past it (docs/GUARDRAILS.md's
   * degradation table: a storage failure must never lose an answer quietly).
   */
  onDone?: (() => void) | undefined;
  /** R1-12: deep-links into a specific position instead of the derived
   * "first thing left to do" — e.g. Home's next-move card sending the
   * person straight back to an already-answered `role_durability` field.
   * Exactly the same mechanism `goBack` already uses to view a prior
   * position (`viewing`, below) — this is just its initial value. */
  initialPosition?: Position | undefined;
  /**
   * V1.1 VB-07: the file this flow is writing, as a section tree. Given, the
   * flow docks a drawer under the question showing the outline filling in and
   * the real text assembling (see FileDrawer.tsx). Omitted, there is no
   * drawer at all — which is how the proof loop renders, since it writes no
   * file and there is nothing for a tree to show.
   */
  outline?: FileOutlineNode[] | undefined;
  /**
   * V2.2 — which storage key this flow's answers live under. Defaults to
   * Context's, which is what every existing caller means; the Skills flow
   * passes `ANSWERS_KEY.skills`. The seam V1.8's answersKey table promised —
   * one prop, and nothing else about the runner knows which file it is
   * writing.
   */
  answersKey?: AnswersKey | undefined;
  /** V2.2 — the drawer's file identity and copy, alongside the key. Same
   * default, same reason. */
  fileId?: FileSlotId | undefined;
  fileCopy?: FileCopy | undefined;
}

const EMPTY_ANSWERS: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

/**
 * V1.1 VB-04's rephrase glyph — the "ring and mark": a circular refresh arc
 * enclosing a small question mark. Same inline-SVG convention as Home.tsx's
 * PERSON_ICON (stroke-based, `currentColor`, `aria-hidden` because the
 * button around it carries the real accessible name, S.rephrase).
 *
 * The earlier sketch — a question mark whose dot curls into an arrowhead —
 * was drawn and rejected: at 17px the arrowhead disappears and it reads as a
 * plain question mark, i.e. "help" rather than "rephrase". The ring carries
 * the "again" meaning at this size; the mark carries "question". Stroke
 * width is 2 here rather than PERSON_ICON's 1.8 because this glyph has four
 * marks inside the same 17px box instead of two, and 1.8 lets the arc's tail
 * fade out on a 1x display.
 *
 * The two groups are the animation, not the drawing: the shape is identical
 * to the static version this replaced — same four marks, same path data, same
 * stroke — but "spin and swap" (VB-04, decided from a prototype) moves the
 * ring and the mark against each other, so they have to be separately
 * addressable. Presentation attributes stay on the <svg> root and inherit
 * straight through the groups, so grouping changes nothing about how it
 * renders. Everything the groups then do lives in Flow.css.
 *
 * Exported for its unit test — the path data is a transcription, and a test
 * that it is still character-for-character the drawn one is the only thing
 * that catches a digit lost in a refactor.
 */
export const REPHRASE_ICON = (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* the arc and its arrowhead — the half that says "again" */}
    <g className="rephrase-ring">
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.9 3.6v4.6h-4.6" />
    </g>
    {/* the question mark and its dot — the half that says "different words" */}
    <g className="rephrase-mark">
      <path d="M9.6 9.7a2.5 2.5 0 1 1 2.7 2.8v1.4" />
      <circle cx="12.3" cy="16.9" r="1.05" fill="currentColor" stroke="none" />
    </g>
  </svg>
);

/**
 * V1.1 VB-08's glyph — an outline light bulb, drawn to the same convention as
 * REPHRASE_ICON above and Home.tsx's PERSON_ICON (stroke-based, `currentColor`,
 * `aria-hidden` because the button around it carries a visible label as well
 * as the accessible name).
 *
 * Two groups, because "pop + rays" (VB-08, decided from a prototype) moves
 * them against each other:
 *
 *  - `.idea-glass` — the bulb outline and the two base lines. This is the
 *    whole glyph at rest. The outline is one closed path: an arc the long way
 *    over the top (large-arc, sweep) from the left shoulder to the right one,
 *    then down the short neck and back. Its circle is centred at (12, 9.6)
 *    with r 4.8, which is where the shoulder endpoints' y of 14 comes from,
 *    so the arc closes exactly rather than being nudged by eye.
 *  - `.idea-rays` — five short strokes fanned about the bulb's top at 32.5°
 *    apart (-155° to -25°), each running from 3.6 to 5.4 units out from it.
 *    The fan stays above the shoulders, and the gap is as wide as it is
 *    because a round cap adds a unit at each end: drawn any closer, the burst
 *    welds itself to the glass at the size this actually renders — checked on
 *    screen, not on paper. They are
 *    `opacity: 0` at rest (Flow.css) and exist ONLY during a press: a bulb
 *    that is permanently lit says "this is on", which is not what this button
 *    does. Naming them as their own group is what lets the rest state and the
 *    burst be the same drawing.
 *
 * Group names are prefixed rather than the bare `.glass`/`.rays` the spec
 * sketches, matching VB-04's identical departure (`.rephrase-ring`, not
 * `.ring`) — a two-letter class in a shared stylesheet is a collision waiting
 * to happen.
 *
 * Exported for its unit test: the path data is drawn, not derived, and a test
 * that it is still character-for-character the drawn one is the only thing
 * that catches a digit lost in a refactor.
 */
export const IDEA_ICON = (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* the bulb itself — everything that is visible at rest */}
    <g className="idea-glass">
      <path d="M10.1 14A4.8 4.8 0 1 1 13.9 14v1.1h-3.8z" />
      <path d="M10.2 17h3.6" />
      <path d="M10.9 19.1h2.2" />
    </g>
    {/* the flash — invisible until the button is pressed */}
    <g className="idea-rays">
      <path d="M8.7 3.3L7.1 2.5" />
      <path d="M9.9 1.9L8.9 0.4" />
      <path d="M12 1.2V-0.6" />
      <path d="M14.1 1.9L15.1 0.4" />
      <path d="M15.3 3.3L16.9 2.5" />
    </g>
  </svg>
);

/**
 * The class Flow.css hangs VB-04's press cue on. It sits on the *button*, not
 * on the glyph, because the reduced-motion equivalent is a fill on the button
 * itself — one class then drives both forms of the same cue, and there is no
 * state in which one is applied and the other is not.
 */
export const REPHRASE_CUE_CLASS = 'is-rephrasing';

/** VB-08's equivalent, on the same reasoning. */
export const IDEA_CUE_CLASS = 'is-popping';

/**
 * Plays a press cue, from the start, however recently it last played.
 *
 * Both of this screen's icon-buttons are controls people press repeatedly —
 * that is the whole purpose of each — so the interesting case is the press
 * that lands mid-flight. Simply leaving the class on does nothing at all the
 * second time: the animation is already running and the browser has no reason
 * to restart it. Removing it and adding it back in the same task does nothing
 * either, because style changes are batched and the browser only ever sees the
 * end state, which is unchanged. Reading a layout property in between forces
 * the removal to be committed first, so the re-add is genuinely a new
 * animation. That is the whole trick, and it is why the fourth press feels the
 * same as the first rather than queueing behind three others.
 */
function restartCue(element: HTMLElement, cueClass: string): void {
  element.classList.remove(cueClass);
  void element.offsetWidth;
  element.classList.add(cueClass);
}

/** VB-04's rephrase press cue — see `restartCue`. */
export function restartRephraseCue(button: HTMLElement): void {
  restartCue(button, REPHRASE_CUE_CLASS);
}

/**
 * VB-08's "give me an example" press cue — see `restartCue`.
 *
 * This one is pressed harder than rephrase: ten ideas on the two reference
 * questions, and flicking through them is how a person reads them. The cue is
 * 120ms rather than rephrase's 200ms for exactly that reason
 * (docs/design-system.html §06's "below perception" band), which also means a
 * burst of presses arrives well inside one another's playback.
 */
export function restartIdeaCue(button: HTMLElement): void {
  restartCue(button, IDEA_CUE_CLASS);
}

function positionKey(position: Position): string {
  if (position.kind === 'done') return 'done';
  if (position.kind === 'module-intro') return `module-intro:${position.module.id}`;
  if (position.kind === 'add-another') return `add-another:${position.block.id}:${position.recordIndex}`;
  const { step, location } = position;
  return location.in === 'top' ? `top:${step.id}` : `rep:${location.blockId}:${location.recordIndex}:${step.id}`;
}

function resolvePhrase(phrase: Step['q'], ctx: FlowContext): string {
  return typeof phrase === 'function' ? phrase(ctx) : phrase;
}

/** The same, for a phrase that may not be there at all — `Step.ph` became a
 * `Phrase` in V2.0 VB-62 so an example can phrase itself for the kind of thing
 * being named, and most are still plain strings. `undefined` stays undefined,
 * so a field with no example still renders without one. */
function resolveOptionalPhrase(phrase: Step['ph'], ctx: FlowContext): string | undefined {
  if (phrase === undefined) return undefined;
  return typeof phrase === 'function' ? phrase(ctx) : phrase;
}

/**
 * V1.1 VB-03. A question's deep-dive replaces its always-visible hint — the
 * hint paragraph is what the disclosure is made of, so rendering both would
 * print the same guidance twice.
 *
 * The exception is the three `voice_*` questions, whose hint is a set of
 * worked examples rather than an explanation: those samples are what make the
 * question answerable at a glance, so they stay inline *and* the question gets
 * a deep-dive that says something the hint doesn't. Which questions those are
 * is data, not a condition — see core/flow/deepDive.ts's HINT_STAYS_VISIBLE.
 */
function showsHint(step: Step): boolean {
  if (!step.hint) return false;
  return !step.deepDive?.length || hintStaysVisible(step.id);
}

/**
 * V1.3 VB-17 — the answer area, as a band the layout can distribute space
 * into.
 *
 * Everything the person acts on for the question on screen: the field and its
 * "give me an example" button, the pills and their "add your own", the paste
 * box on a `gen` step, and whatever error any of them raised. Not the
 * question, not its hint, not the deep-dive — those are the prompt, and they
 * stay tight together at the top where they are read.
 *
 * It exists purely so Flow.css has something to hand the leftover room to. The
 * question surface fills the panel down to the docked chrome (see
 * core/flow/composition.ts), and *where the slack goes* is the whole of VB-17.
 *
 * REWORKED. The first build handed the slack to this band and centred it,
 * which put air on BOTH sides of the answer — a 124px hole between the
 * question and its field and a 140px one under the last control, measured on
 * the built extension at 400x760. Two dead bands are blanker than the one they
 * replaced, so the band now takes the room at its own foot instead: the
 * question, its help and these controls stay one cluster, and the leftover
 * room falls in a single seam below them, with the save note riding on top of
 * it just above the docked bar. A `multiline` question spends that room on its
 * text box rather than leaving it blank (Flow.css), which is the only thing on
 * the screen that can genuinely use it.
 *
 * core/flow/composition.ts's `inspectCluster` is what holds this — every seam
 * inside the cluster measured against CLUSTER_MAX_INTERNAL_GAP by
 * tests/e2e/question-fill.spec.ts, because the old e2e checked only the
 * cluster's outer bounds and a hole in the middle of it passed.
 *
 * A wrapper rather than a rule on the form's children, because "the answer"
 * is two or three siblings on most kinds and none at all on an intro — the
 * grouping is real, and the accessible structure is unchanged either way (no
 * role, no label: every control inside keeps its own).
 */
function AnswerArea({ children }: { children: ReactNode }) {
  return <div className="flow-answer">{children}</div>;
}

/** The question block's hint and deep-dive, rendered identically wherever a
 * question is asked — including the reflect screen's "Say it again" re-ask,
 * which is the same question and deserves the same help.
 *
 * V1.3 VB-18: `onDisclose` is how a follow-up reaches the narrator — the
 * `followUp` voice role is the one whose content only exists here. It fires
 * with the entry that just opened, or `null` when the open one closes.
 *
 * V1.8 VB-42: the follow-ups are one rotating text link rather than a row of
 * tags. The rotation itself, its five seconds and every reason it stops live
 * in `core/motion/rotation.ts` and `components/DeepDive.tsx`; the primary
 * question and the status bar above are untouched by any of it, which is
 * docs/V1.8-REFINEMENT.md's DECISIONS 3 in one sentence.
 *
 * V2.0 VB-57: the one thing the rotation still needs from outside itself is
 * whether the person has touched the rest of the question — the answer field,
 * rephrase, blank space beside the heading. `stoppedBy` carries it, and the
 * question area's own capture handlers are what produce it (see `stopHere`
 * below). There is no longer a preference to read: "Show all" is gone, so
 * `mode` is always the rotating presentation and `core/motion/rotation.ts`
 * decides on its own when that collapses back to the list (one follow-up,
 * or reduced motion). */
function QuestionHelp({
  step,
  onDisclose,
  stoppedBy = null,
}: {
  step: Step;
  onDisclose?: ((entry: DeepDiveEntry | null) => void) | undefined;
  stoppedBy?: RotationInteraction | null;
}) {
  return (
    <>
      {showsHint(step) && <p className="flow-hint">{step.hint}</p>}
      {step.deepDive && step.deepDive.length > 0 && (
        <DeepDive
          idPrefix={`flow-${step.id}`}
          entries={step.deepDive}
          onDisclose={onDisclose}
          mode="one"
          stoppedBy={stoppedBy}
        />
      )}
    </>
  );
}

function errorFor(step: Step): string {
  if (step.id === 'preferred_name') return S.errNeedName;
  if (step.kind === 'text' || step.kind === 'gen') return S.errNeedAnswer;
  return S.errPickOne;
}

/** R1-11: which paste-in label a `kind: 'gen'` step shows — switches on
 * `genKey` the same way `errorFor` above switches on a step's own id, since
 * neither is worth a new Step field just for one flow's three variants. */
function pasteLabelFor(step: Step): string {
  if (step.genKey === 'withContext') return S.proofPaste2;
  if (step.genKey === 'grade') return S.proofPaste3;
  return S.proofPaste1; // 'baseline'
}

/** A synthetic top-level Step whose only real purpose is naming a storage
 * key — used to persist the grade step's two score sub-fields through the
 * same `applyAnswer` every other answer goes through, without adding a
 * second Step-shaped thing to the proof module's own data for two numbers
 * that are genuinely part of one screen, not two more questions. */
function scoreSubStep(key: string): Step {
  return { id: key, module: 0, section: -1, eyebrow: '', q: '', kind: 'text', key };
}

/**
 * One generic step runner for all five flows (only `context` has content —
 * see docs/RELEASE-1.md R1-05/R1-06). Position is derived from wb:answers on
 * every render, never stored — see core/flow/runner.ts. `Flow` owns only
 * session-level state (loaded answers, Back history, declined repeatables);
 * everything specific to the question on screen lives in `StepView`, mounted
 * fresh per position via `key` — see its own comment for why.
 */
export function Flow({ modules, renderDone, onDone, initialPosition, outline, answersKey = ANSWERS_KEY.context, fileId, fileCopy }: FlowProps) {
  const [answers, setAnswersState] = useState<Answers | null>(null);
  const [declinedBlocks, setDeclinedBlocks] = useState<ReadonlySet<string>>(new Set());
  // V1.1 VB-05: module ids whose transition screen has been continued past
  // this session. Ephemeral, exactly like `declinedBlocks` above — a
  // transition has no answer to record, so this is only what keeps it from
  // reappearing in the gap between "continue" and the first answer inside
  // the module. A real close/reopen resumes past it on the derivation alone
  // (core/flow/runner.ts's `moduleHasAnyAnswer`), with nothing persisted.
  const [seenIntros, setSeenIntros] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<Position[]>([]);
  const [viewing, setViewing] = useState<Position | null>(initialPosition ?? null);
  const [saveError, setSaveError] = useState(false);
  // R1-12: whether the most recent `persist` is still in flight. `onDone`
  // hands off to Home, which loads `wb:answers` fresh from storage on its
  // own mount rather than being handed this component's in-memory state —
  // redirecting the instant `position` turns 'done' (i.e. as soon as
  // `setAnswersState` runs, synchronously, well before the `chrome.storage`
  // write it's paired with actually resolves) would let Home read stale
  // data and silently miss the very last answer. Gating the redirect on this
  // closes that race without Home needing to know or care that it exists.
  const [savePending, setSavePending] = useState(false);
  // V1.1 VB-07, continuous since V1.2 VB-12. Ephemeral, like `history` and
  // `declinedBlocks` above and for the same reason: it is a fact about this
  // glance at the panel, not about the person's file — so it starts at the
  // peek on every open, however far it was dragged last time. The question
  // stays the primary object on a 400px panel.
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_REST_HEIGHT);
  /**
   * V2.3 VB-99 — whether the drawer is CLOSED: below the peek, showing only
   * the grabber and one status line. A separate boolean rather than a height,
   * deliberately: the clamp floors every height at the peek, so a closed
   * "height" would be re-opened by the first panel resize that re-clamps it.
   * `drawerHeight` keeps the person's open height untouched underneath —
   * though reopening goes to the MINIMUM (Adam's call), so closing also parks
   * the height there. Ephemeral like everything beside it.
   */
  const [drawerClosed, setDrawerClosed] = useState(false);
  /**
   * V1.4 VB-22. Which drawer mode was *asked for* — held here rather than
   * inside `FileDrawer` because the drawer's chrome is no longer only the
   * drawer's: the docked bar above it takes the same stage colour and fades it
   * into the panel, so the mode has to be known one level up from the thing it
   * used to be private to. Ephemeral, exactly like `drawerHeight` beside it —
   * the panel opens on List however it was left (see core/drawer/mode.ts).
   *
   * What is *shown* is still derived, never held: `shownDrawerMode` folds the
   * request together with `brainYielded` below, so dragging the drawer short
   * hands Brain over to List and dragging it back hands it back — with the
   * bar's colour following, because both read this one value.
   */
  const [requestedDrawerMode, setRequestedDrawerMode] = useState<DrawerMode>('list');
  /**
   * V2.0 VB-70 — whether Brain has had to give the drawer up because the stage
   * ran out of room for the globe.
   *
   * The other half of the request above, and the reason the coupling is
   * reversible in both directions: the *request* is what the person chose and
   * never changes on its own, this is what the drawer's current size allows,
   * and the mode on screen is the fold of the two. Somebody who pressed `List`
   * is never affected by it however tall they make the drawer — VB-70's
   * "auto-transition INTO Brain is a suggestion, not a necessity".
   *
   * Ephemeral, like the height it is computed from. Set by the drawer, in the
   * same call that reports the new height, so the two can never be a frame
   * apart and the morph is never asked to run against a mode that is about to
   * be corrected. The threshold and the hysteresis are core/drawer/mode.ts's
   * (`nextBrainYield`) — nothing about it is decided here.
   */
  const [brainYielded, setBrainYielded] = useState(false);
  /**
   * V2.0 VB-70. Two facts, one call, one batch: how tall the drawer is now, and
   * whether that height still leaves the stage room for the globe. Set together
   * because the mode on screen is the fold of them — reporting them separately
   * would give the panel a render in which a tall drawer still believed Brain
   * had yielded, and that render is a 520ms morph nobody asked for.
   *
   * A stable identity because the drawer watches it: two of its effects have it
   * in their dependency list, and a fresh function every render would re-run
   * both on every frame of a drag.
   */
  const resizeDrawer = useCallback((next: number, yielded: boolean) => {
    setDrawerHeight(next);
    setBrainYielded(yielded);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getLocal(answersKey).then((stored) => {
      if (!cancelled) setAnswersState(stored ?? EMPTY_ANSWERS);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!answers) return null;
  // Fresh non-null binding — nested functions below can't rely on the
  // narrowing above (see StepView's persist/handleNext for the same pattern).
  const ans = answers;

  const total = questionCount(modules);
  const position = viewing ?? findPosition(modules, ans, declinedBlocks, seenIntros);

  async function persist(next: Answers): Promise<boolean> {
    setAnswersState(next);
    setSavePending(true);
    const result = await setLocal(answersKey, next);
    setSaveError(!result.ok);
    setSavePending(false);
    return result.ok;
  }

  function goBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setViewing(prev);
  }

  function handleCommit(from: Position, next: Answers) {
    void persist(next);
    setHistory((h) => [...h, from]);
    setViewing(null);
  }

  /** V1.1 VB-05's "continue". Writes nothing to `wb:answers` — there is no
   * question on a transition screen to answer — so this is the same
   * ephemeral advance `handleAddAnotherDecision`'s "no more" branch makes:
   * remember the decision for this session, push the screen onto Back's
   * history, and let `findPosition` derive what comes next. */
  function continuePastModuleIntro(from: Extract<Position, { kind: 'module-intro' }>) {
    setSeenIntros((s) => new Set(s).add(from.module.id));
    setHistory((h) => [...h, from]);
    setViewing(null);
  }

  /**
   * V1.4 VB-20 adds `name`, and with it the second way a record can be added.
   *
   * An open-ended block appends an empty record and asks its first field next.
   * A SEEDED block cannot: its records are rebuilt from the seed question's
   * answer, so an unnamed record is deleted — with everything answered inside
   * it — the moment that question is re-submitted. `applySeededAddAnother`
   * writes the name to both places at once, which is what makes the next
   * reconcile a no-op instead of a deletion (see its own comment).
   *
   * The seeded path therefore refuses rather than guesses: no name, or no seed
   * question to append it to, and nothing is added at all. Nothing is lost by
   * refusing — the record would hold no answers yet — whereas adding one that
   * cannot survive is exactly the trap this task exists to close. The panel
   * never reaches it: `StepView` will not submit "Yes" on a naming block
   * without a name.
   */
  function handleAddAnotherDecision(from: Position, blockId: string, wantsMore: boolean, name?: string) {
    const block = from.kind === 'add-another' ? from.block : undefined;
    const seedStep = block && needsName(block) ? findSeedStep(modules, block) : undefined;
    // What "yes" writes — or null when it cannot be honoured, which is also
    // what "no" produces. A naming block needs both a name and a seed question
    // to append it to; every other block just gets an empty record.
    const grown = !wantsMore
      ? null
      : block && needsName(block)
        ? seedStep && name?.trim()
          ? applySeededAddAnother(ans, block, seedStep, name)
          : null
        : applyAddAnother(ans, blockId, true);

    if (grown) {
      setDeclinedBlocks((s) => {
        const next = new Set(s);
        next.delete(blockId);
        return next;
      });
      void persist(grown);
    } else {
      setDeclinedBlocks((s) => new Set(s).add(blockId));
    }
    setHistory((h) => [...h, from]);
    setViewing(null);
  }

  /**
   * V1.1 VB-07: the question, with the file it is writing docked underneath.
   *
   * The drawer is mounted OUTSIDE the per-position remount on purpose.
   * `StepView` is keyed by `positionKey` so each question is a fresh mount
   * (see its own comment); a tree remounted alongside it would look like a
   * first mount on every question, and its rows would never type themselves in
   * — the whole terminal effect would silently do nothing. Keeping it here, as
   * a sibling of whatever screen is showing, means it lives for the length of
   * the interview and sees every transition.
   *
   * `.flowshell` reserves the docked chrome's height beneath the screen, so
   * nothing down there ever covers the question: it is a dock, not an overlay.
   * V1.2 VB-12 makes the drawer's height a number the person drags to, so the
   * reservation is a live value rather than the two states it used to be, and
   * V1.2 VB-11 adds the navigation bar riding on the drawer's top edge to what
   * is being reserved for.
   *
   * The three custom properties are the only channel between the arithmetic
   * (core/flow/dock.ts, unit-tested) and the stylesheet, which never does the
   * sum itself:
   *
   *  - `--drawer-h`    where the drawer's top edge is, i.e. where the nav bar
   *                    is pegged. Set here rather than read from the drawer so
   *                    the bar and the drawer move off one number.
   *  - `--flow-nav-h`  how tall that bar is.
   *  - `--flow-reserve` how much room the whole dock needs underneath.
   *
   * V1.3 VB-17 adds a fourth, `--flow-area-offset`: everything the question
   * area is *not*, which the stylesheet subtracts from `100dvh` to get the
   * room the question fills. Same discipline as the other three — the sum is
   * core/flow/composition.ts's and arrives here already evaluated — with the
   * viewport term deliberately left to CSS so the composition follows a panel
   * being resized without a listener. See that file's header.
   */
  function withDrawer(screen: ReactNode): ReactNode {
    if (!outline) return screen;
    const drawerMode = shownDrawerMode(requestedDrawerMode, brainYielded);
    return (
      <div
        className="flowshell"
        // V1.4 VB-22. Which stage the whole docked chrome is dressed in —
        // read by the drawer AND by the bar above it, so the two cannot
        // disagree about what colour they are.
        data-stage={drawerMode}
        style={
          {
            // V2.3 VB-99 — while CLOSED, everything that reserves for the
            // drawer reserves the closed face's height instead, so the
            // question area gains the difference the moment it closes.
            '--drawer-h': `${drawerClosed ? DRAWER_CLOSED_HEIGHT : drawerHeight}px`,
            '--flow-nav-h': `${FLOW_NAV_HEIGHT}px`,
            '--flow-reserve': `${flowBottomReserve(drawerClosed ? DRAWER_CLOSED_HEIGHT : drawerHeight)}px`,
            '--flow-area-offset': `${questionAreaOffset(drawerClosed ? DRAWER_CLOSED_HEIGHT : drawerHeight)}px`,
            // V1.7 VB-41. The button cluster's two boxes, from
            // core/flow/dock.ts: the padding that makes a control 44px tall,
            // the overhang that takes the difference back out of the layout
            // so it *paints* at 26, the label's own line box both are
            // measured from, and the clear space left above the drawer. The
            // stylesheet draws them; it does not work any of them out. These
            // replace the five the fade needed — see chrome.ts's header.
            '--nav-hit-pad': `${navHitPadding()}px`,
            '--nav-paint-inset': `${navPaintOverhang()}px`,
            '--nav-label-h': `${FLOW_NAV_LABEL}px`,
            '--nav-clearance': `${FLOW_NAV_CLEARANCE}px`,
            // V1.8 VB-44. The foot under the save note — one gutter, not the
            // surface's whole 20px frame, and held under the clearance above
            // by core/flow/dock.ts. Published from the same file for the same
            // reason as the four above: the two gaps either side of the button
            // cluster are one decision and the stylesheet makes neither of them.
            '--flow-note-foot': `${FLOW_SAVE_NOTE_FOOT}px`,
            // V1.9 VB-53. The melt's two numbers, on the same terms as the
            // five above: how far a control's ink travels into the bar, and
            // how far the rise is laid over the melt so the two read as one
            // gesture rather than as two animations. The durations either side
            // of that delay are the design system's own tokens and are read
            // straight from the stylesheet (`--fast`); the delay is the only
            // one that is a sum, and core/flow/navMelt.ts is where it is held
            // to 200ms in total and to a travel that never carries the ink out
            // of the 44px box it belongs to.
            '--nav-melt-drop': `${NAV_MELT_DROP}px`,
            '--nav-rise-delay': `${NAV_RISE_DELAY_MS}ms`,
            // V2.0. How long after one control starts the next one does —
            // the whole of the wave that made this gesture visible. Derived
            // in core/flow/navMelt.ts from the length the design system
            // allows a full cluster's reform to take, never chosen here.
            '--nav-stagger': `${NAV_MELT_STAGGER_MS}ms`,
            // V1.9 VB-50: `--dock-frame` was published here for V1.6 VB-29's
            // white border down the drawer's sides. The frame is gone — one
            // colour edge to edge is a frame's opposite — so the constant went
            // with it (core/drawer/chrome.ts) rather than being published to a
            // stylesheet that no longer reads it.
          } as CSSProperties
        }
      >
        {screen}
        <FileDrawer
          outline={outline}
          modules={modules}
          answers={ans}
          file={fileId}
          fileCopy={fileCopy}
          position={position}
          height={drawerHeight}
          closed={drawerClosed}
          onClosed={setDrawerClosed}
          onResize={resizeDrawer}
          brainYielded={brainYielded}
          mode={drawerMode}
          onRequestMode={setRequestedDrawerMode}
          onNavigate={(next) => {
            // Exactly what `goBack` does in reverse: remember where we were so
            // Back returns there, then view the requested position. No new
            // mechanism — `viewing` has done this since R1-12.
            setHistory((h) => [...h, position]);
            setViewing(next);
          }}
        />
        {/* V1.9 VB-53 — where the outgoing buttons go.
            One layer, mounted for the whole interview rather than per
            question, because that is the entire point: the cluster it holds
            copies of has already left the document by the time anyone could
            see it leave (`StepView` is keyed by position). Empty at rest, and
            `.flow-foot:empty`'s twin in Flow.css takes it out of the layout
            entirely when it is — so at every moment except the 120ms after an
            answer, this is nothing at all.
            Last child, so it paints over the band it shares a position with
            and under the drawer, whose z-index is higher. Not given the
            `.flow-foot` class on purpose: several specs resolve that as a
            single locator, and a second one would break them.
            See components/NavCluster.tsx for the whole mechanism. */}
        <div className={NAV_MELT_LAYER_CLASS} aria-hidden="true" />
      </div>
    );
  }

  if (position.kind === 'done') {
    // Never hand off while the last write is still in flight — see
    // `savePending`'s own comment on the race that closes.
    if (savePending) return null;
    // The common path: hand off to Home immediately, before paint — see
    // `onDone`'s own doc comment on why this is a layout effect and why it
    // never fires while `saveError` is set.
    if (onDone && !saveError) {
      return <DoneRedirect onDone={onDone} />;
    }
    return (
      <div className="flow flow-done">
        {saveError && (
          <div role="alert" className="flow-error">
            {S.errSaveFailed}
          </div>
        )}
        {renderDone
          ? renderDone(ans, persist)
          : onDone && (
              <Button type="button" variant="primary" onClick={onDone}>
                {S.backToFiles}
              </Button>
            )}
      </div>
    );
  }

  if (position.kind === 'module-intro') {
    return withDrawer(
      <ModuleIntro
        key={positionKey(position)}
        cue={positionKey(position)}
        module={position.module}
        current={topLevelIndex(modules, position)}
        total={total}
        answers={ans}
        canGoBack={history.length > 0}
        saveError={saveError}
        onBack={goBack}
        onContinue={() => continuePastModuleIntro(position)}
      />,
    );
  }

  return withDrawer(
    <StepView
      key={positionKey(position)}
      cue={positionKey(position)}
      modules={modules}
      pos={position}
      answers={answers}
      total={total}
      canGoBack={history.length > 0}
      saveError={saveError}
      onBack={goBack}
      onCommit={(next) => handleCommit(position, next)}
      onAddAnotherDecision={(blockId, wantsMore, name) =>
        handleAddAnotherDecision(position, blockId, wantsMore, name)
      }
    />,
  );
}

/** Fires `onDone` once, before paint, and renders nothing — see `onDone`'s
 * doc comment on `FlowProps`. A separate component (rather than an effect
 * inline in `Flow`) because a hook can't be called conditionally, and this
 * path is only reached for a subset of renders (`position.kind === 'done'`). */
function DoneRedirect({ onDone }: { onDone: () => void }) {
  useLayoutEffect(() => {
    onDone();
  }, [onDone]);
  return null;
}

/**
 * The proof loop's `kind: 'demo'` recommendations screen (R1-11) — relays
 * whatever was pasted on the grade step back verbatim, read-only, and shows
 * the score difference computed for display only (core/report/scoring.ts's
 * `scoreDelta` — never persisted; only the with-context number itself was
 * ever written to wb:report). If the grade step was skipped, there is
 * nothing to relay or compute — this degrades to the heading/hint alone
 * rather than showing an empty block or a stray "NaN".
 */
function DemoBody({ answers }: { answers: Answers }) {
  const gradeText = answers.values[PROOF_GRADE_TEXT_KEY];
  const baselineScore = answers.values[PROOF_SCORE_BASELINE_KEY];
  const contextScore = answers.values[PROOF_SCORE_CONTEXT_KEY];
  const hasGrade = typeof gradeText === 'string' && gradeText.trim() !== '';
  const hasScores = typeof baselineScore === 'string' && typeof contextScore === 'string';

  return (
    <>
      {hasScores && <p className="flow-hint">{S.proofScoreDelta(scoreDelta(Number(baselineScore), Number(contextScore)))}</p>}
      {hasGrade && <ReadOnlyBlock tag={S.proofDoneSub}>{gradeText}</ReadOnlyBlock>}
    </>
  );
}

/**
 * What a select question starts with selected: whatever is already stored for
 * it. Lifted out of `StepView`'s draft initialiser at V1.4 VB-20, because two
 * pieces of that component's opening state are now computed from it — the
 * draft itself, and the pills for any value the question's own options do not
 * carry (see `offListOptions`). Both have to see the same list, and both are
 * lazy initialisers that run exactly once at mount, so it is a function rather
 * than a value.
 */
function initialSelection(
  pos: Exclude<Position, { kind: 'done' } | { kind: 'module-intro' }>,
  answers: Answers,
): string[] {
  if (pos.kind === 'add-another') return [];
  const { step } = pos;
  if (step.kind === 'text' || step.kind === 'gen' || step.kind === 'demo') return [];
  const existing = existingValue(answers, step, pos.location);
  return Array.isArray(existing) ? existing : typeof existing === 'string' ? [existing] : [];
}

interface StepViewProps {
  modules: Module[];
  /** V2.0 — the position key, threaded down to every `NavCluster` this screen
   * can render so the melt plays on each new question rather than on each
   * remount. See components/NavCluster.tsx. */
  cue: string;
  /** Every position that is a question of some shape. `done` hands off to
   * Home, and `module-intro` is its own screen (see `ModuleIntro`) — neither
   * has a step to render. */
  pos: Exclude<Position, { kind: 'done' } | { kind: 'module-intro' }>;
  answers: Answers;
  total: number;
  canGoBack: boolean;
  saveError: boolean;
  onBack: () => void;
  onCommit: (next: Answers) => void;
  /** `name` is V1.4 VB-20's: set only when the block names its new records —
   * see `Flow`'s `handleAddAnotherDecision`. */
  onAddAnotherDecision: (blockId: string, wantsMore: boolean, name?: string) => void;
}

/**
 * Everything specific to the question currently on screen. Mounted with
 * `key={positionKey(pos)}` by the parent, so moving to a new question is a
 * full remount, not an update — draft values, the rephrase cycle, and any
 * pending error are computed fresh at mount from the current answers, with
 * no reset-in-an-effect lag where a new question could render for one frame
 * with the previous question's leftover state (a real bug caught by manual
 * testing, not just a lint rule: rephrasing text briefly flashed the wrong
 * question's rephrasing when advancing).
 */
function StepView({
  modules,
  cue,
  pos,
  answers,
  total,
  canGoBack,
  saveError,
  onBack,
  onCommit,
  onAddAnotherDecision,
}: StepViewProps) {
  const [draftValues, setDraftValues] = useState<string[]>(() => initialSelection(pos, answers));
  // Doubles as the reflect screen's "Say it again" draft — pre-filled with
  // the already-typed raw text so redoing edits it instead of starting over.
  // Also doubles as `kind: 'gen'`'s paste-in field (R1-11) — same "one free
  // text buffer per step" shape, just a different storage key underneath
  // (see runner.ts's `storageKeyFor`, which prefers `outKey` for `gen`).
  const [draftText, setDraftText] = useState(() => {
    if (pos.kind === 'add-another' || (pos.step.kind !== 'text' && pos.step.kind !== 'gen')) return '';
    const existing = existingValue(answers, pos.step, pos.location);
    return typeof existing === 'string' ? existing : '';
  });
  // R1-11: the grade step's two self-reported "out of 10" numbers. Not
  // modelled as their own Steps — they're genuinely two fields on one
  // screen, not two more questions — so they get their own draft state and
  // are persisted via `scoreSubStep` (see above) alongside the pasted
  // grade text on that one step's Next.
  const [draftScoreBaseline, setDraftScoreBaseline] = useState(() => {
    if (pos.kind === 'add-another' || pos.step.genKey !== 'grade') return '';
    const existing = answers.values[PROOF_SCORE_BASELINE_KEY];
    return typeof existing === 'string' ? existing : '';
  });
  const [draftScoreContext, setDraftScoreContext] = useState(() => {
    if (pos.kind === 'add-another' || pos.step.genKey !== 'grade') return '';
    const existing = answers.values[PROOF_SCORE_CONTEXT_KEY];
    return typeof existing === 'string' ? existing : '';
  });
  const [rephraseIndex, setRephraseIndex] = useState(0);
  /**
   * V1.8 VB-42, rewritten by V2.0 VB-57 — has the person touched this question
   * yet, and what did they do first.
   *
   * V1.8 tracked one gesture here, "they have started answering", because that
   * was Adam's rule for the follow-up rotation: the list renews "until the
   * person clicks Next or starts typing an answer". docs/V2.0-REFINEMENT.md
   * FLAG 1 widens it to **any** interaction and makes it permanent, which is
   * what allows the visible "Show all" to be deleted rather than replaced. So
   * this is no longer a boolean about typing; it is the terminal state from
   * `core/motion/rotation.ts`, and the widening happens by wiring three
   * capture handlers to the question area rather than by adding four more
   * booleans.
   *
   * Still set by the act, never derived from the draft: a question they
   * answered earlier arrives with its draft already full, and treating that as
   * "they are touching it right now" would silently kill the rotation on every
   * question anybody ever goes Back to.
   *
   * Reset by the per-position remount, like every other draft on this screen —
   * which is exactly the scope FLAG 1 asks for: "once stopped it stays stopped
   * **for that question**".
   */
  const [rotation, setRotation] = useState(ROTATION_RUNNING);
  function stopRotating(by: RotationInteraction) {
    setRotation((current) => stopRotation(current, by));
  }
  /**
   * The three handlers that make "any interaction" broad, spread onto the
   * question area's own element.
   *
   * Capture, so nothing can swallow the signal on its way up, and on the
   * surface's root rather than on the follow-ups, because FLAG 1's list is
   * mostly things that happen elsewhere: a click on blank space beside the
   * heading, a keypress in the answer field, focus arriving from a Tab.
   * Rephrase and the pills need no wiring of their own — pressing either is a
   * click, and reaching either from the keyboard is focus and then a key.
   *
   * They are read-only listeners: nothing here preventsDefault, stops
   * propagation, or moves focus, so no control on the screen behaves any
   * differently for having them above it.
   */
  const stopHere = {
    onClickCapture: () => stopRotating('click'),
    onKeyDownCapture: () => stopRotating('key'),
    onFocusCapture: () => stopRotating('focus'),
  };
  function answerText(next: string) {
    // Typing, named as itself — the reason FLAG 1 inherited from VB-42, and
    // the one that fires for dictation and paste as well as for a keystroke.
    stopRotating('typing');
    setDraftText(next);
  }
  function answerValues(next: string[]) {
    stopRotating('typing');
    setDraftValues(next);
  }
  // V1.1 VB-08: how many times "give me an example" has been pressed on this
  // question. A count, not an index — core/flow/ideas.ts owns the wrap, so
  // nothing here has to know how many ideas the question carries. Reset by the
  // per-position remount like every other draft above, so each question starts
  // its own list at the top.
  const [ideaPresses, setIdeaPresses] = useState(0);
  // The last example dropped into the field, for the live region beside the
  // button. Someone who cannot see the field fill in gets told what landed in
  // it — the same information, at the same moment, without focus moving.
  const [spokenIdea, setSpokenIdea] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  // Doubles as V1.4 VB-20's "what do you call this role?" buffer on a naming
  // add-another screen — same shape (one short typed name, added to a list of
  // options), same commit-on-Next, so it is the same field rather than a
  // second one that would have to be kept in step with it.
  const [customText, setCustomText] = useState('');
  // V1.4 VB-20: seeded with the pills this question's own data does not carry
  // — a value added by "+ add your own", or a role named at the end of the
  // roles loop, both of which are stored in the answer and nowhere else. Come
  // Back to the question and they are on the row, selected, and removable,
  // rather than selected but invisible. Derived at mount, never stored.
  const [customOptions, setCustomOptions] = useState<Option[]>(() =>
    pos.kind === 'add-another' ? [] : offListOptions(pos.step, initialSelection(pos, answers)),
  );
  const [pendingError, setPendingError] = useState<string | null>(null);
  // Reflect-only sub-screens — never persisted, never part of Position (see
  // core/flow/runner.ts's comment on why position is always derived, never
  // stored): 'view' plays the raw answer back, 'tighten' shows the AI prompt
  // and takes the pasted result, 'edit' is "Say it again"'s plain text field.
  const [reflectMode, setReflectMode] = useState<'view' | 'tighten' | 'edit'>('view');
  const [tightenedDraft, setTightenedDraft] = useState('');

  /**
   * V1.3 VB-18 — the narrator, driven from here rather than from `Flow`.
   *
   * This component is the thing that knows *what is on the screen*: not just
   * which position it is, but which of a question's rephrasings is showing and
   * which of the reflect screen's three sub-screens someone is looking at. The
   * voice has to follow both, and both live in this component's state.
   *
   * Being mounted per position (see this component's own header) is also what
   * makes stopping free: advancing, skipping, going Back and jumping from the
   * file tree are all a remount, and `useNarration`'s cleanup cancels the
   * utterance on the way out — before the next one starts, in the same commit.
   *
   * The reflect screen narrates only its playback. Opening "Tighten it with my
   * AI" or "Say it again" is a different screen with a different job, and a
   * voice still reading the answer back while someone starts retyping it is
   * the behaviour VB-18 exists to prevent. Coming back to the playback reads
   * it again, which is what returning to a screen means.
   */
  const { on: narratorOn } = useNarratorPref();
  const onReflectSubScreen = pos.kind === 'reflect' && reflectMode !== 'view';
  useNarration(
    onReflectSubScreen ? null : narrationFor(pos, answers, NARRATION_COPY, { rephraseIndex }),
    narratorOn,
  );

  /**
   * V1.1 VB-03's follow-ups, in the `followUp` voice role.
   *
   * The one content type on this screen the person opts into a second time:
   * the narrator being on is the first choice, pressing the tag is the second,
   * so this is never speech nobody asked for. Closing the tag stops it
   * mid-sentence, on the same reasoning as everything else here — the answer
   * has left the screen.
   *
   * With the narrator off this touches no speech API at all, not even to
   * cancel.
   */
  function narrateFollowUp(entry: DeepDiveEntry | null) {
    if (!narratorOn) return;
    const narration = entry ? narrationForFollowUp(entry.a) : null;
    if (narration) speak(narration);
    else stopSpeaking();
  }

  /**
   * V2.0 VB-62/VB-64: a question inside a repeatable resolves against THE
   * RECORD IT IS ABOUT, not just the top-level answers — that is how an entity
   * question phrases itself for a person rather than a tool, and how the
   * per-audience question says which reader it means. `core/voice/narration.ts`
   * builds the same context from the same position, so the spoken question and
   * the printed one stay the same sentence.
   *
   * The record is read live from `answers`, so answering the type question and
   * pressing Next re-renders the next field already knowing what was picked.
   */
  const activeRecord =
    (pos.kind === 'step' || pos.kind === 'reflect') && pos.location.in === 'repeatable'
      ? answers.repeatables[pos.location.blockId]?.[pos.location.recordIndex]
      : undefined;
  const ctx: FlowContext = activeRecord
    ? { answers: answers.values, repeatables: answers.repeatables, record: activeRecord }
    : { answers: answers.values, repeatables: answers.repeatables };
  /**
   * "Saved on this device / Nothing leaves your browser".
   *
   * V1.2 VB-11 moved it out of the footer, because the footer stopped being a
   * footer: it is now a navigation bar pegged to the drawer's top edge, and
   * this note is not navigation. It sits at the end of the question's own
   * scrolling content instead — the last thing before the bar, which is
   * exactly where it read before, so the reading order and the tab order are
   * both unchanged.
   *
   * Not left in the bar and not moved into the drawer. Not in the bar because
   * in a 400px panel every docked pixel is taken from the question, and a
   * two-line reassurance that never changes is the last thing that should hold
   * permanent chrome — keeping it there would have made the bar half as tall
   * again for the whole interview. Not in the drawer because the drawer is
   * about the file being written, while this is about the answer that was just
   * typed; it belongs with the answering, and it belongs to a surface this
   * task owns rather than one another task does.
   */
  const saveNote = (
    <p className="flow-save">
      <span>{S.savedNote}</span>
      <span>{S.privacyNote}</span>
    </p>
  );
  const errorBanner = saveError ? (
    <div role="alert" className="flow-error">
      {S.errSaveFailed}
    </div>
  ) : null;

  /** V1.4 VB-20: whether this add-another screen also has to name what it is
   * adding. A property of the block, decided in one place for the renderer and
   * the commit alike — see core/flow/addAnother.ts's `needsName`. */
  const namesItsRecords = pos.kind === 'add-another' && needsName(pos.block);

  /**
   * V1.4 VB-20: "yes" on a seeded block has to come with a name.
   *
   * The name is not decoration — it is what keeps the new record alive through
   * the next reconcile (core/flow/runner.ts's `applySeededAddAnother`), so
   * "yes" without one is not a partial answer to accept quietly, it is an
   * answer that cannot be stored. Both refusals name the way out.
   */
  function handleAddAnother() {
    if (pos.kind !== 'add-another') return;
    if (draftValues.length === 0) {
      setPendingError(S.errPickOne);
      return;
    }
    const wantsMore = draftValues[0] === 'yes';
    if (wantsMore && namesItsRecords) {
      const name = customText.trim();
      const seedStep = findSeedStep(modules, pos.block);
      if (!name) {
        setPendingError(S.errNeedItsName);
        return;
      }
      if (seedStep && seededNameTaken(answers, pos.block, seedStep, name)) {
        setPendingError(S.errNameTaken);
        return;
      }
      onAddAnotherDecision(pos.block.id, true, name);
      return;
    }
    onAddAnotherDecision(pos.block.id, wantsMore);
  }

  /** R1-11's grade step: the pasted grade text plus two required
   * self-reported "out of 10" scores, all committed together. Writes
   * exactly one `ScoreEntry` to `wb:report.scores` — the with-context
   * number only, never the baseline number, never a computed delta (that's
   * display-only, see core/report/scoring.ts) — and only the first time
   * this step is actually completed, so navigating Back and resubmitting
   * the same answers this session doesn't double the history. */
  async function commitGrade(step: Step, location: StepLocation) {
    const baselineNum = Number(draftScoreBaseline);
    const contextNum = Number(draftScoreContext);
    const validScore = (n: number) => Number.isFinite(n) && n >= 0 && n <= 10;

    if (draftText.trim() === '') {
      setPendingError(errorFor(step));
      return;
    }
    if (draftScoreBaseline.trim() === '' || draftScoreContext.trim() === '' || !validScore(baselineNum) || !validScore(contextNum)) {
      setPendingError(S.errNeedScore);
      return;
    }

    const alreadyScored = typeof answers.values[PROOF_SCORE_CONTEXT_KEY] === 'string';

    let next = applyAnswer(answers, step, location, draftText);
    next = applyAnswer(next, scoreSubStep(PROOF_SCORE_BASELINE_KEY), location, String(baselineNum));
    next = applyAnswer(next, scoreSubStep(PROOF_SCORE_CONTEXT_KEY), location, String(contextNum));
    onCommit(next);

    if (!alreadyScored) {
      const existingReport = await getLocal('wb:report');
      const entry = makeScoreEntry(contextNum, new Date().toISOString());
      await setLocal('wb:report', appendScore(existingReport, entry));
    }
  }

  function handleNext() {
    if (pos.kind === 'add-another') {
      handleAddAnother();
      return;
    }
    const { step, location } = pos;

    if (step.kind === 'intro' || step.kind === 'demo') {
      onCommit(applySkip(answers, step, location));
      return;
    }

    if (step.kind === 'gen' && step.genKey === 'grade') {
      void commitGrade(step, location);
      return;
    }

    const required = step.required !== false;
    let value: AnswerValue;
    let isEmpty: boolean;
    if (step.kind === 'text' || step.kind === 'gen') {
      value = draftText;
      isEmpty = draftText.trim() === '';
    } else {
      isEmpty = draftValues.length === 0;
      value = step.kind === 'multi' ? draftValues : (draftValues[0] ?? null);
    }

    if (required && isEmpty) {
      setPendingError(errorFor(step));
      return;
    }

    let next = applyAnswer(answers, step, location, isEmpty ? null : value);
    if (location.in === 'top' && Array.isArray(value)) {
      const seedTarget = findSeedTarget(modules, step.id);
      if (seedTarget) next = reconcileSeededRepeatable(next, seedTarget, step, value);
    }
    onCommit(next);
  }

  function handleSkip() {
    if (pos.kind !== 'step') return;
    onCommit(applySkip(answers, pos.step, pos.location));
  }

  function addCustom() {
    const text = customText.trim();
    if (!text || pos.kind !== 'step') return;
    setCustomOptions((opts) => [...opts, { v: text, l: text }]);
    setDraftValues((vals) => (pos.step.kind === 'chips' ? [text] : [...vals, text]));
    setCustomText('');
    setCustomOpen(false);
  }

  function handleCustomKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustom();
    }
  }

  /**
   * The top section, built once and reused by every branch below.
   *
   * V1.1 VB-02: what used to be a "Question 12 of 38 · About Me" string is now
   * the module's title over a bar. Same two numbers, same single derivation —
   * only the rendering changed.
   *
   * V1.3 VB-18 puts the narrator toggle above that bar, right-justified, which
   * is where the spec places it. Above rather than beside: the bar is a
   * `role="progressbar"` whose accessible name is the module title, and a
   * button inside it would be a control inside a value. It costs almost no
   * height — see NarratorToggle.css on how a 44×44 target lives in a 24px row,
   * which is what keeps VB-17's composition intact.
   */
  const topSection = (
    <>
      <NarratorToggle />
      <FlowProgress
        title={moduleFor(modules, pos)?.title ?? ''}
        current={topLevelIndex(modules, pos)}
        total={total}
      />
    </>
  );

  if (pos.kind === 'add-another') {
    const options: PillOption[] = [
      { value: 'yes', label: S.yes },
      { value: 'no', label: S.no },
    ];
    return (
      <form
        className="flow"
        data-position="add-another"
        onSubmit={(e) => {
          e.preventDefault();
          handleNext();
        }}
      >
        {errorBanner}
        {topSection}
        <TypedHeading className="flow-q" text={pos.block.addAnotherPrompt} />
        <AnswerArea>
          <PillGroup
            legend={pos.block.addAnotherPrompt}
            mode="single"
            options={options}
            value={draftValues}
            onChange={setDraftValues}
          />
          {/* V1.4 VB-20. The name of the thing being added, on the same screen
              as the decision to add it — revealed by "Yes", exactly the way
              "+ add your own" reveals its field on a select question, and gone
              again on "No" so the screen only ever asks what it needs.

              Its label is visible, not screen-reader-only as it is under a
              question (`.flow-field-sr-label`): the heading above asks whether
              there is another, and this field asks something else. A hidden
              label here would leave a box with no printed question at all.

              Nothing takes focus when it appears — the person is mid-keyboard
              and Tab reaches it next (docs/GUARDRAILS.md: nothing steals
              focus). */}
          {namesItsRecords && pos.block.addAnotherName && draftValues[0] === 'yes' && (
            <div className="flow-add-name">
              <Field
                id="flow-add-another-name"
                label={pos.block.addAnotherName.prompt}
                value={customText}
                onChange={setCustomText}
                placeholder={pos.block.addAnotherName.placeholder}
              />
            </div>
          )}
          {pendingError && (
            <div role="alert" className="flow-error">
              {pendingError}
            </div>
          )}
        </AnswerArea>
        
        <NavCluster cue={cue}>
          {canGoBack && (
            <NavButton type="button" variant="secondary" direction="back" control="back" onClick={onBack}>
              {S.back}
            </NavButton>
          )}
          <NavButton type="submit" variant="primary" direction="next" control="next">
            {S.next}
          </NavButton>
        </NavCluster>
        {saveNote}
      </form>
    );
  }

  if (pos.kind === 'reflect') {
    const { step, location } = pos;
    // Read fresh from `answers`, not `draftText` — `draftText` is the redo
    // field's own editable buffer, and diverges from the committed answer
    // the moment "Say it again" is opened and abandoned via Back without
    // resubmitting. The reflect/tighten screens must always play back what
    // is actually stored, byte-identical, regardless of that buffer's state.
    const existing = existingValue(answers, step, location);
    const raw = typeof existing === 'string' ? existing : '';
    const builtPrompt = step.interpret?.buildPrompt?.(raw, ctx) ?? raw;

    function backToView() {
      setReflectMode('view');
      setPendingError(null);
    }

    function commitKeep() {
      onCommit(applyReflect(answers, step, location, raw));
    }

    function commitTightened() {
      const text = tightenedDraft.trim();
      if (!text) {
        setPendingError(S.reflectNeedPaste);
        return;
      }
      onCommit(applyReflect(answers, step, location, tightenedDraft));
    }

    function submitRedo() {
      const isEmpty = draftText.trim() === '';
      const required = step.required !== false;
      if (required && isEmpty) {
        setPendingError(errorFor(step));
        return;
      }
      backToView();
      // applyAnswer, not applyReflect — a retyped answer is unreflected
      // again by design, so it comes back through this same screen.
      onCommit(applyAnswer(answers, step, location, isEmpty ? null : draftText));
    }

    if (reflectMode === 'tighten') {
      return (
        <div className="flow" data-position="reflect" data-step-id={step.id}>
          {errorBanner}
          {topSection}
          <TypedHeading className="flow-q" text={S.reflectTighten} />
          <ReadOnlyBlock tag={S.reflectPromptTag}>{builtPrompt}</ReadOnlyBlock>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitTightened();
            }}
          >
            <AnswerArea>
              <div className="flow-field-sr-label">
                <Field
                  id={`flow-${step.id}-tighten`}
                  label={S.reflectPasteLabel}
                  as="textarea"
                  value={tightenedDraft}
                  onChange={setTightenedDraft}
                  error={pendingError ?? undefined}
                />
              </div>
            </AnswerArea>
            
            <NavCluster cue={cue}>
              <NavButton type="button" variant="secondary" direction="back" control="back" onClick={backToView}>
                {S.back}
              </NavButton>
              <NavButton type="submit" variant="primary" direction="next" control="next">
                {S.reflectUseThis}
              </NavButton>
            </NavCluster>
        {saveNote}
          </form>
        </div>
      );
    }

    if (reflectMode === 'edit') {
      const questionText = resolvePhrase(step.q, ctx);
      return (
        <form
          className="flow"
          data-position="reflect"
          data-step-id={step.id}
          {...stopHere}
          onSubmit={(e) => {
            e.preventDefault();
            submitRedo();
          }}
        >
          {errorBanner}
          {topSection}
          <TypedHeading className="flow-q" text={questionText} />
          <QuestionHelp step={step} onDisclose={narrateFollowUp} stoppedBy={reasonFor(rotation)} />
          <AnswerArea>
            <div className="flow-field-sr-label">
              <Field
                id={`flow-${step.id}`}
                label={questionText}
                as={step.multiline ? 'textarea' : 'input'}
                value={draftText}
                onChange={setDraftText}
                placeholder={resolveOptionalPhrase(step.ph, ctx)}
                error={pendingError ?? undefined}
              />
            </div>
          </AnswerArea>
          
          <NavCluster cue={cue}>
            <NavButton type="button" variant="secondary" direction="back" control="back" onClick={backToView}>
              {S.back}
            </NavButton>
            <NavButton type="submit" variant="primary" direction="next" control="next">
              {S.next}
            </NavButton>
            <NavButton
              type="button"
              variant="quiet"
              control="skip"
              onClick={() => onCommit(applySkip(answers, step, location))}
            >
              {S.skip}
            </NavButton>
          </NavCluster>
        {saveNote}
        </form>
      );
    }

    return (
      <div className="flow" data-position="reflect" data-step-id={step.id}>
        {errorBanner}
        {topSection}
        <TypedHeading className="flow-q" text={S.reflectHeading} />
        <p className="flow-hint">{S.reflectSub}</p>
        <ReadOnlyBlock tag={step.interpret?.reflectPrefix ?? ''}>{raw}</ReadOnlyBlock>
        <AnswerArea>
          <div className="flow-reflect-actions">
            <Button type="button" variant="primary" onClick={commitKeep}>
              {S.reflectKeep}
            </Button>
            <Button type="button" variant="ai" onClick={() => setReflectMode('tighten')}>
              {S.reflectTighten}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setReflectMode('edit')}>
              {S.reflectRedo}
            </Button>
          </div>
        </AnswerArea>
        
        <NavCluster cue={cue}>
          {canGoBack && (
            <NavButton type="button" variant="secondary" direction="back" control="back" onClick={onBack}>
              {S.back}
            </NavButton>
          )}
        </NavCluster>
        {saveNote}
      </div>
    );
  }

  const { step } = pos;
  const rephrasings = step.rephrasings ?? [];
  const hasRephrasings = rephrasings.length > 0;
  const questionText = resolvePhrase(rephraseIndex === 0 ? step.q : (rephrasings[rephraseIndex - 1] ?? step.q), ctx);
  const displayOptions =
    rephraseIndex === 0 ? step.options : (step.optionRephrasings?.[rephraseIndex - 1] ?? step.options);
  const showSkip = step.kind !== 'intro' && step.kind !== 'demo';
  // Only an intro reveals itself as beats — every other kind has something
  // to answer, and hiding the question behind a timer would make it harder.
  const beats = step.kind === 'intro' && step.beats?.length ? step.beats : null;

  /**
   * The wording changes and the glyph plays its cue. The button element comes
   * from the event rather than a ref: it is the element the cue belongs to,
   * it is already in hand, and the class is applied straight to the DOM
   * because a React state round-trip cannot express "this again, from the
   * start" — the same value re-rendered is, to React, no change at all.
   * Safe here because nothing else ever rewrites this button's className:
   * `variant`, `className` and the rest are constants at this call site.
   */
  function cycleRephrase(button: HTMLButtonElement) {
    // FLAG 1 names rephrase on its own, so it is wired on its own: a new
    // wording is a new sentence to read, and nothing beside it should be
    // changing while they read it.
    stopRotating('rephrase');
    setRephraseIndex((i) => (i + 1) % (rephrasings.length + 1));
    restartRephraseCue(button);
  }

  // V1.1 VB-08. The written starter answers this question carries, if any —
  // 22 of them do, and nothing rendered a single one before now. Which
  // questions qualify is core/flow/ideas.ts's decision, not a condition
  // spelled out here (see `ideasFor` on why `gen` fields are excluded).
  const ideas = ideasFor(step);

  /**
   * Drops the next example into the field the person is already typing in.
   *
   * It lands in `draftText` — the same buffer typing writes to, committed by
   * the same `handleNext` — so it is an ordinary editable value from the
   * instant it appears: no placeholder, nothing read-only, and once Next is
   * pressed there is nothing about it that says it was not typed. That is the
   * point. The example is something to react to and edit, not an answer.
   *
   * It replaces the draft rather than appending, which is what "give me
   * another one" has to mean for a control that cycles — appending would build
   * a wall of unrelated examples on the second press.
   *
   * As with rephrase above, the button element comes from the event and the
   * cue class goes straight to the DOM: a React state round-trip cannot
   * express "this again, from the start".
   */
  function dropIdea(button: HTMLButtonElement) {
    const idea = ideaAt(ideas, ideaPresses);
    if (idea === null) return;
    setDraftText(idea);
    setSpokenIdea(idea);
    setIdeaPresses((n) => n + 1);
    restartIdeaCue(button);
  }

  const pillOptions: PillOption[] =
    step.kind === 'yesno'
      ? [
          { value: 'yes', label: S.yes },
          { value: 'no', label: S.no },
        ]
      : [...(displayOptions ?? []), ...customOptions].map((o) => ({
          value: o.v,
          label: o.l,
          suggested: o.rec,
        }));

  return (
    <form
      className="flow"
      data-position="step"
      data-step-id={step.id}
      {...stopHere}
      onSubmit={(e) => {
        e.preventDefault();
        handleNext();
      }}
    >
      {errorBanner}
      {topSection}
      {/* V1.1 VB-05: an intro that authored `beats` is read one beat at a
          time instead of printed as one paragraph — the behaviour
          `Step.beats` has always specified and nothing rendered until now
          (see components/Beats.tsx). It replaces the heading rather than
          sitting under it: the beats ARE the screen's text, and a heading
          made of three consecutive sentences is not a heading. Everything
          else — the plain question, the rephrase control — is unchanged for
          every other step, including an intro with no beats. */}
      {beats ? (
        <Beats beats={beats} />
      ) : (
        /* VB-04: the rephrase control sits beside the question, as a sibling of
           the heading rather than inside it — putting a button inside <h2>
           would fold its label into the heading's accessible name and change
           what a screen reader announces when it lands on the question. */
        <div className="flow-q-row">
          {/* V1.2 VB-10: the question types itself in on arrival, and on every
              rephrasing — a new wording is a new sentence arriving, which is
              the same moment. Skippable and non-blocking; see Typed.tsx. */}
          <TypedHeading className="flow-q" text={questionText} />
          {hasRephrasings && (
            <Button
              type="button"
              variant="quiet"
              className="flow-rephrase"
              aria-label={S.rephrase}
              title={S.rephrase}
              onClick={(e) => cycleRephrase(e.currentTarget)}
            >
              {REPHRASE_ICON}
            </Button>
          )}
        </div>
      )}
      <QuestionHelp step={step} onDisclose={narrateFollowUp} stoppedBy={reasonFor(rotation)} />

      {/* V1.3 VB-17: every kind's controls in one band, so the room the
          question surface now fills has somewhere deliberate to put its
          slack. See AnswerArea above. */}
      <AnswerArea>
        {step.kind === 'text' && (
          <>
            <div className="flow-field-sr-label">
              <Field
                id={`flow-${step.id}`}
                label={questionText}
                as={step.multiline ? 'textarea' : 'input'}
                value={draftText}
                onChange={answerText}
                placeholder={resolveOptionalPhrase(step.ph, ctx)}
                error={pendingError ?? undefined}
              />
            </div>
            {/* V1.8 VB-49. Under the box, because it is about the box: the
                dictation the person's own computer already has types into
                this field, and nobody knows it. One question, one line, gone
                for good on the dismiss or on the first thing they type.
                There is no microphone here and there is no permission — see
                components/DictationHint.tsx for the four reasons why. */}
            <DictationHint stepId={step.id} typed={draftText.trim() !== ''} />
            {/* V1.1 VB-08. Under the field, not beside the question: this
                control writes into the box, so it belongs with the box, and
                the sibling app puts it in the same place. Rendered only where
                the question actually carries examples — 22 of 49 steps do.

                Secondary, not primary: a solid fill in this system means "the
                one thing this screen wants" (docs/design-system.html §04, one
                per screen) and Next holds that slot on every question. A filled
                bulb would argue with it. Bordered keeps the control obvious
                without claiming to be the point of the screen. */}
            {ideas.length > 0 && (
              <div className="flow-idea-row">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="flow-idea"
                  onClick={(e) => dropIdea(e.currentTarget)}
                >
                  {IDEA_ICON}
                  {S.giveExample}
                </Button>
                {/* What just landed in the field, for anyone who cannot see it
                    do so. Polite and out of the way: nothing takes focus, so a
                    keyboard user can keep pressing to hear the next one. */}
                <span className="flow-idea-live" role="status">
                  {spokenIdea}
                </span>
              </div>
            )}
          </>
        )}

        {step.kind === 'gen' && (
          <>
            {step.genKey === 'withContext' && (
              <p className="flow-hint">
                {attachHintFor(typeof ctx.answers[PROOF_SERVICE_KEY] === 'string' ? (ctx.answers[PROOF_SERVICE_KEY] as string) : undefined)}
              </p>
            )}
            <ReadOnlyBlock tag={S.proofAskThis}>{promptFor(step.genKey, ctx)}</ReadOnlyBlock>
            <div className="flow-field-sr-label">
              <Field
                id={`flow-${step.id}-paste`}
                label={pasteLabelFor(step)}
                as="textarea"
                value={draftText}
                onChange={setDraftText}
              />
            </div>
            {step.genKey === 'grade' && (
              <div className="flow-scores">
                <Field
                  id="flow-proof-score-baseline"
                  label={S.proofScoreBaselineLabel}
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  inputMode="decimal"
                  value={draftScoreBaseline}
                  onChange={setDraftScoreBaseline}
                />
                <Field
                  id="flow-proof-score-context"
                  label={S.proofScoreContextLabel}
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  inputMode="decimal"
                  value={draftScoreContext}
                  onChange={setDraftScoreContext}
                />
              </div>
            )}
            {pendingError && (
              <div role="alert" className="flow-error">
                {pendingError}
              </div>
            )}
          </>
        )}

        {step.kind === 'demo' && <DemoBody answers={answers} />}

        {step.kind !== 'text' && step.kind !== 'intro' && step.kind !== 'gen' && step.kind !== 'demo' && (
          <>
            {/* V2.0 VB-60. The roles question's choices are the brain's own
                orbs rather than pills — which questions, and why only those, is
                core/choice/orbs.ts's `usesOrbChoice` and not a condition
                spelled out here.

                EVERYTHING AROUND IT IS UNCHANGED, deliberately. Same `legend`
                (the question, which names the group), same draft, same
                `answerValues` — so the same "typing" stop and the same commit
                on Next — and the same `onAddOwn`, which opens the same field
                below. VB-60 replaces the paint on a trigger, never the
                mechanism behind it.

                `stoppedBy` is the one thing the orbs need that the pills do
                not: FLAG 1's rule is that ANY interaction in the question area
                ends the motion, and most of that list happens outside this
                group. It is the identical prop `QuestionHelp` hands the
                follow-up link, off the identical piece of state, so one
                keystroke in the answer field stops both at once. */}
            {usesOrbChoice(step) ? (
              <OrbGroup
                legend={questionText}
                mode="multi"
                options={pillOptions}
                value={draftValues}
                onChange={answerValues}
                onAddOwn={step.allowCustom ? () => setCustomOpen(true) : undefined}
                stoppedBy={reasonFor(rotation)}
              />
            ) : (
              <PillGroup
                legend={questionText}
                mode={step.kind === 'multi' ? 'multi' : 'single'}
                options={pillOptions}
                value={draftValues}
                onChange={answerValues}
                onAddOwn={step.allowCustom ? () => setCustomOpen(true) : undefined}
              />
            )}
            {customOpen && (
              <div className="flow-custom">
                <div className="flow-field-sr-label">
                  <Field
                    id="flow-custom-value"
                    label={S.addYourOwnPrompt}
                    value={customText}
                    onChange={setCustomText}
                    placeholder={step.customPlaceholder}
                    onKeyDown={handleCustomKeyDown}
                  />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={addCustom}>
                  {S.addYourOwnConfirm}
                </Button>
              </div>
            )}
            {pendingError && (
              <div role="alert" className="flow-error">
                {pendingError}
              </div>
            )}
          </>
        )}
      </AnswerArea>

      
      <NavCluster cue={cue}>
        {canGoBack && (
          <NavButton type="button" variant="secondary" direction="back" control="back" onClick={onBack}>
            {S.back}
          </NavButton>
        )}
        <NavButton type="submit" variant="primary" direction="next" control="next">
          {S.next}
        </NavButton>
        {showSkip && (
          <NavButton type="button" variant="quiet" control="skip" onClick={handleSkip}>
            {S.skip}
          </NavButton>
        )}
      </NavCluster>
        {saveNote}
    </form>
  );
}
