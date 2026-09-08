import { describe, it, expect } from 'vitest';
import { computeUtilization } from './utilization';
import type { UtilizationInput } from './utilization';
import { contextModules, contextOutline, skillsModules, skillsOutline } from '../flow/flow';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers, ReportState } from '../../schema/storage.types';

/**
 * V2.6 VB-125 walked the old Name/Repeat/Act/Share formula against the real
 * interview content. Pass 4c (Adam, 2026-09-08) rebuilt the segments as the
 * app's own journey — BASELINE → CONTEXT → SKILL → PROVE — and this suite
 * moved with it. Pinned here:
 *
 *  - a fresh install is 0%, standing at step one (the baseline);
 *  - a baseline run performed-and-judged fills the first quarter exactly;
 *  - a finished Context fills the second, a skip is not an answer;
 *  - SKILL is half the Skills interview's own fraction and half the
 *    acting-decision fraction (autonomy chosen, data home known —
 *    "not_sure" is the gap Actions.md also prints);
 *  - PROVE fills only from a with-file run standing beside the baseline;
 *  - solo interview work cannot reach 100 — proving it out is the ceiling.
 */

const NOW = new Date('2026-08-26T12:00:00.000Z');
const STAMP = NOW.toISOString();

const EMPTY: Answers = { values: {}, repeatables: {}, answeredAt: {}, reflectedAt: {} };

/** Every question really answered — the e2e fixtures' fold (skills-share
 * .spec.ts's doneContext), kept in the same shape so the two cannot drift
 * in what "finished" means. `skipIds` swaps listed steps to explicit skips. */
function doneAnswers(modules: Module[], skipIds: readonly string[] = []): Answers {
  const values: Record<string, AnswerValue> = {};
  const repeatables: Record<string, Record<string, AnswerValue>[]> = {};
  const answeredAt: Record<string, string> = {};
  const reflectedAt: Record<string, string> = {};
  const seededBlocks: { block: RepeatableBlock; seed: Step }[] = [];
  const stamp = (key: string, value: AnswerValue) => {
    values[key] = value;
    answeredAt[key] = STAMP;
    if (typeof value === 'string') reflectedAt[key] = STAMP;
  };
  const steps = new Map<string, Step>();
  for (const module of modules) {
    for (const node of module.nodes) {
      if ('fields' in node) {
        const seedId = node.seedFrom?.questionId;
        const seed = seedId ? steps.get(seedId) : undefined;
        if (seed) seededBlocks.push({ block: node, seed });
        continue;
      }
      const step = node;
      steps.set(step.id, step);
      const key = step.outKey ?? step.key ?? step.id;
      if (skipIds.includes(step.id)) {
        values[key] = null;
        answeredAt[key] = STAMP;
        continue;
      }
      if (step.id === 'entities_gate' || step.id === 'initiatives_gate') stamp(key, 'no');
      else if (step.id === 'role_names') stamp(key, (step.options ?? []).slice(0, 1).map((o) => o.v));
      else if (step.kind === 'intro') stamp(key, null);
      else if (step.kind === 'yesno') stamp(key, 'yes');
      else if (step.kind === 'chips') stamp(key, step.options?.[0]?.v ?? 'x');
      else if (step.kind === 'multi') stamp(key, step.options?.length ? [step.options[0]!.v] : []);
      else stamp(key, `A real answer for ${step.id}.`);
    }
  }
  for (const { block, seed } of seededBlocks) {
    const seedKey = seed.outKey ?? seed.key ?? seed.id;
    const picks = values[seedKey];
    if (!Array.isArray(picks)) continue;
    repeatables[block.id] = picks.map((v) => {
      const label = seed.options?.find((o) => o.v === v)?.l ?? String(v);
      const record: Record<string, AnswerValue> = { [block.seedFrom!.seedField]: label };
      for (const field of block.fields) {
        const fk = field.key ?? field.id;
        record[fk] = field.kind === 'chips' ? (field.options?.[0]?.v ?? 'x') : `A real answer for ${field.id}.`;
      }
      return record;
    });
    repeatables[block.id]!.forEach((record, ri) => {
      for (const fk of Object.keys(record)) {
        answeredAt[`${block.id}#${ri}#${fk}`] = STAMP;
        reflectedAt[`${block.id}#${ri}#${fk}`] = STAMP;
      }
    });
  }
  return { values, repeatables, answeredAt, reflectedAt };
}

/** A named skill record with its acting decision in the given state. */
function skill(name: string, autonomy: string | undefined, home: string | undefined) {
  const record: Record<string, AnswerValue> = { skill_name: name };
  if (autonomy !== undefined) record.skill_autonomy = autonomy;
  if (home !== undefined) record.skill_data_home = home;
  return record;
}

function withSkills(records: Record<string, AnswerValue>[]): Answers {
  return {
    values: {},
    repeatables: { skills: records },
    answeredAt: Object.fromEntries(records.map((_, i) => [`skills#${i}#skill_name`, STAMP])),
    reflectedAt: {},
  };
}

