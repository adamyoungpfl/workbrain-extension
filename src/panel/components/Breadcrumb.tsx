import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { breadcrumbTrail, crumbCountShown } from '../../core/files/breadcrumb';
import type { Crumb } from '../../core/files/breadcrumb';
import type { FileSlotId } from '../../core/files/slots';
import { chooseNav, pullBack } from '../../core/globe/workBrain';
import type { BrainNav } from '../../core/globe/workBrain';
import { firstLocked } from '../../core/files/toggle';
import type { FileToggleItem } from '../../core/files/toggle';
import { LockGlyph, fileName, lockLine } from './fileLabels';
import { S } from '../strings';
import { TypedInline } from './Typed';
import './Breadcrumb.css';

/**
 * V1.9 VB-52 — the breadcrumb, and the only file switcher in the product.
 *
 * The mockup prints `workbrain > context > how I think` across the top of the
 * lower panel with `2/2` at the right. Adam's decision of 2026-08-24 makes that
 * trail navigation rather than decoration:
 *
 *   "ONE toggle bar. The breadcrumb switches files; the bottom bar switches
 *    view. VB-47's file toggle above the list is removed and its behaviour
 *    moves into the breadcrumb ... The three segments map exactly onto VB-48's
 *    tiers (work brain → file → section), so the breadcrumb and the work-brain
 *    zoom are one navigation model and must share state."
 *
 * ── ONE STATE, TWO ROUTES ─────────────────────────────────────────────────
 *
 * This component holds NO navigation state. It is handed the `BrainNav` the
 * drawer already holds — the same value the globe is handed and the same value
 * the List is drawn from — and it reports moves back through `pullBack` and
 * `chooseNav`, which are the very functions the globe's own back button and its
 * file nodes call (core/globe/workBrain.ts).
 *
 * That is not tidiness, it is the point of the decision: two copies of "where
 * am I" would agree on the day they were written and drift on the first day
 * somebody adds a third way in. Press `Work brain` here and the globe has
 * already zoomed out, because there was never a second thing to tell.
 *
 * ── THE FILE RUNG IS THE SWITCHER ─────────────────────────────────────────
 *
 * Pressing it offers the three files in place of the rest of the trail: the
 * same three chips, the same padlock, the same sentence and the same refusal
 * VB-47's strip carried, one band higher and behind a press. A locked file is
 * NOT ENTERABLE — `chooseNav` refuses the move — and it SAYS WHAT UNLOCKS IT,
 * both in its own accessible name and in the line printed under the chips.
 * Exactly as it behaves on Home's shelf, because it is the same fold
 * (core/files/slots.ts → core/files/toggle.ts).
 *
 * **Not a menu, not an overlay.** It replaces the rungs to its right inside the
 * band it already occupies, so nothing is ever drawn over a control underneath
 * (docs/GUARDRAILS.md: no modals; and a target half covered by a floating panel
 * is what axe reports as WCAG 2.5.8). The one line it adds is the lock
 * sentence, and the drawer gives that line real room rather than borrowing it
 * from the picture (core/drawer/height.ts's `DRAWER_CRUMB_NOTE`).
 *
 * **The trigger is replaced, so focus is moved on purpose.** Opening puts focus
 * on the chip for the file you are in; closing puts it back on the rung. A
 * person's cursor is never taken by something they did not press — the rule
 * docs/GUARDRAILS.md states as "nothing steals focus" is about status changes,
 * and this is a disclosure moving focus into what the person just opened.
 *
 * ── NOTHING IS DISTINGUISHED BY COLOUR ALONE ──────────────────────────────
 *
 * The rung you are on carries `aria-current="page"` and is not a control at
 * all. The file rung carries a caret that turns when it is open, and
 * `aria-expanded` under it. The chip for the file on screen carries a fill, a
 * solid bar and a heavier label, with `aria-pressed` under all three. A locked
 * chip carries a padlock, a broken edge, the word "Locked" in its name and the
 * printed sentence.
 */

