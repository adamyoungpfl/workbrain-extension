import { useEffect, useState } from 'react';
import { BackGlyph, Button, Sheet, StoredSheet, Toast } from '../components';
import { Comparison } from './Comparison';
import { getLocal } from '../../core/storage/client';
import { hasBaseline, latestTask } from '../../core/report/runs';
import { downloadContextFile, downloadWorkbrainFolder } from './FileActions';
import { generateContextFile } from '../../core/files/generate';
import { generateSkillsFile } from '../../core/files/skillsFile';
import { recommend, topRecommendations } from '../../core/recommend/engine';
import { recommendationCopy } from '../components';
import { NO_DISMISSALS } from '../../core/recommend/dismissals';
import { contextModules, contextOutline } from '../../core/flow/flow';
import { fileAsked } from '../../core/files/slots';
import { fileName } from '../components/fileLabels';
import type { RecommendationTarget } from '../../core/recommend/types';
import type { Answers, ProofRun, ReportState } from '../../schema/storage.types';
import { S } from '../strings';
import './SkillsHub.css';
import './ContextHub.css';

/**
 * CONTEXT DEVELOPMENT v2 (V3.0 pass 4f; Adam, 2026-09-08), matured by 4h.
 * Three moves up from the door-list it opened as:
 *
 *  - the DOWNLOAD CENTER stands OPEN - a grid of name, format, size, and
 *    each row's LIVE action (size measured off the same generator the
 *    download writes, so the number can never disagree with the file).
 *    Since 4h the standalone Pre-Launch Baseline item is gone and every
 *    not-done thing carries the button that changes it;
 *  - PROVING GROUNDS is the page's working BULK: the baseline and the
 *    context file as two sides, "Prove It" running the in-app loop when
 *    both stand ready, and - once runs exist - the verdict, what the AI
 *    said the file did not cover, and the refine list that leads straight
 *    back to the questions worth another pass. This SUPERSEDES 4c's
 *    external-link door at Adam's word ("The proving grounds page will
 *    facilitate the proving process") - and heals the re-entry gap that
 *    pass flagged: a finished file has its way back to the proof again.
 *
 * The hub loads its own stores; every number on this page is derived at
 * render from things the person authored or performed-and-judged, and
 * nothing new is stored (GUARDRAILS' run-history rows, unchanged).
 */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

export interface ContextHubProps {
  onBack: () => void;
  /** The pre-launch errand — the goal question, then the run-it screen. */
  onBaseline: (() => void) | undefined;
  /** Opens a file for editing — the same doors Home's cards hold. */
  onEdit: (id: 'context' | 'skills') => void;
  /** Pass 4h: "Start now" / "Finish it now" — the interview, resumed. */
  onResume: () => void;
  /** Pass 4h: the unlocked Skills row's one action — Skill Development. */
  onSkillsHub: () => void;
  /** Runs the in-app proof loop — the head-to-head this page exists for. */
  onProve: () => void;
  /** A refine row's jump straight to its question. */
  onOpenTarget: (target: RecommendationTarget) => void;
}

const KB = (bytes: number) => (bytes / 1024).toFixed(1);

