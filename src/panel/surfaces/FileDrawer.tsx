import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { BrainGlobe, BrandMark, FileTree } from '../components';
import { sectionNodeGradient } from '../components/BrainGlobe';
import { Breadcrumb } from '../components/Breadcrumb';
import { fileName } from '../components/fileLabels';
import { WorkShelf } from '../components/WorkShelf';
import { BRAIN_NAV_HOME, chooseNav } from '../../core/globe/workBrain';
import type { BrainNav } from '../../core/globe/workBrain';
import { contextFileDate, generateContextFileParts } from '../../core/files/generate';
import { CONTEXT_FILE_COPY } from '../../core/files/source';
import type { FileCopy } from '../../core/files/source';
import type { ContextFileSection } from '../../core/files/generate';
import { fileAsked } from '../../core/files/slots';
import type { FileSlotId } from '../../core/files/slots';
import { fileToggle } from '../../core/files/toggle';
import {
  DRAWER_CLOSED_HEIGHT,
  DRAWER_CRUMB_HEIGHT,
  DRAWER_CRUMB_NOTE,
  DRAWER_HANDLE_BAND,
  DRAWER_HANDLE_OVERHANG,
  DRAWER_VIEW_BAR_HEIGHT,
  clampDrawerHeight,
  drawerBounds,
  drawerHeightForKey,
  drawerHeightFromDrag,
  drawerOpenPercent,
  drawerShowsStatus,
  restingDrawerHeight,
  shouldCloseOnRelease,
} from '../../core/drawer/height';
import type { DrawerBounds, DrawerSettle } from '../../core/drawer/height';
import {
  MORPH_FADE_OUT_MS,
  MORPH_LAND_MS,
  MORPH_MS,
  brainDriftAllowed,
  brainFitsIn,
  brainStageFits,
  brainStageSize,
  heightForMode,
  morphPoints,
  morphTransform,
  nextBrainYield,
} from '../../core/drawer/mode';
import type { DrawerMode, MorphPoint } from '../../core/drawer/mode';
import {
  currentQuestionIdFor,
  currentSectionId as sectionIdFor,
  listNodeIds,
  navigationTargetFor,
  outlineNodeState,
  positionForQuestionId,
} from '../../core/flow/outline';
import { splitSectionLabel } from '../../core/flow/sectionLabel';
import { nodeDetailsByNode } from '../../core/flow/nodeDetails';
import { nodeSummaries } from '../../core/flow/nodeSummary';
import { sectionHealthMap } from '../../core/freshness/sectionHealth';
import { sectionLife } from '../../core/freshness/sectionLife';
import type { SectionLife } from '../../core/freshness/sectionLife';
import { recommend, recommendationsByNode } from '../../core/recommend/engine';
import { NO_DISMISSALS, readDismissals } from '../../core/recommend/dismissals';
import { getLocal } from '../../core/storage/client';
import type { Dismissals } from '../../schema/storage.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import type { Position } from '../../core/flow/runner';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { prefersReducedMotion } from '../cues/verbs';
import { S } from '../strings';
import './FileDrawer.css';

/**
 * V1.1 VB-07 + VB-07b — the file drawer.
 *
 * Two views of the same thing, stacked: the outline tree filling in as the
 * interview goes (components/FileTree.tsx), and the real Context.md text
 * assembling underneath it.
 *
 * **Why a drawer and not the ported layout.** In the sibling app the tree is a
 * 360px right-hand grid column, and its own responsive rule stacks it *below*
 * the question. In a 400px side panel that means it scrolls off screen while
 * you answer — the exact thing this feature exists to prevent. So the layout,
 * and only the layout, is re-authored: docked to the bottom of the panel,
 * always at least partly visible, collapsed to a peek by default.
 *
 * **Not a `Sheet`.** docs/design-system.html scopes Sheet to "a short,
 * self-contained task" and calls it "the only overlay in the system"; it
 * covers the panel. This is persistent and non-blocking. It never traps focus,
 * never takes focus, and never covers the question — the flow surface reserves
 * exactly the drawer's height beneath itself (see Flow.css's `.flowshell`), so
 * the question and its controls stay reachable with the drawer open.
 *
 * **Its height is ephemeral.** Session state owned by `Flow`, never persisted
 * — the same rule `Flow`'s `history` and `declinedBlocks` follow.
 *
 * ── V1.2 VB-12 — the drag ─────────────────────────────────────────────────
 *
 * The drawer stopped being collapsed-or-expanded and became continuously
 * resizable, between a peek it may never go below and a ceiling that never
 * covers the question. The arithmetic for all of that is core/drawer/height.ts
 * and is unit-tested without a browser; what is left here is the two DOM
 * numbers it needs (the viewport's height, the pointer's y) and the rendering.
 *
 * **Only the handle resizes.** Not the drawer, not the body — the handle, and
 * nothing else. VB-14 puts a globe inside this drawer that wants vertical drag
 * of its own to turn, and the agreed resolution is that the grip owns vertical
 * resize while the content area owns its own gestures. A resize listener on
 * the drawer would take that gesture away from anything ever placed inside it.
 *
 * **The handle is a real control, not a decorated rule.** `role="separator"`
 * with a tabindex is the WAI-ARIA window splitter: arrows nudge it, Page
 * Up/Down move further, Home and End go to the ends, Enter collapses it to the
 * peek and restores it. A drag-only control would fail the keyboard-path
 * guardrail (docs/GUARDRAILS.md) outright.
 *
 * ── V1.2 VB-14b — two modes in one drawer ─────────────────────────────────
 *
 * docs/V1.2-REFINEMENT.md's "Iteration three": **Brain** — the globe on its
 * deep-field dark stage, the mode someone shows a colleague — and **List** —
 * the navigable tree this drawer has always had, inside the light design
 * system. The arithmetic behind all of it is core/drawer/mode.ts.
 *
 * Five decisions worth knowing about, because none of them is obvious from
 * the markup:
 *
 * 1. **List is what the drawer opens on.** Brain is chosen, never defaulted
 *    into. The peek is 186px tall and a globe drawn into 122px of it is the
 *    unusable thing VB-14's own height note is about, so defaulting to Brain
 *    would mean the first thing everybody sees is the version of it that does
 *    not work. It is also the mode that answers "what's left" honestly.
 *
 * 2. **Both modes are mounted at all times; only one is visible.** The hidden
 *    one is `visibility: hidden`, which keeps its layout — so it is measurable
 *    — while taking it out of the tab order and out of the accessibility tree.
 *    The morph below needs both ends of every flight measured from the real
 *    DOM, and a `display: none` layer has no geometry to measure.
 *
 * 3. **The mode on screen is derived, never stored.** What is held is the
 *    *request*; `shownDrawerMode` turns that plus one bit — has the stage run
 *    out of room? — into what shows. Drag the drawer short and Brain hands over
 *    to List; drag back up and Brain returns. See core/drawer/mode.ts for why
 *    holding the request rather than the result is what makes that reversible.
 *
 *    **V2.0 VB-70 pins the boundary to the picture and stops it thrashing.**
 *    The threshold is no longer a height compared against a constant: it is
 *    `brainStageFits`, asked from the same two measurements the globe's own
 *    size is computed from, so "too short for Brain" means "the stage can no
 *    longer paint the globe it is being handed" and cannot drift from it. The
 *    way back has a `BRAIN_YIELD_BAND` of hysteresis on it, so a pointer parked
 *    on the boundary settles rather than restarting a 520ms morph every frame.
 *    Going OUT of Brain is unconditional; coming back happens only for a drawer
 *    that was in Brain when the room ran out. Nobody who pressed `List` is ever
 *    put back into Brain by making the drawer taller.
 *
 * 4. **Navigation is identical in both modes.** A lit node in Brain resolves
 *    through the same `navigationTargetFor` → `positionForQuestionId` →
 *    `onNavigate` seam a written row in List does, with the same rule: only a
 *    written or in-progress section is a jump, because jumping into an
 *    unreached one would skip questions the flow otherwise guarantees.
 *
 * 5. **The thin bar and the module label stay above the drawer in both.**
 *    VB-14's open item 2: Brain answers "what's left" worse than a list does,
 *    and those two are the mitigation. They live in `Flow`, above this
 *    component, and nothing here may push them off the screen — the drawer's
 *    own ceiling (core/drawer/height.ts) is what guarantees it.
 *
 * ── V1.9 VB-51 + VB-52 — three bands, and one of each kind of switch ──────
 *
 * The mockup makes the lower panel an app: a handle at the top, a breadcrumb
 * under it, the visual filling the middle, and a bar along the bottom carrying
 * brain / list as two icons. Adam's decision of 2026-08-24 settles what those
 * two rows are FOR, because V1.8 had left the panel with two toggle bars
 * sandwiching one picture:
 *
 *   **ONE toggle bar. The breadcrumb switches files; the bottom bar switches
 *   view.** VB-47's file toggle above the list is removed and its behaviour
 *   moves into the breadcrumb, whose three rungs are VB-48's three tiers.
 *
 * So this component gained two bands and lost one strip:
 *
 *  · `components/Breadcrumb.tsx` sits under the handle. It is handed the SAME
 *    `nav` the globe is handed, so pressing `Work brain` on the trail and
 *    zooming out on the stage are one action by two routes — there is no second
 *    piece of state for them to disagree through.
 *  · the mode pair moved out of the head band and down into `.filedrawer-viewbar`
 *    along the bottom. Same two buttons, same names, same three signals; one
 *    band lower.
 *  · the sticky `.filedrawer-nav` row inside the list — VB-47's file strip and
 *    VB-48's way back up — is gone. The trail does both jobs for both views, and
 *    doing them above the scroll box is what stops the control sliding under
 *    itself as the drawer scrolls (the WCAG 2.5.8 problem that row was built to
 *    dodge in the first place).
 *
 * **The two bands are charged for honestly.** They are 44px each because
 * everything in them is a control, and core/drawer/height.ts adds both to
 * `DRAWER_CHROME_HEIGHT` — which the drawer's floor, its resting height, the
 * height Brain hands over at and the globe's own stage size are all derived
 * from. The peek still shows three rows of file; the drawer is taller by
 * exactly the furniture the mockup adds, rather than the file being quietly
 * shorter to pay for it.
 */

