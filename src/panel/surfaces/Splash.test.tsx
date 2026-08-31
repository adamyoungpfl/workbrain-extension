import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { Splash, SPLASH_FADE_MS, taglineLines } from './Splash';
import { SPLASH_BEATS } from '../../core/splash/sequence';
import { S } from '../strings';
import { mount } from '../components/testUtils';

/**
 * V2.7 VB-128 — the splash is the show now. What jsdom can hold:
 *
 *  - under full motion the SHOW mounts (stage + mark) and the reveal does
 *    not — no wordmark until the clock says so, and jsdom's stubbed rAF
 *    never ticks, so the show is what this environment renders;
 *  - under reduced motion the composed REVEAL mounts immediately: mark,
 *    wordmark, tagline, button, the first loading word, the bar — and the
 *    ten-second hand-off still happens (fake timers walk it);
 *  - any click hands over, exactly once; Escape works; letter keys and
 *    stray events still cost nothing; listeners drop on unmount;
 *  - the tagline's split stays byte-faithful to the approved string.
 *
 * The moving version — beats landing on time, the swell's softness, the
 * words cycling — is the e2e spec's and core's (sequence.test.ts).
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
  // BrandMark's orbit and the show clock need these to exist; the stub
  // never ticks, which is exactly what keeps the show phase still here.
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('performance', { now: () => 1000 });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Splash — the show, under full motion', () => {
  it('opens on the stage: the mark in its glow, and NO reveal yet', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.splash')!.getAttribute('data-phase')).toBe('show');
    expect(container.querySelector('.splash-stage .brand-mark')).not.toBeNull();
    expect(container.querySelector('.splash-glow')).not.toBeNull();
    // The movie has not reached its title card.
    expect(container.querySelector('.splash-wordmark')).toBeNull();
    expect(container.querySelector('.splash-enter')).toBeNull();
  });

  it('runs the stage mark on the splash camera', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.brand-mark')!.getAttribute('data-spin')).toBe('orbit');
  });

  it('a click anywhere mid-show hands over — the rest of the movie is optional', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      container.querySelector<HTMLElement>('.splash')!.click();
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
    it(`is NOT dismissed by a stray ${event}`, () => {
      vi.useFakeTimers();
      stubMedia(false);
      const onDone = vi.fn();
      const { container } = mount(<Splash onDone={onDone} />);

      act(() => {
        document.body.dispatchEvent(new Event(event, { bubbles: true }));
      });
      expect(container.querySelector('.splash')!.getAttribute('data-leaving')).toBe('off');
      expect(onDone).not.toHaveBeenCalled();
    });
  }

  it('Escape closes it, before any button exists to see', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('drops its listeners when it goes', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const view = mount(<Splash onDone={onDone} />);
    view.unmount();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('Splash — reduced motion is the composed reveal, immediately', () => {
  it('mounts the whole reveal at once: mark, name, tagline, the two sentences, the doors', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} />);

    expect(container.querySelector('.splash')!.getAttribute('data-phase')).toBe('reveal');
    expect(container.querySelector('.splash-wordmark')!.textContent).toBe(S.appName);
    expect(container.querySelector('.splash-tagline')!.textContent).toBe(S.splashTagline);
    // BR-01 (Adam, 2026-08-28): the "Open your work brain" button is gone —
    // the whole surface has been the way in since V2.6 VB-126, so it was a
    // fourth exit competing with three that already worked.
    expect(container.querySelector('.splash-enter')).toBeNull();
    // BS-09 (§9): the cycling word and the draining bar are gone, and what
    // stands in their place is what the held seconds are for.
    expect(container.querySelector('.splash-loader')).toBeNull();
    expect(container.querySelector('.splash-drain')).toBeNull();
    expect(container.querySelector('.splash-cost')!.textContent).toBe(S.splashCost);
    expect(container.querySelector('.splash-what')!.textContent).toBe(S.splashWhat);
    // And no white layer: there is nothing to swell from.
    expect(container.querySelector('.splash-swell')).toBeNull();
  });

  /**
   * BS-09 took this screen from one control to three; BR-01 takes it back to
   * two, and the one that went was the redundant one. Skip is the way past,
   * the tour is the one thing somebody might choose INSTEAD of arriving, and
   * "enter" was a button for a move the entire surface already makes.
   */
  it('every control on it is a real one — skip, the baseline door, and the tour', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(
      <Splash onDone={() => {}} onTour={() => {}} onBaseline={() => {}} />,
    );
    const labels = [...container.querySelectorAll('.splash button')].map((b) => b.textContent);
    // D1's door precedes the tour's: it is the one offer on this screen that
    // expires. The tour can be taken any time; a baseline only before you
    // start (docs/MEASUREMENT-SPINE.md).
    expect(labels).toEqual([S.splashSkip, S.splashBaseline, S.splashTour]);
  });

  it('draws no baseline door when there is nowhere to take one', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} onTour={() => {}} />);
    expect(container.querySelector('.splash-baseline')).toBeNull();
  });

  it('draws no tour door when there is nowhere to take one', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.splash-tour')).toBeNull();
    expect(container.querySelectorAll('.splash button').length).toBe(1);
  });

  it('still lets anybody in — the surface itself is the door', () => {
    // The claim the removed button was standing in for. If this ever fails,
    // the splash has become a screen somebody can be stuck on.
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);
    act(() => {
      (container.querySelector('.splash') as HTMLElement).click();
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('says which build it is, because that is the first thing a report needs', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.buildstamp')!.textContent).toMatch(/\d+\.\d+\.\d+/);
  });

  it('a press hands over instantly — no fade to sit through', () => {
    // Was the enter button's test; it is the SKIP button's now, which is the
    // control that survived BR-01. The claim is the same and is about the
    // hand-off, not about which control made it.
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      container.querySelector<HTMLButtonElement>('.splash-skip')!.click();
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('after the ten-count the splash hands itself over — the show ends', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(SPLASH_BEATS.idleMs - 50);
    });
    expect(onDone).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a click beats the count — exactly one handover, never two', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      container.querySelector<HTMLElement>('.splash')!.click();
      vi.advanceTimersByTime(SPLASH_BEATS.idleMs * 2);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('treats a browser with no matchMedia as "reduce"', () => {
    vi.useFakeTimers();
    stubMedia(false);
    vi.stubGlobal('matchMedia', undefined);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.splash')!.getAttribute('data-phase')).toBe('reveal');
  });
});

describe('Splash — the tagline’s line break', () => {
  it('breaks at the mirror’s hinge, and only there', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} />);
    const lines = [...container.querySelectorAll('.splash-tagline-line')].map((el) =>
      el.textContent!.trim(),
    );
    expect(lines).toEqual(['How you do anything', 'is how your AI does everything.']);
  });

  it('leaves the approved string exactly as strings.ts has it', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.splash-tagline')!.textContent).toBe(S.splashTagline);
  });

  it('falls back to sentence ends for a line with no hinge', () => {
    expect(taglineLines('One sentence. Another one.')).toEqual(['One sentence.', 'Another one.']);
  });
});
