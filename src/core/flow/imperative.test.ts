import { describe, expect, it } from 'vitest';
import { asOrder, ORDER_HINT_MIN_CHARS } from './imperative';

describe('asOrder — the hedge repair', () => {
  /* THE CASE THIS FEATURE EXISTS FOR. Adam answered the baseline question as
     naturally as he could, mid-session on 2026-08-31, and produced exactly
     this. It is the only real evidence anybody has about how this question
     gets answered, so it is the first test. */
  it("turns Adam's own real answer into a task", () => {
    const real =
      'I would like to be able to point my AI at an email or all my emails ' +
      'from this morning and have it tell me which ones are important and ' +
      'which ones are not and prepare a draft for me to review before it ' +
      'gets sent.';
    expect(asOrder(real)).toBe(
      'Point my AI at an email or all my emails from this morning and have ' +
        'it tell me which ones are important and which ones are not and ' +
        'prepare a draft for me to review before it gets sent.',
    );
  });

  it('takes the LONGEST opener, not the first one that matches', () => {
    // "I would like to" also matches here. Taking it would leave "be able to
    // draft..." — still a wish, and now a broken one.
    expect(asOrder('I would like to be able to draft my Monday status update')).toBe(
      'Draft my Monday status update',
    );
  });

  it.each([
    ['I want to summarise the standup notes every morning', 'Summarise'],
    ["I'd like to review the pull requests before I merge them", 'Review'],
    ['I need to pull together a weekly report for the client', 'Pull'],
    ['Can you help me write a follow-up to the vendor email', 'Help'],
    ['Please clean up the notes from yesterday and file them', 'Clean'],
    ['It would be nice if you could find the invoices I missed', 'Find'],
    ['My goal is to cut the time I spend triaging support mail', 'Cut'],
  ])('strips %j and capitalises what is left', (input, firstWord) => {
    const out = asOrder(input);
    expect(out).not.toBeNull();
    expect(out?.split(' ')[0]).toBe(firstWord);
  });

  it('treats a curly apostrophe the same as a straight one', () => {
    expect(asOrder('I’d like to draft my Monday status update')).toBe(
      'Draft my Monday status update',
    );
  });

  it('is case-insensitive about the opener but keeps the rest verbatim', () => {
    expect(asOrder('I WOULD LIKE TO draft the Q3 summary for Priya')).toBe(
      'Draft the Q3 summary for Priya',
    );
  });

  describe('says nothing rather than something wrong', () => {
    it('leaves a sentence that is ALREADY an order completely alone', () => {
      expect(asOrder('Draft my Monday status update the way I would write it')).toBeNull();
    });

    it('leaves text with no opener on the list alone', () => {
      expect(asOrder('Every morning the standup notes need pulling together')).toBeNull();
    });

    it('stays quiet while somebody is still typing the first clause', () => {
      expect('I want to draft'.length).toBeLessThan(ORDER_HINT_MIN_CHARS);
      expect(asOrder('I want to draft')).toBeNull();
    });

    it('stays quiet when stripping would leave a fragment', () => {
      // Long enough to pass the threshold, nothing left worth suggesting.
      expect(asOrder('Please. Please. Please. Please. Please.')).toBeNull();
    });

    it('never opens a suggestion on punctuation', () => {
      expect(asOrder('I want to, you know, get the morning email thing sorted')).toBeNull();
    });

    it('ignores a hedge that is not at the START', () => {
      // The opener has to be the opener. A hedge in the middle of a real
      // order is just how the sentence goes.
      expect(asOrder('Draft the note I would like to send to the whole team')).toBeNull();
    });

    it('does not fire on an empty or whitespace answer', () => {
      expect(asOrder('')).toBeNull();
      expect(asOrder('       ')).toBeNull();
    });
  });

  it('is idempotent — running it on its own output changes nothing', () => {
    const once = asOrder('I would like to draft my Monday status update for the team');
    expect(once).not.toBeNull();
    expect(asOrder(once as string)).toBeNull();
  });
});