export interface FileDrawerProps {
  outline: FileOutlineNode[];
  modules: Module[];
  answers: Answers;
  position: Position;
  /** V2.2 — which file this drawer is showing, and that file's own copy for
   * the live preview. Defaulted to Context, which is what every pre-V2.2
   * caller meant; the Skills flow passes its own pair. One seam, so the
   * preview, the trail and the work-tier toggle all agree on which file this
   * is. */
  file?: FileSlotId | undefined;
  fileCopy?: FileCopy | undefined;
  /** V2.3 VB-99 — the closed notch. Owned by Flow (beside the height, for the
   * same reserve reasons); this component reports crossings through
   * `onClosed` and renders the closed face while it is true. */
  closed?: boolean | undefined;
  onClosed?: ((closed: boolean) => void) | undefined;
  /**
   * V1.2 VB-12. How tall the drawer is, in px — owned by `Flow` because the
   * flow surface reserves exactly this much space beneath itself, and
   * ephemeral there for the same reason everything else about a glance at the
   * panel is (docs/ARCHITECTURE.md: nothing derived is stored). It arrives
   * here already a number; this component clamps it to what the current
   * viewport can hold and hands changes back.
   */
  height: number;
  /**
   * The drawer's new height, and — V2.0 VB-70 — whether that height still
   * leaves the stage room to paint the globe.
   *
   * Both, in one call, because they are one event. `Flow` folds the second
   * together with the mode that was requested to get the mode on screen, and a
   * height that arrived a render before its verdict would give the panel one
   * frame of the wrong mode — which, this being a morph, is half a second of
   * flying nodes.
   *
   * The verdict is computed here rather than there for one reason: it is a
   * question about the *stage*, and the stage's two measurements — the drawer's
   * height and the panel's width — are only both known in this component.
   */
  onResize: (height: number, brainYielded: boolean) => void;
  /**
   * V2.0 VB-70. Whether Brain has already handed the drawer over to List
   * because the stage ran out of room. Handed down so the fold that decides
   * whether it comes back (`nextBrainYield`) can see which side of the
   * boundary it is starting from — that memory is the whole of the hysteresis,
   * and without it a pointer resting on the threshold flips the mode every
   * frame.
   */
  brainYielded: boolean;
  /**
   * V1.4 VB-22. Which mode is on screen — derived by `Flow` from the mode
   * requested and the height, because the docked bar above this drawer now
   * wears the same stage colour and the two must not be able to disagree.
   * This component asks for a change and renders what it is told, exactly as
   * it already does with its height.
   */
  mode: DrawerMode;
  onRequestMode: (mode: DrawerMode) => void;
  /** V2.4 VB-112 — the door to the Home PAGE, handed to the trail's root
   * rung and the globe's drawn house alike, so "all the way out" is one
   * answer on this screen. */
  onHome?: (() => void) | undefined;
  /** Navigating from a written row — resolved to a real `Position` here and
   * handed to `Flow`, which already knows how to view an arbitrary position
   * (its `viewing` state, built at R1-12 for Home's deep-link). */
  onNavigate: (position: Position) => void;
}

const BODY_ID = 'filedrawer-body';
const HEADING_ID = 'filedrawer-heading';

/** The viewport, or a sensible panel height when there is no window at all
 * (a unit test rendering this outside a browser). */
function viewportHeight(): number {
  return typeof window === 'undefined' ? 700 : window.innerHeight;
}

function viewportWidth(): number {
  return typeof window === 'undefined' ? 400 : window.innerWidth;
}

/**
 * A morph in flight.
 *
 * `phase` is the whole trick. `start` renders every node at the end it is
 * leaving; `run` renders it at the end it is arriving at, and the CSS
 * transition between the two renders is the flight. Interrupting a morph goes
 * straight to `run` with the new targets, so the browser interpolates from
 * wherever each node has got to rather than snapping it back to an end it left
 * two hundred milliseconds ago.
 *
 * V1.6 VB-32 adds `land`: the flight is over and every node is sitting on the
 * mark it became, so the layer hands over to the real thing underneath across
 * `MORPH_LAND_MS`. Nothing moves in that phase — see core/drawer/mode.ts on
 * why the hand-off is a phase rather than a fade hung off the flight.
 */
interface Morph {
  readonly to: DrawerMode;
  readonly points: readonly MorphPoint[];
  readonly phase: 'start' | 'run' | 'land';
}

/** A box, or nothing — the shape core/drawer/mode.ts's `morphPoints` expects
 * for one end of one flight. */
function boxOf(element: Element | null): DOMRect | null {
  return element ? element.getBoundingClientRect() : null;
}

