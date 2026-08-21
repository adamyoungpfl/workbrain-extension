import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { TypedHeading, TypedModuleLabel, resetTypedModuleLabelMemory } from './Typed';
import { TYPE_SPEED_MS } from '../../core/motion/typewriter';
import { mount } from './testUtils';

/**
 * V1.2 VB-10. The arithmetic is tested without any of this in
 * core/motion/typewriter.test.ts; what is asserted here is the wiring only a
 * component can get wrong — what is in the DOM at each moment, what a screen
 * reader would be given, whether a keypress really ends the print, and whether
 * the module label reprints itself on a remount.
 *
 * The clock is faked, so "half way through" is an exact statement rather than
 * a sleep. What this cannot prove — that the text is legible while it prints,
 * that nothing below it moves, that a real key event in a real browser reaches
 * the field as well as ending the animation — is asserted end to end in
 * tests/e2e/typewriter.spec.ts, which is where this repo has been bitten
 * before (docs/TESTING.md).
 */

const QUESTION = 'What would you most like to stop explaining?';

let reduced = false;

beforeEach(() => {
  reduced = false;
  resetTypedModuleLabelMemory();
  // `performance` explicitly: the print is elapsed-time driven, not
  // tick-counting (see core/motion/typewriter.ts on why), and Vitest does not
  // fake `performance.now` by default — without it the timers would fire on a
  // fake clock while the component read a real one, and nothing would advance.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Runs the print forward by `ms` of wall clock, inside `act` so React has
 * committed everything the timer caused before anything is asserted. */
function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const rest = (container: HTMLElement) => container.querySelector('.typed-rest');
const heading = (container: HTMLElement) => container.querySelector('h2')!;

describe('TypedHeading — the question types itself in', () => {
  it('starts with nothing typed and the whole question already holding its place', () => {
    const { container } = mount(<TypedHeading className="flow-q" text={QUESTION} />);

    // Nothing typed yet...
    expect(rest(container)!.textContent).toBe(QUESTION);
    // ...but the element already contains the whole question, so its box is
    // its final box and nothing below it will move as it prints.
    expect(heading(container).textContent).toBe(QUESTION);
    expect(heading(container).className).toBe('flow-q');
  });

  it('reveals a character per speed step, and always finishes whole', () => {
    const { container } = mount(<TypedHeading text={QUESTION} />);

    advance(TYPE_SPEED_MS * 5);
    expect(rest(container)!.textContent).toBe(QUESTION.slice(5));

    advance(TYPE_SPEED_MS * 10);
    expect(rest(container)!.textContent).toBe(QUESTION.slice(15));

    advance(TYPE_SPEED_MS * QUESTION.length);
    // Finished: the remainder element is gone entirely, not merely empty, so
    // the markup is exactly what V1.1 shipped.
    expect(rest(container)).toBeNull();
    expect(heading(container).textContent).toBe(QUESTION);
  });

  it('keeps the whole question in the accessibility tree while it prints', () => {
    const { container } = mount(<TypedHeading text={QUESTION} />);
    // The characters not yet typed are `visibility: hidden` and so out of the
    // tree. Without this the heading would have no accessible name at all for
    // the first tick — a real axe violation, and a screen reader landing on a
    // fragment of a question.
    expect(heading(container).getAttribute('aria-label')).toBe(QUESTION);
    expect(rest(container)!.getAttribute('aria-hidden')).toBe('true');

    advance(TYPE_SPEED_MS * QUESTION.length);
    // Once the text is really on screen the attribute would only be a second
    // copy of it, so it goes.
    expect(heading(container).getAttribute('aria-label')).toBeNull();
  });

  it('is skipped to the end by any key, instantly', () => {
    const { container } = mount(<TypedHeading text={QUESTION} />);
    advance(TYPE_SPEED_MS * 3);
    expect(rest(container)).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });

    expect(rest(container)).toBeNull();
    expect(heading(container).textContent).toBe(QUESTION);
  });

  it('is skipped to the end by any click, instantly', () => {
    const { container } = mount(<TypedHeading text={QUESTION} />);
    advance(TYPE_SPEED_MS * 3);

    act(() => {
      window.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });

    expect(rest(container)).toBeNull();
  });

  it('consumes nothing it listens for — the keystroke is still the answer', () => {
    mount(<TypedHeading text={QUESTION} />);
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    // If this ever became true, the first character of every answer would be
    // eaten by the animation that was supposed to be invisible to it.
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops listening once it has finished, and after it unmounts', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount, container } = mount(<TypedHeading text={QUESTION} />);

    const listened = add.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown');
    expect(listened).toHaveLength(2);

    advance(TYPE_SPEED_MS * QUESTION.length);
    expect(rest(container)).toBeNull();
    expect(
      remove.mock.calls.filter(([type]) => type === 'keydown' || type === 'pointerdown'),
    ).toHaveLength(2);

    unmount();
    add.mockRestore();
    remove.mockRestore();
  });

  it('prints a new wording from the start — a rephrasing is a new sentence arriving', () => {
    const other = 'Say that another way entirely.';
    const { container, rerender } = mount(<TypedHeading text={QUESTION} />);
    advance(TYPE_SPEED_MS * 10);

    rerender(<TypedHeading text={other} />);
    // Not "ten characters into the new question" — a new print, from nothing.
    expect(rest(container)!.textContent).toBe(other);
    expect(heading(container).textContent).toBe(other);

    advance(TYPE_SPEED_MS * other.length);
    expect(heading(container).textContent).toBe(other);
    expect(rest(container)).toBeNull();
  });

  it('has nothing to print for an empty heading, and schedules nothing', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const { container } = mount(<TypedHeading text="" />);
    expect(rest(container)).toBeNull();
    expect(interval).not.toHaveBeenCalled();
    interval.mockRestore();
  });

  describe('prefers-reduced-motion', () => {
    it('shows the whole question at once, and never starts a timer', () => {
      reduced = true;
      const interval = vi.spyOn(globalThis, 'setInterval');
      const { container } = mount(<TypedHeading className="flow-q" text={QUESTION} />);

      // Not a shortened animation. None: the first render is the finished one.
      expect(heading(container).textContent).toBe(QUESTION);
      expect(rest(container)).toBeNull();
      expect(heading(container).getAttribute('aria-label')).toBeNull();
      expect(interval).not.toHaveBeenCalled();

      interval.mockRestore();
    });
  });
});

