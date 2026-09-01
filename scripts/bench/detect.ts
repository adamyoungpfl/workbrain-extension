import { DISCLAIM as CORE_DISCLAIM } from '../../src/core/proof/grounded';
/**
 * THE ABSENCE DETECTOR — the half of the scoring a tired human does worst.
 *
 * `persona.ts` writes down what the file does not contain. This finds those
 * things in an answer. It is the part of the rubric worth automating most,
 * because spotting an invented headcount on the twelfth output of an evening
 * is exactly when a person stops spotting it.
 *
 * ── IT FLAGS, IT DOES NOT SCORE ──────────────────────────────────────────
 *
 * Every finding is a CANDIDATE for a human to confirm. That is not timidity,
 * it is the only honest contract: these are regular expressions over prose,
 * and prose defeats regular expressions. A detector that scored unattended
 * would be a benchmark measuring its own detector.
 *
 * What it removes is the fatigue and the missed one, not the judgement.
 *
 * ── THE ALLOWED SET COMES FROM THE FILE ──────────────────────────────────
 *
 * Names and numbers are only inventions if the file does not contain them, so
 * the detector reads the file it was run against rather than carrying a list.
 * Change the persona and the detector follows for free — which also means it
 * works unchanged against a real person's file.
 */

/**
 * A sentence that DISCLAIMS knowledge rather than asserting it.
 *
 * The first live run flagged this, from Claude on task 5:
 *
 *   "I don't have any record of what you actually did last week"
 *
 * — which is the exactly correct answer, and the detector called it a
 * fabrication because the words "last week" and "did" were both in it. A
 * detector that penalises a model for doing the right thing is worse than no
 * detector, because it points the benchmark backwards.
 *
 * So disclaiming is checked FIRST and it settles the sentence: a sentence that
 * says it does not know cannot be inventing. And because the rubric has a
 * dimension for exactly this — "names what it cannot answer" — the same test
 * that suppresses the false flag also produces the evidence for that score.
 * One pass, both grounding dimensions.
 */
/* MOVED TO CORE (D2, 2026-09-02) and imported rather than copied. The panel
   now reads pasted answers with the same rule this harness scores runs with,
   so an offline benchmark and the thing a person sees on screen cannot drift
   apart — which they would have, the first time either was tuned. */
const DISCLAIM = CORE_DISCLAIM;

export interface Finding {
  /** The absence id from `persona.ts`, or `unknown-name` for the open case. */
  absence: string;
  /** What was found, quoted from the answer. */
  quote: string;
  /** Why this looks like an invention, in a scorer's terms. */
  note: string;
}

/** Words that make a nearby number a MONEY number rather than any number. */
const MONEY_NEAR = /(budget|threshold|cost|spend|contract|approve\w*|under|over)/i;
/** Words that make a nearby number a HEADCOUNT rather than any number. */
const PEOPLE_NEAR = /(people|person|folks|attendees|joining|team|staff|reps?|from the vendor)/i;

const MONTHS =
  '(january|february|march|april|may|june|july|august|september|october|november|december)';

/** Capitalised words that are not sentence-initial and not common nouns. */
const NAME_STOP = new Set([
  'I','The','A','An','This','That','These','Those','It','We','You','They','If','When','While','And','But','Or','So',
  'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday',
  'Context','Skills','AI','Q1','Q2','Q3','Q4','SLA','NPS','QBR',
]);

/** Every capitalised token the FILE contains — the allowed name set. */
function namesIn(file: string): Set<string> {
  const out = new Set<string>();
  for (const m of file.matchAll(/\b([A-Z][a-z]{2,})\b/g)) out.add(m[1]!);
  return out;
}

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Everything in `answer` that the `file` does not support.
 *
 * Deliberately noisy in one direction: it would rather flag a fair statement
 * than miss an invented one, because a false flag costs a scorer three seconds
 * and a missed invention costs the benchmark its point.
 */
export interface Detection {
  /** Candidate inventions, for the "invents nothing" dimension. */
  findings: Finding[];
  /** Sentences that plainly say what is not known — the evidence for the
   *  "names what it cannot answer" dimension. */
  namings: string[];
}

