import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { BrainGlobe } from './BrainGlobe';
import { contextOutline } from '../../core/flow/flow';
import { S } from '../strings';
import { mount } from './testUtils';
import type { FileOutlineNode } from '../../schema/flow.types';
import type { OutlineNodeState } from '../../core/flow/outline';

/**
 * V1.2 VB-14a.
 *
 * `icosahedron.test.ts` owns the maths. This file owns what the component does
 * with it, and jsdom gives no layout, so anything about pixels, dragging or
 * frame cost is proven in tests/e2e/brain-globe.spec.ts instead.
 *
 * Three things here cannot be seen in a diff and are worth a test each:
 * that the drawing really is the solid (twelve lit nodes, thirty edges, back
 * to front), that no state is carried by colour alone, and that a
 * reduced-motion visitor gets the same information with no frame loop
 * scheduled at all — not a still frame of something they cannot use.
 */

/** jsdom ships neither a useful `matchMedia` nor a real `requestAnimationFrame`,
 * and both branches of this component turn on them. Installed per test so each
 * one states the environment it is asserting about. */
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
  const requested: number[] = [];
  let nextHandle = 1;
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
      delete scheduled[handle];
    }),
  );

  let clock = 1000;
  vi.stubGlobal('performance', { now: () => clock });

  return {
    /** How many frames have ever been asked for. Zero is the reduced-motion bar. */
    get frameCount() {
      return requested.length;
    },
    /** Run whatever the last request scheduled, as the browser would. */
    tick(ms = 16) {
      clock += ms;
      const handle = requested[requested.length - 1]!;
      const cb = scheduled[handle];
      if (cb) act(() => cb(clock));
    },
    /** Run frames until nothing more is scheduled, or the budget runs out. */
    settle(steps = 200, ms = 16) {
      for (let i = 0; i < steps; i++) {
        const before = requested.length;
        this.tick(ms);
        if (requested.length === before) return;
      }
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const STATES: Record<string, OutlineNodeState> = {
  sec1: 'reached',
  sec2: 'reached',
  sec3: 'current',
  sec4: 'untouched',
  sec5: 'untouched',
  sec6: 'untouched',
  sec7: 'untouched',
  sec8: 'untouched',
  sec9: 'untouched',
  sec10: 'untouched',
};

const render = (props: Partial<Parameters<typeof BrainGlobe>[0]> = {}) =>
  mount(<BrainGlobe sections={contextOutline} states={STATES} {...props} />);

const pins = (container: Element) => [...container.querySelectorAll<HTMLButtonElement>('.brainglobe-pin')];
const sectionPins = (container: Element) =>
  [...container.querySelectorAll<HTMLButtonElement>('.brainglobe-pin[data-section-id]')];
/** The control for a section. Scoped to `.brainglobe-pin` on purpose: the SVG
 * `<g>` for the same node carries the same `data-section-id`, and it is not a
 * button. */
const pin = (container: Element, id: string) =>
  container.querySelector<HTMLButtonElement>(`.brainglobe-pin[data-section-id="${id}"]`)!;

describe('BrainGlobe — the drawing', () => {
  it('draws the whole solid: twelve nodes and thirty edges', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    expect(container.querySelectorAll('.brainglobe-node')).toHaveLength(12);
    expect(container.querySelectorAll('[data-edge]')).toHaveLength(30);
  });

  it('every edge joins two real vertices, and every vertex carries five', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const degrees = new Map<string, number>();
    for (const node of container.querySelectorAll('.brainglobe-node')) {
      degrees.set(node.getAttribute('data-node-index')!, 0);
    }
    expect(degrees.size).toBe(12);
    for (const edge of container.querySelectorAll('[data-edge]')) {
      const [a, b] = edge.getAttribute('data-edge')!.split('-');
      expect(degrees.has(a!)).toBe(true);
      expect(degrees.has(b!)).toBe(true);
      degrees.set(a!, degrees.get(a!)! + 1);
      degrees.set(b!, degrees.get(b!)! + 1);
    }
    for (const [vertex, degree] of degrees) expect(degree, `vertex ${vertex} has ${degree} edges`).toBe(5);
  });

  it('paints back to front — the painter’s algorithm, in the DOM', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const depths = [...container.querySelectorAll('.brainglobe-node')].map((n) => Number(n.getAttribute('data-depth')));
    expect(depths).toEqual([...depths].sort((a, b) => a - b));
    // A globe with every node at the same depth is a flat drawing.
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.5);
  });

  it('nodes are lit spheres, not flat discs — a three-stop radial with an offset highlight, plus a bloom', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();

    const gradients = [...container.querySelectorAll('radialGradient')];
    // Five sphere gradients, five blooms, one field.
    expect(gradients).toHaveLength(11);

    const sphereGradients = gradients.filter((g) => g.getAttribute('cx') === '34%');
    expect(sphereGradients).toHaveLength(5);
    for (const gradient of sphereGradients) {
      expect(gradient.getAttribute('cy')).toBe('30%');
      const stops = [...gradient.querySelectorAll('stop')];
      expect(stops).toHaveLength(3);
      expect(stops[0]!.getAttribute('class')).toBe('brainglobe-stop-hi');
      expect(stops[1]!.getAttribute('class')).toMatch(/^brainglobe-stop-mid-[1-5]$/);
      expect(stops[2]!.getAttribute('class')).toMatch(/^brainglobe-stop-deep-[1-5]$/);
    }

    // The bloom is a separate, larger circle behind the sphere.
    const lit = container.querySelector('.brainglobe-node[data-node-state="reached"]')!;
    const bloom = lit.querySelector('.brainglobe-bloom')!;
    const sphere = lit.querySelector('.brainglobe-sphere')!;
    expect(Number(bloom.getAttribute('r'))).toBeGreaterThan(Number(sphere.getAttribute('r')) * 2);
    expect([...lit.children].indexOf(bloom)).toBeLessThan([...lit.children].indexOf(sphere));
  });

  it('every fill points at a gradient that is actually defined', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const defined = new Set([...container.querySelectorAll('radialGradient')].map((g) => g.getAttribute('id')));
    for (const el of container.querySelectorAll('[fill^="url("]')) {
      const ref = /^url\(#(.+)\)$/.exec(el.getAttribute('fill')!)?.[1];
      expect(defined.has(ref ?? ''), `fill "${el.getAttribute('fill')}" resolves to nothing`).toBe(true);
    }
  });

  it('carries no colour of its own — every colour comes from a token class', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const stop of container.querySelectorAll('stop')) {
      expect(stop.getAttribute('class')).toMatch(/^brainglobe-stop-/);
      expect(stop.getAttribute('stop-color')).toBeNull();
    }
  });

  it('cues depth on radius, opacity and edge weight together', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const nodes = [...container.querySelectorAll('.brainglobe-node')];
    const back = nodes[0]!;
    const front = nodes[nodes.length - 1]!;

    const radius = (node: Element) => Number(node.querySelector('circle:not(.brainglobe-bloom)')!.getAttribute('r'));
    expect(radius(front)).toBeGreaterThan(radius(back));
    expect(Number(front.getAttribute('opacity'))).toBeGreaterThan(Number(back.getAttribute('opacity')));

    const widths = [...container.querySelectorAll('.brainglobe-edge-near')].map((l) => Number(l.getAttribute('stroke-width')));
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths) * 1.5);
  });

  it('the picture itself is hidden from assistive tech — the overlay carries the words', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelector('button')).toBeNull();
  });
});

