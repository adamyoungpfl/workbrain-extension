import './tokens.css';
import './App.css';
import { useCallback, useEffect, useState } from 'react';
import { Browse } from './surfaces/Browse';
import { generateContextFile, contextFileDate } from '../core/files/generate';
import { generateSkillsFile } from '../core/files/skillsFile';
import { Flow } from './surfaces/Flow';
import { Home } from './surfaces/Home';
import { Multiples } from './surfaces/Multiples';
import { Splash } from './surfaces/Splash';
import { WallPanels } from './components/WallPanels';
import { getSession, setSession } from '../core/storage/client';
import { FeedbackSheet, Button } from './components';
import { getLocal } from '../core/storage/client';
import { positionForQuestionId } from '../core/flow/outline';
import { contextModules, contextOutline, skillsModules, skillsOutline, buildProofModules, buildCapabilityModules } from '../core/flow/flow';
import { SKILLS_FILE_COPY } from '../core/files/skillsFile';
import { ANSWERS_KEY } from '../core/files/answersKey';
import { fileAsked } from '../core/files/slots';
import type { FileSlotId } from '../core/files/slots';
import { ActionsFileView } from './surfaces/ActionsFileView';
import { serviceStepOptions } from '../core/flow/proofAdapter';
import { positionForRecordField } from '../core/flow/runner';
import { capabilityReady } from '../core/proof/capability';
import type { Position } from '../core/flow/runner';
import { positionForTarget } from '../core/recommend/targets';
import type { RecommendationTarget } from '../core/recommend/types';
import { S } from './strings';

/**
 * R1-11: the proof loop's copy, injected into the pure builder — see
 * proofAdapter.ts's header comment on why this assembly can't happen in
 * core/ itself. Built once at module load, same as `contextModules`.
 */
/** BS-04 (§4) — proof two's module, built the same way and for the same
 * reason: its copy is panel chrome, and core/ never imports panel/. */
const capabilityModules = buildCapabilityModules({
  offerQ: S.capHeading,
  doneQ: S.capDone,
});

const proofModules = buildProofModules({
  serviceOptions: serviceStepOptions(S.proofServiceOptions.map((o) => ({ key: o.key, label: o.label }))),
  heading: S.proofHeading,
  pickAI: S.proofPickAI,
  baselineQ: S.proofSub,
  withContextQ: S.proofWithFile,
  judgeQ: S.proofJudge,
  doneQ: S.proofDone,
});

/**
 * V1.7 VB-38 adds `multiples`: the list of roles, people and projects, which
 * is reached from Home and hands a record back to `flow` as a deep link. It is
 * a third surface rather than a screen inside `flow` because nothing on it
 * asks a question — see Multiples.tsx's header.
 *
 * V1.7 VB-37 adds `file` on the same reasoning, and it now sits between the
 * other two: Home is the shelf of files (VB-36), `file` is one of them opened,
 * and `flow` is the interview either of them starts. Nothing on `file` asks a
 * question either — both of its doors hand `flow` a `Position`.
 *
 * EVERY ONE OF THESE IS IN-MEMORY ONLY. Which surface you are on is never
 * stored (docs/ARCHITECTURE.md, "nothing derived is stored"): a reopen lands
 * on Home and re-derives the shelf, the file and the interview's position from
 * `wb:answers`.
 */
type Surface = 'home' | 'file' | 'flow' | 'multiples' | 'actions';
/** BS-04 (§4) adds `capability` — proof two. It runs on the SKILLS store,
 * which is what makes the offer cheap: the recipes it hands over are that
 * store's own records. */
type FlowKind = 'context' | 'proof' | 'skills' | 'capability';

/**
 * V1.7 VB-34. Whether the splash is on screen.
 *
 * Three states, not two, and the third is the important one. `'asking'` is
 * before the session read has come back: the panel renders its real surface
 * and no splash, so the first paint is the panel and cannot be delayed by
 * anything to do with the splash. If the answer turns out to be "not shown
 * yet", the splash arrives over the top a moment later. That ordering is
 * VB-34's "it must not gate the panel's first paint", implemented rather than
 * asserted.
 */
type SplashState = 'asking' | 'showing' | 'gone';

/**
 * Surface router (docs/ARCHITECTURE.md sketches 'home' | 'flow' | 'sheet' — no
 * sheet exists yet in Release 1, see docs/RELEASE-1.md's exclusion list, and
 * the two that have arrived since, `multiples` and `file`, are screens rather
 * than sheets; see the `Surface` union above). Defaults to Home, which is now the
 * landing point both for a fresh open *and* a just-finished interview
 * (`Flow`'s own `onDone`, R1-12) — there is no separate "I just finished"
 * screen anymore. `flowKind` and `jumpTo` are in-memory only, same as
 * everything else about which question is "current" (docs/ARCHITECTURE.md,
 * "nothing derived is stored") — a reopen always re-derives from `wb:answers`,
 * never from a remembered surface.
 */
