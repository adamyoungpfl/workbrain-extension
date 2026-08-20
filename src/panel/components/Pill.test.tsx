import { describe, it, expect, vi } from 'vitest';
import { act, useState } from 'react';
import { PillGroup } from './Pill';
import type { PillOption } from './Pill';
import { mount } from './testUtils';

const OPTIONS: PillOption[] = [
  { value: 'work', label: 'Work' },
  { value: 'home', label: 'Home' },
  { value: 'both', label: 'Both', suggested: true },
];

function click(el: HTMLElement) {
  act(() => el.click());
}

function focus(el: HTMLElement) {
  act(() => el.focus());
}

function press(el: Element, key: string) {
  act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

function pillsOf(container: Element) {
  const [work, home, both] = Array.from(container.querySelectorAll('.pill')) as HTMLButtonElement[];
  if (!work || !home || !both) throw new Error('expected three pills');
  return [work, home, both] as const;
}

function Harness({
  mode,
  initial = [],
  onAddOwn,
}: {
  mode: 'single' | 'multi';
  initial?: string[];
  onAddOwn?: (() => void) | undefined;
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <PillGroup
      legend="Work, home, or both?"
      options={OPTIONS}
      mode={mode}
      value={value}
      onChange={setValue}
      onAddOwn={onAddOwn}
    />
  );
}

describe('PillGroup', () => {
  it('is a group with an accessible name from the question', () => {
    const { container } = mount(<Harness mode="single" />);
    const group = container.querySelector('[role="group"]')!;
    expect(group.getAttribute('aria-label')).toBe('Work, home, or both?');
  });

  it('single-select: clicking a pill selects it and replaces the prior selection', () => {
    const { container } = mount(<Harness mode="single" />);
    const [work, home] = pillsOf(container);
    click(work);
    expect(work.getAttribute('aria-pressed')).toBe('true');
    click(home);
    expect(work.getAttribute('aria-pressed')).toBe('false');
    expect(home.getAttribute('aria-pressed')).toBe('true');
  });

  it('multi-select: clicking toggles a pill on and off independently', () => {
    const { container } = mount(<Harness mode="multi" />);
    const [work, home] = pillsOf(container);
    click(work);
    click(home);
    expect(work.getAttribute('aria-pressed')).toBe('true');
    expect(home.getAttribute('aria-pressed')).toBe('true');
    click(work);
    expect(work.getAttribute('aria-pressed')).toBe('false');
    expect(home.getAttribute('aria-pressed')).toBe('true');
  });

  it('marks the suggested option without relying on color alone', () => {
    const { container } = mount(<Harness mode="single" />);
    const [, , both] = pillsOf(container);
    expect(both.className).toContain('suggested');
  });

  it('roving tabindex: only one pill is tabbable at a time, starting at the first', () => {
    const { container } = mount(<Harness mode="single" />);
    const pills = pillsOf(container);
    expect(pills.map((p) => p.tabIndex)).toEqual([0, -1, -1]);
  });

  it('ArrowRight moves the roving tabindex forward and wraps at the end', () => {
    const { container } = mount(<Harness mode="single" />);
    const [work, home, both] = pillsOf(container);
    focus(work);
    press(work, 'ArrowRight');
    expect(document.activeElement).toBe(home);
    press(home, 'ArrowRight');
    expect(document.activeElement).toBe(both);
    press(both, 'ArrowRight');
    expect(document.activeElement).toBe(work);
  });

  it('ArrowLeft from the first pill wraps to the last', () => {
    const { container } = mount(<Harness mode="single" />);
    const [work, , both] = pillsOf(container);
    focus(work);
    press(work, 'ArrowLeft');
    expect(document.activeElement).toBe(both);
  });

  it('Home and End jump to the first and last pill', () => {
    const { container } = mount(<Harness mode="single" />);
    const [work, home, both] = pillsOf(container);
    focus(home);
    press(home, 'End');
    expect(document.activeElement).toBe(both);
    press(both, 'Home');
    expect(document.activeElement).toBe(work);
  });

  it('renders a dashed "+ add your own" pill as part of the same roving group', () => {
    const onAddOwn = vi.fn();
    const { container } = mount(<Harness mode="single" onAddOwn={onAddOwn} />);
    const addBtn = container.querySelector('.pill-add') as HTMLButtonElement;
    expect(addBtn.textContent).toBe('+ add your own');
    click(addBtn);
    expect(onAddOwn).toHaveBeenCalledTimes(1);

    const [work] = pillsOf(container);
    focus(work);
    press(work, 'ArrowLeft');
    expect(document.activeElement).toBe(addBtn);
  });
});
