import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Banner,
  PeaksSvg,
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
import { multipleRecordCount } from '../../core/flow/multiples';
import { fileAsked, fileFinished, shownFileSlots } from '../../core/files/slots';
import type { FileSlotId } from '../../core/files/slots';
// V1.8 VB-47. The file's name, the lock's sentence and the padlock itself,
// shared with the drawer's toggle so the shelf and the switcher cannot say
// different things about the same file — see components/fileLabels.tsx.
import { fileName } from '../components/fileLabels';
import { contextModules, contextOutline, skillsModules, skillsOutline } from '../../core/flow/flow';
import { NO_DISMISSALS, dismiss, readDismissals } from '../../core/recommend/dismissals';
import type { Recommendation, RecommendationTarget } from '../../core/recommend/types';
/* The download handlers moved to Context Development with the Center (4d). */
import type { Answers, Dismissals, ReportState } from '../../schema/storage.types';
import { S } from '../strings';
import { hasBaseline } from '../../core/report/runs';
import { featuredMove, maintenanceQueue } from '../../core/freshness/queue';
import './Home.css';

export interface HomeProps {
  /** Starts (or resumes — `Flow` always resumes from wherever `wb:answers`
   * actually leaves off, see core/flow/runner.ts's `findPosition`) the
   * Context interview with no deep-link override. */
  onStart: () => void;
  /** V3.0 pass 7 - the next-move queue's door: opens the interview AT the
   * pressed question with the Word-style sweep armed, so finishing one
   * item walks to the next open-or-stale after it. */
  onOpenNext?: ((questionId: string) => void) | undefined;
  /** Pass 4d: Context Development - baseline, Download Center, Proving
   * Grounds and the comparison, one area. (The old onOpenBaseline prop
   * rides App -> ContextHub directly now.) */
  onOpenContextHub: () => void;
  /** Pass 4n: the pre-launch errand — until a baseline run exists, the
   * hero features it and this is where its button goes. */
  onBaseline?: (() => void) | undefined;
  /** Pass 4q: the Download Center area — every file, one folder. */
  onOpenDownloads: () => void;
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
  /** Pass 4c: the skills hub - Create/Review/Redeem in one destination. */
  onOpenSkillsHub: () => void;
  /* onOpenProof and onOpenCapability left this surface with pass 4c: the
     proof door points at the public Proving Grounds page, and Skill
     Training is the hub's Review door (App routes it there). The in-app
     flows themselves are untouched. */
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
  expanded,
  panel,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  sub: string;
  ready: boolean;
  onPress?: (() => void) | undefined;
  href?: string | undefined;
  /** V3.0 pass 2 — a row that OPENS rather than acts: aria-expanded rides
   * the button and the panel renders inside the row's own li, so the
   * disclosure is one list item, not a second list. */
  expanded?: boolean | undefined;
  panel?: ReactNode | undefined;
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
  /* THE ROW'S TONE, keyed off the id it already has (Adam, 2026-09-02).

     Every row was the one neutral card, so the list read as six of the same
     thing and the only way to tell them apart was to read them. A tone per
     row gives the eye something to land on, and — because the chip, the label
     and the ground all move together — the hover reads as one object lighting
     rather than as a background swapping behind fixed text.

     Kept as SUBTLE as the neutral it replaces: these are tints of the panel's
     own ground, not brand colour. `download` is deliberately absent from the
     map and stays standard, per Adam. */
  return (
    <li className={ready ? 'home-row' : 'home-row is-waiting'} data-tone={id}>
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
          {...(expanded !== undefined ? { 'aria-expanded': expanded } : {})}
        >
          {body}
        </button>
      ) : (
        // Not a disabled control: there is nothing to press yet, so there is
        // no control. A disabled button in the tab order is a promise the
        // screen cannot keep.
        <span className="home-row-hit">{body}</span>
      )}
      {expanded && panel}
    </li>
  );
}

