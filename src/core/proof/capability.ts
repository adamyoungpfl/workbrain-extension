import type { Answers } from '../../schema/storage.types';
import { skillRecipeBlock, skillOptionLabel, skillOptionLabels } from '../files/skillsFile';

/**
 * BS-04 (§4) — PROOF TWO, THE CAPABILITY PROOF. The assembly half.
 *
 * §4's opening line: "This is the screen that sells the product and it does
 * not exist. Proof one buys trust; this buys the sentence a tester repeats to
 * a colleague."
 *
 * The difference between the two proofs is what is being shown. Proof one
 * puts the same question twice and lets the person see their file change the
 * ANSWER. This one hands their AI a recipe they wrote and lets them watch it
 * DO THE JOB — and the sentence somebody repeats afterwards is not "the
 * answer was better", it is "it did six of my seven steps first try".
 *
 * ── EVERYTHING IT NEEDS IS ALREADY COLLECTED ──────────────────────────────
 *
 * `skill_name`, `skill_trigger`, `skill_steps`, `skill_output`, `skill_tools`
 * — all of them answered in the Skills interview, all of them already printed
 * into Skills.md by `core/files/skillsFile.ts`. Nothing here asks a new
 * question, and the recipe block is that file's own renderer rather than a
 * second rendering that could drift from it.
 *
 * ── ONE ROUND TRIP, AND NO BASELINE ───────────────────────────────────────
 *
 * §4: "No baseline, because the absence of a before is the point." An AI
 * asked to run a recipe it has never seen does not produce a worse version of
 * the job — it produces a question, or a guess. There is nothing to compare,
 * and constructing one would cost the hour a whole extra errand for a
 * comparison nobody asked for.
 *
 * ── NOTHING IS SCORED BY THE PANEL ────────────────────────────────────────
 *
 * The person ticks the steps their AI actually did. The panel counts ticks
 * and nothing else — it never reads the reply, and the checklist is built
 * from THEIR steps, so there is no fixed list to be graded against.
 */

/** One skill, ready to be run — the shape both screens read. */
export interface SkillCard {
  /** Which record in the `skills` block this is. The route back needs it. */
  index: number;
  /** Their own name for it. */
  name: string;
  /** The cadence, in words ("Weekly, first thing Monday"). May be empty. */
  cadence: string;
  /** Their steps, one per line, markers stripped. Never empty — a record
   * with no steps is not a `SkillCard`. */
  steps: string[];
  /** The output shape, in words. May be empty. */
  outputShape: string;
  /** The tools, in words. May be empty. */
  tools: string[];
}

const SKILLS_BLOCK_ID = 'skills';

/** How many runnable skills the surface wants before it opens (§4's
 * acceptance: "reachable after two skills without finishing all of Skills"). */
export const CAPABILITY_MIN_SKILLS = 2;

/**
 * Their steps, from the one multiline field that holds them.
 *
 * `skill_steps` is a single text answer — the interview asks for the whole
 * recipe at once ("in order, one action per line"), which is how a person
 * actually writes one. So the checklist is a PARSE, and it has to survive
 * every way somebody numbers a list: "1." and "1)" and "-" and "•" and
 * nothing at all.
 *
 * The marker is stripped and the words are kept verbatim. §4's acceptance
 * says the checklist is "generated from their steps, not a fixed list", and
 * a step that came back reworded would be a fixed list wearing their words.
 */
export function parseSkillSteps(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+\s*[.)\]]|[-–—*•])\s*/, '').trim())
    .filter((line) => line !== '');
}

