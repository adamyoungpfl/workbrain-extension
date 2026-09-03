import { StrictMode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '../components/testUtils';
import { useNarration } from './useNarration';

const calls: string[] = [];
vi.mock('./speech', () => ({
  speak: vi.fn(() => calls.push('speak')),
  stopSpeaking: vi.fn(() => calls.push('stop')),
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
  calls.length = 0;
  /* These suites pin the ROUTING semantics (A/B, cover, replay), which
     live at the engine layer - the same seam the e2e narrator suite uses
     (V3.0 pass 3f). The clip-first default has its own describe below. */
  (globalThis as { __wbTtsOnly?: boolean }).__wbTtsOnly = true;
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

describe('useNarration — StrictMode survival (found in dogfood, 2026-09-02)', () => {
  it('a dev build\u2019s double-mounted effect still ends SPEAKING, not cancelled', () => {
    /* StrictMode mounts every effect twice: speak, cleanup-cancel, run
       again. The first A/B guard marked the narration spent on the speak
       path, so the second run skipped and every dev screen went silent -
       while production (single-invoke) stayed green through every gate. */
    const m = mount(
      <StrictMode>
        <Narrated text="What do you do?" on={true} />
      </StrictMode>,
    );
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[calls.length - 1]).toBe('speak');
    m.unmount();
  });
});

describe('useNarration — the voice cover (the splash\u2019s inert, for sound)', () => {
  it('a covered mount stays silent, marks nothing, and reads once on uncover', async () => {
    const { coverVoice } = await import('./cover');
    coverVoice(true);
    const m = mount(<Narrated text="Under the splash?" on={true} />);
    expect(speak).not.toHaveBeenCalled();
    // The hand-off: the splash ends, the arrival screen reads once.
    const { act } = await import('react');
    act(() => coverVoice(false));
    expect(speak).toHaveBeenCalledTimes(1);
    m.unmount();
    coverVoice(false);
  });
});

describe('useNarration — the replay ("Where was I?" answers itself)', () => {
  it('a requested replay un-spends the current question and reads it once', async () => {
    const { requestReplay } = await import('./cover');
    const { act } = await import('react');
    const m = mount(<Narrated text="What do you do?" on={false} />);
    m.rerender(<Narrated text="What do you do?" on={true} />);
    expect(speak).not.toHaveBeenCalled(); // the A/B rule holds without a replay
    act(() => requestReplay());
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith({ role: 'question', text: 'What do you do?' });
    m.unmount();
  });
});

describe('useNarration — clip first by default (V3.0 pass 3f)', () => {
  it('plays the hash-named clip and only falls back to the engine when it cannot', async () => {
    delete (globalThis as { __wbTtsOnly?: boolean }).__wbTtsOnly;
    const clips = await import('./clips');
    const { clipKey } = await import('../../core/voice/clipKey');
    const spy = vi.spyOn(clips, 'playClip').mockResolvedValue(true);
    const m = mount(<Narrated text="What do you do?" on={true} />);
    expect(spy).toHaveBeenCalledWith(`n-${clipKey('What do you do?')}`);
    await Promise.resolve();
    expect(speak).not.toHaveBeenCalled(); // the clip carried it
    m.unmount();

    spy.mockResolvedValue(false);
    const m2 = mount(<Narrated text="Something interpolated?" on={true} />);
    await vi.waitFor(() => expect(speak).toHaveBeenCalledTimes(1));
    m2.unmount();
    spy.mockRestore();
  });
});
