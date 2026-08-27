import { describe, it, expect } from 'vitest';
import type { FlowContext } from '../../schema/flow.types';
import { ASSIST_SERVICE_URLS, assistServiceUrlFor } from './assistServices';
import { ALL_PROOF_SERVICES } from './proofAdditions';

function ctxFor(service: string | undefined): FlowContext {
  return { answers: service === undefined ? {} : { goal_service: service }, repeatables: {} };
}

describe('the per-service URL map (VB-119)', () => {
  it('covers every service on the one list except "other", which gets no door', () => {
    const keys = ALL_PROOF_SERVICES.map((s) => s.key);
    for (const key of keys) {
      if (key === 'other') {
        expect(ASSIST_SERVICE_URLS[key], 'other must have no URL — its label is a title').toBeUndefined();
      } else {
        expect(ASSIST_SERVICE_URLS[key], `no URL authored for ${key}`).toBeTruthy();
      }
    }
    // And nothing beyond the list — a stray key here is a service the rest
    // of the product has never heard of.
    for (const key of Object.keys(ASSIST_SERVICE_URLS)) {
      expect(keys, `URL map names ${key}, which the service list does not`).toContain(key);
    }
  });

  it('every door is https — never a scheme the browser would warn about', () => {
    for (const [key, url] of Object.entries(ASSIST_SERVICE_URLS)) {
      expect(url.startsWith('https://'), `${key}: ${url}`).toBe(true);
    }
  });

  it('resolves the goal gate answer, and degrades to undefined everywhere else', () => {
    expect(assistServiceUrlFor(ctxFor('chatgpt'))).toBe('https://chatgpt.com/');
    expect(assistServiceUrlFor(ctxFor('perplexity'))).toBe('https://www.perplexity.ai/');
    expect(assistServiceUrlFor(ctxFor('other'))).toBeUndefined();
    expect(assistServiceUrlFor(ctxFor('some_future_service'))).toBeUndefined();
    expect(assistServiceUrlFor(ctxFor(undefined))).toBeUndefined();
    // A skipped gate stores null; null is not a key.
    expect(assistServiceUrlFor({ answers: { goal_service: null }, repeatables: {} })).toBeUndefined();
  });
});