/** A record's own name, trimmed, or null when it has none. */
function nameOf(record: Record<string, unknown>): string | null {
  const name = record['skill_name'];
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/**
 * Every skill this proof can actually run: one with a name AND steps.
 *
 * Not "every named skill". A recipe with no steps has nothing to send and
 * nothing to tick — offering it would open the screen on a dead end, and the
 * gate below counts these rather than records so "you have two skills" and
 * "the screen works" are the same sentence.
 */
export function capabilitySkills(skills: Pick<Answers, 'repeatables'>): SkillCard[] {
  const records = skills.repeatables[SKILLS_BLOCK_ID] ?? [];
  const cards: SkillCard[] = [];
  records.forEach((record, index) => {
    const name = nameOf(record);
    if (!name) return;
    const steps = parseSkillSteps(record['skill_steps']);
    if (steps.length === 0) return;
    cards.push({
      index,
      name,
      cadence: skillOptionLabel('skill_trigger', record['skill_trigger']),
      steps,
      outputShape: skillOptionLabel('skill_output', record['skill_output']),
      tools: skillOptionLabels('skill_tools', record['skill_tools']),
    });
  });
  return cards;
}

/** Whether the surface has anything to show. */
export function capabilityReady(skills: Pick<Answers, 'repeatables'>): boolean {
  return capabilitySkills(skills).length >= CAPABILITY_MIN_SKILLS;
}

/**
 * The single sentence they send — "Run my Weekly ops report for this week."
 *
 * The tail is derived from their own cadence answer, because a weekly report
 * asked for without "this week" gets a generic one back, and a one-off skill
 * asked for "for this week" reads as a question the AI cannot answer. An
 * unrecognised cadence (they typed their own) gets no tail at all: a bare
 * "Run my X." is always true, and inventing a period for a cadence we do not
 * understand would put words in the ask.
 */
const CADENCE_TAIL: Readonly<Record<string, string>> = {
  weekly_monday: ' for this week',
  each_morning: ' for today',
  after_meeting: ' for the last meeting',
};

export function capabilityAsk(card: SkillCard, trigger: unknown): string {
  const tail = typeof trigger === 'string' ? (CADENCE_TAIL[trigger] ?? '') : '';
  return `Run my ${card.name}${tail}.`;
}

/**
 * What goes on the clipboard: the ask, then the recipe.
 *
 * The same shape BS-03b settled for proof one — the thing the AI needs rides
 * INSIDE the message, so the person makes one paste and never attaches a
 * file. The recipe is `skillsFile.ts`'s own block, so what the AI is asked to
 * follow is byte-identical to what Skills.md would hand it.
 *
 * The lead-in is addressed to the AI. The person's own instruction is on
 * screen, where they can read it before they press anything.
 */
export function capabilityPrompt(ask: string, recipe: string, lead: string): string {
  return `${ask}\n\n---\n${lead}\n\n${recipe}`;
}

/** The recipe block for one skill, straight out of the Skills.md renderer. */
export function capabilityRecipe(
  skills: Pick<Answers, 'repeatables'>,
  index: number,
): string {
  const record = (skills.repeatables[SKILLS_BLOCK_ID] ?? [])[index];
  return record ? (skillRecipeBlock(record) ?? '') : '';
}

/** The record a card came from, for the ask's cadence and the route back. */
export function capabilityRecord(
  skills: Pick<Answers, 'repeatables'>,
  index: number,
): Record<string, unknown> | undefined {
  return (skills.repeatables[SKILLS_BLOCK_ID] ?? [])[index];
}

/**
 * The next skill to offer, cycling.
 *
 * §4 gives screen one "one secondary: pick a different one", and a cycle is
 * how that costs no screen. The interstitial tax is real (docs/BETA-SPRINT.md)
 * — a chooser between Home and the offer would be a whole extra surface for a
 * choice most people make once, and the button can simply name the skill it
 * is about to switch to.
 */
export function nextSkillIndex(cards: SkillCard[], current: number): number {
  if (cards.length === 0) return 0;
  const at = cards.findIndex((card) => card.index === current);
  return (cards[(at + 1) % cards.length] as SkillCard).index;
}

/** The card for a record index, or the first one when that index is gone. */
export function cardFor(cards: SkillCard[], index: number): SkillCard | undefined {
  return cards.find((card) => card.index === index) ?? cards[0];
}
