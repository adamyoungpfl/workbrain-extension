import type { ReactNode } from 'react';
import { S } from '../strings';
import './TourSlide.css';

/**
 * V2.5 VB-114 — the dime tour's slide: one big drawing, the spoken line
 * under it, and the tour's OWN advance button — the standard nav row is
 * hidden on tour steps (Flow.tsx), because a tour that borrows the
 * interview's controls is a tour about the wrong thing. Everything here is
 * still a real interview step underneath: advancing commits the intro
 * exactly as Next always did, the narrator reads the same prompt, and the
 * ladder's skipIf keeps all of it away from anyone already underway.
 *
 * The drawings are the product's own stroke style (Home.tsx's PERSON_ICON
 * convention) — never screenshots of ourselves, never vendor anything.
 * Reduced motion: the slides carry no motion at all; the whole treatment
 * is composition, so there is nothing to still.
 */

export type TourSlideId = 'orientation_ready' | 'wb_canvas' | 'wb_go';

export const TOUR_SLIDE_IDS: readonly string[] = ['orientation_ready', 'wb_canvas', 'wb_go'];

export function usesTourSlide(stepId: string): stepId is TourSlideId {
  return TOUR_SLIDE_IDS.includes(stepId);
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** Slide 1 — why: a person, their file, the spark it hands any AI. */
const WHY_ART = (
  <svg viewBox="0 0 120 72" className="tourslide-art" aria-hidden="true">
    <g {...STROKE}>
      <circle cx="22" cy="24" r="8" />
      <path d="M10 52c1-9 6-14 12-14s11 5 12 14" />
      <rect x="52" y="14" width="26" height="34" rx="3" />
      <path d="M57 23h16M57 30h16M57 37h10" />
      <path d="M40 31h8m36 0h8" />
      <path d="M100 22l3 6 6 1-4.5 4.5 1 6.5-5.5-3-5.5 3 1-6.5L91 29l6-1z" />
    </g>
  </svg>
);

/** Slide 2 — where answers land: the list and the map, one drawing. */
const CANVAS_ART = (
  <svg viewBox="0 0 120 72" className="tourslide-art" aria-hidden="true">
    <g {...STROKE}>
      <rect x="8" y="10" width="46" height="52" rx="4" />
      <circle cx="17" cy="21" r="3" />
      <path d="M24 21h22" />
      <circle cx="17" cy="33" r="3" />
      <path d="M24 33h22" />
      <circle cx="17" cy="45" r="3" />
      <path d="M24 45h16" />
      <path d="M58 36h10" />
      <circle cx="92" cy="36" r="22" />
      <circle cx="92" cy="20" r="3" />
      <circle cx="78" cy="42" r="3" />
      <circle cx="104" cy="44" r="3" />
      <circle cx="94" cy="34" r="3" />
      <path d="M92 23l2 8m-14 9l13-6m10 9l-9-10" />
    </g>
  </svg>
);

/** Slide 3 — how to move: the nav's own three words, drawn in place. */
const GO_ART = (
  <svg viewBox="0 0 120 72" className="tourslide-art" aria-hidden="true">
    <g {...STROKE}>
      <rect x="10" y="26" width="28" height="20" rx="10" />
      <path d="M26 32l-5 4 5 4" />
      <rect x="46" y="22" width="32" height="28" rx="12" />
      <path d="M58 30l7 6-7 6" />
      <rect x="86" y="26" width="24" height="20" rx="10" />
      <path d="M93 36h10m-4-4l4 4-4 4" strokeDasharray="2 3" />
      <path d="M62 58v6m0 0l-3-3m3 3l3-3" />
    </g>
  </svg>
);

const ART: Record<TourSlideId, ReactNode> = {
  orientation_ready: WHY_ART,
  wb_canvas: CANVAS_ART,
  wb_go: GO_ART,
};

export interface TourSlideProps {
  slideId: TourSlideId;
  /** The step's own prompt/beats text — rendered big, already narrated by
   * the flow's existing seams. */
  children: ReactNode;
  onAdvance: () => void;
  /** Present when the person NAVIGATED here (a list row, a Brain node, a
   * Back retreat) — without it a revisited slide would be a room with one
   * door (found by file-tree.spec's navigate-and-return claim). A fresh
   * walk's first slide has no history and shows no Back. */
  onBack?: (() => void) | undefined;
}

export function TourSlide({ slideId, children, onAdvance, onBack }: TourSlideProps) {
  const last = slideId === 'wb_go';
  return (
    <div className="tourslide" data-slide={slideId}>
      {ART[slideId]}
      <div className="tourslide-text">{children}</div>
      <button type="button" className="tourslide-advance" onClick={onAdvance}>
        {last ? S.tourStart : S.tourNext}
      </button>
      {onBack && (
        <button type="button" className="tourslide-back" onClick={onBack}>
          {S.back}
        </button>
      )}
    </div>
  );
}