/* `lockedReason` retired in pass 4k: the locked card's go-verb ("Complete
   Context") says the way out, so the reason sentence's job is done by the
   control itself. */

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
/* DOC_ICON retired in 4q - the person (BUST_ICON) is the Context mark now. */
const LAYERS_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="wbflow-layers" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--globe-node-2-solid)" />
        <stop offset="1" stopColor="var(--splash-link-end)" />
      </linearGradient>
    </defs>
    <path d="M12 2.5 22 8.5 12 14.5 2 8.5Z" fill="url(#wbflow-layers)" />
    <path d="M4.4 12.6 12 17.2l7.6-4.6 2.4 1.4-10 6-10-6Z" fill="url(#wbflow-layers)" />
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
/** Pass 4q: Context Development's new mark - a PERSON, the concept the
 * file describes, in the same flow-silhouette language. */
const BUST_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="wbflow-bust" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--globe-node-2-solid)" />
        <stop offset="1" stopColor="var(--splash-link-end)" />
      </linearGradient>
    </defs>
    <path d="M12 3.5a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Z" fill="url(#wbflow-bust)" />
    <path d="M12 14c4.4 0 7.6 2.5 8.3 6.3.1.6-.3 1.2-1 1.2H4.7c-.7 0-1.1-.6-1-1.2C4.4 16.5 7.6 14 12 14Z" fill="url(#wbflow-bust)" />
  </svg>
);
const DOWNLOAD_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="wbflow-dl" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--globe-node-2-solid)" />
        <stop offset="1" stopColor="var(--splash-link-end)" />
      </linearGradient>
    </defs>
    <path d="M10.5 3h3v8h3.5L12 16.5 7 11h3.5Z" fill="url(#wbflow-dl)" />
    <path d="M4 18.5h16V21H4Z" fill="url(#wbflow-dl)" />
  </svg>
)

/** VB-145 — the upload door's glyph: the same tray, arrow rising out. */
/* UPLOAD_ICON retired in 4t - the chrome wears the File Hub's tray. */

/** The pending row's glyph - a rocket standing on its pad, in the same
 * 17px currentColor stroke as every neighbour. */
/* ROCKET_ICON retired - its row lives in Context Development (4d). */

/* PROVE_ICON retired - its row lives in Context Development (4d). */

/** BS-04 (§4) — proof two's row glyph: a play mark, because the row runs
 * something. Same 17px stroke house style as its neighbours. */
const RUN_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="wbflow-run" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
        <stop stopColor="var(--globe-node-2-solid)" />
        <stop offset="1" stopColor="var(--splash-link-end)" />
      </linearGradient>
    </defs>
    <path d="M8 4.5v15l13-7.5Z" fill="url(#wbflow-run)" />
  </svg>
)

/* LIBRARY_ICON retired with its row (pass 4c - the hub gathered the doors). */

/* V2.8 VB-133: TIM_ICON left with its tile; the Redeemer's key stands
 * there now — a code that opens a skill. */
/** Pass 4k (Adam): "a plus symbol where the logo is only visible in the
 * plus space like it is looking at the logo through the plus cutout" - the
 * W Peaks drawn full-bleed, clipped by a plus-shaped window. The peaks'
 * own splash palette shows through; the chip's violet family stays the
 * frame around it. */
const PLUS_ICON = (
  <svg width="17" height="17" viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <clipPath id="wbplus-cut">
      <path d="M20 2 H44 V20 H62 V44 H44 V62 H20 V44 H2 V20 H20 Z" />
    </clipPath>
    <g clipPath="url(#wbplus-cut)">
      {/* The icon's own dark field fills the cutout, so the plus reads as
          a solid mark with the peaks showing through it. */}
      <rect x="0" y="0" width="64" height="64" fill="var(--ink)" />
      <g transform="translate(0 -3) scale(1 1.2)">
        <path d="M 3 56 L 16 13 L 29 56 Z" fill="var(--globe-node-2-solid)" stroke="var(--globe-node-2-solid)" strokeWidth="5" strokeLinejoin="round" />
        <path d="M 21 56 L 33 24 L 45 56 Z" fill="var(--splash-peak-blue)" stroke="var(--splash-peak-blue)" strokeWidth="5" strokeLinejoin="round" />
        <path d="M 37 56 L 50 8 L 61 56 Z" fill="var(--splash-link-end)" stroke="var(--splash-link-end)" strokeWidth="5" strokeLinejoin="round" />
      </g>
    </g>
  </svg>
);

