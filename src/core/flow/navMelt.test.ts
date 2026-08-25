import { describe, it, expect } from 'vitest';
import {
  NAV_MELT_CLUSTER_MS,
  NAV_MELT_DROP,
  NAV_MELT_GESTURE_MS,
  NAV_MELT_MS,
  NAV_MELT_STAGGER_MS,
  NAV_RISE_DELAY_MS,
  NAV_RISE_MS,
  navMeltClusterMs,
  navMeltDropBounds,
  navMeltOffsetMs,
  navMeltPlan,
  navMelters,
  navReformsToNothing,
  navRisers,
} from './navMelt';
import { FLOW_NAV_MAX_CONTROLS, FLOW_NAV_TARGET, navPaintGapAboveDrawer, navPaintHeight } from './dock';

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

/**
 * V2.0 — THE WAVE.
 *
 * V1.9's gesture played in unison and was, in Adam's words on the built
 * extension, "not obvious at any point". The fix is a stagger, and the reason
 * these are arithmetic rather than taste is that a stagger is the one lever
 * that makes the cue more legible WITHOUT making any single control move
 * further or for longer — which is exactly what the two rules above forbid.
 * So the tests that matter are the ones proving it did not buy legibility out
 * of the input rule's pocket.
 */
describe('the wave across the cluster', () => {
  it('does not lengthen how long a single control moves', () => {
    // The number the whole first section is about, restated here because this
    // is the section that could have been tempted to change it.
    expect(navMeltClusterMs(1)).toBe(NAV_MELT_GESTURE_MS);
    expect(NAV_MELT_GESTURE_MS).toBe(200);
  });

  it('holds a full cluster inside §06’s longest duration', () => {
    // `--slow` in design/tokens.json, borrowed as a ceiling: the most the
    // design system lets anything on screen take, and not one ms more.
    expect(NAV_MELT_CLUSTER_MS).toBe(320);
    expect(navMeltClusterMs(FLOW_NAV_MAX_CONTROLS)).toBe(NAV_MELT_CLUSTER_MS);
  });

  it('derives the stagger from that ceiling rather than choosing one', () => {
    expect(NAV_MELT_STAGGER_MS).toBe(
      (NAV_MELT_CLUSTER_MS - NAV_MELT_GESTURE_MS) / (FLOW_NAV_MAX_CONTROLS - 1),
    );
    expect(NAV_MELT_STAGGER_MS).toBe(60);
  });

  it('crosses the bar faster than one control finishes melting', () => {
    // What makes it one gesture rippling rather than three played in turn:
    // the next control is on its way down before the last one has landed.
    expect(NAV_MELT_STAGGER_MS).toBeGreaterThan(0);
    expect(NAV_MELT_STAGGER_MS).toBeLessThan(NAV_MELT_MS);
  });

  it('counts a control’s place in the wave from the left, starting at nothing', () => {
    expect(navMeltOffsetMs(0)).toBe(0);
    expect(navMeltOffsetMs(1)).toBe(NAV_MELT_STAGGER_MS);
    expect(navMeltOffsetMs(2)).toBe(NAV_MELT_STAGGER_MS * 2);
    // The bar cannot hold a control at a negative index, and if a caller ever
    // asks about one it gets the start of the wave rather than a delay that
    // runs backwards into the last question.
    expect(navMeltOffsetMs(-1)).toBe(0);
  });

  it('is shorter for the clusters that hold fewer controls', () => {
    expect(navMeltClusterMs(0)).toBe(0);
    expect(navMeltClusterMs(1)).toBe(200);
    expect(navMeltClusterMs(2)).toBe(260);
    expect(navMeltClusterMs(3)).toBe(320);
  });

  it('leaves the last control on the bar its full gesture inside the envelope', () => {
    // The whole point of deriving the stagger: the control that starts last
    // still gets all 200ms, and the sum still lands on the ceiling.
    const last = navMeltOffsetMs(FLOW_NAV_MAX_CONTROLS - 1);
    expect(last + NAV_MELT_GESTURE_MS).toBe(NAV_MELT_CLUSTER_MS);
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

  it('travels far enough to be seen as a drop and not only as a squash', () => {
    /* V2.0. Fourteen was one pixel over the floor, which made the drop a
       rounding error next to the squash and left the gesture reading as a
       blink. This is the half of that fix that is a number rather than a
       sequence — and it is stated as "well inside the bounds" rather than as
       "20", so it can only be satisfied by a travel that is actually worth
       looking at, and never by creeping back to the minimum. */
    const { min, max } = navMeltDropBounds();
    expect(NAV_MELT_DROP).toBeGreaterThan(min + (max - min) / 2);
    // And still honestly under both ceilings rather than sitting on them.
    expect(max - NAV_MELT_DROP).toBeGreaterThanOrEqual(2);
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
