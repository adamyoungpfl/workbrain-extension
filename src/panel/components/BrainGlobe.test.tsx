import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { BrainGlobe } from './BrainGlobe';
import { contextOutline } from '../../core/flow/flow';
import { nodeDetailsByNode } from '../../core/flow/nodeDetails';
import { nodeSummaries } from '../../core/flow/nodeSummary';
import { S } from '../strings';
import { mount } from './testUtils';
import type { FileOutlineNode } from '../../schema/flow.types';
import type { OutlineNodeState } from '../../core/flow/outline';
import type { SectionHealth } from '../../core/freshness/sectionHealth';
import type { Recommendation } from '../../core/recommend/types';

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

  it('V1.4 VB-23 — an answered node is a solid orb: one flat fill, no gradient bound to a sphere', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();

    /**
     * V1.9 VB-54 CHANGED THE COUNT HERE ON PURPOSE, AND V2.0 VB-69 CHANGED IT
     * BACK BY ONE.
     *
     * The field and five blooms were six; the light adds five limbs, five
     * terminators and one specular, for seventeen. VB-69 then removed the
     * field's own radial — the one gradient here that belonged to the STAGE
     * rather than to a sphere, and the one a person could see as a lighter
     * rectangle inside the drawer — leaving sixteen, every one of them an orb's.
     *
     * Neither change is the thing VB-23 deleted coming back. What VB-23
     * deleted was a gradient bound to an ORB —
     * `cx="34%"`, a highlight fixed in each orb's own local box, so every orb
     * wore the identical one wherever it stood and twelve spheres read as
     * twelve stickers.
     *
     * Everything added since is CENTRED (`cx="50%"`) and SHARED. What varies
     * per orb is where the circle carrying it is placed, which core computes
     * from that orb's own position under one fixed light. So the assertion that
     * matters is not a count — it is that no gradient in the picture is
     * off-centre, and that the sphere itself still takes a flat token fill.
     */
    const gradients = [...container.querySelectorAll('radialGradient')];
    expect(gradients).toHaveLength(16);
    for (const gradient of gradients) {
      expect(gradient.getAttribute('cx'), 'a gradient is anchored inside one orb’s own box').toBe('50%');
    }
    expect(container.querySelector('.brainglobe-stop-hi')).toBeNull();

    for (const sphere of container.querySelectorAll('.brainglobe-sphere')) {
      // A class the stylesheet fills from a token, not a `url(#…)` and not a
      // colour of its own. V1.5 VB-24: every node wears one of these — the lit
      // five, or the same five turned down.
      expect(sphere.getAttribute('class')).toMatch(/brainglobe-(solid|muted)-[1-5]/);
      expect(sphere.getAttribute('fill')).toBeNull();
    }

    // The bloom is still a separate, larger circle behind the orb — it is what
    // makes a flat fill read as something emitting rather than printed.
    const lit = container.querySelector('.brainglobe-node[data-node-state="reached"]')!;
    const bloom = lit.querySelector('.brainglobe-bloom')!;
    const sphere = lit.querySelector('.brainglobe-sphere')!;
    expect(Number(bloom.getAttribute('r'))).toBeGreaterThan(Number(sphere.getAttribute('r')) * 2);
    expect(lit.querySelector('.brainglobe-orb')).not.toBeNull();
    expect([...lit.children].indexOf(bloom)).toBeLessThan([...lit.children].indexOf(lit.querySelector('.brainglobe-orb')!));
  });

  it('V1.4 VB-23 — solid does not mean flat: a far orb is shaded toward its own deep colour', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const lit = [...container.querySelectorAll('.brainglobe-node')].filter(
      (node) => node.getAttribute('data-node-state') !== 'untouched',
    );
    expect(lit.length).toBeGreaterThan(2);

    const read = (node: Element) => ({
      depth: Number(node.getAttribute('data-depth')),
      shade: Number(node.querySelector('.brainglobe-shade')!.getAttribute('opacity')),
      radius: Number(node.querySelector('.brainglobe-sphere')!.getAttribute('r')),
      opacity: Number(node.getAttribute('opacity')),
    });
    const sorted = lit.map(read).sort((a, b) => a.depth - b.depth);
    const back = sorted[0]!;
    const front = sorted[sorted.length - 1]!;

    // All three depth cues survive the change to a solid fill.
    expect(back.shade).toBeGreaterThan(front.shade);
    expect(front.radius).toBeGreaterThan(back.radius);
    expect(front.opacity).toBeGreaterThan(back.opacity);
    // The shade is a veil over the orb, never a replacement for it.
    for (const node of lit) {
      const shade = node.querySelector('.brainglobe-shade')!;
      const sphere = node.querySelector('.brainglobe-sphere')!;
      expect(shade.getAttribute('r')).toBe(sphere.getAttribute('r'));
      expect(Number(shade.getAttribute('opacity'))).toBeLessThan(0.55);
    }
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
    // V1.5 VB-26: the name is the short one, because it is the one printed on
    // the node. The section's real name is on the same button's `title`.
    expect(nameOf('sec1')).toBe(S.brainGlobeNode('Context', S.fileTreeStateReached));
    expect(nameOf('sec3')).toBe(S.brainGlobeNode('My World', S.fileTreeStateCurrent));
    expect(nameOf('sec4')).toBe(S.brainGlobeNode('Initiatives', S.fileTreeStateUntouched));
    expect(pin(container, 'sec1').getAttribute('title')).toBe('1. About This Context');
    // The visible label is inside the name, so speaking it works (WCAG 2.5.3).
    for (const pin of sectionPins(container)) {
      expect(pin.getAttribute('aria-label')).toContain(pin.querySelector('.brainglobe-label')!.textContent);
    }
  });

  it('V1.5 VB-24 — an untouched section is the same orb turned down, never a hollow ring', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    expect(container.querySelectorAll('.brainglobe-hollow-ring')).toHaveLength(0);
    expect(container.querySelectorAll('.brainglobe-hollow-dot')).toHaveLength(0);

    const untouched = container.querySelector('.brainglobe-node[data-node-state="untouched"]')!;
    const muted = untouched.querySelector('.brainglobe-sphere')!;
    // A real orb, in the muted half of the palette...
    expect(muted.getAttribute('class')).toMatch(/brainglobe-muted-[1-5]/);
    expect(untouched.querySelector('.brainglobe-orb')!.getAttribute('data-lit')).toBe('muted');
    // ...and the difference is never brightness alone: no bloom behind it, a
    // smaller radius, and the state word in its own accessible name.
    expect(untouched.querySelector('.brainglobe-bloom')).toBeNull();

    const reached = container.querySelector('.brainglobe-node[data-node-state="reached"]')!;
    expect(reached.querySelector('.brainglobe-sphere')!.getAttribute('class')).toMatch(/brainglobe-solid-[1-5]/);
    expect(reached.querySelector('.brainglobe-bloom')).not.toBeNull();
    expect(reached.querySelector('.brainglobe-orb')!.getAttribute('data-lit')).toBe('lit');
  });

  it('V1.5 VB-24 — a muted orb sinks less far at the back, so it stays an object', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const shadeOf = (state: string) =>
      [...container.querySelectorAll(`.brainglobe-node[data-node-state="${state}"]`)]
        .map((node) => ({
          depth: Number(node.getAttribute('data-depth')),
          shade: Number(node.querySelector('.brainglobe-shade')!.getAttribute('opacity')),
        }))
        .sort((a, b) => a.depth - b.depth);

    const muted = shadeOf('untouched');
    const lit = shadeOf('reached');
    // Depth still moves the shade, in both treatments...
    expect(muted[0]!.shade).toBeGreaterThan(muted[muted.length - 1]!.shade);
    // ...but the muted one is veiled less, at comparable depth, because it has
    // no bloom holding its place.
    const deepestMuted = muted[0]!;
    const litAtSimilarDepth = lit.reduce((best, item) =>
      Math.abs(item.depth - deepestMuted.depth) < Math.abs(best.depth - deepestMuted.depth) ? item : best,
    );
    expect(deepestMuted.shade).toBeLessThan(litAtSimilarDepth.shade);
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

// ── V1.5 VB-25 — edges that brighten, and the unified state ────────────────
//
// The rule itself is core/globe/illumination.ts's and is proven there at every
// combination of endpoint states. What is proven here is that this component
// applies it — to every one of the thirty edges, from both ends.

const edges = (container: Element) =>
  [...container.querySelectorAll('[data-edge]')].map((edge) => ({
    light: edge.getAttribute('data-edge-light'),
    lit: Number(edge.querySelector('.brainglobe-edge-near')!.getAttribute('stroke-opacity')),
    depth:
      (Number(container.querySelector(`.brainglobe-node[data-node-index="${edge.getAttribute('data-edge')!.split('-')[0]}"]`)!.getAttribute('data-depth')) +
        Number(container.querySelector(`.brainglobe-node[data-node-index="${edge.getAttribute('data-edge')!.split('-')[1]}"]`)!.getAttribute('data-depth'))) /
      2,
  }));

/** A health record in the given state. The numbers are the ones
 * `isUnifiedGlow` reads; `sectionHealth.test.ts` owns how they are derived. */
function health(state: 'done' | 'due' | 'partly', id: string): SectionHealth {
  return {
    id,
    state,
    total: 4,
    answered: state === 'partly' ? 2 : 4,
    skipped: 0,
    left: state === 'partly' ? 2 : 0,
    due: state === 'due' ? 1 : 0,
    lastAnsweredAt: '2026-08-01T00:00:00.000Z',
    ageDays: 22,
    elapsed: { value: 22, unit: 'day' as const },
    halfLifeDays: 365,
  };
}

const healthMap = (state: 'done' | 'due' | 'partly', except?: { id: string; state: 'done' | 'due' | 'partly' }) =>
  Object.fromEntries(
    contextOutline.map((node) => [node.id, health(node.id === except?.id ? except.state : state, node.id)]),
  );

const ALL_REACHED: Record<string, OutlineNodeState> = Object.fromEntries(
  contextOutline.map((node) => [node.id, 'reached' as OutlineNodeState]),
);

describe('BrainGlobe — VB-25, illumination spreads along the structure', () => {
  it('gives every edge a brightness read from both of its ends', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const drawn = edges(container);
    expect(drawn).toHaveLength(30);
    for (const edge of drawn) expect(['bright', 'mid', 'dim']).toContain(edge.light);
    // The default fixture is part-answered, so all three are on screen at once.
    expect(new Set(drawn.map((edge) => edge.light))).toEqual(new Set(['bright', 'mid', 'dim']));
  });

  it('a brighter edge is really brighter, at comparable depth', () => {
    stubEnvironment({ reduce: false });
    const { container } = render();
    const near = edges(container).filter((edge) => edge.depth > 0.55);
    const brightest = (light: string) => Math.max(...near.filter((e) => e.light === light).map((e) => e.lit));
    expect(brightest('bright')).toBeGreaterThan(brightest('mid'));
    expect(brightest('mid')).toBeGreaterThan(brightest('dim'));
    // Dim is turned down, never off — the model is a real object from question
    // one and its branches do not appear as they are earned.
    expect(brightest('dim')).toBeGreaterThan(0);
  });

  it('an empty file draws every edge dim, and a full one draws every edge bright', () => {
    stubEnvironment({ reduce: false });
    const untouched: Record<string, OutlineNodeState> = Object.fromEntries(
      contextOutline.map((node) => [node.id, 'untouched' as OutlineNodeState]),
    );
    const empty = render({ states: untouched });
    expect(new Set(edges(empty.container).map((e) => e.light))).toEqual(new Set(['dim']));

    const full = render({ states: ALL_REACHED });
    expect(new Set(edges(full.container).map((e) => e.light))).toEqual(new Set(['bright']));
  });
});

