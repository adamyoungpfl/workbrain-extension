import { describe, it, expect } from 'vitest';
import { fileToggle } from '../files/toggle';
import {
  BRAIN_NAV_HOME,
  WORK_NODE_GONE,
  WORK_RING,
  WORK_SOLID_SCALE,
  applyWorkCamera,
  chooseNav,
  pullBack,
  workCamera,
  workEdges,
  workNodeFade,
  workNodePosition,
  workNodeState,
} from './workBrain';
import type { BrainNav } from './workBrain';

/**
 * V1.8 VB-48.
 *
 * Two halves, and they fail in different ways, so they are tested apart:
 *
 *  · **the rules** — what a press means. The failure here is a locked file that
 *    somebody gets into, which would put the picture in a state the product has
 *    no content for. It is `chooseFile`'s refusal plus a tier, so the test
 *    drives the REAL toggle built from the REAL slots rather than a hand-made
 *    list that would agree with itself.
 *  · **the camera** — where the second tier puts things. The failure here is a
 *    transform that is not the identity at the file tier, which would silently
 *    move every V1.2–V1.7 behaviour on this stage by a few pixels: the fly-in's
 *    landing, the split's feature position, the summary's clearance, and the
 *    morph's measured ends. So the identity is asserted exactly, not nearly.
 */

/** The shelf as it really is today: Context built, the other two locked. */
const ITEMS = fileToggle('context', {});
const FINISHED = fileToggle('context', { context: true });

describe('VB-48 — the tier rules', () => {
  it('opens inside Context, exactly where the drawer opened before V1.8', () => {
    expect(BRAIN_NAV_HOME).toEqual({ tier: 'file', file: 'context' });
  });

  it('pressing the open file at the work tier goes into it', () => {
    expect(chooseNav({ tier: 'work', file: 'context' }, 'context', ITEMS)).toEqual({
      tier: 'file',
      file: 'context',
    });
  });

  it('refuses a locked file, and does not change tier on the way past', () => {
    const at: BrainNav = { tier: 'work', file: 'context' };
    for (const wanted of ['skills', 'actions'] as const) {
      expect(chooseNav(at, wanted, ITEMS), wanted).toEqual(at);
      // ...and still refuses once Context is finished. Being next in line is
      // not the same as being built (core/files/slots.ts's BUILT).
      expect(chooseNav(at, wanted, FINISHED), `${wanted} — finished`).toEqual(at);
    }
  });

  it('refuses a file that is not on the toggle at all', () => {
    const at: BrainNav = { tier: 'work', file: 'context' };
    expect(chooseNav(at, 'skills', [])).toEqual(at);
  });

  it('pressing the file already open at the file tier is not a move', () => {
    const at: BrainNav = { tier: 'file', file: 'context' };
    expect(chooseNav(at, 'context', ITEMS)).toBe(at);
  });

  it('pulls back to the work brain keeping the file, and stays there', () => {
    const inside: BrainNav = { tier: 'file', file: 'context' };
    const out = pullBack(inside);
    expect(out).toEqual({ tier: 'work', file: 'context' });
    expect(pullBack(out)).toBe(out);
  });

  it('lights an open file and turns a locked one down — the edges’ own vocabulary', () => {
    expect(workNodeState(ITEMS.find((item) => item.id === 'context')!)).toBe('active');
    expect(workNodeState(ITEMS.find((item) => item.id === 'skills')!)).toBe('inactive');
  });
});

describe('VB-48 — where the file nodes sit', () => {
  it('puts the first node at the top and rings the rest clockwise', () => {
    const [top, right, left] = [0, 1, 2].map((i) => workNodePosition(i, 3));
    expect(top!.x).toBeCloseTo(0, 6);
    expect(top!.y).toBeCloseTo(-WORK_RING, 6);
    // SVG's y points down, so "below" is a larger y. Right of centre first.
    expect(right!.x).toBeGreaterThan(0);
    expect(right!.y).toBeGreaterThan(0);
    expect(left!.x).toBeLessThan(0);
    expect(left!.y).toBeCloseTo(right!.y, 6);
  });

  it('keeps every node on the stage, with room for a label under it', () => {
    for (const count of [1, 2, 3]) {
      for (let i = 0; i < count; i++) {
        const { x, y } = workNodePosition(i, count);
        expect(Math.hypot(x, y), `${i}/${count}`).toBeLessThanOrEqual(WORK_RING + 0.001);
      }
    }
  });

  it('joins every file to every other — three nodes, three edges', () => {
    expect(workEdges(3)).toEqual([
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
    expect(workEdges(1)).toEqual([]);
    expect(workEdges(0)).toEqual([]);
  });
});

describe('VB-48 — the camera, and the identity that protects everything below it', () => {
  const home = workNodePosition(0, 3);

  it('is exactly the identity at the file tier', () => {
    const camera = workCamera(1, home);
    expect(camera).toEqual({ scale: 1, x: 0, y: 0 });
    for (const point of [
      [0, 0],
      [-58, 0],
      [37.4, -12.9],
    ] as const) {
      expect(applyWorkCamera(camera, point[0], point[1])).toEqual({ x: point[0], y: point[1] });
    }
  });

  it('draws the whole solid inside its own node at the work tier', () => {
    const camera = workCamera(0, home);
    expect(camera.scale).toBe(WORK_SOLID_SCALE);
    // The solid's own centre lands on the node's home, so the shrunk model IS
    // the node rather than a picture parked near it.
    expect(applyWorkCamera(camera, 0, 0)).toEqual({ x: home.x, y: home.y });
    // ...and the icosahedron's silhouette (~63 units) fits inside the ring.
    expect(63 * camera.scale).toBeLessThan(WORK_RING / 2 + 1);
  });

  it('never leaves the range between the two tiers, however the clock arrives', () => {
    for (const t of [-1, -0.0001, 0, 0.5, 1, 1.0001, 3]) {
      const camera = workCamera(t, home);
      expect(camera.scale, `t=${t}`).toBeGreaterThanOrEqual(WORK_SOLID_SCALE);
      expect(camera.scale, `t=${t}`).toBeLessThanOrEqual(1);
      expect(Math.abs(camera.x), `t=${t}`).toBeLessThanOrEqual(Math.abs(home.x));
      expect(Math.abs(camera.y), `t=${t}`).toBeLessThanOrEqual(Math.abs(home.y));
    }
  });

  it('grows without ever going backwards', () => {
    let previous = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const { scale } = workCamera(t, home);
      expect(scale).toBeGreaterThanOrEqual(previous);
      previous = scale;
    }
  });

  it('takes the other files off the stage before the camera has finished arriving', () => {
    expect(workNodeFade(0)).toBe(1);
    expect(workNodeFade(1)).toBe(0);
    expect(workNodeFade(0.7)).toBeLessThanOrEqual(WORK_NODE_GONE);
    // Monotonic: a node that came back mid-flight would read as a second thing
    // arriving rather than as one thing leaving.
    let previous = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const fade = workNodeFade(t);
      expect(fade).toBeLessThanOrEqual(previous);
      previous = fade;
    }
  });
});
