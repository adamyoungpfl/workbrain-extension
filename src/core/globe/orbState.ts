import type { SectionHealth } from '../freshness/sectionHealth';
import type { SectionLife } from '../freshness/sectionLife';
import { globeNodeState, sectionGlows } from './illumination';

/**
 * R-07 (Adam, 2026-08-28) — WHAT AN ORB IS, IN THREE STATES.
 *
 * "I want to establish a colour treatment that distinguishes active and
 * inactive orbs based on if they have been started or completed. On the
 * sub-nodes, I want to use colour and some kind of visual change or 'energy'
 * applied to those sub-nodes that are started or complete."
 *
 * ── THIS IS NOT A NEW IDEA, IT IS A THIRD READING OF AN OLD ONE ───────────
 *
 * Two folds in this directory already answer half the question each, and both
 * have shipped for versions:
 *
 *   · `globeNodeState` (V1.5 VB-25) says whether a section is carrying
 *     anything at all — it is what makes an edge bright, and what V1.8 VB-46
 *     made agree with the List's own greying;
 *   · `sectionGlows` (VB-25) says whether a section is DONE — every question
 *     answered and nothing due, which is what earns the unified glow.
 *
 * Started and complete are exactly those two questions asked together. So this
 * file composes them rather than re-deriving either, which is what stops the
 * orbs from ever disagreeing with the edges between them or with the list
 * underneath: there is one definition of "lit" in this product and one
 * definition of "done", and both of them are upstream of here.
 *
 * ── WHY COMPLETE IS CHECKED FIRST ─────────────────────────────────────────
 *
 * A complete section is also a started one. Asking `sectionGlows` first is
 * what makes the states exclusive; the other order would report every finished
 * section as merely started and the brightest thing on the stage would never
 * appear.
 *
 * ── NEVER COLOUR ALONE ────────────────────────────────────────────────────
 *
 * `docs/GUARDRAILS.md`. This returns a state, not a hue, and the panel spends
 * it on a halo's SIZE and BRIGHTNESS as well as its colour — plus, on a
 * top-level node, the word or count `nodeChipFor` already puts beside it. A
 * screenshot in greyscale still tells the three apart, and so does a person
 * who cannot see any of it, because the node's accessible name says which it
 * is (`outline.ts`'s `OutlineNodeState`).
 *
 * NOTHING HERE IS STORED — both inputs are recomputed every render
 * (docs/ARCHITECTURE.md, "nothing derived is stored").
 */
export type OrbState = 'untouched' | 'started' | 'complete' | 'structural';

export function orbState(
  life: SectionLife | null | undefined,
  health: SectionHealth | undefined,
): OrbState {
  const node = globeNodeState(life);
  if (node === 'structural') return 'structural';
  if (sectionGlows(health)) return 'complete';
  return node === 'active' ? 'started' : 'untouched';
}

/**
 * Whether this state should breathe (D3: "glow + slow pulse on started").
 *
 * ONLY `started`, and that is the whole design rather than a detail. A pulse
 * is the panel saying "there is something live here"; on a complete section
 * there is nothing live, and on an untouched one there is nothing at all. If
 * every orb breathed, the stage would be a field of movement carrying no
 * information — which is the failure mode of decorative motion, and the reason
 * `docs/GUARDRAILS.md` treats a cue that says nothing as furniture.
 *
 * The panel stops the pulse under `prefers-reduced-motion` and keeps the glow,
 * so the three states are still told apart with nothing moving.
 */
export function orbPulses(state: OrbState): boolean {
  return state === 'started';
}
