import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { FileOutlineNode } from '../../schema/flow.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import {
  CAMERA,
  ICOSAHEDRON_EDGES,
  ICOSAHEDRON_VERTICES,
  clampTilt,
  depth,
  faceRotation,
  paintOrder,
  project,
  rotate,
  shortestTurn,
} from '../../core/geometry/icosahedron';
import type { Vec3 } from '../../core/geometry/icosahedron';
import { prefersReducedMotion } from '../cues/verbs';
import { S } from '../strings';
import './BrainGlobe.css';

/**
 * V1.2 VB-14 — the Brain globe.
 *
 * The direction chosen in docs/V1.2-REFINEMENT.md's "Iteration three": the
 * file drawn as the thing the person is building rather than as its table of
 * contents. Workbrain's own mark is already a node-and-edge network, so the
 * shape they assemble by finishing the interview is literally the brand mark,
 * made real in 3D.
 *
 * This file is the *visual and its maths only*. It renders, it turns, it flies
 * in, and it reports what was chosen. It knows nothing about the drawer, the
 * flow, or `wb:answers`; wiring it to those is a separate task. Everything it
 * draws is derived from its props on every render and nothing is stored —
 * pose and zoom are ephemeral session state, exactly like the drawer's own
 * height (docs/ARCHITECTURE.md, "nothing derived is stored").
 *
 * ── The five decisions worth knowing about ────────────────────────────────
 *
 * 1. **Nodes are lit spheres, not flat discs.** Each is a three-stop SVG
 *    radialGradient — a shared white-ish highlight offset to 34%/30%, then the
 *    node's own mid colour, then a deep rim — with a separate soft radial
 *    bloom behind it. That is the whole difference between a diagram and a
 *    feature visual, and it is why `color.globe.*` exists in
 *    design/tokens.json as a deeper palette than VB-01's lighter `color.brand.*`.
 *
 * 2. **The interactive layer is HTML, not SVG.** The spheres, edges and field
 *    are SVG and entirely `aria-hidden`; every control and every label is a
 *    real `<button>` in an overlay positioned in percentages over the stage.
 *    An SVG `<g tabindex>` cannot honour the 44×44 floor without a hit circle
 *    so large the twelve of them overlap into mush, and it gives a screen
 *    reader a shape where it wants a name. This way the accessibility floor
 *    (docs/GUARDRAILS.md) is plain CSS and the geometry stays pure numbers.
 *
 * 3. **Keyboard is a roving tabindex, not a tab stop per node.** One stop for
 *    the whole globe; arrow keys step between sections and the globe *turns to
 *    face* the one you land on, so a person who never touches the pointer sees
 *    the node they are on with its label the right way up. Ten tab stops that
 *    each spun a globe would make Tab-ing past the drawer intolerable. Home /
 *    End jump to the first and last section, matching the pill groups.
 *
 * 4. **Labels hide while it moves and fade in when it settles.** Non-negotiable
 *    per VB-14 — text tumbling in 3D is unreadable. Motion carries shape; rest
 *    carries information. A focused node keeps its label regardless, because a
 *    control whose name you cannot see is not a control.
 *
 * 5. **The rAF loop only exists while something is actually moving.** VB-14's
 *    own open item 3 warns that a per-frame loop would be the only
 *    continuously-running thing in this product. So there is no idle drift:
 *    the loop starts on a drag, a turn or a fly-in and stops itself the frame
 *    after the last of them finishes. It also stops if the panel is hidden.
 *    Under `prefers-reduced-motion` it never starts at all.
 */

// ── Geometry constants ─────────────────────────────────────────────────────

/** The SVG viewBox is -100..100 on both axes. One place, so the percentage
 * maths for the HTML overlay below can be read against it. */
const VIEW_HALF = 100;

/** Vertex units → view units. The solid's circumradius is ~1.9, so 33 puts
 * the silhouette at ~63 units and leaves the rest of the box for the bloom,
 * the current-section halo, and a label under the lowest node. */
const GEO = 37;

/** Resting pose. A little above the equator and turned off-axis, so the first
 * thing seen is a solid with obvious depth rather than a symmetrical badge. */
const REST_RX = 0.3;
const REST_RY = -0.5;

/** Radians per pixel dragged. A ~290px drag across the panel is most of a
 * half-turn, which is the point at which a globe feels like a globe. */
const DRAG_SENSITIVITY = 0.011;

/** Past this, a pointer gesture was a drag and the click it ends with must
 * not activate whatever it happens to finish over. */
const DRAG_SLOP_PX = 4;

/** Momentum, per frame. 0.94 gives roughly half a second of coast from a fast
 * flick, and STOP is the point below which the remaining travel is under a
 * pixel — the settle, in other words, is the friction curve's own tail. */
