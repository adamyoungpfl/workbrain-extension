import './ReadOnlyBlock.css';

export interface ReadOnlyBlockProps {
  /** e.g. "Ask your AI this" */
  tag: string;
  children: string;
  onCopy?: (() => void) | undefined;
}

/**
 * Carries the product's trust story: anything Workbrain generates for the
 * person's AI, and anything their AI generated back, appears here — visibly
 * not-a-form, visibly theirs to copy, visibly untouched. Never editable.
 * The panel never parses, scores, or stores what's inside it.
 */
export function ReadOnlyBlock({ tag, children, onCopy }: ReadOnlyBlockProps) {
  function copy() {
    navigator.clipboard?.writeText(children).then(onCopy, () => {});
  }

  return (
    <div className="readonly">
      <span className="tag">{tag}</span>
      {children}
      <button type="button" className="copy" aria-label="Copy to clipboard" onClick={copy}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
    </div>
  );
}
