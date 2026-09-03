import './PeaksMark.css';

/**
 * W PEAKS, the drawn face (V3.0 pass 4; Adam, 2026-09-02: "With the new
 * favicon, I think we create a new animated version of the logo for the
 * splash page and to replace the logo as the voice and mute on the app").
 *
 * The EXACT geometry of the shipped icon (design/icon-peaks.svg) — three
 * erratic peaks, the W living in the valleys between them — drawn with
 * token colors so the audit's no-literals law holds where the static SVG
 * file could not be reused. Each peak carries `transform-box: fill-box`
 * so a host can scale it from ITS OWN base: the narrator mark makes the
 * peaks dance on the voice's word boundaries, the splash intro raises
 * them one by one as the card builds. This component is only the drawing;
 * every animation belongs to the host's stylesheet.
 */
export function PeaksSvg({ size }: { size: number }) {
  return (
    <svg
      className="peaksmark-face"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="peaksmark-peak"
        d="M 3 56 L 16 13 L 29 56 Z"
        style={{ fill: 'var(--globe-node-2-solid)', stroke: 'var(--globe-node-2-solid)' }}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        className="peaksmark-peak"
        d="M 21 56 L 33 24 L 45 56 Z"
        style={{ fill: 'var(--splash-peak-blue)', stroke: 'var(--splash-peak-blue)' }}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <path
        className="peaksmark-peak"
        d="M 37 56 L 50 8 L 61 56 Z"
        style={{ fill: 'var(--splash-link-end)', stroke: 'var(--splash-link-end)' }}
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
