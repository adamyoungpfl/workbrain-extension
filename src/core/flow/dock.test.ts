import { describe, it, expect } from 'vitest';
import {
  FLOW_NAV_GAP,
  FLOW_NAV_HEIGHT,
  dockedChromeHeight,
  flowBottomReserve,
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
