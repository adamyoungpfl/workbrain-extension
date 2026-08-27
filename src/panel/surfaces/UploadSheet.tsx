import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Button, Sheet } from '../components';
import { downloadContextFile, readContextFile } from './FileActions';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';
import './UploadSheet.css';

/**
 * V2.9 VB-145 — the upload door's seatbelt. The chrome's upload control
 * opens this sheet, which says the one thing that matters — the file you
 * bring in REPLACES what is here — and offers the careful path beside the
 * quick one: download the current file first and then pick, in one press,
 * or just pick. Not a confirmation dialog (GUARDRAILS bans those): a sheet
 * with real choices, each a verb.
 *
 * The machinery is FileActions' helpers, so this door and the download
 * tile produce and read byte-identical files. A refusal (wrong kind,
 * unreadable, no grounding rule) speaks the same degradation voice it
 * always has, inline, with the sheet still standing.
 */

export interface UploadSheetProps {
  open: boolean;
  onClose: () => void;
  /** The current answers — what "download mine first" downloads. */
  answers: Answers;
  /** Persist + adopt the imported answers; resolves false on a failed
   * write (the caller's degradation already speaks). */
  onImport: (next: Answers) => Promise<boolean>;
  /** Fired on success with the restored-answer count, for the toast. */
  onImported: (count: number) => void;
}

export function UploadSheet({ open, onClose, answers, onImport, onImported }: UploadSheetProps) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick() {
    setError(null);
    inputRef.current?.click();
  }

  function downloadThenPick() {
    downloadContextFile(answers);
    pick();
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = ''; // lets the same file be picked again after fixing it
    if (!file) return;
    const result = await readContextFile(file);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    const stored = await onImport(result.answers);
    if (!stored) return;
    setError(null);
    onImported(result.count);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={S.uploadTitle}>
      <div className="upload">
        <p className="upload-warn">{S.uploadWarn}</p>
        {error && (
          <p role="alert" className="upload-error">
            {error}
          </p>
        )}
        <Button type="button" variant="primary" onClick={downloadThenPick}>
          {S.uploadBoth}
        </Button>
        <Button type="button" variant="secondary" onClick={pick}>
          {S.uploadJust}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".md,text/markdown"
          className="upload-input"
          tabIndex={-1}
          aria-hidden="true"
          aria-label={S.importPick}
          onChange={handleFile}
        />
      </div>
    </Sheet>
  );
}
