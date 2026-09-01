import { Fragment } from 'react';
import './DeclarationLine.css';

/**
 * V2.9 — the note under the baseline box, turning from a disclaimer into a
 * declaration (Adam, 2026-09-01).
 *
 * "One thing, in your own words. You will run exactly this, so ask for
 * something it can finish." sits under the box in the grey every hint in this
 * product is set in — advice, easily skipped, and true. The moment somebody
 * starts typing it stops being advice and becomes the terms of what is about
 * to happen: the sentence they are writing IS what gets sent. So the line
 * lights, letter by letter, left to right and down.
 *
 * ── WHY PER CHARACTER AND NOT A GRADIENT SWEEP ────────────────────────────
 * A `background-clip: text` sweep — the technique the seed examples use — runs
 * across the element's box, so on a two-line paragraph BOTH lines light at
 * once. That is not reading order, and reading order is the whole effect: the
 * line should turn the way somebody reads it. Only a per-character delay does
 * that, because only the characters know where they are in the sentence.
 *
 * ── WHY IT NEVER MOVES A PIXEL ────────────────────────────────────────────
 * "Bolder" is done with `-webkit-text-stroke`, not `font-weight`. Weight
 * changes glyph metrics, so a staggered weight animation would reflow the
 * paragraph under itself ninety times and could rewrap the second line
 * mid-sweep. A stroke thickens the glyph inside its own advance width: the
 * text gets heavier and nothing moves.
 *
 * ── ACCESSIBILITY ─────────────────────────────────────────────────────────
 * Splitting a sentence into ninety spans is a well-known way to make a screen
 * reader read it as ninety fragments. The split run is `aria-hidden` and the
 * real sentence is carried, whole, by a visually-hidden sibling. Assistive
 * technology gets one sentence; the screen gets the animation.
 *
 * Under `prefers-reduced-motion` the stagger and the transition are both off
 * and the lit state applies at once. The meaning survives — the line still
 * changes from advice to terms at the moment typing starts — with no motion
 * at all, which is the floor docs/GUARDRAILS.md sets.
 */

/** Between one character lighting and the next. Ninety characters at 8ms is a
 *  sweep of about three quarters of a second: fast enough to read as one
 *  gesture, slow enough to see which way it is going. */
const STEP_MS = 8;

/**
 * THE BEAT (Adam, 2026-09-02): "I just need it to read with the dramatic pause
 * after the one thing sentence."
 *
 * The sweep waits here before starting the next authored line — held in the
 * DELAY rather than in the copy, because a pause written as punctuation is
 * read at whatever speed somebody reads, and this one has to land at the same
 * length every time for the line before it to sit on its own.
 *
 * Worth a third of a second: long enough to register as deliberate, short
 * enough that nobody wonders whether the animation has stopped.
 */
const LINE_BEAT_MS = 320;

export interface DeclarationLineProps {
  text: string;
  /** Latched by the caller: once lit, it stays lit. */
  lit: boolean;
  className?: string | undefined;
}

export function DeclarationLine({ text, lit, className }: DeclarationLineProps) {
  /* AUTHORED LINE BREAKS ARE KEPT (Adam, 2026-09-02). The direction is three
     separate statements — what to write, what happens next, what makes a good
     one — and running them into a paragraph makes them one long sentence
     nobody finishes. Each `\n` is its own line here.

     Within a line, split on WORDS rather than straight into characters, so
     ordinary line breaking still happens at the spaces: a run of
     per-character spans with the spaces inside them wraps in the wrong places
     or not at all.

     The stagger runs across the WHOLE text, not per line, so the sweep keeps
     going down the block in reading order instead of restarting on each. */
  let cursor = 0;
  const lines = text.split('\n').map((line, li) => {
    // The beat is added to the running offset, so every character after it
    // inherits the wait — the pause moves the rest of the block, rather than
    // opening a hole one line long.
    if (li > 0) cursor += LINE_BEAT_MS / STEP_MS;
    return line.split(' ').map((word) => {
      const start = cursor;
      cursor += word.length + 1;
      return { word, start };
    });
  });

  return (
    <p className={[className, 'decl', lit ? 'is-lit' : ''].filter(Boolean).join(' ')}>
      <span className="decl-whole">{text}</span>
      <span aria-hidden="true">
        {lines.map((words, li) => (
          <span className="decl-line" key={li}>
            {words.map(({ word, start }, wi) => (
              <Fragment key={`${start}-${word}`}>
                {wi > 0 ? ' ' : null}
                {[...word].map((ch, ci) => (
                  <span
                    key={ci}
                    className="decl-ch"
                    style={{ transitionDelay: `${Math.round((start + ci) * STEP_MS)}ms` }}
                  >
                    {ch}
                  </span>
                ))}
              </Fragment>
            ))}
          </span>
        ))}
      </span>
    </p>
  );
}
