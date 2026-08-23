import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { FileOutlineNode } from '../../schema/flow.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import type { NodeDetail } from '../../core/flow/nodeDetails';
import { globeLabelFor } from '../../core/flow/globeLabels';
import { EDGE_LIGHT_LEVEL, edgeLight, globeNodeState, isUnifiedGlow } from '../../core/globe/illumination';
import type { GlobeNodeState } from '../../core/globe/illumination';
import type { SectionHealth } from '../../core/freshness/sectionHealth';
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
 * 1. **Every node is a solid orb.** Since V1.4 VB-23 an answered one is one flat
 *    fill — `color.globe.node-N-solid` — and not the three-stop radial with a
 *    white specular dot it wore in V1.2. The dot made twelve small circles look
 *    like twelve small glass beads; a saturated solid on a near-black field
 *    reads as something *emitting*, which is what a bloom behind it was always
 *    trying to say. Solid is not flat: depth still moves radius, still moves
 *    group opacity, and now also sinks a far orb toward its own deep colour
 *    (`brainglobe-shade`), so the back of the solid recedes without any node
 *    changing shape. V1.5 VB-24 finished the thought — an unanswered node is
 *    the same orb turned down rather than a hollow ring (see below).
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
 *    continuously-running thing in this product. So the loop starts on a drag,
 *    a turn or a fly-in and stops itself the frame after the last of them
 *    finishes. It also stops if the panel is hidden. Under
 *    `prefers-reduced-motion` it never starts at all.
 *
 *    V1.2 VB-14b adds the one exception, and hedges it about: `drift`, an
 *    opt-in slow idle turn, off unless the caller asks for it. See DRIFT_RATE
 *    below for the four separate conditions that stop it.
 *
 * ── V1.4 VB-23: what happens inside a section ─────────────────────────────
 *
 * Flying in used to leave a haloed centre with its children ringing it, all of
 * them floating unattached, and picking one did nothing you could see. Three
 * changes, and they are one idea: **hierarchy by size and by attachment**.
 *
 *  - The centre orb grows to a fixed CENTRE_R as the camera arrives, so it is
 *    reliably ~2.7× the sub-nodes whatever pose it was clicked from — and its
 *    halo goes, because a ring around the biggest thing on a stage is saying
 *    something the size already said.
 *  - Faint lines run from the centre orb's rim to each sub-node's rim, so the
 *    cluster is a thing with parts rather than six circles that happen to be
 *    near each other. Trimmed at both ends by real radii, which is why they
 *    still look right at every stage of the stagger.
 *  - Picking a sub-node **splits the stage**: that orb travels to a feature
 *    position on the left and everything else in the cluster fades, while a
 *    panel of what the sub-section actually holds opens on the right. At 400px
 *    that panel is ~200px wide, which is the whole reason `NodeDetail.wide`
 *    exists in core/flow/nodeDetails.ts — see its `WIDE_VALUE_CHARS` comment
 *    for the measurement that settled these proportions against `2.1 Roles`
 *    with three records, the longest real sub-section there is.
 *
 * ── V1.5 VB-24 / VB-25 / VB-26: the illumination model ────────────────────
 *
 * One idea in three parts: **the globe stops being a diagram of progress and
 * becomes a picture of a system coming alive.**
 *
 *  - **VB-24. No hollow rings.** An unanswered node used to be an outline with
 *    a dot in it, which reads as a placeholder for an orb that does not exist
 *    yet. Every node is a real part of the model from question one, so an
 *    unanswered one is now the *same solid orb, turned down*: its own hue at
 *    `color.globe.node-N-muted`, about half an answered orb's luminance, with
 *    no bloom behind it and at the ring's old footprint (MUTED_R_SCALE). The
 *    difference is brightness and saturation, not presence versus absence —
 *    and it survives greyscale, because three separate cues carry it (the
 *    brightness, the missing bloom, the smaller radius) on top of the state
 *    word every node already says in its accessible name.
 *
 *  - **VB-25. Edges brighten from both ends.** An edge between two answered
 *    sections is bright, an edge with one answered end is mid, an edge between
 *    two untouched ones is dim — so illumination *spreads along the structure*
 *    as the interview proceeds instead of appearing node by node. The rule is a
 *    pure function of both endpoints in core/globe/illumination.ts, tested at
 *    every combination; nothing here decides anything, it multiplies.
 *
 *  - **VB-25's complete state.** When every section is answered, complete and
 *    fresh — VB-19's `done`, on VB-19's own clocks, never a second definition —
 *    the whole model resolves to ONE colour (`color.globe.unified`) and stops
 *    being a network of differently-lit parts. It is a **state**, not a reward:
 *    no flourish fires when it arrives, nothing counts how long it is held, and
 *    when a section goes stale it simply stops being true. Losing it reads as
 *    "something is out of date", which is the information, and never as failure
 *    (docs/GUARDRAILS.md rules out badges, streaks and guilt, and this is the
 *    easiest line in the product to cross).
 *
 *  - **VB-26. Labels are icon lettering.** `type.label` from design/tokens.json
 *    — 12px / 650 / +0.08em / uppercase — scaled for depth. That treatment is a
 *    third wider than what the labels wore before and the token's own comment
 *    caps it at "2–3 words", so the globe gets short display names from
 *    core/flow/globeLabels.ts while the file keeps its real ones. The full name
 *    stays on the node as its `title`.
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

/**
 * V1.2 VB-14b — the idle drift, in radians a second.
 *
 * A full turn takes just over a minute. At a 260px stage that is under 9px a
 * second at the equator: slow enough to read a label straight through, fast
 * enough that the globe is obviously a live object rather than a picture of
 * one. It deliberately does NOT set `data-moving` — that flag means "moving
 * too fast to read", and hiding every label for as long as the drawer is open
 * would throw away the thing labels are for.
 *
 * Four separate things stop it, and it is worth listing them in one place
 * because VB-14's open item 3 is explicit that this is the only unending
 * motion in the product:
 *
 *  1. the caller not asking for it (`drift`, default false) — which is how the
 *     drawer stops it at the peek and in List mode (core/drawer/mode.ts);
 *  2. `prefers-reduced-motion`, which stops every loop in this component;
 *  3. the panel losing visibility (`document.visibilityState`), below;
 *  4. any real gesture — a drag, a keyboard turn, a fly-in — which owns the
 *     pose while it runs and hands it back when it is done.
 */
