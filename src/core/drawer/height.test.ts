import { describe, it, expect } from 'vitest';
import {
  DRAWER_CHROME_HEIGHT,
  DRAWER_CRUMB_HEIGHT,
  DRAWER_HANDLE_BAND,
  DRAWER_HANDLE_HEIGHT,
  DRAWER_HANDLE_OVERHANG,
  DRAWER_MAX_FRACTION,
  DRAWER_MIN_HEIGHT,
  DRAWER_PAGE_STEP,
  DRAWER_QUESTION_RESERVE,
  DRAWER_REST_HEIGHT,
  DRAWER_ROW_HEIGHT,
  DRAWER_STEP,
  DRAWER_VIEW_BAR_HEIGHT,
  clampDrawerHeight,
  drawerBounds,
  drawerHeightForKey,
  drawerHeightFromDrag,
  drawerOpenPercent,
  restingDrawerHeight,
} from './height';
import { FLOW_NAV_CLEARANCE, FLOW_NAV_HEIGHT, FLOW_NAV_TARGET } from '../flow/dock';

/** The real side panel: 400px wide, and about this tall on a laptop. */
const PANEL = 700;
const BOUNDS = drawerBounds(PANEL);

describe('drawerBounds', () => {
  it('never lets the drawer cover the question', () => {
    for (const viewport of [520, 600, 700, 900, 1200, 1600]) {
      const { max } = drawerBounds(viewport);
      // The two promises VB-12 makes about the ceiling, asserted as the two
      // separate things they are.
      expect(viewport - max, `${viewport}px panel keeps the question's room`).toBeGreaterThanOrEqual(
        Math.min(DRAWER_QUESTION_RESERVE, viewport - DRAWER_MIN_HEIGHT),
      );
      expect(max, `${viewport}px panel stays a drawer`).toBeLessThanOrEqual(viewport * DRAWER_MAX_FRACTION + 0.5);
    }
  });

  it('is the fraction on a tall panel and the reserve on a short one', () => {
    // V1.2 VB-11 put the Back/Next/Skip bar on the drawer's top edge, so the
    // room the ceiling has to leave is the question's reserve *plus* that bar.
    const kept = DRAWER_QUESTION_RESERVE + FLOW_NAV_HEIGHT;
    // Tall: 62% of 1600 is 992, which is far less than 1600 - 324.
    expect(drawerBounds(1600).max).toBe(Math.round(1600 * DRAWER_MAX_FRACTION));
    // Short: 62% of 520 is 322, which is more than 520 - 324 = 196.
    expect(drawerBounds(520).max).toBe(520 - kept);
  });

  it('collapses to a fixed peek rather than inverting on an impossible panel', () => {
    const tiny = drawerBounds(300);
    expect(tiny.min).toBe(DRAWER_MIN_HEIGHT);
    expect(tiny.max).toBe(DRAWER_MIN_HEIGHT);
    expect(tiny.max).toBeGreaterThanOrEqual(tiny.min);
  });

  it('survives a viewport it cannot read', () => {
    expect(drawerBounds(Number.NaN)).toEqual({ min: DRAWER_MIN_HEIGHT, max: DRAWER_MIN_HEIGHT });
  });

  it('leaves room for the mode VB-14 will put inside it', () => {
    // VB-14: "Below ~180px Brain is unusable... At 300px it's excellent."
    // A real panel has to be able to reach that or the globe has nowhere to go.
    expect(drawerBounds(PANEL).max).toBeGreaterThanOrEqual(300);
  });
});

/**
 * V2.0 VB-72 — less air above the breadcrumbs.
 *
 * The band under the grip gives up the pixels it had nothing in, and every
 * number it is allowed to give them up against is asserted somewhere else:
 * VB-41's clearance above the seam, the 44px floor, and the peek V1.1 fixed.
 * So this is four claims about how the reduction is BOUNDED, not one about how
 * much air looks right.
 */
