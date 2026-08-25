import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/panel/tokens.css';
import { BrainGlobe } from '../../../src/panel/components/BrainGlobe';
import { fileToggle } from '../../../src/core/files/toggle';
import { BRAIN_NAV_HOME } from '../../../src/core/globe/workBrain';
import type { BrainNav } from '../../../src/core/globe/workBrain';
import { contextModules, contextOutline } from '../../../src/core/flow/flow';
import { nodeDetailsByNode } from '../../../src/core/flow/nodeDetails';
import { nodeSummaries } from '../../../src/core/flow/nodeSummary';
import { outlineNodeState } from '../../../src/core/flow/outline';
import { sectionHealthMap } from '../../../src/core/freshness/sectionHealth';
import { halfLifeFor } from '../../../src/core/freshness/halfLives';
import { recommend, recommendationsByNode } from '../../../src/core/recommend/engine';
import type { AnswerValue, FileOutlineNode } from '../../../src/schema/flow.types';
import type { Answers } from '../../../src/schema/storage.types';
import type { OutlineNodeState } from '../../../src/core/flow/outline';

/**
 * V1.2 VB-14a. A mount for the Brain globe on its own, so
 * tests/e2e/brain-globe.spec.ts can drive the real component in a real
 * browser before anything wires it into the drawer.
 *
 * Its own page rather than a section added to harness.html: that file is the
 * R1-03 component gallery and several other specs scan it, and a globe that
 * grabs `touch-action` and pointer capture has no business sitting in the
 * middle of them.
 *
 * The states below are the shape a mid-interview session produces — some
 * sections written, one being written now, the rest untouched — so the three
 * node treatments are all on screen at once.
 */
const STATES: Record<string, OutlineNodeState> = {
  sec1: 'reached',
  sec2: 'reached',
  sec3: 'reached',
  sec4: 'current',
  sec5: 'untouched',
  sec6: 'untouched',
  sec7: 'untouched',
  sec8: 'untouched',
  sec9: 'untouched',
  sec10: 'untouched',
};

/**
 * V1.4 VB-23. Real answers, because the split's detail panel is the one thing
 * on this stage whose layout depends on content: `2.1 Roles` with three
 * records is the longest real sub-section in the file and is what the panel's
 * proportions were settled against (see BrainGlobe.css). The wording is the
 * ported flow's own — the option labels come out of `role_names`'s options and
 * the mandates out of `role_mandate`'s `ideas`, so nothing here is invented
 * copy dressed up as a person's answer.
 */
const ANSWERS = {
  values: {
    preferred_name: 'Ada',
    role_names: ['manager', 'volunteer-board', 'freelancer'],
  },
  repeatables: {
    roles: [
      {
        role_name: 'Manager / Team Lead',
        role_for: 'employer',
        role_mandate: 'Keep the team’s reporting accurate, on time, and trusted by leadership.',
        role_standing: 'primary',
        role_durability: 'current',
      },
      {
        role_name: 'Volunteer / Board Member',
        role_for: 'community',
        role_mandate: 'Raise money and awareness for a cause I care about.',
        role_standing: 'occasional',
        role_durability: 'current',
      },
      {
        role_name: 'Freelancer / Contractor',
        role_for: 'clients',
        role_mandate: 'Deliver design work clients are happy to pay for again.',
        role_standing: 'secondary',
        role_durability: 'historical',
      },
    ],
  },
};

/**
 * V1.5 VB-24 / VB-25 / VB-27 — the models this stage has to be looked at in,
 * chosen with `?model=`: `empty` (nothing answered), `half` (the default, and
 * what every earlier spec drives), `complete` (answered, complete and fresh —
 * the unified glow), `stale` (the same file with one section past its own
 * half-life, which must visibly break it), and `rich` (a finished file with
 * three real roles in it, one of them aged past the roles clock — the only
 * model in which a node summary has categories AND a recommendation to show).
 *
 * THE HEALTH IS DERIVED, NOT FABRICATED. Each model builds real `Answers` and
 * runs the real `sectionHealthMap` over the real modules, so the unified state
 * on this page is true for the same reason it would be true in the panel. A
 * fixture that hand-wrote `state: 'done'` would prove the CSS and nothing else.
 * VB-27's summaries and recommendations are derived the same way, by the same
 * two functions the drawer calls.
 */
type Model = 'empty' | 'half' | 'complete' | 'stale' | 'rich';

