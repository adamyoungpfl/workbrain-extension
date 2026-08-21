import { describe, it, expect } from 'vitest';
import { clearAllStorage, type ResetAreas } from './reset';

/**
 * V1.2 VB-09. Like client.ts, reset.ts takes its storage areas as an
 * injected, defaulted parameter, so nothing here mocks chrome.*.
 */
function recordingAreas(fail: Partial<Record<'local' | 'sync', string>> = {}): {
  areas: ResetAreas;
  cleared: string[];
} {
  const cleared: string[] = [];
  const area = (name: 'local' | 'sync') => ({
    clear: async () => {
      cleared.push(name);
      const reason = fail[name];
      if (reason) throw new Error(reason);
    },
  });
  return { areas: { local: area('local'), sync: area('sync') }, cleared };
}

describe('clearAllStorage', () => {
  it('clears both areas, not just local', () => {
    const { areas, cleared } = recordingAreas();
    return clearAllStorage(areas).then((result) => {
      expect(result).toEqual({ ok: true, data: undefined });
      expect(cleared.sort()).toEqual(['local', 'sync']);
    });
  });

  it('still clears sync when local fails, and reports why', async () => {
    const { areas, cleared } = recordingAreas({ local: 'local is unavailable' });
    const result = await clearAllStorage(areas);
    // The half-reset is the thing being guarded against: sync must have been
    // attempted anyway, so the next pass starts from a describable state.
    expect(cleared.sort()).toEqual(['local', 'sync']);
    expect(result).toEqual({ ok: false, reason: 'local is unavailable' });
  });

  it('still clears local when sync fails', async () => {
    const { areas, cleared } = recordingAreas({ sync: 'sync is off' });
    const result = await clearAllStorage(areas);
    expect(cleared.sort()).toEqual(['local', 'sync']);
    expect(result).toEqual({ ok: false, reason: 'sync is off' });
  });

  it('reports both reasons when both fail, and never throws', async () => {
    const { areas } = recordingAreas({ local: 'one', sync: 'two' });
    await expect(clearAllStorage(areas)).resolves.toEqual({ ok: false, reason: 'one; two' });
  });

  it('turns a non-Error rejection into a readable reason', async () => {
    const areas: ResetAreas = {
      local: { clear: () => Promise.reject('nope') },
      sync: { clear: () => Promise.resolve() },
    };
    await expect(clearAllStorage(areas)).resolves.toEqual({ ok: false, reason: 'nope' });
  });
});
