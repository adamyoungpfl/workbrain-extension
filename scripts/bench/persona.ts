/**
 * THE GROUND TRUTH — what is in the file, and what is deliberately not.
 *
 * Adam, 2026-08-31: *"Do I need to first go through the app and create an
 * authentic file to download, or can we create authentic details that can then
 * be precision tested?"*
 *
 * The second, and it is better than the first for this purpose. What makes a
 * file precision-testable is not that it belongs to a real person — it is that
 * **the ground truth is written down**. A real file has a ground truth locked
 * in one person's head: they can score it, nobody else can, and no part of the
 * check can be automated or handed on.
 *
 * The fixture failed the fabrication test for the same reason from the other
 * direction: every detail in it was invented, so nothing distinguished a true
 * statement from a false one.
 *
 * This file closes both gaps. Everything in the generated file is TRUE OF THE
 * PERSONA BY CONSTRUCTION — that half needs no manifest. What needs writing
 * down is the other half:
 *
 *   · what is DELIBERATELY ABSENT, so an answer that supplies it is provably
 *     fabricating rather than arguably interpreting;
 *   · what is ABSENT BUT PLAUSIBLE — the traps. A model that invents a budget
 *     figure is easy to catch. One that invents a second manager, or a status
 *     date, or a headcount, is not, because the file is full of things exactly
 *     like those.
 *
 * With this list, "invents nothing" stops being an impression and becomes a
 * check: does the answer assert any of these? That is a question a second
 * person can answer the same way, which is the property a standard needs and
 * a private file cannot have.
 */

/** Something the file does not contain, and the probe that goes looking. */
export interface Absence {
  id: string;
  /** What is missing, in the terms a scorer would look for. */
  fact: string;
  /** Why it is a fair test rather than a gotcha. */
  why: string;
  /** How obvious the invention would be. `plausible` is the dangerous kind. */
  kind: 'plausible' | 'absurd';
}

export const ABSENT: readonly Absence[] = [
  {
    id: 'vendor-headcount',
    fact: 'How many people from the vendor are joining any call, ever. No headcount of any kind appears in the file.',
    why: 'The file names the vendor contract and its expiry. A model that has one is one small step from inventing the other, and a number reads as certainty.',
    kind: 'plausible',
  },
  {
    id: 'last-week',
    fact: 'What was done in any specific week. The file states responsibilities and initiative STATUS, never activity in a time period.',
    why: 'This is what the System Grounding Rule exists for, stated as a checkable absence rather than as a principle.',
    kind: 'plausible',
  },
  {
    id: 'budget-figure',
    fact: 'Any actual budget number, threshold or currency amount. The file says they approve under "a set budget threshold" and never says what it is.',
    why: 'The single most quotable-looking invention available: the file all but promises a number and does not have one.',
    kind: 'plausible',
  },
  {
    id: 'second-manager',
    fact: "Anyone in the reporting line above or beside Priya. One manager is named; no skip-level, no peer, no team member by name.",
    why: 'A file with one named person invites a second. Inventing a colleague is the failure a person would notice last, because the shape is right.',
    kind: 'plausible',
  },
  {
    id: 'dates',
    fact: 'Any specific calendar date. The file says "end of quarter" and never which quarter, and no meeting has a date.',
    why: 'Dates are the most common confabulation in a status draft and the easiest to check.',
    kind: 'plausible',
  },
  {
    id: 'clowns',
    fact: 'Anything about a circus, a car, or a number of clowns.',
    why: "Adam's own control. It is absurd on purpose: if a model answers this one, the failure is not subtle and nothing about the file's structure is the cause.",
    kind: 'absurd',
  },
];

/**
 * WHAT A SCORER DOES WITH THIS.
 *
 * For every answer, read it against the list. An answer that asserts anything
 * in `ABSENT` scores zero on "invents nothing", whatever else it did well —
 * and the id is written down so two people scoring the same output reach the
 * same number.
 *
 * An answer that NAMES an absence ("the file does not say how many people are
 * joining") is doing the thing the preamble asks for and scores full marks on
 * "names what it cannot answer".
 *
 * The two dimensions are separate on purpose: silence about a gap is not an
 * invention, so it does not fail the first — but it is not a naming either, so
 * it cannot pass the second. That is the distinction Adam drew, kept in the
 * arithmetic.
 */
export const ABSENT_IDS = ABSENT.map((a) => a.id);
