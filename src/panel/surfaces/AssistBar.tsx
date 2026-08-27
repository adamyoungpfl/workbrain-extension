import { useState } from 'react';
import { Button, ReadOnlyBlock } from '../components';
import { ASSIST_ENCOURAGING_LEAD, assistBarLine } from '../../core/flow/assistCopy';
import { useNarration } from '../voice/useNarration';
import { useNarratorPref } from '../voice/prefs';
import { S } from '../strings';
import './AssistBar.css';

/**
 * V2.8 VB-138 — AI Assist, inline and single-step. The sheet retired
 * (Adam: "handle it all in the single step"); this bar stands exactly
 * where the answer box stood:
 *
 *   press AI Assist → the box collapses, the "AI Assist Activated" tag
 *   marks the spot, and this bar says the whole journey in one line —
 *   copy, carry it to their AI, come back — with the copy control at the
 *   line's end (icon-led), a plain door to their AI beside it (decision
 *   6), and the full prompt behind an expander: present, never assumed
 *   read (its trust chrome is still ReadOnlyBlock — the exact text is one
 *   press from being seen in full before it goes anywhere).
 *
 *   COPYING is the step: the caller clears the tag and reopens the box in
 *   the same spot with the paste instruction. A person who dislikes what
 *   came back is standing where they started — press the chip again, or
 *   just type.
 *
 * The narrator reads the bar's line through the same seam every interview
 * line rides. Copy confirmation is announced by the CALLER's persistent
 * live region — this bar unmounts on copy, and an announcement must
 * outlive the control that caused it.
 */

/**
 * The drawn prompt icon on the copy control — a written page with a folded
 * corner, in the panel's one icon convention (stroke-based, currentColor,
 * aria-hidden because the button carries the words). Moved here from the
 * retired AssistSheet (V2.8 VB-138) with its bytes untouched.
 */
export const ASSIST_PROMPT_ICON = (
  <svg
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <g className="assist-prompt-page">
      <path d="M7 3.5h7l4.5 4.5v12a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M13.5 3.5V8.5h5" />
    </g>
    <g className="assist-prompt-lines">
      <path d="M9 13h6" />
      <path d="M9 16.5h4.5" />
    </g>
  </svg>
);

export interface AssistBarProps {
  /** The full interview-me prompt — interviewMePrompt's output, built by
   * the caller, byte-identical core. */
  prompt: string;
  /** Their AI's printed name (goalServiceLabelFor), or undefined. */
  serviceLabel: string | undefined;
  /** Where that AI lives (assistServiceUrlFor), or undefined for no door. */
  serviceUrl: string | undefined;
  /** VB-120's encouraging wording variant, when opened from the nudge. */
  encouraging?: boolean;
  /** The copy landed on the clipboard — the caller reopens the box. */
  onCopied: () => void;
}

export function AssistBar({ prompt, serviceLabel, serviceUrl, encouraging = false, onCopied }: AssistBarProps) {
  const [expanded, setExpanded] = useState(false);

  const line = assistBarLine(serviceLabel);
  const { on: narratorOn } = useNarratorPref();
  useNarration({ role: 'question', text: encouraging ? `${ASSIST_ENCOURAGING_LEAD} ${line}` : line }, narratorOn);

  function copyPrompt() {
    navigator.clipboard?.writeText(prompt).then(
      () => onCopied(),
      () => {
        // A clipboard that refuses degrades to the expander: the prompt is
        // right there to select by hand, silently (the degradation law).
        setExpanded(true);
      },
    );
  }

  return (
    <div className="assistbar">
      <p className="assistbar-tag">{S.assistActivated}</p>
      {encouraging && <p className="assistbar-lead">{ASSIST_ENCOURAGING_LEAD}</p>}
      <div className="assistbar-row">
        <p className="assistbar-line">{line}</p>
        <Button type="button" variant="primary" className="assistbar-copy" onClick={copyPrompt}>
          {ASSIST_PROMPT_ICON}
          {S.copyPrompt}
        </Button>
      </div>
      <div className="assistbar-quiet">
        <button
          type="button"
          className="assistbar-expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {S.assistReadPrompt}
        </button>
        {serviceLabel && serviceUrl && (
          /* A door, not a hand-off: nothing is sent, nothing filled in —
             the prompt travels on their clipboard and lands where they
             paste it. */
          <a className="assistbar-link" href={serviceUrl} target="_blank" rel="noreferrer">
            {S.assistOpenService(serviceLabel)}
          </a>
        )}
      </div>
      {expanded && (
        <ReadOnlyBlock tag={S.reflectPromptTag} onCopy={onCopied}>
          {prompt}
        </ReadOnlyBlock>
      )}
    </div>
  );
}
