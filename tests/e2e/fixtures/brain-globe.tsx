import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/panel/tokens.css';
import { BrainGlobe } from '../../../src/panel/components/BrainGlobe';
import { contextOutline } from '../../../src/core/flow/flow';
import { nodeDetailsByNode } from '../../../src/core/flow/nodeDetails';
import type { FileOutlineNode } from '../../../src/schema/flow.types';
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

function Harness() {
  const [selected, setSelected] = useState<FileOutlineNode | null>(null);

  return (
    <main style={{ width: 400, margin: '0 auto', padding: 20, boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 16, fontFamily: 'var(--font-sans)' }}>Brain globe harness</h1>
      <BrainGlobe sections={contextOutline} states={STATES} size={300} details={DETAILS} onSelect={setSelected} />
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
