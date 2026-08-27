import { describe, it, expect } from 'vitest';
import { computeUtilization } from './utilization';
import type { UtilizationInput } from './utilization';
import { contextModules, contextOutline, skillsModules, skillsOutline } from '../flow/flow';
import type { AnswerValue, Module, RepeatableBlock, Step } from '../../schema/flow.types';
import type { Answers, ReportState } from '../../schema/storage.types';

/**
 * V2.6 VB-125 — the utilization formula, walked against the REAL interview
 * content (the ported modules), because its whole claim is that every number
 * is a ratio of things the interviews really ask. Pinned here:
 *
 *  - a fresh install is 0%, standing at step one;
 *  - a finished Context is exactly one quarter — the Name segment full,
 *    nothing else moved;
 *  - a skip is not an answer (slots.ts's settled precedent, inherited
 *    through sectionHealth);
 *  - Act is the fraction of NAMED skills whose acting decision is real, and
 *    "not_sure" for the data home is the gap Actions.md also prints;
 *  - Share fills half from typed proof scores, half from minted record ids,
 *    and from nothing else;
 *  - 100% requires all four — solo interview work cannot reach it without
 *    the proof-and-share work, which is Adam's decided semantics.
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

function withSkills(records: Record<string, AnswerValue>[], recordIds?: string[]): Answers {
  const base: Answers = {
    values: {},
    repeatables: { skills: records },
    answeredAt: Object.fromEntries(records.map((_, i) => [`skills#${i}#skill_name`, STAMP])),
    reflectedAt: {},
  };
  if (recordIds) base.recordIds = { skills: recordIds };
  return base;
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

const REPORT: ReportState = { scores: [{}] } as unknown as ReportState;

describe('computeUtilization — the four quarters', () => {
  it('a fresh install is 0%, standing at step one', () => {
    const u = computeUtilization(input({}));
    expect(u.percent).toBe(0);
    expect(u.segments).toEqual({ name: 0, repeat: 0, act: 0, share: 0 });
    expect(u.currentStep).toBe(1);
  });

  it('a finished Context is exactly the Name quarter, standing at Repeat', () => {
    const u = computeUtilization(input({ context: doneAnswers(contextModules) }));
    expect(u.segments.name).toBe(100);
    expect(u.segments.repeat).toBe(0);
    expect(u.percent).toBe(25);
    expect(u.currentStep).toBe(2);
  });

  it('a skip is not an answer — one passed-on question holds Name under full', () => {
    const done = computeUtilization(input({ context: doneAnswers(contextModules) }));
    const skipped = computeUtilization(
      input({ context: doneAnswers(contextModules, ['professional_name']) }),
    );
    expect(done.segments.name).toBe(100);
    expect(skipped.segments.name).toBeLessThan(100);
    expect(skipped.currentStep).toBe(1);
  });

  it('partial context moves the number without filling the segment', () => {
    const some: Answers = {
      values: { professional_name: 'Ada' },
      repeatables: {},
      answeredAt: { professional_name: STAMP },
      reflectedAt: { professional_name: STAMP },
    };
    const u = computeUtilization(input({ context: some }));
    expect(u.segments.name).toBeGreaterThan(0);
    expect(u.segments.name).toBeLessThan(100);
    expect(u.currentStep).toBe(1);
  });

  it('Act is the fraction of named skills whose acting decision is real', () => {
    const u = computeUtilization(
      input({
        skills: withSkills([
          skill('Weekly status', 'draft', 'sharepoint'),
          skill('Invoice chase', 'auto', 'not_sure'),
        ]),
      }),
    );
    expect(u.segments.act).toBe(50);
  });

  it('an unnamed record earns nothing, and no skills at all is zero', () => {
    expect(computeUtilization(input({})).segments.act).toBe(0);
    const u = computeUtilization(
      input({ skills: withSkills([skill('  ', 'auto', 'crm'), skill('Real one', 'never', 'crm')]) }),
    );
    // The blank name is not a skill; the one real skill decides everything.
    expect(u.segments.act).toBe(100);
  });

  it('a decided "never" IS an acting decision — refusing is choosing', () => {
    const u = computeUtilization(input({ skills: withSkills([skill('Payroll', 'never', 'hr_system')]) }));
    expect(u.segments.act).toBe(100);
  });

  it('Share: typed proof scores are half, minted record ids the other half', () => {
    expect(computeUtilization(input({ report: REPORT })).segments.share).toBe(50);
    expect(
      computeUtilization(input({ skills: withSkills([skill('A', 'auto', 'crm')], ['skl_x']) }))
        .segments.share,
    ).toBe(50);
    expect(
      computeUtilization(
        input({ report: REPORT, skills: withSkills([skill('A', 'auto', 'crm')], ['skl_x']) }),
      ).segments.share,
    ).toBe(100);
    // An empty scores array and an empty id list claim nothing.
    expect(
      computeUtilization(
        input({
          report: { scores: [] } as unknown as ReportState,
          skills: withSkills([skill('A', 'auto', 'crm')], []),
        }),
      ).segments.share,
    ).toBe(0);
  });

  it('solo interview work cannot reach 100 — the ceiling is the decided one', () => {
    // Everything a person can do alone in the interviews, acting decisions
    // included, with no proof run and no pack ever saved:
    const skills = doneAnswers(skillsModules);
    const u = computeUtilization(input({ context: doneAnswers(contextModules), skills }));
    expect(u.segments.share).toBe(0);
    expect(u.percent).toBeLessThanOrEqual(75);
  });

  it('the percent is the mean of exact fractions, not of rounded ones', () => {
    // One of three skills act-ready: exact third. name/repeat/share at 0.
    const u = computeUtilization(
      input({
        skills: withSkills([
          skill('A', 'auto', 'crm'),
          skill('B', undefined, undefined),
          skill('C', undefined, undefined),
        ]),
      }),
    );
    expect(u.segments.act).toBe(33);
    // Skills answers exist, so repeat is >0 only if those records answer real
    // skills-interview questions — this fixture's records answer none of the
    // top-level steps, so the mean is act/4 alone, from the exact 1/3.
    expect(u.percent).toBe(Math.round(((u.segments.repeat / 100 + 1 / 3) / 4) * 100));
  });
});
