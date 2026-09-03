import { useState } from 'react';
import { Button, Field, FlowProgress, NarratorMark } from '../components';
import { useNarration } from '../voice/useNarration';
import { baselineOfferAskLine, baselineOfferLandedLine } from '../voice/narrationLines';
import { useNarratorPref } from '../voice/prefs';
import { ASSIST_SERVICE_URLS } from '../../core/flow/assistServices';
import { S } from '../strings';
import './BaselineOffer.css';

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

export function BaselineOffer({ task, current, total, onRecord, onContinue, onSkip, onService, service, onHome }: BaselineOfferProps) {
  const [pasted, setPasted] = useState('');
  const [copied, setCopied] = useState(false);
  /* V3.0 pass 3h (Adam): the three boxes are a FIXED CLUSTER and the work
     happens in ONE STAGE beneath them - press a box, its stage opens, and
     everything else waits. Step 3's stage CONTAINS the paste box and the
     doors, so the thing to do is always the only thing lit. */
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
    /* Composed in narrationLines.ts (V3.0 pass 3g) so the clip render and
       this screen speak from one string - the ElevenLabs pass found these
       two lines clipless because they lived inline here. */
    landed === null
      ? { role: 'question', text: baselineOfferAskLine() }
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
        <h2 className="baselineoffer-title">{S.baselineNextTitle}</h2>
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

      <h2 className="baselineoffer-title">{S.baselineTitle}</h2>

      {/* THE FIXED CLUSTER (Adam, 2026-09-03): three equal boxes that never
          move or resize - the flight order at a glance - and ONE stage
          beneath them where the active step's work happens. The pictograms
          are aria-hidden scenery; each box's whole meaning is its caption,
          and aria-expanded carries which stage is open. */}
      <ol className="baselineoffer-story is-cluster">
        {(
          [
            { n: 1 as const, cap: S.baselineStep1, art: ART_PASTE },
            { n: 2 as const, cap: S.baselineStep2, art: ART_OPEN },
            { n: 3 as const, cap: S.baselineStep3, art: ART_RETURN },
          ]
        ).map(({ n, cap, art }) => (
          <li key={n} className="baselineoffer-stepli">
            <button
              type="button"
              className="baselineoffer-panel"
              data-active={step === n || undefined}
              aria-expanded={step === n}
              onClick={() => setStep(n)}
            >
              {art}
              <span className="baselineoffer-cap">{cap}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="baselineoffer-stage" data-step={step}>
        {step === 1 && (
          <button
            type="button"
            className="baselineoffer-recopy"
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
            {copied ? S.baselineRecopied : S.baselineRecopy}
          </button>
        )}
        {step === 2 && (
          <div className="baselineoffer-services" role="group" aria-label={S.baselineStepPick}>
            {OPENABLE_SERVICES.map((o) => (
              <a
                key={o.key}
                className="baselineoffer-service"
                data-picked={o.key === service || undefined}
                href={ASSIST_SERVICE_URLS[o.key]}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onService?.(o.key)}
              >
                {o.label}
              </a>
            ))}
          </div>
        )}
        {step === 3 && (
          <>
            <div className="flow-answer baselineoffer-answerbox baselineoffer-target">
              <div className="flow-field-sr-label">
                <Field
                  id="baseline-paste"
                  label={S.baselineBody}
                  value={pasted}
                  onChange={setPasted}
                  as="textarea"
                />
              </div>
            </div>
            {/* The doors ride DIRECTLY under the box (Adam, 2026-09-03:
                "fixed below the input box, not fixed to the bottom of the
                page") - the way out lives with the work it closes. */}
            <div className="baselineoffer-doors">
              <Button
                type="button"
                variant="primary"
                disabled={!ready}
                onClick={() => {
                  const answer = pasted.trim();
                  onRecord(answer);
                  setLanded(answer);
                }}
              >
                {S.baselineGo}
              </Button>
              <button type="button" className="baselineoffer-later" onClick={onSkip}>
                {S.baselineLater}
              </button>
              <p className="flow-save">
                <span>{S.savedNote}</span>
                <span>{S.privacyNote}</span>
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* The cluster's pictograms - the same stroke drawings the buttons carried
   when they were self-contained cards, lifted to constants so the cluster
   markup stays readable. */
const ART_PASTE = (
  <svg className="baselineoffer-art" viewBox="0 0 76 56" aria-hidden="true" focusable="false">
    <rect x="6" y="5" width="26" height="34" rx="3" />
    <path d="M12 13h14 M12 20h14 M12 27h9" />
    <path d="M37 22h16 m-5 -5 5 5 -5 5" />
    <rect x="46" y="36" width="24" height="12" rx="6" />
    <circle cx="64" cy="42" r="1.6" />
  </svg>
);
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
