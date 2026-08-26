import type { FileOutlineNode, FlowNode, Module, Question } from './source';

/**
 * V2.2 VB-81 — the Skills interview's content, in the source dialect.
 *
 * NOT A VERBATIM PORT, AND THE PROVENANCE IS TRACKED LINE BY LINE. R1-05's
 * Context port had a 1,447-line interview flow to copy byte-for-byte; Skills
 * has no such file — it has a shipped *wizard* (`../modelcitizen/src/
 * components/WorkBrainSkillsBuilder.tsx`), which is a different form factor.
 * So this file is the form-factor conversion `docs/SPIKE-skills-actions.md`
 * scoped, written against the SIGNED-OFF copy in `docs/V2.2-COPY-DRAFT.md`
 * (Adam, 2026-08-26). Every string below carries the draft's provenance:
 * [VERBATIM] from the wizard, [ADAPTED] with the original quoted in the
 * draft, or [NEW]. Do not "tighten" any of them — the draft is the contract.
 *
 * THE SHAPE: 3 modules, with the wizard's whole step ladder living as fields
 * inside one repeatable — exactly how Context's `roles` works. The two
 * Actions absorptions (docs/V2.2-SKILLS-ACTIONS-DECISIONS.md #1) are
 * `skill_data_home` and `skill_autonomy`, and ONLY those: if this block ever
 * grows past those two beyond the wizard's own ladder, the cancelled Actions
 * interview is re-entering through the back door.
 *
 * IDS ARE PREFIXED `skl` FROM QUESTION ONE. The half-life, deep-dive,
 * add-another and module-intro maps are flat string maps shared with
 * Context; a Skills section reusing `sec1` would inherit Context's 365-day
 * clock with no error (the spike's silent-collision risk, guarded by a test
 * in skillsFlow.test.ts).
 *
 * TWO SMALL DEVIATIONS FROM THE DRAFT, both form-factor, both flagged:
 * - The draft marked `skill_trigger` "default Ad Hoc" and `skill_owner`
 *   "default Mine" (the wizard pre-selects). The interview's chips have no
 *   pre-select mechanic — a pre-picked answer would write itself into the
 *   file without the person touching it, which Context has never done. The
 *   trigger hint carries the permission instead ("Ad Hoc is fine…").
 * - The add-another screen has three fields (prompt / namePrompt /
 *   namePlaceholder); the draft's extra hint lines for it are folded into
 *   those three or dropped, noted at SKILLS_ADD_ANOTHER.
 */

function q(question: Question): FlowNode {
  return { kind: 'question', ...question };
}

/** [NEW] The intro's two beats — the same reveal mechanic Context's
 * architecture orientation uses, and the sibling promise ("Later, we'll
 * build a Skills file…") being kept. */
const SKILLS_ORIENTATION_BEATS = [
  'Your Context file taught AI __who__ you are.',
  'This one teaches it __how you work__ — one repeatable job at a time.',
];

// ---------------------------------------------------------------------
// Module skl1 — What repeats
// ---------------------------------------------------------------------
const whatRepeats: Module = {
  id: 'skl1',
  number: 1,
  title: 'What repeats',
  purpose: 'Name the deliverables you make more than once, so each can become a recipe.',
  required: true,
  estimatedMinutes: [1, 2],
  nodes: [
    q({
      id: 'skills_orientation',
      type: 'intro',
      prompt: () => 'Now for your Skills file.',
      beats: SKILLS_ORIENTATION_BEATS,
    }),
    q({
      id: 'skill_seed',
      type: 'multi-select',
      // [NEW — decision #2's question, opening Skills]
      prompt: () => 'What lands on your desk again and again?',
      hint: 'Pick the deliverables you make more than once. Not the one-offs — the things you could hand to a new hire with a checklist.',
      allowCustom: true,
      customPlaceholder: 'Something else you make on repeat',
      // Answer-space checked against skillLibrary.ts — shape, never words
      // (docs/CONTENT-SOURCES.md's warning).
      options: [
        { key: 'status_report', label: 'A status update or report' },
        { key: 'meeting_summary', label: 'A meeting summary' },
        { key: 'triage_pass', label: 'A triage pass on a queue' },
        { key: 'first_draft_email', label: 'A first-draft email' },
        { key: 'slide_one_pager', label: 'A slide or one-pager' },
        { key: 'data_pull', label: 'A data pull or refresh' },
      ],
    }),
  ],
};

