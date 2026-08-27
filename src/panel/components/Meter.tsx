import type { CSSProperties } from 'react';
import './Meter.css';

/**
 * V2.6 VB-125 — the utilization meter, Home's signature. Built for the
 * design-system mock long before anything rendered it; this round gives it
 * Adam's template face (docs/workbrain-panel.html) and its first real home.
 *
 * Each of the four segments carries its own fill, because the semantics
 * demand it (docs/V2.6-REFINEMENT.md decision 2): Share can be half-full
 * while Act is empty, and a done/current/upcoming model would throw that
 * truth away. The numbers arrive from core/home/utilization.ts — derived,
 * never stored, every input authored.
 *
 * The whole drawing is `aria-hidden` decoration over one real progressbar
 * whose `aria-valuetext` says the number, the label and the standing step in
 * words — the same fact, one account per audience.
 */

export interface MeterSegment {
  label: string;
  /** 0–100 — how full this step's quarter really is. */
  percent: number;
}

export interface MeterProps {
  /** The headline number, 0–100. */
  value: number;
  /** The progressbar's accessible name. */
  name: string;
  /** The phrase printed after the number — "set up". */
  label: string;
  /** "Step 2 · Repeat". */
  step: string;
  /** V2.9 (Adam, mid-sprint): which step is the STANDING one, 1-based —
   * the same number the `step` phrase speaks. Its segment wears a slight
   * tint even at 0%, so a just-unlocked step reads as active-but-not-done
   * rather than as untouched. */
  current?: number;
  /** The four steps: Name, Repeat, Act, Share. */
  segments: MeterSegment[];
}

/** Derived, never stored — see docs/ARCHITECTURE.md ("nothing derived is stored"). */
export function Meter({ value, name, label, step, current, segments }: MeterProps) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={name}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${value}% ${label}, ${step}`}
    >
      <div className="meter-top" aria-hidden="true">
        <span className="meter-val">{value}%</span>
        <span className="meter-lab">{label}</span>
        <span className="meter-step">{step}</span>
      </div>
      <div className="meter-track" aria-hidden="true">
        {segments.map((segment, index) => (
          <i
            key={segment.label}
            className={index + 1 === current ? 'is-current' : undefined}
            style={{ '--p': `${segment.percent}%` } as CSSProperties}
          />
        ))}
      </div>
      <div className="meter-ticks" aria-hidden="true">
        {segments.map((segment, index) => (
          <span
            key={segment.label}
            className={
              [segment.percent > 0 ? 'on' : '', index + 1 === current ? 'is-current' : '']
                .filter(Boolean)
                .join(' ') || undefined
            }
          >
            {segment.label}
          </span>
        ))}
      </div>
    </div>
  );
}
