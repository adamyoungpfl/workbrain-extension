import { describe, expect, it } from 'vitest';
import { RUN_LENGTH, allRuns, askableIds, endsRun, runOf, runOrdinal, runsIn } from './runs';
import { contextModules } from './flow';
import type { Module, Step } from '../../schema/flow.types';

function step(id: string, kind: Step['kind'] = 'text'): Step {
  return { id, module: 1, section: 1, q: id, kind } as Step;
}
function mod(id: string, nodes: Step[]): Module {
  return { id, n: 1, number: 1, title: id, purpose: '', required: true, estimatedMinutes: [1, 2], nodes } as unknown as Module;
}

describe('how a module divides into runs', () => {
  it('is one run when the module is shorter than a run', () => {
    const runs = runsIn(mod('m', [step('a'), step('b')]));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.nodeIds).toEqual(['a', 'b']);
    expect(runs[0]!.of).toBe(1);
  });

  it('splits at five, and the last run takes the remainder', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const runs = runsIn(mod('m', ids.map((id) => step(id))));
    expect(runs.map((r) => r.nodeIds)).toEqual([['a', 'b', 'c', 'd', 'e'], ['f', 'g']]);
    expect(runs.every((r) => r.of === 2)).toBe(true);
  });

  it('folds a trailing run of ONE back into the run before it', () => {
    // A payoff card after a single question is ceremony, not reward.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const runs = runsIn(mod('m', ids.map((id) => step(id))));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.nodeIds).toHaveLength(6);
  });

  it('never crosses a module boundary', () => {
    const runs = allRuns([mod('one', [step('a'), step('b')]), mod('two', [step('c')])]);
    expect(runs.map((r) => r.moduleId)).toEqual(['one', 'two']);
    expect(runs[0]!.nodeIds).toEqual(['a', 'b']);
  });

  /**
   * INTRO SLIDES ARE NOT QUESTIONS. A slide is read, not answered — the
   * module transitions and V2.5 VB-114's tour. Counting them would put run
   * boundaries inside the tour, and would make Orientation (four real
   * questions wrapped in four slides) look like eight.
   */
  it('counts askable nodes only, never the slides between them', () => {
    const m = mod('m', [step('slide', 'intro'), step('a'), step('b'), step('slide2', 'intro')]);
    expect(askableIds(m)).toEqual(['a', 'b']);
    expect(runsIn(m)[0]!.nodeIds).toEqual(['a', 'b']);
    expect(runOf([m], 'slide')).toBeNull();
  });

  it('counts a repeatable block as one, the unit topLevelIndex has always counted', () => {
    const block = { id: 'roles', fields: [], seedFrom: undefined } as unknown as Step;
    const runs = runsIn(mod('m', [step('a'), block]));
    expect(runs[0]!.nodeIds).toEqual(['a', 'roles']);
  });
});

describe('where a node sits', () => {
  const m = mod('m', ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => step(id)));

  it('reports the run and the place in it', () => {
    expect(runOf([m], 'c')).toMatchObject({ place: 2 });
    expect(runOf([m], 'f')).toMatchObject({ place: 0 });
  });

  it('knows which node ENDS a run — the moment the payoff fires', () => {
    expect(endsRun([m], 'e')).toMatchObject({ index: 0 });
    expect(endsRun([m], 'g')).toMatchObject({ index: 1 });
    expect(endsRun([m], 'd')).toBeNull();
  });

  it('numbers runs across the whole walk, not just inside one module', () => {
    const flow = [mod('one', [step('a')]), mod('two', [step('b')])];
    expect(runOrdinal(flow, runsIn(flow[1]!)[0]!)).toBe(1);
  });
});

/**
 * THE SHIPPED FLOW, MEASURED. These numbers are what the beat row will show
 * real people, and what BS-03a's micro-proof trigger is defined against — so
 * they are pinned here rather than left to be rediscovered.
 */
describe('the Context flow, as runs', () => {
  it('divides into runs no longer than five', () => {
    for (const run of allRuns(contextModules)) {
      expect(run.nodeIds.length, run.moduleId).toBeLessThanOrEqual(RUN_LENGTH);
      expect(run.nodeIds.length, run.moduleId).toBeGreaterThan(1);
    }
  });

  it('opens with Orientation as ONE run of four — the slides are not questions', () => {
    const first = allRuns(contextModules)[0]!;
    expect(first.moduleId).toBe('orientation');
    expect(first.nodeIds).toHaveLength(4);
    expect(first.of).toBe(1);
  });

  /**
   * BS-03a's trigger. "The second run boundary" is the end of About Me —
   * nine questions in, which is the review's "they have answered ten
   * questions", and the first point at which a NAME exists for the
   * micro-proof to use (preferred_name, and the roles block).
   */
  it('puts the second run boundary at the end of About Me', () => {
    const runs = allRuns(contextModules);
    expect(runs[1]!.moduleId).toBe('about-me');
    const answeredByThen = runs[0]!.nodeIds.length + runs[1]!.nodeIds.length;
    expect(answeredByThen).toBe(9);
    expect(endsRun(contextModules, runs[1]!.nodeIds.at(-1)!)).toMatchObject({ moduleId: 'about-me' });
  });

  it('splits the seven-question module and no other', () => {
    const multi = contextModules.filter((m) => runsIn(m).length > 1).map((m) => m.id);
    expect(multi).toEqual(['how-i-communicate']);
    expect(runsIn(contextModules.find((m) => m.id === 'how-i-communicate')!).map((r) => r.nodeIds.length)).toEqual([5, 2]);
  });
});
