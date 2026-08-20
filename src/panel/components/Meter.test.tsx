import { describe, it, expect } from 'vitest';
import { Meter } from './Meter';
import type { MeterStepData } from './Meter';
import { mount } from './testUtils';

const STEPS: MeterStepData[] = [
  { label: 'Name', state: 'done' },
  { label: 'Repeat', state: 'current', percent: 35 },
  { label: 'Act', state: 'upcoming' },
  { label: 'Share', state: 'upcoming' },
];

describe('Meter', () => {
  it('exposes the value as a real progressbar, not color/number alone', () => {
    const { container } = mount(
      <Meter value={60} label="of your AI use, set up" step="Step 1 of 4" steps={STEPS} />,
    );
    const meter = container.querySelector('[role="progressbar"]')!;
    expect(meter.getAttribute('aria-label')).toBe('of your AI use, set up');
    expect(meter.getAttribute('aria-valuenow')).toBe('60');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
    expect(meter.getAttribute('aria-valuetext')).toContain('60%');
    expect(meter.getAttribute('aria-valuetext')).toContain('of your AI use, set up');
  });

  it('renders the headline number in words a person uses, not jargon', () => {
    const { container } = mount(
      <Meter value={60} label="of your AI use, set up" step="Step 1 of 4" steps={STEPS} />,
    );
    expect(container.querySelector('.val')?.textContent).toBe('60%');
    expect(container.querySelector('.lab')?.textContent).toBe('of your AI use, set up');
  });

  it('a done step fills its track segment and highlights its label', () => {
    const { container } = mount(
      <Meter value={60} label="l" step="s" steps={STEPS} />,
    );
    const bars = container.querySelectorAll('.track i');
    const labels = container.querySelectorAll('.tracklabels span');
    expect(bars[0]?.className).toBe('on');
    expect(labels[0]?.className).toBe('on');
  });

  it('a current step partially fills via --p and leaves its label plain', () => {
    const { container } = mount(<Meter value={60} label="l" step="s" steps={STEPS} />);
    const bars = container.querySelectorAll('.track i');
    const labels = container.querySelectorAll('.tracklabels span');
    expect(bars[1]?.className).toBe('part');
    expect((bars[1] as HTMLElement).style.getPropertyValue('--p')).toBe('35%');
    expect(labels[1]?.className).toBe('');
  });

  it('upcoming steps are visually empty', () => {
    const { container } = mount(<Meter value={60} label="l" step="s" steps={STEPS} />);
    const bars = container.querySelectorAll('.track i');
    expect(bars[2]?.className).toBe('');
    expect(bars[3]?.className).toBe('');
  });
});
