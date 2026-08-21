/**
 * The Workbrain mark, as real 3D geometry that can be turned. V1.2 VB-13.
 *
 * PORTED, NOT INVENTED. `../modelcitizen/src/components/ModelSphere.tsx`
 * builds a genuine icosahedron from the golden ratio, rotates every vertex on
 * the vertical axis, applies a fixed camera tilt, and re-derives each vertex's
 * depth every frame. That is what makes the mark read as a sphere turning
 * rather than a flat card spinning: near nodes grow and brighten, far ones
 * shrink and dim, and the paint order re-sorts continuously.
 *
 * WHY THIS IS IN core/ AND NOT IN THE COMPONENT
 * Vertex construction, rotation, projection and depth shading are arithmetic.
 * They have no DOM in them, they are worth testing, and CLAUDE.md's one
 * architectural rule says that makes them core's. The component's whole job is
 * to turn the numbers below into attributes.
 *
 * WHAT THIS FILE ADDS TO `icosahedron.ts`, AND WHY IT IS SEPARATE
 * The solid itself — twelve vertices, thirty edges, the rotation — belongs to
 * `./icosahedron.ts` and is imported, never re-typed. What lives here is only
 * the *mark's own camera*: an orthographic projection at the exact radius,
 * tilt and framing `mark.svg` was exported at, and the three depth ramps that
 * export bakes in. VB-14's globe wants a different camera (perspective, so it
 * can push in during a fly-in) and a different depth normalisation (absolute,
 * because its camera moves). Sharing the solid and not the camera is what lets
 * both be right.
 *
 * WHAT THE SHIPPED STATIC MARK TURNS OUT TO BE
 * V1.1's `BrandMark` transcribed `../modelcitizen/public/mark.svg` — a single
 * exported pose — as thirty literal edges and twelve literal nodes. Fitting
 * this construction back onto those literals recovers the export's own camera
 * exactly: a projected radius of 98 about (120,120), a 14° tilt, and a spin of
 * 204°. Every one of the twenty-four coordinates lands within 0.006px, and the
 * export's radii, stroke widths and stroke opacities all fall out as clean
 * linear ramps on depth (see below, and `markSpin.test.ts`, which asserts
 * frame 204° equals the shipped export attribute for attribute).
 *
 * So the mark we already ship is literally one frame of this animation. That
 * is what lets `prefers-reduced-motion` fall back to "exactly today's static
 * mark" without keeping a second copy of the drawing around to drift.
 */
import {
  ICOSAHEDRON_EDGES,
  ICOSAHEDRON_VERTICES,
  PHI,
  rotate,
  type Vec3,
} from './icosahedron';

/** The mark's viewBox is `0 0 240 240` and its centre is the middle of it. */
export const MARK_VIEWBOX = 240;
export const MARK_CENTRE = MARK_VIEWBOX / 2;
/** Projected radius of the solid, in viewBox units — the export's own. */
export const MARK_RADIUS = 98;
/**
 * Vertex units to viewBox units. `icosahedron.ts` keeps its vertices on the
 * raw (0, ±1, ±PHI) construction rather than normalising them, so the
 * circumradius is hypot(1, PHI) and the mark divides it out here. Every vertex
 * has that same length, so this is an exact rescale and not an approximation.
 */
export const MARK_SCALE = MARK_RADIUS / Math.hypot(1, PHI);
/** The export's fixed camera tilt. Applied after the spin, never animated. */
export const MARK_TILT = (14 * Math.PI) / 180;
/** The pose `mark.svg` was exported at — and so the still, reduced-motion mark. */
export const MARK_STATIC_ANGLE = (204 * Math.PI) / 180;
/** One revolution, from `ModelSphere`'s `SPIN_MS`. Ported, not re-tuned. */
export const MARK_SPIN_MS = 9000;

/**
 * Depth shading, all three recovered from `mark.svg` as exact linear ramps on
 * depth (0 = furthest vertex this frame, 1 = nearest). These are what make a
 * flat drawing read as a sphere; they are the export's numbers, not new ones.
 */
const NODE_R_NEAR = 6.5;
const NODE_R_SPAN = 5;
const EDGE_W_FAR = 2.6;
const EDGE_W_SPAN = 2.2;
const EDGE_O_FAR = 0.35;
const EDGE_O_SPAN = 0.55;

/** A vertex's identity, independent of where it sits in any array. */
function signature({ x, y, z }: Vec3): string {
  const r = (n: number) => Math.round(n * 1e6);
  return `${r(x)},${r(y)},${r(z)}`;
}

/**
 * Which of the five brand gradients each vertex wears, keyed by *where the
 * vertex is* rather than by its index.
 *
 * Recovered from `mark.svg`. Two things this keying buys. First, the export
 * assigns colour per vertex, not per depth rank — the only assignment that
 * survives rotation, since colouring by rank would make the palette crawl
 * around the solid as it turns. Second, `icosahedron.ts` is free to reorder
 * or re-derive its vertex list without silently repainting the logo.
 */
const GRADIENT_BY_POSITION: ReadonlyMap<string, number> = new Map([
  [signature({ x: -1, y: PHI, z: 0 }), 2],
  [signature({ x: 1, y: PHI, z: 0 }), 1],
  [signature({ x: -1, y: -PHI, z: 0 }), 4],
  [signature({ x: 1, y: -PHI, z: 0 }), 3],
  [signature({ x: 0, y: -1, z: PHI }), 2],
  [signature({ x: 0, y: 1, z: PHI }), 3],
  [signature({ x: 0, y: -1, z: -PHI }), 5],
  [signature({ x: 0, y: 1, z: -PHI }), 1],
  [signature({ x: PHI, y: 0, z: -1 }), 2],
  [signature({ x: PHI, y: 0, z: 1 }), 1],
  [signature({ x: -PHI, y: 0, z: -1 }), 5],
  [signature({ x: -PHI, y: 0, z: 1 }), 4],
]);

