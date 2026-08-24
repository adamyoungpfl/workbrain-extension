import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { FileOutlineNode } from '../../schema/flow.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import type { NodeDetail } from '../../core/flow/nodeDetails';
import type { NodeSummary } from '../../core/flow/nodeSummary';
import type { Recommendation } from '../../core/recommend/types';
import { NodeSummaryCard } from './NodeSummary';
import { globeLabelFor } from '../../core/flow/globeLabels';
import { EDGE_LIGHT_LEVEL, edgeLight, globeNodeState, isUnifiedGlow } from '../../core/globe/illumination';
import type { GlobeNodeState } from '../../core/globe/illumination';
import { HIGHLIGHT_RADIUS, LIMB_INNER, SHADE_RADIUS, orbLight } from '../../core/globe/lighting';
import type { OrbLight } from '../../core/globe/lighting';
import type { SectionLife } from '../../core/freshness/sectionLife';
import { sectionIsLit, sectionLife } from '../../core/freshness/sectionLife';
import { detailBand } from '../../core/globe/detailBand';
import type { SectionHealth } from '../../core/freshness/sectionHealth';
import type { FileSlotId } from '../../core/files/slots';
import { firstLocked } from '../../core/files/toggle';
import type { FileToggleItem } from '../../core/files/toggle';
import {
  WORK_NODE_GONE,
  WORK_NODE_R,
  applyWorkCamera,
  workCamera,
  workEdges,
  workNodeFade,
  chooseNav,
  pullBack,
  workNodePosition,
  workNodeState,
} from '../../core/globe/workBrain';
import type { BrainNav, BrainTier } from '../../core/globe/workBrain';
import { LockGlyph, fileName, lockLine } from './FileTypeToggle';
import {
  CAMERA,
  ICOSAHEDRON_EDGES,
  ICOSAHEDRON_VERTICES,
  PHI,
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
 *
 * ── V1.5 VB-27: the node summary ──────────────────────────────────────────
 *
 * A sub-node with something in it shows a floating card of what it holds —
 * counts, categories, one date, and any recommendation attached to that node.
 * The card itself is components/NodeSummary.tsx; what lives here is when it is
 * open and where it sits.
 *
 * **THREE WAYS IN, AND ALL THREE ARE REAL.** VB-27 says it in as many words:
 * "Hover is not enough on its own. A hover-only affordance is unreachable by
 * keyboard and on touch." So:
 *
 *   HOVER — a pointer that can hover, MOVING over the node. Not `pointerenter`
 *           on its own: the stage rearranges under a stationary cursor (the
 *           ring forms, the split closes) and the node that slides underneath
 *           would otherwise pop a card nobody pointed at. `onPointerMove`
 *           below carries the whole reasoning.
 *   FOCUS — every focus, however it arrived. This is the keyboard's path: Tab
 *           to the globe, arrow to a node, and the summary is simply there.
 *   ACTIVATION — a tap opens the summary and does NOT pick the node; the tap
 *           after it picks. That first tap is the only summary a touch user
 *           can ever get, and spending it on the split would mean this feature
 *           does not exist on a phone. A mouse click and Enter are unchanged
 *           and still pick, because for both of those the summary is already
 *           open — hover opened it, or focus did.
 *
 * **ESCAPE CLOSES IT AND MOVES NOTHING.** It is the first rung of the ladder
 * below (summary → split → section), and closing it leaves focus exactly where
 * it was, on the node. Nothing here traps focus: the card holds no control at
 * all, so Tab goes straight past it to the next node.
 *
 * **IT NEVER COVERS THE NODE IT DESCRIBES.** `summaryPlace` puts it in the half
 * of the stage the node is not in, and `summaryRoom` caps its height at the
 * real distance to the orb, so it cannot grow into the node whatever the
 * content or the stage size. It may sit over the node's *label* — the card's
 * first line is that same section's full name, so nothing is lost.
 *
 * ── V1.6 VB-31: the detail zoom's text, centred and free-floating ─────────
 *
 * The split's right-hand half was a bordered panel at `left: 35%`. VB-31 takes
 * the box away: **the feature node stays exactly where it is and the text
 * becomes free text, centred horizontally on it, structured the same way for
 * every node.** Nothing about the geometry above changed — FEATURE_X, FEATURE_Y
 * and FEATURE_R are the numbers they were in V1.4, and the orb travels to the
 * same place it always did.
 *
 * WITH NO BOX, ARITHMETIC IS THE ONLY THING KEEPING THE TEXT OFF THE ORB. So
 * the placement is a fold in core/globe/detailBand.ts rather than a stylesheet
 * guess, and it is the same technique VB-27 arrived at above for the hover
 * card: the text lives in a band that starts below the orb's lowest point and
 * is capped at the stage's floor, measured per frame in real pixels. Below the
 * rim and capped at the floor, it cannot reach the node by growing, by being
 * given a longer answer, or by being drawn on a smaller stage.
 *
 * "CENTRED ON THE NODE" HAS A PRICE, AND IT IS WORTH KNOWING WHAT IT IS. A
 * column dead-centred on a node at 21% of a 260px stage is 93px wide — fifteen
 * characters, and "Manager / Team Lead" breaks in two. So the measure is bought
 * with a stated allowance: the block's own axis may sit up to half the orb's
 * radius from the node's centre (DETAIL_DRIFT), which is 14px on the 300px
 * stage and buys about half as much measure again. `detailBand` reports what it
 * actually spent as `drift`, the direction is always towards the middle of the
 * stage — `labelPlacement`'s rule above, the one every other label on this
 * globe is already placed by — and core/globe/detailBand.ts names the single
 * number that would make the drift zero (FEATURE_X, on the stage's axis).
 *
 * IT IS CENTRED ON THE ORB WHEREVER THE ORB IS THIS FRAME, not on where the orb
 * ends up. The band is folded from the picked child's own live layout, so the
 * text travels with the orb across the split and arrives with it — one motion,
 * no keyframes, and already there under reduced motion because the split's
 * clock is already 1 (see `runSplit`).
 *
 * ── V1.8 VB-48: the tier above — the work brain ───────────────────────────
 *
 * "The Context brain becomes a CHILD of the WORK BRAIN, which carries each file
 * as its own node." So this stage now has two tiers, and everything above
 * describes the lower one.
 *
 *  - **WORK.** One node per file — Context, Skills, Actions, from
 *    `core/files/slots.ts` by way of `core/files/toggle.ts`, which is the one
 *    place in the product that knows what is locked. The file that has content
 *    is drawn as ITS OWN SOLID, shrunk to node size: the context brain really is
 *    a node of the work brain rather than a symbol standing in for one. The
 *    files that do not exist yet are empty shells — a dashed rim, no fill, no
 *    bloom — and they say what would unlock them, in words, in three places
 *    (the node's name, the line under the stage, and the List beside it).
 *  - **FILE.** Everything this component was before V1.8, unchanged.
 *
 * **THE EXISTING CAMERA DOES NOT GENERALISE TO THIS — IT COMPOSES WITH IT.**
 * VB-48 asks for that to be confirmed rather than assumed, and the confirmation
 * is written out in full in core/globe/workBrain.ts: `zoomClock` means "how far
 * into one of twelve VERTICES", it drives a perspective push that only means
 * something to the icosahedron, and it runs past 1 to carry the children's
 * stagger. Three readings, none of which has a sensible extension upward. So
 * the tier is its own clock (`tierClock`) and its own transform, wrapped
 * AROUND the scene — which is precisely how V1.4's `splitClock` relates to the
 * zoom it overlaps. At the file tier that transform is the exact identity, and
 * that is what keeps the fly-in, the split, the summaries, the detail band and
 * the drawer's morph measuring in the coordinates they were written in.
 *
 * **THE HTML OVERLAY GOES THROUGH THE SAME CAMERA.** The controls are real
 * buttons positioned in percentages (decision 2 above), so they cannot inherit
 * an SVG transform. `applyWorkCamera` maps their positions instead — one
 * function, called by both layers, because two copies of that arithmetic is a
 * globe whose orbs and whose hit targets drift apart mid-flight.
 *
 * **THE TIER IS CONTROLLED, NOT OWNED.** It arrives as a prop and changes are
 * reported through `onTier`, because the List shows the very same tier and the
 * very same file (surfaces/FileDrawer.tsx holds the one `BrainNav` both read).
 * That state is ephemeral session state and is never stored, exactly like the
 * pose, the split and the drawer's own height.
 *
 * **WITH NO `files` PROP THERE IS NO TIER AT ALL.** The globe is usable as a
 * pure showcase of one file, which is what it was for six versions and what the
 * harness still drives by default.
 *
 * ── V1.9 VB-54: the orbs are lit, from ONE FIXED POINT ────────────────────
 *
 * Decision 1 above says an orb is a flat fill and gives VB-24's reason for it,
 * and BOTH of those still stand. What VB-24 deleted was a highlight baked into
 * each orb's OWN local box — `cx="34%"` on a per-sphere gradient, so every orb
 * was lit from its own top-left however the globe was turned. Twelve circles
 * wearing one identical highlight read as twelve stickers, and no amount of
 * softening was going to fix that, because the highlight was not saying
 * anything about the scene.
 *
 * VB-54 is the opposite arrangement and it is what makes a group of circles
 * read as a group of spheres: **one fixed position in the stage**, and every
 * orb's highlight offset and terminator computed from ITS OWN position relative
 * to it. Turn the globe and the highlights walk across their orbs, because the
 * orbs really have moved and the light has not.
 *
 * THE MATHS IS IN core/globe/lighting.ts AND NOT HERE, for the reason it always
 * is — and for one more. V1.8 VB-45 put the same orbs in the List's rows, so
 * there are two callers, and if they lit an orb differently the drawer's morph
 * would stop reading as one object moving at the exact moment somebody is
 * watching it move. `orbLight` is a pure function of (orb, light); this file
 * decides only how hard to paint the answer on a near-black stage, exactly as
 * it multiplies `EDGE_LIGHT_LEVEL` rather than deciding what an edge is worth.
 *
 * THREE LAYERS, AND THE THIRD IS NOT ABOUT THE LIGHT AT ALL:
 *
 *  - **the limb** — concentric, the orb sinking toward its own deep colour at
 *    the rim. Curvature, not direction: a sphere lit from straight ahead has no
 *    terminator anywhere and is still obviously a sphere.
 *  - **the terminator** — the far side, offset away from the light, at a
 *    strength core reports as `shade`.
 *  - **the specular** — a soft blob offset toward the light, at `highlight`.
 *
 * WHAT IT COSTS, AND WHY THAT IS THE DESIGN. Two extra circles an orb, and
 * eleven shared gradients for the whole picture. The paint is CENTRED and
 * SHARED; only the placement of the circle carrying it varies. That is what
 * keeps a per-frame drift loop affordable, and it is also the structural reason
 * this cannot regress into what VB-24 deleted — there is no per-orb gradient
 * for a highlight to be baked into.
 *
 * FOUR THINGS IT IS NOT ALLOWED TO SPEND, all measured rather than asserted:
 * VB-25's unified glow still resolves to one colour (the shadows go with it;
 * the highlight does not, because the light is not part of the model),
 * VB-24's greyscale margin between an answered orb and an unanswered one,
 * VB-24's floor on a far muted orb against the field, and VB-45's deep hairline
 * on the List side. tests/e2e/lit-orbs.spec.ts measures all four.
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
 * V1.8 VB-48 — how long the tier above takes, in ms.
 *
 * The same 620 the fly-in takes, and deliberately the same number rather than a
 * new one: this is the same gesture one level up — a camera moving between a
 * thing and the thing inside it — and two different speeds for it would say the
 * two levels work differently. The tail the fly-in needs for its stagger
 * (`ZOOM_TAIL`) has no counterpart here, because nothing rings the file nodes.
 */
const TIER_MS = 620;

/** The gap a joint keeps from each file node's rim, in view units. Its own
 * number rather than the child links' zero, because these two ends are much
 * further apart and a line touching a dashed shell reads as a leak out of it. */
const WORK_LINK_GAP = 3;

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
 * re-forming is the drawer-sized change on this surface. The feature position
 * is left of centre and dead on the vertical middle.
 */
const SPLIT_MS = 320;
/* -58 and 19 are measured against the SMALLEST stage the drawer opens Brain
   at — 260px, where the left column is 91px and this orb is 49px of it. They
   were set in V1.4 so the orb sat in the middle of what was left beside the
   bordered panel; V1.6 VB-31 deleted the panel and says in as many words to
   keep the node exactly where it is, so they are untouched. What that costs is
   written down in core/globe/detailBand.ts — a column dead-centred on a node at
   21% of a 260px stage is 93px wide, which is why the text buys its measure
   with DETAIL_DRIFT below instead of being dead-centred and unreadable. */
const FEATURE_X = -58;
const FEATURE_Y = 0;
const FEATURE_R = 19;

/**
 * V1.6 VB-31 — the free text's own three numbers.
 *
 * `DETAIL_DRIFT` is the only taste decision in the whole placement, and it sets
 * the measure rather than being set by it (core/globe/detailBand.ts): how far
 * the block's own centre may sit from the node's, as a fraction of the node's
 * radius. **0.5 puts the text's axis halfway between the orb's centre and its
 * rim** — 14px on the 300px stage, under 5% of it, which nobody reads as
 * "offset to one side" — and buys about 50% more measure than dead-centre for
 * it. Screenshotted at both ends: at 0 the block is 93px on the smallest stage
 * and "Manager / Team Lead" breaks in two; at 1 the axis is on the rim and the
 * text has visibly stopped being under the orb.
 *
 * `DETAIL_EDGE_PX` is the margin the block keeps from the stage's own edge, and
 * `DETAIL_GAP` the space between the orb's rim and the first line of text. 10
 * rather than the hover card's 6: with no border between them, the gap is the
 * only thing saying the text is *under* the orb rather than falling out of it.
 */
const DETAIL_DRIFT = 0.5;
const DETAIL_EDGE_PX = 8;
const DETAIL_GAP = 10;

/**
 * V1.5 VB-27 — how long the summary waits before closing when the pointer
 * leaves the node.
 *
 * 120ms, docs/design-system.html §06's hover value, and it is not decoration:
 * WCAG 1.4.13 requires content shown on hover to be *hoverable*, so the
 * pointer has to be able to cross the gap between the node and the card
 * without the card disappearing on the way. Zero delay makes that gap
 * impassable; anything long enough to notice makes the card feel stuck.
 */
const SUMMARY_CLOSE_MS = 120;

/**
 * Which half of the stage the card takes, as a percentage of the stage height.
 *
 * A node at or below this line gets a card pinned to the top; everything else
 * gets one pinned to the bottom. 55 rather than 50 because the sub-node ring
 * is not symmetrical about the middle — CHILD_RING puts the lower nodes at
 * ~72% and the upper ones at 23% and 42%, so the line only has to separate
 * those two groups, and 55 does it with room on both sides.
 */
const SUMMARY_PLACE_PCT = 55;

/** The card's margin from the stage's own edge, and from the orb it must not
 * touch. Both in px, because both are about a box drawn in px over a stage
 * whose size the drawer chooses. */
const SUMMARY_EDGE_PX = 8;
const SUMMARY_GAP = 6;
/** Where a top-placed card starts: below `Back to the whole file`, a 44px pill
 * pinned to the stage's top-left. A card tucked under it would have its first
 * line behind a button. Matches BrainGlobe.css. */
const SUMMARY_TOP_PX = 60;

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

/**
 * V1.9 VB-54 — how hard the one scene light is allowed to paint.
 *
 * WHERE the highlight and the terminator sit is core/globe/lighting.ts's
 * answer and is not negotiable here; how strongly they are *painted* is this
 * file's, because it depends on the stage. These four numbers are what turns
 * that geometry into opacities on a near-black field, and every one of them was
 * set by screenshotting the stage rather than reasoned to.
 *
 * `SPEC_STRENGTH` is the peak opacity of the specular blob on an answered orb.
 * 0.5 rather than 1: VB-24 threw out a white specular dot for making twelve
 * orbs read as glass beads, and the difference between that and this is not
 * only that the offset now comes from the scene — it is also that the highlight
 * is a lift on the orb's own colour rather than a white pip sitting on it.
 *
 * `MUTED_SPEC_SCALE` turns it down on an unanswered orb, and it is a
 * correctness number and not a taste one. VB-24's whole treatment is "the same
 * orb, turned down", proved by tests/e2e/brain-globe.spec.ts measuring a real
 * pixel at an answered orb's centre against an unanswered one's — in colour AND
 * in greyscale. A highlight that lifted both equally would eat that margin from
 * the muted side, so the turned-down orb catches proportionally less light,
 * which is also what a duller surface does.
 *
 * `TERMINATOR_GAIN` is applied to `shade`, which core reports as the physical
 * (1 − cos)/2 and which lands between about 0.07 and 0.25 across this solid.
 * 1.35 takes that to a far side between 9% and 34% sunk toward the orb's own
 * deep colour. It was 1.7 before the limb layer below existed and came down
 * when it did: with the curvature carried separately the direction only has to
 * BIAS the darkness, and a heavier hand made the blob read as a disc drawn on
 * the orb rather than as the side of it turning away.
 *
 * `TERMINATOR_DEPTH_FLOOR` is the one that keeps VB-24's other measured floor —
 * "a muted orb must not sink into the field colour". A far orb is already
 * carrying the group's 0.62 opacity and its own depth shade; piling a full
 * terminator on top of that is exactly how the back of the solid disappears. So
 * the terminator fades with distance, to this fraction of itself at the very
 * back.
 */
const SPEC_STRENGTH = 0.5;
const MUTED_SPEC_SCALE = 0.42;
const TERMINATOR_GAIN = 1.35;
const TERMINATOR_DEPTH_FLOOR = 0.45;

/**
 * How dark the LIMB goes — the layer that is about curvature rather than about
 * where the light is (LIMB_INNER in core/globe/lighting.ts).
 *
 * 0.5 on an answered orb, and a third of that on a muted one for the same
 * reason its highlight is turned down: VB-24's measured margin between the two
 * is taken at the orb's CENTRE, which a limb never touches, but a muted orb is
 * already close to the field and its rim is the part with the least room left.
 */
const LIMB_STRENGTH = 0.5;
const MUTED_LIMB_SCALE = 0.34;

/**
 * The globe's own conversion into core's normalised stage space: the SVG
 * viewBox is −100..100, so a view unit divided by VIEW_HALF is already the
 * −1..+1 the light is defined in (core/globe/lighting.ts).
 *
 * IT IS THE POSITION ON SCREEN THAT MATTERS, not the position in the geometry.
 * A light fixed in the scene has to see the orb where the viewer sees it, so
 * callers pass the coordinates AFTER the scene transform and the tier camera —
 * which is what makes an orb's highlight travel as the globe turns, as the
 * camera flies in, and as the whole solid shrinks into its file node.
 */
function stageLight(x: number, y: number, z: number): OrbLight {
  return orbLight({ x: x / VIEW_HALF, y: y / VIEW_HALF, z });
}

/**
 * Half the solid's own depth, in the same normalised units. The vertices reach
 * ±PHI and GEO scales them into the viewBox, so `PHI * GEO / VIEW_HALF` is how
 * far the front of the solid stands in front of the stage's plane.
 *
 * Written as the arithmetic rather than as 0.6 so it stays true if GEO is ever
 * re-tuned — a depth cue that silently stopped matching the geometry would be
 * the hardest kind of wrong to see.
 */
const SOLID_Z_HALF = (PHI * GEO) / VIEW_HALF;

/**
 * The two circles that make a flat fill into a sphere, drawn over whatever orb
 * they are given.
 *
 * ONE COMPONENT, FOUR CALL SITES — the ten section orbs, the two structural
 * ones, the sub-node cluster and the work brain's file nodes — because the
 * whole claim of VB-54 is that they are all in the same scene. An orb lit by a
 * second rule would be the one that gives the trick away.
 *
 * Both blobs are soft radials that reach zero at their own edge, and core
 * guarantees their edges never cross the orb's rim (`highlightExtent`,
 * `shadeExtent`, swept over every position in lighting.test.ts). So neither can
 * spill outside the circle it belongs to and neither needs a clip path — which
 * matters, because a clip path per orb per frame is the one thing that would
 * make this expensive.
 *
 * The gradients themselves live in the SVG's `<defs>` and are shared: the
 * OFFSET is what varies per orb, never the paint. That is what keeps the DOM
 * this adds to a frame at two circles an orb.
 */
function OrbLit({
  uid,
  cx,
  cy,
  r,
  gradient,
  light,
  spec,
  terminator,
  limb,
}: {
  uid: string;
  cx: number;
  cy: number;
  r: number;
  gradient: number;
  light: OrbLight;
  /** Peak opacity for the highlight, already scaled for state and depth. */
  spec: number;
  /** Peak opacity for the terminator, likewise. */
  terminator: number;
  /** Peak opacity for the limb, which depends on state and depth but never on
   * where the light is. */
  limb: number;
}) {
  return (
    <>
      {/* THE LIMB. Concentric, and that is the point: an orb lit from straight
          ahead has no terminator anywhere and is still round, because its own
          surface turns away at the rim whatever the light is doing. Drawn first
          so the two directional layers sit on top of it. */}
      <circle
        className={`brainglobe-limb brainglobe-limb-${gradient}`}
        cx={cx.toFixed(2)}
        cy={cy.toFixed(2)}
        r={r.toFixed(2)}
        fill={`url(#${uid}-l${gradient})`}
        opacity={limb.toFixed(3)}
      />
      <circle
        className="brainglobe-terminator"
        cx={(cx + light.sx * r).toFixed(2)}
        cy={(cy + light.sy * r).toFixed(2)}
        r={(r * SHADE_RADIUS).toFixed(2)}
        fill={`url(#${uid}-t${gradient})`}
        opacity={terminator.toFixed(3)}
      />
      <circle
        className="brainglobe-spec"
        cx={(cx + light.hx * r).toFixed(2)}
        cy={(cy + light.hy * r).toFixed(2)}
        r={(r * HIGHLIGHT_RADIUS).toFixed(2)}
        fill={`url(#${uid}-spec)`}
        opacity={spec.toFixed(3)}
      />
    </>
  );
}

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

/**
 * Which gradient the n-th SUB-node of a section wears — the cluster that rings
 * the centre orb once the camera has flown in (`childLayout` below).
 *
 * Exported for V1.8 VB-45, for the same reason `sectionNodeGradient` is: the
 * List's rows now carry these orbs, and a child row must wear the colour its
 * own sub-node wears rather than a second cycle that happens to look similar.
 */
export function childNodeGradient(childIndex: number): number {
  return GRADIENTS[childIndex % GRADIENTS.length]!;
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
  /**
   * V1.5 VB-27. What each node holds, in counts — `nodeSummaries` in
   * core/flow/nodeSummary.ts, folded from `wb:answers` and the same section
   * health the unified glow above reads. A node ABSENT from this map has
   * nothing in it and shows no summary at all, which is VB-27's own gate
   * ("where a secondary node has items"); an empty card saying "nothing here"
   * would teach somebody that hovering is not worth doing.
   *
   * Optional, like everything else derived here: with no summaries the globe
   * is exactly the globe it was before this feature, and picking a sub-node
   * still opens the detail panel.
   */
  summaries?: Readonly<Record<string, NodeSummary>>;
  /**
   * V1.5 VB-28's recommendations, grouped by the node they belong to —
   * `recommendationsByNode(recommend({...}))`. The summary prints the first
   * one for its node; the engine already keeps at most one per node.
   *
   * Same ids, same ranking and the same dismissals as Home's list, because it
   * is the same call: hiding one there hides it here.
   */
  recommendations?: Readonly<Record<string, readonly Recommendation[]>>;
  /** The section or sub-section now in focus — a section when one is flown
   * into, one of its children when a child is picked, null when the globe is
   * back to the whole file. The caller owns what to show for it. */
  onSelect?: (node: FileOutlineNode | null) => void;
  /**
   * V1.8 VB-48 — the files of the work brain, in shelf order:
   * `fileToggle(...)` from core/files/toggle.ts, which is `core/files/slots.ts`
   * with a lock folded onto each entry. The SAME call the drawer's toggle and
   * Home's shelf are drawn from, so a file that is locked in one of the three
   * surfaces is locked in all of them.
   *
   * ABSENT MEANS THERE IS NO TIER ABOVE. The globe then draws exactly the one
   * file it is given, which is what it did for six versions and what the
   * showcase harness still drives.
   */
  files?: readonly FileToggleItem[];
  /** Which file the `sections` above belong to — the node the solid lives in.
   * Only meaningful alongside `files`. */
  file?: FileSlotId;
  /**
   * Which tier is showing. Controlled by the caller because the List shows the
   * same one (VB-48's "shared navigation state"), and ephemeral there — nothing
   * about where you are looking is ever stored.
   */
  tier?: BrainTier;
  /**
   * Asked to move: into a file, or back out to the work brain. The rules —
   * which presses are real moves and which are refused — are
   * core/globe/workBrain.ts's, and this reports the answer rather than the
   * request, so a caller cannot accidentally implement "locked" a second way.
   */
  onTier?: (next: BrainNav) => void;
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

// ── What the detail zoom says ─────────────────────────────────────────────

/**
 * What a sub-section holds — V1.4 VB-23's "information panel on the right",
 * which V1.6 VB-31 turned into free text centred under the node.
 *
 * THE MARKUP IS UNCHANGED AND THE PRESENTATION IS NOT. VB-31 asks for the same
 * shape every time, and the shape was never the box: it is name → record →
 * answer → the question the answer belongs to, in the order the person's own
 * file writes them. What went is the card around it and the two-up grid, which
 * existed because the panel had 144px of content beside the orb; a block of
 * centred free text has one column, and a centred grid of two would be reading
 * order fighting layout for no gain at 400px.
 *
 * Three decisions, all of them forced by 400px:
 *
 * 1. **The answer is the loud line, the question is its caption.** Every
 *    question in this interview is a whole spoken sentence ("Is this your
 *    primary role, a secondary role, or something occasional?"), and a list
 *    whose labels are sentences buries the answers. So the person's own words
 *    are the loud line and the question sits under them, three lines at most,
 *    with the whole of it in `title` for anyone who wants it. Nothing they
 *    *said* is ever clipped.
 * 2. **Records become headings, not indentation.** Three roles are three
 *    headings, exactly as the generated file prints them — indentation at this
 *    width would cost more than it explains.
 * 3. **A `<dl>`, because these are name/value pairs.** Grouped in `<div>`s,
 *    which is valid inside a description list and is what lets each pair be
 *    one block.
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
                /* Still published, and no longer laid out on: V1.6 VB-31's
                   single centred column has no row for a wide cell to take.
                   Kept because it is core's own statement about this answer's
                   length (`WIDE_VALUE_CHARS` in core/flow/nodeDetails.ts) and
                   the DOM is where that contract is visible. */
                data-wide={cell.wide ? 'true' : 'false'}
              >
                {/* `dt` before `dd`, which is the order HTML requires inside a
                    description list and the order a screen reader wants:
                    question, then answer. The block shows them the other way up
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

export function BrainGlobe({
  sections,
  states,
  health,
  size = 300,
  drift = false,
  details,
  summaries,
  recommendations,
  onSelect,
  files,
  file = 'context',
  tier = 'file',
  onTier,
}: BrainGlobeProps) {
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

  /**
   * V1.8 VB-48 — the tier above, and its own clock.
   *
   * `tierClock` runs 0 (the work brain, this file drawn as one node among the
   * files) to 1 (inside the file, which is the identity transform and therefore
   * every version of this stage that shipped before V1.8). Its own clock, not a
   * range bolted onto `zoomClock`, for the three reasons written out in
   * core/globe/workBrain.ts — and, like the split's, because the two can be
   * running at once and one clock cannot be in two places.
   *
   * With no `files` there is no tier above at all, so the clock is pinned at 1
   * and nothing below it can tell the difference.
   */
  const workFiles = files ?? [];
  const workEnabled = workFiles.length > 0;
  const tierShown: BrainTier = workEnabled ? tier : 'file';
  /** Which node of the work brain this file's solid lives in. An id that is not
   * on the shelf falls back to the first node rather than throwing — a picture
   * must never be the thing that breaks a screen (docs/GUARDRAILS.md). */
  const fileIndex = Math.max(
    0,
    workFiles.findIndex((item) => item.id === file),
  );
  const [tierClock, setTierClock] = useState(() => (tierShown === 'work' ? 0 : 1));

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
  const tierRef = useRef<{ startedAt: number; from: number; to: number } | null>(null);
  const tierClockRef = useRef(tierClock);
  tierClockRef.current = tierClock;
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

      // V1.8 VB-48's tier, run exactly like the two clocks above it and for the
      // same reason they are separate: pulling back out of a file while its
      // fly-in is still finishing is one stage doing two things, and a single
      // clock cannot describe both.
      const tierMove = tierRef.current;
      if (tierMove) {
        const span = Math.abs(tierMove.to - tierMove.from) || 1;
        const p = clamp01((now - tierMove.startedAt) / (TIER_MS * span));
        const value = tierMove.from + (tierMove.to - tierMove.from) * p;
        tierClockRef.current = value;
        setTierClock(value);
        if (p >= 1) tierRef.current = null;
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
      const tierMove = tierRef.current;
      if (tierMove) {
        tierRef.current = null;
        tierClockRef.current = tierMove.to;
        setTierClock(tierMove.to);
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

  /**
   * V1.8 VB-48 — the tier's clock, driven exactly like the two above it.
   *
   * Instant under reduced motion, which is what "reduced motion reaches the
   * same states without animating into them" means here: the work brain is
   * simply the picture, or the file is, with no trip between them.
   */
  const runTier = useCallback(
    (to: number) => {
      if (reducedRef.current) {
        tierRef.current = null;
        tierClockRef.current = to;
        setTierClock(to);
        return;
      }
      tierRef.current = { startedAt: performance.now(), from: tierClockRef.current, to };
      startLoop();
    },
    [startLoop],
  );

  // ── V1.5 VB-27: the node summary ─────────────────────────────────────────

  /** Which sub-node's summary is open, or null. Ephemeral session state, like
   * the pose and the split — nothing about it is stored. */
  const [summaryId, setSummaryId] = useState<string | null>(null);
  /**
   * The sub-node whose summary a tap has already revealed.
   *
   * The whole of the touch path is this one value: the first tap on a node
   * opens its summary and records it here, and the tap after it — finding its
   * own id already here — picks the node. It is cleared whenever the summary
   * closes, so "tap, read, tap" works the same way the second time.
   */
  const tapRevealedRef = useRef<string | null>(null);
  /** Which sub-node the pointer is actually over, so blurring a node the mouse
   * is still resting on does not close a card the person is reading. */
  const pointerOverRef = useRef<string | null>(null);
  /** Set immediately before focus is moved BY US — closing the split puts
   * focus back on the sub-node it opened, and a summary appearing because you
   * just pressed Escape is a dismissal that did not take. */
  const skipFocusOpenRef = useRef<string | null>(null);
  /** The node whose summary was dismissed with Escape while the pointer was on
   * it. Cleared the moment the pointer leaves that node, so a dismissal lasts
   * exactly as long as the hover that it dismissed. */
  const dismissedRef = useRef<string | null>(null);
  const closeTimerRef = useRef(0);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = 0;
  }, []);

  const openSummary = useCallback(
    (childId: string) => {
      cancelClose();
      setSummaryId(childId);
    },
    [cancelClose],
  );

  const closeSummary = useCallback(() => {
    cancelClose();
    tapRevealedRef.current = null;
    setSummaryId(null);
  }, [cancelClose]);

  /** The 120ms grace WCAG 1.4.13 needs — see SUMMARY_CLOSE_MS. */
  const closeSummarySoon = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = 0;
      tapRevealedRef.current = null;
      setSummaryId(null);
    }, SUMMARY_CLOSE_MS);
  }, [cancelClose]);

  useEffect(() => cancelClose, [cancelClose]);

  /* Every one of these four closes the summary, for one reason: the card
     describes a sub-node of the cluster on screen, and all four change which
     cluster that is. A card left over from the stage before would be a
     description of something nobody can see. */
  const flyInto = useCallback(
    (index: number) => {
      closeSummary();
      setFlownIndex(index);
      setActiveIndex(index);
      setPickedChildId(null);
      runSplit(0);
      runZoom(ZOOM_TAIL);
      onSelect?.(shown[index] ?? null);
    },
    [closeSummary, onSelect, runSplit, runZoom, shown],
  );

  const flyOut = useCallback(() => {
    closeSummary();
    setFlownIndex(null);
    setPickedChildId(null);
    runSplit(0);
    runZoom(0);
    onSelect?.(null);
  }, [closeSummary, onSelect, runSplit, runZoom]);

  const pickChild = useCallback(
    (child: FileOutlineNode) => {
      // The split's own panel opens with everything this card was summarising
      // and more, in the same place on the stage. Two of them at once would be
      // the same node described twice.
      closeSummary();
      setPickedChildId(child.id);
      runSplit(1);
      onSelect?.(child);
    },
    [closeSummary, onSelect, runSplit],
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
    closeSummary();
    setPickedChildId(null);
    runSplit(0);
  }, [closeSummary, runSplit]);

  // ── V1.8 VB-48: between the tiers ────────────────────────────────────────

  /** The file-node buttons, by file id — the tier above's counterpart of
   * `pinRefs`. Keyed, because focus has to land on one particular file. */
  const fileRefs = useRef(new Map<string, HTMLButtonElement>());
  /**
   * Which locked file the line under the stage is explaining, if one has been
   * pressed. Ephemeral, and the same rule the drawer's toggle follows
   * (components/FileTypeToggle.tsx): the line is always there, explaining the
   * next locked file, and swaps to whichever locked node was last pressed.
   */
  const [lockPressed, setLockPressed] = useState<FileSlotId | null>(null);
  /**
   * A focus move THIS COMPONENT owes itself after the tier changes.
   *
   * Set only by this component's own handlers, and that is the whole point:
   * when the List changes the tier, focus is over there and moving it would be
   * the product taking somebody's cursor away (docs/GUARDRAILS.md — nothing
   * steals focus). When the press happened here, the control that was pressed
   * is about to be hidden, and focus has to be put somewhere real.
   */
  const wantFocusRef = useRef<'file' | 'section' | null>(null);
  const tierWasRef = useRef(tierShown);

  /**
   * The tier, FOLLOWED rather than owned.
   *
   * The caller holds it (the List shows the same one), so this reacts to the
   * prop rather than to the press — which means a change made in either view
   * runs exactly the same code here.
   *
   * Pulling back closes everything the file tier had open. A section flown into
   * and a sub-node picked are both descriptions of somewhere inside a file, and
   * leaving the file with them still set would put the camera back on a stage
   * that had rearranged itself while nobody was looking at it. They fly out
   * rather than snapping, so pulling back is one continuous movement.
   */
  useEffect(() => {
    if (tierWasRef.current === tierShown) return;
    tierWasRef.current = tierShown;
    closeSummary();
    if (tierShown === 'work') {
      setFlownIndex(null);
      setPickedChildId(null);
      runSplit(0);
      runZoom(0);
    }
    runTier(tierShown === 'work' ? 0 : 1);
    const want = wantFocusRef.current;
    wantFocusRef.current = null;
    // After the commit, so whatever was hidden a moment ago is on screen and
    // focusable now.
    if (want === 'file') fileRefs.current.get(file)?.focus();
    else if (want === 'section') pinRefs.current[activeIndex]?.focus();
    // `file` and `activeIndex` are read, never watched: this reacts to the tier
    // moving and to nothing else.
  }, [tierShown, closeSummary, runSplit, runZoom, runTier]);

  /**
   * Pressing a file node. The rule is core's — `chooseNav` is `chooseFile` plus
   * a tier — so a locked file refuses the move here for the same reason and in
   * the same code as it refuses it on the drawer's toggle and on Home's shelf.
   *
   * A refused press is not silence: the node keeps its name, and the line under
   * the stage swaps to explaining THAT file, which is what somebody pressing a
   * padlock is asking about.
   */
  const pressFile = useCallback(
    (id: FileSlotId) => {
      const next = chooseNav({ tier: tierShown, file }, id, workFiles);
      if (next.tier === tierShown && next.file === file) {
        setLockPressed(id);
        return;
      }
      wantFocusRef.current = 'section';
      onTier?.(next);
    },
    // `workFiles` is rebuilt every render from the `files` prop; listing what it
    // is BUILT FROM is what keeps this callback stable between frames.
    [tierShown, file, files, onTier],
  );

  /** Back out to the work brain — the button, and Escape's last rung. */
  const goWork = useCallback(() => {
    if (!workEnabled || tierShown !== 'file') return;
    wantFocusRef.current = 'file';
    onTier?.(pullBack({ tier: tierShown, file }));
  }, [file, onTier, tierShown, workEnabled]);

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
    /**
     * V1.5 VB-27 — HOVER IS A POINTER THAT MOVED, not a `pointerenter`.
     *
     * The stage rearranges under a stationary pointer constantly: flying into
     * a section rings five new nodes around the middle, and closing the split
     * walks the featured orb back out to the ring. The browser fires
     * `pointerenter` on whatever slides under the cursor, so opening the card
     * there would pop a summary for a node nobody pointed at — and, worse,
     * would spend the next Escape closing it instead of leaving the section.
     * Found by driving it: it broke VB-23's own Escape-ladder test, which is
     * exactly the contract it should have broken.
     *
     * So `pointerenter` only records WHERE the pointer is, and this — a real
     * movement, over a node, of a pointer that can hover — is what opens.
     */
    if (
      event.pointerType === 'mouse' &&
      pointerOverRef.current !== null &&
      pointerOverRef.current !== summaryId &&
      pointerOverRef.current !== dismissedRef.current &&
      pickedChildId === null &&
      !draggingRef.current &&
      summaries?.[pointerOverRef.current]
    ) {
      openSummary(pointerOverRef.current);
    }
    /**
     * V1.5 VB-27 — WCAG 1.4.13's "hoverable", done from the stage.
     *
     * The card is transparent to the pointer (NodeSummary.css says why: it
     * covers a third of a stage full of 44px targets, and swallowing their
     * clicks to describe them would be a poor trade). So the pointer resting
     * on it looks, to the node, exactly like the pointer having left — and the
     * card would close under somebody who was reading it. This is the other
     * half of that decision: while the pointer is inside the card's own box,
     * the pending close is cancelled. Costs one `getBoundingClientRect` per
     * move, and only while a card is open at all.
     *
     * `pointerOverRef` is the other half of the *other* half. A sub-node under
     * the card is still a node the pointer can land on, and landing on one has
     * to close the card that was covering it — otherwise moving from Roles to
     * Boundaries leaves Roles' summary up over the node you are now on. Found
     * by driving it, not by reading it.
     */
    if (summaryId !== null && pointerOverRef.current === null) {
      const box = event.currentTarget.querySelector('.nodesummary')?.getBoundingClientRect();
      const onCard =
        !!box &&
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      // On the card: hold it. Off the card and off every node: let it go, the
      // same way leaving the node does — otherwise a pointer that had rested
      // on the card and wandered off would leave it open with nothing under
      // the cursor. Scheduled once, not re-armed on every move, so it closes
      // 120ms after leaving rather than 120ms after the pointer next stops.
      if (onCard) cancelClose();
      else if (!closeTimerRef.current) closeSummarySoon();
    }
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
    /**
     * V1.8 VB-48 — THE ARROWS BELONG TO THE SOLID, and at the work tier there
     * is no solid to step around.
     *
     * The roving tabindex below exists because ten nodes that each spin a globe
     * would make tabbing past the drawer intolerable (decision 3 in the header).
     * Three file nodes are not that problem: they are three ordinary tab stops
     * that move nothing when they are reached. So the arrows simply do not
     * apply up here, and stepping a hidden node — turning a solid nobody can
     * see — is exactly what this returns before doing.
     */
    if (tierShown === 'work') {
      if (event.key !== 'Escape') return;
      return;
    }
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
        // One level at a time, and in the order they were opened: the summary
        // closes first, then the split back to the ring, then the section.
        // Escape that jumped straight out of a section you were reading a
        // sub-node of would throw away three steps for one keystroke.
        //
        // V1.5 VB-27: CLOSING THE SUMMARY MOVES NOTHING. Focus is already on
        // the node the card belongs to and stays there — the card holds no
        // control to lose focus from, and taking focus somewhere else to
        // dismiss a description would be the product moving somebody's cursor
        // for them. It also does not reopen: it is opened by events, and
        // sitting still fires none.
        if (summaryId !== null) {
          event.preventDefault();
          // While the pointer stays where it is, this node's summary stays
          // dismissed — otherwise the next twitch of the mouse would bring
          // back the thing that was just dismissed.
          dismissedRef.current = summaryId;
          closeSummary();
          return;
        }
        if (pickedChildId !== null) {
          event.preventDefault();
          // Focus goes back to the sub-node that opened the split — and this
          // is the one focus move in the component that must NOT open a
          // summary, because it is the tail of a dismissal.
          skipFocusOpenRef.current = pickedChildId;
          unpickChild();
          childPinRefs.current.get(pickedChildId)?.focus();
          return;
        }
        if (flownIndex === null) {
          // V1.8 VB-48 — the ladder's last rung, and it only exists where there
          // is a tier above: summary → split → section → the work brain.
          if (!workEnabled) return;
          event.preventDefault();
          goWork();
          return;
        }
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

  /**
   * V1.8 VB-48 — the tier's camera this frame, and the two folds over it.
   *
   * `et` is the tier clock eased on the fly-in's own curve, so the two levels
   * of camera read as one kind of movement. `camera` is the transform the SVG
   * wears and the overlay maps through; at the file tier it is exactly the
   * identity (asserted in core/globe/workBrain.test.ts), which is what makes
   * every behaviour below this line the behaviour it was before V1.8.
   */
  const et = easeOutCubic(clamp01(tierClock));
  const camera = workCamera(et, workNodePosition(fileIndex, workFiles.length));
  const onStage = (x: number, y: number) => applyWorkCamera(camera, x, y);
  /** How present the OTHER files are: 1 out here, 0 once we are inside one. */
  const workFade = workNodeFade(et);

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
   * V1.8 VB-46 — WHETHER A SECTION IS LIVE, LIT OR DIM, DECIDED IN core/.
   *
   * "The same rule drives the Brain visual, so both views agree about what is
   * live." So this is `core/freshness/sectionLife.ts`, the same call the List's
   * rows make (components/FileTree.tsx), and neither view decides for itself.
   * An orb that flew out of a lit sphere cannot land on a greyed row.
   *
   * Both inputs are handed over rather than one: the health carries the counts
   * ("at least one of X complete"), and the tree's state carries where the flow
   * is standing. With no health at all — this component is usable as a pure
   * showcase — the rule falls back to the tree alone, which is the picture this
   * globe drew before VB-46 and never a second definition of live.
   */
  const lifeOf = (section: FileOutlineNode): SectionLife => {
    const state = stateOf(section);
    return sectionLife({ health: health?.[section.id], current: state === 'current', reached: state === 'reached' });
  };

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
      map.set(SECTION_VERTICES[index]!, globeNodeState(lifeOf(section)));
    });
    return map;
    // `lifeOf` is redeclared every render and closes over exactly these three;
    // listing what it READS rather than the closure itself is what keeps the
    // memo hitting between frames of the drift loop.
  }, [shown, states, health]);

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
      gradient: childNodeGradient(i),
    };
  });

  /**
   * V1.5 VB-27 — the summary on screen this frame, and which half it takes.
   *
   * Derived, never held: the open card is one id in state, and everything else
   * about it — the counts, the recommendation, the side of the stage — is
   * recomputed from the props on the same render as the picture it sits over.
   * A card is only ever shown for a node of the cluster on screen, so a stale
   * id (the section was left, the stage split) simply produces nothing.
   */
  const summaryLayout = summaryId === null ? undefined : childLayout.find((entry) => entry.child.id === summaryId);
  const openSummaryData = summaryId === null || pickedChildId !== null ? undefined : summaries?.[summaryId];
  const summaryDomId = `${uid}-summary`;
  const summaryPlace: 'top' | 'bottom' =
    summaryLayout && pct(summaryLayout.y) >= SUMMARY_PLACE_PCT ? 'top' : 'bottom';
  /**
   * How much room the card has, in real pixels — and therefore the rule "it
   * never covers the node it describes", made structural rather than hoped
   * for.
   *
   * The band runs from the stage's own edge to the near side of the orb, less
   * SUMMARY_GAP. The card is capped at it (NodeSummary.css), so a card that
   * somehow grew — a longer recommendation, a fifth category, a stage smaller
   * than any the drawer opens — is cut off at the node rather than drawn over
   * it. tests/e2e/node-summary.spec.ts measures both ends of that: that the
   * card clears the orb at every node, and that nothing is actually being cut
   * off at either size the drawer runs Brain at.
   */
  const summaryRoom = (() => {
    if (!summaryLayout) return 0;
    const nodeY = ((summaryLayout.y + VIEW_HALF) / (VIEW_HALF * 2)) * size;
    const orbR = (summaryLayout.radius / (VIEW_HALF * 2)) * size;
    return summaryPlace === 'top'
      ? Math.max(0, nodeY - orbR - SUMMARY_GAP - SUMMARY_TOP_PX)
      : Math.max(0, size - SUMMARY_EDGE_PX - (nodeY + orbR + SUMMARY_GAP));
  })();

  /**
   * V1.6 VB-31 — where the free text sits this frame.
   *
   * Folded from the picked child's OWN live layout rather than from FEATURE_X /
   * FEATURE_Y directly, so the text is centred on the orb wherever the orb is
   * mid-split and arrives with it rather than after it. Derived per render like
   * everything else on this stage; nothing about it is stored.
   */
  const pickedLayout = childLayout.find((entry) => entry.picked);
  const band = pickedLayout
    ? detailBand({
        size,
        nodeX: pct(pickedLayout.x) / 100,
        nodeY: pct(pickedLayout.y) / 100,
        nodeRadius: pickedLayout.radius / (VIEW_HALF * 2),
        driftAllowance: DETAIL_DRIFT,
        edge: DETAIL_EDGE_PX,
        gap: DETAIL_GAP,
      })
    : null;

  /**
   * V1.6 VB-31 — whether the free text has more below the fold.
   *
   * The one thing about this block that cannot be derived from props: it
   * depends on how the browser broke the lines. So it is measured off the real
   * element, after layout, and it decides exactly one thing — whether the
   * fade at the block's foot is drawn (BrainGlobe.css). Guessing it from the
   * content's length faded the last line of `2.5 Expertise`, which is one
   * sentence and fits with 30px to spare.
   *
   * `useLayoutEffect` and no dependency array, because the answer changes with
   * anything that changes the line breaking — the picked node, the stage's
   * size, the band's own room — and enumerating those is a list that will be
   * wrong by V1.7. The read costs one layout on a render where the block is
   * mounted at all, and `setState` only ever runs on the frame the answer
   * actually flips.
   */
  const detailRef = useRef<HTMLDivElement | null>(null);
  const [detailScrolls, setDetailScrolls] = useState(false);
  useLayoutEffect(() => {
    const element = detailRef.current;
    const scrolls = !!element && element.scrollHeight - element.clientHeight > 1;
    setDetailScrolls((was) => (was === scrolls ? was : scrolls));
  });

  /**
   * V1.8 VB-48 — how big the solid actually is on the stage this frame, in view
   * units, before the tier camera.
   *
   * Measured off the frame rather than hard-coded from the circumradius,
   * because the silhouette breathes: the pose changes which vertex is nearest,
   * and the fly-in's own camera push changes the projection. The file node's
   * hit target and its label are placed against this, so they fit the mini
   * solid at whatever angle it happens to be turned to.
   */
  const solidR = frame.nodes.reduce(
    (widest, node) => Math.max(widest, Math.hypot(node.lx, node.ly) + node.radius * frame.sceneScale),
    0,
  );

  /**
   * V1.8 VB-48 — which locked file the line under the stage explains.
   *
   * The drawer's toggle rule exactly (core/files/toggle.ts's `firstLocked`):
   * the next locked file by default, or whichever locked node was last pressed.
   * One line and not three — three sentences do not fit a 260px stage — and it
   * is always there, so it is never a tooltip you have to find.
   */
  const explaining = workFiles.find((item) => item.id === lockPressed && item.lock) ?? firstLocked(workFiles);

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
      /* V1.8 VB-48. Which tier is showing, which file's solid is on the stage,
         and how far between the two the camera has got. Published for the same
         reason the zoom and the split are: the stylesheet reads it, and so does
         a test that has to know what it is looking at. */
      data-tier={tierShown}
      data-file={workEnabled ? file : ''}
      data-tier-clock={et.toFixed(3)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      /* The pointer leaving the stage altogether takes any open summary with
         it. The node's own `pointerleave` covers the usual case; this covers
         the one where the pointer was resting ON the card when it left, where
         there is no further move to notice it going. */
      onPointerLeave={() => {
        pointerOverRef.current = null;
        if (summaryId !== null) closeSummarySoon();
      }}
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
          {/*
            V1.9 VB-54 — THE LIGHT'S TWO BRUSHES, and there are only two of
            them however many orbs are on the stage.

            V1.4 VB-23 removed five per-sphere gradients from here because each
            one baked a highlight into the orb's OWN box, so every orb wore the
            same one wherever it sat. These are the opposite arrangement and it
            is what makes VB-54 affordable: the paint is shared and CENTRED, and
            the only thing that varies per orb is where the circle carrying it
            is placed — which core computes from that orb's own position under
            one fixed light (core/globe/lighting.ts).

            One specular for the whole picture, because there is one light.
            One terminator per colour, because a sphere's dark side is its own
            colour in shadow and never a grey wash over everything.
          */}
          <radialGradient id={`${uid}-spec`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" className="brainglobe-stop-spec" stopOpacity="1" />
            <stop offset="45%" className="brainglobe-stop-spec" stopOpacity="0.42" />
            <stop offset="100%" className="brainglobe-stop-spec" stopOpacity="0" />
          </radialGradient>
          {GRADIENTS.map((n) => (
            /* The limb. Nothing at all across the middle half of the orb, then
               a ramp into the orb's own deep colour at the rim — the curvature,
               said once per colour and shared by every orb wearing it. */
            <radialGradient key={`l${n}`} id={`${uid}-l${n}`} cx="50%" cy="50%" r="50%">
              <stop offset={`${LIMB_INNER * 100}%`} className={`brainglobe-stop-deep-${n}`} stopOpacity="0" />
              <stop offset="80%" className={`brainglobe-stop-deep-${n}`} stopOpacity="0.34" />
              <stop offset="100%" className={`brainglobe-stop-deep-${n}`} stopOpacity="1" />
            </radialGradient>
          ))}
          {GRADIENTS.map((n) => (
            <radialGradient key={`t${n}`} id={`${uid}-t${n}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" className={`brainglobe-stop-deep-${n}`} stopOpacity="0.9" />
              <stop offset="50%" className={`brainglobe-stop-deep-${n}`} stopOpacity="0.58" />
              <stop offset="100%" className={`brainglobe-stop-deep-${n}`} stopOpacity="0" />
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

        {/*
          V1.8 VB-48 — THE WORK BRAIN: the files, as a network of their own.

          Drawn first, so the solid that grows out of one of them paints over
          the joints rather than under them. It is the same object language one
          level up — orbs and edges, lit by the same rule
          (core/globe/illumination.ts) — because the work brain IS a brain, and
          a different vocabulary here would make the two tiers look like two
          pictures rather than one thing at two distances.

          The file that has content is not in this loop: it is the solid itself,
          shrunk into its node by the camera below. That is the whole idea of
          VB-48 rather than a drawing of it.
        */}
        {workEnabled && workFade > WORK_NODE_GONE && (
          <g className="brainglobe-work" opacity={workFade.toFixed(3)}>
            <g className="brainglobe-work-edges">
              {workEdges(workFiles.length).map(([a, b]) => {
                const from = workNodePosition(a, workFiles.length);
                const to = workNodePosition(b, workFiles.length);
                const light = edgeLight(workNodeState(workFiles[a]!), workNodeState(workFiles[b]!));
                /* TRIMMED TO BOTH RIMS, exactly as V1.4's joints are, and for
                   the same reason: a line that runs to a node's centre crosses
                   the node, and three lines crossing three files read as a
                   triangle drawn over them rather than as three things joined.
                   The Context end is trimmed by the SOLID's own radius, so the
                   joint meets the mini brain's silhouette however it is turned.
                   Found by screenshot — the untrimmed version cut straight
                   through both dashed shells. */
                const radiusOf = (index: number) =>
                  (index === fileIndex ? solidR * camera.scale : WORK_NODE_R) + WORK_LINK_GAP;
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const length = Math.hypot(dx, dy) || 1;
                const ux = dx / length;
                const uy = dy / length;
                const x1 = from.x + ux * radiusOf(a);
                const y1 = from.y + uy * radiusOf(a);
                const x2 = to.x - ux * radiusOf(b);
                const y2 = to.y - uy * radiusOf(b);
                // Two nodes so close that the trim would invert simply have no
                // gap to draw a joint in.
                if (radiusOf(a) + radiusOf(b) >= length) return null;
                return (
                  <g key={`${a}-${b}`} data-edge={`${a}-${b}`} data-edge-light={light}>
                    <line
                      className="brainglobe-edge-far"
                      x1={x1.toFixed(2)}
                      y1={y1.toFixed(2)}
                      x2={x2.toFixed(2)}
                      y2={y2.toFixed(2)}
                      strokeWidth="1.6"
                      strokeOpacity="0.3"
                      strokeLinecap="round"
                    />
                    <line
                      className="brainglobe-edge-near"
                      x1={x1.toFixed(2)}
                      y1={y1.toFixed(2)}
                      x2={x2.toFixed(2)}
                      y2={y2.toFixed(2)}
                      strokeWidth="1.6"
                      strokeOpacity={(EDGE_LIT_OPACITY * EDGE_LIGHT_LEVEL[light]).toFixed(3)}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })}
            </g>
            {workFiles.map((item, index) => {
              if (index === fileIndex) return null;
              const at = workNodePosition(index, workFiles.length);
              const gradient = childNodeGradient(index);
              const locked = !!item.lock;
              /* V1.9 VB-54. The tier above is in the same room, so its orbs are
                 under the same light — a file node lit by a different rule
                 would be the thing that makes the two tiers look like two
                 pictures rather than one object at two distances. A LOCKED node
                 is not lit at all: it is an empty dashed shell with nothing
                 inside it, and a highlight on an empty shell would say there is
                 a surface there to catch the light. */
              const light = stageLight(at.x, at.y, 0);
              return (
                <g
                  className="brainglobe-file-node"
                  key={item.id}
                  data-file-id={item.id}
                  data-locked={locked ? 'true' : 'false'}
                >
                  {!locked && (
                    <circle
                      className="brainglobe-bloom"
                      cx={at.x.toFixed(2)}
                      cy={at.y.toFixed(2)}
                      r={(WORK_NODE_R * BLOOM_SCALE).toFixed(2)}
                      fill={`url(#${uid}-b${gradient})`}
                      opacity="0.5"
                    />
                  )}
                  {/* AN EMPTY FILE IS AN EMPTY SHELL, and that is a SHAPE. A
                      locked node is an open dashed rim with nothing inside it;
                      a built one is a filled orb. Brightness is the third cue
                      and never the only one — the node also carries a padlock
                      in the overlay and says "Locked" plus what unlocks it in
                      its own name (docs/GUARDRAILS.md: nothing by colour
                      alone). */}
                  <circle
                    className={locked ? 'brainglobe-file-shell' : `brainglobe-sphere brainglobe-solid-${gradient}`}
                    cx={at.x.toFixed(2)}
                    cy={at.y.toFixed(2)}
                    r={WORK_NODE_R}
                  />
                  {!locked && (
                    <OrbLit
                      uid={uid}
                      cx={at.x}
                      cy={at.y}
                      r={WORK_NODE_R}
                      gradient={gradient}
                      light={light}
                      spec={light.highlight * SPEC_STRENGTH}
                      terminator={light.shade * TERMINATOR_GAIN}
                      limb={LIMB_STRENGTH}
                    />
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/*
          V1.8 VB-48 — the tier camera, and everything below it is untouched.

          `translate(x y) scale(k)`, which maps a point p to `x + k·p`: at the
          work tier the whole file is drawn at a third of its size, centred on
          its own node; at the file tier it is `translate(0 0) scale(1)`, the
          identity. Wrapped around the scene rather than folded into it, so the
          fly-in's camera, the split, the summaries, the detail band and the
          drawer's morph all keep measuring in the coordinates they were written
          in (see this file's header, and core/globe/workBrain.ts).
        */}
        <g
          className="brainglobe-tier"
          transform={`translate(${camera.x.toFixed(3)} ${camera.y.toFixed(3)}) scale(${camera.scale.toFixed(4)})`}
        >
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
                // V1.8 VB-46: what makes an orb lit is `sectionLife`, the rule
                // the List's rows read too — never a second test here.
                const life = entry ? lifeOf(entry.section) : 'lit';
                const lit = !structural && sectionIsLit(life);
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
                const muted = !lit;
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

                /**
                 * V1.9 VB-54 — where this orb stands under the one light.
                 *
                 * Read off the ON-SCREEN position (`lx`/`ly`, then the tier
                 * camera) rather than the drawing coordinates, because the
                 * light is fixed in the STAGE and not in the scene group that
                 * slides and scales under it. That difference is the whole
                 * feature: turn the globe and every highlight walks across its
                 * own orb, because each orb really has moved relative to the
                 * source.
                 *
                 * The depth is the vertex's own, mapped back out of `t` into
                 * the same normalised units — the solid reaches ±PHI in vertex
                 * units, which is ±0.6 of the stage at GEO. So a node at the
                 * front is genuinely nearer the light than one at the back and
                 * is shaded less, which is a thing a flat picture cannot say.
                 */
                const at = onStage(node.lx, node.ly);
                const nodeLight = stageLight(at.x, at.y, (node.t * 2 - 1) * SOLID_Z_HALF);

                return (
                  <g
                    key={vertexIndex}
                    className="brainglobe-node"
                    data-node-index={vertexIndex}
                    data-section-id={entry?.section.id ?? ''}
                    data-node-state={structural ? 'structural' : state}
                    data-node-life={structural ? 'structural' : life}
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
                    {life === 'live' && !structural && (
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
                    <g
                      className="brainglobe-orb"
                      data-lit={muted ? 'muted' : 'lit'}
                      /* V1.9 VB-54. Published so a test can read what the light
                         did to THIS orb and compare it with its neighbours —
                         one scene light is a claim about the relationship
                         between orbs, and only the whole set can show it. */
                      data-shade={nodeLight.shade.toFixed(3)}
                      data-highlight={`${nodeLight.hx.toFixed(3)},${nodeLight.hy.toFixed(3)}`}
                    >
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
                      {/* The light itself. Depth turns the terminator down as
                          the orb recedes (TERMINATOR_DEPTH_FLOOR) so the back
                          of the solid never sinks into the field, which is the
                          floor VB-24 measured and this must not spend. */}
                      <OrbLit
                        uid={uid}
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        gradient={gradient}
                        light={nodeLight}
                        spec={nodeLight.highlight * SPEC_STRENGTH * (muted ? MUTED_SPEC_SCALE : 1)}
                        terminator={
                          nodeLight.shade *
                          TERMINATOR_GAIN *
                          (TERMINATOR_DEPTH_FLOOR + (1 - TERMINATOR_DEPTH_FLOOR) * node.t)
                        }
                        limb={
                          LIMB_STRENGTH *
                          (muted ? MUTED_LIMB_SCALE : 1) *
                          (TERMINATOR_DEPTH_FLOOR + (1 - TERMINATOR_DEPTH_FLOOR) * node.t)
                        }
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
            {childLayout.map(({ child, progress, x, y, radius, gradient, fade, picked }) => {
              if (progress <= 0) return null;
              /* V1.9 VB-54. The cluster is on the stage's own plane (z = 0) —
                 it is drawn outside the scene transform, which is exactly why
                 the section it rings has already been walked to the origin. So
                 its orbs are lit from where they sit, and the ring's left-hand
                 nodes catch the light while its right-hand ones carry the
                 shading, which is what makes six circles read as six spheres
                 around one centre rather than as a dial. */
              const at = onStage(x, y);
              const light = stageLight(at.x, at.y, 0);
              return (
                <g
                  key={child.id}
                  className="brainglobe-child-node"
                  data-child-id={child.id}
                  data-picked={picked ? 'true' : 'false'}
                  data-shade={light.shade.toFixed(3)}
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
                  <OrbLit
                    uid={uid}
                    cx={x}
                    cy={y}
                    r={radius}
                    gradient={gradient}
                    light={light}
                    spec={light.highlight * SPEC_STRENGTH}
                    terminator={light.shade * TERMINATOR_GAIN}
                    limb={LIMB_STRENGTH}
                  />
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* The whole interactive layer. Real buttons, real text, positioned in
          percentages over the stage. */}
      <div
        className="brainglobe-pins"
        role="group"
        /* V1.8 VB-48. The stage is a different thing at each tier and says so:
           the files, or one file. The words are `strings.ts`'s and the pair is
           deliberate — "Your work brain" is the product's own phrase for the
           set of files, and it is what Home calls the same thing. */
        aria-label={tierShown === 'work' ? S.workBrainStage : S.brainGlobeStage}
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
            // V1.8 VB-48. The names of ten sections crammed over a solid drawn
            // at a third of its size is a smudge, so they arrive with the
            // camera: the tier's own clock is a multiplier here, and at the
            // file tier it is 1 and changes nothing. SQUARED, because linear
            // put them at three-quarters opacity a third of the way in, where
            // the solid is still small enough for two of them to collide —
            // seen in a screenshot of the transition, not reasoned about.
            const labelOpacity =
              (LABEL_OPACITY_MIN + node.t * (1 - LABEL_OPACITY_MIN)) * labelFade * (isFlown ? 1 - es : 1) * et * et;
            // V1.8 VB-48. The overlay cannot inherit an SVG transform, so it
            // goes through the same camera the picture does — one function,
            // core/globe/workBrain.ts's, called by both layers.
            const at = onStage(node.lx, node.ly);
            const left = pct(at.x);
            // The hit target — and therefore where the label sits — follows the
            // orb whenever the orb is bigger than the 44px floor. Without this
            // the centre orb grew to 93px at VB-23's CENTRE_R and its own name
            // was printed across the middle of it.
            const orbPx = ((isFlown ? centreR : node.radius * frame.sceneScale) * camera.scale * size) / 100;
            const style = {
              left: `${left}%`,
              top: `${pct(at.y)}%`,
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
                //
                // V1.8 VB-48: and the whole set goes at the work tier, where
                // the solid is one node among the files. It is keyed to the
                // TIER and not to the tier's clock, so the sections are
                // reachable the moment the camera starts moving in — which is
                // what lets focus land on one instead of falling to the body
                // when the file node that was pressed disappears.
                hidden={tierShown === 'work' || (inside && (!isFlown || pickedChildId !== null))}
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
              // V1.5 VB-27. The card is a description of this node, so it is
              // announced as one — the same summary a sighted person reads,
              // on the same focus, with nothing moving.
              data-has-summary={summaries?.[child.id] ? 'true' : 'false'}
              {...(summaryId === child.id ? { 'aria-describedby': summaryDomId } : {})}
              onPointerEnter={(event) => {
                // Records where the pointer is; the OPEN happens on the first
                // real movement inside the node (the stage's own pointer-move
                // handler, above). Only a pointer that can hover counts: on a
                // touch screen this fires as the first half of the tap that
                // follows it, and treating that as a hover would make the tap
                // below think the reveal had already happened — which is the
                // bug that leaves a touch user with no summary at all.
                if (event.pointerType !== 'mouse') return;
                pointerOverRef.current = child.id;
              }}
              onPointerLeave={(event) => {
                if (pointerOverRef.current === child.id) pointerOverRef.current = null;
                // A dismissal lasts as long as the hover it dismissed: leaving
                // the node and coming back is a new question.
                if (dismissedRef.current === child.id) dismissedRef.current = null;
                if (event.pointerType !== 'mouse') return;
                // Still the focused node: the card is being held open by the
                // keyboard, and the mouse leaving is not that person's doing.
                if (document.activeElement === event.currentTarget) return;
                if (summaryId === child.id) closeSummarySoon();
              }}
              onFocus={() => {
                if (skipFocusOpenRef.current === child.id) {
                  skipFocusOpenRef.current = null;
                  return;
                }
                if (summaries?.[child.id] && pickedChildId === null) openSummary(child.id);
              }}
              onBlur={() => {
                // Unless the pointer is still resting on it, in which case the
                // card is open for a reason that has not gone away.
                if (pointerOverRef.current === child.id) return;
                // Immediately, not after the hover grace: focus has gone
                // somewhere else on purpose, and there is no gap for it to
                // travel across. Tabbing from a node that has a summary to one
                // that has none must leave nothing behind.
                if (summaryId === child.id) closeSummary();
              }}
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
                  // Through the tier camera, like every other control on this
                  // stage (V1.8 VB-48). At the file tier — the only tier a
                  // sub-node can be on screen at — that is the identity.
                  left: `${pct(onStage(x, y).x)}%`,
                  top: `${pct(onStage(x, y).y)}%`,
                  // The hit target grows with the orb once it is featured, so
                  // the whole of a 60px circle answers a click rather than a
                  // 44px square in the middle of it. `max()` in the stylesheet
                  // keeps the 44px floor whatever this says.
                  '--brainglobe-hit-size': `${((radius * camera.scale * size) / 100).toFixed(1)}px`,
                  '--brainglobe-label-opacity': (progress * (picked ? 1 - es : 1)).toFixed(3),
                  '--brainglobe-label-size': `${LABEL_SIZE_MIN - 0.5}px`,
                  '--brainglobe-label-weight': '550',
                  '--brainglobe-label-shift': labelPlacement(pct(onStage(x, y).x)).shift,
                  '--brainglobe-label-room': labelPlacement(pct(onStage(x, y).x)).room,
                } as CSSProperties
              }
              onClick={(event) => {
                if (draggedRef.current) return;
                /**
                 * V1.5 VB-27's third way in. A tap on a pointer that cannot
                 * hover opens the summary and stops there; the tap after it
                 * picks the node. On a mouse and from the keyboard nothing
                 * changes — hover or focus has already opened the card, so
                 * the first click still picks, exactly as it did before.
                 *
                 * `pointerType` read defensively: `click` is a PointerEvent in
                 * every browser this ships in, but it is a plain MouseEvent in
                 * jsdom, and a picture must never be the thing that throws.
                 */
                const native: MouseEvent = event.nativeEvent;
                const pointerType = 'pointerType' in native ? String((native as PointerEvent).pointerType) : '';
                const cannotHover = pointerType === 'touch' || pointerType === 'pen';
                if (cannotHover && summaries?.[child.id] && tapRevealedRef.current !== child.id && !picked) {
                  tapRevealedRef.current = child.id;
                  openSummary(child.id);
                  return;
                }
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

        {/*
          V1.8 VB-48 — THE FILE NODES, as real controls.

          Three ordinary tab stops rather than the roving tabindex the ten
          section pins use, and that difference is deliberate: the roving one
          exists because ten nodes that each spin a globe make tabbing past the
          drawer intolerable (decision 3 in the header). Three stops that move
          nothing when they are reached are not that problem, and a plain tab
          order is what somebody expects of three files side by side.

          NOT MOUNTED AT THE FILE TIER AT ALL, rather than mounted and hidden.
          The sections you have flown away from can afford `hidden` — they come
          back within one gesture and the pins are measured by the morph — but
          a control that is out of reach for as long as somebody is inside a
          file is a control that should not be in the drawer's markup. It is
          also what tests/e2e/file-tree.a11y.spec.ts asks for in as many words:
          every button the drawer adds has a box and clears 44×44.
        */}
        {workEnabled &&
          tierShown === 'work' &&
          workFiles.map((item, index) => {
            const home = workNodePosition(index, workFiles.length);
            const isSolid = index === fileIndex;
            const locked = !!item.lock;
            // The file that holds the solid is as big as the solid is; the rest
            // are their own radius. Both go through the camera, so the hit
            // target sits on the node at every frame of the flight.
            const at = onStage(0, 0);
            const centre = isSolid ? { x: at.x, y: at.y } : home;
            const radius = isSolid ? solidR * camera.scale : WORK_NODE_R;
            const left = pct(centre.x);
            return (
              <button
                key={item.id}
                type="button"
                ref={(el) => {
                  if (el) fileRefs.current.set(item.id, el);
                  else fileRefs.current.delete(item.id);
                }}
                className="brainglobe-pin is-file"
                data-file-id={item.id}
                data-locked={locked ? 'true' : 'false'}
                data-solid={isSolid ? 'true' : 'false'}
                aria-pressed={isSolid}
                // Not `disabled`: a locked file still has something to say, and
                // a disabled control is unreachable by keyboard, so its sentence
                // would be too. `aria-disabled` says the same to assistive tech
                // while leaving it focusable — and pressing it moves nothing,
                // because `chooseNav` refuses. Identical to the drawer's toggle,
                // on purpose (components/FileTypeToggle.tsx).
                {...(locked ? { 'aria-disabled': true } : {})}
                // The whole truth, spoken on focus: the file, that it is locked,
                // and what unlocks it — the same sentence the toggle and the
                // shelf say, from the same fold.
                aria-label={
                  item.lock
                    ? S.fileToggleLockedName(fileName(item.id), lockLine(item.lock))
                    : S.brainGlobeNode(fileName(item.id), S.workBrainOpen)
                }
                title={fileName(item.id)}
                style={
                  {
                    left: `${left}%`,
                    top: `${pct(centre.y)}%`,
                    '--brainglobe-hit-size': `${((radius * size) / 100).toFixed(1)}px`,
                    '--brainglobe-label-opacity': (isSolid ? 1 : workFade).toFixed(3),
                    '--brainglobe-label-size': `${LABEL_SIZE_MIN + LABEL_SIZE_SPAN / 2}px`,
                    '--brainglobe-label-weight': '650',
                    '--brainglobe-label-shift': labelPlacement(left).shift,
                    '--brainglobe-label-room': labelPlacement(left).room,
                  } as CSSProperties
                }
                onClick={() => {
                  if (draggedRef.current) return;
                  pressFile(item.id);
                }}
              >
                <span className="brainglobe-hit" aria-hidden="true" />
                <span className="brainglobe-label" aria-hidden="true">
                  {/* The padlock, at the same 12px the toggle's segments draw
                      it — one glyph, one place (components/FileTypeToggle.tsx),
                      so the two surfaces cannot end up with two padlocks. */}
                  {locked && <LockGlyph />}
                  {fileName(item.id)}
                </span>
              </button>
            );
          })}
      </div>

      {/*
        V1.5 VB-27 — the floating summary.

        Outside `.brainglobe-pins` on purpose: it is not a control and must
        never sit inside the group of them, where a screen reader would count
        it among the nodes. It is `role="tooltip"`, pointed at by the node's
        own `aria-describedby` while it is open, and it holds nothing
        focusable — so Tab goes straight from the node to the next node and
        there is no trap to escape from.

        Mounted only while it is open, so nothing behind the globe holds a
        description of a node nobody is on.
      */}
      {openSummaryData && (
        <NodeSummaryCard
          id={summaryDomId}
          summary={openSummaryData}
          recommendation={recommendations?.[openSummaryData.nodeId]?.[0]}
          place={summaryPlace}
          room={summaryRoom}
        />
      )}

      {/*
        V1.4 VB-23 — the other half of the split. V1.6 VB-31 — free text,
        centred on the node, with no box around it at all.

        A `region` rather than a plain div, and focusable, because it scrolls:
        `2.1 Roles` with three records is thirteen answers and taller than any
        band this stage can offer, and a scrolling box a keyboard cannot reach
        is a box whose bottom half does not exist (WCAG 2.1.1, and axe's
        `scrollable-region-focusable`). It is a stop *after* the sub-node that
        opened it and *before* the way back out, so tabbing forward leaves the
        globe exactly as it did before the split existed — no trap.

        The four numbers below are the whole of its placement (core/globe/
        detailBand.ts): a centre on the node, a measure, a top under the orb's
        rim, and the room between that and the stage's floor. The room is a cap
        and not a target — a one-sentence node draws one sentence.

        Mounted only while a sub-node is picked, so nothing behind the globe
        holds a name or a tab stop it should not.
      */}
      {pickedChild && band && (
        <div
          className="brainglobe-detail"
          ref={detailRef}
          role="region"
          tabIndex={0}
          aria-label={S.brainGlobeDetail(pickedChild.label)}
          data-detail-id={pickedChild.id}
          /* Measured, not guessed — see `detailScrolls`. It draws the fade at
             the block's foot and nothing else; the scrolling itself is the
             browser's and the tab stop above is what reaches it. */
          data-scrolls={detailScrolls ? 'true' : 'false'}
          style={
            {
              '--brainglobe-split': es.toFixed(3),
              '--brainglobe-detail-centre': `${band.centre.toFixed(2)}px`,
              '--brainglobe-detail-width': `${band.width.toFixed(2)}px`,
              '--brainglobe-detail-top': `${band.top.toFixed(2)}px`,
              '--brainglobe-detail-room': `${band.room.toFixed(2)}px`,
            } as CSSProperties
          }
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

      {/*
        V1.8 VB-48 — the way back out of the file.

        In the same corner as `Back to the whole file` and never on screen at
        the same time as it: the two are rungs of one ladder, and the one being
        offered is always the next step out from where you are. Escape does the
        same thing, in the same order, for anyone who never reaches for it.
      */}
      {workEnabled && tierShown === 'file' && !inside && (
        <button type="button" className="brainglobe-back is-out" onClick={goWork}>
          {S.workBrainBack}
        </button>
      )}

      {/*
        V1.8 VB-48 — what a locked file is waiting for, printed.

        The drawer's toggle prints this line under its strip and Home prints it
        in the row; the globe prints it under the stage. One sentence, from one
        fold (core/files/toggle.ts), on all three surfaces — a locked file that
        said three different things would be three different products.
      */}
      {workEnabled && explaining?.lock && tierShown === 'work' && (
        <p className="brainglobe-locknote">
          {S.fileToggleLockedNote(fileName(explaining.id), lockLine(explaining.lock))}
        </p>
      )}

      {/* Said once, to whoever needs it, and never printed on the picture.
          V1.8 VB-48: what there is to do differs by tier, so what it says does
          — the arrows step between sections down there and there is nothing to
          step between up here. */}
      <p className="brainglobe-sr" id={`${uid}-help`}>
        {tierShown === 'work' ? S.workBrainHelp : S.brainGlobeHelp}
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