const MODEL = ((): Model => {
  const asked = new URLSearchParams(window.location.search).get('model');
  return asked === 'empty' || asked === 'complete' || asked === 'stale' || asked === 'rich' ? asked : 'half';
})();

/**
 * The stage size, with `?stage=`. 300 is what every spec before V1.5 drives and
 * is what the drawer gives Brain at a comfortable height; 260 is the SMALLEST
 * stage the drawer ever opens Brain at (core/drawer/mode.ts's own note, quoted
 * in BrainGlobe.css), and it is the size VB-27's floating card has the least
 * room in. A feature checked only at its roomiest size is a feature checked in
 * the one place it cannot fail.
 */
const STAGE = ((): number => {
  const asked = Number(new URLSearchParams(window.location.search).get('stage'));
  return Number.isFinite(asked) && asked >= 180 ? Math.round(asked) : 300;
})();

const NOW = new Date('2026-08-23T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS).toISOString();

function empty(): Answers {
  return { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };
}

/**
 * Every top-level question in the flow, answered today.
 *
 * The gates are answered "no" on purpose, which is a real and complete way to
 * finish `3. My World` and `4. Initiatives` — `skipIf` takes the whole block
 * out of the interview, so those sections genuinely have one question and it
 * genuinely has an answer (core/freshness/sectionHealth.ts's own note on what
 * "8 of 8" counts).
 */
function complete(): Answers {
  const values: Record<string, AnswerValue> = {};
  const answeredAt: Record<string, string> = {};
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node || node.kind === 'intro') continue;
      const key = node.outKey ?? node.key ?? node.id;
      values[key] = node.kind === 'yesno' ? 'no' : node.kind === 'multi' ? ['Answered'] : 'Answered';
      answeredAt[key] = daysAgo(1);
    }
  }
  return { values, repeatables: {}, answeredAt, reflectedAt: {} };
}

/** The complete file with one section left to age past its own clock. `4.
 * Initiatives` runs the shortest one in the table — 90 days. */
function stale(): Answers {
  const answers = complete();
  for (const id of contextOutline.find((node) => node.id === 'sec4')!.questionIds) {
    if (answers.answeredAt[id]) answers.answeredAt[id] = daysAgo(halfLifeFor('sec4') + 30);
  }
  return answers;
}

/**
 * V1.5 VB-27 — the file the node summary was actually laid out against.
 *
 * A finished file (so `recommend` speaks at all — it is silent while the
 * interview still has questions waiting) with the three real roles above
 * written into `2.1 Roles`, every field of every record answered, and the
 * first role's "is this current?" answer stamped past the roles clock. That
 * one stamp is what produces the single recommendation on this page, through
 * the real engine: a role marked current, last confirmed seven months ago.
 */
function rich(): Answers {
  const answers = complete();
  answers.values.role_names = ANSWERS.values.role_names;
  answers.repeatables.roles = ANSWERS.repeatables.roles.map((role) => ({ ...role }));
  ANSWERS.repeatables.roles.forEach((role, index) => {
    for (const key of Object.keys(role)) {
      if (key === 'role_name') continue; // the seed, not a question of its own
      answers.answeredAt[`roles#${index}#${key}`] = daysAgo(2);
    }
  });
  // Seven months since "this role is current" — past DUE_AFTER_DAYS, which is
  // what core/freshness/nextMove.ts asks and what core/recommend folds in.
  answers.answeredAt['roles#0#role_durability'] = daysAgo(212);
  return answers;
}

/**
 * The mid-interview file — and V1.8 VB-46 made it have to be a REAL one.
 *
 * `STATES` above hand-writes sec1–sec3 as `reached`, and until VB-46 that was
 * the whole of what lit an orb. It is not any more: an orb is lit from the
 * COUNT now (core/freshness/sectionLife.ts, the one rule List and Brain both
 * read), so a fixture that claimed "reached" with nothing recorded would draw
 * three muted orbs under three lit labels — the page would be lying about the
 * thing every spec below measures.
 *
 * So the three sections those states name really do hold answers: their OWN
 * questions, answered. Deliberately NOT their children's — `2.1 Roles` keeps
 * exactly the three real roles above and 2.2–2.5 keep nothing, because that is
 * the shape VB-23's detail panel and VB-27's summaries were laid out against
 * and several specs measure it directly.
 */
