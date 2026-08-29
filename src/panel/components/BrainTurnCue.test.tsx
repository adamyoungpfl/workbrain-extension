import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { BrainTurnCue } from './BrainTurnCue';
import { mount } from './testUtils';
import { resetPrefsMemory } from '../voice/prefs';
import { S } from '../strings';

/**
 * V2.0 VB-71 — the cue that says the globe can be turned.
 *
 * What is held here is the LIFECYCLE, which is the half of this feature that
 * would rot quietly: when it appears, the three things that retire it, and that
 * it never flashes back at somebody who has already seen it off. Where it sits,
 * what it measures against the field, what a reduced-motion visitor gets and
 * that it never blocks the first drag are all facts about a painted browser and
 * live in tests/e2e/brain-turn-cue.spec.ts.
 */

interface FakeChrome {
  storage: {
    sync: {
      get: (keys: string[]) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
    };
  };
}

const scope = globalThis as unknown as { chrome?: FakeChrome };

function installStorage(stored: Record<string, unknown> = {}) {
  const state = { ...stored };
  const writes: Record<string, unknown>[] = [];
  scope.chrome = {
    storage: {
      sync: {
        get: async (keys) => {
          const out: Record<string, unknown> = {};
          for (const key of keys) if (key in state) out[key] = state[key];
          return out;
        },
        set: async (items) => {
          writes.push(items);
          Object.assign(state, items);
        },
      },
    },
  };
  return { writes, state };
}

/** Mount, and let the one storage read resolve before looking. */
async function show(props: { showing?: boolean; turned?: boolean } = {}) {
  const mounted = mount(<BrainTurnCue showing={props.showing ?? true} turned={props.turned ?? false} />);
  await act(async () => {
    await Promise.resolve();
  });
  return mounted;
}

const disc = (container: HTMLElement) => container.querySelector('.brainturncue') as HTMLButtonElement | null;

afterEach(() => {
  resetPrefsMemory();
  delete scope.chrome;
});

describe('BrainTurnCue', () => {
  it('says the one thing it is for, and is a control that says it', async () => {
    installStorage();
    const { container } = await show();
    const button = disc(container)!;
    expect(button).not.toBeNull();
    // The name IS the tip. An icon is not a name (docs/GUARDRAILS.md), and a
    // control named for its own housekeeping would be the only thing on the
    // stage talking about the interface instead of about the file.
    expect(button.getAttribute('aria-label')).toBe(S.brainTurnCue);
    expect(button.getAttribute('title')).toBe(S.brainTurnCue);
    expect(button.tagName).toBe('BUTTON');
    // The mark is a picture of the name, never a second one.
    expect(container.querySelector('.brainturncue-mark')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('is not on a stage nobody is looking at', async () => {
    installStorage();
    const { container } = await show({ showing: false });
    // The drawer mounts the globe in both of its modes and hides one. A cue on
    // the hidden one would retire itself without ever having been seen.
    expect(disc(container)).toBeNull();
  });

  it('says nothing while storage has not answered yet', async () => {
    installStorage({ 'wb:prefs': { turnHint: false } });
    // Looked at in the same tick it mounted. The default is the LOUD one, so a
    // cue seen off months ago must not flash back for a frame on its way to
    // being told it was seen off.
    const { container } = mount(<BrainTurnCue showing turned={false} />);
    expect(disc(container)).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(disc(container)).toBeNull();
  });

  it('goes for good when it is pressed', async () => {
    const { writes } = installStorage();
    const { container } = await show();
    await act(async () => {
      disc(container)!.click();
    });
    expect(disc(container)).toBeNull();
    expect(writes.at(-1)).toMatchObject({ 'wb:prefs': { turnHint: false } });
  });

  it('goes for good the moment the globe is turned', async () => {
    const { writes } = installStorage();
    const { container, rerender } = await show();
    expect(disc(container)).not.toBeNull();
    await act(async () => {
      rerender(<BrainTurnCue showing turned />);
      await Promise.resolve();
    });
    // They have done the thing it was going to tell them about. There is
    // nothing left to say and nothing left to press.
    expect(disc(container)).toBeNull();
    expect(writes.at(-1)).toMatchObject({ 'wb:prefs': { turnHint: false } });
  });

  it('goes for good when Brain is left with it on screen — once, not every visit', async () => {
    const { writes } = installStorage();
    const { container, rerender } = await show();
    expect(disc(container)).not.toBeNull();
    await act(async () => {
      rerender(<BrainTurnCue showing={false} turned={false} />);
      await Promise.resolve();
    });
    expect(writes.at(-1)).toMatchObject({ 'wb:prefs': { turnHint: false } });
    // And coming back to Brain does not bring it back.
    await act(async () => {
      rerender(<BrainTurnCue showing turned={false} />);
      await Promise.resolve();
    });
    expect(disc(container)).toBeNull();
  });

  it('is not retired by a stage that was never showing in the first place', async () => {
    const { writes } = installStorage();
    const { container, rerender } = await show({ showing: false });
    await act(async () => {
      rerender(<BrainTurnCue showing={false} turned={false} />);
      await Promise.resolve();
    });
    // Nothing was seen, so nothing is spent: the panel opens on List, and every
    // render of it before Brain is ever pressed must leave the cue owed.
    expect(writes).toHaveLength(0);
    await act(async () => {
      rerender(<BrainTurnCue showing turned={false} />);
      await Promise.resolve();
    });
    expect(disc(container)).not.toBeNull();
  });

  /**
   * R-06 (Adam, 2026-08-28) — IT NO LONGER STANDS DOWN, and this test now says
   * the opposite of what it used to.
   *
   * `paused` hid the cue while a section was flown into, because the corner
   * belonged to `Back to the whole file` and there was not room for both. That
   * pill left the stage at V2.1 VB-74 and the band it moved to was deleted at
   * BS-07a, so the prop has spent two versions defending a corner from nothing
   * — and paid for it by vanishing and returning every time somebody looked at
   * a section. "It pops up and disappears right now and it doesn't look
   * great." The corner is the cue's, and it holds it.
   */
  it('holds its corner while a section is flown into — no coming and going', async () => {
    const { writes } = installStorage();
    const { container, rerender } = await show();
    expect(disc(container)).not.toBeNull();

    await act(async () => {
      rerender(<BrainTurnCue showing turned={false} />);
      await Promise.resolve();
    });
    expect(disc(container), 'the cue left its corner').not.toBeNull();
    // And still not spent: only turning the globe, or leaving Brain, retires it.
    expect(writes, 'looking at a section spent the one chance the cue gets').toHaveLength(0);
  });

  it('stays gone on a later visit, because the flag outlives the panel', async () => {
    installStorage({ 'wb:prefs': { turnHint: false } });
    const { container } = await show();
    expect(disc(container)).toBeNull();
  });
});
