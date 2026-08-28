import { contextFileDate, generateContextFile } from '../../core/files/generate';
import { parseContextFile } from '../../core/files/parse';
import { buildImportedAnswers } from '../../core/files/restore';
import type { Answers } from '../../schema/storage.types';
import { S } from '../strings';

/**
 * R1-10's download/import machinery, V2.9 VB-145/147: the FileActions
 * COMPONENT retired — the download became Home's own tile (the Move tile's
 * heir) and the import moved behind the chrome's upload door with its
 * replace-warning sheet (UploadSheet.tsx). What lives on here is the
 * DOM-only machinery both of them share, exported as two helpers so the
 * tile, the sheet, and any future door produce byte-identical files and
 * take the same care bringing one back. The string-in/string-out half
 * (generate/parse/restore) is core/, exactly as it was at R1-09.
 */

const FILE_NAME = 'Context.md';

/**
 * Put a markdown file on the person's machine.
 *
 * BS-03d extracted this from `downloadContextFile` below, because the proof's
 * receipt is the second document this product hands over and the two must
 * behave identically — including the deferred revoke, which is the kind of
 * detail a second copy gets wrong once and then nobody can reproduce.
 */
export function downloadMarkdown(name: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // A same-tick revoke can race the browser's own download start in some
  // engines — the sibling app hits this same issue and defers the revoke a
  // beat; matched here for the same reason.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download the built Context.md — the same bytes the drawer previews. */
export function downloadContextFile(answers: Answers): void {
  // V1.1 VB-07b moved the date stamp into core/files/generate.ts so the
  // drawer's live preview and this download produce the same bytes by
  // construction, not by two copies of the same `toLocaleDateString` call.
  downloadMarkdown(FILE_NAME, generateContextFile(answers, contextFileDate()));
}

export type ReadContextResult =
  | { ok: true; answers: Answers; count: number }
  | { ok: false; reason: string };

/** Read a picked file back into answers — every refusal in the degradation
 * voice, never an error code (docs/GUARDRAILS.md's table). */
export function readContextFile(file: File): Promise<ReadContextResult> {
  return new Promise((resolve) => {
    if (!/\.md$/i.test(file.name)) {
      resolve({ ok: false, reason: S.errFileWrongKind });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => resolve({ ok: false, reason: S.errFileUnreadable });
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseContextFile(text);
      if (!parsed.ok) {
        resolve({ ok: false, reason: S.errFileUnreadable });
        return;
      }
      const restored = buildImportedAnswers(parsed.answers, new Date().toISOString());
      resolve({ ok: true, answers: restored, count: Object.keys(restored.answeredAt).length });
    };
    reader.readAsText(file);
  });
}
