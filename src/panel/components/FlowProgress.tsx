import type React from 'react';
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
 * REVERSED (Adam, 2026-08-28): "make the icon the standard logo." The
 * silhouette was a legibility argument at 24px and a cheapness argument for the
 * turn, and it lost to a plainer one — the door home should wear the mark
 * people already know, not a reduction of it. It is the same mark the welcome
 * screen and the site use, and being recognisable is the entire reason it
 * works as a door.
 *
 * The turn now rewrites the graph's attributes rather than one silhouette
 * path, for 320ms per MODULE (`STATUS_MARK_SPIN = 'once'`) — not per question.
 * That is the cost, and it is small enough to pay for the mark being itself.
 */
const STATUS_MARK_VARIANT: BrandMarkVariant = 'graph';

export interface FlowProgressProps {
  /** The current module's own title — "Orientation", "How I Communicate".
   * The only text this component renders. */
  title: string;
  /** V2.4 VB-112 — when present, the MARK (icon only, never the title)
   * becomes a real button back to the Home page, and the progressbar role
   * moves off the wrapper so a control never sits inside a value. */
  onHome?: (() => void) | undefined;
  /** 1-based index of the question on screen, across the whole flow.
   * Computed by the caller (core/flow/runner's `topLevelIndex`) — this
   * component derives nothing and stores nothing. */
  current: number;
  /** Total top-level questions in the flow (`questionCount`). */
  total: number;
  /**
   * BS-05a (§5) — where this question sits in its RUN, when the flow has
   * runs. `done` is how many of the run's questions are behind the person
   * (0-based place), `of` is how long the run is, and `label` is the
   * spelled-out "second run of three" — empty when the module is one run,
   * because "first run of one" says nothing.
   *
   * Optional: the proof loop has no runs and keeps the bar it always had.
   */
  run?: { done: number; of: number; label: string } | undefined;
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
 * - **And no number is SPOKEN either (O6b, Adam, 2026-08-28).** This carried
 *   `aria-valuenow` / `aria-valuemax` / `aria-valuetext` for two years on the
 *   argument that removing a number visually is a design choice but losing it
 *   for a screen reader is a bug. That argument holds when the number is worth
 *   having. D1's whole point is that it is not: a running count of questions
 *   left is a thing people bargain with, and handing it to one audience and
 *   not the other is not accessibility, it is giving the bargaining chip to
 *   the person who cannot see the marks.
 *
 *   So the values go and the ROLE STAYS. A `progressbar` with no `valuenow`
 *   is ARIA's own indeterminate state: it is announced by name, as progress,
 *   with no figure attached — "My World, progress indicator" — which is
 *   exactly what the bar says to everyone else. The role is what keeps the
 *   module title announced once, as the bar's name, rather than twice.
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
export function FlowProgress({ title, current, total, onHome, run }: FlowProgressProps) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  /**
   * BS-05a (§5) — THE BAR BECOMES A RUN OF FIVE.
   *
   * V1.1 VB-02 was right about the number it was aimed at: "question 12 of
   * 38" invites bargaining because 38 is far away. Five is not. So the bar's
   * fraction of a global total is replaced by marks a person can count.
   *
   * BS-05a's first build kept a run-scoped `aria-valuetext` — "two left in
   * this run". O6b took that too: no count, printed or spoken, anywhere.
   *
   * `run` is optional so a flow with no run machinery behind it — the proof
   * loop — still renders the bar it always had. Degrade, never break.
   */

