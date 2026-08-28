import { Sheet } from './Sheet';
import { S } from '../strings';
import './MeterWhatSheet.css';

/**
 * BS-06 (§6) — the meter's own explanation.
 *
 * The review's line: "The number is honest and completely opaque today."
 * Both halves are true. `core/home/utilization.ts` computes it from four real
 * ratios of real counts and stores nothing — and a person looking at "38% set
 * up" has no way to find that out, which makes an honest number feel like an
 * invented one.
 *
 * ── IT LISTS THE FOUR SEGMENTS, IN THE DRAWING'S OWN ORDER ────────────────
 *
 * Name · Repeat · Act · Share, each with the one sentence that says what puts
 * percent in it. The order and the names come from `S.steps`, the same array
 * the ticks under the meter print, so the sheet reads as an annotation of the
 * thing above it rather than as a second account of it.
 *
 * ── AND IT NAMES THE CEILING ──────────────────────────────────────────────
 *
 * The Share quarter cannot be filled by answering questions (Adam's V2.6
 * decision 2 — "necessitating services or outside work on the file to have it
 * measure 100%"). Somebody who works that out alone at 74% concludes the
 * number is rigged. The last line says it before they get there.
 *
 * ── WHY IT IS NOT INSIDE THE METER ────────────────────────────────────────
 *
 * The whole drawing is `aria-hidden` decoration over one `role="progressbar"`
 * — the percentage, the track and the ticks are all inside it. A control
 * hidden from assistive tech is a control that does not exist, so the door
 * sits OUTSIDE the progressbar, as its sibling, and Home owns the row that
 * holds them both.
 */

export interface MeterWhatSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MeterWhatSheet({ open, onClose }: MeterWhatSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title={S.meterWhatTitle} className="meterwhat">
      <p className="meterwhat-lead">{S.meterWhatLead}</p>
      <ol className="meterwhat-list">
        {S.steps.map((step, index) => (
          <li key={step}>
            <span className="meterwhat-step">{step}</span>
            <span className="meterwhat-fill">{S.meterWhatFills[index]}</span>
          </li>
        ))}
      </ol>
      <p className="meterwhat-ceiling">{S.meterWhatCeiling}</p>
    </Sheet>
  );
}
