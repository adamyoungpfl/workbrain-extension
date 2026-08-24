import { describe, it, expect } from 'vitest';
import {
  FLOW_NAV_CLEARANCE,
  FLOW_NAV_GAP,
  FLOW_NAV_HEIGHT,
  FLOW_NAV_LABEL,
  FLOW_NAV_PAINT_PAD,
  FLOW_NAV_RING_REACH,
  FLOW_NAV_TARGET,
  FLOW_SAVE_NOTE_FOOT,
  dockedChromeHeight,
  flowBottomReserve,
  navHitPadding,
  navPaintGapAboveDrawer,
  navPaintHeight,
  navPaintOverhang,
  saveNotePaintGapAboveNav,
} from './dock';
import {
  DRAWER_MIN_HEIGHT,
  DRAWER_QUESTION_RESERVE,
  DRAWER_REST_HEIGHT,
  drawerBounds,
} from '../drawer/height';

describe('the docked navigation bar', () => {
  it('is at least one whole 44px target tall', () => {
    // The floor is not negotiable (docs/GUARDRAILS.md) and the bar has to be
    // able to hold a button that meets it, with room for a focus ring.
    expect(FLOW_NAV_HEIGHT).toBeGreaterThanOrEqual(44);
  });

  it('is one hit box and the clearance above the drawer, and nothing else', () => {
    // V1.7 VB-41. Written as the sum so a change to either term cannot leave
    // the height saying something the layout does not do.
    expect(FLOW_NAV_HEIGHT).toBe(FLOW_NAV_TARGET + FLOW_NAV_CLEARANCE);
    expect(FLOW_NAV_TARGET).toBe(44);
  });
});

/**
 * V1.7 VB-41 — the two boxes, and the three things that have to stay true of
 * them once the container is gone.
 *
 * The painted control is smaller than the control, which is V1.3 VB-15's split
 * (components/DeepDive.css). What that split cannot be allowed to cost is the
 * accessibility floor: the pressable box is still 44, the ring still has
 * somewhere visible to go, and the ring still fits inside the bar.
 */
