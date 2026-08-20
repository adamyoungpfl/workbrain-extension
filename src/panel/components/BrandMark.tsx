import './BrandMark.css';

/**
 * The Model Citizen node-graph mark — an icosahedron drawn as twelve nodes
 * and their thirty edges. V1.1 VB-01.
 *
 * PORTED, NOT INVENTED. The geometry below is transcribed exactly from
 * `../modelcitizen/public/mark.svg`, which is itself a single-frame export of
 * the marketing site's rotating version. Every coordinate, radius, stroke
 * width and stroke opacity is the source export's own — the varying radii and
 * line opacities are what make a flat drawing read as a sphere, so rounding
 * them to something tidier would flatten it.
 *
 * THREE DELIBERATE DIFFERENCES FROM THE SOURCE:
 *
 * 1. No animation of any kind lives in the SVG. The source has a per-node
 *    `blink` keyframe running forever; the sibling app's React version
 *    rotates the whole thing on a requestAnimationFrame loop. A side panel is
 *    a working surface that stays open for a fifteen-minute interview —
 *    something pulsing in the corner of it the whole time is a cost with no
 *    benefit. The only motion here is a single fade-and-scale on mount, in
 *    BrandMark.css, skipped entirely under `prefers-reduced-motion`.
 *
 * 2. Colours come from `--brand-*` tokens, applied through BrandMark.css
 *    classes rather than the source's inline hex. No hex literal may exist
 *    outside the generated tokens.css (docs/GUARDRAILS.md, enforced by
 *    `npm run audit` and tests/tokens.test.mjs). The classes carry the colour
 *    and nothing else, so the geometry stays readable as data.
 *
 * 3. This is the one component in the panel that is NOT stroke-based
 *    `currentColor` like Home's PERSON_ICON. It is a multi-colour brand mark
 *    and that is the point of it. It is also purely decorative: it is
 *    `aria-hidden`, and the real, selectable word "Workbrain" always sits
 *    directly beneath it — so nothing here is distinguished by colour alone
 *    and no contrast ratio is claimed for these values.
 */

/** [x1, y1, x2, y2, strokeWidth, strokeOpacity] — source order preserved. */
const EDGES: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [72.93, 44.18, 167.07, 34.04, 3.96, 0.69],
  [72.93, 44.18, 153.91, 88.43, 4.51, 0.83],
  [72.93, 44.18, 86.09, 51.58, 3.57, 0.59],
  [72.93, 44.18, 22.89, 116.82, 3.88, 0.67],
  [72.93, 44.18, 64.8, 139.59, 4.46, 0.81],
  [167.07, 34.04, 153.91, 88.43, 4.25, 0.76],
  [167.07, 34.04, 86.09, 51.58, 3.31, 0.53],
  [167.07, 34.04, 175.2, 100.41, 3.2, 0.5],
  [167.07, 34.04, 217.11, 123.18, 3.78, 0.65],
  [72.93, 205.96, 167.07, 195.82, 3.44, 0.56],
  [72.93, 205.96, 153.91, 188.42, 4.09, 0.72],
  [72.93, 205.96, 86.09, 151.57, 3.15, 0.49],
  [72.93, 205.96, 22.89, 116.82, 3.62, 0.6],
  [72.93, 205.96, 64.8, 139.59, 4.2, 0.75],
  [167.07, 195.82, 153.91, 188.42, 3.83, 0.66],
  [167.07, 195.82, 86.09, 151.57, 2.89, 0.42],
  [167.07, 195.82, 175.2, 100.41, 2.94, 0.44],
  [167.07, 195.82, 217.11, 123.18, 3.52, 0.58],
  [153.91, 188.42, 153.91, 88.43, 4.64, 0.86],
  [153.91, 188.42, 217.11, 123.18, 4.17, 0.74],
  [153.91, 188.42, 64.8, 139.59, 4.59, 0.85],
  [153.91, 88.43, 217.11, 123.18, 4.33, 0.78],
  [153.91, 88.43, 64.8, 139.59, 4.75, 0.89],
  [86.09, 151.57, 86.09, 51.58, 2.76, 0.39],
  [86.09, 151.57, 175.2, 100.41, 2.65, 0.36],
  [86.09, 151.57, 22.89, 116.82, 3.07, 0.47],
  [86.09, 51.58, 175.2, 100.41, 2.81, 0.4],
  [86.09, 51.58, 22.89, 116.82, 3.23, 0.51],
  [175.2, 100.41, 217.11, 123.18, 3.28, 0.52],
  [22.89, 116.82, 64.8, 139.59, 4.12, 0.73],
];

/**
 * [cx, cy, r, gradient] — source order preserved, which is smallest radius
 * first. That order IS the depth cue: SVG paints in document order, so the
 * far (small) nodes end up behind the near (large) ones. Sorting these would
 * break the drawing.
 */
const NODES: ReadonlyArray<readonly [number, number, number, number]> = [
  [86.09, 151.57, 6.5, 2],
  [175.2, 100.41, 6.73, 4],
  [86.09, 51.58, 7.22, 3],
  [167.07, 195.82, 7.83, 4],
  [22.89, 116.82, 8.63, 1],
  [167.07, 34.04, 9.0, 2],
  [72.93, 205.96, 9.0, 3],
  [217.11, 123.18, 9.37, 5],
  [72.93, 44.18, 10.17, 1],
  [153.91, 188.42, 10.78, 5],
  [64.8, 139.59, 11.27, 2],
  [153.91, 88.43, 11.5, 1],
];

const GRADIENTS = [1, 2, 3, 4, 5] as const;

export interface BrandMarkProps {
  /** Rendered size in px, square. The viewBox is 240×240 regardless. */
  size?: number;
}

export function BrandMark({ size = 96 }: BrandMarkProps) {
  return (
    <svg
      className="brand-mark"
      width={size}
      height={size}
      viewBox="0 0 240 240"
      // Decorative: the wordmark next to it carries the name. Nothing in the
      // mark is information the person needs read out.
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {GRADIENTS.map((n) => (
          // Gradient ids are document-global in SVG. Prefixed rather than
          // bare `g1` so a second inline SVG on the same screen can never
          // collide with these. Only one BrandMark renders today, so a
          // useId() per instance would buy nothing and cost the markup its
          // stability under test.
          <linearGradient key={n} id={`wb-mark-g${n}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className={`brand-mark-node-${n}-from`} />
            <stop offset="100%" className={`brand-mark-node-${n}-to`} />
          </linearGradient>
        ))}
      </defs>
      <g className="brand-mark-edges">
        {EDGES.map(([x1, y1, x2, y2, width, opacity], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            strokeWidth={width}
            strokeOpacity={opacity}
            strokeLinecap="round"
          />
        ))}
      </g>
      {NODES.map(([cx, cy, r, gradient], i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill={`url(#wb-mark-g${gradient})`} />
      ))}
    </svg>
  );
}
