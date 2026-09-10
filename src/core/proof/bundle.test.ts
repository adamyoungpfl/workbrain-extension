import { describe, expect, it } from 'vitest';
import { buildProofBundle, parseProofBundle } from './bundle';

/* 5j — the bundle is a CONTRACT with the site's parser; the roundtrip is
   the claim that keeps the two sides honest. */

const SAMPLE = {
  task: 'Write my quarterly update.',
  answer: 'Here is a generic status update…\nwith two lines.',
  file: '# Context\n\n## Identity\nHead of RevOps.\n\n===not a fence inside===\n',
};

describe('the proof bundle', () => {
  it('round-trips byte-stable through build and parse', () => {
    const parsed = parseProofBundle(buildProofBundle(SAMPLE));
    expect(parsed).toEqual(SAMPLE);
  });

  it('refuses anything that is not a v1 bundle, quietly', () => {
    expect(parseProofBundle('# Context\n\n## Identity\nJust a file.')).toBeNull();
    expect(parseProofBundle('')).toBeNull();
    expect(parseProofBundle('===WORKBRAIN PROOF BUNDLE v1===\nhalf a bundle')).toBeNull();
  });

  it('survives fence-looking lines inside the content', () => {
    const parsed = parseProofBundle(buildProofBundle(SAMPLE));
    expect(parsed?.file).toContain('===not a fence inside===');
  });
});
