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
  questionOf: (n: number, total: number, module: string) => `Question ${n} of ${total} · ${module}`,
  back: 'Back',
  next: 'Next',
  skip: 'Skip',
  rephrase: 'Ask me that a different way',
  addYourOwn: '+ add your own',
  addYourOwnPrompt: 'What should it say?',
  addYourOwnConfirm: 'Add',
  yes: 'Yes',
  no: 'No',

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
