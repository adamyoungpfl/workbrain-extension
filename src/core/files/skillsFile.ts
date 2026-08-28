import { generateContextFileParts } from './generate';
import type { ContextFileParts } from './generate';
import type { FileCopy } from './source';
import { skillsModules, skillsOutline } from '../flow/flow';
import { SKILLS_INTERVIEW_MODULES } from '../flow/skillsSource';
import type { Answers } from '../../schema/storage.types';

/**
 * V2.2 VB-83 — Skills.md's copy and its per-record shape.
 *
 * The generator itself is Context's (`generateContextFileParts` was made
 * generic at VB-80); what a second file brings is a `FileCopy` — the title,
 * the intro line, the framing rule — and, for a repeatable-dominated file,
 * the record shape. Every string here is the SIGNED-OFF draft's
 * (docs/V2.2-COPY-DRAFT.md, Adam 2026-08-26); the per-skill section shape is
 * [VERBATIM] the sibling wizard's own block order.
 *
 * THE FRAMING PARAGRAPH'S JOB IS THE INVERSE OF CONTEXT'S. Context's
 * grounding rule tells the AI what it may claim about the person; this one
 * tells it not to improvise: follow the recipe exactly. It stands where the
 * System Grounding Rule stands — always included, never a question — and
 * `parseContextFile` uses its heading as the validity mark for an imported
 * Skills.md, exactly as Context's rule marks a Context.md.
 */

/** Option labels, resolved from the interview's own source — a record stores
 * option KEYS (or a custom string, when the person typed their own), and the
 * file prints words. */
const OPTION_LABELS: ReadonlyMap<string, ReadonlyMap<string, string>> = (() => {
  const byQuestion = new Map<string, Map<string, string>>();
  for (const module of SKILLS_INTERVIEW_MODULES) {
    for (const node of module.nodes) {
      const questions = 'questions' in node ? node.questions : [node];
      for (const question of questions) {
        if (!question.options) continue;
        byQuestion.set(question.id, new Map(question.options.map((o) => [o.key, o.label])));
      }
    }
  }
  return byQuestion;
})();

/**
 * BS-04 (§4) exported these three. Proof two assembles a message out of the
 * same record this file prints, and a second rendering of "which words does
 * key `weekly_monday` stand for" would be two answers to one question — the
 * kind that agree today and disagree after somebody edits one option list.
 */
export function skillOptionLabel(questionId: string, value: unknown): string {
  return labelFor(questionId, value);
}

export function skillOptionLabels(questionId: string, value: unknown): string[] {
  return labelsFor(questionId, value);
}

/** One skill's recipe block — the exact bytes Skills.md carries for it. */
export function skillRecipeBlock(record: Record<string, unknown>): string | null {
  return renderSkillRecord('skills', record);
}

function labelFor(questionId: string, value: unknown): string {
  if (typeof value !== 'string') return '';
  return OPTION_LABELS.get(questionId)?.get(value) ?? value;
}

function labelsFor(questionId: string, value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => labelFor(questionId, v));
}

/**
 * One skill, in the sibling's own block order — Trigger / Inputs / Tools /
 * Steps / Output — folded into a section of the single Skills.md. Lines with
 * nothing to say are omitted rather than printed empty, the same rule the
 * generic generator applies to sections.
 *
 * `skill_data_home`, `skill_autonomy` and `skill_owner` are deliberately NOT
 * printed here: they are the derivation's inputs (deriveActions.ts) and the
 * pack-split's marking, not part of the recipe an AI follows. A recipe that
 * printed "requires my approval" in the middle of its steps would be telling
 * the assistant something that is Actions.md's to say.
 */
function renderSkillRecord(blockId: string, record: Record<string, unknown>): string | null {
  if (blockId !== 'skills') return null;
  const name = typeof record.skill_name === 'string' && record.skill_name.trim() ? record.skill_name.trim() : null;
  if (!name) return null;

  const lines: string[] = [`## ${name}`];
  const trigger = labelFor('skill_trigger', record.skill_trigger);
  if (trigger) lines.push(`Trigger: ${trigger}`);
  const inputs = labelsFor('skill_inputs', record.skill_inputs);
  if (inputs.length) lines.push(`Inputs: ${inputs.join(', ')}`);
  const tools = labelsFor('skill_tools', record.skill_tools);
  if (tools.length) lines.push(`Tools: ${tools.join(', ')}`);
  const steps = typeof record.skill_steps === 'string' ? record.skill_steps.trim() : '';
  if (steps) lines.push(`Steps:\n${steps}`);
  const output = labelFor('skill_output', record.skill_output);
  if (output) lines.push(`Output: ${output}`);
  return lines.join('\n');
}

export const SKILLS_FILE_COPY: FileCopy = {
  title: '# Skills.md — how I work, as recipes',
  introLine: (generatedOn) =>
    `_Generated ${generatedOn} from a Work Brain Skills Interview — nothing in this file ever left the browser it was created in._`,
  groundingHeading: '## How to use this file',
  groundingRule:
    "Each section below is one skill: a recipe I run by name. When I ask for one, follow its steps in order, exactly as written — don't merge steps, skip steps, or improvise a better way unless I ask. Read the Inputs line before starting, and hand back the Output shape it names. If a step can't be done with what you have, stop and say which step and what's missing.",
  renderRecord: renderSkillRecord,
};

/** Skills.md, whole — the same parts construction as Context.md, so the
 * drawer's preview and the download are the same bytes here too. */
export function generateSkillsFileParts(
  answers: Pick<Answers, 'values' | 'repeatables'>,
  generatedOn: string,
): ContextFileParts {
  return generateContextFileParts(answers, generatedOn, skillsModules, skillsOutline, SKILLS_FILE_COPY);
}

export function generateSkillsFile(answers: Pick<Answers, 'values' | 'repeatables'>, generatedOn: string): string {
  return generateSkillsFileParts(answers, generatedOn).text;
}
