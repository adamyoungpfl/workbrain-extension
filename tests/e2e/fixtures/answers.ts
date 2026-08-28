import { contextModules } from '../../../src/core/flow/flow';
import type { Answers } from '../../../src/schema/storage.types';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../../src/schema/flow.types';

/**
 * BR-02 — a FINISHED Context file, shared.
 *
 * Three specs (skills-share, proof, drawer-chrome) each grew their own copy of
 * this fold, because the Skills row unlocks only for a built-and-earned
 * Context (`core/files/slots.ts`) and nothing shorter will do. This is the
 * fourth caller, and the point at which one copy is cheaper than four.
 *
 * The three existing copies are deliberately left alone: they are green, and
 * rewriting three passing specs to prove a point about duplication is how a
 * defect fix turns into a refactor. Any NEW caller uses this one.
 *
 * Everything gets a REAL answer, deliberately: a skip keeps its section
 * `partly`, and `fileFinished` — the Skills row's lock — demands none left.
 */
const NOW = '2026-08-26T12:00:00.000Z';

export function finishedContext(): Answers {
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  let roleNamesStep: Step | undefined;
  let rolesBlock: RepeatableBlock | undefined;
  const stamp = (key: string, value: AnswerValue) => {
    values[key] = value;
    answeredAt[key] = NOW;
    if (typeof value === 'string') reflectedAt[key] = NOW;
  };
  for (const module of contextModules as Module[]) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        if (node.id === 'roles') rolesBlock = node;
        continue;
      }
      const step = node;
      const key = step.key ?? step.id;
      // Everything gets a REAL answer: a skip keeps its section 'partly'
      // and fileFinished (the Skills row's lock) demands no partly left.
      if (step.id === 'entities_gate' || step.id === 'initiatives_gate') stamp(key, 'no');
      else if (step.id === 'role_names') {
        roleNamesStep = step;
        stamp(key, (step.options ?? []).slice(0, 1).map((o) => o.v));
      } else if (step.kind === 'intro') stamp(key, null);
      else if (step.kind === 'yesno') stamp(key, 'yes');
      else if (step.kind === 'chips') stamp(key, step.options?.[0]?.v ?? 'x');
      else if (step.kind === 'multi') stamp(key, step.options?.length ? [step.options[0]!.v] : []);
      else stamp(key, `A test answer for ${step.id}.`);
    }
  }
  if (rolesBlock && roleNamesStep) {
    const picks = values[roleNamesStep.key ?? roleNamesStep.id] as string[];
    repeatables[rolesBlock.id] = picks.map((v) => {
      const label = roleNamesStep!.options?.find((o) => o.v === v)?.l ?? v;
      const record: Record<string, AnswerValue> = { [rolesBlock!.seedFrom!.seedField]: label };
      for (const field of rolesBlock!.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A test answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[rolesBlock.id]!.forEach((record, ri) => {
      for (const fk of Object.keys(record)) {
        answeredAt[`${rolesBlock!.id}#${ri}#${fk}`] = NOW;
        reflectedAt[`${rolesBlock!.id}#${ri}#${fk}`] = NOW;
      }
    });
  }
  return { values, repeatables, answeredAt, reflectedAt };
}
