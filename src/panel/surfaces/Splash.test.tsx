import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { Splash, SPLASH_FADE_MS, taglineLines } from './Splash';
import { CLAIM_TRUE } from '../../core/splash/reveal';
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
  it('opens on the WALL — no mark, no glow, and no reveal yet', () => {
    /* SUPERSEDED 2026-09-01, at Adam's word, and recorded rather than quietly
       rewritten.

       This used to assert "the mark in its glow": VB-128 burned the logo in
       the middle of the field for the whole show. Adam's sequence is "the
       animation builds fading to white and then BURST with the logo lockup" —
       and a logo that has been on screen for four seconds cannot burst. The
       show is the wall now; the mark is what the white breaks into.

       WHAT THE OLD ASSERTION PROTECTED SURVIVES, and is still checked below:
       the show is a show, the title card has not arrived, and every word of
       the splash still lives in the reveal's DOM rather than on the canvas. */
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.splash')!.getAttribute('data-phase')).toBe('show');
    expect(container.querySelector('.splash-stage')).not.toBeNull();
    expect(container.querySelector('.splash-stage .brand-mark')).toBeNull();
    expect(container.querySelector('.splash-glow')).toBeNull();
    // The movie has not reached its title card.
    expect(container.querySelector('.splash-wordmark')).toBeNull();
    expect(container.querySelector('.splash-enter')).toBeNull();
  });

  it('says nothing on the canvas — the stage is scenery and marked as such', () => {
    // What the removed mark assertions were really guarding: no text, no
    // control and nothing announced lives in the show.
    stubMedia(false);
    const { container } = mount(<Splash onDone={() => {}} />);
    const stage = container.querySelector('.splash-stage')!;
    expect(stage.getAttribute('aria-hidden')).toBe('true');
    expect(stage.querySelector('button')).toBeNull();
    expect(stage.textContent).toBe('');
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
    /* V2.9 slice 3b: the two sentences are two ANIMATED sections — the minutes
       stream down from thirty, and the second claim is arrived at by striking
       out three wrong answers. Neither is a static paragraph to read back. The
       claim that survives is the one that mattered: both are on the reveal, in
       the DOM, from the settled frame.

       And the second one is checked as the TRUE sentence rather than as
       whatever is in the slot: this render is the still version, where the
       elimination has already happened and "Nothing leaves your browser" is
       the only thing it may say. */
    expect(container.querySelector('.splashreveal-cost')!.textContent).toContain(
      S.splashCostUnit,
    );
    expect(container.querySelector('.splashreveal-leave')!.textContent).toContain(
      S.splashLeaveAnswers[CLAIM_TRUE]!.amount,
    );
    expect(container.querySelector('.splashreveal-own')!.textContent).toContain(
      S.splashOwnSpan,
    );
    // And no white layer: there is nothing to swell from.
    expect(container.querySelector('.splash-swell')).toBeNull();
  });

  /**
   * BS-09 took this screen from one control to three; BR-01 takes it back to
   * two, and the one that went was the redundant one. Skip is the way past,
   * the tour is the one thing somebody might choose INSTEAD of arriving, and
   * "enter" was a button for a move the entire surface already makes.
   */
  it('is TWO buttons and no more — the screen asks one question', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} onBaseline={() => {}} />);
    const labels = [...container.querySelectorAll('.splash button')].map((b) => b.textContent);
    // The baseline path first, because it is the one that expires. The corner
    // Skip and the tour door are both gone: "go straight in" is one of these
    // two now, and the tour is still the interview's own first three steps.
    // Collapsed pills (jsdom has no speech engine) wear the PLAIN labels —
    // no "Narrated" caption where narration is not a thing the device does.
    expect(labels).toEqual([S.splashBaselineLabel, S.splashStraightLabel]);
  });

  it('still offers the shorter road when there is no baseline to take', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} />);
    const labels = [...container.querySelectorAll('.splash button')].map((b) => b.textContent);
    expect(labels).toEqual([S.splashStraightLabel]);
  });

  it('draws no tour door when there is nowhere to take one', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const { container } = mount(<Splash onDone={() => {}} />);
    expect(container.querySelector('.splash-tour')).toBeNull();
    expect(container.querySelectorAll('.splash button').length).toBe(1);
  });

  it('the REVEAL is not dismissed by a stray click — it is a question with two answers', () => {
    // Reversed on 2026-08-31, and deliberately. While the show runs, a click
    // means "yes, in" and costs nothing but the rest of the movie. Once the
    // choice is on screen, a stray click that picked one of the two answers
    // for somebody would be the screen answering for them.
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} onBaseline={() => {}} />);
    act(() => {
      (container.querySelector('.splash') as HTMLElement).click();
    });
    expect(onDone).not.toHaveBeenCalled();
    // Escape is still the keyboard's way out, at every phase.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      vi.advanceTimersByTime(SPLASH_FADE_MS);
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
    // The claim is about the hand-off rather than about which control made it,
    // and the control that carries it is now "just get started".
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      [...container.querySelectorAll<HTMLButtonElement>('.splash-door')].at(-1)!.click();
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  /**
   * REVERSED 2026-08-31: the splash no longer hands itself over.
   *
   * VB-131 held it six seconds and then left for Home on its own, which was
   * right when arriving was the only thing this screen could do. It offers a
   * CHOICE now — the baseline path or the shorter road — and a screen that
   * answers its own question after ten seconds is not offering one.
   *
   * The two tests that stood here asserted the count and that a click beat it.
   * What replaces them is the claim that matters more: waiting does nothing,
   * and the only ways out are the two buttons and Escape.
   */
  it('waits indefinitely — the choice is not made for anybody', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    mount(<Splash onDone={onDone} onBaseline={() => {}} />);

    act(() => {
      // Far past every clock this screen ever had.
      vi.advanceTimersByTime(60_000);
    });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('opens the destination AND ends the splash — the polish-pass contract', () => {
    /* V2.9 slice 4 polish: `onBaseline` OPENS the interview and `onDone`
       ends the splash — they are no longer alternatives, and the opening
       comes first so the fog (or, reduced, the cut) lands on the screen the
       person chose. App stopped calling `endSplash` inside `onBaseline` on
       the strength of this ordering; if it stops holding, the splash never
       unmounts on the baseline route. */
    vi.useFakeTimers();
    stubMedia(true);
    const calls: string[] = [];
    const { container } = mount(
      <Splash onDone={() => calls.push('done')} onBaseline={() => calls.push('open')} />,
    );
    act(() => {
      /* The baseline key is the first door in the DOM. Reduced motion is
         stubbed on, so a plain click arms it — the hold is choreography,
         and choreography is what that preference turns off. */
      container.querySelector<HTMLButtonElement>('.splash-door')!.click();
    });
    expect(calls).toEqual(['open', 'done']);
  });

  it('hands over exactly once, however many times a door is pressed', () => {
    vi.useFakeTimers();
    stubMedia(true);
    const onDone = vi.fn();
    const { container } = mount(<Splash onDone={onDone} />);

    act(() => {
      const door = container.querySelector<HTMLButtonElement>('.splash-door')!;
      door.click();
      door.click();
      vi.advanceTimersByTime(SPLASH_FADE_MS * 3);
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