export function FileDrawer({
  outline,
  modules,
  answers,
  position,
  height,
  onResize,
  brainYielded,
  onNavigate,
  mode,
  onRequestMode,
  onHome,
  file = 'context',
  fileCopy = CONTEXT_FILE_COPY,
  closed = false,
  onClosed,
}: FileDrawerProps) {
  const rootRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const morphRef = useRef<HTMLDivElement>(null);

  /**
   * How tall the drawer is allowed to be right now. Derived from the viewport,
   * kept in state only so a panel the person resizes gets honest bounds — the
   * derivation itself is core/drawer/height.ts's and is never stored.
   */
  const [bounds, setBounds] = useState<DrawerBounds>(() => drawerBounds(viewportHeight()));
  /** The panel's width, for the globe's square stage. Same story as `bounds`:
   * read from the window, kept in state only so a resize is honest. */
  const [panelWidth, setPanelWidth] = useState<number>(viewportWidth);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    // Keeps the same object when the numbers have not moved. A resize fires a
    // stream of events, and a fresh object each time would re-render the whole
    // drawer — and re-run the clamp below — on every one of them.
    const onWindowResize = () => {
      setBounds((prev) => {
        const next = drawerBounds(window.innerHeight);
        return prev.min === next.min && prev.max === next.max ? prev : next;
      });
      setPanelWidth(window.innerWidth);
    };
    onWindowResize();
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  /**
   * Whether the last height change should animate, and how far it has to
   * travel. A pointer drag is `none`: a drag that does not track the pointer
   * exactly is broken, not animated (VB-12). Arrow keys `nudge` at 200ms and
   * the ends jump at 320ms — docs/design-system.html §06's default and its
   * drawer value, since one is a 16px nudge and the other is the whole drawer
   * moving. Reduced motion drops both to instant; FileDrawer.css.
   */
  const [settle, setSettle] = useState<DrawerSettle | 'none'>('none');
  const [dragging, setDragging] = useState(false);

  /* V1.2 VB-14b's requested-vs-shown mode moved up to `Flow` at V1.4 VB-22 —
     see the `mode` prop. The rule is unchanged: what is held is the request,
     what is rendered is `modeForHeight(request, height)`, so the drawer
     getting shorter hands Brain over to List and getting taller hands it back,
     and neither is ever stored. */
  const brainOffered = brainFitsIn(bounds);

  const [morph, setMorph] = useState<Morph | null>(null);
  /** Whether a morph is live right now. A ref rather than derived from
   * `morph`, because the effect that starts one has to know whether it is
   * interrupting a flight *before* it decides which phase to start in. */
  const morphingRef = useRef(false);

  /** The height Enter restores to — the last one this session that was not the
   * peek. A ref, not state: it changes nothing on screen until Enter is
   * pressed, so it must not cause a render. */
  const restoreRef = useRef(restingDrawerHeight(bounds));

  /** Live drag: the pointer that started it, where it started, and how tall
   * the drawer was then. Everything is measured from the start of the gesture
   * rather than accumulated, so the grip cannot drift away from the pointer. */
  const dragRef = useRef<{ id: number; startY: number; startHeight: number } | null>(null);

  /**
   * Every height change the drawer makes goes through here — the drag, the
   * arrow keys, choosing a mode, and the clamp below.
   *
   * V2.0 VB-70 puts the stage's verdict in the same call. `nextBrainYield` is
   * asked whether this height still leaves room for the globe, from the same
   * two measurements `brainStageSize` is given a few lines down, and the answer
   * travels up with the height rather than behind it — see the `onResize` prop.
   * The crumb note is deliberately not in the sum; core/drawer/mode.ts's
   * `brainStageFits` says why.
   */
  const applyHeight = useCallback(
    (next: number, how: DrawerSettle | 'none') => {
      if (next > bounds.min) restoreRef.current = next;
      setSettle(how);
      const yielded = nextBrainYield(brainYielded, next, panelWidth, 0, bounds.max);
      if (next !== height || yielded !== brainYielded) onResize(next, yielded);
    },
    [bounds.max, bounds.min, brainYielded, height, onResize, panelWidth],
  );

  // A panel that got shorter must not leave the drawer covering the question.
  // Not a reset-in-an-effect of derived state — it is a real reaction to the
  // window changing size, and it is a no-op in every other render.
  useEffect(() => {
    const clamped = clampDrawerHeight(height, bounds);
    if (clamped !== height) onResize(clamped, nextBrainYield(brainYielded, clamped, panelWidth, 0, bounds.max));
  }, [bounds, brainYielded, height, onResize, panelWidth]);

  /**
   * V2.0 VB-70 — the same verdict, for the inputs a height change does not
   * carry: the panel getting narrower, and the drawer's first render.
   *
   * An effect rather than a fold, because these are readings of the window and
   * nothing here asked for them. One render late, which is invisible: neither
   * happens during a drag, and the mount case is a drawer that opens on List
   * anyway. Every path that a hand is holding goes through `applyHeight` above
   * and is settled in the same batch as the height it came from.
   */
  useEffect(() => {
    const yielded = nextBrainYield(brainYielded, height, panelWidth, 0, bounds.max);
    if (yielded !== brainYielded) onResize(height, yielded);
  }, [bounds.max, brainYielded, height, onResize, panelWidth]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    dragRef.current = { id: event.pointerId, startY: event.clientY, startHeight: height };
    // Captured from the very first event, unlike BrainGlobe's own drag: this
    // control has no click behaviour to protect, and capturing is what keeps
    // the drag alive when the pointer leaves a 400px-wide panel — which, on a
    // gesture this vertical, it does constantly.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    setSettle('none');
    // Stops the press selecting the text around it, and takes focus
    // deliberately rather than as a side effect — after a drag, the arrow keys
    // carry straight on from where the pointer left off.
    event.preventDefault();
    handleRef.current?.focus();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.id) return;
    applyHeight(drawerHeightFromDrag(drag.startHeight, drag.startY, event.clientY, bounds), 'none');
  }

  /** V2.3 VB-99 — a drag's pointerup synthesizes a click on the same handle,
   * and the click-to-reopen handler below would undo a closing drag in the
   * same breath (observed: the drawer closed and reopened between two frames,
   * reading as "never closed"). One flag, set on every real drag end, spent
   * by the next click. */
  const suppressClickRef = useRef(false);

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const drag = dragRef.current;
    dragRef.current = null;
    // Armed for the click this pointerup MAY synthesize (it does when the
    // release lands back on the handle; a pull far past the floor releases
    // elsewhere and synthesizes nothing). Disarmed by the next pointerdown —
    // a task-boundary timer was tried first and background-page throttling
    // held it armed for a full second, eating the person's real click.
    suppressClickRef.current = true;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
    // V2.3 VB-99 — intent read at RELEASE, from the unclamped target: a pull
    // DRAWER_CLOSE_PULL past the floor means close; easing to the floor does
    // not (core/drawer/height.ts's contract, tested there). Closing parks the
    // height at the floor so reopening lands on the minimum, which is Adam's
    // own spec for the grabber.
    if (!closed && shouldCloseOnRelease(drag.startHeight, drag.startY, event.clientY, bounds)) {
      applyHeight(bounds.min, 'none');
      onClosed?.(true);
    }
  }

  function onHandleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const change = drawerHeightForKey(event.key, height, bounds, restoreRef.current, closed);
    if (!change) return;
    event.preventDefault();
    // V2.3 VB-99 — the boundary crossings ride the same change object.
    if (change.close) onClosed?.(true);
    if (change.open) onClosed?.(false);
    applyHeight(change.height, change.settle);
  }

  /**
   * Choosing a mode. VB-14: "Asking for Brain expands the drawer to fit it.
   * The two are linked, not independent."
   *
   * The height change rides the same `jump` settle a keyboard End does, so the
   * drawer opens at the drawer's own speed and the navigation bar pegged to
   * its top edge (Flow.css) travels with it off the one `data-settle` both
   * read. Choosing List resizes nothing: List works at every height.
   */
  function chooseMode(next: DrawerMode) {
    onRequestMode(next);
    const grown = heightForMode(next, height, bounds);
    if (next === 'brain') {
      // V2.1 VB-74 — a press starts a fresh episode. The hysteresis
      // (`nextBrainYield`'s band) exists to stop a parked POINTER flipping
      // modes on the boundary; a person pressing the Brain button is not
      // jitter, and folding their press through a yield left over from the
      // resting peek meant the button could grow the drawer to exactly the
      // height Brain needs and still be refused by the band above it. The
      // verdict for a press is the plain question: does the globe fit at the
      // height the press produced?
      if (grown > bounds.min) restoreRef.current = grown;
      setSettle('jump');
      const fresh = !brainStageFits(grown, panelWidth);
      if (grown !== height || fresh !== brainYielded) onResize(grown, fresh);
      return;
    }
    if (grown !== height) applyHeight(grown, 'jump');
  }

  const currentQuestionId = currentQuestionIdFor(position);
  const currentSectionId = sectionIdFor(outline, currentQuestionId);

  // Stamped once per panel session, not inline in the memo below — a fresh
  // `new Date()` on every render would change the dependency every time and
  // the memo would never hit, which is the specific trap VB-07b calls out.
  const [generatedOn] = useState(contextFileDate);
  const parts = useMemo(
    () => generateContextFileParts(answers, generatedOn, modules, outline, fileCopy),
    [answers, generatedOn, modules, outline, fileCopy],
  );

  /** Every top-level section's state, for the globe — the same three-way fold
   * FileTree runs per row, so a section that is "Written" in one mode cannot
   * be anything else in the other. */
  const states = useMemo(() => {
    const map: Record<string, OutlineNodeState> = {};
    for (const node of outline) map[node.id] = outlineNodeState(node, answers.values, currentQuestionId);
    return map;
  }, [outline, answers.values, currentQuestionId]);

  const reached = outline.filter((node) => states[node.id] !== 'untouched').length;

  /**
   * BS-07a (§7.1) — the peek's status line, and the one number it carries
   * that is not already on the screen.
   *
   * HOW MANY LINES THE LAST ANSWER PUT IN THE FILE. A fact about the
   * DOCUMENT, read off the same generated text the preview shows and the
   * download writes, recomputed every render and stored nowhere. That is the
   * right side of GUARDRAILS' authorship test: it is not a count of anything
   * the person DID — no answers-per-session, no opens, no time — it is how
   * much longer their file is than it was a moment ago, which is the thing
   * the drawer exists to show.
   *
   * The delta is held for as long as it is true. It changes only when the
   * file changes, so it stands from one answer to the next rather than
   * flashing and clearing — and it is empty on the first paint, because
   * nothing was "just" added to a file somebody has only opened.
   */
  const fileLines = parts.text.split('\n').length;
  const lastLinesRef = useRef<number | null>(null);
  const [linesAdded, setLinesAdded] = useState(0);
  useEffect(() => {
    const before = lastLinesRef.current;
    lastLinesRef.current = fileLines;
    if (before === null || fileLines <= before) return;
    setLinesAdded(fileLines - before);
  }, [fileLines]);

  /** Too short to be a list — see core/drawer/height.ts. */
  const statusOnly = drawerShowsStatus(height);

  /**
   * V1.5 VB-25. Every section's health, for the globe's unified glow — the same
   * VB-19 derivation the List's own rows run (components/FileTree.tsx), so the
   * two modes cannot disagree about whether a section is done or due.
   *
   * `now` is stamped once per panel session rather than read inline, for the
   * same reason `generatedOn` above is: a fresh `new Date()` every render would
   * change the memo's dependency every time and it would never hit.
   */
  const [now] = useState(() => new Date());
  const health = useMemo(
    () => sectionHealthMap(outline, modules, answers, currentQuestionId, now),
    [outline, modules, answers, currentQuestionId, now],
  );

  /**
   * V1.8 VB-45/VB-46 — how lit each section is, for the flight itself.
   *
   * The same `sectionLife` call the globe makes and the List's rows make, so
   * the node that leaves a muted sphere arrives as the hollow orb its row
   * draws rather than travelling at full saturation between two turned-down
   * ends. That is the difference between one thing moving and two things
   * swapping, which is the whole of what VB-45 is about.
   */
  const lives = useMemo(() => {
    const map: Record<string, SectionLife> = {};
    for (const node of outline) {
      map[node.id] = sectionLife({
        health: health[node.id],
        current: states[node.id] === 'current',
        reached: states[node.id] === 'reached',
      });
    }
    return map;
  }, [outline, health, states]);

  /**
   * V1.8 VB-47 — WHICH FILE THE DRAWER IS SHOWING, and the switch between the
   * three.
   *
   * Adam's decision of 2026-08-24: **the drawer toggle is the switcher; Home is
   * a landing page.** V1.7's shelf stays as the overview somebody passes
   * through on the way in, and this is what they come back to.
   *
   * Ephemeral, exactly like the drawer's height and its requested mode beside
   * it (docs/ARCHITECTURE.md, "nothing derived is stored"): which file you are
   * looking at is a fact about a glance at the panel, not about the person, and
   * a reopen lands on whichever file the interview being run is.
   *
   * Context is the only file `core/files/slots.ts` reports as BUILT, so today
   * this can only ever hold `'context'` — and that is the honest state of the
   * product rather than a placeholder. The rule that keeps it honest is
   * `chooseFile`'s: a locked file is not enterable, whatever gets pressed. The
   * day Skills.md has flow data, this state starts moving and `Flow` hands the
   * drawer that file's own `Answers` from its own key
   * (core/files/answersKey.ts) — none of the derivations below change, which is
   * the whole point of one key per flow.
   */
  /**
   * ── V1.8 VB-48: AND WHICH LEVEL — one value, read by both views ──────────
   *
   * VB-48 asks for "shared navigation state with List, so switching file or
   * zoom level in one view is reflected in the other". This is that state, and
   * it is held ONCE, here, above both: the globe is handed it as props and
   * reports changes back, and the List is drawn from the same value. Neither
   * view holds a copy, so there is nothing for them to disagree about.
   *
   * `BRAIN_NAV_HOME` is `{ tier: 'file', file: 'context' }` — the drawer opens
   * exactly where it opened before V1.8. The work brain is a level somebody
   * pulls back to, not a shelf between them and the file they are answering.
   *
   * Still ephemeral, exactly as `shownFile` was and for the same reason: where
   * you are looking is a fact about a glance at the panel, not about the person
   * (docs/ARCHITECTURE.md, "nothing derived is stored"). There is no `wb:tier`
   * key and there must never be one.
   */
  // V2.2: home is the file THIS drawer is writing — `BRAIN_NAV_HOME` spelled
  // per-file rather than hardcoded to Context's.
  const [nav, setNav] = useState<BrainNav>(file === 'context' ? BRAIN_NAV_HOME : { tier: 'file', file });
  const shownFile: FileSlotId = nav.file;

  /**
   * V1.9 VB-52 — whether the breadcrumb is offering the files right now.
   *
   * Held here rather than inside the trail because the band gets a line taller
   * while the chips are showing, and the globe drawn underneath has to be sized
   * against the box that is really left (`brainStageSize`'s third term). One
   * fact, one owner, no way for the picture and the chrome to disagree about
   * how much room there is.
   *
   * Ephemeral, like everything else about a glance at this panel
   * (docs/ARCHITECTURE.md): a reopen lands with the trail closed.
   */
  const [filesOpen, setFilesOpen] = useState(false);

  /**
   * The toggle itself: which files exist, which one is on screen, and what a
   * locked one may truthfully say.
   *
   * `fileFinished` is the shelf's own fold over the very answers this drawer is
   * already rendering — not a second count — so a locked segment stops saying
   * "Finish Context.md first" at the same moment Home's locked row does.
   */
  const toggle = useMemo(
    // O3: the switcher's lock is a DOOR, so it opens on "nothing left to
    // ask" like every other door — see surfaces/Home.tsx's note.
    () => fileToggle(shownFile, { [shownFile]: fileAsked(outline, modules, answers, now) }),
    [shownFile, outline, modules, answers, now],
  );

  /** V1.4 VB-23. What each node holds, for the globe's sub-node split — the
   * same answers the file preview below is generated from, folded into cells
   * by core/flow/nodeDetails.ts. Derived per render like everything else here;
   * nothing about it is stored. */
  const details = useMemo(() => nodeDetailsByNode(outline, answers, modules), [outline, answers, modules]);

  /**
   * V1.5 VB-27. What each node holds in counts, for the summary a sub-node
   * shows on hover, on focus and on activation — the same `wb:answers` and the
   * same health the two derivations above read, so the card, the detail panel
   * and the List's rows cannot disagree about one section.
   */
  const summaries = useMemo(() => nodeSummaries(outline, answers, health, modules), [outline, answers, health, modules]);

  /**
   * The recommendations that attach to those nodes (V1.5 VB-28).
   *
   * `wb:recs` is read once, exactly as Home reads it, because a dismissal is
   * about the whole file and not about one surface: hiding an offer on Home
   * has to hide it here too, or "ignore it permanently" would mean "except on
   * the globe". A failed or absent read is an empty map — every offer still
   * on offer, which is what a fresh install means (docs/GUARDRAILS.md's
   * degradation rule).
   */
  const [dismissals, setDismissals] = useState<Dismissals>(NO_DISMISSALS);
  useEffect(() => {
    let cancelled = false;
    void getLocal('wb:recs').then((stored) => {
      if (!cancelled) setDismissals(readDismissals(stored));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const recommendations = useMemo(
    () => recommendationsByNode(recommend({ answers, now, dismissals, outline, modules })),
    [answers, now, dismissals, outline, modules],
  );

  /**
   * Keeps the section being written inside the peek.
   *
   * Deliberately not `Element.scrollIntoView`: that scrolls every scrollable
   * ancestor, so in a fixed drawer it also drags the page behind it and moves
   * the question the person is reading. Setting the container's own
   * `scrollTop` moves exactly one box.
   *
   * V1.2 VB-12: it re-centres after a resize too, so growing the drawer shows
   * more of the file *around* where you are rather than more of the top of it.
   * Not during the drag itself — yanking the scroll under a moving pointer 60
   * times a second is the one version of this that feels broken — so the drag
   * runs it once, when it ends.
   *
   * V1.2 VB-14b: it runs in both modes, because in Brain the list is hidden
   * but still laid out, and the morph measures where its rows *are*. Declared
   * above the morph's own effect on purpose — effects run in order, so the
   * rows have finished moving before anything measures them.
   */
  useEffect(() => {
    if (dragging) return;
    const box = bodyRef.current;
    if (!box || !currentSectionId) return;
    const row = box.querySelector<HTMLElement>(`.filetree-row[data-node-id="${currentSectionId}"]`);
    if (!row) return;
    box.scrollTop = Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2);
  }, [currentSectionId, height, dragging]);

  /**
   * THE MORPH. VB-14: "Mode change is a morph, not a swap: every node flies to
   * its list-row position while the edges fade and the rows resolve
   * underneath (~520ms)."
   *
   * Both ends of every flight are measured from the live DOM at the moment the
   * mode changes, never computed from the geometry: the globe is at whatever
   * pose the person left it in and the list is scrolled wherever the section
   * being written put it. A node that flies to where a row *would* be is the
   * "it pops" this task exists to fix.
   *
   * A passive effect rather than a layout one, deliberately. It has to run
   * *after* the scroll effect above — a morph measured against rows that are
   * about to be scrolled somewhere else lands every node in the wrong place —
   * and effects run in declaration order. The cost is one painted frame in the
   * new mode before the nodes appear, which is 2% of the way through a
   * crossfade nobody can see yet.
   */
  const shownModeRef = useRef(mode);
  /**
   * The measurement, shared by the two moments that need it. On a mode flip it
   * starts (or, mid-flight, re-aims) the morph; on the drawer's own
   * `transitionend` it re-aims a still-live flight — see the listener below
   * for why that second moment exists at all.
   */
  const aimMorph = useCallback(() => {
    // Reduced motion: no flight at all. The mode simply changes, with every
    // node and row still reachable — VB-14's own reduced-motion clause. The
    // still equivalent carries the same information because the information is
    // which mode is showing, and that arrives on the first frame.
    const root = rootRef.current;
    const layer = morphRef.current;
    if (prefersReducedMotion() || !root || !layer) {
      morphingRef.current = false;
      setMorph(null);
      return;
    }

    const points = morphPoints(
      layer.getBoundingClientRect(),
      outline.map((node) => ({
        id: node.id,
        // The node's orb. Every section has one since V1.5 VB-24 — an
        // unanswered one is the same solid turned down rather than a ring —
        // so one selector covers all ten (BrainGlobe.tsx).
        brain: boxOf(root.querySelector(`.brainglobe-node[data-section-id="${node.id}"] .brainglobe-sphere`)),
        // The row's state marker, not the whole row: it is the one thing in a
        // row that is the same shape as a node.
        list: boxOf(root.querySelector(`.filetree-row[data-node-id="${node.id}"] .filetree-glyph`)),
      })),
    );
    if (points.length === 0) {
      morphingRef.current = false;
      setMorph(null);
      return;
    }

    // Interrupting: keep the nodes where they are and re-aim them. Starting
    // again from `start` would snap every one of them back to the end it left.
    const phase = morphingRef.current ? 'run' : 'start';
    morphingRef.current = true;
    setMorph((current) => ({ to: shownModeRef.current, points, phase: current && phase === 'run' ? 'run' : phase }));
  }, [outline]);

  useEffect(() => {
    if (shownModeRef.current === mode) return;
    shownModeRef.current = mode;
    aimMorph();
  }, [mode, aimMorph]);

  /**
   * V2.1 VB-74 — RE-AIM WHEN THE DRAWER FINISHES MOVING UNDER THE FLIGHT.
   *
   * Choosing Brain changes the mode and the height in the same press. The
   * flights' ends are measured on the new mode's first frame — while the
   * drawer's height transition has barely started — so every measured end is
   * where its sphere WAS, in a coordinate space (the morph layer's own box)
   * that is itself still travelling with the drawer. Both keep moving for the
   * settle's whole duration and the flight does not: measured, the landing
   * missed by exactly the distance the drawer moved after the measurement.
   *
   * That error existed from the first morph and sat just under the landing
   * tolerance; VB-74's nav band made the opening jump thirty pixels longer
   * and pushed it well past. The machinery for the fix predates the bug: an
   * interrupted morph already keeps its nodes where they are and re-aims them
   * at freshly measured ends. So when the drawer's own height transition
   * ends while a flight is live, the flight is re-aimed through exactly that
   * path — from real boxes that have now stopped moving.
   *
   * `transitionend` rather than a timer, because the settle's duration is the
   * stylesheet's (`data-settle`, FileDrawer.css) and a second copy of it here
   * would drift. Guarded to the drawer's own height so a label fading inside
   * the drawer cannot re-aim anything.
   */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    function onSettleEnd(event: TransitionEvent) {
      if (event.target !== root || event.propertyName !== 'height') return;
      if (!morphingRef.current) return;
      aimMorph();
    }
    root.addEventListener('transitionend', onSettleEnd);
    return () => root.removeEventListener('transitionend', onSettleEnd);
  }, [aimMorph]);

  /**
   * `start` → `run`, in the same frame.
   *
   * The forced read is load-bearing and is not a superstition: a CSS
   * transition fires on a change *between two style recalculations*. Both
   * renders land before the browser would otherwise recalculate anything, so
   * without a flush in between they collapse into one — and every node
   * teleports. Reading the layer's box is what makes the browser resolve the
   * `start` transforms first, giving the `run` transforms something to
   * interpolate away from.
   */
  useLayoutEffect(() => {
    if (!morph || morph.phase !== 'start') return;
    morphRef.current?.getBoundingClientRect();
    setMorph((current) => (current && current.phase === 'start' ? { ...current, phase: 'run' } : current));
  }, [morph]);

  /**
   * The end of the flight, in two beats. A timer rather than `transitionend`,
   * because a morph interrupted at 90% has fewer transitions to end than it
   * started with, and a layer left mounted forever would sit over the drawer's
   * own content. Restarted on every phase change, so an interruption gets the
   * full flight it was just given.
   *
   * V1.6 VB-32's second beat: at `MORPH_MS` every node is sitting on the mark
   * it became, and the layer spends `MORPH_LAND_MS` handing over to it before
   * unmounting. Standing still, so an interruption during the hand-off is a
   * node that fades back up and flies on rather than one that has to be caught
   * mid-fade.
   */
  useEffect(() => {
    if (!morph) return undefined;
    if (morph.phase === 'land') {
      const done = setTimeout(() => {
        morphingRef.current = false;
        setMorph(null);
      }, MORPH_LAND_MS + 40);
      return () => clearTimeout(done);
    }
    const landed = setTimeout(() => {
      setMorph((current) => (current && current.phase === 'run' ? { ...current, phase: 'land' } : current));
    }, MORPH_MS + 40);
    return () => clearTimeout(landed);
  }, [morph]);

  function handleNavigate(questionId: string) {
    const target = positionForQuestionId(modules, questionId);
    // Degrade silently (docs/GUARDRAILS.md): a section whose first question id
    // no longer exists in the flow simply does nothing rather than erroring.
    if (target) onNavigate(target);
  }

  /**
   * Picking a node in the globe. The same navigation a row performs, through
   * the same seam, under the same rule: only a written or in-progress section
   * is a jump.
   *
   * An unreached node still flies in, and still says what it holds — the globe
   * is a view of the whole file, not only of the answered part — it simply
   * does not move the interview. Flying back out (`null`) navigates nowhere,
   * because leaving a section is not a request to go anywhere.
   */
  /** BS-07c — which nodes own a list, for the leaf card's empty states.
   * Built once per drawer rather than per hover (core/flow/outline.ts). */
  const listNodes = useMemo(() => listNodeIds(modules, outline), [modules, outline]);

  function handleGlobeSelect(node: FileOutlineNode | null) {
    if (!node) return;
    if (outlineNodeState(node, answers.values, currentQuestionId) === 'untouched') return;
    const target = navigationTargetFor(node);
    if (target) handleNavigate(target);
  }

  /** V1.9 VB-52. The line the trail takes while it is offering the files —
   * zero the rest of the time. Read twice, and it must be the same number in
   * both places: the stage's own top edge (CSS, below) and the size the globe
   * is drawn at (core/drawer/mode.ts). */
  const crumbNote = filesOpen && nav.tier === 'file' ? DRAWER_CRUMB_NOTE : 0;
  const stageSize = brainStageSize(height, panelWidth, crumbNote);
  const drifting = brainDriftAllowed(mode, height, morph !== null);

  /** The section rung of the trail: the section being written, without the
   * numeral its label carries in the file (core/flow/sectionLabel.ts). `null`
   * before anything has been reached, which is a two-rung trail rather than an
   * empty third rung. */
  const currentSection = outline.find((node) => node.id === currentSectionId) ?? null;
  const sectionRung = currentSection ? splitSectionLabel(currentSection.label).title : null;

  return (
    <aside
      ref={rootRef}
      className="filedrawer"
      aria-labelledby={HEADING_ID}
      data-dragging={dragging ? 'true' : 'false'}
      data-settle={settle}
      data-mode={mode}
      data-morph={morph ? morph.to : 'none'}
      style={
        {
          '--filedrawer-h': `${closed ? DRAWER_CLOSED_HEIGHT : height}px`,
          // V1.9 VB-51/VB-52 — the three bands of the drawer's chrome, from
          // core/drawer/height.ts. The stylesheet positions the two content
          // layers between them and works none of it out: the same numbers
          // decide the drawer's floor, its resting height and the globe's
          // stage size, and a `calc()` with its own copy of 44 is how those
          // four quietly stop agreeing.
          // V2.0 VB-72: the BAND, not the handle's target. Twenty of the
          // handle's 44 hang above the drawer's top edge now, and the
          // stylesheet reads both terms from here rather than doing that
          // subtraction itself.
          '--drawer-head-h': `${DRAWER_HANDLE_BAND}px`,
          '--drawer-handle-over': `${DRAWER_HANDLE_OVERHANG}px`,
          '--crumb-row-h': `${DRAWER_CRUMB_HEIGHT}px`,
          '--crumb-note-h': `${DRAWER_CRUMB_NOTE}px`,
          '--drawer-crumb-h': `${DRAWER_CRUMB_HEIGHT + crumbNote}px`,
          '--drawer-viewbar-h': `${brainOffered ? DRAWER_VIEW_BAR_HEIGHT : 0}px`,
          // The morph's clock, published from core/drawer/mode.ts so the
          // stylesheet never carries a second copy of a number that has to
          // agree with the component's.
          '--morph-ms': `${MORPH_MS}ms`,
          '--morph-out-ms': `${MORPH_FADE_OUT_MS}ms`,
          '--morph-land-ms': `${MORPH_LAND_MS}ms`,
        } as CSSProperties
      }
    >
      {/* The heading V1.1 printed above the tree. It is not printed any more —
          VB-12 replaces it with the divider and its grip — but the drawer is
          still a region and a region still wants a name, so it stays as the
          name of one, in the markup and nowhere on screen. */}
      <h2 className="filedrawer-sr" id={HEADING_ID}>
        {S.fileTreeHeading}
      </h2>
      <div className="filedrawer-head">
        <div
          ref={handleRef}
          className="filedrawer-handle"
          role="separator"
          tabIndex={0}
          aria-label={S.drawerHandle}
          aria-orientation="horizontal"
          aria-controls={BODY_ID}
          aria-valuenow={closed ? DRAWER_CLOSED_HEIGHT : height}
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          aria-valuetext={closed ? S.drawerClosedValue : S.drawerHandleValue(drawerOpenPercent(height, bounds))}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            // V2.3 VB-99 — from closed, a plain click on the grabber opens to
            // the minimum (Adam: "if you click the grabber, it opens to the
            // minimum height it is set at now"). Open-state clicks stay inert:
            // the handle is a drag control, and a click that resized would
            // punish the twitch every drag begins with.
            if (!closed) return;
            onClosed?.(false);
            applyHeight(bounds.min, 'jump');
          }}
          onPointerDown={(event) => {
            // Every new gesture disarms the drag-click suppression (above).
            suppressClickRef.current = false;
            if (!closed) onPointerDown(event);
          }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHandleKeyDown}
        >
          {/* V2.0 VB-72 — THE PAINTED BOX, and the only reason it exists.
              The handle's target now reaches above the drawer's top edge, over
              the panel's own canvas, where the dock's ring measures 1.69:1 and
              would simply not be there. So the ring goes on the part of the
              control that is inside the drawer — the same "ring on the painted
              box, not on the hit box" the file chips (components/Breadcrumb.css)
              and V1.7 VB-41's nav cluster already use. Decorative: the name,
              the role and the value are all on the handle itself. */}
          <span className="filedrawer-handle-band" aria-hidden="true" />
          <span className="filedrawer-grip" aria-hidden="true" />
        </div>
        {/* V1.9 VB-52 — the count that used to sit at the right of this band
            has moved onto the trail below, where the mockup puts it and where
            it is read rather than glanced past. The band is the handle's alone
            now: nothing else may sit in it, because the handle covers the whole
            of it (`inset: 0`) and anything overlapping it takes pixels off a
            44px control. */}
      </div>
      {/* V2.3 VB-99 — the closed face: the grabber above, and one status line
          that keeps tracking the interview — the mark, the section being
          written (unnumbered, VB-96's rule), and reached-of-total with its
          percent. Everything else stands down while closed; the layers below
          are simply not rendered, which is also what keeps the morph from
          measuring a world that is not on screen. */}
      {closed && (
        <div className="filedrawer-closedface">
          <BrandMark size={18} />
          <span className="filedrawer-closedlabel">{sectionRung ?? S.fileTreeHeading}</span>
          <span className="filedrawer-closedcount">
            {S.crumbCount(reached, outline.length)} · {Math.round((reached / Math.max(1, outline.length)) * 100)}%
          </span>
        </div>
      )}
      {!closed && (
      <>
      {/* V1.9 VB-52 — the trail, and the product's only file switcher.
          Handed the same `nav` the globe below is handed, so the two are one
          navigation rather than two that agree today (see the header). */}
      <Breadcrumb
        nav={nav}
        files={toggle}
        section={sectionRung}
        done={reached}
        total={outline.length}
        filesOpen={filesOpen}
        onFilesOpen={setFilesOpen}
        onNav={setNav}
        onHome={onHome}
      />
      {/* Brain. Mounted in both modes — see decision 2 in the header — and
          anchored to the top of its box rather than centred, so the globe does
          not slide while the drawer's own height is still settling underneath
          it. That is what keeps the morph's measurements true. */}
      <div className="filedrawer-stage">
        <BrainGlobe
          sections={outline}
          states={states}
          health={health}
          size={stageSize}
          drift={drifting}
          details={details}
          summaries={summaries}
          recommendations={recommendations}
          onSelect={handleGlobeSelect}
          onHome={onHome}
          /* BS-07c (§7.2) — the leaf card's action. In the drawer a list opens
             the section's own records through the same `handleNavigate` every
             other route here uses, so the card is not a second navigation. */
          listNodes={listNodes}
          onLeafAct={(node) => handleGlobeSelect(node)}
          /* V1.8 VB-48 — the tier above, and the one state both views read.
             The globe is handed the same `toggle` the List's strip is drawn
             from, so "what is locked" is one answer on this screen rather than
             two that happen to agree today. */
          files={toggle}
          file={nav.file}
          tier={nav.tier}
          onTier={setNav}
          /* V2.0 VB-71 — offer the turn cue only on the stage somebody is
             actually looking at. Both layers are mounted at all times and one
             of them is hidden (decision 2 in the header), so `mode` rather than
             "this component exists" is what says the globe is on screen — and
             leaving Brain is one of the three things that retires the cue for
             good (components/BrainTurnCue.tsx). */
          turnCue={mode === 'brain'}
        />
      </div>
      <div className="filedrawer-body" id={BODY_ID} ref={bodyRef}>
        {/* V1.8 VB-48 — THE LIST HAS THE SAME TWO TIERS THE BRAIN HAS.

            Out at the work brain, the List is the files; inside one, it is that
            file's outline. Same state, same rule, same words as the globe
            beside it — a tier that existed in only one of the two views would
            be a second navigation rather than a shared one, which is the thing
            VB-48 asks for by name.

            V1.9 VB-52 takes the sticky strip that used to sit above this tree
            away entirely: the file switcher and the way back up are both the
            breadcrumb's now, one band higher and above the scroll box. Nothing
            inside the list scrolls under a control any more. */}
        {/* BS-07a (§7.1) — AT THE PEEK, ONE TRUE SENTENCE INSTEAD OF A SLICED
            LIST. "A row reading 0 of 6 and 0% under a trail that already
            names the section" is three ways of saying nothing, and it is what
            somebody meets on the screen where the interview begins.

            The threshold is geometry, not taste: below two whole rows there
            is no list to draw, only a row and part of another
            (core/drawer/height.ts's `drawerShowsStatus`). Drag the drawer up
            by one step and the tree is back. */}
        {statusOnly ? (
          <p className="filedrawer-status">{S.peekStatus(reached, outline.length, linesAdded)}</p>
        ) : nav.tier === 'work' ? (
          <WorkShelf
            items={toggle}
            note={{ [nav.file]: S.sectionsOf(reached, outline.length) }}
            onOpen={(id) => setNav((current) => chooseNav(current, id, toggle))}
          />
        ) : (
          <>
            <FileTree
              outline={outline}
              modules={modules}
              answers={answers}
              currentQuestionId={currentQuestionId}
              currentSectionId={currentSectionId}
              onNavigate={handleNavigate}
            />
            <FilePreview sections={parts.sections} whole={parts.text} fileLabel={fileName(file)} />
          </>
        )}
      </div>
      {/* V1.9 VB-51 — the bottom bar: brain / list, and nothing else.
          "The mode toggle moves to a bottom bar ... two icons in a bar below
          the visual, not a strip above it." It is the same pair that stood in
          the head band since V1.4 — same names, same three signals, same
          `aria-pressed` — one band lower, and now the only toggle in the
          drawer that is about HOW to look rather than WHAT at.

          Last in the markup as well as last on the screen, so the tab order
          through the drawer reads: where am I, what is in the file, how do I
          want to see it. */}
      {brainOffered && (
        <div className="filedrawer-viewbar">
          <div className="filedrawer-modes" role="group" aria-label={S.drawerModes}>
            <ModeButton mode="brain" active={mode === 'brain'} label={S.drawerModeBrain} onPick={chooseMode} />
            <ModeButton mode="list" active={mode === 'list'} label={S.drawerModeList} onPick={chooseMode} />
          </div>
        </div>
      )}
      {/* The flight path. Always mounted, so there is always a box to measure
          against; empty except during a morph. `aria-hidden` because every
          node it draws is a picture of a control that exists, focusable and
          named, in whichever layer is arriving. */}
      <div className="filedrawer-morph" ref={morphRef} data-phase={morph?.phase ?? 'none'} aria-hidden="true">
        {morph?.points.map((point, index) => {
          const arriving = morph.to === 'brain' ? point.brain : point.list;
          const leaving = morph.to === 'brain' ? point.list : point.brain;
          return (
            <span
              key={point.id}
              className="filedrawer-morph-node"
              data-node-id={point.id}
              // The colour of the sphere it left, so the same object is
              // visibly the same object in both modes — and V1.8 VB-45's other
              // half: how lit that sphere is, so a section with nothing in it
              // does not fly bright and land hollow.
              data-gradient={sectionNodeGradient(index)}
              data-life={lives[point.id] ?? 'lit'}
              style={{ transform: morphTransform(morph.phase === 'start' ? leaving : arriving) }}
            />
          );
        })}
      </div>
      </>
      )}
    </aside>
  );
}

