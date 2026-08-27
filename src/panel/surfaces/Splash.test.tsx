import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { Splash, SPLASH_FADE_MS, taglineLines } from './Splash';
import { S } from '../strings';
import { mount } from '../components/testUtils';

/**
 * V1.7 VB-34, rebuilt by V2.1 VB-73, simplified by V2.6 VB-126 — the splash
 * is pure arrival: the mark, the name, the tagline, and one full-surface
 * control. Its promises now:
 *
 *   - it stays until told to go — no dwell timer, no letter-key skip,
 *   - any click hands over to Home: the surface, the control, anywhere,
 *   - Escape still means "close this",
 *   - it hands over exactly once however many of those happen together,
 *   - and under reduced motion it hands over immediately rather than fading
 *     out invisibly with the panel still underneath it (kept from VB-34).
 *
 * VB-73's doors and voice row are gone (Adam, 2026-08-26): the import door's
 * job lives on Home ("I already have a file"), the narrator's in the header
 * toggle, and the surface is held for the wow treatment.
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
  it('shows the mark, the name, the tagline and the one way in', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.brand-mark')).not.toBeNull();
    expect(container.querySelector('.splash-wordmark')!.textContent).toBe(S.appName);
    expect(container.querySelector('.splash-tagline')!.textContent).toBe(S.splashTagline);
    const enter = container.querySelector<HTMLButtonElement>('.splash-enter')!;
    expect(enter).not.toBeNull();
    expect(enter.getAttribute('aria-label')).toBe(S.splashEnter);
    // The doors are gone: one control on the whole surface, nothing else.
    expect(container.querySelectorAll('.splash button').length).toBe(1);
  });

  it('runs the mark on the splash camera, not the logo’s spin', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.brand-mark')!.getAttribute('data-spin')).toBe('orbit');
  });

  it('is in the accessibility tree, because it carries a real control', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    const splash = container.querySelector('.splash')!;
    expect(splash.getAttribute('aria-hidden')).toBeNull();
    // And the text is content beside the control, not trapped inside its
    // label — a screen reader meets the tagline as a paragraph.
    expect(splash.querySelector('.splash-enter p')).toBeNull();
    expect(splash.querySelector('p.splash-tagline')).not.toBeNull();
  });
});

describe('Splash — it stays until told to go', () => {
  it('does not leave on its own — there is no dwell', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onDone).not.toHaveBeenCalled();
    expect(container.querySelector('.splash')!.getAttribute('data-leaving')).toBe('off');
  });

  for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const) {
    it(`is NOT dismissed by a stray ${event} — a stray press still costs nothing`, () => {
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

  it('Escape closes it', () => {
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

  it('a click anywhere on the surface hands over', () => {
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

  it('the enter control itself hands over — the keyboard path', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      // What Enter and Space do to a focused native button.
      container.querySelector<HTMLButtonElement>('.splash-enter')!.click();
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('hands over exactly once, however many things try to end it', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      container.querySelector<HTMLButtonElement>('.splash-enter')!.click();
      container.querySelector<HTMLElement>('.splash')!.click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      vi.advanceTimersByTime(SPLASH_FADE_MS * 4);
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

describe('Splash — reduced motion', () => {
  it('hands over the instant it is pressed, with no fade to sit through', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      container.querySelector<HTMLButtonElement>('.splash-enter')!.click();
    });
    // No 320ms of an invisible overlay between the person and their panel.
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('treats a browser with no matchMedia as "reduce"', () => {
    vi.useFakeTimers();
    stubMedia(false);
    vi.stubGlobal('matchMedia', undefined);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      container.querySelector<HTMLElement>('.splash')!.click();
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('Splash — the tagline’s line break', () => {
  it('breaks at the mirror’s hinge, and only there', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    const lines = [...container.querySelectorAll('.splash-tagline-line')].map((el) =>
      el.textContent!.trim(),
    );
    expect(lines).toEqual(['How you do anything', 'is how your AI does everything.']);
  });

  it('leaves the approved string exactly as strings.ts has it', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    // Not "close enough" — the paragraph's own text, character for
    // character, including the space between the lines.
    expect(container.querySelector('.splash-tagline')!.textContent).toBe(S.splashTagline);
  });

  it('falls back to sentence ends for a line with no hinge', () => {
    // The splitter is presentation for whatever the approved string is —
    // if the tagline ever changes shape again, it must not orphan a word.
    expect(taglineLines('One sentence. Another one.')).toEqual([
      'One sentence.',
      'Another one.',
    ]);
  });
});
