import { describe, it, expect, vi } from 'vitest';
import { act, useState } from 'react';
import { Sheet } from './Sheet';
import { mount } from './testUtils';

function click(el: HTMLElement) {
  act(() => el.click());
}
function focus(el: HTMLElement) {
  act(() => el.focus());
}
function press(el: Element, key: string, shiftKey = false) {
  act(() =>
    el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true })),
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button id="trigger" onClick={() => setOpen(true)}>
        Open capture
      </button>
      <Sheet open={open} title="Capture a thought" onClose={() => setOpen(false)}>
        <input id="first" placeholder="First field" />
        <button id="save">Save</button>
      </Sheet>
    </div>
  );
}

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    const { container } = mount(<Sheet open={false} onClose={() => {}} title="t" children="body" />);
    expect(container.querySelector('.sheet-backdrop')).toBeNull();
  });

  it('is a non-modal dialog: role=dialog, aria-modal=false, named by its title', () => {
    const { container } = mount(<Sheet open onClose={() => {}} title="Capture a thought" children="body" />);
    const card = container.querySelector('.sheet-card')!;
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('false');
    const labelledBy = card.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelledBy)?.textContent).toBe('Capture a thought');
  });

  it('clicking the backdrop closes it, clicking inside the card does not', () => {
    const onClose = vi.fn();
    const { container } = mount(<Sheet open onClose={onClose} title="t" children="body" />);
    click(container.querySelector('.sheet-card') as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
    click(container.querySelector('.sheet-backdrop') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button closes it', () => {
    const onClose = vi.fn();
    const { container } = mount(<Sheet open onClose={onClose} title="t" children="body" />);
    click(container.querySelector('.sheet-close') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it', () => {
    const onClose = vi.fn();
    const { container } = mount(<Sheet open onClose={onClose} title="t" children="body" />);
    press(container.querySelector('.sheet-card') as HTMLElement, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the sheet on open and restores it to the trigger that opened it on close', () => {
    const { container } = mount(<Harness />);
    const trigger = container.querySelector('#trigger') as HTMLButtonElement;
    // jsdom's click() doesn't simulate a real browser's focus-follows-click
    // for buttons, so focus it explicitly first to set up the real scenario.
    focus(trigger);
    click(trigger);

    const closeBtn = container.querySelector('.sheet-close') as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn); // first focusable in DOM order

    click(closeBtn);
    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab within the sheet: close button is first in DOM order, #save is last', () => {
    const { container } = mount(<Harness />);
    click(container.querySelector('#trigger') as HTMLButtonElement);
    const save = container.querySelector('#save') as HTMLElement;
    const closeBtn = container.querySelector('.sheet-close') as HTMLElement;

    focus(save);
    press(save, 'Tab');
    expect(document.activeElement).toBe(closeBtn);

    focus(closeBtn);
    press(closeBtn, 'Tab', true);
    expect(document.activeElement).toBe(save);
  });
});