function half(): Answers {
  const values: Record<string, AnswerValue> = { ...ANSWERS.values };
  const mine = new Set(['sec1', 'sec2', 'sec3'].flatMap((id) => contextOutline.find((n) => n.id === id)!.questionIds));
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node || node.kind === 'intro' || !mine.has(node.id)) continue;
      const key = node.outKey ?? node.key ?? node.id;
      if (values[key] !== undefined) continue;
      values[key] = node.kind === 'yesno' ? 'no' : node.kind === 'multi' ? ['Answered'] : 'Answered';
    }
  }
  return { values, repeatables: { ...ANSWERS.repeatables }, answeredAt: {}, reflectedAt: {} };
}

const MODEL_ANSWERS: Record<Model, Answers> = {
  empty: empty(),
  half: half(),
  complete: complete(),
  stale: stale(),
  rich: rich(),
};

const answers = MODEL_ANSWERS[MODEL];
const HEALTH = sectionHealthMap(contextOutline, contextModules, answers, null, NOW);
/** V1.5 VB-27. The two derivations behind the floating summary, run exactly as
 * FileDrawer runs them — counts from the same answers the health above is
 * built from, and recommendations from the same engine Home draws its list
 * with, so a card here says what the panel would say. */
const SUMMARIES = nodeSummaries(contextOutline, answers, HEALTH);
const RECOMMENDATIONS = recommendationsByNode(recommend({ answers, now: NOW }));
const DETAILS = nodeDetailsByNode(contextOutline, answers);
/** `half` keeps the hand-written states above, because every earlier spec on
 * this page is written against them. The others read theirs off the same
 * answers the health does, so the picture cannot disagree with itself. */
const MODEL_STATES: Record<string, OutlineNodeState> =
  MODEL === 'half'
    ? STATES
    : Object.fromEntries(contextOutline.map((node) => [node.id, outlineNodeState(node, answers.values, null)]));

/**
 * V1.8 VB-48 — the tier above, with `?work=1`.
 *
 * Behind a flag on purpose. Without it the globe gets no `files` prop at all,
 * which is the showcase-of-one-file it has been since V1.2 and is what every
 * spec written before V1.8 drives — so this page proves the new tier without
 * moving the ground under twelve existing tests.
 *
 * `?work=1` opens at the work brain; `?work=file` mounts at the file tier with
 * the tier above available, which is how the drawer really opens.
 */
const WORK = ((): 'off' | 'work' | 'file' => {
  const asked = new URLSearchParams(window.location.search).get('work');
  return asked === '1' || asked === 'work' ? 'work' : asked === 'file' ? 'file' : 'off';
})();

function Harness() {
  const [selected, setSelected] = useState<FileOutlineNode | null>(null);
  /** The one piece of shared navigation state, exactly as `FileDrawer` holds
   * it: which tier, and which file. Ephemeral, never stored. */
  const [nav, setNav] = useState<BrainNav>(WORK === 'work' ? { tier: 'work', file: 'context' } : BRAIN_NAV_HOME);
  const files = fileToggle(nav.file, {});

  return (
    <main style={{ width: 400, margin: '0 auto', padding: 20, boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 16, fontFamily: 'var(--font-sans)' }}>Brain globe harness</h1>
      {/* V2.0 VB-69 — THE GROUND BELONGS TO THE DRAWER NOW.
          The stage stopped painting a field of its own, so the surface the
          picture sits in is `.filedrawer-stage`'s (surfaces/FileDrawer.css).
          This page stands in for the drawer, so it has to supply that ground
          or every contrast measured here is taken against a white page the
          product never shows.

          One declaration, and deliberately no padding: the globe's own box is
          where it was, so nothing measured in tests/e2e/brain-globe.spec.ts
          moves by a pixel. */}
      <div data-testid="stage" style={{ background: 'var(--globe-field)' }}>
      <BrainGlobe
        sections={contextOutline}
        states={MODEL_STATES}
        health={HEALTH}
        size={STAGE}
        details={DETAILS}
        summaries={SUMMARIES}
        recommendations={RECOMMENDATIONS}
        onSelect={setSelected}
        {...(WORK === 'off' ? {} : { files, file: nav.file, tier: nav.tier, onTier: setNav })}
      />
      </div>
      {/* Where the drawer's own detail panel will go. Here it exists only so a
          test can read back what the globe reported without reaching into
          React's internals. */}
      <p data-testid="selected" style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        {selected ? selected.id : 'none'}
      </p>
      {/* V1.8 VB-48. What the shared navigation state holds right now — the
          value the drawer hands to BOTH views. Printed so a test can read the
          state back without reaching into React. */}
      <p data-testid="nav" style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        {`${nav.tier}:${nav.file}`}
      </p>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Harness />);
