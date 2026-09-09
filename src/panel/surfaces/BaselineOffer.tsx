import { useState } from 'react';
import { Button, Field, FlowProgress, NarratorMark, StepStack } from '../components';
import { useNarration } from '../voice/useNarration';
import { baselineOfferLandedLine, offerStepNarration } from '../voice/narrationLines';
import { useNarratorPref } from '../voice/prefs';
import { ASSIST_SERVICE_URLS } from '../../core/flow/assistServices';
import { S } from '../strings';
import './BaselineOffer.css';
import '../components/alertPulse.css';

/* THE BAR CARRIES THE PREVIOUS SCREEN'S NUMBERS, deliberately.

   This screen is not a question in the interview — it sits between the goal
   gate and question one — so it has no index of its own. Given a total of 1 it
   drew one solid filled line where the screen before it draws four segments
   with two lit, and a header that changes shape between two screens of one
   path is the opposite of what "keep the header consistent" asks for.

   So it reports where the person actually is: still at the goal question, on
   an errand. Nothing has advanced, and the bar says nothing has. */

/**
 * D1 (docs/MEASUREMENT-SPINE.md) — the one moment a true baseline can be taken.
 *
 * After the goal gate has captured what somebody wants their AI to do better,
 * and before the file exists to help with it. Reached only through the
 * splash's own door: it is an offer, not a step, and the interview is
 * identical for anybody who never sees it.
 *
 * ── WHY IT CANNOT BE ANYWHERE ELSE ───────────────────────────────────────
 *
 * A baseline is the record of where somebody started. Collected later — during
 * the proof, as the product does today — it is a no-file answer produced by
 * somebody who has already done the interview, which is a fair control for the
 * file's content and not a record of where they began. There is exactly one
 * window, and this screen is it.
 *
 * ── AND WHY "NOT NOW" IS A REAL ANSWER ───────────────────────────────────
 *
 * This asks for actual work at the highest-friction moment in the product.
 * The offer states what the work buys in the same breath as making it, and
 * passing costs nothing — the proof's own baseline still runs later. Anything
 * that made this feel required would be trading the interview for the
 * measurement of it.
 *
 * ── THE STORYBOARD (Adam, 2026-09-02) ────────────────────────────────────
 *
 * "a 3 panel visual representation of the act of pasting into an LLM,
 * copying the final response button and pasting it back into this page. I am
 * thinking like an airlines safety manual kind of vibe to it that stays in
 * the workbrain aesthetic."
 *
 * Three numbered cards replace the old instruction paragraphs, and each card
 * is also the control for its own step: the first re-copies the prompt (the
 * old recopy line, moved into the panel it explains), the second opens the
 * pick-your-AI row — a plain anchor per service, opened by the person's own
 * click, with the choice saved to `goal_service` through the same answer
 * path the gate writes (nothing fetched, nothing observed) — and the third
 * lights the paste box below so there is no doubt where the reply goes.
 * D1's memory warning survives as panel two's own caption: "a fresh chat"
 * is the warning, said at the step where it acts.
 */
export interface BaselineOfferProps {
  /** The person's own goal, verbatim — the task all three stages answer. */
  task: string;
  /** The goal question's own position, so the header does not change shape
   *  between the two screens of this path. See the note above. */
  current: number;
  total: number;
  /**
   * Save the run. Called the moment the answer LANDS, before either door is
   * picked — a baseline somebody took is theirs whichever way they leave this
   * screen, and routing the write through one of the doors would lose it for
   * anybody who chose the other.
   */
  onRecord: (answer: string) => void;
  /** The fork's primary door: on into the interview. */
  onContinue: () => void;
  /** Passed on without running it. The interview carries on as it would have. */
  onSkip: () => void;
  /**
   * Panel two's pick landed: save which AI they use to the file
   * (`goal_service`, the same key the goal gate writes). Optional — with no
   * handler the pick still opens their AI and simply is not remembered.
   */
  onService?: ((key: string) => void) | undefined;
  /** The stored `goal_service` key, when the gate (or an earlier pick)
   *  already knows it — panel two's sub-line names it instead of asking. */
  service?: string | undefined;
  /**
   * Home. Used by three things now: the header's mark, the fork's second door,
   * and "Not now" — which is a real bail-out rather than a skip deeper into
   * the interview (Adam, 2026-09-01). Somebody who does not want to run this
   * does not want the next fifty questions either, and Home is where starting
   * lives.
   */
  onHome?: (() => void) | undefined;
}

