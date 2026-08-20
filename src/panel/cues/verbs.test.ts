import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyCueVerb,
  bob,
  clearAllCueMarks,
  clearCueMarks,
  focus,
  prefersReducedMotion,
  ring,
  ringViolet,
  sweep,
} from './verbs';

/** jsdom + a matchMedia mock — docs/TESTING.md and R1-08's brief both call
 * this out explicitly, as the one place a verb's reduced-motion branch is
 * exercised directly rather than left to a real browser's CSS cascade
 * (that layer is covered separately, in tests/e2e/cues.spec.ts). */
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

function el(tag = 'button'): HTMLElement {
  const e = document.createElement(tag);
  document.body.appendChild(e);
  return e;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('prefersReducedMotion', () => {
  it('reads window.matchMedia for the reduced-motion query', () => {
    mockReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    mockReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('sweep', () => {
  it('full motion: marks every element with the sweep class and a staggered delay, no reduced marker', () => {
    mockReducedMotion(false);
    const a = el();
    const b = el();
    sweep([a, b]);

    expect(a.classList.contains('cue-sweep')).toBe(true);
    expect(b.classList.contains('cue-sweep')).toBe(true);
    expect(a.classList.contains('cue-reduced')).toBe(false);
    expect(a.style.getPropertyValue('--cue-stagger')).toBe('0s');
    expect(b.style.getPropertyValue('--cue-stagger')).toBe('0.15s');
    expect(a.style.boxShadow).toBe('');
  });

  it('reduced motion: adds a still, visible tint — the replacement state itself, not just the absence of the animated class', () => {
    mockReducedMotion(true);
    const a = el();
    sweep([a]);

    expect(a.classList.contains('cue-sweep')).toBe(true);
    expect(a.classList.contains('cue-reduced')).toBe(true);
    expect(a.style.boxShadow).not.toBe('');
    expect(a.style.boxShadow).toContain('42, 79, 203');
  });
});

describe('ring', () => {
  it('reduced motion: sets a static box-shadow halo directly on the element', () => {
    mockReducedMotion(true);
    const a = el();
    ring([a]);

    expect(a.classList.contains('cue-ring')).toBe(true);
    expect(a.classList.contains('cue-reduced')).toBe(true);
    expect(a.style.boxShadow).toContain('42, 79, 203');
    expect(a.style.boxShadow).toContain('0.2');
  });

  it('full motion: no still marker, no inline box-shadow', () => {
    mockReducedMotion(false);
    const a = el();
    ring([a]);
    expect(a.classList.contains('cue-reduced')).toBe(false);
    expect(a.style.boxShadow).toBe('');
  });
});

describe('ringViolet', () => {
  it('reduced motion: the violet twin of ring, same treatment, violet colour', () => {
    mockReducedMotion(true);
    const a = el();
    ringViolet([a]);

    expect(a.classList.contains('cue-ring-v')).toBe(true);
    expect(a.classList.contains('cue-reduced')).toBe(true);
    expect(a.style.boxShadow).toContain('106, 63, 209');
  });
});

describe('bob', () => {
  it('full motion: just the animating class, nothing else', () => {
    mockReducedMotion(false);
    const a = el();
    bob([a]);
    expect(a.classList.contains('cue-bob')).toBe(true);
    expect(a.classList.contains('cue-reduced')).toBe(false);
    expect(a.style.boxShadow).toBe('');
  });

  it('reduced motion: a static ring stands in for the stopped bob — a deliberate extension beyond design-system.html\'s literal (bare "animation:none") reduced-motion CSS for this verb, so the target is still visibly marked, not just left in its default state', () => {
    mockReducedMotion(true);
    const a = el();
    bob([a]);
    expect(a.classList.contains('cue-reduced')).toBe(true);
    expect(a.style.boxShadow).toContain('primary-tint');
  });
});

describe('focus', () => {
  it('moves DOM focus to the first resolved element — no reduced-motion branch, since nothing here was ever animated', () => {
    mockReducedMotion(true);
    const input = document.createElement('input');
    document.body.appendChild(input);
    focus([input]);
    expect(document.activeElement).toBe(input);
    expect(input.className).toBe('');
  });

  it('does nothing when the resolved list is empty, rather than throwing', () => {
    expect(() => focus([])).not.toThrow();
  });
});

describe('clearCueMarks', () => {
  it('clears only the given elements, leaving an unrelated marked element alone — the scoping that fixed a real bug (see verbs.ts and useCueChain.ts)', () => {
    mockReducedMotion(true);
    const mine = el();
    const someoneElses = el();
    ring([mine]);
    ring([someoneElses]);

    clearCueMarks([mine]);

    expect(mine.classList.contains('cue-ring')).toBe(false);
    expect(mine.classList.contains('cue-reduced')).toBe(false);
    expect(mine.style.boxShadow).toBe('');

    expect(someoneElses.classList.contains('cue-ring')).toBe(true);
    expect(someoneElses.classList.contains('cue-reduced')).toBe(true);
    expect(someoneElses.style.boxShadow).not.toBe('');
  });

  it('is a no-op given an empty list', () => {
    mockReducedMotion(false);
    const a = el();
    ring([a]);
    expect(() => clearCueMarks([])).not.toThrow();
    expect(a.classList.contains('cue-ring')).toBe(true);
  });
});

describe('clearAllCueMarks', () => {
  it('removes every cue class this module can apply, plus any inline still-marker style, everywhere under root', () => {
    mockReducedMotion(true);
    const a = el();
    const b = el();
    ring([a]);
    bob([b]);

    clearAllCueMarks();

    for (const target of [a, b]) {
      expect(target.classList.contains('cue-ring')).toBe(false);
      expect(target.classList.contains('cue-bob')).toBe(false);
      expect(target.classList.contains('cue-reduced')).toBe(false);
      expect(target.style.boxShadow).toBe('');
    }
  });

  it('is a no-op on an element with no cue marks', () => {
    const a = el();
    expect(() => clearAllCueMarks()).not.toThrow();
    expect(a.className).toBe('');
  });
});

describe('applyCueVerb', () => {
  it('dispatches to the right verb function by name', () => {
    mockReducedMotion(false);
    const a = el();
    applyCueVerb('ringViolet', [a]);
    expect(a.classList.contains('cue-ring-v')).toBe(true);
  });

  it('the point verb is a deliberate no-op here — Pointer.tsx/useCueChain.ts handle it as overlay state, not a DOM class', () => {
    const a = el();
    expect(() => applyCueVerb('point', [a])).not.toThrow();
    expect(a.className).toBe('');
  });
});
