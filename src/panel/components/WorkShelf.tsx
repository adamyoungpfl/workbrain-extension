import type { FileSlotId } from '../../core/files/slots';
import type { FileToggleItem } from '../../core/files/toggle';
import { LockGlyph, fileName, lockLine } from './fileLabels';
import { S } from '../strings';
import './WorkShelf.css';

/**
 * V1.8 VB-48 — THE WORK BRAIN, IN THE LIST.
 *
 * VB-48 asks for "shared navigation state with List, so switching file or zoom
 * level in one view is reflected in the other". A tier that only existed in the
 * Brain would not be shared navigation, it would be a second navigation that
 * one of the two views cannot see. So the List has both tiers too:
 *
 *  · at the **work** tier it is this — one row per file, which is the same
 *    three nodes the globe draws, in the shape a list draws them;
 *  · at the **file** tier it is the outline tree it has always been, with the
 *    breadcrumb above the drawer's whole content area as the way up (V1.9
 *    VB-52; it used to be a button of this component's own).
 *
 * Pressing a row here and pressing a node there run the same `chooseNav`
 * (core/globe/workBrain.ts) against the same state, so the two views cannot end
 * up looking at different files or at different levels.
 *
 * ── WHY NOT `FileRow` ─────────────────────────────────────────────────────
 *
 * Home's shelf row is the obvious candidate and is deliberately not used, for
 * one reason: its locked variant is `disabled`, which takes it out of the tab
 * order — so the sentence saying what unlocks the file is unreachable by
 * keyboard. VB-47 settled that for the drawer (`aria-disabled`, focusable,
 * refuses the move), the globe's file nodes follow it, and this follows it too.
 * Three surfaces, one behaviour. Everything else here — the names, the lock
 * sentences, what counts as locked — IS shared, and comes from the same
 * `core/files/toggle.ts` fold all three read.
 */

export interface WorkShelfProps {
  /** One item per file, from `fileToggle(...)`. Derived every render, never
   * stored. */
  items: readonly FileToggleItem[];
  /**
   * What a file has in it, in one line, keyed by file — the drawer's own
   * `X of Y sections`. Absent for a file with nothing to count, which is every
   * locked one: those print what unlocks them instead.
   */
  note: Readonly<Partial<Record<FileSlotId, string>>>;
  /** Asked to open a file. A locked one never reaches this — `chooseNav`
   * refuses it upstream — but the row also says so before it is pressed. */
  onOpen: (id: FileSlotId) => void;
}

export function WorkShelf({ items, note, onOpen }: WorkShelfProps) {
  return (
    <ul className="workshelf" aria-label={S.workBrainStage}>
      {items.map((item) => {
        const locked = item.lock;
        return (
          <li className="workshelf-item" key={item.id}>
            <button
              type="button"
              className="workshelf-row"
              data-file={item.id}
              data-locked={locked ? 'true' : 'false'}
              // Focusable and refusing, never `disabled` — see the header.
              {...(locked ? { 'aria-disabled': true } : {})}
              {...(locked ? { 'aria-label': S.fileToggleLockedName(fileName(item.id), lockLine(locked)) } : {})}
              onClick={() => {
                if (locked) return;
                onOpen(item.id);
              }}
            >
              <span className="workshelf-icon" aria-hidden="true">
                {locked ? <LockGlyph size={17} stroke={1.7} /> : FILE_GLYPH}
              </span>
              <span className="workshelf-text">
                <span className="workshelf-name">{fileName(item.id)}</span>
                <span className="workshelf-note">{locked ? lockLine(locked) : (note[item.id] ?? '')}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * V1.9 VB-52: `WorkBrainBack` was here — the List's own way back to the work
 * brain, a 44px arrow above the tree. The breadcrumb replaced it, and replaced
 * it for both views at once: the trail's first rung runs the same `pullBack`
 * this button ran, from above the scroll box, where it cannot slide under
 * anything (components/Breadcrumb.tsx).
 */

/** The file glyph, drawn — the same page-with-a-fold Home's shelf uses. An icon
 * set is a dependency, and docs/GUARDRAILS.md names that as a thing that looks
 * helpful and is not. */
const FILE_GLYPH = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M6 2.5h8l4 4v15H6z" />
    <path d="M14 2.5v4h4" />
  </svg>
);
