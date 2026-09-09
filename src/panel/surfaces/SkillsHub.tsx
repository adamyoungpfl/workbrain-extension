import { useEffect, useState } from 'react';
import { Button, Toast, BackGlyph, StoredSheet } from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { redeemSkillCode } from '../../core/packs/redeem';
import { capabilitySkills, capabilityReady, cardFor } from '../../core/proof/capability';
import { CAPABILITY_SKILL_KEY } from '../../core/flow/proofAdapter';
import { skillsModules, skillsOutline } from '../../core/flow/flow';
import { fileAsked } from '../../core/files/slots';
import { generateSkillsFile } from '../../core/files/skillsFile';
import { downloadSkillsFile } from './FileActions';
import { fileName } from '../components/fileLabels';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './SkillsHub.css';
import './ContextHub.css';

/**
 * SKILL DEVELOPMENT v3 (V3.0 pass 4i; Adam, 2026-09-08): the page follows
 * Context Development's design.
 *
 *  - a DOWNLOAD CENTER for Skills, status in the grid the same way - Start
 *    now launches the create-new-skill experience (Skill Activator's
 *    function, 4g), Finish it now resumes it, Download and Edit once the
 *    file stands;
 *  - the PROVING GROUNDS for Skills: choose a skill, its OBJECTIVE on one
 *    side and the SKILL on the other, and Prove It runs the run-and-tick
 *    capability loop comparing the objective to the output. The earned
 *    gate (two runnable skills) keeps its waiting grammar here;
 *  - WORKBRAIN CERTIFIED SKILLS stands where it stood, and "Redeem a
 *    code" is an INPUT now - paste, submit, and the skill lands in the
 *    Download Center (the sheet's own core and copy, without the sheet).
 *
 * The hub loads its own store; everything on this page is derived at
 * render from the person's own answers, and the one thing it writes -
 * `cap_skill`, the record they chose to prove - is the same key the
 * capability flow's own switch button writes.
 */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
const LIBRARY_URL = 'https://www.model-citizen.org/work-brain/skills-library';

const KB = (bytes: number) => (bytes / 1024).toFixed(1);

export interface SkillsHubProps {
  onBack: () => void;
  /** The create-new-skill experience — the Skills interview's own door. */
  onCreate: () => void;
  /** Opens Skills.md for editing — the same door Home's card holds. */
  onEdit: () => void;
  /** Launches the capability loop for the chosen skill (`cap_skill` is
   * written before this fires, so the offer opens on their choice). */
  onProveSkill: () => void;
}