/* REDEEM_ICON retired with its row (pass 4c - the hub gathered the doors). */

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
  /** Pass 4j (Adam): an unfinished file's status pill IS the button that
   * moves it - "Start now" / "Finish it now". When present it replaces the
   * status, and the card splits: a cover button keeps the whole card as
   * the open door, with the action standing above it. */
  action?: { label: string; onClick(): void } | undefined;
}) {
  const name = fileName(props.file);
  if (props.action) {
    return (
      <div className="home-card is-split" data-file={props.file} data-active={props.active ? 'on' : 'off'}>
        <button type="button" className="home-card-cover" aria-label={name} onClick={props.onOpen} />
        <span className="home-card-top">
          <span className="home-card-chip" aria-hidden="true">
            {props.icon}
          </span>
          <span className="home-card-id">
            <span className="home-card-name">
              {name.replace(/\.md$/, '')}
              <span className="home-card-ext">.md</span>
            </span>
          </span>
        </span>
        <button type="button" className="home-card-act" onClick={props.action.onClick}>
          {props.action.label}
        </button>
        <span className="home-card-bar" aria-hidden="true">
          <i style={{ width: `${props.barPercent}%` }} />
        </span>
        <span className="home-card-desc">{props.desc}</span>
        <span className="home-card-go">
          {S.cardOpen}
          {GO_ARROW}
        </span>
      </div>
    );
  }
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
          <span className="home-card-name">
            {name.replace(/\.md$/, '')}
            <span className="home-card-ext">.md</span>
          </span>
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
function LockedCard(props: { file: FileSlotId; desc: string; onCompleteContext(): void }) {
  const name = fileName(props.file);
  /* Pass 4k (Adam): the locked card stopped being a dead control. It wears
     the red family it will join, the LOCKED pill stands where Context's
     "Start now" stands (same slot, same size), and the whole card is a
     door whose go-verb is the one thing that opens it: "Complete Context".
     The pill is the state; the card is the way out of it. */
  return (
    <button
      type="button"
      className="home-card is-locked"
      data-file={props.file}
      onClick={props.onCompleteContext}
    >
      <span className="home-card-top">
        <span className="home-card-chip" aria-hidden="true">
          {/* 4p: the lock joins the flow-silhouette language on its dark tile. */}
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" focusable="false">
            <defs>
              <linearGradient id="wbflow-lock" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                <stop stopColor="var(--globe-node-2-solid)" />
                <stop offset="1" stopColor="var(--splash-link-end)" />
              </linearGradient>
            </defs>
            <path
              d="M7 10V7a5 5 0 0 1 10 0v3h.5a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2H7Zm2 0h6V7a3 3 0 0 0-6 0v3Z"
              fill="url(#wbflow-lock)"
              fillRule="evenodd"
            />
          </svg>
        </span>
        <span className="home-card-id">
          <span className="home-card-name">
            {name.replace(/\.md$/, '')}
            <span className="home-card-ext">.md</span>
          </span>
        </span>
      </span>
      <span className="home-card-pill">{S.badgeLocked}</span>
      {/* Pass 4l: the same bar-underline Context's Start now stands on -
          empty here, because nothing of Skills is built while locked. */}
      <span className="home-card-bar" aria-hidden="true">
        <i style={{ width: '0%' }} />
      </span>
      <span className="home-card-desc">{props.desc}</span>
      <span className="home-card-go">
        {S.lockedGo}
        {GO_ARROW}
      </span>
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
export function Home({ onStart, onOpenNext, onOpenContextHub, onOpenTarget, onOpenFile, onOpenSkillsHub, onOpenMultiples, onBaseline, onOpenDownloads }: HomeProps) {
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
  /** BS-02 — the beta's return channel, in the chrome that already exists. */
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [homeToast, setHomeToast] = useState<string | null>(null);
  /** V2.8 VB-133 — the Skill Redeemer's sheet, and its landed-toast. */
  /* redeemOpen left with the sheet - the hub hosts it now (pass 4c). */
  /** Spine step 3 — the comparison sheet. `report` is already loaded above for
   *  the meter's Share segment, so this reads it rather than fetching it twice
   *  and risking two answers to one question. */
  /* compareOpen moved into Context Development with its door (4d). */
  /* compareTask reads in the hub now. */
  const [redeemToast, setRedeemToast] = useState<string | null>(null);
  /** V2.6 VB-127 — the What's-stored sheet, and the two keys it lists that
   * nothing else on Home reads: the version stamp and the narrator choice.
   * `undefined` = the key does not exist, and an absent key gets NO row —
   * the sheet's "whole list" claim has to be literally true. */
  const [storedOpen, setStoredOpen] = useState(false);
  /** V3.0 pass 2 - the download disclosure. Local, not stored: which rows
   * are open is a fact about this visit, not about the person. */
  /* downloadsOpen moved into Context Development with the Center (4d). */
  /** V3.0 pass 7 - whether the queue's "See all" is open. A fact about
   * this visit, never stored. */
  const [queueOpen, setQueueOpen] = useState(false);
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

  /* `persist` left with the UploadSheet (4t) - the File Hub writes its
     own imports now. */

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
  /* V3.0 pass 7 - THE QUEUE (core/freshness/queue.ts): every open question
     and every answer past its section's half-life, in file order, plus the
     one to feature. Derived at render like every other fold on this
     screen; nothing stored. */
  const queue = maintenanceQueue(contextModules, contextOutline, answers, new Date());
  const featured = featuredMove(queue);
  /* Pass 4n: until this is true, the hero features the baseline errand. */
  const baselineTaken = hasBaseline(report);
  /* Pass 4r (Adam): "the link for Start Now, Open and Complete Context
     should all link to the item in Your Next Move. As such, if Pre-Launch
     Baseline has not been completed, that is the first move. The goal is
     to have that before we start the interviews." One door, the hero's
     own: the baseline until it is taken, then the featured question. */
  const nextMoveDoor =
    !baselineTaken && onBaseline
      ? onBaseline
      : featured && onOpenNext
        ? () => onOpenNext(featured.questionId)
        : onStart;
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
  /* Presence, for the download lines: a file is PRESENT once one answer
   * has landed - the moment a download would contain something of the
   * person's (the same line lockupMeta draws). */
  /* contextStarted reads in Context Development's Center now (4d). */
  /** BS-04 (§4) — "reachable after two skills without finishing all of
   * Skills", so this is a fold over the RECORDS rather than over the
   * interview's completeness (core/proof/capability.ts). */
  /* capabilityOpen moved to the hub with its door (pass 4c). */

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
        {/* Pass 4k (Adam): "Change the logo at the top of the homepage to
            the workbrain logo" - the W Peaks, the product's own mark. */}
        <PeaksSvg size={20} />
        <p className="home-chrome-name">
          {S.appName} <span>· {S.chromeCompany}</span>
        </p>
        {/* V2.9 VB-145 — the upload door, at the top of the UI where Adam
            asked for it. It only OPENS a sheet; the sheet carries the
            replace-warning and the careful path (UploadSheet.tsx). */}
        {/* Pass 4t: the upload door became the FILE HUB - files in and
            out through one page; the upload sheet lives there now. */}
        <button
          type="button"
          className="home-chrome-upload"
          aria-label={S.fileHub}
          onClick={onOpenDownloads}
        >
          {DOWNLOAD_ICON}
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
      {/* V3.0 pass 7 (Adam): YOUR NEXT MOVE leads every state of Home now.
          With work in the queue it features the next question (or the
          oldest stale answer) with the rest behind "See all"; with the
          queue empty it hosts the recommendations hero, which covers what
          the queue deliberately does not (records, section aggregates).
          The welcome banner this replaces folded its promise and its time
          line into the fresh state's own card. */}
      {/* COMPACT, AND A COMPLEMENT (Adam, 2026-09-03: "make that Your Next
          Move section more compact. We can show the next move and a way to
          see other pending actions. It should compliment the status bar,
          not supersede it"). The card is a slim left-set row now — one
          move, one verb — and the way to the rest sits in the section's
          own header line, the dashboard grammar (label left, "See all N"
          right) a person already knows. */}
      <section className="home-next" aria-labelledby="home-next-label">
        <div className="home-next-head">
          <h2 className="home-section-label" id="home-next-label">
            {S.homeNextLabel}
          </h2>
          {/* ONLY ONCE STARTED. On a fresh install "See all 34" is every
              unanswered question dressed as a to-do list, and — found by the
              welcome a11y suite — a header door Tab stops on BEFORE the one
              CTA a new person needs. Day zero has one move; the door to the
              rest earns its place with the first answer. */}
          {baselineTaken && featured && hasStarted && queue.length > 1 && (
            <button
              type="button"
              className="home-next-more"
              aria-expanded={queueOpen}
              onClick={() => setQueueOpen((o) => !o)}
            >
              {queueOpen ? S.homeNextFewer : S.homeNextAll(queue.length)}
            </button>
          )}
        </div>
        {/* THE CARD IS THE BUTTON (Adam, 2026-09-04: "The button should be
            those two pieces of information (section and prompt) so the user
            knows what they are about to answer next. Make the button span
            the whole section"). The section eyebrow is the header, the
            question is the prompt, and pressing either is pressing the one
            thing this card offers. The verbs the old inner button carried
            retire with it — what you are about to answer IS the label. Day
            zero keeps its verb as the button's own caption: a fresh person
            still needs an action to read, and the a11y suite holds the tab
            stop by that name. */}
        {/* Pass 4n (Adam): "by default, the Your Next Move should be the
            Baseline question" - until a baseline run exists, the hero IS
            the pre-launch errand and pressing it goes there. */}
        {!baselineTaken && onBaseline ? (
          <button type="button" className="home-next-card" data-kind="baseline" onClick={onBaseline}>
            <span className="home-next-section">{S.heroBaselineKicker}</span>
            <span className="home-next-q">{S.heroBaselineQ}</span>
            <span className="home-next-answer">
              {S.homeNextAnswer}
              {/* 4s: the arrow is part of the label - larger, rounder,
                  centred on the text's own line. */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M3 8 H12.2 M8.5 3.8 L12.7 8 L8.5 12.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ) : featured ? (
          <button
            type="button"
            className="home-next-card"
            data-kind={featured.kind}
            /* With no queue door wired (older hosts), the way in is the
               plain resume - the same journey, minus the sweep. */
            onClick={() => (onOpenNext ? onOpenNext(featured.questionId) : onStart())}
          >
            <span className="home-next-section">{featured.section}</span>
            <span className="home-next-q">{featured.question}</span>
            {featured.kind === 'stale' && (
              <span className="home-next-age-line">{S.homeNextStale(featured.ageDays ?? 0)}</span>
            )}
            {/* The visible affordance (Adam, 2026-09-08): a pill drawn as
                the action, INSIDE the one big button - pressing anywhere is
                pressing this. It joins the accessible name, which is
                right: the name now ends in what pressing does. */}
            <span className="home-next-answer">
              {S.homeNextAnswer}
              {/* 4s: the arrow is part of the label - larger, rounder,
                  centred on the text's own line. */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
                <path d="M3 8 H12.2 M8.5 3.8 L12.7 8 L8.5 12.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        ) : null}
        {featured ? (
          <div className="home-next-restwrap">
            {queueOpen && (
              <ul className="home-next-list">
                {queue.map((item) => (
                  <li key={item.questionId}>
                    <button
                      type="button"
                      className="home-next-row"
                      onClick={() => (onOpenNext ? onOpenNext(item.questionId) : onStart())}
                    >
                      <span className="home-next-row-q">{item.question}</span>
                      <span className="home-next-row-meta">
                        {item.kind === 'open' ? S.homeNextOpen : S.homeNextAge(item.ageDays ?? 0)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        {hasStarted && !featured && (
        <div
          className={top ? 'home-recs' : 'home-recs is-quiet'}
          ref={recsRef as React.RefObject<HTMLDivElement>}
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
        </div>
        )}
      </section>

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

      {/* The welcome banner retired here (V3.0 pass 7, Adam: "change that
          default banner 'Teach AI who' and replace it with YOUR NEXT
          MOVE") - its promise line, its time line and its way in all live
          in the fresh state's featured card above. */}

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
          { label: S.steps[0], percent: utilization.segments.baseline },
          { label: S.steps[1], percent: utilization.segments.context },
          { label: S.steps[2], percent: utilization.segments.skill },
          { label: S.steps[3], percent: utilization.segments.prove },
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
          icon={BUST_ICON}
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
          /* Pass 4j (Adam): while the file is unfinished the pill is the
             BUTTON that moves it, and the line under it says what finishing
             buys. `onStart` is the interview's own plain resume. */
          action={
            contextComplete
              ? undefined
              : { label: hasStarted ? S.ctxFinishNow : S.ctxStartNow, onClick: nextMoveDoor }
          }
          barPercent={utilization.segments.context}
          desc={contextComplete ? S.cardContextDesc : S.cardContextUnlockDesc}
          // R-08 — "once the context file is active". Active is `hasStarted`:
          // one real answer in it. Not "finished", because a file somebody is
          // half way through is exactly the one worth pulling the eye to.
          active={hasStarted}
          /* 4r: a FRESH card's Open is the funnel's door too - the file
             view earns its opening with the first answer. */
          onOpen={hasStarted ? () => onOpenFile('context') : nextMoveDoor}
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
            barPercent={utilization.segments.skill}
            desc={S.cardSkillsDesc}
            /* Pass 4k (Adam): open goes to the Skills homepage - Skill
               Development, the page that mirrors Context Development. */
            onOpen={onOpenSkillsHub}
          />
        ) : (
          <LockedCard file="skills" desc={S.cardSkillsDesc} onCompleteContext={nextMoveDoor} />
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
        {/* THREE OPERATIONAL AREAS (pass 4d; Adam, 2026-09-08: "This would
            give us 3 areas (Context Development, Skills Development and
            Workbrain+). Let's make the 3 tile present like 3 operational
            areas they can explore to further improve or edit their work.")
            The pending-baseline row, the download disclosure, the Proving
            Grounds link and the compare row all live inside Context
            Development now; the skills doors inside Skill Development. */}
        <HomeRow
          id="context"
          icon={BUST_ICON}
          label={S.rowContextHub}
          sub={S.rowContextHubSub}
          ready
          onPress={onOpenContextHub}
        />
        <HomeRow
          id="skills"
          icon={RUN_ICON}
          label={S.rowSkillsHub}
          sub={S.rowSkillsHubSub}
          ready
          onPress={onOpenSkillsHub}
        />
        {/* Workbrain+ keeps its door and loses its pitch. The price and the
            four goods belong on the page this links to; on Home they cost
            ~230px and made the panel read as a storefront on the screen a
            person opens to do work (§6). */}
        {/* The 4q downloads row folded into the chrome's File Hub (4t). */}
        <HomeRow id="plus" icon={PLUS_ICON} label={S.plusTitle} sub={S.rowPlusSub} ready href={PLUS_URL} />
      </ul>


      {/* ONE SENTENCE, PINNED (Adam, 2026-09-08): the promise and its
          receipt reading as a single line at the page's foot - the lead
          runs into the link that finishes it. */}
      <footer className="home-foot">
        <p className="home-privacy">
          {S.homePrivacyNote}{' '}
          <button type="button" className="home-foot-link" onClick={() => setStoredOpen(true)}>
            {S.storedLink}
          </button>
        </p>
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

      {/* UploadSheet moved into the File Hub with its door (4t). */}
      {homeToast && <Toast message={homeToast} onDismiss={() => setHomeToast(null)} />}

      {/* V2.8 VB-133 — the Skill Redeemer: the code from a bought or
          commissioned skill lands the pack through VB-124's path; the
          toast speaks the share row's own words. */}
{/* RedeemSheet moved into the SkillsHub with its door (pass 4c). */}
      {/* Spine step 3 — a sheet rather than a surface, because it is a thing
          you look at and close rather than a place you work. GUARDRAILS allows
          exactly one overlay and this is one: short, self-contained, escapable. */}
{/* The Comparison sheet moved into Context Development (4d). */}
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