/** The services panel two offers: the one list (VB-105), minus entries with
 * no front door to open — 'other' has a title rather than an address, and a
 * card that opens nothing would break its own instruction. */
const OPENABLE_SERVICES = S.proofServiceOptions.filter((o) => ASSIST_SERVICE_URLS[o.key]);

/** The homage hues (tokens.css, V3.0 pass 3k): each service's theme-color
 * VIBE, painting the mocks and the picked chip's wash. Scenery - state
 * never rides them. */
const HOMAGE: Record<string, string> = {
  chatgpt: 'var(--splash-homage-chatgpt)',
  claude: 'var(--splash-homage-claude)',
  gemini: 'var(--splash-homage-gemini)',
  copilot: 'var(--splash-homage-copilot)',
  grok: 'var(--splash-homage-grok)',
  perplexity: 'var(--splash-homage-perplexity)',
};
/** The text-grade siblings (V3.0 pass 3l): the picker sets each NAME in
 * its provider's color - nominative, wordmark-style, no logos and no
 * bundled lookalike type - so the words are held to the 4.5:1 text floor
 * the scenery hues never owed. */
const HOMAGE_INK: Record<string, string> = {
  chatgpt: 'var(--splash-homage-chatgpt-ink)',
  claude: 'var(--splash-homage-claude-ink)',
  gemini: 'var(--splash-homage-gemini-ink)',
  copilot: 'var(--splash-homage-copilot-ink)',
  grok: 'var(--splash-homage-grok)',
  perplexity: 'var(--splash-homage-perplexity-ink)',
};

