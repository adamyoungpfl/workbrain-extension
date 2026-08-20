import type { DeepDiveEntry } from '../../schema/flow.types';

/**
 * V1.1 VB-03 — the deeper-dive disclosures, keyed by question id.
 *
 * WHY THIS IS NOT IN src/panel/strings.ts
 * strings.ts exists to be *read*: one reviewable body of interface copy a
 * person can scan end to end and judge as a whole (see its own header). These
 * 42 pairs are not interface chrome — they are per-question content, keyed to
 * specific question ids, and only ever rendered next to the one question they
 * belong to. Dropping them into strings.ts would nearly triple that file and
 * destroy the property that makes it worth having. They also want to live
 * next to the questions they answer, so a change to a question and a change
 * to its follow-ups are one diff, in one directory.
 *
 * So they live here, in `core/`, alongside `source.ts` (the ported question
 * wording) and `proofSource.ts` (the ported proof copy) — both of which are
 * already sanctioned exceptions to "copy lives in strings.ts" for the same
 * reason: they are content, not chrome. This module is pure data: no
 * `chrome.*`, no DOM, no imports beyond the schema.
 *
 * UNLIKE source.ts, THIS COPY IS NEW, NOT PORTED. It was authored for V1.1
 * and approved in docs/V1.1-COPY-DRAFT.md, and it is used verbatim here. That
 * matters for one guardrail: `npm run audit`'s reading-level check only reads
 * strings.ts, so it will never see a word of this file. `deepDive.test.ts`
 * therefore runs the audit's own Flesch-Kincaid formula over every string
 * below and fails past grade 7 — this content does not ship unmeasured.
 *
 * ORDER: flow order (the order a person meets the questions), not
 * alphabetical — asserted by a test so it stays true as entries are added.
 */

/**
 * Three questions keep their `hint` visible *as well as* getting a deep-dive.
 * Their hints are worked examples ("Diplomatic: … Balanced: … Blunt: …"), not
 * explanations — the samples are what make the question answerable at a
 * glance, and hiding them behind a tap makes it harder, which is the opposite
 * of what this feature is for. Decided in docs/V1.1-REFINEMENT.md VB-03 and
 * the copy draft; not a judgement call left open at render time.
 *
 * This lives here rather than as a `Step` flag because it is a fact about
 * *this copy*, decided together with it — the same reasoning that keeps the
 * pairs themselves out of the schema.
 */
export const HINT_STAYS_VISIBLE: readonly string[] = [
  'voice_directness',
  'voice_formality',
  'voice_qualification',
];

