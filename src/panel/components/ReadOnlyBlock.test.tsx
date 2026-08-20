import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { ReadOnlyBlock } from './ReadOnlyBlock';
import { mount } from './testUtils';

describe('ReadOnlyBlock', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('renders the tag and the exact, untouched text', () => {
    const { container } = mount(
      <ReadOnlyBlock tag="Ask your AI this">Draft a status update for my manager.</ReadOnlyBlock>,
    );
    expect(container.querySelector('.tag')?.textContent).toBe('Ask your AI this');
    expect(container.querySelector('.readonly')?.textContent).toContain(
      'Draft a status update for my manager.',
    );
  });

  it('has a labeled copy control, not a plain unlabeled icon button', () => {
    const { container } = mount(<ReadOnlyBlock tag="Ask your AI this">Hello</ReadOnlyBlock>);
    const copy = container.querySelector('.copy')!;
    expect(copy.getAttribute('aria-label')).toBe('Copy to clipboard');
  });

  it('copies the exact block text to the clipboard and calls onCopy', async () => {
    const onCopy = vi.fn();
    const { container } = mount(
      <ReadOnlyBlock tag="Ask your AI this" onCopy={onCopy}>
        Exact text, byte for byte.
      </ReadOnlyBlock>,
    );
    const copy = container.querySelector('.copy') as HTMLButtonElement;
    await act(async () => {
      copy.click();
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Exact text, byte for byte.');
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('never renders its content as an editable field', () => {
    const { container } = mount(<ReadOnlyBlock tag="Ask your AI this">Hello</ReadOnlyBlock>);
    expect(container.querySelector('input, textarea, [contenteditable="true"]')).toBeNull();
  });
});
