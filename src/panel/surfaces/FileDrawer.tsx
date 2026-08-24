import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { BrainGlobe, FileTree } from '../components';
import { sectionNodeGradient } from '../components/BrainGlobe';
import { FileTypeToggle } from '../components/FileTypeToggle';
import { contextFileDate, generateContextFileParts } from '../../core/files/generate';
import type { ContextFileSection } from '../../core/files/generate';
import { fileFinished } from '../../core/files/slots';
import type { FileSlotId } from '../../core/files/slots';
import { chooseFile, fileToggle } from '../../core/files/toggle';
import {
  clampDrawerHeight,
  drawerBounds,
  drawerHeightForKey,
  drawerHeightFromDrag,
  drawerOpenPercent,
  restingDrawerHeight,
} from '../../core/drawer/height';
import type { DrawerBounds, DrawerSettle } from '../../core/drawer/height';
import {
  MORPH_FADE_OUT_MS,
  MORPH_LAND_MS,
  MORPH_MS,
  brainDriftAllowed,
  brainFitsIn,
  brainStageSize,
  heightForMode,
  morphPoints,
  morphTransform,
} from '../../core/drawer/mode';
import type { DrawerMode, MorphPoint } from '../../core/drawer/mode';
import {
  currentQuestionIdFor,
  currentSectionId as sectionIdFor,
  navigationTargetFor,
  outlineNodeState,
  positionForQuestionId,
} from '../../core/flow/outline';
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
 *    *request*; `modeForHeight` turns that plus the current height into what
 *    shows. Drag below ~180px and Brain hands over to List; drag back up and
 *    Brain returns. See core/drawer/mode.ts for why holding the request rather
 *    than the result is what makes that reversible.
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
 */

export interface FileDrawerProps {
  outline: FileOutlineNode[];
  modules: Module[];
  answers: Answers;
  position: Position;
  /**
   * V1.2 VB-12. How tall the drawer is, in px — owned by `Flow` because the
   * flow surface reserves exactly this much space beneath itself, and
   * ephemeral there for the same reason everything else about a glance at the
   * panel is (docs/ARCHITECTURE.md: nothing derived is stored). It arrives
   * here already a number; this component clamps it to what the current
   * viewport can hold and hands changes back.
   */
  height: number;
  onResize: (height: number) => void;
  /**
   * V1.4 VB-22. Which mode is on screen — derived by `Flow` from the mode
   * requested and the height, because the docked bar above this drawer now
   * wears the same stage colour and the two must not be able to disagree.
   * This component asks for a change and renders what it is told, exactly as
   * it already does with its height.
   */
  mode: DrawerMode;
  onRequestMode: (mode: DrawerMode) => void;
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
  onNavigate,
  mode,
  onRequestMode,
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

  const applyHeight = useCallback(
    (next: number, how: DrawerSettle | 'none') => {
      if (next > bounds.min) restoreRef.current = next;
      setSettle(how);
      if (next !== height) onResize(next);
    },
    [bounds.min, height, onResize],
  );