describe('BrainGlobe — VB-25, the unified state', () => {
  it('resolves to one glow only when every section is answered, complete and fresh', () => {
    stubEnvironment({ reduce: false });
    const { container } = render({ states: ALL_REACHED, health: healthMap('done') });
    expect(container.querySelector('.brainglobe')!.getAttribute('data-unified')).toBe('true');
  });

  it('one stale section breaks it — the glow is what maintenance buys', () => {
    stubEnvironment({ reduce: false });
    const { container } = render({
      states: ALL_REACHED,
      health: healthMap('done', { id: 'sec4', state: 'due' }),
    });
    expect(container.querySelector('.brainglobe')!.getAttribute('data-unified')).toBe('false');
  });

  it('says the state in words too, because a colour says nothing to a screen reader', () => {
    stubEnvironment({ reduce: false });
    const unified = render({ states: ALL_REACHED, health: healthMap('done') });
    const said = [...unified.container.querySelectorAll('.brainglobe-sr')].map((p) => p.textContent);
    expect(said).toContain(S.brainGlobeUnified);
    const group = unified.container.querySelector('.brainglobe-pins')!;
    const described = group.getAttribute('aria-describedby')!.split(' ');
    expect(described).toHaveLength(2);
    for (const id of described) expect(unified.container.querySelector(`#${id}`)).not.toBeNull();

    // ...and there is no opposite sentence. Losing the glow is information the
    // List already carries; a picture that announced it would be the nudge
    // docs/GUARDRAILS.md rules out.
    const broken = render({ states: ALL_REACHED, health: healthMap('done', { id: 'sec4', state: 'due' }) });
    expect([...broken.container.querySelectorAll('.brainglobe-sr')].map((p) => p.textContent)).not.toContain(
      S.brainGlobeUnified,
    );
    expect(broken.container.querySelector('.brainglobe-pins')!.getAttribute('aria-describedby')!.split(' ')).toHaveLength(1);
  });

  it('is not unified with no health at all — the showcase case is a state, not a claim', () => {
    stubEnvironment({ reduce: false });
    const { container } = mount(<BrainGlobe sections={contextOutline} states={ALL_REACHED} />);
    expect(container.querySelector('.brainglobe')!.getAttribute('data-unified')).toBe('false');
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
    // And a real way back that is not only a keystroke — V2.1 VB-74: the nav
    // band's Back, above the stage, enabled because there is now a level up.
    const back = container.querySelector('.brainglobe-nav-btn')!;
    expect(back).not.toBeNull();
    expect(back.getAttribute('aria-disabled')).toBeNull();
  });
});

