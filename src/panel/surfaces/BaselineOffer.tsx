import { useState } from 'react';
import { Button, Field } from '../components';
import { S } from '../strings';
import './BaselineOffer.css';

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
  /** Their pasted answer, for the run that gets recorded. */
  onDone: (answer: string) => void;
  /** Passed on. The interview carries on exactly as it would have. */
  onSkip: () => void;
}

export function BaselineOffer({ task, onDone, onSkip }: BaselineOfferProps) {
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  const ready = pasted.trim().length > 0;

  return (
    // `.flow` as well as its own class, the way RunCard and ModuleIntro root
    // themselves: this is a screen ON the flow surface and takes the surface's
    // frame, its reserve above the drawer and its save note.
    <div className="flow baselineoffer" data-position="baseline-offer">
      <h2 className="baselineoffer-title">{S.baselineTitle}</h2>
      <p className="baselineoffer-body">{S.baselineBody}</p>

      {/* THE TASK READS AS A QUESTION, because that is what it is.

          The first build put it in `ReadOnlyBlock` — the violet trust chrome
          with a copy button that every AI-facing prompt in this product wears.
          Wrong here twice over: this is the person's OWN sentence rather than
          something we assembled for a machine, so the chrome is claiming a
          provenance it does not have; and the copy button offers a second way
          to do the thing the box below already asks for, on a screen whose
          whole job is one small action. Adam, 2026-08-31: remove the purple
          background and that copy button, inherit the interview's design.

          So it is `.flow-q`, the interview's own question type — the screen a
          person has just come from, and the one they are about to spend fifty
          questions in. */}
      <p className="flow-q baselineoffer-task">{task}</p>

      {/* THE COPY BUTTON, on its own rather than inside `ReadOnlyBlock`'s
          chrome. The chrome went because it claimed a provenance this sentence
          does not have — these are the person's own words, not a prompt we
          assembled — but the COPYING was never the problem: the screen asks
          somebody to take this to their AI, and making them select a paragraph
          by hand is asking them to do the one thing a button does better. */}
      <button
        type="button"
        className="baselineoffer-copy"
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
        {copied ? S.baselineCopied : S.baselineCopy}
      </button>

      <Field
        id="baseline-paste"
        label={S.baselineGo}
        value={pasted}
        onChange={setPasted}
        as='textarea'
        rows={5}
      />

      <div className="baselineoffer-doors">
        <Button type="button" variant="primary" disabled={!ready} onClick={() => onDone(pasted)}>
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
