import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Banner,
  BrandMark,
  Button,
  FileRow,
  Meter,
  RecommendationHide,
  RecommendationRow,
  recommendationCopy,
} from '../components';
import { getLocal, setLocal } from '../../core/storage/client';
import { computeNextMove } from '../../core/freshness/nextMove';
import { sectionHealthMap, summariseSectionHealth } from '../../core/freshness/sectionHealth';
import { computeUtilization } from '../../core/home/utilization';
import { lockupMeta } from '../../core/home/lockupMeta';
import { contextFileDate, generateContextFile } from '../../core/files/generate';
import { generateSkillsFile } from '../../core/files/skillsFile';
import { deriveActionsFile } from '../../core/files/deriveActions';
import { recommend, topRecommendations } from '../../core/recommend/engine';
import { multipleRecordCount } from '../../core/flow/multiples';
import { actionsGenerated, fileFinished, fileSlots } from '../../core/files/slots';
import type { FileSlot, FileSlotId } from '../../core/files/slots';
import { fileLock } from '../../core/files/toggle';
// V1.8 VB-47. The file's name, the lock's sentence and the padlock itself,
// shared with the drawer's toggle so the shelf and the switcher cannot say
// different things about the same file — see components/fileLabels.tsx.
import { LockGlyph, fileName, lockLine } from '../components/fileLabels';
import { contextModules, contextOutline, skillsModules, skillsOutline } from '../../core/flow/flow';
import { NO_DISMISSALS, dismiss, readDismissals } from '../../core/recommend/dismissals';
import type { Recommendation, RecommendationTarget } from '../../core/recommend/types';
import { FileActions } from './FileActions';
import type { Answers, Dismissals, ReportState } from '../../schema/storage.types';
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
   * V2.2: the day this comment promised arrived — Skills.md opened, so the
   * id argument it said would appear has. `'actions'` opens the DERIVED file
   * (a generated view, not an interview) once Skills is finished.
   */
  onOpenFile: (id: FileSlotId) => void;
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
const EMPTY_SKILLS: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

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

/** V2.6 VB-125b — the file cards' chip drawings, in the house stroke style
 * (currentColor, aria-hidden; the card's own words carry everything). A
 * document for Context, layered sheets for Skills, a bolt for the generated
 * Actions; the locked chips wear the one padlock (fileLabels' LockGlyph). */
const DOC_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M4 2.5h8v11H4z" />
    <path d="M6 6h4M6 9h3" />
  </svg>
);

const LAYERS_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2.5 4.5 8 2l5.5 2.5L8 7 2.5 4.5Z" />
    <path d="M2.5 8 8 10.5 13.5 8" />
    <path d="M2.5 11.5 8 14l5.5-2.5" />
  </svg>
);

const BOLT_ICON = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M8.8 1.8 3.6 9h3.2l-.6 5.2L11.4 7H8.2z" strokeLinejoin="round" />
  </svg>
);

const GO_ARROW = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M4 2.5 7.5 6 4 9.5" />
  </svg>
);

const PERSON_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
    <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
  </svg>
);

/** A card's status: the tone paints the dot and the words, and the WORDS are
 * the state — the tones reuse the semantic palette (green=current,
 * amber=due, violet=the AI's derived file), never the identity accents,
 * which stay decoration (design/tokens.json's `home` group note). */
interface CardStatus {
  tone: 'fresh' | 'due' | 'quiet' | 'ai';
  label: string;
}

/**
 * V2.6 VB-125b — one open file card. The identity stack puts the FILENAME
 * first in the DOM (the accessible name every walk-in spec matches with
 * /^Context\.md/) and the friendly word first on screen (CSS
 * column-reverse) — one order per audience, both starting from the same
 * two strings, and the friendly half is derived from the filename so the
 * pair cannot drift.
 */