  // A panel that got shorter must not leave the drawer covering the question.
  // Not a reset-in-an-effect of derived state — it is a real reaction to the
  // window changing size, and it is a no-op in every other render.
  useEffect(() => {
    const clamped = clampDrawerHeight(height, bounds);
    if (clamped !== height) onResize(clamped);
  }, [bounds, height, onResize]);

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

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDragging(false);
  }

  function onHandleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const change = drawerHeightForKey(event.key, height, bounds, restoreRef.current);
    if (!change) return;
    event.preventDefault();
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
    if (grown !== height) applyHeight(grown, 'jump');
  }

  const currentQuestionId = currentQuestionIdFor(position);
  const currentSectionId = sectionIdFor(outline, currentQuestionId);

  // Stamped once per panel session, not inline in the memo below — a fresh
  // `new Date()` on every render would change the dependency every time and
  // the memo would never hit, which is the specific trap VB-07b calls out.
  const [generatedOn] = useState(contextFileDate);
  const parts = useMemo(
    () => generateContextFileParts(answers, generatedOn, modules, outline),
    [answers, generatedOn, modules, outline],
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
  const [shownFile, setShownFile] = useState<FileSlotId>('context');

  /**
   * The toggle itself: which files exist, which one is on screen, and what a
   * locked one may truthfully say.
   *
   * `fileFinished` is the shelf's own fold over the very answers this drawer is
   * already rendering — not a second count — so a locked segment stops saying
   * "Finish Context.md first" at the same moment Home's locked row does.
   */
  const toggle = useMemo(
    () => fileToggle(shownFile, { [shownFile]: fileFinished(outline, modules, answers, now) }),
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
  useEffect(() => {
    if (shownModeRef.current === mode) return;
    shownModeRef.current = mode;

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
    setMorph({ to: mode, points, phase });
  }, [mode, outline]);

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
  function handleGlobeSelect(node: FileOutlineNode | null) {
    if (!node) return;
    if (outlineNodeState(node, answers.values, currentQuestionId) === 'untouched') return;
    const target = navigationTargetFor(node);
    if (target) handleNavigate(target);
  }

  const stageSize = brainStageSize(height, panelWidth);
  const drifting = brainDriftAllowed(mode, height, morph !== null);

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
          '--filedrawer-h': `${height}px`,
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
        {/* Before the handle in the markup, so the tab order reads
            "what am I looking at" then "how big is it" — and so the last
            control inside the drawer stays one of the file's own. */}
        {brainOffered && (
          <div className="filedrawer-modes" role="group" aria-label={S.drawerModes}>
            <ModeButton mode="brain" active={mode === 'brain'} label={S.drawerModeBrain} onPick={chooseMode} />
            <ModeButton mode="list" active={mode === 'list'} label={S.drawerModeList} onPick={chooseMode} />
          </div>
        )}
        <div
          ref={handleRef}
          className="filedrawer-handle"
          role="separator"
          tabIndex={0}
          aria-label={S.drawerHandle}
          aria-orientation="horizontal"
          aria-controls={BODY_ID}
          aria-valuenow={height}
          aria-valuemin={bounds.min}
          aria-valuemax={bounds.max}
          aria-valuetext={S.drawerHandleValue(drawerOpenPercent(height, bounds))}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHandleKeyDown}
        >
          <span className="filedrawer-grip" aria-hidden="true" />
        </div>
        {/* Outside the separator, deliberately: text inside a splitter is
            text a screen reader will never reach, because the splitter's own
            name replaces its contents. It sits over the handle and lets every
            pointer event through to it, so it takes nothing away from the
            grab target. */}
        <p className="filedrawer-count">{S.sectionsOf(reached, outline.length)}</p>
      </div>
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
        />
      </div>
      <div className="filedrawer-body" id={BODY_ID} ref={bodyRef}>
        {/* V1.8 VB-47 — the switch between Context, Skills and Actions, in the
            strip that used to hold the `[ ] 9 not yet` summary tag.

            HERE AND NOT INSIDE `FileTree`: the tree is a picture of ONE file
            and choosing which file that is belongs to the drawer around it —
            the same reasoning that keeps the mode buttons in the head band
            rather than inside the globe. Sticky at the top of this scrolling
            box (FileTypeToggle.css), exactly as the summary was, because a
            switcher that scrolls away is one you have to go looking for.

            The refusal lives in core: `chooseFile` returns the file already on
            screen when a locked one is pressed, and the strip prints what
            unlocks it. */}
        <FileTypeToggle
          items={toggle}
          onPick={(id) => setShownFile((current) => chooseFile(current, id, toggle))}
        />
        <FileTree
          outline={outline}
          modules={modules}
          answers={answers}
          currentQuestionId={currentQuestionId}
          currentSectionId={currentSectionId}
          onNavigate={handleNavigate}
        />
        <FilePreview sections={parts.sections} />
      </div>
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
 * ── V1.4 VB-22: icons, and the name that survives losing the word ─────────
 *
 * The bar these sit in now wears the stage's own colour, and on Brain's deep
 * field a word inside a light chip was the loudest thing on the drawer. So the
 * word goes and a glyph takes its place — but **an icon is not a name**
 * (docs/GUARDRAILS.md's keyboard and screen-reader floor), so the same string
 * that used to be printed is now the button's `aria-label`. Nothing is lost in
 * the accessibility tree; the two specs that find these buttons by their names
 * (tests/e2e/drawer-modes*.spec.ts) never had to change.
 *
 * The pressed one is still never distinguished by colour alone: it carries a
 * filled chip, a solid underline bar, and a heavier glyph stroke, any of which
 * reads on its own — plus `aria-pressed`, which is the one that matters when
 * nothing is being read at all.
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
      aria-label={label}
      onClick={() => onPick(mode)}
    >
      {mode === 'brain' ? <BrainGlyph /> : <ListGlyph />}
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
function FilePreview({ sections }: { sections: ContextFileSection[] }) {
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
      <p className="filepreview-note">{S.filePreviewNote}</p>
      {sections.map((section) => (
        <pre className={newIds.has(section.id) ? 'filepreview-section is-new' : 'filepreview-section'} key={section.id}>
          {section.text}
        </pre>
      ))}
    </div>
  );
}