// ---------------------------------------------------------------------
// Module skl2 — The recipes (the repeatable: one record per skill)
// ---------------------------------------------------------------------
const recipes: Module = {
  id: 'skl2',
  number: 2,
  title: 'The recipes',
  purpose: 'One skill at a time: when it runs, what it reads, and the steps.',
  required: true,
  estimatedMinutes: [6, 12],
  nodes: [
    {
      kind: 'repeatable',
      id: 'skills',
      skipIf: (ctx) => !Array.isArray(ctx.answers.skill_seed) || (ctx.answers.skill_seed as string[]).length === 0,
      seedFrom: { questionId: 'skill_seed', seedField: 'skill_name' },
      addAnotherPrompt: '',
      questions: [
        {
          id: 'skill_trigger',
          type: 'single-select',
          // [NEW question line; VERBATIM seeds; hint ADAPTED from the
          // wizard's Guide Me ("Ad Hoc is already selected, but naming a real
          // cadence sharpens the trigger line in your skill.md.")]
          prompt: () => 'When does it run?',
          hint: 'Ad Hoc is fine. A real cadence just sharpens the trigger line in your file.',
          allowCustom: true,
          customPlaceholder: 'Your own cadence — type it and add it',
          options: [
            { key: 'ad_hoc', label: 'Ad Hoc' },
            { key: 'each_morning', label: 'Each morning before standup' },
            { key: 'on_request', label: 'On request' },
            { key: 'weekly_monday', label: 'Weekly, first thing Monday' },
            { key: 'after_meeting', label: 'Right after a meeting ends' },
          ],
        },
        {
          id: 'skill_inputs',
          type: 'multi-select',
          // [VERBATIM title and seeds; hint ADAPTED from "Whatever already
          // feeds this deliverable today — a queue, an inbox, a transcript.
          // Nothing to connect yet, just name it."]
          prompt: () => 'What does this skill read before it starts?',
          hint: 'Whatever feeds it today. Nothing to connect yet — just name it.',
          allowCustom: true,
          customPlaceholder: 'Something else it reads',
          options: [
            { key: 'report', label: 'A report or one-pager' },
            { key: 'deck', label: 'A presentation or deck' },
            { key: 'spreadsheet', label: 'A spreadsheet or workbook' },
            { key: 'dashboard', label: 'A dashboard' },
            { key: 'email_thread', label: 'An email thread' },
            { key: 'inbox', label: 'My inbox' },
          ],
        },
        {
          id: 'skill_tools',
          type: 'multi-select',
          // [NEW question line; VERBATIM seeds; hint ADAPTED from Guide Me
          // ("'a report in Power BI' sharpens the result far more than 'a
          // report' alone")]
          prompt: () => 'Which tools does it live in?',
          hint: '"A report in Power BI" beats "a report." Name the real tool.',
          allowCustom: true,
          customPlaceholder: 'Another tool — type it and add it',
          options: [
            { key: 'outlook', label: 'Outlook / Email' },
            { key: 'teams', label: 'Teams' },
            { key: 'slack', label: 'Slack' },
            { key: 'sharepoint', label: 'SharePoint / OneDrive' },
            { key: 'excel', label: 'Excel / Sheets' },
            { key: 'servicenow', label: 'ServiceNow' },
            { key: 'jira', label: 'Jira' },
            { key: 'salesforce', label: 'Salesforce' },
            { key: 'powerbi', label: 'Power BI / Tableau' },
            { key: 'word', label: 'Word / Docs' },
          ],
        },
        {
          id: 'skill_data_home',
          type: 'single-select',
          // [NEW — Actions absorption 1b. "I'm not sure" is a first-class
          // answer, never an error; the derived Actions.md prints it as a
          // finding (core/files/deriveActions.ts).]
          prompt: () => 'Where does that stuff actually live?',
          hint: `"I'm not sure" is a real answer. Your Actions file will turn it into the exact question to ask IT.`,
          allowCustom: true,
          customPlaceholder: 'Somewhere else — type it',
          options: [
            { key: 'in_tool', label: 'In the tool I named' },
            { key: 'shared_drive', label: 'In a shared drive or folder' },
            { key: 'someones_head', label: "In someone's head" },
            { key: 'not_sure', label: "I'm not sure" },
          ],
        },
        {
          id: 'skill_steps',
          type: 'text',
          multiline: true,
          // [VERBATIM title; hint ADAPTED from "The same way you'd hand it to
          // a new hire on their first day — trigger, then in order, exactly
          // what happens."]
          prompt: () => 'Write it as steps, not a description.',
          hint: 'Like you’d hand it to a new hire: in order, one action per line.',
          placeholder: '1. …',
          interpret: {
            via: 'ai-assist',
            reflectPrefix: "Here's the recipe I heard:",
            // [ADAPTED from the wizard's stepsAssistPrompt — grounding lines
            // and the interview-first instruction kept; "skill.md" renamed
            // for the single-file world. The record's own earlier answers
            // are not reachable from a top-level buildPrompt ctx, so the
            // grounding block asks the AI to collect what it needs — the
            // same interview-first behaviour, one question earlier.]
            buildPrompt: (raw) =>
              `I'm writing the Skills file for a recurring task — a short, ordered recipe an AI can run by name instead of me re-explaining it every time.\n\nHere's what I have so far:\n"${raw}"\n\nAsk me 2-3 quick clarifying questions about exactly what happens, in what order, when I do this task. Then reply with ONLY a numbered list of steps — each one a single, concrete action, not a restatement of the whole task. 3 to 7 steps, no preamble, no explanation. Ready to paste directly back in.`,
          },
        },
        {
          id: 'skill_output',
          type: 'single-select',
          // [VERBATIM title, seeds and hint]
          prompt: () => 'What shape does it come back in?',
          hint: "The format you'd want every time, so you're never re-explaining that part either.",
          allowCustom: true,
          customPlaceholder: 'Your own shape — type it and add it',
          options: [
            { key: 'md_list_severity', label: 'A single markdown list, grouped by severity' },
            { key: 'one_page_decisions', label: 'A one-page summary, decisions first' },
            { key: 'action_items', label: 'Dated, owned action items' },
            { key: 'short_paragraph', label: 'A short paragraph, no bullets' },
            { key: 'before_after_table', label: 'A table comparing before and after' },
            { key: 'ranked_list', label: 'A ranked list, most urgent first' },
          ],
        },
        {
          id: 'skill_autonomy',
          type: 'single-select',
          // [NEW — Actions absorption 2: the approval-gate pattern, the one
          // thing the sibling's Actions builder said was the same for
          // everyone.]
          prompt: () => 'If this could run without you — should it?',
          hint: 'This writes your Actions file. You can change your mind any time.',
          options: [
            { key: 'myself', label: "I'd run it myself" },
            { key: 'draft', label: 'Draft it, I approve it' },
            { key: 'auto', label: 'Fully automatic' },
            { key: 'never', label: 'Never — this one stays human' },
          ],
        },
        {
          id: 'skill_owner',
          type: 'single-select',
          // [NEW — decision #4's marking: the personal/team split ships even
          // though the team module does not.]
          prompt: () => 'Is this recipe yours, or the team’s way?',
          hint: 'Team recipes are the ones worth sharing when your team builds a shared set.',
          options: [
            { key: 'mine', label: 'Mine' },
            { key: 'team', label: "My team's" },
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------
// Module skl3 — Worth handing over
// ---------------------------------------------------------------------
const worthHandingOver: Module = {
  id: 'skl3',
  number: 3,
  title: 'Worth handing over',
  purpose: 'What the file does now, and the file that just wrote itself.',
  required: true,
  estimatedMinutes: [1, 1],
  nodes: [
    q({
      id: 'skills_wrap',
      type: 'intro',
      prompt: () => "That's a real Skills file.",
      // [NEW — the wrap, including the reveal Adam kept ("happy with the big
      // reveal as it is now", 2026-08-26).]
      beats: [
        'Hand it to your AI with your Context file and ask for one of these __by name__.',
        'And quietly, something else just happened: __your Actions file wrote itself__ — every skill you marked for automation, what it would need, and what to find out first. It’s on your home screen.',
      ],
    }),
  ],
};

export const SKILLS_INTERVIEW_MODULES: Module[] = [whatRepeats, recipes, worthHandingOver];

/**
 * The Skills.md outline — ONE section, deliberately, and the first draft's
 * three is worth recording as the mistake it was. The outline describes the
 * FILE, and the file has one kind of section: recipes. The intro and the wrap
 * are flow screens, not file content — an outline section holding only an
 * intro counts zero questions, and a zero-question section can never be
 * 'done', so `fileFinished` would have been false forever and the derived
 * Actions.md unreachable (found by driving Home, not by reading). The shape
 * is exactly Context's `sec2-1`: the seed multi and the block's fields
 * together, so the section is reached when seeding starts (outline.ts's
 * ported rule) and its health counts the fields per record.
 */
export const SKILLS_FILE_OUTLINE: FileOutlineNode[] = [
  {
    id: 'skl1',
    label: '1. Your Recipes',
    questionIds: [
      // The two flow-only intros ride here because the adapter requires every
      // question to map to a section; health excludes intro-kind from its
      // counts (the probe that found the zero-total bug proved sec1 counts 2
      // of its 4 ids for exactly this reason), and they contribute no file
      // text.
      'skills_orientation',
      'skills_wrap',
      'skill_seed',
      'skill_trigger',
      'skill_inputs',
      'skill_tools',
      'skill_data_home',
      'skill_steps',
      'skill_output',
      'skill_autonomy',
      'skill_owner',
    ],
  },
];