/**
 * The gradient for each vertex of `ICOSAHEDRON_VERTICES`, resolved once.
 *
 * Falls back to gradient 1 rather than throwing: a mark drawn in one colour is
 * a worse logo, not a broken panel, and `docs/GUARDRAILS.md` says degrade.
 * `markSpin.test.ts` asserts the fallback is never actually reached.
 */
export const NODE_GRADIENT: readonly number[] = ICOSAHEDRON_VERTICES.map(
  (v) => GRADIENT_BY_POSITION.get(signature(v)) ?? 1,
);

export interface ProjectedVertex {
  /** viewBox x, already centred and scaled. */
  readonly x: number;
  /** viewBox y, already centred, scaled and flipped for SVG's downward y. */
  readonly y: number;
  /** Depth, 0 = furthest this frame, 1 = nearest. Drives every shading ramp. */
  readonly depth: number;
}

/**
 * Every vertex at a given spin angle, in viewBox coordinates.
 *
 * Spin first, fixed tilt second — `icosahedron.ts`'s `rotate` already applies
 * them in that order, which is the mark generator's own. Swapping them tips
 * the axis the sphere turns on and it stops reading as a globe.
 *
 * Depth is normalised against *this frame's* own near and far vertices, which
 * is `ModelSphere`'s behaviour and deliberately not `icosahedron.ts`'s
 * absolute `depth()`. With a fixed orthographic camera the near–far contrast
 * should be identical at every angle; an absolute ramp would make the whole
 * mark subtly brighten and dim once per revolution.
 */
export function projectMark(spinAngle: number): ProjectedVertex[] {
  const rotated = ICOSAHEDRON_VERTICES.map((v) => rotate(v, MARK_TILT, spinAngle));
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const { z } of rotated) {
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }
  const span = zMax - zMin || 1;
  return rotated.map(({ x, y, z }) => ({
    x: MARK_CENTRE + x * MARK_SCALE,
    y: MARK_CENTRE - y * MARK_SCALE,
    depth: (z - zMin) / span,
  }));
}

export interface MarkEdge {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly width: number;
  readonly opacity: number;
}

export interface MarkNode {
  /** Which vertex this is. Stable across frames — the colour rides on it. */
  readonly vertex: number;
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  /** 1–5, indexing the brand gradients. Never changes for a given vertex. */
  readonly gradient: number;
}

export interface MarkFrame {
  readonly edges: readonly MarkEdge[];
  /** Sorted furthest-first: SVG paints in document order, so this is depth. */
  readonly nodes: readonly MarkNode[];
}

/**
 * Two decimals, matching the precision `mark.svg` exports at.
 *
 * Not cosmetic. Rounding here is what makes frame 204° *equal* the shipped
 * static mark instead of differing in the ninth decimal, and it keeps short
 * the attribute strings the animation writes sixty times a second.
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The whole mark at one spin angle: thirty edges, and twelve nodes sorted
 * furthest-first.
 *
 * Edges are emitted in `ICOSAHEDRON_EDGES` order and that order is not a
 * depth sort, deliberately. Every edge is stroked in the same `--brand-edge`
 * colour, and `source-over` compositing of one colour at differing alphas is
 * order-independent, so sorting them would cost a sort per frame and change
 * nothing on screen. The nodes carry five different gradients and are opaque,
 * so their order genuinely is the depth cue and they are sorted.
 *
 * Pure and allocating — a fresh frame every call. At twelve vertices and
 * thirty edges that is a few hundred floating-point operations, nothing next
 * to the DOM writes the caller then does with it.
 */
export function markFrame(spinAngle: number): MarkFrame {
  const p = projectMark(spinAngle);

  const edges = ICOSAHEDRON_EDGES.map(([a, b]) => {
    const pa = p[a]!;
    const pb = p[b]!;
    const depth = (pa.depth + pb.depth) / 2;
    return {
      x1: round2(pa.x),
      y1: round2(pa.y),
      x2: round2(pb.x),
      y2: round2(pb.y),
      width: round2(EDGE_W_FAR + depth * EDGE_W_SPAN),
      opacity: round2(EDGE_O_FAR + depth * EDGE_O_SPAN),
    };
  });

  const nodes = p
    .map((v, vertex) => ({
      vertex,
      cx: round2(v.x),
      cy: round2(v.y),
      r: round2(NODE_R_NEAR + v.depth * NODE_R_SPAN),
      gradient: NODE_GRADIENT[vertex]!,
      depth: v.depth,
    }))
    .sort((a, b) => a.depth - b.depth)
    .map(({ vertex, cx, cy, r, gradient }) => ({ vertex, cx, cy, r, gradient }));

  return { edges, nodes };
}

/**
 * The spin angle for a moment on a monotonic clock.
 *
 * Takes an absolute timestamp, not "milliseconds since this component
 * mounted", and that is deliberate. `Flow` remounts its step view on every
 * question (`key={positionKey(position)}`), so a mount-relative angle would
 * snap the status-bar mark back to its start pose forty-nine times during one
 * interview. Phasing off the shared clock instead means the mark carries on
 * from wherever it had got to, and remounting is invisible.
 */
export function spinAngleAt(nowMs: number, periodMs: number = MARK_SPIN_MS): number {
  if (!(periodMs > 0)) return 0;
  const turns = nowMs / periodMs;
  return (turns - Math.floor(turns)) * Math.PI * 2;
}
