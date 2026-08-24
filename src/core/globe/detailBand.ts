/**
 * V1.6 VB-31 — where the detail zoom's text may sit, given where its node is.
 *
 * docs/V1.6-REFINEMENT.md's VB-31 replaces the split's bordered panel with free
 * text: centred horizontally on the featured node, no card, no box, and the
 * same shape for every node. Two of those words — "centred" and "free" — are
 * the whole reason this file exists, because with no box to contain it the text
 * has nothing but arithmetic keeping it off the orb it describes.
 *
 * ── The band, and why it is below the node ────────────────────────────────
 *
 * V1.5 VB-27 hit this first with the hover card and solved it by measurement
 * rather than by hope: `summaryRoom` in components/BrainGlobe.tsx caps the card
 * at the real px distance from the stage's edge to the near side of the orb, so
 * the card cannot grow into the node whatever the content does. Its own comment
 * records why — the first attempt cut straight through the Roles orb.
 *
 * This is the same guarantee for the same reason. The featured node sits on the
 * stage's vertical middle (FEATURE_Y), so the band runs from the orb's *lowest
 * point* to the stage's floor and the text is capped at it. Below the rim and
 * capped at the floor, the text cannot reach the orb from any direction: not by
 * growing, not at a smaller stage, not with a longer answer in it.
 *
 * ── "Centred on the node", and the width that comes out of it ─────────────
 *
 * The measure is NOT a number somebody liked. It falls out of how far off the
 * node's own centre the text is allowed to sit, and that is the only taste
 * decision here.
 *
 * Dead-centre — `centre === node` — is what this returns whenever the stage
 * allows it, and on the stages the drawer opens Brain at it does not allow much.
 * The featured node lands at 21% of the stage's width (FEATURE_X, set in V1.4
 * so the orb sat in the middle of what was left beside the panel VB-31 is
 * deleting), so a column dead-centred on it with both edges on a 260px stage is
 * 2 × (0.21 × 260) − margins ≈ **93px**. Screenshotted at that width, "Manager
 * / Team Lead" breaks across two lines and three lines of a section's answers
 * are all that fit: centred, and unreadable.
 *
 * So the rule is: **the widest column whose centre is still inside the orb's own
 * middle.** `driftAllowance` is a fraction of the node's RADIUS, so the tolerance
 * scales with the picture rather than being a px value that means one thing at
 * 260 and another at 380 — at 0.5 the block's axis lands halfway between the
 * node's centre and its rim, which on the 300px stage is 14px, under 5% of the
 * stage, and is not a distance anybody reads as "offset to one side". It buys
 * about 50% more measure than dead-centre for it.
 *
 * Two things fall out of this and both are worth knowing:
 *
 *  - A node ON the stage's own axis gets a dead-centred, full-width block with
 *    no allowance spent at all. ONE NUMBER WOULD DO THAT HERE: FEATURE_X.
 *    VB-31 says to keep the node exactly where it is, so the allowance is the
 *    price of that and is written down rather than discovered later.
 *  - The direction of the slide is towards the middle of the stage and never
 *    away from it, which is `labelPlacement`'s rule in components/BrainGlobe.tsx
 *    — the one every other label on this globe is already placed by: "A label is
 *    centred under its node, so a node near the rim would push half its name off
 *    the stage... So the label slides back towards the middle."
 *
 * `drift` is published so a test can assert both halves: that it never exceeds
 * the allowance, and that it is zero the moment the geometry stops forcing it.
 */

export interface DetailBandInput {
  /** The stage's side in px. It is square, so one number does both axes. */
  size: number;
  /** The featured node's centre, as fractions of the stage (0 → 1). */
  nodeX: number;
  nodeY: number;
  /** The featured node's radius, as a fraction of the stage's side. */
  nodeRadius: number;
  /**
   * How far the block's centre may sit from the node's own centre, as a
   * fraction of the node's RADIUS. This is what buys the measure — see the
   * header. 0 gives a column dead-centred on the node and as narrow as that
   * makes it; 1 puts the block's axis on the orb's rim.
   */
  driftAllowance: number;
  /** The margin the block keeps from the stage's own edges, in px. */
  edge: number;
  /** The gap between the orb's rim and the first line of text, in px. */
  gap: number;
}

export interface DetailBand {
  /** The block's horizontal centre, in px from the stage's left edge. */
  centre: number;
  /** The block's width in px. */
  width: number;
  /** The top of the band, in px from the stage's top edge. */
  top: number;
  /**
   * The band's height in px — and the cap that makes "never occludes the node"
   * structural rather than hoped for. Zero when there is no room at all, which
   * is a real state and draws nothing rather than throwing.
   */
  room: number;
  /**
   * How far the block's centre ended up from the node's own centre, in px.
   * 0 means dead-centred, and it never exceeds the allowance it was given.
   */
  drift: number;
}

const clamp = (value: number, low: number, high: number) =>
  high < low ? (low + high) / 2 : value < low ? low : value > high ? high : value;

export function detailBand({
  size,
  nodeX,
  nodeY,
  nodeRadius,
  driftAllowance,
  edge,
  gap,
}: DetailBandInput): DetailBand {
  const nodeCentre = nodeX * size;
  /** Half the widest column that would be dead-centred on this node: the
   *  shorter of the two sides, less the stage's own margin. */
  const dead = Math.min(nodeCentre, size - nodeCentre) - edge;
  const allowance = Math.max(0, driftAllowance) * nodeRadius * size;

  // Every px the block's centre is allowed to move is a px of half-measure on
  // the short side — hence the doubling. Capped at the stage: a node in the
  // middle needs no allowance at all and simply takes the full width.
  const width = Math.max(0, Math.min(2 * (dead + allowance), size - edge * 2));
  const half = width / 2;
  const centre = clamp(nodeCentre, edge + half, size - edge - half);

  const top = nodeY * size + nodeRadius * size + gap;
  const room = Math.max(0, size - edge - top);

  return { centre, width, top, room, drift: Math.abs(centre - nodeCentre) };
}
