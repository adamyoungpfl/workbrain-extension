import { useEffect, useLayoutEffect, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Button, DeepDive, Field, PillGroup, ReadOnlyBlock } from '../components';
import type { PillOption } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import {
  findPosition,
  applyAnswer,
  applySkip,
  applyReflect,
  applyAddAnother,
  reconcileSeededRepeatable,
  findSeedTarget,
  questionCount,
  existingValue,
  topLevelIndex,
  moduleFor,
} from '../../core/flow/runner';
import type { Position, StepLocation } from '../../core/flow/runner';
import {
  promptFor,
  attachHintFor,
  PROOF_SCORE_BASELINE_KEY,
  PROOF_SCORE_CONTEXT_KEY,
  PROOF_GRADE_TEXT_KEY,
  PROOF_SERVICE_KEY,
} from '../../core/flow/proofAdapter';
import { hintStaysVisible } from '../../core/flow/deepDive';
import { makeScoreEntry, appendScore, scoreDelta } from '../../core/report/scoring';
import type { AnswerValue, FlowContext, Module, Option, Step } from '../../schema/flow.types';
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
 */
const REPHRASE_ICON = (
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
    <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
    <path d="M20.9 3.6v4.6h-4.6" />
    <path d="M9.6 9.7a2.5 2.5 0 1 1 2.7 2.8v1.4" />
    <circle cx="12.3" cy="16.9" r="1.05" fill="currentColor" stroke="none" />
  </svg>
);

function positionKey(position: Position): string {
  if (position.kind === 'done') return 'done';
  if (position.kind === 'add-another') return `add-another:${position.block.id}:${position.recordIndex}`;
  const { step, location } = position;
  return location.in === 'top' ? `top:${step.id}` : `rep:${location.blockId}:${location.recordIndex}:${step.id}`;
}

