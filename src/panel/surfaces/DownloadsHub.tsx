import { useEffect, useState } from 'react';
import { BackGlyph, Button, StoredSheet, Toast } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { hasBaseline } from '../../core/report/runs';
import { downloadContextFile, downloadSkillsFile, downloadWorkbrainFolder } from './FileActions';
import { UploadSheet } from './UploadSheet';
import { generateContextFile } from '../../core/files/generate';
import { generateSkillsFile } from '../../core/files/skillsFile';
import { contextModules, contextOutline, skillsModules, skillsOutline } from '../../core/flow/flow';
import { fileAsked } from '../../core/files/slots';
import { fileName } from '../components/fileLabels';
import type { Answers, ProofRun, ReportState } from '../../schema/storage.types';
import { S } from '../strings';
import './SkillsHub.css';
import './ContextHub.css';

/**
 * THE DOWNLOAD CENTER (V3.0 pass 4q; Adam, 2026-09-09): its own Workbrain
 * area — "all of the downloadable assets and a single workbrain folder
 * download that contains all of it." One grid in the grammar the
 * Development pages set: the baseline (Copy / Edit once taken), both
 * files with Download and their live start/finish/edit action, and the
 * one folder that zips whatever stands. Self-loading like its siblings;
 * every number derived at render, nothing new stored.
 */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

const KB = (bytes: number) => (bytes / 1024).toFixed(1);

export interface DownloadsHubProps {
  onBack: () => void;
  /** The pre-launch errand — also the baseline row's Edit. */
  onBaseline: () => void;
  /** The file views, the same doors Home's cards hold. */
  onEdit: (id: 'context' | 'skills') => void;
  /** The Context interview's plain resume. */
  onResume: () => void;
  /** The create-new-skill experience. */
  onCreate: () => void;
}

export function DownloadsHub({ onBack, onBaseline, onEdit, onResume, onCreate }: DownloadsHubProps) {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [skills, setSkills] = useState<Answers>(EMPTY);
  const [report, setReport] = useState<ReportState | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const [storedOpen, setStoredOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

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
  const runs: ProofRun[] = report?.runs ?? [];
  const baselineRun = runs.find((run) => run.stage === 'baseline');

  const contextStarted = Object.keys(answers.answeredAt).length > 0;
  const contextReady = fileAsked(contextOutline, contextModules, answers, new Date());
  const skillsStarted =
    Object.keys(skills.answeredAt).length > 0 || (skills.repeatables['skills']?.length ?? 0) > 0;
  const skillsAsked = fileAsked(skillsOutline, skillsModules, skills, new Date());
  const contextBytes = contextStarted
    ? new TextEncoder().encode(generateContextFile(answers, new Date().toISOString())).length
    : 0;
  const skillsBytes = skillsStarted
    ? new TextEncoder().encode(generateSkillsFile(skills, new Date().toISOString())).length
    : 0;

  return (
    <div className="skillshub dlhub">
      <div className="hub-scroll">
      <header className="skillshub-head">
        <Button type="button" variant="quiet" onClick={onBack}>
          <span className="hub-back">
            <BackGlyph />
            {S.hubBack}
          </span>
        </Button>
        <h2 className="skillshub-title">{S.fileHub}</h2>
        <p className="skillshub-sub">{S.dlSub}</p>
      </header>

      <section className="ctxhub-pg ctxhub-dc">
        <div className="ctxhub-grid">
          <div className="ctxhub-file" data-file="baseline">
            <span className="ctxhub-file-name">{S.ctxGridBaseline}</span>
            <span className="ctxhub-file-meta">{S.ctxGridBaselineMeta}</span>
            <span className="ctxhub-file-actions">
              {baselineTaken && baselineRun ? (
                <>
                  <button
                    type="button"
                    className="ctxhub-file-act"
                    onClick={() => {
                      navigator.clipboard?.writeText(baselineRun.task).then(
                        () => setToast(S.copied),
                        () => {},
                      );
                    }}
                  >
                    {S.ctxGridCopy}
                  </button>
                  <button type="button" className="ctxhub-file-act" onClick={onBaseline}>
                    {S.ctxGridEdit}
                  </button>
                </>
              ) : (
                <button type="button" className="ctxhub-file-act" onClick={onBaseline}>
                  {S.ctxCompleteNow}
                </button>
              )}
            </span>
          </div>
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
              {contextReady ? (
                <button type="button" className="ctxhub-file-act" onClick={() => onEdit('context')}>
                  {S.ctxGridEdit}
                </button>
              ) : (
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
            <span className="ctxhub-file-actions">
              {skillsStarted && (
                <button
                  type="button"
                  className="ctxhub-file-act"
                  onClick={() => {
                    downloadSkillsFile(skills);
                    setToast(S.toastDownloaded);
                  }}
                >
                  {S.ctxGridDownload}
                </button>
              )}
              {skillsAsked ? (
                <button type="button" className="ctxhub-file-act" onClick={() => onEdit('skills')}>
                  {S.ctxGridEdit}
                </button>
              ) : (
                <button type="button" className="ctxhub-file-act" onClick={onCreate}>
                  {skillsStarted ? S.ctxFinishNow : S.ctxStartNow}
                </button>
              )}
            </span>
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
          {/* Pass 4t: files come IN here too - the upload door, with its
              replace-warning sheet and the parser's calm rejection
              (readContextFile: .md only, a real parse, the degradation
              voice for anything that is not a Workbrain file). */}
          <button type="button" className="home-download-folder" onClick={() => setUploadOpen(true)}>
            {S.uploadOpen}
          </button>
        </div>
      </section>

      </div>
      <footer className="home-foot hub-foot">
        <p className="home-privacy">
          {S.homePrivacyNote}{' '}
          <button type="button" className="home-foot-link" onClick={() => setStoredOpen(true)}>
            {S.storedLink}
          </button>
        </p>
      </footer>
      <StoredSheet open={storedOpen} onClose={() => setStoredOpen(false)} />
      <UploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        answers={answers}
        onImport={async (next) => {
          const result = await setLocal('wb:answers', next);
          if (result.ok) setAnswers(next);
          return result.ok;
        }}
        onImported={(count) => setToast(S.toastImported(count))}
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
