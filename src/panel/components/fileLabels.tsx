import type { FileSlotId } from '../../core/files/slots';
import type { FileLock } from '../../core/files/toggle';
import { S } from '../strings';

/**
 * What a file is called, what a lock says, and the padlock that draws it.
 *
 * ── WHY THIS FILE EXISTS, AND WHY IT IS NOT A COMPONENT ───────────────────
 *
 * Four surfaces name the same three files and say the same thing about a locked
 * one: Home's shelf (surfaces/Home.tsx), the work brain in the List
 * (components/WorkShelf.tsx), the work brain on the globe
 * (components/BrainGlobe.tsx) and — V1.9 VB-52 — the breadcrumb across the top
 * of the drawer (components/Breadcrumb.tsx). Four tables of filenames would be
 * four places to rename a file; four spellings of "Finish Context.md first"
 * would be four opinions about one lock.
 *
 * ── WHAT WAS HERE BEFORE ──────────────────────────────────────────────────
 *
 * V1.8 VB-47's `FileTypeToggle`: a strip of three segments above the list, and
 * the product's file switcher. Adam's decision of 2026-08-24 moved that job into
 * the breadcrumb — "VB-47's file toggle above the list is removed and its
 * behaviour moves into the breadcrumb; the bottom bar carries brain/list only"
 * — because the mockup's trail already names the file, and a panel with a file
 * toggle above the visual AND a view toggle below it is two toggle bars
 * sandwiching one picture.
 *
 * The STORAGE half of VB-47 is untouched and still correct: one answers key per
 * flow, `core/files/answersKey.ts`. Only the control surface moved. What stayed
 * behind is what was never about the strip — these three, which every surface
 * that names a file has always shared.
 */

/**
 * What each file is called.
 *
 * Here rather than in `core/files/slots.ts` because a slot reports an id and
 * some booleans and nothing else: every word in this panel lives in
 * `strings.ts` (CLAUDE.md).
 */
const FILE_NAME: Record<FileSlotId, string> = {
  context: S.fileContext,
  skills: S.fileSkills,
  actions: S.fileActions,
};

export function fileName(id: FileSlotId): string {
  return FILE_NAME[id];
}

/**
 * A lock, in words. Home's sentence and the breadcrumb's sentence are this one
 * function, so a file that is waiting on Context.md in the drawer is waiting on
 * it in the same words on Home.
 */
export function lockLine(lock: FileLock): string {
  return lock.kind === 'needs' ? S.lockedNeedsFirst(fileName(lock.file)) : S.lockedComingLater;
}

/**
 * The padlock. Drawn, not imported — "a dependency that just adds an icon set"
 * is named in docs/GUARDRAILS.md as a thing that looks helpful and is not.
 *
 * `aria-hidden`, like every glyph in this panel: the control's own words
 * already say "Locked", and a picture says nothing to a screen reader.
 *
 * `size` and `stroke` are both here because the same padlock is drawn at two
 * sizes and a stroke that is right at 12px is heavy at 17: Home's shelf keeps
 * the 17px / 1.7 it shipped with (V1.7 VB-36), matching the file and person
 * icons beside it, and the breadcrumb's chips take 12px / 2.
 */
export function LockGlyph({ size = 12, stroke = 2 }: { size?: number; stroke?: number }) {
  return (
    <svg
      className="filelock"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
