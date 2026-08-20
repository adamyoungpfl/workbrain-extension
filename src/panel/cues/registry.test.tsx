import { afterEach, describe, expect, it } from 'vitest';
import { clearCueRegistry, registerCueTarget, resolveCueTarget, useCueTarget } from './registry';
import { mount } from '../components/testUtils';

afterEach(() => clearCueRegistry());

describe('registerCueTarget / resolveCueTarget', () => {
  it('resolves an unregistered name to an empty list, never throwing', () => {
    expect(resolveCueTarget('nothing')).toEqual([]);
  });

  it('resolves a registered name to the element registered under it', () => {
    const target = document.createElement('div');
    registerCueTarget('a', target);
    expect(resolveCueTarget('a')).toEqual([target]);
  });

  it('one name can resolve to more than one element — a whole row of pills, per docs/ARCHITECTURE.md', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    registerCueTarget('row', a);
    registerCueTarget('row', b);
    expect(resolveCueTarget('row')).toEqual([a, b]);
  });

  it('the returned unregister function removes only that one registration', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const unregisterA = registerCueTarget('row', a);
    registerCueTarget('row', b);
    unregisterA();
    expect(resolveCueTarget('row')).toEqual([b]);
  });

  it('unregistering the last element under a name leaves it resolving empty again', () => {
    const a = document.createElement('div');
    const unregister = registerCueTarget('solo', a);
    unregister();
    expect(resolveCueTarget('solo')).toEqual([]);
  });

  it('the unregister function is idempotent — calling it twice does not throw or affect a sibling registration', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    const unregisterA = registerCueTarget('row', a);
    registerCueTarget('row', b);
    unregisterA();
    expect(() => unregisterA()).not.toThrow();
    expect(resolveCueTarget('row')).toEqual([b]);
  });
});

describe('useCueTarget', () => {
  function Target({ name }: { name: string | undefined }) {
    const ref = useCueTarget<HTMLButtonElement>(name);
    return <button ref={ref}>x</button>;
  }

  it('registers its element under the given name on mount', () => {
    mount(<Target name="demo" />);
    expect(resolveCueTarget('demo')).toHaveLength(1);
  });

  it('unregisters on unmount', () => {
    const { unmount } = mount(<Target name="demo" />);
    expect(resolveCueTarget('demo')).toHaveLength(1);
    unmount();
    expect(resolveCueTarget('demo')).toEqual([]);
  });

  it('registers nothing when name is undefined', () => {
    mount(<Target name={undefined} />);
    expect(resolveCueTarget('demo')).toEqual([]);
  });

  it('two mounted components under the same name both resolve, independently unregistering', () => {
    const first = mount(<Target name="shared" />);
    const second = mount(<Target name="shared" />);
    expect(resolveCueTarget('shared')).toHaveLength(2);
    first.unmount();
    expect(resolveCueTarget('shared')).toHaveLength(1);
    second.unmount();
    expect(resolveCueTarget('shared')).toEqual([]);
  });
});
