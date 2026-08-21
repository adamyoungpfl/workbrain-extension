import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { BrandMark, SPIN_ONCE_MS, resetSpinCueMemory } from './BrandMark';
import { MARK_STATIC_ANGLE, markFrame } from '../../core/geometry/markSpin';
import { mount } from './testUtils';

/**
 * V1.1 VB-01 established what is worth testing about a drawing: that the
 * shape is right, and that it is right for the reasons claimed. V1.2 VB-13
 * adds the rotation, and with it the two things that can go wrong invisibly —
 * a loop that keeps running when someone has asked for no motion, and a
 * "static" fallback that is not actually the mark we used to ship.
 *
 * The shape is an icosahedron, so it has a structural signature a typo cannot
 * survive: twelve vertices, thirty edges, every edge landing on two of them,
 * every vertex carrying exactly five. That is checked against the rendered
 * DOM, not against the source arrays.
 *
 * `markSpin.test.ts` owns the geometry. This file owns what the component
 * does with it, and jsdom gives no layout, so anything about pixels, spinning
 * on screen or frame cost is proven in tests/e2e/brand-mark.spec.ts instead.
 */

/** jsdom ships neither `matchMedia` nor a useful `requestAnimationFrame`, and
 * both branches of this component turn on them. Installed per test so each one
 * states the environment it is asserting about. */
