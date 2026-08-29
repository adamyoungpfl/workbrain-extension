import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Banner,
  BrandMark,
  Button,
  FeedbackDoor,
  FeedbackSheet,
  FileRow,
  Meter,
  RecommendationHide,
  RecommendationRow,
  Sheet,
  Toast,
  recommendationCopy,
} from '../components';
import { getLocal, getSync, setLocal } from '../../core/storage/client';
import { computeNextMove } from '../../core/freshness/nextMove';
import { sectionHealthMap, summariseSectionHealth } from '../../core/freshness/sectionHealth';
import { computeUtilization } from '../../core/home/utilization';
import { stepCue } from '../../core/home/stepCue';
import { currentSectionTitle } from '../../core/home/currentSection';
/* BS-06: the file GENERATORS left Home with the lockup's meta line — the
   only thing that needed a byte count on this screen. `downloadContextFile`
   still writes the real file from the same generator, one layer down. */
import { recommend, topRecommendations } from '../../core/recommend/engine';
import { recMinutes } from '../../core/recommend/estimate';
import { capabilityReady } from '../../core/proof/capability';
import { multipleRecordCount } from '../../core/flow/multiples';
import { fileAsked, fileFinished, shownFileSlots } from '../../core/files/slots';
import type { FileSlot, FileSlotId } from '../../core/files/slots';
import { fileLock } from '../../core/files/toggle';
// V1.8 VB-47. The file's name, the lock's sentence and the padlock itself,
// shared with the drawer's toggle so the shelf and the switcher cannot say
// different things about the same file — see components/fileLabels.tsx.
import { LockGlyph, fileName, lockLine } from '../components/fileLabels';
import { contextModules, contextOutline, skillsModules, skillsOutline } from '../../core/flow/flow';
import { NO_DISMISSALS, dismiss, readDismissals } from '../../core/recommend/dismissals';
import type { Recommendation, RecommendationTarget } from '../../core/recommend/types';
import { downloadContextFile } from './FileActions';
import { UploadSheet } from './UploadSheet';
import { RedeemSheet } from './RedeemSheet';
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
  /** BS-04 (§4) — proof two. Its own door, because it proves a different
   * thing: the file changing an answer versus the recipe getting done. */
  onOpenCapability: () => void;
  /**
   * V1.7 VB-38: opens the list of roles, people and projects — the things the
   * file holds several of. Shown only when there is at least one of them, so
   * the row never offers an empty screen.
   */
  onOpenMultiples: () => void;
}

const EMPTY_ANSWERS: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
/** V2.8 VB-134 — the one door out of the extension: the Workbrain+ page.
 * The card SHOWS the price (Adam's V2.8 instruction, reversing V2.6's
 * no-prices call — recorded in strings.ts and the doc); the site still
 * does all the charging (NORTH-STAR 4, untouched). */
const PLUS_URL = 'https://www.model-citizen.org/work-brain/plus';

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

/**
 * BS-06 (§6) — one row of Home's action list.
 *
 * A door (`href`), a control (`onPress`), or a DORMANT row that says what it
 * is waiting for and cannot be pressed. Dormant is drawn as quiet ink and a
 * stated reason — never a dashed edge, which §1 reassigned to "empty", and
 * never a disabled square, which was the thing that read as broken.
 *
 * The 44px floor is on the row, so the whole line is the target: these are
 * read and pressed in one motion.
 */
