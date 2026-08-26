import { describe, it, expect } from 'vitest';
import {
  ALL_PROOF_SERVICES,
  SERVICE_CHOICE_QUESTIONS,
  SERVICE_PERSONAS,
  personaForService,
  usesServiceThemes,
} from './serviceThemes';

/**
 * V2.4 VB-105 — the persona map's census. The map is design-only (FLAG 4):
 * what these tests hold is not what a persona looks like — that is CSS — but
 * that every service has one, that none is shared, and that the two service
 * questions are the only place the treatment applies.
 */

describe('SERVICE_PERSONAS — one persona per service, no gaps, no sharing', () => {
  it('covers ALL_PROOF_SERVICES 1:1 — a new service cannot ship unthemed', () => {
    expect(Object.keys(SERVICE_PERSONAS).sort()).toEqual(ALL_PROOF_SERVICES.map((s) => s.key).sort());
  });

  it('gives no two services the same persona', () => {
    const personas = Object.values(SERVICE_PERSONAS);
    expect(new Set(personas).size).toBe(personas.length);
  });

  it("matches Adam's assignments verbatim (docs/V2.4-REFINEMENT.md VB-105, decision 2)", () => {
    expect(SERVICE_PERSONAS).toEqual({
      chatgpt: 'aristocrat',
      claude: 'scholar',
      gemini: 'muse',
      copilot: 'colleague',
      grok: 'investigator',
      perplexity: 'explorer',
      other: 'innovator',
    });
  });
});

describe('personaForService', () => {
  it('resolves a service key to its persona', () => {
    expect(personaForService('claude')).toBe('scholar');
    expect(personaForService('grok')).toBe('investigator');
  });

  it('answers undefined for anything that is not a service — the unthemed graceful path', () => {
    expect(personaForService('my-own-custom-ai')).toBeUndefined();
    expect(personaForService('')).toBeUndefined();
  });
});

describe('usesServiceThemes — the two service questions, and only those', () => {
  it('claims the goal gate and the proof picker', () => {
    expect(SERVICE_CHOICE_QUESTIONS).toEqual(['goal_service', 'proof_service']);
    expect(usesServiceThemes({ id: 'goal_service', kind: 'chips' })).toBe(true);
    expect(usesServiceThemes({ id: 'proof_service', kind: 'chips' })).toBe(true);
  });

  it('claims nothing else — not other chips, not a service question of another kind', () => {
    expect(usesServiceThemes({ id: 'context_scope', kind: 'chips' })).toBe(false);
    expect(usesServiceThemes({ id: 'goal_service', kind: 'text' })).toBe(false);
  });
});
