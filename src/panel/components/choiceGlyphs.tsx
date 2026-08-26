import type { ReactElement } from 'react';
import type { ServicePersona } from '../../core/flow/serviceThemes';

/**
 * V2.4 VB-105 — the seven persona glyphs the service chips wear.
 *
 * Hand-authored to the panel's one icon convention (Home.tsx's PERSON_ICON,
 * Flow.tsx's REPHRASE_ICON/IDEA_ICON): stroke-based, `currentColor`,
 * `aria-hidden` — the chip's own label carries the words, and the persona is
 * design-only (FLAG 4), so a glyph that spoke would be saying a thing the
 * product decided not to say.
 *
 * EVOCATIVE, NEVER LITERAL. No service's trademarked mark, ever — not
 * redrawn, not "inspired by", not at any size. Each drawing is a generic
 * object for the persona: a crown for the Aristocrat, an open book for the
 * Scholar, a note for the Muse (muse and music share a root), two figures for
 * the Colleague, a magnifier for the Investigator, a compass for the
 * Explorer, a rocket for the Innovator. Deliberately none of these is any
 * vendor's logo grammar (no knots, no four-point sparkles, no sunbursts).
 *
 * Exported as a map keyed by persona so the lookup is data
 * (core/flow/serviceThemes.ts decides who wears what) and this file only
 * decides what each costume looks like. choiceGlyphs.test.tsx holds the
 * census — every persona has a glyph, every glyph is decorative.
 */

const glyph = (children: ReactElement | ReactElement[]) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const PERSONA_GLYPHS: Record<ServicePersona, ReactElement> = {
  /** A three-point crown over its band. */
  aristocrat: glyph([
    <path key="crown" d="M5 16.3L5.4 8.9l3.8 3.4L12 7.1l2.8 5.2 3.8-3.4.4 7.4z" />,
    <path key="band" d="M5.9 19.4h12.2" />,
  ]),
  /** An open book: two page curves about a spine. */
  scholar: glyph([
    <path key="pages" d="M12 6.4c-1.8-1.4-4.1-1.9-6.9-1.6v12.6c2.8-.3 5.1.2 6.9 1.6 1.8-1.4 4.1-1.9 6.9-1.6V4.8c-2.8-.3-5.1.2-6.9 1.6z" />,
    <path key="spine" d="M12 6.4v12.6" />,
  ]),
  /** An eighth note — muse and music share a root. */
  muse: glyph([
    <path key="head" d="M10.9 17.4a2.5 2.1 0 1 1-5 0 2.5 2.1 0 0 1 5 0z" />,
    <path key="stem" d="M10.9 17.4V5.6" />,
    <path key="flag" d="M10.9 5.6c2.9.7 4.9 2.1 5.3 4.8" />,
  ]),
  /** Two figures, one a step behind the other. */
  colleague: glyph([
    <path key="head" d="M9.2 11.6a3.1 3.1 0 1 0 0-6.2 3.1 3.1 0 0 0 0 6.2z" />,
    <path key="body" d="M3.7 19.6a5.5 5.5 0 0 1 11 0" />,
    <path key="head2" d="M15.6 5.7a3.1 3.1 0 0 1 0 5.7" />,
    <path key="body2" d="M16.8 14.5a5.5 5.5 0 0 1 3.6 5.1" />,
  ]),
  /** A magnifying glass. */
  investigator: glyph([
    <path key="lens" d="M10.7 16.3a5.6 5.6 0 1 0 0-11.2 5.6 5.6 0 0 0 0 11.2z" />,
    <path key="handle" d="M14.9 14.9l5 5" />,
  ]),
  /** A compass: the ring and its needle. */
  explorer: glyph([
    <path key="ring" d="M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8z" />,
    <path key="needle" d="M15.2 8.8l-1.8 4.6-4.6 1.8 1.8-4.6z" />,
  ]),
  /** A rocket, mid-launch. */
  innovator: glyph([
    <path key="body" d="M12 2.9c2.5 1.9 3.9 4.8 3.9 8.2 0 1.5-.3 3-.9 4.4H9c-.6-1.4-.9-2.9-.9-4.4 0-3.4 1.4-6.3 3.9-8.2z" />,
    <circle key="window" cx="12" cy="9.9" r="1.7" />,
    <path key="fin-l" d="M9 13.9l-2.5 3.4 3-.5" />,
    <path key="fin-r" d="M15 13.9l2.5 3.4-3-.5" />,
    <path key="flame" d="M12 18.4v2.9" />,
  ]),
};
