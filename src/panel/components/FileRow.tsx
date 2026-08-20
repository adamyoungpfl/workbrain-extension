import type { ReactNode } from 'react';
import './FileRow.css';

export type BadgeTone = 'fresh' | 'due' | 'next';

const FILE_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="M6 2.5h8l4 4v15H6z" />
    <path d="M14 2.5v4h4" />
  </svg>
);

export interface FileRowProps {
  name: string;
  subtitle: string;
  badge?: { label: string; tone?: BadgeTone | undefined } | undefined;
  /** A locked row explains what unlocks it, in the row, without a tooltip. */
  locked?: boolean | undefined;
  onClick?: (() => void) | undefined;
  icon?: ReactNode;
  /** the tinted icon swatch used for e.g. "Talk to a person" */
  iconTone?: 'default' | 'primary' | undefined;
  /**
   * Renders as a real `<a href>` instead of a `<button>` — for a genuine
   * external link (Home's "Talk to a person" row, R1-12), so right-click /
   * open-in-new-tab / the browser's own status-bar URL preview all behave
   * like a real link rather than a JS handler pretending to be one. Opens in
   * a new tab (`target="_blank" rel="noopener noreferrer"`) since navigating
   * the side panel document itself away from the extension would strand it.
   * Mutually exclusive with `onClick`/`locked`, which only make sense for
   * the button form.
   */
  href?: string | undefined;
}

/** The OS made physical: a row of files, each a single tap away. */
export function FileRow({
  name,
  subtitle,
  badge,
  locked = false,
  onClick,
  icon = FILE_ICON,
  iconTone = 'default',
  href,
}: FileRowProps) {
  const classes = ['filerow', locked ? 'locked' : ''].filter(Boolean).join(' ');
  const content = (
    <>
      <span className={['ic', iconTone === 'primary' ? 'ic-primary' : ''].filter(Boolean).join(' ')}>
        {icon}
      </span>
      <span>
        <span className="nm">{name}</span>
        <span className="sb">{subtitle}</span>
      </span>
      {badge && (
        <span className={['badge', badge.tone ?? ''].filter(Boolean).join(' ')}>{badge.label}</span>
      )}
    </>
  );

  if (href) {
    return (
      <a className={classes} href={href} target="_blank" rel="noopener noreferrer">
        {content}
      </a>
    );
  }

  return (
    <button type="button" className={classes} disabled={locked} onClick={onClick}>
      {content}
    </button>
  );
}
