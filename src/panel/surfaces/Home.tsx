import { useEffect, useRef, useState } from 'react';
import {
  Banner,
  BrandMark,
  Button,
  FileRow,
  RecommendationHide,
  RecommendationRow,
  recommendationCopy,
} from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { computeNextMove, mostRecentAnsweredAt } from '../../core/freshness/nextMove';
import { daysSince } from '../../core/freshness/clocks';
import { recommend, topRecommendations } from '../../core/recommend/engine';
import { multipleRecordCount } from '../../core/flow/multiples';
import { fileFinished, fileSlots } from '../../core/files/slots';
import type { FileSlot } from '../../core/files/slots';
import { fileLock } from '../../core/files/toggle';
// V1.8 VB-47. The file's name, the lock's sentence and the padlock itself,
// shared with the drawer's toggle so the shelf and the switcher cannot say
// different things about the same file — see components/FileTypeToggle.tsx.
import { LockGlyph, fileName, lockLine } from '../components/FileTypeToggle';
import { contextModules, contextOutline } from '../../core/flow/flow';
import { NO_DISMISSALS, dismiss, readDismissals } from '../../core/recommend/dismissals';
import type { Recommendation, RecommendationTarget } from '../../core/recommend/types';
import { FileActions } from './FileActions';
import type { Answers, Dismissals } from '../../schema/storage.types';
import { S } from '../strings';
import './Home.css';

export interface HomeProps {
  /** Starts (or resumes — `Flow` always resumes from wherever `wb:answers`
   * actually leaves off, see core/flow/runner.ts's `findPosition`) the
   * Context interview with no deep-link override. */
  onStart: () => void;
  /**
   * Deep-links straight at the question a recommendation is about. App.tsx
   * turns the target into a real `Position` (core/recommend/targets.ts),
   * since building one needs the actual ported `Step` object, which this
   * component has no reason to import just to hand back up.
   *
   * V1.5 VB-28 widened this from R1-12's `onAnswerDue(recordIndex)`: the due
   * role is now one recommendation among several, and every one of them
   * deep-links the same way rather than each new one growing its own prop.
   */
  onOpenTarget: (target: RecommendationTarget) => void;
  /**
   * V1.7 VB-36/VB-37: opens the file itself, not the interview for it. The
   * slot is a door onto the file view, which is where somebody chooses between
   * going through the whole thing and redoing one section — see
   * surfaces/FileView.tsx. `onStart` above is still the welcome card's own
   * button, which goes straight to the first question because there is nothing
   * in the file to look at yet.
   *
   * No argument: `core/files/slots.ts`'s `BUILT` says exactly one slot is
   * open, and every other one is locked and unclickable. The day Skills.md
   * opens, this grows an id and App.tsx picks the flow data to hand over.
   */
  onOpenFile: () => void;
  onOpenProof: () => void;
  /**
   * V1.7 VB-38: opens the list of roles, people and projects — the things the
   * file holds several of. Shown only when there is at least one of them, so
   * the row never offers an empty screen.
   */
  onOpenMultiples: () => void;
}

const EMPTY_ANSWERS: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
const CONTACT_URL = 'https://www.model-citizen.org/contact';

/**
 * What a locked slot says under its name.
 *
 * ONE LINE, AND IT IS THE LOCK. An earlier draft printed the file's own
 * "what" as well — `${S.fileSkillsWhat} · ${reason}` — matching the open
 * slot's "Who you are · 3 days old" shape. Rendered at 400px it wrapped to
 * two lines on Skills.md and three on Actions.md, and the shelf stopped
 * reading as a shelf: three rows of three different heights, with the
 * sentence that matters broken across a line. The requirement is that a
 * locked row says WHAT UNLOCKS IT, in the row, without a tooltip — so that
 * sentence gets the line, whole, and every row on the shelf is the same
 * height again. What Skills.md and Actions.md will hold is carried by their
 * names and by the padlock, which is what makes them read as the rest of the
 * product rather than as decoration.
 *
 * ── V1.8 VB-47: THE FOLD MOVED TO core/, THE SENTENCE DID NOT CHANGE ──────
 *
 * The drawer now carries a toggle between the same three files, and Adam's
 * decision of 2026-08-24 is that the two surfaces are one navigation: "both
 * must agree about locked files". Which of the two sentences a locked file gets
 * is `core/files/toggle.ts`'s `fileLock`, and turning that into words is
 * `lockLine` — both shared with the toggle, so a file waiting on Context.md
 * here is waiting on it in the same words there. What this function still owns
 * is the ONE LINE rule above, which is a fact about this row and not about the
 * lock.
 */
