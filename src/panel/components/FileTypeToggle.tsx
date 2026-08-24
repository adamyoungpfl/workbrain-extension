import { useState } from 'react';
import type { FileSlotId } from '../../core/files/slots';
import { firstLocked } from '../../core/files/toggle';
import type { FileLock, FileToggleItem } from '../../core/files/toggle';
import { S } from '../strings';
import './FileTypeToggle.css';

/**
 * V1.8 VB-47 — the switch between Context, Skills and Actions.
 *
 * VB-47: "Remove the `[ ] 9 not yet` summary tag. That area above the list
 * becomes a toggle between the file types." And Adam's decision of 2026-08-24:
 * **the drawer toggle is the switcher; Home is a landing page.** V1.7's shelf
 * stays as the overview somebody passes through on the way in; this is the
 * thing they come back to when they want a different file.
 *
 * ── WHAT IT REPLACES, AND WHY BOTH OF THEM ────────────────────────────────
 *
 * Two things stood above the list and both were saying what this strip now
 * says better:
 *
 *  · **the summary tag** — `[!] 2 due  [~] 1 partly  [ ] 9 not yet`. VB-19 put
 *    it there to do the "what needs attention" job, because the rows are fixed
 *    in FILE ORDER and cannot be sorted by urgency. V1.8 VB-46 moved that job
 *    into the rows themselves: every row now carries its count, its percentage
 *    and its status bundled at its right end, and greys itself at 0 of X. The
 *    strip was the second telling. (It still stands on `FileView`, where a row
 *    has no right-hand column — see components/SectionHealth.tsx.)
 *  · **the root line** — "Ada — Context.md". It named the file. That is what
 *    the pressed segment of this toggle does, eight pixels higher up, so
 *    keeping it would print the same filename twice in a drawer whose whole
 *    peek is a hundred and thirty pixels tall.
 *
 * ── THE LOCKED FILES ──────────────────────────────────────────────────────
 *
 * "A toggle to Actions when Actions does not exist has to say what unlocks it,
 * exactly as `FileRow`'s locked variant does." So:
 *
 *  · **It is not enterable.** `chooseFile` (core/files/toggle.ts) refuses the
 *    move, and the button is `aria-disabled`.
 *  · **It says what unlocks it, in words, without a tooltip.** The sentence is
 *    `core/files/toggle.ts`'s `fileLock` — the SAME fold Home's shelf prints,
 *    not a second opinion — and it reaches a person two ways: printed under the
 *    strip, and spoken as part of the button's own accessible name.
 *  · **One line, not three.** Three sentences do not fit a 400px panel. The
 *    line belongs to the first locked file by default — the next one along,
 *    which is the one worth explaining unprompted — and swaps to whichever
 *    locked segment was last pressed. It is always there, so it is never a
 *    tooltip and never a thing you have to find.
 *
 * **NOT `aria-live`.** A locked button carries its whole sentence in its own
 * name, so a screen reader hears it on focus, before the press; announcing the
 * line as well would say the same thing twice and would put a live region in a
 * drawer that deliberately has none (tests/e2e/section-health.a11y.spec.ts).
 *
 * **NOTHING IS DISTINGUISHED BY COLOUR ALONE** (docs/GUARDRAILS.md). The
 * pressed segment carries `aria-pressed`, a filled chip, a solid bar under it
 * and a heavier label — the same four signals `.filedrawer-mode` uses two
 * inches above it. A locked one carries a padlock, the word "Locked" in its
 * name, and the printed sentence.
 */

export interface FileTypeToggleProps {
  /** One item per file, from `core/files/toggle.ts` — derived on every render,
   * never stored. */
  items: readonly FileToggleItem[];
  /** Asked for a file. Only ever called with one that can be opened; the
   * refusal itself is `chooseFile`'s, so the rule is in core rather than in
   * this handler (see the header). */
  onPick: (id: FileSlotId) => void;
}

/**
 * What each file is called.
 *
 * Here rather than in `core/files/slots.ts` because a slot reports an id and
 * some booleans and nothing else: every word in this panel lives in
 * `strings.ts` (CLAUDE.md). Exported because Home's shelf prints exactly these
 * names for exactly these ids, and two tables would be two places to rename a
 * file.
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
 * A lock, in words. The shelf's sentence and the toggle's sentence are this
 * one function, so a file that is waiting on Context.md in the drawer is
 * waiting on it in the same words on Home.
 */
export function lockLine(lock: FileLock): string {
  return lock.kind === 'needs' ? S.lockedNeedsFirst(fileName(lock.file)) : S.lockedComingLater;
}

/**
 * The padlock. Drawn, not imported — "a dependency that just adds an icon set"
 * is named in docs/GUARDRAILS.md as a thing that looks helpful and is not.
 *
 * `aria-hidden`, like every glyph in this panel: the row's own words already
 * say "Locked", and a picture says nothing to a screen reader.
 *
 * `size` and `stroke` are both here because the same padlock is drawn at two
 * sizes and a stroke that is right at 12px is heavy at 17: Home's shelf keeps
 * the 17px / 1.7 it shipped with (V1.7 VB-36), matching the file and person
 * icons beside it, and the toggle's segments take 12px / 2.
 */
export function LockGlyph({ size = 12, stroke = 2 }: { size?: number; stroke?: number }) {
  return (
    <svg
      className="filetypes-lock"
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

export function FileTypeToggle({ items, onPick }: FileTypeToggleProps) {
  /**
   * Which locked file the line under the strip is explaining, if somebody has
   * pressed one. Ephemeral, like every other fact about a glance at the panel
   * (docs/ARCHITECTURE.md) — a reopen explains the next locked file again,
   * which is where the strip starts.
   */
  const [pressed, setPressed] = useState<FileSlotId | null>(null);
  const explaining = items.find((item) => item.id === pressed && item.lock) ?? firstLocked(items);

  return (
    <div className="filetypes">
      <div className="filetypes-row" role="group" aria-label={S.fileToggleLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="filetypes-item"
            data-file={item.id}
            data-locked={item.lock ? 'true' : 'false'}
            aria-pressed={item.shown}
            // Not `disabled`: a locked file still has something to say, and a
            // disabled control is unreachable by keyboard, so its sentence
            // would be too. `aria-disabled` says the same thing to assistive
            // tech while leaving it focusable — and pressing it moves nothing,
            // because `chooseFile` refuses.
            {...(item.lock ? { 'aria-disabled': true } : {})}
            // The whole truth, spoken on focus: the file, that it is locked,
            // and what unlocks it. This is the printed line's counterpart, not
            // a substitute for it (see the header).
            {...(item.lock ? { 'aria-label': S.fileToggleLockedName(fileName(item.id), lockLine(item.lock)) } : {})}
            onClick={() => {
              if (item.lock) {
                setPressed(item.id);
                return;
              }
              onPick(item.id);
            }}
          >
            <span className="filetypes-chip">
              {item.lock && <LockGlyph />}
              <span className="filetypes-name">{fileName(item.id)}</span>
            </span>
          </button>
        ))}
      </div>
      {explaining?.lock && (
        <p className="filetypes-note">
          {S.fileToggleLockedNote(fileName(explaining.id), lockLine(explaining.lock))}
        </p>
      )}
    </div>
  );
}