  // V2.4 VB-112 — the mark is a door home (Adam: "people instinctively
  // assume whatever is there will take you home"). The ICON only, never the
  // title text. A button cannot live inside a progressbar (a control inside
  // a value), so when the door exists the role moves to an inner wrapper —
  // same accessible name, same values, announced once as before.
  const mark = (
    <BrandMark
      className="flowprogress-mark"
      size={STATUS_MARK_SIZE}
      variant={STATUS_MARK_VARIANT}
      spin={STATUS_MARK_SPIN}
      spinCue={title}
      entrance={false}
    />
  );
  const bar = (barContent: React.ReactNode) => (
    <div
      className="flowprogress"
      role="progressbar"
      // Every module in the shipped data has a title. There is no fallback
      // here any more: the fallback used to be the spoken count, and O6b took
      // that away — an untitled bar announces as unnamed progress, which is
      // the honest degradation, not a number nobody wanted.
      aria-label={title}
      /* NO `aria-valuenow`, and that omission is the feature (O6b): a
         progressbar without one is indeterminate by ARIA's own definition, so
         it is announced as progress with no figure. `aria-valuemin` and
         `aria-valuemax` go with it — a range with nothing in it is furniture,
         and a screen reader will happily read "0 to 5" off them. */
    >
      {barContent}
    </div>
  );
  if (onHome) {
    return (
      <div className="flowprogress-shell">
        <button type="button" className="flowprogress-home" aria-label={S.goHome} onClick={onHome}>
          {/* NO WORD UNDER IT (Adam, 2026-08-28: "get rid of the label").
              BS-01c gave this control "Home" under the mark to satisfy §1's
              "zero controls communicate by icon alone". Overruled, and the
              reasoning is worth keeping: a product's own mark in the top-left
              corner returning you home is the most-learned control on the web,
              and it is the ONE icon whose meaning does not depend on reading
              it. `aria-label` still carries the full sentence, so nothing is
              lost to a screen reader — the exemption is visual only. This is
              now the second judged exception to §1, beside FileTree's orb
              toggle (labelled by adjacency). Recorded in docs/BETA-SPRINT.md
              so it is a decision rather than an oversight. */}
          {mark}
        </button>
        {bar(
          <>
            <div className="flowprogress-head">
              <TypedModuleLabel className="flowprogress-title" title={title} />
                    </div>
            {run ? <Beats run={run} /> : (
              <div className="flowprogress-track" aria-hidden="true">
                <span className="flowprogress-fill" style={{ width: `${pct}%` }} />
              </div>
            )}
          </>,
        )}
      </div>
    );
  }

  return bar(
    <>
      {/* The head carries no `aria-hidden` of its own: the mark sets its own,
          and the title keeps the one VB-02 gave it, so the announced tree is
          byte-for-byte what it was before the mark arrived. */}
      <div className="flowprogress-head">
        {mark}
        {/* V1.2 VB-10: the label types itself in when the module changes, and
            sits there unchanged for every question inside it. The remount-per-
            question problem `spinCue` solves for the mark is the same one
            `TypedModuleLabel` solves for the words, by the same means — a
            module-scope memory of when the current cue started. */}
        <TypedModuleLabel className="flowprogress-title" title={title} />
      </div>
      {run ? <Beats run={run} /> : (
        <div className="flowprogress-track" aria-hidden="true">
          {/* Width is set inline because it is data, not design — the one
              value on this element that changes per question. */}
          <span className="flowprogress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
    </>,
  );
}

/**
 * BS-05a — the run, as marks and words.
 *
 * FILLED for what is behind them, STANDING for the one they are on, EMPTY
 * for what is left. Three states told apart by more than colour: the
 * standing mark is wider and ringed, and the line underneath says the same
 * thing in words for anyone who cannot see either.
 *
 * NO DIGIT (Adam's D1). "Two left in this run", "second run of three" — the
 * panel's own numbers are spelled, always. The marks are `aria-hidden`
 * because the progressbar around them already carries the value; this is the
 * same one-account-per-audience rule `Meter` follows.
 */
function Beats({ run }: { run: { done: number; of: number; label: string } }) {
  return (
    <div className="flowprogress-run" aria-hidden="true">
      <div className="flowprogress-beats">
        {Array.from({ length: run.of }, (_, i) => (
          <span
            key={i}
            className="flowprogress-beat"
            data-state={i < run.done ? 'done' : i === run.done ? 'here' : 'left'}
          />
        ))}
      </div>
      {/* NO VISIBLE REMAINDER LINE, AND THE REASON IS MEASURED. §5 asks for
          the marks "plus a plain-language remainder". The header will not
          take one: it is the tightest strip in the product — BS-01c measured
          the rephrase word out of it, BS-02 the feedback door — and a line
          here, stacked or inline, pushes the tallest question in the flow
          (`peeves`, seven rows of pills) up under the header.

          Nothing is lost that the guardrails need. The marks are told apart
          by WIDTH and a RING, never colour alone, and the words themselves
          are on the progressbar's own `aria-valuetext` — "two left in this
          run", spoken. One account per audience, which is the rule Meter and
          this component have followed since V1.1.

          The visible sentence comes back when §5 re-derives the header's
          composition for the run card; it is recorded in
          docs/BETA-SPRINT.md so it is a deferral, not a drop. */}
    </div>
  );
}
