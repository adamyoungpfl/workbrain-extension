import { useEffect, useState } from 'react';
import { Button } from '../components';
import { RedeemSheet } from './RedeemSheet';
import { Toast } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { capabilityReady } from '../../core/proof/capability';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './SkillsHub.css';

/**
 * THE SKILLS HUB (V3.0 pass 4c; Adam, 2026-09-08: "combine the Skills
 * Activator, Skill Training and Workbrain Certified skills and make that
 * a new home page destination where you can Create (Skill Activator),
 * Review (Skill Training) and Redeem (Workbrain Certified Skills) as 3
 * options to create, edit or upgrade your skills").
 *
 * Three doors that were three Home rows, gathered into one destination:
 * CREATE opens the activator sheet (the same RedeemSheet, hosted here
 * with the same storage handlers Home used), REVIEW walks into Skill
 * Training (the capability flow — still earned by the second skill, and
 * the waiting card says so in the same words the row did), REDEEM leads
 * out to the Certified Skills library on the site.
 *
 * The hub loads the skills store itself: it is the surface these three
 * doors all read, and carrying it through App would thread a prop through
 * a component that never looks at it.
 */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
const LIBRARY_URL = 'https://www.model-citizen.org/work-brain/skills-library';

export interface SkillsHubProps {
  onBack: () => void;
  /** Walks into Skill Training — App's own capability route. */
  onReview: () => void;
}

export function SkillsHub({ onBack, onReview }: SkillsHubProps) {
  const [skills, setSkills] = useState<Answers>(EMPTY);
  const [createOpen, setCreateOpen] = useState(false);
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

  const reviewReady = capabilityReady(skills);

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
          <button type="button" className="skillshub-door" onClick={() => setCreateOpen(true)}>
            <span className="skillshub-kicker">{S.hubCreateKicker}</span>
            <span className="skillshub-name">{S.hubCreateName}</span>
            <span className="skillshub-line">{S.hubCreateLine}</span>
          </button>
        </li>
        <li>
          {reviewReady ? (
            <button type="button" className="skillshub-door" onClick={onReview}>
              <span className="skillshub-kicker">{S.hubReviewKicker}</span>
              <span className="skillshub-name">{S.hubReviewName}</span>
              <span className="skillshub-line">{S.hubReviewLine}</span>
            </button>
          ) : (
            /* The same earned gate the Home row had, in the same words —
               bare against the field per the tint law: no tint IS the
               not-yet signal. */
            <div className="skillshub-door is-waiting">
              <span className="skillshub-kicker">{S.hubReviewKicker}</span>
              <span className="skillshub-name">{S.hubReviewName}</span>
              <span className="skillshub-line">{S.capRowWaiting}</span>
            </div>
          )}
        </li>
        <li>
          <a className="skillshub-door" href={LIBRARY_URL} target="_blank" rel="noreferrer">
            <span className="skillshub-kicker">{S.hubRedeemKicker}</span>
            <span className="skillshub-name">{S.hubRedeemName}</span>
            <span className="skillshub-line">{S.hubRedeemLine}</span>
          </a>
        </li>
      </ul>

      <RedeemSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
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
