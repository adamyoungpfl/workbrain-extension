import type { CSSProperties } from 'react';
import './Meter.css';

export interface MeterStepData {
  label: string;
  state: 'done' | 'current' | 'upcoming';
  /** percent through this step, only meaningful when state === 'current' */
  percent?: number | undefined;
}

export interface MeterProps {
  /** the headline number, 0-100 */
  value: number;
  /** "of your AI use, set up" — never "% AI-utilized" */
  label: string;
  /** "Step 1 of 4" */
  step: string;
  /** the four steps: Name, Repeat, Act, Share */
  steps: MeterStepData[];
}

/** Derived, never stored — see docs/ARCHITECTURE.md ("nothing derived is stored"). */
export function Meter({ value, label, step, steps }: MeterProps) {
  return (
    <div
      className="meter"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${value}% ${label}, ${step}`}
    >
      <div className="top" aria-hidden="true">
        <span className="val">{value}%</span>
        <span className="lab">{label}</span>
        <span className="step">{step}</span>
      </div>
      <div className="track" aria-hidden="true">
        {steps.map((s, i) => (
          <i
            key={i}
            className={s.state === 'done' ? 'on' : s.state === 'current' ? 'part' : ''}
            style={
              s.state === 'current' && s.percent != null
                ? ({ '--p': `${s.percent}%` } as CSSProperties)
                : undefined
            }
          />
        ))}
      </div>
      <div className="tracklabels" aria-hidden="true">
        {steps.map((s, i) => (
          <span key={i} className={s.state === 'done' ? 'on' : ''}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
