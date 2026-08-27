import { useState } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { BUILD_VERSION } from '../../core/build';
import { diagnosticBlock, feedbackMailto } from '../../core/feedback/report';
import type { FeedbackContext } from '../../core/feedback/report';
import { S } from '../strings';
import './FeedbackSheet.css';

/**
 * BS-02 — the door the beta pays us back through.
 *
 * There was no way for a tester to tell us anything, and a beta with no return
 * channel is a demo. `docs/GUARDRAILS.md` permits this and it is worth being
 * precise about why: the rule is **no silent collection**, and nothing here is
 * silent, stored, observed, or sent by us. The person presses send in their own
 * mail client, with the whole draft in front of them.
 *
 * THE SHEET SAYS WHAT THE BLOCK HOLDS, IN THE SHEET. Not in a tooltip, not in
 * a privacy page — the two sentences are on screen above the buttons, because
 * "we take nothing you wrote" is a claim somebody should be able to check
 * before they act, not after. The block itself is four lines and they can read
 * it: `core/feedback/report.ts` builds it from a closed set of fields, none of
 * which could hold an answer.
 *
 * Two doors rather than one, because a beta tester is not always at a machine
 * with mail set up: write the email now, or copy the build details and send
 * them however they like.
 */

export interface FeedbackSheetProps {
  open: boolean;
  onClose: () => void;
  /** Where they were when they opened it — see `FeedbackContext`. */
  context: FeedbackContext;
  /** Where the mail goes. */
  to: string;
}

export function FeedbackSheet({ open, onClose, context, to }: FeedbackSheetProps) {
  const [copied, setCopied] = useState(false);
  const block = diagnosticBlock(context);

  function copy() {
    navigator.clipboard?.writeText(block).then(
      () => setCopied(true),
      () => {},
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={S.feedbackTitle}>
      <div className="feedback">
        <p className="feedback-body">{S.feedbackBody}</p>

        {/* The claim, then the evidence for it — in that order, and both
            before either button. */}
        <p className="feedback-what">{S.feedbackWhat}</p>
        <pre className="feedback-block">{block}</pre>
        <p className="feedback-nothing">{S.feedbackNothingSent}</p>

        <Button
          type="button"
          variant="primary"
          onClick={() => {
            window.open(feedbackMailto(to, S.feedbackSubject, S.feedbackLead, context), '_blank');
          }}
        >
          {S.feedbackWrite}
        </Button>
        <Button type="button" variant="secondary" onClick={copy}>
          {S.feedbackCopy}
        </Button>
        {copied && (
          <p className="feedback-copied" role="status">
            {S.feedbackCopied}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The control that opens it, so every surface's chrome places the same object
 * rather than each drawing its own. Labelled, per §1 — the word is the point:
 * an icon-only feedback control is a control nobody presses.
 */
export function FeedbackDoor({ onOpen, className }: { onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={['feedback-door', className].filter(Boolean).join(' ')}
      onClick={onOpen}
    >
      {S.feedbackOpen}
    </button>
  );
}

/** The build stamp, for the splash and anywhere else that needs to say which
 * version somebody is holding (BS-00). */
export function BuildStamp({ className }: { className?: string }) {
  return (
    <span className={['buildstamp', className].filter(Boolean).join(' ')}>
      {S.buildStamp(BUILD_VERSION)}
    </span>
  );
}
