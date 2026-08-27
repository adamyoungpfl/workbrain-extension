import { useState } from 'react';
import { Button, Sheet } from '../components';
import { redeemSkillCode } from '../../core/packs/redeem';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './RedeemSheet.css';

/**
 * V2.8 VB-133 — the Skill Redeemer's sheet: one input, one verb.
 *
 * The person types the code that came with their custom skill; the core
 * (core/packs/redeem.ts) turns it into a pack fetched from the site and
 * lands it through VB-124's import path. Success closes the sheet and the
 * caller toasts in the share row's own words; failure is a single calm
 * line IN the sheet (role=alert, the FileActions pattern) and the input
 * stays exactly as they typed it — the code is in their email, nothing
 * was consumed, trying again is free.
 *
 * The fetch lives in core/packs (the audit's one sanctioned site — the
 * injection seam); this sheet only asks. It is the product's first and
 * only runtime network read: a token out, a pack in, nothing of the
 * person's ever transmitted.
 */

export interface RedeemSheetProps {
  open: boolean;
  onClose: () => void;
  /** The skills answers as Home holds them. */
  skills: Answers;
  /** Persists + adopts the merged answers; resolves false if the write
   * failed (the caller's own degradation says so). */
  onSkills: (next: Answers) => Promise<boolean>;
  /** Fired on success with the landed/skipped counts, for the toast. */
  onRedeemed: (added: number, skipped: number) => void;
}

export function RedeemSheet({ open, onClose, skills, onSkills, onRedeemed }: RedeemSheetProps) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await redeemSkillCode(code, skills, new Date().toISOString());
    if (!result.ok) {
      setBusy(false);
      setError(result.reason);
      return;
    }
    const stored = await onSkills(result.answers);
    setBusy(false);
    if (!stored) {
      // Home's own save degradation already spoke; keep the sheet standing.
      return;
    }
    setCode('');
    onRedeemed(result.imported.length, result.skipped.length);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={S.redeemTitle}>
      <div className="redeem">
        <label className="redeem-label" htmlFor="redeem-code">
          {S.redeemLabel}
        </label>
        <input
          id="redeem-code"
          className="redeem-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void redeem();
          }}
        />
        <p className="redeem-hint">{S.redeemHint}</p>
        {error && (
          <p role="alert" className="redeem-error">
            {error}
          </p>
        )}
        <Button type="button" variant="primary" loading={busy} loadingLabel={S.redeemBusy} onClick={() => void redeem()}>
          {S.redeemGo}
        </Button>
      </div>
    </Sheet>
  );
}
