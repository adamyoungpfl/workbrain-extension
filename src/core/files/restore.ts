import type { Answers } from '../../schema/storage.types';
import type { AnswerValue, Module, Step } from '../../schema/flow.types';
import { contextModules } from '../flow/flow';
import { buildFlowLookups, keyOf } from './lookups';
import type { ParsedAnswers } from './parse';

/**
 * Turns what `parseContextFile()` read back (R1-09's `values`/`repeatables`
 * only — see roundtrip.test.ts's header comment: the file format has no
 * representation for `answeredAt`/`reflectedAt`) into the full `Answers`
 * shape `wb:answers` actually needs, for R1-10's import.
 *
 * Three things a naive "just spread `values`/`repeatables` in, leave the
 * timestamp maps empty" version would get wrong:
 *
 * 1. `answeredAt` — every restored key needs a stamp, or docs/ARCHITECTURE.md's
 *    freshness clocks (R1-12+) would treat a just-imported answer as never
 *    answered. `importedAt` is used uniformly; the file can't tell us when
 *    each individual answer was first given, only that all of them are true
 *    as of this import.
 * 2. `reflectedAt` — core/flow/runner.ts's `findPosition` sends a text
 *    question with `interpret` set back through the reflect screen whenever
 *    its key is missing from `reflectedAt` (see runner.ts's `actionFor`).
 *    Every restored value already went through reflect once, in whatever
 *    session produced the exported file — generate.ts writes a question's
 *    *final*, already-reflected value, never an intermediate one. Without
 *    stamping `reflectedAt` here too, importing a file would send the
 *    person back through "Keep it as-is / Tighten it" for every one of
 *    those questions, which is not what "restore my answers" means.
 *    Stamped only for keys that are actually `text` + `interpret` + a typed
 *    (non-null) value — matching `actionFor`'s own condition exactly, so a
 *    stray reflectedAt entry never gets left on a key that could never have
 *    needed one.
 * 3. `intro`/`yesno` top-level questions — generate.ts's `renderFileSection`
 *    never writes either kind to the file at all (mirrors the ported
 *    source; see roundtrip.test.ts's header comment), so `parsed.values`
 *    can never contain them, regardless of what was actually answered.
 *    Left alone, `core/flow/runner.ts`'s `findPosition` reads an absent key
 *    as "never reached" and sends a just-imported "done" interview all the
 *    way back to its very first intro screen — discovered by this task's
 *    own e2e test (tests/e2e/download-import.spec.ts), not written into the
 *    brief: a real, live bug, not a hypothetical. Two different, safe
 *    inferences close the gap without guessing at anything the file can't
 *    actually support:
 *      - `intro` never carries content — every intro step's own value is
 *        always `null` (an intro can only ever be "seen", via
 *        `applySkip`), so every intro step not already in `parsed.values`
 *        is safely filled in as `null`.
 *      - `yesno` in the real, current data exists only as a repeatable's
 *        gate. Which block a gate governs is now stated outright, by
 *        `RepeatableBlock.gateQuestionId` (V2.0 VB-61/VB-63 — see
 *        `blockIdsByGateQuestion` below for the naming-convention guess it
 *        replaced, and the live bug that guess had been causing since R1-10).
 *        Whether the block has any restored records is a sound proxy for
 *        what the gate must have been (a "done" interview cannot have
 *        answered "yes" and produced zero records — reaching "done" means
 *        every field of every record, even an explicitly skipped one, got
 *        an entry — see generate.ts's `formatAnswerValue`, which still
 *        renders a skipped field's marker rather than dropping the record).
 *        A `yesno` question no block claims is left alone rather than
 *        guessed at; none exists in real content today.
 *
 * Pure — no chrome.*, no DOM (see CLAUDE.md's core purity rule). `modules`
 * defaults to the real ported flow and is only ever overridden in tests,
 * matching generate.ts/parse.ts's own pattern.
 */

