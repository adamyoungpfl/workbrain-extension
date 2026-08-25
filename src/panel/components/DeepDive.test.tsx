import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { CHIP_SHIMMER, DeepDive, type DeepDiveProps } from './DeepDive';
import { mount } from './testUtils';
import { EXPAND_MS } from '../../core/motion/disclosure';
import { SHIMMER_KEYFRAME, shimmerState } from '../../core/motion/shimmer';
import { ROTATE_MS, ROTATION_INTERACTIONS } from '../../core/motion/rotation';
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

// ── V1.8 VB-42 — one at a time, rotating ────────────────────────────────

/**
 * The presentation, and only the presentation. What these hold is that the
 * rotation runs on the five seconds, that every reason it must stop actually
 * stops it, that the stop control exists exactly where WCAG 2.2.2 needs it,
 * and — the point of DECISIONS 1 — that a rotating link still runs the whole
 * of V1.3 VB-16 when it is pressed.
 *
 * The paint is not here: `tests/e2e/follow-up-rotation.spec.ts` measures the
 * link's colour against its real background and takes the screenshots. jsdom
 * has no layout, so a test that "measured" contrast here would be measuring a
 * stylesheet it never applied.
 */
const THREE: DeepDiveEntry[] = [
  ...ENTRIES,
  { q: 'What if it changes later?', a: 'Then you change it. Nothing here is locked.' },
];

function rotating(entries: DeepDiveEntry[] = THREE, props: Partial<DeepDiveProps> = {}) {
  return mount(<DeepDive idPrefix="flow-role_names" entries={entries} mode="one" {...props} />);
}

function labels(container: Element) {
  return chipsOf(container).map((c) => c.textContent);
}

function tick(times = 1) {
  act(() => {
    vi.advanceTimersByTime(ROTATE_MS * times);
  });
}

