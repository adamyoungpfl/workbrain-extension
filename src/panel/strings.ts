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
  /**
   * V1.1 VB-08. The label on the button that drops a written starter answer
   * into a text question's field (see core/flow/ideas.ts — static content,
   * no AI, cycling on repeat presses).
   *
   * Kept in the same register as `rephrase` above: both are things the person
   * says *to* the panel, not names for a feature. "Example" is a word they
   * brought with them — unlike "idea", which is what the ported source calls
   * this data internally and would have the button describing the code.
   * Present tense, active, four words, and a verb someone stuck at a blank box
   * would actually say out loud.
   */
  giveExample: 'Give me an example',
  /**
   * V1.3 VB-18 — the narrator toggle's accessible name, in both states.
   *
   * Never printed: the control is an icon in the top-right corner, and a label
   * beside it would be four words of chrome above a question. It is what a
   * screen reader announces and what a pointer's tooltip shows, so it has to
   * say what pressing it does, not what the feature is called: "Read questions
   * aloud", not "Narrator". `aria-pressed` carries which way it is set, which
   * is why this does not flip to "Turn narrator off" — a control that renames
   * itself as you use it has to be re-learned on every press.
   */
  narrator: 'Read questions aloud',
  /**
   * Spoken at the end of the reflect screen's playback, and nowhere printed —
   * the three buttons are on screen saying the same thing, so printing it
   * again would be the same instruction twice. It exists because someone
   * listening has just heard their own answer read back and needs to know what
   * they can do about it. Ported in spirit from the sibling app's
   * REFLECT_SPOKEN_CTA, reworded to name this panel's actual buttons.
   */
  narratorReflectCta: 'Keep it as-is, tighten it with your AI, or say it again.',
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

  /**
   * V1.3 VB-19 — section health in List mode.
   *
   * EXTENDING THE EXISTING BADGE LANGUAGE, NOT STARTING A SECOND ONE. Home
   * already prints `badgeDue` ("1 due") and `badgeCurrent` against
   * `FileRow`'s fresh/due/next tones, and the drawer already prints
   * `sectionsOf`. Those are reused verbatim here rather than restated, so a
   * section that is due in the drawer is due in the same words on Home.
   * `fileTreeStateUntouched` ("Not yet") is likewise reused as the fifth
   * state's own pill label — it is already the right word, said in the right
   * register, and a second one would be drift.
   *
   * Four state words are genuinely new, because the drawer now draws a
   * distinction the tree never did: the tree knows written / writing /
   * untouched, and this splits "written" into finished, finished-but-aged,
   * and part-done. One word each, because they sit in a pill in a 400px
   * panel beside a section name that may be twenty-five characters long.
   *
   * The detail line is the part the pill cannot carry: how much of the
   * section is answered, and either what was passed on or how long ago it was
   * written. Both halves are plain counts — never a percentage and never a
   * score (docs/GUARDRAILS.md rules out a composite score out of 100), and
   * never a congratulation, which is the line VB-19 flags as easy to cross by
   * accident once a list has pills on it.
   */
  sectionStateHere: 'Here',
  sectionStateDone: 'Done',
  sectionStateDue: 'Due',
  sectionStatePartly: 'Partly',
  sectionAnsweredOf: (answered: number, total: number) => `${answered} of ${total}`,
  sectionSkipped: (n: number) => `${n} skipped`,
  /** `ago` arrives already worded by `agoLabel` — "7 months", "3 days". */
  sectionAnsweredAgo: (ago: string) => `answered ${ago} ago`,
  sectionAnsweredToday: 'answered today',
  /** The counts across the top of the list. VB-19 fixes the rows in FILE
   * ORDER — the list is the file — so these do the "what needs attention"
   * job that sorting by status would otherwise have to. */
  sectionSummaryLabel: 'How your file is doing',
  sectionSummaryPartly: (n: number) => `${n} partly`,
  sectionSummaryNotYet: (n: number) => `${n} not yet`,
  sectionSummaryDone: (n: number) => `${n} done`,

  /**
   * V1.2 VB-12 — the drawer's grab handle. Two strings, and neither is ever
   * printed: the handle is a rule with a grip on it, and the whole point of
   * VB-12's "it should be obvious it's a handle without a tooltip explaining
   * it" is that the picture does the explaining for anyone who can see it.
   *
   * `drawerHandle` is the separator's accessible name, so it does two jobs at
   * once: it keeps the heading V1.1 printed above the tree ("Your file so
   * far") available to a screen reader, and it says what dragging does — the
   * one audience that cannot see a grip is the one that needs telling.
   *
   * `drawerHandleValue` is its `aria-valuetext`. `aria-valuenow` carries the
   * real height in pixels because that is what the range is measured in;
   * "three hundred and six" is a useless thing to hear, so what gets spoken
   * is how far open it is.
   */
  drawerHandle: 'Your file so far — drag to resize',
  drawerHandleValue: (percent: number) => `${percent}% open`,

  /**
   * V1.2 VB-14 — the Brain globe. Four strings, and three of them are only
   * ever heard, not seen: the picture says everything a sighted person needs,
   * and a picture says nothing at all to a screen reader.
   *
   * `brainGlobeNode` deliberately reuses the three `fileTreeState*` words
   * above rather than inventing a second vocabulary for the same three
   * states. The globe and the list are two views of one file; a section that
   * is "Written" in one must not be "Done" in the other.
   *
   * "Turn" rather than "rotate", "step between" rather than "navigate" —
   * words a person would say (docs/design-system.html §08).
   */
  /**
   * V1.2 VB-14b — the drawer's two modes.
   *
   * The names are decided in docs/V1.2-REFINEMENT.md's "Iteration three" and
   * are not up for rewording here: `Brain` and `List`. "Brain" passes
   * docs/design-system.html §08's test — it is already in the product's own
   * name, so it is not a noun the person did not bring — and "List" is a word
   * everybody arrives with. (`Map` / `Outline` is the recorded alternative if
   * "Brain" ever reads as too cute on every screen.)
   *
   * `drawerModes` is the group's accessible name and is never printed: the two
   * buttons are visible and say what they do, so a printed label above them
   * would be a third piece of text in a 44px bar. It exists because a group of
   * controls with no name is a group a screen reader cannot describe.
   */
  drawerModes: 'How to show your file',
  drawerModeBrain: 'Brain',
  drawerModeList: 'List',

  brainGlobeStage: 'Your file, as a globe',
  brainGlobeHelp: 'Drag to turn it. Tab to step between sections.',
  brainGlobeNode: (label: string, state: string) => `${label} — ${state}`,
  brainGlobeInside: (label: string) => `Inside ${label}`,
  brainGlobeBack: 'Back to the whole file',

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
