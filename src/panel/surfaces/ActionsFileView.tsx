import { useEffect, useState } from 'react';
import { Button } from '../components';
import { getLocal } from '../../core/storage/client';
import { deriveActionsFile } from '../../core/files/deriveActions';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './ActionsFileView.css';

/**
 * V2.2 VB-85 — Actions.md, on screen.
 *
 * NOT AN INTERVIEW AND NOT A FILE VIEW WITH SECTIONS TO REDO. There is
 * nothing here to answer: the file is a fold over the Skills answers
 * (core/files/deriveActions.ts), recomputed on every render of this surface
 * — open it after editing a skill and it is already current, because there
 * is nothing stored that could have gone stale. The only verbs are read and
 * download, plus the door back to Skills for anyone who wants the content to
 * change — which is the honest place to send them, since Skills is where
 * this file's content actually lives.
 *
 * The download reuses FileActions' own blob mechanics inline rather than the
 * component, because that component is Context's (its import half has no
 * meaning for a derived file — importing an Actions.md would be importing a
 * derivation, and the derivation would immediately disagree with it).
 */

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

export interface ActionsFileViewProps {
  onBack: () => void;
  onOpenSkills: () => void;
}

export function ActionsFileView({ onBack, onOpenSkills }: ActionsFileViewProps) {
  const [skillsAnswers, setSkillsAnswers] = useState<Answers | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:answers:skills').then((stored) => {
      if (!cancelled) setSkillsAnswers(stored ?? EMPTY);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!skillsAnswers) return null;
  const text = deriveActionsFile(skillsAnswers);

  function handleDownload() {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Actions.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="actionsview">
      <h2 className="actionsview-title">{S.fileActions}</h2>
      <p className="actionsview-sub">{S.actionsDerivedNote}</p>
      {/* The file itself, as text — the artifact is the interface here, the
          same position the drawer's preview takes. Scrolls in its own box so
          a long file never scrolls the panel sideways or pushes the buttons
          off screen. */}
      <pre className="actionsview-text">{text}</pre>
      <Button type="button" onClick={handleDownload}>
        {S.actionsDownload}
      </Button>
      <Button type="button" variant="secondary" onClick={onOpenSkills}>
        {S.actionsEditSkills}
      </Button>
      <Button type="button" variant="quiet" onClick={onBack}>
        {S.back}
      </Button>
    </div>
  );
}
