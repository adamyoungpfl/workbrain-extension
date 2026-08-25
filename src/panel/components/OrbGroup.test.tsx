import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useState } from 'react';
import { OrbGroup } from './OrbGroup';
import type { OrbOption } from './OrbGroup';
import { ORB_ROTATE_MS } from '../../core/motion/rotation';
import { mount } from './testUtils';

/**
 * V2.0 VB-60, without a browser.
 *
 * The pixels are tests/e2e/orb-choice.spec.ts's — nothing here can see a glow.
 * What this file holds is the wiring a real browser makes expensive to prove
 * one gesture at a time: that every interaction FLAG 1 names really does reach
 * `stopRotation`, that the clock is torn down rather than ignored, and that
 * the group is `PillGroup`'s keyboard on a different paint.
 *
 * Deliberately mirrors Pill.test.tsx's shape, harness for harness. The two
 * groups make the same promises and the two files should be readable side by
 * side when somebody has to check that they still do.
 */
const OPTIONS: OrbOption[] = [
  { value: 'employee', label: 'Employee' },
  { value: 'manager', label: 'Manager' },
  { value: 'owner', label: 'Business Owner' },
];

function click(el: HTMLElement) {
  act(() => el.click());
}

function press(el: Element, key: string) {
  act(() => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
}

function orbsOf(container: Element) {
  return Array.from(
    container.querySelectorAll('.orbchoice:not(.orbchoice-add)'),
  ) as HTMLButtonElement[];
}

function outlined(container: Element): number {
  return Array.from(container.querySelectorAll('.orbchoice:not(.orbchoice-add) .orbchoice-orb')).findIndex(
    (orb) => orb.getAttribute('data-outlined') === 'true',
  );
}

function Harness({
  onAddOwn,
  stoppedBy,
}: {
  onAddOwn?: (() => void) | undefined;
  stoppedBy?: 'typing' | null;
}) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <OrbGroup
      legend="What are your roles?"
      options={OPTIONS}
      mode="multi"
      value={value}
      onChange={setValue}
      onAddOwn={onAddOwn}
      stoppedBy={stoppedBy ?? null}
    />
  );
}

