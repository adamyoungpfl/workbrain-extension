import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Toast } from '../components';
import { generateContextFile } from '../../core/files/generate';
import { parseContextFile } from '../../core/files/parse';
import { buildImportedAnswers } from '../../core/files/restore';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './FileActions.css';

export interface FileActionsProps {
  answers: Answers;
  /** Home's own `persist` (setLocal 'wb:answers'), so a failed write here
   * degrades exactly the way a failed write anywhere else in the panel does
   * (docs/GUARDRAILS.md's degradation table: keep the in-memory state, tell
   * them plainly, offer the download). Returns whether the write actually
   * succeeded, so the toast here only ever confirms a real save. */
  onImport: (next: Answers) => Promise<boolean>;
}

const FILE_NAME = 'Context.md';

function todayLong(): string {
  return new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * R1-10's download/import, R1-12's backup story hosted on Home: download the
 * built Context.md, and bring a previously downloaded one back in. Both are
 * DOM-only (Blob/URL/anchor, FileReader/<input type=file>) — the
 * string-in/string-out half (generate/parse) is core/, already built at
 * R1-09.
 *
 * Originally lived on the Context flow's own `done` screen (see git history
 * — this file was `FlowDone.tsx`) because Home didn't exist until R1-12.
 * Moved here, and made always-visible rather than gated behind finishing
 * the interview, because the backup story this is (R1-10's own accept line:
 * "treat a failure here as a release blocker") shouldn't require finishing
 * every question first — a half-finished file is still worth a copy.
 * Scoped to the Context flow specifically (not generic across whatever
 * `modules` a `Flow` might render): `generateContextFile`/`parseContextFile`/
 * `buildImportedAnswers` all default to the real `contextModules`, matching
 * their own established pattern, since a Context.md is the only file format
 * R1-09 built a generator/parser for.
 */
export function FileActions({ answers, onImport }: FileActionsProps) {
  const [downloaded, setDownloaded] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleDownload() {
    const markdown = generateContextFile(answers, todayLong());
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // A same-tick revoke can race the browser's own download start in some
    // engines — the sibling app (../modelcitizen) hits this same issue and
    // defers the revoke a beat; matched here for the same reason.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setDownloaded(true);
    setImportError(null);
    setToastMessage(S.toastDownloaded);
  }

  function handleImportClick() {
    setImportError(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be picked again later (e.g. after fixing it)
    if (!file) return;

    if (!/\.md$/i.test(file.name)) {
      setImportError(S.errFileWrongKind);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => setImportError(S.errFileUnreadable);
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseContextFile(text);
      if (!parsed.ok) {
        // docs/GUARDRAILS.md's degradation table, "Export parse fails" —
        // never an error code, never a stack trace, just what to do next.
        setImportError(S.errFileUnreadable);
        return;
      }
      const restored = buildImportedAnswers(parsed.answers, new Date().toISOString());
      const answerCount = Object.keys(restored.answeredAt).length;
      void onImport(restored).then((ok) => {
        if (!ok) return; // Home's own saveError handling already covers this — nothing more to say here.
        setImportError(null);
        setToastMessage(S.toastImported(answerCount));
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="file-actions">
      {importError && (
        <div role="alert" className="file-actions-error">
          {importError}
        </div>
      )}
      <Button type="button" variant="secondary" onClick={handleDownload}>
        {downloaded ? S.downloadAgain : S.download}
      </Button>
      <Button type="button" variant="secondary" onClick={handleImportClick}>
        {S.importFile}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,text/markdown"
        className="file-actions-input"
        tabIndex={-1}
        aria-hidden="true"
        aria-label={S.importPick}
        onChange={handleFileChange}
      />
      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}