function HomeRow({
  id,
  icon,
  label,
  sub,
  ready,
  onPress,
  href,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  sub: string;
  ready: boolean;
  onPress?: (() => void) | undefined;
  href?: string | undefined;
}) {
  // The NAME is the verb, the SUBTITLE is the description. Both are read, and
  // in that order — but a control announced as "Redeem a skill, paste a code
  // somebody sent you" is one whose name is no longer the thing on the screen,
  // and the copy rule is that a button is a verb the person would say. So the
  // subtitle is `aria-describedby`, which is what supporting text is for.
  const subId = `home-row-sub-${id}`;
  const body = (
    <>
      <span className="home-row-chip" aria-hidden="true">
        {icon}
      </span>
      <span className="home-row-text">
        <span className="home-row-label">{label}</span>
        <span className="home-row-sub" id={subId}>
          {sub}
        </span>
      </span>
      {(onPress || href) && <span className="home-row-go" aria-hidden="true">{GO_ARROW}</span>}
    </>
  );
  return (
    <li className={ready ? 'home-row' : 'home-row is-waiting'}>
      {href ? (
        <a
          className="home-row-hit"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={label}
          aria-describedby={subId}
        >
          {body}
        </a>
      ) : onPress ? (
        <button
          type="button"
          className="home-row-hit"
          onClick={onPress}
          aria-label={label}
          aria-describedby={subId}
        >
          {body}
        </button>
      ) : (
        // Not a disabled control: there is nothing to press yet, so there is
        // no control. A disabled button in the tab order is a promise the
        // screen cannot keep.
        <span className="home-row-hit">{body}</span>
      )}
    </li>
  );
}

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


const GO_ARROW = (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    <path d="M4 2.5 7.5 6 4 9.5" />
  </svg>
);

/** V2.6 VB-125c — the utility tiles' drawings, same convention as the card
 * chips: currentColor strokes, aria-hidden, the tile's own word carries it.
 * (VB-125c also retired PERSON_ICON with the "Talk to a person" row — the
 * services card and the TiM tile are the human doors now.) */
const DOWNLOAD_ICON = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M9 3.5V12M5.8 8.8 9 12l3.2-3.2" />
    <path d="M3.5 12v2.5h11V12" />
  </svg>
);

/** VB-145 — the upload door's glyph: the same tray, arrow rising out. */
const UPLOAD_ICON = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M9 12V3.5M5.8 6.7 9 3.5l3.2 3.2" />
    <path d="M3.5 12v2.5h11V12" />
  </svg>
);

const PROVE_ICON = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M2.8 9.6 6.6 13.4 15.2 4.8" />
  </svg>
);

/** BS-04 (§4) — proof two's row glyph: a play mark, because the row runs
 * something. Same 17px stroke house style as its neighbours. */
const RUN_ICON = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="9" cy="9" r="6.4" />
    <path d="M7.4 6.4 11.8 9l-4.4 2.6Z" strokeLinejoin="round" />
  </svg>
);

const LIBRARY_ICON = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M3.5 4.2A2 2 0 0 1 5.5 2.5H9v13H5.5a2 2 0 0 0-2 1.2V4.2Z" />
    <path d="M14.5 4.2a2 2 0 0 0-2-1.7H9v13h3.5a2 2 0 0 1 2 1.2V4.2Z" />
  </svg>
);

/* V2.8 VB-133: TIM_ICON left with its tile; the Redeemer's key stands
 * there now — a code that opens a skill. */
/** BS-06 — Workbrain+'s row glyph: a spark, in the house stroke style. */
const PLUS_ICON = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M9 2.5 10.6 7 15 8.6 10.6 10.2 9 14.6 7.4 10.2 3 8.6 7.4 7Z" strokeLinejoin="round" />
  </svg>
);

const REDEEM_ICON = (
  <svg width="17" height="17" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="5.8" cy="6.4" r="3.1" />
    <path d="M8.2 8.8 15.2 15.8" />
    <path d="M12.4 13l1.9-1.9M14.4 15l1.9-1.9" />
  </svg>
);

/** A card's status: the tone paints the dot and the words, and the WORDS are
 * the state — the tones reuse the semantic palette (green=current,
 * amber=due, violet=the AI's derived file), never the identity accents,
 * which stay decoration (design/tokens.json's `home` group note). */
