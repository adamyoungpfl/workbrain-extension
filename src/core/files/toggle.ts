import { shownFileSlots } from './slots';
import type { FileSlot, FileSlotId } from './slots';

/**
 * V1.8 VB-47 — the file-type toggle, as a rule.
 *
 * VB-47 takes the `[ ] 9 not yet` summary tag off the top of the drawer's list
 * and puts a switch between Context, Skills and Actions in its place. Adam's
 * decision of 2026-08-24 settles which of the product's two file switchers is
 * canonical: **the drawer toggle is the switcher; Home is a landing page.**
 * V1.7's shelf stays as the overview somebody passes through, and this is the
 * thing they come back to in order to change file.
 *
 * ── WHY THIS IS IN core/ ──────────────────────────────────────────────────
 *
 * Because both surfaces have to say the same thing about a locked file, and
 * "the same thing" is a derivation with a real edge case in it — the moment
 * the file before it is finished, the sentence has to change (see
 * `FileSlot.afterFinished`). Home was folding that itself, inline, in
 * `Home.tsx`; the drawer folding it a second time is exactly how two surfaces
 * start disagreeing. So the fold lives here, once, and both surfaces print it.
 *
 * **NOTHING HERE IS STORED.** Every value is recomputed from the answers on
 * every render, exactly like `fileSlots` it is built on (docs/ARCHITECTURE.md,
 * "nothing derived is stored"). There is no "which file am I looking at" key
 * and there must never be one: which file is on screen is a fact about a glance
 * at the panel, and the panel opens on the file the shelf sent you to.
 *
 * **NO COPY LIVES HERE.** A lock reports its kind and, where it has one, the
 * file it is waiting on. `src/panel/strings.ts` owns every word (CLAUDE.md).
 */

/**
 * Why a file cannot be opened.
 *
 * `needs` — the file before it is not finished, and finishing it is the thing
 * that moves this on. Carries which file, so the sentence can name it.
 * `later` — everything before it is done and this one is simply not built yet.
 *
 * The pair is `FileRow`'s locked variant exactly (V1.7 VB-36): a locked row
 * says WHAT UNLOCKS IT, in the row, and swaps to the second sentence the
 * moment the first stops being true.
 */
export type FileLock = { kind: 'needs'; file: FileSlotId } | { kind: 'later' };

/**
 * The lock on one slot, or `null` when the file is open.
 *
 * Pulled out of `Home.tsx`, where it was an inline condition, so the drawer's
 * toggle prints the same sentence as the shelf rather than a second opinion
 * about the same file.
 */
export function fileLock(slot: FileSlot): FileLock | null {
  if (slot.state === 'open') return null;
  if (slot.after && !slot.afterFinished) return { kind: 'needs', file: slot.after };
  return { kind: 'later' };
}

export interface FileToggleItem {
  id: FileSlotId;
  /** The file on screen right now. Exactly one item is `true`. */
  shown: boolean;
  /** `null` for a file that can be opened; otherwise what unlocks it. */
  lock: FileLock | null;
}

/**
 * The toggle: one item per file, in the order the work brain builds them.
 *
 * `finished` is keyed by file id and an absent key reads as "not finished" —
 * `fileSlots`' own contract, so a caller only answers for the files it can
 * really measure.
 */
export function fileToggle(
  shown: FileSlotId,
  finished: Readonly<Partial<Record<FileSlotId, boolean>>>,
): FileToggleItem[] {
  // V2.9 VB-146: the toggle shows what the interface shows — the trail,
  // the drawer's switcher and the work tier all derive from here, so the
  // beta's hidden slot disappears from every one of them in this one line.
  return shownFileSlots(finished).map((slot) => ({
    id: slot.id,
    shown: slot.id === shown,
    lock: fileLock(slot),
  }));
}

/**
 * What pressing an item does.
 *
 * A LOCKED FILE IS NOT ENTERABLE. Pressing one changes nothing about which
 * file is on screen — VB-47: "a toggle to Actions when Actions does not exist
 * has to say what unlocks it, exactly as `FileRow`'s locked variant does". The
 * panel prints that sentence; this is the half that refuses the move, and it
 * lives here so the refusal cannot be implemented differently by the next
 * surface that grows a switcher.
 *
 * An id that is not on the toggle at all is likewise no move — the same silent
 * degradation `handleNavigate` makes for a question id the flow no longer has
 * (docs/GUARDRAILS.md).
 */
export function chooseFile(
  current: FileSlotId,
  wanted: FileSlotId,
  items: readonly FileToggleItem[],
): FileSlotId {
  const item = items.find((entry) => entry.id === wanted);
  if (!item || item.lock) return current;
  return wanted;
}

/**
 * The lock the toggle explains by default: the first locked file on it.
 *
 * The strip carries one line under the buttons rather than a sentence per
 * button — three sentences do not fit a 400px panel, and a line that only
 * appears once something is pressed is a tooltip with extra steps, which VB-47
 * rules out in as many words. So the line is always there, and what it says
 * before anybody touches anything is the truth about the NEXT file: the one
 * that is coming, and what brings it.
 *
 * `null` when nothing is locked, in which case there is no line to draw.
 */
export function firstLocked(items: readonly FileToggleItem[]): FileToggleItem | null {
  return items.find((item) => item.lock !== null) ?? null;
}