function HomeCard(props: {
  file: FileSlotId;
  icon: ReactNode;
  status: CardStatus;
  barPercent: number;
  desc: string;
  onOpen(): void;
}) {
  const name = fileName(props.file);
  return (
    <button type="button" className="home-card" data-file={props.file} onClick={props.onOpen}>
      <span className="home-card-top">
        <span className="home-card-chip" aria-hidden="true">
          {props.icon}
        </span>
        <span className="home-card-id">
          <span className="home-card-file">{name}</span>
          <span className="home-card-name">{name.replace(/\.md$/, '')}</span>
        </span>
      </span>
      <span className="home-card-status" data-tone={props.status.tone}>
        <span className="home-card-dot" aria-hidden="true" />
        {props.status.label}
      </span>
      <span className="home-card-bar" aria-hidden="true">
        <i style={{ width: `${props.barPercent}%` }} />
      </span>
      <span className="home-card-desc">{props.desc}</span>
      <span className="home-card-go">
        {S.cardOpen}
        {GO_ARROW}
      </span>
    </button>
  );
}

/** A locked card: the same shape wearing the padlock, the reason where the
 * status would be, and the Locked pill — a disabled real button (the
 * VB-36 pattern the FileRow shelf pinned: not pressable, not tabbable,
 * and it says what unlocks it IN the card, never in a tooltip). */