describe('BrainGlobe — ten sections on twelve vertices', () => {
  it('labels ten of the twelve and leaves two structural', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    expect(sectionPins(container)).toHaveLength(10);
    expect(container.querySelectorAll('.brainglobe-node[data-node-state="structural"]')).toHaveLength(2);
    // Every section in the outline is on the globe, none invented.
    const ids = new Set(sectionPins(container).map((pin) => pin.getAttribute('data-section-id')));
    expect(ids).toEqual(new Set(contextOutline.map((node) => node.id)));
  });

  it('a structural node has no control and no name — it is holding the shape up', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    for (const node of container.querySelectorAll('.brainglobe-node[data-node-state="structural"]')) {
      expect(node.getAttribute('data-section-id')).toBe('');
      expect(node.querySelector('button')).toBeNull();
    }
  });

  it('degrades rather than throws when handed more sections than the solid has room for', () => {
    stubEnvironment({ reduce: false });
    const extra: FileOutlineNode[] = [
      ...contextOutline,
      { id: 'sec11', label: '11. One Too Many', questionIds: ['x'] },
      { id: 'sec12', label: '12. Two Too Many', questionIds: ['y'] },
    ];
    const { container } = render({ sections: extra });
    expect(sectionPins(container)).toHaveLength(10);
    expect(container.querySelector('[data-section-id="sec11"]')).toBeNull();
  });
});

