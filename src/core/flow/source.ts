/**
 * A verbatim snapshot of the DATA portion of
 * ../modelcitizen/src/lib/contextInterviewFlow.ts (as of 2026-08-19,
 * uncommitted in that repo at port time — see R1-05 in docs/RELEASE-1.md).
 * Copied mechanically (sed line ranges, not retyped) into this repo so
 * adapter.ts has a byte-faithful source to transform. NOT hand-edited —
 * any wording fix belongs upstream in modelcitizen, then re-ported.
 *
 * Excluded on purpose (out of scope for R1-05, see the R1-05 plan):
 * the file-generation logic (renderFileSection, renderRepeatableRecord,
 * formatAnswerValue, cursorForQuestionId, ALL_QUESTIONS_BY_ID,
 * QUESTION_TO_REPEATABLE_BLOCK) — that's core/files/generate.ts's concern
 * (R1-09) — and the Module-12 "Review & Demo" placeholder metadata
 * (UPCOMING_MODULES, TOTAL_PLANNED_MODULES, TOTAL_ESTIMATED_MINUTES,
 * minutesBeforeModule, ALL_MODULE_SUMMARIES, and the now-unused
 * moduleMidpointMinutes helper they alone depended on), which has no real
 * question content and isn't part of Release 1's proof loop either.
 */

// Context Interview — the flow definition for the deterministic,
// one-question-at-a-time intake (distinct from WorkBrainContextBuilder's
// wizard). The governing rule this whole file exists to enforce: the LLM
// (used the same copy/paste-into-your-own-AI way every other Work Brain
// tool works — see AIAssistButton in workbrain/shared.tsx) interprets
// individual answers, but this data — not the AI — decides what gets asked
// next. WorkBrainContextInterview.tsx is the runner that walks this data;
// nothing about question order or branching lives in that component.

export type AnswerValue = string | string[] | null;

/** Everything a prompt/skipIf/interpret function can read — never write.
 * Kept intentionally narrow (no setters) so those functions stay pure and
 * side-effect-free, which is what lets the runner call them freely during
 * render without worrying about when/how often. */
export interface FlowContext {
  answers: Record<string, AnswerValue>;
  repeatables: Record<string, Record<string, AnswerValue>[]>;
}

export interface QuestionOption {
  key: string;
  label: string;
  /** Nudges toward this specific chip with a steady pulsing outline, even
   * when it isn't the pre-selected default (Adam's ask, 2026-08-19: "make
   * the On option which is recommended have the pulsing outline to
   * indicate you 'should' select it") — distinct from the rotating chase
   * every chip row gets before anything's picked; this one keeps pulsing
   * on its single chip until THAT chip is actually chosen. */
  recommended?: boolean;
}

export type QuestionType = "intro" | "text" | "single-select" | "multi-select" | "yes-no";

/** How a text answer gets interpreted before the reflect/confirm step.
 * "echo" needs no AI at all — it just reflects the visitor's own words
 * back for a lightweight confirm (used for short factual answers, where
 * paraphrasing would add nothing). "ai-assist" is the real interpretation
 * step: reuses AIAssistButton's exact copy/paste/apply mechanic — the
 * visitor copies buildPrompt's output into their own AI, pastes the reply
 * back, and THAT becomes the reflected value. */
export interface InterpretConfig {
  via: "ai-assist" | "echo";
  buildPrompt?: (rawAnswer: string, ctx: FlowContext) => string;
  /** Shown ahead of the reflected value on the confirm step, e.g. "I heard:" */
  reflectPrefix?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: (ctx: FlowContext) => string;
  hint?: string;
  options?: QuestionOption[];
  placeholder?: string;
  multiline?: boolean;
  interpret?: InterpretConfig;
  /** Default true — set false for genuinely optional asks (e.g. "anything
   * people assume is yours but isn't"), which render a visible Skip. */
  required?: boolean;
  /** Branching: return true to skip this node entirely, evaluated against
   * the answers/repeatables gathered so far. */
  skipIf?: (ctx: FlowContext) => boolean;
  /** Static starter answers offered via a "Generate ideas" button on text
   * questions — no AI round-trip, just example content to use as-is or
   * edit, cycling on repeated clicks (same mechanic as Context Builder's
   * own "Generate an example"). The easy-button pattern, applied wherever
   * a question benefits from one (Adam's ask, 2026-08-19: "a pattern
   * throughout," not a one-off). */
  ideas?: string[];
  /** multi-select only: alongside the predefined options, offer a text
   * input to add items not on the list — every selected item (predefined
   * or custom) renders as a visible, removable chip, so collecting
   * several distinct things (roles, later entities/audiences/vocabulary)
   * always looks and works the same way. */
  allowCustom?: boolean;
  customPlaceholder?: string;
  /** Alternate phrasings of the same question, offered via a "Rephrase the
   * question" link — cycles through them on repeat clicks, same static/
   * no-AI-cost mechanic as `ideas`. Rolled out across Modules 1-3 (Adam's
   * ask, 2026-08-19: "some people need to hear the question different to
   * trigger the best answer") wherever a different angle can plausibly
   * surface a better answer — every open-ended `text` question, plus
   * `single-select`/`multi-select` questions where the framing itself is a
   * judgment call, not a fixed fact. Deliberately skipped on purely
   * factual one-liners (preferred_name, professional_name — there's only
   * one way to ask "what's your name") and on `intro` nodes (nothing is
   * being collected, so a different framing doesn't help anyone answer
   * better). Each variant is a function of ctx, matching `prompt`, so a
   * rephrasing can stay scope-aware (see scopePhrase) where the base
   * prompt does.
   *
   * Cap at 3 total phrasings (original + 2) for select-type questions and
   * 4 total (original + 3) for open-ended text questions — every variant
   * is audio Adam re-records in ElevenLabs later, so this isn't just a
   * style guideline, it's a real production-cost ceiling. Never exceed 4.
   *
   * A `single-select`/`multi-select` rephrasing may freely lean toward the
   * OPPOSITE pole of the original wording (e.g. asking "is this current?"
   * as "have you moved on from this?") — safe because the same fixed chip
   * options are always visible and clicking one always submits that same
   * option's own key, regardless of which phrasing prompted the click; no
   * value-translation logic needed. A `yes-no` rephrasing must NOT flip
   * polarity this way — "yes" always submits the literal string "yes," so
   * a polarity-flipped variant would silently invert what gets recorded.
   * No yes-no question currently uses rephrasings; if one ever does, either
   * keep every variant the same polarity as the original, or extend the
   * yes-no renderer to remap the submitted value per variant first. */
  rephrasings?: ((ctx: FlowContext) => string)[];
  /** Alternate LABELS for `options`, one array per rephrasing (same order as
   * `rephrasings`, so index 0 here pairs with `rephrasings[0]`, etc.) — for
   * select questions whose rephrasing swaps in different words for the same
   * choices (e.g. "primary/secondary/occasional" becoming "the main one/a
   * side one/just now and then"), so the chips actually say what the
   * question just asked instead of sitting frozen on the base phrasing's
   * vocabulary (Adam's ask, 2026-08-19: "make the rephrase and the
   * selection be a connected thing"). Each inner array MUST have the exact
   * same `key`s, in the same order, as `options` — only `label` may differ;
   * `key` is what actually gets recorded, so the answer never changes just
   * because the phrasing cycled. Optional: most select questions don't need
   * this, since most rephrasings don't rename the choices themselves (e.g.
   * `role_for`'s options are concrete entities like "My employer" — no
   * rephrasing of the question changes what an employer IS). */
  optionRephrasings?: QuestionOption[][];
  /** `intro`-only: a timed, one-at-a-time read instead of one dense
   * paragraph — shows beats[0], holds it for roughly its own reading time
   * (+2s), fades out, fades in beats[1], and so on, stopping on the last
   * beat (Adam's ask, 2026-08-19: "I want those 3 beats to hit
   * separately... fade out and fade in the next one" — first used on
   * architecture_orientation). Wrap a span in `__double underscores__` for
   * a light underline-emphasis treatment (e.g. "the __Context__ file").
   * `prompt()` should still return the equivalent plain text with markers
   * stripped — beats is presentation-only; narrator speech and any other
   * plain-text consumer keep reading `prompt()`. */
  beats?: string[];
  /** single/multi-select only: exactly 2 entries, positionally paired with
   * `options` (index 0 = options[0]'s worked example, etc.) — renders as a
   * side-by-side two-panel comparison so the stylistic difference between
   * two choices is something you can actually SEE, not just read about
   * (Adam's ask, 2026-08-19: "a two panel example so the user can see the
   * difference in style visually," first used on shape_structure and
   * shape_ask_placement). `\n` renders as a real line break. Only wired up
   * for exactly-2-option comparisons — a 3+-option question should stay a
   * plain hint, there's no natural "side by side" for three panels. */
  optionExamples?: string[];
}