// ---------------------------------------------------------------------
// V1.4 VB-23. The cluster, and the split.
// ---------------------------------------------------------------------

/** The real 2.1 Roles, filled in the way the harness fills it. Three records
 * is the longest real sub-section there is — the panel's stress case. */
const ROLE_ANSWERS = {
  values: { role_names: ['manager', 'volunteer-board', 'freelancer'] },
  repeatables: {
    roles: [
      {
        role_name: 'Manager / Team Lead',
        role_for: 'employer',
        role_mandate: 'Keep the team’s reporting accurate, on time, and trusted by leadership.',
        role_standing: 'primary',
        role_durability: 'current',
      },
      {
        role_name: 'Volunteer / Board Member',
        role_for: 'community',
        role_mandate: 'Raise money and awareness for a cause I care about.',
        role_standing: 'occasional',
        role_durability: 'current',
      },
      {
        role_name: 'Freelancer / Contractor',
        role_for: 'clients',
        role_mandate: 'Deliver design work clients are happy to pay for again.',
        role_standing: 'secondary',
        role_durability: 'historical',
      },
    ],
  },
};
const DETAILS = nodeDetailsByNode(contextOutline, ROLE_ANSWERS);

const childPin = (container: Element, id: string) =>
  container.querySelector<HTMLButtonElement>(`.brainglobe-pin[data-child-id="${id}"]`)!;