describe('BrainGlobe — state is never colour alone', () => {
  it('says its state out loud on every node', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const nameOf = (id: string) => pin(container, id).getAttribute('aria-label');
    expect(nameOf('sec1')).toBe(S.brainGlobeNode('1. About This Context', S.fileTreeStateReached));
    expect(nameOf('sec3')).toBe(S.brainGlobeNode('3. My World', S.fileTreeStateCurrent));
    expect(nameOf('sec4')).toBe(S.brainGlobeNode('4. Initiatives', S.fileTreeStateUntouched));
    // The visible label is inside the name, so speaking it works (WCAG 2.5.3).
    for (const pin of sectionPins(container)) {
      expect(pin.getAttribute('aria-label')).toContain(pin.querySelector('.brainglobe-label')!.textContent);
    }
  });

  it('draws an untouched section as a different shape, not a dimmer colour', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const untouched = container.querySelector('.brainglobe-node[data-node-state="untouched"]')!;
    expect(untouched.querySelector('.brainglobe-hollow-ring')).not.toBeNull();
    expect(untouched.querySelector('.brainglobe-sphere')).toBeNull();
    expect(untouched.querySelector('.brainglobe-bloom')).toBeNull();

    const reached = container.querySelector('.brainglobe-node[data-node-state="reached"]')!;
    expect(reached.querySelector('.brainglobe-sphere')).not.toBeNull();
    expect(reached.querySelector('.brainglobe-hollow-ring')).toBeNull();
  });

  it('gives the section being written now a halo, and only that one', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const halos = [...container.querySelectorAll('.brainglobe-halo')];
    expect(halos).toHaveLength(1);
    expect(halos[0]!.closest('.brainglobe-node')!.getAttribute('data-section-id')).toBe('sec3');
  });

  it('with no states at all, every section still draws — the showcase case', () => {
    stubEnvironment({ reduce: false });
    // Mounted directly rather than through `render`: `exactOptionalPropertyTypes`
    // is on, so "no states prop" and "a states prop holding undefined" are two
    // different things and this test is about the first one.
    const { container } = mount(<BrainGlobe sections={contextOutline} />);
    expect(container.querySelectorAll('.brainglobe-node[data-node-state="reached"]')).toHaveLength(10);
    expect(container.querySelectorAll('.brainglobe-hollow-ring')).toHaveLength(0);
  });
});

