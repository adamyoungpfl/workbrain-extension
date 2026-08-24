import { BrandMark, type BrandMarkSpin, type BrandMarkVariant } from './BrandMark';
import { TypedModuleLabel } from './Typed';
import { S } from '../strings';
import './FlowProgress.css';

/**
 * V1.2 VB-13 — THE ONE CONSTANT THAT DECIDES HOW THE STATUS-BAR MARK MOVES.
 *
 * Flip this line and rebuild; nothing else changes.
 *
 *   'continuous' — it turns for the whole interview. What Adam asked for.
 *   'once'       — it turns once when the module changes, then settles.
 *
 * Shipping 'once' (Adam's call, 2026-08-20, after seeing both on screen).
 * 'continuous' is what was originally asked for and remains one word away.
 * The two reasons 'once' won, both of which only showed up on screen:
 *
 * 1. **The still mark is the better picture.** At 24px the crisp exported pose
 *    reads as the logo. Every frame of a turn is a slightly soft, slightly
 *    ambiguous version of it, and under 'continuous' that soft version is the
 *    only one anybody ever sees, on all forty-nine questions. 'once' shows the
 *    real mark for 99% of the interview and the turn at the one moment it
 *    means something — the module changing.
 * 2. **It is the product's only unending motion**, sitting beside text people
 *    are reading to think, and it costs ~2% of the main thread for as long as
 *    the panel is open. 'once' costs that for 320ms per module: eleven turns
 *    across a whole interview, and nothing in between (measured: zero frames
 *    requested while settled).
 *
 * Under `prefers-reduced-motion` both values collapse to the same still mark
 * and neither schedules a frame, so this constant is not an accessibility
 * decision. It is a taste decision, and it is one line.
 */
export const STATUS_MARK_SPIN: BrandMarkSpin = 'once';

/**
 * How big the status-bar mark is, in px.
 *
 * 24 is a judgement, not a spec value, and it was chosen by looking at it.
 * The label beside it is 12px uppercase on a 1.4 line, so its box is about
 * 17px. At 20px the twelve nodes fall below a pixel each and the mark reads as
 * a shimmering smudge rather than a logo; at 28px it out-weighs the label and
 * stops being the quiet orientation element FlowProgress.css describes. 24 is
 * legible and still subordinate. The sibling site mounts the same sphere at
 * 30–38px beside nav text; 400px of panel does not have that room.
 */
const STATUS_MARK_SIZE = 24;

/**
 * V1.7 VB-39 — the status-bar mark is the silhouette, not the node graph.
 *
 * The paragraph above records the problem this fixes: at this size the twelve
 * nodes are sub-pixel and the mark reads as a smudge. 24px was the largest the
 * graph could be without out-weighing its label and the smallest it could be
 * and still resolve, which is another way of saying the graph never really fit
 * here. A filled shape has no such floor — it is legible at 16 — so the
 * silhouette is simply the right drawing for this slot, and the same object.
 *
 * It also makes the moving thing cheaper. VB-13's turn rewrites around 220 SVG
 * attributes a frame; the silhouette rewrites one, and only for the 320ms per
 * module that `STATUS_MARK_SPIN = 'once'` allows.
 *
 * The welcome screen keeps the node graph. It is 96px, it is the first thing
 * anybody sees, and at that size every node and edge resolves — there is
 * nothing there for a silhouette to fix.
 */
const STATUS_MARK_VARIANT: BrandMarkVariant = 'silhouette';

export interface FlowProgressProps {
  /** The current module's own title — "Orientation", "How I Communicate".
   * The only text this component renders. */
  title: string;
  /** 1-based index of the question on screen, across the whole flow.
   * Computed by the caller (core/flow/runner's `topLevelIndex`) — this
   * component derives nothing and stores nothing. */
  current: number;
  /** Total top-level questions in the flow (`questionCount`). */
  total: number;
}

