import { describe, it, expect, afterEach } from 'vitest';
import type { Prefs } from '../../schema/storage.types';
import { currentPrefs, loadPrefs, resetPrefsMemory, setNarrator } from './prefs';

/**
 * `Prefs.narrator`, in sync storage. Three things worth holding to:
 * the write preserves every other preference, one panel makes one read, and a
 * storage failure keeps the choice for this session instead of dropping it or
 * announcing itself (docs/GUARDRAILS.md).
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

function installStorage(stored: Record<string, unknown>, options: { failWrites?: boolean } = {}) {
  const state = { ...stored };
  const reads: string[][] = [];
  const writes: Record<string, unknown>[] = [];
  scope.chrome = {
    storage: {
      sync: {
        get: async (keys) => {
          reads.push(keys);
          const out: Record<string, unknown> = {};
          for (const key of keys) if (key in state) out[key] = state[key];
          return out;
        },
        set: async (items) => {
          if (options.failWrites) throw new Error('sync storage is full');
          writes.push(items);
          Object.assign(state, items);
        },
      },
    },
  };
  return { reads, writes };
}

afterEach(() => {
  resetPrefsMemory();
  delete scope.chrome;
});

describe('loadPrefs', () => {
  it('starts off, before anything is read', () => {
    expect(currentPrefs().narrator).toBe(false);
  });

  it('reads wb:prefs once, however many times it is asked', async () => {
    const { reads } = installStorage({ 'wb:prefs': { narrator: true, mic: false } });

    await Promise.all([loadPrefs(), loadPrefs(), loadPrefs()]);

    expect(reads).toEqual([['wb:prefs']]);
    expect(currentPrefs().narrator).toBe(true);
  });

  it('fills in anything a stored preference object is missing', async () => {
    installStorage({ 'wb:prefs': { narrator: true } });
    await loadPrefs();

    expect(currentPrefs()).toEqual<Prefs>({
      narrator: true,
      mic: false,
      reducedMotion: 'system',
      handoff: 'manual',
      packUrls: [],
    });
  });

  it('keeps the defaults when storage is not there at all', async () => {
    await loadPrefs();
    expect(currentPrefs().narrator).toBe(false);
  });
});

describe('setNarrator', () => {
  it('writes the whole preference object back, other preferences intact', async () => {
    const { writes } = installStorage({
      'wb:prefs': { narrator: false, mic: false, reducedMotion: 'on', handoff: 'fill', packUrls: ['a'] },
    });
    await loadPrefs();
    await setNarrator(true);

    expect(writes).toEqual([
      {
        'wb:prefs': {
          narrator: true,
          mic: false,
          reducedMotion: 'on',
          handoff: 'fill',
          packUrls: ['a'],
        },
      },
    ]);
  });

  // That the subscription actually reaches a component is
  // components/NarratorToggle.test.tsx's job — it renders the real control and
  // watches it follow a change made from outside it.
  it('changes the value in memory before the write has resolved', async () => {
    installStorage({});
    const write = setNarrator(true);
    expect(currentPrefs().narrator).toBe(true);
    await write;
  });

  it('writes nothing when the value has not changed', async () => {
    const { writes } = installStorage({});
    await setNarrator(false);
    expect(writes).toEqual([]);
  });

  it('keeps the choice for this session when the write fails, and says nothing', async () => {
    installStorage({}, { failWrites: true });
    await expect(setNarrator(true)).resolves.toBeUndefined();
    expect(currentPrefs().narrator).toBe(true);
  });
});