/** React listens for `mouseover`/`mouseout` and `focusin`/`focusout`. */
function fire(el: Element, type: string) {
  act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

describe('DeepDive — VB-42, one follow-up at a time', () => {
  it('shows one link, not the row', () => {
    const { container } = rotating();
    expect(itemsOf(container)).toHaveLength(1);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
    expect(container.querySelector('.deepdive')?.className).toContain('is-one');
  });

  it('changes every five seconds, and keeps renewing', () => {
    const { container } = rotating();
    tick();
    expect(labels(container)[0]).toContain(THREE[1]!.q);
    tick();
    expect(labels(container)[0]).toContain(THREE[2]!.q);
    tick();
    expect(labels(container)[0]).toContain(THREE[0]!.q);
  });

  it('does not change before the five seconds are up', () => {
    const { container } = rotating();
    act(() => {
      vi.advanceTimersByTime(ROTATE_MS - 50);
    });
    expect(labels(container)[0]).toContain(THREE[0]!.q);
  });

  it('pauses while the pointer is over it, and starts again when it leaves', () => {
    // Hover is the one reason left that lets go: it is the pointer resting on
    // the way past, not a person deciding anything (core/motion/rotation.ts).
    const { container } = rotating();
    const row = container.querySelector('.deepdive')!;
    fire(row, 'mouseover');
    tick(3);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
    fire(row, 'mouseout');
    tick();
    expect(labels(container)[0]).toContain(THREE[1]!.q);
  });

  // ── V2.0 VB-57 — it stops for good, and never resumes ─────────────────

  it('stops for good the moment focus arrives, and does NOT resume when focus leaves', () => {
    const { container } = rotating();
    fire(chipsOf(container)[0]!, 'focusin');
    tick(3);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
    // V1.8 resumed here. FLAG 1 says it must not.
    fire(chipsOf(container)[0]!, 'focusout');
    tick(4);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
  });

  it('stops for good on a keypress anywhere inside it', () => {
    const { container } = rotating();
    act(() => {
      container
        .querySelector('.deepdive')!
        .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    });
    tick(4);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
  });

  it('stops for good on a click on the row itself, not only on the link', () => {
    const { container } = rotating();
    act(() => {
      container.querySelector('.deepdive')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    tick(4);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
  });

  it('stops for good on an interaction the surface saw elsewhere in the question', () => {
    // Typing in the answer field, pressing rephrase, clicking blank space —
    // none of which happen inside this component's box. Every reason FLAG 1
    // names, one at a time, each on its own.
    for (const by of ROTATION_INTERACTIONS) {
      const { container } = rotating(THREE, { stoppedBy: by });
      tick(4);
      expect(labels(container)[0], `stopped by ${by}`).toContain(THREE[0]!.q);
    }
  });

  it('never resumes when the follow-up it opened is closed again', () => {
    const { container } = rotating();
    press(chipsOf(container)[0]!);
    expect(chipsOf(container)[0]?.getAttribute('aria-expanded')).toBe('true');
    press(chipsOf(container)[0]!);
    expect(chipsOf(container)[0]?.getAttribute('aria-expanded')).toBe('false');
    tick(4);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
  });

  it('freezes on the follow-up that was showing — stopping never spills the list', () => {
    // The alternative stop, "show every follow-up", would grow the block from
    // one row to three under the person's hands on the one gesture nobody can
    // avoid making. See core/motion/rotation.ts.
    const { container } = rotating();
    tick(); // move off the first, so "frozen" is not "never moved"
    expect(labels(container)[0]).toContain(THREE[1]!.q);
    fire(chipsOf(container)[0]!, 'focusin');
    tick(4);
    expect(itemsOf(container)).toHaveLength(1);
    expect(labels(container)[0]).toContain(THREE[1]!.q);
  });

  it('still rotates when nothing has been touched — the stop is not the default', () => {
    const { container } = rotating();
    tick(2);
    expect(labels(container)[0]).toContain(THREE[2]!.q);
  });

  it('does not move the link out from under an open answer', () => {
    const { container } = rotating();
    press(chipsOf(container)[0]!);
    expect(chipsOf(container)[0]?.getAttribute('aria-expanded')).toBe('true');
    tick(3);
    expect(labels(container)[0]).toContain(THREE[0]!.q);
    expect(answersOf(container)[0]?.textContent).toBe(THREE[0]!.a);
  });

  it('still expands in place, through the same VB-16 machinery', () => {
    // DECISIONS 1: the rotation wraps VB-16, it does not replace it. Same
    // transitional states, same 200ms, same end state.
    const { container } = rotating();
    const [link] = chipsOf(container);
    act(() => link!.focus());
    click(link!);
    expect(container.querySelector('.deepdive-item')?.className).toContain('is-open');
    act(() => {
      vi.advanceTimersByTime(EXPAND_MS);
    });
    expect(answersOf(container)[0]?.hidden).toBe(false);
    expect(document.activeElement).toBe(link);
    // ...and closing puts it back to one rotating link, not to a row.
    press(chipsOf(container)[0]!);
    expect(itemsOf(container)).toHaveLength(1);
    expect(answersOf(container)[0]?.hidden).toBe(true);
  });

  it('never sweeps: the attract belongs to the list', () => {
    const { container } = rotating();
    expect((container.querySelector('.deepdive') as HTMLElement).dataset.shimmer).toBe('none');
  });

  // ── WCAG 2.2.2 ────────────────────────────────────────────────────────

  it('shows no "Show all" anywhere — the terminal stop is the mechanism now', () => {
    const { container } = rotating();
    expect(container.querySelector('.deepdive-stop')).toBeNull();
    expect(container.textContent).not.toContain('Show all');
    // ...and not once it has stopped either. Nothing appears in its place.
    fire(chipsOf(container)[0]!, 'focusin');
    tick(2);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.textContent).not.toContain('Show all');
  });

  it('renders no rotation for a question with one follow-up', () => {
    const { container } = rotating([ENTRIES[0]!]);
    expect(container.querySelector('.deepdive')?.className).not.toContain('is-one');
    tick(3);
    expect(labels(container)[0]).toContain(ENTRIES[0]!.q);
  });

  it('names the group, so the thing holding one link at a time has a name', () => {
    const { container } = rotating();
    const row = container.querySelector('.deepdive')!;
    expect(row.getAttribute('role')).toBe('group');
    expect(row.getAttribute('aria-label')).toBe('More about this question');
  });

  it('never announces the change: the link is not in a live region', () => {
    // The rotation is decoration for anyone reading with their ears — the
    // answer inside it is what announces, and only when it is opened.
    const { container } = rotating();
    const chip = chipsOf(container)[0]!;
    expect(chip.closest('[aria-live]')).toBeNull();
  });

  // ── reduced motion ────────────────────────────────────────────────────

  it('shows the static list under reduced motion, and schedules no clock', () => {
    setMatchMedia(true);
    const scheduled = vi.spyOn(window, 'setInterval');
    const { container } = rotating();
    expect(itemsOf(container)).toHaveLength(3);
    expect(container.querySelector('.deepdive')?.className).not.toContain('is-one');
    expect(container.querySelector('.deepdive-stop')).toBeNull();
    expect(scheduled.mock.calls.filter(([, ms]) => ms === ROTATE_MS)).toHaveLength(0);
    tick(3);
    expect(itemsOf(container)).toHaveLength(3);
    scheduled.mockRestore();
  });
});
