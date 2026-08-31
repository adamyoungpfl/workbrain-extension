import { useState } from 'react';
import { Button, Field, ReadOnlyBlock } from '../components';
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
  const ready = pasted.trim().length > 0;

  return (
    // `.flow` as well as its own class, the way RunCard and ModuleIntro root
    // themselves: this is a screen ON the flow surface and takes the surface's
    // frame, its reserve above the drawer and its save note.
    <div className="flow baselineoffer" data-position="baseline-offer">
      <h2 className="baselineoffer-title">{S.baselineTitle}</h2>
      <p className="baselineoffer-body">{S.baselineBody}</p>

      {/* Their own words, in the trust chrome every prompt in this product
          wears. Nothing is added to it — a baseline that carried an
          instruction would be measuring the instruction. */}
      <ReadOnlyBlock tag={S.reflectPromptTag}>{task}</ReadOnlyBlock>

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
