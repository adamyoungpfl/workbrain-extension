import type { Answers } from '../../schema/storage.types';
import { mostRecentAnsweredAt } from '../freshness/nextMove';
import { daysSince } from '../freshness/clocks';

/**
 * V2.6 VB-125 — the lockup's meta line, derivable or absent.
 *
 * Adam's template mocked `workbrain.zip · v3 · updated today · 84 KB`, which
 * claims a zip bundle and a version the product does not have. The decided
 * shape (docs/V2.6-REFINEMENT.md FLAG 7) is real numbers only: how many
 * files are really built, when the newest answer landed, and how many bytes
 * the generated files really are — each derived at render from the same
 * generators the downloads use, nothing stored, nothing invented.
 *
 * A file counts once it has a single stamp (the same "started" test Home's
 * rows use), because that is the moment a download would contain something
 * of the person's. Actions counts when it is generated at all — it is
 * derived, so "started" is not a fact it can have.
 */

export interface LockupMeta {
  /** How many of the three files exist enough to download. */
  files: number;
  /** Whole days since the newest answer in either interview; null with none. */
  ageDays: number | null;
  /** Size of the counted files' generated text, in whole KB (min 1). 0 with
   * no files. */
  kb: number;
}

export function lockupMeta(args: {
  context: Answers;
  skills: Answers;
  /** The generated bodies, so this stays one fold with the downloads. */
  contextText: string;
  skillsText: string;
  actionsText: string;
  /** `actionsGenerated` — derived files have no "started" of their own. */
  actionsOn: boolean;
  now: Date;
}): LockupMeta {
  const started = (answers: Answers) => Object.keys(answers.answeredAt).length > 0;
  const bodies: string[] = [];
  if (started(args.context)) bodies.push(args.contextText);
  if (started(args.skills)) bodies.push(args.skillsText);
  if (args.actionsOn) bodies.push(args.actionsText);

  const encoder = new TextEncoder();
  const bytes = bodies.reduce((sum, text) => sum + encoder.encode(text).length, 0);

  const stamps = [mostRecentAnsweredAt(args.context), mostRecentAnsweredAt(args.skills)].filter(
    (stamp): stamp is string => typeof stamp === 'string',
  );
  const latest = stamps.length ? stamps.slice().sort().at(-1)! : null;

  return {
    files: bodies.length,
    ageDays: latest ? daysSince(latest, args.now) : null,
    kb: bodies.length === 0 ? 0 : Math.max(1, Math.round(bytes / 1024)),
  };
}