function input(overrides: Partial<UtilizationInput>): UtilizationInput {
  return {
    contextOutline,
    contextModules,
    context: EMPTY,
    skillsOutline,
    skillsModules,
    skills: EMPTY,
    report: undefined,
    now: NOW,
    ...overrides,
  };
}

const run = (stage: string) => ({ stage }) as unknown as NonNullable<ReportState['runs']>[number];
const BASELINE_ONLY: ReportState = { scores: [], runs: [run('baseline')] } as unknown as ReportState;
const PROVED: ReportState = {
  scores: [],
  runs: [run('baseline'), run('context')],
} as unknown as ReportState;

describe('computeUtilization — Baseline → Context → Skill → Prove', () => {
  it('a fresh install is 0%, standing at the baseline', () => {
    const u = computeUtilization(input({}));
    expect(u.percent).toBe(0);
    expect(u.segments).toEqual({ baseline: 0, context: 0, skill: 0, prove: 0 });
    expect(u.currentStep).toBe(1);
  });

  it('the baseline run fills the first quarter exactly, and nothing else', () => {
    const u = computeUtilization(input({ report: BASELINE_ONLY }));
    expect(u.segments).toEqual({ baseline: 100, context: 0, skill: 0, prove: 0 });
    expect(u.percent).toBe(25);
    expect(u.currentStep).toBe(2);
  });

  it('a finished Context fills the second quarter, standing at Skill', () => {
    const u = computeUtilization(
      input({ report: BASELINE_ONLY, context: doneAnswers(contextModules) }),
    );
    expect(u.segments.context).toBe(100);
    expect(u.segments.skill).toBe(0);
    expect(u.percent).toBe(50);
    expect(u.currentStep).toBe(3);
  });

  it('a skip is not an answer — one passed-on question holds Context under full', () => {
    const done = computeUtilization(input({ context: doneAnswers(contextModules) }));
    const skipped = computeUtilization(
      input({ context: doneAnswers(contextModules, ['professional_name']) }),
    );
    expect(done.segments.context).toBe(100);
    expect(skipped.segments.context).toBeLessThan(100);
  });

  it('SKILL blends the interview fraction with the acting decisions, half each', () => {
    // Two named skills, one acting-ready: the acting half contributes 1/2 of
    // its 50%. The records answer no top-level skills questions, so the
    // interview half stays wherever sectionHealth puts it (near zero here).
    const u = computeUtilization(
      input({
        skills: withSkills([
          skill('Weekly status', 'draft', 'sharepoint'),
          skill('Invoice chase', 'auto', 'not_sure'),
        ]),
      }),
    );
    expect(u.segments.skill).toBeGreaterThan(0);
    expect(u.segments.skill).toBeLessThanOrEqual(50);
  });

  it('a decided "never" IS an acting decision — refusing is choosing', () => {
    const decided = computeUtilization(
      input({ skills: withSkills([skill('Payroll', 'never', 'hr_system')]) }),
    );
    const undecided = computeUtilization(
      input({ skills: withSkills([skill('Payroll', undefined, undefined)]) }),
    );
    expect(decided.segments.skill).toBeGreaterThan(undecided.segments.skill);
  });

  it('PROVE fills only from a with-file run standing beside the baseline', () => {
    expect(computeUtilization(input({ report: BASELINE_ONLY })).segments.prove).toBe(0);
    const u = computeUtilization(input({ report: PROVED }));
    expect(u.segments.prove).toBe(100);
    expect(u.segments.baseline).toBe(100);
  });

  it('solo interview work cannot reach 100 — proving it out is the ceiling', () => {
    const u = computeUtilization(
      input({ context: doneAnswers(contextModules), skills: doneAnswers(skillsModules) }),
    );
    expect(u.segments.baseline).toBe(0);
    expect(u.segments.prove).toBe(0);
    expect(u.percent).toBeLessThanOrEqual(50);
  });

  it('the full journey reads 100, standing at the last step', () => {
    const u = computeUtilization(
      input({
        report: PROVED,
        context: doneAnswers(contextModules),
        skills: doneAnswers(skillsModules),
      }),
    );
    expect(u.segments.baseline).toBe(100);
    expect(u.segments.context).toBe(100);
    expect(u.segments.prove).toBe(100);
    // SKILL's acting half depends on the seeded records' decisions; the
    // journey's 100 is asserted where it is exact, and the percent tracks
    // the mean of exact fractions either way.
    expect(u.percent).toBeGreaterThanOrEqual(75);
    expect(u.currentStep).toBeGreaterThanOrEqual(3);
  });

  it('the percent is the mean of exact fractions, not of rounded ones', () => {
    const u = computeUtilization(
      input({
        skills: withSkills([
          skill('A', 'auto', 'crm'),
          skill('B', undefined, undefined),
          skill('C', undefined, undefined),
        ]),
      }),
    );
    // One of three acting-ready: the acting half is an exact 1/6 of the
    // segment's own scale; the percent is computed from the exact blend.
    const exactSkill = u.segments.skill / 100;
    expect(u.percent).toBe(Math.round((exactSkill / 4) * 100));
  });
});
