import { describe, it, expect } from 'vitest';
import { NAME_DICE_ICON } from './Flow';
import { mount } from '../components/testUtils';

/**
 * V2.4 VB-109's glyph — the die. The same two-part reasoning as
 * Flow.idea.test.tsx: the drawing is a transcription (a digit lost in a
 * refactor is invisible in a diff and visible on screen), and everything
 * behavioural — the drop, the cycling, the cue restart — is either
 * core/flow/nameGenerator.ts's (unit-tested there) or the ideas mechanic's
 * own restartIdeaCue (unit-tested in Flow.idea.test.tsx and shared, not
 * copied). The real screen is driven in tests/e2e/name-generator.spec.ts.
 */

describe('the die glyph', () => {
  it('is one group, and nothing outside it — the whole die rolls as one object', () => {
    const { container } = mount(NAME_DICE_ICON);
    const svg = container.querySelector('svg')!;
    const children = [...svg.children];
    expect(children.map((c) => c.tagName)).toEqual(['g']);
    expect(children[0]!.getAttribute('class')).toBe('namegen-die');
  });

  it('draws a rounded die with exactly five pips', () => {
    const { container } = mount(NAME_DICE_ICON);
    const die = container.querySelector('.namegen-die')!;
    const rect = die.querySelector('rect')!;
    expect(rect.getAttribute('rx')).toBe('3.4');
    expect(rect.getAttribute('width')).toBe('15.6');
    const pips = [...die.querySelectorAll('circle')];
    expect(pips).toHaveLength(5);
    // Pips are filled dots (the REPHRASE_ICON dot precedent): a 1.1-unit
    // circle stroked at 2 would be a ring with no hole.
    for (const pip of pips) {
      expect(pip.getAttribute('fill')).toBe('currentColor');
      expect(pip.getAttribute('stroke')).toBe('none');
      expect(pip.getAttribute('r')).toBe('1.1');
    }
  });

  it('keeps its stroke on the root, so the group only ever animates', () => {
    const { container } = mount(NAME_DICE_ICON);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('width')).toBe('17');
    expect(svg.getAttribute('fill')).toBe('none');
    const group = svg.querySelector('g')!;
    expect(group.getAttribute('stroke')).toBeNull();
    expect(group.getAttribute('transform')).toBeNull();
    expect(group.getAttribute('opacity')).toBeNull();
  });

  it('stays decorative — the button around it carries the words', () => {
    const { container } = mount(NAME_DICE_ICON);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    // No SMIL: the roll is CSS, so reduced motion can replace it.
    expect(svg.querySelector('animate, animateTransform, set')).toBeNull();
  });
});
