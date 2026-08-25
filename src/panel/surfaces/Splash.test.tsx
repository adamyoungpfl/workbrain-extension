import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { Splash, SPLASH_FADE_MS } from './Splash';
import { S } from '../strings';
import { mount } from '../components/testUtils';
import { resetPrefsMemory } from '../voice/prefs';

/**
 * V1.7 VB-34, rebuilt by V2.1 VB-73 — the splash is a doorway now, and its
 * behavioural promises inverted with it. VB-34's version promised it never
 * held anyone up: any input ended it, and it ended on its own. VB-73's version
 * promises the opposite pair, because the surface carries a real choice:
 *
 *   - it stays until a click — no dwell timer, no key-skip, no wheel-skip,
 *   - each door hands over with its own intent, the backdrop and Escape with
 *     none,
 *   - it hands over exactly once however many of those happen together,
 *   - and under reduced motion it hands over immediately rather than fading
 *     out invisibly with the panel still underneath it (kept from VB-34).
 *
 * The old "is out of the accessibility tree" test is gone with the reason for
 * it: a splash with controls on it must be IN the tree, and the panel under it
 * is what leaves instead (App.tsx marks it `inert` — proven in the e2e spec,
 * where a real accessibility tree exists to ask).
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
  resetPrefsMemory();
});

const door = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('.splash-doors button')].find(
    (b) => b.textContent === label,
  )!;

describe('Splash — what it says', () => {
  it('shows the mark, the name, the tagline and the two doors', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.brand-mark')).not.toBeNull();
    expect(container.querySelector('.splash-wordmark')!.textContent).toBe(S.appName);
    expect(container.querySelector('.splash-tagline')!.textContent).toBe(S.splashTagline);
    expect(door(container, S.splashBuild)).toBeDefined();
    expect(door(container, S.splashLoad)).toBeDefined();
  });

  it('runs the mark on the splash camera, not the logo’s spin', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.brand-mark')!.getAttribute('data-spin')).toBe('orbit');
  });

  it('is in the accessibility tree, because it carries real controls now', () => {
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    const splash = container.querySelector('.splash')!;
    // VB-34 asserted the exact opposite here, with the exact opposite reason:
    // it was aria-hidden BECAUSE nothing inside was focusable. VB-73 puts
    // doors on it, so hiding it would hide the only controls that work while
    // the panel underneath is inert.
    expect(splash.getAttribute('aria-hidden')).toBeNull();
    expect(splash.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);
  });

  it('offers the voice row only where a speech engine exists', () => {
    stubMedia(false);
    // jsdom has no speechSynthesis, and the degradation rule says the row is
    // simply absent — not disabled, not explained.
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.splash-voice')).toBeNull();
  });
});

describe('Splash — it stays until a click', () => {
  it('does not leave on its own — there is no dwell any more', () => {
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
    it(`is NOT dismissed by a stray ${event} — VB-34's skip is gone with its reason`, () => {
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

  it('Escape is the one key that closes it, and it closes without a choice', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null);
  });

  it('a click on the backdrop dismisses, choosing nothing', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      container.querySelector<HTMLElement>('.splash')!.click();
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(null);
  });
});

describe('Splash — the doors carry their intent', () => {
  it('“Build your file” hands over build', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      door(container, S.splashBuild).click();
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('build');
  });

  it('“Load your file” hands over load', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      door(container, S.splashLoad).click();
      vi.advanceTimersByTime(SPLASH_FADE_MS);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('load');
  });

  it('a door’s click does not double as a backdrop dismissal', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      door(container, S.splashBuild).click();
      vi.advanceTimersByTime(SPLASH_FADE_MS * 4);
    });
    // Once, with the door's intent — never a second null from the backdrop
    // the door happens to sit on.
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('build');
  });

  it('hands over exactly once, however many things try to end it', () => {
    vi.useFakeTimers();
    stubMedia(false);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      door(container, S.splashBuild).click();
      door(container, S.splashLoad).click();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      vi.advanceTimersByTime(SPLASH_FADE_MS * 4);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('build');
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
  it('hands over the instant a door is pressed, with no fade to sit through', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      door(container, S.splashBuild).click();
    });
    // No 320ms of an invisible overlay between the person and their panel.
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('build');
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
