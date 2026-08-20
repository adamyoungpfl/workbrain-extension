import { describe, it, expect, vi } from 'vitest';
import type { CueLink } from '../../schema/flow.types';
import { parseCueSpec, runCueChain } from './engine';
import type { CueEngineDeps } from './engine';

function makeDeps() {
  const resolve = vi.fn((target: string) => [`el:${target}`]);
  const apply = vi.fn();
  const clearAll = vi.fn();
  const announce = vi.fn();
  const deps: CueEngineDeps<string> = { resolve, apply, clearAll, announce };
  return { deps, resolve, apply, clearAll, announce };
}

describe('parseCueSpec', () => {
  it('splits a plain verb:target spec', () => {
    expect(parseCueSpec('sweep:choices')).toEqual({ verb: 'sweep', target: 'choices' });
  });

  it('splits a point spec into target and label on the pipe', () => {
    expect(parseCueSpec('point:page.composer|Ask it here')).toEqual({
      verb: 'point',
      target: 'page.composer',
      label: 'Ask it here',
    });
  });

  it('a point spec with no label omits the field entirely, rather than setting it to undefined', () => {
    const parsed = parseCueSpec('point:demo-attach');
    expect(parsed).toEqual({ verb: 'point', target: 'demo-attach' });
    expect(parsed && 'label' in parsed).toBe(false);
  });

  it('an empty target still parses — e.g. a spec authored as just "focus:"', () => {
    expect(parseCueSpec('focus:')).toEqual({ verb: 'focus', target: '' });
  });

  it('returns null for an unrecognised verb rather than throwing — a malformed cue must never break the flow around it (docs/GUARDRAILS.md)', () => {
    expect(parseCueSpec('sparkle:choices')).toBeNull();
  });

  it('returns null for a spec with no colon at all', () => {
    expect(parseCueSpec('choices')).toBeNull();
  });
});

describe('runCueChain', () => {
  const CHAIN: CueLink[] = [
    { play: ['sweep:a'], until: 'choice', say: 'Pick one.' },
    { play: ['ring:b'], until: 'next', say: 'Press next.' },
    { play: ['focus:c'], until: 'paste' },
  ];

  it('plays link 0 immediately on start, clearing first', () => {
    const { deps, clearAll, apply, announce } = makeDeps();
    runCueChain(CHAIN, deps);

    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ verb: 'sweep', target: 'a' }, ['el:a']);
    expect(announce).toHaveBeenLastCalledWith('Pick one.');
  });

  it('the exact case docs/TESTING.md names: firing the until events in order advances exactly one link at a time', () => {
    const { deps, clearAll, apply } = makeDeps();
    const chain = runCueChain(CHAIN, deps);
    expect(chain.index).toBe(0);

    chain.fire('choice');
    expect(chain.index).toBe(1);
    expect(clearAll).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenLastCalledWith({ verb: 'ring', target: 'b' }, ['el:b']);

    chain.fire('next');
    expect(chain.index).toBe(2);
    expect(clearAll).toHaveBeenCalledTimes(3);
    expect(apply).toHaveBeenLastCalledWith({ verb: 'focus', target: 'c' }, ['el:c']);

    chain.fire('paste');
    expect(chain.index).toBe(3);
    expect(chain.done).toBe(true);
    expect(clearAll).toHaveBeenCalledTimes(4);
  });

  it('firing an unrelated event advances nothing', () => {
    const { deps, clearAll, apply } = makeDeps();
    const chain = runCueChain(CHAIN, deps);
    const clearCountAtStart = clearAll.mock.calls.length;
    const applyCountAtStart = apply.mock.calls.length;

    // Link 0 is waiting for 'choice', not 'paste' or 'download'.
    chain.fire('paste');
    expect(chain.index).toBe(0);
    expect(clearAll).toHaveBeenCalledTimes(clearCountAtStart);
    expect(apply).toHaveBeenCalledTimes(applyCountAtStart);

    chain.fire('download');
    expect(chain.index).toBe(0);
    expect(clearAll).toHaveBeenCalledTimes(clearCountAtStart);
  });

  it('an event matching a later link but not the current one does not skip ahead', () => {
    const { deps } = makeDeps();
    const chain = runCueChain(CHAIN, deps);
    chain.fire('paste'); // link 2's event, but link 0 is current
    expect(chain.index).toBe(0);
    chain.fire('next'); // link 1's event, still not current
    expect(chain.index).toBe(0);
  });

  it('an empty chain is immediately done and announces nothing', () => {
    const { deps, announce, apply, clearAll } = makeDeps();
    const chain = runCueChain([], deps);
    expect(chain.done).toBe(true);
    expect(chain.index).toBe(0);
    expect(clearAll).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith(undefined);
  });

  it('a link with no `say` announces undefined; the next link with one overwrites it', () => {
    const { deps, announce } = makeDeps();
    const chain = runCueChain(
      [
        { play: [], until: 'next' },
        { play: [], until: 'choice', say: 'Later.' },
      ],
      deps,
    );
    expect(announce).toHaveBeenLastCalledWith(undefined);
    chain.fire('next');
    expect(announce).toHaveBeenLastCalledWith('Later.');
  });

  it('an unrecognised verb inside `play` is skipped, and does not stop the rest of the same link from playing', () => {
    const { deps, apply } = makeDeps();
    runCueChain([{ play: ['sparkle:x', 'ring:y'], until: 'next' }], deps);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith({ verb: 'ring', target: 'y' }, ['el:y']);
  });

  it('a link can play more than one spec, each resolved and applied independently', () => {
    const { deps, apply, resolve } = makeDeps();
    runCueChain([{ play: ['focus:field', 'point:page.composer|Ask it here'], until: 'paste' }], deps);
    expect(resolve).toHaveBeenCalledWith('field');
    expect(resolve).toHaveBeenCalledWith('page.composer');
    expect(apply).toHaveBeenCalledWith({ verb: 'focus', target: 'field' }, ['el:field']);
    expect(apply).toHaveBeenCalledWith(
      { verb: 'point', target: 'page.composer', label: 'Ask it here' },
      ['el:page.composer'],
    );
  });

  it('fire() after the chain is already done does nothing further', () => {
    const { deps, clearAll } = makeDeps();
    const chain = runCueChain([{ play: [], until: 'next' }], deps);
    chain.fire('next');
    expect(chain.done).toBe(true);
    const countAtDone = clearAll.mock.calls.length;

    chain.fire('next');
    expect(clearAll).toHaveBeenCalledTimes(countAtDone);
    expect(chain.done).toBe(true);
  });

  it('stop() clears immediately, announces nothing, and marks the chain done regardless of position', () => {
    const { deps, clearAll, announce } = makeDeps();
    const chain = runCueChain(CHAIN, deps);
    chain.stop();

    expect(chain.done).toBe(true);
    expect(clearAll).toHaveBeenCalledTimes(2); // once at start, once from stop()
    expect(announce).toHaveBeenLastCalledWith(undefined);

    chain.fire('choice'); // no-op — already done
    expect(clearAll).toHaveBeenCalledTimes(2);
  });
});
