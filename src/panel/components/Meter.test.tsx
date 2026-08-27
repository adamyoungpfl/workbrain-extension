import { describe, it, expect } from 'vitest';
import { Meter } from './Meter';
import type { MeterSegment } from './Meter';
import { mount } from './testUtils';

/**
 * V2.6 VB-125 — the meter with per-segment fills. The old
 * done/current/upcoming model is gone because the semantics outgrew it:
 * Share can be half-full while Act is empty (docs/V2.6-REFINEMENT.md,
 * decision 2), and a model that cannot say so would draw a lie.
 */

const SEGMENTS: MeterSegment[] = [
  { label: 'Name', percent: 100 },
  { label: 'Repeat', percent: 35 },
  { label: 'Act', percent: 0 },
  { label: 'Share', percent: 50 },
];

describe('Meter', () => {
  it('exposes the value as a real progressbar, not color/number alone', () => {
    const { container } = mount(
      <Meter value={46} name="How much is set up" label="set up" step="Step 2 · Repeat" segments={SEGMENTS} />,
    );
    const meter = container.querySelector('[role="progressbar"]')!;
    expect(meter.getAttribute('aria-label')).toBe('How much is set up');
    expect(meter.getAttribute('aria-valuenow')).toBe('46');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toBe('46% set up, Step 2 · Repeat');
  });

  it('prints the number, the label and the standing step', () => {
    const { container } = mount(
      <Meter value={46} name="n" label="set up" step="Step 2 · Repeat" segments={SEGMENTS} />,
    );
    expect(container.querySelector('.meter-val')?.textContent).toBe('46%');
    expect(container.querySelector('.meter-lab')?.textContent).toBe('set up');
    expect(container.querySelector('.meter-step')?.textContent).toBe('Step 2 · Repeat');
  });

  it('every segment carries its own fill — a half-full Share beside an empty Act', () => {
    const { container } = mount(
      <Meter value={46} name="n" label="l" step="s" segments={SEGMENTS} />,
    );
    const fills = [...container.querySelectorAll<HTMLElement>('.meter-track i')].map((el) =>
      el.style.getPropertyValue('--p'),
    );
    expect(fills).toEqual(['100%', '35%', '0%', '50%']);
  });

  it('a tick with anything in its segment reads as reached; an empty one stays quiet', () => {
    const { container } = mount(
      <Meter value={46} name="n" label="l" step="s" segments={SEGMENTS} />,
    );
    const ticks = [...container.querySelectorAll('.meter-ticks span')];
    expect(ticks.map((t) => t.className)).toEqual(['on', 'on', '', 'on']);
    expect(ticks.map((t) => t.textContent)).toEqual(['Name', 'Repeat', 'Act', 'Share']);
  });

  it('the drawing is decoration; the progressbar is the account', () => {
    const { container } = mount(
      <Meter value={46} name="n" label="l" step="s" segments={SEGMENTS} />,
    );
    expect(container.querySelector('.meter-top')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.meter-track')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.meter-ticks')?.getAttribute('aria-hidden')).toBe('true');
  });
});
