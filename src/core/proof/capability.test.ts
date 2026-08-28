import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_MIN_SKILLS,
  capabilityAsk,
  capabilityPrompt,
  capabilityRecipe,
  capabilityReady,
  capabilityRecord,
  capabilitySkills,
  cardFor,
  nextSkillIndex,
  parseSkillSteps,
} from './capability';
import { buildCapabilityReceipt, capabilityReceiptName } from './receipt';
import type { Answers } from '../../schema/storage.types';
import type { AnswerValue } from '../../schema/flow.types';

/**
 * BS-04 (§4) — proof two's assembly.
 *
 * §4's acceptance, in one list: "the assembled prompt contains the user's
 * steps, output format, cadence and tool names verbatim; the checklist is
 * generated from their steps, not a fixed list; … the receipt saves; the
 * surface is reachable after two skills without finishing all of Skills."
 * Everything but the routing is provable here, without a browser.
 */

function skills(records: Record<string, AnswerValue>[]): Answers {
  return { values: {}, repeatables: { skills: records }, answeredAt: {}, reflectedAt: {} };
}

const WEEKLY = {
  skill_name: 'Weekly ops report',
  skill_trigger: 'weekly_monday',
  skill_tools: ['powerbi', 'teams'],
  skill_inputs: ['dashboard'],
  skill_steps: '1. Pull the queue\n2. Group by severity\n3. Write the summary',
  skill_output: 'md_list_severity',
  skill_autonomy: 'draft',
};

const BOARD = {
  skill_name: 'Board pack prep',
  skill_trigger: 'ad_hoc',
  skill_tools: ['word'],
  skill_steps: '- Gather the decks\n- Merge them\n',
  skill_output: 'one_page_decisions',
};

describe('parseSkillSteps', () => {
  it('strips every marker a person might number a list with, and keeps the words', () => {
    const steps = parseSkillSteps('1. First\n2) Second\n- Third\n• Fourth\n* Fifth\nSixth');
    expect(steps).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth']);
  });

  it('drops blank lines and trims, so a trailing newline is not a step', () => {
    expect(parseSkillSteps('  1. One  \n\n\n2. Two\n')).toEqual(['One', 'Two']);
  });

  it('never invents a step from nothing', () => {
    expect(parseSkillSteps('')).toEqual([]);
    expect(parseSkillSteps(undefined)).toEqual([]);
    expect(parseSkillSteps(null)).toEqual([]);
    expect(parseSkillSteps(['1. not a string'])).toEqual([]);
  });

  it('leaves a number that is part of the sentence alone', () => {
    // "Check the 3 dashboards" is one step, not a marker and four words.
    expect(parseSkillSteps('Check the 3 dashboards')).toEqual(['Check the 3 dashboards']);
  });
});

describe('capabilitySkills', () => {
  it('offers a record only when it has both a name and steps', () => {
    const cards = capabilitySkills(
      skills([
        WEEKLY,
        { skill_name: 'No steps yet' },
        { skill_steps: '1. Orphan step' },
        { skill_name: '   ' , skill_steps: '1. Nameless' },
        BOARD,
      ]),
    );
    expect(cards.map((c) => c.name)).toEqual(['Weekly ops report', 'Board pack prep']);
  });

  it('keeps the RECORD index, not the offer index — the route back needs it', () => {
    const cards = capabilitySkills(skills([{ skill_name: 'No steps' }, WEEKLY]));
    expect(cards).toHaveLength(1);
    expect(cards[0]?.index).toBe(1);
  });

  it('turns option keys into the words the interview offered', () => {
    const card = capabilitySkills(skills([WEEKLY]))[0]!;
    expect(card.cadence).toBe('Weekly, first thing Monday');
    expect(card.outputShape).toBe('A single markdown list, grouped by severity');
    expect(card.tools).toEqual(['Power BI / Tableau', 'Teams']);
  });

  it('passes a typed-in answer through unchanged rather than blanking it', () => {
    const card = capabilitySkills(
      skills([{ ...WEEKLY, skill_trigger: 'Every second Friday', skill_tools: ['Our own console'] }]),
    )[0]!;
    expect(card.cadence).toBe('Every second Friday');
    expect(card.tools).toEqual(['Our own console']);
  });
});

describe('capabilityReady', () => {
  it('opens at two runnable skills and not before', () => {
    expect(CAPABILITY_MIN_SKILLS).toBe(2);
    expect(capabilityReady(skills([]))).toBe(false);
    expect(capabilityReady(skills([WEEKLY]))).toBe(false);
    expect(capabilityReady(skills([WEEKLY, BOARD]))).toBe(true);
  });

  it('does not count a named skill with no steps toward the two', () => {
    // The gate is "the screen works", not "you have typed two names".
    expect(capabilityReady(skills([WEEKLY, { skill_name: 'Named only' }]))).toBe(false);
  });
});

