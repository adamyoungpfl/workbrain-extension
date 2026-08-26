import { useEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import './Popover.css';

/**
 * V2.4 VB-107 — a thin ANCHORED, NON-MODAL popover. FLAG 1's settlement,
 * spelled out as a contract this component keeps and its test pins:
 *
 *  - It is not a modal and must never grow into one. No focus trap, no
 *    `aria-modal`, no role, no backdrop, no scroll lock. The rest of the
 *    screen keeps working underneath it; Tab walks in one side of it and
 *    out the other because it sits in the document where its trigger put
 *    it, not because anything manages focus.
 *  - It is not a coach mark either (docs/GUARDRAILS.md bans those): it
 *    opens only on the person's own press, floats beside its trigger, and
 *    points at nothing.
 *  - Escape dismisses it from wherever focus happens to be, and hands
 *    focus back to the trigger — the standard way out, and the keyboard
 *    one. A press anywhere outside dismisses it too; that press is the
 *    person moving on, so focus is only rescued back to the trigger when
 *    it was INSIDE the popover and about to be stranded on an unmounted
 *    element. Nothing steals focus (docs/GUARDRAILS.md).
 *
 * Mount-when-open: the caller renders it only while it is open, exactly
 * like Flow.tsx's other disclosures, so "dismiss" is one state change in
 * one place. The trigger keeps `aria-expanded`/`aria-controls` — the
 * disclosure contract, floating.
 *
 * ANCHORING IS THE CALLER'S POSITIONED ANCESTOR: the popover is
 * `position: absolute` (Popover.css) and floats above whatever `relative`
 * container it is rendered into, which is what keeps it beside its trigger
 * at every panel size with no measuring and no listeners.
 */

export type PopoverDismissReason = 'escape' | 'outside';

export interface PopoverProps {
  /** The id `aria-controls` on the trigger names. */
  id: string;
  className?: string | undefined;
  /**
   * The control that opened it. Its own presses are excluded from
   * outside-dismissal — toggling is the trigger's business, and a mousedown
   * that dismissed followed by a click that reopened would make the button
   * unable to close its own popover.
   */
  triggerRef: RefObject<HTMLElement | null>;
  onDismiss: (reason: PopoverDismissReason) => void;
  children: ReactNode;
}

export function Popover({ id, className, triggerRef, onDismiss, children }: PopoverProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  // The latest callback without re-subscribing the document listeners on
  // every render — the standing pattern for document-level effects here.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // Focus first, then dismiss: the popover may hold the focused element
      // (its copy button), and unmounting it first would drop focus on
      // <body> for a frame.
      triggerRef.current?.focus();
      dismissRef.current('escape');
    }
    function onMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      // Only rescue focus that was about to be stranded; a press on some
      // other control is the person going there, and focus follows them.
      if (popRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
      dismissRef.current('outside');
    }
    // `mousedown`, not `click`: dismissal on the press, before any control
    // under the pointer acts, so the popover is gone by the time whatever
    // was pressed does its own thing.
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [triggerRef]);

  return (
    <div ref={popRef} id={id} className={['popover', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
