import type { FileOutlineNode, Module } from '../../schema/flow.types';
import type { Answers, ReportState } from '../../schema/storage.types';
import { sectionHealthMap } from '../freshness/sectionHealth';

/**
 * V2.6 VB-125 — the utilization meter's one formula.
 *
 * Adam's semantics, decided 2026-08-26 (docs/V2.6-REFINEMENT.md, decision 2):
 * "Utilization is a generalized percent based on completion of context and
 * skills. The gaps for Act and Share fill out the remaining percentages to be
 * fully utilized, necessitating services or outside work on the file to have
 * it measure 100%."
 *
 * Four segments, a quarter each — the four steps the interface already names
 * (Name · Repeat · Act · Share):
 *
 *   NAME    how much of the Context interview is really answered — answered
 *           questions over askable questions, the same tally the section
 *           rows print (`sectionHealthMap`; a skip is not an answer, per
 *           slots.ts's settled precedent).
 *   REPEAT  the same fold over the Skills interview.
 *   ACT     of the skills the person has NAMED, how many carry a real acting
 *           decision — an autonomy answer given, and a data home that is not
 *           "not_sure". These are exactly the inputs Actions.md derives from
 *           (core/files/deriveActions.ts); "not sure" prints there as a
 *           finding, and here as the gap it is. No skills named, no credit.
 *   SHARE   evidence the file has left the nest, read off state that already
 *           exists for its own reasons: the proof loop's self-reported
 *           scores (`wb:report` — a number the person TYPED), and minted
 *           record ids on the skills store (`recordIds` — written when a
 *           pack is saved or added, VB-124's identity stamps). Half each.
 *
 * ── THE AUTHORSHIP GUARD, APPLIED ─────────────────────────────────────────
 *
 * Every input above is either content the person authored or a stamp the
 * product already stores for a functional reason. Nothing here observes
 * usage, counts opens, or stores anything of its own — the whole result is
 * derived at render and thrown away ("nothing derived is stored"). This is
 * also why 100% genuinely requires outside work: the meter cannot and will
 * not watch the person use their file, so the Share segment fills only from
 * things they did and typed.
 *
 * And it is not the "composite score" GUARDRAILS bans: like `sectionPercent`
 * before it (V1.6 VB-33's reading of the same rule), every segment is one
 * real ratio of two real counts, and the total is those four quarters — the
 * banned thing is an invented index over unlike dimensions dressed as
 * precision, not arithmetic the person could redo themselves.
 */

export interface UtilizationSegments {
  /** 0–100 each, rounded for display. */
  name: number;
  repeat: number;
  act: number;
  share: number;
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

/** Proof scores typed, and record ids minted — half the segment each. */
function shareFraction(skills: Answers, report: ReportState | undefined): number {
  const proved = (report?.scores?.length ?? 0) > 0;
  const sharedIds = skills.recordIds?.['skills'] ?? [];
  const minted = sharedIds.some((id) => typeof id === 'string' && id !== '');
  return (proved ? 0.5 : 0) + (minted ? 0.5 : 0);
}

export function computeUtilization(input: UtilizationInput): Utilization {
  const exact = [
    interviewFraction(input.contextOutline, input.contextModules, input.context, input.now),
    interviewFraction(input.skillsOutline, input.skillsModules, input.skills, input.now),
    actFraction(input.skills),
    shareFraction(input.skills, input.report),
  ] as const;

  const firstOpen = exact.findIndex((f) => f < 1);
  return {
    percent: Math.round((exact.reduce((sum, f) => sum + f, 0) / 4) * 100),
    segments: {
      name: Math.round(exact[0] * 100),
      repeat: Math.round(exact[1] * 100),
      act: Math.round(exact[2] * 100),
      share: Math.round(exact[3] * 100),
    },
    currentStep: (firstOpen === -1 ? 4 : firstOpen + 1) as 1 | 2 | 3 | 4,
  };
}