/** Fly into About Me and pick one of its five sub-nodes. */
function openChild(container: Element, env: ReturnType<typeof stubEnvironment>, childId = 'sec2-1') {
  act(() => pin(container, 'sec2').click());
  env.settle();
  act(() => childPin(container, childId).click());
  env.settle();
}

describe('BrainGlobe — VB-23, hierarchy inside a section', () => {
  it('the centre orb is proportionately larger than the sub-nodes ringing it', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    act(() => pin(container, 'sec2').click());
    env.settle();

    // On-screen radius: the centre is drawn inside the scene group, which is
    // scaled, and the children are not.
    const scene = container.querySelector('.brainglobe-scene')!.getAttribute('transform')!;
    const sceneScale = Number(/scale\(([\d.]+)\)/.exec(scene)![1]);
    const centre = Number(
      container
        .querySelector('.brainglobe-node[data-section-id="sec2"] .brainglobe-sphere')!
        .getAttribute('r'),
    ) * sceneScale;
    const children = [...container.querySelectorAll('.brainglobe-child-node .brainglobe-sphere')].map((c) =>
      Number(c.getAttribute('r')),
    );
    expect(children).toHaveLength(5);
    for (const child of children) expect(centre / child).toBeGreaterThan(2);
  });

  it('the centre orb is the same size whichever pose it was clicked from', () => {
    const sizes: number[] = [];
    for (const key of ['ArrowRight', 'End']) {
      const env = stubEnvironment({ reduce: false });
      const { container } = render();
      const stage = container.querySelector('.brainglobe')!;
      // Turn the globe somewhere else entirely first, so sec2 is flown into
      // from two genuinely different depths.
      act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
      env.settle();
      act(() => pin(container, 'sec2').click());
      env.settle();
      const scene = container.querySelector('.brainglobe-scene')!.getAttribute('transform')!;
      const sceneScale = Number(/scale\(([\d.]+)\)/.exec(scene)![1]);
      sizes.push(
        Number(
          container.querySelector('.brainglobe-node[data-section-id="sec2"] .brainglobe-sphere')!.getAttribute('r'),
        ) * sceneScale,
      );
      vi.unstubAllGlobals();
    }
    // Hierarchy that depended on which way the globe happened to be turned
    // would not be hierarchy. This is the bug CENTRE_R exists to fix.
    expect(sizes[0]!).toBeCloseTo(sizes[1]!, 2);
  });

  it('the halo goes on the way in — size carries the hierarchy, not a ring', () => {
    const env = stubEnvironment({ reduce: false });
    // sec2 is the section being written now, so it starts with a halo.
    const { container } = render({ states: { ...STATES, sec2: 'current' } });
    const halo = () => container.querySelector('.brainglobe-halo');
    expect(Number(halo()!.getAttribute('opacity') ?? 1)).toBeCloseTo(1, 3);

    act(() => pin(container, 'sec2').click());
    env.settle();
    expect(Number(halo()!.getAttribute('opacity'))).toBeCloseTo(0, 3);

    // ...and comes back out here, where it is the only mark of the section
    // being written now among ten equal siblings. V2.1 VB-74: the way out is
    // the nav band's Back.
    act(() => container.querySelector<HTMLButtonElement>('.brainglobe-nav-btn')!.click());
    env.settle();
    expect(Number(halo()!.getAttribute('opacity'))).toBeCloseTo(1, 3);
  });

  it('draws a faint line from the centre orb to every sub-node', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render();
    act(() => pin(container, 'sec2').click());
    env.settle();

    const links = [...container.querySelectorAll('.brainglobe-link')];
    expect(links).toHaveLength(5);
    for (const link of links) {
      // Faint: never competing with the orbs it joins.
      expect(Number(link.getAttribute('stroke-opacity'))).toBeLessThanOrEqual(0.4);
      expect(Number(link.getAttribute('stroke-opacity'))).toBeGreaterThan(0);
      expect(Number(link.getAttribute('stroke-width'))).toBeLessThan(1);
    }

    // Each line starts on the centre orb's rim and ends on its sub-node's, so
    // it reads as a joint rather than a spoke laid over two circles.
    const scene = container.querySelector('.brainglobe-scene')!.getAttribute('transform')!;
    const sceneScale = Number(/scale\(([\d.]+)\)/.exec(scene)![1]);
    const centreR =
      Number(container.querySelector('.brainglobe-node[data-section-id="sec2"] .brainglobe-sphere')!.getAttribute('r')) *
      sceneScale;
    for (const link of links) {
      const child = container.querySelector(
        `.brainglobe-child-node[data-child-id="${link.getAttribute('data-link-id')}"] .brainglobe-sphere`,
      )!;
      const cx = Number(child.getAttribute('cx'));
      const cy = Number(child.getAttribute('cy'));
      const childR = Number(child.getAttribute('r'));
      const x1 = Number(link.getAttribute('x1'));
      const y1 = Number(link.getAttribute('y1'));
      const x2 = Number(link.getAttribute('x2'));
      const y2 = Number(link.getAttribute('y2'));
      expect(Math.hypot(x2 - cx, y2 - cy)).toBeCloseTo(childR, 1);
      // The centre orb sits at the origin of the children's layer.
      expect(Math.hypot(x1, y1)).toBeCloseTo(centreR, 1);
    }
  });

  it('the whole cluster leaves when a sub-node takes the stage', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    openChild(container, env);

    const opacityOf = (selector: string) => Number(container.querySelector(selector)!.getAttribute('opacity'));
    expect(opacityOf('.brainglobe-node[data-section-id="sec2"]')).toBeCloseTo(0, 2);
    for (const link of container.querySelectorAll('.brainglobe-link')) {
      expect(Number(link.getAttribute('stroke-opacity'))).toBeCloseTo(0, 2);
    }
    for (const id of ['sec2-2', 'sec2-3', 'sec2-4', 'sec2-5']) {
      expect(opacityOf(`.brainglobe-child-node[data-child-id="${id}"]`)).toBeCloseTo(0, 2);
    }
    // The one you picked is the only thing left, and it is bigger than it was.
    expect(opacityOf('.brainglobe-child-node[data-child-id="sec2-1"]')).toBeCloseTo(1, 2);
  });
});