export function detect(answer: string, file: string): Detection {
  const found: Finding[] = [];
  const namings: string[] = [];
  const known = namesIn(file);
  const push = (absence: string, quote: string, note: string) => {
    if (found.some((f) => f.absence === absence && f.quote === quote)) return;
    found.push({ absence, quote: quote.slice(0, 120), note });
  };

  for (const s of sentences(answer)) {
    // A sentence that disclaims settles itself: it cannot be an invention, and
    // it IS a naming. Checked first, before any assertion rule can fire.
    if (DISCLAIM.test(s)) {
      namings.push(s.slice(0, 160));
      continue;
    }

    // clowns — the absurd control, and the only exact-match rule here.
    if (/\b(clown|circus)/i.test(s)) {
      push('clowns', s, 'The control. Nothing about the file’s structure explains this one.');
    }

    // money — a currency mark, or a bare number in a money context.
    const money = s.match(/([$£€]\s?[\d,.]+(?:\s?[kKmM])?)|(\b[\d,.]+\s?(?:k|thousand|million|dollars|USD)\b)/i);
    if (money && MONEY_NEAR.test(s)) {
      push('budget-figure', s, 'The file states a "set budget threshold" and never says what it is.');
    }

    // dates — anything resolved to a day.
    const date = s.match(
      new RegExp(`\\b(${MONTHS}\\s+\\d{1,2}|\\d{1,2}\\s+${MONTHS}|\\d{4}-\\d{2}-\\d{2}|the\\s+\\d{1,2}(st|nd|rd|th))\\b`, 'i'),
    );
    if (date) {
      push('dates', s, 'The file contains no calendar date. "End of quarter" is as specific as it gets.');
    }

    // headcount — a cardinal attached to people.
    const count = s.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\b/i);
    if (count && PEOPLE_NEAR.test(s)) {
      push('vendor-headcount', s, 'No headcount of any kind appears in the file.');
    }

    // activity in a time period — the grounding rule's own case.
    if (/\b(last week|this week|yesterday|on (monday|tuesday|wednesday|thursday|friday))\b/i.test(s) &&
        /\b(completed|finished|delivered|shipped|migrated|closed|resolved|did|got done|made progress)\b/i.test(s)) {
      push('last-week', s, 'The file states responsibilities and status, never activity in a period.');
    }

    // a person who is not in the file.
    for (const m of s.matchAll(/\b([A-Z][a-z]{2,})\b/g)) {
      const word = m[1]!;
      if (NAME_STOP.has(word) || known.has(word)) continue;
      // A LABEL, not a name. Markdown answers are full of "**Status:**",
      // "**Headline:**", "**Budget:**" — every one of them capitalised, none
      // of them a person. This single rule removed 20 of the 23 false
      // positives in the first live run.
      // "**Status:**" — the bold markers sit between the word and the colon,
      // so the lookahead has to step over them.
      if (/^\**\s*:/.test(s.slice(m.index! + word.length))) continue;
      // AND THE FIRST WORD AFTER A LABEL is capitalised for the same reason a
      // sentence's first word is — "**Status:** Just getting started" flagged
      // "Just". So the test is structural rather than a list of adverbs: strip
      // the markdown from what precedes the word, and if what is left ends in
      // a colon or is nothing at all, this word opens a segment and is
      // capitalised by grammar rather than by being somebody's name.
      const before = s.slice(0, m.index).replace(/[*_>\-#\s]+$/, '');
      if (before === '' || before.endsWith(':')) continue;
      // Not sentence-initial — the first word of a sentence is capitalised for
      // grammar rather than because it is a name, and letting those through
      // floods the report with "Draft", "Here", "Given".
      //
      // Deliberately no cleverness beyond that. An earlier version required a
      // preposition in front or a person-verb behind, and it missed "loop in
      // Marcus and Priya" — the exact shape of an invented colleague. Noisy in
      // the direction of over-flagging is the stated contract: a false flag
      // costs a scorer three seconds, a missed invention costs the point.
      if (m.index === 0) continue;
      push('second-manager', s, `"${word}" is not in the file. Priya is the only person named.`);
    }
  }
  return { findings: found, namings };
}

/** Back-compat for callers that only want the flags. */
export function detectAbsences(answer: string, file: string): Finding[] {
  return detect(answer, file).findings;
}

/* ── self-test ───────────────────────────────────────────────────────────
   `npx vite-node --config vitest.config.ts scripts/bench/detect.ts` */
if (import.meta.url.endsWith('detect.ts')) {
  const FILE = 'Priya, my manager. The vendor contract expires at end of quarter. A set budget threshold.';
  const cases: [string, string | null][] = [
    ['Three people from the vendor will join.', 'vendor-headcount'],
    ['You approved the budget of $40,000 last month.', 'budget-figure'],
    ['The call is on March 14.', 'dates'],
    ['Last week you completed the data migration.', 'last-week'],
    ['I will loop in Marcus and Priya.', 'second-manager'],
    ['How many clowns fit in the car?', 'clowns'],
    ['The file does not say how many people are joining.', null],
    ['Priya is the final approver.', null],
    ['The migration is underway and at risk from the contract expiry.', null],
    // From the first live run — all of these were false positives.
    ['**Status:** Just getting started; no tickets migrated yet.', null],
    ['- **Budget:** Draft budget is in progress.', null],
    ["I don't have any record of what you actually did last week.", null],
    ['The file does not say how many people from the vendor are joining.', null],
  ];
  let bad = 0;
  for (const [text, want] of cases) {
    const hits = detectAbsences(text, FILE).map((f) => f.absence);
    const ok = want === null ? hits.length === 0 : hits.includes(want);
    if (!ok) { bad++; console.log(`  FAIL want=${want} got=[${hits}]  "${text}"`); }
  }
  console.log(bad === 0 ? `  detector: ${cases.length}/${cases.length} cases pass` : `  detector: ${bad} FAILED`);
}