describe('VB-72 — the handle’s band, and what it is allowed to cost', () => {
  it('leaves the handle a real 44px target, in two pieces', () => {
    expect(DRAWER_HANDLE_BAND + DRAWER_HANDLE_OVERHANG).toBe(DRAWER_HANDLE_HEIGHT);
    // docs/GUARDRAILS.md's floor, which has no exception for a control that
    // looks like a rule.
    expect(DRAWER_HANDLE_HEIGHT).toBeGreaterThanOrEqual(44);
    // ...and the band is a real band rather than a hairline the grip hangs off.
    expect(DRAWER_HANDLE_BAND).toBeGreaterThan(0);
  });

  it('reaches no further up than the room VB-41 already leaves above the drawer', () => {
    // FLOW_NAV_CLEARANCE is the gap between the nav's hit boxes and the
    // drawer's top edge. Taking all of it puts the two targets edge to edge and
    // never one over the other: a press that would have hit Back, Next or Skip
    // still hits it.
    expect(DRAWER_HANDLE_OVERHANG).toBeLessThanOrEqual(FLOW_NAV_CLEARANCE);
    // The grip is 14px and straddles the drawer's edge, so the handle has to
    // reach at least its top half or it would not cover what a person aims at.
    expect(DRAWER_HANDLE_OVERHANG).toBeGreaterThanOrEqual(7);
    // And the bar above is untouched — the same target, the same clearance,
    // the same height. VB-72 changes what is under the seam, never over it.
    expect(FLOW_NAV_HEIGHT).toBe(FLOW_NAV_TARGET + FLOW_NAV_CLEARANCE);
  });

  it('charges the drawer for the band, not for the target', () => {
    expect(DRAWER_CHROME_HEIGHT).toBe(DRAWER_HANDLE_BAND + DRAWER_CRUMB_HEIGHT + DRAWER_VIEW_BAR_HEIGHT);
    // The trail starts `DRAWER_HANDLE_OVERHANG` higher than it did, which is
    // the whole of the complaint.
    expect(DRAWER_HANDLE_HEIGHT + DRAWER_CRUMB_HEIGHT + DRAWER_VIEW_BAR_HEIGHT - DRAWER_CHROME_HEIGHT).toBe(
      DRAWER_HANDLE_OVERHANG,
    );
  });

  it('spends the refund on the file rather than on the drawer', () => {
    // The two numbers V1.1 fixed and V1.9 kept to the pixel, unchanged: the
    // panel's composition is the same before and after this task.
    expect(DRAWER_MIN_HEIGHT).toBe(176);
    expect(DRAWER_REST_HEIGHT).toBe(186);
    // What did change is how much of the drawer is file: one row plus the
    // pixels the empty band gave back.
    expect(DRAWER_MIN_HEIGHT - DRAWER_CHROME_HEIGHT).toBe(DRAWER_ROW_HEIGHT + DRAWER_HANDLE_OVERHANG);
  });
});

describe('clampDrawerHeight', () => {
  it('holds both ends', () => {
    expect(clampDrawerHeight(0, BOUNDS)).toBe(BOUNDS.min);
    expect(clampDrawerHeight(99999, BOUNDS)).toBe(BOUNDS.max);
    expect(clampDrawerHeight(200, BOUNDS)).toBe(200);
  });

  it('returns whole pixels', () => {
    expect(clampDrawerHeight(200.4, BOUNDS)).toBe(200);
    expect(clampDrawerHeight(200.6, BOUNDS)).toBe(201);
  });

  it('answers a number it cannot use with the peek, never NaN', () => {
    expect(clampDrawerHeight(Number.NaN, BOUNDS)).toBe(BOUNDS.min);
  });
});

describe('restingDrawerHeight', () => {
  it('is V1.1’s peek on a real panel', () => {
    expect(restingDrawerHeight(BOUNDS)).toBe(DRAWER_REST_HEIGHT);
  });

  it('is clamped on a panel too short to hold it', () => {
    const short = drawerBounds(400);
    expect(restingDrawerHeight(short)).toBe(short.max);
    expect(restingDrawerHeight(short)).toBeLessThanOrEqual(short.max);
  });
});

describe('drawerHeightFromDrag', () => {
  it('grows by exactly as far as the pointer moved up', () => {
    // Started at 186 with the pointer at y=500; the pointer is now 120px
    // higher up the screen, so the drawer is 120px taller.
    expect(drawerHeightFromDrag(186, 500, 380, BOUNDS)).toBe(306);
  });

  it('shrinks by exactly as far as the pointer moved down', () => {
    expect(drawerHeightFromDrag(306, 380, 460, BOUNDS)).toBe(226);
  });

  it('tracks the pointer 1:1 across the whole range', () => {
    for (let dy = -400; dy <= 400; dy += 37) {
      const height = drawerHeightFromDrag(300, 400, 400 - dy, BOUNDS);
      const unclamped = 300 + dy;
      const expected = Math.min(Math.max(unclamped, BOUNDS.min), BOUNDS.max);
      expect(height).toBe(expected);
    }
  });

  it('comes straight back to the grip after being dragged past the end', () => {
    // Past the top: pinned at max.
    expect(drawerHeightFromDrag(300, 400, 0, BOUNDS)).toBe(BOUNDS.max);
    // ...and back to where the pointer actually is, not to max minus the
    // overshoot. This is the whole reason the drag is computed from its start
    // rather than accumulated per event.
    expect(drawerHeightFromDrag(300, 400, 380, BOUNDS)).toBe(320);
  });
});