export function BaselineOffer({ task, current, total, onRecord, onContinue, onSkip, onService, service, onHome }: BaselineOfferProps) {
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  /* V3.0 pass 3h (Adam): the three boxes are a FIXED CLUSTER and the work
     happens in ONE STAGE beneath them - press a box, its stage opens, and
     everything else waits. Step 3's stage CONTAINS the paste box and the
     doors, so the thing to do is always the only thing lit. */
  /* Pass 4y (Adam): the SERVICE comes first and loads OPEN - pick the
     provider, and the Go button both opens the window and hands the stack
     to step 3, which the narrator begins to read. */
  const [step, setStep] = useState('open');
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['open']));
  /* The chip SELECTS (and persists via onService); the Open button is what
     leaves the panel. Seeded from the stored pick when the gate knows it. */
  const [svc, setSvc] = useState<string | undefined>(service);
  /* The step-3 highlight holds until the box is TOUCHED (Adam: "add a
     highlight to the input box until it is clicked") - then the glow's
     job is done. */
  const [inputTouched, setInputTouched] = useState(false);
  const svcLabel = OPENABLE_SERVICES.find((o) => o.key === svc)?.label;
  /* THE FORK (Adam, 2026-09-01). Pressing the primary button used to record
     the run and walk straight into question one. That spent the single best
     moment in the product without using it: the person is holding their AI's
     no-file answer, having just read it, and that is the only point where
     "build the file" can be put to them as "improve THIS" rather than as
     fifty questions.

     So the answer lands, it is saved, and the screen asks. Two doors, both
     real — one into the interview, one home. Adam: "so the user is empowered
     on taking action to improve their prompt."

     Local state, not a position in the runner: this is one screen changing
     what it shows after an action on it, the same way the copy button does.
     Nothing about it is worth resuming to. */
  const [landed, setLanded] = useState<string | null>(null);
  const ready = pasted.trim().length > 0;

  /* V3.0 pass 3 (the audit): this screen sat silent on a narrated path -
     the door's own choice rode into the interview and then skipped the one
     errand screen between. The narrator reads the card's story in flight
     order, or the landing's own three lines - and the mark sits in the
     same corner every interview screen keeps it. */
  const { on: narratorOn } = useNarratorPref();
  useNarration(
    /* THE GUIDE SPEAKS PER STEP (Adam, 2026-09-03, his lines verbatim in
       narrationLines.ts): opening a step reads its coaching - the text
       change re-arms the per-question spend, so each step reads once. */
    landed === null
      ? { role: 'question', text: offerStepNarration(step) }
      : { role: 'question', text: baselineOfferLandedLine() },
    narratorOn,
  );

  if (landed !== null) {
    return (
      <div className="flow baselineoffer" data-position="baseline-landed">
        <div className="flow-chrome flow-chrome--bare">
          <NarratorMark />
        </div>
        <FlowProgress
          title={S.baselineEyebrow}
          current={current}
          total={total}
          {...(onHome ? { onHome } : {})}
        />
        {/* Polite, not assertive: the answer arriving is not an alert, and
            nothing here takes focus (docs/GUARDRAILS.md). */}
        <p className="baselineoffer-saved" role="status">
          {S.baselineSaved}
        </p>
        <h2 className="flow-q baselineoffer-heading">{S.baselineNextTitle}</h2>
        <p className="baselineoffer-body">{S.baselineNextBody}</p>

        {/* Their AI's answer, given back to them — the thing the primary door
            is offering to improve. Read-only and quiet: it is evidence on this
            screen, not something to edit. */}
        <blockquote className="baselineoffer-answer">{landed}</blockquote>

        <div className="baselineoffer-doors">
          <Button type="button" variant="primary" onClick={onContinue}>
            {S.baselineImprove}
          </Button>
          {onHome && (
            <button type="button" className="baselineoffer-later" onClick={onHome}>
              {S.baselineHome}
            </button>
          )}
        </div>

        <p className="flow-save">
          <span>{S.savedNote}</span>
          <span>{S.privacyNote}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="flow baselineoffer" data-position="baseline-offer">
      <div className="flow-chrome flow-chrome--bare">
        <NarratorMark />
      </div>
      <FlowProgress
        title={S.baselineEyebrow}
        current={current}
        total={total}
        {...(onHome ? { onHome } : {})}
      />

      {/* The interview's own question type (Adam, 2026-09-03: "the same
          size and format and fonts as the interview prompts") - flow-q,
          with its grow pinned below as the offer always pins it. */}
      <h2 className="flow-q baselineoffer-heading">{S.baselineTitle}</h2>

      {/* THE STEP STACK (Adam, 2026-09-03: vertical, check-offs, the chime
          on first opening, the active box transforming into a corner
          lockup over its detail space, done steps keeping the faded tint).
          The stack is the reusable grammar (components/StepStack.tsx);
          this screen only supplies the three details. */}
      <StepStack
        active={step}
        visited={visited}
        onActivate={(id) => {
          setVisited((was) => new Set(was).add(id));
          setStep(id);
        }}
        steps={[
          {
            id: 'open',
            caption: S.baselineStepPick,
            art: ART_OPEN,
            detail: (
              /* SIDE BY SIDE (Adam, 2026-09-03): the chips stack on the
                 left; the right holds the visual with DEFAULT instructions
                 and no way out until a chip is picked - then the words go
                 service-named, the mock takes that service's homage hue,
                 and "Go to X now" appears. */
              <div className="baselineoffer-pasteprompt">
                <div className="baselineoffer-marks" role="group" aria-label={S.baselineStepPick}>
                  {OPENABLE_SERVICES.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      className="baselineoffer-mark"
                      data-picked={o.key === svc || undefined}
                      aria-pressed={o.key === svc}
                      style={{ '--homage': HOMAGE[o.key], '--homage-ink': HOMAGE_INK[o.key] } as React.CSSProperties}
                      onClick={() => {
                        setSvc(o.key);
                        onService?.(o.key);
                      }}
                    >
                      <span className="baselineoffer-mark-name">{o.label}</span>
                      {o.key === svc && (
                        <svg className="baselineoffer-mark-tick" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M2 6.4 4.8 9 10 3.4" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
                <div
                  className="baselineoffer-pastepanel"
                  style={svc ? ({ '--homage': HOMAGE[svc] } as React.CSSProperties) : undefined}
                >
                  <p className="baselineoffer-note">
                    {svc && svcLabel ? S.baselinePasteHow(svcLabel) : S.baselinePasteDefault}
                  </p>
                  {MOCK_COMPOSER}
                  {svc && svcLabel && (
                    <a
                      className="baselineoffer-open btn btn-primary"
                      href={ASSIST_SERVICE_URLS[svc]}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        /* 4y: the same press that opens the window hands
                           the stack to step 3 - whose coaching the
                           narrator reads (the step-narration hook re-arms
                           on the text change). */
                        setVisited((was) => new Set(was).add('return'));
                        setStep('return');
                      }}
                    >
                      {S.baselineGoTo(svcLabel)}
                    </a>
                  )}
                </div>
              </div>
            ),
          },
          {
            id: 'return',
            caption: S.baselineStep3,
            art: ART_RETURN,
            detail: (
              <>
                {/* Pass 4z (Adam): the copy button rides the final step's
                    TOP - copy the prompt, paste it into the service, then
                    bring the response back to the highlighted box below. */}
                <div className="baselineoffer-copyrow">
                <p className="baselineoffer-note">{S.baselineCopiedAlready}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard?.writeText(task).then(
                      () => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                      },
                      () => {},
                    );
                  }}
                >
                  {copied ? S.baselineRecopied : S.baselineCopyAgain}
                </Button>
              </div>
                <p className="baselineoffer-note">
                  {svc && svcLabel ? S.baselineCopyHow(svcLabel) : S.baselinePickFirst}
                </p>
                {svc && (
                  <div style={{ ['--homage' as string]: HOMAGE[svc] }}>{MOCK_COPY}</div>
                )}
                {/* The paste target wears the STANDARD alert pulse until
                    touched (alertPulse.css, pass 3q) — the input variant,
                    because the alert IS an input box. */}
                <div
                  className="flow-answer baselineoffer-answerbox"
                  onFocusCapture={() => setInputTouched(true)}
                >
                  <div className="flow-field-sr-label">
                    <Field
                      id="baseline-paste"
                      label={S.baselineBody}
                      value={pasted}
                      onChange={setPasted}
                      as="textarea"
                      {...(inputTouched ? {} : { className: 'wb-alert wb-alert--input' })}
                    />
                  </div>
                </div>
              </>
            ),
          },
        ]}
      />
      {/* OUTSIDE the container (Adam, 2026-09-03): the doors stand visible
          on every step, and the bar simply waits for step 3's box to
          hold text - the gate is the emptiness, not the geography.

          THE FINISH BAR (pass 3p; Adam: "a button that looks like a status
          bar that is currently at 'In Progress' at load before anything is
          done, it is half done. After step 1, more done, after 2 more done
          and after step 3 it change to 'Finish'"). Step 1 is already
          checked at load, so the mapping starts there: half at load, a
          share per check-off, and the paste itself is the last stretch -
          the bar completes at the exact moment it becomes pressable. The
          label rides the same state: a status while the errand is open,
          the verb once the last step is. The fill layer is aria-hidden
          scenery - assistive technology hears one label, and the checked
          steps already carry the same progress. */}
      <div className="baselineoffer-doors">
        <button
          type="button"
          className="baselineoffer-finishbar"
          style={{ ['--done' as string]: ready ? 1 : 0.5 + 0.3 * (visited.size - 1) }}
          disabled={!ready}
          onClick={() => {
            const answer = pasted.trim();
            onRecord(answer);
            setLanded(answer);
          }}
        >
          <span className="baselineoffer-finishbar-label">
            {visited.size === 2 ? S.baselineBarFinish : S.baselineBarBusy}
          </span>
          <span className="baselineoffer-finishbar-fill" aria-hidden="true">
            <span className="baselineoffer-finishbar-label">
              {visited.size === 2 ? S.baselineBarFinish : S.baselineBarBusy}
            </span>
          </span>
        </button>
        <button type="button" className="baselineoffer-later" onClick={onSkip}>
          {S.baselineLater}
        </button>
      </div>
      {/* Back at the page's own bottom (Adam, 2026-09-03) - furniture, not
          part of any step's work. */}
      <p className="flow-save baselineoffer-save">
        <span>{S.savedNote}</span>
        <span>{S.privacyNote}</span>
      </p>
    </div>
  );
}

