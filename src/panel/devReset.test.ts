import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installDevReset } from './devReset';
import type { StorageResult } from '../core/storage/client';

/**
 * V1.2 VB-09. jsdom, real `window` and real KeyboardEvents — the only two
 * things injected are the storage wipe (so nothing touches chrome.*) and the
 * reload (jsdom cannot navigate).
 *
 * The e2e half of this lives in tests/e2e/dev-reset.spec.ts: a real
 * dev-mode extension build, real chrome.storage, and a real reload back to
 * the welcome screen. This file covers the cases that are tedious to drive
 * through a browser — near-miss chords, auto-repeat, a failed wipe.
 */
type Uninstall = () => void;

let uninstall: Uninstall | undefined;

function press(over: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      code: 'KeyR',
      key: 'r',
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...over,
    }),
  );
}

function setup(clearResult: StorageResult<void> = { ok: true, data: undefined }) {
  const clear = vi.fn<() => Promise<StorageResult<void>>>(() => Promise.resolve(clearResult));
  const reload = vi.fn();
  uninstall = installDevReset({ clear, reload });
  return { clear, reload };
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  uninstall?.();
  uninstall = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('installDevReset', () => {
  it('clears storage and reloads on the chord', async () => {
    const { clear, reload } = setup();
    press();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('fires while a textarea has focus and is swallowing keydown', async () => {
    // The interview is a page of textareas, and this is the exact moment a
    // reset is wanted. Capture phase is what makes it work: this listener
    // runs before anything in the tree can stop propagation.
    const { clear, reload } = setup();
    const field = document.createElement('textarea');
    document.body.append(field);
    field.addEventListener('keydown', (e) => e.stopPropagation());
    field.focus();

    field.dispatchEvent(
      new KeyboardEvent('keydown', {
        code: 'KeyR',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );

    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('cancels the event so the key never reaches the field', () => {
    setup();
    const event = new KeyboardEvent('keydown', {
      code: 'KeyR',
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores near-miss chords and ordinary typing', async () => {
    const { clear, reload } = setup();
    press({ altKey: false });
    press({ ctrlKey: false });
    press({ shiftKey: false });
    press({ metaKey: true });
    press({ code: 'KeyT' });
    press({ ctrlKey: false, altKey: false, shiftKey: false }); // just typing "r"
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(clear).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('resets once when the chord is held down, not once per repeat', async () => {
    const { clear, reload } = setup();
    press();
    press({ repeat: true });
    press({ repeat: true });
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('does not start a second wipe while one is still in flight', async () => {
    let release: (() => void) | undefined;
    const clear = vi.fn<() => Promise<StorageResult<void>>>(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: undefined });
        }),
    );
    const reload = vi.fn();
    uninstall = installDevReset({ clear, reload });

    press();
    press();
    expect(clear).toHaveBeenCalledTimes(1);
    release?.();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  it('does not reload when the wipe failed — a half-cleared reload hides the failure', async () => {
    const { clear, reload } = setup({ ok: false, reason: 'quota' });
    press();
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reload).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('quota'));
  });

  it('lets the chord be retried after a failure', async () => {
    const results: StorageResult<void>[] = [{ ok: false, reason: 'quota' }, { ok: true, data: undefined }];
    const clear = vi.fn<() => Promise<StorageResult<void>>>(() =>
      Promise.resolve(results.shift() ?? { ok: true, data: undefined }),
    );
    const reload = vi.fn();
    uninstall = installDevReset({ clear, reload });

    press();
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    press();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it('stops listening once uninstalled', async () => {
    const { clear, reload } = setup();
    uninstall?.();
    uninstall = undefined;
    press();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(clear).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