export function SkillsHub({ onBack, onCreate, onEdit, onProveSkill }: SkillsHubProps) {
  const [skills, setSkills] = useState<Answers>(EMPTY);
  const [toast, setToast] = useState<string | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storedOpen, setStoredOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:answers:skills').then((stored) => {
      if (!cancelled && stored) setSkills(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /* "Started" means the file HAS anything - a seeded or imported record
     counts even before any stamp lands (a store can hold records with no
     answeredAt, e.g. a pack that just landed). */
  const started =
    Object.keys(skills.answeredAt).length > 0 || (skills.repeatables['skills']?.length ?? 0) > 0;
  const asked = fileAsked(skillsOutline, skillsModules, skills, new Date());
  const bytes = started
    ? new TextEncoder().encode(generateSkillsFile(skills, new Date().toISOString())).length
    : 0;

  const cards = capabilitySkills(skills);
  const ready = capabilityReady(skills);
  const chosenCard = (chosen !== null ? cardFor(cards, chosen) : undefined) ?? cards[0];

  async function prove() {
    if (!chosenCard) return;
    /* The flow's own chosen-skill key, written the way its switch button
       writes it — the offer opens on the record picked here. */
    const next: Answers = {
      ...skills,
      values: { ...skills.values, [CAPABILITY_SKILL_KEY]: String(chosenCard.index) },
    };
    await setLocal('wb:answers:skills', next);
    onProveSkill();
  }

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
    const stored = await setLocal('wb:answers:skills', result.answers);
    setBusy(false);
    if (!stored.ok) return;
    setSkills(result.answers);
    setCode('');
    setToast(S.skillsShareAdded(result.imported.length, result.skipped.length));
  }

  return (
    <div className="skillshub">
      <header className="skillshub-head">
        <Button type="button" variant="quiet" onClick={onBack}>
          <span className="hub-back">
            <BackGlyph />
            {S.hubBack}
          </span>
        </Button>
        <h2 className="skillshub-title">{S.rowSkillsHub}</h2>
        <p className="skillshub-sub">{S.hubSub}</p>
      </header>

      {/* ── The Download Center, the grid grammar Context Development set:
             a row's action is whatever moves it forward. ── */}
      <section className="ctxhub-pg ctxhub-dc">
        <div className="ctxhub-item-head">
          <span className="ctxhub-pg-title">{S.ctxDownloadName}</span>
        </div>
        <div className="ctxhub-grid">
          <div className="ctxhub-file" data-file="skills">
            <span className="ctxhub-file-name">{fileName('skills')}</span>
            <span className="ctxhub-file-meta">
              {S.ctxGridFormat}
              {started ? ` · ${S.ctxSize(KB(bytes))}` : ''}
            </span>
            <span className="ctxhub-file-actions">
              {started && (
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
              {started && (
                <button type="button" className="ctxhub-file-act" onClick={onEdit}>
                  {S.ctxGridEdit}
                </button>
              )}
              {!asked && (
                <button type="button" className="ctxhub-file-act" onClick={onCreate}>
                  {started ? S.ctxFinishNow : S.ctxStartNow}
                </button>
              )}
            </span>
          </div>
        </div>
      </section>

      {/* ── The Proving Grounds for Skills: the chosen skill's objective
             against the skill itself, and Prove It running the loop that
             compares objective to output. ── */}
      <section className="ctxhub-pg">
        <div className="ctxhub-item-head">
          <span className="ctxhub-pg-title">{S.ctxProveName}</span>
        </div>
        <p className="skillshub-line">{S.pgSkillsLead}</p>

        {ready && chosenCard ? (
          <>
            <ul className="skillspick" role="list">
              {cards.map((card) => (
                <li key={card.index}>
                  <button
                    type="button"
                    className="skillspick-opt"
                    aria-pressed={card.index === chosenCard.index}
                    onClick={() => setChosen(card.index)}
                  >
                    {card.name}
                  </button>
                </li>
              ))}
            </ul>
            <div className="ctxhub-pg-sides">
              <div className="ctxhub-pg-side" data-ready="on">
                <span className="ctxhub-pg-name">{S.pgObjectiveName}</span>
                <p className="ctxhub-pg-line">
                  {chosenCard.outputShape !== '' ? chosenCard.outputShape : S.pgObjectiveNone}
                </p>
              </div>
              <div className="ctxhub-pg-side" data-ready="on">
                <span className="ctxhub-pg-name">{S.pgSkillSideName}</span>
                <p className="ctxhub-pg-line">
                  {chosenCard.name} — {S.pgSkillCount(chosenCard.steps.length)}
                </p>
              </div>
            </div>
            <Button type="button" variant="primary" onClick={() => void prove()}>
              {S.pgProve}
            </Button>
          </>
        ) : (
          /* The earned gate, in the waiting grammar it has always worn:
             two runnable recipes open the Grounds, and a waiting door is
             not a control at all. */
          <div className="skillshub-door is-waiting">
            <span className="skillshub-kicker">{S.hubReviewKicker}</span>
            <span className="skillshub-name">{S.pgSkillName}</span>
            <span className="skillshub-line">{S.capRowWaiting}</span>
          </div>
        )}
      </section>

      {/* ── The Certified bulk, standing where it stood — with "Redeem a
             code" as the input it names (pass 4i). ── */}
      <section className="skillshub-cert">
        <span className="skillshub-kicker">{S.hubRedeemKicker}</span>
        <h3 className="skillshub-cert-name">{S.hubRedeemName}</h3>
        <p className="skillshub-line">{S.certLead}</p>
        <a className="btn btn-primary skillshub-cert-browse" href={LIBRARY_URL} target="_blank" rel="noreferrer">
          {S.certBrowse}
        </a>
        <div className="redeem">
          <label className="redeem-label" htmlFor="redeem-code">
            {S.certRedeem}
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
          <Button
            type="button"
            variant="secondary"
            loading={busy}
            loadingLabel={S.redeemBusy}
            onClick={() => void redeem()}
          >
            {S.redeemGo}
          </Button>
        </div>
      </section>

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
