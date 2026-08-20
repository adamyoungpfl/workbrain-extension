import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import type { CueLink } from '../../schema/flow.types';
import { useCueChain } from './useCueChain';
import type { UseCueChainResult } from './useCueChain';
import { clearCueRegistry, registerCueTarget } from './registry';
import { mount } from '../components/testUtils';

afterEach(() => {
  clearCueRegistry();
  document.body.replaceChildren();
});

function Harness({
  links,
  onApi,
}: {
  links: CueLink[] | undefined;
  onApi: (api: UseCueChainResult) => void;
}) {
  const api = useCueChain(links);
  onApi(api);
  return null;
}

describe('useCueChain', () => {
  it('wires the chain to the real registry and verbs: playing link 0 marks a registered target and exposes its `say`', () => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    registerCueTarget('demo', target);

    const chain: CueLink[] = [{ play: ['ring:demo'], until: 'next', say: 'Press next.' }];
    let latest: UseCueChainResult | undefined;
    mount(<Harness links={chain} onApi={(api) => (latest = api)} />);

    expect(target.classList.contains('cue-ring')).toBe(true);
    expect(latest?.say).toBe('Press next.');
  });

  it('fire() advances to the next link, marking its target and clearing the previous one', () => {
    const a = document.createElement('button');
    const b = document.createElement('button');
    document.body.appendChild(a);
    document.body.appendChild(b);
    registerCueTarget('a', a);
    registerCueTarget('b', b);

    const chain: CueLink[] = [
      { play: ['ring:a'], until: 'choice' },
      { play: ['bob:b'], until: 'next' },
    ];
    let latest: UseCueChainResult | undefined;
    mount(<Harness links={chain} onApi={(api) => (latest = api)} />);
    expect(a.classList.contains('cue-ring')).toBe(true);

    act(() => latest?.fire('choice'));
    expect(a.classList.contains('cue-ring')).toBe(false);
    expect(b.classList.contains('cue-bob')).toBe(true);
  });

  it('fire() with an unrelated event changes nothing', () => {
    const a = document.createElement('button');
    document.body.appendChild(a);
    registerCueTarget('a', a);
    const chain: CueLink[] = [{ play: ['ring:a'], until: 'choice' }];
    let latest: UseCueChainResult | undefined;
    mount(<Harness links={chain} onApi={(api) => (latest = api)} />);

    act(() => latest?.fire('download'));
    expect(a.classList.contains('cue-ring')).toBe(true);
  });

  it('tracks a `point` cue as pointer state rather than a DOM class, since drawing the overlay needs geometry the hook does not own', () => {
    const chain: CueLink[] = [{ play: ['point:somewhere|Look here'], until: 'next' }];
    let latest: UseCueChainResult | undefined;
    mount(<Harness links={chain} onApi={(api) => (latest = api)} />);
    expect(latest?.pointer).toEqual({ target: 'somewhere', label: 'Look here' });
  });

  it('advancing past a point cue clears the pointer state', () => {
    const chain: CueLink[] = [
      { play: ['point:somewhere|Look here'], until: 'choice' },
      { play: [], until: 'next' },
    ];
    let latest: UseCueChainResult | undefined;
    mount(<Harness links={chain} onApi={(api) => (latest = api)} />);
    expect(latest?.pointer).not.toBeNull();

    act(() => latest?.fire('choice'));
    expect(latest?.pointer).toBeNull();
  });

  it('an empty or undefined chain marks nothing and says nothing', () => {
    let latest: UseCueChainResult | undefined;
    mount(<Harness links={undefined} onApi={(api) => (latest = api)} />);
    expect(latest?.say).toBeUndefined();
    expect(latest?.pointer).toBeNull();
  });

  it('two chains running at once do not clear each other\'s marks — a real bug caught by tests/e2e/cues.spec.ts running two demo chains on one page: a second chain\'s first clearAll, before it had marked anything of its own, wiped the first chain\'s already-live mark, because clearAll originally swept the whole document instead of just what each chain itself had applied', () => {
    const a = document.createElement('button');
    document.body.appendChild(a);
    registerCueTarget('chain-one-target', a);

    let firstApi: UseCueChainResult | undefined;
    mount(<Harness links={[{ play: ['ring:chain-one-target'], until: 'next' }]} onApi={(api) => (firstApi = api)} />);
    expect(a.classList.contains('cue-ring')).toBe(true);

    // A second, independent chain starts on the same page — its own first
    // clearAll must not touch the first chain's element at all.
    mount(<Harness links={[{ play: [], until: 'next' }]} onApi={() => {}} />);
    expect(a.classList.contains('cue-ring')).toBe(true);
    expect(firstApi?.say).toBeUndefined(); // unaffected by the second chain's announce
  });

  it('unmounting clears whatever was marked', () => {
    const a = document.createElement('button');
    document.body.appendChild(a);
    registerCueTarget('a', a);
    const chain: CueLink[] = [{ play: ['ring:a'], until: 'next' }];
    const { unmount } = mount(<Harness links={chain} onApi={() => {}} />);
    expect(a.classList.contains('cue-ring')).toBe(true);
    unmount();
    expect(a.classList.contains('cue-ring')).toBe(false);
  });
});
