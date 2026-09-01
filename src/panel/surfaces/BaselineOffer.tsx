import { useState } from 'react';
import { Button, Field, FlowProgress } from '../components';
import { S } from '../strings';
import './BaselineOffer.css';

/* THE BAR CARRIES THE PREVIOUS SCREEN'S NUMBERS, deliberately.

   This screen is not a question in the interview — it sits between the goal
   gate and question one — so it has no index of its own. Given a total of 1 it
   drew one solid filled line where the screen before it draws four segments
   with two lit, and a header that changes shape between two screens of one
   path is the opposite of what "keep the header consistent" asks for.

   So it reports where the person actually is: still at the goal question, on
   an errand. Nothing has advanced, and the bar says nothing has. */

/**
 * D1 (docs/MEASUREMENT-SPINE.md) — the one moment a true baseline can be taken.
 *
 * After the goal gate has captured what somebody wants their AI to do better,
 * and before the file exists to help with it. Reached only through the
 * splash's own door: it is an offer, not a step, and the interview is
 * identical for anybody who never sees it.
 *
 * ── WHY IT CANNOT BE ANYWHERE ELSE ───────────────────────────────────────
 *
 * A baseline is the record of where somebody started. Collected later — during
 * the proof, as the product does today — it is a no-file answer produced by
 * somebody who has already done the interview, which is a fair control for the
 * file's content and not a record of where they began. There is exactly one
 * window, and this screen is it.
 *
 * ── AND WHY "NOT NOW" IS A REAL ANSWER ───────────────────────────────────
 *
 * This asks for actual work at the highest-friction moment in the product.
 * The offer states what the work buys in the same breath as making it, and
 * passing costs nothing — the proof's own baseline still runs later. Anything
 * that made this feel required would be trading the interview for the
 * measurement of it.
 */
export interface BaselineOfferProps {
  /** The person's own goal, verbatim — the task all three stages answer. */
  task: string;
  /** The goal question's own position, so the header does not change shape
   *  between the two screens of this path. See the note above. */
  current: number;
  total: number;
  /**
   * Save the run. Called the moment the answer LANDS, before either door is
   * picked — a baseline somebody took is theirs whichever way they leave this
   * screen, and routing the write through one of the doors would lose it for
   * anybody who chose the other.
   */
  onRecord: (answer: string) => void;
  /** The fork's primary door: on into the interview. */
  onContinue: () => void;
  /** Passed on without running it. The interview carries on as it would have. */
  onSkip: () => void;
  /**
   * Home. Used by three things now: the header's mark, the fork's second door,
   * and "Not now" — which is a real bail-out rather than a skip deeper into
   * the interview (Adam, 2026-09-01). Somebody who does not want to run this
   * does not want the next fifty questions either, and Home is where starting
   * lives.
   */
  onHome?: (() => void) | undefined;
}

export function BaselineOffer({ task, current, total, onRecord, onContinue, onSkip, onHome }: BaselineOfferProps) {
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  /* THE FORK (Adam, 2026-09-01). Pressing the primary button used to record
     the run and walk straight into question one. That spent the single best
     moment in the product without using it: the person is holding their AI's
     no-file answer, having just read it, and that is the only point where
     "build the file" can be put to them as "improve THIS" rather than as
     fifty questions.

     So the answer lands, it is saved, and the screen asks. Two doors, both
     real — one into the interview, one home. Adam: "so the user is empowered
     on taking action to improve their prompt."

     Local state, not a position in the runner: this is one screen changing
     what it shows after an action on it, the same way the copy button does.
     Nothing about it is worth resuming to. */
  const [landed, setLanded] = useState<string | null>(null);
  const ready = pasted.trim().length > 0;

  if (landed !== null) {
    return (
      <div className="flow baselineoffer" data-position="baseline-landed">
        <FlowProgress
          title={S.baselineEyebrow}
          current={current}
          total={total}
          {...(onHome ? { onHome } : {})}
        />
        {/* Polite, not assertive: the answer arriving is not an alert, and
            nothing here takes focus (docs/GUARDRAILS.md). */}
        <p className="baselineoffer-saved" role="status">
          {S.baselineSaved}
        </p>
        <h2 className="baselineoffer-title">{S.baselineNextTitle}</h2>
        <p className="baselineoffer-body">{S.baselineNextBody}</p>

        {/* Their AI's answer, given back to them — the thing the primary door
            is offering to improve. Read-only and quiet: it is evidence on this
            screen, not something to edit. */}
        <blockquote className="baselineoffer-answer">{landed}</blockquote>

        <div className="baselineoffer-doors">
          <Button type="button" variant="primary" onClick={onContinue}>
            {S.baselineImprove}
          </Button>
          {onHome && (
            <button type="button" className="baselineoffer-later" onClick={onHome}>
              {S.baselineHome}
            </button>
          )}
        </div>

        <p className="flow-save">
          <span>{S.savedNote}</span>
          <span>{S.privacyNote}</span>
        </p>
      </div>
    );
  }

  return (
    /* LAID OUT LIKE THE QUESTION BEFORE IT (Adam, 2026-09-01): same eyebrow,
       a body set in the question's own type, the box under it, the action
       under that. Arriving here should feel like the next step of one path
       rather than a different kind of screen — which it did not, when this had
       its own title, its own restated prompt and its own copy button stacked
       above a small field. */
    <div className="flow baselineoffer" data-position="baseline-offer">
      <FlowProgress
        title={S.baselineEyebrow}
        current={current}
        total={total}
        {...(onHome ? { onHome } : {})}
      />

      {/* THE BODY IS THE QUESTION. There is no title above it any more: on
          this screen the instruction is the only content, and a heading
          summarising a two-line instruction was a label on a label. */}
      <h2 className="flow-q baselineoffer-body">{S.baselineBody}</h2>

      {/* D1 — the memory warning. Set apart from the instruction above it
          because it is a different KIND of thing: that says what to do, this
          says what would make doing it worthless. It sits above the recopy
          line so it is read before anybody leaves for their AI, which is the
          only moment it can still change what they do. */}
      <p className="baselineoffer-fresh">{S.baselineFresh}</p>

      {/* THE PROMPT IS NOT RESTATED. It was on the previous screen in the
          person's own words, it is on their clipboard, and printing it again
          here made the screen about the prompt when it is about what to do
          with it. Adam: "don't restate the prompt they created."

          What survives is the way back to it, as a line rather than a control
          — for anybody whose clipboard has moved on. */}
      <button
        type="button"
        className="baselineoffer-recopy"
        onClick={() => {
          navigator.clipboard?.writeText(task).then(
            () => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            },
            () => {},
          );
        }}
      >
        {copied ? S.baselineRecopied : S.baselineRecopy}
      </button>

      <div className="flow-answer">
        <div className="flow-field-sr-label">
          <Field
            id="baseline-paste"
            label={S.baselineBody}
            value={pasted}
            onChange={setPasted}
            as="textarea"
          />
        </div>
      </div>

      {/* One centred action with the bail-out under it, which is the shape
          this screen's decision actually has: one thing to do, and a way out
          that is not a competing choice. */}
      <div className="baselineoffer-doors">
        <Button
          type="button"
          variant="primary"
          disabled={!ready}
          onClick={() => {
            const answer = pasted.trim();
            onRecord(answer);
            setLanded(answer);
          }}
        >
          {S.baselineGo}
        </Button>
        <button type="button" className="baselineoffer-later" onClick={onSkip}>
          {S.baselineLater}
        </button>
      </div>

      <p className="flow-save">
        <span>{S.savedNote}</span>
        <span>{S.privacyNote}</span>
      </p>
    </div>
  );
}