function lockedReason(slot: FileSlot): string {
  const lock = fileLock(slot);
  // Only ever called for a locked slot, which always has one. "Coming later"
  // is the truthful fallback for a slot that somehow does not, rather than an
  // empty subtitle where the lock should be.
  return lock ? lockLine(lock) : S.lockedComingLater;
}

/** V1.7 VB-38's row — two cards, one behind the other: more than one of a
 * thing. Same convention as PERSON_ICON below (stroke, `currentColor`,
 * `aria-hidden`; the row carries the name). */
const STACK_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <rect x="3.5" y="7.5" width="13" height="13" rx="2.5" />
    <path d="M7.5 4.5h10a2.5 2.5 0 0 1 2.5 2.5v10" />
  </svg>
);

/** V1.7 VB-36's locked slots — a closed padlock, drawn to the same convention
 * as the two above. The row's badge and subtitle say "Locked" and what unlocks
 * it in words; this is the same fact as a picture, so it is `aria-hidden` and
 * nothing rests on it alone.
 *
 * V1.8 VB-47: the drawing moved to `components/FileTypeToggle.tsx`, where the
 * toggle's own locked segments wear it at 12px. One padlock in the product, at
 * two sizes, rather than two padlocks that drift. */
const LOCK_ICON = <LockGlyph size={17} stroke={1.7} />;

const PERSON_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);

/**
 * docs/RELEASE-1.md R1-12: "Files with freshness, one next-move card, the
 * quiet 'talk to a person' row. Derived entirely — nothing about progress
 * is stored." Every value on this screen (the next-move card, the file's
 * badge/age, whether the "new here?" hint shows at all) is recomputed from
 * `wb:answers` on every render, the same way `Flow` derives its own current
 * question — see core/freshness/nextMove.ts's header comment. There is no
 * "have I shown this before" flag anywhere: a person who clears their own
 * answers sees the empty state again, correctly, because that's genuinely
 * what's true.
 *
 * Also the landing point for a *finished* Context interview as of R1-12 —
 * `Flow`'s own "done" screen now hands off here immediately (see
 * `onDone` on Flow.tsx) rather than showing its own end state, which is
 * what makes Download/Import (`FileActions`) live here instead of there.
 *
 * ── V1.5 VB-28: THE NEXT-MOVE CARD BECAME THE TOP RECOMMENDATION ──────────
 *
 * VB-28 asks for recommendations on Home and says, in as many words: "this
 * either extends [the next-move card] or sits beside it — decide deliberately
 * rather than shipping two competing 'what to do next' surfaces on one
 * screen."
 *
 * IT EXTENDS IT. There is still exactly one "what to do next" region on this
 * screen, in the same place, in the same box: the strongest recommendation is
 * drawn as the card, and the next two sit under it as quiet rows. A card plus
 * its overflow, not a card and a rival list further down the page.
 *
 * That is affordable because R1-12's card was already a recommendation with
 * one rule in it — a role marked current whose answer has aged past its clock.
 * `core/recommend/engine.ts` folds that exact rule in by calling
 * `computeNextMove`, not by re-deriving it, so the card cannot start
 * disagreeing with itself; and `recommendationCopy` reuses R1-12's approved
 * `driftHeading` / `driftBecauseRole` / `driftAction` verbatim, so when that
 * rule is the strongest the screen says precisely what it said before.
 *
 * The alternative — a "Suggestions" block below the file list — was rejected
 * for the reason VB-28 names: two boxes on one 400px screen, both answering
 * "what should I do", competing for the same glance.
 *
 * `computeNextMove` keeps its other two jobs untouched: whether anything has
 * been started at all, and the file row's own freshness badge. Those are facts
 * about the file, not offers about it.
 *
 * ── The one thing here that is persisted ─────────────────────────────────
 *
 * `wb:recs`, the ids of recommendations the person has hidden. Everything
 * else on this screen is derived on every render, as it always was. See
 * core/recommend/dismissals.ts for why that exception exists and why it is
 * the only one.
 *
 * ── One of VB-28's open questions is deliberately left open ──────────────
 *
 * "Whether a recommendation ever links to the paid human services the spec
 * says this product qualifies people for, or stays purely self-serve" needs
 * Adam, so nothing here answers it. Every recommendation is self-serve and
 * opens a question in their own file. The quiet "Talk to a person" row lower
 * down this screen is untouched and still the only route to a human, which is
 * the no-change default rather than a decision taken in code.
 */
