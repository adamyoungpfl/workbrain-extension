import type { SectionHealth, SectionHealthState, SectionHealthSummary } from '../../core/freshness/sectionHealth';
import { S } from '../strings';
// FileRow's badge, reused rather than restated — see the note below. The
// import is what makes that dependency real instead of an accident of which
// surface happens to be mounted.
import './FileRow.css';
import './SectionHealth.css';

/**
 * V1.3 VB-19 — what a file section's health looks like.
 *
 * **EXTENDS THE BADGE LANGUAGE THIS REPO ALREADY HAS.** Home prints
 * `badgeDue` / `badgeCurrent` through `FileRow`'s `badge={label, tone}` with
 * its fresh / due / next tones; this reuses the same `.badge` rule and the
 * same three tones, adds a tighter size for a 12px drawer, and adds one
 * hollow variant for the fifth state. A second pill vocabulary would mean
 * Home and the drawer could describe the same file in two different visual
 * dialects, which is the specific thing VB-19 exists to avoid.
 *
 * **NOTHING IS DISTINGUISHED BY COLOUR ALONE** (docs/GUARDRAILS.md). Every
 * pill carries three signals, any one of which is enough on its own:
 *
 *   1. a WORD — "Here", "Done", "Due", "Partly", "Not yet";
 *   2. an ASCII GLYPH — `[>]`, `[x]`, `[!]`, `[~]`, `[ ]`;
 *   3. a FILL — tinted for the three that carry weight, flat grey for
 *      "Partly", hollow with a dashed edge for "Not yet".
 *
 * Colour is the fourth signal and the only one that can be removed. The
 * greyscale pass in tests/e2e/section-health.spec.ts is what keeps that true.
 *
 * The glyphs are deliberately ASCII, for the reason FileTree.tsx already
 * documents: `▸` / `▾` render as an all-but-invisible dot in this panel's
 * font stack, which would put the whole signal back on colour. They are also
 * bracketed, matching the tree's own `[ ]` / `[x]` / `[>]` markers — the same
 * family of marks, extended, rather than a new set beside them.
 *
 * Not re-exported from `components/index.ts`, deliberately: these three are
 * `FileTree`'s own parts rather than a surface anybody else composes with, and
 * `FileDrawer.tsx` already sets the precedent of importing such a partner
 * directly (`sectionNodeGradient` from `BrainGlobe`).
 *
 * **STATUS, NOT ACHIEVEMENT.** Every word here says what a section *is*.
 * Nothing counts a run, awards anything, or congratulates: docs/GUARDRAILS.md
 * rules out "streaks, badges, gamification", and VB-19 flags this as the easy
 * line to cross by accident once a list has pills on it.
 */

/** Said out loud. `aria-hidden` on the glyph beside it, because the glyph and
 * the word are the same fact told twice for two different audiences. */
const HEALTH_WORD: Record<SectionHealthState, string> = {
  here: S.sectionStateHere,
  done: S.sectionStateDone,
  due: S.sectionStateDue,
  partly: S.sectionStatePartly,
  // Reused, not restated: the tree already says exactly this, in exactly
  // these words, for exactly this state.
  'not-yet': S.fileTreeStateUntouched,
};

const HEALTH_GLYPH: Record<SectionHealthState, string> = {
  here: '[>]',
  done: '[x]',
  due: '[!]',
  partly: '[~]',
  'not-yet': '[ ]',
};

/** Onto `FileRow`'s existing tones. "Here" takes `next` (the primary tint) —
 * it is where the interview is pointing, which is what that tone means on
 * Home. "Partly" takes the untoned base grey and "Not yet" the hollow
 * variant, so the two states that are merely unfinished never compete with
 * the one that actually needs a decision. */
const HEALTH_TONE: Record<SectionHealthState, string> = {
  here: 'next',
  done: 'fresh',
  due: 'due',
  partly: '',
  'not-yet': 'is-hollow',
};

export interface HealthPillProps {
  state: SectionHealthState;
}

export function HealthPill({ state }: HealthPillProps) {
  return (
    <span className={['badge', 'sectionhealth-pill', HEALTH_TONE[state]].filter(Boolean).join(' ')} data-health={state}>
      <span className="sectionhealth-glyph" aria-hidden="true">
        {HEALTH_GLYPH[state]}
      </span>
      {HEALTH_WORD[state]}
    </span>
  );
}

