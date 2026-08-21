import { describe, it, expect } from 'vitest';
import { isDevResetChord, DEV_RESET_CHORD_LABEL, type ChordKeyEvent } from './resetChord';

/**
 * V1.2 VB-09. The chord fires while someone is halfway through typing an
 * interview answer, so "does not match" matters far more here than "matches" —
 * a false positive costs a paragraph of real work.
 */
const chord = (over: Partial<ChordKeyEvent> = {}): ChordKeyEvent => ({
  code: 'KeyR',
  ctrlKey: true,
  altKey: true,
  shiftKey: true,
  metaKey: false,
  repeat: false,
  ...over,
});

describe('isDevResetChord', () => {
  it('matches Ctrl+Alt+Shift+R', () => {
    expect(isDevResetChord(chord())).toBe(true);
  });

  it('reads the physical key, so an Alt-composed character still matches', () => {
    // On a US Mac layout Alt+R produces `®` in `event.key`; `code` is what
    // stays stable, and is what the predicate is written against.
    expect(isDevResetChord({ ...chord(), code: 'KeyR' })).toBe(true);
  });

  it.each([
    ['no Ctrl', { ctrlKey: false }],
    ['no Alt', { altKey: false }],
    ['no Shift', { shiftKey: false }],
    ['a different key', { code: 'KeyT' }],
    ['plain R, as typed into an answer', { ctrlKey: false, altKey: false, shiftKey: false }],
    ['Shift+R, as typed into an answer', { ctrlKey: false, altKey: false }],
  ])('does not match with %s', (_label, over) => {
    expect(isDevResetChord(chord(over))).toBe(false);
  });

  it('does not match when Cmd/Win is also held — that is a different chord', () => {
    expect(isDevResetChord(chord({ metaKey: true }))).toBe(false);
  });

  it('does not match an auto-repeat tick, so holding the chord resets once', () => {
    expect(isDevResetChord(chord({ repeat: true }))).toBe(false);
  });

  it('publishes a label that matches what the predicate actually accepts', () => {
    // The label is what gets logged and what a person reads in the code;
    // letting it drift from the predicate is the classic way this rots.
    expect(DEV_RESET_CHORD_LABEL).toBe('Ctrl+Alt+Shift+R');
    for (const part of ['Ctrl', 'Alt', 'Shift']) {
      expect(DEV_RESET_CHORD_LABEL).toContain(part);
    }
  });
});