describe('BrainGlobe — VB-23, the split', () => {
  it('moves the picked orb to a feature position on the left and grows it', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    act(() => pin(container, 'sec2').click());
    env.settle();

    const orb = () => container.querySelector('.brainglobe-child-node[data-child-id="sec2-1"] .brainglobe-sphere')!;
    const before = { x: Number(orb().getAttribute('cx')), r: Number(orb().getAttribute('r')) };

    act(() => childPin(container, 'sec2-1').click());
    env.settle();

    const after = { x: Number(orb().getAttribute('cx')), r: Number(orb().getAttribute('r')) };
    // Left of the stage's own centre, which is x = 0 in the -100..100 viewBox.
    expect(after.x).toBeLessThan(-30);
    expect(after.x).toBeLessThan(before.x);
    expect(after.r).toBeGreaterThan(before.r * 2);
  });

  it('opens a panel with the sub-node’s name and a grid of what it holds', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    expect(container.querySelector('.brainglobe-detail')).toBeNull();

    openChild(container, env);

    const panel = container.querySelector('.brainglobe-detail')!;
    expect(panel.querySelector('.brainglobe-detail-name')!.textContent).toBe('2.1 Roles');
    expect(panel.getAttribute('aria-label')).toBe(S.brainGlobeDetail('2.1 Roles'));

    // The real thirteen cells, grouped under the three role headings the
    // generated file prints (core/flow/nodeDetails.ts).
    expect(panel.querySelectorAll('.brainglobe-detail-cell')).toHaveLength(13);
    expect([...panel.querySelectorAll('.brainglobe-detail-record')].map((el) => el.textContent)).toEqual([
      'Manager / Team Lead',
      'Volunteer / Board Member',
      'Freelancer / Contractor',
    ]);
    // Every cell says both halves, in the file's own words.
    const values = [...panel.querySelectorAll('.brainglobe-detail-value')].map((el) => el.textContent);
    expect(values).toContain('My employer');
    expect(values).toContain('Historical');
    for (const key of panel.querySelectorAll('.brainglobe-detail-key')) {
      // The whole question is kept, however few lines of it are drawn.
      expect(key.getAttribute('title')).toBe(key.textContent);
    }
  });

  it('says so plainly when a sub-node holds nothing yet — never an empty grid', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    openChild(container, env, 'sec2-4');

    const panel = container.querySelector('.brainglobe-detail')!;
    expect(panel.querySelectorAll('.brainglobe-detail-cell')).toHaveLength(0);
    expect(panel.querySelector('.brainglobe-detail-empty')!.textContent).toBe(S.brainGlobeDetailEmpty);
  });

  it('splits with no details prop at all — the showcase degrades, it does not break', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = mount(<BrainGlobe sections={contextOutline} states={STATES} />);
    openChild(container, env);
    const panel = container.querySelector('.brainglobe-detail')!;
    expect(panel.querySelector('.brainglobe-detail-name')!.textContent).toBe('2.1 Roles');
    expect(panel.querySelector('.brainglobe-detail-empty')).not.toBeNull();
  });

  it('still reports the sub-node to the caller — click-to-navigate is untouched', () => {
    const env = stubEnvironment({ reduce: false });
    const chosen: Array<string | null> = [];
    const { container } = render({ details: DETAILS, onSelect: (node) => chosen.push(node?.id ?? null) });
    openChild(container, env);
    expect(chosen).toEqual(['sec2', 'sec2-1']);
  });

  it('closing the split reports nothing — shutting a panel is not a request to go anywhere', () => {
    const env = stubEnvironment({ reduce: false });
    const chosen: Array<string | null> = [];
    const { container } = render({ details: DETAILS, onSelect: (node) => chosen.push(node?.id ?? null) });
    openChild(container, env);
    act(() => childPin(container, 'sec2-1').click());
    env.settle();
    expect(chosen).toEqual(['sec2', 'sec2-1']);
    expect(container.querySelector('.brainglobe-detail')).toBeNull();
  });

  it('takes the four you did not pick out of the tab order, and does not trap the one you did', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    openChild(container, env);

    const visible = [...container.querySelectorAll<HTMLButtonElement>('.brainglobe-pin')].filter((p) => !p.hidden);
    expect(visible.map((p) => p.getAttribute('data-child-id'))).toEqual(['sec2-1']);
    expect(childPin(container, 'sec2-1').getAttribute('aria-pressed')).toBe('true');
    // The panel is a real stop of its own, because it scrolls.
    expect(container.querySelector('.brainglobe-detail')!.getAttribute('tabindex')).toBe('0');
    // Nothing removed the way back out (V2.1 VB-74: the band's Back, live).
    expect(container.querySelector('.brainglobe-nav-btn')!.getAttribute('aria-disabled')).toBeNull();
  });

  it('Escape closes the split first and the section only after it', () => {
    const env = stubEnvironment({ reduce: false });
    const chosen: Array<string | null> = [];
    const { container } = render({ details: DETAILS, onSelect: (node) => chosen.push(node?.id ?? null) });
    const stage = container.querySelector('.brainglobe')!;
    openChild(container, env);

    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    env.settle();
    expect(container.querySelector('.brainglobe-detail')).toBeNull();
    expect(stage.getAttribute('data-inside')).toBe('true');

    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    env.settle();
    expect(stage.getAttribute('data-inside')).toBe('false');
    expect(chosen).toEqual(['sec2', 'sec2-1', null]);
  });

  /**
   * V2.1 VB-74 rewrote this test's scenario out of existence. It used to click
   * the corner pill from an open sub-node, which flew out of the section with
   * the split still open — the pill skipped a rung. The band's Back walks the
   * same strict ladder Escape does: one level per press, split first, section
   * second. So the claim becomes the pointer's copy of the Escape-ladder test
   * above, and "flying out closes the split" survives inside it — by the time
   * the section closes, the split is already gone.
   */
  it('Back walks one level per press: the split closes first, the section after', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    openChild(container, env);
    const back = () => container.querySelector<HTMLButtonElement>('.brainglobe-nav-btn')!;

    act(() => back().click());
    env.settle();
    expect(container.querySelector('.brainglobe-detail')).toBeNull();
    expect(container.querySelector('.brainglobe')!.getAttribute('data-inside')).toBe('true');
    expect(container.querySelector('.brainglobe')!.getAttribute('data-split')).toBe('0.000');

    act(() => back().click());
    env.settle();
    expect(container.querySelector('.brainglobe')!.getAttribute('data-inside')).toBe('false');
  });

  it('names the sub-node out loud when the stage splits', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    const live = container.querySelector('[aria-live="polite"]')!;
    openChild(container, env);
    expect(live.textContent).toBe(S.brainGlobeInside('2.1 Roles'));
  });
});

