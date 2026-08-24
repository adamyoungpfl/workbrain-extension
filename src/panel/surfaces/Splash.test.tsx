import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { Splash, SPLASH_DWELL_MS, SPLASH_FADE_MS } from './Splash';
import { S } from '../strings';
import { mount } from '../components/testUtils';

/**
 * V1.7 VB-34. The splash's one behavioural promise is that it never holds
 * anybody up, and that promise is four separate claims:
 *
 *   - any input ends it,
 *   - it ends on its own if nobody touches it,
 *   - it hands over exactly once however many of those happen together,
 *   - and under reduced motion it hands over immediately rather than fading
 *     out invisibly with the panel still underneath it.
 *
 * All four are testable without a browser, so they are tested here. Whether
 * it is actually on screen, actually skippable by a real click, and actually
 * scheduling no frames in the shipped extension is tests/e2e/splash.spec.ts's
 * job — see that file's header on why a class toggle is not evidence.
 */

function stubMedia(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reduce,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  // BrandMark's orbit needs these to exist; nothing here asserts on them.
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('performance', { now: () => 1000 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Splash — what it says', () => {
  it('shows the mark, the name and the tagline', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.brand-mark')).not.toBeNull();
    expect(container.querySelector('.splash-wordmark')!.textContent).toBe(S.appName);
    expect(container.querySelector('.splash-tagline')!.textContent).toBe(S.splashTagline);
  });

  it('runs the mark on the splash camera, not the logo’s spin', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.brand-mark')!.getAttribute('data-spin')).toBe('orbit');
  });

  it('is out of the accessibility tree, because the panel behind it is not', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    const splash = container.querySelector('.splash')!;
    expect(splash.getAttribute('aria-hidden')).toBe('true');
    // aria-hidden is only safe with nothing focusable inside it.
    expect(
      splash.querySelectorAll('a, button, input, select, textarea, [tabindex]'),
    ).toHaveLength(0);
  });
});

describe('Splash — it never holds anyone up', () => {
  it('leaves on its own, without anybody touching it', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(SPLASH_DWELL_MS - 1);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(container.querySelector('.splash')!.getAttribute('data-leaving')).toBe('off');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    // Starts fading immediately, and stops taking clicks at the same moment.
    expect(container.querySelector('.splash')!.getAttribute('data-leaving')).toBe('on');
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
    it(`is skipped by ${event}, wherever it lands`, () => {
      vi.useFakeTimers();
      stubMedia(false);
      const onDone = vi.fn();
      const { container } = mount(<Splash onDone={onDone} />);

      // Dispatched on the document body — not on the splash — because the
      // listener is on window in the capture phase and has to catch input
      // aimed anywhere, including at the panel underneath.
      act(() => {
        document.body.dispatchEvent(new Event(event, { bubbles: true }));
      });
      expect(container.querySelector('.splash')!.getAttribute('data-leaving')).toBe('on');

      act(() => {
        vi.advanceTimersByTime(SPLASH_FADE_MS);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  }

  it('hands over exactly once, however many things try to end it', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} />);

    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
      vi.advanceTimersByTime(SPLASH_DWELL_MS + SPLASH_FADE_MS * 4);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('drops its listeners and its timers when it goes', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const view = mount(<Splash onDone={onDone} />);
    view.unmount();

    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(SPLASH_DWELL_MS + SPLASH_FADE_MS);
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('Splash — reduced motion', () => {
  it('hands over the instant it is done, with no fade to sit through', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} />);

    act(() => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    // No 320ms of an invisible overlay between the person and their panel.
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('still leaves on its own if nobody touches it', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(SPLASH_DWELL_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('treats a browser with no matchMedia as "reduce"', () => {
    vi.useFakeTimers();
    stubMedia(false);
    vi.stubGlobal('matchMedia', undefined);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} />);

    act(() => {
      document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('Splash — the tagline’s line break', () => {
  it('breaks between the two sentences, and only there', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    const lines = [...container.querySelectorAll('.splash-tagline-line')].map((el) =>
      el.textContent!.trim(),
    );
    expect(lines).toEqual(['AI does the work.', 'You do the thinking.']);
  });

  it('leaves the approved string exactly as strings.ts has it', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    // Not "close enough" — the paragraph's own text, character for
    // character, including the space between the sentences.
    expect(container.querySelector('.splash-tagline')!.textContent).toBe(S.splashTagline);
  });
});
