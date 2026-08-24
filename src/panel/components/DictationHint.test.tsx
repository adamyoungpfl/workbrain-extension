import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { DictationHint } from './DictationHint';
import { mount } from './testUtils';
import { resetPrefsMemory } from '../voice/prefs';
import { DICTATION_STEP_ID } from '../../core/flow/dictation';

/**
 * V1.8 VB-49 — the OS-dictation hint.
 *
 * What is held here: the right question, the right shortcut for the platform,
 * dismissible, and — the one that would rot quietly — that it never comes back
 * once it has been dismissed or once anything has been typed. The bundle grep
 * that proves there is no microphone anywhere in the build lives in
 * tests/e2e/dictation-hint.spec.ts, because it has to read the built bundle.
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

/** jsdom reports a Mac by default; this is how the other one is asked for. */
function setUserAgent(ua: string, platform: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
}

const MAC = ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/139.0.0.0', 'MacIntel'] as const;
const WINDOWS = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/139.0.0.0', 'Win32'] as const;
const LINUX = ['Mozilla/5.0 (X11; Linux x86_64) Chrome/139.0.0.0', 'Linux x86_64'] as const;

/** Mount, and let the one storage read resolve before looking. */
async function show(props: { stepId?: string; typed?: boolean } = {}) {
  const mounted = mount(
    <DictationHint stepId={props.stepId ?? DICTATION_STEP_ID} typed={props.typed ?? false} />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return mounted;
}

afterEach(() => {
  resetPrefsMemory();
  delete scope.chrome;
});

describe('DictationHint', () => {
  it('names the Mac shortcut on a Mac', async () => {
    installStorage();
    setUserAgent(...MAC);
    const { container } = await show();
    expect(container.querySelector('.dictation-line')?.textContent).toBe(
      'Your Mac can type what you say. Press the Fn key twice, then talk.',
    );
  });

  it('names the Windows shortcut on Windows', async () => {
    installStorage();
    setUserAgent(...WINDOWS);
    const { container } = await show();
    expect(container.querySelector('.dictation-line')?.textContent).toBe(
      'Windows can type what you say. Press the Windows key and H, then talk.',
    );
  });

  it('says nothing where there is no built-in dictation to point at', async () => {
    installStorage();
    setUserAgent(...LINUX);
    const { container } = await show();
    expect(container.querySelector('.dictation')).toBeNull();
  });

  it('appears on one question and no other', async () => {
    installStorage();
    setUserAgent(...MAC);
    const { container } = await show({ stepId: 'self_description' });
    expect(container.querySelector('.dictation')).toBeNull();
  });

  it('says nothing while storage has not answered yet', async () => {
    installStorage({ 'wb:prefs': { dictationHint: false } });
    setUserAgent(...MAC);
    // Looked at in the same tick it mounted, before the read resolves: the
    // default is the loud one, so a hint dismissed months ago must not flash
    // back for a frame on the way to being told it was dismissed.
    const { container } = mount(<DictationHint stepId={DICTATION_STEP_ID} typed={false} />);
    expect(container.querySelector('.dictation')).toBeNull();
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector('.dictation')).toBeNull();
  });

  it('stays gone once it has been dismissed', async () => {
    const { writes } = installStorage();
    setUserAgent(...MAC);
    const { container } = await show();
    const dismiss = container.querySelector('.dictation-dismiss') as HTMLButtonElement;
    expect(dismiss.textContent).toBe('Got it');
    await act(async () => {
      dismiss.click();
    });
    expect(container.querySelector('.dictation')).toBeNull();
    // Written down, so "never again" outlives this panel.
    expect(writes.at(-1)).toMatchObject({ 'wb:prefs': { dictationHint: false } });
  });

  it('does not come back on a later visit to the same question', async () => {
    installStorage({ 'wb:prefs': { dictationHint: false } });
    setUserAgent(...MAC);
    const { container } = await show();
    expect(container.querySelector('.dictation')).toBeNull();
  });

  it('goes for good the moment anything has been typed', async () => {
    const { writes } = installStorage();
    setUserAgent(...MAC);
    const { container, rerender } = await show();
    expect(container.querySelector('.dictation')).not.toBeNull();
    await act(async () => {
      rerender(<DictationHint stepId={DICTATION_STEP_ID} typed />);
    });
    expect(container.querySelector('.dictation')).toBeNull();
    expect(writes.at(-1)).toMatchObject({ 'wb:prefs': { dictationHint: false } });
  });

  it('has a dismiss you can actually hit', async () => {
    installStorage();
    setUserAgent(...MAC);
    const { container } = await show();
    const dismiss = container.querySelector('.dictation-dismiss') as HTMLButtonElement;
    // jsdom has no layout, so the 44px floor is measured in the e2e. What is
    // provable here: it is a real button, so Enter and Space already work.
    expect(dismiss.tagName).toBe('BUTTON');
    expect(dismiss.type).toBe('button');
  });

  it('never takes focus and never announces', async () => {
    installStorage();
    setUserAgent(...MAC);
    const { container } = await show();
    expect(document.activeElement).toBe(document.body);
    expect(container.querySelector('[aria-live]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
