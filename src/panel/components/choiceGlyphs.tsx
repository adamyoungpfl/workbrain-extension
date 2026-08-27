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

/**
 * V2.4 VB-108 — the three scope glyphs for context_scope's vertical pick
 * list, one per choice, keyed by the ported option KEYS (source.ts's own
 * `work` / `personal` / `both` — the values, never the labels, so a reworded
 * label costs nothing here). Same convention and same decorative contract as
 * the personas above: the label is the whole accessible name, and the drawing
 * is the vertical list's "icon per choice" (decision 10). A briefcase for
 * work, a house for personal, and the two grounds interlocking for both —
 * "both" is deliberately a picture of overlap rather than a third object,
 * because that is what the answer means.
 */
export const SCOPE_GLYPHS: Record<string, ReactElement> = {
  work: glyph([
    <path key="case" d="M4 10.1a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7.1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />,
    <path key="handle" d="M9.4 8.1V6.3a1.7 1.7 0 0 1 1.7-1.7h1.8a1.7 1.7 0 0 1 1.7 1.7v1.8" />,
    <path key="seam" d="M4 12.9h16" />,
  ]),
  personal: glyph([
    <path key="roof" d="M4.4 11.6L12 4.7l7.6 6.9" />,
    <path key="walls" d="M6.3 10.4v8.9h11.4v-8.9" />,
    <path key="door" d="M10.4 19.3v-4.7h3.2v4.7" />,
  ]),
  both: glyph([
    <circle key="left" cx="9.3" cy="12" r="5.5" />,
    <circle key="right" cx="14.7" cy="12" r="5.5" />,
  ]),
};

/**
 * V2.5 VB-122 — the divided line's drawings, keyed by role_for's option KEYS
 * (the reshaped list core/flow/overrides.ts authors — the five offered plus
 * the three ported keys held for old files). Same convention and the same
 * decorative contract as everything above: the label is the whole accessible
 * name; the drawing is dim/black-and-white on the line's left and full colour
 * on its right, but that is CSS's doing (DividedLine.css) — the strokes here
 * are `currentColor` and say nothing on their own.
 *
 * The figures: one for myself; a taller and a smaller for family; three in a
 * row for a team; two speech bubbles for clients (the relationship is the
 * conversation, twice over — same drawing for the ported "clients", same
 * concept); a ring of heads for community. The held employer key reuses the
 * scope briefcase — an employer IS the work object — and organization is a
 * columned building.
 */
export const ROLE_FOR_GLYPHS: Record<string, ReactElement> = {
  myself: glyph([
    <path key="head" d="M12 11.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8z" />,
    <path key="body" d="M5.6 20.2a6.4 6.4 0 0 1 12.8 0" />,
  ]),
  family: glyph([
    <path key="head" d="M9.4 10.4a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />,
    <path key="body" d="M4 20.2a5.4 5.4 0 0 1 10.8 0" />,
    <path key="head2" d="M17 12.6a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z" />,
    <path key="body2" d="M16.2 15.6a4 4 0 0 1 4 4.6" />,
  ]),
  team: glyph([
    <path key="head" d="M12 9.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z" />,
    <path key="body" d="M7.6 18.6a4.6 4.6 0 0 1 8.8 0" />,
    <path key="head-l" d="M5.4 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
    <path key="body-l" d="M2.2 17.8a3.5 3.5 0 0 1 3.1-2.9" />,
    <path key="head-r" d="M18.6 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />,
    <path key="body-r" d="M21.8 17.8a3.5 3.5 0 0 0-3.1-2.9" />,
  ]),
  'my-clients': glyph([
    <path key="bubble" d="M4 5.8h10.4a1.6 1.6 0 0 1 1.6 1.6v4.2a1.6 1.6 0 0 1-1.6 1.6H9.6L6.4 16v-2.8H4a1.6 1.6 0 0 1-1.6-1.6V7.4A1.6 1.6 0 0 1 4 5.8z" />,
    <path key="reply" d="M18.6 10.2h1.4a1.6 1.6 0 0 1 1.6 1.6v4.2a1.6 1.6 0 0 1-1.6 1.6h-2.4V20l-3.2-2.4h-3" />,
  ]),
  community: glyph([
    <path key="head-t" d="M12 7.6a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z" />,
    <path key="head-l" d="M5.6 15.4a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z" />,
    <path key="head-r" d="M18.4 15.4a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z" />,
    <path key="ring" d="M8.4 19.6a6.9 6.9 0 0 1 7.2 0" />,
    <path key="link-l" d="M7.4 9.5a7 7 0 0 0-1.5 2.7" />,
    <path key="link-r" d="M16.6 9.5a7 7 0 0 1 1.5 2.7" />,
  ]),
  employer: SCOPE_GLYPHS.work!,
  clients: glyph([
    <path key="bubble" d="M4 5.8h10.4a1.6 1.6 0 0 1 1.6 1.6v4.2a1.6 1.6 0 0 1-1.6 1.6H9.6L6.4 16v-2.8H4a1.6 1.6 0 0 1-1.6-1.6V7.4A1.6 1.6 0 0 1 4 5.8z" />,
    <path key="reply" d="M18.6 10.2h1.4a1.6 1.6 0 0 1 1.6 1.6v4.2a1.6 1.6 0 0 1-1.6 1.6h-2.4V20l-3.2-2.4h-3" />,
  ]),
  organization: glyph([
    <path key="pediment" d="M3.6 8.6L12 3.8l8.4 4.8" />,
    <path key="base" d="M4.4 20.2h15.2" />,
    <path key="col1" d="M6.6 11v6.6" />,
    <path key="col2" d="M10.2 11v6.6" />,
    <path key="col3" d="M13.8 11v6.6" />,
    <path key="col4" d="M17.4 11v6.6" />,
  ]),
};

