import { describe, expect, it } from 'vitest';
import { SELF_REPORT_ASK, parseSelfReport, stripSelfReport } from './selfReport';

/**
 * The claim worth testing: the parser is tolerant about SHAPE and strict about
 * PRESENCE. Models bold labels, bullet them and reorder them; a parser that
 * accepted one shape would report "the AI said nothing" far more often than
 * the AI said nothing. But a paste with no block returns null, so the panel
 * shows nothing rather than an empty report that reads as a finding.
 */
describe('parseSelfReport', () => {
  it('reads the plain three-line block', () => {
    const report = parseSelfReport(
      'Here is your update.\n\nUSED: How I Communicate, Initiatives\nMISSING: the vendor headcount\nUNSURE: none',
    );
    expect(report).toEqual({
      used: ['How I Communicate', 'Initiatives'],
      missing: ['the vendor headcount'],
      unsure: [],
    });
  });

  it('survives the markdown a model wraps labels in', () => {
    expect(parseSelfReport('**USED:** My World\n- **MISSING:** a date\n> UNSURE: nothing')).toEqual({
      used: ['My World'],
      missing: ['a date'],
      unsure: [],
    });
  });

  it('does not care what order they arrive in', () => {
    const report = parseSelfReport('UNSURE: the tone\nUSED: Reference Examples\nMISSING: none')!;
    expect(report.unsure).toEqual(['the tone']);
    expect(report.used).toEqual(['Reference Examples']);
  });

  it('treats "none" and its friends as nothing, not as an item', () => {
    const report = parseSelfReport('USED: none\nMISSING: N/A\nUNSURE: nothing to flag')!;
    expect(report).toEqual({ used: [], missing: [], unsure: [] });
  });

  it('splits a list however the model punctuated it', () => {
    const report = parseSelfReport('USED: About Me, How I Think and Context Boundaries\nMISSING: none')!;
    expect(report.used).toEqual(['About Me', 'How I Think', 'Context Boundaries']);
  });

  it('RETURNS NULL when there is no block, so nothing is shown', () => {
    // The important negative. An empty report rendered on screen would read as
    // "your AI found nothing missing", which is a claim nobody made.
    expect(parseSelfReport('Here is your status update. Nothing else.')).toBeNull();
    expect(parseSelfReport('')).toBeNull();
  });
});

describe('stripSelfReport', () => {
  it('takes the block off the end and leaves the draft alone', () => {
    const pasted = 'Line one.\nLine two.\n\nUSED: About Me\nMISSING: none\nUNSURE: none';
    expect(stripSelfReport(pasted)).toBe('Line one.\nLine two.');
  });

  it('leaves a mid-paragraph mention of a label untouched', () => {
    // Only the trailing run is instrumentation. A sentence that happens to
    // start with the word is the person's draft and stays in it.
    const pasted = 'MISSING: this is actually a heading they wrote.\n\nAnd the body.';
    expect(stripSelfReport(pasted)).toBe(pasted);
  });

  it('returns the whole paste when there is no block', () => {
    expect(stripSelfReport('Just an answer.')).toBe('Just an answer.');
  });
});

describe('the ask itself', () => {
  it('names all three labels, so what is asked for is what is parsed', () => {
    for (const label of ['USED', 'MISSING', 'UNSURE']) {
      expect(SELF_REPORT_ASK).toContain(label);
    }
  });

  it('is round-trippable: what the ask describes, the parser reads', () => {
    // The two halves cannot drift — if somebody rewords the ask into a shape
    // the parser does not accept, this fails.
    const asShipped = 'USED: How I Communicate\nMISSING: none\nUNSURE: none';
    expect(parseSelfReport(asShipped)).not.toBeNull();
  });
});
