import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers, ReportState } from '../../schema/storage.types';
import { sectionHealthMap } from '../freshness/sectionHealth';

/**
 * V2.6 VB-125 built this meter on Name · Repeat · Act · Share. REBUILT for
 * pass 4c (Adam, 2026-09-08): "Name, Act, Repeat and Share doesn't feel
 * like it captures the momentum or spirit of the goal of the app any
 * longer" — the goal being "the right visible momentum to get the context
 * file and at least a single skill file built and ready to prove it out."
 *
 * So the four segments are now the app's own journey, in the order Home's
 * doors already stand: BASELINE → CONTEXT → SKILL → PROVE.
 *
 *   BASELINE  the starting point taken: a baseline run exists (performed
 *             and judged - the pre-launch errand).
 *   CONTEXT   how much of the Context interview is really answered -
 *             answered over askable (`sectionHealthMap`; a skip is not an
 *             answer, slots.ts's settled precedent).
 *   SKILL     momentum to a skill file that could RUN: the Skills
 *             interview's own fraction and the acting-decision fraction
 *             (autonomy chosen, data home known - the same inputs
 *             Actions.md derives from), half each.
 *   PROVE     the head-to-head taken: a with-file run exists beside the
 *             baseline (stage 'context' in the report's runs).
 *
 * ── THE AUTHORSHIP GUARD, UNCHANGED ───────────────────────────────────────
 * Every input is content the person authored or a run they performed AND
 * judged (GUARDRAILS' run-history rows). Nothing observes usage, nothing
 * new is stored; the whole result is derived at render and thrown away.
 * And it is still not the banned "composite score": each segment is one
 * real ratio (or one real fact) the person could check themselves, and the
 * total is four plain quarters.
 */

export interface UtilizationSegments {
  /** 0–100 each, rounded for display. */
  baseline: number;
  context: number;
  skill: number;
  prove: number;
}

export interface Utilization {
  /** The big number: 0–100, the mean of the four segments' exact values. */
  percent: number;
  segments: UtilizationSegments;
  /** 1-based: the first segment that is not full, or 4 when all are. */
  currentStep: 1 | 2 | 3 | 4;
}

export interface UtilizationInput {
  contextOutline: FileOutlineNode[];
  contextModules: Module[];
  context: Answers;
  skillsOutline: FileOutlineNode[];
  skillsModules: Module[];
  skills: Answers;
  report: ReportState | undefined;
  now: Date;
}

/** Answered over askable, across a file's top-level sections. 0 with none. */
function interviewFraction(
  outline: FileOutlineNode[],
  modules: Module[],
  answers: Answers,
  now: Date,
): number {
  const health = sectionHealthMap(outline, modules, answers, null, now);
  let answered = 0;
  let total = 0;
  for (const node of outline) {
    const section = health[node.id];
    if (!section) continue;
    answered += section.answered;
    total += section.total;
  }
  return total === 0 ? 0 : answered / total;
}

/** The acting decision Actions.md reads: autonomy chosen, data home known. */
function actFraction(skills: Answers): number {
  const records = skills.repeatables['skills'] ?? [];
  const named = records.filter(
    (record) => typeof record.skill_name === 'string' && record.skill_name.trim() !== '',
  );
  if (named.length === 0) return 0;
  const ready = named.filter((record) => {
    const autonomy = record.skill_autonomy;
    const home = record.skill_data_home;
    return (
      typeof autonomy === 'string' &&
      autonomy !== '' &&
      typeof home === 'string' &&
      home !== '' &&
      home !== 'not_sure'
    );
  });
  return ready.length / named.length;
}

/** The starting point taken - a baseline run performed and judged. */
function baselineFraction(report: ReportState | undefined): number {
  return (report?.runs ?? []).some((run) => run.stage === 'baseline') ? 1 : 0;
}

/** The head-to-head taken - a with-file run standing beside the baseline. */
function proveFraction(report: ReportState | undefined): number {
  return (report?.runs ?? []).some((run) => run.stage === 'context') ? 1 : 0;
}

export function computeUtilization(input: UtilizationInput): Utilization {
  const exact = [
    baselineFraction(input.report),
    interviewFraction(input.contextOutline, input.contextModules, input.context, input.now),
    (interviewFraction(input.skillsOutline, input.skillsModules, input.skills, input.now) +
      actFraction(input.skills)) /
      2,
    proveFraction(input.report),
  ] as const;

  const firstOpen = exact.findIndex((f) => f < 1);
  return {
    percent: Math.round((exact.reduce((sum, f) => sum + f, 0) / 4) * 100),
    segments: {
      baseline: Math.round(exact[0] * 100),
      context: Math.round(exact[1] * 100),
      skill: Math.round(exact[2] * 100),
      prove: Math.round(exact[3] * 100),
    },
    currentStep: (firstOpen === -1 ? 4 : firstOpen + 1) as 1 | 2 | 3 | 4,
  };
}
