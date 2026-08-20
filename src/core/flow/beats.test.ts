import { describe, it, expect } from 'vitest';
import {
  parseBeat,
  beatPlainText,
  beatsPlainText,
  beatHoldMs,
  BEAT_READ_BUFFER_MS,
} from './beats';
import { contextModules } from './flow';

describe('parseBeat', () => {
  it('returns one plain run for a beat with no emphasis', () => {
    expect(parseBeat('Last one.')).toEqual([{ text: 'Last one.', emphasis: false }]);
  });

  it('splits a marked span out of the surrounding text', () => {
    expect(parseBeat('Now the __names__ — the people you mention.')).toEqual([
      { text: 'Now the ', emphasis: false },
      { text: 'names', emphasis: true },
      { text: ' — the people you mention.', emphasis: false },
    ]);
  });

  it('keeps two marked spans in one beat separate rather than swallowing the text between them', () => {
    expect(parseBeat('__one__ and __two__')).toEqual([
      { text: 'one', emphasis: true },
      { text: ' and ', emphasis: false },
      { text: 'two', emphasis: true },
    ]);
  });

  it('drops the empty runs a leading or trailing marker produces', () => {
    expect(parseBeat('__who you are__')).toEqual([{ text: 'who you are', emphasis: true }]);
  });

  it('leaves an unclosed marker literal — a beat is text being read, never markup being run', () => {
    expect(parseBeat('half __open')).toEqual([{ text: 'half __open', emphasis: false }]);
  });

  it('never treats angle brackets as anything but characters', () => {
    expect(parseBeat('a <script> tag')).toEqual([{ text: 'a <script> tag', emphasis: false }]);
  });
});

describe('beatPlainText / beatsPlainText', () => {
  it('strips the markers and keeps every other character', () => {
    expect(beatPlainText('Now the __names__ — the people.')).toBe('Now the names — the people.');
  });

  it('joins a sequence with a single space, the same way source.ts builds an intro prompt fallback', () => {
    expect(beatsPlainText(['One __two__.', 'Three.'])).toBe('One two. Three.');
  });

  it('matches architecture_orientation own plain-text prompt, so the two can never drift', () => {
    const step = contextModules
      .flatMap((m) => m.nodes)
      .find((node) => !('fields' in node) && node.id === 'architecture_orientation');
    if (!step || 'fields' in step) throw new Error('architecture_orientation missing from the flow');
    const prompt = typeof step.q === 'function' ? step.q({ answers: {}, repeatables: {} }) : step.q;
    expect(step.beats?.length).toBe(2);
    expect(beatsPlainText(step.beats!)).toBe(prompt);
  });
});

describe('beatHoldMs', () => {
  it('is the flat buffer plus the beat own reading time at 200 words per minute', () => {
    // Ten words: 10 / 200 of a minute = 3s, plus the 2s buffer.
    const tenWords = 'one two three four five six seven eight nine ten';
    expect(beatHoldMs(tenWords)).toBe(3000 + BEAT_READ_BUFFER_MS);
  });

  it('does not count emphasis markers as reading time', () => {
    expect(beatHoldMs('__one two__ three')).toBe(beatHoldMs('one two three'));
  });

  it('still gives a short beat time to land', () => {
    expect(beatHoldMs('Two questions.')).toBeGreaterThanOrEqual(BEAT_READ_BUFFER_MS);
  });

  it('holds a long beat longer than a short one', () => {
    expect(beatHoldMs('A much longer beat with a good many more words in it than the other one.')).toBeGreaterThan(
      beatHoldMs('Short beat.'),
    );
  });
});
