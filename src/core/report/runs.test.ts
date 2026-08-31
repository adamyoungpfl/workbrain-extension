import { describe, expect, it } from 'vitest';
import { appendRun, comparison, latestTask, missingTally, runsForTask } from './runs';
import type { ProofRun, ReportState } from '../../schema/storage.types';

function run(over: Partial<ProofRun>): ProofRun {
  return { at: '2026-08-31T09:00:00.000Z', task: 'Draft my status update.', stage: 'baseline', answer: 'A.', ...over };
}

describe('appendRun', () => {
  it('starts a history where there is none', () => {
    expect(appendRun(undefined, run({}))).toEqual({ scores: [], runs: [run({})] });
  });

  it('appends without reordering or dropping, and leaves scores alone', () => {
    const before: ReportState = { scores: [{ at: 'x', value: 2, of: 4 }], runs: [run({ answer: 'first' })] };
    const after = appendRun(before, run({ answer: 'second' }));
    expect(after.runs?.map((r) => r.answer)).toEqual(['first', 'second']);
    expect(after.scores).toEqual(before.scores);
  });
});

describe('runsForTask', () => {
  it('groups by the TASK, so changing a goal does not merge two comparisons', () => {
    // The claim this fold exists for. A run of "draft my status update" and a
    // run of "help me plan a launch" are two things on one axis, not a
    // comparison, and time cannot tell them apart.
    const report: ReportState = {
      scores: [],
      runs: [run({ task: 'Old goal.' }), run({ task: 'New goal.' }), run({ task: 'Old goal.', stage: 'context' })],
    };
    expect(runsForTask(report, 'Old goal.')).toHaveLength(2);
    expect(runsForTask(report, 'New goal.')).toHaveLength(1);
  });

  it('ignores whitespace differences, which are not different tasks', () => {
    const report: ReportState = { scores: [], runs: [run({ task: '  Draft it.  ' })] };
    expect(runsForTask(report, 'Draft it.')).toHaveLength(1);
  });
});

describe('comparison', () => {
  const report: ReportState = {
    scores: [],
    runs: [
      run({ stage: 'baseline', answer: 'first baseline' }),
      run({ stage: 'context', answer: 'early context' }),
      run({ stage: 'baseline', answer: 'later baseline' }),
      run({ stage: 'context', answer: 'later context' }),
      run({ stage: 'skill', answer: 'with recipe' }),
    ],
  };

  it('pins the BASELINE to the first one — it is a historical fact', () => {
    // A later "no file" run by somebody who has since done the interview is
    // not where they started, and letting it overwrite the record would make
    // the spine's own first arrow untrue.
    expect(comparison(report, 'Draft my status update.').baseline?.answer).toBe('first baseline');
  });

  it('takes the LATEST context and skill runs — those measure the file as it is now', () => {
    const c = comparison(report, 'Draft my status update.');
    expect(c.context?.answer).toBe('later context');
    expect(c.skill?.answer).toBe('with recipe');
  });

  it('reports only the stages that exist, rather than filling in blanks', () => {
    const early: ReportState = { scores: [], runs: [run({ stage: 'baseline' })] };
    const c = comparison(early, 'Draft my status update.');
    expect(c.baseline).toBeDefined();
    expect(c.context).toBeUndefined();
    expect(c.skill).toBeUndefined();
  });

  it('is empty for a task with no runs, and for no report at all', () => {
    expect(comparison(report, 'Never asked.')).toEqual({});
    expect(comparison(undefined, 'anything')).toEqual({});
  });
});

describe('latestTask', () => {
  it('is the task of the most recent run', () => {
    const report: ReportState = { scores: [], runs: [run({ task: 'Older.' }), run({ task: 'Newer.' })] };
    expect(latestTask(report)).toBe('Newer.');
  });

  it('is null with no history', () => {
    expect(latestTask(undefined)).toBeNull();
    expect(latestTask({ scores: [] })).toBeNull();
  });
});

describe('missingTally', () => {
  it('counts across runs, most-repeated first — a gap named once is an anecdote', () => {
    const report: ReportState = {
      scores: [],
      runs: [
        run({ missing: ['the vendor headcount', 'a date'] }),
        run({ missing: ['The vendor headcount'] }),
        run({ missing: ['the vendor headcount', 'my budget'] }),
      ],
    };
    expect(missingTally(report)).toEqual([
      { item: 'the vendor headcount', count: 3 },
      { item: 'a date', count: 1 },
      { item: 'my budget', count: 1 },
    ]);
  });

  it('folds case and whitespace, or the signal hides inside its own variants', () => {
    const report: ReportState = { scores: [], runs: [run({ missing: ['  A Date ' ] }), run({ missing: ['a date'] })] };
    expect(missingTally(report)).toEqual([{ item: 'A Date', count: 2 }]);
  });

  it('is empty when nothing was ever missing, and when there is no report', () => {
    expect(missingTally({ scores: [], runs: [run({})] })).toEqual([]);
    expect(missingTally(undefined)).toEqual([]);
  });
});
