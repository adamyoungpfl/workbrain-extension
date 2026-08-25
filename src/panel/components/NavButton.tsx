import { Button } from './Button';
import type { ButtonProps } from './Button';
import './NavButton.css';

/** Which way this control moves the interview, if it moves it at all. Drawn as
 * a chevron beside the word — see `NavChevron` on why one exists. */
export type NavDirection = 'back' | 'next';

export interface NavButtonProps extends ButtonProps {
  direction?: NavDirection;
  /**
   * V1.9 VB-53 — how this control names itself to the melt.
   *
   * Written straight onto the wrapper as `data-nav`, which is the only thing
   * components/NavCluster.tsx reads to work out what became of each control
   * when a question is replaced. It is a label on a control the caller has
   * *already decided to render*, not a description of which controls exist:
   * `Flow` still owns that (Skip only on a skippable question, Back only with
   * history), and VB-53 is presentation over that truth rather than a second
   * copy of it.
   *
   * Optional, because the proof loop's footer has no bar to melt into.
   */
  control?: string;
}

/**
 * V1.7 VB-41 — one control in the docked button cluster.
 *
 * The cluster is text and icons with no containers (docs/V1.7-REFINEMENT.md).
 * Dropping the box takes away two things the box was quietly doing, and this
 * component exists for the second of them:
 *
 *  1. the ground the label's contrast was measured against — solved in
 *     Flow.css, by painting the bar itself and measuring against that;
 *  2. **the box the focus ring hugged.** The pressable control is 44px tall
 *     (docs/GUARDRAILS.md) and the word inside it is 26, so a ring on the
 *     button would be a ring around eighteen pixels of empty space — which is
 *     not a visible focus indicator, it is a rectangle near one.
 *
 * So the button gets a wrapper whose box is exactly the painted word, and the
 * ring goes on the wrapper via `:has()`. That is V1.3 VB-15's move, unchanged:
 * `components/DeepDive.css` did it first for the deep-dive chips — 30px
 * painted, 44px pressable, ring on the parent — and its comments hold the
 * reasoning. The numbers are core/flow/dock.ts's and arrive as custom
 * properties; nothing here computes a size.
 *
 * **The wrapper is `display: contents` by default and only becomes a box
 * inside the docked shell.** The same footer markup renders in the proof loop,
 * which has no drawer to dock to and keeps the ordinary footer of solid
 * buttons — where the ring belongs on the button, because there the button and
 * the thing you can see are the same box. One markup, two treatments, decided
 * by the one class that says which situation this is (`.flowshell`, Flow.tsx).
 */
export function NavButton({ direction, control, children, ...rest }: NavButtonProps) {
  return (
    <span className="navbtn" data-nav={control}>
      <Button {...rest}>
        {/* V1.9 VB-53 — the control's INK, in one box.
            The word and its chevron were two siblings of the button until the
            melt needed something to move that was not the button: the
            pressable box has to stay exactly 44px and exactly where it is
            while the cue plays (VB-10 guarantees nothing on screen moves while
            a question prints, and a press has to land on a control that is
            still travelling). Two siblings could not be moved as one — they
            are different heights, so they would collapse towards two
            different lines — so they get a box, the box is what melts, and
            the button underneath it never moves at all.
            Layout is unchanged in both contexts: the row was already a flex
            line of these two items with the button's gap between them, and
            this is the same line one level down (`gap: inherit`). */}
        <span className="navbtn-face">
          {direction === 'back' && <NavChevron direction="back" />}
          <span className="navbtn-label">{children}</span>
          {direction === 'next' && <NavChevron direction="next" />}
        </span>
      </Button>
    </span>
  );
}

/**
 * The chevron, and why the cluster has one at all.
 *
 * Without their boxes, Next and Back are two words in two colours — and
 * docs/GUARDRAILS.md forbids anything being distinguished by colour alone. The
 * words themselves carry most of it ("Back" and "Next" are not synonyms), but
 * which one is the primary would otherwise be carried by hue and nothing else.
 * The chevron says the same thing as a shape, and the weight says it a third
 * time (Flow.css).
 *
 * `aria-hidden`, like every other glyph in the panel: it is a picture of the
 * word beside it, not a second name.
 */
function NavChevron({ direction }: { direction: NavDirection }) {
  return (
    <svg
      className="navbtn-chevron"
      viewBox="0 0 24 24"
      width="13"
      height="13"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={direction === 'back' ? 'M15 5 8 12l7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