describe('BrainGlobe — VB-27, the node summary', () => {
  /** The same three roles the split's grid is tested against, folded into
   * counts — real derivation, not a hand-written card. */
  const SUMMARIES = nodeSummaries(contextOutline, ROLE_ANSWERS, {});
  const RECS: Record<string, Recommendation[]> = {
    'sec2-1': [
      {
        id: 'role-stale:0',
        kind: 'role-stale',
        nodeId: 'sec2-1',
        rank: 120,
        target: { in: 'repeatable', blockId: 'roles', recordIndex: 0, questionId: 'role_durability' },
        role: 'Manager / Team Lead',
        elapsed: { value: 7, unit: 'month' },
      },
    ],
  };

  const withSummaries = () => render({ details: DETAILS, summaries: SUMMARIES, recommendations: RECS });
  const card = (container: Element) => container.querySelector('.nodesummary');

  function flyIn(container: Element, env: ReturnType<typeof stubEnvironment>) {
    act(() => pin(container, 'sec2').click());
    env.settle();
  }

  it('opens on focus, with no pointer anywhere near it', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = withSummaries();
    flyIn(container, env);
    expect(card(container)).toBeNull();

    act(() => childPin(container, 'sec2-1').focus());
    expect(card(container)!.getAttribute('data-node-id')).toBe('sec2-1');
    expect(card(container)!.getAttribute('role')).toBe('tooltip');
    // What it says is the fold's, not the component's: three records, and the
    // file's own name for the node rather than the stage's short one.
    expect(card(container)!.textContent).toContain('2.1 Roles');
    expect(card(container)!.textContent).toContain('3 things named here');
  });

  it('names itself as the node\u2019s description, so a screen reader gets it on the same focus', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = withSummaries();
    flyIn(container, env);
    act(() => childPin(container, 'sec2-1').focus());

    const describedBy = childPin(container, 'sec2-1').getAttribute('aria-describedby');
    expect(describedBy).toBe(card(container)!.id);
  });

  it('carries the recommendation that belongs to that node, and only that node', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = withSummaries();
    flyIn(container, env);

    act(() => childPin(container, 'sec2-1').focus());
    expect(card(container)!.querySelector('.nodesummary-rec')!.getAttribute('data-rec-kind')).toBe('role-stale');

    act(() => childPin(container, 'sec2-2').focus());
    expect(card(container)).toBeNull(); // nothing in 2.2 yet, so no card at all
  });

  it('Escape closes it and leaves focus exactly where it was', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = withSummaries();
    flyIn(container, env);
    const node = childPin(container, 'sec2-1');
    act(() => node.focus());
    expect(card(container)).not.toBeNull();

    const stage = container.querySelector('.brainglobe')!;
    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    expect(card(container)).toBeNull();
    expect(document.activeElement).toBe(node);
    // One rung only: still inside the section, still on the ring.
    expect(stage.getAttribute('data-inside')).toBe('true');
    expect(node.hasAttribute('aria-describedby')).toBe(false);
  });

  it('a node with nothing in it says so on the node, and shows no card', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = withSummaries();
    flyIn(container, env);
    expect(childPin(container, 'sec2-1').getAttribute('data-has-summary')).toBe('true');
    expect(childPin(container, 'sec2-4').getAttribute('data-has-summary')).toBe('false');

    act(() => childPin(container, 'sec2-4').focus());
    expect(card(container)).toBeNull();
  });

  it('picking the node closes it — the split says everything it said and more', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = withSummaries();
    flyIn(container, env);
    act(() => childPin(container, 'sec2-1').focus());
    expect(card(container)).not.toBeNull();

    act(() => childPin(container, 'sec2-1').click());
    env.settle();
    expect(card(container)).toBeNull();
    expect(container.querySelector('.brainglobe-detail')).not.toBeNull();
  });

  it('degrades to the globe it was: no summaries prop, no card, and the split still opens', () => {
    const env = stubEnvironment({ reduce: false });
    const { container } = render({ details: DETAILS });
    flyIn(container, env);
    act(() => childPin(container, 'sec2-1').focus());
    expect(card(container)).toBeNull();
    expect(childPin(container, 'sec2-1').getAttribute('data-has-summary')).toBe('false');

    act(() => childPin(container, 'sec2-1').click());
    env.settle();
    expect(container.querySelector('.brainglobe-detail')).not.toBeNull();
  });
});

