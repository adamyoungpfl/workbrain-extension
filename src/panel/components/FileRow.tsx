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
}: FileRowProps) {
  return (
    <button
      type="button"
      className={['filerow', locked ? 'locked' : ''].filter(Boolean).join(' ')}
      disabled={locked}
      onClick={onClick}
    >
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
    </button>
  );
}
