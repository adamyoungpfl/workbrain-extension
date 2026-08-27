import { useEffect, useRef, useState } from 'react';
import { Button, Field, ReadOnlyBlock, Sheet } from '../components';
import { ASSIST_ENCOURAGING_LEAD, assistStepLine } from '../../core/flow/assistCopy';
import type { AssistStep } from '../../core/flow/assistCopy';
import { looksLikeFencedReply, normalizePastedReply } from '../../core/flow/interviewMe';
import { useNarration } from '../voice/useNarration';
import { useNarratorPref } from '../voice/prefs';
import { S } from '../strings';
import './AssistSheet.css';

/**
 * V2.5 VB-119 — AI Assist: the paused mini-interview (FLAG 1, sheet
 * treatment CONFIRMED).
 *
 * Pressing the AI Assist chip dims the app and opens THIS — a full-height
 * Sheet (the guardrail-sanctioned overlay: role="dialog" aria-modal="false"
 * and nothing beyond what Sheet already does; Escape closes; focus returns
 * to the chip) walking three steps, each one short line printed AND spoken:
 *
 *   1 · "Next, hit the copy button below." — the prompt (interviewMePrompt,
 *       byte-identical core) in ReadOnlyBlock's trust chrome, with the copy
 *       control below it GLOWING via the flow's one sanctioned attention
 *       cue (`.flow-highlight`). Copy auto-advances: the copy completing is
 *       the step completing, the same reasoning as VB-107's popover
 *       dismissing itself on copy.
 *   2 · "Paste it into <their AI>." — the service resolved exactly the way
 *       the reflect voice line resolves it (the caller passes
 *       goalServiceLabelFor's answer), a plain LINK that opens the service
 *       in the browser (core/flow/assistServices.ts's map; 'other' gets no
 *       link), and a GENERIC drawn paste-and-send scene — the product's own
 *       stroke style, no vendor UI, reduced-motion still carrying the same
 *       two beats. "I've started the interview" advances.
 *   3 · "Paste what it wrote back into this box." — a highlighted textarea
 *       IN THE SHEET. Submit runs the existing normalizePastedReply path
 *       (fenced replies unwrap; plain text is never reformatted) and hands
 *       the result to the caller, which closes the sheet, lands it in the
 *       question's answer input — ordinary editable text — and pulses the
 *       input once (the VB-106/107 wiring, reused).
 *
 * This REPLACES the VB-107 popover flow outright; the Popover component
 * died with it (nothing else used it — checked). The fenced-paste
 * normalization and all of interviewMe.ts ride underneath, unchanged.
 *
 * VB-120 (FLAG 3): `encouraging` swaps in the nudge's wording variant — one
 * extra lead line on step 1, an offer and never a verdict (the no-guilt law
 * is pinned in assistCopy.test.ts). Everything else is the same sheet.
 *
 * Focus inside the stepped walk: advancing unmounts the control that was
 * pressed, and focus left on a detached node drops a keyboard user at the
 * top of the document — so each new step rescues focus to its own next
 * action (`[data-assist-focus]`). That is the Popover's own stranded-focus
 * rule, not a new one; nothing is stolen from a control still on screen.
 * Step 3 focuses the box itself, because the box IS the instruction and a
 * focused box is one keystroke (paste) from done.
 */

/**
 * The drawn prompt icon on the copy control — a written page with a folded
 * corner, in the panel's one icon convention (Home.tsx's PERSON_ICON:
 * stroke-based, `currentColor`, `aria-hidden` because the button carries
 * the words). A page and not a clipboard because the thing being carried
 * off is a written prompt — lines on paper — and the clipboard glyph
 * already means "copy" on ReadOnlyBlock's own button one element up.
 *
 * Exported for its unit test: the path data is a transcription, and
 * character-for-character is the only assertion that catches a digit lost
 * in a refactor (the REPHRASE_ICON convention).
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

/**
 * Step 2's paste-and-send, drawn generic: a composer any chat has (a
 * rounded box), the pasted lines arriving in it, and a send control (a
 * circle with an up arrow — every AI app's own grammar, nobody's logo).
 * NO vendor UI, per the spec — this is "an AI's message box" the way
 * PERSON_ICON is "a person".
 *
 * The two groups are the animation (the IDEA_ICON convention): AssistSheet.css
 * slides `.assist-scene-paste` in and pulses `.assist-scene-send`, on a slow
 * loop. Reduced motion shows the finished frame — lines in the box, send
 * control present — which still reads paste-then-send; the printed step
 * line above carries the instruction in words either way
 * (docs/GUARDRAILS.md: the still version still carries the instruction).
 */
export const ASSIST_SEND_SCENE = (
  <svg
    className="assist-scene"
    viewBox="0 0 120 64"
    width="220"
    height="117"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <g className="assist-scene-composer">
      <rect x="6" y="20" width="108" height="34" rx="10" />
    </g>
    <g className="assist-scene-paste">
      <path d="M16 33h44" />
      <path d="M16 41h30" />
    </g>
    <g className="assist-scene-send">
      <circle cx="98" cy="37" r="9" />
      <path d="M98 41.5v-9" />
      <path d="M94.2 36.2L98 32.4l3.8 3.8" />
    </g>
  </svg>
);