/* The "screenshots": drawn browser mocks in the product's own stroke idiom
   (Adam: "a screenshot or similar approach that looks good") - and drawn
   rather than captured deliberately, so no service's real interface is
   claimed pixel-for-pixel. The instruction text carries the specifics that
   are TRUE for all six: paste into the message box; the copy icon lives
   under the reply. The highlight ring marks the one control each mock is
   about. */
const MOCK_COMPOSER = (
  <svg className="baselineoffer-mock" viewBox="0 0 200 92" aria-hidden="true" focusable="false">
    <rect x="4" y="4" width="192" height="84" rx="6" />
    <path d="M4 20h192" />
    <circle cx="13" cy="12" r="2" />
    <circle cx="22" cy="12" r="2" />
    <path d="M20 36h108 M20 46h84" opacity="0.45" />
    <rect x="16" y="62" width="152" height="18" rx="9" />
    <path d="M24 71h64" opacity="0.6" />
    <path d="M176 66l8 5 -8 5z" />
    <circle cx="92" cy="71" r="15" className="baselineoffer-mock-ring" />
  </svg>
);
const MOCK_COPY = (
  <svg className="baselineoffer-mock" viewBox="0 0 200 92" aria-hidden="true" focusable="false">
    <rect x="4" y="4" width="192" height="84" rx="6" />
    <path d="M4 20h192" />
    <circle cx="13" cy="12" r="2" />
    <circle cx="22" cy="12" r="2" />
    <rect x="16" y="28" width="168" height="34" rx="6" opacity="0.7" />
    <path d="M26 38h120 M26 46h96 M26 54h60" opacity="0.45" />
    <rect x="20" y="68" width="9" height="11" rx="1.5" />
    <rect x="23" y="65" width="9" height="11" rx="1.5" />
    <path d="M42 70h8 M42 75h8 M58 70l3 6 3-6" opacity="0.6" />
    <circle cx="26" cy="71" r="13" className="baselineoffer-mock-ring" />
  </svg>
);