/** Mirrors core/flow/runner.ts's private `compoundKey` exactly (not
 * imported — it isn't exported, and duplicating a one-line convention is
 * cheaper than exporting a runner-internal for one caller; lookups.ts's
 * `keyOf` comment makes the same call for the same reason). */
function compoundKey(blockId: string, recordIndex: number, key: string): string {
  return `${blockId}#${recordIndex}#${key}`;
}

function needsReflectStamp(step: Step | undefined, value: AnswerValue): boolean {
  return !!step && step.kind === 'text' && !!step.interpret && typeof value === 'string';
}

/**
 * Which block each gate question governs — read off `gateQuestionId`, which
 * the flow now states outright (schema/flow.types.ts, set by
 * core/flow/overrides.ts).
 *
 * THE BUG THIS REPLACED, because it is worth not re-introducing. This used to
 * slice `_gate` off the question's id and look for a block by what was left.
 * That is right for `entities_gate` -> `entities` and has been WRONG since
 * R1-10 for `initiatives_gate`, whose block is `initiatives_records`: no block
 * ever matched, the record count read as zero, and every imported file came
 * back with `initiatives_gate: "no"` however many initiatives it held. Under
 * V2.0 VB-63 that "no" is permanent and takes a REQUIRED block out of the
 * interview, so a person importing their own file would find their initiatives
 * unreachable — docs/GUARDRAILS.md's "never lose an answer silently" by way of
 * a naming coincidence. This file's own header called the explicit field the
 * real fix and put it out of scope; VB-63 brought it back into scope.
 *
 * A gate with no block claiming it is left alone rather than guessed at.
 */
function blockIdsByGateQuestion(modules: Module[]): Map<string, string> {
  const byGate = new Map<string, string>();
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node && node.gateQuestionId) byGate.set(node.gateQuestionId, node.id);
    }
  }
  return byGate;
}

/** Fills in the `intro`/`yesno` gap described in this file's header comment
 * (point 3) — mutates `values` in place, since it's only ever called on the
 * fresh, local copy `buildImportedAnswers` builds below. */
function fillUnwritableTopLevelGaps(
  modules: Module[],
  values: Record<string, AnswerValue>,
  repeatables: Record<string, Record<string, AnswerValue>[]>,
): void {
  const gatedBlockIds = blockIdsByGateQuestion(modules);
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) continue; // repeatable blocks have no top-level key of their own
      const key = keyOf(node);
      if (key in values) continue;

      if (node.kind === 'intro') {
        values[key] = null;
        continue;
      }
      if (node.kind === 'yesno') {
        const gatedBlockId = gatedBlockIds.get(node.id);
        if (gatedBlockId === undefined) continue; // nothing claims this gate — leave it rather than guess
        values[key] = (repeatables[gatedBlockId]?.length ?? 0) > 0 ? 'yes' : 'no';
      }
    }
  }
}

export function buildImportedAnswers(parsed: ParsedAnswers, importedAt: string, modules: Module[] = contextModules): Answers {
  const lookups = buildFlowLookups(modules);
  const stepByKey = new Map<string, Step>();
  for (const step of lookups.stepsById.values()) stepByKey.set(keyOf(step), step);

  const values = { ...parsed.values };
  fillUnwritableTopLevelGaps(modules, values, parsed.repeatables);

  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};

  for (const [key, value] of Object.entries(values)) {
    answeredAt[key] = importedAt;
    if (needsReflectStamp(stepByKey.get(key), value)) reflectedAt[key] = importedAt;
  }

  for (const [blockId, records] of Object.entries(parsed.repeatables)) {
    records.forEach((record, recordIndex) => {
      for (const [key, value] of Object.entries(record)) {
        const compound = compoundKey(blockId, recordIndex, key);
        answeredAt[compound] = importedAt;
        if (needsReflectStamp(stepByKey.get(key), value)) reflectedAt[compound] = importedAt;
      }
    });
  }

  return { values, repeatables: parsed.repeatables, answeredAt, reflectedAt };
}
