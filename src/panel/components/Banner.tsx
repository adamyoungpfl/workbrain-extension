import type { ReactNode } from 'react';
import './Banner.css';

export type BannerVariant = 'default' | 'info' | 'good';

const ICONS: Record<BannerVariant, ReactNode> = {
  default: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.8v4.6l3 1.8" />
    </svg>
  ),
  info: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.01" strokeLinecap="round" />
    </svg>
  ),
  good: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 12.5l5 5 11-11" />
    </svg>
  ),
};

export interface BannerProps {
  variant?: BannerVariant | undefined;
  title: string;
  children: ReactNode;
  /** e.g. a Button — "Answer 2 questions" */
  action?: ReactNode;
  /**
   * A reusable component can't know how deep it's nested. Defaults to the
   * level shown in docs/design-system.html; callers whose surrounding
   * heading structure differs must pass the level that keeps document order
   * from skipping a level (axe: heading-order).
   */
  headingLevel?: 2 | 3 | 4 | 5 | 6 | undefined;
}

/** A banner always says why it appeared, in the person's own words, and what fixes it. */
export function Banner({ variant = 'default', title, children, action, headingLevel = 5 }: BannerProps) {
  const classes = ['banner', variant !== 'default' ? variant : ''].filter(Boolean).join(' ');
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <div className={classes}>
      <span className="bi">{ICONS[variant]}</span>
      <div>
        <Heading>{title}</Heading>
        <p>{children}</p>
        {action}
      </div>
    </div>
  );
}