/**
 * The secondary line: what the pill cannot carry.
 *
 * `8 of 8 · answered 7 months ago` — how much of the section is written, and
 * how long ago. `3 of 6 · 2 skipped` — the same count, and what was passed on.
 *
 * ONE CLAUSE AFTER THE COUNT, NEVER TWO. A skip is the more actionable fact
 * and wins when both are true; stacking them produces a line that wraps in a
 * 400px panel and reads as a paragraph rather than a detail.
 *
 * Null for a section nobody has touched: the pill has already said everything
 * true about it, and a second line saying "0 of 6" would add a row's height
 * to nine-tenths of the list on the first screen anybody sees.
 */
export function healthDetail(health: SectionHealth): string | null {
  if (health.total === 0) return null;
  if (health.answered + health.skipped === 0 && health.state !== 'here') return null;
  const count = S.sectionAnsweredOf(health.answered, health.total);
  const clause = healthFreshness(health);
  return clause ? `${count} · ${clause}` : count;
}

/**
 * V1.8 VB-46 — the clause after the count, on its own.
 *
 * VB-46 moves the count out of this line and into the bundle at the row's
 * right end (components/FileTree.tsx), which leaves the line as the one fact
 * the pill and the counts cannot carry: what was passed on, or how long ago
 * this was written.
 *
 * Split out of `healthDetail` rather than duplicated, and `healthDetail` still
 * calls it: `FileView` (V1.7) prints the whole line, because a row there has no
 * right-hand column to bundle a count into, and the two surfaces must not word
 * the same clause differently.
 *
 * ONE CLAUSE, NEVER TWO — VB-19's rule, unmoved. A skip is the more actionable
 * fact and wins when both are true; stacking them produces a line that wraps in
 * a 400px panel and reads as a paragraph rather than a detail.
 */
export function healthFreshness(health: SectionHealth): string | null {
  if (health.total === 0) return null;
  if (health.answered + health.skipped === 0 && health.state !== 'here') return null;
  if (health.skipped > 0) return S.sectionSkipped(health.skipped);
  if (health.elapsed) {
    return health.ageDays === 0
      ? S.sectionAnsweredToday
      : S.sectionAnsweredAgo(S.agoLabel(health.elapsed.value, health.elapsed.unit));
  }
  return null;
}

export interface HealthSummaryProps {
  summary: SectionHealthSummary;
}

/**
 * The counts across the top of the list.
 *
 * **WHY THIS EXISTS AT ALL.** VB-19 fixes the rows in FILE ORDER, because the
 * list *is* the file and resorting it by urgency would stop it matching the
 * thing it represents. That decision is only affordable because these counts
 * do the "what needs attention" job instead.
 *
 * So it prints what needs attention and nothing else: due, then partly, then
 * not yet, each only when there is one. When none of the three has anything
 * in it, the file is genuinely finished and current, and it says so once —
 * as a count of sections, not as praise.
 *
 * `badgeDue` is Home's own string, reused, so "2 due" means the same thing
 * and reads the same way in both places.
 */
export function HealthSummary({ summary }: HealthSummaryProps) {
  const pills: { state: SectionHealthState; label: string }[] = [];
  if (summary.due > 0) pills.push({ state: 'due', label: S.badgeDue(summary.due) });
  if (summary.partly > 0) pills.push({ state: 'partly', label: S.sectionSummaryPartly(summary.partly) });
  if (summary.notYet > 0) pills.push({ state: 'not-yet', label: S.sectionSummaryNotYet(summary.notYet) });
  // Nothing to come back to and nothing left to start: the file is finished
  // and current. It says how many sections are done — the section being
  // written is not one of them, so it is not counted here.
  if (pills.length === 0) pills.push({ state: 'done', label: S.sectionSummaryDone(summary.done) });

  return (
    <div className="sectionhealth-summary" role="group" aria-label={S.sectionSummaryLabel}>
      {pills.map((pill) => (
        <span
          key={pill.state}
          className={['badge', 'sectionhealth-pill', HEALTH_TONE[pill.state]].filter(Boolean).join(' ')}
          data-health-summary={pill.state}
        >
          <span className="sectionhealth-glyph" aria-hidden="true">
            {HEALTH_GLYPH[pill.state]}
          </span>
          {pill.label}
        </span>
      ))}
    </div>
  );
}