export interface BreadcrumbProps {
  /** Where both views are looking. Held by the drawer, never here. */
  nav: BrainNav;
  /** One item per file, from `fileToggle(...)` — derived every render, never
   * stored, and the same array the globe's own tier is drawn from. */
  files: readonly FileToggleItem[];
  /** The section being written, already stripped of its numeral by
   * `core/flow/sectionLabel.ts`. `null` before anything has been reached, which
   * is a trail with two rungs rather than an empty third one. */
  section: string | null;
  /** The count: sections reached, and sections there are. */
  done: number;
  total: number;
  /** Whether the file chips are showing. Held by the drawer because the band
   * gets taller while they are and the globe's stage has to know
   * (core/drawer/mode.ts's `brainStageSize`). */
  filesOpen: boolean;
  onFilesOpen: (open: boolean) => void;
  /** A move. Always the result of `pullBack` or `chooseNav`, so the rule about
   * what is enterable lives in core and not in this component. */
  onNav: (next: BrainNav) => void;
}

export function Breadcrumb({ nav, files, section, done, total, filesOpen, onFilesOpen, onNav }: BreadcrumbProps) {

  const trail = breadcrumbTrail(nav, section !== null);
  const open = filesOpen && nav.tier === 'file';
  const fileRung = useRef<HTMLButtonElement>(null);
  const chipRefs = useRef(new Map<FileSlotId, HTMLButtonElement>());

  /**
   * Which locked file the printed line is explaining, if one has been pressed.
   * Ephemeral, and the same rule VB-47's strip followed: the line is always
   * there while the chips are, explaining the NEXT locked file, and it swaps to
   * whichever locked chip was last pressed.
   */
  const [explaining, setExplaining] = useState<FileSlotId | null>(null);
  const explained = files.find((item) => item.id === explaining && item.lock) ?? firstLocked(files);

  /**
   * The focus move the disclosure owes itself, in both directions.
   *
   * A ref of what was open last render rather than an effect over `open`
   * alone, because this must not run on the first paint: the drawer mounts
   * closed, and a component that focused something on mount would take the
   * cursor off the question the moment the panel opened.
   */
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current === open) return;
    wasOpen.current = open;
    if (open) chipRefs.current.get(nav.file)?.focus();
    else fileRung.current?.focus();
    // `nav.file` is read, never watched: this reacts to the disclosure opening
    // and closing and to nothing else — the same discipline BrainGlobe's own
    // tier effect follows, and for the same reason.
  }, [open, nav.file]);

  /** Escape closes the chips without choosing — the standard way out of a
   * disclosure, and the only one that does not require a mouse. */
  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    onFilesOpen(false);
  }

  function press(crumb: Crumb) {
    if (crumb.id === 'work') {
      onFilesOpen(false);
      onNav(pullBack(nav));
      return;
    }
    onFilesOpen(!open);
  }

  /**
   * Choosing a file. The refusal is core's — `chooseNav` returns the nav it was
   * given when a file is locked or unknown — so a locked chip cannot be entered
   * here for a different reason than it cannot be entered on the globe.
   *
   * A refused press keeps the chips open and swaps the printed line to that
   * file, which is what somebody pressing a padlock is asking about.
   */
  function pick(item: FileToggleItem) {
    if (item.lock) {
      setExplaining(item.id);
      return;
    }
    onFilesOpen(false);
    onNav(chooseNav(nav, item.id, files));
  }

  return (
    <nav className="crumbs" aria-label={S.crumbsLabel} data-open={open ? 'true' : 'false'} onKeyDown={onKeyDown}>
      <div className="crumbs-row">
        <ol className="crumbs-trail">
          {trail.map((crumb) => {
            if (crumb.id === 'file' && open) {
              return (
                <li className="crumbs-item is-files" key="files">
                  <div className="crumbs-files" role="group" aria-label={S.fileToggleLabel}>
                    {files.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        ref={(element) => {
                          if (element) chipRefs.current.set(item.id, element);
                          else chipRefs.current.delete(item.id);
                        }}
                        className="crumbs-file"
                        data-file={item.id}
                        data-locked={item.lock ? 'true' : 'false'}
                        aria-pressed={item.shown}
                        // Not `disabled`: a locked file still has something to
                        // say, and a disabled control is unreachable by
                        // keyboard, so its sentence would be too. `aria-disabled`
                        // says the same thing to assistive tech while leaving it
                        // focusable — and pressing it moves nothing, because
                        // `chooseNav` refuses.
                        {...(item.lock ? { 'aria-disabled': true } : {})}
                        {...(item.lock
                          ? { 'aria-label': S.fileToggleLockedName(fileName(item.id), lockLine(item.lock)) }
                          : {})}
                        // THE DISCLOSURE MOVES WITH THE TRIGGER. Opening the
                        // files replaces the rung that opened them, so the chip
                        // for the file you are in becomes the control that
                        // closes them again — and carries the state, in the
                        // attribute and in the caret. A disclosure whose
                        // `aria-expanded="true"` is on an element that no longer
                        // exists is a state nobody can observe.
                        {...(item.shown ? { 'aria-expanded': true } : {})}
                        onClick={() => pick(item)}
                      >
                        <span className="crumbs-chip">
                          {item.lock && <LockGlyph />}
                          <span className="crumbs-name">{fileName(item.id)}</span>
                          {item.shown && <Caret />}
                        </span>
                      </button>
                    ))}
                  </div>
                </li>
              );
            }
            if (crumb.id === 'section' && open) return null;
            return (
              <li className="crumbs-item" key={crumb.id}>
                {crumb.pressable ? (
                  <button
                    type="button"
                    ref={crumb.id === 'file' ? fileRung : undefined}
                    className="crumbs-seg"
                    data-seg={crumb.id}
                    {...(crumb.id === 'file' ? { 'aria-expanded': open, 'data-file': crumb.file } : {})}
                    {...(crumb.current ? { 'aria-current': 'page' as const } : {})}
                    onClick={() => press(crumb)}
                  >
                    <span className="crumbs-label">
                      {crumb.id === 'work' ? S.crumbWork : fileName(crumb.file)}
                    </span>
                    {crumb.id === 'file' && <Caret />}
                  </button>
                ) : (
                  <span className="crumbs-seg is-here" data-seg={crumb.id} aria-current="page">
                    <span className="crumbs-label">
                      {/* V2.3 VB-92 — the current-location crumb types in like the questions
                          do: the change-triggered variant, printing on arrival, never on a
                          re-render. */}
                      {crumb.id === 'work' ? S.crumbWork : crumb.id === 'file' ? fileName(crumb.file) : <TypedInline text={section ?? ''} />}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        {crumbCountShown(nav) && !open && (
          <p className="crumbs-count">
            {/* Printed short, heard whole. The mockup's `2/2` is orientation at
                a glance; "3 of 10 sections" is the same fact in the words the
                rest of the product already uses (`S.sectionsOf`, which Home and
                the work shelf print). Neither audience gets the other's
                version, and no information is only in the picture.

                It stands down while the chips are open, and that is not a
                shortage of pixels dressed up as a decision: the count describes
                the file you are IN, and for as long as the trail is offering
                the files it is not describing anywhere at all. Three chips, the
                rung that opened them and a number about one of them do not fit
                a 400px panel, and the number is the part that has stopped being
                true. */}
            <span aria-hidden="true">{S.crumbCount(done, total)}</span>
            <span className="crumbs-sr">{S.sectionsOf(done, total)}</span>
          </p>
        )}
      </div>
      {open && explained?.lock && (
        <p className="crumbs-note">{S.fileToggleLockedNote(fileName(explained.id), lockLine(explained.lock))}</p>
      )}
    </nav>
  );
}

/**
 * The caret on the file rung: down when the files are hidden, up when they are
 * showing. A SHAPE, because `aria-expanded` is invisible and a colour change
 * would be a state told by colour alone (docs/GUARDRAILS.md).
 *
 * Drawn rather than imported, like every other glyph in this panel.
 */
function Caret() {
  return (
    <svg className="crumbs-caret" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