export const DEEP_DIVE: Record<string, DeepDiveEntry[]> = {
  // ── 1 · Orientation ────────────────────────────────────────────────
  orientation_ready: [
    {
      q: 'What is a Context file?',
      a: 'A short, plain-text file — a few pages, not a database. You answer questions here, and the file gets written for you. You download it and hand it to whatever AI you use.',
    },
    {
      q: 'Why would AI need this?',
      a: "AI starts every conversation knowing nothing about you. This is the part you'd otherwise retype every time.",
    },
  ],
  context_scope: [
    {
      q: 'What changes based on my answer?',
      a: 'Only the wording of later questions. Pick "both" if you\'re unsure — nothing gets locked out.',
    },
  ],

  // ── 2 · About Me ───────────────────────────────────────────────────
  role_names: [
    {
      q: 'What counts as a role?',
      a: "Anything you'd describe differently to different people. A job is a role. So is running a fundraiser, or coaching a team.",
    },
    {
      q: 'What if I only have one?',
      a: "That's normal — most people have one or two. Pick one and keep going.",
    },
  ],
  role_for: [
    {
      q: "What if it's for more than one?",
      a: "Pick the one you'd name first if someone asked. This just anchors who the role serves — it isn't a contract.",
    },
  ],

  // ── 3 · Responsibilities & Boundaries ──────────────────────────────
  responsibilities_list: [
    {
      q: 'How is this different from what I do all day?',
      a: "Responsibility is what lands on you if it goes wrong. You do plenty of things you're not ultimately on the hook for.",
    },
  ],
  contribution_boundaries: [
    {
      q: "Why does AI need to know what I don't own?",
      a: 'So it stops writing as if a call is yours to make. It changes how things get worded.',
    },
    {
      q: 'Should I say who does own it?',
      a: 'If you know, yes. "The product lead decides" tells AI more than "not mine."',
    },
  ],
  negative_responsibility: [
    {
      q: 'Why would AI need to know this?',
      a: "So it stops writing as if you can approve things you can't. It's the most common way drafts come out wrong.",
    },
    {
      q: 'What if nothing comes to mind?',
      a: "Skip it. This one's genuinely optional.",
    },
  ],
  decision_rights: [
    {
      q: 'What if it depends?',
      a: 'It usually does. Say what you can decide alone, and where the line is. "Under ten thousand, my call" is a real answer.',
    },
  ],
  expertise: [
    {
      q: "What if I don't feel like an expert?",
      a: "You don't have to be the best at it. If people ask you first, that counts.",
    },
    {
      q: 'Does depth matter here?',
      a: "Yes, and it's worth saying. Deep expertise and working knowledge get treated differently — tell AI which is which.",
    },
  ],

  // ── 4 · My World ───────────────────────────────────────────────────
  entities_gate: [
    {
      q: 'What kind of thing belongs here?',
      a: 'Anything you name constantly and then have to explain. A manager, a teammate, a tool you live in, a meeting that matters.',
    },
    {
      q: 'Should I add my whole team?',
      a: 'No. Only the ones AI would need to recognize to be useful. Two or three is plenty.',
    },
  ],
  entity_aliases: [
    {
      q: 'Why does this matter?',
      a: 'So AI recognizes the thing when you use its short name. If you say "the CRM" and it only knows "Salesforce," you\'re explaining it again.',
    },
    {
      q: "What if there's only one name?",
      a: 'Then skip it. Most things only have one.',
    },
  ],

  // ── 5 · Initiatives ────────────────────────────────────────────────
  initiatives_gate: [
    {
      q: 'What makes something an initiative?',
      a: "It has a name, a goal, and an end. Your ongoing responsibilities aren't initiatives — those came up earlier.",
    },
  ],

  // ── 6 · How I Think ────────────────────────────────────────────────
  risk_tolerance: [
    {
      q: 'What if it depends on the situation?',
      a: 'Pick "depends on the stakes" — it\'s a real answer, not a cop-out. AI will ask when it matters.',
    },
  ],
  rigor_before_acting: [
    {
      q: 'What does this actually change?',
      a: 'Whether AI hands you a two-line answer or walks you through how it got there. You can always ask for more in the moment.',
    },
  ],
  autonomy_preference: [
    {
      q: "Isn't this the same as the last question?",
      a: 'Close, but no. That one was about unclear requests. This one is about clear ones — whether AI should move or check with you first.',
    },
    {
      q: 'What if it depends on how risky the step is?',
      a: 'A later question covers the hard rules — what AI must never do without asking. This one is just your general instinct.',
    },
  ],

  // ── 7 · How I Communicate ──────────────────────────────────────────
  // The three voice_* questions keep their worked examples visible too —
  // see HINT_STAYS_VISIBLE above.
  voice_directness: [
    {
      q: 'Is this locked in?',
      a: "No. It's the starting point. You can always ask for something softer or blunter in the moment.",
    },
  ],
  voice_formality: [
    {
      q: "What if it depends who's reading?",
      a: "It usually does — there's a whole section on that later. Pick your most common case here.",
    },
  ],
  voice_qualification: [
    {
      q: 'Why would I want hedging at all?',
      a: 'Because "the date will slip" and "the date will slip if the vendor is late again" are different claims. Some readers need the second one.',
    },
  ],
  peeves: [
    {
      q: 'Why is this question here?',
      a: "Because it's the fastest way to describe how you want things written. Saying what annoys you is easier than describing good writing.",
    },
    {
      q: 'What if none of these bother me?',
      a: "Then skip it. This one's optional, and an honest blank beats a guess.",
    },
  ],

  // ── 8 · Audience Profiles ──────────────────────────────────────────
  audiences_list: [
    {
      q: 'What does AI do with this?',
      a: 'It shifts tone by reader. Your manager and your team get different versions of the same update.',
    },
    {
      q: 'How many should I pick?',
      a: 'Only the ones you actually write to often. Three or four is typical.',
    },
  ],
  audience_variance: [
    {
      q: 'What kind of difference counts?',
      a: "A different tone, more or less detail, or a different format entirely. Anything you'd consciously change.",
    },
    {
      q: "What if they're all about the same?",
      a: 'Then skip it. "Same for everyone" is a real answer and AI will treat it that way.',
    },
  ],

  // ── 9 · Vocabulary & Knowledge ─────────────────────────────────────
  terms_depend_on: [
    {
      q: 'What counts as shorthand?',
      a: "Acronyms, tool names, project codenames — anything you'd have to explain to someone starting Monday.",
    },
    {
      q: 'How much should I list?',
      a: 'Five to ten is plenty. The ones that come up weekly, not every term you know.',
    },
  ],
  never_words: [
    {
      q: 'Does this actually work?',
      a: 'Yes — this is one of the most literal instructions in the file. AI avoids what you list here.',
    },
  ],

  // ── 10 · Context Boundaries ────────────────────────────────────────
  standards_list: [
    {
      q: 'How is this different from the peeves question?',
      a: "Peeves are style. These are hard rules AI can't talk itself out of — the things that make something wrong, not just annoying.",
    },
  ],
  guardrails_list: [
    {
      q: 'What happens if I leave these on?',
      a: 'AI drafts instead of sending, and asks before changing anything. Most people keep all three on.',
    },
    {
      q: 'Can I change these later?',
      a: 'Yes. Everything here can be answered again — nothing is locked in.',
    },
  ],

  // ── 11 · Reference Examples ────────────────────────────────────────
  reference_example_primary: [
    {
      q: 'Why does this matter so much?',
      a: "One real paragraph teaches AI more about your voice than every answer you've given so far.",
    },
    {
      q: 'What should I pick?',
      a: "Something ordinary you'd be happy to see again. A status update or a note to your team beats anything polished.",
    },
    {
      q: "What if I can't find one?",
      a: 'Write two sentences here as if you were sending them. That works just as well.',
    },
  ],
  reference_example_second: [
    {
      q: 'Is one enough?',
      a: "Yes. A second one helps most if it's a different tone or a different reader than the first.",
    },
  ],
};

/** The deep-dive pairs for a question, or `undefined` if it has none. */
export function deepDiveFor(questionId: string): DeepDiveEntry[] | undefined {
  return DEEP_DIVE[questionId];
}

/**
 * Whether a question's `hint` still renders alongside its deep-dive. True
 * only for the three worked-example questions above; for every other question
 * with a deep-dive the disclosure replaces the hint paragraph. Questions with
 * no deep-dive at all are unaffected — their hint always shows.
 */
export function hintStaysVisible(questionId: string): boolean {
  return HINT_STAYS_VISIBLE.includes(questionId);
}
