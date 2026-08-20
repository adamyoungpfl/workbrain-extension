/**
 * Every user-facing string in the panel, in one reviewable place.
 *
 * WHY THIS FILE EXISTS
 * The product's binding constraint is that a competent adult who does not think of themselves
 * as technical must finish alone, first try, without asking anyone for help. That constraint
 * dies by a thousand small decisions — a "Continue" here, an "Oops!" there — and it dies
 * invisibly, because each one reads fine on its own. Keeping copy in one file makes it
 * reviewable as a body of work, and testable.
 *
 * RULES (docs/design-system.html §08, binding)
 *  - Second person, present tense, active voice.
 *  - No product nouns the person did not bring. They know "file", "notes", "list".
 *    They do not know "context object", "artifact", "schema", "gate", "instance".
 *  - Buttons are verbs the person would say: "Answer 2 questions", not "Continue".
 *  - Errors say what to do next. Never apologise, never blame, never "Oops".
 *  - Sentences under 20 words, one idea each. Target reading grade 7.
 *  - Numbers as words where small: "Two questions" reads easy, "2 questions" reads like a form.
 *
 * DO NOT put a user-facing string in a component. `npm run audit` fails the build if you do.
 * Interview question wording does NOT live here — it is ported verbatim, see core/flow/source.ts.
 * Nor do the per-question "deeper dive" follow-ups (V1.1 VB-03) — they are content keyed to
 * individual question ids, not interface chrome, and live in core/flow/deepDive.ts. That file
 * carries its own reading-level test, since `npm run audit` only measures this one.
 */