function stubEnvironment({ reduce }: { reduce: boolean }) {
  const listeners = new Set<() => void>();
  const query = {
    matches: reduce,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );

  const scheduled: FrameRequestCallback[] = [];
  let nextHandle = 1;
  const requested: number[] = [];
  const cancelled: number[] = [];
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      requested.push(handle);
      scheduled[handle] = cb;
      return handle;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((handle: number) => {
      cancelled.push(handle);
      delete scheduled[handle];
    }),
  );

  let clock = 1000;
  vi.stubGlobal('performance', { now: () => clock });

  return {
    query,
    /** How many frames have ever been asked for. Zero is the reduced-motion bar. */
    get frameCount() {
      return requested.length;
    },
    get cancelledCount() {
      return cancelled.length;
    },
    advance(ms: number) {
      clock += ms;
    },
    /** Run whatever the last request scheduled, as the browser would. */
    tick(ms = 16) {
      clock += ms;
      const handle = requested[requested.length - 1]!;
      const cb = scheduled[handle];
      if (cb) act(() => cb(clock));
    },
    setReduce(value: boolean) {
      query.matches = value;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

const at = (el: Element, name: string) => Number(el.getAttribute(name));
const pose = (container: Element) =>
  [...container.querySelectorAll('circle')].map((c) => `${at(c, 'cx')},${at(c, 'cy')},${at(c, 'r')}`);

beforeEach(() => {
  resetSpinCueMemory();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BrandMark — the drawing', () => {
  it('draws twelve nodes and thirty edges', () => {
    const { container } = mount(<BrandMark spin="none" />);
    expect(container.querySelectorAll('circle')).toHaveLength(12);
    expect(container.querySelectorAll('line')).toHaveLength(30);
  });

  it('every edge lands exactly on two nodes, and every node carries exactly five edges', () => {
    const { container } = mount(<BrandMark spin="none" />);

    const vertices = new Map<string, number>();
    for (const c of container.querySelectorAll('circle')) {
      vertices.set(`${at(c, 'cx')},${at(c, 'cy')}`, 0);
    }
    expect(vertices.size).toBe(12); // no two nodes share a position

    for (const line of container.querySelectorAll('line')) {
      const a = `${at(line, 'x1')},${at(line, 'y1')}`;
      const b = `${at(line, 'x2')},${at(line, 'y2')}`;
      expect(vertices.has(a), `edge starts at ${a}, which is not a node`).toBe(true);
      expect(vertices.has(b), `edge ends at ${b}, which is not a node`).toBe(true);
      expect(a).not.toBe(b); // no zero-length edge
      vertices.set(a, vertices.get(a)! + 1);
      vertices.set(b, vertices.get(b)! + 1);
    }

    for (const [vertex, degree] of vertices) {
      expect(degree, `node ${vertex} has ${degree} edges, not five`).toBe(5);
    }
  });

  it('paints in back-to-front order, so nearer nodes overlap farther ones', () => {
    const { container } = mount(<BrandMark spin="none" />);
    const radii = [...container.querySelectorAll('circle')].map((c) => at(c, 'r'));
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
  });

  it('every node fill points at a gradient that is actually defined', () => {
    const { container } = mount(<BrandMark spin="none" />);
    const defined = new Set(
      [...container.querySelectorAll('linearGradient')].map((g) => g.getAttribute('id')),
    );
    expect(defined.size).toBe(5);
    for (const circle of container.querySelectorAll('circle')) {
      const ref = /^url\(#(.+)\)$/.exec(circle.getAttribute('fill') ?? '')?.[1];
      expect(defined.has(ref ?? ''), `fill "${circle.getAttribute('fill')}" resolves to nothing`).toBe(true);
    }
  });

  it('carries no colour of its own — every colour comes from a token class or a token stroke', () => {
    const { container } = mount(<BrandMark spin="none" />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    const stops = [...container.querySelectorAll('stop')];
    expect(stops).toHaveLength(10);
    for (const stop of stops) {
      expect(stop.getAttribute('class')).toMatch(/^brand-mark-node-[1-5]-(from|to)$/);
      expect(stop.getAttribute('stop-color')).toBeNull();
    }
  });

  it('is decorative — hidden from assistive tech and out of the tab order', () => {
    const { container } = mount(<BrandMark spin="none" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('renders square at the requested size, always over the same 240 viewBox', () => {
    const { container } = mount(<BrandMark size={64} spin="none" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe('64');
    expect(svg.getAttribute('viewBox')).toBe('0 0 240 240');
  });

  it('animates nothing declaratively — the rotation is geometry, not a keyframe', () => {
    // If a CSS `rotate()` ever crept in it would spin the drawing like a flat
    // card, which is exactly the thing the 3D port exists to avoid.
    const { container } = mount(<BrandMark />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('animate, animateTransform, animateMotion, set, style')).toBeNull();
    expect(svg.innerHTML).not.toMatch(/animation|@keyframes|rotate\(/);
  });

  it('renders the shipped static pose on its very first frame, before any effect runs', () => {
    // Server-of-truth check: the first paint is the V1.1 mark, so a reduced
    // motion user never sees a different drawing appear and then stop.
    const { container } = mount(<BrandMark spin="none" />);
    const expected = markFrame(MARK_STATIC_ANGLE).nodes.map((n) => `${n.cx},${n.cy},${n.r}`);
    expect(pose(container)).toEqual(expected);
  });
});

describe('BrandMark — reduced motion', () => {
  it('schedules no animation frame at all: the loop is absent, not invisible', () => {
    const env = stubEnvironment({ reduce: true });
    const { container } = mount(<BrandMark spin="continuous" />);
    expect(env.frameCount).toBe(0);
    // And what is on screen is exactly the mark V1.1 shipped.
    expect(pose(container)).toEqual(
      markFrame(MARK_STATIC_ANGLE).nodes.map((n) => `${n.cx},${n.cy},${n.r}`),
    );
  });

  it('schedules no frame for spin="once" either', () => {
    const env = stubEnvironment({ reduce: true });
    mount(<BrandMark spin="once" spinCue="About Me" />);
    expect(env.frameCount).toBe(0);
  });

  it('stops the loop the moment the preference is turned on, and lands on the still pose', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = mount(<BrandMark spin="continuous" />);
    env.tick();
    env.tick();
    expect(env.frameCount).toBeGreaterThan(1);
    const running = env.frameCount;

    env.setReduce(true);
    expect(env.cancelledCount).toBeGreaterThan(0);
    expect(pose(container)).toEqual(
      markFrame(MARK_STATIC_ANGLE).nodes.map((n) => `${n.cx},${n.cy},${n.r}`),
    );
    // Nothing further is queued once it has stopped.
    expect(env.frameCount).toBe(running);
  });

  it('treats a missing matchMedia as "reduce" rather than guessing', () => {
    const scheduled = vi.fn();
    vi.stubGlobal('requestAnimationFrame', scheduled);
    vi.stubGlobal('matchMedia', undefined);
    mount(<BrandMark spin="continuous" />);
    expect(scheduled).not.toHaveBeenCalled();
  });
});

describe('BrandMark — continuous', () => {
  it('keeps asking for frames and keeps moving the geometry', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = mount(<BrandMark spin="continuous" />);
    const first = pose(container);
    expect(env.frameCount).toBe(1);

    // A quarter of a revolution's worth of clock, in one frame.
    env.tick(2250);
    expect(pose(container)).not.toEqual(first);
    expect(env.frameCount).toBe(2);

    env.tick(2250);
    expect(env.frameCount).toBe(3);
    // Still twelve nodes and thirty edges, mid-turn.
    expect(container.querySelectorAll('circle')).toHaveLength(12);
    expect(container.querySelectorAll('line')).toHaveLength(30);
  });

  it('stops asking for frames when it unmounts', () => {
    const env = stubEnvironment({ reduce: false });
    const { unmount } = mount(<BrandMark spin="continuous" />);
    env.tick();
    const before = env.frameCount;
    unmount();
    expect(env.cancelledCount).toBeGreaterThan(0);
    expect(env.frameCount).toBe(before);
  });

  it('spin="none" never schedules anything, whatever the preference', () => {
    const env = stubEnvironment({ reduce: false });
    mount(<BrandMark spin="none" />);
    expect(env.frameCount).toBe(0);
  });
});

describe('BrandMark — spin once, the status-bar alternative', () => {
  it('turns on the first cue and settles back onto the still pose', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = mount(<BrandMark spin="once" spinCue="Orientation" />);
    const still = markFrame(MARK_STATIC_ANGLE).nodes.map((n) => `${n.cx},${n.cy},${n.r}`);

    env.tick(SPIN_ONCE_MS / 2);
    expect(pose(container)).not.toEqual(still);

    // Past the end of the turn it lands exactly on the pose we ship still,
    // and asks for nothing more.
    env.tick(SPIN_ONCE_MS);
    expect(pose(container)).toEqual(still);

    // And it has genuinely stopped: running the loop again queues nothing.
    const settled = env.frameCount;
    env.tick(16);
    expect(env.frameCount).toBe(settled);
  });

  it('does not turn again when the same module remounts — that is the whole point', () => {
    const env = stubEnvironment({ reduce: false });
    const first = mount(<BrandMark spin="once" spinCue="Orientation" />);
    env.tick(SPIN_ONCE_MS / 2);
    env.tick(SPIN_ONCE_MS);
    first.unmount();

    // `Flow` remounts its step view on every question inside the module.
    env.advance(5000);
    const before = env.frameCount;
    mount(<BrandMark spin="once" spinCue="Orientation" />);
    expect(env.frameCount).toBe(before);
  });

  it('turns again when the module actually changes', () => {
    const env = stubEnvironment({ reduce: false });
    const first = mount(<BrandMark spin="once" spinCue="Orientation" />);
    env.tick(SPIN_ONCE_MS / 2);
    env.tick(SPIN_ONCE_MS);
    first.unmount();

    env.advance(5000);
    const before = env.frameCount;
    mount(<BrandMark spin="once" spinCue="About Me" />);
    expect(env.frameCount).toBeGreaterThan(before);
  });

  it('continues an interrupted turn rather than restarting it', () => {
    const env = stubEnvironment({ reduce: false });
    const first = mount(<BrandMark spin="once" spinCue="About Me" />);
    env.tick(SPIN_ONCE_MS / 2);
    const midTurn = pose(first.container);
    first.unmount();

    // Remounted at the same instant, it picks the turn up where it was.
    const second = mount(<BrandMark spin="once" spinCue="About Me" />);
    env.tick(0);
    expect(pose(second.container)).toEqual(midTurn);
  });
});

describe('BrandMark — the entrance', () => {
  it('is on by default and off on request', () => {
    const on = mount(<BrandMark spin="none" />);
    expect(on.container.querySelector('svg')!.getAttribute('data-entrance')).toBe('on');
    const off = mount(<BrandMark spin="none" entrance={false} />);
    expect(off.container.querySelector('svg')!.getAttribute('data-entrance')).toBe('off');
  });

  it('keeps its own class alongside any the caller adds', () => {
    const { container } = mount(<BrandMark spin="none" className="flowprogress-mark" />);
    expect(container.querySelector('svg')!.getAttribute('class')).toBe(
      'brand-mark flowprogress-mark',
    );
  });
});