describe('TypedModuleLabel — prints when the module changes, and only then', () => {
  const label = (container: HTMLElement) => container.querySelector('p')!;

  it('prints the first module label it is given', () => {
    const { container } = mount(<TypedModuleLabel className="flowprogress-title" title="Orientation" />);
    expect(rest(container)!.textContent).toBe('Orientation');
    advance(TYPE_SPEED_MS * 'Orientation'.length);
    expect(label(container).textContent).toBe('Orientation');
    expect(rest(container)).toBeNull();
  });

  it('does not reprint on the next question inside the same module', () => {
    // `Flow` remounts its step view per question, so this is what moving from
    // question one to question two of a module actually looks like. It is the
    // exact failure VB-10 names: the label typing again on all forty-nine.
    const first = mount(<TypedModuleLabel title="Orientation" />);
    advance(TYPE_SPEED_MS * 'Orientation'.length);
    first.unmount();

    const second = mount(<TypedModuleLabel title="Orientation" />);
    expect(rest(second.container)).toBeNull();
    expect(label(second.container).textContent).toBe('Orientation');
  });

  it('continues an unfinished print across a remount rather than restarting it', () => {
    const first = mount(<TypedModuleLabel title="Orientation" />);
    advance(TYPE_SPEED_MS * 4);
    first.unmount();

    // Someone who presses Next before the label has finished sees it carry on
    // from where it was, not begin again.
    const second = mount(<TypedModuleLabel title="Orientation" />);
    expect(rest(second.container)!.textContent).toBe('Orientation'.slice(4));
  });

  it('prints again when the module really does change', () => {
    const first = mount(<TypedModuleLabel title="Orientation" />);
    advance(TYPE_SPEED_MS * 'Orientation'.length);
    first.unmount();

    const second = mount(<TypedModuleLabel title="About Me" />);
    expect(rest(second.container)!.textContent).toBe('About Me');
  });

  it('stays out of the accessibility tree — the progressbar carries the name', () => {
    const { container } = mount(<TypedModuleLabel className="flowprogress-title" title="About Me" />);
    expect(label(container).getAttribute('aria-hidden')).toBe('true');
    expect(label(container).className).toBe('flowprogress-title');
  });

  it('shows the whole label at once under reduced motion', () => {
    reduced = true;
    const { container } = mount(<TypedModuleLabel title="How I Communicate" />);
    expect(label(container).textContent).toBe('How I Communicate');
    expect(rest(container)).toBeNull();
  });
});
