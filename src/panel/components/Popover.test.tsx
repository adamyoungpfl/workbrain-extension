import { describe, it, expect, vi, afterEach } from 'vitest';
import { act } from 'react';
import type { RefObject } from 'react';
import { Popover } from './Popover';
import { mount } from './testUtils';

/**
 * V2.4 VB-107 — the popover's contract, pinned where jsdom can hold it
 * (geometry and the real focus dance live in tests/e2e/interview-me.spec.ts):
 *
 *  - non-modal by construction: no role, no aria-modal, children rendered
 *    in place — FLAG 1's line, asserted so a helpful refactor cannot cross
 *    it quietly;
 *  - Escape dismisses from anywhere and hands focus to the trigger;
 *  - a press outside dismisses; a press inside does not; a press on the
 *    TRIGGER does not (toggling is the trigger's own business — a mousedown
 *    that dismissed followed by the click that reopens would make the
 *    button unable to close its own popover);
 *  - focus is only rescued to the trigger when it was inside the popover;
 *    a press toward some other control leaves focus alone (nothing steals
 *    focus, docs/GUARDRAILS.md);
 *  - unmounting detaches the document listeners.
 */

const mounted: Array<() => void> = [];

function setup(onDismiss = vi.fn()) {
  const trigger = document.createElement('button');
  trigger.textContent = 'open';
  document.body.appendChild(trigger);
  const triggerRef: RefObject<HTMLElement | null> = { current: trigger };
  const view = mount(
    <Popover id="pop" className="extra" triggerRef={triggerRef} onDismiss={onDismiss}>
      <button type="button" className="inside">
        copy
      </button>
    </Popover>,
  );
  // Idempotent, because one test unmounts mid-test (to silence the first
  // popover's document listeners) and the afterEach sweep runs regardless.
  let gone = false;
  const unmount = () => {
    if (gone) return;
    gone = true;
    view.unmount();
    trigger.remove();
  };
  mounted.push(unmount);
  return { trigger, onDismiss, container: view.container, unmount };
}

function pressEscape() {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
}

function mouseDownOn(target: EventTarget) {
  act(() => {
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
}

afterEach(() => {
  while (mounted.length) mounted.pop()!();
});

describe('Popover (VB-107)', () => {
  it('renders its children in an identified, role-less container — a popover, not a modal (FLAG 1)', () => {
    const { container } = setup();
    const pop = container.querySelector('#pop')!;
    expect(pop.classList.contains('popover')).toBe(true);
    expect(pop.classList.contains('extra')).toBe(true);
    expect(pop.querySelector('.inside')).not.toBeNull();
    // The non-modal claims: nothing here may ever announce itself as a
    // dialog or fence the rest of the page off.
    expect(pop.getAttribute('role')).toBeNull();
    expect(pop.getAttribute('aria-modal')).toBeNull();
  });

  it('Escape dismisses from wherever focus is, and hands focus back to the trigger', () => {
    const { trigger, onDismiss, container } = setup();
    container.querySelector<HTMLButtonElement>('.inside')!.focus();
    pressEscape();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('escape');
    expect(document.activeElement).toBe(trigger);
  });

  it('a press outside dismisses; inside and on the trigger do not', () => {
    const { trigger, onDismiss, container } = setup();
    mouseDownOn(container.querySelector('.inside')!);
    expect(onDismiss, 'inside is the popover being used').not.toHaveBeenCalled();
    mouseDownOn(trigger);
    expect(onDismiss, 'the trigger is its own toggle').not.toHaveBeenCalled();
    mouseDownOn(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('outside');
  });

  it('an outside press rescues focus to the trigger only when it was inside the popover', () => {
    // Focus elsewhere: the person is somewhere else and stays there.
    const first = setup();
    const elsewhere = document.createElement('button');
    document.body.appendChild(elsewhere);
    mounted.push(() => elsewhere.remove());
    elsewhere.focus();
    mouseDownOn(document.body);
    expect(first.onDismiss).toHaveBeenCalledTimes(1);
    expect(first.onDismiss).toHaveBeenCalledWith('outside');
    expect(document.activeElement, 'focus is never stolen from another control').toBe(elsewhere);
    first.unmount();

    // Focus inside: about to be stranded on an unmounting element, so it is
    // handed back to the trigger instead of dropping to <body>.
    const second = setup();
    second.container.querySelector<HTMLButtonElement>('.inside')!.focus();
    mouseDownOn(document.body);
    expect(second.onDismiss).toHaveBeenCalledTimes(1);
    expect(second.onDismiss).toHaveBeenCalledWith('outside');
    expect(document.activeElement).toBe(second.trigger);
  });

  it('unmounting detaches the document listeners', () => {
    const { onDismiss, unmount } = setup();
    unmount();
    pressEscape();
    mouseDownOn(document.body);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