const DRIFT_RATE = 0.1;

/**
 * How often a drift frame is actually applied, in ms.
 *
 * The loop still runs at the display's rate, because that is the only clock a
 * browser offers, but it only *does the work* — recompute twelve rotations,
 * re-render ninety-odd SVG elements — every other frame. At DRIFT_RATE a 60Hz
 * frame turns the globe by 0.0017 radians, about a sixth of a pixel at the
 * equator, so nobody can see the difference between 60 and 30 updates a second
 * and it costs half as much main thread for as long as the drawer is open.
 */
const DRIFT_FRAME_MS = 32;

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
/** A sub-node's own radius, from the moment it leaves the centre to the moment
 * it arrives. Its arrived value, 5.8, is the number CENTRE_R is set against. */
const CHILD_R_MIN = 3.2;
const CHILD_R_SPAN = 2.6;

/**
 * V1.4 VB-23 — the centre orb's radius once the camera has arrived, in view
 * units, *after* the scene transform.
 *
 * Fixed, rather than "whatever the vertex's own depth makes it", and that is
 * the point. A section clicked while it faced the camera drew at ~22 units and
 * the same section clicked edge-on drew at ~10 — sometimes four times a
 * sub-node, sometimes not quite twice one. Hierarchy that depends on which way
 * the globe happened to be turned is not hierarchy. 15.5 against an arrived
 * sub-node's 5.8 is a hair under 2.7×: unmistakably the parent, without
 * crowding the ring at CHILD_RING.
 */
const CENTRE_R = 15.5;

/**
 * The split, in ms and in view units.
 *
 * 320ms is docs/design-system.html §06's drawer value, and a whole stage
 * re-forming into two columns is the drawer-sized change on this surface. The
 * feature position is left of centre and dead on the vertical middle; the
 * panel that opens beside it starts at DETAIL_LEFT_PCT (BrainGlobe.css), and
 * FEATURE_X is set so the orb sits in the middle of what is left.
 */
const SPLIT_MS = 320;
/* -58 and 19 are measured against the SMALLEST stage the drawer opens Brain
   at — 260px, where the left column is 91px and this orb is 49px of it. A
   feature position tuned at the drawer's full height would have the orb
   touching the panel at its resting one. */
const FEATURE_X = -58;
const FEATURE_Y = 0;
const FEATURE_R = 19;

/** The connection lines from the centre orb to each sub-node. Faint on
 * purpose — VB-23 asks for "attached", not for a second graph competing with
 * the orbs — and trimmed to the rims at both ends so they read as joints. */
const LINK_WIDTH = 0.7;
const LINK_OPACITY = 0.4;

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
/**
 * V1.4 VB-23. How far the back of the solid sinks toward each orb's own deep
 * colour — the third depth cue, and the one that keeps a flat fill from
 * reading as a flat drawing.
 *
 * 0.42, screenshotted rather than reasoned: a far orb already carries the
 * group's own 0.62 opacity against the field, and at 0.5 the two together took
 * the teal ones at the back to something indistinguishable from the stage. At
 * 0.42 the back of the solid is plainly further away and still plainly a
 * colour.
 */
const SHADE_DEPTH = 0.42;

/**
 * V1.5 VB-24 — the two numbers that keep a muted orb an orb.
 *
 * `MUTED_SHADE_DEPTH` is the far-side sink for an unanswered node, and it is
 * deliberately gentler than the answered one's 0.42. An answered orb can afford
 * to sink: it has a bloom around it holding its place. A muted orb has nothing
 * behind it, so the same 0.42 at the back of the solid took it to within 1.5:1
 * of the stage — VB-24's "must not collapse into the field colour", exactly.
 * At 0.24 the far muted orb still measures ~2:1 against the field it sits on and
 * is still visibly further away than the near ones.
 *
 * `MUTED_R_SCALE` is the hollow ring's own old footprint, kept on purpose. The
 * ring drew at 0.86 of the node radius, so an unanswered node occupies exactly
 * the space it always did — and the small size difference is a second cue that
 * survives greyscale, on top of the brightness and the missing bloom.
 */
const MUTED_SHADE_DEPTH = 0.24;
const MUTED_R_SCALE = 0.86;

const EDGE_W_MIN = 0.5;
const EDGE_W_SPAN = 1.9;
/**
 * V1.5 VB-25. How much of an edge is structure and how much is illumination.
 *
 * The base line is the strut: it is drawn at the same weight whatever the two
 * ends are doing, because the model is a real object from question one and its
 * branches do not appear as they are earned. The near line is the light, and
 * it is what core/globe/illumination.ts's level multiplies — so "two answered
 * ends" is a bright branch and "neither" is a branch you can still see.
 */
const EDGE_BASE_OPACITY_MIN = 0.16;
const EDGE_BASE_OPACITY_SPAN = 0.22;
const EDGE_LIT_OPACITY = 0.86;
/** Below this depth a label is behind the globe and is not shown at all.
 * Anything still shown stays at or above LABEL_OPACITY_MIN, which measures
 * 8.8:1 on the field — dimmer-with-distance must never mean under 4.5:1. */