describe('OrbGroup — the group PillGroup’s contract has to survive into', () => {
  it('is a real group, named by the question and by how to answer it', () => {
    const { container, unmount } = mount(<Harness />);
    const group = container.querySelector('.orbgroup')!;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toContain('What are your roles?');
    expect(group.getAttribute('aria-label')).toContain('Pick one or several.');
    unmount();
  });

  it('has one tab stop, and it roves with focus', () => {
    const { container, unmount } = mount(<Harness />);
    const orbs = orbsOf(container);
    expect(orbs.map((o) => o.tabIndex)).toEqual([0, -1, -1]);

    press(orbs[0]!, 'ArrowRight');
    expect(orbsOf(container).map((o) => o.tabIndex)).toEqual([-1, 0, -1]);
    expect(document.activeElement).toBe(orbs[1]);

    press(orbs[1]!, 'End');
    expect(document.activeElement).toBe(orbsOf(container)[2]);
    press(orbsOf(container)[2]!, 'Home');
    expect(document.activeElement).toBe(orbsOf(container)[0]);
    unmount();
  });

  it('wraps onto the add-new orb, which is inside the group', () => {
    const { container, unmount } = mount(<Harness onAddOwn={() => {}} />);
    press(orbsOf(container)[0]!, 'ArrowLeft');
    expect(document.activeElement).toBe(container.querySelector('.orbchoice-add'));
    unmount();
  });

  it('selects several, and each one carries a mark and aria-pressed — never a glow', () => {
    const { container, unmount } = mount(<Harness />);
    const orbs = orbsOf(container);
    click(orbs[0]!);
    click(orbs[2]!);

    const after = orbsOf(container);
    expect(after.map((o) => o.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'true']);
    // The mark is a real path, present on exactly the picked ones. A shape, so
    // greyscale keeps it (docs/GUARDRAILS.md).
    expect(after.map((o) => !!o.querySelector('.orbchoice-mark path'))).toEqual([true, false, true]);
    expect(
      after.map((o) => o.querySelector('.orbchoice-orb')!.getAttribute('data-picked')),
    ).toEqual(['true', 'false', 'true']);

    // ...and a second press lets go, which is what multi-select means.
    click(after[0]!);
    expect(orbsOf(container).map((o) => o.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    unmount();
  });

  it('the add-new orb calls the same thing the pill row calls, and selects nothing', () => {
    const onAddOwn = vi.fn();
    const { container, unmount } = mount(<Harness onAddOwn={onAddOwn} />);
    const add = container.querySelector<HTMLButtonElement>('.orbchoice-add')!;
    click(add);
    expect(onAddOwn).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.orbchoice[aria-pressed="true"]')).toHaveLength(0);
    // It is drawn, not typed: a `+` path inside a smaller orb.
    expect(add.querySelector('.orbchoice-mark path')).not.toBeNull();
    expect(add.querySelector('.orbchoice-orb')!.classList.contains('is-add')).toBe(true);
    unmount();
  });

  it('renders no add-new orb when the question does not allow one', () => {
    const { container, unmount } = mount(<Harness />);
    expect(container.querySelectorAll('.orbchoice-add')).toHaveLength(0);
    unmount();
  });
});

describe('OrbGroup — FLAG 1: it stops for good, on the follow-up link’s own machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** One turn of the shared clock. */
  function turn(times = 1) {
    act(() => {
      vi.advanceTimersByTime(ORB_ROTATE_MS * times + 10);
    });
  }

  it('travels, one orb at a time, and goes round', () => {
    const { container, unmount } = mount(<Harness />);
    expect(outlined(container)).toBe(0);
    expect(container.querySelectorAll('.orbchoice-orb[data-outlined="true"]')).toHaveLength(1);
    turn();
    expect(outlined(container)).toBe(1);
    turn(2);
    expect(outlined(container)).toBe(0);
    unmount();
  });

  it.each([
    ['a click anywhere in the group', (c: Element) => act(() => (c.querySelector('.orbgroup') as HTMLElement).click())],
    ['a keypress', (c: Element) => press(c.querySelector('.orbgroup')!, 'x')],
    ['focus arriving', (c: Element) => act(() => orbsOf(c)[2]!.focus())],
    ['picking an orb', (c: Element) => click(orbsOf(c)[1]!)],
  ])('stops for good on %s — and four more turns change nothing', (_name, gesture) => {
    const { container, unmount } = mount(<Harness />);
    turn();
    const held = outlined(container);
    expect(held).toBe(1);

    gesture(container);
    // Let go of anything that could be a temporary hold, the way the browser
    // test does: FLAG 1's stop is terminal, not a pause with a cause.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    turn(4);
    expect(outlined(container)).toBe(held);
    unmount();
  });

  it('stops when the SURFACE saw the interaction — one life for the whole question', () => {
    // `stoppedBy` is what makes typing in the answer field, or pressing
    // rephrase, stop the orbs as well as the follow-up link. It is the same
    // prop off the same state (Flow.tsx), through the same `stopRotation`.
    function Outer() {
      const [stopped, setStopped] = useState<'typing' | null>(null);
      return (
        <>
          <button type="button" data-elsewhere onClick={() => setStopped('typing')}>
            elsewhere
          </button>
          <Harness stoppedBy={stopped} />
        </>
      );
    }
    const { container, unmount } = mount(<Outer />);
    turn();
    const held = outlined(container);

    click(container.querySelector<HTMLButtonElement>('[data-elsewhere]')!);
    turn(4);
    expect(outlined(container)).toBe(held);
    unmount();
  });

  it('tears the clock down rather than ignoring it, and the + stops with it', () => {
    const { container, unmount } = mount(<Harness onAddOwn={() => {}} />);
    expect(container.querySelector('.orbgroup')!.getAttribute('data-rotating')).toBe('true');
    expect(
      container.querySelector('.orbchoice-add .orbchoice-orb')!.getAttribute('data-pulsing'),
    ).toBe('true');

    act(() => (container.querySelector('.orbgroup') as HTMLElement).click());
    expect(container.querySelector('.orbgroup')!.getAttribute('data-rotating')).toBe('false');
    // The pulse is on the same life: everything in the group goes still at once.
    expect(
      container.querySelector('.orbchoice-add .orbchoice-orb')!.getAttribute('data-pulsing'),
    ).toBe('false');
    // No interval left running under a stopped outline.
    expect(vi.getTimerCount()).toBe(0);
    unmount();
  });

  it('the add-new orb is never in the ring — it has its own cue', () => {
    const { container, unmount } = mount(<Harness onAddOwn={() => {}} />);
    for (let i = 0; i < 5; i++) {
      expect(
        container.querySelector('.orbchoice-add .orbchoice-orb')!.getAttribute('data-outlined'),
      ).toBe('false');
      turn();
    }
    unmount();
  });
});