/** A sub-flow asked once per record (a role, an entity, later an
 * initiative/audience/vocabulary term/example). Two modes: open-ended
 * ("add another?" loops it — see Module 4's `entities`) or seeded (one
 * record per item already named in an earlier multi-select — see
 * seedFrom — no add-another prompt, since the count is already fixed).
 * An open-ended block needs a real top-level question ahead of it that
 * gates it via `skipIf` (see `entities_gate`) — nothing here enforces a
 * minimum record count or shows any framing before the loop starts, so
 * without that preceding gate a visitor could skip straight past it with
 * zero records, and it would never show as "reached" in the file tree
 * (which only checks `answers`, never `repeatables`). */
export interface RepeatableBlock {
  kind: "repeatable";
  id: string;
  questions: Question[];
  addAnotherPrompt: string;
  skipIf?: (ctx: FlowContext) => boolean;
  /** When set, records are seeded one-per-item from an earlier
   * multi-select answer instead of open-ended "add another?" — e.g. the
   * roles picked in Module 2's `role_names` question, one detail pass per
   * name, each pre-filled with that name under `seedField`. */
  seedFrom?: { questionId: string; seedField: string };
}

export type FlowNode = ({ kind: "question" } & Question) | RepeatableBlock;

export interface Module {
  id: string;
  number: number;
  title: string;
  purpose: string;
  required: boolean;
  nodes: FlowNode[];
  /** [low, high] minutes, matching the original spec's own per-module time
   * table — drives the progress graph's time-to-destination readout, not
   * just "which module." */
  estimatedMinutes: [number, number];
}

function q(question: Question): FlowNode {
  return { kind: "question", ...question };
}

/** `context_scope` (Module 1's "work / personal / both" pick) gates the
 * phrasing of later questions — rather than one generic "in general"
 * catch-all, this slots in whichever pre-written phrase actually matches
 * what the visitor picked (Adam's ask, 2026-08-19: "record multiple
 * versions so we can slot in the right one based on choice"). Falls back
 * to `both` for "both" or an unanswered scope. */
function scopePhrase(ctx: FlowContext, variants: { work: string; personal: string; both: string }): string {
  const scope = ctx.answers.context_scope;
  if (scope === "work") return variants.work;
  if (scope === "personal") return variants.personal;
  return variants.both;
}

/** Shared by stop_explaining's base prompt and its rephrasings, so every
 * variant stays scope-aware instead of just the first one. Grammar fix
 * (Adam's ask, 2026-08-19): the old "work areas" / "personal areas" /
 * "areas overall" reads awkwardly — "areas" doesn't pair naturally with
 * "personal," and "areas overall" is backwards English. "work life" /
 * "personal life" / "life" is a parallel construction that reads
 * correctly in every sentence that calls this ("in your ___", "about
 * your ___"). */
function stopExplainingScope(ctx: FlowContext): string {
  return scopePhrase(ctx, { work: "work life", personal: "personal life", both: "life" });
}

// A 2-beat read (Adam's ask, 2026-08-19), each shown on its own, timed to
// the visitor's own reading pace, before fading into the next — defined
// once here so the on-screen beats and prompt()'s plain-text fallback
// (narrator speech, etc.) can never drift out of sync.
const ARCHITECTURE_ORIENTATION_BEATS = [
  "One thing before we start: the __Context__ file tells AI what it should know about you. Later, we'll build a Skills file to tell AI which tasks to perform...",
  "...and an Actions file to tell it what it can access and what it can do. For now, let's start with your __Context.md__ file. Let's start!",
];

// ---------------------------------------------------------------------
// Module 1 — Orientation
// ---------------------------------------------------------------------
const orientation: Module = {
  id: "orientation",
  number: 1,
  title: "Orientation",
  purpose: "Explain what Context is and establish scope.",
  required: true,
  estimatedMinutes: [1, 1],
  nodes: [
    q({
      id: "orientation_ready",
      type: "intro",
      prompt: () => "We're going to build a Context file that helps AI understand you before you start a conversation. Ready?",
      hint:
        "Context is a short, plain-text file — a handful of pages, not a database. You answer some questions here; the file gets written for you underneath. You'll be able to download it and hand it to whatever AI you already use.",
    }),
    q({
      id: "context_scope",
      type: "single-select",
      prompt: () => "Are we building this primarily for your work, personal life, or both?",
      rephrasings: [
        () => "Should this file lean toward your work, your personal life, or cover both?",
        () => "Is this mainly about how you show up at work, at home, or a mix of both?",
      ],
      options: [
        { key: "work", label: "Work" },
        { key: "personal", label: "Personal" },
        { key: "both", label: "Both" },
      ],
    }),
    q({
      id: "stop_explaining",
      type: "text",
      multiline: true,
      prompt: (ctx) => `What would you most like to stop explaining over and over in your ${stopExplainingScope(ctx)}?`,
      // Piloting "Rephrase the question" here (Adam's ask, 2026-08-19) — a
      // few genuinely different angles on the same ask, not just reworded
      // synonyms, since the point is giving someone stuck on the first
      // framing an actual different way in. Cycles on repeat clicks, same
      // no-AI-cost mechanic as `ideas`.
      rephrasings: [
        (ctx) => `Think about the last time you had to explain the same thing for the hundredth time in your ${stopExplainingScope(ctx)} — what was it?`,
        (ctx) => `If AI already knew one thing about your ${stopExplainingScope(ctx)} and never made you repeat it again, what would save you the most time?`,
        (ctx) => `What's the thing about your ${stopExplainingScope(ctx)} that gets tedious to keep re-explaining to new people, or new tools?`,
      ],
      placeholder: "Whatever comes to mind first — a project, your role, how you like things written...",
      ideas: [
        "The context behind the project I'm currently leading.",
        "Who's who on my team and what they each own.",
        "How I like things written — direct, no fluff, no corporate-speak.",
        "The history of a decision I keep having to re-justify.",
        "What I'm responsible for versus what I just get looped in on.",
      ],
      interpret: {
        via: "ai-assist",
        reflectPrefix: "It sounds like the biggest areas are:",
        buildPrompt: (raw) =>
          `I'm building a "Context" file that tells AI who I am so I stop re-explaining myself every conversation. I was asked what I'd most like AI to stop making me explain, and I wrote this:\n\n"${raw}"\n\nPull out the 2-4 distinct areas this actually covers, as a short comma-separated list (e.g. "my role at work, how my team is structured, the tone I write in"). Reply with ONLY that list — no preamble, no numbering, no explanation. Just the list, ready to paste directly into a form field.`,
      },
    }),
    q({
      id: "architecture_orientation",
      type: "intro",
      beats: ARCHITECTURE_ORIENTATION_BEATS,
      prompt: () => ARCHITECTURE_ORIENTATION_BEATS.join(" ").replace(/__/g, ""),
    }),
  ],
};

