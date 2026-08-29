import { describe, expect, it } from 'vitest';
import { orbPulses, orbState } from './orbState';
import type { OrbState } from './orbState';
import type { SectionHealth } from '../freshness/sectionHealth';
import type { SectionLife } from '../freshness/sectionLife';

/**
 * R-07 — three states, composed from the two folds that already decide them.
 *
 * The claim these tests are really for is AGREEMENT: an orb must never say
 * something the edges around it or the list below it would contradict. So the
 * inputs here are the same two the rest of the picture reads.
 */
function health(over: Partial<SectionHealth>): SectionHealth {
  return {
    id: 'sec3',
    state: 'done',
    total: 6,
    answered: 6,
    skipped: 0,
    left: 0,
    due: 0,
    lastAnsweredAt: null,
    ageDays: 1,
    elapsed: null,
    halfLifeDays: 180,
    ...over,
  };
}

describe('orbState', () => {
  it('is complete when the section glows — every question in, nothing due', () => {
    expect(orbState('lit', health({ state: 'done' }))).toBe('complete');
  });

  it('is started when the section is lit but not finished', () => {
    expect(orbState('lit', health({ state: 'partly', answered: 2, left: 4, due: 0 }))).toBe('started');
  });

  it('is untouched when nothing is in it', () => {
    expect(orbState('dim', health({ state: 'not-yet', answered: 0, left: 6 }))).toBe('untouched');
  });

  it('COMPLETE WINS OVER STARTED, which is what makes the three exclusive', () => {
    // A finished section is also a lit one. Asking `sectionGlows` second would
    // report every finished section as merely started, and the brightest thing
    // on the stage would never appear.
    expect(orbState('lit', health({ state: 'done' }))).not.toBe('started');
  });

  it('a section past its own clock is started again, not complete', () => {
    // `due` is the one number that takes a glow away (sectionGlows), and it
    // should: a stale section has something live in it again.
    expect(orbState('lit', health({ state: 'due', due: 2 }))).toBe('started');
  });

  it('says structural for a vertex with no section on it', () => {
    // Two of the solid's twelve hold the shape up and carry nothing.
    expect(orbState(null, undefined)).toBe('structural');
    expect(orbState(undefined, undefined)).toBe('structural');
  });

  it('degrades to the life alone when there is no health at all', () => {
    // The showcase globe has no flow behind it. Lit without health cannot be
    // proved complete, so it reads as started rather than as finished — the
    // safe direction, and the same picture the globe drew before VB-46.
    expect(orbState('lit', undefined)).toBe('started');
    expect(orbState('dim', undefined)).toBe('untouched');
  });
});

describe('orbPulses', () => {
  it('breathes on started, and on nothing else', () => {
    const states: OrbState[] = ['untouched', 'started', 'complete', 'structural'];
    expect(states.filter(orbPulses)).toEqual(['started']);
  });

  it('is the reason the still version loses nothing', () => {
    // The glow is where the state lives and the pulse is only ever an extra on
    // top of it, so stopping every pulse still leaves three distinguishable
    // states. If this ever fails, `prefers-reduced-motion` has become a
    // degradation rather than an equivalent (docs/GUARDRAILS.md).
    const drawn = (s: OrbState) => (s === 'complete' ? 'glow-done' : s === 'started' ? 'glow-live' : 'none');
    expect(new Set(['untouched', 'started', 'complete'].map((s) => drawn(s as OrbState))).size).toBe(3);
  });
});

/**
 * `sectionLife`'s own vocabulary, pinned here so a new member of it cannot
 * slip past this fold unnoticed: every life must map to one of the four
 * states, and `orbState` must be total over them.
 */
describe('the whole vocabulary is covered', () => {
  it('maps every SectionLife to a state', () => {
    const lives: SectionLife[] = ['live', 'lit', 'dim'];
    for (const life of lives) {
      expect(['untouched', 'started', 'complete']).toContain(orbState(life, health({ state: 'partly' })));
    }
  });
});
