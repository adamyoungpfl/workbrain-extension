import { useState } from 'react';
import { Button, Field, ReadOnlyBlock } from '../components';
import { withContextPrompt } from '../../core/flow/proofAdapter';
import { microProofTask } from '../../core/proof/microProof';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './MicroProof.css';

/**
 * BS-03a (§3) — THE MICRO-PROOF.
 *
 * One round trip, sixteen questions in. No baseline, no scoring, no
 * comparison: the point is that their AI comes back knowing something it
 * could not have known, and that this is worth another thirty questions.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It stores nothing. Not the reply, not that it happened, not a score —
 * `wb:report` is untouched, because there is nothing here the person
 * authored a judgement about. The whole screen is a demonstration, and a
 * demonstration that files a report about itself is measurement wearing a
 * costume (docs/GUARDRAILS.md's authorship test).
 *
 * It also asks nothing of them afterwards. §3's budget is three round trips
 * for the hour and this is the cheapest of them; adding a checklist here
 * would spend proof one's mechanic before proof one arrives.
 */

export interface MicroProofProps {
  answers: Answers;
  /** The file as it stands — the same bytes the download writes. */
  fileText: string;
  onDone: () => void;
}

export function MicroProof({ answers, fileText, onDone }: MicroProofProps) {
  const [reply, setReply] = useState('');
  const built = microProofTask(answers);
  const prompt = withContextPrompt(built.task, fileText, S.proofFileLead);
  const landed = reply.trim() !== '';

  return (
    <div className="flow microproof" data-position="micro-proof">
      <h2 className="microproof-title">{S.microTitle}</h2>
      <p className="microproof-lead">{S.microLead}</p>

      <ReadOnlyBlock tag={S.proofAskWithFile}>{prompt}</ReadOnlyBlock>

      {/* What to watch for, named from the rung the task actually reached —
          so the panel never promises a name it did not put in the prompt. */}
      <p className="microproof-look">
        {built.name ? S.microLookFor(built.name) : S.microLookForSelf}
      </p>

      <Field
        id="microproof-paste"
        label={S.microPasteLabel}
        as="textarea"
        value={reply}
        onChange={setReply}
      />

      {landed && <p className="microproof-done">{S.microDone}</p>}

      <Button type="button" variant={landed ? 'primary' : 'secondary'} onClick={onDone}>
        {S.microBack}
      </Button>

      <p className="flow-save">
        <span>{S.savedNote}</span>
        <span>{S.privacyNote}</span>
      </p>
    </div>
  );
}
