import { describe, it, expect } from 'vitest';
import {
  NAV_MELT_DROP,
  NAV_MELT_GESTURE_MS,
  NAV_MELT_MS,
  NAV_RISE_DELAY_MS,
  NAV_RISE_MS,
  navMeltDropBounds,
  navMeltPlan,
  navMelters,
  navReformsToNothing,
  navRisers,
} from './navMelt';
import { FLOW_NAV_TARGET, navPaintGapAboveDrawer, navPaintHeight } from './dock';

/**
 * VB-53's rules, stated as arithmetic rather than as a browser.
 *
 * The e2e is what proves the melt happens on screen. This is what proves the
 * numbers it happens with cannot quietly drift into a delay, a twitch, or a
 * button that is harder to press while it moves.
 */
describe('the melt’s timing', () => {
  it('is §06’s default for anything that moves — end to end, not per half', () => {
    expect(NAV_MELT_GESTURE_MS).toBe(200);
  });

  it('spends both halves at a duration the design system already names', () => {
    // 120ms is §06's "hover, focus, colour change — below perception". Two of
    // them overlapped is the whole gesture; neither is a number invented here.
    expect(NAV_MELT_MS).toBe(120);
    expect(NAV_RISE_MS).toBe(120);
  });

  it('overlaps the rise into the melt rather than queueing it after', () => {
    // The difference between a cluster that reforms and two animations played
    // back to back. Back to back would be 240ms and would read as a wait.
    expect(NAV_RISE_DELAY_MS).toBeLessThan(NAV_MELT_MS);
    expect(NAV_RISE_DELAY_MS).toBeGreaterThan(0);
  });

  it('adds up: the rise finishes exactly when the gesture does', () => {
    expect(NAV_RISE_DELAY_MS + NAV_RISE_MS).toBe(NAV_MELT_GESTURE_MS);
    expect(NAV_MELT_MS).toBeLessThanOrEqual(NAV_MELT_GESTURE_MS);
  });

  it('never leaves the band empty mid-gesture', () => {
    // The outgoing cluster is still on screen when the incoming one starts to
    // come out of the bar, so there is no frame with nothing in the band.
    expect(NAV_RISE_DELAY_MS).toBeLessThan(NAV_MELT_MS);
  });
});

describe('how far it travels', () => {
  it('goes far enough to disappear into the surface rather than twitch', () => {
    expect(NAV_MELT_DROP).toBeGreaterThanOrEqual(navPaintHeight() / 2);
  });

  it('stays under half the pressable box, so the ink never leaves its control', () => {
    // THE INPUT RULE, as pixels. The button does not move at all — only the
    // ink inside it does — and it moves less than half the box's own height,
    // so the word a person is looking at and the 44px target they can press
    // are the same object at every frame of the gesture.
    expect(NAV_MELT_DROP).toBeLessThan(FLOW_NAV_TARGET / 2);
  });

  it('never paints over the drawer’s handle at the bottom of the melt', () => {
    expect(NAV_MELT_DROP).toBeLessThan(navPaintGapAboveDrawer());
  });

  it('states its own bounds, and sits inside them', () => {
    const { min, max } = navMeltDropBounds();
    expect(min).toBeLessThan(max);
    expect(NAV_MELT_DROP).toBeGreaterThanOrEqual(min);
    expect(NAV_MELT_DROP).toBeLessThan(max);
  });
});

describe('what happens to each control', () => {
  it('reforms the controls the next question also offers', () => {
    const plan = navMeltPlan(['back', 'next', 'skip'], ['back', 'next', 'skip']);
    expect(plan).toEqual([
      { id: 'back', fate: 'reforms' },
      { id: 'next', fate: 'reforms' },
      { id: 'skip', fate: 'reforms' },
    ]);
    expect(navRisers(plan)).toEqual(['back', 'next', 'skip']);
  });

  it('melts Skip away on the question after a skippable one, and does not raise it', () => {
    const plan = navMeltPlan(['back', 'next', 'skip'], ['back', 'next']);
    expect(plan).toEqual([
      { id: 'back', fate: 'reforms' },
      { id: 'next', fate: 'reforms' },
      { id: 'skip', fate: 'melts' },
    ]);
    expect(navRisers(plan)).toEqual(['back', 'next']);
    expect(navMelters(plan)).toEqual(['back', 'next', 'skip']);
  });

  it('raises Back the first time there is history behind the question', () => {
    const plan = navMeltPlan(['next'], ['back', 'next']);
    expect(plan).toEqual([
      { id: 'next', fate: 'reforms' },
      { id: 'back', fate: 'arrives' },
    ]);
    expect(navRisers(plan)).toEqual(['next', 'back']);
    expect(navMelters(plan)).toEqual(['next']);
  });

  it('treats a first cluster with nothing behind it as all arrivals', () => {
    const plan = navMeltPlan([], ['next']);
    expect(plan).toEqual([{ id: 'next', fate: 'arrives' }]);
    expect(navMelters(plan)).toEqual([]);
    expect(navRisers(plan)).toEqual(['next']);
  });

  it('reads in the order the eye saw them: the old cluster, then the new arrivals', () => {
    const plan = navMeltPlan(['back', 'skip'], ['next', 'back']);
    expect(plan.map((entry) => entry.id)).toEqual(['back', 'skip', 'next']);
  });

  it('says when the next question offers no controls at all', () => {
    expect(navReformsToNothing(navMeltPlan(['back', 'next'], []))).toBe(true);
    expect(navReformsToNothing(navMeltPlan(['back', 'next'], ['back']))).toBe(false);
  });

  it('cannot invent a control that was on neither cluster', () => {
    const plan = navMeltPlan(['back'], ['next']);
    expect(plan.map((entry) => entry.id).sort()).toEqual(['back', 'next']);
  });

  it('collapses a duplicate rather than reporting one control twice', () => {
    const plan = navMeltPlan(['next', 'next'], ['next']);
    expect(plan).toEqual([{ id: 'next', fate: 'reforms' }]);
  });

  it('is empty when nothing was there and nothing arrives', () => {
    expect(navMeltPlan([], [])).toEqual([]);
    expect(navReformsToNothing(navMeltPlan([], []))).toBe(true);
  });
});
