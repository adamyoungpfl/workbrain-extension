import { SKILLS_INTERVIEW_MODULES } from '../flow/skillsSource';
import type { Answers } from '../../schema/storage.types';

/**
 * V2.2 VB-84 — Actions.md, derived. A fold over the Skills answers, never an
 * interview, never stored: regenerated at every view and download, so it
 * cannot go stale against the skills it reads ("nothing derived is stored",
 * applied to a whole file). The decision it implements is
 * docs/V2.2-SKILLS-ACTIONS-DECISIONS.md #1 — Adam, 2026-08-25: "every skills
 * file is a possible actions file service waiting to happen."
 *
 * Every string is the SIGNED-OFF draft's (docs/V2.2-COPY-DRAFT.md). Three of
 * its moves carry the file's whole character and must survive any edit:
 *
 * - "Treat it as intent, not permission" — the framing's safety sentence,
 *   approved carrying that weight by name (Adam, 2026-08-26).
 * - A skill marked NEVER does not appear as an action. It prints under "Kept
 *   manual on purpose" with an instruction not to suggest automating it —
 *   the file refusing to nudge (docs/GUARDRAILS.md's spirit, in the
 *   artifact itself).
 * - The `## Default` footer is [VERBATIM] the sibling's, and it is never a
 *   field: the sibling's own comment says flipping it off "would undercut
 *   the entire safety promise of this gate", and that reasoning ports with
 *   the bytes.
 */

interface SkillRow {
  name: string;
  firstStep: string;
  tools: string[];
  dataHome: string;
  dataHomeKey: string;
  autonomy: string;
}

const AUTONOMY_LINE: Record<string, string> = {
  // [VERBATIM] qualifier vocabulary from the sibling's actionsMd(), plus the
  // draft's third line for fully-automatic.
  myself: '', // runs by hand — not an action line at all
  draft: 'requires my approval',
  auto: 'runs itself once connected',
  never: '', // prints under "Kept manual on purpose" instead
};

const LABELS: ReadonlyMap<string, ReadonlyMap<string, string>> = (() => {
  const byQuestion = new Map<string, Map<string, string>>();
  for (const module of SKILLS_INTERVIEW_MODULES) {
    for (const node of module.nodes) {
      const questions = 'questions' in node ? node.questions : [node];
      for (const question of questions) {
        if (question.options) byQuestion.set(question.id, new Map(question.options.map((o) => [o.key, o.label])));
      }
    }
  }
  return byQuestion;
})();

const label = (qid: string, v: unknown): string =>
  typeof v === 'string' ? (LABELS.get(qid)?.get(v) ?? v) : '';

function rows(answers: Pick<Answers, 'repeatables'>): SkillRow[] {
  return (answers.repeatables['skills'] ?? [])
    .map((record) => {
      const name = typeof record.skill_name === 'string' ? record.skill_name.trim() : '';
      const steps = typeof record.skill_steps === 'string' ? record.skill_steps : '';
      const firstStep =
        steps
          .split('\n')
          .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim())
          .find(Boolean) ?? '';
      const toolsRaw = Array.isArray(record.skill_tools) ? record.skill_tools : [];
      return {
        name,
        firstStep,
        tools: toolsRaw.filter((t): t is string => typeof t === 'string').map((t) => label('skill_tools', t)),
        dataHome: label('skill_data_home', record.skill_data_home),
        dataHomeKey: typeof record.skill_data_home === 'string' ? record.skill_data_home : '',
        autonomy: typeof record.skill_autonomy === 'string' ? record.skill_autonomy : 'myself',
      };
    })
    .filter((row) => row.name !== '');
}

export function deriveActionsFile(answers: Pick<Answers, 'values' | 'repeatables'>): string {
  const skills = rows(answers);

  const parts: string[] = [
    '# Actions.md — what runs without me, and what it would take',
    '',
    "This file wasn't written by hand — it's read straight off my Skills file. It says which skills I'd let run on their own, what each would need to connect, and what I still have to find out. If you're an AI reading this: nothing in here is connected yet. Treat it as intent, not permission.",
  ];

  for (const skill of skills.filter((s) => s.autonomy !== 'never')) {
    const qualifier = AUTONOMY_LINE[skill.autonomy] ?? '';
    const does = skill.firstStep || '[what it does]';
    parts.push('', `## ${skill.name}`);
    parts.push(qualifier ? `- ${does} — ${qualifier}` : `- ${does} — I run this one myself today`);
    const needs: string[] = [];
    if (skill.tools.length) needs.push(`Needs: ${skill.tools.join(', ')}`);
    if (skill.dataHome) needs.push(`data lives: ${skill.dataHome}`);
    if (needs.length) parts.push(needs.join(' · '));
  }

  const keptManual = skills.filter((s) => s.autonomy === 'never');
  if (keptManual.length) {
    parts.push('', '## Kept manual on purpose');
    parts.push(
      `${keptManual.map((s) => s.name).join(', ')} — I answered "never" for these. Don't automate them; don't suggest automating them.`,
    );
  }

  const findings = skills.filter((s) => s.dataHomeKey === 'not_sure');
  if (findings.length) {
    parts.push('', '## What I still need to find out');
    for (const skill of findings) {
      const owner = skill.tools[0] ? `whoever owns ${skill.tools[0]}` : 'whoever owns the data';
      parts.push(`- Where what "${skill.name}" reads actually lives — ask IT or ${owner}.`);
    }
  }

  parts.push(
    '',
    '## Ways to connect these yourself',
    'Guides for wiring skills like these into your own tools are coming at model-citizen.org. Until then, the fastest route is a person: model-citizen.org/contact.',
    '',
    '## Default',
    'Every action above requires approval unless this file says otherwise.',
    'Nothing in this skill sends, closes, or modifies without me saying yes.',
    '',
  );

  return parts.join('\n');
}
