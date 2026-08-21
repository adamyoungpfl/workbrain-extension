import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { FileTree } from '../components';
import { contextFileDate, generateContextFileParts } from '../../core/files/generate';
import type { ContextFileSection } from '../../core/files/generate';
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
  currentQuestionIdFor,
  currentSectionId as sectionIdFor,
  outlineNodeState,
  positionForQuestionId,
} from '../../core/flow/outline';
import type { Position } from '../../core/flow/runner';
import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
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

export function FileDrawer({ outline, modules, answers, position, height, onResize, onNavigate }: FileDrawerProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  /**
   * How tall the drawer is allowed to be right now. Derived from the viewport,
   * kept in state only so a panel the person resizes gets honest bounds — the
   * derivation itself is core/drawer/height.ts's and is never stored.
   */
  const [bounds, setBounds] = useState<DrawerBounds>(() => drawerBounds(viewportHeight()));
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    // Keeps the same object when the numbers have not moved. A resize fires a
    // stream of events, and a fresh object each time would re-render the whole
    // drawer — and re-run the clamp below — on every one of them.
    const onWindowResize = () =>
      setBounds((prev) => {
        const next = drawerBounds(window.innerHeight);
        return prev.min === next.min && prev.max === next.max ? prev : next;
      });
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

  /** The height Enter restores to — the last one this session that was not the
   * peek. A ref, not state: it changes nothing on screen until Enter is
   * pressed, so it must not cause a render. */
  const restoreRef = useRef(restingDrawerHeight(bounds));

  /** Live drag: the pointer that started it, where it started, and how tall
   * the drawer was then. Everything is measured from the start of the gesture
   * rather than accumulated, so the grip cannot drift away from the pointer. */
  const dragRef = useRef<{ id: number; startY: number; startHeight: number } | null>(null);

  const applyHeight = useCallback(
    (next: number, mode: DrawerSettle | 'none') => {
      if (next > bounds.min) restoreRef.current = next;
      setSettle(mode);
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

  const reached = outline.filter((node) => outlineNodeState(node, answers.values, currentQuestionId) !== 'untouched').length;

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
   */
  useEffect(() => {
    if (dragging) return;
    const box = bodyRef.current;
    if (!box || !currentSectionId) return;
    const row = box.querySelector<HTMLElement>(`.filetree-row[data-node-id="${currentSectionId}"]`);
    if (!row) return;
    box.scrollTop = Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2);
  }, [currentSectionId, height, dragging]);

  function handleNavigate(questionId: string) {
    const target = positionForQuestionId(modules, questionId);
    // Degrade silently (docs/GUARDRAILS.md): a section whose first question id
    // no longer exists in the flow simply does nothing rather than erroring.
    if (target) onNavigate(target);
  }

  return (
    <aside
      className="filedrawer"
      aria-labelledby={HEADING_ID}
      data-dragging={dragging ? 'true' : 'false'}
      data-settle={settle}
      style={{ '--filedrawer-h': `${height}px` } as CSSProperties}
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
      <div className="filedrawer-body" id={BODY_ID} ref={bodyRef}>
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
    </aside>
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
