import { describe, it, expect } from 'vitest';
import { contextOutline, skillsModules, skillsOutline } from './flow';
import { SECTION_HALF_LIFE_DAYS } from '../freshness/halfLives';
import { DEEP_DIVE } from './deepDive';
import { ADD_ANOTHER, SKILLS_ADD_ANOTHER } from './addAnother';
import { generateSkillsFile, generateSkillsFileParts, SKILLS_FILE_COPY } from '../files/skillsFile';
import { parseContextFile } from '../files/parse';
import { deriveActionsFile } from '../files/deriveActions';
import type { Answers } from '../../schema/storage.types';

/**
 * V2.2 — the Skills flow's own assembly, plus the two rules the spike said
 * would fail SILENTLY if broken: id collisions across the flat shared maps,
 * and the derived Actions.md's character (never-means-never, findings from
 * "not sure", the verbatim footer).
 */

const ANSWERS: Answers = {
  values: {
    skills_orientation: null,
    skill_seed: ['status_report', 'Board pack'],
  },
  repeatables: {
    skills: [
      {
        skill_name: 'A status update or report',
        skill_trigger: 'weekly_monday',
        skill_inputs: ['dashboard', 'email_thread'],
        skill_tools: ['powerbi', 'outlook'],
        skill_data_home: 'in_tool',
        skill_steps: '1. Pull the numbers\n2. Draft the summary\n3. Send it to me',
        skill_output: 'one_page_decisions',
        skill_autonomy: 'draft',
        skill_owner: 'mine',
      },
      {
        skill_name: 'Board pack',
        skill_trigger: 'ad_hoc',
        skill_inputs: ['spreadsheet'],
        skill_tools: ['excel'],
        skill_data_home: 'not_sure',
        skill_steps: '1. Collect the tabs\n2. Build the pack',
        skill_output: 'before_after_table',
        skill_autonomy: 'never',
        skill_owner: 'team',
      },
    ],
  },
  answeredAt: {},
  reflectedAt: {},
};

describe('the Skills flow assembles through the shared adapter', () => {
  it('three modules, ids prefixed skl, and the repeatable seeded from skill_seed', () => {
    expect(skillsModules.map((m) => m.id)).toEqual(['skl1', 'skl2', 'skl3']);
    expect(skillsOutline.map((n) => n.id)).toEqual(['skl1']);
  });

  /**
   * THE SPIKE'S SILENT-COLLISION RISK, AS AN ASSERTION. The half-life,
   * deep-dive and add-another maps are flat string maps shared between
   * files. A Skills id that reused a Context key would inherit Context's
   * entry with no error anywhere — so the absence of overlap is proven, not
   * assumed, for every namespace the two flows share.
   */
  it('no Skills id collides with a Context id in any shared namespace', () => {
    const contextSections = new Set(contextOutline.flatMap((n) => [n.id, ...(n.children ?? []).map((c) => c.id)]));
    const skillsSections = skillsOutline.flatMap((n) => [n.id, ...(n.children ?? []).map((c) => c.id)]);
    for (const id of skillsSections) expect(contextSections.has(id), `outline id ${id}`).toBe(false);

    // The skl section has its own half-life entry — it does not fall through
    // to the default by accident.
    expect(SECTION_HALF_LIFE_DAYS['skl1']).toBe(180);

    // The shared copy maps: Skills keys live in Skills' own maps, and neither
    // map names the other file's blocks.
    expect(Object.keys(DEEP_DIVE).some((k) => k.startsWith('skl'))).toBe(false);
    expect(Object.keys(ADD_ANOTHER)).not.toContain('skills');
    expect(Object.keys(SKILLS_ADD_ANOTHER)).toEqual(['skills']);
  });
});

describe('Skills.md generates and round-trips through the shared machinery', () => {
  it('carries the framing rule, the per-skill sections, and the wizard block order', () => {
    const text = generateSkillsFile(ANSWERS, '26 August 2026');
    expect(text).toContain('# Skills.md — how I work, as recipes');
    expect(text).toContain('## How to use this file');
    expect(text).toContain('follow its steps in order, exactly as written');
    // The record shape is the sibling's block order, with labels not keys.
    expect(text).toContain('## A status update or report');
    expect(text).toContain('Trigger: Weekly, first thing Monday');
    expect(text).toContain('Inputs: A dashboard, An email thread');
    expect(text).toContain('Tools: Power BI / Tableau, Outlook / Email');
    expect(text).toContain('Steps:\n1. Pull the numbers');
    expect(text).toContain('Output: A one-page summary, decisions first');
    // The derivation's inputs are NOT recipe content.
    expect(text).not.toContain('requires my approval');
    expect(text).not.toContain("I'm not sure");
  });

  it('the preview and the download are the same bytes, and the file parses back valid', () => {
    const parts = generateSkillsFileParts(ANSWERS, '26 August 2026');
    expect(parts.text).toBe(generateSkillsFile(ANSWERS, '26 August 2026'));

    const { skillsModules: m, skillsOutline: o } = { skillsModules, skillsOutline };
    const parsed = parseContextFile(parts.text, m, o, SKILLS_FILE_COPY);
    expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  });

  it('a Context.md does NOT pass as a Skills.md — the validity mark is per-file', () => {
    const parsed = parseContextFile('# Context.md\n\n## System Grounding Rule\n\nwrong file', skillsModules, skillsOutline, SKILLS_FILE_COPY);
    expect(parsed.ok).toBe(false);
  });
});

describe('deriveActionsFile — the character the decision doc names', () => {
  const derived = deriveActionsFile(ANSWERS);

  it('opens with intent-not-permission and closes with the verbatim Default footer', () => {
    expect(derived).toContain('Treat it as intent, not permission.');
    expect(derived).toContain(
      '## Default\nEvery action above requires approval unless this file says otherwise.\nNothing in this skill sends, closes, or modifies without me saying yes.',
    );
  });

  it('an approval skill prints the sibling qualifier and its connection needs', () => {
    expect(derived).toContain('## A status update or report');
    expect(derived).toContain('- Pull the numbers — requires my approval');
    expect(derived).toContain('Needs: Power BI / Tableau, Outlook / Email · data lives: In the tool I named');
  });

  it('NEVER means never: no action line, a kept-manual entry, and no nudge', () => {
    // The skill exists in the file…
    expect(derived).toContain('## Kept manual on purpose');
    expect(derived).toContain('Board pack — I answered "never"');
    expect(derived).toContain("don't suggest automating them");
    // …but never as an action.
    expect(derived).not.toContain('## Board pack');
  });

  it('"not sure" becomes a finding with a person to ask', () => {
    expect(derived).toContain('## What I still need to find out');
    expect(derived).toContain('Where what "Board pack" reads actually lives — ask IT or whoever owns Excel / Sheets.');
  });

  it('is a pure fold: same answers, same bytes', () => {
    expect(deriveActionsFile(ANSWERS)).toBe(derived);
  });
});