interface CardStatus {
  tone: 'fresh' | 'due' | 'quiet' | 'ai';
  label: string;
  /**
   * R-08 — whether this status is a LIVE one, worth a slow pulse.
   *
   * Adam asked for it "blinking". Built as a breath (2.6s, opacity 1 → 0.55)
   * rather than a blink: a hard on/off is what an error state looks like in
   * every interface anybody has used, it fails WCAG 2.2.2's blink rule, and it
   * would make a file being CURRENT — the good news on this screen — read as
   * an alarm. It stops entirely under `prefers-reduced-motion`, where the
   * words and the tone colour still say the same thing.
   */
  live?: boolean;
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
  /** R-08 — the file that is genuinely somebody's already. Raised AND lit;
   * every other card is raised and quiet. */
  active?: boolean;
}) {
  const name = fileName(props.file);
  return (
    <button
      type="button"
      className="home-card"
      data-file={props.file}
      data-active={props.active ? 'on' : 'off'}
      onClick={props.onOpen}
    >
      <span className="home-card-top">
        <span className="home-card-chip" aria-hidden="true">
          {props.icon}
        </span>
        <span className="home-card-id">
          <span className="home-card-file">{name}</span>
          <span className="home-card-name">{name.replace(/\.md$/, '')}</span>
        </span>
      </span>
      <span
        className="home-card-status"
        data-tone={props.status.tone}
        data-live={props.status.live ? 'on' : 'off'}
      >
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
export function Home({ onStart, onOpenTarget, onOpenFile, onOpenProof, onOpenCapability, onOpenMultiples }: HomeProps) {
  const [answers, setAnswersState] = useState<Answers | null>(null);
  /** V2.2 — the second file's answers, for the shelf: whether Skills.md is
   * finished (which unlocks the DERIVED Actions.md), and what its row says.
   * Loaded alongside, derived from, stored under its own key — the same
   * discipline as `answers`, one file over. */
  const [skillsAnswers, setSkillsAnswers] = useState<Answers>(EMPTY_SKILLS);
  /** V2.6 VB-125 — the proof loop's typed scores, read for one purpose: the
   * Share segment of the utilization meter (core/home/utilization.ts). */
  const [report, setReport] = useState<ReportState | undefined>(undefined);
  /** V2.6 VB-125c — whether the Move-file sheet is up. In-memory, like every
   * other "where am I" fact: a reopen lands on Home with it closed. */
  const [uploadOpen, setUploadOpen] = useState(false);
  /** BS-02 — the beta's return channel, in the chrome that already exists. */
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [homeToast, setHomeToast] = useState<string | null>(null);
  /** V2.8 VB-133 — the Skill Redeemer's sheet, and its landed-toast. */
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemToast, setRedeemToast] = useState<string | null>(null);
  /** V2.6 VB-127 — the What's-stored sheet, and the two keys it lists that
   * nothing else on Home reads: the version stamp and the narrator choice.
   * `undefined` = the key does not exist, and an absent key gets NO row —
   * the sheet's "whole list" claim has to be literally true. */
  const [storedOpen, setStoredOpen] = useState(false);
  const [metaStored, setMetaStored] = useState(false);
  const [voicePref, setVoicePref] = useState<boolean | undefined>(undefined);
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
      getLocal('wb:meta'),
      getSync('wb:prefs'),
    ]).then(([storedAnswers, storedRecs, storedSkills, storedReport, storedMeta, storedPrefs]) => {
      if (cancelled) return;
      setSkillsAnswers(storedSkills ?? EMPTY_SKILLS);
      setReport(storedReport);
      setMetaStored(storedMeta !== undefined);
      setVoicePref(
        storedPrefs && typeof storedPrefs.narrator === 'boolean' ? storedPrefs.narrator : undefined,
      );
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
  /* O3: `contextFinished` is gone. The Context card's badge never read it —
     due/Current are FRESHNESS claims off `computeNextMove`, and the count
     branch reads `contextHealth` — so the only thing it decided was the
     Skills door, which now opens on `fileAsked`. `fileFinished` survives
     here for the SKILLS card's own "Current" badge, which is a claim about
     that file's contents rather than a door. */
  // V2.9 VB-144 — the graduation gate, and NOT the same question the card
  // asks. `fileAsked` is "the interview is over"; `fileFinished` is "the file
  // has no gaps". They differ only on a file with a skip in it, and the
  // person who passed on an optional question has finished the interview —
  // see the long note in core/files/slots.ts.
  const contextComplete = fileAsked(contextOutline, contextModules, answers, new Date());
  /** …and the same question one file over, for the shelf's own door. */
  const skillsComplete = fileAsked(skillsOutline, skillsModules, skillsAnswers, new Date());
  // V2.6 VB-125b — the Context card's own section count, the same fold the
  // Skills row has always used, one file over.
  const contextHealth = summariseSectionHealth(
    contextOutline,
    sectionHealthMap(contextOutline, contextModules, answers, null, new Date()),
  );
  // V2.9 VB-146: the interface shows the beta's slots — Actions is hidden
  // (core/files/slots.ts's BETA_HIDDEN_SLOTS carries the story).
  /**
   * O3 (Adam, 2026-08-27) — THE DOOR OPENS ON "NOTHING LEFT TO ASK".
   *
   * Every question in the interview is skippable, and a skip writes `null` —
   * a recorded answer. `core/recommend/engine.ts` says so in as many words
   * and deliberately never re-raises one: "a single skip is a considered
   * answer… re-raising it one at a time would be the product arguing with a
   * decision somebody already made."
   *
   * The lock disagreed with that. Reading `fileFinished`, one press of Skip
   * anywhere in Context locked Skills.md permanently, with nothing to say
   * which question it was and no route back — and the locked row went on
   * saying "Finish Context.md first" to somebody who had finished it and
   * simply declined one question. That sentence was the thing that was
   * wrong, not their skip. Since BS-03a it also dead-ended the proof's
   * hand-off into Skills, at the peak of the hour.
   *
   * So the DOOR reads `fileAsked` and the CARD keeps `fileFinished`: the
   * interview being over is what unlocks the next file, and the file's own
   * status still reports honestly that a question was passed on.
   */
  const slots = shownFileSlots({
    context: contextComplete,
    skills: skillsComplete,
  });
  const skillsStarted = Object.keys(skillsAnswers.answeredAt).length > 0;
  /** BS-04 (§4) — "reachable after two skills without finishing all of
   * Skills", so this is a fold over the RECORDS rather than over the
   * interview's completeness (core/proof/capability.ts). */
  const capabilityOpen = capabilityReady(skillsAnswers);

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

  return (
    <div className="home">
      {/* V2.6 VB-125's chrome bar, V2.8 VB-132b's de-frame: the shell card
          and Home's own cool ground are gone (Adam: "remove the frame
          within a frame") — the sections sit directly on the app's one
          light ground like every other surface, the chrome staying as a
          flat identity row. The card grammar itself is the differentiation
          now, not a second world behind it. */}
      <header className="home-chrome">
        <BrandMark size={20} spin="none" entrance={false} />
        <p className="home-chrome-name">
          {S.appName} <span>· {S.chromeCompany}</span>
        </p>
        {/* V2.9 VB-145 — the upload door, at the top of the UI where Adam
            asked for it. It only OPENS a sheet; the sheet carries the
            replace-warning and the careful path (UploadSheet.tsx). */}
        <button
          type="button"
          className="home-chrome-upload"
          aria-label={S.uploadOpen}
          onClick={() => setUploadOpen(true)}
        >
          {UPLOAD_ICON}
        </button>
        {/* BS-02 — reachable in one press from here, and from the interview's
            own chrome. Not a new band: the review's proposed Home puts it on
            this bar, and its proposed interview screen has no bar at all. */}
        <FeedbackDoor onOpen={() => setFeedbackOpen(true)} />
      </header>
      {/* V1.5 VB-28 — the one "what to do next" region. One card, then at most
          two quiet rows. `aria-live="polite"` announces a hide without moving
          anybody: docs/OPEN.md #1 settled that drift is surfaced on open and
          never pushed, and this region is that surface.

          BS-06 (§6) MOVED IT TO THE TOP. It was item four, below the meter
          and the file shelf, in amber, competing with a full-bleed price
          card — and it is "the reason to open the panel on day nine". It is
          now the first content under the chrome and Home's only filled
          primary. Nothing about what it says changed; only where a person
          meets it.

          It sits ABOVE the welcome state deliberately rather than beside it:
          the two never coexist (`hasStarted` is false exactly when the
          welcome shows), so the order costs a first-time person nothing and
          spares the code a second condition that could drift. */}
      {hasStarted && (
        <section
          className={top ? 'home-recs' : 'home-recs is-quiet'}
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
                      {/* §6: "Add a time estimate to the verb." The number is
                          the interview's own per-module estimate at the grain
                          of one question (core/recommend/estimate.ts) — not a
                          measurement of anybody, which the guardrail rules
                          out, and not a figure somebody typed here. */}
                      {S.recActionIn(topCopy.action, recMinutes(top))}
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
          ) : /* V2.8 VB-132a: the all-current banner is GONE (Adam: redundant
               beside the Context card's own Current status). The region
               itself survives empty — it is where focus lands when the last
               recommendation is hidden, and unmounting the element focus
               just moved to would drop a keyboard user at the top of the
               document. `is-quiet` collapses its box (Home.css). */
          null}
        </section>
      )}

      {/* V1.1 VB-01 — the welcome state. Still just the `start` branch of the
          same derived next move, not a surface and not a stored "have I
          welcomed them" flag: someone who clears their answers is genuinely
          starting over and correctly gets this screen again. Everything below
          it on Home (the file row, the "bring your file" hint, Import, the
          privacy note) is unchanged and still renders — this replaces the
          bare "You have not started yet." card, not the page. */}
      {/* BS-06 (§6), Adam's D3 — THE LOCKUPS ARE GONE.
          V2.6 VB-125 put a brand block here: the mark, "Your work brain",
          the tagline, and a meta line of derivables. §6: "Chrome bar,
          lockup and welcome card all say 'this is Workbrain' within 180px
          of each other. The chrome bar wins because it survives every
          state." That is ~84px back and one fewer thing to read before the
          screen says anything a person came for.

          The meta line's facts are not lost — they are the same derivations
          the file cards and the meter print, one row down. `lockupMeta` is
          left in core: it is tested, it is honest, and §6 removed the place
          it was printed rather than the fact it is true. */}

      {nextMove.kind === 'start' && (
        <section className="home-welcome" aria-labelledby="home-welcome-headline">
          {/* V2.6 VB-125 took the wordmark and byline off this card; BS-06
              takes the mark, for the reason that was already written here —
              the chrome bar says it once, for every Home state. What is
              left is what a first-time person actually needs: the promise,
              the time it costs, and the way in. The approved copy is
              untouched. */}
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
      {/* BS-06 (§6) added "What moves this?" beside the percentage, a door
          onto a sheet explaining the four quarters. REMOVED (Adam, 2026-08-28:
          "remove this link, we don't need it"). The sheet and its eight lines
          go with it — a door nobody opens is a door, but a door plus eight
          paragraphs of arithmetic is a second product. BR-01's cue does the
          work §6 wanted from it: the meter now says where you are AND where
          you are going, which is the direction the sheet was standing in for.
          `components/MeterWhatSheet.tsx` and `S.meterWhat*` are deleted. */}
      <div className="home-meter">
      <Meter
        value={utilization.percent}
        name={S.meterName}
        label={S.meterLabel}
        step={(() => {
          // R-05 — locked to Current. `stepCue` still says which step that is;
          // its `next` is no longer drawn, and is kept because the fold is
          // right and the next thing to want it is R-08's card status.
          const current = S.steps[stepCue(utilization).current - 1] as string;
          return { current: S.stepCurrent(current), spoken: S.stepCurrent(current) };
        })()}
        current={utilization.currentStep}
        segments={[
          { label: S.steps[0], percent: utilization.segments.name },
          { label: S.steps[1], percent: utilization.segments.repeat },
          { label: S.steps[2], percent: utilization.segments.act },
          { label: S.steps[3], percent: utilization.segments.share },
        ]}
      />
      </div>

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
                ? {
                    tone: 'fresh',
                    // R-08 (D1) — "Current: [the section you're in]". The
                    // section is the one `findPosition` would OPEN on, not one
                    // this surface worked out for itself: a card that says
                    // "My World" and then opens on Roles is a small lie told at
                    // the moment somebody decided to trust the product.
                    label: (() => {
                      const section = currentSectionTitle(contextModules, contextOutline, answers);
                      return section ? S.badgeCurrentIn(section) : S.badgeCurrent;
                    })(),
                    live: true,
                  }
                : hasStarted
                  ? { tone: 'quiet', label: S.sectionsOf(contextHealth.done, contextOutline.length) }
                  : { tone: 'quiet', label: S.notBuiltYet }
          }
          barPercent={utilization.segments.name}
          desc={S.cardContextDesc}
          // R-08 — "once the context file is active". Active is `hasStarted`:
          // one real answer in it. Not "finished", because a file somebody is
          // half way through is exactly the one worth pulling the eye to.
          active={hasStarted}
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
      {/* V2.9 VB-146: Actions' row is HIDDEN for the beta — no real builder
          behind it yet (core/files/slots.ts's BETA_HIDDEN_SLOTS carries the
          story, and emptying that list brings the row back post-beta). */}

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

      {/* V2.6 VB-125c — the keep-it-working tiles. Move file holds the
          download/import pair in a sheet (a short, self-contained task —
          the sanctioned surface for one); Prove it is the proof loop under
          its own name, disabled until there is anything to prove (the same
          gate that used to hide the button); the library tile is the
          member gate made visible — locked, coming soon, said in its
          accessible name since a disabled tile meets no pointer (decision
          4 + NORTH-STAR); TiM is a door to the site. */}
      <p className="home-section-label">{S.homeKeepLabel}</p>
      {/* BS-06 (§6) — THREE TILES AND TWO BANNERS BECOME ONE LIST.
          The tiles were a 3-across icon grid whose labels ran at 11px, and
          two of the three were usually dashed and dead; the Certified Skills
          banner and the Workbrain+ card cost another ~330px between them to
          say two sentences and a price. A plain row with a subtitle says
          more in less height — and a dormant item becomes a row that
          EXPLAINS ITSELF rather than a disabled square, which is the same
          §1 rule that took dashed away from "locked". */}
      <ul className="home-rows">
        <HomeRow
          id="download"
          icon={DOWNLOAD_ICON}
          label={S.tileDownload}
          sub={contextComplete ? S.rowDownloadSub : S.tileWaitsOnContext}
          ready={contextComplete}
          onPress={
            contextComplete
              ? () => {
                  downloadContextFile(answers);
                  setHomeToast(S.toastDownloaded);
                }
              : undefined
          }
        />
        <HomeRow
          id="prove"
          icon={PROVE_ICON}
          label={S.proofCta}
          sub={contextComplete ? S.rowProveSub : S.tileWaitsOnContext}
          ready={contextComplete}
          onPress={contextComplete ? onOpenProof : undefined}
        />
        {/* BS-04 (§4) — proof two, "the screen that sells the product".
            Waiting, in the row grammar §6 built for exactly this, until two
            recipes exist: the screen literally cannot run without steps, so
            the gate and "does it work" are the same sentence
            (core/proof/capability.ts). */}
        <HomeRow
          id="run"
          icon={RUN_ICON}
          label={S.capCta}
          sub={capabilityOpen ? S.capRowSub : S.capRowWaiting}
          ready={capabilityOpen}
          onPress={capabilityOpen ? onOpenCapability : undefined}
        />
        <HomeRow
          id="redeem"
          icon={REDEEM_ICON}
          label={S.tileRedeem}
          sub={S.rowRedeemSub}
          ready
          onPress={() => setRedeemOpen(true)}
        />
        <HomeRow
          id="library"
          icon={LIBRARY_ICON}
          label={S.libTitle}
          sub={S.rowLibrarySub}
          ready
          href="https://www.model-citizen.org/work-brain/skills-library"
        />
        {/* Workbrain+ keeps its door and loses its pitch. The price and the
            four goods belong on the page this links to; on Home they cost
            ~230px and made the panel read as a storefront on the screen a
            person opens to do work (§6). */}
        <HomeRow id="plus" icon={PLUS_ICON} label={S.plusTitle} sub={S.rowPlusSub} ready href={PLUS_URL} />
      </ul>

      {nextMove.kind === 'start' && <p className="home-hint">{S.emptyNewDevice}</p>}

      <footer className="home-foot">
        <p className="home-privacy">{S.homePrivacyNote}</p>
        <button type="button" className="home-foot-link" onClick={() => setStoredOpen(true)}>
          {S.storedLink}
        </button>
      </footer>

      {/* V2.9 VB-145 — the upload door's sheet. The download half of the
          old Move sheet became the tile above; what needs a seatbelt is
          only the import, and the seatbelt is the sheet's own warning. */}

      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        to={S.feedbackTo}
        context={{ surface: 'home' }}
      />

      <UploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        answers={answers}
        onImport={persist}
        onImported={(count) => setHomeToast(S.toastImported(count))}
      />
      {homeToast && <Toast message={homeToast} onDismiss={() => setHomeToast(null)} />}

      {/* V2.8 VB-133 — the Skill Redeemer: the code from a bought or
          commissioned skill lands the pack through VB-124's path; the
          toast speaks the share row's own words. */}
      <RedeemSheet
        open={redeemOpen}
        onClose={() => setRedeemOpen(false)}
        skills={skillsAnswers}
        onSkills={async (next) => {
          setSkillsAnswers(next);
          const result = await setLocal('wb:answers:skills', next);
          return result.ok;
        }}
        onRedeemed={(added, skipped) => setRedeemToast(S.skillsShareAdded(added, skipped))}
      />
      {redeemToast && <Toast message={redeemToast} onDismiss={() => setRedeemToast(null)} />}

      {/* V2.6 VB-127 — the storage, listed in plain words. Rows exist only
          for keys that exist, every count is authored content, and the
          outro's "whole list" claim is meant literally — which is why the
          version stamp gets a row instead of a diplomatic silence. Derived
          from the same reads the rest of Home already makes; nothing here
          is stored about having looked. */}
      <Sheet open={storedOpen} onClose={() => setStoredOpen(false)} title={S.storedTitle}>
        <div className="home-stored">
          {(() => {
            const contextCount = Object.keys(answers.answeredAt).length;
            const skillCount = (skillsAnswers.repeatables['skills'] ?? []).length;
            const scoreCount = report?.scores?.length ?? 0;
            const hiddenCount = Object.keys(dismissals.dismissed).length;
            const rows: string[] = [];
            if (contextCount > 0) rows.push(S.storedContext(contextCount));
            if (skillCount > 0) rows.push(S.storedSkills(skillCount));
            if (scoreCount > 0) rows.push(S.storedScores(scoreCount));
            if (hiddenCount > 0) rows.push(S.storedHidden(hiddenCount));
            if (voicePref !== undefined) rows.push(S.storedVoice(voicePref));
            if (metaStored) rows.push(S.storedMeta);
            return rows.length === 0 ? (
              <p className="home-stored-row">{S.storedNone}</p>
            ) : (
              <ul className="home-stored-list">
                {rows.map((row) => (
                  <li key={row} className="home-stored-row">
                    {row}
                  </li>
                ))}
              </ul>
            );
          })()}
          <p className="home-stored-outro">{S.storedOutro}</p>
        </div>
      </Sheet>
    </div>
  );
}
