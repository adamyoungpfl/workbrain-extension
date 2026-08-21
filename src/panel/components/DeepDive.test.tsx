import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { CHIP_SHIMMER, DeepDive } from './DeepDive';
import { mount } from './testUtils';
import { EXPAND_MS } from '../../core/motion/disclosure';
import { SHIMMER_KEYFRAME, shimmerState } from '../../core/motion/shimmer';
import type { DeepDiveEntry } from '../../schema/flow.types';

const ENTRIES: DeepDiveEntry[] = [
  { q: 'What counts as a role?', a: 'Anything you would describe differently to different people.' },
  { q: 'What if I only have one?', a: 'That is normal. Pick one and keep going.' },
];

/**
 * jsdom has no `matchMedia` at all, so `prefersReducedMotion()` reports
 * "not reduced" by default and the component takes its animated path — with
 * every box measuring zero, which is exactly what a `getBoundingClientRect`
 * stub returns here. That is fine and deliberate: the geometry is the one part
 * of this component that jsdom cannot judge, and tests/e2e/deep-dive.spec.ts
 * measures it in a real browser instead. What these tests own is the tree, the
 * ARIA, the focus and the fact that a transition ends.
 *
 * `reduced()` installs the mock the other way round, for the paths that must
 * not schedule anything at all.
 */
function setMatchMedia(matches: boolean | null) {
  if (matches === null) {
    Object.defineProperty(window, 'matchMedia', { writable: true, configurable: true, value: undefined });
    return;
  }
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
}

beforeEach(() => {
  setMatchMedia(false);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setMatchMedia(null);
});

function click(el: HTMLElement) {
  act(() => el.click());
}

/** jsdom has no `AnimationEvent` constructor; React only reads the name. */
function endAnimation(el: HTMLElement, animationName: string) {
  const event = new Event('animationend', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: animationName });
  act(() => {
    el.dispatchEvent(event);
  });
}

/** Press, then run the 200ms transition out. */
function press(el: HTMLElement) {
  click(el);
  act(() => {
    vi.advanceTimersByTime(EXPAND_MS);
  });
}

function chipsOf(container: Element) {
  return Array.from(container.querySelectorAll('.deepdive-chip')) as HTMLButtonElement[];
}

function itemsOf(container: Element) {
  return Array.from(container.querySelectorAll('.deepdive-item')) as HTMLElement[];
}

function answersOf(container: Element) {
  return Array.from(container.querySelectorAll('.deepdive-answer')) as HTMLParagraphElement[];
}