describe('capabilityAsk', () => {
  it('derives the period from their own cadence answer', () => {
    const card = capabilitySkills(skills([WEEKLY]))[0]!;
    expect(capabilityAsk(card, 'weekly_monday')).toBe('Run my Weekly ops report for this week.');
    expect(capabilityAsk(card, 'each_morning')).toBe('Run my Weekly ops report for today.');
    expect(capabilityAsk(card, 'after_meeting')).toBe('Run my Weekly ops report for the last meeting.');
  });

  it('says nothing about a period it cannot know', () => {
    const card = capabilitySkills(skills([BOARD]))[0]!;
    // Ad hoc, on request, and anything they typed themselves.
    expect(capabilityAsk(card, 'ad_hoc')).toBe('Run my Board pack prep.');
    expect(capabilityAsk(card, 'on_request')).toBe('Run my Board pack prep.');
    expect(capabilityAsk(card, 'Every second Friday')).toBe('Run my Board pack prep.');
    expect(capabilityAsk(card, undefined)).toBe('Run my Board pack prep.');
  });
});

describe('capabilityPrompt', () => {
  it('carries their steps, cadence, tools and output shape verbatim', () => {
    const store = skills([WEEKLY]);
    const card = capabilitySkills(store)[0]!;
    const prompt = capabilityPrompt(
      capabilityAsk(card, capabilityRecord(store, 0)?.['skill_trigger']),
      capabilityRecipe(store, 0),
      'Follow it exactly.',
    );

    expect(prompt).toContain('Run my Weekly ops report for this week.');
    for (const step of ['Pull the queue', 'Group by severity', 'Write the summary']) {
      expect(prompt).toContain(step);
    }
    expect(prompt).toContain('Weekly, first thing Monday');
    expect(prompt).toContain('Power BI / Tableau');
    expect(prompt).toContain('A single markdown list, grouped by severity');
    expect(prompt).toContain('Follow it exactly.');
  });

  it('is the ask first, then the recipe — the sentence is what they read', () => {
    const prompt = capabilityPrompt('Run my X.', '## X\nSteps:\n1. Go', 'Lead.');
    expect(prompt.indexOf('Run my X.')).toBe(0);
    expect(prompt.indexOf('Lead.')).toBeLessThan(prompt.indexOf('## X'));
  });

  it('uses the same recipe block Skills.md prints, not a second rendering', () => {
    // If these ever diverge, the AI is told to follow one recipe and the
    // person's file carries another.
    const store = skills([WEEKLY]);
    const recipe = capabilityRecipe(store, 0);
    expect(recipe.startsWith('## Weekly ops report')).toBe(true);
    expect(recipe).toContain('Trigger: Weekly, first thing Monday');
    expect(recipe).toContain('Output: A single markdown list, grouped by severity');
  });

  it('degrades to nothing rather than throwing on a record that is gone', () => {
    expect(capabilityRecipe(skills([]), 4)).toBe('');
    expect(capabilityRecord(skills([]), 4)).toBeUndefined();
  });
});

describe('nextSkillIndex / cardFor', () => {
  it('cycles through the runnable skills and comes back round', () => {
    const store = skills([WEEKLY, { skill_name: 'No steps' }, BOARD]);
    const cards = capabilitySkills(store);
    expect(cards.map((c) => c.index)).toEqual([0, 2]);
    expect(nextSkillIndex(cards, 0)).toBe(2);
    expect(nextSkillIndex(cards, 2)).toBe(0);
  });

  it('lands on the first card when the current one is not offerable', () => {
    const cards = capabilitySkills(skills([WEEKLY, BOARD]));
    expect(cardFor(cards, 9)?.index).toBe(0);
    expect(nextSkillIndex(cards, 9)).toBe(0);
  });

  it('is safe with nothing to cycle through', () => {
    expect(nextSkillIndex([], 0)).toBe(0);
    expect(cardFor([], 0)).toBeUndefined();
  });
});

describe('buildCapabilityReceipt', () => {
  const receipt = {
    skill: 'Weekly ops report',
    ask: 'Run my Weekly ops report for this week.',
    steps: ['Pull the queue', 'Group by severity', 'Write the summary'],
    done: [0, 2],
    on: '3 March 2026',
  };

  it('prints every step in their order, ticked or blank', () => {
    const text = buildCapabilityReceipt(receipt);
    expect(text).toContain('- [x] Pull the queue');
    expect(text).toContain('- [ ] Group by severity');
    expect(text).toContain('- [x] Write the summary');
    // Their order, not hits-then-misses.
    expect(text.indexOf('Pull the queue')).toBeLessThan(text.indexOf('Group by severity'));
    expect(text.indexOf('Group by severity')).toBeLessThan(text.indexOf('Write the summary'));
  });

  it('closes on the count and on who judged it', () => {
    const text = buildCapabilityReceipt(receipt);
    expect(text).toContain('**2 of 3**, first try — judged by me.');
    expect(text).toContain('Workbrain never read the reply.');
  });

  it('says a run where nothing worked, plainly', () => {
    const text = buildCapabilityReceipt({ ...receipt, done: [] });
    expect(text).toContain('**0 of 3**');
    expect(text).not.toContain('- [x]');
  });

  it('names the skill in the file name, and survives a name with a slash in it', () => {
    expect(capabilityReceiptName('Weekly ops report', '3 March 2026')).toBe(
      'Workbrain run — Weekly ops report — 3 March 2026.md',
    );
    expect(capabilityReceiptName('Q1/Q2 rollup', '3 March 2026')).toBe(
      'Workbrain run — Q1 Q2 rollup — 3 March 2026.md',
    );
    expect(capabilityReceiptName('  ', '3 March 2026')).toBe('Workbrain run — skill — 3 March 2026.md');
  });
});