/**
 * VB-122 — the drawing a custom entry wears on the line: a written tag,
 * because a custom answer is the person's own word for it. One generic glyph
 * for every custom string, decorative like all the rest.
 */
export const LINE_CUSTOM_GLYPH: ReactElement = glyph([
  <path key="tag" d="M12.8 3.6h6.2a1.4 1.4 0 0 1 1.4 1.4v6.2L11.2 20.4a1.9 1.9 0 0 1-2.7 0l-5-5a1.9 1.9 0 0 1 0-2.7z" />,
  <circle key="hole" cx="16.3" cy="7.7" r="1.3" />,
]);

/**
 * V2.5 VB-123 — the merged role screen's drawings, keyed question-then-option
 * so Flow.tsx can dress either facet from one map. The standing three are one
 * drawing at three strengths — a share-of-time dial whose filled wedge is the
 * answer (large, half, sliver): "primary / secondary / occasional" is a size
 * claim, so the icons make the same claim in the same object. The filled
 * wedge is the REPHRASE_ICON dot's precedent — a filled sub-shape inside a
 * stroke drawing. Durability: a clock face for current, an archive box for
 * history. All decorative; the labels carry the words.
 */
export const PAIR_GLYPHS: Record<string, Record<string, ReactElement>> = {
  role_standing: {
    primary: glyph([
      <circle key="dial" cx="12" cy="12" r="8.2" />,
      <path key="share" d="M12 12V5.2a6.8 6.8 0 1 1-6.3 9.4z" fill="currentColor" stroke="none" />,
    ]),
    secondary: glyph([
      <circle key="dial" cx="12" cy="12" r="8.2" />,
      <path key="share" d="M12 12V5.2a6.8 6.8 0 0 1 0 13.6z" fill="currentColor" stroke="none" />,
    ]),
    occasional: glyph([
      <circle key="dial" cx="12" cy="12" r="8.2" />,
      <path key="share" d="M12 12V5.2a6.8 6.8 0 0 1 4.8 2z" fill="currentColor" stroke="none" />,
    ]),
  },
  role_durability: {
    current: glyph([
      <circle key="face" cx="12" cy="12" r="8.2" />,
      <path key="hands" d="M12 7.6V12l3.4 2" />,
    ]),
    historical: glyph([
      <path key="lid" d="M3.8 5.4h16.4v3.8H3.8z" />,
      <path key="box" d="M5.4 9.2v9a1.6 1.6 0 0 0 1.6 1.6h10a1.6 1.6 0 0 0 1.6-1.6v-9" />,
      <path key="slot" d="M9.8 13h4.4" />,
    ]),
  },
};