/* The cluster's pictograms - the same stroke drawings the buttons carried
   when they were self-contained cards, lifted to constants so the cluster
   markup stays readable. */
/* ART_PASTE retired in 4z with the step it drew. */
const ART_OPEN = (
  <svg className="baselineoffer-art" viewBox="0 0 76 56" aria-hidden="true" focusable="false">
    <rect x="8" y="10" width="46" height="36" rx="4" />
    <path d="M8 19h46" />
    <circle cx="14" cy="14.5" r="1.4" />
    <circle cx="19.5" cy="14.5" r="1.4" />
    <path d="M31 27v12 M25 33h12" />
    <path d="M58 10h12 M70 10v12 M70 10 56 24" />
  </svg>
);
const ART_RETURN = (
  <svg className="baselineoffer-art" viewBox="0 0 76 56" aria-hidden="true" focusable="false">
    <path d="M10 5h34a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H24l-7 6v-6h-7a4 4 0 0 1-4-4V9a4 4 0 0 1 4-4z" />
    <path d="M14 12h22 M14 18h14" />
    <path d="M60 22v12 m-5 -5 5 5 5 -5" />
    <rect x="14" y="42" width="48" height="11" rx="3" />
    <path d="M9 40l-3-3 M67 40l3-3" />
  </svg>
);