describe('BrainGlobe — labels key off depth', () => {
  it('a near label is bigger, heavier and brighter than a far one', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const read = (pin: HTMLElement) => ({
      depth: Number(pin.getAttribute('data-depth')),
      size: Number.parseFloat(pin.style.getPropertyValue('--brainglobe-label-size')),
      weight: Number(pin.style.getPropertyValue('--brainglobe-label-weight')),
      opacity: Number(pin.style.getPropertyValue('--brainglobe-label-opacity')),
      hidden: pin.getAttribute('data-label-hidden') === 'true',
    });
    const shown = sectionPins(container).map(read).filter((v) => !v.hidden);
    expect(shown.length).toBeGreaterThan(1);
    const sorted = [...shown].sort((a, b) => a.depth - b.depth);
    const near = sorted[sorted.length - 1]!;
    const far = sorted[0]!;
    expect(near.size).toBeGreaterThan(far.size);
    expect(near.weight).toBeGreaterThanOrEqual(far.weight);
    expect(near.opacity).toBeGreaterThan(far.opacity);
    // Dimmer with distance must never mean unreadable: the floor measures
    // 8.8:1 against the field (design/tokens.json, color.globe.label).
    for (const value of shown) expect(value.opacity).toBeGreaterThanOrEqual(0.62);
  });

  it('a label behind the globe is not shown at all, rather than shown too faintly', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const behind = sectionPins(container).filter((pin) => Number(pin.getAttribute('data-depth')) < 0.5);
    expect(behind.length).toBeGreaterThan(0);
    for (const pin of behind) {
      expect(pin.getAttribute('data-label-hidden')).toBe('true');
      expect(pin.style.getPropertyValue('--brainglobe-label-opacity')).toBe('0');
      // Hidden text, not a control removed: it is still reachable and named.
      expect(pin.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('BrainGlobe — keyboard', () => {
  it('is one tab stop, with a roving position across the ten sections', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const tabbable = sectionPins(container).filter((pin) => pin.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]!.getAttribute('data-section-id')).toBe('sec1');
  });

  it('arrow keys step between sections and turn the globe to face the one you land on', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    const stage = container.querySelector('.brainglobe')!;
    const depthOf = (id: string) => Number(pin(container, id).getAttribute('data-depth'));

    const before = depthOf('sec2');
    act(() => {
      stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    env.settle();

    expect(depthOf('sec2')).toBeGreaterThan(before);
    // Faced means faced: dead front, which is depth 1.
    expect(depthOf('sec2')).toBeCloseTo(1, 3);
    expect(pin(container, 'sec2').getAttribute('tabindex')).toBe('0');
  });

  it('Home and End reach the first and last section without a pointer', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    const stage = container.querySelector('.brainglobe')!;

    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    env.settle();
    expect(pin(container, 'sec10').getAttribute('tabindex')).toBe('0');

    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })));
    env.settle();
    expect(pin(container, 'sec1').getAttribute('tabindex')).toBe('0');
  });

  it('every node is reachable by arrowing round, and every one of them can be opened', () => {
    const env = stubEnvironment({ reduce: false });
    const chosen: Array<string | null> = [];
    const { container } = render({ onSelect: (node) => chosen.push(node?.id ?? null) });
    const stage = container.querySelector('.brainglobe')!;

    for (let i = 0; i < contextOutline.length; i++) {
      const active = sectionPins(container).find((pin) => pin.tabIndex === 0)!;
      act(() => active.click());
      env.settle();
      act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      env.settle();
      act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
      env.settle();
    }

    expect(new Set(chosen.filter(Boolean))).toEqual(new Set(contextOutline.map((n) => n.id)));
  });
});

describe('BrainGlobe — flying in', () => {
  it('reports the section, then reports null on the way back out', () => {
    const env = stubEnvironment({ reduce: false });
    const chosen: Array<string | null> = [];
    const { container } = render({ onSelect: (node) => chosen.push(node?.id ?? null) });

    act(() => pin(container, 'sec2').click());
    env.settle();
    expect(chosen).toEqual(['sec2']);
    expect(pin(container, 'sec2').getAttribute('aria-pressed')).toBe('true');

    act(() => pin(container, 'sec2').click());
    env.settle();
    expect(chosen).toEqual(['sec2', null]);
  });

  it('brings out the real children, staggered, and only for a section that has any', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();

    act(() => pin(container, 'sec2').click());
    env.settle();

    const childIds = [...container.querySelectorAll('.brainglobe-child-node')].map((el) => el.getAttribute('data-child-id'));
    // The real outline: About Me is the only section with children, and it has five.
    expect(childIds).toEqual(contextOutline[1]!.children!.map((child) => child.id));
    expect(childIds).toHaveLength(5);
  });

  it('a section with no children of its own brings out none', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    act(() => pin(container, 'sec1').click());
    env.settle();
    expect(container.querySelectorAll('.brainglobe-child-node')).toHaveLength(0);
  });

  it('children arrive one after another, not all at once', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    act(() => pin(container, 'sec2').click());

    // Part-way through the 620ms fly-in, the first child is further along
    // than the last — that is the stagger, and its absence was the "popping"
    // the 320ms version was rejected for.
    let sampled = false;
    for (let i = 0; i < 40 && !sampled; i++) {
      env.tick(16);
      const arrived = [...container.querySelectorAll('.brainglobe-child-node')].map((el) => Number(el.getAttribute('opacity')));
      if (arrived.length >= 2 && arrived[0]! < 1) {
        expect(arrived[0]!).toBeGreaterThan(arrived[arrived.length - 1]!);
        sampled = true;
      }
    }
    expect(sampled, 'the fly-in never showed two children at different stages').toBe(true);

    env.settle();
    const finished = [...container.querySelectorAll('.brainglobe-child-node')].map((el) => Number(el.getAttribute('opacity')));
    expect(finished).toHaveLength(5);
    // Every one of them arrives fully — including the fifth, which the raw
    // formula only reaches because the clock is allowed to run to 1.09.
    for (const opacity of finished) expect(opacity).toBeCloseTo(1, 5);
  });

  it('picking a child reports the child, not the section again', () => {
    const env = stubEnvironment({ reduce: false });
    const chosen: Array<string | null> = [];
    const { container } = render({ onSelect: (node) => chosen.push(node?.id ?? null) });

    act(() => pin(container, 'sec2').click());
    env.settle();
    act(() => container.querySelector<HTMLButtonElement>('.brainglobe-pin[data-child-id="sec2-3"]')!.click());
    expect(chosen).toEqual(['sec2', 'sec2-3']);
  });

  it('Escape comes back out', () => {
    const env = stubEnvironment({ reduce: false });
    const chosen: Array<string | null> = [];
    const { container } = render({ onSelect: (node) => chosen.push(node?.id ?? null) });
    const stage = container.querySelector('.brainglobe')!;

    act(() => pin(container, 'sec5').click());
    env.settle();
    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    env.settle();

    expect(chosen).toEqual(['sec5', null]);
    expect(container.querySelector('.brainglobe')!.getAttribute('data-inside')).toBe('false');
  });

  it('leaves the sections you flew away from out of the tab order entirely', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    act(() => pin(container, 'sec2').click());
    env.settle();

    const stillThere = sectionPins(container).filter((pin) => !pin.hidden);
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]!.getAttribute('data-section-id')).toBe('sec2');
    // And a real way back that is not only a keystroke.
    expect(container.querySelector('.brainglobe-back')).not.toBeNull();
  });
});

