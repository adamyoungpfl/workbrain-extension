import type { FileSlotId } from './slots';
import type { BrainNav } from '../globe/workBrain';

/**
 * V1.9 VB-52 — the breadcrumb, as a rule.
 *
 * The mockup prints `workbrain > context > how I think` across the top of the
 * drawer. Adam's decision of 2026-08-24 makes that trail the product's ONE file
 * switcher: "the breadcrumb's segments become pressable ... VB-47's file toggle
 * above the list is removed and its behaviour moves into the breadcrumb; the
 * bottom bar carries brain/list only."
 *
 * ── THE TRAIL AND THE ZOOM ARE ONE NAVIGATION ─────────────────────────────
 *
 * The same decision: "the three segments map exactly onto VB-48's tiers (work
 * brain → file → section), so the breadcrumb and the work-brain zoom are one
 * navigation model and must share state: pressing a segment and zooming out in
 * Brain are the same action by two routes."
 *
 * That is why this file derives the trail FROM `BrainNav` — the one ephemeral
 * value `FileDrawer` already holds and hands to both the globe and the List
 * (core/globe/workBrain.ts) — rather than holding a trail of its own. There is
 * no second "where am I" to drift: pressing `Work brain` runs `pullBack` and
 * picking a file runs `chooseNav`, which are the very functions the globe's own
 * back button and its file nodes run. Change one route and the other has
 * already followed, because there is only one value.
 *
 * ── WHAT IS LOCKED IS STILL NOT DECIDED HERE ──────────────────────────────
 *
 * One source of truth for lockedness across Home's shelf, the breadcrumb and
 * the Brain's top tier: `core/files/slots.ts`, through `core/files/toggle.ts`.
 * The trail says which segments exist; `chooseNav` says which presses land.
 *
 * **NOTHING HERE IS STORED.** Where you are looking is a fact about a glance at
 * the panel, exactly like the drawer's height and its mode
 * (docs/ARCHITECTURE.md, "nothing derived is stored").
 *
 * **NO COPY LIVES HERE.** A crumb reports an id; `src/panel/strings.ts` owns
 * every word (CLAUDE.md).
 */

/**
 * The three rungs, by the tier each one stands on.
 *
 * `work` — the work brain, the tier above every file.
 * `file` — the file the drawer is drawing. This is the switcher: pressing it
 *          offers the files, which is where VB-47's toggle went.
 * `section` — the section being written inside that file. It is where you
 *          already are, so it is a label and never a control.
 */
export type CrumbId = 'work' | 'file' | 'section';

export interface Crumb {
  readonly id: CrumbId;
  /** The file the trail is inside, on every crumb, so the panel can name the
   * file rung without reaching past the trail for it. */
  readonly file: FileSlotId;
  /** The last rung: where you are now. Exactly one crumb carries it. */
  readonly current: boolean;
  /**
   * Whether pressing it does anything.
   *
   * `work` is pressable only from inside a file — at the work tier it is where
   * you already are, and a breadcrumb whose last rung navigates to the screen
   * you are on is a control that lies. `section` is never pressable for the
   * same reason. `file` always is: it is the switcher, and switching to the
   * file you are already looking at is how you close it again.
   */
  readonly pressable: boolean;
}

/**
 * The trail for where the drawer is looking.
 *
 * `hasSection` is whether the file has a section under way at all — a file
 * nobody has started has no third rung, and printing an empty one would put a
 * separator on the end of the trail pointing at nothing.
 *
 * At the work tier the trail is one rung, because there is nothing above the
 * work brain and no file has been chosen to be inside of. That is the same
 * shape the globe takes at that tier (its file nodes are the choice), so the
 * two views agree without either consulting the other.
 */
export function breadcrumbTrail(nav: BrainNav, hasSection: boolean): Crumb[] {
  if (nav.tier === 'work') {
    return [{ id: 'work', file: nav.file, current: true, pressable: false }];
  }
  const trail: Crumb[] = [
    { id: 'work', file: nav.file, current: false, pressable: true },
    { id: 'file', file: nav.file, current: !hasSection, pressable: true },
  ];
  if (hasSection) trail.push({ id: 'section', file: nav.file, current: true, pressable: false });
  return trail;
}

/**
 * Whether the count belongs on the trail right now.
 *
 * `2/2` counts the sections of ONE file, so it only means anything while the
 * trail is inside one. Out at the work brain the shelf carries a count per file
 * already (components/WorkShelf.tsx) and a single number beside the word "Work
 * brain" would be a count of something the person cannot see.
 */
export function crumbCountShown(nav: BrainNav): boolean {
  return nav.tier === 'file';
}