export const S = {
  // ---------------------------------------------------------------- chrome
  appName: 'Workbrain',
  savedNote: 'Saved on this device',
  privacyNote: 'Nothing leaves your browser',
  homePrivacyNote: 'Everything here lives in your browser. No account, nothing sent anywhere.',

  // ---------------------------------------------------------------- the four steps
  // Internally gates 1–4. The word "gate" never appears in the interface.
  steps: ['Name', 'Repeat', 'Act', 'Share'] as const,
  utilization: (pct: number) => `${pct}% set up`,
  stepOf: (n: number, total: number) => `Step ${n} of ${total}`,

  // ---------------------------------------------------------------- flow runner
  /**
   * V1.1 VB-02. Never rendered on screen — this is the `aria-valuetext` of the
   * flow's progress bar and nothing else (see components/FlowProgress.tsx).
   * The bar replaced a printed "Question 12 of 38 · About Me" breadcrumb: the
   * count invited arithmetic instead of an answer. Taking a number off the
   * screen is a design decision; taking it away from a screen reader would be
   * a bug, so it lives on here.
   */
  questionOfSr: (n: number, total: number) => `Question ${n} of ${total}`,
  back: 'Back',
  next: 'Next',
  skip: 'Skip',
  rephrase: 'Ask me that a different way',
  addYourOwn: '+ add your own',
  addYourOwnPrompt: 'What should it say?',
  addYourOwnConfirm: 'Add',
  yes: 'Yes',
  no: 'No',

  /**
   * V1.1 VB-05 / VB-06 — the module transition screens, keyed by module id
   * (core/flow/source.ts's own ids). One per module except the first: module
   * one already opens with `orientation_ready` and closes with
   * `architecture_orientation`'s beats, so a transition there would be a
   * third welcome in a row.
   *
   * Approved verbatim in docs/V1.1-COPY-DRAFT.md. Do not reword a line.
   *
   * `beats` play one at a time, at reading pace — `__double underscores__`
   * mark a light underline emphasis (see core/flow/beats.ts, and the same
   * convention on the ported `architecture_orientation`). `preview` is the
   * example beat: what this module's answers actually do downstream, shown
   * as a real preview rather than decoration. Module four's is two lines
   * because its approved copy is a genuine before/after.
   *
   * Module eleven carries three beats, not two: the copy draft's own
   * Module 11 pair, plus VB-06's decided "failure to launch" line, which
   * that section places "on the Module 11 transition … as the third beat".
   * Its preview line is approved separately, so both ship — dropping either
   * would drop approved copy.
   */
  moduleIntros: {
    'about-me': {
      beats: [
        'Now the basics: __who you are__ and what you actually do.',
        "Not your job title — the version you'd say out loud to someone at a party.",
      ],
      preview: ['This is what AI reads first, before anything else you tell it.'],
    },
    responsibilities: {
      beats: [
        "Next: what's __yours__ — and just as usefully, what isn't.",
        'This is the part that stops AI writing as if every call is yours to make.',
      ],
      preview: [
        'Two people with the same title can own completely different things. This is where you say which one you are.',
      ],
    },
    'my-world': {
      beats: [
        'Now the __names__ — the people, teams, and tools you mention constantly.',
        'Name them once here, and you stop explaining who they are every single time.',
      ],
      preview: [
        'Without this, you write: "Can you draft a note to Priya — she\'s my manager, she owns budget approvals, and she likes a heads-up before surprises."',
        'With it, you write: "Draft a note to Priya."',
      ],
    },
    initiatives: {
      beats: [
        "This one's the __longest__ section, and the one that pays off most.",
        'These are the named projects AI can actually help you move, not just describe.',
      ],
      preview: [
        'Worth the extra few minutes: this is the difference between AI writing about your work and AI helping with it.',
      ],
    },
    'how-i-think': {
      beats: [
        'The questions get __faster__ from here. Mostly taps, not typing.',
        'This part is about how you decide things — how fast, how certain, how much you want to be asked.',
      ],
      preview: ['Five quick picks. Under two minutes.'],
    },
    'how-i-communicate': {
      beats: [
        'Now your __voice__ — how things should sound when AI writes them for you.',
        "A few of these show you two versions side by side. Pick the one you'd actually send.",
      ],
      preview: ["This is the section people notice most in the results. It's why AI output stops sounding generic."],
    },
    'audience-profiles': {
      beats: [
        "You don't write to __everyone__ the same way.",
        'Your manager and your team get different versions of the same update. This is where you say so.',
      ],
      preview: ['Two questions.'],
    },
    'vocabulary-knowledge': {
      beats: [
        'Every workplace has its own __shorthand__.',
        'The acronyms, tool names, and project codenames that would lose an outsider completely.',
      ],
      preview: ['Teach it these once and you stop spelling them out mid-sentence forever.'],
    },
    'context-boundaries': {
      beats: [
        "The __rules__ AI doesn't get to talk itself out of.",
        'What would make you send a draft back, and what it should never do without asking you first.',
      ],
      preview: ["These stay on by default. You can turn any of them off, but most people don't."],
    },
    'reference-examples': {
      beats: [
        'Last one. Paste something you __wrote__.',
        "One paragraph teaches AI more about your voice than every answer you've given so far.",
        "Most people who stop, stop here — with the useful part already answered and the proof still ahead. Five more minutes and you'll see it work.",
      ],
      preview: ["Then you're done — and you get to see the whole thing actually work."],
    },
  } as const satisfies Record<string, { beats: readonly string[]; preview: readonly string[] }>,

  /**
   * V1.1 VB-07 / VB-07b — the file drawer docked under the interview: the
   * outline tree, and the real Context.md text assembling beneath it.
   *
   * `filePreviewNote` is ported verbatim from the sibling Context Builder's
   * own preview (quoted in docs/V1.1-REFINEMENT.md's VB-07b). Do not reword it.
   *
   * Everything else here is new panel chrome that docs/V1.1-COPY-DRAFT.md
   * does not cover — it approves the drawer's *behaviour* ("collapsed to a
   * peek by default") but writes no labels for it. Written to the same rules
   * as the rest of this file, deliberately plain: the drawer is a thing you
   * glance at, so its own words must not compete with the question.
   *
   * The three state words are not decoration. The tree marks a section's
   * state with a glyph and a colour, and docs/GUARDRAILS.md forbids colour
   * alone; these are the same distinction said out loud, carried to a screen
   * reader on every row.
   */
  fileTreeHeading: 'Your file so far',
  fileTreeRoot: (name: string) => (name ? `${name} — Context.md` : 'Context.md'),
  fileTreeStateCurrent: 'Writing now',
  fileTreeStateReached: 'Written',
  fileTreeStateUntouched: 'Not yet',
  fileTreeGoTo: (label: string) => `Go to ${label}`,
  fileTreeExpand: (label: string) => `Show what is inside ${label}`,
  fileTreeCollapse: (label: string) => `Hide what is inside ${label}`,
  filePreviewNote:
    "This is your file assembling as you answer — each section appears the moment you reach it. It's plain text, copy it any time.",

  // ---------------------------------------------------------------- reflect
  reflectHeading: "Here's what I've got.",
  reflectSub: 'Nothing has been sent anywhere. Keep it, or let your own AI tighten it.',
  reflectKeep: 'Keep it as-is',
  reflectTighten: 'Tighten it with my AI',
  reflectRedo: 'Say it again',
  reflectPromptTag: 'Ask your AI this',
  reflectPasteLabel: 'Paste what it says here',
  reflectNeedPaste: 'Paste what your AI said, or go back and keep your own words.',
  reflectUseThis: 'Use this instead',

  // ---------------------------------------------------------------- the proof
  // The prompts and per-service tips are ported — see docs/CONTENT-SOURCES.md,
  // R1-11, and src/core/flow/proofSource.ts. Everything below is new panel
  // chrome, not ported content — chip labels, field labels, and the score
  // prompts are the interface's own words, never the AI's.
  proofHeading: "Let's prove it works.",
  proofSub: 'First a baseline: the same question, with nothing loaded.',
  proofPickAI: 'Which AI do you use most?',
  proofAskThis: 'Ask this in a fresh chat, with nothing loaded:',
  proofPaste1: 'Paste its answer here',
  proofWithFile: 'Now the same question, with your file attached.',
  proofPaste2: 'Paste the second answer here',
  proofGrade: 'Have it grade its own two answers.',
  proofPaste3: 'Paste the grade here',
  proofDone: 'That difference is your context working.',
  proofDoneSub: 'Shown exactly as your AI wrote it. The panel never reads or scores it.',
  copyPrompt: 'Copy',
  copyToClipboard: 'Copy to clipboard',
  copied: 'Copied',
  proofCta: 'Prove it works',
  proofFinished: "That's the whole loop.",
  // Chip labels for the service picker — key order matches
  // manifest.config.ts's optional_host_permissions (chatgpt.com, claude.ai,
  // gemini.google.com, copilot.microsoft.com), confirmed in
  // proofAdapter.test.ts. Labels only — the attach instructions for each
  // service are ported verbatim, see src/core/flow/proofSource.ts.
  proofServiceOptions: [
    { key: 'chatgpt', label: 'ChatGPT' },
    { key: 'claude', label: 'Claude' },
    { key: 'gemini', label: 'Gemini' },
    { key: 'copilot', label: 'Copilot' },
    { key: 'other', label: 'Something else' },
  ] as const,
  proofScoreBaselineLabel: 'Score for the first answer, out of 10',
  proofScoreContextLabel: 'Score for the second answer, out of 10',
  errNeedScore: 'Type a score from 0 to 10 for both answers, or skip this question.',
  proofScoreDelta: (delta: number) => {
    if (delta > 0) return `${delta} points higher with your file.`;
    if (delta < 0) return `${Math.abs(delta)} points lower with your file.`;
    return 'The same score either way.';
  },

  // ---------------------------------------------------------------- the file
  fileContext: 'Context.md',
  fileContextWhat: 'Who you are',
  fileSkills: 'Skills.md',
  fileSkillsWhat: 'How you work',
  fileActions: 'Actions.md',
  fileActionsWhat: 'What should happen automatically',
  download: 'Download your file',
  downloadAgain: 'Download it again',
  importFile: 'I already have a file',
  importPick: 'Choose your Context.md',
  keepACopy: 'Your file changed a lot this month. Worth keeping a copy somewhere.',

  // ---------------------------------------------------------------- home
  homeFilesLabel: 'Your files',
  homeHelpLabel: 'If you want a hand',
  homeHelpTitle: 'Talk to a person',
  homeHelpSub: 'Coaching, or help for your team',
  badgeCurrent: 'Current',
  badgeNext: 'Next',
  badgeLater: 'Later',
  badgeDue: (n: number) => `${n} due`,
  lockedNeedsFirst: (file: string) => `Finish ${file} first`,
  notBuiltYet: 'Not built yet',
  updatedToday: 'Updated today',
  daysOld: (n: number) => (n === 1 ? '1 day old' : `${n} days old`),
  sectionsOf: (done: number, total: number) => `${done} of ${total} sections`,
  // R1-12: the Context flow's own "done" screen hands off to Home instead of
  // showing its own end state — see App.tsx/Flow.tsx. This is what a save
  // failure right on the last question falls back to, and what the proof
  // loop's own finished screen offers as its only way onward.
  backToFiles: 'Back to your files',

  // ---------------------------------------------------------------- freshness
  // Always says WHY, in the person's own words. Never "your data is stale".
  driftHeading: (n: number) =>
    n === 1 ? 'One part of your file is out of date' : `${wordFor(n)} parts of your file are out of date`,
  // Fixed at R1-12: the earlier copy claimed a stated duration ("good for
  // about a year") that no ported question ever actually collects — see
  // core/flow/source.ts's role_durability, a bare current/historical pick.
  // This says only what's true: that the answer was "current", and how long
  // ago it was given.
  driftBecauseRole: (role: string, ago: string) => `You said your ${role} role was current. That was ${ago} ago.`,
  driftBecauseInitiative: (name: string) =>
    `You gave "${name}" success criteria back when you set it up.`,
  driftAction: (n: number) => `Answer ${wordFor(n)} question${n === 1 ? '' : 's'}`,
  allCurrentHeading: 'Your file is current',
  allCurrentSub: 'Nothing to do. Come back when something changes at work.',
  /** core/freshness's elapsed-time shape, in words — digits, matching the
   * precedent `daysOld` already sets for a measured span rather than a
   * small count (that rule is for things like "Two questions", not a
   * duration). */
  agoLabel: (n: number, unit: 'day' | 'month' | 'year') => `${n} ${unit}${n === 1 ? '' : 's'}`,

  // ---------------------------------------------------------------- welcome
  // V1.1 VB-01. The first thing a person ever sees. Approved verbatim in
  // docs/V1.1-COPY-DRAFT.md — do not reword any of these four lines.
  //
  // `emptyNoFile` ("You have not started yet.") used to head this screen and
  // is gone: it described a lack, opened with the person's failure to have
  // done something, and told them nothing about what the thing is. The
  // headline below does the same job forwards.
  brandByline: 'by Model Citizen',
  welcomeHeadline: 'Teach AI who you are, once.',
  welcomeSub: 'Answer some questions. Get a file. Hand it to whatever AI you already use.',
  /** Structural estimate, not measured — flagged as such in the copy draft.
   * Also the promise that nothing is lost by stopping, which is true: every
   * answer is written to `wb:answers` as it is given, and the flow re-derives
   * where to resume (core/flow/runner.ts's findPosition). */
  welcomeTime: 'About fifteen minutes. You can stop anywhere and pick up where you left off.',

  // ---------------------------------------------------------------- empty states
  emptyNoFileAction: 'Start with a few questions',
  emptyNewDevice: 'New here? If you already made a file, bring it with you.',
  emptyNoSkills: 'No skills yet.',

  // ---------------------------------------------------------------- errors
  // Every one names the next action. None of them apologise.
  errNeedName: 'Add a name so the file has something to call you. First name is plenty.',
  errPickOne: 'Pick one to keep going, or skip this question.',
  errNeedAnswer: 'Answer this to keep going, or skip it.',
  errSaveFailed: 'That did not save. Try once more, or download your file to be safe.',
  errFileUnreadable: 'I could not read that file. Pick the Context.md you downloaded from here.',
  errFileWrongKind: 'That looks like a different kind of file. Look for one ending in .md.',

  // ---------------------------------------------------------------- confirmations
  toastSaved: 'Added to your file',
  toastDownloaded: 'Downloaded. Keep it somewhere you will find it.',
  toastImported: (n: number) => `Brought back ${wordFor(n)} answers`,
  toastScored: (v: string) => `Scored ${v} out of 5`,
} as const;

/** Small numbers read as words. "Two questions" is easy; "2 questions" is a form. */
function wordFor(n: number): string {
  const w = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n >= 0 && n <= 10 ? (w[n] as string) : String(n);
}

export type Strings = typeof S;
