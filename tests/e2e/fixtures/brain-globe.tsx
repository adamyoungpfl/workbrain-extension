import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/panel/tokens.css';
import { BrainGlobe } from '../../../src/panel/components/BrainGlobe';
import { contextModules, contextOutline } from '../../../src/core/flow/flow';
import { nodeDetailsByNode } from '../../../src/core/flow/nodeDetails';
import { outlineNodeState } from '../../../src/core/flow/outline';
import { sectionHealthMap } from '../../../src/core/freshness/sectionHealth';
import { halfLifeFor } from '../../../src/core/freshness/halfLives';
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

const DETAILS = nodeDetailsByNode(contextOutline, ANSWERS);

/**
 * V1.5 VB-24 / VB-25 — the three models the illumination has to be looked at
 * in, chosen with `?model=`: `empty` (nothing answered), `half` (the default,
 * and what every earlier spec drives), `complete` (answered, complete and
 * fresh — the unified glow), and `stale` (the same file with one section past
 * its own half-life, which must visibly break it).
 *
 * THE HEALTH IS DERIVED, NOT FABRICATED. Each model builds real `Answers` and
 * runs the real `sectionHealthMap` over the real modules, so the unified state
 * on this page is true for the same reason it would be true in the panel. A
 * fixture that hand-wrote `state: 'done'` would prove the CSS and nothing else.
 */
type Model = 'empty' | 'half' | 'complete' | 'stale';

const MODEL = ((): Model => {
  const asked = new URLSearchParams(window.location.search).get('model');
  return asked === 'empty' || asked === 'complete' || asked === 'stale' ? asked : 'half';
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

const MODEL_ANSWERS: Record<Model, Answers> = {
  empty: empty(),
  half: { ...ANSWERS, answeredAt: {}, reflectedAt: {} },
  complete: complete(),
  stale: stale(),
};

const answers = MODEL_ANSWERS[MODEL];
const HEALTH = sectionHealthMap(contextOutline, contextModules, answers, null, NOW);
/** `half` keeps the hand-written states above, because every earlier spec on
 * this page is written against them. The other three read theirs off the same
 * answers the health does, so the picture cannot disagree with itself. */
const MODEL_STATES: Record<string, OutlineNodeState> =
  MODEL === 'half'
    ? STATES
    : Object.fromEntries(contextOutline.map((node) => [node.id, outlineNodeState(node, answers.values, null)]));

function Harness() {
  const [selected, setSelected] = useState<FileOutlineNode | null>(null);

  return (
    <main style={{ width: 400, margin: '0 auto', padding: 20, boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 16, fontFamily: 'var(--font-sans)' }}>Brain globe harness</h1>
      <BrainGlobe
        sections={contextOutline}
        states={MODEL_STATES}
        health={HEALTH}
        size={300}
        details={DETAILS}
        onSelect={setSelected}
      />
      {/* Where the drawer's own detail panel will go. Here it exists only so a
          test can read back what the globe reported without reaching into
          React's internals. */}
      <p data-testid="selected" style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>
        {selected ? selected.id : 'none'}
      </p>
    </main>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Harness />);
