import type { SectionHealth } from './sectionHealth';

/**
 * V1.8 VB-46 — WHICH SECTION IS LIVE, DECIDED ONCE.
 *
 * VB-46, verbatim: "A row at **0 of X** is **greyed out**, showing **0%**. A
 * row that is **active in the flow**, or has **at least one of X complete**, is
 * **illuminated**. The row **actively being worked on** gets a **pulse or
 * glow**... **The same rule drives the Brain visual**, so both views agree
 * about what is live."
 *
 * THAT LAST SENTENCE IS WHY THIS FILE EXISTS AND WHY IT IS NOT TWO FUNCTIONS.
 * The drawer draws the same ten sections twice — as rows in List
 * (components/FileTree.tsx) and as orbs in Brain (components/BrainGlobe.tsx) —
 * and VB-32/VB-45 make one morph into the other. Two implementations of "is
 * this one live" is exactly how the orb that flies out of the globe lands on a
 * row that disagrees with it. So both callers ask this, and neither decides.
 *
 * NOTHING HERE IS STORED and nothing here is new derivation. It is a fold over
 * `sectionHealth.ts`'s existing counts, which are themselves a fold over
 * `wb:answers` recomputed on every render (docs/ARCHITECTURE.md, "nothing
 * derived is stored"). Change an answer and the row and the orb change
 * together, with no other action.
 *
 * ── The three states, and why "reached" is not one of them ────────────────
 *
 *   live   the flow is standing in this section right now
 *   lit    at least one question here is answered with content
 *   dim    nothing answered here yet — VB-46's "0 of X, greyed out"
 *
 * The tree's own three-way state (core/flow/outline.ts) is a different
 * question and deliberately not this one: `reached` there means "something is
 * RECORDED against this section", which includes an intro beat and an explicit
 * skip. VB-46 asks about the numerator of "X of Y" — answers with content —
 * so a section whose only record is a skip reads `0 of 6` and is dim, which is
 * what the row prints beside it. A row that said "0 of 6" while looking
 * illuminated would be a row arguing with itself.
 *
 * `live` wins over both, for the reason `sectionHealth.ts` lets `here` win: the
 * section somebody is typing into is not usefully described by how much of it
 * is done yet, and a section is live from its first question rather than from
 * its first answer.
 *
 * ── The no-counts fallback ────────────────────────────────────────────────
 *
 * `BrainGlobe` is usable as a pure showcase with no flow state at all — a
 * picture must never be the thing that breaks a screen (docs/GUARDRAILS.md) —
 * so it can ask this without a health map. With no counts, "at least one of X"
 * is unanswerable, and the honest stand-in is the tree's own `reached`: the
 * only other evidence that anything is in there. It is a degradation, not a
 * second rule, and wherever real counts exist they win.
 */

export type SectionLife = 'live' | 'lit' | 'dim';

export interface SectionLifeInput {
  /**
   * The section's health — `sectionHealthMap`'s entry for this node. Absent
   * only where the caller genuinely has no flow state; see above.
   */
  health?: SectionHealth | undefined;
  /**
   * Whether the flow is standing in this section right now
   * (core/flow/outline.ts's `outlineNodeCurrent`, which is the same test
   * `sectionHealth` awards `here` on).
   *
   * Passed rather than read off `health.state` alone so a caller holding only
   * the tree's state can still say so, and because the two are the same fact
   * from the same question id — either one being true is enough.
   */
  current?: boolean;
  /** The tree's `reached`. Read ONLY when there is no health to count. */
  reached?: boolean;
}

export function sectionLife({ health, current = false, reached = false }: SectionLifeInput): SectionLife {
  if (current || health?.state === 'here') return 'live';
  if (health) return health.answered > 0 ? 'lit' : 'dim';
  return reached ? 'lit' : 'dim';
}

/**
 * Whether this section is illuminated at all — VB-46's own word for it. `live`
 * is illuminated AND pulsing; the pulse is an addition to the lit treatment
 * and never an alternative to it, so a reduced-motion screen that drops the
 * pulse still shows a section that is plainly on (see FileTree.css).
 */
export function sectionIsLit(life: SectionLife): boolean {
  return life !== 'dim';
}
