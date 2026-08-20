import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { DeepDive } from './DeepDive';
import { mount } from './testUtils';
import type { DeepDiveEntry } from '../../schema/flow.types';

const ENTRIES: DeepDiveEntry[] = [
  { q: 'What counts as a role?', a: 'Anything you would describe differently to different people.' },
  { q: 'What if I only have one?', a: 'That is normal. Pick one and keep going.' },
];

function click(el: HTMLElement) {
  act(() => el.click());
}

function chipsOf(container: Element) {
  return Array.from(container.querySelectorAll('.deepdive-chip')) as HTMLButtonElement[];
}

function answersOf(container: Element) {
  return Array.from(container.querySelectorAll('.deepdive-answer')) as HTMLParagraphElement[];
}

describe('DeepDive', () => {
  it('renders one chip per entry, all closed, with the question as the label', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const chips = chipsOf(container);
    expect(chips).toHaveLength(2);
    expect(chips[0]?.textContent).toContain('What counts as a role?');
    expect(chips.every((c) => c.getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('hides every answer until its chip is opened, without unmounting it', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const answers = answersOf(container);
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.hidden)).toBe(true);
  });

  it('opens on click and closes on a second click', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    click(first!);
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    expect(answersOf(container)[0]?.hidden).toBe(false);
    click(first!);
    expect(first!.getAttribute('aria-expanded')).toBe('false');
    expect(answersOf(container)[0]?.hidden).toBe(true);
  });

  it('each chip toggles independently — opening one never closes another', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first, second] = chipsOf(container);
    click(first!);
    click(second!);
    expect(first!.getAttribute('aria-expanded')).toBe('true');
    expect(second!.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps focus on the trigger when it opens — the question never moves away', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    act(() => first!.focus());
    click(first!);
    expect(document.activeElement).toBe(first);
    click(first!);
    expect(document.activeElement).toBe(first);
  });

  it('wires aria-controls to a real element id, namespaced by the question', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    for (const chip of chipsOf(container)) {
      const id = chip.getAttribute('aria-controls')!;
      expect(id.startsWith('flow-role_names-deepdive-')).toBe(true);
      expect(container.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
  });

  it('signals open with more than colour: the chevron turns and the row marks itself open', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    const [first] = chipsOf(container);
    const mark = first!.querySelector('.deepdive-mark')!;
    expect(mark.tagName.toLowerCase()).toBe('svg');
    expect(mark.getAttribute('aria-hidden')).toBe('true');
    expect(mark.getAttribute('class')).not.toContain('is-open');
    click(first!);
    expect(mark.getAttribute('class')).toContain('is-open');
    expect(first!.closest('.deepdive-item')?.className).toContain('is-open');
  });

  it('is a real button, so Enter and Space work with no key handling of its own', () => {
    const { container } = mount(<DeepDive idPrefix="flow-role_names" entries={ENTRIES} />);
    expect(chipsOf(container).every((c) => c.tagName === 'BUTTON' && c.type === 'button')).toBe(true);
  });
});