const LABEL_DEPTH_FLOOR = 0.5;
const LABEL_OPACITY_MIN = 0.62;
/**
 * V1.5 VB-26 — `type.label`, scaled for depth.
 *
 * design/tokens.json gives the treatment as 12px / 650 / +0.08em / uppercase.
 * A globe cannot use one flat size — a far label has to read as further away —
 * so the token's 12 is the middle of a range rather than a constant: 11.2 at
 * the very back, 13.2 at the very front, and weight from 600 to 700 around the
 * same centre. The floor is what matters and it is not a taste decision: 11px
 * is the smallest text this product draws anywhere, and the label opacity floor
 * above keeps even that at 8.8:1 on the field.
 */
const LABEL_SIZE_MIN = 11.2;
const LABEL_SIZE_SPAN = 2;
const LABEL_WEIGHT_MIN = 600;
const LABEL_WEIGHT_SPAN = 100;

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

/**
 * Which of the five gradients the n-th section wears, by its position in the
 * file. Exported for V1.2 VB-14b's morph: the node that flies out of the globe
 * and into a list row has to be the colour of the sphere it left, and the only
 * place that knows which sphere that is, is the vertex map above.
 */
export function sectionNodeGradient(sectionIndex: number): number {
  const vertex = SECTION_VERTICES[sectionIndex % SECTION_VERTICES.length];
  return vertex === undefined ? GRADIENTS[0] : gradientFor(vertex);
}

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
   * state at all. State is never carried by colour alone: an untouched node is
   * a smaller, dimmer orb with no bloom behind it (V1.5 VB-24), the section
   * being written now wears a halo, and every one of the three says its state
   * out loud in its own accessible name.
   */
  states?: Readonly<Record<string, OutlineNodeState>>;
  /**
   * V1.5 VB-25. Each section's health — `sectionHealthMap` from
   * core/freshness/sectionHealth.ts, the same derivation the List mode's rows
   * are drawn from. The globe reads exactly one thing from it: whether every
   * section is answered, complete and still inside its own half-life, which is
   * when the whole model resolves to one glow colour.
   *
   * Optional, and its absence simply means "not unified" rather than a bug: the
   * globe is usable as a pure showcase with no flow state at all, and a picture
   * must never be the thing that breaks a screen (docs/GUARDRAILS.md). Nothing
   * about it is stored — it is recomputed from `wb:answers` per render, and the
   * unified state is recomputed from it here.
   */
  health?: Readonly<Record<string, SectionHealth>>;
  /** Stage size in px, square. Below ~180px VB-14 hands over to the list; that
   * decision belongs to the drawer, not here. */
  size?: number;
  /**
   * V1.2 VB-14b. Whether the globe turns slowly by itself while nothing is
   * touching it. **Off unless asked for**, because this is the only unending
   * motion in the product and VB-14's open item 3 requires it to be paid for
   * deliberately — see DRIFT_RATE for the four things that stop it. The
   * caller decides *when* it is worth having (core/drawer/mode.ts's
   * `brainDriftAllowed`); this component decides what it looks like.
   */
  drift?: boolean;
  /**
   * V1.4 VB-23. What each node holds, keyed by node id — the cells the split's
   * detail panel draws. Built by `nodeDetailsByNode` in core/flow/nodeDetails.ts
   * from `wb:answers`; nothing here is stored and nothing is derived twice.
   *
   * Optional, and its absence is a real state rather than a bug: the globe is
   * usable as a pure showcase with no flow state at all, and a node with no
   * entry says so in one sentence instead of drawing empty boxes. The split
   * itself still happens — the sub-node still moves, the panel still opens
   * with its name — because degradation means doing less, never doing nothing
   * (docs/GUARDRAILS.md).
   */
  details?: Readonly<Record<string, readonly NodeDetail[]>>;
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
  /** What the scene group is scaled by this frame. Published because a radius
   * that has to end up at a fixed *on-screen* size has to be divided by it —
   * see CENTRE_R and the flown node's radius below. */
  sceneScale: number;
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
    sceneScale,
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

// ── The split's information panel ──────────────────────────────────────────

/**
 * The grid of what a sub-section holds — V1.4 VB-23's "information panel on
 * the right".
 *
 * Three decisions, all of them forced by 400px:
 *
 * 1. **The answer is the cell, the question is its caption.** Every question in
 *    this interview is a whole spoken sentence ("Is this your primary role, a
 *    secondary role, or something occasional?"), and a grid whose labels are
 *    sentences is a list. So the person's own words are the loud line and the
 *    question sits under them, two lines at most, with the whole of it in
 *    `title` for anyone who wants it. Nothing they *said* is ever clipped.
 * 2. **Records become headings, not indentation.** Three roles are three
 *    headings, exactly as the generated file prints them — indentation at this
 *    width would cost more than it explains.
 * 3. **A `<dl>`, because these are name/value pairs.** Grouped in `<div>`s,
 *    which is valid inside a description list and is what lets each pair be
 *    one grid cell.
 *
 * **No headings in here, deliberately.** A record's title looks like an `<h4>`
 * and is not one: this component is dropped into a drawer whose own heading is
 * an `<h2>`, and into a bare harness page whose first heading is an `<h1>`, so
 * any level hard-coded here is wrong somewhere and axe's `heading-order` says
 * so. Each record is a named `role="group"` instead, labelled by the very text
 * that is drawn — which is the structure a record actually has, and it needs no
 * knowledge of what is above it on the page.
 *
 * Empty is a real state and says so in a sentence: a section nobody has
 * answered yet draws no boxes at all (core/flow/nodeDetails.ts).
 */
