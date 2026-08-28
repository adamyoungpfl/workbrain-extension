import type { FileOutlineNode, FlowContext, Module } from '../../schema/flow.types';
import type { Answers } from '../../schema/storage.types';
import { buildFlowLookups, keyOf, resolvePhrase } from '../files/lookups';
import { splitSectionLabel } from './sectionLabel';

/**
 * BS-05f (§5) — "Jump to…", a filter over the outline you already hold.
 *
 * §5: "Forty-nine questions with no search is the one missing utility every
 * comparable browser tool has."
 *
 * ── IT SEARCHES WHAT IS ON THE SCREEN, NOT WHAT IS IN THE STORE ───────────
 *
 * The question, as the person reads it (`resolvePhrase`, the same call the
 * interview and the generated file both make), and the section it belongs to.
 * NOT the answer. That is a deliberate line rather than an omission: a filter
 * over answers would be the panel reading what somebody wrote in order to
 * rank it, and `src/panel/strings.ts` promises "the panel never reads or
 * scores it". Everything here is the FLOW's own text — the same words that
 * ship in the bundle for everyone.
 *
 * ── THE ANSWERED STATE IS CARRIED, NOT USED TO RANK ───────────────────────
 *
 * `answered` rides along so the list can show which questions are already
 * done, because "where did I say that" is half of what somebody opens a
 * search for. It never affects the ORDER: results come out in file order,
 * every time, so the same query gives the same list and a person can learn
 * where things are. Ranking by what somebody has done would make the list
 * move under them.
 */

export interface JumpTarget {
  questionId: string;
  /** The question, worded as the interview asks it. */
  question: string;
  /** The section's own name, without its numeral — "Roles", "My World". */
  section: string;
  /** Whether this question already has an entry, a skip included. */
  answered: boolean;
}

/**
 * Every question a person can be sent to, in file order.
 *
 * Intros are excluded because they are screens rather than questions, and a
 * jump to one would land somebody on a slide they have already read. Fields
 * of repeatables are excluded for the reason `writtenLineFor` excludes them:
 * there is no single position that IS "the question", only a record's worth,
 * and `positionForRecord` is the right door for that (the multiples screen
 * already offers it).
 */
export function jumpTargets(
  modules: Module[],
  outline: readonly FileOutlineNode[],
  answers: Pick<Answers, 'values'>,
): JumpTarget[] {
  const lookups = buildFlowLookups(modules);
  const ctx: FlowContext = { answers: answers.values, repeatables: {} };
  const out: JumpTarget[] = [];

  const walk = (nodes: readonly FileOutlineNode[]) => {
    for (const node of nodes) {
      const section = splitSectionLabel(node.label).title;
      for (const qid of node.questionIds) {
        if (lookups.repeatableBlockForQuestionId.has(qid)) continue;
        const step = lookups.stepsById.get(qid);
        if (!step || step.kind === 'intro') continue;
        out.push({
          questionId: qid,
          question: resolvePhrase(step.q, ctx),
          section,
          answered: keyOf(step) in answers.values,
        });
      }
      if (node.children) walk(node.children);
    }
  };
  walk(outline);
  return out;
}

/** Folded once so the match is the same shape as what a person types. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/**
 * The filter.
 *
 * EVERY WORD HAS TO LAND, in the question or in its section — so "role name"
 * finds the naming question inside Roles, and typing more narrows rather than
 * broadens. Substring rather than prefix, because somebody looking for "what
 * I own" is as likely to remember a word from the middle of a question as its
 * first.
 *
 * An empty query returns everything, which is what makes this a browser as
 * well as a search: opening it and scrolling is a legitimate way to use it,
 * and a person who does not know the word to type is exactly who needs it.
 */
export function jumpMatches(query: string, targets: readonly JumpTarget[]): JumpTarget[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...targets];
  return targets.filter((target) => {
    const hay = `${fold(target.question)} ${fold(target.section)}`;
    return words.every((word) => hay.includes(word));
  });
}
