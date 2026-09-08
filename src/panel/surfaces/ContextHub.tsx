import { useEffect, useState } from 'react';
import { Button, Sheet, Toast } from '../components';
import { Comparison } from './Comparison';
import { getLocal } from '../../core/storage/client';
import { hasBaseline, latestTask } from '../../core/report/runs';
import { downloadContextFile, downloadSkillsFile, downloadWorkbrainFolder } from './FileActions';
import { fileName } from '../components/fileLabels';
import type { Answers, ReportState } from '../../schema/storage.types';
import { S } from '../strings';
import './SkillsHub.css';
import './ContextHub.css';

/**
 * CONTEXT DEVELOPMENT (V3.0 pass 4d; Adam, 2026-09-08: "Within it, like
 * Skills, we will have 'Pre-Launch Baseline', 'Download Center' (Context,
 * Skills, others, etc.) and 'Proving Grounds'").
 *
 * The second operational area, in the skills hub's own grammar: BEGIN
 * takes the starting point (the pre-launch errand - the door stands until
 * a baseline run exists, then rests as a quiet fact); CARRY opens the
 * Download Center in place (the same disclosure Home's download row held,
 * lifted here whole); PROVE leads out to the public Proving Grounds page.
 * And when runs exist to compare, REVIEW opens the before-and-after sheet
 * that used to be Home's own conditional row.
 *
 * The hub loads its own stores - context answers, skills answers, the
 * report - the way the skills hub does: these doors read them, and App
 * has no reason to carry what it never looks at.
 */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
const PROVING_URL = 'https://www.model-citizen.org/work-brain/proving-grounds';

export interface ContextHubProps {
  onBack: () => void;
  /** The pre-launch errand — App's own baseline route (goal question, then
   *  the run-it screen). */
  onBaseline: (() => void) | undefined;
}

export function ContextHub({ onBack, onBaseline }: ContextHubProps) {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [skills, setSkills] = useState<Answers>(EMPTY);
  const [report, setReport] = useState<ReportState | undefined>(undefined);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:answers').then((stored) => {
      if (!cancelled && stored) setAnswers(stored);
    });
    void getLocal('wb:answers:skills').then((stored) => {
      if (!cancelled && stored) setSkills(stored);
    });
    void getLocal('wb:report').then((stored) => {
      if (!cancelled) setReport(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const baselineTaken = hasBaseline(report);
  const compareTask = latestTask(report);
  const contextStarted = Object.keys(answers.answeredAt).length > 0;
  const skillsStarted = Object.keys(skills.answeredAt).length > 0;

  return (
    <div className="skillshub ctxhub">
      <header className="skillshub-head">
        <Button type="button" variant="quiet" onClick={onBack}>
          {S.hubBack}
        </Button>
        <h2 className="skillshub-title">{S.ctxTitle}</h2>
        <p className="skillshub-sub">{S.ctxSub}</p>
      </header>

      <ul className="skillshub-doors">
        <li>
          {onBaseline && !baselineTaken ? (
            <button type="button" className="skillshub-door" onClick={onBaseline}>
              <span className="skillshub-kicker">{S.ctxBaselineKicker}</span>
              <span className="skillshub-name">{S.ctxBaselineName}</span>
              <span className="skillshub-line">{S.ctxBaselineLine}</span>
            </button>
          ) : (
            /* Taken (or no route wired): a quiet fact, bare per the tint
               law - the door was an offer at a moment, and the moment
               passed the right way. */
            <div className="skillshub-door is-waiting">
              <span className="skillshub-kicker">{S.ctxBaselineKicker}</span>
              <span className="skillshub-name">{S.ctxBaselineName}</span>
              <span className="skillshub-line">{S.ctxBaselineTaken}</span>
            </div>
          )}
        </li>
        <li>
          <button
            type="button"
            className="skillshub-door"
            aria-expanded={downloadsOpen}
            onClick={() => setDownloadsOpen((o) => !o)}
          >
            <span className="skillshub-kicker">{S.ctxDownloadKicker}</span>
            <span className="skillshub-name">{S.ctxDownloadName}</span>
            <span className="skillshub-line">{S.ctxDownloadLine}</span>
          </button>
          {downloadsOpen && (
            /* Home's download disclosure, lifted whole (pass 2's grammar:
               present components as words, absent ones as waiting lines,
               the folder as one file that unzips into a directory). */
            <div className="home-downloads ctxhub-downloads">
              {(
                [
                  { id: 'context', started: contextStarted, get: () => downloadContextFile(answers) },
                  { id: 'skills', started: skillsStarted, get: () => downloadSkillsFile(skills) },
                ] as const
              ).map((f) => (
                <div key={f.id} className="home-download-line" data-file={f.id}>
                  <span className="home-download-name">{fileName(f.id)}</span>
                  {f.started ? (
                    <button
                      type="button"
                      className="home-download-get"
                      onClick={() => {
                        f.get();
                        setToast(S.toastDownloaded);
                      }}
                      aria-label={S.downloadOne(fileName(f.id))}
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                        <path d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ) : (
                    <span className="home-download-wait">{S.downloadNotStarted}</span>
                  )}
                </div>
              ))}
              {(contextStarted || skillsStarted) && (
                <button
                  type="button"
                  className="home-download-folder"
                  onClick={() => {
                    downloadWorkbrainFolder({
                      context: contextStarted ? answers : undefined,
                      skills: skillsStarted ? skills : undefined,
                    });
                    setToast(S.toastDownloaded);
                  }}
                >
                  {S.downloadFolder}
                </button>
              )}
            </div>
          )}
        </li>
        <li>
          <a className="skillshub-door" href={PROVING_URL} target="_blank" rel="noreferrer">
            <span className="skillshub-kicker">{S.ctxProveKicker}</span>
            <span className="skillshub-name">{S.ctxProveName}</span>
            <span className="skillshub-line">{S.ctxProveLine}</span>
          </a>
        </li>
        {compareTask && (
          <li>
            <button type="button" className="skillshub-door" onClick={() => setCompareOpen(true)}>
              <span className="skillshub-kicker">{S.ctxCompareKicker}</span>
              <span className="skillshub-name">{S.compareOpen}</span>
              <span className="skillshub-line">{S.compareSub}</span>
            </button>
          </li>
        )}
      </ul>

      <Sheet open={compareOpen} onClose={() => setCompareOpen(false)} title={S.compareTitle} full>
        <Comparison report={report} />
      </Sheet>
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
