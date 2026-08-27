import { useRef, useState } from 'react';
import type { Answers } from '../../schema/storage.types';
import { exportSkillsPack, importSkillsPack } from '../../core/packs/skillsPack';
import { Button } from '../components/Button';
import { Toast } from '../components/Toast';
import { S } from '../strings';
import './SkillsShare.css';

/**
 * V2.5 VB-124 — the share/backup surface, exactly V3 slice one's core put
 * in front of a person: "Save a copy of my skills" downloads the `self`
 * pack; "Add skills from a file" imports one. Slotted into the SKILLS
 * browse canvas by App (Browse itself stays file-agnostic).
 *
 * The trust story, unchanged: the pack leaves by download and arrives by
 * the person's own picker — nothing transmitted, nothing fetched
 * (NORTH-STAR: the library round adds fetching, later, behind membership).
 * Refusals speak in the core's own degradation voice; a partial import
 * says how many came and how many could not.
 */

export interface SkillsShareProps {
  answers: Answers;
  /** Export mints ids for any unminted tail — the aligned answers must be
   * persisted, which the OWNER of the store does (Browse → App). */
  onAnswers: (next: Answers) => void;
}

export function SkillsShare({ answers, onAnswers }: SkillsShareProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function handleSave() {
    const { envelope, answers: aligned } = exportSkillsPack(answers, new Date().toISOString());
    if (aligned !== answers) onAnswers(aligned);
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'My skills.workbrain-pack.json';
    a.click();
    URL.revokeObjectURL(url);
    setToast(S.skillsShareSaved);
  }

  function handlePicked(file: File | null) {
    if (!file) return;
    void file.text().then((text) => {
      const report = importSkillsPack(text, answers, new Date().toISOString());
      if (!report.ok) {
        setToast(report.reason);
        return;
      }
      onAnswers(report.answers);
      setToast(S.skillsShareAdded(report.imported.length, report.skipped.length));
    });
  }

  return (
    <div className="skillsshare">
      <Button type="button" variant="secondary" size="sm" onClick={handleSave}>
        {S.skillsShareSave}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
        {S.skillsShareAdd}
      </Button>
      <input
        ref={fileRef}
        className="skillsshare-input"
        type="file"
        accept="application/json,.json"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          handlePicked(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
