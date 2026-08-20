import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { Beats } from './Beats';
import { mount } from './testUtils';
import { beatHoldMs, beatsPlainText, BEAT_FADE_MS } from '../../core/flow/beats';
import { contextModules } from '../../core/flow/flow';
import { S } from '../strings';

/** Same matchMedia mock the cue verbs' own tests use (see cues/verbs.test.ts)
 * — the one place this branch is exercised without a real browser. The
 * browser half is tests/e2e/module-intro.spec.ts. */
function mockReducedMotion(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matches && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
      onchange: null,
    })),
  );
}

const BEATS = ['First beat, with __emphasis__ in it.', 'Second beat.', 'Third and last.'];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Beats — the timed read', () => {
  it('starts on the first beat alone', () => {
    const { container } = mount(<Beats beats={BEATS} />);
    const shown = container.querySelectorAll('.beat');
    expect(shown).toHaveLength(1);
    expect(shown[0]!.textContent).toBe('First beat, with emphasis in it.');
  });

  it('renders __emphasis__ as a real element, never as markup', () => {
    const { container } = mount(<Beats beats={BEATS} />);
    const em = container.querySelector('.beat-em');
    expect(em?.textContent).toBe('emphasis');
    // The underscores are gone from the text, and nothing was injected.
    expect(container.textContent).not.toContain('__');
    expect(container.innerHTML).not.toContain('<script');
  });

  it('keeps a script-shaped beat as literal text', () => {
    const { container } = mount(<Beats beats={['Say <script>alert(1)</script> out loud.']} />);
    expect(container.querySelector('.beat')?.textContent).toBe('Say <script>alert(1)</script> out loud.');
    expect(container.querySelector('script')).toBeNull();
  });

  it('advances to the next beat after that beat own reading time, fading first', () => {
    vi.useFakeTimers();
    const { container } = mount(<Beats beats={BEATS} />);
    const hold = beatHoldMs(BEATS[0]!);

    act(() => void vi.advanceTimersByTime(hold - 1));
    expect(container.querySelector('.beat')?.className).toBe('beat');
    expect(container.querySelector('.beat')?.textContent).toContain('First beat');

    act(() => void vi.advanceTimersByTime(1));
    expect(container.querySelector('.beat')?.className).toContain('is-out');

    act(() => void vi.advanceTimersByTime(BEAT_FADE_MS));
    expect(container.querySelector('.beat')?.className).toBe('beat');
    expect(container.querySelector('.beat')?.textContent).toBe('Second beat.');
    expect(container.querySelector('.beats')?.getAttribute('data-beat-index')).toBe('1');
  });

  it('stops on the last beat instead of looping or blanking', () => {
    vi.useFakeTimers();
    const { container } = mount(<Beats beats={BEATS} />);
    for (const beat of BEATS) {
      act(() => void vi.advanceTimersByTime(beatHoldMs(beat) + BEAT_FADE_MS));
    }
    expect(container.querySelector('.beat')?.textContent).toBe('Third and last.');

    act(() => void vi.advanceTimersByTime(60_000));
    expect(container.querySelector('.beat')?.textContent).toBe('Third and last.');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never advances a single-beat sequence', () => {
    vi.useFakeTimers();
    const { container } = mount(<Beats beats={['Only one.']} />);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(container.querySelector('.beat')?.textContent).toBe('Only one.');
  });

  it('clears its timers on unmount', () => {
    vi.useFakeTimers();
    const { unmount } = mount(<Beats beats={BEATS} />);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives assistive tech the whole read immediately, and only once', () => {
    const { container } = mount(<Beats beats={BEATS} />);
    expect(container.querySelector('.beats-sr')?.textContent).toBe(beatsPlainText(BEATS));
    // The animated paragraph is hidden from the tree, so the sequence is not
    // announced twice — once whole and once beat by beat.
    expect(container.querySelector('.beat')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Beats — prefers-reduced-motion', () => {
  it('renders every beat at once, in order, with no timers at all', () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    const { container } = mount(<Beats beats={BEATS} />);

    const shown = [...container.querySelectorAll('.beat')].map((p) => p.textContent);
    expect(shown).toEqual(['First beat, with emphasis in it.', 'Second beat.', 'Third and last.']);
    expect(vi.getTimerCount()).toBe(0);
    expect(container.querySelector('.beats')?.className).toContain('is-still');
  });

  it('the still version carries the same words as the played one', () => {
    mockReducedMotion(true);
    const { container } = mount(<Beats beats={BEATS} />);
    const onScreen = [...container.querySelectorAll('.beat')].map((p) => p.textContent).join(' ');
    expect(onScreen).toBe(beatsPlainText(BEATS));
  });

  it('does not also render the screen-reader copy — that would say it all twice', () => {
    mockReducedMotion(true);
    const { container } = mount(<Beats beats={BEATS} />);
    expect(container.querySelector('.beats-sr')).toBeNull();
    expect(container.querySelector('.beat')?.getAttribute('aria-hidden')).toBeNull();
  });

  it('keeps emphasis in the still version — it is weight and an underline, not motion', () => {
    mockReducedMotion(true);
    const { container } = mount(<Beats beats={BEATS} />);
    expect(container.querySelector('.beat-em')?.textContent).toBe('emphasis');
  });
});

describe('the transition copy this renders', () => {
  it('covers every module in the Context flow except the first, and no others', () => {
    const expected = contextModules.slice(1).map((m) => m.id);
    expect(Object.keys(S.moduleIntros)).toEqual(expected);
  });

  it('gives every transition at least two beats and a preview line', () => {
    for (const [id, copy] of Object.entries(S.moduleIntros)) {
      expect(copy.beats.length, `${id} beats`).toBeGreaterThanOrEqual(2);
      expect(copy.preview.length, `${id} preview`).toBeGreaterThanOrEqual(1);
      for (const line of [...copy.beats, ...copy.preview]) expect(line.trim()).not.toBe('');
    }
  });

  it('never leaves an emphasis marker unclosed — an odd count would print underscores', () => {
    for (const [id, copy] of Object.entries(S.moduleIntros)) {
      for (const beat of copy.beats) {
        expect((beat.match(/__/g) ?? []).length % 2, `${id}: "${beat}"`).toBe(0);
      }
    }
  });
});