/**
 * One of the two mode buttons.
 *
 * `aria-pressed` rather than a radio group: these are two states of one view,
 * not a value being collected, and a toggle button is what a screen reader
 * announces most plainly.
 *
 * ── V1.4 VB-22 TOOK THE WORD AWAY; BS-07a (§7.1) PUTS IT BACK ─────────────
 *
 * VB-22's reasoning was about paint: the bar wears the stage's own colour, and
 * a word inside a light chip was the loudest thing on the drawer. That was
 * true, and it was solved the wrong way round — the fix for a chip that shouts
 * is to stop drawing the chip, not to delete the word.
 *
 * The beta review's §7.1: "Two unlabelled glyphs on a dark field, choosing
 * between two views most people have never seen. Make them labelled pills."
 * Adam's D3 ruling on the same collision is the general rule — a control named
 * by a glyph is named for people who already know what it does, and neither of
 * these is a control anybody arrives knowing.
 *
 * THE `aria-label` WENT WITH THE CHANGE, deliberately. A printed word plus an
 * `aria-label` saying the same thing is two names for one control that agree
 * today; the printed text IS the accessible name now, so they cannot drift.
 * The two specs that find these buttons by name never had to change either
 * way, which is the point.
 *
 * The pressed one is still never distinguished by colour alone: the accent
 * bar, the heavier glyph stroke, and `aria-pressed` — which is the one that
 * matters when nothing is being looked at at all.
 */
