import { describe, it, expect } from 'vitest';
import {
  SPLASH_BEATS,
  splashPhase,
  pullStrength,
  swellOpacity,
  revealAlpha,
  loadingWordIndex,
  idleProgress,
} from './sequence';

/**
 * V2.7 VB-128 — the sequence clock's promises, including the three that are
 * Adam's own decisions and must not drift in a tuning pass:
 *  - reveal lands inside the confirmed 4–5s window (decision 3);
 *  - the idle count is ten seconds and runs FROM the button (decision 4);
 *  - the white swell is a soft ramp on both sides, never a square wave.
 */

describe('the beats', () => {
  it('are ordered: drift, pull, swell, reveal, tagline, button', () => {
    expect(SPLASH_BEATS.accelAt).toBeLessThan(SPLASH_BEATS.swellAt);
    expect(SPLASH_BEATS.swellAt).toBeLessThan(SPLASH_BEATS.revealAt);
    expect(SPLASH_BEATS.revealAt).toBeLessThan(SPLASH_BEATS.taglineAt);
    expect(SPLASH_BEATS.taglineAt).toBeLessThan(SPLASH_BEATS.enterAt);
  });

  it('reveal lands inside the confirmed 4–5 second window', () => {
    /* RE-PINNED 2026-09-02 (Adam, the cinematic open): the admiration hold
       and the slow fade supersede decision 3's 4–5s window — the reveal now
       lands just under six seconds, and this pin moves only when he says. */
    expect(SPLASH_BEATS.revealAt).toBeGreaterThanOrEqual(5.5);
    expect(SPLASH_BEATS.revealAt).toBeLessThanOrEqual(6.5);
  });

  it('the idle count is six seconds, from the button (VB-131)', () => {
    expect(SPLASH_BEATS.idleMs).toBe(6_000);
  });
});

describe('splashPhase', () => {
  it('walks show → swell → reveal at the beats', () => {
    expect(splashPhase(0)).toBe('show');
    expect(splashPhase(SPLASH_BEATS.swellAt - 0.01)).toBe('show');
    expect(splashPhase(SPLASH_BEATS.swellAt)).toBe('swell');
    expect(splashPhase(SPLASH_BEATS.revealAt - 0.01)).toBe('swell');
    expect(splashPhase(SPLASH_BEATS.revealAt)).toBe('reveal');
    expect(splashPhase(60)).toBe('reveal');
  });
});

describe('pullStrength', () => {
  it('rests during the drift, then only ever grows until it tops out', () => {
    expect(pullStrength(0)).toBeCloseTo(0.16);
    expect(pullStrength(SPLASH_BEATS.accelAt)).toBeCloseTo(0.16);
    // Monotonic non-decreasing across the whole pull, strictly growing
    // until the cap lands (it saturates a beat before the swell so the
    // fastest frames hold one speed instead of climbing forever).
    let last = pullStrength(SPLASH_BEATS.accelAt);
    let grewSomewhere = false;
    for (let t = SPLASH_BEATS.accelAt + 0.1; t < SPLASH_BEATS.swellAt; t += 0.1) {
      const now = pullStrength(t);
      expect(now).toBeGreaterThanOrEqual(last);
      if (now > last) grewSomewhere = true;
      last = now;
    }
    expect(grewSomewhere).toBe(true);
    expect(last).toBeGreaterThan(5);
  });

  it('is capped — the last pre-white frames stay drawable', () => {
    expect(pullStrength(30)).toBe(pullStrength(31));
  });
});

describe('swellOpacity — the no-strobe decision, held', () => {
  it('is zero through the whole show', () => {
    expect(swellOpacity(0)).toBe(0);
    expect(swellOpacity(SPLASH_BEATS.swellAt)).toBe(0);
  });

  it('rises smoothly to full at the reveal, then falls away', () => {
    const mid = swellOpacity((SPLASH_BEATS.swellAt + SPLASH_BEATS.revealAt) / 2);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.8);
    expect(swellOpacity(SPLASH_BEATS.revealAt - 0.001)).toBeGreaterThan(0.95);
    expect(swellOpacity(SPLASH_BEATS.taglineAt)).toBeLessThan(0.05);
  });

  it('never jumps: adjacent frames differ by a whisper, not a wave', () => {
    // 60fps frames across the whole swell — the biggest single-frame step
    // stays small, which is what "a luminance swell, never a strobe" means
    // in arithmetic.
    let worst = 0;
    for (let t = SPLASH_BEATS.swellAt - 0.2; t < SPLASH_BEATS.taglineAt + 0.2; t += 1 / 60) {
      worst = Math.max(worst, Math.abs(swellOpacity(t + 1 / 60) - swellOpacity(t)));
    }
    expect(worst).toBeLessThan(0.09);
  });
});

describe('revealAlpha', () => {
  it('fades each child in over its own beat', () => {
    expect(revealAlpha(SPLASH_BEATS.taglineAt - 0.01, SPLASH_BEATS.taglineAt)).toBe(0);
    expect(revealAlpha(SPLASH_BEATS.taglineAt + 0.6, SPLASH_BEATS.taglineAt)).toBe(1);
  });
});

describe('the loading line and the count', () => {
  it('cycles the words on the period and wraps forever', () => {
    expect(loadingWordIndex(0, 8)).toBe(0);
    expect(loadingWordIndex(1399, 8)).toBe(0);
    expect(loadingWordIndex(1400, 8)).toBe(1);
    expect(loadingWordIndex(1400 * 8, 8)).toBe(0);
    expect(loadingWordIndex(1400 * 9 + 5, 8)).toBe(1);
  });

  it('shrugs at nonsense — no words, negative time', () => {
    expect(loadingWordIndex(5000, 0)).toBe(0);
    expect(loadingWordIndex(-50, 8)).toBe(0);
  });

  it('the count drains over exactly the idle window', () => {
    expect(idleProgress(0)).toBe(0);
    expect(idleProgress(SPLASH_BEATS.idleMs / 2)).toBeCloseTo(0.5);
    expect(idleProgress(SPLASH_BEATS.idleMs)).toBe(1);
    expect(idleProgress(SPLASH_BEATS.idleMs + 2000)).toBe(1);
  });
});
