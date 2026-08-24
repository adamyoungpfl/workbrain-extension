import { describe, it, expect } from 'vitest';
import { DICTATION_STEP_ID, dictationPlatform, showsDictationHint } from './dictation';
import { contextModules } from './flow';
import type { Step } from '../../schema/flow.types';

/** Real user-agent strings, one per platform Chrome runs an extension on. */
const UA = {
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  linux:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  chromeos:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
} as const;

function hint(over: Partial<Parameters<typeof showsDictationHint>[0]> = {}) {
  return showsDictationHint({
    stepId: DICTATION_STEP_ID,
    platform: 'mac',
    dismissed: false,
    typed: false,
    ...over,
  });
}

describe('dictationPlatform', () => {
  it('reads a Mac out of the user agent', () => {
    expect(dictationPlatform(UA.mac)).toBe('mac');
  });

  it('reads Windows out of the user agent', () => {
    expect(dictationPlatform(UA.windows)).toBe('windows');
  });

  it('says nothing about Linux or ChromeOS — there is no shortcut to name', () => {
    expect(dictationPlatform(UA.linux)).toBeNull();
    expect(dictationPlatform(UA.chromeos)).toBeNull();
    expect(dictationPlatform('')).toBeNull();
  });

  it('falls back to navigator.platform when the UA has been reduced away', () => {
    // Chrome's UA reduction trims the platform token; `platform` is frozen but
    // still there. Either one agreeing is enough for a line of copy.
    expect(dictationPlatform('Mozilla/5.0 (Unknown) Chrome/139.0.0.0', 'MacIntel')).toBe('mac');
    expect(dictationPlatform('Mozilla/5.0 (Unknown) Chrome/139.0.0.0', 'Win32')).toBe('windows');
  });
});

describe('showsDictationHint', () => {
  it('shows on the question VB-49 names, on a platform with dictation', () => {
    expect(hint()).toBe(true);
    expect(hint({ platform: 'windows' })).toBe(true);
  });

  it('shows on no other question', () => {
    expect(hint({ stepId: 'context_scope' })).toBe(false);
    expect(hint({ stepId: 'peeves' })).toBe(false);
    expect(hint({ stepId: 'self_description' })).toBe(false);
  });

  it('never shows where there is no shortcut to name', () => {
    expect(hint({ platform: null })).toBe(false);
  });

  it('never nags: gone once dismissed, gone once they have typed anything', () => {
    expect(hint({ dismissed: true })).toBe(false);
    expect(hint({ typed: true })).toBe(false);
    expect(hint({ dismissed: true, typed: true })).toBe(false);
  });
});

describe('the question it attaches to', () => {
  it('is the first open text question after the scope question, in the real flow', () => {
    // VB-49 specifies the place in words — "the first open text question after
    // they pick scope" — and names `stop_explaining` as the id that is today.
    // This walks the ported flow and checks the words still pick the id, so
    // reordering the interview fails here rather than moving the hint
    // somewhere nobody decided to put it.
    const steps: Step[] = [];
    for (const module of contextModules) {
      for (const node of module.nodes) {
        if ('fields' in node) steps.push(...node.fields);
        else steps.push(node);
      }
    }
    const scope = steps.findIndex((s) => s.id === 'context_scope');
    expect(scope).toBeGreaterThanOrEqual(0);
    const firstText = steps.slice(scope + 1).find((s) => s.kind === 'text');
    expect(firstText?.id).toBe(DICTATION_STEP_ID);
    // ...and it is a box you write a paragraph into, which is the only kind of
    // field talking is faster than typing into.
    expect(firstText?.multiline).toBe(true);
  });
});
