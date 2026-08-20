/**
 * A verbatim snapshot of the literal, always-emitted prose from
 * `generateContextFile()` in
 * ../modelcitizen/src/lib/contextInterviewFlow.ts (source lines
 * 1420-1447, read in full at port time — see R1-09 in docs/RELEASE-1.md
 * and its rows in docs/CONTENT-SOURCES.md). Each string below was
 * extracted mechanically via `sed -n '<line>p'`, not retyped, then
 * pasted here — the same guarantee source.ts's sibling in core/flow/
 * gives the flow data.
 *
 * This is NOT a port of generateContextFile()'s logic — that logic
 * (renderFileSection, renderRepeatableRecord, formatAnswerValue, and the
 * ALL_QUESTIONS_BY_ID / QUESTION_TO_REPEATABLE_BLOCK /
 * REPEATABLE_BLOCKS_BY_ID indices it's built on) is re-implemented in
 * generate.ts against this repo's own already-adapted Module/Step/
 * FileOutlineNode schema (src/schema/flow.types.ts) — the source's
 * `id`/`type`/`options[].key`/`options[].label` fields don't exist on
 * that schema (this repo's adapter.ts already renamed them to
 * `id`/`kind`/`options[].v`/`options[].l`), so a byte-verbatim copy of
 * the *function bodies* wouldn't even type-check. Only what the source
 * emits as fixed, unconditional literal text is copied here; the
 * question-by-question rendering is genuinely reimplemented, tested
 * separately against real ported content in generate.test.ts.
 *
 * NOT hand-edited — any wording fix belongs upstream in modelcitizen,
 * then re-ported.
 */

/** Source line 1437 — the file's own top heading, always the first line
 * of a generated file. */
export const FILE_TITLE = '# Context.md';

/** Source line 1439 — the line immediately under the title.
 * `generatedOn` is interpolated the same way the source interpolates it. */
export function fileIntroLine(generatedOn: string): string {
  return `_Generated ${generatedOn} from a Work Brain Context Interview — nothing in this file ever left the browser it was created in._`;
}

/** Source line 1443 — heading over the always-included closing rule. */
export const GROUNDING_RULE_HEADING = '## System Grounding Rule';

/** Source lines 1424-1425 (declaration). The always-included closing rule
 * (Adam's ask, from the original planning session: "the always-included
 * system grounding rule... appended regardless of what the user says").
 * Must be byte-identical per docs/CONTENT-SOURCES.md's R1-09 row and
 * docs/RELEASE-1.md's accept line — generate.test.ts asserts this against
 * an independently hand-typed copy of the source read, not against this
 * constant, so a mis-copy here would still be caught. */
export const SYSTEM_GROUNDING_RULE =
  "Responsibilities, expertise, and initiative or project membership described above establish scope and capability — they are not proof that a specific activity occurred in a given time period. When asked about specific work, verify against actual records rather than assuming based on role.";
