import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import './Sheet.css';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /**
   * V2.5 VB-119 — the full-height posture: the card runs the whole panel
   * with the backdrop dimming what little shows behind it, which is Adam's
   * "the app pauses" built on the sanctioned mechanism rather than beside
   * it. Everything else — the non-modal dialog semantics, Escape, the focus
   * hand-back — is identical to the bottom sheet, deliberately: one
   * component, two heights, zero new overlay grammar.
   */
  full?: boolean;
  /** A hook for the caller's own contents styling (e.g. `.assist-sheet`).
   * The card's own classes stay — this only ever adds. */
  className?: string | undefined;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The only overlay in the system, and never a modal dialog — see
 * docs/GUARDRAILS.md ("nothing here is destructive enough to need
 * confirming"). role="dialog" aria-modal="false" is the correct ARIA
 * pattern for a non-modal overlay: it names the region without telling
 * assistive tech the rest of the page is inert.
 */
export function Sheet({ open, onClose, title, full = false, className, children }: SheetProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    cardRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      restoreRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={cardRef}
        className={['sheet-card', full ? 'sheet-card--full' : '', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="sheet-head">
          <h3 id={titleId}>{title}</h3>
          <button type="button" className="sheet-close" aria-label="Close" onClick={onClose}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
