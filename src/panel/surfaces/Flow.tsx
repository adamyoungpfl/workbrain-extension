import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button, Field, PillGroup, ReadOnlyBlock } from '../components';
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
import type { Position } from '../../core/flow/runner';
import type { AnswerValue, FlowContext, Module, Option, Step } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import { FlowDone } from './FlowDone';
import './Flow.css';

export interface FlowProps {
  modules: Module[];
}

const EMPTY_ANSWERS: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

function positionKey(position: Position): string {
  if (position.kind === 'done') return 'done';
  if (position.kind === 'add-another') return `add-another:${position.block.id}:${position.recordIndex}`;
  const { step, location } = position;
  return location.in === 'top' ? `top:${step.id}` : `rep:${location.blockId}:${location.recordIndex}:${step.id}`;
}

function resolvePhrase(phrase: Step['q'], ctx: FlowContext): string {
  return typeof phrase === 'function' ? phrase(ctx) : phrase;
}

function errorFor(step: Step): string {
  if (step.id === 'preferred_name') return S.errNeedName;
  if (step.kind === 'text') return S.errNeedAnswer;
  return S.errPickOne;
}

/**
 * One generic step runner for all five flows (only `context` has content —
 * see docs/RELEASE-1.md R1-05/R1-06). Position is derived from wb:answers on
 * every render, never stored — see core/flow/runner.ts. `Flow` owns only
 * session-level state (loaded answers, Back history, declined repeatables);
 * everything specific to the question on screen lives in `StepView`, mounted
 * fresh per position via `key` — see its own comment for why.
 */
export function Flow({ modules }: FlowProps) {
  const [answers, setAnswersState] = useState<Answers | null>(null);
  const [declinedBlocks, setDeclinedBlocks] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<Position[]>([]);
  const [viewing, setViewing] = useState<Position | null>(null);
  const [saveError, setSaveError] = useState(false);

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
    const result = await setLocal('wb:answers', next);
    setSaveError(!result.ok);
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
    return (
      <div className="flow flow-done">
        {saveError && (
          <div role="alert" className="flow-error">
            {S.errSaveFailed}
          </div>
        )}
        <p className="flow-q">{S.flowDone}</p>
        <FlowDone answers={ans} onImport={persist} />
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
    if (pos.kind === 'add-another' || pos.step.kind === 'text') return [];
    const existing = existingValue(answers, pos.step, pos.location);
    return Array.isArray(existing) ? existing : typeof existing === 'string' ? [existing] : [];
  });
  // Doubles as the reflect screen's "Say it again" draft — pre-filled with
  // the already-typed raw text so redoing edits it instead of starting over.
  const [draftText, setDraftText] = useState(() => {
    if (pos.kind === 'add-another' || pos.step.kind !== 'text') return '';
    const existing = existingValue(answers, pos.step, pos.location);
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

  function handleNext() {
    if (pos.kind === 'add-another') {
      handleAddAnother();
      return;
    }
    const { step, location } = pos;

    if (step.kind === 'intro') {
      onCommit(applySkip(answers, step, location));
      return;
    }

    const required = step.required !== false;
    let value: AnswerValue;
    let isEmpty: boolean;
    if (step.kind === 'text') {
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
          {step.hint && <p className="flow-hint">{step.hint}</p>}
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
  const showSkip = step.kind !== 'intro';

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
      <h2 className="flow-q">{questionText}</h2>
      {step.hint && <p className="flow-hint">{step.hint}</p>}

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

      {step.kind !== 'text' && step.kind !== 'intro' && (
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

      {hasRephrasings && (
        <Button type="button" variant="quiet" size="sm" className="flow-rephrase" onClick={cycleRephrase}>
          {S.rephrase}
        </Button>
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
