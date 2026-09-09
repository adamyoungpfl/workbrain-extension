/**
 * V3.0 pass 4i (Adam): "For the back button, add an icon to the left of the
 * word so it is clear it is a navigation button mark." One chevron, drawn
 * inline like every other glyph in the panel, decorative beside the word
 * that does the talking — the hubs wrap it and their label in `.hub-back`.
 */
export function BackGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