describe('the button cluster’s two boxes (VB-41)', () => {
  it('presses at 44 and paints at 26 — the label, plus its air', () => {
    expect(navPaintHeight()).toBe(FLOW_NAV_LABEL + FLOW_NAV_PAINT_PAD * 2);
    expect(navPaintHeight()).toBe(26);
    // The hit box is the label plus its padding, top and bottom: exactly the
    // floor, computed rather than typed.
    expect(FLOW_NAV_LABEL + navHitPadding() * 2).toBe(FLOW_NAV_TARGET);
    // …and the overhang is the difference between the two boxes, halved —
    // which is the negative margin that takes it back out of the layout.
    expect(navPaintOverhang()).toBe((FLOW_NAV_TARGET - navPaintHeight()) / 2);
    expect(navPaintOverhang()).toBe(9);
  });

  it('lands both boxes on whole pixels', () => {
    // A half pixel here is a half pixel of margin, which is a painted box that
    // does not line up with the ring around it on a 1x screen.
    for (const value of [navHitPadding(), navPaintHeight(), navPaintOverhang(), navPaintGapAboveDrawer()]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('keeps the whole focus ring inside the box you can press', () => {
    // THE ACCESSIBILITY CATCH OF THIS TASK, as arithmetic. The ring is on the
    // painted box now (Flow.css), and the painted box is 9px inside the hit
    // box on every side. A ring that reached further than that overhang would
    // be drawn outside the control it belongs to — over the question above at
    // the top, and over the drawer's own handle at the bottom, which is the
    // one confusion VB-41 exists to remove.
    expect(FLOW_NAV_RING_REACH).toBeLessThanOrEqual(navPaintOverhang());
    expect(navPaintHeight() + FLOW_NAV_RING_REACH * 2).toBeLessThanOrEqual(FLOW_NAV_TARGET);
  });

  it('puts real space between the painted cluster and the drawer’s edge', () => {
    // The complaint, in one number. The old bar left 8px between the buttons
    // and the handle; this leaves 29, and the grip only reaches 7px above the
    // edge (half of its 14px, FileDrawer.css) — so 22px of nothing between the
    // two things that were being mistaken for each other.
    expect(navPaintGapAboveDrawer()).toBe(FLOW_NAV_CLEARANCE + navPaintOverhang());
    expect(navPaintGapAboveDrawer()).toBeGreaterThanOrEqual(24);
    expect(navPaintGapAboveDrawer() - 7).toBeGreaterThanOrEqual(2 * FLOW_NAV_GAP);
    // And the ring, drawn at its outermost, still stops short of the drawer.
    expect(navPaintGapAboveDrawer() - FLOW_NAV_RING_REACH).toBeGreaterThan(FLOW_NAV_GAP);
  });

  it('does not spend more of the question’s room than it has to', () => {
    // Every pixel of this bar is taken from the drawer's ceiling and reserved
    // under the question (core/drawer/height.ts, core/flow/composition.ts).
    // Stated as a ceiling so a later "make it roomier" is a conversation with
    // composition.test.ts rather than a silent squeeze on a 600px panel.
    expect(FLOW_NAV_HEIGHT).toBeLessThanOrEqual(64);
  });
});

/**
 * V1.8 VB-44 — the foot under the save note, and the rule that decides it.
 *
 * The note is the last row of the question area and rides on VB-17's single
 * seam, so "how much padding is under it" is really "how much air is between
 * the footnote and the button cluster". The answer is bounded by VB-41 rather
 * than chosen: less than the clearance under the cluster, so the buttons group
 * upward with the question and not downward with the drawer.
 */
describe('the save note’s foot (VB-44)', () => {
  it('is one gutter, and the gap it produces is the sum of three terms', () => {
    expect(FLOW_SAVE_NOTE_FOOT).toBe(FLOW_NAV_GAP);
    expect(saveNotePaintGapAboveNav()).toBe(FLOW_SAVE_NOTE_FOOT + FLOW_NAV_GAP + navPaintOverhang());
    expect(saveNotePaintGapAboveNav()).toBe(25);
    // Whole pixels, for the same reason the cluster's own boxes are: this is a
    // painted seam on a 1x screen.
    expect(Number.isInteger(FLOW_SAVE_NOTE_FOOT)).toBe(true);
    expect(Number.isInteger(saveNotePaintGapAboveNav())).toBe(true);
  });

  it('leaves less air above the cluster than VB-41 leaves below it', () => {
    // THE RULE. The cluster belongs to the question, not to the drawer, so it
    // has to sit nearer the thing it belongs to. Before VB-44 this was 37px
    // against 29px — the grouping said the opposite of what VB-41 built.
    expect(saveNotePaintGapAboveNav()).toBeLessThan(navPaintGapAboveDrawer());
  });

  it('is still a real gap, so the note never joins the cluster', () => {
    // The other end of the same rule. A footnote pressed up against Back /
    // Next / Skip reads as part of the bar, which is how a reassurance that
    // never changes turns into permanent chrome (Flow.tsx's `saveNote`).
    expect(saveNotePaintGapAboveNav()).toBeGreaterThanOrEqual(2 * FLOW_NAV_GAP);
    expect(FLOW_SAVE_NOTE_FOOT).toBeGreaterThan(0);
  });

  it('costs the question nothing', () => {
    // It is padding inside the surface the question already owns, so it is not
    // in the reserve, not in the bar's height, and not taken off the drawer's
    // ceiling. Tightening it moves the note down; it does not move the dock.
    expect(flowBottomReserve(DRAWER_REST_HEIGHT)).toBe(DRAWER_REST_HEIGHT + FLOW_NAV_HEIGHT + FLOW_NAV_GAP);
    expect(FLOW_NAV_HEIGHT).toBe(FLOW_NAV_TARGET + FLOW_NAV_CLEARANCE);
  });
});

describe('dockedChromeHeight', () => {
  it('is the drawer plus the bar riding on its top edge', () => {
    expect(dockedChromeHeight(DRAWER_MIN_HEIGHT)).toBe(DRAWER_MIN_HEIGHT + FLOW_NAV_HEIGHT);
    expect(dockedChromeHeight(DRAWER_REST_HEIGHT)).toBe(DRAWER_REST_HEIGHT + FLOW_NAV_HEIGHT);
  });

  it('grows exactly as fast as the drawer does — the bar never changes size', () => {
    // The point of pegging: the gap between the buttons and the file is the
    // same at every height, so nothing shuffles as the drawer is dragged.
    for (let height = DRAWER_MIN_HEIGHT; height <= 500; height += 37) {
      expect(dockedChromeHeight(height) - height).toBe(FLOW_NAV_HEIGHT);
    }
  });

  it('rounds to whole pixels, so the bar cannot land on a half-pixel seam', () => {
    expect(dockedChromeHeight(200.4)).toBe(200 + FLOW_NAV_HEIGHT);
    expect(dockedChromeHeight(200.6)).toBe(201 + FLOW_NAV_HEIGHT);
  });

  it('still reserves the bar when the drawer height is unreadable', () => {
    // Degrade, never break (docs/GUARDRAILS.md): a NaN reaching padding-bottom
    // would drop the whole reservation and put the dock over the question.
    expect(dockedChromeHeight(Number.NaN)).toBe(FLOW_NAV_HEIGHT);
    expect(dockedChromeHeight(-40)).toBe(FLOW_NAV_HEIGHT);
  });
});

describe('flowBottomReserve', () => {
  it('clears the whole dock and then some', () => {
    expect(flowBottomReserve(DRAWER_REST_HEIGHT)).toBe(DRAWER_REST_HEIGHT + FLOW_NAV_HEIGHT + FLOW_NAV_GAP);
  });

  it('is always more than the chrome it is reserving for', () => {
    for (const height of [0, DRAWER_MIN_HEIGHT, DRAWER_REST_HEIGHT, 400, Number.NaN]) {
      expect(flowBottomReserve(height)).toBeGreaterThan(dockedChromeHeight(height) - 1);
    }
  });
});

describe('the dock and the drawer ceiling agree', () => {
  it('leaves the question its measured room at every panel height', () => {
    // VB-11's accept criterion — "it never overlaps the question" — is only
    // true if the drawer's ceiling knows the bar is there. This is that
    // contract, asserted across the two constants rather than assumed.
    for (const viewport of [520, 600, 700, 900, 1200, 1600]) {
      const { max } = drawerBounds(viewport);
      const free = viewport - dockedChromeHeight(max);
      expect(free, `${viewport}px panel`).toBeGreaterThanOrEqual(
        Math.min(DRAWER_QUESTION_RESERVE, viewport - dockedChromeHeight(DRAWER_MIN_HEIGHT)),
      );
    }
  });
});
