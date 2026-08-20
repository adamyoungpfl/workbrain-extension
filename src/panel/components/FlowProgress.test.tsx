import { describe, it, expect } from 'vitest';
import { FlowProgress } from './FlowProgress';
import { S } from '../strings';
import { mount } from './testUtils';

describe('FlowProgress', () => {
  it('shows the module title and nothing else', () => {
    const { container } = mount(<FlowProgress title="About Me" current={12} total={38} />);
    expect(container.querySelector('.flowprogress-title')?.textContent).toBe('About Me');
    expect(container.textContent).toBe('About Me');
  });

  it('prints no digit anywhere on screen — that is the whole point of the bar', () => {
    const { container } = mount(<FlowProgress title="How I Communicate" current={12} total={38} />);
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('keeps the count for assistive tech, as a real progressbar', () => {
    const { container } = mount(<FlowProgress title="Orientation" current={3} total={38} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar).not.toBeNull();
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('38');
    expect(bar.getAttribute('aria-valuetext')).toBe('Question 3 of 38');
    // The exact approved copy, read from strings.ts rather than retyped, so a
    // reworded string fails as a copy change and not as a stale test.
    expect(bar.getAttribute('aria-valuetext')).toBe(S.questionOfSr(3, 38));
  });

  it('names the bar with the module title, and announces it only once', () => {
    const { container } = mount(<FlowProgress title="Initiatives" current={1} total={38} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Initiatives');
    // Everything visible inside is hidden from the tree, so a screen reader
    // hears "Initiatives" as the bar's name, not as a paragraph and then
    // again as a label.
    expect(container.querySelector('.flowprogress-title')?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('.flowprogress-track')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fills the track in proportion to how far in the question is', () => {
    const { container } = mount(<FlowProgress title="My World" current={19} total={38} />);
    const fill = container.querySelector('.flowprogress-fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('is never distinguished by the fill alone — the title always names the module', () => {
    const first = mount(<FlowProgress title="Orientation" current={1} total={38} />);
    const last = mount(<FlowProgress title="Reference Examples" current={38} total={38} />);
    expect(first.container.querySelector('.flowprogress-title')?.textContent).toBe('Orientation');
    expect(last.container.querySelector('.flowprogress-title')?.textContent).toBe('Reference Examples');
    expect((last.container.querySelector('.flowprogress-fill') as HTMLElement).style.width).toBe('100%');
  });

  it('clamps rather than overflowing when the index runs past the total', () => {
    const { container } = mount(<FlowProgress title="The proof" current={9} total={5} />);
    expect((container.querySelector('.flowprogress-fill') as HTMLElement).style.width).toBe('100%');
    // The count itself is still reported honestly — only the drawing clamps.
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('9');
  });

  it('still has an accessible name if a module ever arrives without a title', () => {
    // A progressbar with no name is unusable; degrade, never break
    // (docs/GUARDRAILS.md). Not reachable with the shipped data — every
    // module has a title — but it must not be a silent a11y hole if it were.
    const { container } = mount(<FlowProgress title="" current={2} total={38} />);
    const bar = container.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute('aria-label')).toBe('Question 2 of 38');
  });

  it('does not divide by zero on an empty flow', () => {
    const { container } = mount(<FlowProgress title="Orientation" current={0} total={0} />);
    expect((container.querySelector('.flowprogress-fill') as HTMLElement).style.width).toBe('0%');
  });
});
