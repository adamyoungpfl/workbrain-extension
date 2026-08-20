import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { Toast } from './Toast';
import { mount } from './testUtils';

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces via role=status/aria-live=polite, confirmation only', () => {
    const { container } = mount(<Toast message="Added to Context.md · updated today" />);
    const toast = container.querySelector('.toast')!;
    expect(toast.getAttribute('role')).toBe('status');
    expect(toast.getAttribute('aria-live')).toBe('polite');
    expect(toast.textContent).toContain('Added to Context.md · updated today');
  });

  it('never carries an action — no focusable control inside', () => {
    const { container } = mount(<Toast message="Saved" />);
    expect(container.querySelector('.toast button, .toast a, .toast [tabindex]')).toBeNull();
  });

  it('auto-dismisses after four seconds by default', () => {
    const onDismiss = vi.fn();
    mount(<Toast message="Saved" onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(3999));
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('respects a custom duration', () => {
    const onDismiss = vi.fn();
    mount(<Toast message="Saved" duration={1000} onDismiss={onDismiss} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not fire onDismiss after unmount', () => {
    const onDismiss = vi.fn();
    const { unmount } = mount(<Toast message="Saved" onDismiss={onDismiss} />);
    unmount();
    act(() => vi.advanceTimersByTime(5000));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