const FRICTION = 0.94;
const MOMENTUM_STOP = 0.0006;

/** How long the globe takes to turn to face a node picked with the keyboard.
 * 320ms — docs/design-system.html §06's value for something the size of a
 * sheet, which is what a whole globe rotating is. */
const TURN_MS = 320;

/**
 * The fly-in. 620ms, chosen from the working prototype — the earlier 320ms
 * version was rejected for popping (docs/V1.2-REFINEMENT.md).
 */
const ZOOM_MS = 620;
const ZOOM_CAMERA_PUSH = 1.5;
const ZOOM_SCALE = 0.85;

/**
 * The stagger clock runs slightly past 1, and it has to.
 *
 * VB-14 specifies each child's own progress as
 * `clamp((zoomT - 0.18 - index * 0.09) / 0.55, 0, 1)`. "About Me" has five
 * children, so the last one starts at 0.18 + 4×0.09 = 0.54 and needs 0.55
 * more to arrive — 1.09 in total. Stopping the clock at 1.0 would leave the
 * fifth child permanently 16% short of its place, which is a bug in the
 * arithmetic and not an effect anyone chose. The specified formula is
 * therefore implemented exactly and the clock is allowed to reach 1.09; the
 * *camera* still finishes in the specified 620ms, because it reads
 * `min(clock, 1)`. The tail costs 56ms.
 */
const ZOOM_TAIL = 1.09;
const CHILD_DELAY = 0.18;
const CHILD_STAGGER = 0.09;
const CHILD_SPAN = 0.55;
/** How far out the children ring the section they belong to, in view units. */
const CHILD_RING = 54;

/** The fly-in's easing, given in VB-14 as 1-(1-t)^3 — an ease-out cubic. Also
 * used for each child's own arrival, so the two read as one movement. */