function resolvePhrase(phrase: Step['q'], ctx: FlowContext): string {
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

/** The question block's hint and deep-dive, rendered identically wherever a
 * question is asked — including the reflect screen's "Say it again" re-ask,
 * which is the same question and deserves the same help. */
function QuestionHelp({ step }: { step: Step }) {
  return (
    <>
      {showsHint(step) && <p className="flow-hint">{step.hint}</p>}
      {step.deepDive && step.deepDive.length > 0 && (
        <DeepDive idPrefix={`flow-${step.id}`} entries={step.deepDive} />
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
export function Flow({ modules, renderDone, onDone, initialPosition }: FlowProps) {
  const [answers, setAnswersState] = useState<Answers | null>(null);
  const [declinedBlocks, setDeclinedBlocks] = useState<ReadonlySet<string>>(new Set());
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

  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:answers').then((stored) => {
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
  const position = viewing ?? findPosition(modules, ans, declinedBlocks);

  async function persist(next: Answers): Promise<boolean> {
    setAnswersState(next);
    setSavePending(true);
    const result = await setLocal('wb:answers', next);
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

  function handleAddAnotherDecision(from: Position, blockId: string, wantsMore: boolean) {
    if (wantsMore) {
      setDeclinedBlocks((s) => {
        const next = new Set(s);
        next.delete(blockId);
        return next;
      });
      void persist(applyAddAnother(ans, blockId, true));
    } else {
      setDeclinedBlocks((s) => new Set(s).add(blockId));
    }
    setHistory((h) => [...h, from]);
    setViewing(null);
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

  return (
    <StepView
      key={positionKey(position)}
      modules={modules}
      pos={position}
      answers={answers}
      total={total}
      canGoBack={history.length > 0}
      saveError={saveError}
      onBack={goBack}
      onCommit={(next) => handleCommit(position, next)}
      onAddAnotherDecision={(blockId, wantsMore) => handleAddAnotherDecision(position, blockId, wantsMore)}
    />
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

interface StepViewProps {
  modules: Module[];
  pos: Exclude<Position, { kind: 'done' }>;
  answers: Answers;
  total: number;
  canGoBack: boolean;
  saveError: boolean;
  onBack: () => void;
  onCommit: (next: Answers) => void;
  onAddAnotherDecision: (blockId: string, wantsMore: boolean) => void;
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
  pos,
  answers,
  total,
  canGoBack,
  saveError,
  onBack,
  onCommit,
  onAddAnotherDecision,
}: StepViewProps) {
  const [draftValues, setDraftValues] = useState<string[]>(() => {
    if (pos.kind === 'add-another' || pos.step.kind === 'text' || pos.step.kind === 'gen' || pos.step.kind === 'demo')
      return [];
    const existing = existingValue(answers, pos.step, pos.location);
    return Array.isArray(existing) ? existing : typeof existing === 'string' ? [existing] : [];
  });
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
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [customOptions, setCustomOptions] = useState<Option[]>([]);
  const [pendingError, setPendingError] = useState<string | null>(null);
  // Reflect-only sub-screens — never persisted, never part of Position (see
  // core/flow/runner.ts's comment on why position is always derived, never
  // stored): 'view' plays the raw answer back, 'tighten' shows the AI prompt
  // and takes the pasted result, 'edit' is "Say it again"'s plain text field.
  const [reflectMode, setReflectMode] = useState<'view' | 'tighten' | 'edit'>('view');
  const [tightenedDraft, setTightenedDraft] = useState('');

  const ctx: FlowContext = { answers: answers.values, repeatables: answers.repeatables };
  const saveNote = (
    <span className="flow-save">
      <span>{S.savedNote}</span>
      <span>{S.privacyNote}</span>
    </span>
  );
  const errorBanner = saveError ? (
    <div role="alert" className="flow-error">
      {S.errSaveFailed}
    </div>
  ) : null;

  function handleAddAnother() {
    if (pos.kind !== 'add-another') return;
    if (draftValues.length === 0) {
      setPendingError(S.errPickOne);
      return;
    }
    onAddAnotherDecision(pos.block.id, draftValues[0] === 'yes');
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

  const eyebrow = S.questionOf(topLevelIndex(modules, pos), total, moduleFor(modules, pos)?.title ?? '');

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
        <p className="flow-eyebrow">{eyebrow}</p>
        <h2 className="flow-q">{pos.block.addAnotherPrompt}</h2>
        <PillGroup
          legend={pos.block.addAnotherPrompt}
          mode="single"
          options={options}
          value={draftValues}
          onChange={setDraftValues}
        />
        {pendingError && (
          <div role="alert" className="flow-error">
            {pendingError}
          </div>
        )}
        <footer className="flow-foot">
          {canGoBack && (
            <Button type="button" variant="secondary" onClick={onBack}>
              {S.back}
            </Button>
          )}
          <Button type="submit" variant="primary">
            {S.next}
          </Button>
          {saveNote}
        </footer>
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
          <p className="flow-eyebrow">{eyebrow}</p>
          <h2 className="flow-q">{S.reflectTighten}</h2>
          <ReadOnlyBlock tag={S.reflectPromptTag}>{builtPrompt}</ReadOnlyBlock>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitTightened();
            }}
          >
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
            <footer className="flow-foot">
              <Button type="button" variant="secondary" onClick={backToView}>
                {S.back}
              </Button>
              <Button type="submit" variant="primary">
                {S.reflectUseThis}
              </Button>
              {saveNote}
            </footer>
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
          onSubmit={(e) => {
            e.preventDefault();
            submitRedo();
          }}
        >
          {errorBanner}
          <p className="flow-eyebrow">{eyebrow}</p>
          <h2 className="flow-q">{questionText}</h2>
          <QuestionHelp step={step} />
          <div className="flow-field-sr-label">
            <Field
              id={`flow-${step.id}`}
              label={questionText}
              as={step.multiline ? 'textarea' : 'input'}
              value={draftText}
              onChange={setDraftText}
              placeholder={step.ph}
              error={pendingError ?? undefined}
            />
          </div>
          <footer className="flow-foot">
            <Button type="button" variant="secondary" onClick={backToView}>
              {S.back}
            </Button>
            <Button type="submit" variant="primary">
              {S.next}
            </Button>
            <Button type="button" variant="quiet" onClick={() => onCommit(applySkip(answers, step, location))}>
              {S.skip}
            </Button>
            {saveNote}
          </footer>
        </form>
      );
    }

    return (
      <div className="flow" data-position="reflect" data-step-id={step.id}>
        {errorBanner}
        <p className="flow-eyebrow">{eyebrow}</p>
        <h2 className="flow-q">{S.reflectHeading}</h2>
        <p className="flow-hint">{S.reflectSub}</p>
        <ReadOnlyBlock tag={step.interpret?.reflectPrefix ?? ''}>{raw}</ReadOnlyBlock>
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
        <footer className="flow-foot">
          {canGoBack && (
            <Button type="button" variant="secondary" onClick={onBack}>
              {S.back}
            </Button>
          )}
          {saveNote}
        </footer>
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

  function cycleRephrase() {
    setRephraseIndex((i) => (i + 1) % (rephrasings.length + 1));
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
      onSubmit={(e) => {
        e.preventDefault();
        handleNext();
      }}
    >
      {errorBanner}
      <p className="flow-eyebrow">{eyebrow}</p>
      {/* VB-04: the rephrase control sits beside the question, as a sibling of
          the heading rather than inside it — putting a button inside <h2>
          would fold its label into the heading's accessible name and change
          what a screen reader announces when it lands on the question. */}
      <div className="flow-q-row">
        <h2 className="flow-q">{questionText}</h2>
        {hasRephrasings && (
          <Button
            type="button"
            variant="quiet"
            className="flow-rephrase"
            aria-label={S.rephrase}
            title={S.rephrase}
            onClick={cycleRephrase}
          >
            {REPHRASE_ICON}
          </Button>
        )}
      </div>
      <QuestionHelp step={step} />

      {step.kind === 'text' && (
        <div className="flow-field-sr-label">
          <Field
            id={`flow-${step.id}`}
            label={questionText}
            as={step.multiline ? 'textarea' : 'input'}
            value={draftText}
            onChange={setDraftText}
            placeholder={step.ph}
            error={pendingError ?? undefined}
          />
        </div>
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
          <PillGroup
            legend={questionText}
            mode={step.kind === 'multi' ? 'multi' : 'single'}
            options={pillOptions}
            value={draftValues}
            onChange={setDraftValues}
            onAddOwn={step.allowCustom ? () => setCustomOpen(true) : undefined}
          />
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

      <footer className="flow-foot">
        {canGoBack && (
          <Button type="button" variant="secondary" onClick={onBack}>
            {S.back}
          </Button>
        )}
        <Button type="submit" variant="primary">
          {S.next}
        </Button>
        {showSkip && (
          <Button type="button" variant="quiet" onClick={handleSkip}>
            {S.skip}
          </Button>
        )}
        {saveNote}
      </footer>
    </form>
  );
}
