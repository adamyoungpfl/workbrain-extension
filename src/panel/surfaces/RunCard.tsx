import { Button } from '../components';
import { S } from '../strings';
import './RunCard.css';

/**
 * BS-05d (§5) — WHAT A RUN BOUNDARY IS FOR.
 *
 * Five questions is a pace somebody can see the end of; this is what they
 * get for reaching it. §5: "a card that shows the four lines just written,
 * then keep going · take a break · see your file."
 *
 * It can say a SECTION is lit up because Adam's D1 bounds runs by their
 * module — a run boundary is always a section boundary, which is the whole
 * reason that rule was chosen over strict fives.
 *
 * ── THE STOP IS THE POINT, NOT THE ESCAPE HATCH ───────────────────────────
 *
 * `welcomeTime` has promised since V1.1 that somebody can stop anywhere and
 * pick up where they left off, and no screen in the interview has ever
 * offered it. An interview that only ever says "next" is one a person has to
 * abandon rather than leave, and for a beta an abandonment is a report we do
 * not get. Making the exit explicit at the one moment it is earned is what
 * makes people come back.
 *
 * Nothing here is stored. The card is a moment held in `Flow`'s memory for
 * the session (see `handleCommit`), never a flag, so a reopen resumes at the
 * question rather than replaying the applause.
 */

export interface RunCardProps {
  /** The section that just finished — the card's whole claim. */
  section: string;
  /** How many of the run's questions actually put something in the file.
   * A skipped question is honest about having been skipped. */
  written: number;
  onKeep: () => void;
  onRead: () => void;
  onStop: () => void;
}

export function RunCard({ section, written, onKeep, onRead, onStop }: RunCardProps) {
  return (
    // `.flow` as well as `.runcard`, the same way ModuleIntro roots itself:
    // this is a screen ON the flow surface, so it takes the surface's frame,
    // its reserve above the drawer and its save note rather than inventing a
    // second set of margins.
    <div className="flow runcard" data-position="run-end">
      <h2 className="runcard-title">{S.runCardLit(section)}</h2>
      <p className="runcard-line">{S.runCardWrote(written)}</p>

      <div className="runcard-doors">
        <Button type="button" variant="primary" onClick={onKeep}>
          {S.runCardKeep}
        </Button>
        <Button type="button" variant="secondary" onClick={onRead}>
          {S.runCardRead}
        </Button>
        <button type="button" className="runcard-stop" onClick={onStop}>
          {S.runCardStop}
        </button>
        <p className="runcard-stopnote">{S.runCardStopNote}</p>
      </div>

      <p className="flow-save">
        <span>{S.savedNote}</span>
        <span>{S.privacyNote}</span>
      </p>
    </div>
  );
}