export default function App() {
  const [surface, setSurface] = useState<Surface>('home');
  const [flowKind, setFlowKind] = useState<FlowKind>('context');
  /**
   * D1 — whether this session came in through the splash's baseline door.
   *
   * EPHEMERAL, like `seenIntros` and `paidRuns` in Flow: a stored flag would be
   * a fact about how somebody arrived, which is behaviour rather than work and
   * is exactly what D2's guardrail row forbids keeping. Reopening the panel
   * lands them in the interview with no offer, which is correct — the door was
   * an offer at a moment, not a setting.
   */
  const [wantBaseline, setWantBaseline] = useState(false);
  /** BS-02 — the feedback sheet the proof's own second offer opens. */
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  /** V2.2 — which file the 'file' surface is showing. In-memory like every
   * other "where am I" fact (docs/ARCHITECTURE.md). */
  const [fileId, setFileId] = useState<Exclude<FileSlotId, 'actions'>>('context');
  const [jumpTo, setJumpTo] = useState<Position | undefined>(undefined);
  const [splash, setSplash] = useState<SplashState>('asking');
  /**
   * BS-03a (§3) — is the Skills door actually open, for the hand-off at the
   * end of the proof. Read once when the shell mounts and re-read whenever
   * the proof is entered, because finishing Context is exactly what opens
   * it. Derived from the answers, never stored: the same fold Home's shelf
   * runs (core/files/slots.ts).
   */
  const [skillsOpen, setSkillsOpen] = useState(false);

  /**
   * V1.7 VB-34 — once per browser session.
   *
   * The flag is written the moment the splash is *shown*, not when it is
   * dismissed. Someone who opens the panel, sees the splash start and closes
   * the panel mid-animation has seen it; showing it again on their next open
   * would be the every-open behaviour the decision rejected.
   *
   * `chrome.storage.session` rather than a module variable, because the side
   * panel's document does not survive being closed — see Splash.tsx's header
   * for the whole argument, and schema/storage.types.ts for why an in-memory
   * area is not the persistence docs/ARCHITECTURE.md forbids. A read that
   * fails answers `undefined`, which shows the splash: the worst case is a
   * brand moment somebody has already seen, and it costs them nothing.
   */
  useEffect(() => {
    let cancelled = false;
    void getSession('wb:splash').then((seen) => {
      if (cancelled) return;
      if (seen) {
        setSplash('gone');
        return;
      }
      setSplash('showing');
      void setSession('wb:splash', true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Stable, so the splash's own listeners are never reset by a re-render.
   * V2.6 VB-126: no intent any more — every press on the splash lands on
   * Home as it stands, and the import door's plumbing left with the door. */
  const endSplash = useCallback(() => {
    setSplash('gone');
  }, []);

  function goHome() {
    setSurface('home');
    setJumpTo(undefined);
  }

  /**
   * BS-03a (§3), Adam's P3 — WHAT FINISHING CONTEXT DOES.
   *
   * The proof used to wait in a tile somebody had to notice, at the end of a
   * screen they had to scroll. §3 fires it the moment Context finishes
   * instead, and Adam's ruling on the cost — landing them straight into a
   * three-minute errand rather than letting them arrive somewhere — was
   * "error on the side of momentum beating a reset".
   *
   * ONCE, THOUGH. Somebody who goes back to fix one answer and finishes
   * again should not be handed the same errand a second time, so this reads
   * the report: a proof that has already been run is not offered again. That
   * is derived from what is stored, not a "seen it" flag — the same
   * discipline every other state in this product follows.
   */
  /** Whether the Skills door at the end of the proof is real. Read on every
   * way IN to the proof, not only the automatic one — the tile is still a
   * route, and a door that only works when you arrive one way is worse than
   * no door. */
  async function refreshSkillsDoor() {
    const answers = await getLocal('wb:answers');
    // O3: the door opens when the interview is over, not when the file is
    // gapless — a skip is a considered answer (Home.tsx carries the note).
    setSkillsOpen(!!answers && fileAsked(contextOutline, contextModules, answers, new Date()));
  }

  async function finishContext() {
    await refreshSkillsDoor();
    const report = await getLocal('wb:report');
    const alreadyProved = (report?.scores.length ?? 0) > 0;
    if (alreadyProved) {
      goHome();
      return;
    }
    openProof();
  }

  /**
   * The one way into the Context interview, from every surface that offers
   * one, and the only place `jumpTo` is ever set.
   *
   * `undefined` means "no deep link" — `Flow` then resumes from wherever
   * `wb:answers` really leaves off (core/flow/runner.ts's `findPosition`).
   * Everything else hands over a `Position` that some pure, tested resolver in
   * core/ produced:
   *
   *   · V1.5 VB-28's recommendations → `positionForTarget` (see `openContext`)
   *   · V1.7 VB-38's multiples       → `positionForRecord` / `positionForNewRecord`
   *   · V1.7 VB-37's file view       → `positionForQuestionId`
   *
   * One router, three callers. Each used to have its own near-identical
   * three-line copy of this, and VB-37 would have made a fourth: resolving a
   * position belongs to whoever knows what is being opened, and routing to it
   * belongs here.
   */
  function openContextAt(position?: Position) {
    setFlowKind('context');
    setJumpTo(position);
    setSurface('flow');
  }

  /**
   * V1.5 VB-28. Where a recommendation's target becomes a real `Position` —
   * building one needs the actual ported `Step` object, which core/recommend
   * has no reason to hand around (it deals in ids and record indices; see its
   * own header on staying a pure derivation over `wb:answers`). The lookup
   * itself is pure and tested in core/recommend/targets.ts; this is only the
   * wiring.
   *
   * `undefined` back means the ported content no longer holds that question,
   * which lands the person on a plain resume rather than nowhere — see
   * `positionForTarget`'s own note on degrading instead of throwing.
   */
  function openContext(target?: RecommendationTarget) {
    openContextAt(target ? positionForTarget(contextModules, target) : undefined);
  }

  /** V2.2 — the Skills interview's door, the same shape as Context's. */
  function openSkillsAt(position?: Position) {
    setFlowKind('skills');
    setJumpTo(position);
    setSurface('flow');
  }

  function openProof() {
    void refreshSkillsDoor();
    setFlowKind('proof');
    setJumpTo(undefined);
    setSurface('flow');
  }

  /**
   * BS-04 (§4) — finishing Skills hands into proof two, the same way BS-03a
   * has finishing Context hand into proof one. The hour is Context → prove
   * it → Skills → watch it run, and a Home screen between the last two would
   * be the place it stalls.
   *
   * Only when there is something to run. `capabilityReady` is a fold over the
   * records, so somebody who wrote one recipe and skipped the rest lands on
   * Home exactly as before — degrade, never break.
   *
   * There is deliberately no "you already did this" guard. Proof one has one
   * (a stored score), and proof two stores no score because §4 says the panel
   * scores nothing. What it means in practice is that fixing a step and
   * walking to the end offers the run again, which is the right loop rather
   * than a repeated nag.
   */
  async function finishSkills() {
    const skills = await getLocal(ANSWERS_KEY.skills);
    if (skills && capabilityReady(skills)) {
      openCapability();
      return;
    }
    goHome();
  }

  /** BS-04 (§4) — proof two's door. */
  function openCapability() {
    setFlowKind('capability');
    setJumpTo(undefined);
    setSurface('flow');
  }

  /**
   * §4's secondary: "fix the step it missed, which routes back into the
   * Skills interview for that step." One question of one record — not the
   * record from the top, and not the interview from wherever it left off.
   */
  function openSkillStepsFor(recordIndex: number) {
    const at = positionForRecordField(skillsModules, 'skills', recordIndex, 'skill_steps');
    openSkillsAt(at);
  }

  /**
   * The router, unchanged. It is a function now only so the splash can be
   * laid over whatever it returns without every branch below repeating the
   * overlay — the splash is on top of the panel, not one more surface the
   * panel can be showing instead.
   */
  /**
   * BS-04 found a real bug here, and the one-word fix is the `key` on every
   * `<Flow>` below.
   *
   * All four branches render `<Flow>` in the SAME slot of this function, so
   * React reconciles them as one component and only updates its props. `Flow`
   * seeds its `viewing` position from `initialPosition` in a `useState`
   * initialiser — which runs once, on mount — so a flow-to-flow move kept the
   * previous flow's position and ignored the deep link entirely. Proof two's
   * "Rewrite the steps" landed on the Skills module intro instead of on the
   * step it named, and finishing Context into the proof had the same shape of
   * problem waiting in it.
   *
   * Keying by `flowKind` says what is actually true: these are four different
   * interviews over three different stores, and moving between them is a new
   * screen, not an update to the old one.
   */
  function currentSurface() {
    if (surface === 'home') {
      return (
        <Home
          onStart={() => openContext()}
          onOpenTarget={(target) => openContext(target)}
          onOpenFile={(id) => {
            // V2.2: Actions is the derived file — its own read-only surface,
            // never the interview file view.
            if (id === 'actions') {
              setSurface('actions');
              return;
            }
            setFileId(id);
            setSurface('file');
          }}
          onOpenProof={openProof}
          onOpenCapability={openCapability}
          onOpenMultiples={() => setSurface('multiples')}
        />
      );
    }

    if (surface === 'file') {
      // V2.4 VB-102: the browse canvas — Brain on top, List below, Edit as
      // the one door into the interview. FileView is retired (decision 6).
      return fileId === 'skills' ? (
        <Browse
          modules={skillsModules}
          outline={skillsOutline}
          answersKey={ANSWERS_KEY.skills}
          name={S.fileSkills}
          share
          generate={(answers) => generateSkillsFile(answers, contextFileDate())}
          onBack={goHome}
          onEdit={(startAt) =>
            openSkillsAt(startAt ? positionForTarget(skillsModules, { in: 'top', questionId: startAt }) : undefined)
          }
        />
      ) : (
        <Browse
          modules={contextModules}
          outline={contextOutline}
          name={S.fileContext}
          generate={(answers) => generateContextFile(answers, contextFileDate())}
          onBack={goHome}
          /* BS-07c (§7.2) — where a leaf card's "Open the list" goes: §8's
             multiples screen, which is the editor for exactly the records the
             card counted. Context only — the Skills file's records have their
             own canvas, and multiples is built on the context outline. */
          onMultiples={() => setSurface('multiples')}
          onEdit={(startAt) =>
            openContextAt(startAt ? positionForTarget(contextModules, { in: 'top', questionId: startAt }) : undefined)
          }
        />
      );
    }

    if (surface === 'actions') {
      return (
        <ActionsFileView
          onBack={goHome}
          onOpenSkills={() => {
            setFileId('skills');
            setSurface('file');
          }}
        />
      );
    }

    if (surface === 'multiples') {
      return (
        <Multiples
          modules={contextModules}
          outline={contextOutline}
          onBack={goHome}
          onOpen={openContextAt}
        />
      );
    }

    if (flowKind === 'proof') {
      return (
        <Flow
          key={flowKind}
          modules={proofModules}
          onHome={goHome}
          renderDone={() => (
            <>
              <p className="flow-q">{S.proofFinished}</p>
              {/* BS-02 — §2: "offer it a second time, once, immediately after
                  the proof delta", which is the one moment a friend writes a
                  paragraph unprompted. A real control in the content, not
                  chrome: this screen has room and the interview's header does
                  not (docs/BETA-SPRINT.md). */}
              <Button type="button" variant="primary" onClick={() => setFeedbackOpen(true)}>
                {S.feedbackOpenLong}
              </Button>
              {/* BS-03a (§3) — "Ends by handing straight into Skills, so the
                  hour never stalls on a Home screen." The door is only real
                  when Skills is actually open; otherwise this is the way
                  back, exactly as it was. Degrade, never break. */}
              {skillsOpen ? (
                <Button type="button" variant="secondary" onClick={() => openSkillsAt()}>
                  {S.proofIntoSkills}
                </Button>
              ) : (
                <Button type="button" variant="secondary" onClick={goHome}>
                  {S.backToFiles}
                </Button>
              )}
            </>
          )}
        />
      );
    }

    /**
     * BS-04 (§4) — proof two. Two screens, one round trip, no baseline.
     *
     * `answersKey` is the SKILLS store and that is the whole trick: the
     * recipes this proof offers are that store's own records, so the offer
     * assembles from `answers` with nothing fetched and nothing duplicated.
     * No `outline` for the same reason the proof above has none — it writes
     * no file, and there is nothing for a tree to show.
     */
    if (flowKind === 'capability') {
      return (
        <Flow
          key={flowKind}
          modules={capabilityModules}
          answersKey={ANSWERS_KEY.skills}
          onDone={goHome}
          onHome={goHome}
          onFixSteps={openSkillStepsFor}
        />
      );
    }

    // V1.1 VB-07: only the Context flow passes an `outline`, because it is the
    // only flow that writes a file. The proof loop above deliberately does not —
    // there is nothing for a file tree to show there.
    if (flowKind === 'skills') {
      return (
        <Flow
          key={flowKind}
          modules={skillsModules}
          outline={skillsOutline}
          answersKey={ANSWERS_KEY.skills}
          fileId="skills"
          fileCopy={SKILLS_FILE_COPY}
          initialPosition={jumpTo}
          onDone={() => void finishSkills()}
          onHome={goHome}
        />
      );
    }
    return (
      <Flow
        key={flowKind}
        modules={contextModules}
        outline={contextOutline}
        initialPosition={jumpTo}
        /* D1 — this session came through the splash's baseline door, so the
           offer to run the goal with nothing loaded stands at the end of the
           gate rather than being skipped past. */
        offerBaseline={wantBaseline}
        onBaselineDone={() => setWantBaseline(false)}
        // BS-03a/P3 — finishing hands into the proof, not back to Home.
        onDone={() => void finishContext()}
        onHome={goHome}
      />
    );
  }

  // The surface first, always, and the splash after it — in the markup and in
  // the order it renders. VB-34: the splash must not gate the panel's first
  // paint, and the cheapest way to guarantee that is for the panel never to
  // wait on it.
  // V2.1. The landmark and the top-level heading, which this panel went its
  // whole life without: every surface opened at <h2>, so the heading structure
  // began at level two and the document had no <h1> anywhere in it.
  //
  // The splash stays OUTSIDE `<main>`, and that is the one judgement call here.
  // It is a cover over the panel rather than a part of it, and it holds its
  // own controls now (VB-73) — putting it inside the landmark would file it as
  // page content and hand a screen reader two competing accounts of what this
  // panel currently is.
  //
  // V2.1 VB-73: while the splash is up, the covered panel is `inert` — one
  // account of the screen at a time. It is what makes the splash's doors
  // keyboard-reachable WITHOUT stealing focus (docs/GUARDRAILS.md: nothing
  // steals focus): the first Tab lands on the first door because everything
  // else declines it, not because anything grabbed it. The attribute rides
  // `splash === 'showing'` exactly, so the 'asking' frame — before the session
  // read answers — renders a live, non-inert panel and the first-paint
  // guarantee is untouched.
  //
  // The spread, not a JSX attribute: React 18 forwards `inert` as a plain
  // attribute but its TypeScript types predate the property. `''` sets it,
  // `undefined` removes it — the two states HTML actually has.
  const inertWhileCovered = splash === 'showing' ? { inert: '' } : {};
  return (
    <>
      {/* V2.4 VB-111 — the ONE canvas. The wall (VB-97) hoists from the flow
          shell to an app-level backdrop, fixed behind every surface at
          negative z-index (above the body's --ground paint, below all
          content — no stacking change to <main>, which must stay unstyled;
          see App.css's header for why). Surfaces sit transparent on it;
          white survives only inside buttons, inputs and cards. */}
      <div className="app-ground" aria-hidden="true">
        <WallPanels />
      </div>
      <main className="app-main" {...(inertWhileCovered as Record<string, string>)}>
        <h1 className="app-sr">{S.appName}</h1>
        {currentSurface()}
      </main>
      {/* BS-02 — the proof's second offer opens this. Mounted at the shell so
          the sheet outlives the surface that asked for it. */}
      <FeedbackSheet
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        to={S.feedbackTo}
        context={{ surface: 'proof' }}
      />
      {splash === 'showing' && (
        <Splash
          onDone={endSplash}
          /* BS-09 (§9) — the tour door goes straight into the interview,
             whose first three steps ARE the tour (components/TourSlide.tsx),
             rather than by way of Home. The splash ends either way; only the
             destination differs. */
          /* D1 (docs/MEASUREMENT-SPINE.md) — the spine's front door. Same
             destination as the tour's, and that is the point: the path IS the
             interview's own opening, because `goal_want` is its first real
             question. What the door changes is that the baseline offer stands
             at the end of the gate instead of being skipped past. */
          onBaseline={() => {
            endSplash();
            setWantBaseline(true);
            /* STRAIGHT TO THE GOAL QUESTION, not to the top of the interview.
               `goal_want` IS the baseline question — "the one thing you want it
               to do better today" — and the offer to run it cannot appear until
               it has an answer, so landing on orientation slide one meant
               falling past the offer entirely and never seeing it.
               Adam, 2026-08-31: the door should go to the baseline question,
               and THEN on to orientation.
               Answering it hands back to `findPosition`, which resumes at the
               first unanswered step — orientation's opening — so the shorter
               road and this one converge one screen later. */
            openContextAt(positionForQuestionId(contextModules, 'goal_want') ?? undefined);
          }}
        />
      )}
    </>
  );
}