export function ContextHub({ onBack, onBaseline, onEdit, onResume, onSkillsHub, onProve, onOpenTarget }: ContextHubProps) {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [skills, setSkills] = useState<Answers>(EMPTY);
  const [report, setReport] = useState<ReportState | undefined>(undefined);
  const [compareOpen, setCompareOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [storedOpen, setStoredOpen] = useState(false);

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
  const contextReady = fileAsked(contextOutline, contextModules, answers, new Date());
  const contextStarted = Object.keys(answers.answeredAt).length > 0;
  const skillsStarted = Object.keys(skills.answeredAt).length > 0;

  const runs: ProofRun[] = report?.runs ?? [];
  const baselineRun = runs.find((run) => run.stage === 'baseline');
  const contextRun = [...runs].reverse().find((run) => run.stage === 'context');
  const compareTask = latestTask(report);

  /* The refine list: the engine Home's recommendations already run, capped
     to the three strongest — each row a door straight to its question. */
  const refine = contextRun
    ? topRecommendations(recommend({ answers, now: new Date(), dismissals: NO_DISMISSALS }), 3)
    : [];

  const contextBytes = contextStarted
    ? new TextEncoder().encode(generateContextFile(answers, new Date().toISOString())).length
    : 0;
  const skillsBytes = skillsStarted
    ? new TextEncoder().encode(generateSkillsFile(skills, new Date().toISOString())).length
    : 0;

  return (
    <div className="skillshub ctxhub">
      <header className="skillshub-head">
        <Button type="button" variant="quiet" onClick={onBack}>
          <span className="hub-back">
            <BackGlyph />
            {S.hubBack}
          </span>
        </Button>
        <h2 className="skillshub-title">{S.ctxTitle}</h2>
        <p className="skillshub-sub">{S.ctxSub}</p>
      </header>

      {/* The standalone Pre-Launch Baseline item is GONE (pass 4h: "remove
          the Pre-Launch Baseline section completely") - its status and its
          action live on the Grounds' baseline side now, the one place the
          errand matters. */}

      {/* ── The Download Center, standing open in the Grounds' own dress
             (pass 4h): every row carries its live action - Start / Finish
             while the file is unfinished, Download / Edit once it stands,
             and Skills either locked or a door to Skill Development. ── */}
      <section className="ctxhub-pg ctxhub-dc">
        <div className="ctxhub-item-head">
          <span className="ctxhub-pg-title">{S.ctxDownloadName}</span>
        </div>
        <div className="ctxhub-grid">
          <div className="ctxhub-file" data-file="context">
            <span className="ctxhub-file-name">{fileName('context')}</span>
            <span className="ctxhub-file-meta">
              {S.ctxGridFormat}
              {contextStarted ? ` · ${S.ctxSize(KB(contextBytes))}` : ''}
            </span>
            <span className="ctxhub-file-actions">
              {contextStarted && (
                <button
                  type="button"
                  className="ctxhub-file-act"
                  onClick={() => {
                    downloadContextFile(answers);
                    setToast(S.toastDownloaded);
                  }}
                >
                  {S.ctxGridDownload}
                </button>
              )}
              {contextStarted && (
                <button type="button" className="ctxhub-file-act" onClick={() => onEdit('context')}>
                  {S.ctxGridEdit}
                </button>
              )}
              {!contextReady && (
                <button type="button" className="ctxhub-file-act" onClick={onResume}>
                  {contextStarted ? S.ctxFinishNow : S.ctxStartNow}
                </button>
              )}
            </span>
          </div>
          <div className="ctxhub-file" data-file="skills">
            <span className="ctxhub-file-name">{fileName('skills')}</span>
            <span className="ctxhub-file-meta">
              {S.ctxGridFormat}
              {skillsStarted ? ` · ${S.ctxSize(KB(skillsBytes))}` : ''}
            </span>
            {/* The same door condition Home's shelf reads — the interview
                being over is what unlocks Skills, fileAsked not fileFinished
                (the long story lives in Home.tsx's O3 note). */}
            {contextReady ? (
              <button type="button" className="ctxhub-file-act" onClick={onSkillsHub}>
                {S.rowSkillsHub}
              </button>
            ) : (
              <span className="ctxhub-file-lock">{S.badgeLocked}</span>
            )}
          </div>
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
      </section>

      {/* ── PROVING GROUNDS — the page's working bulk. ── */}
      <section className="ctxhub-pg">
        <div className="ctxhub-item-head">
          <span className="ctxhub-pg-title">{S.ctxProveName}</span>
        </div>
        <p className="skillshub-line">{S.pgLead}</p>

        {/* Pass 4h: a side that is not done carries the BUTTON that does it,
            where the "Not yet" chip used to stand — the status becomes the
            action. */}
        <div className="ctxhub-pg-sides">
          <div className="ctxhub-pg-side" data-ready={baselineTaken ? 'on' : 'off'}>
            <span className="ctxhub-pg-name">{S.pgBaselineName}</span>
            {baselineTaken ? (
              <span className="ctxhub-status" data-done="on">
                {S.ctxDone}
              </span>
            ) : (
              onBaseline && (
                <button type="button" className="ctxhub-file-act" onClick={onBaseline}>
                  {S.ctxCompleteNow}
                </button>
              )
            )}
            <p className="ctxhub-pg-line">
              {baselineRun ? baselineRun.answer.slice(0, 140) : S.pgBaselineLine}
            </p>
          </div>
          <div className="ctxhub-pg-side" data-ready={contextReady ? 'on' : 'off'}>
            <span className="ctxhub-pg-name">{S.pgContextName}</span>
            {contextReady ? (
              <span className="ctxhub-status" data-done="on">
                {S.ctxDone}
              </span>
            ) : (
              <button type="button" className="ctxhub-file-act" onClick={onResume}>
                {contextStarted ? S.ctxFinishNow : S.ctxStartNow}
              </button>
            )}
            <p className="ctxhub-pg-line">
              {contextReady ? fileName('context') : S.pgContextLine}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          disabled={!(baselineTaken && contextReady)}
          onClick={onProve}
        >
          {S.pgProve}
        </Button>
        {!(baselineTaken && contextReady) && <p className="ctxhub-pg-needs">{S.pgNeedsBoth}</p>}

        {/* The 4g skill lane moved HOME to Skill Development's own Proving
            Grounds in pass 4i - this page proves the context file only. */}

        {/* The analysis, once a with-file run stands beside the baseline:
            their own verdict, what the AI admitted it lacked, and the
            refine doors back into the interview. */}
        {contextRun && (
          <div className="ctxhub-pg-analysis">
            {contextRun.score && (
              <p className="ctxhub-pg-verdict">
                {S.pgVerdict(contextRun.score.value, contextRun.score.of)}
              </p>
            )}
            {(contextRun.missing?.length ?? 0) > 0 && (
              <>
                <p className="ctxhub-pg-leadline">{S.pgMissingLead}</p>
                <ul className="ctxhub-pg-missing">
                  {contextRun.missing!.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </>
            )}
            {refine.length > 0 && (
              <>
                <p className="ctxhub-pg-leadline">{S.pgRefineLead}</p>
                <ul className="ctxhub-pg-refine">
                  {refine.map((rec) => {
                    const copy = recommendationCopy(rec);
                    return (
                      <li key={rec.id}>
                        <button
                          type="button"
                          className="ctxhub-pg-refine-row"
                          onClick={() => onOpenTarget(rec.target)}
                        >
                          <span>{copy.headline}</span>
                          <span className="ctxhub-pg-refine-go">{copy.action}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {compareTask && (
              <button type="button" className="home-foot-link" onClick={() => setCompareOpen(true)}>
                {S.pgSeeDiff}
              </button>
            )}
          </div>
        )}
      </section>

      <Sheet open={compareOpen} onClose={() => setCompareOpen(false)} title={S.compareTitle} full>
        <Comparison report={report} />
      </Sheet>
      {/* Pass 4o: the same pinned promise Home carries - one sentence and
          the door to the honest list (StoredSheet self-loads on open). */}
      <footer className="home-foot hub-foot">
        <p className="home-privacy">
          {S.homePrivacyNote}{' '}
          <button type="button" className="home-foot-link" onClick={() => setStoredOpen(true)}>
            {S.storedLink}
          </button>
        </p>
      </footer>
      <StoredSheet open={storedOpen} onClose={() => setStoredOpen(false)} />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
