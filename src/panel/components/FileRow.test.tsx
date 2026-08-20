import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { FileRow } from './FileRow';
import { mount } from './testUtils';

function click(el: HTMLElement) {
  act(() => el.click());
}

describe('FileRow', () => {
  it('renders the name and subtitle as an accessible button', () => {
    const { container } = mount(<FileRow name="Context.md" subtitle="Updated today · 10 of 10 sections" />);
    const btn = container.querySelector('button')!;
    expect(btn.textContent).toContain('Context.md');
    expect(btn.textContent).toContain('Updated today · 10 of 10 sections');
  });

  it('calls onClick when tapped', () => {
    const onClick = vi.fn();
    const { container } = mount(<FileRow name="Context.md" subtitle="—" onClick={onClick} />);
    click(container.querySelector('button')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows a badge with a tone class, never color-only (the badge also carries text)', () => {
    const { container } = mount(
      <FileRow name="Context.md" subtitle="—" badge={{ label: '3 due', tone: 'due' }} />,
    );
    const badge = container.querySelector('.badge')!;
    expect(badge.className).toContain('due');
    expect(badge.textContent).toBe('3 due');
  });

  it('a locked row explains what unlocks it in the row and is not clickable', () => {
    const onClick = vi.fn();
    const { container } = mount(
      <FileRow name="Actions.md" subtitle="Finish Skills.md first" locked onClick={onClick} />,
    );
    const btn = container.querySelector('button')!;
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('locked');
    expect(btn.textContent).toContain('Finish Skills.md first');
    click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});