// ---------------------------------------------------------------------
// Module 2 — About Me
// ---------------------------------------------------------------------
const aboutMe: Module = {
  id: "about-me",
  number: 2,
  title: "About Me",
  purpose: "Establish identity and working role(s).",
  required: true,
  estimatedMinutes: [2, 4],
  nodes: [
    q({
      id: "preferred_name",
      type: "text",
      prompt: () => "What should AI call you?",
      placeholder: "First name or nickname",
      ideas: ["Alex", "Sam — most people just call me that", "Dr. Patel", "AJ", "Jordan"],
    }),
    q({
      id: "professional_name",
      type: "text",
      required: false,
      prompt: () => "Do you use a different name professionally? Leave this blank if it's the same.",
      placeholder: "Leave blank if it's the same",
      ideas: [
        "Alexandra Chen, but I go by Alex outside work",
        "Dr. Patricia Nguyen",
        "Jonathan on anything official, Jon everywhere else",
        "A. J. Rivera on formal documents",
        "My maiden name, professionally",
      ],
    }),
    q({
      id: "self_description",
      type: "text",
      multiline: true,
      prompt: () => "How would you describe what you do?",
      rephrasings: [
        () => "If a stranger asked what you do, what would you actually tell them?",
        () => "Forget your job title — in plain terms, what does your day-to-day actually involve?",
        () => "What would your closest coworker or family member say you spend most of your time doing?",
      ],
      placeholder: "In your own words — no need to make it sound official",
      ideas: [
        "I manage a team that keeps our reporting accurate and on time.",
        "I run our household and manage our kids' schedules.",
        "I'm a freelance designer working with a handful of regular clients.",
        "I coordinate volunteers and logistics for our community fundraiser.",
        "I teach and also run the school's after-hours tutoring program.",
      ],
      interpret: {
        via: "ai-assist",
        reflectPrefix: "I heard:",
        buildPrompt: (raw) =>
          `I'm building a "Context" file that tells AI who I am. I was asked to describe what I do, and I wrote this:\n\n"${raw}"\n\nRewrite it as one or two clear, concise sentences — clean up the phrasing but don't add anything I didn't say and don't invent detail. Reply with ONLY the rewritten sentence(s) — no preamble, no options, no explanation. Just the text, ready to paste directly into a form field.`,
      },
    }),
    q({
      id: "role_names",
      type: "multi-select",
      allowCustom: true,
      prompt: () => "What are your roles — the ones distinct enough that AI should know about each one separately?",
      rephrasings: [
        () => "What are the different hats you wear that AI should really keep straight?",
        () => "If you had to list the separate 'jobs' you're doing in your life right now, what would they be?",
      ],
      hint: "For example: a job, plus something like running a fundraiser or coaching a team. Both are legitimately roles worth AI knowing about. Pick any that fit, or add your own — most people have just one or two.",
      customPlaceholder: "Type a role and add it",
      options: [
        { key: "employee", label: "Employee" },
        { key: "manager", label: "Manager / Team Lead" },
        { key: "business-owner", label: "Business Owner" },
        { key: "freelancer", label: "Freelancer / Contractor" },
        { key: "volunteer-board", label: "Volunteer / Board Member" },
        { key: "student", label: "Student" },
      ],
      required: false,
    }),
    {
      kind: "repeatable",
      id: "roles",
      skipIf: (ctx) => !Array.isArray(ctx.answers.role_names) || (ctx.answers.role_names as string[]).length === 0,
      seedFrom: { questionId: "role_names", seedField: "role_name" },
      addAnotherPrompt: "",
      questions: [
        {
          id: "role_for",
          type: "single-select",
          prompt: () => "Who or what is this role for?",
          rephrasings: [() => "Who benefits from you doing this role?", () => "If this role disappeared tomorrow, who or what would feel it?"],
          hint: "Pick whichever fits, or add your own — this just anchors who the role serves.",
          allowCustom: true,
          customPlaceholder: "Something else — type it and add it",
          options: [
            { key: "employer", label: "My employer" },
            { key: "clients", label: "Clients" },
            { key: "family", label: "My family" },
            { key: "organization", label: "An organization or nonprofit" },
            { key: "community", label: "My community" },
            { key: "myself", label: "Myself" },
          ],
        },
        {
          id: "role_mandate",
          type: "text",
          multiline: true,
          prompt: () => "In a sentence or two, what are you there to accomplish?",
          rephrasings: [
            () => "What does 'doing this well' actually look like?",
            () => "If you disappeared for a month, what's the one thing people would notice wasn't getting done?",
            () => "What's the actual point of you being in this role?",
          ],
          ideas: [
            "Keep the team's reporting accurate, on time, and trusted by leadership.",
            "Make sure the household runs smoothly and everyone's where they need to be.",
            "Deliver design work clients are happy to pay for again.",
            "Raise money and awareness for a cause I care about.",
          ],
          interpret: {
            via: "ai-assist",
            reflectPrefix: "Here's a concise version:",
            buildPrompt: (raw) =>
              `I'm describing a role for a "Context" file that tells AI who I am. I was asked what I'm there to accomplish, and I wrote this:\n\n"${raw}"\n\nRewrite it as one concise sentence — a clear mandate, not a task list. Don't add anything I didn't say. Reply with ONLY the rewritten sentence — no preamble, no explanation. Just the sentence, ready to paste directly into a form field.`,
          },
        },
        {
          id: "role_standing",
          type: "single-select",
          prompt: () => "Is this your primary role, a secondary role, or something occasional?",
          rephrasings: [
            () => "How much of your time and identity does this role actually take up — the main one, a side one, or just now and then?",
            () => "If you had to rank your roles, where does this one land — top, middle, or rarely?",
          ],
          options: [
            { key: "primary", label: "Primary" },
            { key: "secondary", label: "Secondary" },
            { key: "occasional", label: "Occasional" },
          ],
          optionRephrasings: [
            [
              { key: "primary", label: "The main one" },
              { key: "secondary", label: "A side one" },
              { key: "occasional", label: "Just now and then" },
            ],
            [
              { key: "primary", label: "Top" },
              { key: "secondary", label: "Middle" },
              { key: "occasional", label: "Rarely" },
            ],
          ],
        },
        {
          id: "role_durability",
          type: "single-select",
          prompt: () => "Is this role current, or something from your past that's still useful context?",
          rephrasings: [
            () => "Are you still doing this today, or is it something you've moved on from?",
            () => "Should AI treat this as part of who you are right now, or more like useful history?",
          ],
          options: [
            { key: "current", label: "Current" },
            { key: "historical", label: "Historical" },
          ],
          optionRephrasings: [
            [
              { key: "current", label: "Still doing it" },
              { key: "historical", label: "Moved on" },
            ],
            [
              { key: "current", label: "Right now" },
              { key: "historical", label: "History" },
            ],
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------
// Module 3 — Responsibilities & Boundaries
// ---------------------------------------------------------------------
const responsibilities: Module = {
  id: "responsibilities",
  number: 3,
  title: "Responsibilities & Boundaries",
  purpose: "Define what the person owns and doesn't own.",
  required: true,
  estimatedMinutes: [3, 5],
  nodes: [
    q({
      id: "responsibilities_list",
      type: "text",
      multiline: true,
      prompt: () => "What are you personally responsible for?",
      rephrasings: [
        () => "If something goes wrong, what's actually your problem to fix?",
        () => "What's on your plate that nobody else is going to pick up if you don't?",
        () => "What would you put on a list titled 'things I'm on the hook for'?",
      ],
      hint: "Anything else where you're the person ultimately accountable — keep going until the list feels complete.",
      ideas: [
        "The budget, the vendor contracts, and the final go/no-go call.",
        "Everything on the calendar getting where it needs to be, on time.",
        "The quality of what goes out the door under my name.",
        "Keeping the team staffed and unblocked.",
      ],
      interpret: {
        via: "ai-assist",
        reflectPrefix: "I grouped those as:",
        buildPrompt: (raw) =>
          `I'm building a "Context" file that tells AI what I'm responsible for. Here's what I listed:\n\n"${raw}"\n\nGroup these into 2-5 short categories that match how I'd actually think about them (don't invent categories that aren't supported by what I wrote). Reply with ONLY a comma-separated list of the category names — no preamble, no explanation. Just the list, ready to paste directly into a form field.`,
      },
    }),
    q({
      id: "contribution_boundaries",
      type: "text",
      multiline: true,
      required: false,
      prompt: () => "What work do you contribute to but do not own?",
      rephrasings: [
        () => "Where do you have a voice, but someone else makes the final call?",
        () => "What are you involved in that isn't ultimately yours to decide?",
        () => "What do you help move forward without being the one steering it?",
      ],
      hint: "Who usually owns those things instead?",
      ideas: ["I give input on the roadmap, but the product lead makes the final call.", "I help staff events, but the board decides what we run."],
    }),
    q({
      id: "negative_responsibility",
      type: "text",
      multiline: true,
      required: false,
      prompt: () => "What do people sometimes assume is your responsibility, but actually isn't?",
      rephrasings: [
        () => "What do people keep asking you about that's actually not your call?",
        () => "Where do you get blamed — or credited — for things that aren't really yours?",
        () => "What's a common misunderstanding about what you're actually responsible for?",
      ],
      placeholder: "Optional — skip if nothing comes to mind",
      ideas: ["People assume I approve the final budget — I only draft it.", "People assume I can commit the team's time — that's my manager's call."],
    }),
    q({
      id: "decision_rights",
      type: "text",
      multiline: true,
      prompt: () => "What kinds of decisions can you make yourself?",
      rephrasings: [
        () => "Where do you not need to ask permission?",
        () => "What can you just decide and move on, without looping anyone in?",
        () => "What's the biggest call you're trusted to make on your own?",
      ],
      hint: "What decisions require someone else's sign-off?",
      ideas: ["I can approve anything under a set budget threshold myself.", "I decide day-to-day priorities; anything that shifts the timeline needs sign-off."],
    }),
    q({
      id: "expertise",
      type: "text",
      multiline: true,
      prompt: () => "What expertise do people normally come to you for?",
      rephrasings: [
        () => "When something's confusing or broken, who ends up asking you about it?",
        () => "What do people assume you just 'know' because it's your thing?",
        () => "What's the topic where you're the go-to person?",
      ],
      hint: "Which of those would you consider deep expertise, versus just working knowledge?",
      ideas: ["People come to me for how our reporting pipeline actually works.", "People ask me to review anything customer-facing before it ships."],
    }),
  ],
};

// ---------------------------------------------------------------------
// Module 4 — My World
// ---------------------------------------------------------------------
const myWorld: Module = {
  id: "my-world",
  number: 4,
  title: "My World",
  purpose: "Name the specific people, teams, tools, and processes AI should recognize by name instead of you re-explaining them.",
  required: true,
  estimatedMinutes: [5, 10],
  nodes: [
    q({
      id: "entities_gate",
      type: "yes-no",
      prompt: () =>
        "Are there specific people, teams, tools, or processes worth telling AI about by name — the kind you'd expect it to recognize instead of re-explaining every time?",
      hint: "Think about who or what you mention constantly — a manager, a teammate, a tool you live in, a process you keep referencing. If nothing comes to mind, choose No — you can always come back and change this later.",
    }),
    {
      kind: "repeatable",
      id: "entities",
      skipIf: (ctx) => ctx.answers.entities_gate !== "yes",
      addAnotherPrompt: "Want to tell AI about another person, team, tool, or process?",
      questions: [
        {
          id: "entity_name",
          type: "text",
          prompt: () => "What's their name — or its name, if this is a tool or team?",
          placeholder: "e.g. Priya, the Growth team, Salesforce, the weekly ops review",
          ideas: ["Priya, my manager", "The Growth team", "Salesforce", "The weekly ops review", "Jordan, my co-founder"],
        },
        {
          id: "entity_type",
          type: "single-select",
          prompt: () => "What kind of thing is this?",
          rephrasings: [() => "How would you categorize this?"],
          allowCustom: true,
          customPlaceholder: "Something else — type it and add it",
          options: [
            { key: "person", label: "Person" },
            { key: "team", label: "Team" },
            { key: "system-tool", label: "System or Tool" },
            { key: "process-workflow", label: "Process or Workflow" },
          ],
        },
        {
          id: "entity_relevance",
          type: "text",
          multiline: true,
          prompt: () => "In a sentence, why does AI need to know about this?",
          rephrasings: [
            () => "What should AI understand about how this fits into your world?",
            () => "If AI mentioned this by name, what would it need to already get right?",
          ],
          placeholder: "What they own, how you work together, why they come up...",
          ideas: [
            "My manager — final approver on anything over budget, prefers a heads-up before surprises.",
            "The Growth team — owns anything customer-acquisition-related; I partner with them monthly.",
            "Our CRM — where every customer record lives; half my week runs through it.",
            "The weekly ops review — where priorities actually get decided, not just reported.",
          ],
        },
        {
          id: "entity_aliases",
          type: "text",
          required: false,
          prompt: () => "Any other names, nicknames, or shorthand this goes by?",
          placeholder: "Optional — e.g. 'the CRM', initials, a nickname",
          hint: "Skip if there's only one name for it.",
          ideas: ["Also called 'the CRM'", "Just 'P.' in most messages", "AKA the Tuesday sync", "Sometimes just 'Growth'", "No other name — this is it"],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------
// Module 5 — Initiatives
// ---------------------------------------------------------------------
const initiatives: Module = {
  id: "initiatives",
  number: 5,
  title: "Initiatives",
  purpose: "Name the specific efforts and projects underway right now, with enough detail for AI to actually help on them.",
  required: true,
  estimatedMinutes: [8, 15],
  nodes: [
    q({
      id: "initiatives_gate",
      type: "yes-no",
      prompt: () =>
        "Are there specific initiatives or projects underway right now that AI should know about individually — not just your general responsibilities, but named efforts with their own goals and timeline?",
      hint: "Think about what you'd list if someone asked 'what are you actually working on this quarter?' If nothing comes to mind beyond your day-to-day responsibilities, choose No.",
    }),
    {
      kind: "repeatable",
      id: "initiatives_records",
      skipIf: (ctx) => ctx.answers.initiatives_gate !== "yes",
      addAnotherPrompt: "Want to tell AI about another initiative or project?",
      questions: [
        {
          id: "initiative_name",
          type: "text",
          prompt: () => "What's this initiative called?",
          placeholder: "e.g. The Q4 rebrand, Atlas migration, vendor consolidation",
          ideas: ["The Q4 rebrand", "Atlas migration", "Vendor consolidation", "New hire ramp-up program", "Fundraiser 2026"],
        },
        {
          id: "initiative_description",
          type: "text",
          multiline: true,
          prompt: () => "In a couple sentences, what is this and why does it matter?",
          rephrasings: [
            () => "What's actually happening here, and why is it worth doing?",
            () => "If you had thirty seconds to explain this to someone new, what would you say?",
          ],
          ideas: [
            "We're moving off our old ticketing system onto a new one before support volume outgrows it.",
            "Consolidating three regional vendor contracts into one, mainly to simplify billing and get better pricing.",
            "Rebuilding the onboarding flow — too many new hires are getting stuck in the first week.",
          ],
          interpret: {
            via: "ai-assist",
            reflectPrefix: "Here's a tighter version:",
            buildPrompt: (raw) =>
              `I'm describing an initiative for a "Context" file that tells AI what I'm working on. I was asked what it is and why it matters, and I wrote this:\n\n"${raw}"\n\nRewrite it as one or two clear, concise sentences — clean up the phrasing but don't add anything I didn't say and don't invent detail. Reply with ONLY the rewritten sentence(s) — no preamble, no options, no explanation. Just the text, ready to paste directly into a form field.`,
          },
        },
        {
          id: "initiative_status",
          type: "single-select",
          prompt: () => "Where does this stand right now?",
          rephrasings: [() => "If someone asked for a one-word status update, what would it be?"],
          options: [
            { key: "planning", label: "Just getting started" },
            { key: "in-progress", label: "Actively underway" },
            { key: "blocked", label: "Stalled or blocked" },
            { key: "wrapping-up", label: "Wrapping up" },
          ],
        },
        {
          id: "initiative_success",
          type: "text",
          multiline: true,
          prompt: () => "What does success look like for this?",
          rephrasings: [() => "How will you know this actually worked?", () => "What's the outcome you're actually driving toward?"],
          ideas: [
            "Every open ticket migrated with zero data loss, and support response time back under our SLA.",
            "One contract, one invoice, at least 10% cheaper than the combined total today.",
            "New hires completing their first-week checklist without needing to ask someone else what to do next.",
          ],
        },
        {
          id: "initiative_constraints",
          type: "text",
          multiline: true,
          required: false,
          prompt: () => "Any constraints AI should know about — budget, timeline, dependencies, risks?",
          placeholder: "Optional — skip if nothing comes to mind",
          ideas: ["Hard deadline of end of quarter — the old vendor contract expires then.", "Waiting on legal to sign off before we can move forward."],
        },
        {
          id: "initiative_not_doing",
          type: "text",
          required: false,
          prompt: () => "Anything explicitly out of scope here that people keep assuming is included?",
          placeholder: "Optional — e.g. 'This does NOT include...'",
          ideas: [
            "This does NOT include the pricing model — that's a separate workstream.",
            "Not migrating historical records, only new ones going forward.",
            "Not a full redesign — just the checkout flow.",
            "Doesn't cover international markets yet.",
            "Not touching the underlying database schema.",
          ],
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------
// Module 6 — How I Think
// ---------------------------------------------------------------------
const howIThink: Module = {
  id: "how-i-think",
  number: 6,
  title: "How I Think",
  purpose: "Capture how the person actually makes decisions — risk tolerance, rigor, autonomy, and how they handle ambiguity.",
  required: true,
  estimatedMinutes: [4, 7],
  nodes: [
    q({
      id: "risk_tolerance",
      type: "single-select",
      prompt: () => "When you're choosing between a fast, good-enough call and a slower, more certain one, which do you lean toward by default?",
      hint: "Not about any one decision — just your general lean.",
      rephrasings: [
        () => "Are you more of a 'ship it and adjust' person, or a 'get it right first' person?",
        () => "If nobody was watching, would you rather move fast and fix mistakes later, or take the extra time upfront?",
      ],
      options: [
        { key: "fast", label: "Fast and good enough" },
        { key: "depends", label: "Depends on the stakes" },
        { key: "certain", label: "Slower and more certain" },
      ],
    }),
    q({
      id: "rigor_before_acting",
      type: "single-select",
      prompt: () => "How much reasoning do you want to see before AI just gives you the answer?",
      rephrasings: [
        () => "Do you want the destination, or the whole route it took to get there?",
        () => "When you ask a question, do you want a quick answer or the thinking behind it?",
      ],
      options: [
        { key: "answer-only", label: "Just the answer" },
        { key: "answer-plus-why", label: "The answer, plus a quick reason why" },
        { key: "full-reasoning", label: "Walk me through the reasoning first" },
      ],
    }),
    q({
      id: "ambiguity_handling",
      type: "single-select",
      prompt: () => "When what you've asked for is genuinely unclear, what should AI do?",
      rephrasings: [
        () => "If AI isn't sure what you meant, would you rather it guess or check?",
        () => "How much do you want AI to fill in the blanks on its own versus asking you to fill them in?",
      ],
      options: [
        { key: "best-guess", label: "Make its best guess and keep going" },
        { key: "assume-and-flag", label: "Make an assumption, but say what it assumed" },
        { key: "stop-and-ask", label: "Stop and ask before doing anything" },
      ],
    }),
    q({
      id: "autonomy_preference",
      type: "single-select",
      prompt: () => "When AI can clearly see the next step, what's your gut instinct?",
      hint: "This is about your general instinct, not hard rules — there's a dedicated question later for the specific things AI should never do without checking first.",
      rephrasings: [() => "Left to its own judgment, should AI just move, or check in with you first?"],
      options: [
        { key: "just-do-it", label: "Just do it" },
        { key: "do-and-flag", label: "Do it, but flag anything worth knowing" },
        { key: "check-first", label: "Check with me first" },
      ],
    }),
    q({
      id: "thinking_style",
      type: "single-select",
      prompt: () => "Do you tend to start from the big picture, or the details?",
      rephrasings: [() => "When you're figuring something out, do you zoom out first or zoom in first?"],
      options: [
        { key: "big-picture-first", label: "Big picture first" },
        { key: "details-first", label: "Details first" },
        { key: "depends", label: "Depends on the situation" },
      ],
    }),
  ],
};

// ---------------------------------------------------------------------
// Module 7 — How I Communicate
// ---------------------------------------------------------------------
const howICommunicate: Module = {
  id: "how-i-communicate",
  number: 7,
  title: "How I Communicate",
  purpose: "Set tone, structure, and pet peeves for how AI should write in your voice.",
  required: true,
  estimatedMinutes: [4, 7],
  nodes: [
    q({
      id: "voice_directness",
      type: "single-select",
      prompt: () => "How direct should AI default to when it's writing for you?",
      hint: 'Diplomatic: "There\'s a chance Friday could be tight, given how the vendor work has gone." Balanced: "Friday is at risk — the vendor delay pushed us back." Blunt: "This won\'t be ready Friday."',
      rephrasings: [() => "If there's bad news, how should AI deliver it by default?"],
      options: [
        { key: "diplomatic", label: "Diplomatic" },
        { key: "balanced", label: "Balanced" },
        { key: "blunt", label: "Blunt" },
      ],
    }),
    q({
      id: "voice_formality",
      type: "single-select",
      prompt: () => "How formal should the default tone be?",
      hint: 'Casual: "Hey — quick one on the rollout." Neutral: "Quick update on the rollout." Formal: "Please find below an update on the vendor rollout."',
      rephrasings: [() => "Should AI sound like it's talking to a friend, a coworker, or an executive by default?"],
      options: [
        { key: "casual", label: "Casual" },
        { key: "neutral", label: "Neutral" },
        { key: "formal", label: "Formal" },
      ],
    }),
    q({
      id: "voice_qualification",
      type: "single-select",
      prompt: () => "How much should AI qualify or hedge what it tells you?",
      hint: 'None: "Phase 3 slips to 8/15." Some: "Phase 3 slips to 8/15, assuming no further vendor delays." Full: "Phase 3 currently looks likely to slip to 8/15, though this depends on whether further vendor delays land and on Procurement confirming availability."',
      rephrasings: [() => "Do you want AI to just state things, or spell out what they depend on?"],
      options: [
        { key: "none", label: "None — state it plainly" },
        { key: "some", label: "Some — flag it where it matters" },
        { key: "full", label: "Full — qualify every assumption" },
      ],
    }),
    q({
      id: "shape_structure",
      type: "single-select",
      prompt: () => "Which one of these is more you?",
      rephrasings: [() => "Same update, two treatments — which would you actually send?"],
      options: [
        { key: "structured", label: "Structured — bullets" },
        { key: "prose", label: "Prose — sentences" },
      ],
      optionExamples: [
        "Vendor rollout — status\n· Phase 2 complete\n· Phase 3 slipped one week\n· Cause: vendor delay, 7/28\n· Ask: confirm 8/15 with Procurement.",
        "Quick update on the vendor rollout. Phase 2 wrapped on time, but Phase 3 slipped about a week after a vendor delay landed on the 28th. I'd like to confirm the new 8/15 date with Procurement.",
      ],
    }),
    q({
      id: "shape_ask_placement",
      type: "single-select",
      prompt: () => "When you need something from someone, where should the ask go?",
      rephrasings: [() => "Do you lead with what you need, or build up to it?"],
      options: [
        { key: "ask-first", label: "Ask first" },
        { key: "ask-last", label: "Ask last" },
      ],
      optionExamples: [
        "I need your call on the 8/15 date by Thursday.\n\nBackground: Phase 3 slipped after a vendor delay on 7/28.",
        "Phase 3 slipped after a vendor delay on 7/28, which moves us to 8/15. Could you confirm that date by Thursday?",
      ],
    }),
    q({
      id: "shape_length",
      type: "single-select",
      prompt: () => "How long should a normal answer from AI run, by default?",
      rephrasings: [() => "Left on its own, should AI keep things tight, or give you the full picture?"],
      options: [
        { key: "short", label: "As short as possible" },
        { key: "standalone", label: "Enough to stand alone" },
        { key: "thorough", label: "Thorough" },
      ],
    }),
    q({
      id: "peeves",
      type: "multi-select",
      allowCustom: true,
      required: false,
      prompt: () => "What makes you rewrite something on sight?",
      hint: "Pick freely — the fastest way to describe how you want things written is to say what annoys you.",
      rephrasings: [() => "What's an instant red flag in a draft, the kind of thing that makes you stop reading and just redo it yourself?"],
      customPlaceholder: "Something else that makes you rewrite it",
      options: [
        { key: "buried-ask", label: "Burying the ask" },
        { key: "walls-of-text", label: "Walls of text with no structure" },
        { key: "vague-ownership", label: 'Vague ownership — "we should"' },
        { key: "unsourced-numbers", label: "Numbers with no source" },
        { key: "corporate-filler", label: "Corporate filler" },
        { key: "apologetic-openers", label: "Apologetic openers" },
        { key: "undated-commitments", label: "Commitments with no date" },
        { key: "no-tradeoff", label: "Recommendations with no trade-off" },
        { key: "unknown-jargon", label: "Jargon my audience won't know" },
        { key: "passive-voice", label: "Passive voice" },
      ],
    }),
  ],
};

// ---------------------------------------------------------------------
// Module 8 — Audience Profiles
// ---------------------------------------------------------------------
const audienceProfiles: Module = {
  id: "audience-profiles",
  number: 8,
  title: "Audience Profiles",
  purpose: "Identify who the person regularly writes to, so tone can shift by reader.",
  required: true,
  estimatedMinutes: [3, 5],
  nodes: [
    q({
      id: "audiences_list",
      type: "multi-select",
      allowCustom: true,
      required: false,
      prompt: () => "Who do you write to regularly?",
      hint: "Different readers, different defaults — pick everyone you write to on a regular basis, or add someone not listed.",
      rephrasings: [() => "If you mentally switch 'voices' depending on who's reading, who are those different readers?"],
      customPlaceholder: "Someone else you write to regularly",
      options: [
        { key: "manager", label: "My manager" },
        { key: "team", label: "My team" },
        { key: "peer-managers", label: "Peer managers" },
        { key: "executives", label: "Executives" },
        { key: "business-stakeholders", label: "Business stakeholders" },
        { key: "vendors-partners", label: "Vendors and partners" },
        { key: "cross-functional", label: "Cross-functional partners" },
        { key: "social-media", label: "Social media" },
        { key: "blog", label: "Blog" },
      ],
    }),
    q({
      id: "audience_variance",
      type: "text",
      multiline: true,
      required: false,
      prompt: () => "Do any of these need something noticeably different from the rest?",
      hint: "A different tone, more or less detail, a different format entirely. Skip if 'about the same for everyone' is close enough.",
      placeholder: "Optional — e.g. 'Executives get the headline first, everyone else gets the full story.'",
      ideas: [
        "Executives get the headline first — everyone else gets the full story.",
        "Vendors get a more formal tone than my own team.",
        "Social posts are much shorter and punchier than anything else I write.",
      ],
    }),
  ],
};

// ---------------------------------------------------------------------
// Module 9 — Vocabulary & Knowledge
// ---------------------------------------------------------------------
const vocabularyKnowledge: Module = {
  id: "vocabulary-knowledge",
  number: 9,
  title: "Vocabulary & Knowledge",
  purpose: "Capture the working vocabulary AI should recognize, and the words to avoid.",
  required: true,
  estimatedMinutes: [3, 6],
  nodes: [
    q({
      id: "terms_depend_on",
      type: "text",
      multiline: true,
      required: false,
      prompt: () => "What terms, tools, or shorthand does your work depend on that an outsider would get wrong?",
      hint: "Acronyms, tool names, project codenames — anything you'd have to explain to someone new.",
      rephrasings: [
        () => "If someone sat in on your meetings tomorrow, what vocabulary would completely lose them?",
        () => "What would you have to explain to a brand-new hire before anything else made sense?",
      ],
      placeholder: "One per line, or just a comma-separated list — whatever's fastest",
      ideas: [
        "QBR, the Atlas migration, DeskPro (our ticketing tool), NPS",
        "The Q3 rebrand, our CRM (HubSpot), the vendor scorecard, SLA",
        "Intake queue, the Lighthouse project, our reconciliation process, EOD cutoff",
      ],
      interpret: {
        via: "ai-assist",
        reflectPrefix: "Here's a cleaned-up list:",
        buildPrompt: (raw, ctx) => {
          const known = typeof ctx.answers.self_description === "string" && ctx.answers.self_description ? `Here's a bit about what I do: "${ctx.answers.self_description}"\n\n` : "";
          return `I'm building a "Context" file that tells AI the vocabulary my work depends on — acronyms, tool names, project codenames, or internal terms an outsider wouldn't recognize.\n\n${known}Here's what I listed:\n\n"${raw}"\n\nClean this up into a single comma-separated list of 5-10 terms — fix formatting and grouping, but don't invent terms I didn't mention. Reply with ONLY that list — no preamble, no numbering, no explanation. Just the list, ready to paste directly into a form field.`;
        },
      },
    }),
    q({
      id: "never_words",
      type: "multi-select",
      allowCustom: true,
      required: false,
      prompt: () => "Are there words or phrases you never want to see in your own writing?",
      hint: "Corporate filler you're tired of seeing — pick any that apply, or add your own.",
      rephrasings: [() => "If AI used one of these on you, would it instantly sound fake?"],
      customPlaceholder: "Another word you never want to see",
      options: [
        { key: "leverage", label: "Leverage" },
        { key: "synergy", label: "Synergy" },
        { key: "circle-back", label: "Circle back" },
        { key: "deep-dive", label: "Deep dive" },
        { key: "bandwidth", label: "Bandwidth" },
        { key: "low-hanging-fruit", label: "Low-hanging fruit" },
        { key: "boil-the-ocean", label: "Boil the ocean" },
        { key: "at-the-end-of-the-day", label: "At the end of the day" },
        { key: "move-the-needle", label: "Move the needle" },
        { key: "touch-base", label: "Touch base" },
      ],
    }),
  ],
};

// ---------------------------------------------------------------------
// Module 10 — Context Boundaries
// ---------------------------------------------------------------------
const contextBoundaries: Module = {
  id: "context-boundaries",
  number: 10,
  title: "Context Boundaries",
  purpose: "Define non-negotiable standards and the actions AI should never take without asking first.",
  required: true,
  estimatedMinutes: [3, 5],
  nodes: [
    q({
      id: "standards_list",
      type: "multi-select",
      allowCustom: true,
      required: false,
      prompt: () => "What would you actually send a draft back over?",
      hint: "These become hard rules AI can't talk itself out of — not just preferences.",
      rephrasings: [() => "What would make you send something straight back, no matter how good it otherwise looks?"],
      customPlaceholder: "Another non-negotiable — type it and add it",
      // Trimmed from 8 to 3 seeded options (Adam's ask, 2026-08-19: "keep
      // the seeded items to a max of 3 rows" — measured at 1 chip per row
      // for labels this long, so row count and item count are the same
      // constraint here). Kept the 3 most universal, most mutually
      // distinct "trust" concerns — sourcing, reasoning, and uncertainty —
      // over the narrower/more workflow-specific ones (change-tracking,
      // formatting, ownership, review gating); allowCustom covers the rest.
      options: [
        { key: "cite-source", label: "Always name the source" },
        { key: "show-work", label: "Show your work, not just the result" },
        { key: "flag-assumptions", label: "Call out what you're not sure about" },
      ],
      optionRephrasings: [
        [
          { key: "cite-source", label: "No source on a number" },
          { key: "show-work", label: "A recommendation with no reasoning" },
          { key: "flag-assumptions", label: "An assumption stated as fact" },
        ],
      ],
    }),
    q({
      id: "guardrails_list",
      type: "multi-select",
      allowCustom: true,
      required: false,
      prompt: () => "What should AI never do without asking you first?",
      hint: "These stay on by default as recommendations — turn any off only if you're sure. Add your own if something's missing.",
      rephrasings: [() => "Where's the line — what's too risky, sensitive, or hard to undo to hand over automatically?"],
      customPlaceholder: "Add a restriction of your own",
      options: [
        // Trimmed from 6 to 4 seeded options (Adam's ask, 2026-08-19: "make
        // space for a couple more custom from the user") — kept all 3
        // recommended defaults plus "schema" (the most universally
        // applicable of the remaining 3); dropped "state" (redundant with
        // "assume" — both are really about not silently filling gaps) and
        // "post" (the narrowest/most tool-specific of the three).
        { key: "draft", label: "Draft emails — never send them", recommended: true },
        { key: "approve", label: "Require my approval before changing anything in a system", recommended: true },
        { key: "assume", label: "Ask when context is missing instead of assuming", recommended: true },
        { key: "schema", label: "Never modify a shared system, record, or template directly" },
      ],
    }),
  ],
};

// ---------------------------------------------------------------------
// Module 11 — Reference Examples
// ---------------------------------------------------------------------
const referenceExamples: Module = {
  id: "reference-examples",
  number: 11,
  title: "Reference Examples",
  purpose: "Collect real writing samples AI can use as a voice reference.",
  required: true,
  estimatedMinutes: [3, 6],
  nodes: [
    q({
      id: "reference_example_primary",
      type: "text",
      multiline: true,
      prompt: () => "Paste something you wrote that you were proud of.",
      hint: "This teaches more than any description — one paragraph is enough. It becomes AI's reference sample for your voice.",
      rephrasings: [() => "If you had to hand someone one paragraph and say 'this is how I sound,' what would it be?"],
      placeholder: "Paste a paragraph of your own writing you'd be happy to see again...",
      ideas: [
        "Finished the quarterly count this morning — three locations are fully reconciled, two still need a recount on Friday. I'll have the final numbers to you by end of day Monday.",
        "The new intake process went live on schedule, with all existing records migrated and verified before the cutover. No service interruption was reported, and the fallback plan wasn't needed.",
        "I went with the simpler version of the form here rather than the one with extra fields — nobody had actually asked for that level of detail, and it would have added another week before we could roll it out.",
        "Good conversation today. Landed on: the schedule stays the same for next month, the team lead owns the announcement, and I'll have the updated policy out by Friday. Let me know if I missed anything.",
        "Root cause was a mislabeled batch in the intake system — the sorting step was skipping it on every pass. Fixed the label and reprocessed the batch by hand. Watching for a repeat over the next few days.",
        "Spent most of the week sorting out a scheduling conflict that's been quietly causing double-bookings for months. Turned out two different teams were each working around it their own way. Fixed it once, at the source, so nobody has to work around it again.",
        "The draft is close — the numbers are right and it's well organized. What's missing is the recommendation: right now it reads like a summary, but the ask is a decision. Lead with what you want them to approve.",
        "Next month is mostly cleanup — closing out the open requests, fixing the two recurring complaints from last week, and getting the reference guide current before we roll this out further. Nothing new starts until that's done.",
        "Thanks for flagging this — you were right that the statement was missing the last transaction under certain filters. It's fixed now, and I've double-checked last month's records to make sure nothing else was missed.",
        "Three takeaways from this quarter: attendance held steady despite the schedule change, the new check-in process cut wait times by a third, and requests are trending up faster than staffing — worth a conversation before it becomes a bottleneck.",
      ],
    }),
    q({
      id: "reference_example_second",
      type: "text",
      multiline: true,
      required: false,
      prompt: () => "Want to add a second example — ideally from a different context?",
      hint: "Optional. A different tone or audience than the first makes AI's reference richer — skip if one is enough.",
      placeholder: "Optional — a different kind of message than the one above",
      ideas: [
        "Finished the quarterly count this morning — three locations are fully reconciled, two still need a recount on Friday. I'll have the final numbers to you by end of day Monday.",
        "The new intake process went live on schedule, with all existing records migrated and verified before the cutover. No service interruption was reported, and the fallback plan wasn't needed.",
        "I went with the simpler version of the form here rather than the one with extra fields — nobody had actually asked for that level of detail, and it would have added another week before we could roll it out.",
        "Good conversation today. Landed on: the schedule stays the same for next month, the team lead owns the announcement, and I'll have the updated policy out by Friday. Let me know if I missed anything.",
        "Root cause was a mislabeled batch in the intake system — the sorting step was skipping it on every pass. Fixed the label and reprocessed the batch by hand. Watching for a repeat over the next few days.",
        "Spent most of the week sorting out a scheduling conflict that's been quietly causing double-bookings for months. Turned out two different teams were each working around it their own way. Fixed it once, at the source, so nobody has to work around it again.",
        "The draft is close — the numbers are right and it's well organized. What's missing is the recommendation: right now it reads like a summary, but the ask is a decision. Lead with what you want them to approve.",
        "Next month is mostly cleanup — closing out the open requests, fixing the two recurring complaints from last week, and getting the reference guide current before we roll this out further. Nothing new starts until that's done.",
        "Thanks for flagging this — you were right that the statement was missing the last transaction under certain filters. It's fixed now, and I've double-checked last month's records to make sure nothing else was missed.",
        "Three takeaways from this quarter: attendance held steady despite the schedule change, the new check-in process cut wait times by a third, and requests are trending up faster than staffing — worth a conversation before it becomes a bottleneck.",
      ],
    }),
  ],
};

export const CONTEXT_INTERVIEW_MODULES: Module[] = [
  orientation,
  aboutMe,
  responsibilities,
  myWorld,
  initiatives,
  howIThink,
  howICommunicate,
  audienceProfiles,
  vocabularyKnowledge,
  contextBoundaries,
  referenceExamples,
];

// ---------------------------------------------------------------------
// The visual file builder — mirrors the real CONTEXT.md section outline
// from the spec (1. About This Context ... 10. Reference Examples), not
// the 12-module interview structure 1:1 (a few modules split across one
// file section, e.g. Modules 2+3 both feed section "2. About Me"). Shown
// complete from the start (Adam's ask, 2026-08-19) — every section always
// renders, dim until reached, so the whole shape of the eventual file is
// visible from question one, not revealed piecemeal.
// ---------------------------------------------------------------------
export interface FileOutlineNode {
  id: string;
  label: string;
  /** Every question id that belongs to this section — used both to test
   * "reached" (any id present as an answered key) and "current" (the
   * active question's id is in this list). A repeatable's own seed
   * question id is enough for "reached"; its sub-question ids are what
   * let mid-loop questions (e.g. role_mandate) still resolve back to the
   * right section for the "current" glow. */
  questionIds: string[];
  children?: FileOutlineNode[];
}

export const CONTEXT_FILE_OUTLINE: FileOutlineNode[] = [
  { id: "sec1", label: "1. About This Context", questionIds: ["orientation_ready", "context_scope", "stop_explaining", "architecture_orientation"] },
  {
    id: "sec2",
    label: "2. About Me",
    questionIds: ["preferred_name", "professional_name", "self_description"],
    children: [
      { id: "sec2-1", label: "2.1 Roles", questionIds: ["role_names", "role_for", "role_mandate", "role_standing", "role_durability"] },
      { id: "sec2-2", label: "2.2 Responsibilities", questionIds: ["responsibilities_list"] },
      { id: "sec2-3", label: "2.3 Boundaries", questionIds: ["contribution_boundaries", "negative_responsibility"] },
      { id: "sec2-4", label: "2.4 Decision Rights", questionIds: ["decision_rights"] },
      { id: "sec2-5", label: "2.5 Expertise", questionIds: ["expertise"] },
    ],
  },
  { id: "sec3", label: "3. My World", questionIds: ["entities_gate", "entity_name", "entity_type", "entity_relevance", "entity_aliases"] },
  {
    id: "sec4",
    label: "4. Initiatives",
    questionIds: ["initiatives_gate", "initiative_name", "initiative_description", "initiative_status", "initiative_success", "initiative_constraints", "initiative_not_doing"],
  },
  { id: "sec5", label: "5. How I Think", questionIds: ["risk_tolerance", "rigor_before_acting", "ambiguity_handling", "autonomy_preference", "thinking_style"] },
  {
    id: "sec6",
    label: "6. How I Communicate",
    questionIds: ["voice_directness", "voice_formality", "voice_qualification", "shape_structure", "shape_ask_placement", "shape_length", "peeves"],
  },
  { id: "sec7", label: "7. Audience Profiles", questionIds: ["audiences_list", "audience_variance"] },
  { id: "sec8", label: "8. Vocabulary & Knowledge", questionIds: ["terms_depend_on", "never_words"] },
  { id: "sec9", label: "9. Context Boundaries", questionIds: ["standards_list", "guardrails_list"] },
  { id: "sec10", label: "10. Reference Examples", questionIds: ["reference_example_primary", "reference_example_second"] },
];
