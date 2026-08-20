import type { Flows } from '../../schema/flow.types';

/**
 * ⚠️  STUB. Port the real 12 modules before R1-05 from:
 *     ../modelcitizen/src/lib/contextInterviewFlow.ts
 *
 * Do not paraphrase the questions — the wording is the product's voice.
 * Write an adapter with a test; do not reshape the source by hand.
 *
 * The shape below is complete and correct; only the content is abridged.
 */
export const FLOWS: Flows = {
  context: [
    {
      id: 'm1-scope', module: 1, section: 0,
      eyebrow: 'MODULE 1 · ORIENTATION',
      q: 'Are we setting this up for work, home, or both?',
      hint: 'This decides what the rest of the questions bother asking about.',
      kind: 'chips', key: 'scope',
      options: [{ v: 'work', l: 'Work' }, { v: 'home', l: 'Home' }, { v: 'both', l: 'Both', rec: true }],
      cues: [
        { play: ['sweep:choices', 'ring:choice[both]'], until: 'choice', say: 'Are we setting this up for work, home, or both?' },
        { play: ['ring:next'], until: 'next' },
      ],
      sketchOn: { scope: { work: 'scope:work', home: 'scope:home', both: 'scope:both' } },
    },
    // … 11 more modules
  ],
  proof: [], skills: [], actions: [], drift: [],
};
