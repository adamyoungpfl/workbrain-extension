import { describe, expect, it } from 'vitest';
import { CueAnnouncer } from './CueAnnouncer';
import { mount } from '../components/testUtils';

describe('CueAnnouncer', () => {
  it('announces politely, visually hidden', () => {
    const { container } = mount(<CueAnnouncer text="Press next." />);
    const node = container.querySelector('.cue-announcer')!;
    expect(node.getAttribute('role')).toBe('status');
    expect(node.getAttribute('aria-live')).toBe('polite');
    expect(node.getAttribute('aria-atomic')).toBe('true');
    expect(node.textContent).toBe('Press next.');
  });

  it('renders an empty live region when there is nothing to say yet, rather than omitting the node — an aria-live region only announces a change, so it must exist before the first thing it says', () => {
    const { container } = mount(<CueAnnouncer text={undefined} />);
    const node = container.querySelector('.cue-announcer')!;
    expect(node).not.toBeNull();
    expect(node.textContent).toBe('');
  });

  it('updating the text re-renders the same live node rather than remounting it', () => {
    const { container, rerender } = mount(<CueAnnouncer text="First." />);
    rerender(<CueAnnouncer text="Second." />);
    const nodes = container.querySelectorAll('.cue-announcer');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.textContent).toBe('Second.');
  });
});
