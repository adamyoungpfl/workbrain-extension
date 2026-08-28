import { describe, expect, it } from 'vitest';
import {
  LEAF_CARD_GAP,
  LEAF_CARD_MIN,
  LEAF_STRIP_MIN,
  leafCardBand,
  leafCardMinStage,
} from './leafCard';
import { BRAIN_STAGE_IDEAL } from '../drawer/mode';

/**
 * BS-07c (§7.2) — the leaf card's share of the stage.
 *
 * The claim worth testing is the one §7.2 makes in its files list:
 * "never-occlude preserved above". Here that is arithmetic — the strip and the
 * card never overlap, at any stage size, including the degenerate ones.
 */

describe('leafCardBand', () => {
  it('never lets the card overlap the strip, at any size', () => {
    for (let size = 0; size <= 600; size += 7) {
      const band = leafCardBand(size);
      expect(band.strip, `strip at ${size}`).toBeGreaterThanOrEqual(0);
      expect(band.height, `height at ${size}`).toBeGreaterThanOrEqual(0);
      // THE CLAIM. The card starts at or below the strip's foot, every time.
      expect(band.top, `top at ${size}`).toBeGreaterThanOrEqual(band.strip);
    }
  });

  it('gives the card the lower portion once there is room for both', () => {
    const band = leafCardBand(300);
    expect(band.fits).toBe(true);
    expect(band.strip).toBeGreaterThanOrEqual(LEAF_STRIP_MIN);
    expect(band.height).toBeGreaterThanOrEqual(LEAF_CARD_MIN);
    expect(band.top).toBe(band.strip + LEAF_CARD_GAP);
    // Nothing is lost between them but the gap.
    expect(band.strip + LEAF_CARD_GAP + band.height).toBe(300);
  });

  it('lets a tall stage give the card room to breathe rather than the strip', () => {
    const small = leafCardBand(300);
    const large = leafCardBand(420);
    expect(large.height).toBeGreaterThan(small.height);
    expect(large.strip).toBeGreaterThan(small.strip);
  });

  it('holds the strip at its floor and says the card must scroll', () => {
    // The drawer's own Brain size. Measured, and it is the reason §7.2's card
    // scrolls its middle rather than being drawn a second, smaller way.
    // (204 + 10 + 72 = 286, and Brain opens at 208.)
    const band = leafCardBand(BRAIN_STAGE_IDEAL);
    expect(band.fits).toBe(false);
    expect(band.strip).toBe(LEAF_STRIP_MIN);
    expect(band.top).toBe(LEAF_STRIP_MIN + LEAF_CARD_GAP);
    // Still a real card, still below the strip — just one somebody scrolls.
    expect(band.height).toBeGreaterThan(0);
    expect(band.top).toBeGreaterThanOrEqual(band.strip);
  });

  it('states the size at which scrolling stops being necessary', () => {
    const need = leafCardMinStage();
    expect(need).toBe(LEAF_CARD_MIN + LEAF_CARD_GAP + LEAF_STRIP_MIN);
    expect(leafCardBand(need).fits).toBe(true);
    expect(leafCardBand(need - 1).fits).toBe(false);
    // And the drawer's Brain stage is under it, which is the finding this
    // whole arrangement is a response to.
    expect(BRAIN_STAGE_IDEAL).toBeLessThan(need);
  });

  it('draws nothing rather than something negative on a degenerate stage', () => {
    for (const size of [0, -50, LEAF_STRIP_MIN]) {
      const band = leafCardBand(size);
      expect(band.height).toBeGreaterThanOrEqual(0);
      expect(band.strip).toBeGreaterThanOrEqual(0);
      expect(band.fits).toBe(false);
    }
  });
});
