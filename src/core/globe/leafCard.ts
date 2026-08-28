/**
 * BS-07c (§7.2) — where the leaf card sits, and whether it fits at all.
 *
 * §7.2's files list states the arrangement in one line: "leaf tier gives the
 * card the lower portion, globe compresses to a strip, never-occlude preserved
 * above."
 *
 * ── WHAT THIS REPLACES, AND WHY THE ARRANGEMENT HAD TO CHANGE ─────────────
 *
 * `./detailBand.ts` positions a text band in the room BELOW ONE ORB — measured
 * from that orb's own rim, clamped to the stage, and capped so the text can
 * never climb back over the node it describes. That is the right shape for two
 * lines of free text and the wrong shape for a card: the band a node at 30% of
 * the stage leaves behind is about a third of the height and two thirds of the
 * width, and §7.2 asks for five parts ending in a 46px button.
 *
 * So the card stops being "the room under an orb" and becomes "the lower
 * portion of the stage". The never-occlude promise is kept by ARRANGEMENT
 * rather than by squeezing — the globe is compressed into the strip above and
 * simply is not drawn where the card is — which is the stronger version of the
 * same guarantee, and the only one where five parts fit.
 *
 * ── IT SAYS WHEN THE STAGE IS TOO SHORT, AND WHAT THAT MEANS ──────────────
 *
 * Measured before it was designed, which is the only reason this comment can
 * be specific: the card's floor is 184px and the strip's is 72, so the card
 * wants a 266px stage — and the drawer opens Brain at `BRAIN_STAGE_IDEAL`,
 * which is 208. On a 700px panel the drawer's own ceiling cannot reach the
 * height that would give it 266 even with §7.1's nav band gone. Browse, where
 * the globe is 300px, has the room comfortably.
 *
 * SO THE SHORT STAGE IS NOT A DIFFERENT RENDERING. Two drawings of one
 * selection is the thing this codebase keeps rejecting — one account of a
 * fact, not two that agree today. The card keeps its parts at their real
 * sizes, keeps the lower portion, and SCROLLS its middle; the strip keeps its
 * floor. The action stays pinned to the card's foot rather than scrolling
 * away with the value block, because being able to act always matters more
 * than seeing all of a summary at once.
 *
 * `fits` is therefore informational rather than a branch: it says whether
 * anybody has to scroll, which is what a later "grow the drawer for this"
 * would key off (the drawer already grows for Brain — core/drawer/mode.ts).
 * Nothing here throws and nothing clamps silently.
 */

/**
 * The card's floor, in px: the five parts at their smallest honest size.
 *
 * Measured from the parts §7.2 specifies rather than picked: a 13px orb beside
 * a 19px name (26), the purpose line (40), a value block with an answer at
 * 17px and its padding (40), one state chip (20), and the action, which §7.2
 * fixes at "46px min" — plus the gaps between five stacked things. Change any
 * of those and this number is wrong, which is why the arithmetic is written
 * down.
 *
 * THE PURPOSE LINE IS TWO LINES, not one, and that was measured rather than
 * assumed the second time. §7.4 caps it at "about twelve words"; twelve words
 * at 14px in the ~270px a card gets on a 300px stage is two lines far more
 * often than one, and a floor built on one clipped the value block — the part
 * the card exists to show.
 */
export const LEAF_CARD_MIN = 26 + 40 + 40 + 20 + 46 + LEAF_CARD_GAPS();

function LEAF_CARD_GAPS(): number {
  // Four gaps between five parts, at the 8px step the panel uses everywhere.
  return 4 * 8;
}

/** The gap between the globe strip and the card's top edge, in px. */
export const LEAF_CARD_GAP = 10;

/**
 * The smallest globe strip worth drawing, in px.
 *
 * Below this the strip stops being a picture of the solid and becomes a band
 * of dots — and the whole argument for keeping it is that the person can still
 * see where they are. Two node radii and the space between them, at the size
 * the drawer opens Brain at.
 */
export const LEAF_STRIP_MIN = 72;

export interface LeafCardBand {
  /** The strip the globe compresses into, in px from the stage's top. */
  strip: number;
  /** The card's top edge, in px from the stage's top. */
  top: number;
  /** The card's height, in px. */
  height: number;
  /**
   * Whether the stage can give the card its floor AND the strip its own.
   * `false` does not mean "do not draw": it means the card's middle will
   * scroll. See the header — the parts keep their sizes either way.
   */
  fits: boolean;
}

/**
 * The split, for a square stage of `size` px.
 *
 * The card takes what it needs and no more: its floor, or the lower portion,
 * whichever is larger — so a tall stage gives the card room to breathe rather
 * than handing all of it to a strip nobody is reading at that moment.
 */
export function leafCardBand(size: number, cardMin: number = LEAF_CARD_MIN): LeafCardBand {
  const usable = Math.max(0, size);
  // The lower portion, before either floor is applied.
  // 0.7 rather than a half: the strip is orientation and the card is the
  // thing being read, so on a stage with room to spare the room goes to the
  // card. The strip's own floor below is what stops that going too far.
  const wanted = Math.max(cardMin, Math.round(usable * 0.7));
  const strip = usable - wanted - LEAF_CARD_GAP;

  if (strip >= LEAF_STRIP_MIN) {
    return { strip, top: strip + LEAF_CARD_GAP, height: wanted, fits: true };
  }

  // Not enough for both. Give the strip its floor and the card the rest, and
  // say plainly that it does not fit — the caller decides what to do about it.
  const height = Math.max(0, usable - LEAF_STRIP_MIN - LEAF_CARD_GAP);
  return {
    strip: Math.max(0, Math.min(usable, LEAF_STRIP_MIN)),
    top: Math.min(usable, LEAF_STRIP_MIN + LEAF_CARD_GAP),
    height,
    fits: height >= cardMin,
  };
}

/** The stage size at which a leaf card first fits beside its strip. */
export function leafCardMinStage(cardMin: number = LEAF_CARD_MIN): number {
  return cardMin + LEAF_CARD_GAP + LEAF_STRIP_MIN;
}
