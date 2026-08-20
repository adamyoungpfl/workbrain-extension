import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'ai';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  /** Label changes to a verb in progress. No spinner-only states. */
  loading?: boolean;
  loadingLabel?: string;
  children: ReactNode;
}

/**
 * Exactly one primary per screen. Quiet (skip/cancel) is never disabled —
 * escape hatches must always be available. See docs/design-system.html §04.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Working…',
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...rest} className={classes} disabled={disabled || loading} aria-busy={loading}>
      {loading ? loadingLabel : children}
    </button>
  );
}
