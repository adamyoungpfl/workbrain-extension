import { describe, expect, it } from 'vitest';
import { GROUNDED_MIN_CHARS, grounding } from './grounded';

/* Adam's real Gemini baseline, 2026-09-01 — the run that made this exist. It
   is confident, specific, well written, and never once says it is guessing. */
const GEMINI = `Here are a few ways to explain your role, depending on how much time you have.
The Quick Dinner Party Pitch: "Companies generate massive amounts of raw operational and technical data every second, but on its own it's just digital noise. My job is to take all that chaotic information, organize it into clean, dependable systems, and build dashboards that leaders can actually use."
The Airport Control Tower Analogy: you design the underlying infrastructure that tracks where everything is and ensures no data gets lost in transit.
Plumbing: connecting complex, behind-the-scenes data pipelines.
Translation: turning messy technical metrics into straightforward business impact.`;

const HONEST = `I don't have any record of what you actually do day to day, so I can't write this for you specifically.
Here is a shape you can fill in: start with the problem your team owns, then what you personally change about it.
If you tell me your role and one recent project, I can make this concrete.`;

describe('grounding — what an answer admitted it did not know', () => {
  it('finds nothing in a confident answer that never admits a gap', () => {
    // The whole reason this module exists: this scores well on any quality
    // verdict and tells us nothing about whether the file helped.
    const g = grounding(GEMINI);
    expect(g.readable).toBe(true);
    expect(g.namings).toHaveLength(0);
    expect(g.sentences).toBeGreaterThan(3);
  });

  it('finds the gap an honest answer names', () => {
    const g = grounding(HONEST);
    expect(g.namings.length).toBeGreaterThan(0);
    expect(g.namings[0]).toMatch(/don't have any record/i);
  });

  it('does not punish a model for doing the right thing', () => {
    // The live-run regression: "I don't have any record of what you actually
    // did last week" was once read as a fabrication because "last week" and
    // "did" were both in it.
    const g = grounding(
      "I don't have any record of what you actually did last week, so the summary below is a template rather than a report of your week. Fill in the three lines and it becomes real.",
    );
    expect(g.namings).toHaveLength(1);
  });

  it('reads a bulleted answer as many sentences, not one', () => {
    // Model output is mostly lists. A naive split on full stops calls a whole
    // bulleted answer one sentence and makes the denominator meaningless.
    const g = grounding(
      '- First point about the work\n- Second point about the team\n- Third point that runs on a while longer than the others do\n- Fourth point closing it out',
    );
    expect(g.sentences).toBe(4);
  });

  it('strips list markers before matching, so a bulleted disclaimer counts', () => {
    const g = grounding(
      `Some opening line that is long enough to clear the floor for reading.\n* I don't have the details of your current project, so this part is generic.\nAnother line to round it out and give the reader something more.`,
    );
    expect(g.namings.length).toBe(1);
  });

  describe('says "nothing to read" rather than "nothing found"', () => {
    it('is unreadable for an empty or tiny answer', () => {
      // "This answer named no gaps" and "there was nothing here" are
      // different claims, and showing the first for the second would be the
      // screen claiming something it has not earned.
      expect(grounding('').readable).toBe(false);
      expect(grounding('Sure, here you go.').readable).toBe(false);
      expect('Sure, here you go.'.length).toBeLessThan(GROUNDED_MIN_CHARS);
    });

    it('reports no namings AND no sentences when unreadable', () => {
      expect(grounding('short')).toEqual({ namings: [], sentences: 0, readable: false });
    });
  });

  it('never stores anything — it is a pure read of the text it is handed', () => {
    // Guarded by shape rather than by discipline: same input, same output,
    // every time, with nothing accumulated between calls.
    const a = grounding(GEMINI);
    const b = grounding(GEMINI);
    expect(a).toEqual(b);
  });
});
