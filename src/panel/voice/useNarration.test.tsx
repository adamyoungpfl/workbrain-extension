import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '../components/testUtils';
import { useNarration } from './useNarration';

vi.mock('./speech', () => ({
  speak: vi.fn(),
  stopSpeaking: vi.fn(),
}));
import { speak } from './speech';

/**
 * V3.0 pass 3 — THE A/B RULE (Adam, 2026-09-02), pinned at the hook:
 *
 *   A — the page opens with the speaker ON: read normally, once.
 *   B — the page opened with it OFF: the question was presented in print,
 *       so flipping the speaker on mid-page does NOT re-read it (the
 *       mark's own filler acknowledges the flip); the NEXT screen — a
 *       fresh mount — reads normally, with no filler anywhere near it.
 */
function Narrated({ text, on }: { text: string; on: boolean }) {
  useNarration({ role: 'question', text }, on);
  return null;
}

beforeEach(() => {
  vi.mocked(speak).mockClear();
});

describe('useNarration — the A/B rule', () => {
  it('A: a page opening with the speaker on reads once, plainly', () => {
    const m = mount(<Narrated text="What do you do?" on={true} />);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith({ role: 'question', text: 'What do you do?' });
    m.unmount();
  });

  it('B: a mid-page flip does not re-read what print already presented', () => {
    const m = mount(<Narrated text="What do you do?" on={false} />);
    expect(speak).not.toHaveBeenCalled();
    m.rerender(<Narrated text="What do you do?" on={true} />);
    expect(speak).not.toHaveBeenCalled();
    m.unmount();
  });

  it('the next screen reads normally after a flip — a fresh mount is A', () => {
    const first = mount(<Narrated text="Question one?" on={false} />);
    first.rerender(<Narrated text="Question one?" on={true} />);
    first.unmount();
    const second = mount(<Narrated text="Question two?" on={true} />);
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith({ role: 'question', text: 'Question two?' });
    second.unmount();
  });

  it('new narration on the same mount reads — the spend is per question, not per screen-lifetime', () => {
    const m = mount(<Narrated text="Question one?" on={true} />);
    m.rerender(<Narrated text="Question two?" on={true} />);
    expect(speak).toHaveBeenCalledTimes(2);
    m.unmount();
  });
});