describe('BrainGlobe — VB-23 under reduced motion', () => {
  it('splits instantly, with everything present and nothing moving', () => {
    const env = stubEnvironment({ reduce: true });
    const { container } = render({ details: DETAILS });
    act(() => pin(container, 'sec2').click());
    act(() => childPin(container, 'sec2-1').click());

    expect(env.frameCount, 'a reduced-motion visitor must get no rAF loop at all').toBe(0);
    expect(container.querySelector('.brainglobe')!.getAttribute('data-split')).toBe('1.000');
    const panel = container.querySelector('.brainglobe-detail')!;
    expect(panel.querySelectorAll('.brainglobe-detail-cell')).toHaveLength(13);
    // Arrived, not on its way: the orb is already at the feature position.
    const orb = container.querySelector('.brainglobe-child-node[data-child-id="sec2-1"] .brainglobe-sphere')!;
    expect(Number(orb.getAttribute('cx'))).toBeLessThan(-30);
  });

  it('closes instantly too, and puts the whole cluster back', () => {
    const env = stubEnvironment({ reduce: true });
    const { container } = render({ details: DETAILS });
    const stage = container.querySelector('.brainglobe')!;
    act(() => pin(container, 'sec2').click());
    act(() => childPin(container, 'sec2-1').click());
    act(() => stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    expect(env.frameCount).toBe(0);
    expect(stage.getAttribute('data-split')).toBe('0.000');
    expect(container.querySelectorAll('.brainglobe-pin.is-child:not([hidden])')).toHaveLength(5);
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
