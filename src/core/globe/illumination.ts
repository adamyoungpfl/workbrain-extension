import type { FileOutlineNode } from '../../schema/flow.types';
import type { SectionHealth } from '../freshness/sectionHealth';
import type { SectionLife } from '../freshness/sectionLife';
import { sectionIsLit } from '../freshness/sectionLife';

/**
 * V1.5 VB-24 / VB-25 — how lit the globe is, as arithmetic.
 *
 * THE WHOLE POINT OF THIS FILE IS THAT IT IS NOT A RENDER-TIME SPECIAL CASE.
 * VB-25 asks for an edge whose brightness is a function of *both* the nodes it
 * joins, so that illumination spreads along the structure as the interview
 * proceeds rather than appearing node by node. A function of both endpoints is
 * a function, so it lives here and is tested at every combination without a
 * browser (CLAUDE.md's one architectural rule). `BrainGlobe.tsx` asks this file
 * what an edge is worth and multiplies; it never decides.
 *
 * NOTHING HERE IS STORED. Every value is a fold over the section states and the
 * health map the panel already recomputes on each render
 * (docs/ARCHITECTURE.md, "nothing derived is stored").
 *
 * ── Why three node states and not two ─────────────────────────────────────
 *
 * Ten of the solid's twelve vertices carry a file section. The other two are
 * the poles of the resting pose and carry nothing — they hold the shape up
 * (see `STRUCTURAL_VERTICES` in BrainGlobe.tsx). They are not sections, so they
 * have no answers to be lit by, and an edge that met one had to be given some
 * answer anyway.
 *
 * The rule chosen is that **a structural vertex conducts**: an edge from a pole
 * to an answered section is as bright as an edge between two answered ones, and
 * an edge from a pole to an untouched section is as dim as one between two
 * untouched ones. The alternative — treating a pole as permanently neutral —
 * puts a ring of mid-lit spokes around the top and bottom of the solid that
 * never brightens and never dims, which would mean the "one lit object" of the
 * complete state could never actually be one object. A joint carries whatever
 * the thing it joins is carrying; that is what a joint is for.
 *
 * ── Why `active` is not the same question as `complete` ───────────────────
 *
 * An edge brightens as soon as a section has *anything* in it, because VB-25's
 * subject is illumination spreading as somebody answers questions, and the
 * first answer in a section is the moment it joins the structure. The unified
 * glow at the bottom of this file asks the harder question — answered, complete
 * AND still inside its own half-life — and it asks it of `sectionHealth.ts`
 * rather than inventing a second definition of "done".
 */

/** What a vertex is worth to the edges that meet it. */
export type GlobeNodeState = 'active' | 'inactive' | 'structural';

/** The three brightnesses an edge can carry. Three, not a continuum: the
 * information is "both ends / one end / neither", and a continuum would invite
 * a fourth thing to be smuggled into it. */
export type EdgeLight = 'bright' | 'mid' | 'dim';

/**
 * A section's own life (core/freshness/sectionLife.ts), as the two-way question
 * the edges ask. `null` is a vertex with no section on it.
 *
 * `live` counts as active: the section being answered right now is the one
 * thing on the stage being worked on.
 *
 * ── V1.8 VB-46: this used to read the TREE's state, and now reads the life ──
 *
 * VB-46 requires one rule to decide what is illuminated in BOTH views — "the
 * same rule drives the Brain visual, so both views agree about what is live".
 * The edges are part of that picture: an edge that brightened on a section the
 * List greys out would put the two views back into disagreement one level down
 * from the orbs. `sectionLife` is that rule, and this maps its answer onto the
 * two-way question an edge asks. The mapping is exactly what was here before
 * for every section with a real count behind it; what changed is that a section
 * whose only records are skips now reads `0 of X` and goes dim in both views
 * instead of being lit in one of them.
 */
export function globeNodeState(life: SectionLife | null | undefined): GlobeNodeState {
  if (life === null || life === undefined) return 'structural';
  return sectionIsLit(life) ? 'active' : 'inactive';
}

/** Whether this end of an edge is carrying light. A structural vertex carries
 * whatever the section at the other end does — see the header. */
function conducts(state: GlobeNodeState): boolean | null {
  if (state === 'structural') return null;
  return state === 'active';
}

