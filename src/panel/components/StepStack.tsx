import type { ReactNode } from 'react';
import { playTick } from '../voice/clips';
import { useNarratorPref } from '../voice/prefs';
import './StepStack.css';

/**
 * THE STEP STACK (V3.0 pass 3i; Adam: "I want to refine this format of
 * question type as it will get used again in later questions to break
 * down multi-step steps like the validation loops").
 *
 * A vertical checklist accordion with three states a greyscale screen
 * keeps whole:
 *
 *   dormant — a compact row: hollow check, pictogram, caption. Untouched.
 *   active  — the row TRANSFORMS: the pictogram and caption become a
 *             side-by-side lockup in the top-left corner, and the step's
 *             detail (its instruction, its choice, its input) fills the
 *             expanded space beneath.
 *   done    — visited but not active: the check fills, and the row keeps
 *             a FADED wash of the working tint - "already done, not the
 *             current item" (Adam's words, almost verbatim).
 *
 * The FIRST activation of any step plays the check-off chime
 * (cues/tick.m4a) - a UI sound, so it honors the one audio control the
 * person has: muted narrator, muted chime. State never rides colour or
 * sound alone: the check glyph and aria-expanded carry it everywhere.
 *
 * The stack OWNS no sequence: every press is the person's, no
 * auto-advance (docs/GUARDRAILS.md), and the parent owns which step is
 * active and what each detail holds - this component is the grammar, not
 * the content.
 */
export interface StepStackStep {
  id: string;
  caption: string;
  /** The stroke pictogram — aria-hidden scenery; the caption carries it. */
  art: ReactNode;
  /** The expanded space: the instruction, the choice, the input. */
  detail: ReactNode;
}

export interface StepStackProps {
  steps: readonly StepStackStep[];
  active: string;
  /** Steps that have been activated at least once. */
  visited: ReadonlySet<string>;
  onActivate: (id: string) => void;
}

export function StepStack({ steps, active, visited, onActivate }: StepStackProps) {
  const { on: soundOn } = useNarratorPref();
  return (
    <ol className="stepstack">
      {steps.map((step) => {
        const isActive = step.id === active;
        const isDone = !isActive && visited.has(step.id);
        return (
          <li
            key={step.id}
            className="stepstack-item"
            data-state={isActive ? 'active' : isDone ? 'done' : 'dormant'}
          >
            <button
              type="button"
              className="stepstack-row"
              aria-expanded={isActive}
              onClick={() => {
                if (!visited.has(step.id) && soundOn) playTick();
                onActivate(step.id);
              }}
            >
              <span className="stepstack-check" aria-hidden="true">
                {visited.has(step.id) && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 6.4 4.8 9 10 3.4" />
                  </svg>
                )}
              </span>
              <span className="stepstack-lockup">
                {step.art}
                <span className="stepstack-cap">{step.caption}</span>
              </span>
            </button>
            {isActive && <div className="stepstack-detail">{step.detail}</div>}
          </li>
        );
      })}
    </ol>
  );
}
