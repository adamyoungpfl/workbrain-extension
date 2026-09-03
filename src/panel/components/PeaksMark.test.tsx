import { describe, expect, it } from 'vitest';
import { mount } from './testUtils';
import { PeaksSvg } from './PeaksMark';

describe('PeaksSvg — the shipped icon as a drawable face (V3.0 pass 4)', () => {
  it('draws exactly three peaks, each scalable from its own base', () => {
    const m = mount(<PeaksSvg size={30} />);
    const peaks = m.container.querySelectorAll('.peaksmark-peak');
    expect(peaks.length).toBe(3);
    // Three distinct hues — the icon's triad, by token, never a literal.
    const fills = [...peaks].map((p) => (p as SVGPathElement).style.fill);
    expect(new Set(fills).size).toBe(3);
    for (const f of fills) expect(f).toMatch(/^var\(--/);
    m.unmount();
  });

  it('is scenery to assistive tech, whole', () => {
    const m = mount(<PeaksSvg size={30} />);
    expect(m.container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    m.unmount();
  });
});