export interface AssistSheetProps {
  /** The full interview-me prompt for the question on screen —
   * interviewMePrompt's output, built by the caller, byte-identical core. */
  prompt: string;
  /** Their AI's printed name (goalServiceLabelFor), or undefined for
   * "your AI" — the same resolution the reflect voice line uses. */
  serviceLabel: string | undefined;
  /** Where that AI lives (assistServiceUrlFor), or undefined for no link. */
  serviceUrl: string | undefined;
  /** VB-120: the nudge's encouraging wording variant. */
  encouraging?: boolean;
  onClose: () => void;
  /** The normalized reply — the caller lands it in the answer input. */
  onSubmit: (text: string) => void;
}

export function AssistSheet({ prompt, serviceLabel, serviceUrl, encouraging = false, onClose, onSubmit }: AssistSheetProps) {
  const [step, setStep] = useState<AssistStep>(1);
  const [pasteDraft, setPasteDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const stepRef = useRef<HTMLDivElement | null>(null);

  /**
   * The narrator pairing — each step's printed line, spoken, through the
   * same seam every interview line rides (core line in, useNarration out).
   * The encouraging lead is read before step 1's instruction exactly as it
   * prints above it: one utterance, so the pause between them is the
   * engine's own sentence break rather than a second bubble.
   */
  const line = assistStepLine(step, serviceLabel);
  const { on: narratorOn } = useNarratorPref();
  useNarration(
    { role: 'question', text: step === 1 && encouraging ? `${ASSIST_ENCOURAGING_LEAD} ${line}` : line },
    narratorOn,
  );

  // Rescue focus onto the new step's own action — see the header. Step 1's
  // initial focus is Sheet's own contract (first focusable, the close
  // button), untouched.
  useEffect(() => {
    if (step === 1) return;
    stepRef.current?.querySelector<HTMLElement>('[data-assist-focus]')?.focus();
  }, [step]);

  function copyPrompt() {
    navigator.clipboard?.writeText(prompt).then(
      () => {
        setCopied(true);
        setStep(2);
      },
      () => {},
    );
  }

  function submit() {
    const text = pasteDraft.trim();
    if (!text) {
      setPendingError(S.assistNeedPaste);
      return;
    }
    // The existing normalizePastedReply path, gated exactly the way the
    // answer field's own onPaste gates it: a fenced reply unwraps, and a
    // plain paste is the person's own text — never reformatted.
    onSubmit(looksLikeFencedReply(pasteDraft) ? normalizePastedReply(pasteDraft) : text);
  }

  return (
    <Sheet open full className="assist-sheet" title={S.assist} onClose={onClose}>
      {/* What just happened, for anyone not watching the steps swap.
          Persistent across steps so the announcement outlives the control
          that caused it. */}
      <span className="assist-live" role="status">
        {copied ? S.copied : ''}
      </span>
      <div className="assist-steps" data-assist-step={step} ref={stepRef}>
        {step === 1 && (
          <section className="assist-step" aria-label={S.assist}>
            {encouraging && <p className="assist-lead">{ASSIST_ENCOURAGING_LEAD}</p>}
            <p className="assist-line">{line}</p>
            {/* The prompt, in the product's one trust chrome — visibly
                not-a-form, visibly theirs, seen in full before it goes
                anywhere (docs/GUARDRAILS.md: never to their AI without them
                seeing the exact text first). Its own corner copy control
                works too, and completing the copy is completing the step
                whichever control did it. */}
            <ReadOnlyBlock
              tag={S.reflectPromptTag}
              onCopy={() => {
                setCopied(true);
                setStep(2);
              }}
            >
              {prompt}
            </ReadOnlyBlock>
            <Button type="button" variant="primary" className="assist-copy flow-highlight" onClick={copyPrompt}>
              {ASSIST_PROMPT_ICON}
              {S.copyPrompt}
            </Button>
          </section>
        )}

        {step === 2 && (
          <section className="assist-step" aria-label={S.assist}>
            <p className="assist-line">{line}</p>
            {serviceLabel && serviceUrl && (
              /* A door, not a hand-off: a plain anchor to the service's own
                 front page. Nothing is sent, nothing is filled in — the
                 prompt travels on their clipboard and lands where they
                 paste it. */
              <a className="assist-link" href={serviceUrl} target="_blank" rel="noreferrer">
                {S.assistOpenService(serviceLabel)}
              </a>
            )}
            {ASSIST_SEND_SCENE}
            <Button type="button" variant="primary" data-assist-focus onClick={() => setStep(3)}>
              {S.assistStarted}
            </Button>
          </section>
        )}

        {step === 3 && (
          <section className="assist-step" aria-label={S.assist}>
            <p className="assist-line">{line}</p>
            <div className="assist-sr-label">
              <Field
                id="assist-reply"
                label={line}
                as="textarea"
                value={pasteDraft}
                onChange={(next) => {
                  // Something landed — the highlight has done its job
                  // (VB-106's own rule, one box over).
                  setPasteDraft(next);
                  setPendingError(null);
                }}
                error={pendingError ?? undefined}
                className={pasteDraft === '' ? 'flow-highlight' : undefined}
                data-assist-focus
              />
            </div>
            <Button type="button" variant="primary" onClick={submit}>
              {S.assistUse}
            </Button>
          </section>
        )}
      </div>
    </Sheet>
  );
}
