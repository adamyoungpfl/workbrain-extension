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

/**
 * V1.7 VB-36's word for a file that is part of the story and not part of this
 * release. Hoisted out of the object because V1.8 VB-47 says it in two places
 * — the badge on Home's shelf and a locked button's name in the drawer's
 * toggle — and a word said twice is a word that gets changed once.
 */
const LOCKED = 'Locked';

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
  /** [DRAFT] V2.4 VB-112 — the one name all three doors home share: the
   * top-left mark, the breadcrumb root, and the globe's drawn house. */
  goHome: 'Go to the home screen',
  /** [DRAFT] V2.4 VB-103 — a browse-canvas row's name: pressing it selects
   * the section in the Brain above, never jumps into questions. */
  fileTreeSelect: (title: string) => `Show ${title} in the picture`,
  /** [DRAFT] V2.4 VB-102 — the browse canvas's one door into the interview. */
  browseEdit: 'Edit the file',
  /** [DRAFT] V2.5 VB-124 — the share/backup row on the skills canvas. The
   * verbs are the person's ("save a copy", "add from a file"), never
   * "export"/"import"/"pack". */
  /** [DRAFT] V2.5 VB-114 — the dime tour's own advance button, per slide. */
  tourNext: 'Show me',
  tourStart: 'Start the questions',
  skillsShareSave: 'Save a copy of my skills',
  skillsShareAdd: 'Add skills from a file',
  skillsShareSaved: 'Saved. The copy is in your downloads.',
  skillsShareAdded: (added: number, skipped: number) =>
    skipped === 0
      ? added === 1
        ? 'Added 1 skill.'
        : `Added ${added} skills.`
      : `Added ${added}, and ${skipped} could not come along.`,
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
   * [DRAFT] V2.4 VB-109 — the name generator on the two name questions
   * (core/flow/nameGenerator.ts). Same register as `giveExample` above: a
   * verb the person stuck at the box would say out loud — and on a name
   * question, "one" can only mean a name. The button drops a made-up famous
   * mashup into the field via the exact ideas mechanic; pressing again deals
   * the next one.
   */
  makeUpName: 'Make one up for me',
  /**
   * [DRAFT] V2.5 VB-119 — "Let my AI ask me" grows up into AI Assist: the
   * name on the helper chip, and the title of the full-height sheet it
   * opens (the stepped mini-interview — their own AI interviews them and
   * hands back a finished answer, landed in the same field). A NAME rather
   * than V2.3's spoken verb, per Adam's design; the sheet's own step lines
   * do the talking (core/flow/assistCopy.ts — interview voice lives in
   * core, chrome lives here).
   */
  assist: 'AI Assist',
  /**
   * [DRAFT] V2.5 VB-120 — the same chip while a text draft sits under its
   * kind's character threshold, unassisted (core/flow/assistThresholds.ts,
   * judged live): the same door, warmly recommended, breathing the one
   * sanctioned cue. The word is about the OFFER — never "your answer is
   * too short", never any word about the box (GUARDRAILS' no-guilt-nudges;
   * the sheet's encouraging lead rides the same law, pinned in
   * assistCopy.test.ts).
   */
  assistRecommended: 'AI Assist (Recommended)',
  /**
   * [DRAFT] V2.5 VB-119 — step 2's door: opens the AI the person named at
   * the goal gate in the browser. Only ever rendered with a real service
   * name ('other' and an unanswered gate get no link at all —
   * core/flow/assistServices.ts).
   */
  assistOpenService: (service: string) => `Open ${service}`,
  /** [DRAFT] V2.5 VB-119 — step 2's advance. Their words, not ours: the
   * button confirms what they just did over in their AI's tab. */
  assistStarted: "I've started the interview",
  /** [DRAFT] V2.5 VB-119 — step 3's submit: closes the sheet and lands the
   * pasted answer in the question's own box, editable. */
  assistUse: 'Put it in my answer',
  /** [DRAFT] V2.5 VB-119 — step 3 submitted with nothing in the box. Says
   * what to do next; the person's own words remain a first-class way out. */
  assistNeedPaste: 'Paste what your AI wrote, or close this and type your own answer.',
  /** [DRAFT] V2.5 VB-119 — spoken by the live region as the sheet closes,
   * for anyone who cannot see the answer land and the input pulse. */
  assistLanded: 'Your answer is in the box below. You can edit it.',
  /**
   * V1.8 VB-42 — the follow-up links under a question.
   *
   * `followUpsLabel` names the group. It is never printed: the links are read
   * as part of the question they sit under, and a heading above them would be
   * chrome. It exists so someone hearing the panel is told what the thing they
   * have landed in is, which matters more now that it holds one link at a time
   * instead of a visible row.
   *
   * V1.8 also had `followUpsShowAll` — "Show all", WCAG 2.2.2's visible stop.
   * V2.0 VB-57 deletes the control and the string with it: the rotation now
   * stops permanently the first time the person touches the question and never
   * resumes (docs/V2.0-REFINEMENT.md FLAG 1), which is the mechanism the
   * criterion asks for, reached without another word on the screen.
   */
  followUpsLabel: 'More about this question',
  /**
   * V1.8 VB-49 — the OS dictation hint, on the first question with a real
   * paragraph to write.
   *
   * THERE IS NO MICROPHONE IN THIS PRODUCT AND THIS COPY MUST NEVER IMPLY
   * ONE. It points at the dictation the person's own computer already has,
   * which types into this field the same way it types into any other. Nothing
   * is recorded here, nothing is sent anywhere, and no permission is asked
   * for — see core/flow/dictation.ts for the four reasons a microphone is not
   * viable in a side panel.
   *
   * So the sentence starts with the person's own machine ("Your Mac can type
   * what you say"), not with the panel offering a feature. The shortcut is
   * named exactly, because a hint you have to go and look up is not a hint.
   * "Got it" dismisses it for good — it is what someone says, and it does not
   * pretend to be a choice with two sides.
   */
  /* V2.1. This line used to say "Press the Fn key twice, then talk." and state
     it as fact. It is wrong in three ordinary situations: Dictation ships off
     and has to be turned on; its shortcut is user-configurable; and other
     dictation apps commonly bind the same double tap, so Fn-Fn may open one of
     those instead. The last of those is the least harmful — something is still
     typing what you say — but the first two leave a person tapping a key that
     does nothing, having been told plainly that it would work.

     So: name the setting, because that is the part that is always true and the
     part they need in order to find it, and give the shortcut as the usual
     case rather than a promise. */
  dictationMac: 'Your Mac can type what you say. Turn on Dictation in Settings. It usually starts with two taps of the Fn key.',
  dictationWindows: 'Windows can type what you say. Press the Windows key and H, then talk.',
  dictationDismiss: 'Got it',
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
   * they can do about it. (V2.3 VB-95: the spoken CTA moved to
   * core/flow/reflectFrames.ts's reflectVoiceLine — computed, because it
   * names the person's own AI — injected via src/panel/voice/copy.ts.)
   */
  addYourOwn: '+ add your own',
  /**
   * V2.0 VB-60 — the same action, on the orb picker, where the `+` is DRAWN.
   *
   * The pill row prints its plus as a character because a pill is a word in a
   * box and the glyph has to come from somewhere. The orb picker's add control
   * is "a smaller, faintly glowing orb with a pulsing `+`" — the plus is the
   * thing inside the orb, stroked so it survives greyscale, and printing a
   * second one in the label would put two pluses side by side.
   *
   * It is the whole accessible name, not a shortening of `addYourOwn`, so what
   * a screen reader says and what is printed are the same words (WCAG 2.5.3).
   */
  addYourOwnOrb: 'add your own',
  /**
   * V2.0 VB-60 — what the orb group is, for someone who cannot see that the
   * outline is travelling round it.
   *
   * The travelling outline says "one or several" to the eye and says nothing at
   * all to a screen reader, so the group carries it in words instead. Appended
   * to the question, which is the group's accessible name, rather than printed:
   * the sentence is about how to answer, and the answer is right there.
   */
  orbPickHint: 'Pick one or several.',
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
  /* V1.8 VB-47: `fileTreeRoot` — "Ada — Context.md", printed above the
     sections — is gone. The file-type toggle in the strip above the list names
     the file now, so the line was the same filename said twice. Deleted rather
     than left here with no caller: a string nobody prints is a string the next
     person has to go looking for a screen for. */
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
   * written. Both halves are plain counts, and never a congratulation, which
   * is the line VB-19 flags as easy to cross by accident once a list has pills
   * on it.
   *
   * V1.6 VB-33 ADDED THE ONE PERCENTAGE. VB-19 wrote "never a percentage"
   * here, reading docs/GUARDRAILS.md's "no composite score out of 100" as
   * covering any number out of a hundred. VB-33 draws the line where the
   * guardrail actually draws it: what is banned is rolling several unlike
   * dimensions into one invented index. `sectionPercent` is one real ratio of
   * two counts printed beside it — answered over total — and nothing else. See
   * the long note over `sectionCompletionPercent` in
   * src/core/freshness/sectionHealth.ts, which is where the reasoning lives.
   */
  sectionStateHere: 'Here',
  sectionStateDone: 'Done',
  sectionStateDue: 'Due',
  sectionStatePartly: 'Partly',
  sectionAnsweredOf: (answered: number, total: number) => `${answered} of ${total}`,
  sectionSkipped: (n: number) => `${n} skipped`,
  /** `ago` arrives already worded by `agoLabel` — "7 months", "3 days". */
  sectionAnsweredAgo: (ago: string) => `answered ${ago} ago`,
  // V2.4 VB-110: the age lives at the row's right edge as a relative date
  // now; this line's subtitle duty retired. Kept for FileView until VB-102
  // retires that surface.
  sectionAnsweredToday: 'answered today',
  /** [DRAFT] V2.4 VB-110 — the stale date's accessible name: the word
   * carries what the color shows (FLAG 2, never color alone). */
  fileTreeAgeStale: (age: string) => `updated ${age} ago — time to review`,
  /** [DRAFT] V2.4 VB-110 — the record disclosure's label: what the person
   * calls them ("3 items"), never "records". */
  fileTreeRecords: (n: number) => (n === 1 ? '1 item' : `${n} items`),
  /**
   * V1.6 VB-33. The row shows the figure alone, because "7 of 13" is printed
   * an inch to its left and together they can only mean one thing. The word is
   * said out loud beside it, for anyone who meets the number without the count
   * — a screen reader reading the row's description, where "54%" on its own
   * would be a percentage of nothing named.
   */
  sectionPercent: (n: number) => `${n}%`,
  sectionPercentComplete: 'complete',
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

  /**
   * V2.1 VB-74 — the nav band's two words. One name each, at every depth,
   * which is the NarratorToggle rule: a control that renames itself as you
   * use it is a control that has to be re-learned every press. The retired
   * corner controls each carried a sentence naming their one destination
   * ('Back to the whole file', 'Back to your work brain'); a single Back
   * whose destination changes with the level cannot, and the trail directly
   * above it already prints where you are and where pressing it lands.
   */
  navBack: 'Back',
  navHome: 'Home',

  /**
   * V2.0 VB-71 — the one line that says the globe can be turned.
   *
   * **The words already existed and were only ever said out loud.**
   * `brainGlobeHelp` three lines up has told screen readers "Drag to turn it"
   * since V1.2; it lives in `.brainglobe-sr`, so a person looking at the stage
   * with a mouse in their hand has never been told anything. This is that same
   * sentence, given a place on the picture — which is why it is worded the same
   * way rather than being a second, cleverer version of it.
   *
   * "Drag" and "turn", not "rotate" or "orbit": docs/design-system.html §08's
   * rule about words a person would say, and the same two verbs the sentence
   * above the stage already uses. Seven words, one clause, no product noun —
   * "brain" is the product's own name and the button beside it is already
   * called Brain.
   *
   * It is the disc's accessible NAME as well as its tooltip. The disc is a real
   * button and pressing it puts the cue away for good, so the name is the tip
   * itself rather than "dismiss": a control named for its own housekeeping
   * would be the only thing on the stage that talked about the interface
   * instead of about the file.
   */
  brainTurnCue: 'Drag the brain to turn it',

  /**
   * V1.5 VB-25 — the unified glow, in words.
   *
   * The picture says it with one colour, and a colour says nothing to a screen
   * reader, so the same fact is available as a description on the stage. It is
   * a *description*, never announced: nothing about this state is an event.
   *
   * THE WORDING IS THE GUARDRAIL. "Every section is answered and up to date" is
   * a statement about the file. It is not "well done", it is not a count of
   * anything, and there is deliberately no opposite string — when the glow goes
   * the sentence goes with it, because "some sections are out of date" said on
   * a picture would be the nudge docs/GUARDRAILS.md rules out. What is out of
   * date is already said, once, where it can be acted on: the section's own row
   * in the List (components/SectionHealth.tsx).
   */
  brainGlobeUnified: 'Every section is answered and up to date.',

  /**
   * V1.4 VB-23 — the split. Picking a sub-node moves it to the left and opens
   * a panel of what it holds on the right.
   *
   * `brainGlobeDetail` names that panel for a screen reader and is never
   * printed: the panel already prints the sub-section's own name as its
   * heading, so a second copy above it would be a wasted line at 400px.
   * "What's in" rather than "Details of" — the person's word, not ours
   * (docs/design-system.html §08).
   */
  brainGlobeDetail: (label: string) => `What's in ${label}`,
  brainGlobeDetailEmpty: 'Nothing written here yet.',

  /**
   * V1.5 VB-27 — the node summary, on hover, on focus and on activation.
   *
   * ── COUNTS AND DATES, IN THAT ORDER, AND NOTHING ELSE ────────────────────
   *
   * Every string here prints a number the person could count themselves or a
   * date they could check. There is no percentage, no "how complete" and no
   * word that grades anything (docs/GUARDRAILS.md: "a composite score out of
   * 100. Real metrics only"), and core/flow/nodeSummary.ts has no field one
   * could be built from even if this file wanted to.
   *
   * ── IT BORROWS THE LIST'S OWN WORDS WHEREVER IT CAN ──────────────────────
   *
   * `sectionSkipped` and `recsLabel` are printed here unchanged, and the age
   * is worded by `agoLabel` exactly as `sectionAnsweredAgo` and `recStaleWhy`
   * word it. Brain and List are two views of one file; a section that is "1
   * skipped" in the drawer's list must not be anything else on its own node.
   *
   * `summaryAnswered` is a fragment rather than a reuse of `sectionAnsweredOf`
   * ("8 of 9") because in the list that pair sits beside a state pill that
   * says what is being counted, and here it is on its own.
   *
   * ── THE TWO COUNT LINES SAY WHAT AN ITEM IS ──────────────────────────────
   *
   * A node with a repeatable block holds things the person NAMED — three
   * roles, four people — and a node of plain questions holds answers. Two
   * sentences, because "3 items" is our word for both and neither of them is
   * a word anybody brought (docs/design-system.html §08).
   *
   * `summaryAge` is deliberately "3 months old" and never "not updated in 3
   * months": the same arithmetic, one of them a fact about the file and the
   * other an accusation about the person (see the recommendations block
   * below, which is written against the same line).
   */
  summaryNamed: (n: number) => (n === 1 ? '1 thing named here' : `${n} things named here`),
  summaryAnswers: (n: number) => (n === 1 ? '1 answer here' : `${n} answers here`),
  /** One bar of the distribution: the option's own label, and how many. */
  summaryCategory: (label: string, n: number) => `${label} — ${n}`,
  summaryCategoriesMore: (n: number) => `${n} more`,
  summaryAnswered: (answered: number, total: number) => `${answered} of ${total} answered`,
  /** `ago` arrives already worded by `agoLabel` — "7 months", "3 days". */
  summaryAge: (ago: string) => `${ago} old`,
  summaryToday: 'written today',

  // ---------------------------------------------------------------- reflect
  // [DRAFT] V2.3 VB-95 — the reflect step becomes a quick check: heading in
  // the register of a person confirming, the sub keeps only the trust line
  // (the ways forward moved into reflectFrames.ts's voice line, printed and
  // spoken under the quote).
  reflectHeading: 'Just a quick check.',
  reflectSub: 'Nothing has been sent anywhere.',
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
  // core/flow/proofAdditions.ts's ALL_PROOF_SERVICES: the manifest's four
  // named origins (confirmed in proofAdapter.test.ts), then V2.4 VB-105's
  // additions, then "other" last. Labels only — the attach instructions for
  // each service are ported verbatim (src/core/flow/proofSource.ts) or
  // authored in that voice (src/core/flow/proofAdditions.ts). The census in
  // src/panel/serviceChips.test.tsx holds this list, the goal gate's, and
  // the persona map to the same seven keys.
  //
  // [DRAFT] V2.4 VB-105 — the 'other' label is Adam's own title for it;
  // the KEY stays 'other', so stored answers and the attach-tip fallback
  // are untouched.
  proofServiceOptions: [
    { key: 'chatgpt', label: 'ChatGPT' },
    { key: 'claude', label: 'Claude' },
    { key: 'gemini', label: 'Gemini' },
    { key: 'copilot', label: 'Copilot' },
    { key: 'grok', label: 'Grok' },
    { key: 'perplexity', label: 'Perplexity' },
    { key: 'other', label: "Something Cooler You Don't Even Know About" },
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
  /**
   * V1.7 VB-37 — the file, opened.
   *
   * `fileSectionsLabel` heads the list of sections and is deliberately the
   * same shape as Home's own `homeFilesLabel` / `homeMultiplesLabel`: a short
   * uppercase label over a list, saying what the list is. "Sections" is a word
   * the file itself uses in `sectionsOf` ("7 of 10 sections"), so it is not a
   * new noun — but the label says it the way a person would.
   *
   * THE TWO ENTRY LABELS ARE THE SAME BUTTON IN TWO TRUE STATES. An unfinished
   * file resumes wherever `wb:answers` leaves off, so the button cannot claim
   * to start at the beginning — "go through the questions" is true whether it
   * is the first one or the thirtieth. A FINISHED file has nothing to resume
   * to, so that button walks it from the top instead, and says so. Neither is
   * "Continue" and neither is "Start", because neither of those is true in
   * both states.
   *
   * `fileSectionsClosed` is said only when NO section can be opened yet — a
   * file nobody has been through. It explains a screen where every row is
   * inert, which is the one moment that needs explaining; the moment a single
   * section opens, it goes.
   */
  fileSectionsLabel: 'Sections',
  // V2.4 VB-102: retired with FileView — the browse canvas's door is
  // `browseEdit`. Kept commented for the morning diff, delete after review.
  // fileGoThrough: 'Go through the questions',
  // V2.4 VB-102: retired with FileView — Browse has one Edit door whatever
  // the file's state. Kept commented for the morning diff.
  // fileGoThroughAgain: 'Go through them again',
  fileSectionsClosed: 'Each section opens once you have answered something in it.',
  download: 'Download your file',
  downloadAgain: 'Download it again',
  importFile: 'I already have a file',
  importPick: 'Choose your Context.md',
  keepACopy: 'Your file changed a lot this month. Worth keeping a copy somewhere.',

  // ---------------------------------------------------------------- home
  homeFilesLabel: 'Your files',
  /** V1.7 VB-38's row. Not "Your files" — these are parts of Context.md, not
   * a file of their own, and saying so is what keeps the shelf above it
   * meaning one thing. */
  homeMultiplesLabel: 'Also in your file',
  homeHelpLabel: 'If you want a hand',
  homeHelpTitle: 'Talk to a person',
  homeHelpSub: 'Coaching, or help for your team',
  badgeCurrent: 'Current',
  badgeNext: 'Next',
  badgeLater: 'Later',
  badgeDue: (n: number) => `${n} due`,
  /**
   * V1.7 VB-36 — the two things a locked slot on the shelf can truthfully say,
   * and the badge that marks it as one.
   *
   * Skills.md and Actions.md are on Home from now on, LOCKED (Adam, 2026-08-24):
   * they are the way into the Skills and Actions interviews, and showing them
   * is what makes Context.md read as step one rather than as the whole product.
   *
   * A LOCKED ROW SAYS WHAT UNLOCKS IT, IN THE ROW. `lockedNeedsFirst` is that
   * sentence and it is true right up until somebody finishes the file before
   * it — after which it reads as an instruction they have already carried out,
   * so the row swaps to `lockedComingLater`, which is the fact that is true
   * from then on. Which of the two a row prints is decided in
   * core/files/slots.ts (`afterFinished`), not here.
   *
   * "Coming later" and not "Coming soon": we are not promising a date.
   *
   * `badgeLocked` is the word in the pill. The row is already told apart by a
   * dashed edge, a padlock and its own subtitle, so this is the fourth signal
   * rather than the only one (docs/GUARDRAILS.md: nothing by colour alone).
   */
  lockedNeedsFirst: (file: string) => `Finish ${file} first`,
  lockedComingLater: 'Coming later',
  badgeLocked: LOCKED,

  /**
   * V1.8 VB-47 — the file-type toggle, where the "not yet" tag used to be.
   *
   * THREE STRINGS, AND TWO OF THEM ARE THE SHELF'S OWN. The names on the
   * buttons are `fileContext` / `fileSkills` / `fileActions` above, and what a
   * locked one says is `lockedNeedsFirst` / `lockedComingLater` — the same
   * sentences Home prints, because Adam's decision of 2026-08-24 is that the
   * two surfaces are one navigation and they must agree about a locked file.
   * Which of the two a file gets is decided in `core/files/toggle.ts`, not
   * here.
   *
   * `fileToggleLabel` is the group's accessible name and is never printed: the
   * three buttons are visible and say what they do, so a printed label above
   * them would be a fourth piece of text in a strip that has to fit a drawer.
   * "Which file" and not "File type" — a person picking between Context.md and
   * Skills.md is choosing a file, and "type" is a noun they did not bring.
   *
   * `fileToggleLockedName` is a locked button's whole accessible name, so
   * somebody who cannot see the padlock or the line under the strip hears the
   * file, the lock and what unlocks it on focus, before pressing anything.
   *
   * `fileToggleLockedNote` is that same fact printed. It names the file
   * because the line sits under three buttons and has to say which one it is
   * about.
   */
  fileToggleLabel: 'Which file',
  fileToggleLockedName: (file: string, reason: string) => `${file} — ${LOCKED}. ${reason}`,
  fileToggleLockedNote: (file: string, reason: string) => `${file} · ${reason}`,

  /**
   * V1.8 VB-48 — the work brain, one level above a file.
   *
   * SIX STRINGS, AND FOUR OF THEM ARE BORROWED. A file node is named with
   * `fileContext` / `fileSkills` / `fileActions`; a locked one says
   * `fileToggleLockedName`, the very sentence the toggle and the shelf print,
   * because all three surfaces are one navigation and must agree about a locked
   * file. Nothing here is a second vocabulary for a fact that already has one.
   *
   * `workBrainStage` names the stage while it is showing the files rather than
   * a file — the counterpart of `brainGlobeStage` above, which stays exactly as
   * it is for the tier below. "Your work brain" is the product's own phrase for
   * the set of files (docs/workbrain-spec.html) and is already on Home.
   *
   * `workBrainBack` lived here until V2.1 VB-74 — 'Back to your work brain',
   * the corner disc's name. The disc left the stage for the nav band, whose
   * Back keeps one name at every depth (`navBack`), and the List's own copy
   * of the move had already become the trail's `Work brain` rung. Recorded
   * rather than silently deleted, same as `Prefs.followUps`.
   *
   * `workBrainOpen` is the state word on an open file node, and it is the
   * counterpart of `badgeLocked`: what a node says out loud when it is not
   * locked. `brainGlobeNode` pairs it with the file's name, exactly as it pairs
   * a section with its state, so the two tiers say their states the same way.
   *
   * `workBrainInside` is said, never printed — the same job `brainGlobeInside`
   * does one level down.
   */
  workBrainStage: 'Your work brain',
  workBrainHelp: 'Open a file to see what is in it.',
  workBrainOpen: 'Open',
  workBrainInside: (file: string) => `Inside ${file}`,

  /**
   * V1.9 VB-52 — the breadcrumb, and the count it carries.
   *
   * THREE STRINGS, AND EVERYTHING ELSE ON THE TRAIL IS BORROWED. The file rung
   * prints `fileContext` / `fileSkills` / `fileActions`; a locked chip says
   * `fileToggleLockedName` and the line under it says `fileToggleLockedNote`;
   * the group of chips is named `fileToggleLabel`. All four are VB-47's, kept
   * word for word when its toggle moved into the trail, because Home's shelf,
   * the Brain's top tier and this are one navigation and must agree about a
   * locked file.
   *
   * `crumbsLabel` names the trail for a screen reader and is never printed —
   * the trail is visible and says where you are. "Where you are", not
   * "Breadcrumb": a breadcrumb is a word about the interface rather than a word
   * the person brought (docs/design-system.html §08).
   *
   * `crumbWork` is the top rung. Two words, because the trail has to fit three
   * rungs and a count across 400px, and because "Your work brain" is already
   * said in full on Home and on the stage below (`workBrainStage`).
   *
   * `crumbCount` is the mockup's `2/2`. It is PRINTED ONLY, and the same fact
   * goes to a screen reader as `sectionsOf` — "3 of 10 sections" — which is
   * what the rest of the product already says. Adam's decision of 2026-08-24:
   * the count belongs in the drawer, where it is orientation while navigating,
   * and NOT on the question screen, where a running count is a number people
   * bargain with (VB-02). `FlowProgress` still prints no number.
   */
  crumbsLabel: 'Where you are',
  crumbWork: 'Work brain',
  crumbCount: (done: number, total: number) => `${done}/${total}`,

  notBuiltYet: 'Not built yet',
  updatedToday: 'Updated today',
  daysOld: (n: number) => (n === 1 ? '1 day old' : `${n} days old`),
  sectionsOf: (done: number, total: number) => `${done} of ${total} sections`,
  // R1-12: the Context flow's own "done" screen hands off to Home instead of
  // showing its own end state — see App.tsx/Flow.tsx. This is what a save
  // failure right on the last question falls back to, and what the proof
  // loop's own finished screen offers as its only way onward.
  backToFiles: 'Back to your files',

  // ---------------------------------------------------------------- more than one
  /**
   * V1.7 VB-38 — the screen for the things that come in numbers: roles,
   * people, teams, tools, initiatives.
   *
   * NAMED BY WHAT IS IN IT, never by what it is. "Multiples", "records" and
   * "entries" are all product nouns nobody brought with them (see this file's
   * rules); the three things this screen actually lists are the three words it
   * is called. The group headings under it are the file's own section names,
   * read straight off the outline — see core/flow/multiples.ts, which is why
   * none of them are written here.
   */
  multiplesTitle: 'Roles, people and projects',
  multiplesSub: 'Open one to change it. Or add a new one.',
  multiplesCount: (n: number) => (n === 1 ? 'One on your list' : `${wordFor(n)} on your list`),
  /** What one record's row says under its name. Same shape as `sectionsOf`. */
  multipleAnswered: (done: number, total: number) => `${done} of ${total} answered`,
  /** A record whose name question has not been answered yet. States the fact;
   * the row still opens, and the first thing it asks is the name. */
  multipleUnnamed: 'Not named yet',
  multipleAdd: 'Add another',
  /** The same button, told apart from the other groups' — three "Add another"
   * buttons on one screen need three names for anyone listing them. */
  multipleAddTo: (group: string) => `Add another to ${group}`,
  multipleAddConfirm: 'Add it',
  multiplesEmptyGroup: 'None yet.',
  multiplesNothing: 'Nothing here yet. Answer a few more questions first.',

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

  /**
   * V1.5 VB-28 — recommendations.
   *
   * ── THE ONE DISTINCTION THIS WHOLE BLOCK IS ABOUT ────────────────────────
   *
   * A recommendation says what would help and why. It never scolds, never
   * counts days of neglect, never frames absence as failure. VB-28 gives the
   * test case in one line: *"Most people name three or four people here" is
   * help. "You've only named one" is a scold.* Every string below is written
   * against that line, and the difference is always the same two things —
   * whose failure the sentence is about, and whether it points forward.
   *
   *   `recEntitiesHeading` is the guardrail's own example, kept verbatim.
   *   It says what is usual, not what they lack, and the word "only" appears
   *   nowhere in this block on purpose.
   *
   *   `recStaleWhy` prints a DATE — "the newest answer in it is 7 months
   *   old". A date is a real metric (docs/GUARDRAILS.md) and is simply true.
   *   "You have not touched this in 214 days" is the same arithmetic turned
   *   into an accusation, and it is the sentence this file must never grow.
   *
   *   `recEmptyWhy` says what the questions DO, and never mentions that they
   *   were passed on. The person already knows; repeating it back is the
   *   product arguing with a decision they made.
   *
   * ── ROLE STALENESS REUSES R1-12'S OWN WORDS ──────────────────────────────
   *
   * A role marked current that has aged past its clock is the recommendation
   * Home has been making since R1-12, and it keeps `driftHeading`,
   * `driftBecauseRole` and `driftAction` exactly as approved. One fact said
   * in one set of words — the same reason `sectionStateDue` reuses `badgeDue`.
   *
   * ── EVERY ONE NAMES A CONCRETE ACTION ────────────────────────────────────
   *
   * The button is a verb the person would say and names the thing it opens:
   * "Open My World", "Add another name", "Answer one question". Never "Fix",
   * never "Improve", never "Review" — none of those tell you what happens
   * when you press them.
   */
  recsLabel: 'What would help',
  /**
   * The decline, and it is never printed — the control is a cross in the
   * corner (components/Recommendation.tsx explains why it is not a second
   * button beside the primary). It names the recommendation it hides, so
   * three of them in a list are three distinct controls to a screen reader
   * rather than three identical "Hide" buttons.
   */
  recHideNamed: (what: string) => `Hide this: ${what}`,
  recStaleHeading: (section: string) => `${section} could be out of date`,
  /** `ago` arrives already worded by `agoLabel` — "7 months", "3 days". */
  recStaleWhy: (ago: string) => `The newest answer in it is ${ago} old.`,
  recOpenSection: (section: string) => `Open ${section}`,

  recEmptyHeading: (section: string) => `Worth another look: ${section}`,
  recEmptyWhy: (n: number) =>
    n === 1
      ? 'One question here, and it changes how AI writes for you.'
      : `${wordFor(n)} questions here, and they change how AI writes for you.`,

  recSuccessHeading: (name: string) => `Tell AI what done looks like for ${name}`,
  recSuccessWhy: 'With a finish line, AI can tell you if a plan gets there.',

  recEntitiesHeading: 'Most people name three or four here',
  /** Forward, not backward. An earlier draft read "AI only knows the people
   * you name for it", which is true and is still a sentence about what they
   * have not done. This one is about what the next minute buys. */
  recEntitiesWhy: 'Every name you add is one more thing AI can use.',
  recEntitiesAction: 'Add another name',

  recInitiativesHeading: 'Most people list two or three projects',
  recInitiativesWhy: 'AI helps most with the work it already knows about.',
  recInitiativesAction: 'Add a project',

  // ---------------------------------------------------------------- splash
  /**
   * THE tagline. Adam's exact words, 2026-08-26 (V2.6): "How you do anything
   * is how your AI does everything. That supersedes all others and is the
   * standard now." Recorded in docs/NORTH-STAR.md — do not reword it.
   *
   * It replaced V1.7 VB-34's "AI does the work. You do the thinking." here,
   * and it is the one line the splash and Home's lockup both print — one
   * standard, said in one string, so the two surfaces cannot drift.
   */
  splashTagline: 'How you do anything is how your AI does everything.',

  /* V2.6 VB-126: `splashBuild` / `splashLoad` / `splashVoiceOn` /
     `splashVoiceOff` are deleted with the doors and the voice row they
     labelled — the splash is pure arrival now (Adam: "any click from the
     splash page will load to the home page"), held for the wow treatment.
     The import door's job lives on in `importFile` on Home; the narrator's
     in the header toggle. Recorded rather than silently dropped, per the
     `fileTreeRoot` precedent. */
  /** [DRAFT] V2.6 VB-126 — the splash's one control: a real button stretched
   * over the whole surface, named for where any press lands. */
  splashEnter: 'Open your work brain',

  /**
   * V2.2 — the shelf's three new lines, from the signed-off draft
   * (docs/V2.2-COPY-DRAFT.md, Adam 2026-08-26). `skillsReady` is the open
   * Skills slot before its first answer; `actionsWritesItself` replaces
   * "Finish Skills.md first" on the Actions slot because that instruction is
   * no longer true — nobody finishes Actions, it is derived
   * (core/files/deriveActions.ts); `badgeGenerated` is its badge once it is.
   */
  skillsReady: 'Ready when you are — about ten minutes',
  actionsWritesItself: 'Writes itself from your Skills file',
  badgeGenerated: 'Generated',
  /** The derived file's own screen — what it is, and its two verbs. The note
   * repeats the slot's fact where the person can act on it: edit Skills and
   * this file is already up to date, because it is never stored. */
  actionsDerivedNote: 'Read straight off your Skills file. Change a skill and this file already knows.',
  actionsDownload: 'Download Actions.md',
  actionsEditSkills: 'Change it in Skills.md',
  /** [DRAFT] V2.3 VB-98 — the List's file preview grew a download of its own.
   * Verb-first, names the artifact, same register as Home's. */
  filePreviewDownload: 'Download',
  /** [DRAFT] V2.3 VB-99 — what the handle announces while the drawer is
   * closed: the state in a word, since the percent scale it normally speaks
   * describes a range closed sits outside of. */
  drawerClosedValue: 'Closed',

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
  /** [DRAFT] V2.5 VB-123. The merged role screen asks two things at once —
   * the standing and the current-or-past mark — so its refusal has to say
   * "each", or the person hunts for the one they missed. Same register as
   * errPickOne, same way out. */
  errPickBoth: 'Pick one of each to keep going, or skip this question.',
  /**
   * V1.4 VB-20. Said when someone picks "Yes" at the end of the roles loop but
   * leaves the name blank. Both ways forward, since either is fine: name it,
   * or say no. No skip here — there is no question to skip, only a choice
   * already made that needs one more word.
   */
  errNeedItsName: 'Give it a name to keep going, or pick No.',
  /** V1.7 VB-38's version of the same refusal, on a screen with no "No" to
   * pick — the way out here is to leave the field alone. */
  errNeedAName: 'Type a name to add it.',
  /**
   * The name is how this record is found again (core/flow/runner.ts's
   * `seededNameTaken` explains what breaks otherwise), so two of them cannot
   * share one. Says what to do, names neither a rule nor a failure.
   */
  errNameTaken: 'That name is already on your list. Try a different one.',
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