function easeOutCubic(t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - (1 - clamped) ** 3;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// ── Node radius, edge weight, label weight: all folds over depth ───────────

const NODE_R_MIN = 3.0;
const NODE_R_SPAN = 5.4;
const BLOOM_SCALE = 2.7;
const EDGE_W_MIN = 0.5;
const EDGE_W_SPAN = 1.9;
/** Below this depth a label is behind the globe and is not shown at all.
 * Anything still shown stays at or above LABEL_OPACITY_MIN, which measures
 * 8.8:1 on the field — dimmer-with-distance must never mean under 4.5:1. */
const LABEL_DEPTH_FLOOR = 0.5;
const LABEL_OPACITY_MIN = 0.62;
const LABEL_SIZE_MIN = 11;
const LABEL_SIZE_SPAN = 3;

// ── Which vertex carries which section ─────────────────────────────────────

/**
 * Ten of the twelve vertices carry the file's ten sections. Two stay
 * unlabelled: the solid needs twelve and bending the shape to fit the data
 * would break the mark (docs/V1.2-REFINEMENT.md).
 *
 * The two structural ones are the *poles of the resting pose* — the topmost
 * and bottommost vertices as the globe first appears. That reads as the axis
 * the thing turns on, which is the honest job of a node with no name on it,
 * and it leaves the ten sections running top to bottom in file order so "1.
 * About This Context" is where a reader's eye starts.
 */
const REST_POSE = ICOSAHEDRON_VERTICES.map((v) => rotate(v, REST_RX, REST_RY));
const BY_HEIGHT = ICOSAHEDRON_VERTICES.map((_, i) => i).sort((a, b) => REST_POSE[b]!.y - REST_POSE[a]!.y);
const STRUCTURAL_VERTICES: readonly number[] = [BY_HEIGHT[0]!, BY_HEIGHT[BY_HEIGHT.length - 1]!];
/** The other ten, still ordered top to bottom, so section one is where a
 * reader's eye starts and section ten is at the foot of the globe. */
const SECTION_VERTICES: readonly number[] = BY_HEIGHT.filter((i) => !STRUCTURAL_VERTICES.includes(i));

/** Five gradients, cycled by vertex index — the same five-way cycle the mark
 * itself uses, so the globe and the BrandMark are visibly the same object. */
const GRADIENTS = [1, 2, 3, 4, 5] as const;
const gradientFor = (vertexIndex: number) => GRADIENTS[vertexIndex % GRADIENTS.length]!;

// ── Props ──────────────────────────────────────────────────────────────────

export interface BrainGlobeProps {
  /**
   * The file's sections, in file order — `contextOutline` from
   * core/flow/flow. Ten is the shipped number and ten is what the solid has
   * room for; a longer list degrades by drawing the first ten rather than by
   * throwing, because a picture must never be the thing that breaks a screen
   * (docs/GUARDRAILS.md).
   */
  sections: readonly FileOutlineNode[];
  /**
   * How far each section has got, keyed by section id. Absent ids read as
   * `reached`, so the component is usable as a pure showcase with no flow
   * state at all. State is never carried by colour alone: an untouched node
   * is a hollow ring rather than a lit sphere, the section being written now
   * wears a halo, and every one of the three says its state out loud in its
   * own accessible name.
   */
  states?: Readonly<Record<string, OutlineNodeState>>;
  /** Stage size in px, square. Below ~180px VB-14 hands over to the list; that
   * decision belongs to the drawer, not here. */
  size?: number;
  /** The section or sub-section now in focus — a section when one is flown
   * into, one of its children when a child is picked, null when the globe is
   * back to the whole file. The caller owns what to show for it. */
  onSelect?: (node: FileOutlineNode | null) => void;
}

// ── A frame ────────────────────────────────────────────────────────────────

interface FrameNode {
  /** Index into ICOSAHEDRON_VERTICES. */
  index: number;
  /** Depth, 0 at the back and 1 at the front. Everything visual keys off it. */
  t: number;
  /** Position in view units, before the scene transform (what SVG draws). */
  x: number;
  y: number;
  /** Position in view units, after the scene transform (where a label goes). */
  lx: number;
  ly: number;
  radius: number;
}

interface Frame {
  nodes: FrameNode[];
  /** Back-to-front paint order, as indices into `nodes`. */
  order: number[];
  /** The `transform` attribute the scene group carries this frame. */
  transform: string;
  /** Eased zoom, 0..1 — the camera's own progress. */
  ez: number;
}

function computeFrame(rx: number, ry: number, zoomClock: number, selectedVertex: number | null): Frame {
  const ez = easeOutCubic(Math.min(zoomClock, 1));
  const camera = CAMERA - ZOOM_CAMERA_PUSH * ez;
  const sceneScale = 1 + ZOOM_SCALE * ez;

  const turned: Vec3[] = ICOSAHEDRON_VERTICES.map((v) => rotate(v, rx, ry));
  const order = paintOrder(turned);

  const nodes: FrameNode[] = turned.map((v, index) => {
    const p = project(v, camera);
    return {
      index,
      t: depth(v.z),
      // SVG's y points down; the geometry's points up. The flip lives here
      // and nowhere else (see icosahedron.ts's `project`).
      x: p.x * GEO,
      y: -p.y * GEO,
      lx: 0,
      ly: 0,
      radius: (NODE_R_MIN + depth(v.z) * NODE_R_SPAN) * p.scale,
    };
  });

  // The fly-in walks the chosen node to the centre of the stage and pushes
  // the camera in behind it. `scale(S) translate(t)` maps p to S·(p + t), so
  // t = -p_selected·ez lands the selected node exactly on the origin at ez=1.
  const selected = selectedVertex === null ? null : nodes[selectedVertex];
  const tx = selected ? -selected.x * ez : 0;
  const ty = selected ? -selected.y * ez : 0;
  for (const node of nodes) {
    node.lx = (node.x + tx) * sceneScale;
    node.ly = (node.y + ty) * sceneScale;
  }

  return {
    nodes,
    order,
    transform: `scale(${sceneScale.toFixed(4)}) translate(${tx.toFixed(3)} ${ty.toFixed(3)})`,
    ez,
  };
}

/** View units → a percentage of the stage box, for the HTML overlay. Done in
 * percentages rather than pixels so the label layer stays correct at any
 * rendered size, including one the drawer clamps. */
const pct = (viewUnits: number) => ((viewUnits + VIEW_HALF) / (VIEW_HALF * 2)) * 100;

/**
 * Where a label may sit, given where its node is.
 *
 * A label is centred under its node, so a node near the rim would push half
 * its name off the stage and the stage's own `overflow: hidden` would slice
 * it. A half-word running off an edge reads as a bug, not as depth. So the
 * label — and only the label, never the 44px hit target, which stays exactly
 * on the node — slides back towards the middle, and is told how much room it
 * has left so the rest ellipses honestly.
 *
 * Both values come back as fractions of the stage's own width, because the
 * CSS applies them against `--brainglobe-size` and therefore stays correct at
 * whatever size the drawer ends up giving this.
 */
const LABEL_MARGIN_PCT = 18;
function labelPlacement(leftPct: number): { shift: string; room: string } {
  const anchor = Math.min(Math.max(leftPct, LABEL_MARGIN_PCT), 100 - LABEL_MARGIN_PCT);
  return {
    shift: ((anchor - leftPct) / 100).toFixed(4),
    room: (Math.min(anchor, 100 - anchor) / 50).toFixed(3),
  };
}

// ── The component ──────────────────────────────────────────────────────────

export function BrainGlobe({ sections, states, size = 300, onSelect }: BrainGlobeProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const pinRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const shown = useMemo(() => sections.slice(0, SECTION_VERTICES.length), [sections]);

  /**
   * Reduced motion is read into state and kept live, rather than read once at
   * mount. The drawer holds this component open for a whole interview
   * (FileDrawer.tsx never remounts its tree), so a preference captured at
   * mount would be stale for the rest of the session — the same reason
   * FileTree.tsx re-reads it per transition.
   */
  const [reduced, setReduced] = useState<boolean>(() => prefersReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    onChange();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  const [pose, setPose] = useState({ rx: REST_RX, ry: REST_RY });
  const [moving, setMoving] = useState(false);
  const [zoomClock, setZoomClock] = useState(0);
  /** Which of `shown` is flown into, or null for the whole file. */
  const [flownIndex, setFlownIndex] = useState<number | null>(null);
  /** Roving tabindex position across the ten section pins. */
  const [activeIndex, setActiveIndex] = useState(0);
  /** Which child of the flown-into section is picked, by id. */
  const [pickedChildId, setPickedChildId] = useState<string | null>(null);

  // ── Animation plumbing. Refs, not state: these change every frame and no
  // render should depend on them directly.
  const rafRef = useRef(0);
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const velocityRef = useRef({ x: 0, y: 0 });
  const turnRef = useRef<{ startedAt: number; fromRx: number; fromRy: number; dRx: number; dRy: number } | null>(null);
  const zoomRef = useRef<{ startedAt: number; from: number; to: number } | null>(null);
  const zoomClockRef = useRef(0);
  zoomClockRef.current = zoomClock;
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  }, []);

  const tick = useCallback(
    (now: number) => {
      rafRef.current = 0;
      let busy = false;
      let { rx, ry } = poseRef.current;

      // Momentum, then its own settle: the friction curve is the settle.
      const velocity = velocityRef.current;
      if (!draggingRef.current && (Math.abs(velocity.x) > MOMENTUM_STOP || Math.abs(velocity.y) > MOMENTUM_STOP)) {
        rx = clampTilt(rx + velocity.y);
        ry += velocity.x;
        velocity.x *= FRICTION;
        velocity.y *= FRICTION;
        busy = true;
      } else if (!draggingRef.current) {
        velocity.x = 0;
        velocity.y = 0;
      }

      const turn = turnRef.current;
      if (turn) {
        const p = clamp01((now - turn.startedAt) / TURN_MS);
        const eased = easeOutCubic(p);
        rx = clampTilt(turn.fromRx + turn.dRx * eased);
        ry = turn.fromRy + turn.dRy * eased;
        if (p >= 1) turnRef.current = null;
        else busy = true;
      }

      const zoom = zoomRef.current;
      if (zoom) {
        const span = Math.abs(zoom.to - zoom.from) || 1;
        const p = clamp01((now - zoom.startedAt) / (ZOOM_MS * span));
        const value = zoom.from + (zoom.to - zoom.from) * p;
        zoomClockRef.current = value;
        setZoomClock(value);
        if (p >= 1) zoomRef.current = null;
        else busy = true;
      }

      poseRef.current = { rx, ry };
      setPose({ rx, ry });

      if (busy) rafRef.current = requestAnimationFrame(tick);
      else if (!draggingRef.current) setMoving(false);
    },
    [],
  );

  const startLoop = useCallback(() => {
    if (reducedRef.current) return;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Nothing may keep ticking behind a hidden panel — VB-14's open item 3.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return;
      stopLoop();
      velocityRef.current = { x: 0, y: 0 };
      // Snap whatever was mid-flight to its end state rather than freezing it
      // half-done: coming back to a globe stuck at 40% of a fly-in would be a
      // state nobody asked for.
      const turn = turnRef.current;
      if (turn) {
        turnRef.current = null;
        const settled = { rx: clampTilt(turn.fromRx + turn.dRx), ry: turn.fromRy + turn.dRy };
        poseRef.current = settled;
        setPose(settled);
      }
      const zoom = zoomRef.current;
      if (zoom) {
        zoomRef.current = null;
        zoomClockRef.current = zoom.to;
        setZoomClock(zoom.to);
      }
      setMoving(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stopLoop]);

  useEffect(() => stopLoop, [stopLoop]);

  // ── Turning to face a node (the keyboard's own rotation) ─────────────────

  const faceVertex = useCallback(
    (vertexIndex: number) => {
      const target = faceRotation(ICOSAHEDRON_VERTICES[vertexIndex]!);
      if (reducedRef.current) {
        turnRef.current = null;
        poseRef.current = target;
        setPose(target);
        return;
      }
      velocityRef.current = { x: 0, y: 0 };
      const from = poseRef.current;
      turnRef.current = {
        startedAt: performance.now(),
        fromRx: from.rx,
        fromRy: from.ry,
        dRx: clampTilt(target.rx) - from.rx,
        dRy: shortestTurn(from.ry, target.ry),
      };
      setMoving(true);
      startLoop();
    },
    [startLoop],
  );

  // ── Flying in and out ────────────────────────────────────────────────────

  const runZoom = useCallback(
    (to: number) => {
      if (reducedRef.current) {
        zoomRef.current = null;
        zoomClockRef.current = to;
        setZoomClock(to);
        return;
      }
      zoomRef.current = { startedAt: performance.now(), from: zoomClockRef.current, to };
      startLoop();
    },
    [startLoop],
  );

  const flyInto = useCallback(
    (index: number) => {
      setFlownIndex(index);
      setActiveIndex(index);
      setPickedChildId(null);
      runZoom(ZOOM_TAIL);
      onSelect?.(shown[index] ?? null);
    },
    [onSelect, runZoom, shown],
  );

  const flyOut = useCallback(() => {
    setFlownIndex(null);
    setPickedChildId(null);
    runZoom(0);
    onSelect?.(null);
  }, [onSelect, runZoom]);

  // ── Pointer: drag to rotate ──────────────────────────────────────────────

  /** `x`/`y` track the previous move (for velocity); `ox`/`oy` stay on the
   * press, so total travel decides drag-versus-click however slowly it moved. */
  const pointerRef = useRef({ id: -1, x: 0, y: 0, ox: 0, oy: 0, at: 0 });

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    draggingRef.current = true;
    draggedRef.current = false;
    velocityRef.current = { x: 0, y: 0 };
    turnRef.current = null;
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      ox: event.clientX,
      oy: event.clientY,
      at: performance.now(),
    };
    // Deliberately NOT capturing here. Capturing on pointerdown retargets the
    // matching pointerup to the stage, and the browser then computes the
    // click against the stage instead of the pin that was pressed — a globe
    // whose nodes cannot be clicked. Capture starts below, the moment the
    // gesture is genuinely a drag, which is also exactly when the click that
    // ends it should stop counting.
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || event.pointerId !== pointerRef.current.id) return;
    const dx = event.clientX - pointerRef.current.x;
    const dy = event.clientY - pointerRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
    const travelled = Math.hypot(event.clientX - pointerRef.current.ox, event.clientY - pointerRef.current.oy);
    if (!draggedRef.current && travelled > DRAG_SLOP_PX) {
      draggedRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    const now = performance.now();
    const dt = Math.max(1, now - pointerRef.current.at);
    pointerRef.current = {
      ...pointerRef.current,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: now,
    };

    const next = {
      rx: clampTilt(poseRef.current.rx + dy * DRAG_SENSITIVITY),
      ry: poseRef.current.ry + dx * DRAG_SENSITIVITY,
    };
    poseRef.current = next;
    setPose(next);
    if (!reducedRef.current) {
      setMoving(true);
      // Velocity is per-frame, so per-ms travel is scaled by a 16ms frame.
      velocityRef.current = {
        x: (dx * DRAG_SENSITIVITY * 16) / dt,
        y: (dy * DRAG_SENSITIVITY * 16) / dt,
      };
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (reducedRef.current) {
      velocityRef.current = { x: 0, y: 0 };
      setMoving(false);
      return;
    }
    // A flick throws it; a slow drag that ended still simply stops.
    if (performance.now() - pointerRef.current.at > 90) velocityRef.current = { x: 0, y: 0 };
    if (Math.abs(velocityRef.current.x) > MOMENTUM_STOP || Math.abs(velocityRef.current.y) > MOMENTUM_STOP) startLoop();
    else setMoving(false);
  };

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const moveActive = useCallback(
    (delta: number) => {
      if (shown.length === 0) return;
      const next = (activeIndex + delta + shown.length) % shown.length;
      setActiveIndex(next);
      pinRefs.current[next]?.focus();
      faceVertex(SECTION_VERTICES[next]!);
    },
    [activeIndex, faceVertex, shown.length],
  );

  const jumpActive = useCallback(
    (next: number) => {
      if (shown.length === 0) return;
      setActiveIndex(next);
      pinRefs.current[next]?.focus();
      faceVertex(SECTION_VERTICES[next]!);
    },
    [faceVertex, shown.length],
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        return;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        return;
      case 'Home':
        event.preventDefault();
        jumpActive(0);
        return;
      case 'End':
        event.preventDefault();
        jumpActive(shown.length - 1);
        return;
      case 'Escape':
        if (flownIndex === null) return;
        event.preventDefault();
        flyOut();
        pinRefs.current[activeIndex]?.focus();
        return;
      default:
    }
  };

  // ── This frame ───────────────────────────────────────────────────────────

  const flownVertex = flownIndex === null ? null : SECTION_VERTICES[flownIndex]!;
  const frame = useMemo(
    () => computeFrame(pose.rx, pose.ry, zoomClock, flownVertex),
    [pose.rx, pose.ry, zoomClock, flownVertex],
  );

  const sectionByVertex = useMemo(() => {
    const map = new Map<number, { section: FileOutlineNode; index: number }>();
    shown.forEach((section, index) => map.set(SECTION_VERTICES[index]!, { section, index }));
    return map;
  }, [shown]);

  const stateWord: Record<OutlineNodeState, string> = {
    current: S.fileTreeStateCurrent,
    reached: S.fileTreeStateReached,
    untouched: S.fileTreeStateUntouched,
  };
  const stateOf = (section: FileOutlineNode): OutlineNodeState => states?.[section.id] ?? 'reached';

  /** Past this the fly-in has committed, and the sections left behind stop
   * being controls — they are not on screen to be pressed. */
  const inside = zoomClock >= 0.7 && flownIndex !== null;
  const flownSection = flownIndex === null ? null : shown[flownIndex];
  const children = flownSection?.children ?? [];
  const flownNode = flownVertex === null ? null : frame.nodes[flownVertex]!;

  const childLayout = children.map((child, i) => {
    const progress = easeOutCubic(clamp01((zoomClock - CHILD_DELAY - i * CHILD_STAGGER) / CHILD_SPAN));
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, children.length);
    const originX = flownNode?.lx ?? 0;
    const originY = flownNode?.ly ?? 0;
    return {
      child,
      progress,
      x: originX + Math.cos(angle) * CHILD_RING * progress,
      y: originY + Math.sin(angle) * CHILD_RING * progress,
      radius: 3.2 + 2.6 * progress,
      gradient: GRADIENTS[i % GRADIENTS.length]!,
    };
  });

  const rootStyle = { '--brainglobe-size': `${size}px` } as CSSProperties;

  return (
    <div
      className="brainglobe"
      style={rootStyle}
      data-moving={moving ? 'true' : 'false'}
      data-inside={inside ? 'true' : 'false'}
      data-reduced={reduced ? 'true' : 'false'}
      data-zoom={frame.ez.toFixed(3)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
    >
      {/* Every pixel of the picture. Decorative in the strict sense: the
          overlay below carries the same information as real text, so nothing
          here is the only way to learn anything. */}
      <svg className="brainglobe-svg" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false">
        <defs>
          <radialGradient id={`${uid}-field`} cx="50%" cy="42%" r="72%">
            <stop offset="0%" className="brainglobe-stop-glow" />
            <stop offset="100%" className="brainglobe-stop-field" />
          </radialGradient>
          {GRADIENTS.map((n) => (
            // A lit sphere, not a disc: the highlight is offset up and left of
            // centre (34%/30%, VB-14's own numbers) so every node is lit from
            // one place, and the rim goes to a deep colour rather than to the
            // same hue dimmed.
            <radialGradient key={`s${n}`} id={`${uid}-s${n}`} cx="34%" cy="30%" r="72%">
              <stop offset="0%" className="brainglobe-stop-hi" />
              <stop offset="36%" className={`brainglobe-stop-mid-${n}`} />
              <stop offset="100%" className={`brainglobe-stop-deep-${n}`} />
            </radialGradient>
          ))}
          {GRADIENTS.map((n) => (
            // The bloom. A separate, much larger radial behind the sphere, in
            // the sphere's own mid colour, fading to nothing — this is what
            // makes a node look like it is emitting rather than printed.
            <radialGradient key={`b${n}`} id={`${uid}-b${n}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" className={`brainglobe-stop-mid-${n}`} stopOpacity="0.55" />
              <stop offset="45%" className={`brainglobe-stop-mid-${n}`} stopOpacity="0.17" />
              <stop offset="100%" className={`brainglobe-stop-mid-${n}`} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        <rect className="brainglobe-field" x="-100" y="-100" width="200" height="200" fill={`url(#${uid}-field)`} />

        <g className="brainglobe-scene" transform={frame.transform}>
          {/* Edges first, whole. Two lines each: a constant far-colour base
              and a near-colour highlight whose opacity is depth, which gives a
              continuous colour cue instead of a two-step one. */}
          <g className="brainglobe-edges" opacity={(1 - frame.ez * 0.92).toFixed(3)}>
            {ICOSAHEDRON_EDGES.map(([a, b], i) => {
              const na = frame.nodes[a]!;
              const nb = frame.nodes[b]!;
              const t = (na.t + nb.t) / 2;
              const width = EDGE_W_MIN + t * EDGE_W_SPAN;
              return (
                <g key={i} data-edge={`${a}-${b}`}>
                  <line
                    className="brainglobe-edge-far"
                    x1={na.x}
                    y1={na.y}
                    x2={nb.x}
                    y2={nb.y}
                    strokeWidth={width.toFixed(2)}
                    strokeOpacity={(0.22 + t * 0.3).toFixed(3)}
                    strokeLinecap="round"
                  />
                  <line
                    className="brainglobe-edge-near"
                    x1={na.x}
                    y1={na.y}
                    x2={nb.x}
                    y2={nb.y}
                    strokeWidth={width.toFixed(2)}
                    strokeOpacity={(t ** 1.6 * 0.78).toFixed(3)}
                    strokeLinecap="round"
                  />
                </g>
              );
            })}
          </g>

          {/* Painter's algorithm: back to front, so a near sphere and its
              bloom cover the far ones rather than the other way round. */}
          <g className="brainglobe-nodes">
            {frame.order.map((vertexIndex) => {
              const node = frame.nodes[vertexIndex]!;
              const entry = sectionByVertex.get(vertexIndex);
              const gradient = gradientFor(vertexIndex);
              const state = entry ? stateOf(entry.section) : 'reached';
              const structural = !entry;
              const lit = !structural && state !== 'untouched';
              const fade = flownIndex !== null && entry?.index !== flownIndex ? 1 - frame.ez * 0.86 : 1;

              return (
                <g
                  key={vertexIndex}
                  className="brainglobe-node"
                  data-node-index={vertexIndex}
                  data-section-id={entry?.section.id ?? ''}
                  data-node-state={structural ? 'structural' : state}
                  data-depth={node.t.toFixed(3)}
                  opacity={((structural ? 0.34 : 0.62 + node.t * 0.38) * fade).toFixed(3)}
                >
                  {lit && (
                    <circle
                      className="brainglobe-bloom"
                      cx={node.x}
                      cy={node.y}
                      r={(node.radius * BLOOM_SCALE).toFixed(2)}
                      fill={`url(#${uid}-b${gradient})`}
                      opacity={(0.25 + node.t * 0.75).toFixed(3)}
                    />
                  )}
                  {state === 'current' && !structural && (
                    <circle
                      className="brainglobe-halo"
                      cx={node.x}
                      cy={node.y}
                      r={(node.radius + 3.4).toFixed(2)}
                      fill="none"
                      strokeWidth={(0.8 + node.t * 0.9).toFixed(2)}
                    />
                  )}
                  {structural || state !== 'untouched' ? (
                    <circle
                      className="brainglobe-sphere"
                      cx={node.x}
                      cy={node.y}
                      r={(structural ? node.radius * 0.62 : node.radius).toFixed(2)}
                      fill={`url(#${uid}-s${gradient})`}
                    />
                  ) : (
                    // Not a dimmer sphere — a different shape. State is never
                    // carried by colour alone (docs/GUARDRAILS.md), and an
                    // outline against a solid reads instantly at 12px.
                    <g className="brainglobe-hollow">
                      <circle
                        className="brainglobe-hollow-ring"
                        cx={node.x}
                        cy={node.y}
                        r={(node.radius * 0.86).toFixed(2)}
                        fill="none"
                        strokeWidth={(0.7 + node.t * 0.8).toFixed(2)}
                      />
                      <circle className="brainglobe-hollow-dot" cx={node.x} cy={node.y} r={(node.radius * 0.2).toFixed(2)} />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </g>

        {/* Children live outside the scene transform: the section they belong
            to has already been walked to the origin, so they ring the origin
            and never inherit the camera push twice. */}
        <g className="brainglobe-children-layer">
          {childLayout.map(({ child, progress, x, y, radius, gradient }) =>
            progress <= 0 ? null : (
              <g key={child.id} className="brainglobe-child-node" data-child-id={child.id} opacity={progress.toFixed(3)}>
                <circle
                  className="brainglobe-bloom"
                  cx={x}
                  cy={y}
                  r={(radius * BLOOM_SCALE).toFixed(2)}
                  fill={`url(#${uid}-b${gradient})`}
                  opacity={(progress * 0.8).toFixed(3)}
                />
                <circle className="brainglobe-sphere" cx={x} cy={y} r={radius.toFixed(2)} fill={`url(#${uid}-s${gradient})`} />
              </g>
            ),
          )}
        </g>
      </svg>

      {/* The whole interactive layer. Real buttons, real text, positioned in
          percentages over the stage. */}
      <div className="brainglobe-pins" role="group" aria-label={S.brainGlobeStage} aria-describedby={`${uid}-help`}>
        {frame.order
          .map((vertexIndex) => ({ vertexIndex, entry: sectionByVertex.get(vertexIndex) }))
          .filter((item): item is { vertexIndex: number; entry: { section: FileOutlineNode; index: number } } => !!item.entry)
          .map(({ vertexIndex, entry }) => {
            const node = frame.nodes[vertexIndex]!;
            const state = stateOf(entry.section);
            const isFlown = entry.index === flownIndex;
            const visible = reduced || node.t >= LABEL_DEPTH_FLOOR || isFlown;
            // Depth sets a label's opacity; flying into a section also takes
            // the other nine's names down with their spheres, so the one you
            // are inside is the only thing left to read.
            const labelFade = flownIndex !== null && !isFlown ? 1 - frame.ez * 0.95 : 1;
            const labelOpacity = (LABEL_OPACITY_MIN + node.t * (1 - LABEL_OPACITY_MIN)) * labelFade;
            const left = pct(node.lx);
            const style = {
              left: `${left}%`,
              top: `${pct(node.ly)}%`,
              '--brainglobe-label-opacity': visible ? labelOpacity.toFixed(3) : '0',
              '--brainglobe-label-size': `${(LABEL_SIZE_MIN + node.t * LABEL_SIZE_SPAN).toFixed(1)}px`,
              '--brainglobe-label-weight': String(Math.round((450 + node.t * 150) / 50) * 50),
              '--brainglobe-label-shift': labelPlacement(left).shift,
              '--brainglobe-label-room': labelPlacement(left).room,
            } as CSSProperties;

            return (
              <button
                key={entry.section.id}
                type="button"
                ref={(el) => {
                  pinRefs.current[entry.index] = el;
                }}
                className="brainglobe-pin"
                data-section-id={entry.section.id}
                data-node-state={state}
                data-depth={node.t.toFixed(3)}
                data-label-hidden={visible ? 'false' : 'true'}
                style={style}
                hidden={inside && !isFlown}
                tabIndex={entry.index === activeIndex ? 0 : -1}
                aria-pressed={isFlown}
                // The state, in words, on every node — because the picture
                // says it with a shape and a halo, and neither of those
                // reaches a screen reader. The visible label is contained in
                // the name, so voice control still works (WCAG 2.5.3).
                aria-label={S.brainGlobeNode(entry.section.label, stateWord[state])}
                onFocus={() => setActiveIndex(entry.index)}
                onClick={() => {
                  if (draggedRef.current) return;
                  if (isFlown) {
                    flyOut();
                    return;
                  }
                  flyInto(entry.index);
                }}
              >
                <span className="brainglobe-hit" aria-hidden="true" />
                <span className="brainglobe-label" aria-hidden="true">
                  {entry.section.label}
                </span>
              </button>
            );
          })}

        {childLayout.map(({ child, progress, x, y }) =>
          progress <= 0 ? null : (
            <button
              key={child.id}
              type="button"
              className="brainglobe-pin is-child"
              data-child-id={child.id}
              data-picked={pickedChildId === child.id ? 'true' : 'false'}
              style={
                {
                  left: `${pct(x)}%`,
                  top: `${pct(y)}%`,
                  '--brainglobe-label-opacity': progress.toFixed(3),
                  '--brainglobe-label-size': `${LABEL_SIZE_MIN - 0.5}px`,
                  '--brainglobe-label-weight': '550',
                  '--brainglobe-label-shift': labelPlacement(pct(x)).shift,
                  '--brainglobe-label-room': labelPlacement(pct(x)).room,
                } as CSSProperties
              }
              onClick={() => {
                if (draggedRef.current) return;
                setPickedChildId(child.id);
                onSelect?.(child);
              }}
            >
              <span className="brainglobe-hit" aria-hidden="true" />
              <span className="brainglobe-label">{child.label}</span>
            </button>
          ),
        )}
      </div>

      {flownSection && (
        <button type="button" className="brainglobe-back" onClick={flyOut} hidden={!inside}>
          {S.brainGlobeBack}
        </button>
      )}

      {/* Said once, to whoever needs it, and never printed on the picture. */}
      <p className="brainglobe-sr" id={`${uid}-help`}>
        {S.brainGlobeHelp}
      </p>
      <p className="brainglobe-sr" aria-live="polite">
        {flownSection ? S.brainGlobeInside(flownSection.label) : ''}
      </p>
    </div>
  );
}