export function Home({ onStart, onOpenTarget, onOpenFile, onOpenProof, onOpenMultiples }: HomeProps) {
  const [answers, setAnswersState] = useState<Answers | null>(null);
  const [dismissals, setDismissals] = useState<Dismissals>(NO_DISMISSALS);
  /**
   * Where focus goes when a recommendation is hidden.
   *
   * The control that was focused has just unmounted, and leaving focus on a
   * detached node drops a keyboard user back at the top of the document.
   * Moving it to the region keeps them where they were, and the region's
   * `aria-live` says what happened without anything stealing focus
   * (docs/GUARDRAILS.md's accessibility floor).
   */
  const recsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getLocal('wb:answers'), getLocal('wb:recs')]).then(([storedAnswers, storedRecs]) => {
      if (cancelled) return;
      setAnswersState(storedAnswers ?? EMPTY_ANSWERS);
      setDismissals(readDismissals(storedRecs));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!answers) return null;

  async function persist(next: Answers): Promise<boolean> {
    setAnswersState(next);
    const result = await setLocal('wb:answers', next);
    return result.ok;
  }

  /**
   * The one write this feature makes. Optimistic: the row goes immediately
   * and the key is written after, because a hide that visibly hesitates
   * reads as a control that did not work. A failed write leaves the
   * in-memory state alone and says nothing — the offer comes back on the
   * next open, which is the quietest possible degradation and the one
   * docs/GUARDRAILS.md asks for.
   */
  function hide(rec: Recommendation) {
    const next = dismiss(dismissals, rec.id, new Date());
    setDismissals(next);
    recsRef.current?.focus();
    void setLocal('wb:recs', next);
  }

  const nextMove = computeNextMove(answers);
  const hasStarted = nextMove.kind !== 'start';
  const lastAnswered = mostRecentAnsweredAt(answers);
  const ageDays = lastAnswered ? daysSince(lastAnswered, new Date()) : null;

  // Derived fresh on every render, exactly like everything else here — the
  // engine holds no state and the dismissal list is a filter over its output.
  const recs = topRecommendations(recommend({ answers, now: new Date(), dismissals }));
  const [top, ...rest] = recs;

  const fileSubtitle = !hasStarted
    ? S.notBuiltYet
    : `${S.fileContextWhat} · ${ageDays === 0 ? S.updatedToday : S.daysOld(ageDays ?? 0)}`;

  const fileBadge =
    nextMove.kind === 'due'
      ? { label: S.badgeDue(nextMove.items.length), tone: 'due' as const }
      : nextMove.kind === 'current'
        ? { label: S.badgeCurrent, tone: 'fresh' as const }
        : undefined;

  const topCopy = top ? recommendationCopy(top) : null;
  const multipleCount = multipleRecordCount(contextModules, contextOutline, answers);

  /**
   * V1.7 VB-36 — the shelf, derived like everything else on this screen.
   *
   * There is no "which files are unlocked" key and there must never be one:
   * whether Context.md is finished is a fold over `wb:answers`, recomputed
   * here on every render, so a locked row cannot go on saying "Finish
   * Context.md first" to somebody who has just finished it.
   */
  const slots = fileSlots({ context: fileFinished(contextOutline, contextModules, answers, new Date()) });

  return (
    <div className="home">
      {/* V1.1 VB-01 — the welcome state. Still just the `start` branch of the
          same derived next move, not a surface and not a stored "have I
          welcomed them" flag: someone who clears their answers is genuinely
          starting over and correctly gets this screen again. Everything below
          it on Home (the file row, the "bring your file" hint, Import, the
          privacy note) is unchanged and still renders — this replaces the
          bare "You have not started yet." card, not the page. */}
      {nextMove.kind === 'start' && (
        <section className="home-welcome" aria-labelledby="home-welcome-headline">
          <BrandMark />
          {/* Real, selectable text — not an image of a word, and not the mark
              doing double duty as the name. `appName` is the same string the
              extension is called everywhere else. */}
          <p className="home-welcome-wordmark">{S.appName}</p>
          <p className="home-welcome-byline">{S.brandByline}</p>
          <h2 id="home-welcome-headline" className="home-welcome-headline">
            {S.welcomeHeadline}
          </h2>
          <p className="home-welcome-sub">{S.welcomeSub}</p>
          <Button type="button" variant="primary" onClick={onStart}>
            {S.emptyNoFileAction}
          </Button>
          <p className="home-welcome-time">{S.welcomeTime}</p>
        </section>
      )}

      {/* V1.5 VB-28 — the one "what to do next" region. One card, then at most
          two quiet rows. `aria-live="polite"` announces a hide without moving
          anybody: docs/OPEN.md #1 settled that drift is surfaced on open and
          never pushed, and this region is that surface. */}
      {hasStarted && (
        <section
          className="home-recs"
          ref={recsRef}
          tabIndex={-1}
          aria-label={S.recsLabel}
          aria-live="polite"
        >
          {top && topCopy ? (
            <>
              {/* The card is the strongest recommendation, drawn in the
                  next-move card's own box. Its decline is the same corner
                  control every row carries, rather than a second button
                  beside the primary — see components/Recommendation.tsx. */}
              <div className="home-rec-card">
                <Banner
                  title={topCopy.headline}
                  action={
                    <Button type="button" variant="primary" onClick={() => onOpenTarget(top.target)}>
                      {topCopy.action}
                    </Button>
                  }
                >
                  {topCopy.why}
                </Banner>
                <RecommendationHide rec={top} onHide={hide} className="home-rec-card-hide" />
              </div>

              {rest.length > 0 && (
                <ul className="rec-list">
                  {rest.map((rec) => (
                    <RecommendationRow
                      key={rec.id}
                      rec={rec}
                      onAct={(r) => onOpenTarget(r.target)}
                      onHide={hide}
                    />
                  ))}
                </ul>
              )}
            </>
          ) : (
            /* Nothing to offer. Said once, as a state, never as praise — the
               same line R1-12 shipped, now reached whenever the engine is
               silent. It lives INSIDE this region rather than beside it so
               that hiding the last recommendation replaces the region's
               content instead of unmounting the element focus just moved to,
               and so the live region announces what replaced it. */
            <Banner variant="good" title={S.allCurrentHeading}>
              {S.allCurrentSub}
            </Banner>
          )}
        </section>
      )}

      {/* V1.7 VB-36 — the shelf. One slot per file in the work brain, each with
          its status and a way in, rather than one file plus a pile of actions.

          Skills.md and Actions.md are here and LOCKED (Adam, 2026-08-24). They
          are not decoration: they are the way into the Skills and Actions
          interviews, which will mirror the Context interview's flow, and
          showing them is what makes Context.md read as step one rather than as
          the whole product. Which slots exist, which are open and what a
          locked one may truthfully claim are all core/files/slots.ts's, not
          this component's — see its header on why that fold is worth a test. */}
      <p className="home-section-label">{S.homeFilesLabel}</p>
      <div className="home-filelist">
        {slots.map((slot) =>
          slot.state === 'open' ? (
            <FileRow
              key={slot.id}
              name={fileName(slot.id)}
              subtitle={fileSubtitle}
              badge={fileBadge}
              onClick={onOpenFile}
            />
          ) : (
            <FileRow
              key={slot.id}
              name={fileName(slot.id)}
              subtitle={lockedReason(slot)}
              badge={{ label: S.badgeLocked }}
              icon={LOCK_ICON}
              locked
            />
          ),
        )}
      </div>

      {/* V1.7 VB-38 — the parts of the file there are several of. Derived like
          everything else here: the count comes back from the same fold the
          screen behind this row renders (core/flow/multiples.ts), so a row
          that says "three on your list" opens a screen holding three. No
          records, no row — an empty screen is not worth a door. */}
      {multipleCount > 0 && (
        <>
          <p className="home-section-label">{S.homeMultiplesLabel}</p>
          <div className="home-filelist">
            <FileRow
              name={S.multiplesTitle}
              subtitle={S.multiplesCount(multipleCount)}
              icon={STACK_ICON}
              onClick={onOpenMultiples}
            />
          </div>
        </>
      )}

      {hasStarted && (
        <Button type="button" variant="secondary" onClick={onOpenProof}>
          {S.proofCta}
        </Button>
      )}

      {nextMove.kind === 'start' && <p className="home-hint">{S.emptyNewDevice}</p>}
      <FileActions answers={answers} onImport={persist} />

      <p className="home-section-label">{S.homeHelpLabel}</p>
      <FileRow name={S.homeHelpTitle} subtitle={S.homeHelpSub} icon={PERSON_ICON} iconTone="primary" href={CONTACT_URL} />

      <p className="home-privacy">{S.homePrivacyNote}</p>
    </div>
  );
}