describe('drawerHeightForKey', () => {
  it('nudges up and down by one step', () => {
    expect(drawerHeightForKey('ArrowUp', 300, BOUNDS, 300)).toEqual({ height: 300 + DRAWER_STEP, settle: 'nudge' });
    expect(drawerHeightForKey('ArrowDown', 300, BOUNDS, 300)).toEqual({ height: 300 - DRAWER_STEP, settle: 'nudge' });
    expect(drawerHeightForKey('ArrowRight', 300, BOUNDS, 300)?.height).toBe(300 + DRAWER_STEP);
    expect(drawerHeightForKey('ArrowLeft', 300, BOUNDS, 300)?.height).toBe(300 - DRAWER_STEP);
  });

  it('pages by more than it nudges', () => {
    expect(drawerHeightForKey('PageUp', 300, BOUNDS, 300)?.height).toBe(300 + DRAWER_PAGE_STEP);
    expect(drawerHeightForKey('PageDown', 300, BOUNDS, 300)?.height).toBe(300 - DRAWER_PAGE_STEP);
  });

  it('sends Home to the announced minimum and End to the announced maximum', () => {
    expect(drawerHeightForKey('Home', 300, BOUNDS, 300)).toEqual({ height: BOUNDS.min, settle: 'jump' });
    expect(drawerHeightForKey('End', 300, BOUNDS, 300)).toEqual({ height: BOUNDS.max, settle: 'jump' });
  });

  it('never steps outside the range, however many presses', () => {
    let height = restingDrawerHeight(BOUNDS);
    for (let i = 0; i < 60; i++) height = drawerHeightForKey('ArrowUp', height, BOUNDS, height)!.height;
    expect(height).toBe(BOUNDS.max);
    for (let i = 0; i < 60; i++) height = drawerHeightForKey('ArrowDown', height, BOUNDS, height)!.height;
    expect(height).toBe(BOUNDS.min);
  });

  it('collapses to the peek on Enter, and restores what it was on the next Enter', () => {
    const collapsed = drawerHeightForKey('Enter', 340, BOUNDS, 340)!;
    expect(collapsed).toEqual({ height: BOUNDS.min, settle: 'jump' });
    expect(drawerHeightForKey('Enter', collapsed.height, BOUNDS, 340)).toEqual({ height: 340, settle: 'jump' });
  });

  it('is never a no-op, even with nothing to restore', () => {
    // Collapsed, and the remembered height is the peek itself — Enter still
    // has to do something, or the control looks broken.
    const opened = drawerHeightForKey('Enter', BOUNDS.min, BOUNDS, BOUNDS.min)!;
    expect(opened.height).toBe(restingDrawerHeight(BOUNDS));
    expect(opened.height).toBeGreaterThan(BOUNDS.min);
  });

  it('cannot restore a height from a bigger panel', () => {
    const short = drawerBounds(520);
    expect(drawerHeightForKey('Enter', short.min, short, 900)?.height).toBe(short.max);
  });

  it('leaves a key it does not own alone', () => {
    for (const key of ['Tab', 'Escape', ' ', 'a', 'Shift']) {
      expect(drawerHeightForKey(key, 300, BOUNDS, 300), key).toBeNull();
    }
  });
});

describe('drawerOpenPercent', () => {
  it('reads 0 at the peek and 100 at the ceiling', () => {
    expect(drawerOpenPercent(BOUNDS.min, BOUNDS)).toBe(0);
    expect(drawerOpenPercent(BOUNDS.max, BOUNDS)).toBe(100);
  });

  it('rises with the height', () => {
    const mid = drawerOpenPercent((BOUNDS.min + BOUNDS.max) / 2, BOUNDS);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
    expect(drawerOpenPercent(BOUNDS.min + 20, BOUNDS)).toBeLessThan(mid);
  });

  it('reads fully open when there is nowhere to go', () => {
    const stuck = drawerBounds(300);
    expect(drawerOpenPercent(stuck.min, stuck)).toBe(100);
  });
});
