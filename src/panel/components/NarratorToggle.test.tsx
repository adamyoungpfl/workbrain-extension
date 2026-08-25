import { describe, it, expect, afterEach } from 'vitest';
import { act, useLayoutEffect, useRef } from 'react';
import { NarratorToggle } from './NarratorToggle';
import { currentPrefs, resetPrefsMemory, setNarrator } from '../voice/prefs';
import { S } from '../strings';
import { mount } from './testUtils';

/**
 * V1.3 VB-18's toggle. What is worth asserting without a browser: that it is
 * absent where there is no speech engine, that its state is announced rather
 * than only painted, that both halves of the drawing exist so the state is
 * never carried by colour alone, and that it follows the shared preference
 * rather than a copy of it.
 *
 * The things only a browser can answer — 44×44, the focus ring, the contrast,
 * what is actually spoken — are tests/e2e/narrator.spec.ts's.
 */

class FakeUtterance {
  voice: unknown = null;
  lang = '';
  rate = 1;
  pitch = 1;
  constructor(public text: string) {}
}

const scope = globalThis as unknown as {
  speechSynthesis?: unknown;
  SpeechSynthesisUtterance?: unknown;
  chrome?: unknown;
};

function installSpeech(): void {
  scope.speechSynthesis = {
    speaking: false,
    pending: false,
    getVoices: () => [],
    speak: () => {},
    cancel: () => {},
    addEventListener: () => {},
  };
  scope.SpeechSynthesisUtterance = FakeUtterance;
}

afterEach(() => {
  delete scope.speechSynthesis;
  delete scope.SpeechSynthesisUtterance;
  delete scope.chrome;
  resetPrefsMemory();
});

const toggleIn = (container: HTMLElement) => container.querySelector('button.narrator-toggle');

describe('NarratorToggle', () => {
  it('renders nothing where the browser cannot speak', () => {
    // No speech API installed: jsdom as it comes, which is the same shape as a
    // browser without the Web Speech API. Not a disabled button, not a note —
    // nothing (docs/GUARDRAILS.md's degradation rule).
    const { container, unmount } = mount(<NarratorToggle />);
    expect(container.textContent).toBe('');
    expect(toggleIn(container)).toBeNull();
    unmount();
  });

  it('is in the FIRST commit, not the second — the header must not move', () => {
    // THIS IS A LAYOUT ASSERTION WEARING A MARKUP ASSERTION'S CLOTHES.
    //
    // `.narrator` is a zero-height row on a -10px margin inside `.flow`, a flex
    // column with a 4px gap, so its real cost to everything below it is six
    // pixels *up* (NarratorToggle.css, Flow.css). A version of this component
    // that decided `narratorSupported()` in a `useEffect` rendered `null` first
    // and the control second, which pulled the progress bar, the question, the
    // follow-ups and the answer field up by 6px one frame into every screen —
    // and left anything that measured inside that frame disagreeing with
    // everything after it by exactly that much (see the note on the component,
    // and tests/e2e/deep-dive.spec.ts's closing FLIP, which is what caught it).
    //
    // The frame that matters is the FIRST PAINTED one, so the probe is a
    // `useLayoutEffect` in a parent: layout effects run inside the commit,
    // before the browser paints and before any passive effect anywhere in the
    // tree. Deferred to an effect, the toggle is not in the DOM yet when this
    // reads it. The plain `mount` assertions below cannot tell the two apart —
    // `act` flushes the passive effect before handing the container back, so a
    // regression would pass every one of them.
    installSpeech();
    let firstCommit = 'not committed';
    function AtFirstPaint() {
      const ref = useRef<HTMLDivElement>(null);
      useLayoutEffect(() => {
        firstCommit = ref.current?.innerHTML ?? '';
      }, []);
      return (
        <div ref={ref}>
          <NarratorToggle />
        </div>
      );
    }
    const { unmount } = mount(<AtFirstPaint />);
    expect(firstCommit).toContain('narrator-toggle');
    unmount();
  });

  it('is a toggle button with a name and a state, off to begin with', () => {
    installSpeech();
    const { container, unmount } = mount(<NarratorToggle />);

    const button = toggleIn(container);
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe(S.narrator);
    expect(button?.getAttribute('title')).toBe(S.narrator);
    expect(button?.getAttribute('aria-pressed')).toBe('false');
    expect(button?.getAttribute('type')).toBe('button');
    unmount();
  });

  it('carries both halves of the drawing, so the state is not colour alone', () => {
    installSpeech();
    const { container, unmount } = mount(<NarratorToggle />);

    // The waves and the mute stroke are both in the DOM in both states; the
    // stylesheet shows one of them. Different shapes, not different colours.
    expect(container.querySelector('.narrator-waves')).not.toBeNull();
    expect(container.querySelector('.narrator-mute')).not.toBeNull();
    expect(container.querySelector('.narrator-body')).not.toBeNull();
    // And the glyph itself is never the accessible name.
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    unmount();
  });

  it('is the drawing that was drawn', () => {
    installSpeech();
    const { container, unmount } = mount(<NarratorToggle />);
    // The path data is drawn, not derived. A digit lost in a refactor is
    // invisible in a screenshot at 18px and obvious here.
    const d = (selector: string) =>
      Array.from(container.querySelectorAll(`${selector} path, path${selector}`)).map((p) =>
        p.getAttribute('d'),
      );
    expect(d('.narrator-body')).toEqual(['M4 9.5h3.2L12 5.4v13.2L7.2 14.5H4z']);
    expect(d('.narrator-waves')).toEqual([
      'M15.4 9.4a3.6 3.6 0 0 1 0 5.2',
      'M18 6.9a7.2 7.2 0 0 1 0 10.2',
    ]);
    expect(d('.narrator-mute')).toEqual(['M16.1 9.5l5 5', 'M21.1 9.5l-5 5']);
    unmount();
  });

  it('flips the shared preference when pressed', () => {
    installSpeech();
    const { container, unmount } = mount(<NarratorToggle />);
    const button = toggleIn(container) as HTMLButtonElement;

    act(() => button.click());
    expect(currentPrefs().narrator).toBe(true);
    expect(toggleIn(container)?.getAttribute('aria-pressed')).toBe('true');

    act(() => button.click());
    expect(currentPrefs().narrator).toBe(false);
    expect(toggleIn(container)?.getAttribute('aria-pressed')).toBe('false');
    unmount();
  });

  it('follows the preference when it is changed from somewhere else', () => {
    installSpeech();
    const { container, unmount } = mount(<NarratorToggle />);
    expect(toggleIn(container)?.getAttribute('aria-pressed')).toBe('false');

    // The subscription is the point: two toggles on two surfaces, and the
    // narration effect beside them, all read one value.
    act(() => {
      void setNarrator(true);
    });
    expect(toggleIn(container)?.getAttribute('aria-pressed')).toBe('true');
    unmount();
  });

  it('asks for no permission and constructs no recogniser', () => {
    installSpeech();
    // The mic is deferred to its own task (VB-18). Nothing in this control may
    // reach for a capture API, and there is no second toggle beside it.
    const { container, unmount } = mount(<NarratorToggle />);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect((scope as { SpeechRecognition?: unknown }).SpeechRecognition).toBeUndefined();
    unmount();
  });
});
