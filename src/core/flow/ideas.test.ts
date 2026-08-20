import { describe, it, expect } from 'vitest';
import { ideaAt, ideasFor } from './ideas';
import { contextModules } from './flow';
import type { Step } from '../../schema/flow.types';

/**
 * V1.1 VB-08. Two things are worth testing without a browser: the cycle, and
 * the promise that the content this control exists to surface is really in
 * the data. The press cue itself is real rendered motion and is asserted in
 * tests/e2e/ideas.spec.ts — a class toggling is not an animation.
 */

const IDEAS = ['first', 'second', 'third'];

/** Every step in the real ported flow, repeatable fields included — the same
 *  flattening core/flow/runner.ts does when it walks a module's nodes
 *  ('fields' in node is what distinguishes a RepeatableBlock from a Step). */
function allSteps(): Step[] {
  const steps: Step[] = [];
  for (const module of contextModules) {
    for (const node of module.nodes) {
      if ('fields' in node) steps.push(...node.fields);
      else steps.push(node);
    }
  }
  return steps;
}

describe('ideaAt', () => {
  it('gives the first idea for the first press', () => {
    expect(ideaAt(IDEAS, 0)).toBe('first');
  });

  it('walks the list in order, one per press', () => {
    expect([0, 1, 2].map((n) => ideaAt(IDEAS, n))).toEqual(IDEAS);
  });

  it('wraps back to the start after the last one', () => {
    expect(ideaAt(IDEAS, 3)).toBe('first');
    expect(ideaAt(IDEAS, 4)).toBe('second');
  });

  it('keeps wrapping however long someone leans on it', () => {
    // Ten ideas is the real maximum (reference_example_primary), and someone
    // reading through them presses far past the end. Every press must land on
    // a real idea, in order, forever.
    const ten = Array.from({ length: 10 }, (_, i) => `idea ${i}`);
    for (let press = 0; press < 95; press++) {
      expect(ideaAt(ten, press)).toBe(ten[press % 10]);
    }
  });

  it('never returns the same idea twice in a row while alternatives exist', () => {
    // The whole value of a second press is getting something different. With
    // one idea there is nothing else to give, so that case is excluded.
    for (const list of [IDEAS, ['a', 'b'], Array.from({ length: 10 }, (_, i) => `x${i}`)]) {
      for (let press = 0; press < 30; press++) {
        expect(ideaAt(list, press)).not.toBe(ideaAt(list, press + 1));
      }
    }
  });

  it('returns the one idea every time when there is only one', () => {
    expect([0, 1, 2].map((n) => ideaAt(['only'], n))).toEqual(['only', 'only', 'only']);
  });

  it('has nothing to give for an empty list', () => {
    expect(ideaAt([], 0)).toBeNull();
    expect(ideaAt([], 7)).toBeNull();
  });

  it('treats a nonsense press count as a press count, rather than reading off the array', () => {
    // Not reachable through the UI — the caller counts its own presses — but a
    // negative or fractional index would silently produce `undefined` text in
    // the field, which is the worst possible failure for this control.
    expect(ideaAt(IDEAS, -1)).toBe('third');
    expect(ideaAt(IDEAS, -4)).toBe('third');
    expect(ideaAt(IDEAS, 1.9)).toBe('second');
    expect(ideaAt(IDEAS, Number.NaN)).toBe('first');
  });
});

describe('ideasFor', () => {
  const step = (over: Partial<Step>): Step => ({
    id: 'x',
    module: 1,
    section: 0,
    eyebrow: '',
    q: 'q',
    kind: 'text',
    ...over,
  });

  it('offers a text question its own ideas', () => {
    expect(ideasFor(step({ ideas: IDEAS }))).toEqual(IDEAS);
  });

  it('offers nothing where the question has none', () => {
    expect(ideasFor(step({}))).toEqual([]);
    expect(ideasFor(step({ ideas: [] }))).toEqual([]);
  });

  it('offers nothing on a kind that is not a plain text question', () => {
    // Especially `gen`: that field takes what the person's own AI said, and
    // the panel writing into it would corrupt the proof loop's measurement.
    for (const kind of ['gen', 'chips', 'multi', 'yesno', 'intro', 'reflect', 'demo'] as const) {
      expect(ideasFor(step({ kind, ideas: IDEAS })), kind).toEqual([]);
    }
  });

  it('returns one stable empty array rather than a fresh one per call', () => {
    expect(ideasFor(step({}))).toBe(ideasFor(step({ kind: 'chips' })));
  });
});

describe('the ported ideas this button exists to surface', () => {
  it('is still 22 questions carrying 94 written answers', () => {
    const carrying = allSteps().filter((s) => ideasFor(s).length > 0);
    expect(carrying).toHaveLength(22);
    expect(carrying.reduce((total, s) => total + ideasFor(s).length, 0)).toBe(94);
  });

  it('still puts ten on reference_example_primary', () => {
    const step = allSteps().find((s) => s.id === 'reference_example_primary');
    expect(step, 'reference_example_primary should exist in the ported data').toBeTruthy();
    expect(ideasFor(step!)).toHaveLength(10);
  });

  it('attaches ideas only to text questions, so none are silently unreachable', () => {
    // ideasFor withholds them from every other kind. If a re-port ever hangs
    // ideas on a chips or gen question, this fails rather than the content
    // quietly never being shown.
    const withIdeas = allSteps().filter((s) => s.ideas?.length);
    expect(withIdeas.filter((s) => s.kind !== 'text').map((s) => s.id)).toEqual([]);
  });

  it('carries no blank or duplicated idea on any question', () => {
    for (const step of allSteps()) {
      const ideas = ideasFor(step);
      if (ideas.length === 0) continue;
      for (const idea of ideas) expect(idea.trim(), step.id).not.toBe('');
      // A repeat inside one question would look like a press that did nothing.
      expect(new Set(ideas).size, step.id).toBe(ideas.length);
    }
  });
});