function ModeButton({
  mode,
  active,
  label,
  onPick,
}: {
  mode: DrawerMode;
  active: boolean;
  label: string;
  onPick: (mode: DrawerMode) => void;
}) {
  return (
    <button
      type="button"
      className="filedrawer-mode"
      data-mode={mode}
      aria-pressed={active}
      onClick={() => onPick(mode)}
    >
      {mode === 'brain' ? <BrainGlyph /> : <ListGlyph />}
      {/* BS-07a (§7.1) — THE WORD IS BACK, AND IT IS PRINTED.
          "Two unlabelled glyphs on a dark field, choosing between two views
          most people have never seen. Make them labelled pills." The
          `aria-label` is gone with it: the button's name is now its own text,
          which is the version a sighted person and a screen-reader user can
          both check against each other. */}
      <span className="filedrawer-mode-word">{label}</span>
    </button>
  );
}

/**
 * The brain: one outline, split down the middle.
 *
 * Drawn rather than imported — a dependency that "just adds an icon set" is
 * named in docs/GUARDRAILS.md as a thing that looks helpful and is not. Two
 * mirrored lobes and the fissure between them is the least a brain can be and
 * still be read as one at this size, and the fissure is what stops it reading as a
 * cloud.
 */
function BrainGlyph() {
  return (
    <svg className="filedrawer-glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {/* Two lobes and the fissure between them, and nothing else. An
            earlier draft carried a fold inside each lobe: at 22px and one
            device pixel per CSS pixel the folds close up into a smudge and the
            glyph reads as a scribbled circle. Four bumps a side is what
            survives that size. */}
        <path d="M12 5.2C11.4 4 9.9 3.4 8.6 3.9 7.4 4.3 6.7 5.5 6.8 6.7 5.4 7.1 4.5 8.5 4.8 9.9 3.6 10.7 3.3 12.3 4 13.5c.5.9 1.5 1.4 2.5 1.4-.2 1.4.7 2.7 2.1 3 1.2.3 2.4-.3 3-1.3" />
        <path d="M12 5.2c.6-1.2 2.1-1.8 3.4-1.3 1.2.4 1.9 1.6 1.8 2.8 1.4.4 2.3 1.8 2 3.2 1.2.8 1.5 2.4.8 3.6-.5.9-1.5 1.4-2.5 1.4.2 1.4-.7 2.7-2.1 3-1.2.3-2.4-.3-3-1.3" />
        <path d="M12 5.2v11.4" />
      </g>
    </svg>
  );
}

