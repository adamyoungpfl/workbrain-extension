import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { NavButton } from './NavButton';
import { mount } from './testUtils';

/**
 * V1.7 VB-41. The wrapper is the whole point of this component — it is the box
 * the focus ring hugs once the button's container is gone — so what is worth
 * asserting here is the shape of the markup and that wrapping a Button cost
 * nothing the Button already did. Whether the ring is actually drawn on it is a
 * question about painted pixels and belongs in
 * tests/e2e/button-cluster.spec.ts.
 */
describe('NavButton', () => {
  it('wraps the button in a box the ring can hug, without becoming the button', () => {
    const { container } = mount(<NavButton variant="primary">Next</NavButton>);
    const wrapper = container.querySelector('.navbtn')!;
    expect(wrapper.tagName).toBe('SPAN');
    // Exactly one button, inside the wrapper — a wrapper that was itself
    // focusable would be a second tab stop for one control.
    const buttons = wrapper.querySelectorAll('button');
    expect(buttons).toHaveLength(1);
    expect(wrapper.getAttribute('tabindex')).toBeNull();
    expect(buttons[0]!.className).toContain('btn-primary');
  });

  it('keeps the label as the accessible name, chevron and all', () => {
    const { container } = mount(
      <NavButton variant="secondary" direction="back">
        Back
      </NavButton>,
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('Back');
    // The glyph is a picture of that word, not a second name.
    const svg = button.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  it('points the chevron the way the control moves, and drops it when it moves nowhere', () => {
    const back = mount(<NavButton direction="back">Back</NavButton>);
    const next = mount(<NavButton direction="next">Next</NavButton>);
    const skip = mount(<NavButton variant="quiet">Skip</NavButton>);

    // Before the word going back, after the word going on: the chevron reads
    // as the direction of travel rather than as decoration.
    const backButton = back.container.querySelector('button')!;
    const nextButton = next.container.querySelector('button')!;
    expect(backButton.firstElementChild!.tagName.toLowerCase()).toBe('svg');
    expect(nextButton.lastElementChild!.tagName.toLowerCase()).toBe('svg');
    expect(backButton.querySelector('svg path')!.getAttribute('d')).not.toBe(
      nextButton.querySelector('svg path')!.getAttribute('d'),
    );
    expect(skip.container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('passes everything else through to the Button underneath', () => {
    const onClick = vi.fn();
    const { container } = mount(
      <NavButton type="submit" variant="quiet" onClick={onClick}>
        Skip
      </NavButton>,
    );
    const button = container.querySelector('button')!;
    expect(button.type).toBe('submit');
    expect(button.className).toContain('btn-quiet');
    act(() => button.click());
    expect(onClick).toHaveBeenCalledTimes(1);
    // Quiet is the escape hatch and is never disabled (docs/design-system.html).
    expect(button.disabled).toBe(false);
  });
});
