import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';
import { getLocal, getSync } from '../../core/storage/client';
import { NO_DISMISSALS, readDismissals } from '../../core/recommend/dismissals';
import type { Answers, Dismissals, ReportState } from '../../schema/storage.types';
import { S } from '../strings';

/**
 * V3.0 pass 4o — "What's stored on this device", as its own SELF-LOADING
 * sheet, so the Development pages' pinned privacy line can open the same
 * honest list Home's does. Reads the stores fresh each time it opens;
 * derived on render, nothing new stored.
 *
 * Home still carries its ORIGINAL inline version of this list (it derives
 * from state Home already holds live). The rows here mirror it exactly —
 * if one grows a row the other must too, and converging Home onto this
 * component is the recorded follow-up.
 */
const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

export function StoredSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [skills, setSkills] = useState<Answers>(EMPTY);
  const [report, setReport] = useState<ReportState | undefined>(undefined);
  const [dismissals, setDismissals] = useState<Dismissals>(NO_DISMISSALS);
  const [voicePref, setVoicePref] = useState<boolean | undefined>(undefined);
  const [metaStored, setMetaStored] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      getLocal('wb:answers'),
      getLocal('wb:recs'),
      getLocal('wb:answers:skills'),
      getLocal('wb:report'),
      getLocal('wb:meta'),
      getSync('wb:prefs'),
    ]).then(([storedAnswers, storedRecs, storedSkills, storedReport, storedMeta, storedPrefs]) => {
      if (cancelled) return;
      setAnswers(storedAnswers ?? EMPTY);
      setSkills(storedSkills ?? EMPTY);
      setReport(storedReport);
      setDismissals(readDismissals(storedRecs));
      setMetaStored(storedMeta !== undefined);
      setVoicePref(
        storedPrefs && typeof storedPrefs.narrator === 'boolean' ? storedPrefs.narrator : undefined,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const contextCount = Object.keys(answers.answeredAt).length;
  const skillCount = (skills.repeatables['skills'] ?? []).length;
  const scoreCount = report?.scores?.length ?? 0;
  const hiddenCount = Object.keys(dismissals.dismissed).length;
  const rows: string[] = [];
  if (contextCount > 0) rows.push(S.storedContext(contextCount));
  if (skillCount > 0) rows.push(S.storedSkills(skillCount));
  if (scoreCount > 0) rows.push(S.storedScores(scoreCount));
  if (hiddenCount > 0) rows.push(S.storedHidden(hiddenCount));
  if (voicePref !== undefined) rows.push(S.storedVoice(voicePref));
  if (metaStored) rows.push(S.storedMeta);

  return (
    <Sheet open={open} onClose={onClose} title={S.storedTitle}>
      <div className="home-stored">
        {rows.length === 0 ? (
          <p className="home-stored-row">{S.storedNone}</p>
        ) : (
          <ul className="home-stored-list">
            {rows.map((row) => (
              <li key={row} className="home-stored-row">
                {row}
              </li>
            ))}
          </ul>
        )}
        <p className="home-stored-outro">{S.storedOutro}</p>
      </div>
    </Sheet>
  );
}