describe('BrainGlobe — labels hide while it moves', () => {
  it('marks itself moving while it turns and stops being moving once it settles', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    const stage = container.querySelector('.brainglobe')!;

    expect(stage.getAttribute('data-moving')).toBe('false');
    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(stage.getAttribute('data-moving')).toBe('true');
    env.settle();
    expect(stage.getAttribute('data-moving')).toBe('false');
  });
});

describe('BrainGlobe — reduced motion', () => {
  it('never schedules a frame — not one, for any interaction', () => {
    const env = stubEnvironment({ reduce: true });
    const { container } = render();
    const stage = container.querySelector('.brainglobe')!;

    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    act(() => pin(container, 'sec2').click());
    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    expect(env.frameCount, 'a reduced-motion visitor must get no rAF loop at all').toBe(0);
  });

  it('changes state instantly instead of moving — the fly-in is simply already there', () => {
    stubEnvironment({ reduce: true });
    const { container } = render();
    act(() => pin(container, 'sec2').click());

    expect(container.querySelector('.brainglobe')!.getAttribute('data-inside')).toBe('true');
    const arrived = [...container.querySelectorAll('.brainglobe-child-node')].map((el) => Number(el.getAttribute('opacity')));
    expect(arrived).toHaveLength(5);
    for (const opacity of arrived) expect(opacity).toBeCloseTo(1, 5);
  });

  it('shows every label at once, because there is no settle to wait for', () => {
    stubEnvironment({ reduce: true });
    const { container } = render();
    expect(container.querySelector('.brainglobe')!.getAttribute('data-reduced')).toBe('true');
    for (const pin of sectionPins(container)) {
      expect(pin.getAttribute('data-label-hidden')).toBe('false');
      expect(Number(pin.style.getPropertyValue('--brainglobe-label-opacity'))).toBeGreaterThanOrEqual(0.62);
    }
  });

  it('still turns to face a node from the keyboard — instantly, and with the same result', () => {
    stubEnvironment({ reduce: true });
    const { container } = render();
    const stage = container.querySelector('.brainglobe')!;
    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    expect(Number(pin(container, 'sec2').getAttribute('data-depth'))).toBeCloseTo(1, 3);
    expect(stage.getAttribute('data-moving')).toBe('false');
  });

  it('carries the same information as the moving version — every node, every state, every name', () => {
    stubEnvironment({ reduce: true });
    const { container } = render();
    expect(container.querySelectorAll('.brainglobe-node')).toHaveLength(12);
    expect(pins(container).filter((pin) => pin.hasAttribute('data-section-id'))).toHaveLength(10);
    expect(container.querySelectorAll('.brainglobe-halo')).toHaveLength(1);
    for (const pin of sectionPins(container)) expect(pin.getAttribute('aria-label')).toMatch(/ — .+$/);
  });
});