/**
 * V1.1 VB-02 — what sits where the "Question 12 of 38 · About Me" breadcrumb
 * used to. The module's own title, and a slim bar underneath it. V1.2 VB-13
 * put the brand mark to the left of the title.
 *
 * Decisions, all deliberate:
 *
 * - **No number is printed.** A running count of questions left is a number
 *   people bargain with, not one that helps them answer the question in front
 *   of them. The bar says "some way in" without inviting arithmetic.
 *
 * - **The number is still there for assistive tech.** Removing a number
 *   visually is a design choice; losing it for a screen reader is a bug. So
 *   this is a real `role="progressbar"` carrying `aria-valuenow` /
 *   `aria-valuemin` / `aria-valuemax` and an `aria-valuetext` of
 *   "Question {n} of {total}" — the approved copy in docs/V1.1-COPY-DRAFT.md,
 *   which is explicitly never shown on screen.
 *
 * - **Not the `Meter` component.** Meter is Home's macro four-gate progress
 *   (Name · Repeat · Act · Share) — four segments, a headline percentage, and
 *   its own labels. That is a different quantity with a different meaning, and
 *   sharing one component between them would quietly imply they are the same
 *   measure.
 *
 * - **No per-module colour.** The palette is load-bearing elsewhere
 *   (`--primary` = act, `--violet` = AI, `--amber` = drift, `--green` = done).
 *   Spending one of those on decoration blurs a distinction the rest of the
 *   product leans on, so the fill is the neutral `--ink-3`. "Thematic" here
 *   means the module's own title, not a colour per module.
 *
 * - **The mark cannot move the label.** It is a fixed-size, `flex: none` box
 *   in a flex row, and everything the rotation changes happens inside its own
 *   viewBox. There is no frame on which the SVG's layout box can differ, so
 *   the title's baseline is not merely stable in practice — it has nothing to
 *   respond to. tests/e2e/brand-mark.spec.ts samples it mid-turn anyway.
 *
 * - **`title` is the mark's spin cue.** Under `STATUS_MARK_SPIN = 'once'` the
 *   mark turns when that string changes, which is precisely "the module
 *   changed". `Flow` remounts this component on every question; `BrandMark`
 *   remembers the cue across remounts so the turn happens once per module and
 *   not once per question.
 *
 * Structure follows `Meter`: the wrapper *is* the progressbar and everything
 * visible inside it is `aria-hidden`, so the title is announced once as the
 * bar's name rather than twice — once as a paragraph and again as a label.
 */
export function FlowProgress({ title, current, total }: FlowProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  const valueText = S.questionOfSr(current, total);

  return (
    <div
      className="flowprogress"
      role="progressbar"
      // Every module in the shipped data has a title, so the `||` is never
      // reached in practice. It exists because a progressbar with no
      // accessible name is unusable, and "unusable" is not an acceptable
      // failure mode for a missing string (docs/GUARDRAILS.md: degrade, never
      // break).
      aria-label={title || valueText}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-valuetext={valueText}
    >
      {/* The head carries no `aria-hidden` of its own: the mark sets its own,
          and the title keeps the one VB-02 gave it, so the announced tree is
          byte-for-byte what it was before the mark arrived. */}
      <div className="flowprogress-head">
        <BrandMark
          className="flowprogress-mark"
          size={STATUS_MARK_SIZE}
          variant={STATUS_MARK_VARIANT}
          spin={STATUS_MARK_SPIN}
          spinCue={title}
          entrance={false}
        />
        {/* V1.2 VB-10: the label types itself in when the module changes, and
            sits there unchanged for every question inside it. The remount-per-
            question problem `spinCue` solves for the mark is the same one
            `TypedModuleLabel` solves for the words, by the same means — a
            module-scope memory of when the current cue started. */}
        <TypedModuleLabel className="flowprogress-title" title={title} />
      </div>
      <div className="flowprogress-track" aria-hidden="true">
        {/* Width is set inline because it is data, not design — the one
            value on this element that changes per question. */}
        <span className="flowprogress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