/**
 * VB-25's centrepiece: an edge's brightness, from both of its endpoints.
 *
 * | a          | b          | edge   |
 * |------------|------------|--------|
 * | active     | active     | bright |
 * | active     | inactive   | mid    |
 * | inactive   | inactive   | dim    |
 * | structural | active     | bright |
 * | structural | inactive   | dim    |
 * | structural | structural | dim    |
 *
 * Order-independent, because an edge has no direction.
 */
export function edgeLight(a: GlobeNodeState, b: GlobeNodeState): EdgeLight {
  const left = conducts(a);
  const right = conducts(b);
  // Both poles. Unreachable on an icosahedron — the two structural vertices are
  // opposite each other and share no edge — but a rule with a hole in it is a
  // rule somebody will fall through when the shape changes.
  if (left === null && right === null) return 'dim';
  if (left === null) return right ? 'bright' : 'dim';
  if (right === null) return left ? 'bright' : 'dim';
  if (left && right) return 'bright';
  if (left || right) return 'mid';
  return 'dim';
}

/**
 * What each brightness is worth as a multiplier, 0–1.
 *
 * `dim` is deliberately not 0. Every node is a real part of the model from
 * question one (VB-24), so the structure it hangs on is real from question one
 * too — an unanswered branch is turned down, never absent. The three values are
 * far enough apart to be read at a glance on a 260px stage, which is the
 * smallest the drawer ever opens Brain at.
 */
export const EDGE_LIGHT_LEVEL: Readonly<Record<EdgeLight, number>> = {
  bright: 1,
  mid: 0.5,
  dim: 0.16,
};

/** The multiplier for one edge, straight from its two ends. */
export function edgeBrightness(a: GlobeNodeState, b: GlobeNodeState): number {
  return EDGE_LIGHT_LEVEL[edgeLight(a, b)];
}

/**
 * ── The unified glow ──────────────────────────────────────────────────────
 *
 * VB-25: when every node is active, complete and fresh, the model stops being a
 * network of differently-lit parts and becomes one lit object.
 *
 * THE DEFINITION IS BORROWED, NOT INVENTED. "Complete and fresh" is exactly
 * what VB-19 already means by `done` — every question the flow would really ask
 * has an answer, and no answer has aged past its section's own half-life
 * (core/freshness/halfLives.ts). Writing a second test for it here would give
 * the product two definitions of finished that could drift apart, which is the
 * failure `sectionHealth.ts` exists to prevent.
 *
 * THE ONE PLACE THIS LOOKS PAST THE STATE WORD is `here`. That state means "the
 * question on screen belongs to this section" — a position, not a verdict — and
 * it wins over every other state by design, so a finished section reports
 * `here` for as long as somebody is standing in it. Letting that break the glow
 * would mean the picture changed because of where the cursor is rather than
 * because of what the file holds. So a section that is `here` is judged on the
 * same three numbers `sectionHealth.ts` itself uses to award `done` — its own
 * fields, not a second rule.
 *
 * THE GUARDRAIL. docs/GUARDRAILS.md rules out "streaks, badges, gamification,
 * or nudges framed as guilt". This is a state and not a reward: it is true when
 * the file is complete and current, false the moment it is not, it is reached
 * and lost silently, and nothing here counts how long it was held. Losing it
 * says "something is out of date" — which is information the person can act on
 * — and never says anything about the person.
 */
export function sectionGlows(health: SectionHealth | undefined): boolean {
  if (!health) return false;
  if (health.state === 'done') return true;
  // `here` is a position, not a verdict — see above. Same three numbers
  // `sectionHealth.ts` awards `done` on.
  if (health.state === 'here') return health.total > 0 && health.answered === health.total && health.due === 0;
  return false;
}

/**
 * Whether the whole model resolves to one glow.
 *
 * TOP-LEVEL SECTIONS ONLY, and that is not a shortcut: a parent's health rolls
 * its children's questions into its own totals (`sectionHealth.ts`'s `collect`),
 * so a stale sub-section already makes its parent `due`. Walking the children
 * again here would count the same answers twice and could only ever agree.
 * It also matches `summariseSectionHealth`, so the counts above the list and
 * the picture in the drawer cannot say different things.
 *
 * An empty outline is not unified. Nothing at all is not "everything done".
 */
export function isUnifiedGlow(
  outline: readonly FileOutlineNode[],
  health: Readonly<Record<string, SectionHealth>> | undefined,
): boolean {
  if (!health || outline.length === 0) return false;
  return outline.every((node) => sectionGlows(health[node.id]));
}