describe('DeepDive', () => {
  it('renders one chip per entry, all closed, with the question as the label', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const chips = chipsOf(container);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.textContent).toContain('What counts as a role?');
    expect(chips.every((c) => c.getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('hides every answer until its chip is opened, without unmounting it', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const answers = answersOf(container);
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.hidden)).toBe(true);
  });

  it('opens on click and closes on a second click', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    press(first!);
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    expect(answersOf(container)[0]?.hidden).toBe(false);
    press(first!);
    expect(first!.getAttribute('aria-expanded')).toBe('false');
    expect(answersOf(container)[0]?.hidden).toBe(true);
  });

  // ── V1.3 VB-16 — expand in place ──────────────────────────────────────

  it('removes the other follow-ups while one is open, and brings them back', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    expect(itemsOf(container)).toHaveLength(2);

    click(first!);
    // Still mounted mid-transition — a ghost is a thing you can watch leave.
    expect(itemsOf(container)).toHaveLength(2);
    expect(container.querySelectorAll('.deepdive-item.is-leaving')).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(EXPAND_MS);
    });
    expect(itemsOf(container)).toHaveLength(1);
    expect(chipsOf(container)).toHaveLength(1);
    expect(container.querySelector('.deepdive-item')?.className).toContain('is-open');

    // Closing brings them back — mounted for the transition, then ordinary.
    click(chipsOf(container)[0]!);
    expect(itemsOf(container)).toHaveLength(2);
    expect(container.querySelectorAll('.deepdive-item.is-entering')).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(EXPAND_MS);
    });
    expect(itemsOf(container)).toHaveLength(2);
    expect(container.querySelectorAll('.is-entering')).toHaveLength(0);
    expect(chipsOf(container)[1]?.textContent).toContain('What if I only have one?');
  });

  it('keeps the answer visible while the bubble collapses, then hides it', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    press(chipsOf(container)[0]!);
    const answer = answersOf(container)[0]!;
    expect(answer.hidden).toBe(false);

    click(chipsOf(container)[0]!);
    expect(answer.hidden).toBe(false); // still fading out
    expect(answer.className).toContain('is-collapsing');
    // ...but the control already reads as closed, which is the person's intent.
    expect(chipsOf(container)[0]?.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      vi.advanceTimersByTime(EXPAND_MS);
    });
    expect(answersOf(container)[0]?.hidden).toBe(true);
  });

  it('never loses focus when the siblings unmount', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    act(() => first!.focus());
    press(first!);
    expect(document.activeElement).toBe(first);
    expect(document.activeElement).not.toBe(document.body);

    // ...and closing keeps it too, through the siblings coming back.
    press(first!);
    expect(document.activeElement).toBe(first);
  });

  it('puts focus back on the open chip if the unmount drops it to body', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    click(first!);
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    expect(document.activeElement).toBe(document.body);
    act(() => {
      vi.advanceTimersByTime(EXPAND_MS);
    });
    expect(document.activeElement).toBe(first);
  });

  it('does not steal focus back from somewhere the person moved it', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const elsewhere = document.createElement('input');
    document.body.appendChild(elsewhere);
    const [first] = chipsOf(container);
    click(first!);
    act(() => elsewhere.focus());
    act(() => {
      vi.advanceTimersByTime(EXPAND_MS);
    });
    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it('wraps every answer in a live region, so the reveal is announced', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    for (const answer of answersOf(container)) {
      const say = answer.closest('.deepdive-say');
      expect(say?.getAttribute('aria-live')).toBe('polite');
      // The region itself is never hidden, or there would be nothing watching
      // it when the answer inside it appears.
      expect((say as HTMLElement | null)?.hidden).toBe(false);
    }
  });

  it('wires aria-controls to a real element id, namespaced by the question', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    for (const chip of chipsOf(container)) {
      const id = chip.getAttribute('aria-controls')!;
      expect(id.startsWith('flow-role_names-deepdive-')).toBe(true);
      expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
  });

  it('never points aria-controls at an element that has left', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    press(chipsOf(container)[0]!);
    for (const chip of chipsOf(container)) {
      const id = chip.getAttribute('aria-controls')!;
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it('signals open with more than colour: the chevron turns and the bubble marks itself open', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    const mark = first!.querySelector('.deepdive-mark')!;
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('class')).not.toContain('is-open');
    press(first!);
    expect(mark.getAttribute('class')).toContain('is-open');
    expect(first!.closest('.deepdive-item')?.className).toContain('is-open');
  });

  it('is a real button, so Enter and Space work with no key handling of its own', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    expect(chipsOf(container).every((c) => c.tagName === 'BUTTON' && c.type === 'button')).toBe(true);
  });

  // ── V1.3 VB-16 — reduced motion ───────────────────────────────────────

  it('schedules nothing at all when motion is off — it just opens', () => {
    setMatchMedia(true);
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    act(() => first!.focus());
    const scheduled = vi.spyOn(window, 'setTimeout');
    click(first!);

    // No ghost, and nothing waiting on a transition that never runs: the end
    // state, on the frame of the click.
    expect(scheduled.mock.calls.filter(([, ms]) => ms === EXPAND_MS)).toHaveLength(0);
    expect(itemsOf(container)).toHaveLength(1);
    expect(container.querySelectorAll('.is-leaving, .is-entering')).toHaveLength(0);
    expect(answersOf(container)[0]?.hidden).toBe(false);
    expect(document.activeElement).toBe(first);

    click(chipsOf(container)[0]!);
    expect(scheduled.mock.calls.filter(([, ms]) => ms === EXPAND_MS)).toHaveLength(0);
    expect(itemsOf(container)).toHaveLength(2);
    expect(answersOf(container)[0]?.hidden).toBe(true);
    expect(document.activeElement).toBe(first);
    scheduled.mockRestore();
  });

  // ── V1.3 VB-16 — the shimmer ──────────────────────────────────────────

  it('ships the one-time attract, and asks for it in the markup', () => {
    expect(CHIP_SHIMMER).toBe('once');
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const row = container.querySelector('.deepdive') as HTMLElement;
    expect(row.dataset.shimmer).toBe('once');
    // The stagger is data, and the only thing set inline on a resting chip.
    expect(itemsOf(container).map((el) => el.style.getPropertyValue('--dd-index'))).toEqual(['0', '1']);
  });

  it('goes still for good once the last chip has swept', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const row = container.querySelector('.deepdive') as HTMLElement;
    const items = itemsOf(container);

    // The first chip finishing must not cut the second one short.
    endAnimation(items[0]!, SHIMMER_KEYFRAME);
    expect(row.dataset.shimmer).toBe('once');

    endAnimation(items[1]!, SHIMMER_KEYFRAME);
    expect(row.dataset.shimmer).toBe('none');
    expect(shimmerState(CHIP_SHIMMER, true)).toBe('none');
  });

  it('is not fooled by the open/close animations ending on the same row', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const row = container.querySelector('.deepdive') as HTMLElement;
    endAnimation(itemsOf(container)[1]!, 'wb-dd-out');
    expect(row.dataset.shimmer).toBe('once');
  });
});