function DetailGrid({ details }: { details: readonly NodeDetail[] }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (details.length === 0) {
    return <p className="brainglobe-detail-empty">{S.brainGlobeDetailEmpty}</p>;
  }

  // Consecutive runs of the same group, in the order core handed them over —
  // never sorted, so the panel reads in the order the file writes.
  const groups: Array<{ group: string; cells: NodeDetail[] }> = [];
  for (const detail of details) {
    const last = groups[groups.length - 1];
    if (last && last.group === detail.group) last.cells.push(detail);
    else groups.push({ group: detail.group, cells: [detail] });
  }

  return (
    <>
      {groups.map(({ group, cells }, index) => (
        <div
          className="brainglobe-detail-group"
          key={`${group}-${index}`}
          {...(group ? { role: 'group', 'aria-labelledby': `${uid}-g${index}` } : {})}
        >
          {group && (
            <p className="brainglobe-detail-record" id={`${uid}-g${index}`}>
              {group}
            </p>
          )}
          <dl className="brainglobe-detail-grid">
            {cells.map((cell, cellIndex) => (
              <div
                className="brainglobe-detail-cell"
                key={`${cell.label}-${cellIndex}`}
                data-wide={cell.wide ? 'true' : 'false'}
              >
                {/* `dt` before `dd`, which is the order HTML requires inside a
                    description list and the order a screen reader wants:
                    question, then answer. The cell shows them the other way up
                    — the answer is the content — and that is one `order` in
                    BrainGlobe.css rather than invalid markup here. */}
                <dt className="brainglobe-detail-key" title={cell.label}>
                  {cell.label}
                </dt>
                <dd className="brainglobe-detail-value">{cell.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}

// ── The component ──────────────────────────────────────────────────────────

export function BrainGlobe({ sections, states, health, size = 300, drift = false, details, onSelect }: BrainGlobeProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const pinRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** The sub-node buttons, by child id. Keyed rather than indexed: which
   * children exist changes with the section flown into, and Escape has to put
   * focus back on the one it just closed. */
  const childPinRefs = useRef(new Map<string, HTMLButtonElement>());

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
  /** V1.4 VB-23. The split's own clock, 0 (the ring) to 1 (feature left,
   * panel right). Its own clock and not derived from `pickedChildId`, so the
   * orb travels rather than teleports — and so it can travel back. */
  const [splitClock, setSplitClock] = useState(0);

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
  const splitRef = useRef<{ startedAt: number; from: number; to: number } | null>(null);
  const splitClockRef = useRef(0);
  splitClockRef.current = splitClock;
  const draggingRef = useRef(false);
  const draggedRef = useRef(false);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  /** Whether the caller wants the idle turn. A ref as well as a prop, because
   * the loop reads it per frame and must never close over a stale value. */
  const driftRef = useRef(drift);
  driftRef.current = drift;
  /** The timestamp of the last frame that actually moved the globe, so drift
   * is a rate over real elapsed time rather than a per-frame nudge that would
   * run at whatever speed the display happens to refresh at. Zero means "no
   * previous frame" — the loop was stopped, or has never run. */
  const lastFrameRef = useRef(0);
  /** What `moving` already is. Set-state-to-the-same-value is cheap but not
   * free, and under drift this would be asked thirty times a second forever. */
  const movingRef = useRef(false);

  const stopLoop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    lastFrameRef.current = 0;
  }, []);

  const setMovingOnce = useCallback((next: boolean) => {
    if (movingRef.current === next) return;
    movingRef.current = next;
    setMoving(next);
  }, []);

  const tick = useCallback(
    (now: number) => {
      rafRef.current = 0;
      const previous = lastFrameRef.current;
      // Clamped: a tab that was backgrounded mid-loop comes back with an
      // enormous gap, and a drift step of "four seconds' worth" is a jump.
      const elapsed = previous === 0 ? 0 : Math.min(64, now - previous);
      /** Real motion — a gesture, a turn, a fly-in. Distinct from `busy`
       * below: drift keeps the loop alive without ever claiming the globe is
       * moving too fast to read a label on. */
      let active = false;
      let { rx, ry } = poseRef.current;

      // Momentum, then its own settle: the friction curve is the settle.
      const velocity = velocityRef.current;
      if (!draggingRef.current && (Math.abs(velocity.x) > MOMENTUM_STOP || Math.abs(velocity.y) > MOMENTUM_STOP)) {
        rx = clampTilt(rx + velocity.y);
        ry += velocity.x;
        velocity.x *= FRICTION;
        velocity.y *= FRICTION;
        active = true;
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
        else active = true;
      }

      const zoom = zoomRef.current;
      if (zoom) {
        const span = Math.abs(zoom.to - zoom.from) || 1;
        const p = clamp01((now - zoom.startedAt) / (ZOOM_MS * span));
        const value = zoom.from + (zoom.to - zoom.from) * p;
        zoomClockRef.current = value;
        setZoomClock(value);
        if (p >= 1) zoomRef.current = null;
        else active = true;
      }

      // V1.4 VB-23's split, run exactly like the zoom above and deliberately
      // not folded into it: they overlap (a sub-node can be picked before the
      // fly-in's stagger tail has finished) and one clock cannot be in two
      // places at once.
      const split = splitRef.current;
      if (split) {
        const span = Math.abs(split.to - split.from) || 1;
        const p = clamp01((now - split.startedAt) / (SPLIT_MS * span));
        const value = split.from + (split.to - split.from) * p;
        splitClockRef.current = value;
        setSplitClock(value);
        if (p >= 1) splitRef.current = null;
        else active = true;
      }

      let busy = active;
      // The idle turn. Last, so any real gesture owns the pose while it runs
      // and drift simply carries on from wherever that gesture left it.
      const drifting = driftRef.current && !draggingRef.current && !active;
      if (drifting) {
        busy = true;
        if (elapsed >= DRIFT_FRAME_MS) ry += DRIFT_RATE * (elapsed / 1000);
        // Below the throttle this frame does no work at all — see the guard on
        // `setPose` below, which is what turns "no work" into "no render".
      }

      // Only stamp the clock on a frame that actually moved something, so the
      // skipped frames' elapsed time is carried forward rather than dropped.
      if (active || draggingRef.current || (drifting && elapsed >= DRIFT_FRAME_MS) || previous === 0) {
        lastFrameRef.current = now;
      }

      // Guarded, because a fresh object is never `Object.is`-equal and React
      // would therefore re-render — twelve rotations, thirty edges, ten pins —
      // on every throttled drift frame that moved nothing at all. This is what
      // makes DRIFT_FRAME_MS an actual saving rather than a comment.
      if (rx !== poseRef.current.rx || ry !== poseRef.current.ry) {
        poseRef.current = { rx, ry };
        setPose({ rx, ry });
      }

      if (busy) rafRef.current = requestAnimationFrame(tick);
      else lastFrameRef.current = 0;
      if (!active && !draggingRef.current) setMovingOnce(false);
    },
    [setMovingOnce],
  );

  const startLoop = useCallback(() => {
    if (reducedRef.current) return;
    if (rafRef.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  /**
   * Starts the idle turn when the caller asks for it.
   *
   * Turning it *off* needs nothing here, deliberately: the next frame reads
   * `driftRef` and finds nothing left to do, so the loop stops itself exactly
   * the way it does at the end of a gesture. One place decides whether the
   * loop lives — the tick — and dragging the drawer below the peek or
   * switching to List therefore stops it within a frame without a second
   * mechanism that could disagree with the first.
   */
  useEffect(() => {
    // `reduced` is a dependency rather than only a guard inside `startLoop`,
    // so a person who turns the preference off mid-session gets the turn
    // without reopening the panel — the same live reading the rest of this
    // component makes.
    if (drift && !reduced) startLoop();
  }, [drift, reduced, startLoop]);

  // Nothing may keep ticking behind a hidden panel — VB-14's open item 3.
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') {
        // Back on screen: pick the idle turn up again, if it is wanted. A
        // gesture that was mid-flight is not resumed — it was snapped to its
        // end state below rather than left half-done.
        if (driftRef.current) startLoop();
        return;
      }
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
      const split = splitRef.current;
      if (split) {
        splitRef.current = null;
        splitClockRef.current = split.to;
        setSplitClock(split.to);
      }
      setMovingOnce(false);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setMovingOnce, startLoop, stopLoop]);

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
      setMovingOnce(true);
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

  /** The split's clock, driven the same way `runZoom` drives the camera's —
   * instantly under reduced motion, which is what makes the split "already
   * there" rather than a 320ms move nobody asked to watch. */
  const runSplit = useCallback(
    (to: number) => {
      if (reducedRef.current) {
        splitRef.current = null;
        splitClockRef.current = to;
        setSplitClock(to);
        return;
      }
      splitRef.current = { startedAt: performance.now(), from: splitClockRef.current, to };
      startLoop();
    },
    [startLoop],
  );

  const flyInto = useCallback(
    (index: number) => {
      setFlownIndex(index);
      setActiveIndex(index);
      setPickedChildId(null);
      runSplit(0);
      runZoom(ZOOM_TAIL);
      onSelect?.(shown[index] ?? null);
    },
    [onSelect, runSplit, runZoom, shown],
  );

  const flyOut = useCallback(() => {
    setFlownIndex(null);
    setPickedChildId(null);
    runSplit(0);
    runZoom(0);
    onSelect?.(null);
  }, [onSelect, runSplit, runZoom]);

  const pickChild = useCallback(
    (child: FileOutlineNode) => {
      setPickedChildId(child.id);
      runSplit(1);
      onSelect?.(child);
    },
    [onSelect, runSplit],
  );

  /**
   * Back from the split to the ring.
   *
   * Deliberately reports nothing. `onSelect` is a request to go somewhere —
   * the drawer turns it into interview navigation — and closing a panel is
   * not one, exactly as flying out of a section reports `null` rather than
   * re-reporting the file.
   */
  const unpickChild = useCallback(() => {
    setPickedChildId(null);
    runSplit(0);
  }, [runSplit]);

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
      setMovingOnce(true);
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
      setMovingOnce(false);
      return;
    }
    // A flick throws it; a slow drag that ended still simply stops.
    if (performance.now() - pointerRef.current.at > 90) velocityRef.current = { x: 0, y: 0 };
    if (Math.abs(velocityRef.current.x) > MOMENTUM_STOP || Math.abs(velocityRef.current.y) > MOMENTUM_STOP) startLoop();
    else {
      setMovingOnce(false);
      // A drag that ended dead still leaves the idle turn to pick up from
      // wherever the pointer put it, rather than the globe stopping for good.
      if (driftRef.current) startLoop();
    }
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
        // One level at a time, and in the order they were opened: the split
        // closes back to the ring first, the section only after that. Escape
        // that jumped straight out of a section you were reading a sub-node of
        // would throw away two steps for one keystroke.
        if (pickedChildId !== null) {
          event.preventDefault();
          unpickChild();
          childPinRefs.current.get(pickedChildId)?.focus();
          return;
        }
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

  /**
   * V1.5 VB-25 — the whole model as one lit object, or not.
   *
   * Derived here, on every render, from the health the caller derived from
   * `wb:answers` on the same render. Nothing about it is stored and nothing
   * about it is remembered: it is true while the file is complete and current
   * and false the moment it is not, in both directions, silently.
   */
  const unified = isUnifiedGlow(shown, health);

  /**
   * What each of the twelve vertices is worth to the edges that meet it —
   * `active`, `inactive`, or `structural` for the two poles that carry no
   * section. Computed once per frame rather than per edge: thirty edges would
   * otherwise ask the same question sixty times.
   */
  const lightByVertex = useMemo(() => {
    const map = new Map<number, GlobeNodeState>();
    ICOSAHEDRON_VERTICES.forEach((_, vertexIndex) => map.set(vertexIndex, 'structural'));
    shown.forEach((section, index) => {
      map.set(SECTION_VERTICES[index]!, globeNodeState(states?.[section.id] ?? 'reached'));
    });
    return map;
  }, [shown, states]);

  /** Past this the fly-in has committed, and the sections left behind stop
   * being controls — they are not on screen to be pressed. */
  const inside = zoomClock >= 0.7 && flownIndex !== null;
  const flownSection = flownIndex === null ? null : shown[flownIndex];
  const children = flownSection?.children ?? [];
  const flownNode = flownVertex === null ? null : frame.nodes[flownVertex]!;

  /** The split, eased — 0 is the ring, 1 is feature-left / panel-right. */
  const es = easeOutCubic(clamp01(splitClock));
  const pickedChild = pickedChildId === null ? null : (children.find((child) => child.id === pickedChildId) ?? null);
  /** The centre orb's on-screen radius this frame: its own, walked to CENTRE_R
   * as the camera arrives, then shrinking away as the stage splits. */
  const centreR = flownNode ? (flownNode.radius * frame.sceneScale) * (1 - frame.ez) + CENTRE_R * frame.ez : 0;

  const originX = flownNode?.lx ?? 0;
  const originY = flownNode?.ly ?? 0;

  const childLayout = children.map((child, i) => {
    const progress = easeOutCubic(clamp01((zoomClock - CHILD_DELAY - i * CHILD_STAGGER) / CHILD_SPAN));
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / Math.max(1, children.length);
    const ringX = originX + Math.cos(angle) * CHILD_RING * progress;
    const ringY = originY + Math.sin(angle) * CHILD_RING * progress;
    const ringR = CHILD_R_MIN + CHILD_R_SPAN * progress;
    const picked = child.id === pickedChildId;
    // The picked one travels to the feature position and grows into it;
    // everything else in the cluster stays where it is and fades, so the left
    // column is one orb rather than one orb and four ghosts.
    const t = picked ? es : 0;
    return {
      child,
      progress,
      picked,
      ringX,
      ringY,
      ringR,
      x: ringX + (FEATURE_X - ringX) * t,
      y: ringY + (FEATURE_Y - ringY) * t,
      radius: ringR + (FEATURE_R - ringR) * t,
      fade: picked ? 1 : 1 - es,
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
      /* V1.5 VB-25. One flag, one colour swap in the stylesheet — every orb,
         every bloom and every edge at once. A state, not an event: it goes on
         when the file is complete and current and off when it is not, with
         nothing fired in either direction. */
      data-unified={unified ? 'true' : 'false'}
      data-zoom={frame.ez.toFixed(3)}
      data-split={es.toFixed(3)}
      data-picked={pickedChildId ?? ''}
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
          {/* V1.4 VB-23 removed five sphere gradients from here. An orb is one
              flat fill now (see `brainglobe-solid-*` in BrainGlobe.css); the
              blooms below are the only radials the nodes still need. */}
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
          {/* Edges first, whole. Two lines each, and V1.5 VB-25 is the reason
              they are two rather than one: the base is the STRUCT — drawn at
              full weight whatever its ends are doing, because the model is a
              real object from question one — and the near line is the LIGHT,
              whose opacity is depth multiplied by what core/globe/illumination
              says both endpoints are worth. Illumination therefore spreads
              along the structure as sections fill in, instead of appearing
              node by node. */}
          <g className="brainglobe-edges" opacity={(1 - frame.ez * 0.92).toFixed(3)}>
            {ICOSAHEDRON_EDGES.map(([a, b], i) => {
              const na = frame.nodes[a]!;
              const nb = frame.nodes[b]!;
              const t = (na.t + nb.t) / 2;
              const width = EDGE_W_MIN + t * EDGE_W_SPAN;
              const light = edgeLight(lightByVertex.get(a)!, lightByVertex.get(b)!);
              const level = EDGE_LIGHT_LEVEL[light];
              return (
                <g key={i} data-edge={`${a}-${b}`} data-edge-light={light}>
                  <line
                    className="brainglobe-edge-far"
                    x1={na.x}
                    y1={na.y}
                    x2={nb.x}
                    y2={nb.y}
                    strokeWidth={width.toFixed(2)}
                    strokeOpacity={(EDGE_BASE_OPACITY_MIN + t * EDGE_BASE_OPACITY_SPAN).toFixed(3)}
                    strokeLinecap="round"
                  />
                  <line
                    className="brainglobe-edge-near"
                    x1={na.x}
                    y1={na.y}
                    x2={nb.x}
                    y2={nb.y}
                    strokeWidth={width.toFixed(2)}
                    strokeOpacity={(t ** 1.6 * EDGE_LIT_OPACITY * level).toFixed(3)}
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
              /**
               * V1.5 VB-24. Not "no orb" — a turned-down one.
               *
               * The two structural vertices are muted always. They carry no
               * section, so they can never be answered, and drawing them at
               * full saturation made the poles the brightest things on an empty
               * stage — the picture claiming progress where there is none. They
               * still join the unified glow, because at that point the whole
               * solid is one object and they are part of it.
               */
              const muted = structural || state === 'untouched';
              const isCentre = flownIndex !== null && entry?.index === flownIndex;
              const fade = flownIndex !== null && !isCentre ? 1 - frame.ez * 0.86 : 1;
              // The centre orb is the cluster's parent, so it leaves with the
              // rest of the cluster when a sub-node takes the stage.
              const splitFade = isCentre ? 1 - es : 1;
              /** V1.4 VB-23: hierarchy by size. The section flown into grows to
               * a fixed on-screen CENTRE_R rather than keeping whatever radius
               * its own depth gave it — see CENTRE_R. Divided by the scene
               * scale because this radius is drawn inside the scene group. */
              const radius = structural
                ? node.radius * 0.62
                : isCentre
                  ? centreR / frame.sceneScale
                  : muted
                    ? node.radius * MUTED_R_SCALE
                    : node.radius;

              return (
                <g
                  key={vertexIndex}
                  className="brainglobe-node"
                  data-node-index={vertexIndex}
                  data-section-id={entry?.section.id ?? ''}
                  data-node-state={structural ? 'structural' : state}
                  data-depth={node.t.toFixed(3)}
                  opacity={((structural ? 0.34 : 0.62 + node.t * 0.38) * fade * splitFade).toFixed(3)}
                >
                  {lit && (
                    <circle
                      className="brainglobe-bloom"
                      cx={node.x}
                      cy={node.y}
                      r={(radius * BLOOM_SCALE).toFixed(2)}
                      fill={`url(#${uid}-b${gradient})`}
                      opacity={(0.25 + node.t * 0.75).toFixed(3)}
                    />
                  )}
                  {state === 'current' && !structural && (
                    // VB-23: the halo goes on the way in. Hierarchy inside a
                    // section comes from size, and a ring around the largest
                    // thing on the stage repeats what the size already said.
                    // Out here, among ten equal siblings, it is still the only
                    // shape that marks the section being written now.
                    <circle
                      className="brainglobe-halo"
                      cx={node.x}
                      cy={node.y}
                      r={(radius + 3.4).toFixed(2)}
                      fill="none"
                      strokeWidth={(0.8 + node.t * 0.9).toFixed(2)}
                      opacity={(isCentre ? 1 - frame.ez : 1).toFixed(3)}
                    />
                  )}
                  {/* One flat fill — a solid orb, not a shaded bead (VB-23) —
                      and V1.5 VB-24: EVERY node is one, answered or not. The
                      unanswered one is the same object turned down: its own
                      hue at `node-N-muted`, no bloom behind it, the hollow
                      ring's old footprint. Depth is carried by the radius
                      above, by the group's opacity, and by the shade below,
                      which sinks a muted orb less far so it stays an object at
                      the back of the solid. */}
                  <g className="brainglobe-orb" data-lit={muted ? 'muted' : 'lit'}>
                    <circle
                      className={`brainglobe-sphere ${muted ? `brainglobe-muted-${gradient}` : `brainglobe-solid-${gradient}`}`}
                      cx={node.x}
                      cy={node.y}
                      r={radius.toFixed(2)}
                    />
                    <circle
                      className={`brainglobe-shade brainglobe-deep-${gradient}`}
                      cx={node.x}
                      cy={node.y}
                      r={radius.toFixed(2)}
                      opacity={((1 - node.t) * (muted ? MUTED_SHADE_DEPTH : SHADE_DEPTH)).toFixed(3)}
                    />
                  </g>
                </g>
              );
            })}
          </g>
        </g>

        {/* Children live outside the scene transform: the section they belong
            to has already been walked to the origin, so they ring the origin
            and never inherit the camera push twice. */}
        <g className="brainglobe-children-layer">
          {/* V1.4 VB-23 — the joints. Drawn before the orbs and trimmed to
              both rims by the real radii, so a line is the gap between two
              orbs rather than a spoke crossing them. They fade out with the
              rest of the cluster when the stage splits. */}
          <g className="brainglobe-links">
            {childLayout.map(({ child, progress, ringX, ringY, ringR, fade }) => {
              if (progress <= 0) return null;
              const dx = ringX - originX;
              const dy = ringY - originY;
              const length = Math.hypot(dx, dy);
              // Still inside the centre orb: there is no gap to draw yet.
              if (length <= centreR + ringR) return null;
              const ux = dx / length;
              const uy = dy / length;
              return (
                <line
                  key={child.id}
                  className="brainglobe-link"
                  data-link-id={child.id}
                  x1={(originX + ux * centreR).toFixed(2)}
                  y1={(originY + uy * centreR).toFixed(2)}
                  x2={(ringX - ux * ringR).toFixed(2)}
                  y2={(ringY - uy * ringR).toFixed(2)}
                  strokeWidth={LINK_WIDTH}
                  strokeOpacity={(progress * LINK_OPACITY * (1 - es)).toFixed(3)}
                  strokeLinecap="round"
                  opacity={fade.toFixed(3)}
                />
              );
            })}
          </g>
          {childLayout.map(({ child, progress, x, y, radius, gradient, fade, picked }) =>
            progress <= 0 ? null : (
              <g
                key={child.id}
                className="brainglobe-child-node"
                data-child-id={child.id}
                data-picked={picked ? 'true' : 'false'}
                opacity={(progress * fade).toFixed(3)}
              >
                <circle
                  className="brainglobe-bloom"
                  cx={x}
                  cy={y}
                  r={(radius * BLOOM_SCALE).toFixed(2)}
                  fill={`url(#${uid}-b${gradient})`}
                  opacity={(progress * 0.8).toFixed(3)}
                />
                <circle
                  className={`brainglobe-sphere brainglobe-solid-${gradient}`}
                  cx={x}
                  cy={y}
                  r={radius.toFixed(2)}
                />
              </g>
            ),
          )}
        </g>
      </svg>

      {/* The whole interactive layer. Real buttons, real text, positioned in
          percentages over the stage. */}
      <div
        className="brainglobe-pins"
        role="group"
        aria-label={S.brainGlobeStage}
        // V1.5 VB-25. The unified glow is a colour, and a colour says nothing
        // to a screen reader — so when it is true, the same fact is said in one
        // plain sentence below. A description and never a live announcement:
        // this is a state somebody can go and read, not an event fired at them
        // (docs/GUARDRAILS.md — no congratulation, no notification surface).
        aria-describedby={unified ? `${uid}-help ${uid}-state` : `${uid}-help`}
      >
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
            const labelOpacity = (LABEL_OPACITY_MIN + node.t * (1 - LABEL_OPACITY_MIN)) * labelFade * (isFlown ? 1 - es : 1);
            const left = pct(node.lx);
            // The hit target — and therefore where the label sits — follows the
            // orb whenever the orb is bigger than the 44px floor. Without this
            // the centre orb grew to 93px at VB-23's CENTRE_R and its own name
            // was printed across the middle of it.
            const orbPx = ((isFlown ? centreR : node.radius * frame.sceneScale) * size) / 100;
            const style = {
              left: `${left}%`,
              top: `${pct(node.ly)}%`,
              '--brainglobe-hit-size': `${orbPx.toFixed(1)}px`,
              '--brainglobe-label-opacity': visible ? labelOpacity.toFixed(3) : '0',
              '--brainglobe-label-size': `${(LABEL_SIZE_MIN + node.t * LABEL_SIZE_SPAN).toFixed(1)}px`,
              '--brainglobe-label-weight': String(
                Math.round((LABEL_WEIGHT_MIN + node.t * LABEL_WEIGHT_SPAN) / 50) * 50,
              ),
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
                // The section you are inside goes too once a sub-node takes
                // the stage: its orb has faded out, and a control nobody can
                // see is not a control. The way back is the sub-node itself,
                // Escape, or the button below that says so in words.
                hidden={inside && (!isFlown || pickedChildId !== null)}
                tabIndex={entry.index === activeIndex ? 0 : -1}
                aria-pressed={isFlown}
                // V1.5 VB-26. The name is the SHORT one — the words actually
                // printed on the node — because WCAG 2.5.3 asks a control's
                // name to contain its visible label, and voice control fails on
                // a node called something nobody can see. The section's real
                // name is on the `title` below, which is where the full text
                // lives for anyone who wants it (the List mode prints it in
                // full, and so does the file).
                aria-label={S.brainGlobeNode(globeLabelFor(entry.section), stateWord[state])}
                // The state, in words, on every node — because the picture says
                // it with brightness, a missing bloom and a halo, and none of
                // those reaches a screen reader.
                title={entry.section.label}
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
                  {globeLabelFor(entry.section)}
                </span>
              </button>
            );
          })}

        {childLayout.map(({ child, progress, x, y, radius, picked }) =>
          progress <= 0 ? null : (
            <button
              key={child.id}
              type="button"
              ref={(el) => {
                if (el) childPinRefs.current.set(child.id, el);
                else childPinRefs.current.delete(child.id);
              }}
              className="brainglobe-pin is-child"
              data-child-id={child.id}
              data-picked={picked ? 'true' : 'false'}
              // The four you did not pick leave with their orbs — off screen
              // and out of the tab order together, so Tab never lands on
              // something invisible.
              hidden={pickedChildId !== null && !picked}
              // Its own name is printed as the panel's heading beside it while
              // the stage is split, so the label under the orb would be the
              // same three words twice at 400px wide. The accessible name is
              // untouched either way.
              data-label-hidden={picked && es > 0.5 ? 'true' : 'false'}
              aria-pressed={picked}
              // Short on the stage, full in the tooltip — VB-26, and the same
              // 2.5.3 reasoning as the section pins above.
              aria-label={globeLabelFor(child)}
              title={child.label}
              style={
                {
                  left: `${pct(x)}%`,
                  top: `${pct(y)}%`,
                  // The hit target grows with the orb once it is featured, so
                  // the whole of a 60px circle answers a click rather than a
                  // 44px square in the middle of it. `max()` in the stylesheet
                  // keeps the 44px floor whatever this says.
                  '--brainglobe-hit-size': `${((radius * size) / 100).toFixed(1)}px`,
                  '--brainglobe-label-opacity': (progress * (picked ? 1 - es : 1)).toFixed(3),
                  '--brainglobe-label-size': `${LABEL_SIZE_MIN - 0.5}px`,
                  '--brainglobe-label-weight': '550',
                  '--brainglobe-label-shift': labelPlacement(pct(x)).shift,
                  '--brainglobe-label-room': labelPlacement(pct(x)).room,
                } as CSSProperties
              }
              onClick={() => {
                if (draggedRef.current) return;
                if (picked) {
                  unpickChild();
                  return;
                }
                pickChild(child);
              }}
            >
              <span className="brainglobe-hit" aria-hidden="true" />
              <span className="brainglobe-label" aria-hidden="true">
                {globeLabelFor(child)}
              </span>
            </button>
          ),
        )}
      </div>

      {/*
        V1.4 VB-23 — the right-hand half of the split.

        A `region` rather than a plain div, and focusable, because it scrolls:
        `2.1 Roles` with three records is thirteen cells and taller than the
        stage, and a scrolling box a keyboard cannot reach is a box whose
        bottom half does not exist (WCAG 2.1.1, and axe's
        `scrollable-region-focusable`). It is a stop *after* the sub-node that
        opened it and *before* the way back out, so tabbing forward leaves the
        globe exactly as it did before the split existed — no trap.

        Mounted only while a sub-node is picked, so nothing behind the globe
        holds a name or a tab stop it should not.
      */}
      {pickedChild && (
        <div
          className="brainglobe-detail"
          role="region"
          tabIndex={0}
          aria-label={S.brainGlobeDetail(pickedChild.label)}
          data-detail-id={pickedChild.id}
          style={{ '--brainglobe-split': es.toFixed(3) } as CSSProperties}
        >
          {/* Not a heading, for the same reason the record titles below are
              not: this component does not know what heading level is above it.
              The region's own accessible name carries the sub-section's name
              to a screen reader; this is the visible copy of it. */}
          <p className="brainglobe-detail-name">{pickedChild.label}</p>
          <DetailGrid details={details?.[pickedChild.id] ?? []} />
        </div>
      )}

      {flownSection && (
        <button type="button" className="brainglobe-back" onClick={flyOut} hidden={!inside}>
          {S.brainGlobeBack}
        </button>
      )}

      {/* Said once, to whoever needs it, and never printed on the picture. */}
      <p className="brainglobe-sr" id={`${uid}-help`}>
        {S.brainGlobeHelp}
      </p>
      {unified && (
        <p className="brainglobe-sr" id={`${uid}-state`}>
          {S.brainGlobeUnified}
        </p>
      )}
      <p className="brainglobe-sr" aria-live="polite">
        {pickedChild ? S.brainGlobeInside(pickedChild.label) : flownSection ? S.brainGlobeInside(flownSection.label) : ''}
      </p>
    </div>
  );
}