/** The list: three rows, each with its marker — the same shape the file tree
 * underneath is, which is the whole point of the pair. */
function ListGlyph() {
  return (
    <svg className="filedrawer-glyph" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7h1.4M5 12h1.4M5 17h1.4" />
        <path d="M10 7h9M10 12h9M10 17h9" />
      </g>
    </svg>
  );
}

/**
 * VB-07b — the real file text, assembling.
 *
 * No reveal machinery: `generateContextFileParts` already omits a section with
 * nothing in it (see `renderFileSection`'s early return on an empty body), so
 * sections genuinely appear as they are answered. The same function writes the
 * download, so the preview cannot drift from the artifact.
 *
 * A section that appears while you are watching fades in; one that was already
 * there when the drawer mounted does not, on the same reasoning as the tree's
 * typewriter. Tracked in a ref rather than state because it must not itself
 * cause a render — it is a record of what has already been shown.
 */
function FilePreview({ sections, whole, fileLabel }: { sections: ContextFileSection[]; whole: string; fileLabel: string }) {
  /** V2.3 VB-98 — the assembled file is a disclosure now: an arrow to open or
   * close it (same grammar as the accordion above it) and a Download for the
   * current bytes. `whole` is the SAME text the generator hands the download
   * everywhere else, so the two cannot drift. Open by default: the preview
   * was always visible before, and a collapse that ships closed would read as
   * the feature being removed. */
  const [openPreview, setOpenPreview] = useState(true);
  function downloadNow() {
    const blob = new Blob([whole], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileLabel;
    a.click();
    URL.revokeObjectURL(url);
  }
  const seenRef = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  useEffect(() => {
    const isFirstRun = seenRef.current === null;
    const seen = seenRef.current ?? new Set<string>();
    seenRef.current = seen;
    const fresh = new Set<string>();
    for (const section of sections) {
      if (seen.has(section.id)) continue;
      seen.add(section.id);
      if (!isFirstRun) fresh.add(section.id);
    }
    setNewIds(fresh);
  }, [sections]);

  return (
    <div className="filepreview">
      <div className="filepreview-bar">
        <button
          type="button"
          className="filepreview-toggle"
          aria-expanded={openPreview}
          onClick={() => setOpenPreview((v) => !v)}
        >
          <span className="filepreview-chevron" data-open={openPreview ? 'true' : 'false'} aria-hidden="true">▾</span>
          {S.filePreviewNote}
        </button>
        <button type="button" className="filepreview-download" onClick={downloadNow}>
          {S.filePreviewDownload}
        </button>
      </div>
      {openPreview && sections.map((section) => (
        <pre className={newIds.has(section.id) ? 'filepreview-section is-new' : 'filepreview-section'} key={section.id}>
          {section.text}
        </pre>
      ))}
    </div>
  );
}
