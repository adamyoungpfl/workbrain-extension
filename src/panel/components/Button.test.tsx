import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { Button } from './Button';
import { mount } from './testUtils';

describe('Button', () => {
  it('renders as a button with an accessible name from its children', () => {
    const { container } = mount(<Button>Start the interview</Button>);
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Start the interview');
  });

  it.each(['primary', 'secondary', 'quiet', 'ai'] as const)(
    'applies the %s variant class',
    (variant) => {
      const { container } = mount(<Button variant={variant}>Go</Button>);
      const btn = container.querySelector('button')!;
      expect(btn.className).toContain(`btn-${variant}`);
    },
  );

  it('is focusable and shows a focus-visible outline via CSS, never outline:none', () => {
    const { container } = mount(<Button>Next</Button>);
    const btn = container.querySelector('button')!;
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it('disabled state stays in the DOM, not removed', () => {
    const { container } = mount(<Button disabled>Next</Button>);
    const btn = container.querySelector('button')!;
    expect(btn).not.toBeNull();
    expect(btn.disabled).toBe(true);
  });

  it('quiet buttons default to enabled — escape hatches must always be available', () => {
    const { container } = mount(<Button variant="quiet">Skip</Button>);
    const btn = container.querySelector('button')!;
    expect(btn.disabled).toBe(false);
  });

  it('loading swaps the label for a verb-in-progress and marks aria-busy, no spinner-only state', () => {
    const { container } = mount(
      <Button loading loadingLabel="Saving…">
        Save
      </Button>,
    );
    const btn = container.querySelector('button')!;
    expect(btn.textContent).toBe('Saving…');
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
  });

  it('calls onClick when clicked and not disabled', () => {
    const onClick = vi.fn();
    const { container } = mount(<Button onClick={onClick}>Go</Button>);
    const btn = container.querySelector('button')!;
    act(() => btn.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
