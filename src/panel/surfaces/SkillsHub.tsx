import { useEffect, useState } from 'react';
import { Button } from '../components';
import { RedeemSheet } from './RedeemSheet';
import { Toast } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './SkillsHub.css';

/**
 * SKILL DEVELOPMENT v2 (V3.0 pass 4g; Adam, 2026-09-08):
 *
 *  - CREATE launches the create-new-skill experience — the Skills
 *    interview itself, resumed wherever the person's skills really stand
 *    (the same route the file card's edit takes);
 *  - SKILL TRAINING is the road to the PROVING GROUNDS: pick a skill
 *    there and prove it works, with the same analysis grammar the context
 *    file gets (desired output against produced output — the run-and-tick
 *    capability loop is the prover, reached from the Grounds);
 *  - WORKBRAIN CERTIFIED SKILLS is the page's BULK: the library on the
 *    site as the big destination, with "Redeem a code" beside it (the
 *    activator sheet moved under the library it redeems from).
 *
 * The waiting-grammar that used to gate this page's Review door moved to
 * the Grounds with the prover itself.
 */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
const LIBRARY_URL = 'https://www.model-citizen.org/work-brain/skills-library';

export interface SkillsHubProps {
  onBack: () => void;
  /** The create-new-skill experience — the Skills interview's own door. */
  onCreate: () => void;
  /** The road to the Proving Grounds, where a skill gets proven. */
  onGrounds: () => void;
}

export function SkillsHub({ onBack, onCreate, onGrounds }: SkillsHubProps) {
  const [skills, setSkills] = useState<Answers>(EMPTY);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:answers:skills').then((stored) => {
      if (!cancelled && stored) setSkills(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="skillshub">
      <header className="skillshub-head">
        <Button type="button" variant="quiet" onClick={onBack}>
          {S.hubBack}
        </Button>
        <h2 className="skillshub-title">{S.hubTitle}</h2>
        <p className="skillshub-sub">{S.hubSub}</p>
      </header>

      <ul className="skillshub-doors">
        <li>
          <button type="button" className="skillshub-door" onClick={onCreate}>
            <span className="skillshub-kicker">{S.hubCreateKicker}</span>
            <span className="skillshub-name">{S.hubCreateName}</span>
            <span className="skillshub-line">{S.hubCreateLine2}</span>
          </button>
        </li>
        <li>
          <button type="button" className="skillshub-door" onClick={onGrounds}>
            <span className="skillshub-kicker">{S.hubReviewKicker}</span>
            <span className="skillshub-name">{S.hubReviewName}</span>
            <span className="skillshub-line">{S.hubTrainLine}</span>
          </button>
        </li>
      </ul>

      {/* ── The page's bulk: the Certified library (Adam: "the biggest
             part of this page"), with the redeem door beside it. ── */}
      <section className="skillshub-cert">
        <span className="skillshub-kicker">{S.hubRedeemKicker}</span>
        <h3 className="skillshub-cert-name">{S.hubRedeemName}</h3>
        <p className="skillshub-line">{S.certLead}</p>
        <div className="skillshub-cert-actions">
          <a className="btn btn-primary skillshub-cert-browse" href={LIBRARY_URL} target="_blank" rel="noreferrer">
            {S.certBrowse}
          </a>
          <button type="button" className="skillshub-cert-redeem" onClick={() => setRedeemOpen(true)}>
            {S.certRedeem}
          </button>
        </div>
      </section>

      <RedeemSheet
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        skills={skills}
        onSkills={async (next) => {
          setSkills(next);
          const result = await setLocal('wb:answers:skills', next);
          return result.ok;
        }}
        onRedeemed={(added, skipped) => setToast(S.skillsShareAdded(added, skipped))}
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