function LockedCard(props: { file: FileSlotId; reason: string }) {
  const name = fileName(props.file);
  return (
    <button type="button" className="home-card is-locked" data-file={props.file} disabled>
      <span className="home-card-top">
        <span className="home-card-chip" aria-hidden="true">
          <LockGlyph size={15} stroke={1.5} />
        </span>
        <span className="home-card-id">
          <span className="home-card-file">{name}</span>
          <span className="home-card-name">{name.replace(/\.md$/, '')}</span>
        </span>
      </span>
      <span className="home-card-reason">{props.reason}</span>
      <span className="home-card-pill">{S.badgeLocked}</span>
    </button>
  );
}

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
  /** V2.2 — the second file's answers, for the shelf: whether Skills.md is
   * finished (which unlocks the DERIVED Actions.md), and what its row says.
   * Loaded alongside, derived from, stored under its own key — the same
   * discipline as `answers`, one file over. */
  const [skillsAnswers, setSkillsAnswers] = useState<Answers>(EMPTY_SKILLS);
  /** V2.6 VB-125 — the proof loop's typed scores, read for one purpose: the
   * Share segment of the utilization meter (core/home/utilization.ts). */
  const [report, setReport] = useState<ReportState | undefined>(undefined);
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
    void Promise.all([
      getLocal('wb:answers'),
      getLocal('wb:recs'),
      getLocal('wb:answers:skills'),
      getLocal('wb:report'),
    ]).then(([storedAnswers, storedRecs, storedSkills, storedReport]) => {
      if (cancelled) return;
      setSkillsAnswers(storedSkills ?? EMPTY_SKILLS);
      setReport(storedReport);
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

  // Derived fresh on every render, exactly like everything else here — the
  // engine holds no state and the dismissal list is a filter over its output.
  const recs = topRecommendations(recommend({ answers, now: new Date(), dismissals }));
  const [top, ...rest] = recs;

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
  const skillsFinished = fileFinished(skillsOutline, skillsModules, skillsAnswers, new Date());
  const skillsHealthMap = sectionHealthMap(skillsOutline, skillsModules, skillsAnswers, null, new Date());
  const skillsHealth = summariseSectionHealth(skillsOutline, skillsHealthMap);
  const contextFinished = fileFinished(contextOutline, contextModules, answers, new Date());
  // V2.6 VB-125b — the Context card's own section count, the same fold the
  // Skills row has always used, one file over.
  const contextHealth = summariseSectionHealth(
    contextOutline,
    sectionHealthMap(contextOutline, contextModules, answers, null, new Date()),
  );
  const slots = fileSlots({
    context: contextFinished,
    skills: skillsFinished,
  });
  const skillsStarted = Object.keys(skillsAnswers.answeredAt).length > 0;
  // V2.2 — Actions.md is derived, not interviewed: the moment Skills is
  // finished the slot stops being a lock and becomes the generated file
  // (core/files/slots.ts's actionsGenerated, core/files/deriveActions.ts).
  const showActionsGenerated = actionsGenerated({ skills: skillsFinished });

  // V2.6 VB-125 — the meter's number and the lockup's meta line, derived on
  // every render like everything else here. The meta reuses the download
  // generators so its byte count is the download's byte count by
  // construction, and the meter's formula is core's (see utilization.ts's
  // header for the decided semantics and the authorship guard).
  const utilization = computeUtilization({
    contextOutline,
    contextModules,
    context: answers,
    skillsOutline,
    skillsModules,
    skills: skillsAnswers,
    report,
    now: new Date(),
  });
  const meta = lockupMeta({
    context: answers,
    skills: skillsAnswers,
    contextText: generateContextFile(answers, contextFileDate()),
    skillsText: generateSkillsFile(skillsAnswers, contextFileDate()),
    actionsText: deriveActionsFile(skillsAnswers),
    actionsOn: showActionsGenerated,
    now: new Date(),
  });

  return (
    <div className="home">
      {/* V2.6 VB-125 — the chrome bar: the mark and the name, identity only,
          no controls. The shell under it is the card world the template
          drew; the cool ground behind both is Home's own (Home.css), which
          is what makes this surface the reset place against the interview's
          textured wall (FLAG 10). */}
      <div className="home-shell">
        <header className="home-chrome">
          <BrandMark size={20} spin="none" entrance={false} />
          <p className="home-chrome-name">
            {S.appName} <span>· {S.chromeCompany}</span>
          </p>
        </header>
        <div className="home-body">
      {/* V1.1 VB-01 — the welcome state. Still just the `start` branch of the
          same derived next move, not a surface and not a stored "have I
          welcomed them" flag: someone who clears their answers is genuinely
          starting over and correctly gets this screen again. Everything below
          it on Home (the file row, the "bring your file" hint, Import, the
          privacy note) is unchanged and still renders — this replaces the
          bare "You have not started yet." card, not the page. */}
      {/* V2.6 VB-125 — the file lockup: what this place holds, said as a
          thing ("Your work brain"), the tagline under it, and a meta line of
          real derivables (core/home/lockupMeta.ts — FLAG 7: nothing the
          person could not check). Only once something exists: a fresh
          install's lockup moment is the welcome card below, and two brand
          lockups on one screen would be the chrome saying itself twice. */}
      {hasStarted && (
        <section className="home-lockup" aria-labelledby="home-lockup-title">
          <div className="home-glyph">
            <BrandMark size={30} spin="none" entrance={false} />
          </div>
          <div className="home-lockup-text">
            <h2 id="home-lockup-title">{S.workBrainStage}</h2>
            <p className="home-lockup-byline">{S.splashTagline}</p>
            <p className="home-lockup-meta">
              {meta.files === 0
                ? S.notBuiltYet
                : [
                    S.metaFiles(meta.files),
                    meta.ageDays === 0 ? S.updatedToday : S.daysOld(meta.ageDays ?? 0),
                    S.metaSize(meta.kb),
                  ].join(' · ')}
            </p>
          </div>
        </section>
      )}

      {nextMove.kind === 'start' && (
        <section className="home-welcome" aria-labelledby="home-welcome-headline">
          <BrandMark />
          {/* V2.6 VB-125: the wordmark and byline left this card — the
              chrome bar above says both now, once, for every Home state.
              The mark stays: it is the welcome's one warm thing, and the
              approved copy below is untouched. */}
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

      {/* V2.6 VB-125 — the signature: the utilization meter, on Adam's
          decided semantics (docs/V2.6-REFINEMENT.md decision 2). Shown at 0%
          on a fresh install on purpose: the four ticks are the whole journey,
          and the meter saying "0% set up, Step 1 · Name" is the product's
          honest map of it. */}
      <Meter
        value={utilization.percent}
        name={S.meterName}
        label={S.meterLabel}
        step={S.stepNamed(utilization.currentStep, S.steps[utilization.currentStep - 1] as string)}
        segments={[
          { label: S.steps[0], percent: utilization.segments.name },
          { label: S.steps[1], percent: utilization.segments.repeat },
          { label: S.steps[2], percent: utilization.segments.act },
          { label: S.steps[3], percent: utilization.segments.share },
        ]}
      />

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

      {/* V1.7 VB-36's shelf, in V2.6 VB-125b's card grammar: the duo (Context
          and Skills as the template's two-up cards), then Actions as its own
          full-width row — dashed and locked while Skills is unfinished,
          the generated file the moment it is not. Every state on every card
          is the same fold it always was (core/files/slots.ts,
          sectionHealth, computeNextMove); the cards only changed clothes.
          The STATE lives in the status words with the semantic tones; the
          per-file accents are identity only (tokens.json `home` group). */}
      <p className="home-section-label">{S.homeFilesLabel}</p>
      <div className="home-duo">
        <HomeCard
          file="context"
          icon={DOC_ICON}
          status={
            // R1-12's badge semantics, unchanged by the clothes: due and
            // Current are FRESHNESS claims (computeNextMove), and only a
            // file that is neither speaks in section counts.
            nextMove.kind === 'due'
              ? { tone: 'due', label: S.badgeDue(nextMove.items.length) }
              : nextMove.kind === 'current'
                ? { tone: 'fresh', label: S.badgeCurrent }
                : hasStarted
                  ? { tone: 'quiet', label: S.sectionsOf(contextHealth.done, contextOutline.length) }
                  : { tone: 'quiet', label: S.notBuiltYet }
          }
          barPercent={utilization.segments.name}
          desc={S.cardContextDesc}
          onOpen={() => onOpenFile('context')}
        />
        {slots.find((slot) => slot.id === 'skills')?.state === 'open' ? (
          <HomeCard
            file="skills"
            icon={LAYERS_ICON}
            status={
              skillsFinished
                ? { tone: 'fresh', label: S.badgeCurrent }
                : skillsStarted
                  ? { tone: 'quiet', label: S.sectionsOf(skillsHealth.done, skillsOutline.length) }
                  : { tone: 'quiet', label: S.skillsReady }
            }
            barPercent={utilization.segments.repeat}
            desc={S.cardSkillsDesc}
            onOpen={() => onOpenFile('skills')}
          />
        ) : (
          <LockedCard
            file="skills"
            reason={lockedReason(slots.find((slot) => slot.id === 'skills') as FileSlot)}
          />
        )}
      </div>
      {showActionsGenerated ? (
        <button
          type="button"
          className="home-actrow"
          data-file="actions"
          onClick={() => onOpenFile('actions')}
        >
          <span className="home-card-chip is-act" aria-hidden="true">
            {BOLT_ICON}
          </span>
          <span className="home-actrow-text">
            <span className="home-card-id">
              <span className="home-card-file">{fileName('actions')}</span>
              <span className="home-card-name">{fileName('actions').replace(/\.md$/, '')}</span>
            </span>
            <span className="home-actrow-sub">{S.fileActionsWhat}</span>
          </span>
          <span className="home-card-status" data-tone="ai">
            <span className="home-card-dot" aria-hidden="true" />
            {S.badgeGenerated}
          </span>
        </button>
      ) : (
        <button type="button" className="home-actrow is-locked" data-file="actions" disabled>
          <span className="home-card-chip is-act" aria-hidden="true">
            <LockGlyph size={15} stroke={1.5} />
          </span>
          <span className="home-actrow-text">
            <span className="home-card-id">
              <span className="home-card-file">{fileName('actions')}</span>
              <span className="home-card-name">{fileName('actions').replace(/\.md$/, '')}</span>
            </span>
            <span className="home-actrow-sub">{S.actionsWritesItself}</span>
          </span>
          <span className="home-card-pill">{S.badgeLocked}</span>
        </button>
      )}

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
      </div>
    </div>
  );
}
