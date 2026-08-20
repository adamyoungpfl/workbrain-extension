import { describe, it, expect } from 'vitest';
import { BrandMark } from './BrandMark';
import { mount } from './testUtils';

/**
 * V1.1 VB-01. Two things are worth testing about a drawing.
 *
 * First, that the transcription from ../modelcitizen/public/mark.svg is
 * actually right. A single mistyped digit in a coordinate produces a line
 * floating off a vertex — visible if you look hard, invisible in a diff. The
 * shape is an icosahedron, so it has a structural signature that a typo
 * cannot survive: twelve vertices, thirty edges, every edge landing exactly on
 * two of the vertices, every vertex used by exactly five edges. That is
 * checked below against the rendered DOM, not against the source arrays.
 *
 * Second, that it stays *static*. The source file animates forever and the
 * sibling app's version rotates on a rAF loop; the panel version must not.
 */
describe('BrandMark', () => {
  it('draws twelve nodes and thirty edges', () => {
    const { container } = mount(<BrandMark />);
    expect(container.querySelectorAll('circle')).toHaveLength(12);
    expect(container.querySelectorAll('line')).toHaveLength(30);
  });

  it('every edge lands exactly on two nodes, and every node carries exactly five edges', () => {
    const { container } = mount(<BrandMark />);
    const at = (el: Element, name: string) => Number(el.getAttribute(name));

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

  it('paints in back-to-front order — the source export sorts nodes by radius so nearer ones overlap farther ones', () => {
    const { container } = mount(<BrandMark />);
    const radii = [...container.querySelectorAll('circle')].map((c) => Number(c.getAttribute('r')));
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
  });

  it('every node fill points at a gradient that is actually defined', () => {
    const { container } = mount(<BrandMark />);
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
    const { container } = mount(<BrandMark />);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The ten stops are the only coloured things declared inline, and they
    // declare a class, not a colour.
    const stops = [...container.querySelectorAll('stop')];
    expect(stops).toHaveLength(10);
    for (const stop of stops) {
      expect(stop.getAttribute('class')).toMatch(/^brand-mark-node-[1-5]-(from|to)$/);
      expect(stop.getAttribute('stop-color')).toBeNull();
    }
  });

  it('is static — no animation element, no inline keyframe, nothing that ticks', () => {
    const { container } = mount(<BrandMark />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('animate, animateTransform, animateMotion, set, style')).toBeNull();
    expect(svg.innerHTML).not.toMatch(/animation|@keyframes/);
  });

  it('is decorative — hidden from assistive tech and out of the tab order', () => {
    const { container } = mount(<BrandMark />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('renders square at the requested size, always over the same 240 viewBox', () => {
    const { container } = mount(<BrandMark size={64} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('64');
    expect(svg.getAttribute('height')).toBe('64');
    expect(svg.getAttribute('viewBox')).toBe('0 0 240 240');
  });
});
