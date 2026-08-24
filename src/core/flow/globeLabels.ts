import type { FileOutlineNode } from '../../schema/flow.types';
import { splitSectionLabel } from './sectionLabel';

/**
 * V1.5 VB-26 — short display names for the globe, beside the outline data.
 *
 * THE FILE KEEPS ITS REAL NAMES. `CONTEXT_FILE_OUTLINE` (core/flow/source.ts)
 * holds the section titles the generated Context.md actually prints — "6. How I
 * Communicate", "9. Context Boundaries" — and nothing here changes one of them.
 * This table is a second, shorter name used in exactly one place: the label
 * printed under a node on the Brain stage.
 *
 * WHY IT EXISTS. VB-26 asks the globe's labels to wear `type.label` from
 * design/tokens.json — 12px, 650, +0.08em, uppercase — and that token's own
 * comment says "2–3 words max". Uppercase with tracking is about a third wider
 * than the mono-ish text the globe carried before, and the labels were already
 * clipping at the old treatment: "6. How I Communi…", "9. Context Boundari…".
 * The choice is between clipping real names and having short ones, and a
 * half-word with an ellipsis on it reads as a bug rather than as a label.
 *
 * WHY IT IS HERE AND NOT IN THE COMPONENT. It is data about the outline, so it
 * belongs beside the outline (VB-26 says so in as many words). It sits in
 * `core/` for the same reason the section titles themselves do — the panel's
 * `strings.ts` rule has always excepted the ported flow's own content, and a
 * section's name is that content, not interface copy (CLAUDE.md, "Copy lives in
 * one file").
 *
 * THE RULES THE NAMES FOLLOW
 *
 *  1. **At most three words, at most eleven characters.** Measured, not guessed:
 *     at 12px/650/+0.08em an uppercase character averages ~8.4px, and the
 *     narrowest room a rim node ever has on the smallest stage the drawer opens
 *     Brain at is ~100px. `globeLabels.test.ts` holds both ceilings.
 *  2. **The file's own voice.** "My World", "How I Think" are already the
 *     file's names; the shortened ones stay in that first person rather than
 *     switching to interface English ("Responsibilities" → "What I Own").
 *  3. **No two the same.** "2.3 Boundaries" and "9. Context Boundaries" would
 *     both shorten to "Boundaries", so the second takes "Guardrails" — which is
 *     what its two questions actually collect (`standards_list`,
 *     `guardrails_list`). Two nodes wearing one name on the same stage is worse
 *     than either name being slightly loose.
 *
 * THE FULL NAME IS NEVER LOST. `BrainGlobe.tsx` puts it in the node's `title`,
 * the List mode prints it in full, and the generated file has it as a heading.
 * The *accessible* name is the short one, deliberately: WCAG 2.5.3 asks that a
 * control's name contain the words a person can see on it, and what is on the
 * globe is the short name.
 */
export const GLOBE_SHORT_LABELS: Readonly<Record<string, string>> = {
  sec1: 'Context', // 1. About This Context
  sec2: 'About Me',
  'sec2-1': 'Roles',
  'sec2-2': 'What I Own', // 2.2 Responsibilities
  'sec2-3': 'Boundaries',
  'sec2-4': 'Decisions', // 2.4 Decision Rights
  'sec2-5': 'Expertise',
  sec3: 'My World',
  sec4: 'Initiatives',
  sec5: 'How I Think',
  sec6: 'My Voice', // 6. How I Communicate
  sec7: 'Audiences', // 7. Audience Profiles
  sec8: 'Vocabulary', // 8. Vocabulary & Knowledge
  sec9: 'Guardrails', // 9. Context Boundaries
  sec10: 'Examples', // 10. Reference Examples
};

/** "1. About This Context" → "About This Context". The number is the file's
 * ordering and the globe has its own — sections run top to bottom in file order
 * (BrainGlobe.tsx's `SECTION_VERTICES`) — so printing it twice spends four of a
 * label's ten characters saying what the position already says.
 *
 * V1.6 VB-33 gave the same boundary a second reader — the list row sets the
 * numeral quiet and the name loud — so the rule moved to `sectionLabel.ts` and
 * both callers share it. Two copies of one regex is exactly how the globe and
 * the list end up disagreeing about where a section's name begins. */

/**
 * The name this node wears on the globe.
 *
 * A node with no entry degrades to its own label with the leading number
 * stripped rather than throwing or printing nothing: a picture must never be
 * the thing that breaks a screen (docs/GUARDRAILS.md), and an outline that
 * grows a section before this table does should draw it with a long name, not
 * with none. `globeLabels.test.ts` asserts every shipped section has a real
 * entry, so "falls back" stays a fallback rather than quietly becoming the
 * policy — the same guard `halfLives.ts` keeps over its own table.
 */
export function globeLabelFor(node: FileOutlineNode): string {
  return GLOBE_SHORT_LABELS[node.id] ?? splitSectionLabel(node.label).title;
}
